# SprintBoard Harness: State & Task Checklist

**Project:** SprintBoard (Group 06)  
**Current Phase:** Phase 3: Test the behaviour  
**Active Role:** Evaluator / Test Engineer  
**Overall Progress:** 25.0% (Phases 1 & 2 Completed, Phase 3 Active)  
**Last Updated:** 2026-10-18  

---

## Senior Solution Architect Decision Record (ADR)
- **ADR-01 (Single Domain Source of Truth):** Hard capacity limit `MAX_POINTS_PER_MEMBER = 8` and `RULE_ERROR_CODE = "ERR_MAX_POINTS_EXCEEDED"` approved in `src/domain/rules.js`. All clients (API, MCP, UI, Agent) must call `checkMemberCapacity`.
- **ADR-02 (Two-Phase Commit Pattern):** Staging an assignment via `stageProposal` generates an in-memory proposal without touching disk. State persistence in `commitAssignment` strictly requires explicit human approval (`approved: true`).
- **ADR-03 (Defense-in-Depth Validation):** The storage layer re-executes `checkMemberCapacity` immediately prior to disk write, preventing race conditions or bypassed checks.
- **Architect Sign-Off:** ✅ **APPROVED** by Lead Systems Architect (`@TAUSEEF-01`).

---

## Task Checklist by Phase

### Phase 1: Set Up the Harness (COMPLETED ✅)
- [x] Configure ES modules in `package.json` with scripts (`start`, `test`, `dev`, `mcp`)
- [x] Seed `data.json` with 3 members (0/8 points allocated) and 6 tasks (points 1–5, including injection string in task-6)
- [x] Formalize agent specification in `specs/agent.md`
- [x] Define multi-agent harness roles: `agents/planner.md`, `agents/generator.md`, `agents/evaluator.md`
- [x] Establish workflow rules & failure recovery in `harness/workflow.md`
- [x] Pass automated harness smoke test in `test/harness.test.js`
- [x] Log Phase 1 completion in `progress.html`

---

### Phase 2: Build Backend & Frontend (COMPLETED ✅)
- [x] **Task 2.1 (Domain Logic):** Created `src/domain/rules.js` implementing:
  - `MAX_POINTS_PER_MEMBER = 8`
  - `RULE_ERROR_CODE = "ERR_MAX_POINTS_EXCEEDED"`
  - `checkMemberCapacity(member, currentPoints, addedPoints)`
- [x] **Task 2.2 (Storage Layer):** Created `src/domain/storage.js` implementing:
  - `readData()`, `stageProposal()`, `commitAssignment()`
  - Enforced `approved: true` requirement for disk writes
  - Atomic re-validation of capacity before saving to `data.json`
- [x] **Task 2.3 (Core Tools):** Created `src/tools.js` implementing:
  - `list_tasks()`
  - `check_capacity(memberName, taskIds)`
  - `assign_task(memberName, taskIds, approved)`
- [x] **Task 2.4 (HTTP Server & API):** Created `src/server.js`:
  - Static file serving for `src/public/`
  - REST routes: `GET /api/data`, `POST /api/check`, `POST /api/propose`, `POST /api/approve`
- [x] **Task 2.5 (Frontend UI):** Built `src/public/index.html`, `index.css`, `app.js`:
  - Modern dark glassmorphism dashboard
  - Dynamic capacity gauges (normal, warning, overflow)
  - Staging area for proposals
  - Explicit **[Approve Proposal]** button (only this writes to `data.json`)
  - Quick scenario benchmarks (Cases 1, 2, and 3)
- [x] **Task 2.6 (Verification):** Created `test/phase2.test.js` passing 5/5 automated test suites.
- [x] **Task 2.7 (Dashboard):** Log Phase 2 completion in `progress.html`

---

### Phase 3: Test the Behaviour (ACTIVE ⏳)
- [ ] Implement `test/behavior.test.js` formally verifying:
  - **Case 1 (Normal):** "Assign the login and payment tasks for this sprint." -> Valid proposals keeping everyone <= 8 points. Persisted only upon Approve.
  - **Case 2 (Boundary):** Bringing a member to 8 points succeeds with proposal. Attempting a 9th point throws `ERR_MAX_POINTS_EXCEEDED`.
  - **Case 3 (Breaks the rule):** "Assign all 6 tasks to Rafi" refused with rule code and re-distribution suggestion.
- [ ] Run `npm test` and verify 100% green
- [ ] Update `progress.html`

---

### Phase 4: Make the MCP Server & Connect Any Agent (PENDING 📋)
- [ ] Implement `src/mcp/server.js` using JSON-RPC over stdio
- [ ] Expose `list_tasks`, `check_capacity`, `assign_task`
- [ ] Verify external agent connectivity using `.mcp.json`
- [ ] Update `progress.html`

---

### Phase 5: Add the Agent to the UI (PENDING 📋)
- [ ] Implement `src/agent.js` using model-agnostic OpenAI-compatible API
- [ ] Configure prompt with 8-point rule and Case 4 clarification protocol
- [ ] Add interactive chat drawer to the web UI
- [ ] Verify Case 1 (natural language) and Case 4 (ambiguity triggers question)
- [ ] Update `progress.html`

---

### Phase 6: Write Evals for the Prompts (PENDING 📋)
- [ ] Implement `evals/eval_runner.js` running automated Cases 1–5
- [ ] Benchmark Prompt Version A vs. Prompt Version B
- [ ] Generate comparative metrics report
- [ ] Update `progress.html`

---

### Phase 7: Add Guardrails (PENDING 📋)
- [ ] Implement input isolation delimiters (`<untrusted_backlog_data>`)
- [ ] Add injection test `test/injection.test.js` validating Case 5
- [ ] Verify that task-6 payload cannot override capacity limits on any client
- [ ] Update `progress.html`

---

### Phase 8: Prepare the Demo (PENDING 📋)
- [ ] Produce demo runbook (`harness/demo-runbook.md`)
- [ ] Rehearse all 5 test cases live
- [ ] Finalize `progress.html` with 100% completion

---

## Blockers & Risk Register
- **Active Blockers:** None. Phase 2 passed all unit, storage, and API checks.
- **Folder Naming Note:** In `.github/scripts/pr-guard.mjs`, branch `group-6/*` maps to `projects/group-6/`. The current workspace directory is `projects/group-06/`. To be normalized before opening PR to `main`.

---

## Next Immediate Action
Proceed with Phase 3 (Automated Behavior Testing for Cases 1 to 3 in `test/behavior.test.js`).
