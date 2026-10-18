"""Model client: quota handling and fallback models, with a fake provider (no real calls)."""

import asyncio
import json
from types import SimpleNamespace

import httpx
import openai
import pytest

from app.agent import llm as agent_llm
from app.agent.llm import LLMRateLimited, OpenAICompatLLM

DAILY = "Quota exceeded ... 'quotaId': 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' ... Please retry in 18h32m."
PER_MINUTE = "Quota exceeded ... 'quotaId': 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' ... Please retry in 21.3s."


def rate_limit(text):
    response = httpx.Response(429, request=httpx.Request("POST", "http://test/chat/completions"))
    return openai.RateLimitError(text, response=response, body=None)


def ok_response(text="ok"):
    message = SimpleNamespace(content=text, tool_calls=None)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class FakeCompletions:
    """Answers per model: an exception to raise, or text to return."""

    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.models_called = []

    async def create(self, model, messages, tools=None):
        self.models_called.append(model)
        outcome = self.behaviour[model]
        if isinstance(outcome, Exception):
            raise outcome
        return ok_response(outcome)


def make_llm(behaviour, fallbacks):
    llm = OpenAICompatLLM("http://test", "key", "main-model", fallbacks)
    fake = FakeCompletions(behaviour)
    llm.client = SimpleNamespace(chat=SimpleNamespace(completions=fake))
    return llm, fake


def call(llm):
    return asyncio.run(llm([{"role": "user", "content": "hi"}], []))


def test_daily_quota_falls_back_to_the_next_model_and_remembers():
    llm, fake = make_llm({"main-model": rate_limit(DAILY), "backup": "from backup"}, ["backup"])
    assert call(llm).content == "from backup"
    assert call(llm).content == "from backup"
    assert fake.models_called == ["main-model", "backup", "backup"]  # exhausted model isn't retried
    assert llm.model == "backup"


def test_all_models_exhausted_is_a_clear_daily_error():
    llm, _ = make_llm({"main-model": rate_limit(DAILY), "backup": rate_limit(DAILY)}, ["backup"])
    with pytest.raises(LLMRateLimited) as err:
        call(llm)
    assert err.value.daily and "LLM_FALLBACK_MODELS" in str(err.value)


def test_per_minute_limit_does_not_switch_models():
    llm, fake = make_llm({"main-model": rate_limit(PER_MINUTE), "backup": "x"}, ["backup"])
    with pytest.raises(LLMRateLimited) as err:
        call(llm)
    assert not err.value.daily and err.value.retry_after == pytest.approx(21.3)
    assert fake.models_called == ["main-model"]


def test_fallbacks_come_from_env(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "http://test")
    monkeypatch.setenv("LLM_MODEL", "a")
    monkeypatch.setenv("LLM_FALLBACK_MODELS", "b, c,,a")
    assert agent_llm.from_env().models == ["a", "b", "c"]
    assert agent_llm.from_env(use_fallbacks=False).models == ["a"]


def test_chat_endpoint_reports_quota_clearly(client, monkeypatch):
    """The bug from the UI: a quota error showed as 'unhandled errors in a TaskGroup'."""
    llm, _ = make_llm({"main-model": rate_limit(DAILY)}, [])
    monkeypatch.setattr(agent_llm, "from_env", lambda: llm)
    res = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Book a room tomorrow at 3pm"}]})
    assert res.status_code == 429
    body = res.json()
    assert body["code"] == "LLM_QUOTA_EXHAUSTED"
    assert "TaskGroup" not in body["reason"] and "main-model" in body["reason"]


def test_chat_endpoint_other_errors_show_the_real_cause(client, monkeypatch):
    async def broken(messages, tools):
        raise ValueError("model not found: gemini-x")

    monkeypatch.setattr(agent_llm, "from_env", lambda: broken)
    res = client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert res.status_code == 502
    assert json.loads(res.text)["reason"] == "model not found: gemini-x"
