# SprintBoard (Group 6)

Assigns backlog tasks to team members, keeping everyone at or under 8
story points; nothing saves until a person approves it.

## Read this first, in order
1. `sprintboard_project_spec.md` — the workshop's requirements (objective, scenario, milestones, phases).
2. `specs/agent.md` — this project's tool contracts, hard rule and acceptance criteria.
3. `harness/workflow.md` — the planner/generator/evaluator role sequence, review gates, and the failure/resume procedure.
4. `harness/state.md` — the task checklist, current status, blockers and next action. Update it as you work.
5. `agents/planner.md`, `agents/generator.md`, `agents/evaluator.md` — read whichever matches the role you're asked to act as.

## Commands
No backend or frontend exists yet, so there is nothing to run or test.
This section gets real commands once Milestone 1 code lands.

## Structure
- `specs/agent.md`: the spec; build from it
- `agents/`: role prompts for the planner / generator / evaluator workflow
- `harness/workflow.md`: the role sequence and review gates
- `harness/state.md`: the single source of truth for what's done, in progress, and blocked
- `progress.html`: one entry per finished development phase
- `.mcp.json`: not created yet — add it in Milestone 2 when the MCP server is connected
- `data.json`, `src/tools.js`, `src/agent.js`: not created yet — land with the Milestone 1 backend

## Conventions
- The hard rule (max 8 points per member) will live in one domain module; the API, the MCP server and the agent all call it — never re-implement it per client.
- Nothing is saved until a person clicks Approve.
- No new dependencies without asking.

## Never do
- Never edit files outside this folder
- Never write to `data.json` except through the create tool, once it exists
- Never weaken or delete a test to make it pass
