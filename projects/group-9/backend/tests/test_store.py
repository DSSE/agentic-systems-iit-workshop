import json

from app.domain.booking_rules import Booking
from app.store import Store
from conftest import FIXED_NOW
from test_booking_rules import at


def test_load_reads_rooms_and_bookings(data_file):
    rooms, bookings = Store(data_file).load()
    assert [r.id for r in rooms] == ["lab-1", "lab-2", "lab-3"]
    assert bookings[0].start == at(14)


def test_add_booking_appends_and_keeps_the_offset(data_file):
    store = Store(data_file)
    store.add_booking(
        Booking(id="bk-new", room_id="lab-3", start=at(13), end=at(15), group_size=3, created_at=FIXED_NOW)
    )
    saved = json.loads(data_file.read_text())["bookings"][-1]
    assert saved["id"] == "bk-new"
    assert saved["start"] == "2026-10-22T13:00:00+06:00"
    assert len(store.load()[1]) == 3


def test_add_booking_leaves_no_temp_files(data_file):
    Store(data_file).add_booking(
        Booking(id="bk-new", room_id="lab-3", start=at(13), end=at(15), group_size=3, created_at=FIXED_NOW)
    )
    assert [p.name for p in data_file.parent.iterdir()] == ["data.json"]
