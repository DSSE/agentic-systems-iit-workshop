import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { requireRole } from "./auth.js";
import { BookingError, CODES } from "./domain/errors.js";
import { listRoomsTool, checkAvailabilityTool, createBookingTool } from "./service.js";

const slotSchema = {
  room_id: z.string().min(1).max(100),
  start_at: z.string().max(60),
  end_at: z.string().max(60),
  group_size: z.number().int().positive(),
};
const result = (data, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(data) }], isError });

export function createMcpServer(user, humanReview = null) {
  requireRole(user);
  const server = new McpServer({ name: "campusdesk", version: "1.0.0" });
  function register(name, description, inputSchema, handler, readOnly = true) {
    server.registerTool(name, { description, inputSchema,
      annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false } }, async (input) => {
      try { return result(await handler(input)); }
      catch (error) {
        if (!(error instanceof BookingError)) throw error;
        return result({ error: error.toJSON() }, true);
      }
    });
  }
  register("list_rooms", "List lab IDs, names and capacities. Descriptive room notes are excluded from model context.",
    { group_size: z.number().int().positive().optional() }, async (input) => ({
      rooms: (await listRoomsTool(input)).map(({ id, name, capacity }) => ({ id, name, capacity })),
    }));
  register("check_availability", "Validate an exact slot. Returns a student-bound preview, not a reservation. Maximum 180 minutes; clarify missing times first.",
    slotSchema, async (input) => {
      const proposal = await checkAvailabilityTool(input, user);
      const { id, name, capacity } = proposal.room;
      return { proposal: { ...proposal, room: { id, name, capacity } } };
    });
  register("create_booking", "Requires independent human staff approval in the staff workspace. An agent cannot supply approval. Only a server-bound human review can create a booking; send students to the request form and staff to their review panel.",
    { ...slotSchema, request_id: z.string().max(100).optional() },
    // No model input can set approved=true. This closure is supplied only by
    // the staff review API action, never from JSON-RPC input or chat context.
    (input) => createBookingTool(input, { reviewer: user, request_id: input.request_id,
      approved: Boolean(humanReview && humanReview.request_id === input.request_id), note: humanReview?.note }), false);
  return server;
}

export async function handleMcp(req, res) {
  requireRole(req.user);
  const server = createMcpServer(req.user);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

// UI chat also uses an actual MCP client, with a transport pair bound directly
// to the authenticated principal. No user-controlled URL or duplicate rules.
export async function connectLocalMcp(user, name = "campusdesk-chat", humanReview = null) {
  const server = createMcpServer(user, humanReview);
  const client = new Client({ name, version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

export function unpackToolResult(response) {
  try { return JSON.parse(response.content.find((block) => block.type === "text").text); }
  catch { throw new BookingError(CODES.INVALID_REQUEST, "The tool returned an invalid response."); }
}
