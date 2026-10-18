from datetime import timedelta

import pytest

from app.proposals import ProposalExpired, ProposalNotFound, ProposalStore
from conftest import FIXED_NOW
from test_booking_rules import at


def add(store, now=FIXED_NOW):
    return store.add(
        room_id="lab-3", room_name="Lab-3", start=at(13), end=at(15), group_size=3,
        booked_by="student", purpose="", source="ui", now=now,
    )


def test_add_and_get():
    store = ProposalStore(timedelta(minutes=15))
    proposal = add(store)
    assert proposal.status == "pending_approval"
    assert proposal.proposal_id.startswith("pr-")
    assert proposal.expires_at == FIXED_NOW + timedelta(minutes=15)
    assert store.take(proposal.proposal_id, FIXED_NOW) == proposal


def test_unknown_id():
    with pytest.raises(ProposalNotFound):
        ProposalStore(timedelta(minutes=15)).take("pr-nope", FIXED_NOW)


def test_expired_proposal_is_refused_and_dropped():
    store = ProposalStore(timedelta(minutes=15))
    proposal = add(store)
    later = FIXED_NOW + timedelta(minutes=15)
    with pytest.raises(ProposalExpired):
        store.take(proposal.proposal_id, later)
    with pytest.raises(ProposalNotFound):
        store.take(proposal.proposal_id, later)


def test_pending_drops_expired_and_sorts_oldest_first():
    store = ProposalStore(timedelta(minutes=15))
    old = add(store, FIXED_NOW)
    new = add(store, FIXED_NOW + timedelta(minutes=10))
    assert store.pending(FIXED_NOW + timedelta(minutes=11)) == [old, new]
    assert store.pending(FIXED_NOW + timedelta(minutes=16)) == [new]


def test_remove():
    store = ProposalStore(timedelta(minutes=15))
    proposal = add(store)
    assert store.remove(proposal.proposal_id) is True
    assert store.remove(proposal.proposal_id) is False


def test_take_removes_the_proposal():
    store = ProposalStore(timedelta(minutes=15))
    proposal = add(store)
    assert store.take(proposal.proposal_id, FIXED_NOW) == proposal
    with pytest.raises(ProposalNotFound):
        store.take(proposal.proposal_id, FIXED_NOW)
