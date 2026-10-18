# AIDLC Workflow State Machine

**Project:** SprintBoard (Group 06)  
**Methodology:** AWS Labs AIDLC (AI-Driven Development Life Cycle)  
**Last Updated:** 2026-10-18  
**Current Phase:** Phase 3: Construction  
**Current Unit:** Unit 2 - Core Domain, Backend & Frontend UI (Phase 2)  
**Gate Status:** Gate 0 Passed (Harness Verified) -> Gate 1 In Progress

---

## Phase & Unit Execution Progress

- [x] **Phase 0 / Unit 1: Harness & Project Setup (COMPLETED)**
  - [x] AIDLC steering rules & state structure generated (`.aidlc/`, `aidlc-docs/`)
  - [x] `package.json` with ESM, testing scripts, dev servers
  - [x] `data.json` seeded with 6 tasks, points, and 3 team members (Rafi, Sarah, Tanvir)
  - [x] Spec alignment in `specs/agent.md` & `CLAUDE.md`
  - [x] Automated harness smoke test passing (`test/harness.test.js`)
  - [x] Entry recorded in `progress.html`

- [ ] **Phase 3 / Unit 2: Core Domain, Backend & Frontend UI (ACTIVE)**
  - [ ] Pure domain logic `src/domain/rules.js` (Max 8 points hard rule)
  - [ ] Data access layer & storage harness (`src/domain/storage.js`)
  - [ ] Core tools (`list_tasks`, `check_capacity`, `assign_task`)
  - [ ] REST API endpoints (`src/server.js`)
  - [ ] Frontend interface with proposal preview & explicit [Approve Proposal] button
  - [ ] Entry in `progress.html`

- [ ] **Phase 3 / Unit 3: Behavior Verification & Test Suite**
  - [ ] Automated tests for Case 1 (Normal flow, proposal generation, save on approve)
  - [ ] Automated tests for Case 2 (Boundary flow: 8 points succeeds, 9 points blocked with `ERR_MAX_POINTS_EXCEEDED`)
  - [ ] Automated tests for Case 3 (Over-capacity assignment blocked with alternative suggestion)
  - [ ] Verification receipt generated
  - [ ] Entry in `progress.html`

- [ ] **Phase 3 / Unit 4: Model Context Protocol (MCP) Server**
  - [ ] MCP Server implementation (`src/mcp/server.js`)
  - [ ] Expose `list_tasks`, `check_capacity`, `assign_task` via MCP tool definitions
  - [ ] Enforce domain capacity rules and approval gates inside MCP tools
  - [ ] Verify multi-agent connectivity (Claude Code, Gemini CLI, Antigravity, Cursor)
  - [ ] Entry in `progress.html`

- [ ] **Phase 3 / Unit 5: In-UI Chat Agent**
  - [ ] LLM Agent integration (`src/agent.js`) using model-agnostic provider interface
  - [ ] Agent system prompt encoding hard rule and clarification protocol
  - [ ] Interactive chat panel in UI wired to agent
  - [ ] Verification of Case 1 (natural language assignment) and Case 4 (ambiguity resolution)
  - [ ] Entry in `progress.html`

- [ ] **Phase 3 / Unit 6: Prompt Evaluation & Benchmarking**
  - [ ] Evaluation harness running automated test cases 1 through 5
  - [ ] Comparison between Prompt Version A (Base) vs Version B (Refined/Structured)
  - [ ] Metric logging (Accuracy, Rule Adherence, Clarification Rate)
  - [ ] Entry in `progress.html`

- [ ] **Phase 3 / Unit 7: Defensive Guardrails & Injection Defense**
  - [ ] Input sanitization and prompt injection shields
  - [ ] Verification of Case 5 (untrusted text in `data.json` ignored, rule upheld)
  - [ ] Hard rule defenses verified across UI, API, MCP, and Agent
  - [ ] Entry in `progress.html`

- [ ] **Phase 4 / Unit 8: Demo Preparation & Operations Runbook**
  - [ ] End-to-end rehearsal across all 5 test cases
  - [ ] Presentation runbook and script (`aidlc-docs/operations/demo-runbook.md`)
  - [ ] Final `progress.html` completion entry
