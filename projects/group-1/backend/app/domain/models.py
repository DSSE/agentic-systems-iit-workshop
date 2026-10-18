from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class Room(BaseModel):
    id: str
    name: str
    capacity: int
    notes: str = ""


class Booking(BaseModel):
    id: str
    room_id: str
    requester: str
    group_size: int
    start: datetime
    end: datetime
    purpose: str = ""


class BookingRequest(BaseModel):
    """What check_availability needs."""

    room_id: str
    start: datetime
    end: datetime
    group_size: int = Field(ge=1)

    @field_validator("start", "end")
    @classmethod
    def local_time_only(cls, value: datetime) -> datetime:
        # data.json stores local campus time with no zone; mixing in zoned times would break comparisons.
        if value.tzinfo is not None:
            raise ValueError("use local campus time without a time zone, e.g. 2026-10-22T13:00")
        return value.replace(second=0, microsecond=0)


class CreateBookingRequest(BookingRequest):
    """What create_booking needs: the request plus who it is for and the person's approval."""

    requester: str = Field(min_length=1)
    purpose: str = ""
    approved: bool = False


class RuleResult(BaseModel):
    ok: bool
    code: str | None = None
    reason: str | None = None

    @classmethod
    def passed(cls) -> "RuleResult":
        return cls(ok=True)

    @classmethod
    def failed(cls, code: str, reason: str) -> "RuleResult":
        return cls(ok=False, code=code, reason=reason)
