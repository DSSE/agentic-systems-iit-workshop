import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { systemPrompt } from './prompts.js';

const mcpServerPath = join(dirname(fileURLToPath(import.meta.url)), 'mcp-server.js');
const MAX_STEPS = 6;

export class AgentConfigError extends Error {}

// Any model works: this talks to an OpenAI-compatible chat completions API
// configured by LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in .env.
function llmConfig() {
  const { LLM_BASE_URL: baseUrl, LLM_API_KEY: apiKey, LLM_MODEL: model } = process.env;
  if (!baseUrl || !apiKey || !model) {
    throw new AgentConfigError('Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in .env to use the chat agent.');
  }
  return { url: `${baseUrl.replace(/\/$/, '')}/chat/completions`, apiKey, model };
}

async function callModel(messages, tools) {
  const { url, apiKey, model } = llmConfig();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto' }),
  });
  if (!res.ok) throw new Error(`The model API returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).choices[0].message;
}

export function createAgent() {
  let connecting;

  // The agent uses the MCP server like any other client: it never touches the domain directly.
  function connect() {
    connecting ??= (async () => {
      const client = new Client({ name: 'clubops-agent', version: '0.1.0' });
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [mcpServerPath], env: process.env }));
      const { tools } = await client.listTools();
      const llmTools = tools.map((t) => {
        const { $schema, ...parameters } = t.inputSchema ?? { type: 'object', properties: {} };
        return { type: 'function', function: { name: t.name, description: t.description, parameters } };
      });
      return { client, llmTools };
    })().catch((err) => {
      connecting = undefined;
      throw err;
    });
    return connecting;
  }

  // history: [{ role: 'user' | 'assistant', content }]. Returns the reply and the tool calls made.
  async function chat(history) {
    llmConfig(); // fail fast, before starting the MCP server
    const { client, llmTools } = await connect();
    const messages = [{ role: 'system', content: systemPrompt() }, ...history];
    const toolCalls = [];

    for (let step = 0; step < MAX_STEPS; step++) {
      const message = await callModel(messages, llmTools);
      messages.push(message);
      if (!message.tool_calls?.length) return { reply: message.content ?? '', toolCalls };

      for (const call of message.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          // fall through: the tool schema will reject the empty arguments
        }
        const result = await client.callTool({ name: call.function.name, arguments: args });
        const text = result.content?.map((c) => c.text).join('\n') ?? '';
        toolCalls.push({ name: call.function.name, args, isError: Boolean(result.isError), result: text });
        messages.push({ role: 'tool', tool_call_id: call.id, content: text });
      }
    }
    return { reply: 'I could not finish that in a few steps. Please try a simpler request.', toolCalls };
  }

  async function close() {
    if (connecting) (await connecting).client.close();
    connecting = undefined;
  }

  return { chat, close };
}
