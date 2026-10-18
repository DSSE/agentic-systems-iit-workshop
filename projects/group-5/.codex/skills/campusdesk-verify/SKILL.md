---
name: campusdesk-verify
description: Verify CampusDesk booking behavior and milestone readiness against the project acceptance criteria.
---

# Verify CampusDesk behavior

Resolve paths from `projects/group-5/`. Read `specs/agent.md` and the active
phase of `PLANS.md`. Inspect `package.json` before running commands. If the
application or tests are missing, report that limitation; do not claim a pass.

Use isolated temporary booking data for tests; leave demo and user data intact.
For Basics, cover these observable results at the domain/API level and exercise
the corresponding proposal, approval, rejection, and error flows in the UI:

| Case | Evidence to collect |
|---|---|
| Normal | Exact preview, student submits pending request, independent staff approves, one confirmed booking |
| Reject/cancel | Request status may change; confirmed bookings remain unchanged |
| Duration | 180 minutes succeeds; 181 minutes and 5 hours return `DURATION_LIMIT_EXCEEDED` |
| Availability | Same-room overlap returns `ROOM_UNAVAILABLE`; adjacent slots succeed |
| Input/capacity | Invalid times, durations, group sizes and rooms fail with spec codes; excess capacity returns `CAPACITY_EXCEEDED` |
| Direct create | Skipping the check cannot bypass validation or approval |
| Approval binding | Public MCP cannot supply human approval; only staff's API review can create the exact request |
| Stale/concurrent | A stale conflicting proposal fails; concurrent conflicting creates produce at most one booking |

Assert unchanged persisted data after failed operations, not just returned error
codes. Run the project's available test command and record actual results.
Perform UI verification when the app exists; record any UI check not performed.

For Intermediate, additionally exercise all three MCP tools from two agents
and demonstrate normal booking and clarification through UI chat. For requested
Advanced work, compare two prompt versions over all five workshop cases and
check room-note injection across each client.

Run server tests from `server/` and `npm run test:browser` inside `web/`.
Browser tests use isolated data and a scripted provider. Run `npm run eval`
inside `server/` for real model calls; `-- --offline` only checks deterministic
contracts and scoring. A provider access or quota failure is a live-verification
blocker, never evidence that a prompt passed or failed the booking rubric.

Finish with checks run, results, and remaining gaps. Update `progress.html` and
`PLANS.md` only for work supported by evidence. Basics is done only when the
required UI scenarios work and behavior tests pass.
