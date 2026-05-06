import asyncio
import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from damnit_api.contextfile import models
from damnit_api.main import create_app
from damnit_api.metadata.routers import get_proposal_meta


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("DW_API_AUTH__CLIENT_ID", "test")
    monkeypatch.setenv("DW_API_AUTH__CLIENT_SECRET", "test")
    monkeypatch.setenv(
        "DW_API_AUTH__SERVER_METADATA_URL", "https://example.com/.well-known"
    )
    monkeypatch.setenv("DW_API_SESSION_SECRET", "test")

    async def noop_bootstrap(settings):
        pass

    monkeypatch.setattr("damnit_api.auth.bootstrap", noop_bootstrap)

    app = create_app()
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def temp_dir(tmp_path):
    file_path = tmp_path / "context.py"
    file_path.write_text("initial content")
    return tmp_path


@pytest.fixture(autouse=True)
def clear_cache():
    yield
    models.ModifiedTime.from_file.cache_clear()
    models.ContextFile.from_file.cache_clear()


@pytest.mark.asyncio
async def test_watcher_detects_change(app, client, temp_dir):
    temp_path = temp_dir / "context.py"
    app.dependency_overrides[get_proposal_meta] = lambda: SimpleNamespace(
        damnit_path=str(temp_dir)
    )

    resp = client.get("/contextfile/last_modified")
    assert resp.status_code == 200
    initial_modified = resp.json()["lastModified"]

    await asyncio.to_thread(temp_path.write_text, "new content")

    assert await wait_for_change(client, "/contextfile/last_modified", initial_modified)


# FastAPI's TestClient creates a fresh event loop per request, so any
# alru_cached helper called by the handler binds to that loop. The
# loop-reset warning is intrinsic to this testing pattern.
@pytest.mark.filterwarnings("ignore::async_lru.AlruCacheLoopResetWarning")
def test_file_fetching(app, client, temp_dir):
    app.dependency_overrides[get_proposal_meta] = lambda: SimpleNamespace(
        damnit_path=str(temp_dir)
    )

    resp = client.get("/contextfile/content")
    assert resp.status_code == 200
    assert resp.json()["fileContent"] == "initial content"


async def wait_for_change(
    client,
    url,
    initial_value,
    timeout: float = 5.0,  # noqa: ASYNC109
):
    start = time.time()
    while time.time() - start < timeout:
        models.ModifiedTime.from_file.cache_clear()
        resp = client.get(url)
        if resp.json()["lastModified"] > initial_value:
            return True
        await asyncio.sleep(0.1)
    return False
