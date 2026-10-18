import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';
import { fixture, CLOCK, request } from './helpers.js';

async function setup(t, model = null) {
  const f = await fixture(t);
  const app = createApp({ dataPath: f.dataPath, now: () => CLOCK, model });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => new Promise((resolve) => { app.close(resolve); app.closeAllConnections(); }));
  const base = `http://127.0.0.1:${app.address().port}`;
  const response = await fetch(`${base}/api/session`);
  const session = await response.json();
  const headers = { Cookie: response.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token };
  const post = async (path, body, extra = {}) => {
    const result = await fetch(`${base}${path}`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
    return { status: result.status, body: await result.json() };
  };
  await post('/api/session', { student_id: 'student-8' });
  return { ...f, base, post, headers };
}
test('HTTP normal flow: inspect proposal, approve, list saved loan', async (t) => {
  const f = await setup(t);
  const before = await f.raw();
  const page = await fetch(f.base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const home = await page.text();
  assert.match(home, /Approve loan/);
  assert.match(home, /id="open-chat"/);
  assert.doesNotMatch(home, /id="chat-form"/);
  const chatPage = await fetch(`${f.base}/chat`);
  assert.equal(chatPage.status, 200);
  assert.match(await chatPage.text(), /id="chat-form"/);
  assert.equal((await (await fetch(`${f.base}/api/equipment`)).json()).equipment.length, 3);
  const checked = await f.post('/api/tools/check_stock', request());
  assert.equal(checked.status, 200);
  assert.equal(await f.raw(), before);
  const approved = await f.post('/api/approve', { proposal_id: checked.body.proposal_id });
  assert.equal(approved.status, 200);
  assert.equal((await f.stored()).loans.length, 1);
  const shelf = async (dates) => (await (await fetch(`${f.base}/api/equipment?${dates}`)).json()).equipment;
  assert.equal((await shelf('start_date=2026-10-19&due_date=2026-10-26'))[0].available_quantity, 4);
  assert.equal((await shelf('start_date=2026-10-19&due_date=2026-10-26'))[0].total_quantity, 6);
  assert.equal((await shelf('start_date=2026-10-26&due_date=2026-11-02'))[0].available_quantity, 6);
  const history = await fetch(`${f.base}/api/loans`, { headers: f.headers });
  assert.equal((await history.json()).loans.length, 1);
  assert.equal((await f.post('/api/approve', { proposal_id: checked.body.proposal_id })).status, 422);
});
test('HTTP boundary and over-limit requests return rule codes with no writes', async (t) => {
  const f = await setup(t);
  const proposal = (await f.post('/api/tools/check_stock', request())).body;
  await f.post('/api/approve', { proposal_id: proposal.proposal_id });
  const before = await f.raw();
  const third = await f.post('/api/tools/check_stock', request({ items: [{ equipment_id: 'ultrasonic-sensor', quantity: 1 }] }));
  assert.equal(third.status, 422);
  assert(third.body.violations.some((entry) => entry.code === 'ITEM_LIMIT_EXCEEDED'));
  const invalid = await f.post('/api/tools/check_stock', request({ items: [{ equipment_id: 'arduino-uno-kit', quantity: 4 }], due_date: '2026-11-02' }));
  assert(invalid.body.violations.some((entry) => entry.code === 'ITEM_LIMIT_EXCEEDED'));
  assert(invalid.body.violations.some((entry) => entry.code === 'DURATION_LIMIT_EXCEEDED'));
  assert.equal(await f.raw(), before);
});
test('HTTP cancellation, forged approval, CSRF, and cross-session attempts cannot save', async (t) => {
  const f = await setup(t);
  const before = await f.raw();
  const checked = (await f.post('/api/tools/check_stock', request())).body;
  assert.equal((await f.post('/api/tools/create_loan', { proposal_id: checked.proposal_id, approved: true })).body.violations[0].code, 'APPROVAL_REQUIRED');
  assert.equal((await f.post('/api/approve', { proposal_id: checked.proposal_id }, { 'X-CSRF-Token': 'forged' })).status, 403);
  assert.equal((await f.post('/api/approve', { proposal_id: checked.proposal_id }, { Origin: 'https://untrusted.example' })).status, 403);
  await f.post('/api/session', { student_id: 'student-9' });
  assert.equal((await f.post('/api/approve', { proposal_id: checked.proposal_id })).status, 422);
  await f.post('/api/session', { student_id: 'student-8' });
  await f.post('/api/cancel', { proposal_id: checked.proposal_id });
  assert.equal((await f.post('/api/approve', { proposal_id: checked.proposal_id })).status, 422);
  assert.equal(await f.raw(), before);
});
test('HTTP malformed input and private paths are rejected', async (t) => {
  const f = await setup(t);
  assert.equal((await fetch(`${f.base}/data.json`)).status, 404);
  assert.equal((await fetch(`${f.base}/.env`)).status, 404);
  assert.equal((await fetch(`${f.base}/api/equipment?start_date=2026-02-30&due_date=2026-10-26`)).status, 422);
  assert.equal((await f.post('/api/tools/check_stock', {})).status, 422);
  const badJson = await fetch(`${f.base}/api/tools/check_stock`, { method: 'POST', headers: f.headers, body: '{broken' });
  assert.equal(badJson.status, 400);
  const badType = await f.post('/api/tools/check_stock', request(), { 'Content-Type': 'text/plain' });
  assert.equal(badType.status, 415);
});

test('HTTP chat clarifies unclear requests and returns a proposal that still needs UI approval', async (t) => {
  const f = await setup(t);
  const before = await f.raw();
  const question = await f.post('/api/chat', { message: 'I need some sensors.' });
  assert.equal(question.status, 200);
  assert.match(question.body.message, /which equipment.*how many.*how long/);
  const answer = await f.post('/api/chat', { message: 'Two ultrasonic sensors for seven days starting 2026-10-19.' });
  assert.equal(answer.body.proposal.proposal.items[0].quantity, 2);
  assert.equal(await f.raw(), before);
  const checked = answer.body.proposal;
  assert.equal((await f.post('/api/approve', { proposal_id: checked.proposal_id })).status, 200);
  assert.equal((await f.stored()).loans.length, 1);
});

test('HTTP model mode returns checked tool proposals without exposing model credentials', async (t) => {
  const f = await setup(t, async () => ({ role: 'assistant', content: null, tool_calls: [
    { id: 'check', type: 'function', function: { name: 'check_stock', arguments: JSON.stringify(request()) } },
  ] }));
  const response = await f.post('/api/chat', { message: 'Two Arduino kits next week.' });
  assert.equal(response.body.mode, 'model');
  assert.equal(response.body.proposal.ok, true);
  assert.equal((await f.stored()).loans.length, 0);
  assert.doesNotMatch(JSON.stringify(response.body), /csrf_token|api_key|approval_token/);
});
