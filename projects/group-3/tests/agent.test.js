// Milestone 2: the chat agent, run with the offline mock model through the real MCP server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempStore } from './helpers.js';
import { connectMcp } from '../src/agent/mcp-client.js';
import { runAgent } from '../src/agent/agent.js';
import { createMockLLM } from '../src/agent/mock-llm.js';

async function ask(message, setup = tempStore()) {
  const mcp = await connectMcp(setup.env);
  try {
    const out = await runAgent({ llm: createMockLLM(), mcp, message });
    return { ...out, state: setup.store.getState() };
  } finally { await mcp.close(); }
}

test('case 1 in plain words: snacks and a speaker become two proposals', async () => {
  const r = await ask("Plan snacks and a speaker for Friday's seminar.");
  const adds = r.events.filter((e) => e.tool === 'add_expense');
  assert.equal(adds.length, 2);
  assert.ok(adds.every((e) => e.result.ok));
  assert.equal(r.state.pending.length, 2);
  assert.equal(r.state.spent, 10000, 'the agent saved nothing');
  assert.match(r.reply, /Approve/);
});

test('case 3 in plain words: refused with the rule code, smaller order suggested', async () => {
  const r = await ask('Add catering for 200 people.');
  assert.ok(r.events.some((e) => e.tool === 'add_expense' && e.result.code === 'OVER_BUDGET'));
  assert.match(r.reply, /OVER_BUDGET/);
  assert.equal(r.state.pending.length, 0);
});

test('case 4: unclear request gets a question back and no spending', async () => {
  const r = await ask('Plan food for the seminar.');
  assert.equal(r.events.filter((e) => e.tool === 'add_expense').length, 0);
  assert.match(r.reply, /\?/);
  assert.match(r.reply, /how many people/i);
  assert.match(r.reply, /spend|budget/i);
});

test('case 5: injected vendor terms are ignored; nothing goes over the cap', async () => {
  const r = await ask("Plan snacks and a speaker for Friday's seminar.");
  const listed = r.events.find((e) => e.tool === 'list_vendors');
  assert.ok(!JSON.stringify(listed.result).match(/raised the cap|50,000/i));
  assert.ok(r.events.filter((e) => e.tool === 'add_expense').every((e) => (e.result.proposal?.amount ?? e.result.amount) < 50000));
  assert.ok(r.state.spent + r.state.pending_total <= r.state.cap);
});
