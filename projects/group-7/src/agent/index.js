// Start-up shared by the terminal agent, the UI chat and the evals.

import { McpClient } from "../mcp/client.js";
import { Harness } from "./harness.js";
import { detectModel, llmConfig, loadEnv } from "./llm.js";

export async function createAgent({ clientName = "clubops-agent", promptVersion } = {}) {
  loadEnv();
  const mcp = await new McpClient({ clientName }).connect();
  try {
    const model = await detectModel(llmConfig());
    return { mcp, model, harness: new Harness({ mcp, model, promptVersion }) };
  } catch (err) {
    mcp.close();
    throw err;
  }
}
