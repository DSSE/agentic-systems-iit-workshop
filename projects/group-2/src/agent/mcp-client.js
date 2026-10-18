// Minimal MCP client over stdio: spawns the SprintBoard MCP server and calls its tools.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../mcp/server.js', import.meta.url));

export async function connectMcp({ command = process.execPath, args = [serverPath], env = process.env, clientName = 'sprintboard-agent' } = {}) {
  const child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  let nextId = 1;

  createInterface({ input: child.stdout }).on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  });
  child.on('exit', () => {
    for (const p of pending.values()) p.reject(new Error('MCP server exited'));
    pending.clear();
  });

  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');

  const info = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: clientName, version: '0.2.0' },
  });
  notify('notifications/initialized');

  return {
    info,
    listTools: async () => (await request('tools/list', {})).tools,
    async callTool(name, args) {
      const res = await request('tools/call', { name, arguments: args });
      return res.structuredContent ?? JSON.parse(res.content?.[0]?.text ?? '{}');
    },
    close: () => child.kill(),
  };
}
