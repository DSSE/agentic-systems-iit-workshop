# Workshop Room Booking Agent

## Goal
Help workshop participants find available rooms and request bookings. The agent must enforce a maximum booking length of three hours and must get explicit user approval before creating a booking.

## User stories
1. As a workshop participant, I want to see the available rooms and their existing bookings so I can choose a suitable time.
2. As a workshop participant, I want the agent to check my requested room and time so I know whether the booking is valid before it is submitted.
3. As a workshop participant, I want to approve a valid booking before it is saved so that no booking is created without my consent.

## Acceptance criteria
- [ ] The list tool shows the rooms and current bookings stored in `data.json`.
- [ ] A valid request for an available room, with a duration of three hours or less, can be completed after the user explicitly approves it.
- [ ] A request that exceeds three hours is refused with a clear explanation.
- [ ] A request that overlaps an existing booking for the same room is refused with a clear explanation.
- [ ] The create tool independently checks the hard rules, even if the check tool was skipped.
- [ ] Nothing is written to `data.json` without an explicit "y" from the user.

## Tools
| Tool | Input | Output |
|---|---|---|
| `list_rooms` | None | Rooms and their current bookings |
| `check_booking` | Room, start time, end time | Whether the request is valid, with a reason if it is not |
| `create_booking` (needs approval) | Room, requester, start time, end time, user approval | Creates and returns the booking, or refuses it with a reason |

## Hard rule
A booking may last no more than three hours. Bookings for the same room may not overlap.

## Partly-valid requests
Reject a request that breaks either hard rule and explain why. Do not silently shorten the requested booking or move it to another time; the user can submit a revised request.
