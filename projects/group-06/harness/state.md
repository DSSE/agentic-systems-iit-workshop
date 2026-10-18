# SprintBoard Harness: State & Task Checklist

**Project:** SprintBoard (Group 06)  
**Current Phase:** Lifecycle Completed (All 8 Phases Done)  
**Active Role:** Production Operations & Presentation  
**Overall Progress:** 100.0% (Phases 1 through 8 Fully Completed · Milestones 1, 2, & 3 Done ✅)  
**Last Updated:** 2026-10-18  

---

## Senior Solution Architect Decision Record (ADR)
- **ADR-01 (Single Domain Source of Truth):** Hard capacity limit `MAX_POINTS_PER_MEMBER = 8` and `RULE_ERROR_CODE = "ERR_MAX_POINTS_EXCEEDED"` approved in `src/domain/rules.js`. All clients (API, MCP, UI, Agent) must call `checkMemberCapacity`.
- **ADR-02 (Two-Phase Commit Pattern):** Staging an assignment via `stageProposal` generates an in-memory proposal without touching disk. State persistence in `commitAssignment` strictly requires explicit human approval (`approved: true`).
- **ADR-03 (Defense-in-Depth Validation):** The storage layer re-executes `checkMemberCapacity` immediately prior to disk write, preventing race conditions or bypassed checks.
- **ADR-04 (MCP Protocol Integrity):** MCP `assign_task` strictly requires human confirmation. If called with `approved: false` (or omitted), it returns a staged proposal instructing the agent to prompt the human. Only `approved: true` commits to disk.
- **ADR-05 (Agent Conversational Contract):** When a request is ambiguous or underspecified (Case 4), the agent must not guess or formulate premature proposals; it must ask clarifying questions to discover which tasks to assign and to whom.
- **ADR-06 (Prompt Selection):** Benchmark results confirm Prompt Version B (Structured Chain-of-Thought with Guardrails) scored 100.0% vs. Prompt Version A (66.0%). Prompt Version B is approved as the production standard.
- **ADR-07 (Prompt Injection Defense-in-Depth):** Input sanitizer encloses untrusted task descriptions inside `<untrusted_backlog_data>` boundaries. Numeric point limits are enforced at the domain firewall regardless of instructions inside task text (Case 5).
- **ADR-08 (Operational Readiness):** Live demonstration runbook validated and published in `harness/demo-runbook.md`. All 5 workshop benchmark cases passed live inspection and automated testing.
- **Architect Sign-Off:** ✅ **APPROVED** by Lead Systems Architect (`@TAUSEEF-01`).

---

## Milestone Status Summary
- **Milestone 1 (Basics):** ✅ **COMPLETED** (Phases 1, 2, and 3 passing 100% in UI & automated tests).
- **Milestone 2 (Intermediate):** ✅ **COMPLETED** (Phases 4 and 5 passing 100% with MCP server and in-UI agent).
- **Milestone 3 (Advanced):** ✅ **COMPLETED** (Phases 6, 7, and 8 passing 100% with prompt evals, guardrails, and demo runbook).

---

## Task Checklist by Phase

### Phase 1: Set Up the Harness (COMPLETED ✅)
- [x] Configure ES modules in `package.json` with scripts (`start`, `test`, `dev`, `mcp`, `evals`)
- [x] Seed `data.json` with 3 members (0/8 points allocated) and 6 tasks (points 1–5, including injection string in task-6)
- [x] Formalize agent specification in `specs/agent.md`
- [x] Define multi-agent harness roles: `agents/planner.md`, `agents/generator.md`, `agents/evaluator.md`
- [x] Establish workflow rules & failure recovery in `harness/workflow.md`
- [x] Pass automated harness smoke test in `test/harness.test.js`
- [x] Log Phase 1 completion in `progress.html`

---

### Phase 2: Build Backend & Frontend (COMPLETED ✅)
- [x] **Task 2.1 (Domain Logic):** Created `src/domain/rules.js` (Max 8 pts, `ERR_MAX_POINTS_EXCEEDED`)
- [x] **Task 2.2 (Storage Layer):** Created `src/domain/storage.js` (proposal staging, write on `approved: true`)
- [x] **Task 2.3 (Core Tools):** Created `src/tools.js` (`list_tasks`, `check_capacity`, `assign_task`)
- [x] **Task 2.4 (HTTP Server & API):** Created `src/server.js` (REST endpoints & static serving)
- [x] **Task 2.5 (Frontend UI):** Built `src/public/index.html`, `index.css`, `app.js` with proposal staging card & Approve button
- [x] **Task 2.6 (Verification):** Created `test/phase2.test.js` (5/5 tests passing)
- [x] **Task 2.7 (Dashboard):** Log Phase 2 completion in `progress.html`

---

### Phase 3: Test the Behaviour (COMPLETED ✅)
- [x] Installed and configured `@playwright/test` and Playwright Chromium
- [x] Created `playwright.config.js` with webServer on port 3099
- [x] Implemented `test/behavior.spec.js` (Cases 1, 2, 3 and edge cases)
- [x] Executed full test suite: 15/15 tests passing
- [x] Log Phase 3 completion in `progress.html`

---

### Phase 4: Make the MCP Server & Connect Any Agent (COMPLETED ✅)
- [x] Implemented `src/mcp/server.js` using standard JSON-RPC 2.0 over stdio
- [x] Registered tools: `list_tasks`, `check_capacity`, `assign_task` with complete JSON schemas
- [x] Enforced hard capacity rules and human confirmation inside MCP tool handlers
- [x] Verified external agent configuration via `.mcp.json`
- [x] Created `test/mcp.test.js` passing 7/7 automated stdio protocol tests
- [x] Log Phase 4 completion in `progress.html`

---

### Phase 5: Add the Agent to the UI (COMPLETED ✅)
- [x] Implemented model-agnostic conversational agent in `src/agent.js`
- [x] Exposed `POST /api/chat` route in `src/server.js`
- [x] Built interactive glassmorphism Chat Drawer in `src/public/`
- [x] Created `test/agent.test.js` verifying Cases 1, 3, 4
- [x] Created Playwright suite `test/chat.spec.js` verifying in-UI chat Case 1 and Case 4
- [x] Full unified test run passing: 28/28 tests passing (20 unit/API + 8 Playwright E2E)
- [x] Log Phase 5 completion in `progress.html`

---

### Phase 6: Write Evals for the Prompts (COMPLETED ✅)
- [x] Implement `evals/eval_runner.js` running automated Cases 1–5
- [x] Benchmark Prompt Version A (Base: 66.0%) vs. Prompt Version B (Structured CoT: 100.0%)
- [x] Generate comparative metrics report in `aidlc-docs/construction/prompt-eval-report.md`
- [x] Add `"evals"` script to `package.json`
- [x] Update `progress.html`

---

### Phase 7: Add Guardrails (COMPLETED ✅)
- [x] Implement input isolation delimiters (`<untrusted_backlog_data>`) in `src/guardrails/input_sanitizer.js`
- [x] Add injection test `test/injection.test.js` validating Case 5 across UI, API, MCP, and Agent (7/7 tests passing)
- [x] Verify that task-6 payload cannot override capacity limits on any client
- [x] Update `progress.html`

---

### Phase 8: Prepare the Demo (COMPLETED ✅)
- [x] Produce demo runbook (`harness/demo-runbook.md`)
- [x] Rehearse all 5 test cases live
- [x] Finalize `progress.html` with 100% completion

---

## Blockers & Risk Register
- **Active Blockers:** None. All automated test suites (27 unit/integration tests + 8 Playwright E2E tests + prompt evals) passing 100%.
- **Folder Naming Note:** In `.github/scripts/pr-guard.mjs`, branch `group-6/*` maps to `projects/group-6/`. The current workspace directory is `projects/group-06/`. To be normalized before opening PR to `main`.

---

## Final Project Status
SprintBoard is 100% complete, fully tested, documented, and ready for team and instructor demonstration.

