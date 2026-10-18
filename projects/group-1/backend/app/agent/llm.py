"""Model access for the chat agent through any OpenAI-compatible API (Gemini, Groq, Ollama, OpenRouter...)."""

import re
import uuid
from dataclasses import dataclass, field
from typing import Protocol

from openai import AsyncOpenAI, RateLimitError

from .. import config


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str  # JSON text, as the model wrote it
    # Provider-specific fields that must be sent back unchanged on the next turn, e.g. Gemini 3's
    # extra_content.google.thought_signature (without it Gemini rejects the follow-up with a 400).
    extra: dict = field(default_factory=dict)


@dataclass
class LLMMessage:
    content: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)


class LLM(Protocol):
    async def __call__(self, messages: list[dict], tools: list[dict]) -> LLMMessage: ...


class LLMNotConfigured(RuntimeError):
    pass


class LLMRateLimited(RuntimeError):
    """The provider refused for quota reasons. daily=True means waiting a minute won't help."""

    def __init__(self, message: str, daily: bool, retry_after: float | None = None):
        super().__init__(message)
        self.daily = daily
        self.retry_after = retry_after


def is_daily_quota(error: Exception) -> bool:
    text = str(error)
    return "PerDay" in text or "per day" in text.lower()


def _retry_after(error: Exception) -> float | None:
    match = re.search(r"retry in ([\d.]+)s", str(error))
    return float(match.group(1)) if match else None


class OpenAICompatLLM:
    """Calls the model, moving on to the next fallback model when one's daily free quota is used up."""

    def __init__(self, base_url: str, api_key: str, model: str, fallback_models: list[str] | None = None):
        # Ollama needs no key, but the client insists on one.
        self.client = AsyncOpenAI(base_url=base_url, api_key=api_key or "not-needed", max_retries=1)
        self.models = [model, *(m for m in fallback_models or [] if m != model)]
        self.exhausted: set[str] = set()

    @property
    def model(self) -> str:
        return next((m for m in self.models if m not in self.exhausted), self.models[0])

    async def __call__(self, messages: list[dict], tools: list[dict]) -> LLMMessage:
        for model in [m for m in self.models if m not in self.exhausted]:
            try:
                response = await self.client.chat.completions.create(model=model, messages=messages, tools=tools or None)
                break
            except RateLimitError as e:
                if not is_daily_quota(e):
                    raise LLMRateLimited(
                        f"{model} is rate limited (requests per minute). Try again shortly.",
                        daily=False,
                        retry_after=_retry_after(e),
                    ) from e
                self.exhausted.add(model)
        else:
            tried = ", ".join(self.models)
            raise LLMRateLimited(
                f"The daily free quota is used up for {tried}. Add another model to LLM_FALLBACK_MODELS in .env, "
                "or try again after the quota resets.",
                daily=True,
            )
        message = response.choices[0].message
        return LLMMessage(
            content=message.content,
            tool_calls=[
                ToolCall(
                    id=tc.id or f"call-{uuid.uuid4().hex[:8]}",
                    name=tc.function.name,
                    arguments=tc.function.arguments,
                    extra=dict(tc.model_extra or {}),
                )
                for tc in message.tool_calls or []
            ],
        )


def from_env(use_fallbacks: bool = True) -> OpenAICompatLLM:
    """use_fallbacks=False pins one model (evals: a prompt comparison must not switch models mid-run)."""
    settings = config.llm_settings()
    missing = [name for name, key in (("LLM_BASE_URL", "base_url"), ("LLM_MODEL", "model")) if not settings[key]]
    if missing:
        raise LLMNotConfigured(f"Set {' and '.join(missing)} in .env (see .env.example).")
    if not use_fallbacks:
        settings["fallback_models"] = []
    return OpenAICompatLLM(**settings)
