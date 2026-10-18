import json
from datetime import datetime

import pytest

from app.domain.booking_rules import Booking, BookingRequest, Room, RuleCode, validate_booking
from conftest import DHAKA, FIXED_NOW, SEED

DATA = json.loads(SEED.read_text())
ROOMS = [Room.model_validate(r) for r in DATA["rooms"]]
BOOKINGS = [Booking.model_validate(b) for b in DATA["bookings"]]


def at(hour: int, minute: int = 0, second: int = 0, day: int = 22) -> datetime:
    """A time in October 2026, Dhaka. Day 22 is the Thursday."""
    return datetime(2026, 10, day, hour, minute, second, tzinfo=DHAKA)


def check(room_id, start, end, group_size=3):
    req = BookingRequest(room_id=room_id, start=start, end=end, group_size=group_size)
    return validate_booking(req, ROOMS, BOOKINGS, FIXED_NOW)


# Case 1: normal
def test_case_1_three_people_thursday_afternoon_is_valid():
    result = check("lab-3", at(13), at(15))
    assert result.ok and result.rule_code is None


# Case 2: boundary
def test_case_2_exactly_three_hours_is_valid():
    assert check("lab-3", at(13), at(16)).ok


def test_case_2_three_hours_one_minute_breaks_the_rule():
    result = check("lab-3", at(13), at(16, 1))
    assert not result.ok
    assert result.rule_code == RuleCode.MAX_DURATION_EXCEEDED


def test_three_hours_thirty_seconds_breaks_the_rule():
    assert check("lab-3", at(13), at(16, 0, 30)).rule_code == RuleCode.MAX_DURATION_EXCEEDED


def test_case_2_overlap_is_refused():
    result = check("lab-1", at(15), at(17))
    assert result.rule_code == RuleCode.BOOKING_OVERLAP
    assert "Lab-1" in result.message


def test_back_to_back_is_allowed():
    assert check("lab-1", at(16), at(18)).ok


# Case 3 and case 5: the hard rule has no exemptions
def test_case_3_five_hours_in_lab_2_is_refused():
    assert check("lab-2", at(12), at(17)).rule_code == RuleCode.MAX_DURATION_EXCEEDED


def test_case_5_six_hours_in_lab_2_is_refused_despite_the_note():
    assert check("lab-2", at(12), at(18)).rule_code == RuleCode.MAX_DURATION_EXCEEDED


# Other rule codes
@pytest.mark.parametrize(
    ("start", "end"),
    [(None, None), ("tomorrow", "later"), ("", ""), (at(15), at(15)), (at(15), at(14))],
)
def test_bad_time_range(start, end):
    assert check("lab-3", start, end).rule_code == RuleCode.INVALID_TIME_RANGE


def test_unknown_room():
    assert check("lab-9", at(13), at(15)).rule_code == RuleCode.ROOM_NOT_FOUND


def test_group_size_zero():
    assert check("lab-3", at(13), at(15), group_size=0).rule_code == RuleCode.INVALID_GROUP_SIZE


def test_group_too_big_for_room():
    assert check("lab-1", at(13), at(15), group_size=5).rule_code == RuleCode.CAPACITY_EXCEEDED


def test_start_in_the_past():
    assert check("lab-3", at(9, day=17), at(10, day=17)).rule_code == RuleCode.START_IN_PAST


def test_hard_rule_is_checked_before_the_room():
    assert check("lab-9", at(12), at(17)).rule_code == RuleCode.MAX_DURATION_EXCEEDED


# Review focus: time formats
def test_naive_time_is_read_as_dhaka_and_clashes():
    result = check("lab-1", "2026-10-22T15:00", "2026-10-22T17:00")
    assert result.rule_code == RuleCode.BOOKING_OVERLAP


def test_utc_time_is_compared_correctly():
    # 08:30Z is 14:30 in Dhaka, inside bk-0001 (14:00-16:00)
    result = check("lab-1", "2026-10-22T08:30:00Z", "2026-10-22T09:30:00Z")
    assert result.rule_code == RuleCode.BOOKING_OVERLAP


def test_booking_may_cross_midnight():
    assert check("lab-3", at(23), at(1, day=23)).ok


def test_cap_is_exposed_in_minutes_for_prompts():
    # The agent prompt gets the cap from here (spec: Agent), so the number is never typed in.
    from datetime import timedelta

    from app.domain.booking_rules import MAX_DURATION, MAX_DURATION_MINUTES

    assert MAX_DURATION_MINUTES == 180
    assert MAX_DURATION == timedelta(minutes=MAX_DURATION_MINUTES)


def test_room_can_be_given_by_name_in_any_case():
    # Users say "Lab-2", and LLM agents pass that on as room_id (seen live: ROOM_NOT_FOUND).
    assert check("Lab-3", at(13), at(15)).ok
    assert check("LAB-3", at(13), at(15)).ok


def test_a_named_room_still_gets_suggestions_for_other_rooms():
    result = check("Lab-1", at(15), at(17))
    assert result.rule_code == RuleCode.BOOKING_OVERLAP
    assert result.suggestion.room_id == "lab-3"
