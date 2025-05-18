import asyncio
import tempfile
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from damnit_api.filewatcher import mtime_cache, routers
from damnit_api.main import create_app


@pytest.fixture(scope="module")
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def temp_file():
    with tempfile.NamedTemporaryFile(delete=False, mode="w+") as f:
        f.write("initial content")
        f.flush()
        yield f.name
    Path(f.name).unlink()


@pytest.fixture(autouse=True)
def fast_ttl(monkeypatch):
    monkeypatch.setattr(mtime_cache, "TTL", 0.01)
    mtime_cache.file_mtime_cache.clear()
    yield
    mtime_cache.file_mtime_cache.clear()


@pytest.mark.asyncio
async def test_watcher_detects_change(client, temp_file, monkeypatch):
    temp_path = Path(temp_file)
    temp_dir = str(temp_path.parent)
    temp_filename = temp_path.name

    async def fake_get_proposal_info(proposal_num):  # noqa: RUF029
        return {"damnit_path": temp_dir}

    monkeypatch.setattr(routers, "get_proposal_info", fake_get_proposal_info)

    proposal_num = "1"
    filename = temp_filename

    resp = client.get(
        f"/file/last_modified?proposal_num={proposal_num}&file_name={filename}"
    )
    assert resp.status_code == 200
    initial_modified = resp.json()["lastModified"]

    await asyncio.to_thread(temp_path.write_text, "new content")

    assert await wait_for_change(
        client,
        f"/file/last_modified?proposal_num={proposal_num}&file_name={filename}",
        initial_modified,
    )


def test_file_fetching(client, temp_file, monkeypatch):
    temp_path = Path(temp_file)
    temp_dir = str(temp_path.parent)
    temp_filename = temp_path.name

    async def fake_get_proposal_info(proposal_num):  # noqa: RUF029
        return {"damnit_path": temp_dir}

    monkeypatch.setattr(routers, "get_proposal_info", fake_get_proposal_info)

    proposal_num = "1"
    filename = temp_filename

    resp = client.get(
        f"/file/current?proposal_num={proposal_num}&filename={filename}"
    )
    assert resp.status_code == 200
    assert resp.json()["fileContent"] == "initial content"


async def wait_for_change(
    client, url, initial_value, timeout: float = 5.0  # noqa: ASYNC109
):
    start = time.time()
    while time.time() - start < timeout:
        resp = client.get(url)
        if resp.json()["lastModified"] > initial_value:
            return True
        await asyncio.sleep(0.1)
    return False
