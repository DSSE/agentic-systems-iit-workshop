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

- [x] Phase 4 implementation — Expose all three tools through authenticated
  Streamable HTTP MCP and a stdio bridge. Two independent MCP agent clients
  exercise the real tool loop in tests. Staff approval invokes the MCP create
  tool with a server-owned review context; external clients cannot fabricate it.
- [x] Phase 5 implementation — Add Gemini-compatible UI chat with MCP tool
  calls, clarification, exact previews, student submission and staff review.
  The complete UI workflow passes browser tests with an isolated test provider.
- [ ] Live acceptance — Demonstrate the normal and unclear requests with
  Gemini in UI chat and run `npm run demo:agents` inside `server/`.
  Blocked: the supplied Google project returned `403 PERMISSION_DENIED`.

**Intermediate exit:** a normal request works through chat; an unclear request
asks for missing details; both connected agents can use the MCP tools.

## Optional advanced and demo

- [x] Phase 6 implementation — Two prompt versions, five workshop cases
  expanded into seven scenarios, a scoring rubric and JSON reports. Both
  versions pass 7/7 deterministic contract checks. These do not score model quality.
- [ ] Phase 6 live comparison — Complete a successful real Gemini comparison.
  The attempted run encountered provider failures/quota; see `evals/live-results.json`
  and `evals/provider-diagnostic.json`. No model-quality conclusion is claimed.
- [x] Phase 7 — Test injection defenses across UI/API, MCP, and chat tool
  execution. Notes are excluded from model tool results, unauthorized model
  calls fail closed, all creates revalidate, and students cannot grant approval.
- [x] Phase 8 — Add `DEMO.md` with exact demo dates and reproducible commands,
  environment examples and a combined project launcher.

**Advanced exit:** room-note injection cannot bypass policy from any client.

For each phase, record the date, delivered files/behavior, actual validation,
and remaining gaps in `progress.html`. Keep these checkboxes aligned with that
evidence. Remaining acceptance work: enable Gemini access, restart the API,
then run `model:check`, live evals and `demo:agents` inside `server/`.
