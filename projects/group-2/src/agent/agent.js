// Chat agent: any OpenAI-compatible LLM + the SprintBoard MCP tools.
// It can propose (assign_task) but never approve; approve is not an MCP tool.
import { readFileSync } from 'node:fs';

export const loadPrompt = (version = process.env.PROMPT_VERSION || 'v1') =>
  readFileSync(new URL(`./prompts/${version}.md`, import.meta.url), 'utf8');

const MAX_STEPS = 8;

const toOpenAiTools = (mcpTools) =>
  mcpTools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

// history: [{ role: 'user' | 'assistant', content }]. Returns { reply, proposals, toolCalls }.
export async function runAgent({ history, llm, mcp, system = loadPrompt() }) {
  const tools = toOpenAiTools(await mcp.listTools());
  const messages = [{ role: 'system', content: system }, ...history];
  const proposals = [];
  const toolCalls = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await llm(messages, tools);
    if (!msg.tool_calls?.length) {
      return { reply: msg.content ?? '', proposals, toolCalls };
    }
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      const name = call.function.name;
      const args = parseArgs(call.function.arguments);
      let result;
      try {
        result = await mcp.callTool(name, args);
      } catch (err) {
        result = { ok: false, code: 'TOOL_ERROR', details: { message: err.message } };
      }
      toolCalls.push({ name, args, result });
      if (name === 'assign_task' && result.ok) proposals.push(result.proposal);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: 'I stopped after too many tool steps. Please rephrase the request.', proposals, toolCalls };
}
