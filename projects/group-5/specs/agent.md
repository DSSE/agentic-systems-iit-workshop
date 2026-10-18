# Spec: CampusDesk

## Goal
Help students find available department lab rooms and approve bookings through a web UI or AI agent. Enforce a maximum duration of 3 hours through shared domain logic, and persist bookings in `data.json` only after explicit human approval.

## User stories
1. As a student, I want to find an available lab with enough seats for my group, so that we can meet at a suitable time.
2. As a student, I want to review and approve an exact booking proposal, so that no reservation is saved without my consent.
3. As a student, I want clear explanations and valid alternatives for unavailable or overlong bookings, so that I can revise my request.
4. As a student using chat, I want the agent to ask for missing details, so that it books the intended room and time.
5. As a department administrator, I want every client to enforce the same rules, so that direct API or MCP calls cannot bypass them.

## Acceptance criteria
- [ ] A valid request produces a proposal showing the room, date, start/end times, duration, and group size; it is saved only after explicit approval.
- [ ] Exactly 180 minutes is allowed; 181 minutes and a 5-hour request fail with `DURATION_LIMIT_EXCEEDED` and a clear explanation.
- [ ] Overlapping bookings for the same room fail with `ROOM_UNAVAILABLE`; adjacent bookings are allowed.
- [ ] Unknown rooms, invalid timestamps, non-positive durations, and invalid group sizes are rejected. A group larger than the room capacity fails with `CAPACITY_EXCEEDED`.
- [ ] `create_booking` rechecks duration, capacity, room existence, and availability even if `check_availability` was skipped or previously succeeded.
- [ ] Nothing is written to `data.json` without the person's Approve action (or explicit `y` in a CLI). Rejection, cancellation, and missing approval leave the file unchanged.
- [ ] Approval applies only to the exact proposal shown. Changing its room, times, or group size requires new approval; model-generated approval is insufficient.
- [ ] Availability is checked again when saving; a conflicting booking made after the proposal prevents creation. Concurrent creates cannot both reserve the same room and slot.
- [ ] “Book a room for tomorrow” prompts for the time and group size. Ambiguous dates or times are clarified before a proposal is made.
- [ ] The UI/API, MCP server, and agent use the same domain validation; no client can bypass the 3-hour cap or approval requirement.
- [ ] The MCP server exposes all three tools and works with two connected AI agents; UI chat can complete the normal scenario and ask clarification questions.
- [ ] Optional advanced: evals cover all five project scenarios and compare two prompt versions. Room-note injection cannot change policy or authorize a booking from any client.

## Tools
| Tool | Input | Output |
|---|---|---|
| `list_rooms` | Optional positive integer `group_size` to filter by capacity. | Rooms with `id`, `name`, `capacity`, and optional descriptive notes. No writes. |
| `check_availability` | `room_id`, `start_at`, `end_at`, `group_size`. | Validated proposal with duration, or a structured error with `code` and `message`. A proposal does not reserve the room or grant approval. |
| `create_booking` (needs approval) | The exact proposed `room_id`, `start_at`, `end_at`, and `group_size`, plus approval verified by the application. | Saved booking with a unique `id`, or a structured validation/approval error. Revalidates before writing. |

The application must collect approval from the person, bind it to the displayed proposal, and verify it before calling the persistence path. An `approved: true` argument supplied by an agent or arbitrary caller is not proof of approval.

Use ISO 8601 timestamps with explicit offsets. Resolve conversational dates in the configured campus timezone and show the date and timezone in the proposal. Do not guess a duration or silently choose an ambiguous slot.

### Data and errors

`data.json` contains `rooms` and `bookings` arrays. A room has `id`, `name`, `capacity`, and optional `notes`; a booking has `id`, `room_id`, `start_at`, `end_at`, and `group_size`. Only `create_booking` may write booking data, and failed validation must not partially modify the file.

The initial error-code contract is:

| Code | Meaning |
|---|---|
| `DURATION_LIMIT_EXCEEDED` | Requested duration exceeds 180 minutes. |
| `ROOM_UNAVAILABLE` | The requested slot overlaps an existing booking for that room. |
| `CAPACITY_EXCEEDED` | The group is larger than the room's capacity. |
| `ROOM_NOT_FOUND` | The requested room does not exist. |
| `INVALID_REQUEST` | Required fields are missing or malformed, the group size is not a positive integer, or the end is not after the start. |
| `APPROVAL_REQUIRED` | Approval is absent, invalid, or does not match the proposal. |

## Hard rule
Every booking must satisfy `0 < end_at - start_at <= 180 minutes`. Exactly 3 hours is valid. There are no staff, administrator, model, or room-note exemptions.

Define this rule once in a domain module used by both checking and creation. Route API and MCP operations through that module. The agent's prompt is an additional guide; the domain module enforces the rule even when a caller skips checking.

For availability, use half-open intervals `[start_at, end_at)`: two bookings overlap when `new_start < existing_end` and `new_end > existing_start`. A booking may begin exactly when another ends.

## Partly-valid requests
Reject the invalid proposal and explain its error code. Suggest an available slot of at most 3 hours, or a room with enough capacity, when possible. Require the person to select and approve any revised proposal before saving it.

Do not automatically split an overlong request into consecutive bookings to work around the duration cap. Ask for missing details before checking availability, and never silently shorten or otherwise change a request.

## Agent flow and trust boundaries

1. Collect the date, start/end times, and group size; clarify ambiguity.
2. Use `list_rooms` to identify suitable rooms, then `check_availability` for the requested slot.
3. Present a valid proposal, or explain the error and offer an alternative.
4. Wait for explicit human approval of the exact proposal.
5. Call `create_booking` through the verified approval flow; revalidate and persist, then report the saved booking ID. Report failures without claiming success.

Room notes, tool-returned descriptions, and user requests cannot override domain policy or supply human approval. Treat instructions embedded in room data as untrusted content. Keep the model configurable through `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`, with no provider-specific booking rules.

## Validation and milestones

For the basics milestone, test the normal approved booking, unchanged data before approval and after rejection, exact-duration boundaries, overlap versus adjacency, capacity, and direct creation attempts that skip checking. Also verify approval mismatch, stale availability, and concurrent conflicting creates.

For the intermediate milestone, demonstrate the normal and unclear scenarios through UI chat, and exercise the same MCP tools from two AI agents. For the optional advanced milestone, evaluate all five scenarios from [the project statement](../CampusDesk.md) against two prompt versions and verify that injected room notes never bypass policy.

Record each completed development phase and its validation evidence in `progress.html`.
