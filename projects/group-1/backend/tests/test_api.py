"""Cases 1 to 3 from the spec, end to end through the API."""

import json


def booking(room, start, end, size=3, approved=None):
    body = {"room_id": room, "start": start, "end": end, "group_size": size}
    if approved is not None:
        body |= {"requester": "Test Group", "purpose": "Group work", "approved": approved}
    return body


def bookings_in(data_file):
    return json.loads(data_file.read_text(encoding="utf-8"))["bookings"]


def test_rooms_endpoint_lists_rooms_and_bookings(client):
    res = client.get("/api/rooms")
    assert res.status_code == 200
    body = res.json()
    assert len(body["rooms"]) == 4 and len(body["bookings"]) == 4


# Case 1: "Book a lab for 3 people Thursday afternoon." -> proposal, saved only after Approve.
def test_case1_normal_booking_saved_only_after_approve(client, data_file):
    rooms = client.get("/api/rooms").json()["rooms"]
    start, end = "2026-10-22T13:00", "2026-10-22T16:00"  # Thursday afternoon
    before = data_file.read_bytes()

    checks = {r["id"]: client.post("/api/check", json=booking(r["id"], start, end)).json() for r in rooms}
    available = [room_id for room_id, result in checks.items() if result["ok"]]
    assert available == ["Lab-3"]  # Lab-1/Lab-2 are booked, Lab-4 is too small
    assert checks["Lab-4"]["code"] == "CAPACITY_EXCEEDED"

    # Checking is not saving.
    assert data_file.read_bytes() == before

    # Without approval: refused, nothing written.
    res = client.post("/api/bookings", json=booking("Lab-3", start, end, approved=False))
    assert res.status_code == 422 and res.json()["code"] == "APPROVAL_REQUIRED"
    assert data_file.read_bytes() == before

    # Approve.
    res = client.post("/api/bookings", json=booking("Lab-3", start, end, approved=True))
    assert res.status_code == 201
    assert bookings_in(data_file)[-1]["id"] == res.json()["booking"]["id"]


# Case 2: boundary.
def test_case2_exactly_three_hours_gives_a_proposal(client):
    res = client.post("/api/check", json=booking("Lab-3", "2026-10-23T09:00", "2026-10-23T12:00"))
    assert res.json() == {"ok": True, "code": None, "reason": None}


def test_case2_three_hours_one_minute_fails(client, data_file):
    before = data_file.read_bytes()
    check = client.post("/api/check", json=booking("Lab-3", "2026-10-23T09:00", "2026-10-23T12:01")).json()
    assert check["code"] == "MAX_DURATION_EXCEEDED"
    res = client.post("/api/bookings", json=booking("Lab-3", "2026-10-23T09:00", "2026-10-23T12:01", approved=True))
    assert res.status_code == 422 and res.json()["code"] == "MAX_DURATION_EXCEEDED"
    assert data_file.read_bytes() == before


def test_case2_overlap_fails(client, data_file):
    before = data_file.read_bytes()
    check = client.post("/api/check", json=booking("Lab-1", "2026-10-22T14:00", "2026-10-22T16:00")).json()
    assert check["code"] == "BOOKING_OVERLAP"
    res = client.post("/api/bookings", json=booking("Lab-1", "2026-10-22T14:00", "2026-10-22T16:00", approved=True))
    assert res.status_code == 422 and res.json()["code"] == "BOOKING_OVERLAP"
    assert data_file.read_bytes() == before


def test_case2_touching_booking_is_allowed(client):
    res = client.post("/api/check", json=booking("Lab-1", "2026-10-22T15:00", "2026-10-22T17:00"))
    assert res.json()["ok"] is True


# Case 3: "Book Lab-2 for 5 hours." -> refused with the rule code.
def test_case3_five_hours_refused(client, data_file):
    before = data_file.read_bytes()
    check = client.post("/api/check", json=booking("Lab-2", "2026-10-23T09:00", "2026-10-23T14:00")).json()
    assert check["ok"] is False and check["code"] == "MAX_DURATION_EXCEEDED"
    res = client.post("/api/bookings", json=booking("Lab-2", "2026-10-23T09:00", "2026-10-23T14:00", approved=True))
    assert res.status_code == 422 and res.json()["code"] == "MAX_DURATION_EXCEEDED"
    assert data_file.read_bytes() == before


def test_zoned_times_are_rejected(client):
    res = client.post("/api/check", json=booking("Lab-3", "2026-10-23T09:00Z", "2026-10-23T10:00Z"))
    assert res.status_code == 422
