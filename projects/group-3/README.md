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
npm run evals             # five scenarios (boundary split into two checks), including an AI judge
npm run reset             # restore demo data
```

The first workspace starts with no event, expenses, or pending proposals. Choose **Create event** in the UI to enter the event name, date, attendee count, and budget cap. Creating a new event over an active workspace asks for confirmation and clears its current expense history.

The chat runs two AI roles over the ClubOps MCP server: an expense planner can use all three MCP tools to create proposals, then a budget reviewer independently checks a fresh budget snapshot through `check_budget`. The reviewer has no approval or expense-writing tool. Set `GEMINI_API_KEY_PLANNER` and optionally `GEMINI_API_KEY_REVIEWER` in the ignored `.env` to give each Gemini role its own key. With no model configured, the app uses its offline mock so chat works without a key; configure `.env` to use another OpenAI-compatible model if preferred.

The eval runner checks all five workshop scenarios; the boundary case has exact-cap and cap-plus-1 variants, for six checks total. Each case receives an AI judge verdict alongside deterministic rule checks. A judge cannot turn a failed hard-rule check into a pass. The default mock confirms wiring only; use a real model in `.env` for actual LLM review.

## What is in here
| Part | Where |
|---|---|
| The hard rule (one home) | `src/domain/budget.js` |
| Injection guardrail | `src/domain/guardrails.js` |
| Data access, proposals, approve | `src/domain/store.js` |
| API and UI | `src/api/`, `public/` |
| MCP server (3 tools, no approve tool) | `src/mcp/server.js` |
| Two chat agents (planner and read-only budget reviewer) | `src/agent/` |
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
