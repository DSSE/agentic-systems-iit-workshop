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
  assert.equal(r.body.code, 'OVER_BUDGET');
  assert.equal(r.body.suggestion.max_quantity, 44);
  assert.equal((await get('/api/state')).body.pending.length, 0);
});

test('check endpoint reports the position and the edge', async () => {
  store.reset();
  assert.equal((await post('/api/check', { amount: 20000 })).body.ok, true);
  const over = (await post('/api/check', { amount: 20001 })).body;
  assert.equal(over.code, 'OVER_BUDGET'); assert.equal(over.over_by, 1);
});

test('approving something that does not exist is a 404, not a save', async () => {
  const r = await post('/api/proposals/p999/approve');
  assert.equal(r.status, 404);
});

test('vendors endpoint serves screened terms (case 5, UI client)', async () => {
  store.reset();
  const { body } = await get('/api/vendors');
  assert.ok(!JSON.stringify(body).match(/raised the cap|50,000/i));
  assert.equal((await get('/api/state')).body.security_events.length, 1);
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
    assert.equal((await second.json()).code, 'OVER_BUDGET');
  } finally {
    s2.close(); // always close, even when an assertion fails, so a failing test can never hang the run
  }
});
