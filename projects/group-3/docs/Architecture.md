# Architecture

```
 Browser UI ──► Express API ──┐
 Chat panel ─► /api/chat ─► Agent ─► MCP client ─► MCP server ──┼─► src/domain/store.js ─► budget.js (THE RULE)
 Claude Code / Codex / Gemini CLI / Cursor ──────► MCP server ──┘            └► guardrails.js
```

- `src/domain/budget.js`: the hard rule, pure functions, integer BDT.
- `src/domain/guardrails.js`: removes instruction-like text from vendor data (prompt injection).
- `src/domain/store.js`: all reads/writes; proposals vs approved expenses; re-checks the rule at approval.
- `src/api/`: REST for the UI. No budget logic.
- `src/mcp/server.js`: 3 tools over stdio. No approve tool.
- `src/agent/`: model-independent loop (OpenAI-compatible API), prompts v1/v2, offline mock model.
- State: `data.json` is the seed (never edited at runtime); live state is `.state.json` (git-ignored). `npm run reset` re-seeds.

Invariants
- A proposal is not an expense. Only `approveProposal` (called by the Approve button) saves.
- Pending proposals count toward the cap when a new proposal is checked; approval checks again.
