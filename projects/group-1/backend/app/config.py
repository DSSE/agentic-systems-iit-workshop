import os
from pathlib import Path

from dotenv import load_dotenv

# backend/app/config.py -> group-1/
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# .env holds the LLM settings. Real environment variables win over it.
load_dotenv(PROJECT_ROOT / ".env", override=False)


def data_path() -> Path:
    """Where data.json lives. Read on every call so tests can point DATA_PATH at a temp copy."""
    return Path(os.environ.get("DATA_PATH", PROJECT_ROOT / "data.json"))


def audit_path() -> Path:
    """Where refused bookings are logged (one JSON object per line)."""
    return Path(os.environ.get("AUDIT_PATH", PROJECT_ROOT / "backend" / "logs" / "audit.jsonl"))


def llm_settings() -> dict:
    """OpenAI-compatible endpoint for the chat agent. Any provider works; nothing is hard-coded."""
    return {
        "base_url": os.environ.get("LLM_BASE_URL", "").strip(),
        "api_key": os.environ.get("LLM_API_KEY", "").strip(),
        "model": os.environ.get("LLM_MODEL", "").strip(),
        # Tried in order when a model's daily free quota runs out, e.g. "gemini-3.1-flash-lite,gemini-3-flash-preview".
        "fallback_models": [m.strip() for m in os.environ.get("LLM_FALLBACK_MODELS", "").split(",") if m.strip()],
    }


def mcp_url() -> str | None:
    """Set MCP_URL to have the chat agent use a separately running MCP server over HTTP.
    Unset (the default), it connects to the same MCP server in-process."""
    return os.environ.get("MCP_URL", "").strip() or None
