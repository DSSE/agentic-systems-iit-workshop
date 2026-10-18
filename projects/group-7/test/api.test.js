import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/server.js';
import { read, useRealData } from './helpers.js';

describe('API', () => {
  let server;
  let base;
  let file;

  before(async () => {
    file = useRealData();
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  after(() => server.close());

  const post = (path, body) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    });

  test('lists vendors and the budget', async () => {
    const vendors = await (await fetch(`${base}/vendors`)).json();
    assert.equal(vendors.vendors.length, 5);
    const budget = await (await fetch(`${base}/budget`)).json();
    assert.equal(budget.cap, 20000);
  });

  test('case 3: over-cap proposal is a 422 with the rule code', async () => {
    const res = await post('/proposals', { vendorId: 'v3', quantity: 200 });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error.code, 'BUDGET_CAP_EXCEEDED');
  });

  test('case 1: propose then approve saves the expense', async () => {
    const before = read(file);
    const res = await post('/proposals', { vendorId: 'v1', quantity: 10 });
    assert.equal(res.status, 201);
    const proposal = await res.json();
    assert.equal(read(file), before, 'nothing saved before approve');

    const approved = await post(`/proposals/${proposal.id}/approve`);
    assert.equal(approved.status, 200);
    assert.notEqual(read(file), before);
    assert.equal((await (await fetch(`${base}/budget`)).json()).spent, 3600);
  });

  test('approving twice is refused', async () => {
    const proposal = await (await post('/proposals', { vendorId: 'v1', quantity: 1 })).json();
    await post(`/proposals/${proposal.id}/approve`);
    const again = await post(`/proposals/${proposal.id}/approve`);
    assert.equal(again.status, 400);
  });

  test('bad input is a 400', async () => {
    assert.equal((await post('/proposals', { vendorId: 'v1', quantity: 0 })).status, 400);
    assert.equal((await post('/proposals', { vendorId: 'nope', quantity: 1 })).status, 404);
  });
});
