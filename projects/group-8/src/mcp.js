// Stdio-to-HTTP bridge. Run the LabLend app first; stdout contains only MCP JSON-RPC.
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './model.js';

export async function runBridge({ endpoint = process.env.LABLEND_URL || 'http://localhost:3000', input = process.stdin, output = process.stdout } = {}) {
  const url = new URL('/mcp', endpoint);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password) {
    throw new Error('LABLEND_URL must be a local http://localhost or http://127.0.0.1 address');
  }
  let sessionId;
  let version = '2025-11-25';
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    let response;
    try {
      if (Buffer.byteLength(line) > 16384) throw new Error('Message too large');
      message = JSON.parse(line);
      const result = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': version, ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) }, body: line });
      sessionId = result.headers.get('mcp-session-id') || sessionId;
      if (result.status === 202) continue;
      if (!result.ok) throw new Error('MCP server unavailable or session expired');
      response = await result.json();
      if (message.method === 'initialize') version = response.result?.protocolVersion || version;
    } catch {
      if (message && !Object.hasOwn(message, 'id')) continue;
      response = { jsonrpc: '2.0', id: message?.id ?? null, error: { code: message ? -32000 : -32700,
        message: message ? 'Cannot reach LabLend MCP. Start the app and initialize again.' : 'Invalid JSON message' } };
    }
    if (response) output.write(`${JSON.stringify(response)}\n`);
  }
  if (sessionId) await fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(2000),
    headers: { 'Mcp-Session-Id': sessionId, 'MCP-Protocol-Version': version } }).catch(() => {});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadConfig();
  runBridge().catch(() => { console.error('LabLend MCP bridge could not start. Check LABLEND_URL and start the app.'); process.exitCode = 1; });
}
