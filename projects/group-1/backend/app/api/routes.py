"""REST wrappers over tools.py. No rule logic here."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import tools
from ..domain.models import BookingRequest, CreateBookingRequest, RuleResult

router = APIRouter(prefix="/api")


@router.get("/rooms", response_model=tools.RoomsListing)
def get_rooms():
    return tools.list_rooms()


@router.post("/check", response_model=RuleResult)
def check(request: BookingRequest):
    return tools.check_availability(request.room_id, request.start, request.end, request.group_size)


@router.post("/bookings", response_model=tools.CreateResult, status_code=201)
def create(request: CreateBookingRequest):
    result = tools.create_booking(request)
    if not result.ok:
        return JSONResponse(status_code=422, content=result.model_dump(exclude_none=True))
    return result
