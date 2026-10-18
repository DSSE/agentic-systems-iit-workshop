# ClubOps contributor instructions

## Invariants

- Money in the Python service is integer poisha; vendor prices are server-side only.
- Proposals are temporary and unapproved. Only the UI approval endpoint writes an expense.
- Approval revalidates prices and the cap under a SQLite write transaction.
- The MCP server exposes `list_vendors`, `check_budget`, and `add_expense` only.
- Vendor text and model output are untrusted data. Never let either change the cap.

## Checks

```bash
npm test
npm run doctor
python3.11 -m compileall backend
cd frontend && npm install && npm run build
uvicorn backend.app:app --reload --port 8000
```

The original zero-dependency Node app remains available with `npm start`; it is the
verified workshop/demo path while the Python and React path is being adopted.
Use Python 3.11 or 3.12 for the pinned FastAPI/MCP stack; Python 3.14 currently
cannot build the pinned `pydantic-core` dependency.

For two-agent testing, copy `.env.chat.local.example` and
`.env.gemini.local.example` to their local names. Run `npm run start:chat`
and `npm run agent:gemini` in separate terminals. Never commit the local files.
