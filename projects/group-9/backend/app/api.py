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
