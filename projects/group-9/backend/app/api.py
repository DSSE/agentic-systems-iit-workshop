"""REST routes. Every refusal is a RuleResult."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.domain.booking_rules import (
    BAD_GROUP_MESSAGE,
    BAD_TIME_MESSAGE,
    Booking,
    Room,
    RuleCode,
    RuleResult,
)
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


# A malformed field gets the rule code of the check it would have failed, in the domain's check order.
FIELD_REFUSALS = (
    ("start", RuleCode.INVALID_TIME_RANGE, BAD_TIME_MESSAGE),
    ("end", RuleCode.INVALID_TIME_RANGE, BAD_TIME_MESSAGE),
    ("room_id", RuleCode.ROOM_NOT_FOUND, "Give the id of a room."),
    ("group_size", RuleCode.INVALID_GROUP_SIZE, BAD_GROUP_MESSAGE),
)


async def validation_refusal(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Keep the RuleResult shape for malformed requests too, so every client reads one format."""
    fields = {str(part) for error in exc.errors() for part in error["loc"]}
    for field, code, message in FIELD_REFUSALS:
        if field in fields:
            return refusal(RuleResult(ok=False, rule_code=code, message=message), 422)
    details = "; ".join(str(error["msg"]) for error in exc.errors())
    return refusal(RuleResult(ok=False, message=f"The request is not valid: {details}"), 422)


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


NO_AGENT_REPLY = "The chat agent is not set up yet: add LLM_API_KEY (and LLM_MODEL) to the .env file and restart the backend."


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)


class ChatOut(BaseModel):
    reply: str
    proposals: list[Proposal]


@router.post("/chat", response_model=ChatOut, responses={422: {"model": RuleResult}})
async def chat(body: ChatIn, request: Request):
    agent = request.app.state.agent
    desk: CampusDesk = request.app.state.desk
    if agent is None:
        return ChatOut(reply=NO_AGENT_REPLY, proposals=[])
    result = await agent.run([m.model_dump() for m in body.messages], desk.clock())
    # Proposals come from the store, never from model text, so the UI only shows real ones.
    pending = {p.proposal_id: p for p in desk.pending()}
    return ChatOut(reply=result.reply, proposals=[pending[i] for i in result.proposal_ids if i in pending])
