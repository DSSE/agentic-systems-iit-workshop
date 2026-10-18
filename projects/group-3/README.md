# ClubOps (Group 3)

Plans a club event's expenses. **Hard rule: total spending never goes over the budget cap.**
Nothing is saved until a person presses Approve.

Group: 3

## Team members and contact numbers
- Md. Mostafizur Rahaman — `+8801517809545`
- Salsabila Zaman — `1673841610`
- A. M. ZAYED ABDULLAH — `+8801671050992`
- Mrinmoy Poit — `01751285949`

## Run it
```bash
npm install
cp .env.example .env      # LLM_PROVIDER=mock works offline; see .env.example for a real model
npm start                 # http://localhost:3000
npm run verify            # tests + rule-location check
npm run evals             # five cases (use a real model to compare prompts)
npm run reset             # restore demo data
```

## What is in here
| Part | Where |
|---|---|
| The hard rule (one home) | `src/domain/budget.js` |
| Injection guardrail | `src/domain/guardrails.js` |
| Data access, proposals, approve | `src/domain/store.js` |
| API and UI | `src/api/`, `public/` |
| MCP server (3 tools, no approve tool) | `src/mcp/server.js` |
| Agent (any OpenAI-compatible model) | `src/agent/` |
| Spec | `specs/agent.md` |
| Tests and evals | `tests/`, `evals/` |
| Harness for coding agents | `CLAUDE.md`, `AGENTS.md`, `.claude/`, `feature_list.json` |
| Progress log | `progress.html` |

## Connect a coding agent to the MCP server
Run from this folder.
- Claude Code: `claude` (picks up `.mcp.json`), or `claude mcp add clubops -- node "$(pwd)/src/mcp/server.js"`
- Gemini CLI: `gemini` (picks up `.gemini/settings.json`), then `/mcp`
- Codex: `codex mcp add clubops -- node "$(pwd)/src/mcp/server.js"`
- Cursor: uses `.cursor/mcp.json`

Proposals made by any agent appear in the UI under "Waiting for your approval".
