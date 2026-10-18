import shutil

import pytest
from fastapi.testclient import TestClient

from app.config import PROJECT_ROOT
from app.main import app


@pytest.fixture(autouse=True)
def data_file(tmp_path, monkeypatch):
    """Every test works on its own copy of data.json; the real file is never touched."""
    copy = tmp_path / "data.json"
    shutil.copy(PROJECT_ROOT / "data.json", copy)
    monkeypatch.setenv("DATA_PATH", str(copy))
    return copy


@pytest.fixture
def client():
    return TestClient(app)
