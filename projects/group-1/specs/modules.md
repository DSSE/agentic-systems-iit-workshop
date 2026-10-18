# CampusDesk: Testable Module Plan

Build and verify the modules in order. Keep the three-hour and overlap rules in one domain module; every entry point must call it. Each module can be developed on its own branch and integrated through its public interface.

## Module breakdown

| ID | Module / owner suggestion | Responsibility and interface | Pass/fail checks |
|---|---|---|---|
| M0 | Harness and progress / lead | Project scripts, test runner, seed data shape, and `progress.html`. | A clean checkout can install dependencies, start the app, run the test command, and render the progress page. Record phase 1 and its evidence. |
| M1 | Domain rules / guardrails | Pure functions for duration, time-range validity, same-lab overlap, and stable rule codes. Example: `validateBooking(data, proposal) -> { ok, code?, message? }`. | Unit tests: 3h passes; 3h1m fails with `DURATION_EXCEEDS_LIMIT`; end <= start fails with `INVALID_TIME_RANGE`; overlapping same-lab slot fails with `BOOKING_OVERLAP`; another lab at the same time passes. Test injection-like room notes do not alter outcomes. |
| M2 | Data and persistence / backend | Read rooms/bookings from `data.json`; persist bookings only through the approved creation path. | List returns seeded rooms/bookings. Check/list never modify the file. Rejected, unapproved, or invalid create leaves file byte-for-byte unchanged. Approved valid create adds exactly one booking. |
| M3 | HTTP API / backend | Expose list, availability-check, and create endpoints; call M1 for every check and create. | API integration tests cover valid proposal, each rule code, and create attempts that bypass check. An overlong or overlapping create is rejected even when called directly. No write without approval. |
| M4 | Web UI / frontend | Room list, booking form, validation feedback, exact proposal review, and Approve action. | UI flow can list rooms, submit a valid proposal, and save only after clicking Approve. Boundary/overlap failures show clear messages and cannot be submitted. Declining leaves data unchanged. |
| M5 | MCP server / tools | Publish `list_rooms`, `check_availability`, and `create_booking` over MCP; delegate to M1/M2, never duplicate rules. | MCP tool tests return the same results and rule codes as M3. Direct `create_booking` calls enforce rules and approval. Tool descriptions identify inputs and side effects. |
| M6 | Agent and prompt / agent core | Parse requests, ask clarifying questions, call MCP tools, summarize proposals, and request approval. Provider configured from environment (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) or supported SDK. | Case 1 produces a proposal after required details are known; case 4 refuses and may suggest a compliant slot; case 5 asks for time and group size. Agent cannot save without the explicit approval path. Include a mock-model test so core behavior works without a paid key. |
| M7 | UI chat integration / frontend + agent | Put the agent chat in the app UI and route tool calls through MCP. | End-to-end case 1 succeeds from chat after approval; case 5 gets a clarifying question. Proposal shown for approval matches the arguments sent to create. |
| M8 | Evals and prompt comparison / QA | Run all six behavior cases against two prompt versions and record outcomes. | Results report pass/fail per case and prompt version. Cases 1–5 meet the behavior spec; case 6 is blocked. Tests are repeatable with a fixed fixture and deterministic/mock model. |
| M9 | Cross-client guardrails / QA | Verify the rule holds through UI, API, MCP, and agent. Treat user text and stored notes as untrusted. | Case 6 injection fixture cannot cause any client to propose/save a booking over 3h. Direct API/MCP create also rejects. No test relies only on the prompt to enforce the rule. |
| M10 | Demo and handoff / whole team | Seed a clean demo dataset, rehearse normal, boundary, unclear, and injection cases, and document run steps. | Demo can be reset and repeated. Show approval before persistence and evidence for all completed phases. `progress.html` contains an entry at the end of each phase. |

## Suggested phase gates

These align with the workshop development phases. Do not start a later gate until its checks pass and the result is recorded in `progress.html`.

1. **Set up harness:** M0, spec reviewed, seed schema agreed.
2. **Backend and frontend:** M1–M4. Gate: create/check/list work in the UI; only Approve writes.
3. **Test behavior:** finish case 1–3 tests (including boundary and overlap). Gate: all pass.
4. **MCP and one agent:** M5–M6. Gate: tools run through the shared domain rules.
5. **Agent in UI:** M7. Gate: normal request works from chat and unclear request gets a question.
6. **Prompt evals:** M8. Gate: all six cases run for both prompt versions.
7. **Guardrails:** M9. Gate: injection case is blocked through every client.
8. **Demo:** M10. Gate: repeatable demo and phase evidence are ready.

## Suggested team split

- **Backend/domain:** M1–M3; own validation, persistence, and API integration.
- **Frontend:** M4 and M7; integrate against the agreed API and MCP contract.
- **MCP/agent:** M5–M6; use the shared domain-backed tools and keep model settings configurable.
- **QA/guardrails:** define fixtures early; pair on M1–M9 tests, especially direct create and injection checks; own M8–M10 evidence.
- **Lead/integrator:** M0, agree interfaces and data format, review cross-module integration, and keep `progress.html` current.

The split is a suggestion; each module's interface and pass/fail checks are the contract regardless of who implements it.
