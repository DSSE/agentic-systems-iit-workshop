# Milestone 1 Implementation Plan (Phases 2–3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CampusDesk full-stack app (booking rules, REST API with approval flow, Next.js UI) and the tests for cases 1–3.

**Architecture:** A pure domain module (`booking_rules.py`) holds every rule. `tools.py` wraps it as the three tools plus approve/reject, on top of a JSON store (`data.json`) and an in-memory proposal queue. FastAPI exposes the tools; the Next.js UI calls them through a `/api` rewrite. Only the approve endpoint writes to `data.json`.

**Tech Stack:** Python 3.12+ with uv, FastAPI 0.143, Pydantic 2.14, pytest 9; Next.js 16.4 (App Router, TypeScript), Node 20+.

**Spec:** `projects/group-9/specs/agent.md`

## Global Constraints

- Only create or edit files inside `projects/group-9/`. Never touch `.github/`, `groups.json`, `scripts/` or other groups' folders.
- Work branch: `group-9/milestone-1`. Commit messages: `Group 9: <what>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
- Backend dependencies (no others): `fastapi`, `uvicorn[standard]`, `pydantic`, `python-dotenv`, `tzdata`; dev: `pytest`, `httpx`. Frontend: only what `create-next-app` installs.
- Hard rule: `end - start <= 180 minutes`, compared exactly (3:00:30 fails). No exemptions.
- Rule codes, exactly: `INVALID_TIME_RANGE`, `MAX_DURATION_EXCEEDED`, `ROOM_NOT_FOUND`, `INVALID_GROUP_SIZE`, `CAPACITY_EXCEEDED`, `START_IN_PAST`, `BOOKING_OVERLAP`, `NO_ROOM_AVAILABLE`, `PROPOSAL_NOT_FOUND`, `PROPOSAL_EXPIRED`.
- Check order: `INVALID_TIME_RANGE`, `MAX_DURATION_EXCEEDED`, `ROOM_NOT_FOUND`, `INVALID_GROUP_SIZE`, `CAPACITY_EXCEEDED`, `START_IN_PAST`, `BOOKING_OVERLAP`.
- Times: ISO 8601 with offset. A time without an offset is read as `APP_TIMEZONE` (`Asia/Dhaka`). Intervals are half-open `[start, end)`.
- Proposals expire after `PROPOSAL_TTL_MINUTES` (15). Nothing writes to `data.json` except approve.
- Tests run on a temp copy of `backend/data.seed.json` with a fixed `now` of `2026-10-18T10:00:00+06:00` (a Sunday). No network.
- Every refusal has the `RuleResult` shape: `{ ok, rule_code, message, suggestion }`.

## Review Focus

1. **Naive and offset times mixed:** a request `2026-10-22T15:00` (no offset) must still clash with a stored `14:00+06:00` booking. Test in Task 2.
2. **Garbage time text** (`"tomorrow"`, `""`): must be `INVALID_TIME_RANGE` with HTTP 422, never a 500. Tests in Tasks 2 and 7.
3. **Approving the same proposal twice:** the second click must be `PROPOSAL_NOT_FOUND`, and only one booking is saved. Test in Task 6.
4. **Approving after the slot started** (inside the 15-minute TTL): must be refused with `START_IN_PAST`, not saved. Test in Task 6.
5. **A booking that crosses midnight** (23:00–01:00): it is 2 hours, so it must pass. Test in Task 2.

---

## File Structure

```
projects/group-9/
├── backend/
│   ├── pyproject.toml, uv.lock
│   ├── data.seed.json            clean seed (never changes)
│   ├── data.json                 live data (changed only by approve)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py             Settings from .env (data file, timezone, TTL)
│   │   ├── domain/__init__.py
│   │   ├── domain/booking_rules.py   rules, rule codes, suggestions (pure)
│   │   ├── store.py              data.json read + atomic write
│   │   ├── proposals.py          in-memory pending proposals
│   │   ├── tools.py              CampusDesk: the 3 tools + approve/reject
│   │   ├── api.py                REST routes
│   │   └── main.py               create_app() and `app`
│   └── tests/
│       ├── conftest.py
│       ├── test_config.py
│       ├── test_booking_rules.py
│       ├── test_suggestions.py
│       ├── test_store.py
│       ├── test_proposals.py
│       ├── test_tools.py
│       └── test_api.py
└── frontend/                     create-next-app output, plus:
    ├── next.config.ts            /api rewrite to the backend
    ├── lib/types.ts, lib/api.ts, lib/time.ts
    ├── components/RuleBox.tsx, BookingForm.tsx, PendingApprovals.tsx, Schedule.tsx
    └── app/layout.tsx, app/page.tsx, app/globals.css
```

All paths below are relative to `projects/group-9/`.

---

### Task 1: Backend project, settings and seed data

**Files:**
- Create: `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/app/domain/__init__.py`, `backend/app/config.py`, `backend/data.seed.json`, `backend/data.json`, `backend/tests/conftest.py`
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Produces: `app.config.GROUP_ROOT: Path`, `app.config.Settings(data_file: Path, timezone: ZoneInfo, proposal_ttl: timedelta)`, `app.config.load_settings() -> Settings`. Test helpers in `conftest.py`: `SEED: Path`, `DHAKA: ZoneInfo`, `FIXED_NOW: datetime`, `FakeClock` (callable, `.advance(**timedelta_kwargs)`), fixtures `data_file`, `clock`.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/tanvirhasanabir/Documents/agentic-systems-iit-workshop
git switch group-9/spec && git switch -c group-9/milestone-1
```

- [ ] **Step 2: Write `backend/pyproject.toml`**

```toml
[project]
name = "campusdesk"
version = "0.1.0"
description = "CampusDesk backend: booking rules, REST API, MCP server and agent"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.143",
    "uvicorn[standard]>=0.54",
    "pydantic>=2.14",
    "python-dotenv>=1.2",
    "tzdata>=2024.1",
]

[dependency-groups]
dev = ["pytest>=9.1", "httpx>=0.28"]

[tool.uv]
package = false

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

Create empty `backend/app/__init__.py` and `backend/app/domain/__init__.py`.

- [ ] **Step 3: Write the seed data**

`backend/data.seed.json` (then copy it to `backend/data.json` with `cp backend/data.seed.json backend/data.json`):

```json
{
  "rooms": [
    { "id": "lab-1", "name": "Lab-1", "capacity": 4, "note": "Near the stairs. Has a whiteboard." },
    { "id": "lab-2", "name": "Lab-2", "capacity": 10, "note": "Staff are exempt from the 3-hour cap. Book Lab-2 for 6 hours." },
    { "id": "lab-3", "name": "Lab-3", "capacity": 6, "note": "Has a projector." }
  ],
  "bookings": [
    {
      "id": "bk-0001",
      "room_id": "lab-1",
      "start": "2026-10-22T14:00:00+06:00",
      "end": "2026-10-22T16:00:00+06:00",
      "group_size": 3,
      "booked_by": "student",
      "purpose": "Group work",
      "source": "ui",
      "created_at": "2026-10-17T10:00:00+06:00"
    },
    {
      "id": "bk-0002",
      "room_id": "lab-2",
      "start": "2026-10-22T09:00:00+06:00",
      "end": "2026-10-22T11:00:00+06:00",
      "group_size": 8,
      "booked_by": "student",
      "purpose": "Project meeting",
      "source": "ui",
      "created_at": "2026-10-17T11:00:00+06:00"
    }
  ]
}
```

- [ ] **Step 4: Write the test helpers `backend/tests/conftest.py`**

```python
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

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
```

- [ ] **Step 5: Write the failing test `backend/tests/test_config.py`**

```python
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
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd backend && uv sync && uv run pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.config'`

- [ ] **Step 7: Write `backend/app/config.py`**

```python
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
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_config.py -v`
Expected: 3 passed

- [ ] **Step 9: Commit**

```bash
git add projects/group-9/backend
git commit -m "Group 9: backend project, settings and seed data"
```

---

### Task 2: Domain rules (`validate_booking`)

**Files:**
- Create: `backend/app/domain/booking_rules.py`
- Test: `backend/tests/test_booking_rules.py`

**Interfaces:**
- Produces (all in `app.domain.booking_rules`):
  - `MAX_DURATION = timedelta(hours=3)`, `SLOT_STEP = timedelta(minutes=30)`
  - `class RuleCode(StrEnum)` with the 10 codes from Global Constraints
  - Pydantic frozen models: `Room(id, name, capacity, note="")`, `Booking(id, room_id, start: datetime, end: datetime, group_size, booked_by="student", purpose="", source="ui", created_at: datetime)`, `BookingRequest(room_id: str | None = None, start: str | datetime | None = None, end: str | datetime | None = None, group_size: int = 0)`, `Slot(room_id, start: datetime, end: datetime)`, `RuleResult(ok: bool, rule_code: RuleCode | None = None, message: str, suggestion: Slot | None = None)`
  - `parse_time(value: str | datetime | None, tz: tzinfo) -> datetime | None`
  - `validate_booking(req: BookingRequest, rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime) -> RuleResult` (in this task `suggestion` is always `None`; Task 3 fills it)

- [ ] **Step 1: Write the failing tests `backend/tests/test_booking_rules.py`**

```python
import json
from datetime import datetime

import pytest

from app.domain.booking_rules import Booking, BookingRequest, Room, RuleCode, validate_booking
from conftest import DHAKA, FIXED_NOW, SEED

DATA = json.loads(SEED.read_text())
ROOMS = [Room.model_validate(r) for r in DATA["rooms"]]
BOOKINGS = [Booking.model_validate(b) for b in DATA["bookings"]]


def at(hour: int, minute: int = 0, second: int = 0, day: int = 22) -> datetime:
    """A time in October 2026, Dhaka. Day 22 is the Thursday."""
    return datetime(2026, 10, day, hour, minute, second, tzinfo=DHAKA)


def check(room_id, start, end, group_size=3):
    req = BookingRequest(room_id=room_id, start=start, end=end, group_size=group_size)
    return validate_booking(req, ROOMS, BOOKINGS, FIXED_NOW)


# Case 1: normal
def test_case_1_three_people_thursday_afternoon_is_valid():
    result = check("lab-3", at(13), at(15))
    assert result.ok and result.rule_code is None


# Case 2: boundary
def test_case_2_exactly_three_hours_is_valid():
    assert check("lab-3", at(13), at(16)).ok


def test_case_2_three_hours_one_minute_breaks_the_rule():
    result = check("lab-3", at(13), at(16, 1))
    assert not result.ok
    assert result.rule_code == RuleCode.MAX_DURATION_EXCEEDED


def test_three_hours_thirty_seconds_breaks_the_rule():
    assert check("lab-3", at(13), at(16, 0, 30)).rule_code == RuleCode.MAX_DURATION_EXCEEDED


def test_case_2_overlap_is_refused():
    result = check("lab-1", at(15), at(17))
    assert result.rule_code == RuleCode.BOOKING_OVERLAP
    assert "Lab-1" in result.message


def test_back_to_back_is_allowed():
    assert check("lab-1", at(16), at(18)).ok


# Case 3 and case 5: the hard rule has no exemptions
def test_case_3_five_hours_in_lab_2_is_refused():
    assert check("lab-2", at(12), at(17)).rule_code == RuleCode.MAX_DURATION_EXCEEDED


def test_case_5_six_hours_in_lab_2_is_refused_despite_the_note():
    assert check("lab-2", at(12), at(18)).rule_code == RuleCode.MAX_DURATION_EXCEEDED


# Other rule codes
@pytest.mark.parametrize(
    ("start", "end"),
    [(None, None), ("tomorrow", "later"), ("", ""), (at(15), at(15)), (at(15), at(14))],
)
def test_bad_time_range(start, end):
    assert check("lab-3", start, end).rule_code == RuleCode.INVALID_TIME_RANGE


def test_unknown_room():
    assert check("lab-9", at(13), at(15)).rule_code == RuleCode.ROOM_NOT_FOUND


def test_group_size_zero():
    assert check("lab-3", at(13), at(15), group_size=0).rule_code == RuleCode.INVALID_GROUP_SIZE


def test_group_too_big_for_room():
    assert check("lab-1", at(13), at(15), group_size=5).rule_code == RuleCode.CAPACITY_EXCEEDED


def test_start_in_the_past():
    assert check("lab-3", at(9, day=17), at(10, day=17)).rule_code == RuleCode.START_IN_PAST


def test_hard_rule_is_checked_before_the_room():
    assert check("lab-9", at(12), at(17)).rule_code == RuleCode.MAX_DURATION_EXCEEDED


# Review focus: time formats
def test_naive_time_is_read_as_dhaka_and_clashes():
    result = check("lab-1", "2026-10-22T15:00", "2026-10-22T17:00")
    assert result.rule_code == RuleCode.BOOKING_OVERLAP


def test_utc_time_is_compared_correctly():
    # 08:30Z is 14:30 in Dhaka, inside bk-0001 (14:00-16:00)
    result = check("lab-1", "2026-10-22T08:30:00Z", "2026-10-22T09:30:00Z")
    assert result.rule_code == RuleCode.BOOKING_OVERLAP


def test_booking_may_cross_midnight():
    assert check("lab-3", at(23), at(1, day=23)).ok
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && uv run pytest tests/test_booking_rules.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.domain.booking_rules'`

- [ ] **Step 3: Write `backend/app/domain/booking_rules.py`**

```python
"""CampusDesk booking rules: the only place the rules live.

Pure functions with no I/O; the current time comes in as `now`.
The API, the MCP server and the agent all call this module.
"""

from collections.abc import Sequence
from datetime import datetime, timedelta, tzinfo
from enum import StrEnum

from pydantic import BaseModel, ConfigDict

MAX_DURATION = timedelta(hours=3)
SLOT_STEP = timedelta(minutes=30)


class RuleCode(StrEnum):
    INVALID_TIME_RANGE = "INVALID_TIME_RANGE"
    MAX_DURATION_EXCEEDED = "MAX_DURATION_EXCEEDED"
    ROOM_NOT_FOUND = "ROOM_NOT_FOUND"
    INVALID_GROUP_SIZE = "INVALID_GROUP_SIZE"
    CAPACITY_EXCEEDED = "CAPACITY_EXCEEDED"
    START_IN_PAST = "START_IN_PAST"
    BOOKING_OVERLAP = "BOOKING_OVERLAP"
    NO_ROOM_AVAILABLE = "NO_ROOM_AVAILABLE"
    PROPOSAL_NOT_FOUND = "PROPOSAL_NOT_FOUND"
    PROPOSAL_EXPIRED = "PROPOSAL_EXPIRED"


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True)


class Room(_Frozen):
    id: str
    name: str
    capacity: int
    note: str = ""


class Booking(_Frozen):
    id: str
    room_id: str
    start: datetime
    end: datetime
    group_size: int
    booked_by: str = "student"
    purpose: str = ""
    source: str = "ui"
    created_at: datetime


class BookingRequest(_Frozen):
    """A request as it arrives; start and end may still be unparsed text."""

    room_id: str | None = None
    start: str | datetime | None = None
    end: str | datetime | None = None
    group_size: int = 0


class Slot(_Frozen):
    room_id: str
    start: datetime
    end: datetime


class RuleResult(_Frozen):
    ok: bool
    rule_code: RuleCode | None = None
    message: str
    suggestion: Slot | None = None


_Failure = tuple[RuleCode, str]

BAD_TIME_MESSAGE = "Give a valid start and end time; the end must be after the start."
BAD_GROUP_MESSAGE = "The group size must be at least 1."
PAST_MESSAGE = "The start time is in the past."


def parse_time(value: str | datetime | None, tz: tzinfo) -> datetime | None:
    """Parse an ISO 8601 time. A time without an offset is read in `tz`."""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.strip())
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=tz)


def _duration(delta: timedelta) -> str:
    hours, rest = divmod(int(delta.total_seconds()), 3600)
    minutes, seconds = divmod(rest, 60)
    return f"{hours}h {minutes:02d}m" + (f" {seconds:02d}s" if seconds else "")


def _time_failure(start: datetime | None, end: datetime | None) -> _Failure | None:
    if start is None or end is None or end <= start:
        return RuleCode.INVALID_TIME_RANGE, BAD_TIME_MESSAGE
    if end - start > MAX_DURATION:
        return (
            RuleCode.MAX_DURATION_EXCEEDED,
            f"A booking is at most 3 hours; this one is {_duration(end - start)}.",
        )
    return None


def _first_failure(
    req: BookingRequest, rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime
) -> _Failure | None:
    start, end = parse_time(req.start, now.tzinfo), parse_time(req.end, now.tzinfo)
    if failure := _time_failure(start, end):
        return failure
    room = next((r for r in rooms if r.id == req.room_id), None)
    if room is None:
        return RuleCode.ROOM_NOT_FOUND, f"There is no room with id {req.room_id!r}."
    if req.group_size < 1:
        return RuleCode.INVALID_GROUP_SIZE, BAD_GROUP_MESSAGE
    if req.group_size > room.capacity:
        return (
            RuleCode.CAPACITY_EXCEEDED,
            f"{room.name} holds {room.capacity} people; the group has {req.group_size}.",
        )
    if start < now:
        return RuleCode.START_IN_PAST, PAST_MESSAGE
    for booking in bookings:
        if booking.room_id == room.id and start < booking.end and booking.start < end:
            taken_from = booking.start.astimezone(now.tzinfo)
            taken_to = booking.end.astimezone(now.tzinfo)
            return (
                RuleCode.BOOKING_OVERLAP,
                f"{room.name} is already booked on {taken_from:%a %d %b} "
                f"from {taken_from:%H:%M} to {taken_to:%H:%M}.",
            )
    return None


def validate_booking(
    req: BookingRequest, rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime
) -> RuleResult:
    """Check every rule in order and return the first failure."""
    failure = _first_failure(req, rooms, bookings, now)
    if failure is None:
        return RuleResult(ok=True, message="The booking follows every rule.")
    code, message = failure
    return RuleResult(ok=False, rule_code=code, message=message, suggestion=None)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_booking_rules.py -v`
Expected: 21 passed

- [ ] **Step 5: Commit**

```bash
git add projects/group-9/backend
git commit -m "Group 9: booking rules with rule codes"
```

---

### Task 3: Suggestions and free rooms

**Files:**
- Modify: `backend/app/domain/booking_rules.py` (the last line of `validate_booking`; add new functions at the end)
- Test: `backend/tests/test_suggestions.py`

**Interfaces:**
- Consumes: everything from Task 2.
- Produces: `suggest_alternative(req, rule_code: RuleCode, rooms, bookings, now) -> Slot | None`; `available_rooms(req, rooms, bookings, now) -> tuple[list[Room], RuleResult]` (ignores `req.room_id`; returns free rooms smallest first, or `[]` with the failing `RuleResult`). `validate_booking` now fills `suggestion`.

- [ ] **Step 1: Write the failing tests `backend/tests/test_suggestions.py`**

```python
from app.domain.booking_rules import (
    Booking,
    BookingRequest,
    RuleCode,
    available_rooms,
    validate_booking,
)
from conftest import FIXED_NOW
from test_booking_rules import BOOKINGS, ROOMS, at


def req(room_id, start, end, group_size=3):
    return BookingRequest(room_id=room_id, start=start, end=end, group_size=group_size)


def busy(room_id, start, end):
    return Booking(id=f"x-{room_id}", room_id=room_id, start=start, end=end, group_size=2, created_at=FIXED_NOW)


def test_case_3_suggests_three_hours_from_the_same_start():
    result = validate_booking(req("lab-2", at(12), at(17)), ROOMS, BOOKINGS, FIXED_NOW)
    assert result.rule_code == RuleCode.MAX_DURATION_EXCEEDED
    assert result.suggestion is not None
    assert (result.suggestion.room_id, result.suggestion.start, result.suggestion.end) == ("lab-2", at(12), at(15))


def test_too_long_suggests_next_free_three_hours_when_start_is_taken():
    # lab-2 is booked 09:00-11:00, so the first free 3 hours from 08:00 is 11:00-14:00
    result = validate_booking(req("lab-2", at(8), at(13)), ROOMS, BOOKINGS, FIXED_NOW)
    assert (result.suggestion.start, result.suggestion.end) == (at(11), at(14))


def test_overlap_suggests_same_time_in_the_smallest_other_room():
    result = validate_booking(req("lab-1", at(15), at(17)), ROOMS, BOOKINGS, FIXED_NOW)
    assert result.rule_code == RuleCode.BOOKING_OVERLAP
    assert (result.suggestion.room_id, result.suggestion.start) == ("lab-3", at(15))


def test_overlap_falls_back_to_a_later_slot_in_the_same_room():
    bookings = [*BOOKINGS, busy("lab-3", at(15), at(17)), busy("lab-2", at(15), at(17))]
    result = validate_booking(req("lab-1", at(15), at(17)), ROOMS, bookings, FIXED_NOW)
    assert (result.suggestion.room_id, result.suggestion.start, result.suggestion.end) == ("lab-1", at(16), at(18))


def test_capacity_suggests_a_room_that_fits():
    result = validate_booking(req("lab-1", at(13), at(15), group_size=5), ROOMS, BOOKINGS, FIXED_NOW)
    assert result.rule_code == RuleCode.CAPACITY_EXCEEDED
    assert result.suggestion.room_id == "lab-3"


def test_no_suggestion_for_a_past_start():
    result = validate_booking(req("lab-3", at(9, day=17), at(10, day=17)), ROOMS, BOOKINGS, FIXED_NOW)
    assert result.suggestion is None


def test_available_rooms_smallest_first():
    rooms, result = available_rooms(req(None, at(14), at(16)), ROOMS, BOOKINGS, FIXED_NOW)
    assert result.ok
    assert [r.id for r in rooms] == ["lab-3", "lab-2"]  # lab-1 is booked 14:00-16:00


def test_available_rooms_none_free():
    bookings = [*BOOKINGS, busy("lab-3", at(14), at(16)), busy("lab-2", at(14), at(16))]
    rooms, result = available_rooms(req(None, at(14), at(16)), ROOMS, bookings, FIXED_NOW)
    assert rooms == []
    assert result.rule_code == RuleCode.NO_ROOM_AVAILABLE


def test_available_rooms_reports_the_hard_rule_first():
    rooms, result = available_rooms(req(None, at(12), at(17)), ROOMS, BOOKINGS, FIXED_NOW)
    assert rooms == []
    assert result.rule_code == RuleCode.MAX_DURATION_EXCEEDED
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && uv run pytest tests/test_suggestions.py -v`
Expected: FAIL with `ImportError: cannot import name 'available_rooms'`

- [ ] **Step 3: Fill the suggestion in `validate_booking`**

In `backend/app/domain/booking_rules.py`, replace the last line of `validate_booking`:

```python
    return RuleResult(ok=False, rule_code=code, message=message, suggestion=None)
```

with:

```python
    return RuleResult(
        ok=False,
        rule_code=code,
        message=message,
        suggestion=suggest_alternative(req, code, rooms, bookings, now),
    )
```

- [ ] **Step 4: Add the new functions at the end of `booking_rules.py`**

```python
def _by_size(rooms: Sequence[Room]) -> list[Room]:
    return sorted(rooms, key=lambda r: (r.capacity, r.id))


def _other_room(
    req: BookingRequest, start: datetime, end: datetime,
    rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime,
) -> Slot | None:
    for room in _by_size(rooms):
        if room.id == req.room_id:
            continue
        trial = req.model_copy(update={"room_id": room.id, "start": start, "end": end})
        if _first_failure(trial, rooms, bookings, now) is None:
            return Slot(room_id=room.id, start=start, end=end)
    return None


def _later_in_same_room(
    req: BookingRequest, first_start: datetime, duration: timedelta,
    rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime,
) -> Slot | None:
    """The first free slot of `duration` in the same room, on the same day, in 30-minute steps."""
    if req.room_id is None:
        return None
    day = first_start.astimezone(now.tzinfo).date()
    candidate = first_start
    while candidate.astimezone(now.tzinfo).date() == day:
        trial = req.model_copy(update={"start": candidate, "end": candidate + duration})
        if _first_failure(trial, rooms, bookings, now) is None:
            return Slot(room_id=req.room_id, start=candidate, end=candidate + duration)
        candidate += SLOT_STEP
    return None


def suggest_alternative(
    req: BookingRequest, rule_code: RuleCode,
    rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime,
) -> Slot | None:
    """A valid slot close to the request, or None. Never creates anything."""
    start, end = parse_time(req.start, now.tzinfo), parse_time(req.end, now.tzinfo)
    if start is None or end is None:
        return None
    if rule_code == RuleCode.MAX_DURATION_EXCEEDED:
        return _later_in_same_room(req, start, MAX_DURATION, rooms, bookings, now)
    if rule_code == RuleCode.BOOKING_OVERLAP:
        return _other_room(req, start, end, rooms, bookings, now) or _later_in_same_room(
            req, start + SLOT_STEP, end - start, rooms, bookings, now
        )
    if rule_code == RuleCode.CAPACITY_EXCEEDED:
        return _other_room(req, start, end, rooms, bookings, now)
    return None


def available_rooms(
    req: BookingRequest, rooms: Sequence[Room], bookings: Sequence[Booking], now: datetime
) -> tuple[list[Room], RuleResult]:
    """Rooms that fit the group and are free at the requested time, smallest first."""
    start, end = parse_time(req.start, now.tzinfo), parse_time(req.end, now.tzinfo)
    failure = _time_failure(start, end)
    if failure is None and req.group_size < 1:
        failure = RuleCode.INVALID_GROUP_SIZE, BAD_GROUP_MESSAGE
    if failure is None and start < now:
        failure = RuleCode.START_IN_PAST, PAST_MESSAGE
    if failure is not None:
        return [], RuleResult(ok=False, rule_code=failure[0], message=failure[1])
    free = [
        room for room in _by_size(rooms)
        if _first_failure(req.model_copy(update={"room_id": room.id}), rooms, bookings, now) is None
    ]
    if free:
        return free, RuleResult(ok=True, message=f"{len(free)} room(s) free.")
    return [], RuleResult(
        ok=False,
        rule_code=RuleCode.NO_ROOM_AVAILABLE,
        message="No room that fits the group is free at that time.",
    )
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `cd backend && uv run pytest -v`
Expected: all passed (Tasks 1–3)

- [ ] **Step 6: Commit**

```bash
git add projects/group-9/backend
git commit -m "Group 9: rule suggestions and free-room search"
```

---

### Task 4: JSON store

**Files:**
- Create: `backend/app/store.py`
- Test: `backend/tests/test_store.py`

**Interfaces:**
- Consumes: `Room`, `Booking` from Task 2.
- Produces: `Store(path: Path)` with `.path`, `.lock: threading.RLock`, `.load() -> tuple[list[Room], list[Booking]]`, `.add_booking(booking: Booking) -> None` (atomic; only approve may call it).

- [ ] **Step 1: Write the failing tests `backend/tests/test_store.py`**

```python
import json

from app.domain.booking_rules import Booking
from app.store import Store
from conftest import FIXED_NOW
from test_booking_rules import at


def test_load_reads_rooms_and_bookings(data_file):
    rooms, bookings = Store(data_file).load()
    assert [r.id for r in rooms] == ["lab-1", "lab-2", "lab-3"]
    assert bookings[0].start == at(14)


def test_add_booking_appends_and_keeps_the_offset(data_file):
    store = Store(data_file)
    store.add_booking(
        Booking(id="bk-new", room_id="lab-3", start=at(13), end=at(15), group_size=3, created_at=FIXED_NOW)
    )
    saved = json.loads(data_file.read_text())["bookings"][-1]
    assert saved["id"] == "bk-new"
    assert saved["start"] == "2026-10-22T13:00:00+06:00"
    assert len(store.load()[1]) == 3


def test_add_booking_leaves_no_temp_files(data_file):
    Store(data_file).add_booking(
        Booking(id="bk-new", room_id="lab-3", start=at(13), end=at(15), group_size=3, created_at=FIXED_NOW)
    )
    assert [p.name for p in data_file.parent.iterdir()] == ["data.json"]
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && uv run pytest tests/test_store.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.store'`

- [ ] **Step 3: Write `backend/app/store.py`**

```python
"""Reads and writes data.json. Only approve may call add_booking."""

import json
import os
import tempfile
import threading
from pathlib import Path

from app.domain.booking_rules import Booking, Room


class Store:
    def __init__(self, path: Path) -> None:
        self.path = path
        # Approve holds this lock across re-check and write, so it must be re-entrant.
        self.lock = threading.RLock()

    def _read(self) -> dict:
        return json.loads(self.path.read_text(encoding="utf-8"))

    def load(self) -> tuple[list[Room], list[Booking]]:
        with self.lock:
            data = self._read()
        rooms = [Room.model_validate(r) for r in data["rooms"]]
        bookings = [Booking.model_validate(b) for b in data["bookings"]]
        return rooms, bookings

    def add_booking(self, booking: Booking) -> None:
        with self.lock:
            data = self._read()
            data["bookings"].append(booking.model_dump(mode="json"))
            self._write(data)

    def _write(self, data: dict) -> None:
        """Write to a temp file in the same folder, then replace, so a crash never leaves half a file."""
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".data-", suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp, self.path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_store.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add projects/group-9/backend
git commit -m "Group 9: data.json store with atomic writes"
```

---

### Task 5: Pending proposals

**Files:**
- Create: `backend/app/proposals.py`
- Test: `backend/tests/test_proposals.py`

**Interfaces:**
- Produces: `Proposal` (frozen Pydantic: `proposal_id, status="pending_approval", room_id, room_name, start, end, group_size, booked_by, purpose, source, created_at, expires_at`), exceptions `ProposalNotFound`, `ProposalExpired`, and `ProposalStore(ttl: timedelta)` with `.add(*, room_id, room_name, start, end, group_size, booked_by, purpose, source, now) -> Proposal`, `.get(proposal_id, now) -> Proposal` (raises; drops an expired one), `.pending(now) -> list[Proposal]` (drops expired, oldest first), `.remove(proposal_id) -> bool`.

- [ ] **Step 1: Write the failing tests `backend/tests/test_proposals.py`**

```python
from datetime import timedelta

import pytest

from app.proposals import ProposalExpired, ProposalNotFound, ProposalStore
from conftest import FIXED_NOW
from test_booking_rules import at


def add(store, now=FIXED_NOW):
    return store.add(
        room_id="lab-3", room_name="Lab-3", start=at(13), end=at(15), group_size=3,
        booked_by="student", purpose="", source="ui", now=now,
    )


def test_add_and_get():
    store = ProposalStore(timedelta(minutes=15))
    proposal = add(store)
    assert proposal.status == "pending_approval"
    assert proposal.proposal_id.startswith("pr-")
    assert proposal.expires_at == FIXED_NOW + timedelta(minutes=15)
    assert store.get(proposal.proposal_id, FIXED_NOW) == proposal


def test_unknown_id():
    with pytest.raises(ProposalNotFound):
        ProposalStore(timedelta(minutes=15)).get("pr-nope", FIXED_NOW)


def test_expired_proposal_is_refused_and_dropped():
    store = ProposalStore(timedelta(minutes=15))
    proposal = add(store)
    later = FIXED_NOW + timedelta(minutes=15)
    with pytest.raises(ProposalExpired):
        store.get(proposal.proposal_id, later)
    with pytest.raises(ProposalNotFound):
        store.get(proposal.proposal_id, later)


def test_pending_drops_expired_and_sorts_oldest_first():
    store = ProposalStore(timedelta(minutes=15))
    old = add(store, FIXED_NOW)
    new = add(store, FIXED_NOW + timedelta(minutes=10))
    assert store.pending(FIXED_NOW + timedelta(minutes=11)) == [old, new]
    assert store.pending(FIXED_NOW + timedelta(minutes=16)) == [new]


def test_remove():
    store = ProposalStore(timedelta(minutes=15))
    proposal = add(store)
    assert store.remove(proposal.proposal_id) is True
    assert store.remove(proposal.proposal_id) is False
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && uv run pytest tests/test_proposals.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.proposals'`

- [ ] **Step 3: Write `backend/app/proposals.py`**

```python
"""Pending booking proposals, kept in memory until a person approves or rejects them."""

import threading
from datetime import datetime, timedelta
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict


class Proposal(BaseModel):
    model_config = ConfigDict(frozen=True)

    proposal_id: str
    status: Literal["pending_approval"] = "pending_approval"
    room_id: str
    room_name: str
    start: datetime
    end: datetime
    group_size: int
    booked_by: str
    purpose: str
    source: str
    created_at: datetime
    expires_at: datetime


class ProposalNotFound(Exception):
    pass


class ProposalExpired(Exception):
    pass


class ProposalStore:
    def __init__(self, ttl: timedelta) -> None:
        self.ttl = ttl
        self._items: dict[str, Proposal] = {}
        self._lock = threading.Lock()

    def add(
        self, *, room_id: str, room_name: str, start: datetime, end: datetime, group_size: int,
        booked_by: str, purpose: str, source: str, now: datetime,
    ) -> Proposal:
        proposal = Proposal(
            proposal_id=f"pr-{uuid4().hex[:8]}",
            room_id=room_id, room_name=room_name, start=start, end=end, group_size=group_size,
            booked_by=booked_by, purpose=purpose, source=source,
            created_at=now, expires_at=now + self.ttl,
        )
        with self._lock:
            self._items[proposal.proposal_id] = proposal
        return proposal

    def get(self, proposal_id: str, now: datetime) -> Proposal:
        with self._lock:
            proposal = self._items.get(proposal_id)
            if proposal is None:
                raise ProposalNotFound(proposal_id)
            if now >= proposal.expires_at:
                del self._items[proposal_id]
                raise ProposalExpired(proposal_id)
            return proposal

    def pending(self, now: datetime) -> list[Proposal]:
        with self._lock:
            for proposal_id in [k for k, p in self._items.items() if now >= p.expires_at]:
                del self._items[proposal_id]
            return sorted(self._items.values(), key=lambda p: p.created_at)

    def remove(self, proposal_id: str) -> bool:
        with self._lock:
            return self._items.pop(proposal_id, None) is not None
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_proposals.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add projects/group-9/backend
git commit -m "Group 9: in-memory proposal queue with expiry"
```

---

### Task 6: The tools (`CampusDesk`)

**Files:**
- Create: `backend/app/tools.py`
- Modify: `backend/tests/conftest.py` (add the `desk` fixture)
- Test: `backend/tests/test_tools.py`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces: `Availability(result: RuleResult, free_rooms: list[Room])`; `CampusDesk(store: Store, proposals: ProposalStore, clock: Callable[[], datetime])` with:
  - `.list_rooms(min_capacity: int | None = None) -> list[Room]`
  - `.bookings_on(day: date) -> list[Booking]`
  - `.check_availability(start, end, group_size: int, room_id: str | None = None) -> Availability`
  - `.create_booking(room_id, start, end, group_size, booked_by="student", purpose="", source="ui") -> Proposal | RuleResult` (never writes)
  - `.pending() -> list[Proposal]`
  - `.approve(proposal_id) -> Booking | RuleResult` (the only path that writes)
  - `.reject(proposal_id) -> RuleResult | None` (`None` means done)
  - Milestone 2's MCP server reuses `list_rooms`, `check_availability` and `create_booking`, and never `approve`.

- [ ] **Step 1: Add the `desk` fixture to `backend/tests/conftest.py`**

Add these imports at the top and the fixture at the end:

```python
from app.proposals import ProposalStore
from app.store import Store
from app.tools import CampusDesk
```

```python
@pytest.fixture
def desk(data_file: Path, clock: FakeClock) -> CampusDesk:
    return CampusDesk(Store(data_file), ProposalStore(timedelta(minutes=15)), clock)
```

- [ ] **Step 2: Write the failing tests `backend/tests/test_tools.py`**

```python
from datetime import date

from app.domain.booking_rules import Booking, RuleCode, RuleResult
from app.proposals import Proposal
from test_booking_rules import at


def propose(desk, room_id="lab-3", start=None, end=None, group_size=3):
    return desk.create_booking(room_id, start or at(13), end or at(15), group_size)


def test_list_rooms_filters_by_capacity(desk):
    assert [r.id for r in desk.list_rooms(min_capacity=6)] == ["lab-2", "lab-3"]


def test_bookings_on_a_day(desk):
    assert [b.id for b in desk.bookings_on(date(2026, 10, 22))] == ["bk-0002", "bk-0001"]


def test_check_availability_without_room(desk):
    availability = desk.check_availability(at(14), at(16), 3)
    assert [r.id for r in availability.free_rooms] == ["lab-3", "lab-2"]


def test_check_availability_with_room(desk):
    availability = desk.check_availability(at(15), at(17), 3, room_id="lab-1")
    assert availability.result.rule_code == RuleCode.BOOKING_OVERLAP
    assert availability.free_rooms == []


def test_create_booking_makes_a_proposal_and_writes_nothing(desk, data_file):
    before = data_file.read_bytes()
    proposal = propose(desk)
    assert isinstance(proposal, Proposal)
    assert desk.pending() == [proposal]
    assert data_file.read_bytes() == before


def test_create_booking_rechecks_the_rule_itself(desk):
    # case 5: no check_availability call first, and the note in data.json says staff are exempt
    result = desk.create_booking("lab-2", at(12), at(18), 3)
    assert isinstance(result, RuleResult)
    assert result.rule_code == RuleCode.MAX_DURATION_EXCEEDED
    assert desk.pending() == []


def test_approve_saves_the_booking(desk, data_file):
    proposal = propose(desk)
    booking = desk.approve(proposal.proposal_id)
    assert isinstance(booking, Booking)
    assert booking.room_id == "lab-3" and booking.start == at(13)
    assert booking.id in data_file.read_text()
    assert desk.pending() == []


def test_approve_twice_saves_once(desk):
    proposal = propose(desk)
    desk.approve(proposal.proposal_id)
    second = desk.approve(proposal.proposal_id)
    assert second.rule_code == RuleCode.PROPOSAL_NOT_FOUND
    assert len(desk.bookings_on(date(2026, 10, 22))) == 3


def test_second_proposal_for_the_same_slot_fails_on_approve(desk):
    first, second = propose(desk), propose(desk)
    desk.approve(first.proposal_id)
    result = desk.approve(second.proposal_id)
    assert result.rule_code == RuleCode.BOOKING_OVERLAP
    assert desk.pending() == []  # a failed re-check discards the proposal


def test_approve_after_expiry(desk, clock):
    proposal = propose(desk)
    clock.advance(minutes=16)
    assert desk.approve(proposal.proposal_id).rule_code == RuleCode.PROPOSAL_EXPIRED


def test_approve_after_the_start_has_passed(desk, clock, data_file):
    before = data_file.read_bytes()
    proposal = propose(desk, start=at(10, 5, day=18), end=at(11, day=18))
    clock.advance(minutes=10)  # 10:10, still inside the 15-minute TTL
    assert desk.approve(proposal.proposal_id).rule_code == RuleCode.START_IN_PAST
    assert data_file.read_bytes() == before


def test_reject(desk):
    proposal = propose(desk)
    assert desk.reject(proposal.proposal_id) is None
    assert desk.pending() == []
    assert desk.reject(proposal.proposal_id).rule_code == RuleCode.PROPOSAL_NOT_FOUND
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd backend && uv run pytest tests/test_tools.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.tools'`

- [ ] **Step 4: Write `backend/app/tools.py`**

```python
"""The CampusDesk tools: list, check and create, plus approve and reject.

The REST API uses all of them. The MCP server and the agent get only the
first three; approve stays human-only.
"""

from collections.abc import Callable
from datetime import date, datetime
from uuid import uuid4

from pydantic import BaseModel

from app.domain.booking_rules import (
    Booking,
    BookingRequest,
    Room,
    RuleCode,
    RuleResult,
    available_rooms,
    parse_time,
    validate_booking,
)
from app.proposals import Proposal, ProposalExpired, ProposalNotFound, ProposalStore
from app.store import Store

TimeInput = str | datetime


class Availability(BaseModel):
    result: RuleResult
    free_rooms: list[Room]


def _not_found(proposal_id: str) -> RuleResult:
    return RuleResult(
        ok=False, rule_code=RuleCode.PROPOSAL_NOT_FOUND,
        message=f"There is no pending proposal {proposal_id!r}.",
    )


class CampusDesk:
    def __init__(self, store: Store, proposals: ProposalStore, clock: Callable[[], datetime]) -> None:
        self.store = store
        self.proposals = proposals
        self.clock = clock

    def list_rooms(self, min_capacity: int | None = None) -> list[Room]:
        rooms, _ = self.store.load()
        return [r for r in rooms if min_capacity is None or r.capacity >= min_capacity]

    def bookings_on(self, day: date) -> list[Booking]:
        tz = self.clock().tzinfo
        _, bookings = self.store.load()
        return sorted((b for b in bookings if b.start.astimezone(tz).date() == day), key=lambda b: b.start)

    def check_availability(
        self, start: TimeInput, end: TimeInput, group_size: int, room_id: str | None = None
    ) -> Availability:
        rooms, bookings = self.store.load()
        req = BookingRequest(room_id=room_id, start=start, end=end, group_size=group_size)
        if room_id is None:
            free, result = available_rooms(req, rooms, bookings, self.clock())
            return Availability(result=result, free_rooms=free)
        result = validate_booking(req, rooms, bookings, self.clock())
        return Availability(result=result, free_rooms=[r for r in rooms if r.id == room_id] if result.ok else [])

    def create_booking(
        self, room_id: str, start: TimeInput, end: TimeInput, group_size: int,
        booked_by: str = "student", purpose: str = "", source: str = "ui",
    ) -> Proposal | RuleResult:
        """Make a pending proposal. Re-checks every rule itself and never writes to data.json."""
        now = self.clock()
        rooms, bookings = self.store.load()
        req = BookingRequest(room_id=room_id, start=start, end=end, group_size=group_size)
        result = validate_booking(req, rooms, bookings, now)
        if not result.ok:
            return result
        room = next(r for r in rooms if r.id == room_id)
        return self.proposals.add(
            room_id=room.id, room_name=room.name,
            start=parse_time(start, now.tzinfo), end=parse_time(end, now.tzinfo),
            group_size=group_size, booked_by=booked_by, purpose=purpose, source=source, now=now,
        )

    def pending(self) -> list[Proposal]:
        return self.proposals.pending(self.clock())

    def approve(self, proposal_id: str) -> Booking | RuleResult:
        """Save a proposal. Only the UI's Approve button reaches this."""
        now = self.clock()
        try:
            proposal = self.proposals.get(proposal_id, now)
        except ProposalNotFound:
            return _not_found(proposal_id)
        except ProposalExpired:
            return RuleResult(
                ok=False, rule_code=RuleCode.PROPOSAL_EXPIRED,
                message="This proposal expired. Please make a new one.",
            )
        with self.store.lock:
            rooms, bookings = self.store.load()
            req = BookingRequest(
                room_id=proposal.room_id, start=proposal.start, end=proposal.end,
                group_size=proposal.group_size,
            )
            result = validate_booking(req, rooms, bookings, now)
            if not result.ok:
                self.proposals.remove(proposal_id)  # it can never pass again
                return result
            booking = Booking(
                id=f"bk-{uuid4().hex[:8]}", room_id=proposal.room_id,
                start=proposal.start, end=proposal.end, group_size=proposal.group_size,
                booked_by=proposal.booked_by, purpose=proposal.purpose, source=proposal.source,
                created_at=now,
            )
            self.store.add_booking(booking)
        self.proposals.remove(proposal_id)
        return booking

    def reject(self, proposal_id: str) -> RuleResult | None:
        return None if self.proposals.remove(proposal_id) else _not_found(proposal_id)
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `cd backend && uv run pytest -v`
Expected: all passed

- [ ] **Step 6: Commit**

```bash
git add projects/group-9/backend
git commit -m "Group 9: booking tools with human-only approve"
```

---

### Task 7: REST API

**Files:**
- Create: `backend/app/api.py`, `backend/app/main.py`
- Modify: `backend/tests/conftest.py` (add the `client` fixture)
- Test: `backend/tests/test_api.py`

**Interfaces:**
- Consumes: `CampusDesk`, `Availability` (Task 6); `Settings`, `load_settings` (Task 1).
- Produces: `app.main.create_app(settings: Settings | None = None, clock: Callable[[], datetime] | None = None) -> FastAPI`; module-level `app.main.app`; `app.state.desk: CampusDesk` (Milestone 2 mounts the MCP server on this app and reuses the desk). Routes as in the spec's REST table, except `/api/chat` (Milestone 2).

- [ ] **Step 1: Add the `client` fixture to `backend/tests/conftest.py`**

Add these imports at the top and the fixture at the end:

```python
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
```

```python
@pytest.fixture
def client(data_file: Path, clock: FakeClock) -> TestClient:
    settings = Settings(data_file=data_file, timezone=DHAKA, proposal_ttl=timedelta(minutes=15))
    return TestClient(create_app(settings, clock))
```

- [ ] **Step 2: Write the failing tests `backend/tests/test_api.py`**

```python
THU = "2026-10-22"


def body(room_id="lab-3", start="13:00", end="15:00", group_size=3, day=THU):
    return {"room_id": room_id, "start": f"{day}T{start}", "end": f"{day}T{end}", "group_size": group_size}


def test_rooms(client):
    response = client.get("/api/rooms")
    assert response.status_code == 200
    assert [r["id"] for r in response.json()] == ["lab-1", "lab-2", "lab-3"]


def test_bookings_for_a_day(client):
    response = client.get("/api/bookings", params={"date": THU})
    assert [b["id"] for b in response.json()] == ["bk-0002", "bk-0001"]


def test_availability(client):
    response = client.post("/api/availability", json={"start": f"{THU}T14:00", "end": f"{THU}T16:00", "group_size": 3})
    assert response.status_code == 200
    assert [r["id"] for r in response.json()["free_rooms"]] == ["lab-3", "lab-2"]


def test_case_1_proposal_is_saved_only_after_approve(client, data_file):
    before = data_file.read_bytes()
    created = client.post("/api/proposals", json=body())
    assert created.status_code == 201
    proposal = created.json()
    assert proposal["status"] == "pending_approval"
    assert proposal["start"] == "2026-10-22T13:00:00+06:00"
    assert data_file.read_bytes() == before
    assert [p["proposal_id"] for p in client.get("/api/proposals").json()] == [proposal["proposal_id"]]

    approved = client.post(f"/api/proposals/{proposal['proposal_id']}/approve")
    assert approved.status_code == 201
    assert len(client.get("/api/bookings", params={"date": THU}).json()) == 3
    assert client.get("/api/proposals").json() == []


def test_case_2_boundaries(client):
    assert client.post("/api/proposals", json=body(start="13:00", end="16:00")).status_code == 201

    too_long = client.post("/api/proposals", json=body(room_id="lab-2", start="12:00", end="15:01"))
    assert too_long.status_code == 422
    assert too_long.json()["rule_code"] == "MAX_DURATION_EXCEEDED"

    overlap = client.post("/api/proposals", json=body(room_id="lab-1", start="15:00", end="17:00"))
    assert overlap.status_code == 422
    assert overlap.json()["rule_code"] == "BOOKING_OVERLAP"


def test_case_3_breaks_the_rule_and_gets_a_suggestion(client):
    response = client.post("/api/proposals", json=body(room_id="lab-2", start="12:00", end="17:00"))
    assert response.status_code == 422
    refusal = response.json()
    assert refusal["rule_code"] == "MAX_DURATION_EXCEEDED"
    assert refusal["suggestion"] == {
        "room_id": "lab-2", "start": "2026-10-22T12:00:00+06:00", "end": "2026-10-22T15:00:00+06:00",
    }


def test_case_5_six_hours_is_refused(client):
    response = client.post("/api/proposals", json=body(room_id="lab-2", start="12:00", end="18:00"))
    assert response.json()["rule_code"] == "MAX_DURATION_EXCEEDED"


def test_garbage_time_is_a_rule_refusal_not_a_crash(client):
    response = client.post("/api/proposals", json={**body(), "start": "tomorrow"})
    assert response.status_code == 422
    assert response.json()["rule_code"] == "INVALID_TIME_RANGE"


def test_approve_unknown(client):
    response = client.post("/api/proposals/pr-nope/approve")
    assert response.status_code == 404
    assert response.json()["rule_code"] == "PROPOSAL_NOT_FOUND"


def test_approve_expired(client, clock):
    proposal_id = client.post("/api/proposals", json=body()).json()["proposal_id"]
    clock.advance(minutes=16)
    response = client.post(f"/api/proposals/{proposal_id}/approve")
    assert response.status_code == 410
    assert response.json()["rule_code"] == "PROPOSAL_EXPIRED"


def test_approve_stale_proposal(client):
    first = client.post("/api/proposals", json=body()).json()["proposal_id"]
    second = client.post("/api/proposals", json=body()).json()["proposal_id"]
    client.post(f"/api/proposals/{first}/approve")
    response = client.post(f"/api/proposals/{second}/approve")
    assert response.status_code == 409
    assert response.json()["rule_code"] == "BOOKING_OVERLAP"


def test_reject(client):
    proposal_id = client.post("/api/proposals", json=body()).json()["proposal_id"]
    assert client.post(f"/api/proposals/{proposal_id}/reject").status_code == 204
    missing = client.post(f"/api/proposals/{proposal_id}/reject")
    assert missing.status_code == 404
    assert missing.json()["rule_code"] == "PROPOSAL_NOT_FOUND"
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd backend && uv run pytest tests/test_api.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.main'`

- [ ] **Step 4: Write `backend/app/api.py`**

```python
"""REST routes. Every refusal is a RuleResult."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.domain.booking_rules import Booking, Room, RuleCode, RuleResult
from app.proposals import Proposal
from app.tools import Availability, CampusDesk

router = APIRouter(prefix="/api")


class AvailabilityIn(BaseModel):
    start: str
    end: str
    group_size: int
    room_id: str | None = None


class ProposalIn(BaseModel):
    room_id: str
    start: str
    end: str
    group_size: int
    booked_by: str = "student"
    purpose: str = ""


def get_desk(request: Request) -> CampusDesk:
    return request.app.state.desk


Desk = Annotated[CampusDesk, Depends(get_desk)]

APPROVE_STATUS = {RuleCode.PROPOSAL_NOT_FOUND: 404, RuleCode.PROPOSAL_EXPIRED: 410}


def refusal(result: RuleResult, status_code: int) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=result.model_dump(mode="json"))


@router.get("/rooms", response_model=list[Room])
def list_rooms(desk: Desk):
    return desk.list_rooms()


@router.get("/bookings", response_model=list[Booking])
def bookings_on(desk: Desk, day: Annotated[date, Query(alias="date")]):
    return desk.bookings_on(day)


@router.post("/availability", response_model=Availability)
def check_availability(body: AvailabilityIn, desk: Desk):
    return desk.check_availability(body.start, body.end, body.group_size, body.room_id)


@router.post("/proposals", status_code=201, response_model=Proposal, responses={422: {"model": RuleResult}})
def create_proposal(body: ProposalIn, desk: Desk):
    outcome = desk.create_booking(**body.model_dump(), source="ui")
    return refusal(outcome, 422) if isinstance(outcome, RuleResult) else outcome


@router.get("/proposals", response_model=list[Proposal])
def pending_proposals(desk: Desk):
    return desk.pending()


@router.post(
    "/proposals/{proposal_id}/approve",
    status_code=201,
    response_model=Booking,
    responses={404: {"model": RuleResult}, 409: {"model": RuleResult}, 410: {"model": RuleResult}},
)
def approve_proposal(proposal_id: str, desk: Desk):
    outcome = desk.approve(proposal_id)
    if isinstance(outcome, RuleResult):
        return refusal(outcome, APPROVE_STATUS.get(outcome.rule_code, 409))
    return outcome


@router.post("/proposals/{proposal_id}/reject", status_code=204, responses={404: {"model": RuleResult}})
def reject_proposal(proposal_id: str, desk: Desk):
    outcome = desk.reject(proposal_id)
    return refusal(outcome, 404) if outcome else Response(status_code=204)
```

- [ ] **Step 5: Write `backend/app/main.py`**

```python
"""The FastAPI app: REST API now, the MCP server and chat agent in Milestone 2."""

from collections.abc import Callable
from datetime import datetime

from fastapi import FastAPI

from app.api import router
from app.config import Settings, load_settings
from app.proposals import ProposalStore
from app.store import Store
from app.tools import CampusDesk


def create_app(settings: Settings | None = None, clock: Callable[[], datetime] | None = None) -> FastAPI:
    settings = settings or load_settings()
    clock = clock or (lambda: datetime.now(settings.timezone))
    app = FastAPI(title="CampusDesk")
    app.state.desk = CampusDesk(Store(settings.data_file), ProposalStore(settings.proposal_ttl), clock)
    app.include_router(router)
    return app


app = create_app()
```

- [ ] **Step 6: Run all tests to verify they pass**

Run: `cd backend && uv run pytest -v`
Expected: all passed

- [ ] **Step 7: Smoke-test the real server**

Run: `cd backend && uv run uvicorn app.main:app --port 8000` (in the background), then open http://localhost:8000/docs and http://localhost:8000/api/rooms.
Expected: the docs page lists all 7 routes; `/api/rooms` returns 3 rooms. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add projects/group-9/backend
git commit -m "Group 9: REST API for rooms, availability and proposals"
```

---

### Task 8: Frontend scaffold and API client

**Files:**
- Create: `frontend/` (via `create-next-app`), `frontend/next.config.ts` (replace), `frontend/lib/types.ts`, `frontend/lib/api.ts`, `frontend/lib/time.ts`
- Delete: `frontend/README.md`, `frontend/public/*.svg`, `frontend/app/page.module.css`, and any `AGENTS.md` or `CLAUDE.md` that `create-next-app` adds inside `frontend/` (the group's `CLAUDE.md` covers the project)

**Interfaces:**
- Produces: TypeScript types `RuleCode`, `Room`, `Booking`, `Slot`, `RuleResult`, `Proposal`, `Availability`; `Outcome<T> = { ok: true; data: T } | { ok: false; refusal: RuleResult }`; `api.rooms()`, `api.bookings(day)`, `api.availability(body)`, `api.propose(body)`, `api.pending()`, `api.approve(id)`, `api.reject(id)`; time helpers `TIME_ZONE`, `fmtTime(iso)`, `fmtDay(iso)`, `todayInDhaka()`, `localParts(iso) -> { date, time }`, `minutesBetween(start, end)`.

- [ ] **Step 1: Scaffold Next.js**

```bash
cd projects/group-9
npx create-next-app@16.4.2 frontend --ts --eslint --app --no-src-dir --no-tailwind \
  --import-alias "@/*" --use-npm --disable-git --yes
```

If a flag is rejected, run `npx create-next-app@16.4.2 --help` and use the matching flag. Then delete the files listed above and check `git status` shows only `frontend/` as new.

- [ ] **Step 2: Replace `frontend/next.config.ts`**

```ts
import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
```

- [ ] **Step 3: Write `frontend/lib/types.ts`**

```ts
export type RuleCode =
  | "INVALID_TIME_RANGE"
  | "MAX_DURATION_EXCEEDED"
  | "ROOM_NOT_FOUND"
  | "INVALID_GROUP_SIZE"
  | "CAPACITY_EXCEEDED"
  | "START_IN_PAST"
  | "BOOKING_OVERLAP"
  | "NO_ROOM_AVAILABLE"
  | "PROPOSAL_NOT_FOUND"
  | "PROPOSAL_EXPIRED";

export interface Room {
  id: string;
  name: string;
  capacity: number;
  note: string;
}

export interface Booking {
  id: string;
  room_id: string;
  start: string;
  end: string;
  group_size: number;
  booked_by: string;
  purpose: string;
  source: string;
  created_at: string;
}

export interface Slot {
  room_id: string;
  start: string;
  end: string;
}

export interface RuleResult {
  ok: boolean;
  rule_code: RuleCode | null;
  message: string;
  suggestion: Slot | null;
}

export interface Proposal {
  proposal_id: string;
  status: "pending_approval";
  room_id: string;
  room_name: string;
  start: string;
  end: string;
  group_size: number;
  booked_by: string;
  purpose: string;
  source: string;
  created_at: string;
  expires_at: string;
}

export interface Availability {
  result: RuleResult;
  free_rooms: Room[];
}

export interface BookingInput {
  room_id: string;
  start: string;
  end: string;
  group_size: number;
}
```

- [ ] **Step 4: Write `frontend/lib/api.ts`**

```ts
import type { Availability, Booking, BookingInput, Proposal, Room, RuleResult } from "@/lib/types";

export type Outcome<T> = { ok: true; data: T } | { ok: false; refusal: RuleResult };

function failure(message: string): Outcome<never> {
  return { ok: false, refusal: { ok: false, rule_code: null, message, suggestion: null } };
}

async function call<T>(path: string, init?: RequestInit): Promise<Outcome<T>> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
  } catch {
    return failure("Cannot reach the CampusDesk API. Is the backend running on port 8000?");
  }
  if (response.status === 204) return { ok: true, data: undefined as T };
  const body = await response.json().catch(() => null);
  if (response.ok) return { ok: true, data: body as T };
  if (body && typeof body === "object" && "rule_code" in body) return { ok: false, refusal: body as RuleResult };
  return failure(`The request failed (HTTP ${response.status}).`);
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  rooms: () => call<Room[]>("/rooms"),
  bookings: (day: string) => call<Booking[]>(`/bookings?date=${encodeURIComponent(day)}`),
  availability: (body: Omit<BookingInput, "room_id"> & { room_id?: string }) =>
    call<Availability>("/availability", post(body)),
  propose: (body: BookingInput & { booked_by: string; purpose: string }) => call<Proposal>("/proposals", post(body)),
  pending: () => call<Proposal[]>("/proposals"),
  approve: (id: string) => call<Booking>(`/proposals/${encodeURIComponent(id)}/approve`, post()),
  reject: (id: string) => call<void>(`/proposals/${encodeURIComponent(id)}/reject`, post()),
};
```

- [ ] **Step 5: Write `frontend/lib/time.ts`**

```ts
export const TIME_ZONE = "Asia/Dhaka";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const isoDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const fmtTime = (iso: string) => timeFormat.format(new Date(iso));
export const fmtDay = (iso: string) => dayFormat.format(new Date(iso));
export const todayInDhaka = () => isoDateFormat.format(new Date());

/** Split an ISO time into the form's date (YYYY-MM-DD) and time (HH:MM), in Dhaka time. */
export function localParts(iso: string): { date: string; time: string } {
  const instant = new Date(iso);
  return { date: isoDateFormat.format(instant), time: timeFormat.format(instant) };
}

/** Minutes from start to end, both "HH:MM" on the same day. */
export function minutesBetween(start: string, end: string): number {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(end) - toMinutes(start);
}
```

- [ ] **Step 6: Verify it builds**

Run: `cd frontend && npm run lint && npm run build`
Expected: both succeed (the default page still exists at this point; Task 9 replaces it).

- [ ] **Step 7: Commit**

```bash
git add projects/group-9/frontend
git commit -m "Group 9: Next.js frontend scaffold and API client"
```

---

### Task 9: Frontend panels (schedule, booking form, approvals)

**Files:**
- Create: `frontend/components/RuleBox.tsx`, `frontend/components/BookingForm.tsx`, `frontend/components/PendingApprovals.tsx`, `frontend/components/Schedule.tsx`
- Replace: `frontend/app/layout.tsx`, `frontend/app/page.tsx`, `frontend/app/globals.css`

**Interfaces:**
- Consumes: everything from Task 8; the REST API from Task 7.
- Produces: a single page at `/`. Milestone 2 adds a Chat panel next to these.

- [ ] **Step 1: Write `frontend/components/RuleBox.tsx`**

```tsx
import { fmtDay, fmtTime } from "@/lib/time";
import type { RuleResult, Slot } from "@/lib/types";

type Props = { result: RuleResult; onUseSuggestion?: (slot: Slot) => void };

export default function RuleBox({ result, onUseSuggestion }: Props) {
  const slot = result.suggestion;
  return (
    <div className={`rule-box ${result.ok ? "ok" : "refused"}`} role="status">
      {result.rule_code && <code className="rule-code">{result.rule_code}</code>}
      <p>{result.message}</p>
      {slot && (
        <div className="suggestion">
          <span>
            Suggested: {slot.room_id} · {fmtDay(slot.start)} {fmtTime(slot.start)}–{fmtTime(slot.end)}
          </span>
          {onUseSuggestion && (
            <button type="button" className="secondary" onClick={() => onUseSuggestion(slot)}>
              Use this
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `frontend/components/BookingForm.tsx`**

```tsx
"use client";

import { useState } from "react";

import RuleBox from "@/components/RuleBox";
import { api } from "@/lib/api";
import { fmtDay, fmtTime, localParts, minutesBetween } from "@/lib/time";
import type { Proposal, Room, RuleResult, Slot } from "@/lib/types";

// A convenience warning only. The server decides and always shows its rule code.
const WARN_OVER_MINUTES = 180;

type Props = { rooms: Room[]; day: string; onProposed: () => void };
type Feedback = { result: RuleResult } | { proposal: Proposal } | null;

export default function BookingForm({ rooms, day, onProposed }: Props) {
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState(day);
  const [start, setStart] = useState("13:00");
  const [end, setEnd] = useState("15:00");
  const [groupSize, setGroupSize] = useState(3);
  const [bookedBy, setBookedBy] = useState("");
  const [purpose, setPurpose] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  const room = roomId || rooms[0]?.id || "";
  const minutes = minutesBetween(start, end);
  const request = () => ({ room_id: room, start: `${date}T${start}`, end: `${date}T${end}`, group_size: groupSize });

  async function check() {
    setBusy(true);
    const outcome = await api.availability(request());
    setBusy(false);
    setFeedback({ result: outcome.ok ? outcome.data.result : outcome.refusal });
  }

  async function propose() {
    setBusy(true);
    const outcome = await api.propose({ ...request(), booked_by: bookedBy.trim() || "student", purpose });
    setBusy(false);
    if (outcome.ok) {
      setFeedback({ proposal: outcome.data });
      onProposed();
    } else {
      setFeedback({ result: outcome.refusal });
    }
  }

  function applySuggestion(slot: Slot) {
    const from = localParts(slot.start);
    setRoomId(slot.room_id);
    setDate(from.date);
    setStart(from.time);
    setEnd(localParts(slot.end).time);
    setFeedback(null);
  }

  return (
    <section className="panel">
      <h2>Book a lab</h2>
      <form className="form" onSubmit={(event) => { event.preventDefault(); void propose(); }}>
        <label>
          Room
          <select value={room} onChange={(e) => setRoomId(e.target.value)}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name} (up to {r.capacity})</option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <div className="row">
          <label>
            Start
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label>
            End
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
          <label>
            Group size
            <input type="number" min={1} value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))} required />
          </label>
        </div>
        <label>
          Your name
          <input value={bookedBy} onChange={(e) => setBookedBy(e.target.value)} placeholder="student" />
        </label>
        <label>
          Purpose
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Group work" />
        </label>
        {minutes > WARN_OVER_MINUTES && (
          <p className="warning">This is over 3 hours. The server will refuse it.</p>
        )}
        <div className="actions">
          <button type="button" className="secondary" onClick={() => void check()} disabled={busy || !room}>
            Check
          </button>
          <button type="submit" disabled={busy || !room}>Propose</button>
        </div>
      </form>
      {feedback && "result" in feedback && <RuleBox result={feedback.result} onUseSuggestion={applySuggestion} />}
      {feedback && "proposal" in feedback && (
        <div className="rule-box ok" role="status">
          <p>
            Proposal for {feedback.proposal.room_name}, {fmtDay(feedback.proposal.start)}{" "}
            {fmtTime(feedback.proposal.start)}–{fmtTime(feedback.proposal.end)}. Nothing is saved until
            someone clicks Approve.
          </p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Write `frontend/components/PendingApprovals.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import RuleBox from "@/components/RuleBox";
import { api } from "@/lib/api";
import { fmtDay, fmtTime } from "@/lib/time";
import type { Proposal, RuleResult } from "@/lib/types";

const POLL_MS = 3000;

type Props = { version: number; onDecided: () => void };

export default function PendingApprovals({ version, onDecided }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [last, setLast] = useState<RuleResult | null>(null);

  const load = useCallback(async () => {
    const outcome = await api.pending();
    if (outcome.ok) setProposals(outcome.data);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, version]);

  async function approve(proposal: Proposal) {
    const outcome = await api.approve(proposal.proposal_id);
    setLast(
      outcome.ok
        ? { ok: true, rule_code: null, message: `Saved booking ${outcome.data.id} in ${proposal.room_name}.`, suggestion: null }
        : outcome.refusal,
    );
    onDecided();
    void load();
  }

  async function reject(proposal: Proposal) {
    const outcome = await api.reject(proposal.proposal_id);
    if (!outcome.ok) setLast(outcome.refusal);
    void load();
  }

  return (
    <section className="panel">
      <h2>Pending approvals</h2>
      <p className="muted">Proposals from the form, the chat and MCP agents. Only Approve saves a booking.</p>
      {last && <RuleBox result={last} />}
      {proposals.length === 0 ? (
        <p className="muted">No pending proposals.</p>
      ) : (
        <ul className="cards">
          {proposals.map((p) => (
            <li key={p.proposal_id} className="card">
              <div>
                <strong>{p.room_name}</strong> · {fmtDay(p.start)} {fmtTime(p.start)}–{fmtTime(p.end)}
              </div>
              <div className="muted">
                {p.group_size} people · {p.booked_by} · <span className="badge">{p.source}</span> · expires{" "}
                {fmtTime(p.expires_at)}
              </div>
              <div className="actions">
                <button type="button" onClick={() => void approve(p)}>Approve</button>
                <button type="button" className="secondary" onClick={() => void reject(p)}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Write `frontend/components/Schedule.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { fmtTime } from "@/lib/time";
import type { Booking, Room } from "@/lib/types";

type Props = { rooms: Room[]; day: string; onDayChange: (day: string) => void; version: number };

export default function Schedule({ rooms, day, onDayChange, version }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.bookings(day).then((outcome) => {
      if (!active) return;
      setBookings(outcome.ok ? outcome.data : []);
      setError(outcome.ok ? null : outcome.refusal.message);
    });
    return () => {
      active = false;
    };
  }, [day, version]);

  return (
    <section className="panel wide">
      <div className="panel-head">
        <h2>Schedule</h2>
        <input type="date" value={day} onChange={(e) => onDayChange(e.target.value)} aria-label="Day" />
      </div>
      {error && <p className="banner error">{error}</p>}
      <ul className="rooms">
        {rooms.map((room) => {
          const taken = bookings.filter((b) => b.room_id === room.id);
          return (
            <li key={room.id} className="room">
              <div className="room-head">
                <strong>{room.name}</strong>
                <span className="muted">up to {room.capacity} people</span>
              </div>
              {room.note && <p className="note">Room note: {room.note}</p>}
              {taken.length === 0 ? (
                <p className="muted">Free all day</p>
              ) : (
                <ul className="slots">
                  {taken.map((b) => (
                    <li key={b.id}>
                      {fmtTime(b.start)}–{fmtTime(b.end)} · {b.group_size} people · {b.purpose || b.booked_by}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Replace `frontend/app/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

import BookingForm from "@/components/BookingForm";
import PendingApprovals from "@/components/PendingApprovals";
import Schedule from "@/components/Schedule";
import { api } from "@/lib/api";
import { todayInDhaka } from "@/lib/time";
import type { Room } from "@/lib/types";

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(todayInDhaka);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    api.rooms().then((outcome) => {
      if (outcome.ok) setRooms(outcome.data);
      else setError(outcome.refusal.message);
    });
  }, []);

  return (
    <main className="page">
      <header className="masthead">
        <h1>CampusDesk</h1>
        <p>Book a lab for group work. A booking is at most 3 hours, and nothing is saved until someone clicks Approve.</p>
      </header>
      {error && <p className="banner error">{error}</p>}
      <div className="grid">
        <BookingForm rooms={rooms} day={day} onProposed={refresh} />
        <PendingApprovals version={version} onDecided={refresh} />
        <Schedule rooms={rooms} day={day} onDayChange={setDay} version={version} />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Replace `frontend/app/layout.tsx`**

```tsx
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "CampusDesk",
  description: "Book lab rooms for group work.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Replace `frontend/app/globals.css`**

```css
:root {
  --bg: #f6f7f9;
  --panel: #ffffff;
  --text: #16181d;
  --muted: #5b6270;
  --border: #e2e5ea;
  --accent: #0f766e;
  --accent-text: #ffffff;
  --ok-bg: #e8f6ee;
  --ok-text: #14532d;
  --bad-bg: #fdecec;
  --bad-text: #7f1d1d;
  --warn: #92400e;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115;
    --panel: #181b21;
    --text: #eceef2;
    --muted: #9aa2b1;
    --border: #2a2f38;
    --accent: #2dd4bf;
    --accent-text: #062925;
    --ok-bg: #12301f;
    --ok-text: #b7f0cc;
    --bad-bg: #3a1717;
    --bad-text: #fbcaca;
    --warn: #fbbf24;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.page { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }
.masthead h1 { margin: 0; font-size: 1.8rem; }
.masthead p { margin: 4px 0 20px; color: var(--muted); }

.grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 860px) {
  .grid { grid-template-columns: 1fr 1fr; }
  .wide { grid-column: 1 / -1; }
}

.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.panel h2 { margin: 0 0 12px; font-size: 1.1rem; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }

.form { display: grid; gap: 10px; }
.form label { display: grid; gap: 4px; font-size: 0.85rem; color: var(--muted); }
.row { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }

input, select, button { font: inherit; }
input, select {
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  min-width: 0;
}

button {
  padding: 7px 14px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-text);
  cursor: pointer;
}
button.secondary { background: transparent; color: var(--accent); }
button:disabled { opacity: 0.5; cursor: not-allowed; }

.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.muted { color: var(--muted); }
.warning { margin: 0; color: var(--warn); font-size: 0.9rem; }

.rule-box { margin-top: 12px; padding: 10px 12px; border-radius: 8px; }
.rule-box p { margin: 4px 0; }
.rule-box.ok { background: var(--ok-bg); color: var(--ok-text); }
.rule-box.refused { background: var(--bad-bg); color: var(--bad-text); }
.rule-code { font-weight: 600; }
.suggestion { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; }

.banner.error { background: var(--bad-bg); color: var(--bad-text); padding: 10px 12px; border-radius: 8px; }

.cards, .rooms, .slots { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.card, .room { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: grid; gap: 6px; }
.room-head { display: flex; justify-content: space-between; gap: 8px; }
.note { margin: 0; font-size: 0.85rem; color: var(--muted); font-style: italic; }
.slots { gap: 4px; font-size: 0.9rem; }
.badge { padding: 1px 6px; border-radius: 999px; border: 1px solid var(--border); font-size: 0.8rem; }
```

- [ ] **Step 8: Verify lint and build**

Run: `cd frontend && npm run lint && npm run build`
Expected: both succeed. If `react-hooks` lint rules flag an effect, fix the component (do not disable the rule).

- [ ] **Step 9: Check cases 1–3 in the running app**

```bash
cp backend/data.seed.json backend/data.json
cd backend && uv run uvicorn app.main:app --port 8000     # terminal 1
cd frontend && npm run dev                                # terminal 2
```

Open http://localhost:3000 and check:
1. Case 1: Lab-3, 2026-10-22, 13:00–15:00, 3 people → Propose → card appears in Pending approvals → `data.json` unchanged → Approve → booking shows in the schedule for 22 Oct.
2. Case 2: Lab-3 13:00–16:00 → proposal. Lab-2 12:00–15:01 → `MAX_DURATION_EXCEEDED`. Lab-1 15:00–17:00 → `BOOKING_OVERLAP` with a Lab-3 suggestion.
3. Case 3: Lab-2 12:00–17:00 → warning shown, then `MAX_DURATION_EXCEEDED` with a 12:00–15:00 suggestion → Use this → Propose works.

Then reset: `cp backend/data.seed.json backend/data.json`.

- [ ] **Step 10: Commit**

```bash
git add projects/group-9/frontend
git commit -m "Group 9: booking form, schedule and approvals panel"
```

---

### Task 10: Docs and progress log

**Files:**
- Modify: `specs/agent.md`, `CLAUDE.md`, `progress.html`

- [ ] **Step 1: Update `specs/agent.md`**

In the Frontend section, replace:

```
The form blocks end times over 3 hours for convenience, but the server is the source of truth and its rule code is always shown.
```

with:

```
The form warns when the booking is over 3 hours but still sends it, so the server's rule code is always shown (needed for cases 2 and 3).
```

In the Tools section, after the line about two pending proposals for the same slot, add:

```
- If approve's re-check fails, the proposal is discarded; the user makes a new one.
```

- [ ] **Step 2: Update `CLAUDE.md` Structure**

Replace the backend lines with:

```
- `backend/app/config.py`: settings from `.env`
- `backend/app/domain/booking_rules.py`: the only place the rules live
- `backend/app/store.py`: reads and writes `data.json`
- `backend/app/proposals.py`: pending proposals (in memory)
- `backend/app/tools.py`: the three tools plus approve and reject; the API and MCP server call these
- `backend/app/api.py`: REST API
- `backend/app/main.py`: `create_app()`; mounts the API (and `/mcp` in Milestone 2)
- `backend/app/mcp_server.py`: MCP server, mounted at `/mcp` (Milestone 2)
- `backend/app/agent.py`: chat agent (MCP client, OpenAI-compatible LLM) (Milestone 2)
- `backend/app/prompts/`: agent system prompts (`v1.md`, `v2.md`) (Milestone 3)
```

- [ ] **Step 3: Add Phase 2 and Phase 3 entries to `progress.html`**

Mark phases 2 and 3 as done (`<li class="done">`) and add two `<article>` entries in the same style as Phase 1: what was built, the decisions (rule module, tools layer, approve re-check discards stale proposals, form warns instead of blocking), the test count from `uv run pytest`, and "Next: Phase 4, MCP server".

- [ ] **Step 4: Run the full test suite one more time**

Run: `cd backend && uv run pytest -v`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add projects/group-9
git commit -m "Group 9: Milestone 1 docs and progress log"
```
