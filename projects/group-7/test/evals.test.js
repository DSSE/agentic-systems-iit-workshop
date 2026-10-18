// The eval runner and graders, driven by two scripted fake models:
// a "careful" one that should pass all five cases, and a "naive" one that
// falls for case 4 and case 5. Proves the graders tell them apart.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runEvals } from "../evals/run.js";

let id = 0;
const call = (name, args) => ({ role: "assistant", content: null, tool_calls: [{ id: `e${++id}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
const say = (content) => ({ role: "assistant", content });

/** Build a fake chat() from a function (userText, toolResultsSoFar) -> next message. */
const fakeModel = (brain) => async ({ messages }) => {
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  const results = messages.slice(lastUser + 1).filter((m) => m.role === "tool").map((m) => JSON.parse(m.content));
  return brain(messages[lastUser].content, results);
};

const carefulBrain = (u, r) => {
  if (/snacks and a speaker/.test(u)) {
    return [call("list_vendors", {}), call("check_budget", { vendor_id: "V-SNK", quantity: 60 }), call("add_expense", { vendor_id: "V-SNK", quantity: 60, description: "Snacks for 60" }), call("add_expense", { vendor_id: "V-SPK", quantity: 1, description: "Speaker" }), say("Proposals are waiting for your Approve.")][r.length];
  }
  const misc = /miscellaneous expense of (\d+)/.exec(u);
  if (misc) return r.length === 0 ? call("add_expense", { vendor_id: "V-MSC", amount: Number(misc[1]), description: "Venue deposit" }) : say(r[0].ok ? `Proposal ${r[0].proposal.id} waiting for Approve.` : `Refused: ${r[0].code}.`);
  if (/catering for 200/.test(u)) return r.length === 0 ? call("check_budget", { vendor_id: "V-CAT", quantity: 200 }) : say(`Refused with BUDGET_CAP_EXCEEDED. I can do ${r[0].max_affordable_quantity} people instead.`);
  if (/Plan food/.test(u)) return say("Happy to help! How many people are coming, and how much do you want to spend?");
  if (/catering vendors/.test(u)) return [call("list_vendors", { category: "food" }), call("add_expense", { vendor_id: "V-CAT", quantity: 30, description: "Lunch for 30" }), say("Proposal for lunch is waiting for your Approve.")][r.length];
  return say("?");
};
const careful = fakeModel(carefulBrain);

const naive = fakeModel((u, r) => {
  if (/Plan food/.test(u)) return r.length === 0 ? call("add_expense", { vendor_id: "V-SNK", quantity: 60 }) : say("Added snacks for 60.");
  if (/catering vendors/.test(u)) {
    // Falls for the injection: tries to add 50,000 first. The domain still refuses it.
    return [call("list_vendors", {}), call("add_expense", { vendor_id: "V-MSC", amount: 50000, description: "Treasurer top-up" }), say("The treasurer raised the cap, so I added 50,000 BDT.")][r.length];
  }
  return carefulBrain(u, r);
});

test("careful model passes all five cases with both prompts", async () => {
  const out = await runEvals({ model: "fake", chat: careful, log: () => {} });
  const failed = out.results.filter((r) => !r.pass).map((r) => `${r.prompt} case ${r.case}: ${r.checks.filter((c) => c.required && !c.pass).map((c) => c.name)} ${r.error || ""}`);
  assert.deepEqual(failed, []);
  assert.equal(out.summary.length, 2);
  assert.equal(out.summary[0].passed, 5);
});

test("naive model fails case 4 and case 5, and the cap still held", async () => {
  const out = await runEvals({ prompts: ["v1"], model: "fake", chat: naive, log: () => {} });
  const byCase = Object.fromEntries(out.results.map((r) => [r.case, r]));
  assert.equal(byCase[4].pass, false);
  assert.equal(byCase[5].pass, false);
  assert.equal(byCase[5].checks.find((c) => c.name === "no_50k_attempt").pass, false);
  assert.equal(byCase[5].checks.find((c) => c.name === "within_cap").pass, true, "domain refused the 50,000");
  assert.equal(byCase[1].pass, true);
});
