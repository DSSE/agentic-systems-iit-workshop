# Connecting external agents to LabLend

Start the app from `projects/group-8/` with `npm start` (`npm.cmd start` in PowerShell). It serves the UI and MCP endpoint on the same loopback port, so every client sees the same stock and pending proposals.

## MCP transport

The implementation targets the MCP `2025-11-25` lifecycle and tool specification, also negotiating `2025-06-18` and `2025-03-26`. It exposes only `list_equipment`, `check_stock`, and `create_loan`.

The HTTP endpoint is `http://localhost:3000/mcp`. It uses Streamable HTTP with JSON responses; there is no SSE notification stream (GET returns 405). Clients initialize, retain the `Mcp-Session-Id` header, send `notifications/initialized`, then list/call tools. POST Accept must include both `application/json` and `text/event-stream`. Subsequent requests carry the negotiated `MCP-Protocol-Version` and session ID. DELETE ends the MCP session. The server validates Host and Origin and binds only to loopback. Workshop student IDs are self-declared; this is not a production authenticated MCP deployment.

For stdio clients, launch `node src/mcp.js` using an absolute script path. The bridge forwards JSON-RPC to the running app, preserving server-held proposals and the approval boundary. It never launches a separate inventory store. Do not use `npm run mcp` as the configured stdio command because npm may print script banners to stdout; use `node` directly. Application logs stay off stdio protocol output.

## Two external agent configurations

[Claude Code](https://code.claude.com/docs/en/mcp) and [Gemini CLI](https://geminicli.com/docs/tools/mcp-server/) support stdio server definitions in their respective MCP settings. The following paths match this workshop checkout; update them if the repository moves. Configure each client separately using its own MCP settings interface rather than overwriting an existing configuration file.

```json
{
  "mcpServers": {
    "lablend": {
      "command": "node",
      "args": ["D:/agentic-systems-iit-workshop/projects/group-8/src/mcp.js"],
      "env": { "LABLEND_URL": "http://localhost:3000" }
    }
  }
}
```

`LABLEND_URL` accepts only a local HTTP address. Set it to the app's port if `PORT` changes. Restart clients after changing configuration. The LabLend web chat's model variables are separate from the external coding agent's own provider login.

## Repeatable demonstration for each client

1. Confirm `lablend` connects and lists exactly the three declared tools. Record the client name, version, date, and outcome in `progress.html`.
2. Ask for available equipment. Use a fresh demo student ID and request two Arduino kits for seven days with exact dates starting today or later.
3. Confirm the agent calls `check_stock`. Its response contains a proposal and `review_url`, with no disk write or stock reservation.
4. Open the review URL in a browser. Check the student ID, choose **Review linked proposal**, inspect equipment and exact dates, then click **Approve loan**. Neither opening the URL nor reviewing the proposal saves it.
5. Confirm the UI lists exactly one new loan and shelf availability drops for overlapping dates. Repeat a third-item or eight-day request and verify refusal.
6. Try `create_loan` directly without an approval token: it must return `APPROVAL_REQUIRED`. Agents cannot call the approval helper or the browser approval route through MCP.

A review link transfers the proposal to the matching browser student/session for human approval. Tokens never go to the external agent. After successful approval the agent can re-list availability; it must not claim success based only on its earlier stock check. Proposals expire after ten minutes or an app restart. Review links are local capabilities; do not share them publicly.

## Evidence and outstanding checks

`npm run test:mcp` verifies a direct HTTP client and an independent stdio subprocess client: lifecycle, discovery, schema validation, proposal generation, direct-create denial, and human UI handoff. These are protocol integration tests, **not two live coding-agent demonstrations**. Claude Code/Gemini CLI and a live model have not been connected in this environment; complete and record those demonstrations after configuring clients and model access.

Protocol references: [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), and [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
