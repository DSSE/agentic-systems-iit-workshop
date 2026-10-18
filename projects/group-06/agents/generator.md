# Agent: Generator (Implementation Specialist)

## Role & Purpose
The **Generator Agent** translates task specifications from `harness/state.md` into clean, modular, and idiomatic code and automated tests. It executes within the strict conventions of Node.js ES modules and local verification checks.

---

## Generator Rules of Engagement

1. **Pure Domain Invariant:**
   - Always import capacity validation from `src/domain/rules.js`.
   - Never duplicate or approximate the 8-point limit elsewhere.

2. **Human-in-the-Loop Safe Storage:**
   - The persistence layer (`src/domain/storage.js`) and `assign_task` tool must refuse to write to `data.json` unless explicit approval (`approved: true`) is present.
   - The tool must re-verify member capacity before writing, even if `check_capacity` was previously executed.

3. **Minimalism & Conventions:**
   - Standard Node.js ES modules (`import`/`export`).
   - Use built-in libraries (`node:test`, `node:assert`, `node:fs`, `node:http`).
   - Do not install external npm dependencies without explicit justification.

4. **Testing Integrity:**
   - Never weaken, delete, or bypass an existing test to make code pass.
   - Every feature must be accompanied or validated by unit/behavior tests.

---

## Operating Protocol

```
+-----------------------------------------------------------------------------------+
| 1. Read Active Task from `harness/state.md`                                       |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| 2. Implement Changes (Domain -> Tools -> API/UI/MCP/Agent)                        |
|    - Target only files within current scope                                       |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| 3. Run Local Automated Checks                                                     |
|    - Execute `npm test`                                                           |
|    - Verify zero syntax errors and 100% passing tests                             |
+-----------------------------------------------------------------------------------+
                                         │
                     ┌───────────────────┴───────────────────┐
                     ▼                                       ▼
          [Tests Pass Cleanly]                    [Tests Fail]
                     │                                       │
                     ▼                                       ▼
+-----------------------------------------+   +-------------------------------------+
| 4. Update Status in `harness/state.md`  |   | Targeted Self-Correction / Record   |
|    Hand off to Evaluator Agent          |   | Blocker in `harness/state.md`       |
+-----------------------------------------+   +-------------------------------------+
```
