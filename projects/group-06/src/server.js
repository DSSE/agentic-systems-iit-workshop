/**
 * SprintBoard Full-Stack HTTP Server & REST API
 * Native Node.js HTTP server serving frontend and REST endpoints.
 */

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { list_tasks, check_capacity, assign_task } from './tools.js';
import { readData } from './domain/storage.js';
import { runAgent } from './agent.js';
import { detectInjectionPatterns } from './guardrails/input_sanitizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data, null, 2));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    // --- API Endpoints ---
    if (pathname === '/api/data' && req.method === 'GET') {
      try {
        const data = list_tasks();
        return sendJson(res, 200, data);
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (pathname === '/api/check' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const result = check_capacity(body.memberName, body.taskIds);
        const status = result.allowed ? 200 : 422;
        return sendJson(res, status, result);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/propose' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const result = assign_task(body.memberName, body.taskIds, false);
        const status = result.success ? 200 : 422;
        return sendJson(res, status, result);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/approve' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        // Explicit human approval action
        const result = assign_task(body.memberName, body.taskIds, true);
        const status = result.success ? 200 : 422;
        return sendJson(res, status, result);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/chat' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const userMessage = body.message || '';
        const history = body.history || [];

        // Phase 7 Guardrail check: detect prompt injection indicators
        const injectionAudit = detectInjectionPatterns(userMessage);
        if (injectionAudit.hasInjectionPattern) {
          console.warn(`[SECURITY AUDIT] Prompt injection indicator detected in chat: ${injectionAudit.matchedPatterns.join(', ')}`);
        }

        const agentResponse = await runAgent(userMessage, history);
        return sendJson(res, 200, {
          ...agentResponse,
          guardrailAudit: injectionAudit
        });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    // --- Static File Serving ---
    let filePath = pathname === '/' ? join(publicDir, 'index.html') : join(publicDir, pathname);

    if (existsSync(filePath)) {
      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      try {
        const content = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        return res.end(content);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Internal Server Error');
      }
    }

    // 404 Fallback
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
}

// Start standalone if invoked directly
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const PORT = process.env.PORT || 3000;
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`🚀 SprintBoard server running at http://localhost:${PORT}`);
  });
}
