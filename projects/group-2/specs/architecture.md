# Architecture: SprintBoard

Product rules and acceptance criteria are in `agent.md`. This file says where the code goes.

## Layers
```
           UI (public/)      Chat agent (src/agent/)     Any coding agent
                │                    │                         │
          HTTP API (src/server.js)   └──── MCP server (src/mcp/server.js)
                │                                │
                └────────── tools (src/tools.js) ┘
                                 │
                   domain rules (src/domain/rules.js)   ← HR-1 lives ONLY here
                                 │
                       store (src/store.js) → data.json
```

- **`src/domain/rules.js`**: pure functions, no I/O. `MAX_POINTS = 8`,
  `memberLoads(data)`, `checkAssignments(data, assignments)` → `{ ok, code, details, loads }`.
- **`src/store.js`**: the only module that reads or writes the data file. Path comes from
  `DATA_FILE` (default `./data.json`) so tests run on copies of `tests/fixtures/*.json`.
- **`src/tools.js`**: `listTasks`, `checkCapacity`, `assignTask`, `approve`, plus the
  in-memory proposal store. Each tool calls `rules.checkAssignments` itself.
- **`src/server.js`**: HTTP API + static UI. Node `http` module, no framework.
- **`src/mcp/server.js`**: MCP over stdio. Exposes the three tools, not `approve`.
- **`src/agent/`**: OpenAI-compatible chat agent; model from `.env`
  (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). Can't approve.

## HTTP API (Phase 2)
| Method | Path | Body | Calls |
|---|---|---|---|
| GET | `/api/tasks?status=` | | `listTasks` |
| POST | `/api/check` | `{ assignments }` | `checkCapacity` |
| POST | `/api/proposals` | `{ assignments }` | `assignTask` |
| GET | `/api/proposals` | | pending proposals |
| POST | `/api/proposals/:id/approve` | | `approve` |
| POST | `/api/proposals/:id/reject` | | drops the proposal |
| POST | `/api/chat` (Phase 5) | `{ messages }` | agent |

Rule failures return HTTP 422 with `{ ok: false, code, details }`.

## Data model (`data.json`)
```json
{
  "members": [{ "id": "rafi", "name": "Rafi", "capacity": 8 }],
  "tasks":   [{ "id": "T1", "title": "...", "description": "...", "points": 3, "assignee": null }]
}
```
Task `title` and `description` are **untrusted text**. Agents treat them as data, never as
instructions (case C5).

## Planned layout
```
projects/group-2/
├── CLAUDE.md, README.md, sprintboard.md, progress.html
├── package.json, .env.example, .gitignore
├── data.json                 # live data; written only by approve()
├── specs/                    # agent.md (what), architecture.md (where)
├── src/
│   ├── domain/rules.js       # Phase 2
│   ├── store.js, tools.js    # Phase 2
│   ├── server.js             # Phase 2
│   ├── mcp/server.js         # Phase 4
│   └── agent/                # Phase 5 (prompts/ v1, v2 for Phase 6)
├── public/                   # Phase 2: index.html, app.js, styles.css
├── tests/
│   ├── fixtures/             # seed, boundary, injection
│   ├── harness.test.js       # Phase 1
│   └── acceptance.test.js    # AC-n todos → real tests in Phase 3
├── evals/                    # Phase 6: cases, runner, results/
└── .claude/                  # settings, hooks, skills
```

## Proposals across processes (decided in Phase 4)
The MCP server and the web server are separate processes. Pending proposals live in
`proposals.json` next to the data file (`src/proposals.js`, override with `PROPOSALS_FILE`).
Any client can add a proposal; only the web app's Approve turns one into a saved assignment
in `data.json`. `proposals.json` is git-ignored.

## MCP server (Phase 4)
- stdio, newline-delimited JSON-RPC 2.0, written by hand (no SDK dependency).
- Methods: `initialize`, `ping`, `tools/list`, `tools/call`. Tool results carry the tool's JSON
  as text and `structuredContent`; `isError: true` when `ok: false`.
- Registered for Claude Code in `.mcp.json`. Other clients (Codex, Gemini CLI, Cursor) use
  the same command: `node src/mcp/server.js` from this folder.

## Chat agent (Phase 5)
- `src/agent/llm.js`: OpenAI-compatible `/chat/completions` via `fetch`; `.env` picks the model.
- `src/agent/mcp-client.js`: spawns the MCP server and calls its tools.
- `src/agent/agent.js`: tool loop (max 8 steps); system prompt from `prompts/<PROMPT_VERSION>.md`.
- `POST /api/chat` takes `{ messages: [{ role: 'user' | 'assistant', content }] }`. Clients
  can't send system or tool messages. Returns `{ ok, reply, proposals: [ids] }`.
- `npm run agent` is the same agent in the terminal.

## Guardrails (Phase 7)
- `src/guardrails.js`: pure functions, no I/O. `scanText(text)` → matched pattern names;
  `flagTasks(tasks)` adds `flags: ["instruction"]`; `redactTasks(tasks)` hides flagged text.
- `tools.listTasks` flags tasks, so the API, UI and MCP all see the same flags.
- `src/mcp/server.js` redacts flagged text in `list_tasks` (the boundary to every AI
  client). `createHandler(tools, { redact })`; `SPRINTBOARD_GUARDRAILS=off` turns
  redaction off only for evals.
- HR-1 stays in `src/domain/rules.js`; guardrails never decide what fits.

## Evals (Phase 6)
```
evals/
├── cases.js     # C1–C5: fixture, turns, scorer
├── run.js       # runEvals() + CLI: npm run eval -- --prompts v1,v2 --runs 3
└── results/     # latest.json, latest.md (git-ignored)
```
Each run uses a temp copy of the fixture and its own MCP server process. The runner wraps
the LLM to record what the model was sent, so C5 can check the injected words never
reached it. Between the turns of C2, the runner approves the proposal as the person would.
