import shutil
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app.proposals import ProposalStore
from app.store import Store
from app.tools import CampusDesk

SEED = Path(__file__).resolve().parents[1] / "data.seed.json"
DHAKA = ZoneInfo("Asia/Dhaka")
FIXED_NOW = datetime(2026, 10, 18, 10, 0, tzinfo=DHAKA)  # a Sunday


class FakeClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


@pytest.fixture
def data_file(tmp_path: Path) -> Path:
    path = tmp_path / "data.json"
    shutil.copy(SEED, path)
    return path


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock(FIXED_NOW)


@pytest.fixture
def desk(data_file: Path, clock: FakeClock) -> CampusDesk:
    return CampusDesk(Store(data_file), ProposalStore(timedelta(minutes=15)), clock)
