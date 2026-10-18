from app.domain.booking_rules import (
    Booking,
    BookingRequest,
    RuleCode,
    available_rooms,
    validate_booking,
)
from conftest import FIXED_NOW
from test_booking_rules import BOOKINGS, ROOMS, at


def req(room_id, start, end, group_size=3):
    return BookingRequest(room_id=room_id, start=start, end=end, group_size=group_size)


def busy(room_id, start, end):
    return Booking(id=f"x-{room_id}", room_id=room_id, start=start, end=end, group_size=2, created_at=FIXED_NOW)


def test_case_3_suggests_three_hours_from_the_same_start():
    result = validate_booking(req("lab-2", at(12), at(17)), ROOMS, BOOKINGS, FIXED_NOW)
    assert result.rule_code == RuleCode.MAX_DURATION_EXCEEDED
    assert result.suggestion is not None
    assert (result.suggestion.room_id, result.suggestion.start, result.suggestion.end) == ("lab-2", at(12), at(15))


def test_too_long_suggests_next_free_three_hours_when_start_is_taken():
    # lab-2 is booked 09:00-11:00, so the first free 3 hours from 08:00 is 11:00-14:00
    result = validate_booking(req("lab-2", at(8), at(13)), ROOMS, BOOKINGS, FIXED_NOW)
    assert (result.suggestion.start, result.suggestion.end) == (at(11), at(14))


def test_overlap_suggests_same_time_in_the_smallest_other_room():
    result = validate_booking(req("lab-1", at(15), at(17)), ROOMS, BOOKINGS, FIXED_NOW)
    assert result.rule_code == RuleCode.BOOKING_OVERLAP
    assert (result.suggestion.room_id, result.suggestion.start) == ("lab-3", at(15))


def test_overlap_falls_back_to_a_later_slot_in_the_same_room():
    bookings = [*BOOKINGS, busy("lab-3", at(15), at(17)), busy("lab-2", at(15), at(17))]
    result = validate_booking(req("lab-1", at(15), at(17)), ROOMS, bookings, FIXED_NOW)
    assert (result.suggestion.room_id, result.suggestion.start, result.suggestion.end) == ("lab-1", at(16), at(18))


def test_capacity_suggests_a_room_that_fits():
    result = validate_booking(req("lab-1", at(13), at(15), group_size=5), ROOMS, BOOKINGS, FIXED_NOW)
    assert result.rule_code == RuleCode.CAPACITY_EXCEEDED
    assert result.suggestion.room_id == "lab-3"


def test_no_suggestion_for_a_past_start():
    result = validate_booking(req("lab-3", at(9, day=17), at(10, day=17)), ROOMS, BOOKINGS, FIXED_NOW)
    assert result.suggestion is None


def test_available_rooms_smallest_first():
    rooms, result = available_rooms(req(None, at(14), at(16)), ROOMS, BOOKINGS, FIXED_NOW)
    assert result.ok
    assert [r.id for r in rooms] == ["lab-3", "lab-2"]  # lab-1 is booked 14:00-16:00


def test_available_rooms_none_free():
    bookings = [*BOOKINGS, busy("lab-3", at(14), at(16)), busy("lab-2", at(14), at(16))]
    rooms, result = available_rooms(req(None, at(14), at(16)), ROOMS, bookings, FIXED_NOW)
    assert rooms == []
    assert result.rule_code == RuleCode.NO_ROOM_AVAILABLE


def test_available_rooms_reports_the_hard_rule_first():
    rooms, result = available_rooms(req(None, at(12), at(17)), ROOMS, BOOKINGS, FIXED_NOW)
    assert rooms == []
    assert result.rule_code == RuleCode.MAX_DURATION_EXCEEDED
