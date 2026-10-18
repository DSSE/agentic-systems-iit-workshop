# CampusDesk delivery plan

Specification: [specs/agent.md](specs/agent.md). Phase evidence:
[progress.html](progress.html). Harness guide: [HARNESS.md](HARNESS.md).

## Basics

- [x] Phase 1 — Set up the harness: shared instructions, Codex configuration,
  Claude settings, discoverable build/verification skills, and progress log.
- [x] Phase 2 — Build backend/frontend: seeded rooms/bookings, shared domain
  validation, three tools, UI/API, proposal display and verified approval flow.
  Add real run/test scripts and update README and AGENTS when available.
  Built as `server/` (Express API) + `web/` (Next.js UI).
- [x] Phase 3 — Test behavior: normal approval, rejection/no write, 180/181-minute
  boundary, five-hour refusal, overlap/adjacency, input/capacity checks, direct
  creates, approval mismatch, stale proposals, and concurrent conflicts.
  Covered by `server/tests/` (21 automated tests) and a manual curl/UI pass;
  UI chat clarification (case 4) and injection guardrails (case 5) are not
  built yet — those land in Phases 5 and 7.

**Basics exit:** workshop cases 1–3 work in the UI and behavior tests pass.
Harness completion alone does not complete Basics. Met.

## Intermediate

### Requested extension: role-based booking workflow

- [x] Separate student and staff sign-in with server-owned identities/roles.
- [x] Students submit and track only their own requests; pending requests can
  be cancelled. Staff independently approve/reject, with no self-review.
- [x] Persist requests and review history; atomically bind staff approval to
  an exact request and recheck the original booking invariants.
- [x] Verify roles/auth, ownership, forged/direct requests, rejection,
  cancellation, expired sessions/previews and concurrent approvals in isolated
  tests. All 37 backend tests pass; frontend lint and production build pass.

The updated API and UI run locally on ports 4000 and 3000. Sign-in, authorized
reads, logout and HTTP page rendering were checked; interactive browser checks
were unavailable because this session exposes no browser. Local workshop
accounts are implemented; production SSO/user administration remain separate.

### MCP and chat (unchanged milestones)

- [ ] Phase 4 — Expose all three tools through MCP and connect two AI agents.
- [ ] Phase 5 — Add UI chat using the shared tools and approval flow.

**Intermediate exit:** a normal request works through chat; an unclear request
asks for missing details; both connected agents can use the MCP tools.

## Optional advanced and demo

- [ ] Phase 6 — Evaluate all five cases against two prompt versions.
- [ ] Phase 7 — Verify injection guardrails across UI/API, MCP, and chat.
- [ ] Phase 8 — Prepare seeded demo scenarios with exact dates, times, results,
  and reproducible launch instructions.

**Advanced exit:** room-note injection cannot bypass policy from any client.

For each phase, record the date, delivered files/behavior, actual validation,
and remaining gaps in `progress.html`. Keep these checkboxes aligned with that
evidence. Next work: Phase 4, MCP server.
