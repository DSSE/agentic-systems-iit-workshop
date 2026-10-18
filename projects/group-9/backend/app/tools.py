"""The CampusDesk tools: list, check and create, plus approve and reject.

The REST API uses all of them. The MCP server and the agent get only the
first three; approve stays human-only.
"""

from collections.abc import Callable
from datetime import date, datetime
from uuid import uuid4

from pydantic import BaseModel

from app.domain.booking_rules import (
    Booking,
    BookingRequest,
    Room,
    RuleCode,
    RuleResult,
    available_rooms,
    parse_time,
    validate_booking,
)
from app.proposals import Proposal, ProposalExpired, ProposalNotFound, ProposalStore
from app.store import Store

TimeInput = str | datetime


class Availability(BaseModel):
    result: RuleResult
    free_rooms: list[Room]


def _not_found(proposal_id: str) -> RuleResult:
    return RuleResult(
        ok=False, rule_code=RuleCode.PROPOSAL_NOT_FOUND,
        message=f"There is no pending proposal {proposal_id!r}.",
    )


class CampusDesk:
    def __init__(self, store: Store, proposals: ProposalStore, clock: Callable[[], datetime]) -> None:
        self.store = store
        self.proposals = proposals
        self.clock = clock

    def list_rooms(self, min_capacity: int | None = None) -> list[Room]:
        rooms, _ = self.store.load()
        return [r for r in rooms if min_capacity is None or r.capacity >= min_capacity]

    def bookings_on(self, day: date) -> list[Booking]:
        tz = self.clock().tzinfo
        _, bookings = self.store.load()
        return sorted((b for b in bookings if b.start.astimezone(tz).date() == day), key=lambda b: b.start)

    def check_availability(
        self, start: TimeInput, end: TimeInput, group_size: int, room_id: str | None = None
    ) -> Availability:
        rooms, bookings = self.store.load()
        req = BookingRequest(room_id=room_id, start=start, end=end, group_size=group_size)
        if room_id is None:
            free, result = available_rooms(req, rooms, bookings, self.clock())
            return Availability(result=result, free_rooms=free)
        result = validate_booking(req, rooms, bookings, self.clock())
        return Availability(result=result, free_rooms=[r for r in rooms if r.id == room_id] if result.ok else [])

    def create_booking(
        self, room_id: str, start: TimeInput, end: TimeInput, group_size: int,
        booked_by: str = "student", purpose: str = "", source: str = "ui",
    ) -> Proposal | RuleResult:
        """Make a pending proposal. Re-checks every rule itself and never writes to data.json."""
        now = self.clock()
        rooms, bookings = self.store.load()
        req = BookingRequest(room_id=room_id, start=start, end=end, group_size=group_size)
        result = validate_booking(req, rooms, bookings, now)
        if not result.ok:
            return result
        room = next(r for r in rooms if r.id == room_id)
        return self.proposals.add(
            room_id=room.id, room_name=room.name,
            start=parse_time(start, now.tzinfo), end=parse_time(end, now.tzinfo),
            group_size=group_size, booked_by=booked_by, purpose=purpose, source=source, now=now,
        )

    def pending(self) -> list[Proposal]:
        return self.proposals.pending(self.clock())

    def approve(self, proposal_id: str) -> Booking | RuleResult:
        """Save a proposal. Only the UI's Approve button reaches this."""
        now = self.clock()
        try:
            proposal = self.proposals.get(proposal_id, now)
        except ProposalNotFound:
            return _not_found(proposal_id)
        except ProposalExpired:
            return RuleResult(
                ok=False, rule_code=RuleCode.PROPOSAL_EXPIRED,
                message="This proposal expired. Please make a new one.",
            )
        with self.store.lock:
            rooms, bookings = self.store.load()
            req = BookingRequest(
                room_id=proposal.room_id, start=proposal.start, end=proposal.end,
                group_size=proposal.group_size,
            )
            result = validate_booking(req, rooms, bookings, now)
            if not result.ok:
                self.proposals.remove(proposal_id)  # it can never pass again
                return result
            booking = Booking(
                id=f"bk-{uuid4().hex[:8]}", room_id=proposal.room_id,
                start=proposal.start, end=proposal.end, group_size=proposal.group_size,
                booked_by=proposal.booked_by, purpose=proposal.purpose, source=proposal.source,
                created_at=now,
            )
            self.store.add_booking(booking)
        self.proposals.remove(proposal_id)
        return booking

    def reject(self, proposal_id: str) -> RuleResult | None:
        return None if self.proposals.remove(proposal_id) else _not_found(proposal_id)
