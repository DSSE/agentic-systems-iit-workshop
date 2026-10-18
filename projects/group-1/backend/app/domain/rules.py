"""The hard rule. This is the only place it lives.

The API, the MCP server and the agent all call validate(). Nothing in a request,
a prompt or a note in data.json can switch any of these checks off.
"""

from .models import Booking, BookingRequest, Room, RuleResult

MAX_MINUTES = 180

ROOM_NOT_FOUND = "ROOM_NOT_FOUND"
INVALID_TIME_RANGE = "INVALID_TIME_RANGE"
MAX_DURATION_EXCEEDED = "MAX_DURATION_EXCEEDED"
CAPACITY_EXCEEDED = "CAPACITY_EXCEEDED"
BOOKING_OVERLAP = "BOOKING_OVERLAP"
APPROVAL_REQUIRED = "APPROVAL_REQUIRED"


def _fmt_minutes(minutes: int) -> str:
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins:02d}m" if mins else f"{hours}h"


def validate(request: BookingRequest, rooms: list[Room], bookings: list[Booking]) -> RuleResult:
    """Check a booking request against every rule, in a fixed order. Returns the first failure."""
    room = next((r for r in rooms if r.id == request.room_id), None)
    if room is None:
        return RuleResult.failed(ROOM_NOT_FOUND, f"There is no room called {request.room_id!r}.")

    if request.end <= request.start:
        return RuleResult.failed(INVALID_TIME_RANGE, "The end time must be after the start time.")

    minutes = int((request.end - request.start).total_seconds() // 60)
    if minutes > MAX_MINUTES:
        return RuleResult.failed(
            MAX_DURATION_EXCEEDED,
            f"{_fmt_minutes(minutes)} requested; a booking is at most {_fmt_minutes(MAX_MINUTES)}.",
        )

    if request.group_size > room.capacity:
        return RuleResult.failed(
            CAPACITY_EXCEEDED,
            f"{room.id} holds {room.capacity} people; the group has {request.group_size}.",
        )

    # Bookings are half-open [start, end): touching end-to-start is not an overlap.
    for b in bookings:
        if b.room_id == room.id and request.start < b.end and b.start < request.end:
            return RuleResult.failed(
                BOOKING_OVERLAP,
                f"{room.id} is already booked from {b.start:%Y-%m-%d %H:%M} to {b.end:%H:%M}.",
            )

    return RuleResult.passed()
