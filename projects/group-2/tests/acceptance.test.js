// One test per acceptance criterion in specs/agent.md. Todos are filled in by the
// phase that builds the feature. Tests run on temp copies of tests/fixtures/*.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, startServer, all6ToRafi } from './helpers.js';

const todo = (name, phase) => test(name, { todo: `Phase ${phase}` });
const load = (tools, id) => tools.listTasks().members.find((m) => m.id === id);
const c1 = [
  { taskId: 'T1', memberId: 'nadia' },
  { taskId: 'T2', memberId: 'tanvir' },
];

// Milestone 1
test('AC-1: list_tasks returns all tasks and each member\'s points, limit and remaining', () => {
  const { tools } = setup('boundary');
  const { tasks, members } = tools.listTasks();
  assert.equal(tasks.length, 6);
  assert.deepEqual(load(tools, 'rafi'), { id: 'rafi', name: 'Rafi', points: 5, limit: 8, remaining: 3 });
  assert.equal(members.length, 4);
  assert.equal(tools.listTasks({ status: 'unassigned' }).tasks.length, 5);
  assert.deepEqual(tools.listTasks({ status: 'assigned' }).tasks.map((t) => t.id), ['T2']);
});

test('AC-2: check_capacity never writes the data file', () => {
  const { tools, raw } = setup();
  const before = raw();
  assert.equal(tools.checkCapacity({ assignments: c1 }).ok, true);
  assert.equal(tools.checkCapacity({ assignments: all6ToRafi }).ok, false);
  assert.equal(raw(), before);
});

test('AC-3: assign_task creates a proposal and never writes the data file', () => {
  const { tools, raw } = setup();
  const before = raw();
  const result = tools.assignTask({ assignments: c1 });
  assert.equal(result.ok, true);
  assert.ok(result.proposal.id);
  assert.deepEqual(result.proposal.assignments, c1);
  assert.equal(tools.listProposals().length, 1);
  assert.equal(raw(), before);
});

test('AC-4: only approve writes the data file, and only for a known pending proposal', () => {
  const { tools, raw } = setup();
  const before = raw();
  assert.equal(tools.approve({ proposalId: 'nope' }).code, 'PROPOSAL_NOT_FOUND');
  const { proposal } = tools.assignTask({ assignments: c1 });
  assert.equal(tools.reject({ proposalId: proposal.id }).ok, true);
  assert.equal(tools.approve({ proposalId: proposal.id }).code, 'PROPOSAL_NOT_FOUND');
  assert.equal(raw(), before);

  const second = tools.assignTask({ assignments: c1 }).proposal;
  assert.equal(tools.approve({ proposalId: second.id }).ok, true);
  assert.notEqual(raw(), before);
  assert.equal(tools.approve({ proposalId: second.id }).code, 'PROPOSAL_NOT_FOUND', 'a proposal is used once');
});

test('AC-5: C1 login + payment to two members gives a proposal; approve saves both', () => {
  const { tools, store } = setup();
  const result = tools.assignTask({ assignments: c1 });
  assert.equal(result.ok, true);
  assert.ok(result.proposal.loads.every((l) => l.points <= 8));
  assert.ok(store.load().tasks.every((t) => t.assignee === null), 'not saved before approve');

  assert.equal(tools.approve({ proposalId: result.proposal.id }).ok, true);
  const saved = Object.fromEntries(store.load().tasks.map((t) => [t.id, t.assignee]));
  assert.equal(saved.T1, 'nadia');
  assert.equal(saved.T2, 'tanvir');
});

test('AC-6: C2 reaching exactly 8 gives a proposal; 9 fails with MAX_POINTS_EXCEEDED', () => {
  const { tools } = setup('boundary');
  const eight = tools.assignTask({ assignments: [{ taskId: 'T1', memberId: 'rafi' }] });
  assert.equal(eight.ok, true);
  assert.equal(eight.proposal.loads.find((l) => l.id === 'rafi').points, 8);
  assert.equal(tools.approve({ proposalId: eight.proposal.id }).ok, true);

  const nine = tools.assignTask({ assignments: [{ taskId: 'T6', memberId: 'rafi' }] });
  assert.equal(nine.ok, false);
  assert.equal(nine.code, 'MAX_POINTS_EXCEEDED');
  assert.deepEqual(nine.details, { memberId: 'rafi', current: 8, adding: 1, total: 9, limit: 8 });
});

test('AC-7: C3 all 6 tasks to Rafi fails with MAX_POINTS_EXCEEDED and nothing is saved', () => {
  const { tools, raw } = setup();
  const before = raw();
  const result = tools.assignTask({ assignments: all6ToRafi });
  assert.equal(result.code, 'MAX_POINTS_EXCEEDED');
  assert.equal(result.details.total, 18);
  assert.equal(tools.listProposals().length, 0);
  assert.equal(raw(), before);
});

test('AC-8: assign_task refuses a rule-breaking batch even if check_capacity was skipped', () => {
  const { tools } = setup();
  // Each task alone fits Rafi; together (3 + 5 + 3 = 11) they don't. Batch is atomic.
  const batch = ['T1', 'T2', 'T3'].map((taskId) => ({ taskId, memberId: 'rafi' }));
  const result = tools.assignTask({ assignments: batch });
  assert.equal(result.code, 'MAX_POINTS_EXCEEDED');
  assert.equal(tools.listProposals().length, 0);
  // Other codes
  assert.equal(tools.assignTask({ assignments: [] }).code, 'INVALID_INPUT');
  assert.equal(tools.assignTask({ assignments: [c1[0], c1[0]] }).code, 'DUPLICATE_TASK');
  assert.equal(tools.assignTask({ assignments: [{ taskId: 'T99', memberId: 'rafi' }] }).code, 'UNKNOWN_TASK');
  assert.equal(tools.assignTask({ assignments: [{ taskId: 'T1', memberId: 'zed' }] }).code, 'UNKNOWN_MEMBER');
  const taken = setup('boundary').tools.assignTask({ assignments: [{ taskId: 'T2', memberId: 'nadia' }] });
  assert.equal(taken.code, 'TASK_ALREADY_ASSIGNED');
});

test('AC-9: approve re-checks the rule and refuses if data changed', () => {
  const { tools, store, raw } = setup();
  // Two proposals that each fit Rafi alone but not together.
  const a = tools.assignTask({ assignments: [{ taskId: 'T2', memberId: 'rafi' }] }).proposal;
  const b = tools.assignTask({ assignments: [{ taskId: 'T5', memberId: 'rafi' }] }).proposal;
  assert.equal(tools.approve({ proposalId: a.id }).ok, true);
  const afterA = raw();
  const result = tools.approve({ proposalId: b.id });
  assert.equal(result.code, 'MAX_POINTS_EXCEEDED');
  assert.equal(raw(), afterA);
  assert.equal(load(tools, 'rafi').points, 5);
  assert.equal(tools.listProposals().length, 0, 'failed proposal is dropped');
  assert.ok(store.load().tasks.every((t) => t.assignee !== 'rafi' || t.id === 'T2'));
});

test('AC-10: the API returns the same codes as the tools', async () => {
  const { tools } = setup();
  const { call, close } = await startServer(tools);
  try {
    const check = await call('POST', '/api/check', { assignments: all6ToRafi });
    assert.equal(check.status, 422);
    assert.deepEqual(check.body, tools.checkCapacity({ assignments: all6ToRafi }));

    const prop = await call('POST', '/api/proposals', { assignments: all6ToRafi });
    assert.equal(prop.status, 422);
    assert.equal(prop.body.code, 'MAX_POINTS_EXCEEDED');

    assert.equal((await call('POST', '/api/proposals', { assignments: [] })).body.code, 'INVALID_INPUT');
    assert.equal((await call('POST', '/api/proposals/nope/approve')).status, 404);
  } finally {
    await close();
  }
});

test('AC-11: C1-C3 work in the UI; only Approve saves', async (t) => {
  const { tools, raw } = setup('boundary');
  const { call, close } = await startServer(tools);
  t.after(close);

  const page = await call('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.text, /Approve/);
  assert.equal((await call('GET', '/app.js')).status, 200);
  assert.equal((await call('GET', '/../data.json')).status, 404);

  // The UI only writes through the approve route.
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const posts = [...app.matchAll(/api\('POST', [`'"]([^`'"]+)/g)].map((m) => m[1]);
  assert.deepEqual(posts.sort(), ['/api/check', '/api/proposals', '/api/proposals/${id}/${action}'].sort());

  const before = raw();
  // C2 then C1-style proposal, as the UI would send them.
  const eight = await call('POST', '/api/proposals', { assignments: [{ taskId: 'T1', memberId: 'rafi' }] });
  assert.equal(eight.status, 201);
  assert.equal(raw(), before, 'proposing does not save');
  const nine = await call('POST', '/api/proposals', { assignments: [{ taskId: 'T1', memberId: 'rafi' }, { taskId: 'T6', memberId: 'rafi' }] });
  assert.equal(nine.body.code, 'MAX_POINTS_EXCEEDED');
  // C3
  const c3 = await call('POST', '/api/proposals', { assignments: ['T1', 'T3', 'T4', 'T5', 'T6'].map((taskId) => ({ taskId, memberId: 'rafi' })) });
  assert.equal(c3.body.code, 'MAX_POINTS_EXCEEDED');

  assert.equal((await call('GET', '/api/proposals')).body.proposals.length, 1);
  const approved = await call('POST', `/api/proposals/${eight.body.proposal.id}/approve`);
  assert.equal(approved.status, 200);
  assert.notEqual(raw(), before, 'approve saves');
  assert.equal((await call('GET', '/api/tasks')).body.members.find((m) => m.id === 'rafi').points, 8);
});

// Milestone 2
todo('AC-12: MCP server exposes the three tools and calls the domain module', 4);
todo('AC-13: two different AI clients connect to the MCP server', 4);
todo('AC-14: C1 chat agent handles case 1 in plain words', 5);
todo('AC-15: C4 chat agent asks a question back', 5);

// Milestone 3 (optional)
todo('AC-16: evals cover C1-C5 and compare two prompt versions', 6);
todo('AC-17: C5 injection is blocked from every client', 7);
