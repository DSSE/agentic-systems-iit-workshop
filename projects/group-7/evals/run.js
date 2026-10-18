#!/usr/bin/env node
// Evals: run the five workshop cases against a real model with two prompt
// versions and compare.
//
//   npm run eval                                   both prompts, all cases, 1 run each
//   npm run eval -- --runs 3                       repeat (models are not deterministic)
//   npm run eval -- --prompts v2 --cases 4,5
//   npm run eval -- --guardrails both              also compare harness guardrails on/off
//
// Each case gets a fresh copy of data.seed.json, so evals never touch data.json.
// Results: printed table + evals/results/latest.json + evals/results/report.html

import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CASES } from "./cases.js";
import { McpClient } from "../src/mcp/client.js";
import { Harness } from "../src/agent/harness.js";
import { loadEnv, llmConfig, detectModel, chat as llmChat } from "../src/agent/llm.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.join(HERE, "..", "data.seed.json");
const read = (f) => JSON.parse(readFileSync(f, "utf8"));

async function runCase(c, { promptVersion, model, chat, guardrails }) {
  const dir = mkdtempSync(path.join(tmpdir(), "clubops-eval-"));
  const file = path.join(dir, "data.json");
  copyFileSync(SEED, file);
  process.env.CLUBOPS_DATA_FILE = file;
  process.env.CLUBOPS_GUARDRAILS = guardrails ? "on" : "off";

  const before = read(file);
  const cap = before.event.budget_cap;
  const spent = before.expenses.reduce((s, x) => s + x.amount, 0);
  const ctx = { remainingAtStart: cap - spent };

  const mcp = await new McpClient({ clientName: `eval-${promptVersion}` }).connect();
  const harness = new Harness({ mcp, model, promptVersion, chat });
  const turns = [];
  let error = null;
  const t0 = Date.now();
  try {
    for (const text of c.turns(ctx)) {
      const turn = { text, reply: "", events: [], toolCalls: [], toolResults: [], proposals: [] };
      turns.push(turn);
      turn.reply = await harness.run(text, {
        onEvent: (e) => {
          turn.events.push(e);
          if (e.type === "tool_call") turn.toolCalls.push({ name: e.name, args: e.args || {} });
          if (e.type === "tool_result") turn.toolResults.push({ name: e.name, result: e.result });
          if (e.type === "proposal") turn.proposals.push(e.proposal);
        },
      });
    }
  } catch (err) {
    error = err.message;
  } finally {
    mcp.close();
  }

  const transcript = { turns, before, after: read(file), cap, remainingAtStart: ctx.remainingAtStart };
  const checks = Object.entries(c.checks).map(([name, k]) => {
    let pass = false;
    try {
      pass = !error && turns.length > 0 && k.check(transcript) === true;
    } catch {
      pass = false;
    }
    return { name, required: k.required, pass };
  });
  return {
    case: c.id,
    name: c.name,
    prompt: promptVersion,
    guardrails,
    pass: checks.filter((x) => x.required).every((x) => x.pass),
    checks,
    error,
    ms: Date.now() - t0,
    transcript: turns.map((t) => ({ user: t.text, tools: t.toolCalls, reply: t.reply })),
  };
}

/** Run every selected case for every prompt version (and guardrail setting). */
export async function runEvals({ prompts = ["v1", "v2"], cases = CASES.map((c) => c.id), runs = 1, guardrails = [true], model, chat = llmChat, log = console.log } = {}) {
  const results = [];
  for (const g of guardrails) {
    for (const promptVersion of prompts) {
      for (const c of CASES.filter((x) => cases.includes(x.id))) {
        for (let r = 1; r <= runs; r++) {
          const res = await runCase(c, { promptVersion, model, chat, guardrails: g });
          res.run = r;
          results.push(res);
          const failed = res.checks.filter((x) => x.required && !x.pass).map((x) => x.name);
          log(`  ${res.pass ? "PASS" : "FAIL"}  ${promptVersion}${guardrails.length > 1 ? (g ? "+guard" : "-guard") : ""}  case ${c.id} ${c.name.padEnd(15)} ${(res.ms / 1000).toFixed(1)}s${failed.length ? "  ✗ " + failed.join(", ") : ""}${res.error ? "  ! " + res.error : ""}`);
        }
      }
    }
  }
  return { model, runs, results, summary: summarize(results) };
}

export function summarize(results) {
  const rows = {};
  for (const r of results) {
    const key = `${r.prompt}${r.guardrails ? "" : " (guardrails off)"}`;
    rows[key] ??= { label: key, cases: {}, passed: 0, total: 0 };
    rows[key].cases[r.case] ??= { pass: 0, total: 0 };
    rows[key].cases[r.case].total++;
    rows[key].total++;
    if (r.pass) {
      rows[key].cases[r.case].pass++;
      rows[key].passed++;
    }
  }
  return Object.values(rows);
}

function table(summary) {
  const ids = CASES.map((c) => c.id);
  const head = ["prompt".padEnd(24), ...ids.map((i) => `case ${i}`.padEnd(8)), "total"].join(" ");
  const lines = summary.map((r) => [r.label.padEnd(24), ...ids.map((i) => (r.cases[i] ? `${r.cases[i].pass}/${r.cases[i].total}` : "-").padEnd(8)), `${r.passed}/${r.total}`].join(" "));
  return [head, ...lines].join("\n");
}

function report({ model, results, summary }) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const ids = CASES.map((c) => c.id);
  return `<!doctype html><meta charset="utf-8"><title>ClubOps evals</title>
<style>body{font:14px/1.5 system-ui;margin:32px;max-width:1100px}table{border-collapse:collapse;margin:12px 0 28px}td,th{border:1px solid #ddd;padding:5px 10px;text-align:left}th{background:#f4f4f4}.p{color:#1a7f37}.f{color:#b42318}pre{white-space:pre-wrap;background:#f7f7f7;padding:8px;font-size:12px}</style>
<h1>ClubOps evals</h1><p>Model <b>${esc(model)}</b> · ${new Date().toISOString()}</p>
<table><tr><th>Prompt</th>${ids.map((i) => `<th>Case ${i} · ${esc(CASES.find((c) => c.id === i).name)}</th>`).join("")}<th>Total</th></tr>
${summary.map((r) => `<tr><td>${esc(r.label)}</td>${ids.map((i) => `<td>${r.cases[i] ? `${r.cases[i].pass}/${r.cases[i].total}` : "-"}</td>`).join("")}<td><b>${r.passed}/${r.total}</b></td></tr>`).join("")}</table>
${results.map((r) => `<h3 class="${r.pass ? "p" : "f"}">${r.pass ? "PASS" : "FAIL"} · ${esc(r.prompt)}${r.guardrails ? "" : " (guardrails off)"} · case ${r.case} ${esc(r.name)} · run ${r.run}</h3>
<p>${r.checks.map((c) => `<span class="${c.pass ? "p" : "f"}">${c.pass ? "✔" : "✘"} ${esc(c.name)}${c.required ? "" : " (optional)"}</span>`).join(" · ")}${r.error ? ` · <span class="f">error: ${esc(r.error)}</span>` : ""}</p>
${r.transcript.map((t) => `<pre><b>user:</b> ${esc(t.user)}\n<b>tools:</b> ${esc(t.tools.map((x) => `${x.name}(${JSON.stringify(x.args)})`).join("  "))}\n<b>agent:</b> ${esc(t.reply)}</pre>`).join("")}`).join("\n")}`;
}

export function saveResults(out, dir = path.join(HERE, "results")) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "latest.json"), JSON.stringify(out, null, 2));
  writeFileSync(path.join(dir, "report.html"), report(out));
  return dir;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  const arg = (name, def) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? def : process.argv[i + 1];
  };
  const prompts = arg("prompts", "v1,v2").split(",");
  const cases = arg("cases", "1,2,3,4,5").split(",").map(Number);
  const runs = Number(arg("runs", "1"));
  const g = arg("guardrails", "on");
  const guardrails = g === "both" ? [true, false] : [g !== "off"];
  let model;
  try {
    model = await detectModel(llmConfig());
  } catch (err) {
    console.error(`Can't run evals: ${err.message}`);
    process.exit(1);
  }
  console.log(`ClubOps evals · ${model} via ${llmConfig().baseUrl} · prompts ${prompts.join(", ")} · ${runs} run(s)\n`);
  const out = await runEvals({ prompts, cases, runs, guardrails, model });
  console.log("\n" + table(out.summary));
  const dir = saveResults(out);
  console.log(`\nSaved ${path.relative(process.cwd(), dir)}/latest.json and report.html`);
}
