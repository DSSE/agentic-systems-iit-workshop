# AI-Driven Development Life Cycle (AIDLC) - Core Workflow Specification
# Framework: awslabs/aidlc-workflows (Adapted for SprintBoard - Group 06)

## 1. Overview & Operating Model
This repository implements the **AI-Driven Development Life Cycle (AIDLC)** to enforce rigorous, audited, spec-driven development across all stages of the SprintBoard system.

AI agents operating in this workspace act as paired engineering collaborators governed by strict verification gates, human-in-the-loop approvals, and transparent state auditing.

---

## 2. Core Governance Rules (Non-Negotiable)

1. **Domain Rule Single Source of Truth**:
   - The hard rule **"No member has more than 8 story points"** must reside exclusively in `src/domain/rules.js`.
   - The REST API, MCP server, UI client, and LLM Agent MUST all import and execute this single domain validator.
   - Rule code: `ERR_MAX_POINTS_EXCEEDED` (max 8 points per member).

2. **Human-in-the-Loop State Mutations**:
   - No write operations to `data.json` are permitted without explicit user approval.
   - The UI provides an explicit **[Approve Proposal]** button.
   - The MCP server / Agent provides a staged proposal and pauses for user confirmation (`y` / approve) before executing `assign_task`.
   - The create/assign tool independently verifies capacity before persisting, preventing bypassed checks.

3. **Workspace Boundaries**:
   - All modifications, tools, and configurations must remain strictly within `projects/group-06/` (or `projects/group-6/`).
   - Never touch files outside the group folder.

4. **Continuous State & Audit Tracking**:
   - State Machine: `aidlc-docs/aidlc-state.md` tracks active phase, active unit, and milestone progress.
   - Audit Ledger: `aidlc-docs/audit.md` records an immutable, chronological trail of all gates, test outputs, and human decisions.
   - Visual Progress: `progress.html` must be updated at the conclusion of every development phase.

---

## 3. AIDLC Phase & Gate Architecture

```
+-----------------------------------------------------------------------------------+
| Phase 0: HARNESS & INITIALIZATION                                                 |
| Setup environment, package.json, Node ES modules, AIDLC state files               |
+-----------------------------------------------------------------------------------+
                                         │ [Gate 0: Harness Verified]
                                         ▼
+-----------------------------------------------------------------------------------+
| Phase 1 & 2: INTENT & INCEPTION                                                   |
| Requirements elicitation, domain architecture, tool contracts, unit decomposition |
| (aidlc-docs/intent/*, aidlc-docs/inception/*)                                     |
+-----------------------------------------------------------------------------------+
                                         │ [Gate 1: Inception Signed Off]
                                         ▼
+-----------------------------------------------------------------------------------+
| Phase 3: CONSTRUCTION (Iterative Unit Execution Loop)                             |
| Loop over Units 1 through 7:                                                      |
|   1. Unit Specification & Contract Verification                                   |
|   2. Code Generation (Domain -> Core -> API -> UI -> MCP -> Agent -> Guardrails)  |
|   3. Build & Test Verification (Cases 1-5)                                        |
|   4. Human-in-the-Loop Gate Approval                                              |
|   5. Update aidlc-state.md, audit.md, progress.html                               |
+-----------------------------------------------------------------------------------+
                                         │ [Gate 2: All 7 Construction Units Passed]
                                         ▼
+-----------------------------------------------------------------------------------+
| Phase 4: OPERATIONS & DEMO PREPARATION                                            |
| End-to-end multi-client verification, eval comparison, demo rehearsal              |
+-----------------------------------------------------------------------------------+
```

---

## 4. Phase & Unit Mapping to SprintBoard Milestones

| SprintBoard Phase | AIDLC Phase & Unit | Scope | Gate Verification Criteria |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Phase 0 / Unit 1 | Harness Setup | `package.json`, test harness running, `data.json` seeded, AIDLC state initialized. |
| **Phase 2** | Phase 3 / Unit 2 | Domain, Backend & Frontend | `src/domain/rules.js`, REST API, interactive UI with Approve button. |
| **Phase 3** | Phase 3 / Unit 3 | Behavior Testing | Automated test suite validating Cases 1, 2, and 3 passing 100%. |
| **Phase 4** | Phase 3 / Unit 4 | MCP Server & Multi-Agent | Standard MCP server exposing `list_tasks`, `check_capacity`, `assign_task`. |
| **Phase 5** | Phase 3 / Unit 5 | UI Agent Chat Integration | Natural language chat assistant in UI calling MCP tools; handles Cases 1 & 4. |
| **Phase 6** | Phase 3 / Unit 6 | Prompt Evals & Benchmark | Quantitative eval suite testing prompts against Cases 1–5 with metric comparison. |
| **Phase 7** | Phase 3 / Unit 7 | Defensive Guardrails | Prompt injection & untrusted data deflection; Case 5 blocked on all clients. |
| **Phase 8** | Phase 4 / Unit 8 | Demo Preparation & Runbook | Live demo script, walkthrough checklist, all 5 cases documented and verified. |

---

## 5. Execution Rules for AI Coding Harnesses
- When entering any Unit: read the corresponding unit spec in `aidlc-docs/inception/units.md`.
- Never modify tests to artificially pass; fix the underlying domain or agent logic.
- Upon completing each unit, produce a test receipt, log in `audit.md`, update `aidlc-state.md`, and record the status in `progress.html`.
