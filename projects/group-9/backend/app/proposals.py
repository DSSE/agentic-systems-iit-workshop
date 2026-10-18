"""Pending booking proposals, kept in memory until a person approves or rejects them."""

import threading
from datetime import datetime, timedelta
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict


class Proposal(BaseModel):
    model_config = ConfigDict(frozen=True)

    proposal_id: str
    status: Literal["pending_approval"] = "pending_approval"
    room_id: str
    room_name: str
    start: datetime
    end: datetime
    group_size: int
    booked_by: str
    purpose: str
    source: str
    created_at: datetime
    expires_at: datetime


class ProposalNotFound(Exception):
    pass


class ProposalExpired(Exception):
    pass


class ProposalStore:
    def __init__(self, ttl: timedelta) -> None:
        self.ttl = ttl
        self._items: dict[str, Proposal] = {}
        self._lock = threading.Lock()

    def add(
        self, *, room_id: str, room_name: str, start: datetime, end: datetime, group_size: int,
        booked_by: str, purpose: str, source: str, now: datetime,
    ) -> Proposal:
        proposal = Proposal(
            proposal_id=f"pr-{uuid4().hex[:8]}",
            room_id=room_id, room_name=room_name, start=start, end=end, group_size=group_size,
            booked_by=booked_by, purpose=purpose, source=source,
            created_at=now, expires_at=now + self.ttl,
        )
        with self._lock:
            self._items[proposal.proposal_id] = proposal
        return proposal

    def take(self, proposal_id: str, now: datetime) -> Proposal:
        """Remove and return a proposal, so only one caller can ever act on it."""
        with self._lock:
            proposal = self._items.pop(proposal_id, None)
            if proposal is None:
                raise ProposalNotFound(proposal_id)
            if now >= proposal.expires_at:
                raise ProposalExpired(proposal_id)
            return proposal

    def pending(self, now: datetime) -> list[Proposal]:
        with self._lock:
            for proposal_id in [k for k, p in self._items.items() if now >= p.expires_at]:
                del self._items[proposal_id]
            return sorted(self._items.values(), key=lambda p: p.created_at)

    def remove(self, proposal_id: str) -> bool:
        with self._lock:
            return self._items.pop(proposal_id, None) is not None
