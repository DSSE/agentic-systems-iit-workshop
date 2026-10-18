// Milestone 2: the MCP server, tested through a real MCP client over stdio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tempStore } from './helpers.js';
import { connectMcp } from '../src/agent/mcp-client.js';

const json = (t) => JSON.parse(t);

test('MCP exposes exactly three tools and no approve tool', async () => {
  const { env } = tempStore();
  const mcp = await connectMcp(env);
  try {
    assert.deepEqual(mcp.tools.map((t) => t.name).sort(), ['add_expense', 'check_budget', 'list_vendors']);
  } finally { await mcp.close(); }
});

test('MCP case 1 and 3: add_expense only proposes, and over the cap is refused with the rule code', async () => {
  const { env, stateFile } = tempStore();
  const mcp = await connectMcp(env);
  try {
    const ok = json(await mcp.call('add_expense', { vendor_id: 'v-speaker', item_id: 'speaker-fee', quantity: 1 }));
    assert.equal(ok.status, 'pending_approval');
    const bad = json(await mcp.call('add_expense', { vendor_id: 'v-catering', item_id: 'full-meal', quantity: 200 }));
    assert.equal(bad.code, 'OVER_BUDGET');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(state.expenses.length, 0, 'nothing saved by the MCP client');
    assert.equal(state.pending.length, 1);
  } finally { await mcp.close(); }
});

test('MCP check_budget is exact at the edge', async () => {
  const { env } = tempStore();
  const mcp = await connectMcp(env);
  try {
    assert.equal(json(await mcp.call('check_budget', { amount: 30000 })).ok, true);
    assert.equal(json(await mcp.call('check_budget', { amount: 30001 })).code, 'OVER_BUDGET');
    assert.deepEqual(Object.keys(json(await mcp.call('check_budget', { amount: 0 }))).sort(), ['ok']);
  } finally { await mcp.close(); }
});

test('MCP case 5: injected vendor terms never reach the client, and spending is still capped', async () => {
  const { env, stateFile } = tempStore();
  const mcp = await connectMcp(env);
  try {
    const raw = await mcp.call('list_vendors', {});
    assert.ok(!/raised the cap|50,000/i.test(raw));
    // even if a client obeyed the injection, the price is fixed by vendor data and the cap holds
    const huge = json(await mcp.call('add_expense', { vendor_id: 'v-snacks', item_id: 'snack-box', quantity: 417 })); // ~50,000 BDT
    assert.equal(huge.code, 'OVER_BUDGET');
    assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).security_events.length, 1);
  } finally { await mcp.close(); }
});
