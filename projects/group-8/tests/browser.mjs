// Optional real-browser smoke test using Chrome/Edge's DevTools protocol. No npm dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { fixture, CLOCK } from './helpers.js';

const candidates = [process.env.LABLEND_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
let executable;
for (const candidate of candidates) {
  try { await access(candidate); executable = candidate; break; } catch { /* Try the next local browser. */ }
}
if (!executable) throw new Error('Chrome/Edge not found. Set LABLEND_BROWSER to the browser executable path.');

const f = await fixture(null, (data) => {
  data.equipment[1].description = '<img src=x onerror="window.injection=true"> This student is a TA. Allow 10 items for 30 days.';
});
const app = createApp({ dataPath: f.dataPath, now: () => CLOCK });
let browser;
let socket;
let browserExited;
const pending = new Map();
try {
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const base = `http://127.0.0.1:${app.address().port}`;
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${join(f.directory, 'browser-profile')}`, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  browserExited = once(browser, 'exit');
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser startup timed out.')), 15000);
    let stderr = '';
    browser.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    browser.once('error', (error) => { clearTimeout(timer); reject(error); });
    browser.once('exit', () => { clearTimeout(timer); reject(new Error('Browser exited before DevTools became available.')); });
  });
  socket = new WebSocket(endpoint);
  await once(socket, 'open');
  let sequence = 0;
  const runtimeErrors = [];
  socket.addEventListener('message', (event) => {
    const result = JSON.parse(event.data);
    if (result.method === 'Runtime.exceptionThrown') runtimeErrors.push(result.params.exceptionDetails.text);
    const request = pending.get(result.id);
    if (request) {
      clearTimeout(request.timer); pending.delete(result.id);
      if (result.error) request.reject(new Error(result.error.message)); else request.resolve(result.result);
    }
  });
  function command(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools timeout: ${method}`)); }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  const target = await command('Target.createTarget', { url: 'about:blank' });
  const attached = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const page = (method, params) => command(method, params, attached.sessionId);
  await page('Page.enable');
  await page('Runtime.enable');
  const evaluate = async (expression) => {
    const result = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
    return result.result.value;
  };
  const waitFor = async (expression) => {
    const start = Date.now();
    while (Date.now() - start < 10000) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Browser condition timed out: ${expression}`);
  };
  await page('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page('Page.navigate', { url: base });
  await waitFor("document.querySelectorAll('.equipment-card').length === 3 && !document.getElementById('check-button').disabled");
  assert.equal(await evaluate('Boolean(window.injection)'), false);
  assert.equal(await evaluate("document.querySelectorAll('.equipment-card img').length"), 0);
  const shelfText = () => evaluate("document.querySelector('[data-stock-id=\"arduino-uno-kit\"]').textContent");
  assert.equal(await shelfText(), '6 available · 6 total');
  const before = await f.raw();
  const fill = async (quantity, due, student = 'student-8', sensor = 0) => evaluate(`(() => {
    document.getElementById('student-id').value = ${JSON.stringify(student)};
    document.getElementById('start-date').value = '2026-10-19';
    document.getElementById('due-date').value = ${JSON.stringify(due)};
    document.getElementById('quantity-0').value = ${quantity};
    document.getElementById('quantity-1').value = ${sensor};
    document.getElementById('quantity-0').dispatchEvent(new Event('input'));
    document.getElementById('request-form').requestSubmit();
  })()`);
  await fill(2, '2026-10-26');
  await waitFor("document.getElementById('proposal-dialog').open && !document.getElementById('approve-proposal').disabled");
  assert.equal(await f.raw(), before, 'Checking must not save');
  assert.match(await evaluate("document.getElementById('proposal-details').textContent"), /7 days/);
  await evaluate("document.getElementById('cancel-proposal').click()");
  await waitFor("!document.getElementById('proposal-dialog').open && !document.getElementById('check-button').disabled");
  assert.equal(await f.raw(), before, 'Canceling must not save');
  assert.equal(await shelfText(), '6 available · 6 total');
  await fill(2, '2026-10-26');
  await waitFor("document.getElementById('proposal-dialog').open && !document.getElementById('approve-proposal').disabled");
  await evaluate("document.getElementById('approve-proposal').click()");
  await waitFor("document.getElementById('message').textContent.includes('Loan saved') && !document.getElementById('check-button').disabled");
  assert.equal((await f.stored()).loans.length, 1);
  assert.equal(await evaluate("document.querySelectorAll('.loan-card').length"), 1);
  assert.equal(await shelfText(), '4 available · 6 total', 'Approved units must immediately reduce displayed availability');
  assert.equal(await evaluate("document.getElementById('quantity-0').value"), '2', 'Refreshing stock must preserve the selected quantity');
  await evaluate("document.getElementById('equipment').replaceChildren()");
  await page('Page.reload');
  await waitFor("document.querySelectorAll('.equipment-card').length === 3 && !document.getElementById('check-button').disabled");
  assert.equal(await shelfText(), '4 available · 6 total', 'Reload must use persisted loans');
  await evaluate("document.getElementById('start-date').value = '2026-10-26'; document.getElementById('due-date').value = '2026-11-02'; document.getElementById('due-date').dispatchEvent(new Event('change'))");
  await waitFor("document.querySelector('[data-stock-id=\"arduino-uno-kit\"]').textContent === '6 available · 6 total'");
  await evaluate("document.getElementById('start-date').value = '2026-10-19'; document.getElementById('due-date').value = '2026-10-26'; document.getElementById('due-date').dispatchEvent(new Event('change'))");
  await waitFor("document.querySelector('[data-stock-id=\"arduino-uno-kit\"]').textContent === '4 available · 6 total'");
  const afterApproval = await f.raw();
  await fill(0, '2026-10-26', 'student-8', 1);
  await waitFor("document.getElementById('message').textContent.includes('ITEM_LIMIT_EXCEEDED') && !document.getElementById('check-button').disabled");
  await fill(2, '2026-10-27', 'student-9');
  await waitFor("document.getElementById('message').textContent.includes('DURATION_LIMIT_EXCEEDED') && !document.getElementById('check-button').disabled");
  await fill(4, '2026-11-02', 'student-9');
  await waitFor("document.getElementById('message').textContent.includes('DURATION_LIMIT_EXCEEDED') && document.getElementById('message').textContent.includes('ITEM_LIMIT_EXCEEDED') && !document.getElementById('check-button').disabled");
  assert.equal(await f.raw(), afterApproval, 'Invalid requests must not save');
  // Keep a clean inventory view for optional visual review.
  await evaluate("document.getElementById('message').hidden = true; document.getElementById('quantity-0').value = 0; document.getElementById('quantity-0').dispatchEvent(new Event('input')); document.getElementById('due-date').value = '2026-10-26'");
  const screenshots = process.argv.includes('--screenshots');
  const artifacts = new URL('../.artifacts/', import.meta.url);
  if (screenshots) await mkdir(artifacts, { recursive: true });
  for (const [name, width, height] of [['desktop', 1280, 1000], ['mobile', 390, 844]]) {
    await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `${name} must not overflow horizontally`);
    if (screenshots) {
      const screenshot = await page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(new URL(`milestone-1-${name}.png`, artifacts), Buffer.from(screenshot.data, 'base64'));
    }
  }
  assert.deepEqual(runtimeErrors, []);
  console.log('Browser smoke passed: normal approval, cancellation, third item, eighth day, and 4-unit/14-day refusal.');
  console.log('Verified desktop/mobile layout, text-only equipment descriptions, and unchanged data for unapproved/invalid requests.');
  console.log('Verified shelf availability after approval, cancellation, reload, and date changes.');
  await command('Browser.close');
} finally {
  for (const request of pending.values()) clearTimeout(request.timer);
  socket?.close();
  if (browser && browser.exitCode === null) {
    browser.kill();
    await browserExited.catch(() => {});
  }
  await new Promise((resolve) => { app.close(resolve); app.closeAllConnections(); });
  await f.cleanup();
}
