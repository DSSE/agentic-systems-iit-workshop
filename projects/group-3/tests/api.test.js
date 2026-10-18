import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tempStore, boundarySeed } from './helpers.js';
import { createApp } from '../src/api/app.js';

let server, base, store;
const post = (p, body = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json() }));

before(async () => {
  ({ store } = tempStore());
  server = createApp({ store }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('case 1 over HTTP: proposals first, saved only after Approve', async () => {
  store.reset();
  const a = await post('/api/proposals', { vendor_id: 'v-snacks', item_id: 'snack-box', quantity: 40 });
  const b = await post('/api/proposals', { vendor_id: 'v-speaker', item_id: 'speaker-fee', quantity: 1 });
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  assert.equal((await get('/api/state')).body.spent, 10000);
  assert.equal((await post(`/api/proposals/${a.body.proposal.id}/approve`)).status, 200);
  assert.equal((await post(`/api/proposals/${b.body.proposal.id}/approve`)).status, 200);
  const s = (await get('/api/state')).body;
  assert.equal(s.spent, 22800);
  assert.equal(s.remaining, 7200);
});

test('case 3 over HTTP: refused with 422 and the rule code', async () => {
  store.reset();
  const r = await post('/api/proposals', { vendor_id: 'v-catering', item_id: 'full-meal', quantity: 200 });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'BUDGET_CAP_EXCEEDED');
  assert.equal(r.body.amount, 90000, 'the request uses the catalog price of 450 BDT per person');
  assert.equal(r.body.suggestion.max_quantity, 44);
  const state = (await get('/api/state')).body;
  assert.equal(state.pending.length, 0);
  assert.equal(state.spent, 10000, 'a rejected request does not alter approved expenses');
});

test('check endpoint reports the position and the edge', async () => {
  store.reset();
  assert.equal((await post('/api/check', { amount: 20000 })).body.ok, true);
  const over = (await post('/api/check', { amount: 20001 })).body;
  assert.equal(over.code, 'BUDGET_CAP_EXCEEDED'); assert.equal(over.over_by, 1);
});

test('approving something that does not exist is a 404, not a save', async () => {
  const r = await post('/api/proposals/p999/approve');
  assert.equal(r.status, 404);
});

test('vendors endpoint serves screened terms (case 5, UI client)', async () => {
  store.reset();
  const { body } = await get('/api/vendors');
  assert.ok(!JSON.stringify(body).match(/raised the cap|50,000/i));
  const state = (await get('/api/state')).body;
  assert.equal(state.security_events.length, 1);
  assert.ok(!JSON.stringify(state).match(/raised the cap|50,000/i));
});

test('event creation starts a clean workspace and requires confirmation to replace it', async () => {
  const t = tempStore((d) => ({ ...d, event: null, budget_cap: 0, expenses: [], pending: [] }));
  const s2 = createApp({ store: t.store }).listen(0);
  try {
    const b2 = `http://127.0.0.1:${s2.address().port}`;
    const create = (body) => fetch(b2 + '/api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const initial = await fetch(b2 + '/api/state').then((r) => r.json());
    assert.equal(initial.event, null);
    assert.equal(initial.spent, 0);
    assert.equal(initial.pending.length, 0);
    const created = await create({ name: 'Robotics club meetup', date: '2026-11-06', expected_attendees: 35, budget_cap: 25000 });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).state.spent, 0);
    assert.equal((await create({ name: 'New event', date: '2026-11-07', expected_attendees: 20, budget_cap: 12000 })).status, 409);
  } finally {
    s2.close();
  }
});

test('the UI page is served', async () => {
  const html = await fetch(base + '/').then((r) => r.text());
  assert.match(html, /ClubOps/);
});

test('chat endpoint says so when no agent is configured', async () => {
  assert.equal((await post('/api/chat', { message: 'hi' })).status, 501);
});

test('boundary over HTTP on a tiny cap', async () => {
  const t = tempStore(boundarySeed);
  const s2 = createApp({ store: t.store }).listen(0);
  try {
    const b2 = `http://127.0.0.1:${s2.address().port}`;
    const p = (body) => fetch(b2 + '/api/proposals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await p({ vendor_id: 'v', item_id: 'exact' })).status, 201);
    const second = await p({ vendor_id: 'v', item_id: 'one' });
    assert.equal(second.status, 422);
    assert.equal((await second.json()).code, 'BUDGET_CAP_EXCEEDED');
  } finally {
    s2.close(); // always close, even when an assertion fails, so a failing test can never hang the run
  }
});
