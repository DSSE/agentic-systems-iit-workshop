"""CampusDesk booking rules: the only place the rules live.

Pure functions with no I/O; the current time comes in as `now`.
The API, the MCP server and the agent all call this module.
"""

from collections.abc import Sequence
from datetime import datetime, timedelta, tzinfo
from enum import StrEnum

from pydantic import BaseModel, ConfigDict

MAX_DURATION = timedelta(hours=3)
SLOT_STEP = timedelta(minutes=30)


class RuleCode(StrEnum):
    INVALID_TIME_RANGE = "INVALID_TIME_RANGE"
    MAX_DURATION_EXCEEDED = "MAX_DURATION_EXCEEDED"
    ROOM_NOT_FOUND = "ROOM_NOT_FOUND"
    INVALID_GROUP_SIZE = "INVALID_GROUP_SIZE"
    CAPACITY_EXCEEDED = "CAPACITY_EXCEEDED"
    START_IN_PAST = "START_IN_PAST"
    BOOKING_OVERLAP = "BOOKING_OVERLAP"
    NO_ROOM_AVAILABLE = "NO_ROOM_AVAILABLE"
    PROPOSAL_NOT_FOUND = "PROPOSAL_NOT_FOUND"
    PROPOSAL_EXPIRED = "PROPOSAL_EXPIRED"


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True)


class Room(_Frozen):
    id: str
    name: str
    capacity: int
    note: str = ""


class Booking(_Frozen):
    id: str
    room_id: str
    start: datetime
    end: datetime
    group_size: int
    booked_by: str = "student"
    purpose: str = ""
    source: str = "ui"
    created_at: datetime


class BookingRequest(_Frozen):
    """A request as it arrives; start and end may still be unparsed text."""

    room_id: str | None = None
    start: str | datetime | None = None
    end: str | datetime | None = None
    group_size: int = 0


class Slot(_Frozen):
    room_id: str
    start: datetime
    end: datetime


class RuleResult(_Frozen):
    ok: bool
    rule_code: RuleCode | None = None
    message: str
    suggestion: Slot | None = None


_Failure = tuple[RuleCode, str]

BAD_TIME_MESSAGE = "Give a valid start and end time; the end must be after the start."
BAD_GROUP_MESSAGE = "The group size must be at least 1."
PAST_MESSAGE = "The start time is in the past."


def parse_time(value: str | datetime | None, tz: tzinfo) -> datetime | None:
    """Parse an ISO 8601 time. A time without an offset is read in `tz`."""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.strip())
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=tz)


def _duration(delta: timedelta) -> str:
    hours, rest = divmod(int(delta.total_seconds()), 3600)
    minutes, seconds = divmod(rest, 60)
    return f"{hours}h {minutes:02d}m" + (f" {seconds:02d}s" if seconds else "")


def _time_failure(start: datetime | None, end: datetime | None) -> _Failure | None:
    if start is None or end is None or end <= start:
        return RuleCode.INVALID_TIME_RANGE, BAD_TIME_MESSAGE
    if end - start > MAX_DURATION:
        return (
            RuleCode.MAX_DURATION_EXCEEDED,
            f"A booking is at most 3 hours; this one is {_duration(end - start)}.",
        )
    return None


def _first_failure(
    req: BookingRequest, rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime
) -> _Failure | None:
    start, end = parse_time(req.start, now.tzinfo), parse_time(req.end, now.tzinfo)
    if failure := _time_failure(start, end):
        return failure
    room = next((r for r in rooms if r.id == req.room_id), None)
    if room is None:
        return RuleCode.ROOM_NOT_FOUND, f"There is no room with id {req.room_id!r}."
    if req.group_size < 1:
        return RuleCode.INVALID_GROUP_SIZE, BAD_GROUP_MESSAGE
    if req.group_size > room.capacity:
        return (
            RuleCode.CAPACITY_EXCEEDED,
            f"{room.name} holds {room.capacity} people; the group has {req.group_size}.",
        )
    if start < now:
        return RuleCode.START_IN_PAST, PAST_MESSAGE
    for booking in bookings:
        if booking.room_id == room.id and start < booking.end and booking.start < end:
            taken_from = booking.start.astimezone(now.tzinfo)
            taken_to = booking.end.astimezone(now.tzinfo)
            return (
                RuleCode.BOOKING_OVERLAP,
                f"{room.name} is already booked on {taken_from:%a %d %b} "
                f"from {taken_from:%H:%M} to {taken_to:%H:%M}.",
            )
    return None


def validate_booking(
    req: BookingRequest, rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime
) -> RuleResult:
    """Check every rule in order and return the first failure."""
    failure = _first_failure(req, rooms, bookings, now)
    if failure is None:
        return RuleResult(ok=True, message="The booking follows every rule.")
    code, message = failure
    return RuleResult(
        ok=False,
        rule_code=code,
        message=message,
        suggestion=suggest_alternative(req, code, rooms, bookings, now),
    )


def _by_size(rooms: Sequence[Room]) -> list[Room]:
    return sorted(rooms, key=lambda r: (r.capacity, r.id))


def _other_room(
    req: BookingRequest, start: datetime, end: datetime,
    rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime,
) -> Slot | None:
    for room in _by_size(rooms):
        if room.id == req.room_id:
            continue
        trial = req.model_copy(update={"room_id": room.id, "start": start, "end": end})
        if _first_failure(trial, rooms, bookings, now) is None:
            return Slot(room_id=room.id, start=start, end=end)
    return None


def _later_in_same_room(
    req: BookingRequest, first_start: datetime, duration: timedelta,
    rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime,
) -> Slot | None:
    """The first free slot of `duration` in the same room, on the same day, in 30-minute steps."""
    if req.room_id is None:
        return None
    day = first_start.astimezone(now.tzinfo).date()
    candidate = first_start
    while candidate.astimezone(now.tzinfo).date() == day:
        trial = req.model_copy(update={"start": candidate, "end": candidate + duration})
        if _first_failure(trial, rooms, bookings, now) is None:
            return Slot(room_id=req.room_id, start=candidate, end=candidate + duration)
        candidate += SLOT_STEP
    return None


def suggest_alternative(
    req: BookingRequest, rule_code: RuleCode,
    rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime,
) -> Slot | None:
    """A valid slot close to the request, or None. Never creates anything."""
    start, end = parse_time(req.start, now.tzinfo), parse_time(req.end, now.tzinfo)
    if start is None or end is None:
        return None
    if rule_code == RuleCode.MAX_DURATION_EXCEEDED:
        return _later_in_same_room(req, start, MAX_DURATION, rooms, bookings, now)
    if rule_code == RuleCode.BOOKING_OVERLAP:
        return _other_room(req, start, end, rooms, bookings, now) or _later_in_same_room(
            req, start + SLOT_STEP, end - start, rooms, bookings, now
        )
    if rule_code == RuleCode.CAPACITY_EXCEEDED:
        return _other_room(req, start, end, rooms, bookings, now)
    return None


def available_rooms(
    req: BookingRequest, rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime
) -> tuple[list[Room], RuleResult]:
    """Rooms that fit the group and are free at the requested time, smallest first."""
    start, end = parse_time(req.start, now.tzinfo), parse_time(req.end, now.tzinfo)
    failure = _time_failure(start, end)
    if failure is None and req.group_size < 1:
        failure = RuleCode.INVALID_GROUP_SIZE, BAD_GROUP_MESSAGE
    if failure is None and start < now:
        failure = RuleCode.START_IN_PAST, PAST_MESSAGE
    if failure is not None:
        return [], RuleResult(ok=False, rule_code=failure[0], message=failure[1])
    free = [
        room for room in _by_size(rooms)
        if _first_failure(req.model_copy(update={"room_id": room.id}), rooms, bookings, now) is None
    ]
    if free:
        return free, RuleResult(ok=True, message=f"{len(free)} room(s) free.")
    return [], RuleResult(
        ok=False,
        rule_code=RuleCode.NO_ROOM_AVAILABLE,
        message="No room that fits the group is free at that time.",
    )
