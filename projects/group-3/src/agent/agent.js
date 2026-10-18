// The agent loop: context -> model picks a tool -> MCP runs it -> result goes back -> repeat -> final answer.
// The agent can only use the MCP tools, so it can neither approve nor bypass the budget rule.
import { PROMPTS, DEFAULT_PROMPT } from './prompts.js';
import { toOpenAITools } from './mcp-client.js';

const MAX_STEPS = 8; // guardrail: a clean stop beats an endless loop

export async function runAgent({ llm, mcp, history = [], message, promptVersion = process.env.PROMPT_VERSION || DEFAULT_PROMPT }) {
  const system = PROMPTS[promptVersion];
  if (!system) throw new Error(`Unknown prompt version: ${promptVersion}`);
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: message }];
  const tools = toOpenAITools(mcp.tools);
  const events = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await llm.chat({ messages, tools });
    if (!reply.tool_calls?.length) return { reply: reply.content, events, promptVersion };
    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.tool_calls });
    for (const call of reply.tool_calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* bad JSON from the model: tool will reject it */ }
      const result = await mcp.call(call.function.name, args);
      events.push({ tool: call.function.name, args, result: safeJson(result) });
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }
  return { reply: 'I stopped after too many steps. Nothing was saved.', events, promptVersion };
}

const safeJson = (s) => { try { return JSON.parse(s); } catch { return s; } };
