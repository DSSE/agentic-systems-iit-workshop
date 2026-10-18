// Test helpers: every test gets its own temp copy of a fixture.
import { mkdtempSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../src/store.js';
import { createTools } from '../src/tools.js';
import { createServer } from '../src/server.js';

export function setup(fixture = 'seed') {
  const file = join(mkdtempSync(join(tmpdir(), 'sprintboard-')), 'data.json');
  copyFileSync(fileURLToPath(new URL(`./fixtures/${fixture}.json`, import.meta.url)), file);
  const store = createStore(file);
  return { file, store, tools: createTools(store), raw: () => readFileSync(file, 'utf8') };
}

export async function startServer(tools, options) {
  const server = createServer(tools, options);
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, body: json, text };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

export const all6ToRafi = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((taskId) => ({ taskId, memberId: 'rafi' }));
