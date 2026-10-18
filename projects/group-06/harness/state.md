# State

## Current status
Milestone 1 (Basics), Phase 3 (Test the behaviour) — done. Phase 2
(backend + frontend) and the Case 1–3 route-level test suite both passed
evaluator review. Cases 1 to 3 now work in the UI and the tests pass, so
Milestone 1's "Done when" condition is met. Next up is Milestone 2 /
Development Phase 4 (MCP server + agent).

## Task checklist

### Done
- [x] Write the project spec (`../sprintboard_project_spec.md` provided; `../specs/agent.md` filled in)
- [x] Set up the harness (`../agents/`, `workflow.md`, `state.md`)
- [x] Phase 2: backend (Node/Express/TypeScript) + frontend (Next.js/TypeScript) — domain module (`backend/src/domain/capacity.ts`); `list_tasks`/`check_capacity`/`assign_task` as routes; UI with backlog view, live capacity preview, and an Approve button as the only write path.
  Evaluator verification (2026-10-18): `npm test` in `backend/` — 2 files, 6 tests, all pass. `npm run build` clean in both `backend/` and `frontend/` (incl. `next build`). Live-curled the running API against a backed-up `data.json` (restored after): assigned Login(3)+Payment(5) to Rafi → second call lands exactly on 8, `ok:true` (boundary). A further Notifications(3) call for Rafi → `ok:false`, `reason` carries `rule:max-8-points`, and `GET /api/tasks` afterward confirms Rafi is still at 8 and Notifications is still unassigned (no write on refusal). Moved to Done.
- [x] Phase 3: Case 1–3 route-level test suite at `backend/src/routes/index.test.ts`, exercising the real Express app (`createApp()`) over HTTP on an ephemeral port with a throwaway fixture board (`SPRINTBOARD_DATA_PATH`), separate from the existing domain/tool unit tests.
  Covers: Case 1 (Login+Payment assigned to one member, both succeed, final points = 8); Case 2 boundary (a call landing exactly on 8 succeeds) and breaking (the next call landing on 9 is refused, carries `rule:max-8-points`, board confirmed unchanged for that task/member); Case 3 (all 6 backlog tasks — 19 points total — proposed to Rafi one at a time: every `ok:true` is reflected as assigned-to-rafi on the board, every refusal leaves the task unassigned, Rafi's final points never exceed 8, at least one of the six is refused).
  Evaluator verification (2026-10-18): re-ran `npm test` in `backend/` with the verbose reporter — 3 files, 10 tests, all pass, each new test name maps 1:1 to a named case. `npm run build` still clean. Confirmed the real `backend/data.json` was untouched throughout (tests write only to a tmp-dir fixture via `SPRINTBOARD_DATA_PATH`). Moved to Done.

### Awaiting review
(none)

### Next actions (in order)
1. [ ] Decide whether case 5's injection text (`backend/data.json`'s task `t6`) needs an explicit test now or waits for the agent in Milestone 2 — the current tools never read task `description` for instructions, so it already can't be followed, but nothing asserts that yet

### Blockers
(none)

## Notes
- `.mcp.json` is intentionally not created yet — it's added in Milestone 2 when the MCP server is connected.
- Append one entry to `../progress.html` at the end of each development phase (per `../sprintboard_project_spec.md`).
- `backend/node_modules`, `backend/dist`, `frontend/node_modules`, `frontend/.next` are gitignored — run `npm install` in each folder after a fresh clone.
