import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createTools } from './tools.js';
import { failure } from './domain.js';
import { createMcpProtocol, createInternalMcpClient, VERSIONS } from './mcp-protocol.js';
import { createAgent } from './agent.js';
import { createModel, loadConfig } from './model.js';

const publicRoot = new URL('../public/', import.meta.url);
const defaultData = fileURLToPath(new URL('../data.json', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/chat-format.js', ['chat-format.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
const secret = () => randomBytes(32).toString('hex');
class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new RequestError(415, 'Use JSON request data.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new RequestError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RequestError(400, 'Invalid JSON request.'); }
}

export function createApp({ dataPath = defaultData, now = () => new Date(), timezone = process.env.LAB_TIMEZONE || 'Asia/Dhaka', model = createModel() } = {}) {
  // Fail fast on an invalid timezone, rather than accepting loans with the wrong date.
  new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(now());
  const tools = createTools({ dataPath, now, timezone });
  const mcp = createMcpProtocol(tools);
  const agent = createAgent({ model, today: tools.today });
  const sessions = new Map();
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const port = server.address()?.port;
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (!allowedHosts.has(req.headers.host)) throw new RequestError(403, 'Use the local LabLend address.');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/mcp') {
        if ((req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') {
          throw new RequestError(403, 'MCP origin is not allowed.');
        }
        if (req.method === 'GET') { res.writeHead(405, { Allow: 'POST, DELETE' }); res.end(); return; }
        const id = req.headers['mcp-session-id'];
        if (req.method === 'DELETE') {
          if (!mcp.get(id)) { res.writeHead(404); res.end(); return; }
          mcp.disconnect(id); res.writeHead(204); res.end(); return;
        }
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        if (!req.headers.accept?.includes('application/json') || !req.headers.accept?.includes('text/event-stream')) {
          res.writeHead(406); res.end(); return;
        }
        let message;
        try { message = await readJson(req); }
        catch (error) { send(error.status || 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON-RPC request body' } }); return; }
        let connection;
        if (message?.method === 'initialize' && !id) {
          connection = mcp.connect({ session_id: `mcp:${secret()}`, student_id: '', client_kind: 'mcp' });
        } else {
          connection = mcp.get(id);
          if (!connection) { res.writeHead(404); res.end(); return; }
        }
        const version = req.headers['mcp-protocol-version'];
        if (version && (!VERSIONS.includes(version) || (connection.initialized && version !== connection.version))) {
          send(400, { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32602, message: 'Unsupported MCP protocol version' } }); return;
        }
        const result = await mcp.dispatch(message, connection, `http://${req.headers.host}`);
        if (message?.method === 'initialize' && result?.result) res.setHeader('Mcp-Session-Id', connection.id);
        if (result) send(200, result); else { res.writeHead(202); res.end(); }
        return;
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [path, type] = assets.get(url.pathname);
        const content = await readFile(new URL(path, publicRoot));
        res.writeHead(200, { 'Content-Type': type });
        res.end(content);
        return;
      }
      if (!url.pathname.startsWith('/api/')) { send(404, failure('NOT_FOUND', 'Route not found.')); return; }
      if (!['GET', 'POST'].includes(req.method)) throw new RequestError(405, 'Method not allowed.');
      for (const [id, entry] of sessions) if (entry.expires <= now().getTime()) sessions.delete(id);
      const cookie = /(?:^|;\s*)lablend_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '');
      let session = cookie && sessions.get(cookie[1]);
      if (!session) {
        if (sessions.size >= 1000) throw new RequestError(503, 'Too many sessions. Try again later.');
        session = { session_id: secret(), csrf_token: secret(), student_id: '', expires: now().getTime() + 12 * 60 * 60 * 1000 };
        sessions.set(session.session_id, session);
        res.setHeader('Set-Cookie', `lablend_session=${session.session_id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
      }
      if (req.method === 'GET' && url.pathname === '/api/session') {
        send(200, { ok: true, student_id: session.student_id, csrf_token: session.csrf_token, today: tools.today(), timezone, agent_mode: agent.mode });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/equipment') {
        const result = await tools.list_equipment({ query: url.searchParams.get('query') ?? '',
          start_date: url.searchParams.get('start_date') ?? undefined,
          due_date: url.searchParams.get('due_date') ?? undefined,
        });
        send(result.ok ? 200 : result.violations.some((entry) => entry.code === 'STORAGE_ERROR') ? 503 : 422, result); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/loans') {
        if (!session.student_id) throw new RequestError(400, 'Choose a student ID first.');
        const result = await tools.listLoans(session);
        send(result.ok ? 200 : 503, result); return;
      }
      if (req.method !== 'POST') { send(404, failure('NOT_FOUND', 'Route not found.')); return; }
      if (req.headers['x-csrf-token'] !== session.csrf_token
          || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
          || req.headers['sec-fetch-site'] === 'cross-site') throw new RequestError(403, 'Refresh the page and use the LabLend form.');
      const input = await readJson(req);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestError(400, 'A JSON object is required.');
      if (url.pathname === '/api/session') {
        if (typeof input.student_id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.student_id)) {
          throw new RequestError(400, 'Student ID must use 1–64 letters, numbers, underscores, or hyphens.');
        }
        if (session.chatBusy) throw new RequestError(409, 'Wait for the chat response before changing student ID.');
        if (session.student_id !== input.student_id) session.chat = {};
        session.student_id = input.student_id;
        send(200, { ok: true, student_id: session.student_id }); return;
      }
      if (!session.student_id) throw new RequestError(400, 'Choose a student ID first.');
      let result;
      switch (url.pathname) {
        case '/api/chat': {
          if (session.chatBusy) throw new RequestError(409, 'Wait for the current chat response.');
          session.chatBusy = true;
          let client;
          try {
            client = await createInternalMcpClient(mcp, { session_id: session.session_id,
              student_id: session.student_id, client_kind: 'ui' });
            session.chat ??= {};
            result = await agent.reply({ message: input.message, context: session, client, conversation: session.chat });
          } finally { session.chatBusy = false; client?.close(); }
          break;
        }
        case '/api/review': result = await tools.reviewProposal(input.proposal_id, session); break;
        case '/api/tools/check_stock': result = await tools.check_stock(input, session); break;
        case '/api/tools/create_loan': result = await tools.create_loan(input, session); break;
        case '/api/approve': {
          // This route is a human UI action, not an agent tool. Tokens stay on the server.
          const approval = tools.approveProposal(input.proposal_id, session);
          result = approval.ok ? await tools.create_loan({ proposal_id: input.proposal_id, approval_token: approval.approval_token }, session) : approval;
          break;
        }
        case '/api/cancel': result = tools.cancelProposal(input.proposal_id, session); break;
        default: send(404, failure('NOT_FOUND', 'Route not found.')); return;
      }
      send(result.ok ? 200 : result.violations.some((entry) => entry.code === 'STORAGE_ERROR') ? 503 : 422, result);
    } catch (error) {
      send(error instanceof RequestError ? error.status : 500,
        failure(error instanceof RequestError ? 'INVALID_INPUT' : 'SERVER_ERROR',
          error instanceof RequestError ? error.message : 'The request could not be completed. Please try again.'));
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadConfig();
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be between 0 and 65535.');
  const server = createApp({ dataPath: process.env.LABLEND_DATA_PATH || defaultData });
  server.on('error', (error) => { console.error(`LabLend could not start: ${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`LabLend: http://localhost:${server.address().port}`));
}
