import json

import pytest
from mcp import Client

from app.agent import FALLBACK_REPLY, MAX_TOOL_ROUNDS, AssistantTurn, CampusAgent, ToolCall
from app.mcp_server import build_mcp
from conftest import FIXED_NOW, ScriptedLLM

pytestmark = pytest.mark.anyio

USER = [{"role": "user", "content": "Book a lab for 3 people Thursday afternoon."}]
THURSDAY = {"room_id": "lab-3", "start": "2026-10-22T13:00", "end": "2026-10-22T15:00", "group_size": 3}


def call(name, args, call_id="c1"):
    return ToolCall(id=call_id, name=name, arguments=args if isinstance(args, str) else json.dumps(args))


def agent_for(desk, turns):
    llm = ScriptedLLM(turns)
    return CampusAgent(llm, lambda: Client(build_mcp(desk, "Asia/Dhaka"))), llm


def tool_messages(llm):
    return [m for m in llm.seen[-1][0] if m["role"] == "tool"]


async def test_create_booking_then_reply_returns_the_proposal(desk):
    agent, llm = agent_for(desk, [
        AssistantTurn(None, [call("create_booking", THURSDAY)]),
        AssistantTurn("Lab-3 on Thursday 13:00-15:00 (2 hours) is waiting for Approve."),
    ])
    result = await agent.run(USER, FIXED_NOW)
    assert result.reply.startswith("Lab-3")
    assert result.proposal_ids == [p.proposal_id for p in desk.pending()]
    assert len(result.proposal_ids) == 1


async def test_the_model_is_offered_only_the_three_tools(desk):
    agent, llm = agent_for(desk, [AssistantTurn("Hi!")])
    await agent.run(USER, FIXED_NOW)
    assert {t["function"]["name"] for t in llm.seen[0][1]} == {"list_rooms", "check_availability", "create_booking"}


async def test_system_prompt_has_today(desk):
    agent, llm = agent_for(desk, [AssistantTurn("Hi!")])
    await agent.run(USER, FIXED_NOW)
    system = llm.seen[0][0][0]
    assert system["role"] == "system" and "Sunday 2026-10-18" in system["content"]


async def test_tool_output_reaches_the_model_as_tool_data(desk):
    agent, llm = agent_for(desk, [AssistantTurn(None, [call("list_rooms", {})]), AssistantTurn("Three labs.")])
    await agent.run(USER, FIXED_NOW)
    [message] = tool_messages(llm)
    assert message["tool_call_id"] == "c1"
    assert message["content"].startswith('<tool_data tool="list_rooms">')
    assert "exempt" in message["content"]  # the note arrives, but only as data


async def test_case_5_over_long_create_is_refused_by_the_tool(desk):
    agent, llm = agent_for(desk, [
        AssistantTurn(None, [call("create_booking", {**THURSDAY, "room_id": "lab-2", "start": "2026-10-22T12:00", "end": "2026-10-22T18:00"})]),
        AssistantTurn("Refused: MAX_DURATION_EXCEEDED."),
    ])
    result = await agent.run(USER, FIXED_NOW)
    assert "MAX_DURATION_EXCEEDED" in tool_messages(llm)[0]["content"]
    assert result.proposal_ids == [] and desk.pending() == []


async def test_unknown_tool_goes_back_as_an_error(desk):
    agent, llm = agent_for(desk, [AssistantTurn(None, [call("approve_booking", {"proposal_id": "x"})]), AssistantTurn("I cannot do that.")])
    result = await agent.run(USER, FIXED_NOW)
    assert 'error="true"' in tool_messages(llm)[0]["content"]
    assert result.reply == "I cannot do that."


async def test_bad_json_arguments_go_back_as_an_error(desk):
    agent, llm = agent_for(desk, [AssistantTurn(None, [call("create_booking", "{not json")]), AssistantTurn("Let me retry.")])
    await agent.run(USER, FIXED_NOW)
    assert 'error="true"' in tool_messages(llm)[0]["content"]


async def test_wrong_argument_types_go_back_as_an_error(desk):
    agent, llm = agent_for(desk, [AssistantTurn(None, [call("create_booking", {**THURSDAY, "group_size": "three"})]), AssistantTurn("Fixed.")])
    result = await agent.run(USER, FIXED_NOW)
    assert 'error="true"' in tool_messages(llm)[0]["content"]
    assert result.proposal_ids == []


async def test_only_one_create_booking_per_message(desk):
    second = {**THURSDAY, "start": "2026-10-22T15:00", "end": "2026-10-22T17:00"}
    agent, llm = agent_for(desk, [
        AssistantTurn(None, [call("create_booking", THURSDAY, "c1"), call("create_booking", second, "c2")]),
        AssistantTurn("One proposal made."),
    ])
    result = await agent.run(USER, FIXED_NOW)
    assert len(result.proposal_ids) == 1 and len(desk.pending()) == 1
    assert 'error="true"' in tool_messages(llm)[1]["content"]


async def test_llm_failure_gives_the_fallback_reply(desk):
    agent, _ = agent_for(desk, [RuntimeError("429 rate limited")])
    result = await agent.run(USER, FIXED_NOW)
    assert result.reply == FALLBACK_REPLY


async def test_tool_rounds_are_capped(desk):
    agent, llm = agent_for(desk, [])
    llm.repeat = AssistantTurn(None, [call("list_rooms", {})])
    result = await agent.run(USER, FIXED_NOW)
    assert result.reply == FALLBACK_REPLY
    assert len(llm.seen) == MAX_TOOL_ROUNDS


class SlowLLM:
    """Never answers in time, like a rate-limited Groq call waiting out retry-after."""

    async def complete(self, messages, tools):
        import anyio

        await anyio.sleep(5)


async def test_a_turn_that_runs_too_long_gives_the_fallback_reply(desk):
    import time

    agent = CampusAgent(SlowLLM(), lambda: Client(build_mcp(desk, "Asia/Dhaka")), turn_timeout=0.2)
    started = time.monotonic()
    result = await agent.run(USER, FIXED_NOW)
    assert result.reply == FALLBACK_REPLY
    assert time.monotonic() - started < 2


async def test_no_second_create_booking_after_a_refusal_in_the_same_turn(desk):
    # Partly-valid requests: the 3-hour alternative is proposed only after the user accepts it.
    five_hours = {**THURSDAY, "room_id": "lab-2", "start": "2026-10-22T12:00", "end": "2026-10-22T17:00"}
    three_hours = {**five_hours, "end": "2026-10-22T15:00"}
    agent, llm = agent_for(desk, [
        AssistantTurn(None, [call("create_booking", five_hours, "c1"), call("create_booking", three_hours, "c2")]),
        AssistantTurn("Refused. Shall I propose 12:00-15:00 instead?"),
    ])
    result = await agent.run(USER, FIXED_NOW)
    assert result.proposal_ids == [] and desk.pending() == []
    assert 'error="true"' in tool_messages(llm)[1]["content"]


async def test_a_retry_after_bad_arguments_is_allowed(desk):
    agent, llm = agent_for(desk, [
        AssistantTurn(None, [call("create_booking", {**THURSDAY, "group_size": "three"}, "c1"), call("create_booking", THURSDAY, "c2")]),
        AssistantTurn("Proposed."),
    ])
    result = await agent.run(USER, FIXED_NOW)
    assert len(result.proposal_ids) == 1
