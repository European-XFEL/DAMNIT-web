"""Tests for SciCat registration of the canonical campaign NeXus file.

Covers the best-effort registration helper (metadata/scicat.py), the catalog
stamping in write_sources_catalog, and the GET .../scicat API endpoint.  The
plugin HTTP call is always mocked; no real SciCat or plugin is contacted.
"""

from __future__ import annotations

from pathlib import Path, PurePosixPath

import httpx
import orjson
import pytest
from fastapi.testclient import TestClient

from damnit_api.main import create_app
from damnit_api.metadata.hzdr_nexus import write_sources_catalog
from damnit_api.metadata.scicat import (
    _build_body,
    read_previous_registration,
    register_campaign_nexus,
)
from damnit_api.shared.hzdr_settings import HZDRScicatSettings
from damnit_api.shared.settings import settings

EXPERIMENT_ID = "Solenoid_Beamline_Tests_01.2025"
SOURCE_KEY = "hzdr-labfrog"
PLUGIN_URL = "http://scicat-plugin.hzdr.de:5001"


def _nexus(tmp_path: Path, content: bytes = b"nexus-bytes") -> Path:
    path = tmp_path / "campaign.nxs"
    path.write_bytes(content)
    return path


def _settings(**overrides) -> HZDRScicatSettings:
    base = {"enabled": True, "plugin_url": PLUGIN_URL}
    base.update(overrides)
    return HZDRScicatSettings(**base)


class _FakePost:
    """Records the last POST and returns a canned response."""

    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code
        self.calls: list[dict] = []

    def __call__(self, url, json, timeout):
        self.calls.append({"url": url, "json": json, "timeout": timeout})
        request = httpx.Request("POST", url)
        return httpx.Response(self.status_code, json=self.payload, request=request)


def _register(tmp_path, settings_obj, monkeypatch, post, **kwargs):
    monkeypatch.setattr(httpx, "post", post)
    nexus = kwargs.pop("nexus", None) or _nexus(tmp_path)
    return register_campaign_nexus(
        settings=settings_obj,
        nexus_path=nexus,
        experiment_id=EXPERIMENT_ID,
        source_key=SOURCE_KEY,
        scientific_metadata={"shot_count": 3},
        source_folder=str(tmp_path),
        **kwargs,
    )


# ---------------------------------------------------------------------------
# Settings validation
# ---------------------------------------------------------------------------


def test_enabled_requires_plugin_url():
    with pytest.raises(ValueError, match="PLUGIN_URL"):
        HZDRScicatSettings(enabled=True)


def test_disabled_allows_missing_plugin_url():
    assert HZDRScicatSettings(enabled=False).plugin_url == ""


def test_build_body_matches_scicat_plugin_contract_fixture():
    fixture_path = (
        Path(__file__).parent / "fixtures" / "damnit-campaign-registration.sample.json"
    )
    fixture = orjson.loads(fixture_path.read_bytes())
    experiment_id = fixture["meta"]["proposalId"]
    scientific_metadata = {
        key: value
        for key, value in fixture["meta"].items()
        if key not in {"proposalId", "experimentId", "instrumentId"}
    }
    settings_obj = HZDRScicatSettings(
        dataset_type=fixture["dataset_type"],
        owner_group=fixture["owner_group"],
        access_groups=fixture["access_groups"],
        instrument_id=fixture["meta"]["instrumentId"],
    )

    body = _build_body(
        settings=settings_obj,
        nexus_path=PurePosixPath(fixture["filepath"]),
        experiment_id=experiment_id,
        scientific_metadata=scientific_metadata,
        source_folder=fixture["source_folder"],
        source_sha256="unused-for-from-json",
    )

    assert body == fixture


# ---------------------------------------------------------------------------
# Registration helper
# ---------------------------------------------------------------------------


def test_disabled_returns_none(tmp_path, monkeypatch):
    post = _FakePost({"ok": True, "pid": "x"})
    result = _register(tmp_path, _settings(enabled=False), monkeypatch, post)
    assert result is None
    assert post.calls == []  # never contacts the plugin


def test_from_json_registration_success(tmp_path, monkeypatch):
    post = _FakePost({"ok": True, "pid": "20.500/abc"})
    result = _register(
        tmp_path, _settings(frontend_url="https://scicat.hzdr.de"), monkeypatch, post
    )
    assert result is not None
    assert result["scicat_pid"] == "20.500/abc"
    assert result["scicat_endpoint"] == "from-json"
    assert result["scicat_source_sha256"]
    assert result["scicat_registered_at"]
    assert (
        result["scicat_dataset_url"] == "https://scicat.hzdr.de/datasets/20.500%2Fabc"
    )
    # from-json posts a filepath, not a files[] manifest
    body = post.calls[0]["json"]
    assert body["filepath"] == str(tmp_path / "campaign.nxs")
    assert body["meta"]["proposalId"] == EXPERIMENT_ID
    assert post.calls[0]["url"] == f"{PLUGIN_URL}/scicat/from-json"


def test_push_registration_returns_version_hash(tmp_path, monkeypatch):
    post = _FakePost({"ok": True, "pid": "pid-1", "version_hash": "deadbeef"})
    result = _register(tmp_path, _settings(endpoint="push"), monkeypatch, post)
    assert result is not None
    assert result["scicat_version_hash"] == "deadbeef"
    assert post.calls[0]["url"] == f"{PLUGIN_URL}/scicat/push"
    body = post.calls[0]["json"]
    assert body["files"][0]["path"] == str(tmp_path / "campaign.nxs")
    assert body["files"][0]["checksum"] == result["scicat_source_sha256"]


def test_owner_and_access_groups_included(tmp_path, monkeypatch):
    post = _FakePost({"ok": True, "pid": "p"})
    _register(
        tmp_path,
        _settings(owner_group="fwkt", access_groups=["a", "b"], instrument_id="draco"),
        monkeypatch,
        post,
    )
    body = post.calls[0]["json"]
    assert body["owner_group"] == "fwkt"
    assert body["access_groups"] == ["a", "b"]
    assert body["meta"]["instrumentId"] == "draco"


def test_plugin_rejection_returns_none(tmp_path, monkeypatch):
    post = _FakePost({"ok": False, "error": "bad"})
    assert _register(tmp_path, _settings(), monkeypatch, post) is None


def test_missing_pid_returns_none(tmp_path, monkeypatch):
    post = _FakePost({"ok": True})  # no pid
    assert _register(tmp_path, _settings(), monkeypatch, post) is None


def test_network_failure_never_raises(tmp_path, monkeypatch):
    def boom(url, json, timeout):
        error = "refused"
        raise httpx.ConnectError(error)

    assert _register(tmp_path, _settings(), monkeypatch, boom) is None


def test_missing_nexus_file_returns_none(tmp_path, monkeypatch):
    post = _FakePost({"ok": True, "pid": "p"})
    monkeypatch.setattr(httpx, "post", post)
    result = register_campaign_nexus(
        settings=_settings(),
        nexus_path=tmp_path / "does-not-exist.nxs",
        experiment_id=EXPERIMENT_ID,
        source_key=SOURCE_KEY,
        scientific_metadata={},
        source_folder=str(tmp_path),
    )
    assert result is None
    assert post.calls == []


def test_unchanged_rebuild_skips_repost(tmp_path, monkeypatch):
    post = _FakePost({"ok": True, "pid": "pid-first"})
    nexus = _nexus(tmp_path)
    first = _register(tmp_path, _settings(), monkeypatch, post, nexus=nexus)
    assert len(post.calls) == 1

    # Same file bytes -> same sha256 -> skip the POST, reuse the pid.
    second = _register(
        tmp_path, _settings(), monkeypatch, post, nexus=nexus, previous=first
    )
    assert second == first
    assert len(post.calls) == 1  # no second POST


def test_changed_rebuild_reposts(tmp_path, monkeypatch):
    post = _FakePost({"ok": True, "pid": "pid-first"})
    nexus = _nexus(tmp_path, content=b"v1")
    first = _register(tmp_path, _settings(), monkeypatch, post, nexus=nexus)

    nexus.write_bytes(b"v2-different")  # content changed -> must re-register
    post2 = _FakePost({"ok": True, "pid": "pid-second"})
    second = _register(
        tmp_path, _settings(), monkeypatch, post2, nexus=nexus, previous=first
    )
    assert second is not None
    assert second["scicat_pid"] == "pid-second"
    assert len(post2.calls) == 1


# ---------------------------------------------------------------------------
# read_previous_registration + catalog stamping
# ---------------------------------------------------------------------------


def test_read_previous_registration_roundtrip(tmp_path):
    sources_file = tmp_path / "hzdr_sources.json"
    write_sources_catalog(
        sources_file=sources_file,
        source_key=SOURCE_KEY,
        experiment_id=EXPERIMENT_ID,
        nexus_path=tmp_path / "campaign.nxs",
        shots=[],
        scicat={
            "scicat_pid": "pid-9",
            "scicat_source_sha256": "abc123",
            "scicat_version_hash": "vh",
        },
    )
    previous = read_previous_registration(sources_file, SOURCE_KEY)
    assert previous is not None
    assert previous["scicat_pid"] == "pid-9"
    assert previous["scicat_source_sha256"] == "abc123"


def test_read_previous_registration_absent(tmp_path):
    assert read_previous_registration(tmp_path / "missing.json", SOURCE_KEY) is None


def test_catalog_stamps_scicat_block(tmp_path):
    sources_file = tmp_path / "hzdr_sources.json"
    write_sources_catalog(
        sources_file=sources_file,
        source_key=SOURCE_KEY,
        experiment_id=EXPERIMENT_ID,
        nexus_path=tmp_path / "campaign.nxs",
        shots=[],
        scicat={"scicat_pid": "pid-1", "scicat_dataset_url": "http://s/datasets/pid-1"},
    )
    payload = orjson.loads(sources_file.read_bytes())
    meta = payload["sources"][0]["metadata"]
    assert meta["scicat_pid"] == "pid-1"
    assert meta["scicat_dataset_url"] == "http://s/datasets/pid-1"


def test_catalog_without_scicat_has_no_pid(tmp_path):
    sources_file = tmp_path / "hzdr_sources.json"
    write_sources_catalog(
        sources_file=sources_file,
        source_key=SOURCE_KEY,
        experiment_id=EXPERIMENT_ID,
        nexus_path=tmp_path / "campaign.nxs",
        shots=[],
    )
    meta = orjson.loads(sources_file.read_bytes())["sources"][0]["metadata"]
    assert "scicat_pid" not in meta


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------


def _app_with_source(
    tmp_path, monkeypatch, metadata: dict, *, enabled: bool, frontend_url: str = ""
):
    sources_file = tmp_path / "hzdr_sources.json"
    sources_file.write_bytes(
        orjson.dumps({
            "sources": [
                {
                    "key": SOURCE_KEY,
                    "title": "Campaign",
                    "damnit_path": str(tmp_path / "damnit"),
                    "metadata": metadata,
                    "shots": [],
                }
            ]
        })
    )
    monkeypatch.setattr(settings.metadata, "provider", "local")
    monkeypatch.setattr(settings.metadata, "sources_file", sources_file)
    monkeypatch.setattr(settings.hzdr_scicat, "enabled", enabled)
    monkeypatch.setattr(settings.hzdr_scicat, "frontend_url", frontend_url)
    monkeypatch.setattr(settings, "damnit_path", tmp_path)
    return create_app()


def test_endpoint_registered(tmp_path, monkeypatch):
    app = _app_with_source(
        tmp_path,
        monkeypatch,
        {
            "experiment_id": EXPERIMENT_ID,
            "scicat_pid": "20.500/abc",
            "scicat_dataset_url": "https://scicat.hzdr.de/datasets/20.500%2Fabc",
            "scicat_registered_at": "2026-07-04T00:00:00+00:00",
        },
        enabled=True,
    )
    with TestClient(app) as client:
        resp = client.get(f"/metadata/hzdr/sources/{SOURCE_KEY}/scicat")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["registered"] is True
    assert data["pid"] == "20.500/abc"
    assert data["dataset_url"] == "https://scicat.hzdr.de/datasets/20.500%2Fabc"


def test_endpoint_builds_dataset_url_from_frontend(tmp_path, monkeypatch):
    app = _app_with_source(
        tmp_path,
        monkeypatch,
        {"experiment_id": EXPERIMENT_ID, "scicat_pid": "pid/1"},
        enabled=True,
        frontend_url="https://scicat.hzdr.de/",
    )
    with TestClient(app) as client:
        data = client.get(f"/metadata/hzdr/sources/{SOURCE_KEY}/scicat").json()
    assert data["dataset_url"] == "https://scicat.hzdr.de/datasets/pid%2F1"


def test_endpoint_unregistered_when_disabled(tmp_path, monkeypatch):
    app = _app_with_source(
        tmp_path, monkeypatch, {"experiment_id": EXPERIMENT_ID}, enabled=False
    )
    with TestClient(app) as client:
        data = client.get(f"/metadata/hzdr/sources/{SOURCE_KEY}/scicat").json()
    assert data["configured"] is False
    assert data["registered"] is False
    assert data["pid"] is None


def test_endpoint_404_for_unknown_source(tmp_path, monkeypatch):
    app = _app_with_source(
        tmp_path, monkeypatch, {"experiment_id": EXPERIMENT_ID}, enabled=True
    )
    with TestClient(app) as client:
        resp = client.get("/metadata/hzdr/sources/nope/scicat")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Content fingerprint: a rebuild of the same content is not a new dataset (I7)
# ---------------------------------------------------------------------------


def _h5_campaign(path: Path, *, stamp: str, energies=(1.0, 2.0)) -> Path:
    import h5py
    import numpy as np

    with h5py.File(path, "w") as f:
        f.attrs["damnit_bridge_updated_at"] = stamp
        f.attrs["experiment_id"] = EXPERIMENT_ID
        shots = f.create_group("entry/shots")
        shots["energy"] = np.array(energies)
        shots["shot_key"] = np.array([b"a", b"b"])
        f["20261111_000001"] = h5py.ExternalLink("shots/20261111_000001.nxs", "/entry")
    return path


def test_fingerprint_ignores_the_build_stamp(tmp_path):
    from damnit_api.metadata.scicat import content_fingerprint

    one = _h5_campaign(tmp_path / "one.nxs", stamp="2026-11-11T09:44:00+00:00")
    two = _h5_campaign(tmp_path / "two.nxs", stamp="2026-11-11T10:24:00+00:00")
    assert one.read_bytes() != two.read_bytes()
    assert content_fingerprint(one) == content_fingerprint(two)


def test_fingerprint_sees_a_changed_value_and_link(tmp_path):
    import h5py

    from damnit_api.metadata.scicat import content_fingerprint

    base = content_fingerprint(_h5_campaign(tmp_path / "a.nxs", stamp="t1"))
    changed = _h5_campaign(tmp_path / "b.nxs", stamp="t1", energies=(1.0, 2.5))
    assert content_fingerprint(changed) != base
    relinked = _h5_campaign(tmp_path / "c.nxs", stamp="t1")
    with h5py.File(relinked, "r+") as f:
        del f["20261111_000001"]
        f["20261111_000001"] = h5py.ExternalLink("shots/other.nxs", "/entry")
    assert content_fingerprint(relinked) != base


def test_rebuild_with_same_content_keeps_the_dataset(tmp_path, monkeypatch):
    post = _FakePost({"ok": True, "pid": "pid-first"})
    nexus = _h5_campaign(tmp_path / "campaign.nxs", stamp="09:44")
    first = _register(tmp_path, _settings(), monkeypatch, post, nexus=nexus)
    assert first is not None
    assert first["scicat_content_fingerprint"]

    _h5_campaign(nexus, stamp="10:24")  # rebuilt: new stamp, new bytes
    second = _register(
        tmp_path, _settings(), monkeypatch, post, nexus=nexus, previous=first
    )
    assert second is not None
    assert second["scicat_pid"] == "pid-first"
    assert len(post.calls) == 1


def test_previous_without_fingerprint_registers_once_more(tmp_path, monkeypatch):
    """A catalog from before the fix has no fingerprint: one more dataset, then none."""
    nexus = _h5_campaign(tmp_path / "campaign.nxs", stamp="09:44")
    old = {"scicat_pid": "pid-old", "scicat_source_sha256": "not-this-file"}
    post = _FakePost({"ok": True, "pid": "pid-new"})
    second = _register(
        tmp_path, _settings(), monkeypatch, post, nexus=nexus, previous=old
    )
    assert second is not None
    assert second["scicat_pid"] == "pid-new"
    _h5_campaign(nexus, stamp="10:24")
    third = _register(
        tmp_path, _settings(), monkeypatch, post, nexus=nexus, previous=second
    )
    assert third is not None
    assert third["scicat_pid"] == "pid-new"
    assert len(post.calls) == 1


def test_fingerprint_survives_the_catalog_roundtrip(tmp_path, monkeypatch):
    post = _FakePost({"ok": True, "pid": "pid-first"})
    nexus = _h5_campaign(tmp_path / "campaign.nxs", stamp="09:44")
    first = _register(tmp_path, _settings(), monkeypatch, post, nexus=nexus)
    sources = tmp_path / "hzdr_sources.json"
    write_sources_catalog(
        sources_file=sources,
        source_key=SOURCE_KEY,
        experiment_id=EXPERIMENT_ID,
        nexus_path=nexus,
        shots=[],
        scicat=first,
    )
    previous = read_previous_registration(sources, SOURCE_KEY)
    assert previous is not None
    assert previous["scicat_content_fingerprint"] == first["scicat_content_fingerprint"]


def test_each_build_reports_its_scicat_outcome():
    import importlib.util

    from damnit_api.consumer.builder_trigger import scicat_lines

    script = Path(__file__).resolve().parents[1] / "scripts" / "hzdr-hdf5-builder.py"
    spec = importlib.util.spec_from_file_location("hzdr_builder_for_scicat", script)
    assert spec is not None
    assert spec.loader is not None
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)

    kept = builder.scicat_outcome("radbio", {"scicat_pid": "p1"}, {"scicat_pid": "p1"})
    new = builder.scicat_outcome("radbio", {"scicat_pid": "p1"}, {"scicat_pid": "p2"})
    failed = builder.scicat_outcome("radbio", None, None)
    assert kept == "SciCat: radbio: unchanged, kept dataset p1"
    assert new == "SciCat: radbio: registered new dataset p2"
    assert failed.startswith("SciCat: radbio: not registered")
    output = f"Canonical NeXus: x\n{new}\nDAMNIT source catalog: y\n"
    assert scicat_lines(output) == [new]
