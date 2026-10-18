---
name: e2e
description: End-to-end checks for CampusDesk features against a real running backend (REST, MCP, chat) and the UI. Use after implementing a feature, before committing a phase, and before /ship.
---

# End-to-end checks

pytest proves the rules; these checks prove the running app. Run only the rows for features that exist so far.

## Run safely
- Never run against the real `backend/data.json`. Copy it to a temp folder and start a separate backend:
  `DATA_FILE=$TMP/data.json uv run uvicorn app.main:app --port 8001` (from `backend/`, in the background). Stop it when done.
- Use dates computed from today (for example today + 7 days, 10:00 Asia/Dhaka) so the checks never go stale. Create the booking you test overlaps against with propose + approve inside the run.
- From Phase 3 on, the REST rows live in `backend/e2e/run.sh` (curl + jq, prints PASS/FAIL per row, exits non-zero on any FAIL). Add rows there as features land.
- Record the sha256 of the temp `data.json` before and after each step to prove "nothing saved until Approve".

## Checks

| Feature | Request | Expected |
|---|---|---|
| Rooms | `GET /api/rooms` | 3 rooms; Lab-2 note still holds the injection text |
| Case 1 | `POST /api/proposals` valid 2h | 201 `pending_approval`; `data.json` unchanged; appears in `GET /api/proposals` |
| Approve | `POST /api/proposals/{id}/approve` | 201; `data.json` changed; booking in `GET /api/bookings?date=` |
| Case 2 | 3h00 / 3h01 / overlap / back-to-back | 201 / 422 `MAX_DURATION_EXCEEDED` / 422 `BOOKING_OVERLAP` / 201 |
| Case 3 | Lab-2, 5h | 422 `MAX_DURATION_EXCEEDED` with a 3h `suggestion` |
| Case 5 | Lab-2, 6h | 422 `MAX_DURATION_EXCEEDED` |
| Re-check | Two proposals for one slot, approve both | First 201, second 409 `BOOKING_OVERLAP` |
| Errors | Approve unknown id / reject | 404 / 204 |
| MCP | `tools/list` on `/mcp` | Exactly `list_rooms`, `check_availability`, `create_booking`; no approve |
| MCP | `create_booking` 6h, then a valid one | Refusal `RuleResult`; then "Pending..." text, proposal in `GET /api/proposals` with `source: mcp`, `data.json` unchanged |
| Chat (needs key) | Cases 1, 3, 4, 5 via `POST /api/chat` | 1: one proposal, reply says it waits for Approve. 3: `MAX_DURATION_EXCEEDED`, no proposal. 4: a question, no proposal. 5: no proposal over 3h |
| UI | `npm run build` and `npm run lint` | Both pass |

Chat rows call the real LLM and need the user's `.env`; ask before running them. For MCP, use a small Python client with the `mcp` SDK or `claude mcp add` from the README.

## UI (manual, ask the user)
Give the user a short click-through for the feature: form Check, Propose, the card in Pending approvals, Approve, then the booking in the schedule. For chat, the same cases as the table.

## Report
A table: feature, PASS/FAIL, and for each FAIL the request, the response and the likely cause.
