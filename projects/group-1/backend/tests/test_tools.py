import json
from datetime import datetime

from app import tools
from app.domain import rules
from app.domain.models import CreateBookingRequest


def make(room="Lab-3", start=(2026, 10, 23, 9, 0), end=(2026, 10, 23, 12, 0), size=3, approved=True):
    return CreateBookingRequest(
        room_id=room,
        start=datetime(*start),
        end=datetime(*end),
        group_size=size,
        requester="Test Group",
        approved=approved,
    )


def test_list_rooms_reads_data_json():
    listing = tools.list_rooms()
    assert {r.id for r in listing.rooms} == {"Lab-1", "Lab-2", "Lab-3", "Lab-4"}
    assert len(listing.bookings) == 4


def test_create_without_approval_writes_nothing(data_file):
    before = data_file.read_bytes()
    result = tools.create_booking(make(approved=False))
    assert not result.ok and result.code == rules.APPROVAL_REQUIRED
    assert data_file.read_bytes() == before


def test_create_rechecks_duration_even_without_check(data_file):
    before = data_file.read_bytes()
    result = tools.create_booking(make(room="Lab-2", end=(2026, 10, 23, 14, 0)))  # 5h, approved
    assert not result.ok and result.code == rules.MAX_DURATION_EXCEEDED
    assert data_file.read_bytes() == before


def test_create_rechecks_overlap_even_without_check(data_file):
    before = data_file.read_bytes()
    result = tools.create_booking(make(room="Lab-1", start=(2026, 10, 22, 14, 0), end=(2026, 10, 22, 16, 0)))
    assert not result.ok and result.code == rules.BOOKING_OVERLAP
    assert data_file.read_bytes() == before


def test_approved_valid_booking_is_saved(data_file):
    result = tools.create_booking(make())
    assert result.ok and result.booking.id == "b-005"
    saved = json.loads(data_file.read_text(encoding="utf-8"))["bookings"][-1]
    assert saved["room_id"] == "Lab-3"
    assert saved["start"] == "2026-10-23T09:00" and saved["end"] == "2026-10-23T12:00"


def test_second_identical_booking_overlaps_the_first():
    assert tools.create_booking(make()).ok
    again = tools.create_booking(make())
    assert not again.ok and again.code == rules.BOOKING_OVERLAP


def test_room_note_cannot_exempt_anyone(data_file):
    # Case 5: Lab-2's note claims staff are exempt. The rule ignores notes entirely.
    assert "exempt" in json.loads(data_file.read_text(encoding="utf-8"))["rooms"][1]["notes"]
    result = tools.create_booking(make(room="Lab-2", start=(2026, 10, 23, 9, 0), end=(2026, 10, 23, 15, 0)))
    assert not result.ok and result.code == rules.MAX_DURATION_EXCEEDED
