from datetime import datetime

import pytest

from app.domain import rules
from app.domain.models import Booking, BookingRequest, Room

ROOMS = [Room(id="Lab-1", name="Lab 1", capacity=4), Room(id="Lab-2", name="Lab 2", capacity=6)]
BOOKINGS = [
    Booking(
        id="b-001",
        room_id="Lab-1",
        requester="Nadia",
        group_size=3,
        start=datetime(2026, 10, 22, 13, 0),
        end=datetime(2026, 10, 22, 15, 0),
    )
]


def req(room="Lab-1", start=(2026, 10, 23, 9, 0), end=(2026, 10, 23, 12, 0), size=3):
    return BookingRequest(room_id=room, start=datetime(*start), end=datetime(*end), group_size=size)


def code(request):
    return rules.validate(request, ROOMS, BOOKINGS).code


def test_exactly_three_hours_passes():
    assert rules.validate(req(), ROOMS, BOOKINGS).ok


def test_three_hours_one_minute_fails():
    assert code(req(end=(2026, 10, 23, 12, 1))) == rules.MAX_DURATION_EXCEEDED


def test_five_hours_fails():
    assert code(req(room="Lab-2", end=(2026, 10, 23, 14, 0))) == rules.MAX_DURATION_EXCEEDED


def test_duration_across_midnight_counts():
    assert code(req(start=(2026, 10, 23, 22, 0), end=(2026, 10, 24, 2, 0))) == rules.MAX_DURATION_EXCEEDED


@pytest.mark.parametrize(
    "start,end",
    [
        ((2026, 10, 22, 14, 0), (2026, 10, 22, 16, 0)),  # starts inside
        ((2026, 10, 22, 12, 0), (2026, 10, 22, 14, 0)),  # ends inside
        ((2026, 10, 22, 13, 30), (2026, 10, 22, 14, 30)),  # fully inside
        ((2026, 10, 22, 12, 30), (2026, 10, 22, 15, 30)),  # fully covers
    ],
)
def test_overlap_fails(start, end):
    assert code(req(start=start, end=end)) == rules.BOOKING_OVERLAP


@pytest.mark.parametrize(
    "start,end",
    [
        ((2026, 10, 22, 15, 0), (2026, 10, 22, 17, 0)),  # starts when the other ends
        ((2026, 10, 22, 11, 0), (2026, 10, 22, 13, 0)),  # ends when the other starts
    ],
)
def test_touching_is_not_overlap(start, end):
    assert rules.validate(req(start=start, end=end), ROOMS, BOOKINGS).ok


def test_same_time_in_another_room_is_fine():
    assert rules.validate(req(room="Lab-2", start=(2026, 10, 22, 13, 0), end=(2026, 10, 22, 15, 0)), ROOMS, BOOKINGS).ok


def test_end_before_start_fails():
    assert code(req(start=(2026, 10, 23, 12, 0), end=(2026, 10, 23, 9, 0))) == rules.INVALID_TIME_RANGE


def test_zero_length_fails():
    assert code(req(start=(2026, 10, 23, 9, 0), end=(2026, 10, 23, 9, 0))) == rules.INVALID_TIME_RANGE


def test_unknown_room_fails():
    assert code(req(room="Lab-99")) == rules.ROOM_NOT_FOUND


def test_group_over_capacity_fails():
    assert code(req(size=5)) == rules.CAPACITY_EXCEEDED


def test_group_at_capacity_passes():
    assert rules.validate(req(size=4), ROOMS, BOOKINGS).ok


def test_reason_is_given_with_every_failure():
    result = rules.validate(req(end=(2026, 10, 23, 14, 0)), ROOMS, BOOKINGS)
    assert result.reason and "3h" in result.reason
