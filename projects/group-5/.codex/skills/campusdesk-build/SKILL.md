---
name: campusdesk-build
description: Implement CampusDesk delivery-plan features using its booking specification and shared domain rules.
---

# Build a CampusDesk feature

Resolve project paths from `projects/group-5/`, regardless of which discovery
path loaded this skill. Read `AGENTS.md`, `specs/agent.md`, and the relevant
phase of `PLANS.md`. Inspect existing code before choosing files or commands.

Select the requested deliverable within the active milestone. The harness is
phase 1; do not treat its completion as permission to build later phases.

For Basics implementation:

- Keep `list_rooms`, `check_availability`, and `create_booking` backed by one
  domain validation module. API routes and later MCP adapters delegate to it.
- Implement explicit-offset timestamps, positive integer group sizes, the
  180-minute boundary, half-open interval conflicts, and the spec's error codes.
- Make a proposal read-only. A student confirms submission of a pending
  request; only independent authenticated staff can approve the immutable
  request. Revalidate at creation time. Never trust an agent's `approved: true`.
- Keep conflict checking and persistence within a serialized operation; a
  failure must leave stored bookings intact.
- In the UI, show room, date, timezone, start/end, duration, and group size
  before submission and staff review. Rejection never creates a confirmed
  booking. Surface structured errors.

Add only the dependencies already authorized. Keep any later model integration
configurable through `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`.

For MCP/chat, reuse `server/src/mcp.js` and the server-owned principal. Public
MCP and model calls never grant human approval. The staff review API supplies
its approval context to the MCP create tool. Keep the stdio bridge connected
to the same running API to preserve one serialized data writer. Report live
model results separately from offline contract fixtures.

Use `campusdesk-verify` for the relevant acceptance cases. Update the completed
phase and its real evidence in `PLANS.md` and `progress.html`; report what is
still missing without marking the whole milestone complete.
