// Minimal MCP client over stdio: spawns an MCP server, does the handshake,
// lists and calls tools. Used by our agent harness.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "server.js");

export class McpClient {
  constructor({ command = process.execPath, args = [SERVER], env = process.env, clientName = "clubops-agent", timeoutMs = 15000 } = {}) {
    Object.assign(this, { command, args, env, clientName, timeoutMs });
    this.nextId = 1;
    this.pending = new Map();
    this.tools = [];
  }

  async connect() {
    this.proc = spawn(this.command, this.args, { env: { ...this.env, CLUBOPS_CLIENT: this.clientName }, stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stderr.on("data", (d) => process.env.CLUBOPS_DEBUG && process.stderr.write(d));
    this.proc.on("exit", (code) => {
      for (const p of this.pending.values()) p.reject(new Error(`MCP server exited (code ${code})`));
      this.pending.clear();
    });
    createInterface({ input: this.proc.stdout }).on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      msg.error ? p.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`)) : p.resolve(msg.result);
    });
    this.serverInfo = await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: this.clientName, version: "2.0.0" },
    });
    this.notify("notifications/initialized");
    this.tools = (await this.request("tools/list", {})).tools;
    return this;
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timed out`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  notify(method, params) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }) + "\n");
  }

  async callTool(name, args) {
    const res = await this.request("tools/call", { name, arguments: args ?? {} });
    if (res.structuredContent) return res.structuredContent;
    const text = (res.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    try {
      return JSON.parse(text);
    } catch {
      return { ok: !res.isError, text };
    }
  }

  close() {
    this.proc?.stdin.end();
    this.proc?.kill();
  }
}
