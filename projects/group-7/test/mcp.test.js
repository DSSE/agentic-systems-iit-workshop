// The MCP server over real stdio: what Claude Code, Codex, Cursor or our agent see.

import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { McpClient } from "../src/mcp/client.js";
import { useTempData, REMAINING } from "./helpers.js";

const db = useTempData();
const mcp = await new McpClient({ clientName: "test-client" }).connect();
after(() => mcp.close());
beforeEach(() => db.reset());

test("exactly the three tools, and no approve tool", () => {
  assert.deepEqual(mcp.tools.map((t) => t.name), ["list_vendors", "check_budget", "add_expense"]);
  assert.equal(mcp.serverInfo.serverInfo.name, "clubops");
  assert.equal(mcp.tools.find((t) => t.name === "add_expense").annotations.readOnlyHint, false);
});

test("add_expense via MCP only creates a proposal, tagged with the client", async () => {
  const r = await mcp.callTool("add_expense", { vendor_id: "V-SPK", quantity: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.proposal.status, "pending");
  assert.equal(r.proposal.source, "mcp:test-client");
  assert.equal(db.read().expenses.length, 2);
  assert.match(r.message, /NOT saved/);
});

test("cap + 1 via MCP fails with the rule code", async () => {
  assert.equal((await mcp.callTool("add_expense", { vendor_id: "V-MSC", amount: REMAINING })).ok, true);
  const r = await mcp.callTool("add_expense", { vendor_id: "V-MSC", amount: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "BUDGET_CAP_EXCEEDED");
  const raw = await mcp.request("tools/call", { name: "add_expense", arguments: { vendor_id: "V-MSC", amount: 1 } });
  assert.equal(raw.isError, true);
});

test("list_vendors hides the injected instruction (case 5)", async () => {
  const r = await mcp.callTool("list_vendors", { category: "food" });
  const royal = r.vendors.find((v) => v.id === "V-CAT");
  assert.equal(royal.injection_flagged, true);
  assert.doesNotMatch(JSON.stringify(r), /treasurer|50,000/i);
  assert.match(royal.terms, /Minimum 20 people/, "legit terms kept");
});

test("check_budget with no args returns status and event", async () => {
  const r = await mcp.callTool("check_budget", {});
  assert.equal(r.status.remaining, REMAINING);
  assert.equal(r.event.expected_attendance, 60);
});

test("protocol errors", async () => {
  await assert.rejects(mcp.request("tools/call", { name: "approve_expense", arguments: {} }), /Unknown tool/);
  await assert.rejects(mcp.request("resources/list", {}), /Method not found/);
  assert.deepEqual(await mcp.request("ping", {}), {});
});
