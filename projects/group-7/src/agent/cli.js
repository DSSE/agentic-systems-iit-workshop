#!/usr/bin/env node
// ClubOps agent in the terminal: `npm run agent`.
// The agent proposes; you approve each proposal here with y (anything else = no).

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { createAgent } from "./index.js";
import { llmConfig } from "./llm.js";
import * as service from "../service.js";

const c = (code) => (s) => (stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = c("2"), bold = c("1"), green = c("32"), red = c("31"), yellow = c("33"), cyan = c("36");
const bdt = (n) => `${Number(n).toLocaleString("en-US")} BDT`;

// Line queue: same behaviour when typing and when input is piped in.
const rl = createInterface({ input: stdin, output: stdout, terminal: stdout.isTTY });
const lines = [];
const waiters = [];
let ended = false;
rl.on("line", (l) => (waiters.length ? waiters.shift()(l) : lines.push(l)));
rl.on("close", () => {
  ended = true;
  while (waiters.length) waiters.shift()(null);
});
const echo = (l) => l !== null && !stdout.isTTY && stdout.write(l + "\n");
const ask = (prompt) => {
  stdout.write(prompt);
  if (lines.length) {
    const l = lines.shift();
    echo(l);
    return Promise.resolve(l);
  }
  if (ended) return Promise.resolve(null);
  return new Promise((resolve) => waiters.push((l) => (echo(l), resolve(l))));
};

let agent;
try {
  agent = await createAgent({ clientName: "terminal-agent" });
} catch (err) {
  console.error(red(`Could not start: ${err.message}`));
  process.exit(1);
}
const { harness, mcp, model } = agent;
const shutdown = () => {
  mcp.close();
  rl.close();
  process.exit(0);
};
rl.on("SIGINT", shutdown);

const s = service.checkBudget();
console.log(bold("ClubOps") + dim(` · ${model} via ${llmConfig().baseUrl} · prompt ${harness.promptVersion}`));
console.log(dim(`${s.event.name} · cap ${bdt(s.status.budget_cap)} · spent ${bdt(s.status.spent)} · remaining ${bdt(s.status.remaining)}`));
console.log(dim('Try: "Plan snacks and a speaker for Friday\'s seminar."  Commands: /status, /reset, /exit\n'));

const onEvent = (e) => {
  if (e.type === "tool_call") console.log(dim(`  → ${e.name} ${JSON.stringify(e.args).slice(0, 140)}`));
  if (e.type === "tool_result") {
    const r = e.result || {};
    console.log(dim(`  ← ${e.name} `) + (r.ok === false ? red(r.code || "error") : green("ok")));
  }
  if (e.type === "guardrail") console.log(yellow(`  ⛨ guardrail (${e.rule}): ${e.message}`));
  if (e.type === "error") console.log(red(`  ! ${e.message}`));
};

while (true) {
  const line = await ask(cyan("you › "));
  if (line === null) shutdown();
  const text = line.trim();
  if (!text) continue;
  if (text === "/exit" || text === "/quit") shutdown();
  if (text === "/reset") {
    harness.reset();
    console.log(dim("  (conversation cleared)\n"));
    continue;
  }
  if (text === "/status") {
    const t = service.checkBudget().status;
    console.log(dim(`  cap ${bdt(t.budget_cap)} · spent ${bdt(t.spent)} · pending ${bdt(t.pending)} · remaining ${bdt(t.remaining)}\n`));
    continue;
  }

  const proposals = [];
  try {
    const reply = await harness.run(text, { onEvent: (e) => (e.type === "proposal" && proposals.push(e.proposal), onEvent(e)) });
    console.log(bold("clubops › ") + reply.replace(/\*\*(.+?)\*\*/g, (_, t) => bold(t)) + "\n");
  } catch (err) {
    console.log(red(`clubops › error: ${err.message}\n`));
    continue;
  }

  // The human approval step. Only "y"/"yes" saves.
  for (const p of proposals) {
    const ans = ((await ask(yellow(`  Approve ${p.id}: ${p.description} · ${p.quantity} × ${bdt(p.unit_price)} = ${bdt(p.amount)}? (y/N) `))) ?? "").trim().toLowerCase();
    if (ans === "y" || ans === "yes") {
      const r = service.approve(p.id, { approved_by: "terminal user" });
      console.log(r.ok ? green(`  Saved as ${r.expense.id}. Remaining ${bdt(r.status.remaining)}.`) : red(`  Not saved: ${r.code} ${r.message}`));
    } else {
      service.reject(p.id);
      console.log(dim(`  ${p.id} rejected, nothing saved.`));
    }
  }
  if (proposals.length) console.log("");
}
