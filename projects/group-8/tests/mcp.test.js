import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server.js';
import { fixture, request, CLOCK } from './helpers.js';

async function setup(t) {
  const f = await fixture(t);
  const app = createApp({ dataPath: f.dataPath, now: () => CLOCK, model: null });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(() => new Promise((resolve) => { app.close(resolve); app.closeAllConnections(); }));
  const base = `http://127.0.0.1:${app.address().port}`;
  let session;
  let id = 0;
  async function rpc(method, params = {}, notification = false, extra = {}) {
    const result = await fetch(`${base}/mcp`, { method: 'POST', headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25', ...(session ? { 'Mcp-Session-Id': session } : {}), ...extra,
    }, body: JSON.stringify({ jsonrpc: '2.0', ...(!notification ? { id: ++id } : {}), method, params }) });
    session = result.headers.get('mcp-session-id') || session;
    return { status: result.status, body: result.status === 202 ? null : await result.json() };
  }
  async function initialize() {
    const initialized = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'independent-http-client', version: '1' } });
    assert.equal(initialized.body.result.serverInfo.name, 'lablend');
    assert.equal((await rpc('notifications/initialized', {}, true)).status, 202);
  }
  return { ...f, base, rpc, initialize };
}

test('HTTP MCP negotiates lifecycle, discovers exactly three tools, validates schemas and origin', async (t) => {
  const f = await setup(t);
  await f.initialize();
  const definitions = (await f.rpc('tools/list')).body.result.tools;
  assert.deepEqual(definitions.map((entry) => entry.name), ['list_equipment', 'check_stock', 'create_loan']);
  assert.equal((await f.rpc('tools/call', { name: 'approveProposal', arguments: {} })).body.error.code, -32602);
  assert.equal((await f.rpc('tools/call', { name: 'check_stock', arguments: { ...request(), approved: true } })).body.error.code, -32602);
  assert.equal((await f.rpc('tools/list', {}, false, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await f.rpc('tools/list', {}, false, { 'MCP-Protocol-Version': 'wrong' })).status, 400);
  assert.equal((await fetch(`${f.base}/mcp`)).status, 405);
});

test('external MCP proposal transfers to human review UI and only explicit approval saves', async (t) => {
  const f = await setup(t);
  await f.initialize();
  const before = await f.raw();
  const checked = (await f.rpc('tools/call', { name: 'check_stock', arguments: request() })).body.result.structuredContent;
  assert.equal(checked.ok, true);
  assert.equal(new URL(checked.review_url).searchParams.get('proposal'), checked.proposal_id);
  assert.equal(await f.raw(), before);
  const direct = (await f.rpc('tools/call', { name: 'create_loan', arguments: { proposal_id: checked.proposal_id } })).body.result;
  assert.equal(direct.isError, true);
  assert.equal(direct.structuredContent.violations[0].code, 'APPROVAL_REQUIRED');
  const bootstrap = await fetch(`${f.base}/api/session`);
  const session = await bootstrap.json();
  const headers = { Cookie: bootstrap.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token };
  const post = async (path, input) => (await fetch(`${f.base}${path}`, { method: 'POST', headers, body: JSON.stringify(input) })).json();
  await post('/api/session', { student_id: 'wrong-student' });
  assert.equal((await post('/api/review', { proposal_id: checked.proposal_id })).ok, false);
  await post('/api/session', { student_id: 'student-8' });
  assert.equal((await post('/api/review', { proposal_id: checked.proposal_id })).ok, true);
  assert.equal(await f.raw(), before);
  assert.equal((await post('/api/approve', { proposal_id: checked.proposal_id })).ok, true);
  assert.equal((await f.stored()).loans.length, 1);
  const over = (await f.rpc('tools/call', { name: 'check_stock', arguments: request({ due_date: '2026-11-02', items: [{ equipment_id: 'arduino-uno-kit', quantity: 4 }] }) })).body.result;
  assert.equal(over.isError, true);
  assert(over.structuredContent.violations.some((entry) => entry.code === 'ITEM_LIMIT_EXCEEDED'));
  assert(over.structuredContent.violations.some((entry) => entry.code === 'DURATION_LIMIT_EXCEEDED'));
});

test('independent stdio subprocess client connects through bridge without stdout noise', async (t) => {
  const f = await setup(t);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/mcp.js', import.meta.url))], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LABLEND_URL: f.base },
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const lines = createInterface({ input: child.stdout });
  const waiting = new Map();
  lines.on('line', (line) => {
    const value = JSON.parse(line);
    const request = waiting.get(value.id);
    if (request) { clearTimeout(request.timer); waiting.delete(value.id); request.resolve(value); }
  });
  let id = 0;
  const call = (method, params) => new Promise((resolve, reject) => {
    const next = ++id;
    const timer = setTimeout(() => { waiting.delete(next); reject(new Error('Stdio MCP timeout')); }, 10000);
    waiting.set(next, { resolve, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: next, method, params })}\n`);
  });
  const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'independent-stdio-client', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  assert.equal((await call('tools/list', {})).result.tools.length, 3);
  const listed = await call('tools/call', { name: 'list_equipment', arguments: {} });
  assert.equal(listed.result.structuredContent.equipment.length, 3);
  const proposal = (await call('tools/call', { name: 'check_stock', arguments: request() })).result.structuredContent;
  assert.equal(proposal.ok, true);
  assert.equal((await call('tools/call', { name: 'create_loan', arguments: { proposal_id: proposal.proposal_id } })).result.isError, true);
  assert.equal((await f.stored()).loans.length, 0);
  const exited = once(child, 'exit');
  child.stdin.end();
  assert.equal((await exited)[0], 0);
});
