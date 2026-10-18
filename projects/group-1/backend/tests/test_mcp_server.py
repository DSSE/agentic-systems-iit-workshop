"""The MCP server, called through a real MCP client (in-process)."""

import asyncio
import json

from mcp import Client

from app.mcp_server import server


def call(name, args=None):
    async def go():
        async with Client(server) as client:
            result = await client.call_tool(name, args or {})
            return json.loads(result.content[0].text)

    return asyncio.run(go())


def list_tools():
    async def go():
        async with Client(server) as client:
            return (await client.list_tools()).tools

    return asyncio.run(go())


def test_exposes_the_three_tools():
    assert {t.name for t in list_tools()} == {"list_rooms", "check_availability", "create_booking"}


def test_list_rooms():
    body = call("list_rooms")
    assert len(body["rooms"]) == 4 and len(body["bookings"]) == 4


def test_check_valid():
    assert call("check_availability", {"room_id": "Lab-3", "start": "2026-10-23T09:00", "end": "2026-10-23T12:00", "group_size": 3})["ok"]


def test_check_over_three_hours():
    body = call("check_availability", {"room_id": "Lab-2", "start": "2026-10-23T09:00", "end": "2026-10-23T14:00", "group_size": 3})
    assert body["code"] == "MAX_DURATION_EXCEEDED"


def test_bad_time_is_a_clear_error():
    body = call("check_availability", {"room_id": "Lab-2", "start": "Thursday", "end": "2026-10-23T14:00", "group_size": 3})
    assert body["code"] == "INVALID_REQUEST"


def test_create_without_approval_writes_nothing(data_file):
    before = data_file.read_bytes()
    body = call("create_booking", {"room_id": "Lab-3", "requester": "Agent", "start": "2026-10-23T09:00", "end": "2026-10-23T10:00", "group_size": 3})
    assert body["code"] == "APPROVAL_REQUIRED"
    assert data_file.read_bytes() == before


def test_create_rechecks_rule_even_when_approved(data_file):
    before = data_file.read_bytes()
    body = call(
        "create_booking",
        {"room_id": "Lab-2", "requester": "Staff", "start": "2026-10-23T09:00", "end": "2026-10-23T15:00", "group_size": 3, "approved": True},
    )
    assert body["code"] == "MAX_DURATION_EXCEEDED"
    assert data_file.read_bytes() == before


def test_create_approved_valid_booking_saves(data_file):
    body = call(
        "create_booking",
        {"room_id": "Lab-3", "requester": "Agent", "start": "2026-10-23T09:00", "end": "2026-10-23T10:00", "group_size": 3, "approved": True},
    )
    assert body["ok"] and body["booking"]["id"] == "b-005"
    assert json.loads(data_file.read_text(encoding="utf-8"))["bookings"][-1]["id"] == "b-005"
