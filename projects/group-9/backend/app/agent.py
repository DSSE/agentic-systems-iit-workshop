"""The CampusDesk chat agent: an OpenAI-compatible LLM that uses the MCP tools.

It never saves anything. create_booking only makes proposals; a person approves them in the UI.
"""

import json
import logging
from collections.abc import Callable, Sequence
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from string import Template
from typing import Any, Protocol

from mcp import Client
from openai import AsyncOpenAI

from app.domain.booking_rules import MAX_DURATION_MINUTES

logger = logging.getLogger(__name__)

PROMPTS = Path(__file__).parent / "prompts"


def render_prompt(version: str, now: datetime) -> str:
    """The system prompt with today's date and the cap injected; the prompt file never types the cap."""
    template = Template((PROMPTS / f"{version}.md").read_text(encoding="utf-8"))
    return template.substitute(
        weekday=f"{now:%A}",
        date=f"{now:%Y-%m-%d}",
        time=f"{now:%H:%M}",
        timezone=str(now.tzinfo),
        max_minutes=MAX_DURATION_MINUTES,
        max_hours=f"{MAX_DURATION_MINUTES / 60:g}",
    )


def wrap_tool_data(name: str, payload: str, is_error: bool) -> str:
    """Mark tool output as untrusted data. A room note cannot close the tag early."""
    safe = payload.replace("</tool_data", "<\\/tool_data")
    error = ' error="true"' if is_error else ""
    return f'<tool_data tool="{name}"{error}>\n{safe}\n</tool_data>'


MAX_TOOL_ROUNDS = 6
AGENT_TOOLS = frozenset({"list_rooms", "check_availability", "create_booking"})
FALLBACK_REPLY = "Sorry, I could not finish that. Please try again."


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: str  # JSON text, as the model wrote it


@dataclass(frozen=True)
class AssistantTurn:
    content: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)


class LLM(Protocol):
    async def complete(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> AssistantTurn: ...


@dataclass(frozen=True)
class AgentReply:
    reply: str
    proposal_ids: list[str]


def _openai_tool(tool: Any) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {"name": tool.name, "description": tool.description or "", "parameters": tool.input_schema},
    }


def _assistant_message(turn: AssistantTurn) -> dict[str, Any]:
    return {
        "role": "assistant",
        "content": turn.content or "",
        "tool_calls": [
            {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": c.arguments}}
            for c in turn.tool_calls
        ],
    }


def _error(name: str, message: str) -> str:
    return wrap_tool_data(name, message, is_error=True)


class CampusAgent:
    def __init__(
        self, llm: LLM, connect: Callable[[], AbstractAsyncContextManager[Client]], prompt_version: str = "v1",
    ) -> None:
        self.llm = llm
        self.connect = connect
        self.prompt_version = prompt_version

    async def run(self, history: Sequence[dict[str, str]], now: datetime) -> AgentReply:
        """One chat turn. Never raises: failures become the fallback reply."""
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": render_prompt(self.prompt_version, now)},
            *history,
        ]
        proposal_ids: list[str] = []
        try:
            async with self.connect() as client:
                tools = [_openai_tool(t) for t in (await client.list_tools()).tools if t.name in AGENT_TOOLS]
                for _ in range(MAX_TOOL_ROUNDS):
                    turn = await self.llm.complete(messages, tools)
                    if not turn.tool_calls:
                        return AgentReply(turn.content or FALLBACK_REPLY, proposal_ids)
                    messages.append(_assistant_message(turn))
                    for tool_call in turn.tool_calls:
                        content = await self._call_tool(client, tool_call, proposal_ids)
                        messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": content})
        except Exception:  # rate limit, timeout, MCP failure: the chat must not crash
            logger.exception("chat agent turn failed")
        return AgentReply(FALLBACK_REPLY, proposal_ids)

    async def _call_tool(self, client: Client, tool_call: ToolCall, proposal_ids: list[str]) -> str:
        if tool_call.name not in AGENT_TOOLS:
            return _error(
                "unknown",
                f"There is no tool named {tool_call.name!r}. Use list_rooms, check_availability or create_booking.",
            )
        if tool_call.name == "create_booking" and proposal_ids:
            return _error(tool_call.name, "Only one proposal per user message. Tell the user about the first one.")
        try:
            arguments = json.loads(tool_call.arguments or "{}")
        except json.JSONDecodeError:
            arguments = None
        if not isinstance(arguments, dict):
            return _error(tool_call.name, "The arguments must be a JSON object.")
        result = await client.call_tool(tool_call.name, arguments)
        data = result.structured_content
        if data is not None:
            payload = json.dumps(data, ensure_ascii=False)
        else:
            payload = "\n".join(getattr(part, "text", "") for part in result.content)
        created = tool_call.name == "create_booking" and not result.is_error and data and data.get("status") == "pending_approval"
        if created:
            proposal_ids.append(data["proposal_id"])
        return wrap_tool_data(tool_call.name, payload, result.is_error)


class OpenAICompatibleLLM:
    """Any OpenAI-compatible chat API (Groq by default); the model comes from .env."""

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        # max_retries backs off on HTTP 429, which Groq's free tier returns under per-minute limits.
        self._client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=30, max_retries=2)
        self.model = model

    async def complete(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> AssistantTurn:
        response = await self._client.chat.completions.create(
            model=self.model, messages=messages, tools=tools, temperature=0,
        )
        message = response.choices[0].message
        return AssistantTurn(
            content=message.content,
            tool_calls=[ToolCall(c.id, c.function.name, c.function.arguments) for c in message.tool_calls or []],
        )
