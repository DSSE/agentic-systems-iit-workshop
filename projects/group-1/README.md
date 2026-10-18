# Group 1: CampusDesk

Books the department's lab rooms. A full-stack app (React + FastAPI), an MCP server and an AI agent, all enforcing one hard rule: **a booking is at most 3 hours**. Nothing is saved until a person approves it.

See [specs/agent.md](specs/agent.md) for the full spec and [progress.html](progress.html) for progress by phase.

## Team
| Role | GitHub username |
|---|---|
| Lead | TBD |
| Agent core | TBD |
| Patterns | TBD |
| MCP / tools | TBD |
| Guardrails & QA | TBD |

## Run
```bash
# Backend (terminal 1)
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m uvicorn app.main:app --reload      # http://127.0.0.1:8000
.venv/Scripts/python -m pytest

# Frontend (terminal 2)
cd frontend
npm install
npm run dev     # http://localhost:5173
npm test
```

To try bookings without changing the real `data.json`, start the backend with `DATA_PATH` pointing at a copy, e.g. `DATA_PATH=/tmp/data.json`.

## API
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/rooms` | none | `{rooms, bookings}` |
| POST | `/api/check` | `room_id, start, end, group_size` | `{ok}` or `{ok: false, code, reason}` |
| POST | `/api/bookings` | the above plus `requester, purpose, approved` | 201 `{ok, booking}`, or 422 `{ok: false, code, reason}` |

| POST | `/api/chat` | `messages: [{role, content}], requester` | `{reply, proposal}`; a proposal is saved only via `/api/bookings` on Approve |

## Chat agent
1. Copy `.env.example` to `.env` (in this folder) and paste your free Gemini key from https://aistudio.google.com/apikey into `LLM_API_KEY`. Check `LLM_MODEL` is a model AI Studio lists.
2. Restart the backend, open the UI and switch to the **Chat** tab.
3. Try "Book a lab for 3 people Thursday afternoon." (a proposal card appears; only Approve saves it) and "Book a room for tomorrow." (it asks for the time and group size).

The agent talks to the MCP server through an MCP client. Any OpenAI-compatible provider works; change the three `LLM_*` values to switch.

## MCP server
The same three tools, for any coding agent. Run Claude Code or Gemini CLI from this folder (`projects/group-1`):

- **Claude Code** reads [.mcp.json](.mcp.json). Approve the `campusdesk` server when asked, then check it with `/mcp`.
- **Gemini CLI** reads [.gemini/settings.json](.gemini/settings.json), but only in a trusted folder. Run `gemini` here once and choose to trust the folder, then check with `/mcp`.

The configs use the Windows venv path `backend/.venv/Scripts/python.exe`; on macOS/Linux change it to `backend/.venv/bin/python`.
Over MCP, `create_booking` needs `approved: true`, which the agent must only send after you say yes. Every rule is re-checked either way.

For HTTP clients: `cd backend && .venv/Scripts/python -m app.mcp_server --http` serves `http://127.0.0.1:8001/mcp`.

## Demo cases
1. **Normal:** "Book a lab for 3 people Thursday afternoon." gives a proposal that is saved only after Approve.
2. **Boundary:** a 3-hour booking gives a proposal; a 3-hour-1-minute booking and an overlapping booking fail with their rule codes.
3. **Breaks the rule:** "Book Lab-2 for 5 hours." is refused with `MAX_DURATION_EXCEEDED`.
4. **Unclear:** "Book a room for tomorrow." gets a question back about the time and group size.
5. **Injection:** a room note claiming staff are exempt from the cap is ignored.
