"""Settings, read from the group folder's .env."""

import os
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

GROUP_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(GROUP_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    data_file: Path
    timezone: ZoneInfo
    proposal_ttl: timedelta
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_api_key: str = ""
    llm_model: str = "openai/gpt-oss-120b"
    prompt_version: str = "v1"


def load_settings() -> Settings:
    return Settings(
        data_file=GROUP_ROOT / os.getenv("DATA_FILE", "backend/data.json"),
        timezone=ZoneInfo(os.getenv("APP_TIMEZONE", "Asia/Dhaka")),
        proposal_ttl=timedelta(minutes=int(os.getenv("PROPOSAL_TTL_MINUTES", "15"))),
        llm_base_url=os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1"),
        llm_api_key=os.getenv("LLM_API_KEY", ""),
        llm_model=os.getenv("LLM_MODEL", "openai/gpt-oss-120b"),
        prompt_version=os.getenv("PROMPT_VERSION", "v1"),
    )
