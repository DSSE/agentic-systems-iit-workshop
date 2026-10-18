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
├── evals/                    # Phase 6
└── .claude/                  # settings, hooks, skills
```

## Open questions
- Phase 4: MCP and the web server are separate processes, so in-memory proposals made via
  MCP aren't visible to the UI. Options: MCP calls the HTTP API, or proposals go to a
  separate `proposals.json`. Decide before Phase 4.
