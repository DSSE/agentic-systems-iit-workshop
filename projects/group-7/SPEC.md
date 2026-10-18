# ClubOps implementation specification

## Data and money

`data.json` is the authoritative fixture. Its prices and cap are BDT integers;
the Python importer stores them as integer poisha (`BDT * 100`) in `clubops.sqlite3`.
The importer is idempotent and never overwrites an existing database.

## API

- `GET /api/state` returns the event, vendors, approved expenses, and cap totals.
- `GET /api/vendors` returns server-authoritative vendor records.
- `POST /api/check` accepts `{items:[{vendor_id,quantity}]}` and never writes.
- `POST /api/proposals` creates a temporary proposal only.
- `POST /api/proposals/{id}/approve` is UI-only and atomically commits expenses.
- `POST /api/proposals/{id}/reject` discards a temporary proposal.

Errors use codes such as `UNKNOWN_VENDOR`, `BUDGET_CAP_EXCEEDED`, and
`PROPOSAL_NOT_FOUND`. Exactly reaching the cap is valid.

## MCP

`backend/mcp_server.py` uses the official Python MCP SDK stdio transport and calls
the FastAPI service. It has no approval tool. Set `CLUBOPS_API_URL` when the API
is not on `http://127.0.0.1:8000`.

## Acceptance criteria

The existing Node test suite covers the five workshop scenarios and passes 44/44.
The Python API preserves the same budget and approval boundaries and adds SQLite
persistence. Live Qwen evaluations use the existing `npm run eval` harness.
