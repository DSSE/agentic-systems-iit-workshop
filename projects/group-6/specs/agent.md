# Spec: SprintBoard

## Goal
Assign backlog tasks to team members so that no one ever carries more than
8 story points. The UI, API, MCP server, and agent share the backend's domain
rule. Save nothing to `data.json` until a person approves a displayed proposal.

## User stories
1. As a team lead, I want to request assignments without adding up everyone's points myself.
2. I want a refused assignment to explain the hard rule it would break.
3. I want to review and approve each task/member pair before the board changes.
4. I want unclear requests ("assign the remaining tasks") to get a clarification question.

## Acceptance criteria
- A valid assignment is saved only after the human approver clicks Approve.
- A request breaking the hard rule is refused with `rule:max-8-points` and a clear reason.
- Skipping `check_capacity` cannot bypass proposal or final-commit validation.
- Pending proposals, reads, rejection, and unauthenticated approval do not write the board.
- Exactly 8 points is allowed; exactly 9 is refused, including competing proposals.
- A displayed task/member pair is bound to its opaque proposal ID. Approval cannot substitute IDs.
- Changed points/capacity require refreshed details and a new approval click. Changed displayed task/member names invalidate the old proposal ID and return a replacement for review.
- Approved/rejected proposals are single-use. Restart invalidates proposals and approver sessions.
- Task titles and descriptions are untrusted data, never instructions to the agent.
- An unclear request requires clarification rather than invented tasks or members.

## MCP tools
All inputs are strict objects: reject missing/extra fields. IDs must be nonempty
ASCII letter/digit IDs with optional underscores/hyphens, at most 128 characters.
Story points are finite nonnegative safe integers. Assignment points always come
from the stored task, never the model.

- `list_tasks`: input `{}`; returns `{ tasks, members }`. Read-only.
- `check_capacity`: input `{ memberId, additionalPoints }`; returns
  `{ ok, current, projected, max }`. Read-only. `ok: false` is a successful
  preview reporting insufficient capacity.
- `assign_task`: input `{ taskId, memberId }`; requests a proposal through
  `POST /api/proposals`, never a board write. Returns
  `{ status: "pending_approval", proposalId, taskId, memberId, taskTitle,
  memberName, points, current, projected, max, approvalUrl }`.
  `approvalUrl` is the fixed local UI `http://127.0.0.1:3000/` and contains no
  credentials. A refusal is `{ ok: false, reason, code? }`; preserve the rule
  code in MCP errors. The agent may call `list_tasks` again after human approval.

The MCP adapter exposes exactly these three tools and has no approval tool,
setup code, approver cookie, CSRF token, or direct access to `data.json`.

## Human approval API
Run one backend process on `127.0.0.1`, with the UI at
`http://127.0.0.1:3000` and API at `http://127.0.0.1:4000/api`.

- On startup, the backend prints a random one-time setup code only to its
  terminal. The person enters it into the local UI.
- `POST /api/approval-session` with exactly `{ code }` exchanges that code for
  an opaque HttpOnly, SameSite=Strict cookie and
  `{ authenticated: true, csrfToken }`. Only the exact UI Origin can bootstrap;
  missing or foreign Origin fails closed. The code is consumed once.
- `GET /api/approval-session` requires the exact UI Origin. It returns
  `{ authenticated: false }` without a valid cookie, or
  `{ authenticated: true, csrfToken }` for the existing browser session.
- `POST /api/proposals` with `{ taskId, memberId }` validates stored IDs, task
  availability, and current capacity, then stores a pending proposal in memory.
- `GET /api/proposals` returns `{ proposals: [...] }` with refreshed displayed
  details; unavailable tasks are removed. No board write occurs.
- `POST /api/proposals/:id/approve` requires the cookie, exact UI Origin, and
  `X-CSRF-Token`. Its body is exactly `{ expectedCurrent, expectedPoints }`
  copied from the displayed proposal. It returns `{ ok: true, task }` after
  saving, or `{ ok: false, reason, code? }` without a write. A stale review
  returns HTTP 409 with `code: "stale_proposal"` and a refreshed `proposal`;
  the UI must display it and require another human click, never auto-resubmit.
- `POST /api/proposals/:id/reject` uses the same authorization with an empty
  object body, returns `{ ok: true }`, and removes the pending proposal.
- `POST /api/assign-task` is retired (HTTP 410); `approved: true` is never an
  approval credential and extra fields are rejected.

Browser session/approval requests use `credentials: "include"`. CORS allows
only the exact UI Origin with credentials. Session responses are not cached.
Setup codes, cookies, and CSRF tokens stay out of tool payloads, configuration,
URLs, and logs after setup. This is a local workshop approval gate, not a
sandbox against a process separately granted filesystem or shell access.

## Hard rule and persistence
The 8-point rule lives only in `backend/src/domain/capacity.ts`. Proposal
creation and the internal `assignTask()` commit reuse it. `assignTask()`
independently re-reads the board, checks task availability and current capacity,
and then calls the only writer in `backend/src/data/store.ts`. Keep this final
read/check/write synchronous inside one backend process. MCP subprocesses call
HTTP; they never import the store or start another board writer.

## Partly-valid requests
When a request only partly fits (for example, 5 of 6 requested tasks), report
each refusal explicitly rather than dropping tasks or forcing assignments.
Successful proposals still each need human approval. The agent may suggest
spreading refused tasks to another member with room, matching Case 3 in
`../sprintboard_project_spec.md`. Do not introduce a batch transaction engine.
