# Spec: CampusDesk

## Goal
Help students request available department lab rooms through a web UI or AI agent. Staff independently review and approve or reject requests. Enforce a maximum duration of 3 hours through shared domain logic, and persist confirmed bookings only after explicit approval by authenticated staff other than the requester.

## User stories
1. As a student, I want to find an available lab with enough seats for my group, so that we can meet at a suitable time.
2. As a student, I want to review and submit an exact booking request and track staff's decision; I cannot approve it myself.
3. As a student, I want clear explanations and valid alternatives for unavailable or overlong bookings, so that I can revise my request.
4. As a student using chat, I want the agent to ask for missing details, so that it books the intended room and time.
5. As a department administrator, I want every client to enforce the same rules, so that direct API or MCP calls cannot bypass them.
6. As lab staff, I want to review the student's identity, purpose, room, times and group size before approving or rejecting their request with a note.

## Roles and request lifecycle

- Sign-in establishes a server-owned `student` or `staff` principal. A role or
  user ID supplied in a request body is never trusted. No public role switch or
  staff registration is provided.
- Students check availability, review the exact preview, then submit a pending
  request. They see only their own requests and may cancel a pending request.
- Staff see all requests. Approval creates the confirmed booking; rejection
  requires a reason and creates no booking. Staff cannot request on behalf of a
  student or review their own request, even following a role change.
- A request transitions once from `pending` to `approved`, `rejected`, or
  `cancelled`. Its slot and requester are immutable. Approval binds to its ID
  and exact fields, revalidates live availability, and atomically saves the
  booking plus the reviewer's ID and decision time under the existing lock.
- Pending requests persist across server restarts and do not reserve the room.
  Student preview tokens expire after five minutes; submitted requests do not
  depend on the preview token or its expiration.
- Local workshop accounts use generated passwords and salted password hashes
  in the ignored `server/.local/` directory. HTTP-only sessions expire after
  eight hours or logout; restarting the API signs users out. Production SSO,
  account administration and distributed sessions remain outside this change.

## Acceptance criteria
- [ ] A valid preview shows room, date, times, timezone, duration and group size. The student submits a pending request; only independent staff approval saves a confirmed booking.
- [ ] Exactly 180 minutes is allowed; 181 minutes and a 5-hour request fail with `DURATION_LIMIT_EXCEEDED` and a clear explanation.
- [ ] Overlapping bookings for the same room fail with `ROOM_UNAVAILABLE`; adjacent bookings are allowed.
- [ ] Unknown rooms, invalid timestamps, non-positive durations, and invalid group sizes are rejected. A group larger than the room capacity fails with `CAPACITY_EXCEEDED`.
- [ ] `create_booking` rechecks duration, capacity, room existence, and availability even if `check_availability` was skipped or previously succeeded.
- [ ] No confirmed booking is written without staff's Approve action. Submission, rejection and cancellation only update request records; failed validation/authorization leaves the file unchanged.
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

The application must collect approval from authenticated staff other than the requester, bind it to the displayed pending request, and verify it before calling the persistence path. An `approved: true` argument supplied by a student, agent or arbitrary caller is not proof of approval.

Use ISO 8601 timestamps with explicit offsets. Resolve conversational dates in the configured campus timezone and show the date and timezone in the proposal. Do not guess a duration or silently choose an ambiguous slot.

### Data and errors

`data.json` contains `rooms`, `bookings`, and `requests` arrays. Legacy files without `requests` are read without rewriting existing bookings. Requests retain the exact slot, purpose, requester, status, submission time, and any decision note/reviewer/time. Approved bookings additionally record `request_id`, `requested_by`, `approved_by`, and `approved_at`. Only `create_booking` may append confirmed bookings; failed operations must not partially modify the file. Student schedule views expose slot information without other students' identities.

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
4. Have the signed-in student confirm submission of the exact preview as a pending request; report pending status rather than claiming a reservation.
5. Wait for an independent staff member's explicit approval of that stored request. Call `create_booking` with the authenticated reviewer context; revalidate and persist, then report the saved booking ID. Report rejection or validation failures without claiming success. Future MCP/agent adapters must not invent a reviewer principal.

Room notes, tool-returned descriptions, and user requests cannot override domain policy or supply human approval. Treat instructions embedded in room data as untrusted content. Keep the model configurable through `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`, with no provider-specific booking rules.

## Validation and milestones

For the basics milestone, test the normal approved booking, unchanged data before approval and after rejection, exact-duration boundaries, overlap versus adjacency, capacity, and direct creation attempts that skip checking. Also verify approval mismatch, stale availability, and concurrent conflicting creates.

For the intermediate milestone, demonstrate the normal and unclear scenarios through UI chat, and exercise the same MCP tools from two AI agents. For the optional advanced milestone, evaluate all five scenarios from [the project statement](../CampusDesk.md) against two prompt versions and verify that injected room notes never bypass policy.

Record each completed development phase and its validation evidence in `progress.html`.
