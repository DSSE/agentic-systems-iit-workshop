"""The three tools. The API, the MCP server and the agent call these and nothing else."""

from datetime import datetime

from pydantic import BaseModel

from . import guardrails, store
from .domain import rules
from .domain.models import Booking, BookingRequest, CreateBookingRequest, Room, RuleResult


class RoomView(Room):
    """A room as clients see it: the note is kept, but flagged when it reads like an instruction."""

    suspicious_note: bool = False
    note_warning: str | None = None


class RoomsListing(BaseModel):
    rooms: list[RoomView]
    bookings: list[Booking]


class CreateResult(BaseModel):
    ok: bool
    booking: Booking | None = None
    code: str | None = None
    reason: str | None = None


def list_rooms() -> RoomsListing:
    rooms, bookings = store.load()
    views = []
    for room in rooms:
        flagged = guardrails.looks_like_instruction(room.notes)
        views.append(
            RoomView(**room.model_dump(), suspicious_note=flagged, note_warning=guardrails.NOTE_WARNING if flagged else None)
        )
    return RoomsListing(rooms=views, bookings=sorted(bookings, key=lambda b: b.start))


def check_availability(room_id: str, start: datetime, end: datetime, group_size: int) -> RuleResult:
    request = BookingRequest(room_id=room_id, start=start, end=end, group_size=group_size)
    rooms, bookings = store.load()
    return rules.validate(request, rooms, bookings)


def create_booking(request: CreateBookingRequest, client: str = "api") -> CreateResult:
    """Saves a booking only with a person's approval, and re-checks every rule itself first."""
    result = _create(request)
    if not result.ok:
        guardrails.audit(
            "booking_refused",
            client,
            code=result.code,
            room_id=request.room_id,
            start=request.start,
            end=request.end,
            requester=request.requester,
        )
    return result


def _create(request: CreateBookingRequest) -> CreateResult:
    if not request.approved:
        return CreateResult(
            ok=False,
            code=rules.APPROVAL_REQUIRED,
            reason="A person must approve the booking before it is saved.",
        )

    # Free text is stored in data.json and later shown to agents: don't let it carry instructions in.
    for field in ("purpose", "requester"):
        if guardrails.looks_like_instruction(getattr(request, field)):
            return CreateResult(
                ok=False,
                code=guardrails.SUSPICIOUS_CONTENT,
                reason=f"The {field} reads like an instruction to the system. Please describe the booking plainly.",
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
