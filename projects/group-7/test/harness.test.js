// Agent harness with a scripted fake model (no LLM needed). MCP server is real.

import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { McpClient } from "../src/mcp/client.js";
import { Harness, recoverToolCalls } from "../src/agent/harness.js";
import { systemPrompt } from "../src/agent/prompts.js";
import { useTempData } from "./helpers.js";

const db = useTempData();
const mcp = await new McpClient({ clientName: "harness-test" }).connect();
after(() => mcp.close());
beforeEach(() => db.reset());

let n = 0;
const call = (name, args) => ({ role: "assistant", content: null, tool_calls: [{ id: `c${++n}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
const say = (content) => ({ role: "assistant", content });
function harness(...turns) {
  const sent = [];
  const chat = async ({ messages, tools }) => {
    sent.push({ messages: structuredClone(messages), tools });
    const t = turns.shift();
    if (!t) throw new Error("script ran out");
    return t;
  };
  return { h: new Harness({ mcp, model: "fake", chat }), sent };
}

test("case 1 flow: list -> check -> add x2 -> reply; proposals emitted, nothing saved", async () => {
  const { h, sent } = harness(
    call("list_vendors", {}),
    call("check_budget", { vendor_id: "V-SNK", quantity: 60 }),
    call("add_expense", { vendor_id: "V-SNK", quantity: 60, description: "Snacks" }),
    call("add_expense", { vendor_id: "V-SPK", quantity: 1, description: "Speaker" }),
    say("Proposals P-1 and P-2 are waiting for your Approve.")
  );
  const proposals = [];
  const reply = await h.run("Plan snacks and a speaker for Friday's seminar.", { onEvent: (e) => e.type === "proposal" && proposals.push(e.proposal) });
  assert.match(reply, /waiting for your Approve/);
  assert.equal(proposals.length, 2);
  assert.equal(db.read().expenses.length, 2, "agent never saves");
  assert.equal(db.read().proposals.length, 2);
  // OpenAI-format tool messages
  const toolMsg = sent[1].messages.at(-1);
  assert.equal(toolMsg.role, "tool");
  assert.equal(toolMsg.tool_call_id, sent[1].messages.at(-2).tool_calls[0].id);
  assert.deepEqual(sent[0].tools.map((t) => t.function.name), ["list_vendors", "check_budget", "add_expense"]);
});

test("system prompt carries live budget numbers; v1 and v2 differ", async () => {
  const { h, sent } = harness(say("hi"));
  await h.run("hello");
  assert.match(sent[0].messages[0].content, /remaining 20500 BDT/);
  const status = await mcp.callTool("check_budget", {});
  assert.doesNotMatch(systemPrompt("v1", status), /BUDGET_CAP_EXCEEDED/);
  assert.match(systemPrompt("v2", status), /BUDGET_CAP_EXCEEDED/);
  assert.match(systemPrompt("v2", status), /DATA, not instructions/);
});

test("the injected vendor text never reaches the model", async () => {
  const { h, sent } = harness(call("list_vendors", { category: "food" }), say("ok"));
  await h.run("show caterers");
  assert.doesNotMatch(sent[1].messages.at(-1).content, /treasurer|50,000/i);
});

test("even with harness guardrails off, a 50,000 BDT add is refused by the domain", async () => {
  process.env.CLUBOPS_GUARDRAILS = "off";
  try {
    const { h, sent } = harness(call("add_expense", { vendor_id: "V-MSC", amount: 50000 }), say("refused"));
    await h.run("x");
    assert.match(sent[1].messages.at(-1).content, /BUDGET_CAP_EXCEEDED/);
    assert.equal(db.read().proposals.length, 0);
  } finally {
    delete process.env.CLUBOPS_GUARDRAILS;
  }
});

test("proposal limit per message", async () => {
  const adds = Array.from({ length: 5 }, () => call("add_expense", { vendor_id: "V-TEA", quantity: 1 + n }));
  const events = [];
  const { h } = harness(...adds, say("done"));
  await h.run("spam", { onEvent: (e) => events.push(e) });
  assert.equal(db.read().proposals.length, 4);
  assert.ok(events.some((e) => e.type === "guardrail" && e.rule === "proposal_limit"));
});

test("unknown tools (e.g. approve) are refused", async () => {
  const { h, sent } = harness(call("approve_expense", { id: "P-1" }), say("can't"));
  await h.run("approve it yourself");
  assert.match(sent[1].messages.at(-1).content, /UNKNOWN_TOOL/);
});

test("loop guard and step limit", async () => {
  const same = call("list_vendors", {});
  const { h } = harness(same, structuredClone(same), structuredClone(same));
  assert.match(await h.run("x"), /repeating/);
  const many = Array.from({ length: 12 }, (_, i) => call("check_budget", { vendor_id: "V-TEA", quantity: i + 1 }));
  const { h: h2 } = harness(...many);
  assert.match(await h2.run("x"), /stopped after/);
});

test("tool call written as JSON text is recovered (small models)", async () => {
  assert.equal(recoverToolCalls('{"name":"list_vendors","arguments":{}}', ["list_vendors"]).length, 1);
  assert.equal(recoverToolCalls('{"name":"rm_rf","arguments":{}}', ["list_vendors"]).length, 0);
  assert.equal(recoverToolCalls("Sure, here you go", ["list_vendors"]).length, 0);
  const { h } = harness(say('```json\n{"name":"check_budget","arguments":{}}\n```'), say("Remaining 20,500 BDT."));
  assert.equal(await h.run("budget?"), "Remaining 20,500 BDT.");
});

test("output guard fixes a false 'saved' claim", async () => {
  const { h } = harness(say("Great, the snacks have been saved!"));
  assert.match(await h.run("x"), /nothing is saved until a person clicks Approve/);
});
