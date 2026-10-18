# CampusDesk delivery plan

Specification: [specs/agent.md](specs/agent.md). Phase evidence:
[progress.html](progress.html). Harness guide: [HARNESS.md](HARNESS.md).

## Basics

- [x] Phase 1 — Set up the harness: shared instructions, Codex configuration,
  Claude settings, discoverable build/verification skills, and progress log.
- [ ] Phase 2 — Build backend/frontend: seeded rooms/bookings, shared domain
  validation, three tools, UI/API, proposal display and verified approval flow.
  Add real run/test scripts and update README and AGENTS when available.
- [ ] Phase 3 — Test behavior: normal approval, rejection/no write, 180/181-minute
  boundary, five-hour refusal, overlap/adjacency, input/capacity checks, direct
  creates, approval mismatch, stale proposals, and concurrent conflicts.

**Basics exit:** workshop cases 1–3 work in the UI and behavior tests pass.
Harness completion alone does not complete Basics.

## Intermediate

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
evidence. Next work: Phase 2, backend/frontend implementation.
