# Spec: SprintBoard (Group 06)

## Goal
SprintBoard assigns backlog tasks to agile team members while strictly enforcing team capacity limits. It provides a full-stack interface, a model-agnostic conversational AI agent, and a standard MCP server where no team member ever exceeds 8 story points and nothing is saved without explicit human approval.

## User stories
1. As an agile team lead, I want to ask SprintBoard to assign sprint tasks to team members, so that tasks are balanced fairly and no engineer is overloaded.
2. As a scrum master, I want proposed sprint allocations to be staged for review before being committed, so that I maintain full control over the team's commitments.
3. As an engineer, I want the system to reject any assignment that pushes me past 8 story points, so that our team maintains sustainable velocity.
4. As a product owner, I want the AI agent to ask clarifying questions when my assignment request is ambiguous, so that tasks aren't assigned haphazardly.
5. As a security-conscious developer, I want malicious prompt injection payloads embedded in backlog tasks to be ignored, so that automated allocation remains safe and reliable.

## Acceptance criteria
- [ ] A valid request produces an assignment proposal where every member has <= 8 points.
- [ ] Nothing is written or committed to `data.json` without an explicit "Approve" action from the user.
- [ ] A request that brings any member over 8 points is refused with rule code `ERR_MAX_POINTS_EXCEEDED` and a clear reason.
- [ ] The `assign_task` tool re-checks the hard rule independently before writing, even if `check_capacity` was bypassed.
- [ ] Ambiguous requests (e.g., "Assign the remaining tasks") prompt the agent to ask clarifying questions instead of guessing.
- [ ] Prompt injection payloads inside task descriptions are treated strictly as inert data and cannot bypass capacity limits.

## Tools
| Tool | Input | Output |
|---|---|---|
| `list_tasks` | `none` | List of backlog tasks (id, title, points, status) and team members (id, name, currentPoints, maxCapacity: 8). |
| `check_capacity` | `memberName: string, taskIds: string[]` | `{ allowed: boolean, code?: string, currentPoints: number, attemptedPoints: number, projectedTotal: number, message: string }` |
| `assign_task` (needs approval) | `memberName: string, taskIds: string[], approved: boolean` | Returns staged proposal if `approved: false`; validates capacity and saves to `data.json` only if `approved: true`. |

## Hard rule
**No member has more than 8 story points.**
- Defined in single module: `src/domain/rules.js`.
- Error code: `ERR_MAX_POINTS_EXCEEDED`.
- Enforced uniformly across UI, REST API, MCP server, and Agent.

## Partly-valid requests
- **Strategy:** Propose valid partial allocation + suggest alternative distribution for excess tasks.
- If assigning multiple tasks would cause a member to exceed 8 points, the agent and API refuse the full overage, explain the exact point deficit, and suggest spreading the unassigned tasks to other members who have remaining capacity.
