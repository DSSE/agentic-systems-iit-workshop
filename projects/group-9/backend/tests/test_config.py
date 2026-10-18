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


def test_llm_settings_come_from_the_environment(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "http://localhost:11434/v1")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "some-model")
    monkeypatch.setenv("PROMPT_VERSION", "v2")
    settings = load_settings()
    assert (settings.llm_base_url, settings.llm_api_key, settings.llm_model, settings.prompt_version) == (
        "http://localhost:11434/v1", "test-key", "some-model", "v2",
    )


def test_settings_built_in_tests_have_no_llm_key(tmp_path):
    from app.config import Settings

    settings = Settings(data_file=tmp_path / "d.json", timezone=ZoneInfo("Asia/Dhaka"), proposal_ttl=timedelta(minutes=15))
    assert settings.llm_api_key == ""
    assert settings.llm_model == "openai/gpt-oss-120b"
