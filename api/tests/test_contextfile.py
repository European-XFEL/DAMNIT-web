import asyncio
import time

import pytest
from litestar import Router
from litestar.di import Provide
from litestar.testing import create_test_client

from damnit_api.contextfile import models
from damnit_api.contextfile.routers import get_content, get_modified
from damnit_api.metadata.models import ProposalMeta


def _stub_proposal(damnit_path: str) -> ProposalMeta:
    """Create a minimal ProposalMeta for tests (transient, no DB required)."""
    return ProposalMeta(
        number=1,
        cycle="202401",
        instrument="TEST",
        path="/fake",
        title="Test",
        principal_investigator="Test PI",
        start_date=None,
        end_date=None,
        updated_at=None,
        damnit_path=damnit_path,
    )


@pytest.fixture
def client(temp_dir):
    test_router = Router(
        path="/contextfile",
        route_handlers=[get_content, get_modified],
        dependencies={
            "proposal": Provide(
                lambda: _stub_proposal(str(temp_dir)),
                sync_to_thread=False,
            )
        },
    )
    with create_test_client(route_handlers=[test_router]) as c:
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
async def test_watcher_detects_change(client, temp_dir):
    temp_path = temp_dir / "context.py"

    resp = client.get("/contextfile/last_modified")
    assert resp.status_code == 200
    initial_modified = resp.json()["lastModified"]

    await asyncio.to_thread(temp_path.write_text, "new content")

    assert await wait_for_change(client, "/contextfile/last_modified", initial_modified)


@pytest.mark.filterwarnings("ignore::async_lru.AlruCacheLoopResetWarning")
def test_file_fetching(client):
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
