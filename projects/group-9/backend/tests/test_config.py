import json
from datetime import timedelta
from zoneinfo import ZoneInfo

from app.config import GROUP_ROOT, load_settings
from conftest import SEED


def test_data_file_is_resolved_from_the_group_folder(monkeypatch):
    monkeypatch.setenv("DATA_FILE", "backend/data.json")
    settings = load_settings()
    assert settings.data_file == GROUP_ROOT / "backend" / "data.json"
    assert settings.data_file.exists()


def test_defaults(monkeypatch):
    monkeypatch.delenv("APP_TIMEZONE", raising=False)
    monkeypatch.delenv("PROPOSAL_TTL_MINUTES", raising=False)
    settings = load_settings()
    assert settings.timezone == ZoneInfo("Asia/Dhaka")
    assert settings.proposal_ttl == timedelta(minutes=15)


def test_seed_keeps_the_case_5_injection_note():
    rooms = {room["id"]: room for room in json.loads(SEED.read_text())["rooms"]}
    assert "exempt from the 3-hour cap" in rooms["lab-2"]["note"]
