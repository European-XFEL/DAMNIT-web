import os
import time
import tempfile
import asyncio
from pathlib import Path
from damnit_api.filewatcher import routers

import pytest
from fastapi.testclient import TestClient
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
    os.unlink(f.name)


@pytest.mark.asyncio
async def test_health_check(client):
    resp = client.get("/file/health")
    assert resp.status_code == 200
    assert resp.json() == {"message": "OK"}


@pytest.mark.asyncio
async def test_watcher_detects_change(client, temp_file, monkeypatch):
    from damnit_api.filewatcher import routers

    temp_dir = os.path.dirname(temp_file)
    temp_filename = os.path.basename(temp_file)

    async def fake_get_proposal_info(proposal_num):
        return {"damnit_path": temp_dir}

    monkeypatch.setattr(routers, "get_proposal_info", fake_get_proposal_info)

    proposal_num = "1"
    filename = temp_filename

    # Trigger the watcher
    resp = client.get(f"/file/last_modified?proposal_num={proposal_num}&file_name={filename}")
    assert resp.status_code == 200
    initial_modified = resp.json()["lastModified"]
         
    with open(temp_file, "w") as f:
        f.write("new content")
        f.flush()

    assert await wait_for_change(client, f"/file/last_modified?proposal_num={proposal_num}&file_name={filename}", initial_modified)    


@pytest.mark.asyncio
async def test_watcher_stops_at_timeout(client, temp_file, monkeypatch):
    temp_dir = os.path.dirname(temp_file)
    temp_filename = os.path.basename(temp_file)

    async def fake_get_proposal_info(proposal_num):
        return {"damnit_path": temp_dir}

    monkeypatch.setattr(routers, "get_proposal_info", fake_get_proposal_info)

    routers.watcher_manager.timeout = 1 
    routers.watcher_manager._cleanup_time = 1

    proposal_num = "1"
    filename = temp_filename

    resp = client.get(f"/file/last_modified?proposal_num={proposal_num}&file_name={filename}")
    assert resp.status_code == 200
    
    assert await wait_for_stop(client, f"/file/watcher_status?proposal_num={proposal_num}&file_name={filename}")   
    


@pytest.mark.asyncio
async def test_file_fetching(client, temp_file, monkeypatch):
    temp_dir = os.path.dirname(temp_file)
    temp_filename = os.path.basename(temp_file)

    async def fake_get_proposal_info(proposal_num):
        return {"damnit_path": temp_dir}

    monkeypatch.setattr(routers, "get_proposal_info", fake_get_proposal_info)

    proposal_num = "1"
    filename = temp_filename

    resp = client.get(f"/file/current?proposal_num={proposal_num}&filename={filename}")
    assert resp.status_code == 200
    assert resp.json()["fileContent"] == "initial content"
    
    
async def wait_for_stop(client, url, timeout=5):
    start = time.time()
    while time.time() - start < timeout:
        resp = client.get(url)
        if not (resp.json()["status"]):
            return True
        await asyncio.sleep(0.1)
    return False    
    
async def wait_for_change(client, url, initial_value, timeout=5):
    start = time.time()
    while time.time() - start < timeout:
        resp = client.get(url)
        if resp.json()["lastModified"] > initial_value:
            return True
        await asyncio.sleep(0.1)
    return False