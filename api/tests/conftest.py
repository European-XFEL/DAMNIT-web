from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager

from damnit_api.graphql import subscriptions
from damnit_api.graphql.metadata import fetch_metadata
from damnit_api.runs.sqlite import (
    DatabaseSessionManager,
    async_active_proposal,
    async_table,
)

MOCK_DIR = Path(__file__).parent / "mock"
PROPOSALS_DIR = MOCK_DIR / "proposals"
ALL_VALUE_TYPES_DIR = PROPOSALS_DIR / "all-value-types"
NO_RUNS_DIR = PROPOSALS_DIR / "no-runs"


@pytest.fixture(autouse=True)
def _clear_caches():
    def _clear():
        DatabaseSessionManager.registry.clear()
        async_table.cache_clear()
        async_active_proposal.cache_clear()
        fetch_metadata.cache_clear()
        subscriptions.poll_proposal.cache_clear()
        subscriptions._last_seen_timestamp.clear()

    _clear()
    yield
    _clear()


@pytest.fixture(autouse=True)
def _reset_bootstrap_globals():
    """Reset the clients/engines cached in module-level globals between tests.

    !!! warning

        Without it, later tests keep the first test's OIDC client and engine, so their
        cassettes cannot replay alone and their own `settings.db_path` is ignored.
    """
    import damnit_api._db
    import damnit_api._mymdc
    import damnit_api.auth

    def _reset():
        damnit_api.auth.__CLIENT = None
        damnit_api._mymdc.CLIENT = None
        damnit_api._db.__ENGINE = None
        damnit_api._db.__SESSION_LOCAL = None

    _reset()
    yield
    _reset()


@pytest.fixture
def _fresh_app_db(tmp_path, monkeypatch):
    """Point the app at a fresh, empty application database.

    Keeps tests out of the repo's dev `dw_api.sqlite`. The schema step mirrors
    `_db.bootstrap.init_db`, which runs only as a script.
    """
    from sqlalchemy import create_engine
    from sqlmodel import SQLModel

    from damnit_api.metadata import models  # noqa: F401 - registers the tables
    from damnit_api.shared.settings import settings

    db_path = tmp_path / "dw_api.sqlite"
    SQLModel.metadata.create_all(create_engine(f"sqlite:///{db_path}"))
    monkeypatch.setattr(settings, "db_path", db_path)


@pytest.fixture
def damnit_dir():
    """The DAMNIT folder `local_client` serves; parametrize it to serve another."""
    return ALL_VALUE_TYPES_DIR


@pytest_asyncio.fixture
async def local_client(monkeypatch, damnit_dir, _fresh_app_db):
    """HTTPX client for the ASGI app in local mode, serving `damnit_dir`.

    Local mode logs nobody in and makes no outbound call, so it needs no cassette.
    """
    from damnit_api.main import create_app
    from damnit_api.shared.settings import settings

    # Settings switch to local mode only when built, so set what the switch sets
    monkeypatch.setattr(settings, "damnit_path", damnit_dir)
    monkeypatch.setattr(settings, "auth", None)

    app = create_app()
    async with LifespanManager(app) as manager:
        transport = httpx.ASGITransport(app=manager.app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            yield client
