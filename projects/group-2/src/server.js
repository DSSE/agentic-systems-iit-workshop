// HTTP API + static UI. Every route goes through src/tools.js.
import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTools } from './tools.js';
import { createLlm } from './agent/llm.js';
import { connectMcp } from './agent/mcp-client.js';
import { runAgent } from './agent/agent.js';

// Default chat: the agent talks to the tools only through the MCP server.
function createChat() {
  let ready;
  return async (history) => {
    ready ??= Promise.all([createLlm(), connectMcp({ clientName: 'sprintboard-web' })]).catch((err) => {
      ready = undefined;
      throw err;
    });
    const [llm, mcp] = await ready;
    return runAgent({ history, llm, mcp });
  };
}

const validHistory = (h) =>
  Array.isArray(h) && h.length > 0 && h.length <= 40 &&
  h.every((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.length <= 4000);

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const statusFor = (result, okStatus = 200) => {
  if (result.ok) return okStatus;
  if (result.code === 'PROPOSAL_NOT_FOUND') return 404;
  if (result.code === 'INVALID_INPUT') return 400;
  return 422;
};

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function serveStatic(res, pathname) {
  const file = resolve(publicDir, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(resolve(publicDir) + sep)) return send(res, 404, { ok: false, code: 'NOT_FOUND' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    send(res, 404, { ok: false, code: 'NOT_FOUND' });
  }
}

export function createServer(tools = createTools(), { chat = createChat() } = {}) {
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    try {
      if (!pathname.startsWith('/api/')) return await serveStatic(res, pathname);

      if (req.method === 'GET' && pathname === '/api/tasks') {
        return send(res, 200, { ok: true, ...tools.listTasks({ status: url.searchParams.get('status') ?? 'all' }) });
      }
      if (req.method === 'GET' && pathname === '/api/proposals') {
        return send(res, 200, { ok: true, proposals: tools.listProposals() });
      }

      if (req.method === 'POST') {
        const body = await readBody(req);
        if (body === null) return send(res, 400, { ok: false, code: 'INVALID_INPUT', details: { reason: 'invalid JSON' } });

        if (pathname === '/api/chat') {
          if (!validHistory(body.messages)) {
            return send(res, 400, { ok: false, code: 'INVALID_INPUT', details: { reason: 'messages must be user/assistant text' } });
          }
          try {
            const { reply, proposals } = await chat(body.messages);
            return send(res, 200, { ok: true, reply, proposals: proposals.map((p) => p.id) });
          } catch (err) {
            return send(res, 502, { ok: false, code: 'AGENT_ERROR', details: { message: err.message } });
          }
        }
        if (pathname === '/api/check') {
          const result = tools.checkCapacity(body);
          return send(res, statusFor(result), result);
        }
        if (pathname === '/api/proposals') {
          const result = tools.assignTask(body);
          return send(res, statusFor(result, 201), result);
        }
        const match = pathname.match(/^\/api\/proposals\/([^/]+)\/(approve|reject)$/);
        if (match) {
          const [, proposalId, action] = match;
          const result = tools[action]({ proposalId });
          return send(res, statusFor(result), result);
        }
      }
      send(res, 404, { ok: false, code: 'NOT_FOUND' });
    } catch (err) {
      send(res, 500, { ok: false, code: 'SERVER_ERROR', details: { message: err.message } });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`SprintBoard on http://localhost:${port}`));
}
