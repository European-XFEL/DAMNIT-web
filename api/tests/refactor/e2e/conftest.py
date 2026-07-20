"""Fixtures for the recorded end-to-end API tests.

Tests defined here should only interact with the app via HTTP, never python calls.

This conftest is the only place allowed to touch the app, and only via:

- the app factory (`damnit_api.main.create_app`), imported lazily inside a fixture
- `mint_session_cookie`, which forges the session cookie OAuth callback would set
  - This helper is deliberately coupled to the session implementation
  (Litestar's client-side `CookieBackendConfig`)
  - The framework-swap branch must update this one helper and nothing else

Outbound HTTP is recorded and replayed with pytest-recording. Cassettes stored in
`cassettes/<module>/<test>.yaml` next to this package.

Secrets should **never** be stored in the cassettes, if you modify the tests you should
check this before committing files. In theory, the `vcr_config` filters strip auth
headers and OAuth client credentials at record time, but you should still check.
"""

from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager

SESSION_COOKIE = "session"

TEST_USER = {
    "email": "e2e-tester@example.org",
    "family_name": "Tester",
    "given_name": "E2e",
    "groups": [],
    "name": "E2e Tester",
    "preferred_username": "e2etester",
    "sub": "00000000-0000-0000-0000-000000000000",
}


@pytest.fixture(scope="session")
def vcr_config():
    return {
        # Only OUTBOUND calls belong on tape; requests to the app itself must hit the
        # live ASGI app
        "ignore_hosts": ["testserver"],
        "filter_headers": ["authorization", "cookie", "set-cookie"],
        "filter_post_data_parameters": ["client_secret", "client_id"],
        "decode_compressed_response": True,
    }


DATA_ROOT = Path(__file__).parents[2] / "mock" / "data" / "gpfs" / "exfel" / "exp"
MYMDC_CASSETTE = Path(__file__).parents[2] / "mock" / "mymdc" / "mymdc.yaml"


@pytest.fixture(autouse=True)
def _force_mock_mymdc(monkeypatch):
    """Always run against the cassette-backed MyMdC mock.

    If `DW_API_MYMDC__*` is set `Settings()` will pick it up, select the real HTTP
    client, and the app would try to talk to MyMdC over HTTP instead of the mock.
    """
    from damnit_api._mymdc.settings import MyMdCMockSettings
    from damnit_api.shared.settings import settings

    if not isinstance(settings.mymdc, MyMdCMockSettings):
        monkeypatch.setattr(
            settings, "mymdc", MyMdCMockSettings(cassette_file=MYMDC_CASSETTE)
        )


@pytest.fixture(autouse=True)
def _fixture_data_root(monkeypatch):
    """Point proposal path resolution at the committed fixture data tree.

    `tests/mock/data/gpfs/` mirrors the real `/gpfs` layout
    (`exfel/exp/<instrument>/<cycle>/p<number>/usr/Shared/amore/`); the
    recorded mymdc cassette rewrites `/gpfs/` paths to the same tree (relative
    to `api/`), so both path seams resolve to the same committed data.

    !!! warning

        `find_proposal` globs the module-level `DATA_ROOT_DIR` constant at call
        time; patching it is the whole seam. Temporary exception to the
        no-internals rule until the path locator becomes injectable (ADR-006).
    """
    from damnit_api import utils

    monkeypatch.setattr(utils, "DATA_ROOT_DIR", str(DATA_ROOT.resolve()))


@pytest.fixture
def _fresh_app_db(tmp_path):
    """Point the app at a fresh, empty application database.

    Keeps e2e tests from writing proposal metadata into the repo's dev
    `dw_api.sqlite`, and keeps them independent of its contents. Schema creation
    mirrors `_db.bootstrap.init_db`, which is only runnable as a script.
    """
    from sqlalchemy import create_engine
    from sqlmodel import SQLModel

    from damnit_api.metadata import models  # noqa: F401 - registers the tables
    from damnit_api.shared.settings import settings

    db_path = tmp_path / "dw_api.sqlite"
    SQLModel.metadata.create_all(create_engine(f"sqlite:///{db_path}"))

    original_db, original_store = settings.db_path, settings.store_path
    settings.db_path = db_path
    # Isolate the file-backed stores (server-side sessions, response cache) into
    # the tmp dir so tests never write into the repo's `stores/`.
    settings.store_path = tmp_path / "stores"
    yield
    settings.db_path, settings.store_path = original_db, original_store


@pytest_asyncio.fixture
async def e2e_client(vcr, _fresh_app_db):
    """HTTPX client for the ASGI app.

    Depends on the `vcr` fixture so the cassette is active while the lifespan runs. App
    startup performs the OIDC discovery fetch.
    """
    from damnit_api.main import create_app

    app = create_app()
    async with LifespanManager(app) as manager:
        transport = httpx.ASGITransport(app=manager.app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            # Expose the Litestar app so `mint_session_cookie` can write the
            # forged session into the app's own server-side store.
            client.app = app
            yield client


@pytest_asyncio.fixture
async def logged_in_client(e2e_client):
    """ASGI client with a forged server-side login session."""
    cookie = await mint_session_cookie(e2e_client.app)
    e2e_client.cookies.update(cookie)
    return e2e_client


async def mint_session_cookie(app, user: dict | None = None) -> dict[str, str]:
    """Forge the session cookie a completed OAuth login would set.

    !!! warning

        This bypasses awkward OAuth internals (redirects, callbacks, etc...) while
        keeping the real session path: the session data is written into the app's
        own server-side store and the returned cookie carries only the opaque
        session id, exactly as Litestar's `ServerSideSessionConfig` does (see
        `main.py`).
    """
    from litestar.middleware.session.server_side import (
        ServerSideSessionBackend,
        ServerSideSessionConfig,
    )

    config = ServerSideSessionConfig(key=SESSION_COOKIE)
    backend = ServerSideSessionBackend(config=config)
    store = config.get_store_from_app(app)
    session_id = backend.generate_session_id()
    await backend.set(
        session_id=session_id,
        data=backend.serialize_data({"user": user or TEST_USER}),
        store=store,
    )
    return {SESSION_COOKIE: session_id}
