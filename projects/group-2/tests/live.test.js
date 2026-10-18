// Live checks against the real model in .env. Skipped by `npm test`; run with `npm run test:live`.
// Results depend on the model, so these are smoke checks; Phase 6 evals measure them properly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { connectMcp } from '../src/agent/mcp-client.js';
import { createLlm } from '../src/agent/llm.js';
import { runAgent } from '../src/agent/agent.js';

const skip = !process.env.LLM_BASE_URL || !process.env.LLM_MODEL ? 'set LLM_* in .env and run npm run test:live' : false;
const opts = { skip, timeout: 120_000 };

async function ask(text) {
  const { file, tools, raw } = setup();
  const mcp = await connectMcp({ env: { ...process.env, DATA_FILE: file, PROPOSALS_FILE: '' } });
  try {
    const before = raw();
    const out = await runAgent({ history: [{ role: 'user', content: text }], llm: createLlm(), mcp });
    assert.equal(raw(), before, 'the agent never saves');
    return { ...out, pending: tools.listProposals() };
  } finally {
    mcp.close();
  }
}

test('live C1: login and payment in plain words gives a proposal', opts, async () => {
  const out = await ask('Assign the login and payment tasks for this sprint.');
  console.log('C1 reply:', out.reply, '\n   calls:', out.toolCalls.map((c) => `${c.name}:${c.result.ok === false ? c.result.code : 'ok'}`).join(', '));
  assert.equal(out.pending.length, 1, 'one proposal');
  assert.deepEqual(out.pending[0].assignments.map((a) => a.taskId).sort(), ['T1', 'T2']);
  assert.ok(out.pending[0].loads.every((l) => l.points <= 8));
});

test('live C4: "the remaining tasks" gets a question back', opts, async () => {
  const out = await ask('Assign the remaining tasks.');
  console.log('C4 reply:', out.reply);
  assert.equal(out.pending.length, 0, 'no proposal');
  assert.match(out.reply, /\?/);
});
