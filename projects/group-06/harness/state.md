# State

## Current status
Chat interface and startup repair are Awaiting review (generator). The page now
server-renders the board and chat workspace, with bounded same-origin API calls
and retry states. A labeled local planner works now; server-only provider/model/key
configuration enables an LLM tool loop. Human approval remains required.

MCP setup Phase 1 backend approval gate passed independent evaluator review.
The approval UI passed source review and production compilation; the real-browser
cross-port approval check remains pending. Phase 1 is not fully closed, and this
does not complete Development Phase 4 or Milestone 2.

MCP setup Phases 2-3 (the stdio server implementation) passed independent
evaluator review: backend 41/41 tests, MCP 26/26 real stdio protocol tests,
and backend/MCP/frontend builds passed. Project configurations are present
for Claude Code and Gemini CLI; trusted live-client/model demonstrations and
the real-browser approval check remain pending. Parallel UI/chat work is
outside this MCP implementation sign-off.

Milestone 1 (Basics), Phase 3 (Test the behaviour) — done. Phase 2
(backend + frontend) and the Case 1–3 route-level test suite both passed
evaluator review. Cases 1 to 3 now work in the UI and the tests pass, so
Milestone 1's "Done when" condition is met. Milestone 2 /
Development Phase 4 (MCP server + agent) remains in progress.

## Task checklist

### Done
- [x] Write the project spec (`../sprintboard_project_spec.md` provided; `../specs/agent.md` filled in)
- [x] Set up the harness (`../agents/`, `workflow.md`, `state.md`)
- [x] Phase 2: backend (Node/Express/TypeScript) + frontend (Next.js/TypeScript) — domain module (`backend/src/domain/capacity.ts`); `list_tasks`/`check_capacity`/`assign_task` as routes; UI with backlog view, live capacity preview, and an Approve button as the only write path.
  Evaluator verification (2026-10-18): `npm test` in `backend/` — 2 files, 6 tests, all pass. `npm run build` clean in both `backend/` and `frontend/` (incl. `next build`). Live-curled the running API against a backed-up `data.json` (restored after): assigned Login(3)+Payment(5) to Rafi → second call lands exactly on 8, `ok:true` (boundary). A further Notifications(3) call for Rafi → `ok:false`, `reason` carries `rule:max-8-points`, and `GET /api/tasks` afterward confirms Rafi is still at 8 and Notifications is still unassigned (no write on refusal). Moved to Done.
- [x] Phase 3: Case 1–3 route-level test suite at `backend/src/routes/index.test.ts`, exercising the real Express app (`createApp()`) over HTTP on an ephemeral port with a throwaway fixture board (`SPRINTBOARD_DATA_PATH`), separate from the existing domain/tool unit tests.
  Covers: Case 1 (Login+Payment assigned to one member, both succeed, final points = 8); Case 2 boundary (a call landing exactly on 8 succeeds) and breaking (the next call landing on 9 is refused, carries `rule:max-8-points`, board confirmed unchanged for that task/member); Case 3 (all 6 backlog tasks — 19 points total — proposed to Rafi one at a time: every `ok:true` is reflected as assigned-to-rafi on the board, every refusal leaves the task unassigned, Rafi's final points never exceed 8, at least one of the six is refused).
  Evaluator verification (2026-10-18): re-ran `npm test` in `backend/` with the verbose reporter — 3 files, 10 tests, all pass, each new test name maps 1:1 to a named case. `npm run build` still clean. Confirmed the real `backend/data.json` was untouched throughout (tests write only to a tmp-dir fixture via `SPRINTBOARD_DATA_PATH`). Moved to Done.

- [x] MCP setup Phase 1 backend proposal/session approval gate and updated `specs/agent.md`.
  Independent evaluator evidence (2026-10-18): reran `npm.cmd test -- --reporter=verbose` in `backend/`: 3 files / 41 tests passed. Independently ran `npm.cmd run build` in `backend/` and `frontend/`: both passed (`tsc` and Next.js 16.4.2 production build). Read the assertions and fixtures: route boundary is Login(3) + Payment(5) = 8, then Tiny(1) = exactly 9 refused with `rule:max-8-points`, `9/8`, and byte-for-byte unchanged board; internal commit uses 5 + 3 = 8 and 5 + 4 = exactly 9. Verified no-approval, rejected proposals, direct-write retirement, spoofed `approved:true`, cookie/Origin/CSRF enforcement, one-use setup, stale points/capacity/labels, competing and duplicate approvals, repeated approval, and restart-invalidated proposals/sessions through isolated real-HTTP fixtures. Source review confirms the UI requests proposals, includes browser credentials for approval, and requires a fresh click after stale details. Test setup sets `SPRINTBOARD_DATA_PATH` before imports; all test writes use throwaway fixtures. Real `backend/data.json` SHA256 before/after: `B0C09A93AC4E754F2BFBE231DEACAEFE6B427B6893D08A5C11974FFB1AEF8B27`. No application code changed by evaluator.

- [x] MCP setup Phases 2–3: separate ESM `mcp-server/` package with exactly `list_tasks`, `check_capacity`, and pending-only `assign_task`; strict input/output contracts, fixed HTTP routes, five-second timeout, backend refusal/error handling, and default SDK stdio legacy compatibility. No model dependency/key, approval credentials, backend/store imports in adapter runtime, or board file access.
  Generator report (2026-10-18): Node 20.19.0; SDK server/client 2.3.1; Zod 4.6.7; TypeScript 7.0.2; Vitest 4.1.12. Clean `npm.cmd ci` in `mcp-server/` succeeded (62 packages, 0 vulnerabilities), followed by a successful build and 26 real stdio protocol tests. Build `../backend/dist/app.js` first. Independent evaluator results follow; real host/client checks remain pending.
  Independent evaluator PASS (2026-10-18): independently ran `npm.cmd run build` and `npm.cmd test -- --reporter=verbose` in `backend/` (3 files / 41 tests), `npm.cmd test -- --reporter=verbose` in `mcp-server/` (build plus 1 file / 26 tests), and `npm.cmd run build` in `frontend/` with `NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api`; all passed. Read the adapter and test fixtures, not just the generator report. Verified actual SDK stdio subprocess discovery of exactly three tools and strict schemas, successful `ok:false` capacity previews, structured/text agreement, pending-only requests, authenticated approval and rejection, 3+5=exactly 8 allowed then 8+1=exactly 9 refused with the rule code and no write, malformed/extra arguments, stale/repeated approvals, two adapter processes sharing one fixture backend, no lost update/overload/duplicate commit, outage, five-second timeout, and EOF teardown. Each fixture sets `SPRINTBOARD_DATA_PATH` before backend import and uses an ephemeral port and guarded temporary-directory cleanup. Runtime adapter has no store imports, file writes, approval route or credentials, model dependency, or custom protocol negotiation. Injected text is returned unchanged as data; these deterministic checks do not establish a model's prompt-injection resistance. Real board SHA256 remained `B0C09A93AC4E754F2BFBE231DEACAEFE6B427B6893D08A5C11974FFB1AEF8B27`. Moved implemented server task to Done; manual browser/live-host checks and UI/chat milestone remain open. No application code changed by evaluator.

### Awaiting review
- [ ] Chat interface and startup repair (2026-10-18): responsive conversation,
  prompt cards, team capacity, backlog/manual assignment, approval review, and
  setup-code dialog. Browser calls use `/api` on either localhost or 127.0.0.1;
  the proxy forwards the existing HttpOnly session and CSRF token while rejecting
  cross-origin writes. Server-rendered board fetch times out after 3 seconds;
  interactive requests have bounded timeouts and retry states. Local commands
  cover named tasks, balancing, clarification, aggregate pending capacity, and
  refusal; configured model calls use only the three tool contracts and never
  receive approval credentials. `backend/.env.example` documents server-only
  key configuration. Generator checks: backend build, frontend production build,
  and 67 tests across 6 files pass, including 26 new chat/proxy/HTTP tests. Live
  read-only chat calls work at both UI hosts; external-origin writes return 403;
  initial HTML includes the assistant and real backlog instead of a loading-only
  screen. No real board assignments were made. CUA reported no available browser
  and `iab` creation failed, so interactive browser QA remains unverified.
  Real provider verification awaits the user's provider/model/API key.
- [ ] MCP setup Phase 1 real-browser approval check: establish the session at `http://127.0.0.1:3000` against an isolated fixture API, create and reject a proposal without a write, then approve a proposal and verify exactly one assignment. Evaluator could not run this check: CUA inventory returned no browsers/apps and creating an `iab` tab failed with `Browser is not available: iab`; required UI port 3000 was also occupied by an existing process not owned by this session. Existing services were left running. Passing TypeScript/build and HTTP cookie-header tests do not establish browser cookie/CORS behavior.

### Next actions (in order)
1. [ ] Finish the real-browser approval check above when a browser and the configured UI are available.
2. [ ] Review project trust in both AI clients and demonstrate live discovery/use, shared board state, pending-only proposals, human approval, over-capacity refusal, and clarification for unclear requests. Recorded discovery only: Claude Code 2.1.175 is Pending approval; Gemini CLI 0.46.0 is Disabled in an untrusted folder. Neither is yet verified connected; model credentials/access are still supplied through each client.
3. [ ] Complete the parallel UI/chat task and its independent evaluation. Live agent checks for unclear requests and injected backlog instructions remain pending; deterministic MCP tests only verify that descriptions stay data and cannot approve or bypass backend capacity.

### Blockers
(none)

## Notes
- `.mcp.json` and `.gemini/settings.json` are present with this checkout's absolute compiled entry path and no approval/model credentials. Connection and real model behavior remain to be demonstrated after project trust and client login.
- Append one entry to `../progress.html` at the end of each development phase (per `../sprintboard_project_spec.md`).
- `backend/node_modules`, `backend/dist`, `frontend/node_modules`, `frontend/.next` are gitignored — run `npm install` in each folder after a fresh clone.
