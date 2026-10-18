from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from conftest import DHAKA

JSONRPC = {"content-type": "application/json", "accept": "application/json, text/event-stream"}
THURSDAY = {"room_id": "lab-3", "start": "2026-10-22T13:00", "end": "2026-10-22T15:00", "group_size": 3}


def rpc(client, method, params, headers=None):
    return client.post(
        "/mcp",
        headers={**JSONRPC, **(headers or {})},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
    )


def make_app(data_file, clock):
    settings = Settings(data_file=data_file, timezone=DHAKA, proposal_ttl=timedelta(minutes=15))
    return create_app(settings, clock)


@pytest.fixture
def live(data_file, clock):
    with TestClient(make_app(data_file, clock), base_url="http://localhost:8000") as client:
        yield client


def test_mcp_is_served_at_slash_mcp(live):
    response = rpc(live, "tools/list", {})
    assert response.status_code == 200
    assert {t["name"] for t in response.json()["result"]["tools"]} == {"list_rooms", "check_availability", "create_booking"}


def test_mcp_proposals_share_the_ui_queue(live):
    rpc(live, "tools/call", {"name": "create_booking", "arguments": THURSDAY})
    assert [p["source"] for p in live.get("/api/proposals").json()] == ["mcp"]


def test_chat_header_marks_the_source(live):
    response = rpc(live, "tools/call", {"name": "create_booking", "arguments": THURSDAY}, {"X-CampusDesk-Client": "chat"})
    assert response.json()["result"]["structuredContent"]["source"] == "chat"


def test_foreign_host_is_refused(data_file, clock):
    with TestClient(make_app(data_file, clock), base_url="http://evil.example") as client:
        assert rpc(client, "tools/list", {}).status_code == 421
