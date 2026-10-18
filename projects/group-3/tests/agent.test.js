// Milestone 2: the chat agent, run with the offline mock model through the real MCP server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempStore } from './helpers.js';
import { connectMcp } from '../src/agent/mcp-client.js';
import { runAgent } from '../src/agent/agent.js';
import { runTwoAgents } from '../src/agent/chat.js';
import { createMockLLM } from '../src/agent/mock-llm.js';
import { createLLM } from '../src/agent/llm.js';

test('local chat has a working no-key mock default', () => {
  assert.equal(createLLM({}).name, 'mock');
  assert.equal(createLLM({ LLM_BASE_URL: 'https://example.test/v1', LLM_MODEL: 'gemini-3.8-flash', GEMINI_API_KEY_PLANNER: 'test-key' }).name, 'gemini-3.8-flash');
});

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
  assert.ok(r.events.some((e) => e.tool === 'add_expense' && e.result.code === 'BUDGET_CAP_EXCEEDED'));
  assert.match(r.reply, /BUDGET_CAP_EXCEEDED/);
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
  assert.equal(r.state.cap, 30000, 'vendor text cannot change the authoritative cap');
  assert.equal(r.state.expenses.length, 1, 'the agent cannot save an expense');
  assert.equal(r.state.security_events[0].kind, 'prompt_injection_blocked');
  assert.ok(r.state.spent + r.state.pending_total <= r.state.cap);
});

test('the agent receives vendor data only as screened MCP results, never by reading data.json', async () => {
  const { env } = tempStore();
  const mcp = await connectMcp(env);
  const modelInputs = [];
  const llm = {
    async chat({ messages }) {
      modelInputs.push(JSON.parse(JSON.stringify(messages)));
      if (!messages.some((message) => message.role === 'tool')) {
        return { content: '', tool_calls: [{ id: 'list', type: 'function', function: { name: 'list_vendors', arguments: '{}' } }] };
      }
      return { content: 'I checked the screened vendor catalog.', tool_calls: [] };
    },
  };
  try {
    const result = await runAgent({ llm, mcp, message: 'Check the vendor catalog.' });
    assert.equal(result.reply, 'I checked the screened vendor catalog.');
    assert.ok(!JSON.stringify(modelInputs[0]).includes('Campus Refreshment Counter'));
    assert.ok(JSON.stringify(modelInputs.at(-1)).includes('Campus Refreshment Counter'));
    assert.ok(!JSON.stringify(modelInputs).match(/raised the cap|50,000/i));
  } finally { await mcp.close(); }
});

test('planner and independent reviewer share MCP; reviewer only checks the budget', async () => {
  const setup = tempStore();
  const mcp = await connectMcp(setup.env);
  try {
    const r = await runTwoAgents({ llm: createMockLLM(), mcp, message: 'Plan snacks and a speaker for Friday seminar.' });
    assert.deepEqual(r.agents, ['Expense planner', 'Budget reviewer']);
    assert.match(r.review, /2 proposals passed the budget checks/i);
    assert.equal(r.events.filter((event) => event.tool === 'add_expense').length, 2);
    assert.equal(setup.store.getState().pending.length, 2);
    assert.equal(setup.store.getState().spent, 10000, 'only the human can approve proposals');
  } finally { await mcp.close(); }
});
