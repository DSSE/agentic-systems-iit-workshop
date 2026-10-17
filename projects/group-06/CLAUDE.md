# <Project name> (Group <N>)

<One line: what the agent does.>

## Commands
- Run: `npm start`
- Test: `npm test`

## Structure
- `data.json`: the data the tools read and write
- `specs/agent.md`: the spec; build from it
- `src/tools.js`: list, check and create tools
- `src/agent.js`: the agent

## Conventions
- Node, ES modules, no new dependencies without asking
- The create tool re-checks the hard rule itself, even if check was called first

## Never do
- Never edit files outside this folder
- Never write to `data.json` except through the create tool
- Never weaken or delete a test to make it pass
