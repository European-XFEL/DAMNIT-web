import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from damnit_api.contextfile import models, routers
from damnit_api.main import create_app
from damnit_api.shared.settings import settings


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("DW_API_AUTH__CLIENT_ID", "test")
    monkeypatch.setenv("DW_API_AUTH__CLIENT_SECRET", "test")
    monkeypatch.setenv(
        "DW_API_AUTH__SERVER_METADATA_URL", "https://example.com/.well-known"
    )
    monkeypatch.setenv("DW_API_SESSION_SECRET", "test")

    # HZDR test specific
    monkeypatch.setenv("DW_API_PROFILE", "hzdr-test")
    monkeypatch.setenv("DW_API_AUTH__MODE", "ldap")
    monkeypatch.setenv("DW_API_METADATA__PROVIDER", "local")

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
async def test_watcher_detects_change(app, client, temp_dir, monkeypatch):
    temp_path = temp_dir / "context.py"

    async def proposal_info(_proposal_num):  # noqa: RUF029
        return {"damnit_path": str(temp_dir)}

    monkeypatch.setattr(routers, "get_proposal_info", proposal_info)

    url = "/contextfile/last_modified?proposal_num=hzdr-test"
    resp = client.get(url)
    assert resp.status_code == 200
    initial_modified = resp.json()["lastModified"]

    await asyncio.to_thread(temp_path.write_text, "new content")

    assert await wait_for_change(client, url, initial_modified)


# FastAPI's TestClient creates a fresh event loop per request, so any
# alru_cached helper called by the handler binds to that loop. The
# loop-reset warning is intrinsic to this testing pattern.
@pytest.mark.filterwarnings("ignore::async_lru.AlruCacheLoopResetWarning")
def test_file_fetching(app, client, temp_dir, monkeypatch):
    async def proposal_info(_proposal_num):  # noqa: RUF029
        return {"damnit_path": str(temp_dir)}

    monkeypatch.setattr(routers, "get_proposal_info", proposal_info)

    resp = client.get("/contextfile/content?proposal_num=hzdr-test")
    assert resp.status_code == 200
    assert resp.json()["fileContent"] == "initial content"


# TestClient creates a fresh event loop per request, so the alru_cached
# ContextFile.from_file helper binds to that loop; the loop-reset warning is
# intrinsic to this testing pattern (see test_file_fetching).
@pytest.mark.filterwarnings("ignore::async_lru.AlruCacheLoopResetWarning")
def test_user_campaign_context_can_be_created_and_saved(tmp_path, monkeypatch):
    """HZDR users can maintain a campaign-scoped context workspace."""
    monkeypatch.setattr(settings.context_workspace, "root", tmp_path)
    monkeypatch.setattr(settings.context_workspace, "write_enabled", True)
    app = create_app()

    with TestClient(app) as local_client:
        local_client.get("/oauth/login?redirect_uri=/home", follow_redirects=False)

        response = local_client.get("/contextfile/campaign/hzdr-example/me")
        assert response.status_code == 200
        payload = response.json()
        assert payload["campaign"] == "hzdr-example"
        assert "hzdr_computed_field" in payload["fileContent"]

        save_response = local_client.put(
            "/contextfile/campaign/hzdr-example/me",
            json={"fileContent": "from damnit_ctx import Variable\n"},
        )
        assert save_response.status_code == 200
        assert (
            save_response.json()["fileContent"] == "from damnit_ctx import Variable\n"
        )


def test_user_campaign_context_results_run_against_hzdr_shots(tmp_path, monkeypatch):
    """Saved HZDR context variables produce table values for visible shots."""
    sources_file = tmp_path / "hzdr_sources.json"
    sources_file.write_text(
        """
{
  "sources": [
    {
      "key": "hzdr-example",
      "title": "HZDR fixture",
      "damnit_path": ".",
      "metadata": {},
      "shots": [
        {
          "source_key": "hzdr-example",
          "shot_number": 1001,
          "fired_at": "2026-05-05T10:00:00Z",
          "metadata": {"laser_energy_j": 12.5}
        }
      ]
    }
  ]
}
""",
        encoding="utf-8",
    )
    monkeypatch.setattr(settings.context_workspace, "root", tmp_path / "contexts")
    monkeypatch.setattr(settings.context_workspace, "write_enabled", True)
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    app = create_app()

    with TestClient(app) as local_client:
        local_client.get("/oauth/login?redirect_uri=/home", follow_redirects=False)
        local_client.put(
            "/contextfile/campaign/hzdr-example/me/files/context.py",
            json={
                "fileContent": """
from damnit_ctx import Variable


@Variable(title="Laser energy")
def laser_energy(run):
    return 12.5
"""
            },
        )

        response = local_client.get("/contextfile/campaign/hzdr-example/me/results")

    assert response.status_code == 200
    payload = response.json()
    assert payload["columns"] == [{"name": "laser_energy", "title": "Laser energy"}]
    assert payload["rows"][0]["values"]["laser_energy"] == pytest.approx(12.5)


def test_context_results_tolerate_removed_common_imports(tmp_path, monkeypatch):
    """Context previews survive duplicate cleanup removing common imports."""
    sources_file = tmp_path / "hzdr_sources.json"
    sources_file.write_text(
        """
{
  "sources": [
    {
      "key": "hzdr-example",
      "title": "HZDR fixture",
      "damnit_path": ".",
      "metadata": {},
      "shots": [
        {
          "source_key": "hzdr-example",
          "shot_number": 1001,
          "fired_at": "2026-05-05T10:00:00Z",
          "metadata": {}
        }
      ]
    }
  ]
}
""",
        encoding="utf-8",
    )
    monkeypatch.setattr(settings.context_workspace, "root", tmp_path / "contexts")
    monkeypatch.setattr(settings.context_workspace, "write_enabled", True)
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    app = create_app()

    with TestClient(app) as local_client:
        local_client.get("/oauth/login?redirect_uri=/home", follow_redirects=False)
        local_client.put(
            "/contextfile/campaign/hzdr-example/me/files/context.py",
            json={
                "fileContent": """
from damnit_ctx import Variable


@Variable(title="Recovered cell")
def recovered_cell(run):
    values = np.asarray([1.0, 2.0, 3.0])
    return Cell(values, summary="nanmean", preview=values)
"""
            },
        )

        response = local_client.get("/contextfile/campaign/hzdr-example/me/results")

    assert response.status_code == 200
    payload = response.json()
    assert payload["rows"][0]["values"]["recovered_cell"] == pytest.approx(2.0)
    assert payload["rows"][0]["previews"]["recovered_cell"] == [1.0, 2.0, 3.0]


def test_lineout_context_cell_without_summary_preserves_array_value():
    """Lineout previews should not be collapsed to a scalar summary."""
    raw_value = routers.ContextCell([1.0, 2.0, 3.0], preview=[1.0, 2.0, 3.0])

    assert routers._json_safe(routers._summarize_context_value(raw_value)) == [
        1.0,
        2.0,
        3.0,
    ]
    assert routers._json_safe(routers._summarize_context_preview(raw_value)) == [
        1.0,
        2.0,
        3.0,
    ]


def test_context_variable_can_request_shot_id_metadata():
    """Generated per-shot HDF5 snippets use shot_id to build common paths."""
    shot = type(
        "Shot",
        (),
        {
            "shot_number": 123,
            "hdf5_path": None,
            "metadata": {"shot_id": "shot-000123"},
        },
    )()

    def variable(run, shot_id: str):
        return shot_id

    variable.__annotations__["shot_id"] = "meta#shot_id"

    assert routers._call_context_variable(variable, shot) == "shot-000123"  # pyright: ignore[reportArgumentType]


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
