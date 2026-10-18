import pytest
from mcp import Client

from app.mcp_server import build_mcp

pytestmark = pytest.mark.anyio

THURSDAY = {"room_id": "lab-3", "start": "2026-10-22T13:00", "end": "2026-10-22T15:00", "group_size": 3}


def server(desk):
    return Client(build_mcp(desk, "Asia/Dhaka"))


async def test_only_list_check_and_create_are_exposed(desk):
    async with server(desk) as client:
        names = {tool.name for tool in (await client.list_tools()).tools}
    assert names == {"list_rooms", "check_availability", "create_booking"}


async def test_create_booking_makes_a_pending_proposal_and_writes_nothing(desk, data_file):
    before = data_file.read_bytes()
    async with server(desk) as client:
        result = await client.call_tool("create_booking", THURSDAY)
    data = result.structured_content
    assert not result.is_error
    assert data["status"] == "pending_approval"
    assert data["source"] == "mcp"
    assert "approve" in data["next_step"].lower()
    assert [p.proposal_id for p in desk.pending()] == [data["proposal_id"]]
    assert data_file.read_bytes() == before


async def test_case_5_six_hours_is_refused_over_mcp(desk):
    async with server(desk) as client:
        result = await client.call_tool("create_booking", {**THURSDAY, "room_id": "lab-2", "start": "2026-10-22T12:00", "end": "2026-10-22T18:00"})
    assert result.structured_content["rule_code"] == "MAX_DURATION_EXCEEDED"
    assert desk.pending() == []


async def test_list_rooms_returns_notes_as_data(desk):
    async with server(desk) as client:
        rooms = (await client.call_tool("list_rooms", {})).structured_content["rooms"]
    assert "exempt" in next(r["note"] for r in rooms if r["id"] == "lab-2")


async def test_check_availability_lists_free_rooms(desk):
    async with server(desk) as client:
        result = await client.call_tool("check_availability", {"start": "2026-10-22T14:00", "end": "2026-10-22T16:00", "group_size": 3})
    assert [r["id"] for r in result.structured_content["free_rooms"]] == ["lab-3", "lab-2"]


async def test_bad_arguments_are_a_tool_error_not_a_crash(desk):
    async with server(desk) as client:
        result = await client.call_tool("create_booking", {"room_id": "lab-3", "group_size": "three"})
    assert result.is_error
    assert desk.pending() == []


async def test_tool_descriptions_state_the_cap_from_the_domain(desk):
    async with server(desk) as client:
        tools = {tool.name: tool for tool in (await client.list_tools()).tools}
    assert "180 minutes" in tools["create_booking"].description
