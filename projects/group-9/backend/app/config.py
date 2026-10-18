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


def load_settings() -> Settings:
    return Settings(
        data_file=GROUP_ROOT / os.getenv("DATA_FILE", "backend/data.json"),
        timezone=ZoneInfo(os.getenv("APP_TIMEZONE", "Asia/Dhaka")),
        proposal_ttl=timedelta(minutes=int(os.getenv("PROPOSAL_TTL_MINUTES", "15"))),
    )
