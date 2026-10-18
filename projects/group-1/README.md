# Group 1: Workshop Room Booking Agent

An agent that helps workshop participants find and request room bookings, while enforcing a maximum booking length of three hours.

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
npm install
npm start      # starts the agent
npm test
```

## Demo cases
1. A request to book a room for two hours is checked and, after user approval, created.
2. A request to book a room for four hours is refused because it exceeds the three-hour limit.
3. A valid three-hour booking request shows an approval prompt before it is created.
