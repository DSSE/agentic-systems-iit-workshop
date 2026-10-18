"""Model access for the chat agent through any OpenAI-compatible API (Gemini, Groq, Ollama, OpenRouter...)."""

import uuid
from dataclasses import dataclass, field
from typing import Protocol

from openai import AsyncOpenAI

from .. import config


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str  # JSON text, as the model wrote it


@dataclass
class LLMMessage:
    content: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)


class LLM(Protocol):
    async def __call__(self, messages: list[dict], tools: list[dict]) -> LLMMessage: ...


class LLMNotConfigured(RuntimeError):
    pass


class OpenAICompatLLM:
    def __init__(self, base_url: str, api_key: str, model: str):
        # Ollama needs no key, but the client insists on one.
        self.client = AsyncOpenAI(base_url=base_url, api_key=api_key or "not-needed")
        self.model = model

    async def __call__(self, messages: list[dict], tools: list[dict]) -> LLMMessage:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=tools or None,
        )
        message = response.choices[0].message
        return LLMMessage(
            content=message.content,
            tool_calls=[
                ToolCall(id=tc.id or f"call-{uuid.uuid4().hex[:8]}", name=tc.function.name, arguments=tc.function.arguments)
                for tc in message.tool_calls or []
            ],
        )


def from_env() -> OpenAICompatLLM:
    settings = config.llm_settings()
    missing = [name for name, key in (("LLM_BASE_URL", "base_url"), ("LLM_MODEL", "model")) if not settings[key]]
    if missing:
        raise LLMNotConfigured(f"Set {' and '.join(missing)} in .env (see .env.example).")
    return OpenAICompatLLM(**settings)
