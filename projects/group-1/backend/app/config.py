import os
from pathlib import Path

# backend/app/config.py -> group-1/
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def data_path() -> Path:
    """Where data.json lives. Read on every call so tests can point DATA_PATH at a temp copy."""
    return Path(os.environ.get("DATA_PATH", PROJECT_ROOT / "data.json"))
