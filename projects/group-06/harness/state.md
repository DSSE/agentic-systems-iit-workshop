# State

## Current status
Milestone 1 (Basics), Phase 1 (Set up the harness) — the role harness
(`../agents/`, `workflow.md`, this file) and the spec (`../specs/agent.md`)
are in place. No backend or frontend code has been written yet.

## Task checklist

### Done
- [x] Write the project spec (`../sprintboard_project_spec.md` provided; `../specs/agent.md` filled in)
- [x] Set up the harness (`../agents/`, `workflow.md`, `state.md`)

### Next actions (in order)
1. [ ] Decide and record the backend/frontend layout (Node/Express backend, Next.js frontend) and scaffold it
2. [ ] Build the domain module for the hard rule (max 8 points/member) — single source of truth
3. [ ] Build `list_tasks`, `check_capacity`, `assign_task` (with the approval gate) on top of the domain module
4. [ ] Build the UI: backlog view, assignment proposals, an Approve button that is the only path to a write
5. [ ] Write tests for Cases 1–3 (normal, boundary, breaks the rule)

### Awaiting review
(none)

### Blockers
(none)

## Notes
- `.mcp.json` is intentionally not created yet — it's added in Milestone 2 when the MCP server is connected.
- Append one entry to `../progress.html` at the end of each development phase (per `../sprintboard_project_spec.md`).
