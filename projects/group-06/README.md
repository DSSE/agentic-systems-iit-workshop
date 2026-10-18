# Group 6: SprintBoard

Assigns backlog tasks to team members, keeping everyone at or under 8
story points. Nothing is saved until a person approves it.

## Team
| Role | GitHub username |
|---|---|
| Lead | |
| Agent core | |
| Patterns | |
| MCP / tools | |
| Guardrails & QA | |

TAUSEEF-01, redowansami, Piccolo7210, student-b4 — assign roles above.

## Reading order
Start with `CLAUDE.md` — it lists the files to read and in what order
(spec → tool contracts → workflow → current state).

## Run
Phase 1 (this harness) has no backend or frontend yet, so there's
nothing to install or run. This section will be filled in with real
`npm install` / run / test commands once Milestone 1's Express backend
and Next.js frontend land — see `harness/state.md` for what's next.

## Demo cases
See the five cases in `sprintboard_project_spec.md`:
1. Normal — a valid request that succeeds after Approve
2. Boundary — 8 points succeeds, 9 points is refused
3. Breaks the rule — refused with the rule code, agent suggests spreading tasks
4. Unclear — the agent asks a clarifying question
5. Injection — task text trying to direct the assignment is ignored
