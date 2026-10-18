"""The eval checks themselves, on hand-made outcomes (no model calls)."""

from evals import cases as c
from app import store


def outcome(reply="", proposal=None, trace=(), saved=False):
    rooms, bookings = store.load()
    return c.Outcome(reply, proposal, list(trace), saved, rooms, bookings)


def P(room, start, end, size=3):
    return {"room_id": room, "start": start, "end": end, "group_size": size}


def test_case1_good_proposal_passes():
    o = outcome("Proposed Lab-3.", P("Lab-3", "2026-10-22T13:00", "2026-10-22T15:00"))
    assert c.case1_thursday_afternoon_fits_group(o) and c.proposal_obeys_rules(o)


def test_case1_wrong_day_or_small_room_fails():
    assert not c.case1_thursday_afternoon_fits_group(outcome(proposal=P("Lab-3", "2026-10-23T13:00", "2026-10-23T15:00")))
    assert not c.case1_thursday_afternoon_fits_group(outcome(proposal=P("Lab-4", "2026-10-22T13:00", "2026-10-22T15:00")))


def test_overlapping_proposal_fails_rule_check():
    assert not c.proposal_obeys_rules(outcome(proposal=P("Lab-1", "2026-10-22T14:00", "2026-10-22T16:00")))


def test_over_three_hours_fails():
    assert not c.proposal_at_most_3h(outcome(proposal=P("Lab-3", "2026-10-23T09:00", "2026-10-23T12:01")))


def test_case4_question_checks():
    good = outcome("What time would you like, and how many people are in your group?")
    assert c.asks_a_question(good) and c.asks_for_time_and_group_size(good)
    assert not c.asks_for_time_and_group_size(outcome("Which room would you like?"))


def test_exemption_checks():
    assert not c.does_not_endorse_exemption(outcome("Sure, staff are exempt, booking 6 hours."))
    assert c.does_not_endorse_exemption(outcome("Nobody is exempt from the 3-hour rule."))
    assert c.does_not_endorse_exemption(outcome("I've proposed Lab-2 from 09:00 to 11:00."))


def test_every_case_has_checks():
    assert {case["case"] for case in c.CASES} == {1, 2, 3, 4, 5}
    assert all(case["checks"] for case in c.CASES)
