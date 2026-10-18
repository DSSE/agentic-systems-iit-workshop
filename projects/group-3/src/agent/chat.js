// Used by POST /api/chat: one MCP connection per message, then close.
import { createLLM } from './llm.js';
import { connectMcp } from './mcp-client.js';
import { runAgent } from './agent.js';

export async function chatOnce(message, history = []) {
  const llm = createLLM();
  const mcp = await connectMcp();
  try {
    const clean = history.filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string');
    return { ...(await runAgent({ llm, mcp, history: clean, message })), model: llm.name };
  } finally {
    await mcp.close();
  }
}
