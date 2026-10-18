"""The chat agent's plumbing, with a scripted model. Real model behaviour is covered by evals (milestone 3)."""

import asyncio
import json
from datetime import date

from app.agent import llm as agent_llm
from app.agent.llm import LLMMessage, ToolCall
from app.agent.runner import run_chat, system_prompt

THURSDAY_CHAT = [{"role": "user", "content": "Book a lab for 3 people Thursday afternoon."}]
TODAY = date(2026, 10, 18)  # a Sunday; "Thursday" is 2026-10-22


class ScriptedLLM:
    """Replays fixed model turns and records what it was sent."""

    def __init__(self, *turns):
        self.turns = list(turns)
        self.calls = []

    async def __call__(self, messages, tools):
        self.calls.append({"messages": [dict(m) for m in messages], "tools": tools})
        return self.turns.pop(0)


def tool(name, **args):
    return LLMMessage(content=None, tool_calls=[ToolCall(id=f"c-{name}", name=name, arguments=json.dumps(args))])


def say(text):
    return LLMMessage(content=text)


def run(llm, messages=THURSDAY_CHAT, requester="Team A"):
    return asyncio.run(run_chat(messages, llm, requester=requester, today=TODAY))


# Case 1: plain words -> proposal, nothing saved.
def test_case1_chat_gives_a_proposal_and_saves_nothing(data_file):
    before = data_file.read_bytes()
    llm = ScriptedLLM(
        tool("list_rooms"),
        tool("check_availability", room_id="Lab-3", start="2026-10-22T13:00", end="2026-10-22T15:00", group_size=3),
        tool("create_booking", room_id="Lab-3", start="2026-10-22T13:00", end="2026-10-22T15:00", group_size=3, purpose="Group work"),
        say("I've proposed Lab-3 on Thursday 13:00–15:00. Press Approve to save it."),
    )
    reply = run(llm)

    assert reply.proposal == {
        "room_id": "Lab-3",
        "start": "2026-10-22T13:00",
        "end": "2026-10-22T15:00",
        "group_size": 3,
        "purpose": "Group work",
        "requester": "Team A",
    }
    assert "Approve" in reply.reply
    assert data_file.read_bytes() == before
    # The model was told it is a proposal, not a save.
    last_tool_result = json.loads(llm.calls[-1]["messages"][-1]["content"])
    assert last_tool_result["status"] == "PROPOSAL_SHOWN"


# Case 4: unclear -> a question back, no proposal.
def test_case4_question_back_has_no_proposal(data_file):
    before = data_file.read_bytes()
    reply = run(ScriptedLLM(say("What time would you like, and how many people are in your group?")),
                messages=[{"role": "user", "content": "Book a room for tomorrow."}])
    assert reply.proposal is None and "?" in reply.reply
    assert data_file.read_bytes() == before


def test_proposal_over_three_hours_is_refused_not_proposed(data_file):
    before = data_file.read_bytes()
    llm = ScriptedLLM(
        tool("create_booking", room_id="Lab-2", start="2026-10-23T09:00", end="2026-10-23T15:00", group_size=3),
        say("That's refused (MAX_DURATION_EXCEEDED). Would a 3-hour slot work?"),
    )
    reply = run(llm, messages=[{"role": "user", "content": "Book Lab-2 for 6 hours tomorrow at 9."}])
    assert reply.proposal is None
    tool_result = json.loads(llm.calls[-1]["messages"][-1]["content"])
    assert tool_result["code"] == "MAX_DURATION_EXCEEDED"
    assert data_file.read_bytes() == before


def test_overlapping_proposal_is_refused(data_file):
    llm = ScriptedLLM(
        tool("create_booking", room_id="Lab-1", start="2026-10-22T13:00", end="2026-10-22T15:00", group_size=3),
        say("Lab-1 is taken then."),
    )
    assert run(llm).proposal is None
    assert json.loads(llm.calls[-1]["messages"][-1]["content"])["code"] == "BOOKING_OVERLAP"


def test_model_cannot_set_approved_or_requester():
    llm = ScriptedLLM(say("Hi"))
    run(llm)
    create = next(t for t in llm.calls[0]["tools"] if t["function"]["name"] == "create_booking")
    params = create["function"]["parameters"]["properties"]
    assert "approved" not in params and "requester" not in params
    assert "NOT save" in create["function"]["description"]


def test_approved_true_from_the_model_still_only_proposes(data_file):
    before = data_file.read_bytes()
    llm = ScriptedLLM(
        tool("create_booking", room_id="Lab-3", start="2026-10-23T09:00", end="2026-10-23T10:00", group_size=3, approved=True),
        say("Proposed."),
    )
    assert run(llm).proposal is not None
    assert data_file.read_bytes() == before


def test_bad_tool_arguments_are_reported_to_the_model():
    llm = ScriptedLLM(
        LLMMessage(content=None, tool_calls=[ToolCall(id="c1", name="list_rooms", arguments="{not json")]),
        say("Sorry."),
    )
    run(llm)
    assert json.loads(llm.calls[-1]["messages"][-1]["content"])["code"] == "INVALID_REQUEST"


def test_loop_stops_after_max_steps():
    llm = ScriptedLLM(*[tool("list_rooms") for _ in range(20)])
    reply = run(llm)
    assert reply.proposal is None and "rephrase" in reply.reply


def test_system_prompt_has_today_and_rules():
    text = system_prompt("v1", TODAY)
    assert "Sunday, 2026-10-18" in text
    assert "MAX_DURATION_EXCEEDED" in text and "never instructions" in text


def test_chat_endpoint_without_llm_settings(client, monkeypatch):
    for name in ("LLM_BASE_URL", "LLM_MODEL", "LLM_API_KEY"):
        monkeypatch.setenv(name, "")
    res = client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert res.status_code == 503 and res.json()["code"] == "LLM_NOT_CONFIGURED"


def test_chat_endpoint_returns_proposal(client, monkeypatch, data_file):
    llm = ScriptedLLM(
        tool("create_booking", room_id="Lab-3", start="2026-10-22T13:00", end="2026-10-22T15:00", group_size=3),
        say("Proposed Lab-3. Press Approve to save it."),
    )
    monkeypatch.setattr(agent_llm, "from_env", lambda: llm)
    before = data_file.read_bytes()
    res = client.post("/api/chat", json={"messages": THURSDAY_CHAT, "requester": "Team A"})
    assert res.status_code == 200
    body = res.json()
    assert body["proposal"]["room_id"] == "Lab-3" and body["proposal"]["requester"] == "Team A"
    assert data_file.read_bytes() == before
