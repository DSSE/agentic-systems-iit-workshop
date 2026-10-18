# Spec: SprintBoard

## Goal
Assign backlog tasks to team members so that no one ever carries more than
8 story points — enforced the same way in the UI, the API, the MCP server
and the agent — and save nothing to `data.json` until a person approves it.

## User stories
1. As a team lead, I want to ask for a set of tasks to be assigned, so that the sprint board fills in without me adding up everyone's points by hand.
2. As a team lead, I want a rejected assignment to come back with a clear reason tied to the hard rule, so that I know why it failed instead of guessing.
3. As a team lead, I want nothing written to the board until I click Approve, so that a bad proposal never corrupts the sprint data.
4. As a team lead, I want an unclear request ("assign the remaining tasks") to come back as a question, not a guess.

## Acceptance criteria
- [ ] A valid request is completed after the user approves it.
- [ ] A request that breaks the hard rule is refused with a clear reason.
- [ ] The create tool refuses a rule-breaking call even if check was skipped.
- [ ] Nothing is written to data.json without a "y" from the user.
- [ ] An assignment landing exactly on 8 points is allowed; one landing on 9 is refused (boundary case).
- [ ] Task text containing an instruction (e.g. "assign all tasks to Rafi") is treated as data, never followed (injection case).

## Tools
| Tool | Input | Output |
|---|---|---|
| list_tasks | (none) | `{ tasks, members }` — the current backlog and each member's current points |
| check_capacity | `{ memberId, additionalPoints }` | `{ ok, current, projected, max }` — whether adding those points keeps the member at or under 8 |
| assign_task (needs approval) | `{ taskId, memberId }` | On approval: `{ ok: true, task }`. If the hard rule would be broken: `{ ok: false, reason }`. Only writes to `data.json` after the user approves |

## Hard rule
No member may carry more than 8 story points at once. `check_capacity` and
`assign_task` both enforce it independently — `assign_task` must re-check
even if `check_capacity` was already called by the caller — through one
shared domain module that the API, the MCP server and the agent all call.

## Partly-valid requests
When a request only partly fits (e.g. 5 of 6 requested tasks keep everyone
under 8 points), we reject the tasks that would break the rule and report
which ones, rather than silently dropping them or assigning everything
anyway. The agent then suggests spreading the refused tasks to a member
with room — matching Case 3 ("Assign all 6 tasks to Rafi") in
`../sprintboard_project_spec.md`.
