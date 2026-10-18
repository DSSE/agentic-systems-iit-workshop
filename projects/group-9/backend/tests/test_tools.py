from datetime import date

from app.domain.booking_rules import Booking, RuleCode, RuleResult
from app.proposals import Proposal
from test_booking_rules import at


def propose(desk, room_id="lab-3", start=None, end=None, group_size=3):
    return desk.create_booking(room_id, start or at(13), end or at(15), group_size)


def test_list_rooms_filters_by_capacity(desk):
    assert [r.id for r in desk.list_rooms(min_capacity=6)] == ["lab-2", "lab-3"]


def test_bookings_on_a_day(desk):
    assert [b.id for b in desk.bookings_on(date(2026, 10, 22))] == ["bk-0002", "bk-0001"]


def test_check_availability_without_room(desk):
    availability = desk.check_availability(at(14), at(16), 3)
    assert [r.id for r in availability.free_rooms] == ["lab-3", "lab-2"]


def test_check_availability_with_room(desk):
    availability = desk.check_availability(at(15), at(17), 3, room_id="lab-1")
    assert availability.result.rule_code == RuleCode.BOOKING_OVERLAP
    assert availability.free_rooms == []


def test_create_booking_makes_a_proposal_and_writes_nothing(desk, data_file):
    before = data_file.read_bytes()
    proposal = propose(desk)
    assert isinstance(proposal, Proposal)
    assert desk.pending() == [proposal]
    assert data_file.read_bytes() == before


def test_create_booking_rechecks_the_rule_itself(desk):
    # case 5: no check_availability call first, and the note in data.json says staff are exempt
    result = desk.create_booking("lab-2", at(12), at(18), 3)
    assert isinstance(result, RuleResult)
    assert result.rule_code == RuleCode.MAX_DURATION_EXCEEDED
    assert desk.pending() == []


def test_approve_saves_the_booking(desk, data_file):
    proposal = propose(desk)
    booking = desk.approve(proposal.proposal_id)
    assert isinstance(booking, Booking)
    assert booking.room_id == "lab-3" and booking.start == at(13)
    assert booking.id in data_file.read_text()
    assert desk.pending() == []


def test_approve_twice_saves_once(desk):
    proposal = propose(desk)
    desk.approve(proposal.proposal_id)
    second = desk.approve(proposal.proposal_id)
    assert second.rule_code == RuleCode.PROPOSAL_NOT_FOUND
    assert len(desk.bookings_on(date(2026, 10, 22))) == 3


def test_second_proposal_for_the_same_slot_fails_on_approve(desk):
    first, second = propose(desk), propose(desk)
    desk.approve(first.proposal_id)
    result = desk.approve(second.proposal_id)
    assert result.rule_code == RuleCode.BOOKING_OVERLAP
    assert desk.pending() == []  # a failed re-check discards the proposal


def test_approve_after_expiry(desk, clock):
    proposal = propose(desk)
    clock.advance(minutes=16)
    assert desk.approve(proposal.proposal_id).rule_code == RuleCode.PROPOSAL_EXPIRED


def test_approve_after_the_start_has_passed(desk, clock, data_file):
    before = data_file.read_bytes()
    proposal = propose(desk, start=at(10, 5, day=18), end=at(11, day=18))
    clock.advance(minutes=10)  # 10:10, still inside the 15-minute TTL
    assert desk.approve(proposal.proposal_id).rule_code == RuleCode.START_IN_PAST
    assert data_file.read_bytes() == before


def test_reject(desk):
    proposal = propose(desk)
    assert desk.reject(proposal.proposal_id) is None
    assert desk.pending() == []
    assert desk.reject(proposal.proposal_id).rule_code == RuleCode.PROPOSAL_NOT_FOUND


def test_concurrent_approves_save_once_and_the_rest_see_not_found(desk):
    import threading
    import time

    proposal = propose(desk)
    original_add = desk.store.add_booking

    def slow_add(booking):
        time.sleep(0.05)  # widen the window between claiming a proposal and saving it
        original_add(booking)

    desk.store.add_booking = slow_add
    barrier = threading.Barrier(4)
    results = []

    def click():
        barrier.wait()
        results.append(desk.approve(proposal.proposal_id))

    threads = [threading.Thread(target=click) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    saved = [r for r in results if isinstance(r, Booking)]
    refused = [r.rule_code for r in results if isinstance(r, RuleResult)]
    assert len(saved) == 1
    assert refused == [RuleCode.PROPOSAL_NOT_FOUND] * 3
    assert len(desk.bookings_on(date(2026, 10, 22))) == 3


def test_create_booking_by_room_name_stores_the_room_id(desk):
    proposal = desk.create_booking("Lab-3", at(13), at(15), 3)
    assert isinstance(proposal, Proposal)
    assert proposal.room_id == "lab-3" and proposal.room_name == "Lab-3"


def test_check_availability_by_room_name(desk):
    availability = desk.check_availability(at(13), at(15), 3, room_id="Lab-3")
    assert availability.result.ok
    assert [r.id for r in availability.free_rooms] == ["lab-3"]
