// Model-independent LLM client: any OpenAI-compatible /chat/completions API.
// Set in .env:
//   LLM_BASE_URL  default http://localhost:11434/v1 (Ollama)
//   LLM_API_KEY   not needed for Ollama
//   LLM_MODEL     empty + Ollama = auto-pick an installed model with tool support
// Works with Ollama, Gemini, Groq, OpenRouter, OpenAI and others.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../domain/store.js";

/** Minimal .env loader (KEY=value). Real environment variables win. */
export function loadEnv(file = path.join(ROOT, ".env")) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function llmConfig() {
  const baseUrl = (process.env.LLM_BASE_URL || "http://localhost:11434/v1").trim().replace(/\/+$/, "");
  return {
    baseUrl,
    apiKey: process.env.LLM_API_KEY || "ollama",
    model: (process.env.LLM_MODEL || "").trim(),
    isOllama: /:11434(\/|$)/.test(baseUrl) || /ollama/i.test(baseUrl),
  };
}

async function http(url, { body, apiKey, timeoutMs = 300000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`LLM ${res.status} from ${new URL(url).pathname}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`LLM request timed out after ${timeoutMs / 1000}s`);
    if (/fetch failed|ECONNREFUSED/.test(err.message + (err.cause?.code || ""))) {
      throw new Error(`Can't reach the LLM at ${new URL(url).origin}. For Ollama, start it with: ollama serve`);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

const PREFERRED = ["qwen3", "qwen2.5", "llama3.1", "llama3.2", "mistral-nemo", "mistral", "gpt-oss", "granite3", "command-r", "llama3.3"];

/** LLM_MODEL if set; for Ollama, the best installed model that supports tools. */
export async function detectModel(cfg = llmConfig()) {
  if (cfg.model) return cfg.model;
  if (!cfg.isOllama) throw new Error("Set LLM_MODEL in .env (needed for every provider except a local Ollama).");
  const native = cfg.baseUrl.replace(/\/v1$/, "");
  const { models = [] } = await http(`${native}/api/tags`, { timeoutMs: 5000 });
  const names = models.map((m) => m.name).filter((n) => !/embed/i.test(n));
  if (!names.length) throw new Error("No Ollama models installed. Pull one, e.g.: ollama pull qwen2.5:7b");
  const rank = (n) => ((i) => (i === -1 ? 99 : i))(PREFERRED.findIndex((p) => n.startsWith(p)));
  for (const name of names.sort((a, b) => rank(a) - rank(b))) {
    try {
      const info = await http(`${native}/api/show`, { body: { model: name }, timeoutMs: 10000 });
      if ((info.capabilities || []).includes("tools") || /\.Tools/.test(info.template || "")) return name;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(`None of your Ollama models support tool calling (${names.join(", ")}). Try: ollama pull qwen2.5:7b`);
}

/** One chat turn. Returns the OpenAI-format assistant message. */
export async function chat({ model, messages, tools, cfg = llmConfig() }) {
  const res = await http(`${cfg.baseUrl}/chat/completions`, {
    apiKey: cfg.apiKey,
    body: { model, messages, tools, tool_choice: tools?.length ? "auto" : undefined, temperature: 0.2, stream: false },
  });
  const msg = res.choices?.[0]?.message;
  if (!msg) throw new Error(`LLM returned no message: ${JSON.stringify(res).slice(0, 200)}`);
  return msg;
}

/** MCP tools -> OpenAI "tools". */
export const toOpenAITools = (mcpTools) =>
  mcpTools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema || { type: "object", properties: {} } },
  }));
