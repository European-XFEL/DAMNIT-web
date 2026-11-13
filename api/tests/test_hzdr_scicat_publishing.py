"""Managed campaign metadata, explicit inventory and best-effort registration."""

from __future__ import annotations

import json
from pathlib import Path

import h5py
import httpx
import pytest

from damnit_api.metadata.hzdr_scicat_summary import campaign_files, campaign_summary
from damnit_api.metadata.scicat import (
    read_previous_registration,
    register_campaign_nexus,
)
from damnit_api.shared.hzdr_settings import HZDRScicatSettings


def managed_settings(**values):
    return HZDRScicatSettings(
        enabled=True,
        plugin_url="http://plugin.test",
        endpoint="publish",
        api_key="test-service-key",
        **values,
    )


@pytest.fixture
def master(tmp_path):
    path = tmp_path / "campaign.nxs"
    with h5py.File(path, "w") as handle:
        handle.create_group("entry")
    return path


def test_summary_keeps_authority_local_counts_targets_and_units_distinct():
    shots = [
        {
            "shot_key": "a",
            "shot_number": 5,
            "authority_shot_number": 100,
            "labfrog_local_count": 1,
            "labfrog_record_id": "record-a",
            "fired_at": "2026-11-13T10:00:00+01:00",
            "match_status": "matched",
            "metadata": {
                "target": {"material": "Cu", "thickness": 100, "notes": "private"}
            },
        },
        {
            "shot_key": "b",
            "shot_number": 5,
            "labfrog_local_count": 2,
            "labfrog_record_id": "record-b",
            "fired_at": "2026-11-13T11:00:00+01:00",
            "metadata": {"target": {"material": "Ni", "thickness": 200}},
        },
        {"shot_key": "c", "shot_number": 101, "metadata": {}},
        {
            "shot_key": "old",
            "shot_number": 999,
            "metadata": {"has_newer_version": True},
        },
    ]
    events = [
        {
            "source": "watchdog",
            "match_status": "matched",
            "review_level": "VERIFIED",
            "metadata": {"instrument": {"id": "camera-a"}},
        },
        {
            "source": "watchdog",
            "match_status": "ambiguous",
            "metadata": {"instrument": {"id": "spectrometer-b"}},
        },
    ]
    summary = campaign_summary("campaign", shots, events)
    assert summary["shot_count"] == 3
    assert summary["authority_numbers"] == {
        "present": 2,
        "missing": 1,
        "minimum": 100,
        "maximum": 101,
    }
    assert summary["labfrog_local_counts"] == {
        "present": 2,
        "missing": 1,
        "minimum": 1,
        "maximum": 2,
    }
    assert summary["labfrog_records"] == 2
    assert summary["time_coverage"]["shots_missing_time"] == 1
    assert summary["time_coverage"]["start"] == "2026-11-13T09:00:00+00:00"
    assert {t["material"] for t in summary["targets"]["values"]} == {"Cu", "Ni"}
    assert summary["targets"]["values"][0]["thickness"]["unit"] == "nm"
    assert set(summary["instruments"]["values"]) == {"camera-a", "spectrometer-b"}
    assert summary["event_match_status"]["counts"]["ambiguous"] == 1
    assert "private" not in json.dumps(summary)
    assert summary["superseded_shot_records"] == 1


def test_summary_is_bounded_and_unknowns_are_explicit():
    shots = [{"metadata": {"target": {"name": f"target-{i}"}}} for i in range(100)]
    summary = campaign_summary("campaign", shots, [])
    assert len(summary["targets"]["values"]) == 64
    assert summary["targets"]["truncated"] is True
    assert summary["authority_numbers"]["missing"] == 100
    assert "start" not in summary["time_coverage"]
    assert campaign_summary("empty", [], [])["shot_count"] == 0


def test_selects_only_explicit_containers_and_rejects_missing_or_escape(master):
    container = master.parent / "shots" / "shot.nxs"
    container.parent.mkdir()
    container.write_bytes(b"container")
    stray = container.parent / "unlinked.nxs"
    stray.write_bytes(b"not selected")
    with h5py.File(master, "a") as handle:
        handle["shot"] = h5py.ExternalLink("shots/shot.nxs", "/entry")
    assert campaign_files(master) == [master, container]
    container.unlink()
    with pytest.raises(FileNotFoundError):
        campaign_files(master)


def test_metadata_only_and_companion_changes_trigger_same_pid_update(
    master, monkeypatch
):
    calls = []

    def post(url, *, json, headers, timeout):
        calls.append(json)
        assert headers == {"X-SciCat-Plugin-Key": "test-service-key"}
        return httpx.Response(
            200,
            json={
                "ok": True,
                "pid": "p/1",
                "action": "create" if len(calls) == 1 else "update",
            },
        )

    monkeypatch.setattr(httpx, "post", post)
    settings = managed_settings(instrument_id="DRACO")

    def register(meta, previous=None):
        return register_campaign_nexus(
            settings=settings,
            nexus_path=master,
            experiment_id="campaign",
            source_key="source",
            scientific_metadata=meta,
            source_folder=str(master.parent),
            previous=previous,
        )

    first = register({"shot_count": 0})
    assert first["scicat_action"] == "create"
    assert calls[0]["instrument_id"] is None
    assert calls[0]["proposal_id"] is None
    same = register({"shot_count": 0}, first)
    assert same["scicat_action"] == "unchanged"
    assert len(calls) == 1
    changed = register({"shot_count": 0, "targets": ["Cu", "Ni"]}, same)
    assert changed["scicat_action"] == "update"
    assert calls[-1]["pid"] == "p/1"
    companion = master.parent / "shots" / "shot.nxs"
    companion.parent.mkdir()
    companion.write_bytes(b"first container")
    with h5py.File(master, "a") as handle:
        handle["shot"] = h5py.ExternalLink("shots/shot.nxs", "/entry")
    linked = register({"shot_count": 0, "targets": ["Cu", "Ni"]}, changed)
    assert len(calls[-1]["files"]) == 2
    companion.write_bytes(b"changed companion")
    updated = register({"shot_count": 0, "targets": ["Cu", "Ni"]}, linked)
    assert updated["scicat_pid"] == "p/1"
    assert len(calls) == 4


def test_legacy_pid_is_preserved_for_reviewed_migration(master, monkeypatch):
    monkeypatch.setattr(
        httpx, "post", lambda *a, **kw: pytest.fail("Unexpected migration write")
    )
    previous = {"scicat_pid": "legacy/1", "scicat_endpoint": "from-json"}
    result = register_campaign_nexus(
        settings=managed_settings(),
        nexus_path=master,
        experiment_id="campaign",
        source_key="source",
        scientific_metadata={},
        source_folder=str(master.parent),
        previous=previous,
    )
    assert result["scicat_pid"] == "legacy/1"
    assert result["scicat_action"] == "migration_required"


def test_partial_pid_is_retained_and_retried_without_skip(
    master, monkeypatch, tmp_path
):
    calls = []

    def post(url, *, json, headers, timeout):
        calls.append(json)
        return httpx.Response(
            502,
            json={
                "ok": False,
                "pid": "p/partial",
                "action": "partial",
                "failed_stage": "create_block",
            },
        )

    monkeypatch.setattr(httpx, "post", post)
    options = {
        "settings": managed_settings(),
        "nexus_path": master,
        "experiment_id": "campaign",
        "source_key": "source",
        "scientific_metadata": {},
        "source_folder": str(master.parent),
    }
    result = register_campaign_nexus(**options)
    assert result["scicat_pid"] == "p/partial"
    catalog = tmp_path / "sources.json"
    catalog.write_text(json.dumps({"sources": [{"key": "source", "metadata": result}]}))
    previous = read_previous_registration(catalog, "source")
    assert previous["scicat_failed_stage"] == "create_block"
    assert (
        register_campaign_nexus(**options, previous=previous)["scicat_action"]
        == "partial"
    )
    assert calls[-1]["operation"] == "update"
    assert calls[-1]["pid"] == "p/partial"


def test_managed_settings_require_auth_and_reject_incomplete_derived():
    with pytest.raises(ValueError, match="API_KEY"):
        HZDRScicatSettings(enabled=True, plugin_url="http://plugin", endpoint="publish")
    with pytest.raises(ValueError, match="raw datasets"):
        managed_settings(dataset_type="derived")


def test_body_matches_managed_plugin_fixture(master, monkeypatch):
    from damnit_api.metadata import hzdr_scicat_publishing as publishing

    fixture = json.loads(
        (
            Path(__file__).parent
            / "fixtures"
            / "damnit-managed-campaign-registration.sample.json"
        ).read_text()
    )
    monkeypatch.setattr(publishing, "_sha256", lambda path: "0" * 64)
    meta = {k: v for k, v in fixture["meta"].items() if k != "configured_instrument"}
    settings = managed_settings(
        instrument_id="DRACO", owner_group="hzdr-fwkt", access_groups=["hzdr-fwkt"]
    )
    body = publishing.publishing_body(
        settings, master, "Pilot_Verification_07.2026", "hzdr-labfrog", meta, None
    )
    fixture["source_folder"] = str(master.parent)
    fixture["files"][0]["path"] = str(master)
    assert body == fixture


def test_preview_content_changes_and_partial_preview_are_not_skipped(
    master, monkeypatch
):
    image = master.parent / "overview.png"
    image.write_bytes(
        b"caller supplies an explicit image; plugin validates its signature"
    )
    calls = []

    def post(url, *, json, headers, timeout):
        calls.append(json)
        return httpx.Response(
            200,
            json={
                "ok": True,
                "pid": "p/1",
                "action": "create" if len(calls) == 1 else "update",
                "preview_state": "partial" if len(calls) == 1 else "attached",
                "failed_stage": "preview" if len(calls) == 1 else None,
            },
        )

    monkeypatch.setattr(httpx, "post", post)
    options = {
        "settings": managed_settings(preview_path=Path("overview.png")),
        "nexus_path": master,
        "experiment_id": "campaign",
        "source_key": "source",
        "scientific_metadata": {},
        "source_folder": str(master.parent),
    }
    partial = register_campaign_nexus(**options)
    assert partial["scicat_action"] == "partial"
    assert partial["scicat_pid"] == "p/1"
    assert partial["scicat_preview_state"] == "partial"
    complete = register_campaign_nexus(**options, previous=partial)
    assert complete["scicat_preview_state"] == "attached"
    assert calls[-1]["preview"]["path"] == str(image)
    assert (
        register_campaign_nexus(**options, previous=complete)["scicat_action"]
        == "unchanged"
    )
    assert len(calls) == 2
    image.write_bytes(b"changed explicit preview")
    assert (
        register_campaign_nexus(**options, previous=complete)["scicat_action"]
        == "update"
    )
    assert len(calls) == 3
