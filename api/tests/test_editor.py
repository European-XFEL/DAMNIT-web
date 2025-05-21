import asyncio
import time

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
def temp_dir(tmp_path):
    file_path = tmp_path / "context.py"
    file_path.write_text("initial content")
    return tmp_path


@pytest.fixture(autouse=True)
def fast_ttl(monkeypatch):
    monkeypatch.setattr(mtime_cache, "TTL", 0.01)
    mtime_cache.file_mtime_cache.clear()
    yield
    mtime_cache.file_mtime_cache.clear()


@pytest.mark.asyncio
async def test_watcher_detects_change(client, temp_dir, monkeypatch):
    temp_path = temp_dir / "context.py"
    temp_dir_str = str(temp_dir)

    async def fake_get_proposal_info(proposal_num):  # noqa: RUF029
        return {"damnit_path": temp_dir_str}

    monkeypatch.setattr(routers, "get_proposal_info", fake_get_proposal_info)

    proposal_num = "1"

    resp = client.get(f"/contextfile/last_modified?proposal_num={proposal_num}"
                      )
    assert resp.status_code == 200
    initial_modified = resp.json()["lastModified"]

    await asyncio.to_thread(temp_path.write_text, "new content")

    assert await wait_for_change(
        client,
        f"/contextfile/last_modified?proposal_num={proposal_num}",
        initial_modified,
    )


def test_file_fetching(client, temp_dir, monkeypatch):
    temp_dir_str = str(temp_dir)

    async def fake_get_proposal_info(proposal_num):  # noqa: RUF029
        return {"damnit_path": temp_dir_str}

    monkeypatch.setattr(routers, "get_proposal_info", fake_get_proposal_info)

    proposal_num = "1"

    resp = client.get(f"/contextfile/content?proposal_num={proposal_num}")
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
