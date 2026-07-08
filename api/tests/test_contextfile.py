import os

import pytest
from litestar import Router
from litestar.di import Provide
from litestar.testing import create_test_client

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
def temp_dir(tmp_path):
    file_path = tmp_path / "context.py"
    file_path.write_text("initial content")
    return tmp_path


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


def _bump_mtime(path, seconds: float = 60.0) -> None:
    stat = path.stat()
    os.utime(path, times=(stat.st_atime, stat.st_mtime + seconds))


def test_file_fetching(client):
    resp = client.get("/contextfile/content", params={"proposal_number": 1})
    assert resp.status_code == 200
    assert resp.json()["fileContent"] == "initial content"


def test_response_cached_within_ttl(client, temp_dir):
    resp = client.get("/contextfile/last_modified", params={"proposal_number": 1})
    assert resp.status_code == 200
    initial = resp.json()["lastModified"]

    _bump_mtime(temp_dir / "context.py")

    # Same proposal within the TTL: the cached response is served.
    resp = client.get("/contextfile/last_modified", params={"proposal_number": 1})
    assert resp.json()["lastModified"] == initial


def test_cache_entries_isolated_per_proposal(client, temp_dir):
    resp = client.get("/contextfile/last_modified", params={"proposal_number": 1})
    initial = resp.json()["lastModified"]

    _bump_mtime(temp_dir / "context.py")

    # A different proposal key misses the cache and sees the new mtime.
    resp = client.get("/contextfile/last_modified", params={"proposal_number": 2})
    assert resp.json()["lastModified"] > initial
