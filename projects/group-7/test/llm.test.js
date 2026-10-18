// The model-independent LLM client against a fake OpenAI-compatible server
// (shaped like Ollama's /v1 plus its native /api/tags and /api/show).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { llmConfig, detectModel, chat } from "../src/agent/llm.js";

const seen = [];
const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    const body = b ? JSON.parse(b) : null;
    seen.push({ url: req.url, auth: req.headers.authorization, body });
    const send = (o) => res.end(JSON.stringify(o));
    if (req.url === "/api/tags") return send({ models: [{ name: "nomic-embed-text" }, { name: "gemma:2b" }, { name: "llama3.1:8b" }] });
    if (req.url === "/api/show") return send({ capabilities: body.model === "llama3.1:8b" ? ["completion", "tools"] : ["completion"] });
    if (req.url === "/v1/chat/completions") return send({ choices: [{ message: { role: "assistant", content: "pong" } }] });
    res.statusCode = 404;
    res.end("{}");
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/v1`;
after(() => server.close());

test("auto-detects an installed Ollama model with tool support", async () => {
  const cfg = { baseUrl: base, apiKey: "ollama", model: "", isOllama: true };
  assert.equal(await detectModel(cfg), "llama3.1:8b");
  assert.equal(await detectModel({ ...cfg, model: "qwen2.5:7b" }), "qwen2.5:7b");
  await assert.rejects(detectModel({ ...cfg, isOllama: false }), /Set LLM_MODEL/);
});

test("sends an OpenAI-format request with the key", async () => {
  const cfg = { baseUrl: base, apiKey: "sk-test", model: "m", isOllama: false };
  const msg = await chat({ model: "m", messages: [{ role: "user", content: "ping" }], tools: [{ type: "function", function: { name: "x", parameters: {} } }], cfg });
  assert.equal(msg.content, "pong");
  const req = seen.at(-1);
  assert.equal(req.auth, "Bearer sk-test");
  assert.equal(req.body.model, "m");
  assert.equal(req.body.tool_choice, "auto");
  assert.equal(req.body.stream, false);
});

test("reads LLM_* from the environment; trailing slashes are fine (Gemini URL)", () => {
  process.env.LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
  process.env.LLM_MODEL = "gemini-2.5-flash";
  const c = llmConfig();
  assert.equal(c.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(c.isOllama, false);
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_MODEL;
  assert.equal(llmConfig().baseUrl, "http://localhost:11434/v1");
  assert.equal(llmConfig().isOllama, true);
});

test("clear error when the LLM is down", async () => {
  await assert.rejects(chat({ model: "m", messages: [], cfg: { baseUrl: "http://127.0.0.1:1/v1", apiKey: "" } }), /Can't reach the LLM/);
});
