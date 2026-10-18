"""REST wrappers over tools.py. No rule logic here."""

import logging
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .. import tools
from ..agent import llm as agent_llm
from ..agent.runner import run_chat
from ..domain.models import BookingRequest, CreateBookingRequest, RuleResult

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    requester: str = Field(default="", max_length=100)


class ChatResponse(BaseModel):
    reply: str
    proposal: dict | None = None


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


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """The chat agent. It can only propose: a returned proposal is saved via POST /api/bookings on Approve."""
    try:
        model = agent_llm.from_env()
    except agent_llm.LLMNotConfigured as e:
        return JSONResponse(status_code=503, content={"ok": False, "code": "LLM_NOT_CONFIGURED", "reason": str(e)})
    try:
        result = await run_chat([m.model_dump() for m in request.messages], model, requester=request.requester)
    except Exception as e:  # provider errors: bad key, rate limit, network
        log.exception("chat agent failed")
        return JSONResponse(status_code=502, content={"ok": False, "code": "LLM_ERROR", "reason": _short(e)})
    return ChatResponse(reply=result.reply, proposal=result.proposal)


def _short(error: Exception) -> str:
    text = str(error) or type(error).__name__
    return text if len(text) <= 300 else text[:300] + "…"
