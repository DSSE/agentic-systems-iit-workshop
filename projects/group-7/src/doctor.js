#!/usr/bin/env node
// `npm run doctor`: checks Node, data.json, the MCP server, the LLM and one real tool call.

import { loadEnv, llmConfig, detectModel, chat, toOpenAITools } from "./agent/llm.js";
import { McpClient } from "./mcp/client.js";
import * as service from "./service.js";

loadEnv();
const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✘\x1b[0m ${m}`);
let failed = false;
const cfg = llmConfig();

const [major] = process.versions.node.split(".").map(Number);
major >= 18 ? ok(`Node ${process.versions.node}`) : (bad(`Node ${process.versions.node}: need 18+`), (failed = true));

try {
  const s = service.checkBudget();
  ok(`data.json: ${s.event.name}, cap ${s.status.budget_cap} BDT, remaining ${s.status.remaining} BDT`);
} catch (err) {
  bad(`data.json: ${err.message}`);
  failed = true;
}

let mcp;
try {
  mcp = await new McpClient({ clientName: "doctor" }).connect();
  ok(`MCP server tools: ${mcp.tools.map((t) => t.name).join(", ")}`);
} catch (err) {
  bad(`MCP server: ${err.message}`);
  failed = true;
}

let model;
try {
  model = await detectModel(cfg);
  ok(`LLM ${cfg.baseUrl} · model ${model}${cfg.model ? " (LLM_MODEL)" : " (auto-detected)"}`);
} catch (err) {
  bad(`LLM ${cfg.baseUrl}: ${err.message}`);
  failed = true;
}

if (model && mcp) {
  try {
    const t0 = Date.now();
    const msg = await chat({
      model,
      cfg,
      messages: [{ role: "user", content: "Which food vendors are there? Use the tool." }],
      tools: toOpenAITools(mcp.tools),
    });
    const called = msg.tool_calls?.map((c) => c.function.name).join(", ");
    called
      ? ok(`Tool calling works: model called ${called} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
      : (bad("The model answered without calling a tool. Try a stronger model, e.g. LLM_MODEL=qwen2.5:7b"), (failed = true));
  } catch (err) {
    bad(`Chat test: ${err.message}`);
    failed = true;
  }
}

mcp?.close();
console.log(failed ? "\nFix the ✘ lines, then run again." : "\nAll good. npm start (app + chat) · npm run agent (terminal) · npm run eval");
process.exit(failed ? 1 : 0);
