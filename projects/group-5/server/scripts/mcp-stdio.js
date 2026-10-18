// A local coding-agent bridge. Only JSON-RPC is written to stdout.
// It connects to the running API rather than opening a second data-file writer.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { connectRemote } from "./connect.js";

try {
  const remote = await connectRemote({ name: "campusdesk-stdio-bridge" });
  const server = new Server({ name: "campusdesk-bridge", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => remote.client.listTools());
  server.setRequestHandler(CallToolRequestSchema, (request) => remote.client.callTool(request.params));
  let stopping = false;
  const shutdown = async () => { if (stopping) return; stopping = true; await remote.close(); await server.close(); process.exit(0); };
  process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
  process.stdin.on("end", shutdown);
  await server.connect(new StdioServerTransport());
} catch (error) { console.error("CampusDesk MCP:", error.message); process.exitCode = 1; }
