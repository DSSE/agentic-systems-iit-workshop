# SprintBoard (Group 06)

Assigns backlog tasks to agile team members while strictly enforcing team capacity limits (**max 8 story points per member**) and saving only after explicit human approval.

---

## 📖 Reading Order for Coding Agents
Before performing any task, read files in this exact sequence:
1. `sprintboard_project_spec.md`: Workshop objective, milestones, scenarios, and development phases.
2. `specs/agent.md`: Tool signatures, acceptance criteria, and partly-valid request strategies.
3. `harness/workflow.md`: Agent role loop (Planner -> Generator -> Evaluator) and review gates.
4. `harness/state.md`: Active phase, task checklist, and current blockers.
5. The specific agent persona file for your current task:
   - `agents/planner.md` (when breaking down requirements)
   - `agents/generator.md` (when implementing code/tests)
   - `agents/evaluator.md` (when running audits and evals)

---

## ⚡ Commands
- Run Web App: `npm start`
- Run Tests: `npm test`
- Start MCP Server: `npm run mcp`
- Dev Server (watch mode): `npm run dev`

---

## 📁 Repository Structure
```
projects/group-06/
├── README.md                       # Setup, commands, and demo instructions
├── CLAUDE.md                       # Entry point: project rules and reading order
├── sprintboard_project_spec.md     # Workshop requirements & scenarios
│
├── specs/
│   └── agent.md                    # Tool contracts, approval flow, acceptance criteria
│
├── agents/
│   ├── planner.md                  # Break requirements into small, ordered tasks
│   ├── generator.md                # Implement a task and run relevant checks
│   └── evaluator.md                # Independently verify behavior and report issues
│
├── harness/
│   ├── workflow.md                 # Role sequence, review gates, failure/resume procedure
│   └── state.md                    # Task checklist, current status, blockers, next action
│
├── progress.html                   # Required summary after each workshop phase
├── .claude/
│   └── settings.json               # Existing coding-agent permissions
├── .mcp.json                       # MCP server connection configuration
│
├── data.json                       # The single data store for tasks & member capacity
├── package.json                    # ES modules setup, test scripts
├── src/
│   ├── domain/rules.js             # Hard rule: max 8 points per member (single source of truth)
│   ├── domain/storage.js           # Persistence layer (saves only on approve)
│   ├── tools.js                    # list_tasks, check_capacity, assign_task
│   ├── server.js                   # HTTP server & REST API
│   ├── public/                     # Web dashboard with staged proposals & [Approve] button
│   ├── mcp/server.js               # Model Context Protocol server
│   └── agent.js                    # Conversational AI agent (model-agnostic)
└── test/
    ├── harness.test.js             # Harness & environment verification
    └── behavior.test.js            # Cases 1-3 behavioral automated tests
```

---

## 🛡️ Core Rules & Invariants
- **Hard Rule:** No member has more than 8 points. All checks must call `src/domain/rules.js`. Rule code: `ERR_MAX_POINTS_EXCEEDED`.
- **Human Approval:** Nothing is written to `data.json` without explicit approval (`approved: true`).
- **Conventions:** Node.js (>= 18), ES modules (`type: "module"`), zero external dependencies unless approved.
- **Never do:**
  - Never edit files outside this folder.
  - Never write to `data.json` except through the approved persistence layer.
  - Never weaken, bypass, or delete an existing test.
  - Never duplicate the 8-point capacity rule outside `src/domain/rules.js`.
