"""The CampusDesk chat agent: an OpenAI-compatible LLM that uses the MCP tools.

It never saves anything. create_booking only makes proposals; a person approves them in the UI.
"""

from datetime import datetime
from pathlib import Path
from string import Template

from app.domain.booking_rules import MAX_DURATION_MINUTES

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
