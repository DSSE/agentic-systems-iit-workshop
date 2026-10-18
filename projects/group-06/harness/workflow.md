# SprintBoard Harness: Workflow & Protocol Specification

## 1. Overview & Agent Role Sequence

The SprintBoard development harness coordinates three specialized agent roles in a strict sequential feedback loop:

```
                  ┌──────────────────────────────────────────────┐
                  │                                              │
                  ▼                                              │ (On failure / rework)
        +-------------------+                                    │
        |   PLANNER AGENT   |                                    │
        | (`agents/         |                                    │
        |  planner.md`)     |                                    │
        +---------+---------+                                    │
                  │ Task specification & Acceptance criteria     │
                  ▼                                              │
        +-------------------+                                    │
        |  GENERATOR AGENT  |                                    │
        | (`agents/         |                                    │
        |  generator.md`)   |                                    │
        +---------+---------+                                    │
                  │ Implementation & Local Checks (`npm test`)   │
                  ▼                                              │
        +-------------------+                                    │
        |  EVALUATOR AGENT  |                                    │
        | (`agents/         |                                    │
        |  evaluator.md`)   | ───────────────────────────────────┘
        +---------+---------+
                  │ Independent Verification & Benchmark Passed
                  ▼
        +-------------------+
        |  HUMAN-IN-THE-LOOP|
        |  APPROVAL GATE    |
        +---------+---------+
                  │ Sign-off
                  ▼
         [Update progress.html & Advance to Next Phase]
```

---

## 2. Review Gates & Phase Milestones

| Gate | Phase | Scope | Exit Criteria (Definition of Done) |
| :---: | :--- | :--- | :--- |
| **Gate 0** | **Phase 1** | Harness Setup | `package.json`, `data.json` seeded, harness test passing, `progress.html` initialized. |
| **Gate 1** | **Phase 2** | Domain, Backend & Frontend | `src/domain/rules.js` (8-pt rule), `src/server.js`, web UI with staged proposal & [Approve] button. |
| **Gate 2** | **Phase 3** | Behavior Testing | Automated test suite for Cases 1, 2, and 3 passing 100% via `npm test`. |
| **Gate 3** | **Phase 4** | MCP Server | Standard MCP server in `src/mcp/server.js` exposing tools (`list_tasks`, `check_capacity`, `assign_task`). |
| **Gate 4** | **Phase 5** | In-UI Chat Agent | Agent integrated in UI; handles Case 1 in natural language and asks questions for Case 4 (ambiguity). |
| **Gate 5** | **Phase 6** | Prompt Evaluations | Automated eval suite testing Cases 1–5; benchmark comparison between Prompt Version A and B. |
| **Gate 6** | **Phase 7** | Guardrails | Defensive input boundary blocks Case 5 (prompt injection in `data.json`) across all clients. |
| **Gate 7** | **Phase 8** | Demo Preparation | Demo runbook written, multi-client verification rehearsed live across all 5 cases. |

---

## 3. Failure, Rollback & Resume Procedure

### If a Task Fails Local Checks (Generator Phase)
1. **Targeted Self-Correction:** The Generator Agent analyzes test failures and performs targeted fixes within the task scope.
2. **Never Weaken Tests:** Tests are the ground truth of system invariants. Under no circumstances may a test assertion be relaxed or removed.
3. **Escalation:** If 2 attempts fail to resolve the issue, the Generator records the exact error in `harness/state.md` under **Blockers** and halts for the Planner Agent to re-evaluate the approach.

### If an Evaluator Rejects an Implementation
1. The Evaluator documents the failing scenario case (e.g. Case 2 boundary failure or lack of approval prompt).
2. The task status in `harness/state.md` reverts to `In Progress (Rework)`.
3. The Generator addresses the identified defect and resubmits to the Evaluator.

### Session Continuity & Resuming Work
When beginning or resuming a development session:
1. Read `harness/state.md` to identify the current phase, active task, and blockers.
2. Run `npm test` to verify current baseline health.
3. Consult the appropriate agent document (`agents/planner.md`, `agents/generator.md`, or `agents/evaluator.md`) corresponding to the current workflow step.

---

## 4. Human-in-the-Loop Protocol
- **State Mutations:** No data is saved to `data.json` without human approval.
- **Phase Advancement:** Advancing between phases in `harness/state.md` and `progress.html` occurs only after explicit verification.
