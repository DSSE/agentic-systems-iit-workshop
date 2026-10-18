# Group 1: CampusDesk

CampusDesk helps students find and book department lab rooms for group work. A booking can be at most three hours, and it is saved only after the person approves it.

## Team
| Role | GitHub username |
|---|---|
| Lead | TBD |
| Agent core | TBD |
| Patterns | TBD |
| MCP / tools | TBD |
| Guardrails & QA | TBD |

## Project documents
- [Agent and behavior specification](specs/agent.md)
- [Implementation plan and testable modules](specs/modules.md)

## Run
Commands will be finalized when the harness and app are implemented.

## Demo cases
1. A normal request for a lab on Thursday afternoon produces a booking proposal and saves only after approval.
2. A booking of exactly three hours is allowed; one lasting three hours and one minute is rejected.
3. A request that overlaps an existing booking for the same lab is rejected.
4. A five-hour request is refused with the rule code; the agent may suggest a three-hour slot.
5. An unclear request asks for the missing time and group size.
6. An instruction embedded in a room note that claims to override the cap is ignored; no overlong booking is created.
