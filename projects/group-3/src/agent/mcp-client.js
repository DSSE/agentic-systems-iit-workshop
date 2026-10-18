// Connects the agent to the ClubOps MCP server over stdio.
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const serverPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'mcp', 'server.js');

export async function connectMcp(env = process.env) {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [serverPath],
    env: Object.fromEntries(Object.entries({ ...process.env, ...env }).filter(([, v]) => v !== undefined)),
  });
  const client = new Client({ name: 'clubops-agent', version: '1.0.0' });
  await client.connect(transport);
  const { tools } = await client.listTools();
  return {
    tools,
    async call(name, args) {
      const res = await client.callTool({ name, arguments: args });
      return res.content.map((c) => c.text ?? '').join('\n');
    },
    close: () => client.close(),
  };
}

export const toOpenAITools = (tools) => tools.map((t) => ({
  type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema },
}));
