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
