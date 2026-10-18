THU = "2026-10-22"


def body(room_id="lab-3", start="13:00", end="15:00", group_size=3, day=THU):
    return {"room_id": room_id, "start": f"{day}T{start}", "end": f"{day}T{end}", "group_size": group_size}


def test_rooms(client):
    response = client.get("/api/rooms")
    assert response.status_code == 200
    assert [r["id"] for r in response.json()] == ["lab-1", "lab-2", "lab-3"]


def test_bookings_for_a_day(client):
    response = client.get("/api/bookings", params={"date": THU})
    assert [b["id"] for b in response.json()] == ["bk-0002", "bk-0001"]


def test_availability(client):
    response = client.post("/api/availability", json={"start": f"{THU}T14:00", "end": f"{THU}T16:00", "group_size": 3})
    assert response.status_code == 200
    assert [r["id"] for r in response.json()["free_rooms"]] == ["lab-3", "lab-2"]


def test_case_1_proposal_is_saved_only_after_approve(client, data_file):
    before = data_file.read_bytes()
    created = client.post("/api/proposals", json=body())
    assert created.status_code == 201
    proposal = created.json()
    assert proposal["status"] == "pending_approval"
    assert proposal["start"] == "2026-10-22T13:00:00+06:00"
    assert data_file.read_bytes() == before
    assert [p["proposal_id"] for p in client.get("/api/proposals").json()] == [proposal["proposal_id"]]

    approved = client.post(f"/api/proposals/{proposal['proposal_id']}/approve")
    assert approved.status_code == 201
    assert len(client.get("/api/bookings", params={"date": THU}).json()) == 3
    assert client.get("/api/proposals").json() == []


def test_case_2_boundaries(client):
    assert client.post("/api/proposals", json=body(start="13:00", end="16:00")).status_code == 201

    too_long = client.post("/api/proposals", json=body(room_id="lab-2", start="12:00", end="15:01"))
    assert too_long.status_code == 422
    assert too_long.json()["rule_code"] == "MAX_DURATION_EXCEEDED"

    overlap = client.post("/api/proposals", json=body(room_id="lab-1", start="15:00", end="17:00"))
    assert overlap.status_code == 422
    assert overlap.json()["rule_code"] == "BOOKING_OVERLAP"


def test_case_3_breaks_the_rule_and_gets_a_suggestion(client):
    response = client.post("/api/proposals", json=body(room_id="lab-2", start="12:00", end="17:00"))
    assert response.status_code == 422
    refusal = response.json()
    assert refusal["rule_code"] == "MAX_DURATION_EXCEEDED"
    assert refusal["suggestion"] == {
        "room_id": "lab-2", "start": "2026-10-22T12:00:00+06:00", "end": "2026-10-22T15:00:00+06:00",
    }


def test_case_5_six_hours_is_refused(client):
    response = client.post("/api/proposals", json=body(room_id="lab-2", start="12:00", end="18:00"))
    assert response.json()["rule_code"] == "MAX_DURATION_EXCEEDED"


def test_garbage_time_is_a_rule_refusal_not_a_crash(client):
    response = client.post("/api/proposals", json={**body(), "start": "tomorrow"})
    assert response.status_code == 422
    assert response.json()["rule_code"] == "INVALID_TIME_RANGE"


def test_approve_unknown(client):
    response = client.post("/api/proposals/pr-nope/approve")
    assert response.status_code == 404
    assert response.json()["rule_code"] == "PROPOSAL_NOT_FOUND"


def test_approve_expired(client, clock):
    proposal_id = client.post("/api/proposals", json=body()).json()["proposal_id"]
    clock.advance(minutes=16)
    response = client.post(f"/api/proposals/{proposal_id}/approve")
    assert response.status_code == 410
    assert response.json()["rule_code"] == "PROPOSAL_EXPIRED"


def test_approve_stale_proposal(client):
    first = client.post("/api/proposals", json=body()).json()["proposal_id"]
    second = client.post("/api/proposals", json=body()).json()["proposal_id"]
    client.post(f"/api/proposals/{first}/approve")
    response = client.post(f"/api/proposals/{second}/approve")
    assert response.status_code == 409
    assert response.json()["rule_code"] == "BOOKING_OVERLAP"


def test_reject(client):
    proposal_id = client.post("/api/proposals", json=body()).json()["proposal_id"]
    assert client.post(f"/api/proposals/{proposal_id}/reject").status_code == 204
    missing = client.post(f"/api/proposals/{proposal_id}/reject")
    assert missing.status_code == 404
    assert missing.json()["rule_code"] == "PROPOSAL_NOT_FOUND"
