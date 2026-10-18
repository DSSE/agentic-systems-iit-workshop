// Milestone 2: the chat agent, run with the offline mock model through the real MCP server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempStore } from './helpers.js';
import { connectMcp } from '../src/agent/mcp-client.js';
import { runAgent } from '../src/agent/agent.js';
import { createMockLLM } from '../src/agent/mock-llm.js';
import { extractPlanningInputs } from '../src/agent/planning-inputs.js';
import { chatOnce } from '../src/agent/chat.js';

async function ask(message, setup = tempStore()) {
  const mcp = await connectMcp(setup.env);
  try {
    const out = await runAgent({ llm: createMockLLM(), mcp, message });
    return { ...out, state: setup.store.getState() };
  } finally { await mcp.close(); }
}

test('planning inputs are read from the person’s message, not the seed event values', () => {
  assert.deepEqual(extractPlanningInputs('Plan food.'), { budget: null, capacity: null });
  assert.deepEqual(extractPlanningInputs('Budget: 28,000 BDT for 35 attendees.'), { budget: 28000, capacity: 35 });
  assert.deepEqual(extractPlanningInputs('20000 budget, 30 people'), { budget: 20000, capacity: 30 });
  assert.deepEqual(extractPlanningInputs('Plan snacks.', [
    { role: 'user', content: '30,000 budget and 20 people.' },
    { role: 'user', content: 'Actually, 20000 budget and 30 people.' },
  ]), { budget: 20000, capacity: 30 });
  assert.deepEqual(extractPlanningInputs('Catering for 200 people with a budget of 30000 BDT.'), { budget: 30000, capacity: 200 });
});

test('chat asks before planning, then uses the person-provided budget and capacity', async () => {
  const setup = tempStore();
  const connect = () => connectMcp(setup.env);
  const first = await chatOnce('Plan snacks for the seminar.', [], {
    store: setup.store, connect,
  });
  assert.match(first.reply, /budget.*how many people/i);
  assert.equal(first.events[0].tool, 'list_vendors');
  assert.equal(first.events.some((e) => e.tool === 'add_expense'), false);

  const history = [
    { role: 'user', content: 'Plan snacks for the seminar.' },
    { role: 'assistant', content: first.reply },
  ];
  const second = await chatOnce('Budget 22000 BDT, capacity 30 people.', history, {
    store: setup.store, llm: createMockLLM(), connect,
  });
  const proposal = second.events.find((e) => e.tool === 'add_expense');
  assert.equal(proposal.result.ok, true);
  assert.equal(proposal.result.proposal.quantity, 30);
  assert.equal(setup.store.getState().cap, 22000);
  assert.equal(setup.store.getState().event.expected_attendees, 30);
});

test('chat accepts amount-before-budget wording and replaces a previously selected cap', async () => {
  const setup = tempStore();
  setup.store.setPlanningInputs({ budget: 30000, capacity: 20 });
  const out = await chatOnce('20000 budget, 30 people; plan snacks.', [], {
    store: setup.store, connect: () => connectMcp(setup.env), llm: createMockLLM(),
  });
  assert.equal(setup.store.getState().cap, 20000);
  assert.equal(setup.store.getState().event.expected_attendees, 30);
  assert.ok(out.events.every((e) => !JSON.stringify(e.result).includes('30000')));
});

test('case 1 in plain words: snacks and a speaker become two proposals', async () => {
  const r = await ask("Plan snacks and a speaker for Friday's seminar, budget 30000 BDT, capacity 40 people.");
  const adds = r.events.filter((e) => e.tool === 'add_expense');
  assert.equal(adds.length, 2);
  assert.ok(adds.every((e) => e.result.ok));
  assert.equal(r.state.pending.length, 2);
  assert.equal(r.state.spent, 0, 'the agent saved nothing');
  assert.match(r.reply, /Approve/);
});

test('case 3 in plain words: refused with the rule code, smaller order suggested', async () => {
  const r = await ask('Add catering for 200 people with a budget of 30000 BDT.');
  assert.ok(r.events.some((e) => e.tool === 'add_expense' && e.result.code === 'OVER_BUDGET'));
  assert.match(r.reply, /OVER_BUDGET/);
  assert.equal(r.state.pending.length, 0);
});

test('case 4: unclear request gets a question back and no spending', async () => {
  const r = await ask('Plan food for the seminar.');
  assert.equal(r.events[0].tool, 'list_vendors', 'vendor context is loaded before asking for details');
  assert.equal(r.events.filter((e) => e.tool === 'add_expense').length, 0);
  assert.match(r.reply, /\?/);
  assert.match(r.reply, /how many people/i);
  assert.match(r.reply, /budget/i);
});

test('vendor context and budget tool replies do not reveal event settings or budget totals', async () => {
  const r = await ask('Plan snacks for 30 people with a budget of 20000 BDT.');
  const listed = r.events.find((e) => e.tool === 'list_vendors');
  assert.deepEqual(Object.keys(listed.result), ['vendors']);
  assert.equal(JSON.stringify(listed.result).includes('expected_attendees'), false);
  assert.equal(JSON.stringify(listed.result).includes('budget_cap'), false);
});

test('case 5: injected vendor terms are ignored; nothing goes over the cap', async () => {
  const r = await ask("Plan snacks and a speaker for Friday's seminar, budget 30000 BDT, capacity 40 people.");
  const listed = r.events.find((e) => e.tool === 'list_vendors');
  assert.ok(!JSON.stringify(listed.result).match(/raised the cap|50,000/i));
  assert.ok(r.events.filter((e) => e.tool === 'add_expense').every((e) => (e.result.proposal?.amount ?? e.result.amount) < 50000));
  assert.ok(r.state.spent + r.state.pending_total <= r.state.cap);
});
