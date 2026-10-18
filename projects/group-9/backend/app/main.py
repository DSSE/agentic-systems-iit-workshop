"""The FastAPI app: REST API, the MCP server at /mcp, and the chat agent."""

import contextlib
from collections.abc import Callable
from datetime import datetime

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from app.api import router, validation_refusal
from app.config import Settings, load_settings
from app.mcp_server import build_mcp
from app.proposals import ProposalStore
from app.store import Store
from app.tools import CampusDesk


def create_app(settings: Settings | None = None, clock: Callable[[], datetime] | None = None) -> FastAPI:
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
    return app


app = create_app()
