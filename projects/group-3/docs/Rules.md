# Rules
- Amounts are whole BDT integers.
- Rule refusals return `{ ok:false, code:'OVER_BUDGET', ... }`; HTTP 422; MCP `isError: true`.
- Errors teach the fix: say what failed, why, and what to do (suggest a smaller order).
- No `console.log` in `src/mcp/` (stdout is the protocol). Use `console.error`.
- Tests cover real behavior through the real store, API and MCP server. No mocking of our own domain.
- Any new client must call the store. Run `npm run verify` before committing.
