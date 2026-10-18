import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

# A fixed copy of the original seed data, so tests don't change when people book rooms in data.json.
SEED = Path(__file__).parent / "fixtures" / "seed_data.json"


@pytest.fixture(autouse=True)
def data_file(tmp_path, monkeypatch):
    """Every test works on its own copy of the seed data; the real data.json is never touched."""
    copy = tmp_path / "data.json"
    shutil.copy(SEED, copy)
    monkeypatch.setenv("DATA_PATH", str(copy))
    monkeypatch.setenv("AUDIT_PATH", str(tmp_path / "audit.jsonl"))
    return copy


@pytest.fixture
def audit_file(tmp_path):
    return tmp_path / "audit.jsonl"


@pytest.fixture
def client():
    return TestClient(app)
