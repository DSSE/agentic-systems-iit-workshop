# <Project name> (Group <N>)

<One line: what the agent does.>

## Commands
- Run: `npm start`
- Test: `npm test`

## Structure
- `data.json`: the data the tools read and write
- `specs/agent.md`: the spec; build from it
- `backend/`: NestJS API. `src/domain/loan-rules.ts` holds the hard rule; `src/loans/loans.service.ts` has the list, check and create tools
- `frontend/`: React UI (form and chat panel; only Approve saves)
- `backend/src/tools/tools.ts`: the three tools, shared by the MCP server and the chat agent. `backend/src/mcp/`: stdio MCP server (`node backend/dist/mcp/main.js`). `backend/src/agent/`: chat agent for the UI; it never gets `create_loan`

## Conventions
- Node and TypeScript: NestJS backend (CommonJS), React + Vite frontend (ES modules). No new dependencies without asking
- The create tool re-checks the hard rule itself, even if check was called first

## Never do
- Never edit files outside this folder
- Never write to `data.json` except through the create tool
- Never weaken or delete a test to make it pass
