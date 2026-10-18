# SprintBoard MCP server setup plan

Date: 2026-10-18
Status: MCP implementation passed independent evaluator review; the manual browser/two-client demo remains pending.

## Implementation status (2026-10-18)

- The protected backend proposal/approval flow, stdio MCP package, Claude Code
  `.mcp.json`, Gemini CLI `.gemini/settings.json`, and local run instructions
  are now present. The user's instruction to implement this plan authorized
  its MCP dependencies. Parallel chat/UI work is maintained separately.
- Independent evaluator review passed: backend TypeScript build and 41 tests,
  frontend production build, and MCP TypeScript build and 26 real stdio protocol
  tests. The generator also verified a clean locked install (62 packages,
  0 vulnerabilities). Tests used temporary boards; the real board hash stayed
  unchanged. This closes the implemented server task, not the full workshop
  Development Phase 4 or Milestone 2.
- Safe CLI discovery was run from `projects/group-06`: Claude Code 2.1.175
  reports `sprintboard` as **Pending approval**; Gemini CLI 0.46.0 reports the
  folder as **untrusted** and `sprintboard` as **Disabled**. Both discovery
  commands exited successfully, but neither result establishes a connected
  live host. Review project trust in each client before the demo.
- Real browser session/approval and live model calls through both clients
  remain to be demonstrated. No model API key is required by the MCP server;
  each external client handles its own model access.

The remaining sections preserve the original design and pre-implementation
findings as a record. Their descriptions of missing files or proposed changes
refer to the planning baseline; use the status above and `harness/state.md`
for current implementation and verification progress.

## Recommendation

Build a small TypeScript MCP server using **stdio**. Each AI client launches its own adapter, and each adapter calls the **same running SprintBoard HTTP API**. Keep the backend as the only process that reads and writes the board.

Expose exactly the workshop's three tools: `list_tasks`, `check_capacity`, and `assign_task`. For MCP, `assign_task` requests an assignment and returns a pending proposal; the person approves it in the existing SprintBoard UI. Only the backend's protected approval path commits it.

This is the best fit for the current local workshop app: it reuses the existing backend, supports two different AI clients, and avoids introducing multiple JSON-file writers. It does require closing the existing approval gap before enabling assignment proposals end to end.

```text
Claude Code -> stdio adapter --+
                              +-> one SprintBoard API -> shared domain rule -> data.json
Gemini CLI -> stdio adapter ---+            ^
                                           |
                                SprintBoard UI: human Approve
```

The HTTP connection above is ordinary REST between the adapter and the application. MCP itself uses stdio; this plan does not add a remote MCP endpoint.

## Phase 0: Findings and documentation discovery

### What already exists

- [harness/state.md](../harness/state.md) records Milestone 1 / Phase 3 complete, with MCP as the next development phase.
- [backend/src/routes/index.ts](../backend/src/routes/index.ts) exposes `GET /api/tasks`, `POST /api/check-capacity`, and `POST /api/assign-task`.
- [backend/src/domain/capacity.ts](../backend/src/domain/capacity.ts) owns the 8-point rule. [assignTask.ts](../backend/src/tools/assignTask.ts) reads current state and rechecks that rule immediately before writing.
- [backend/src/data/store.ts](../backend/src/data/store.ts) uses synchronous whole-file reads and writes. Preserve one backend process; importing this store into separately spawned MCP processes would introduce competing writers.
- [frontend/app/page.tsx](../frontend/app/page.tsx) calls the assignment endpoint from the Approve button. However, the endpoint accepts plain task/member IDs and writes without verifying approval. This is a backend approval gap, even though the intended UI sequence works.
- [specs/agent.md](agent.md) still contains generic `create` and `"y"` wording. Update it during implementation to describe the real approval flow and pending result.
- Existing tests use temporary boards. Two rejection tests named "9 points" actually exercise 10 and 11; the domain test does exercise exactly 9. Add accurate integration coverage rather than relying on test names.

These are source findings. The previous evaluator's passing checks are recorded in the repository; they were not rerun for this plan. Backend dependencies are not installed in this checkout, so fresh installation and baseline verification remain implementation prerequisites.

### Documented APIs to use

For new implementation, follow the stable TypeScript SDK v2 documentation. Its package manifest currently identifies `@modelcontextprotocol/server` 2.3.1 and Node >=20. Use a small ESM adapter package following the official example; leave the backend's module configuration alone. Verify package versions, peer dependencies, and the team's Node runtime before installation, then commit the lockfile. Sources: [SDK packages](https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages.html), [server package manifest](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/package.json).

- `McpServer` from `@modelcontextprotocol/server` and `registerTool(name, config, handler)` for tool definitions.
- `serveStdio(createServer)` from `@modelcontextprotocol/server/stdio` for the client-owned subprocess.
- Zod v4 object schemas for inputs and outputs, following the [first-server example](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server.html) and [structured tool results](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html).
- `Client`, `StdioClientTransport`, `connect`, `listTools`, `callTool`, and `close` for protocol tests, following [the SDK's stdio testing pattern](https://ts.sdk.modelcontextprotocol.io/v2/testing.html#cover-stdio-by-spawning-the-process).

Keep `serveStdio`'s default legacy-client support. Do not hand-write protocol negotiation or combine v1 SDK imports with v2 examples. See [legacy-client support](https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html#choose-the-same-posture-on-stdio). Real compatibility with both selected clients must still be demonstrated.

## Phase 1: Make approval an application guarantee

### Implement

1. Extend [agent.md](agent.md) with the proposal/approval contract before writing the adapter. Keep the 8-point rule and partial-success policy unchanged.
2. Add a small backend proposal service. Store pending proposals in memory, outside `data.json`; a restart invalidates them. Each opaque proposal ID binds one task, one member, and the task details shown for approval.
3. Add proposed routes:
   - `POST /api/approval-session`: exchange the one-time human setup code for the local approver session.
   - `POST /api/proposals`: validate IDs and current capacity, then return a pending proposal without assigning anything.
   - `GET /api/proposals`: let the UI display pending proposals and current capacity.
   - `POST /api/proposals/:id/approve`: commit only through the authorized human approval path.
   - `POST /api/proposals/:id/reject`: discard the proposal without changing the board.
4. Use one local approver session, not an account system. A random one-time setup code shown in the backend terminal establishes an opaque HttpOnly, SameSite cookie in the browser. Require the session and CSRF protection for approval/rejection. Bind the API to `127.0.0.1`; use `http://127.0.0.1:3000` for the browser UI and `http://127.0.0.1:4000/api` for its API calls. Set `NEXT_PUBLIC_API_URL` accordingly, add `credentials: "include"` to session/approval browser fetches, and replace unrestricted `cors()` with the exact UI origin and `credentials: true`. Keep setup codes and session credentials out of MCP configuration, tool inputs, tool results, URLs, and logs after setup. Origin headers alone are not approval credentials.
5. Remove the existing bypass: plain `POST /api/assign-task` must no longer commit an arbitrary `{ taskId, memberId }`. Retire that route in favor of the protected proposal flow and update the UI and route tests together.
6. At approval, verify the proposal is pending and unchanged, re-read current board state, and call the existing `assignTask()` commit function. Recheck capacity and task availability even if proposal creation succeeded. If the points shown to the human changed, require a refreshed review before committing. Make proposals single-use; repeated approval must not write again.
7. Make the UI's existing manual assignment action use the same proposal/approval path. For agent proposals, a pending section can use a Refresh button; real-time delivery is unnecessary.

Keep proposal validation, final validation, and mutation in the same backend process. Reuse the existing domain function; keep the final synchronous read/check/write sequence intact. The adapter has no approval capability or approval credential. This design assumes local clients limited to their declared MCP tools; it is not a sandbox against a coding agent separately granted arbitrary shell and filesystem access.

### Verify before proceeding

- Calling proposal creation, declining, or disconnecting leaves `data.json` byte-for-byte unchanged.
- Calling the former direct-write route, sending `approved: true`, or calling approve without the human session cannot commit.
- A human approval commits exactly the displayed task/member pair once.
- A stale, consumed, rejected, or restart-invalidated proposal cannot commit.
- Changed capacity and already-assigned tasks are checked again at approval.
- A real browser can establish and use the approval session across the two ports; requests from an unapproved origin fail. Restarting the backend invalidates approval sessions as well as proposals.

Reference patterns: reuse [assignTask.ts](../backend/src/tools/assignTask.ts) for final domain validation and [route tests](../backend/src/routes/index.test.ts) for isolated HTTP fixtures. The proposal/session design above is a project recommendation, not an MCP feature. The [MCP interaction model](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#user-interaction-model) leaves approval UX to the application; host confirmation prompts do not implement this backend gate.

## Phase 2: Add the smallest MCP package

### Planned files

```text
projects/group-06/
├── mcp-server/
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── .gitignore                  # node_modules/ and dist/
│   └── src/
│       ├── index.ts                # Factory, three registrations, stdio startup
│       ├── api.ts                  # Fixed application routes, timeout, result handling
│       └── integration.test.ts     # Spawn adapter and exercise the MCP boundary
├── .mcp.json                       # Claude Code project configuration
└── .gemini/settings.json           # Second client's project configuration
```

The proposal service, protected approval routes, UI changes, and their tests belong in the existing backend/frontend. These are future implementation files; this plan creates none of them.

### Implement and verify

- Obtain the dependency approval required by [CLAUDE.md](../CLAUDE.md) before installing. Proposed runtime packages: `@modelcontextprotocol/server` and `zod`. Proposed development packages: TypeScript, Node types, Vitest, and `@modelcontextprotocol/client`; match the existing project tooling where compatible.
- Copy the server factory and registration pattern from the [official first-server example](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server.html). Provide `build`, `start`, and `test` scripts; exclude test files from the production TypeScript build. Clients launch compiled JavaScript with `node` directly.
- Configure `SPRINTBOARD_API_URL`, default `http://127.0.0.1:4000/api`. Use fixed route mappings and a bounded fetch timeout, for example five seconds. Tool arguments must never select an arbitrary URL or file path.
- Use built-in `fetch`; no extra HTTP library or LLM dependency is needed. Return a readable tool error when the backend is unavailable; do not fall back to direct file access.
- Send diagnostics to stderr only. Do not start Express, log an npm banner, or install packages on the stdio protocol stream. See [stdio serving and shutdown](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html).
- Verify a clean install and TypeScript build, clean stdout, backend-unavailable behavior, and shutdown when the client closes the connection.

## Phase 3: Register the three tools

Use the [official tool registration and result patterns](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html). Define strict object schemas, nonempty IDs, and finite nonnegative integer story points. Apply matching validation to the backend API so clients cannot bypass input checks by skipping MCP.

- **`list_tasks`**: input `{}`; call `GET /api/tasks`; return current `{ tasks, members }`. It is read-only. Task descriptions remain untrusted data.
- **`check_capacity`**: input `{ memberId, additionalPoints }`; call `POST /api/check-capacity`; return `{ ok, current, projected, max }`. A valid preview with `ok: false` is a successful check reporting insufficient room, not a transport failure.
- **`assign_task`**: input `{ taskId, memberId }`; call `POST /api/proposals`. Explain in the tool description that it requests assignment and does not save it. Return `status: "pending_approval"`, the proposal ID, displayed assignment details, and an approval URL on the fixed local UI origin. Do not return `{ ok: true, task }` as if an assignment was saved. The agent can call `list_tasks` again after the person approves.

Return successful payloads as `structuredContent` plus a text JSON representation, with output schemas matching the actual pending/success shapes. For failed assignment proposals, preserve `rule:max-8-points` and the reason, and mark the tool result `isError: true`. Inspect application payloads as well as HTTP status: existing business refusals can arrive as HTTP 200. Follow the [SDK error pattern](https://ts.sdk.modelcontextprotocol.io/v2/servers/errors.html); let the SDK encode protocol-version envelopes.

Annotate list/check as read-only. Proposal creation changes temporary server state, so do not label it read-only or automatically idempotent. Annotations describe behavior; they do not authorize approval.

### Verify

- Tool discovery lists exactly the three workshop tools with valid schemas.
- Invalid IDs, missing fields, negative/fractional points, and unknown extra fields fail clearly.
- Assignment uses stored task points, never model-supplied task points.
- Calling `assign_task` without first calling `check_capacity` cannot bypass the rule.
- No MCP tool can approve a proposal or directly write the board.

## Phase 4: Connect two AI clients

Start the single backend on `127.0.0.1:4000` and open the UI at `http://127.0.0.1:3000`. Build the adapter once. Each host then starts its own stdio adapter; do not manually start an adapter and expect the hosts to attach to it.

After implementation and approved dependency installation, use this startup order on Windows:

1. In `backend/`, run `npm.cmd ci`, `npm.cmd test`, and `npm.cmd run build`, then leave `npm.cmd start` running in its own terminal.
2. In `frontend/`, run `npm.cmd ci`, set `$env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:4000/api'`, and run `npm.cmd run dev` in a second terminal. Open the UI and establish the human approval session.
3. In `mcp-server/`, run `npm.cmd ci`, `npm.cmd run build`, and `npm.cmd test`. Then launch each AI client from `projects/group-06` with the configuration below.

Do not use `npm ci` in the new adapter until its initial approved install has generated `package-lock.json`.

For Claude Code, create `projects/group-06/.mcp.json` using its [project-scope stdio configuration](https://code.claude.com/docs/en/mcp#project-scope):

```json
{
  "mcpServers": {
    "sprintboard": {
      "type": "stdio",
      "command": "node",
      "args": [
        "F:/Windows/Local_Disk_E/Github_projects/agentic-systems-iit-workshop/projects/group-06/mcp-server/dist/index.js"
      ],
      "env": {
        "SPRINTBOARD_API_URL": "http://127.0.0.1:4000/api"
      }
    }
  }
}
```

This example is for this machine. Each teammate must resolve their own absolute entry path; do not assume the host's working directory. Use an absolute `node.exe` path too if a GUI-launched client cannot resolve Node. Start Claude Code from `projects/group-06`, accept project server trust, and use `/mcp` to check connection and tools. If launching from the repository root, explicitly select the group's configuration instead of assuming nested discovery.

For Gemini CLI, put the same `command`, `args`, and `env` under `mcpServers.sprintboard` in `projects/group-06/.gemini/settings.json`; omit Claude's `type` property and set `trust: false`. Verify project trust and inspect `/mcp`. Follow [Gemini's configuration properties](https://geminicli.com/docs/tools/mcp-server/#configuration-properties). Do not enable blanket auto-approval.

Neither client configuration needs an LLM API key for the MCP server itself. The selected AI clients handle their own model access. The later in-app chat agent is a separate Phase 5 task.

### Verify in each client

- Discover all three tools and list the same board through both clients.
- Ask to assign a named task to a named member; verify a proposal appears and the board stays unchanged until the person approves in the UI.
- Ask for an over-capacity assignment; verify the rule code and unchanged board.
- Ask "Assign the remaining tasks"; require clarification instead of invented task/member choices. Supply a short client instruction to treat backlog text as data and use tools for actual IDs and capacity.
- Open both clients together; verify their adapters still use one backend authority and see each other's approved assignments.

## Phase 5: Independent evaluator gate

The generator submits the work as **Awaiting review**. The [evaluator](../agents/evaluator.md) independently verifies it before changing task status to Done.

1. Run backend tests and builds, adapter tests/build, and the frontend build after its approval changes. Adapt existing route tests to perform real approval; do not remove capacity assertions to accommodate the new gate.
2. Reuse temporary-board and ephemeral-port fixtures from [index.test.ts](../backend/src/routes/index.test.ts). Set `SPRINTBOARD_DATA_PATH` before importing or starting the backend. Spawn the built adapter with the fixture API URL and close both processes afterward. Never run write checks against the real board.
3. Through a real MCP client connection, test valid pending proposal -> human approval -> saved assignment; rejection/no approval -> no board change; exactly **8** accepted; exactly **9** refused using a one-point fixture task after reaching 8; stale and repeated approval; malformed arguments; and backend outage.
4. Race two clients proposing/approving against the same member and verify final capacity stays <=8, no successful update is lost, and duplicate assignment is refused. Keep one backend process throughout.
5. Run the real-client checks in both hosts. Use the injected task description already present in the fixture to confirm the client treats it as data and cannot use it to approve or bypass capacity. A deterministic tool test alone does not establish model resistance; record observed client/model versions. Broad prompt comparisons remain optional advanced work.
6. Record exact commands, outcomes, client/SDK versions, and any remaining failures in `harness/state.md`. Append a Phase 4 entry to `progress.html` only after evaluator approval. Connecting MCP does not by itself complete Milestone 2; the UI chat agent is still required.

## Keep this setup proportionate

- Keep JSON storage for this workshop with one synchronous backend writer. Multiple backend workers, deployment replicas, or asynchronous read/check/write transactions would require a different concurrency design.
- Prefer stdio for the two local clients. Reconsider Streamable HTTP when remote clients or hosted access are actually required; that is a different transport/deployment task.
- Keep one task/member per proposal and the existing explicit partial-success policy. Do not introduce a batch scheduler or all-or-nothing transaction engine.
- Keep the approval session local and limited to one approver; no accounts, roles, OAuth service, or database is needed for this plan.
- Do not add MCP sampling, resources, prompts, autonomous agent orchestration, or browser automation merely to expose these three tools. Use manual UI checks plus focused protocol tests first.

The completion criterion is working evidence: both AI clients discover and use the same three tools, assignments remain pending until a human approves, every commit rechecks the shared rule, and the evaluator reproduces those results.
