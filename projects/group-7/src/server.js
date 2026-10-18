#!/usr/bin/env node
// ClubOps full-stack app: REST API + the web UI + the chat agent.
//   npm start  ->  http://localhost:3000
//
// Every route goes through src/service.js -> src/domain/budget.js, so the
// hard rule holds for the UI and for anyone calling the API directly.
// The planner works without an LLM; only the chat panel needs one.
//
// API
//   GET  /api/state                     event, totals, vendors, expenses, proposals
//   GET  /api/vendors?category=food     list_vendors
//   POST /api/check     {vendor_id, quantity|amount}           check_budget
//   POST /api/proposals {vendor_id, quantity|amount, description}  add_expense (pending only)
//   POST /api/proposals/:id/approve     the ONLY way to save (the Approve button)
//   POST /api/proposals/:id/reject
//   POST /api/demo/reset                restore data.seed.json
//   GET  /api/agent                     agent status
//   POST /api/chat     {session, text}  agent run, streamed as NDJSON events
//   POST /api/chat/reset {session}
// There is no route that changes the budget cap.

import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as service from "./service.js";
import { ROOT } from "./domain/store.js";
import { loadEnv, llmConfig } from "./agent/llm.js";
import { createAgent } from "./agent/index.js";
import { Harness } from "./agent/harness.js";

const STATUS_FOR = { BUDGET_CAP_EXCEEDED: 422, UNKNOWN_VENDOR: 400, INVALID_QUANTITY: 400, INVALID_AMOUNT: 400, PROPOSAL_NOT_FOUND: 404, PROPOSAL_NOT_PENDING: 409 };

export function createApp({ agentFactory = () => createAgent({ clientName: "ui-chat-agent" }) } = {}) {
  let agentPromise = null; // started on first use, so the planner works with no LLM
  let agentError = null;
  const sessions = new Map();

  const getAgent = () => {
    if (!agentPromise) {
      agentPromise = agentFactory().catch((err) => {
        agentError = err.message;
        agentPromise = null;
        throw err;
      });
    }
    return agentPromise;
  };

  const json = (res, code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const result = (res, r, okCode = 200) => json(res, r.ok === false ? STATUS_FOR[r.code] || 400 : okCode, r);
  const body = (req) =>
    new Promise((resolve, reject) => {
      let s = "";
      req.on("data", (c) => {
        s += c;
        if (s.length > 1e5) reject(new Error("Body too large"));
      });
      req.on("end", () => {
        try {
          resolve(s ? JSON.parse(s) : {});
        } catch {
          reject(new Error("Invalid JSON"));
        }
      });
    });

  async function chat(req, res) {
    const { session: sid, text } = await body(req);
    if (!sid || !text?.trim()) return json(res, 400, { error: "session and text are required" });
    let agent;
    try {
      agent = await getAgent();
    } catch (err) {
      return json(res, 503, { error: `Chat agent unavailable: ${err.message}` });
    }
    if (!sessions.has(sid)) sessions.set(sid, { harness: new Harness({ mcp: agent.mcp, model: agent.model, promptVersion: agent.harness.promptVersion }), busy: false });
    const s = sessions.get(sid);
    if (s.busy) return json(res, 409, { error: "Still working on the previous message." });
    s.busy = true;
    res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
    const emit = (e) => res.write(JSON.stringify(e) + "\n");
    try {
      const reply = await s.harness.run(text.trim(), { onEvent: emit });
      emit({ type: "done", reply });
    } catch (err) {
      emit({ type: "error", message: err.message });
      emit({ type: "done", reply: null });
    } finally {
      s.busy = false;
      res.end();
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    const m = /^\/api\/proposals\/([A-Za-z0-9-]+)\/(approve|reject)$/.exec(p);
    try {
      if (req.method === "GET" && (p === "/" || p === "/index.html")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(readFileSync(path.join(ROOT, "public", "index.html")));
      }
      if (req.method === "GET" && p === "/progress.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(readFileSync(path.join(ROOT, "progress.html")));
      }
      if (req.method === "GET" && p === "/api/state") return json(res, 200, service.state());
      if (req.method === "GET" && p === "/api/vendors") return json(res, 200, service.listVendors(Object.fromEntries(url.searchParams)));
      if (req.method === "POST" && p === "/api/check") return result(res, service.checkBudget(await body(req)));
      if (req.method === "POST" && p === "/api/proposals") return result(res, service.addExpense(await body(req), { source: "ui" }), 201);
      if (req.method === "POST" && m) {
        const { approved_by } = await body(req);
        return result(res, m[2] === "approve" ? service.approve(m[1], { approved_by: approved_by || "ui user" }) : service.reject(m[1]));
      }
      if (req.method === "POST" && p === "/api/demo/reset") {
        sessions.clear();
        return json(res, 200, service.resetDemo());
      }
      if (req.method === "GET" && p === "/api/agent") {
        const cfg = llmConfig();
        let ready = false, model = null;
        try {
          const a = await Promise.race([getAgent(), new Promise((_, rej) => setTimeout(() => rej(new Error("starting")), 8000))]);
          ready = true;
          model = a.model;
        } catch (err) {
          agentError = err.message;
        }
        return json(res, 200, { ready, model, base_url: cfg.baseUrl, error: ready ? null : agentError });
      }
      if (req.method === "POST" && p === "/api/chat") return await chat(req, res);
      if (req.method === "POST" && p === "/api/chat/reset") {
        const { session: sid } = await body(req);
        sessions.delete(sid);
        return json(res, 200, { ok: true });
      }
      json(res, 404, { error: "Not found" });
    } catch (err) {
      if (!res.headersSent) json(res, 500, { error: err.message });
      else res.end();
    }
  });

  server.closeAll = async () => {
    server.close();
    try {
      (await agentPromise)?.mcp.close();
    } catch {
      /* agent never started */
    }
  };
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || "127.0.0.1";
  const server = createApp();
  server.listen(PORT, HOST, () => {
    const t = service.state().status;
    console.log(`ClubOps on http://localhost:${PORT}  ·  cap ${t.budget_cap} BDT, remaining ${t.remaining} BDT  ·  LLM ${llmConfig().baseUrl}`);
  });
  const stop = () => server.closeAll().then(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
