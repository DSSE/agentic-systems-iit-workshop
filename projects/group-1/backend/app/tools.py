"""The three tools. The API (and later the MCP server and the agent) call these and nothing else."""

from datetime import datetime

from pydantic import BaseModel

from . import store
from .domain import rules
from .domain.models import Booking, BookingRequest, CreateBookingRequest, Room, RuleResult


class RoomsListing(BaseModel):
    rooms: list[Room]
    bookings: list[Booking]


class CreateResult(BaseModel):
    ok: bool
    booking: Booking | None = None
    code: str | None = None
    reason: str | None = None


def list_rooms() -> RoomsListing:
    rooms, bookings = store.load()
    return RoomsListing(rooms=rooms, bookings=sorted(bookings, key=lambda b: b.start))


def check_availability(room_id: str, start: datetime, end: datetime, group_size: int) -> RuleResult:
    request = BookingRequest(room_id=room_id, start=start, end=end, group_size=group_size)
    rooms, bookings = store.load()
    return rules.validate(request, rooms, bookings)


def create_booking(request: CreateBookingRequest) -> CreateResult:
    """Saves a booking only with a person's approval, and re-checks every rule itself first."""
    if not request.approved:
        return CreateResult(
            ok=False,
            code=rules.APPROVAL_REQUIRED,
            reason="A person must approve the booking before it is saved.",
        )

    with store.write_lock:
        # Re-read inside the lock: never trust an earlier check_availability call.
        rooms, bookings = store.load()
        result = rules.validate(request, rooms, bookings)
        if not result.ok:
            return CreateResult(ok=False, code=result.code, reason=result.reason)

        booking = Booking(
            id=_next_id(bookings),
            room_id=request.room_id,
            requester=request.requester,
            group_size=request.group_size,
            start=request.start,
            end=request.end,
            purpose=request.purpose,
        )
        raw = store.load_raw()
        raw.setdefault("bookings", []).append(_to_json(booking))
        store.save_raw(raw)
        return CreateResult(ok=True, booking=booking)


def _next_id(bookings: list[Booking]) -> str:
    numbers = [int(b.id[2:]) for b in bookings if b.id.startswith("b-") and b.id[2:].isdigit()]
    return f"b-{max(numbers, default=0) + 1:03d}"


def _to_json(booking: Booking) -> dict:
    data = booking.model_dump()
    # Keep data.json in its minute-precision format, e.g. 2026-10-22T13:00.
    data["start"] = booking.start.strftime("%Y-%m-%dT%H:%M")
    data["end"] = booking.end.strftime("%Y-%m-%dT%H:%M")
    return data
