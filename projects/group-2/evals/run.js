// Eval runner: every case C1–C5 × every prompt version × N runs, against the model in .env.
//   npm run eval                                  # v1 vs v2, 3 runs each
//   npm run eval -- --prompts v2 --runs 5 --cases C1,C5
//   npm run eval -- --no-guardrails               # measure what redaction adds (C5)
// Writes evals/results/latest.json and latest.md.
import { mkdtempSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createStore } from '../src/store.js';
import { createTools } from '../src/tools.js';
import { createLlm } from '../src/agent/llm.js';
import { connectMcp } from '../src/agent/mcp-client.js';
import { runAgent, loadPrompt } from '../src/agent/agent.js';
import { cases as allCases } from './cases.js';

const fixturePath = (name) => fileURLToPath(new URL(`../tests/fixtures/${name}.json`, import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Records everything the model is sent, and retries rate limits (free tiers hit them often).
function recording(llm, sent) {
  return async (messages, tools) => {
    sent.push(JSON.stringify(messages));
    for (let attempt = 0; ; attempt++) {
      try {
        return await llm(messages, tools);
      } catch (err) {
        if (attempt >= 3 || !/LLM (429|5\d\d)/.test(err.message)) throw err;
        await wait(2000 * 2 ** attempt);
      }
    }
  };
}

// One run of one case: fresh fixture copy, fresh MCP server, a person approves where the case says so.
export async function runCase(testCase, { system, llm, guardrails = true }) {
  const file = join(mkdtempSync(join(tmpdir(), 'sprintboard-eval-')), 'data.json');
  copyFileSync(fixturePath(testCase.fixture), file);
  const tools = createTools(createStore(file));
  const env = { ...process.env, DATA_FILE: file, PROPOSALS_FILE: '', SPRINTBOARD_GUARDRAILS: guardrails ? 'on' : 'off' };
  const mcp = await connectMcp({ env, clientName: 'sprintboard-eval' });
  const sent = [];
  const turns = [];
  const history = [];
  try {
    const model = recording(llm, sent);
    for (const turn of testCase.turns) {
      history.push({ role: 'user', content: turn.user });
      const out = await runAgent({ history, llm: model, mcp, system });
      history.push({ role: 'assistant', content: out.reply });
      const record = { user: turn.user, reply: out.reply, proposals: out.proposals, toolCalls: out.toolCalls };
      if (turn.approve) {
        record.approved = out.proposals.length > 0 && out.proposals.every((p) => tools.approve({ proposalId: p.id }).ok);
      }
      turns.push(record);
    }
  } finally {
    mcp.close();
  }
  return { turns, sent: sent.join('\n') };
}

// makeLlm(prompt, caseId) returns the model to use; tests pass a scripted one.
export async function runEvals({
  prompts = ['v1', 'v2'],
  runs = 3,
  caseIds,
  guardrails = true,
  delayMs = 0,
  makeLlm = () => createLlm(),
  log = () => {},
} = {}) {
  const cases = caseIds ? allCases.filter((c) => caseIds.includes(c.id)) : allCases;
  const results = {};
  for (const prompt of prompts) {
    const system = loadPrompt(prompt);
    results[prompt] = {};
    for (const testCase of cases) {
      const entry = { passed: 0, runs: 0, failures: {}, samples: [] };
      for (let i = 0; i < runs; i++) {
        let outcome;
        let score;
        try {
          outcome = await runCase(testCase, { system, llm: makeLlm(prompt, testCase.id), guardrails });
          score = testCase.score(outcome);
        } catch (err) {
          outcome = { error: err.message };
          score = { pass: false, failed: [`error: ${err.message.slice(0, 120)}`] };
        }
        entry.runs++;
        if (score.pass) entry.passed++;
        for (const f of score.failed) entry.failures[f] = (entry.failures[f] ?? 0) + 1;
        entry.samples.push({
          pass: score.pass,
          failed: score.failed,
          turns: outcome.turns?.map((t) => ({
            user: t.user,
            reply: t.reply,
            calls: t.toolCalls.map((c) => `${c.name}:${c.result?.ok === false ? c.result.code : 'ok'}`),
            proposals: t.proposals.map((p) => p.assignments),
          })),
          error: outcome.error,
        });
        log(`${prompt} ${testCase.id} run ${i + 1}/${runs}: ${score.pass ? 'pass' : `FAIL (${score.failed.join('; ')})`}`);
        if (delayMs) await wait(delayMs);
      }
      results[prompt][testCase.id] = entry;
    }
  }
  return { model: process.env.LLM_MODEL ?? null, guardrails, runs, prompts, cases: cases.map((c) => c.id), results };
}

export function toMarkdown(report) {
  const { prompts, cases, results } = report;
  const rate = (e) => `${e.passed}/${e.runs}`;
  const names = Object.fromEntries(allCases.map((c) => [c.id, c.name]));
  const lines = [
    `# Eval results`,
    ``,
    `Model: \`${report.model ?? 'n/a'}\` · runs per case: ${report.runs} · guardrails: ${report.guardrails ? 'on' : 'off'}`,
    ``,
    `| Case | ${prompts.join(' | ')} |`,
    `|---|${prompts.map(() => '---').join('|')}|`,
    ...cases.map((id) => `| ${id} ${names[id]} | ${prompts.map((p) => rate(results[p][id])).join(' | ')} |`),
  ];
  const total = (p) => cases.reduce((s, id) => s + results[p][id].passed, 0);
  const count = (p) => cases.reduce((s, id) => s + results[p][id].runs, 0);
  lines.push(`| **Total** | ${prompts.map((p) => `**${total(p)}/${count(p)}**`).join(' | ')} |`, ``);
  const failures = prompts.flatMap((p) =>
    cases.flatMap((id) => Object.entries(results[p][id].failures).map(([f, n]) => `- ${p} ${id}: ${f} (${n}×)`)),
  );
  if (failures.length) lines.push(`## Failed checks`, ``, ...failures, ``);
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      prompts: { type: 'string', default: 'v1,v2' },
      runs: { type: 'string', default: '3' },
      cases: { type: 'string' },
      delay: { type: 'string', default: '0' },
      'no-guardrails': { type: 'boolean', default: false },
    },
  });
  const report = await runEvals({
    prompts: values.prompts.split(','),
    runs: Number(values.runs),
    caseIds: values.cases?.split(','),
    guardrails: !values['no-guardrails'],
    delayMs: Number(values.delay),
    log: (line) => console.log(line),
  });
  const md = toMarkdown(report);
  const dir = fileURLToPath(new URL('./results/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(dir, 'latest.md'), md + '\n');
  console.log('\n' + md);
}
