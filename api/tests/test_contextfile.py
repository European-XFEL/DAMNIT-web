import asyncio
import os
import time

import pytest
from fastapi.testclient import TestClient

from damnit_api.contextfile import models, routers
from damnit_api.main import create_app
from damnit_api.shared.settings import AuthSettings, settings


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
    newer_mtime = initial_modified + 1
    await asyncio.to_thread(os.utime, temp_path, (newer_mtime, newer_mtime))

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
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="ldap"))
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
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="ldap"))
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
    assert "shot_key" in payload["rows"][0]


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
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="ldap"))
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


def test_context_variables_receive_the_mapped_hdf5_path(tmp_path, monkeypatch):
    """A recorded /bigdata path reaches context code as this host's mount path."""
    mount = tmp_path / "mnt" / "bigdata"
    mount.mkdir(parents=True)
    (mount / "shot.h5").write_bytes(b"")
    sources_file = tmp_path / "hzdr_sources.json"
    sources_file.write_text(
        """
{"sources": [{"key": "hzdr-example", "title": "HZDR fixture", "damnit_path": ".",
  "metadata": {}, "shots": [{"source_key": "hzdr-example", "shot_number": 1001,
  "fired_at": "2026-05-05T10:00:00Z", "hdf5_path": "/bigdata/shot.h5"}]}]}
""",
        encoding="utf-8",
    )
    monkeypatch.setattr(settings, "auth", AuthSettings(mode="ldap"))
    monkeypatch.setattr(settings.context_workspace, "root", tmp_path / "contexts")
    monkeypatch.setattr(settings.context_workspace, "write_enabled", True)
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    monkeypatch.setattr(settings.metadata, "path_map", f"/bigdata={mount}")
    app = create_app()

    with TestClient(app) as local_client:
        local_client.get("/oauth/login?redirect_uri=/home", follow_redirects=False)
        local_client.put(
            "/contextfile/campaign/hzdr-example/me/files/context.py",
            json={
                "fileContent": """
import os

from damnit_ctx import Variable


@Variable(title="File reachable")
def reachable(run, hdf5_path):
    return 1.0 if os.path.exists(hdf5_path) else 0.0
"""
            },
        )

        response = local_client.get("/contextfile/campaign/hzdr-example/me/results")

    assert response.status_code == 200
    assert response.json()["rows"][0]["values"]["reachable"] == pytest.approx(1.0)


def test_context_arguments_read_nested_registry_keys():
    from damnit_api.contextfile.routers import _shot_metadata_value

    metadata = {
        "laser": {"pulse_energy": 12.25},
        "vacuum": {"chamber_pressure": 2.5e-5},
        "flat": 1,
    }

    # A legacy suffixed name follows the registry to its nested key.
    assert _shot_metadata_value(metadata, "laser_energy_j", None) == pytest.approx(
        12.25
    )
    assert _shot_metadata_value(
        metadata, "chamber_pressure_mbar", None
    ) == pytest.approx(2.5e-5)
    # A meta# annotation names a nested path directly.
    assert _shot_metadata_value(
        metadata, "e", "meta#laser.pulse_energy"
    ) == pytest.approx(12.25)
    # A flat key of that name still wins; unknown names stay None.
    assert _shot_metadata_value(metadata, "flat", None) == 1
    assert _shot_metadata_value(metadata, "nope", None) is None
    assert _shot_metadata_value({"laser": 3}, "laser_energy_j", None) is None


def test_legacy_nested_context_columns_use_each_record(tmp_path):
    from damnit_api.metadata.hzdr_sources import HZDRShot

    context = tmp_path / "context.py"
    context.write_text(
        """from damnit_ctx import Variable, mongo_find_one

@Variable(title="Legacy nested value")
def legacy(run, shot_number: "meta#shot_number"):
    doc = mongo_find_one("shots", query={"shot_number": shot_number})
    return doc.get("labfrog_variables.laser_energy.value")

@Variable(title="Direct nested value")
def direct(run, metadata_value: "meta#labfrog_variables.laser_energy.value"):
    return metadata_value
""",
        encoding="utf-8",
    )
    shots = [
        HZDRShot(
            source_key="campaign",
            shot_number=1,
            shot_key=f"campaign:{day}:000001",
            labfrog_record_id=record,
            fired_at=f"{day}T10:00:00Z",
            metadata={"labfrog_variables": {"laser_energy": {"value": energy}}},
        )
        for day, record, energy in [
            ("2026-04-29", "first-day", 2.0),
            ("2026-06-17", "old-version", 7.9),
            ("2026-06-17", "new-version", 8.2),
        ]
    ]
    result = routers._run_hzdr_context_file(context, shots)
    assert [row["values"]["legacy"] for row in result["rows"]] == [2.0, 7.9, 8.2]
    assert [row["values"]["direct"] for row in result["rows"]] == [2.0, 7.9, 8.2]
    assert [row["labfrog_record_id"] for row in result["rows"]] == [
        "first-day",
        "old-version",
        "new-version",
    ]
    assert all(not row["errors"] for row in result["rows"])
    assert len(shots) == 3


def test_legacy_context_metadata_preserves_flat_keys_defaults_and_shot_zero():
    from damnit_api.metadata.hzdr_sources import HZDRShot

    shots = [
        HZDRShot(
            source_key="s",
            shot_number=n,
            fired_at="",
            metadata={
                "laser.pulse_energy": n,
                "laser": {"pulse_energy": 99},
            },
        )
        for n in (1, 0)
    ]
    doc = routers._mongo_find_one(shots, {"shot_number": 0})
    assert doc["shot_number"] == 0
    assert doc.get("laser.pulse_energy") == 0
    assert doc.get("laser.missing", "fallback") == "fallback"
