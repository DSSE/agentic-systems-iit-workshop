"""The FastAPI app: REST API, the MCP server at /mcp, and the chat agent."""

import contextlib
from collections.abc import AsyncIterator, Callable
from datetime import datetime

import httpx2
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from app.agent import LLM, CampusAgent, OpenAICompatibleLLM
from app.api import router, validation_refusal
from app.config import Settings, load_settings
from app.mcp_server import build_mcp
from app.proposals import ProposalStore
from app.store import Store
from app.tools import CampusDesk


# Only the Host for the chat agent's in-process MCP calls; the DNS-rebinding check allows localhost.
LOCAL_URL = "http://localhost:8000"


@contextlib.asynccontextmanager
async def chat_mcp_client(app: FastAPI) -> AsyncIterator[Client]:
    """The chat agent speaks MCP to this same app in-process, marked as the chat client."""
    transport = httpx2.ASGITransport(app=app)
    async with httpx2.AsyncClient(
        transport=transport, base_url=LOCAL_URL, headers={"X-CampusDesk-Client": "chat"}, timeout=30,
    ) as http:
        async with Client(streamable_http_client(f"{LOCAL_URL}/mcp", http_client=http)) as client:
            yield client


def create_app(
    settings: Settings | None = None, clock: Callable[[], datetime] | None = None, llm: LLM | None = None,
) -> FastAPI:
    settings = settings or load_settings()
    clock = clock or (lambda: datetime.now(settings.timezone))
    desk = CampusDesk(Store(settings.data_file), ProposalStore(settings.proposal_ttl), clock)
    mcp = build_mcp(desk, settings.timezone.key)
    # Stateless JSON: no MCP sessions to lose on a --reload restart; the tools keep no session state.
    mcp_app = mcp.streamable_http_app(stateless_http=True, json_response=True)

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        async with mcp.session_manager.run():  # a mounted sub-app's lifespan does not run by itself
            yield

    app = FastAPI(title="CampusDesk", lifespan=lifespan)
    app.state.desk = desk
    app.state.mcp = mcp
    app.include_router(router)
    app.add_exception_handler(RequestValidationError, validation_refusal)
    app.router.routes.extend(mcp_app.routes)  # serves exactly /mcp (Mount("/mcp") would give /mcp/mcp)
    if llm is None and settings.llm_api_key:
        llm = OpenAICompatibleLLM(settings.llm_base_url, settings.llm_api_key, settings.llm_model)
    app.state.agent = CampusAgent(llm, lambda: chat_mcp_client(app), settings.prompt_version) if llm else None
    return app


app = create_app()
