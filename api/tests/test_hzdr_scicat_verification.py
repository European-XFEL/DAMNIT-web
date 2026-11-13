"""Shareable controlled-test receipts survive partial writes and restarts."""

import argparse
import importlib.util
import json
import os
import subprocess  # noqa: S404 -- isolated interpreter import regression test
import sys
from pathlib import Path

import h5py
import httpx
import pytest


@pytest.mark.parametrize(
    "name", ["verify-scicat-publishing.py", "inspect-scicat-campaign.py"]
)
def test_standalone_runner_does_not_load_server_settings(name):
    script = Path(__file__).resolve().parents[2] / "hzdr/scripts" / name
    environment = {
        key: value for key, value in os.environ.items() if not key.startswith("DW_API_")
    }
    code = (
        "import runpy, sys; "
        "runpy.run_path(sys.argv[1], run_name='verification_import'); "
        "assert 'damnit_api.shared.settings' not in sys.modules; "
        "assert 'damnit_api.metadata.hzdr_routers' not in sys.modules"
    )
    result = subprocess.run(  # noqa: S603 -- fixed interpreter and local script
        [sys.executable, "-c", code, str(script)],
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stderr


@pytest.fixture
def runner():
    path = (
        Path(__file__).resolve().parents[2] / "hzdr/scripts/verify-scicat-publishing.py"
    )
    spec = importlib.util.spec_from_file_location("scicat_verification", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def inspection(tmp_path):
    path = (
        Path(__file__).resolve().parents[2] / "hzdr/scripts/inspect-scicat-campaign.py"
    )
    spec = importlib.util.spec_from_file_location("scicat_inspection", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    master = tmp_path / "campaign.nxs"
    companion = tmp_path / "shots/shot.nxs"
    companion.parent.mkdir()
    with h5py.File(companion, "w") as handle:
        handle.create_group("entry")
    with h5py.File(master, "w") as handle:
        handle.attrs["experiment_id"] = "campaign"
        handle.create_dataset("entry/shots/shot_key", data=["campaign/key"])
        handle["shot"] = h5py.ExternalLink("shots/shot.nxs", "/entry")
    event = {"event_id": "same-event", "source": "Watchdog", "match_status": "matched"}
    source = {
        "key": "campaign",
        "metadata": {"experiment_id": "campaign", "scicat_pid": "old/pid"},
        "shots": [
            {
                "shot_key": "campaign/key",
                "labfrog_record_id": "stable-id",
                "labfrog_local_count": 3,
                "authority_shot_number": 57,
                "metadata": {
                    "target": {"material": "Cu", "notes": "private-note"},
                    "instrument": {"id": "detector"},
                },
                "events": [event],
            }
        ],
        "review_events": [event],
    }
    catalog = tmp_path / "sources.json"
    catalog.write_text(json.dumps({"sources": [source]}))
    return module, catalog, master, companion


def test_inspection_keeps_pid_metadata_and_inventory_read_only(inspection):
    module, catalog, master, companion = inspection
    before = {path: path.read_bytes() for path in (catalog, master, companion)}
    result = module.inspect_campaign(catalog, master, "campaign")
    assert result["read_only"]
    assert result["registration"]["scicat_pid"] == "old/pid"
    assert result["legacy_migration_required"]
    assert result["catalogue_shot_keys_match_master"]
    assert result["file_count"] == 2
    assert result["metadata_preview"]["event_count"] == 1
    assert result["metadata_preview"]["authority_numbers"]["maximum"] == 57
    assert result["metadata_preview"]["labfrog_local_counts"]["maximum"] == 3
    assert result["metadata_preview"]["instruments"]["values"] == ["detector"]
    assert "private-note" not in json.dumps(result)
    assert all(path.read_bytes() == content for path, content in before.items())


def test_inspection_rejects_wrong_master_campaign_and_missing_companion(inspection):
    module, catalog, master, companion = inspection
    with h5py.File(master, "r+") as handle:
        handle.attrs["experiment_id"] = "other"
    with pytest.raises(ValueError, match="identity"):
        module.inspect_campaign(catalog, master, "campaign")
    with h5py.File(master, "r+") as handle:
        handle.attrs["experiment_id"] = "campaign"
    companion.unlink()
    with pytest.raises(FileNotFoundError):
        module.inspect_campaign(catalog, master, "campaign")


def test_inspection_reports_catalogue_master_mismatch(inspection):
    module, catalog, master, _ = inspection
    payload = json.loads(catalog.read_text())
    payload["sources"][0]["shots"][0]["shot_key"] = "campaign/changed"
    catalog.write_text(json.dumps(payload))
    result = module.inspect_campaign(catalog, master, "campaign")
    assert not result["catalogue_shot_keys_match_master"]
    assert any("reconcile" in note for note in result["warnings"])


def arguments(tmp_path, **updates):
    return argparse.Namespace(**{
        "work_dir": tmp_path / "verification",
        "out": None,
        "plugin_url": "http://plugin.test",
        "key_env": "VERIFICATION_TEST_KEY",
        "owner_group": "",
        "timeout": 2,
        "service_unit": "scicatplugin.service",
        "after_restart": False,
        **updates,
    })


def test_failure_receipt_excludes_exception_secrets(runner, tmp_path, monkeypatch):
    monkeypatch.setenv("VERIFICATION_TEST_KEY", "private-key")
    verification = runner.Verification(arguments(tmp_path))

    def failed():
        message = "response includes private-key and another-password"
        raise RuntimeError(message)

    assert not verification.step("request", failed)
    receipt = verification.output.read_text()
    assert "private-key" not in receipt
    assert "another-password" not in receipt
    assert json.loads(receipt)["checks"][0]["error"] == "RuntimeError"


def test_partial_retains_pid_in_failed_receipt(runner, tmp_path, monkeypatch):
    verification = runner.Verification(arguments(tmp_path))
    monkeypatch.setattr(
        runner,
        "register_campaign_nexus",
        lambda **_: {
            "scicat_pid": "HZDR/synthetic",
            "scicat_action": "partial",
            "scicat_failed_stage": "file_blocks",
        },
    )
    assert not verification.step(
        "initial", lambda: verification.register({}, {"create"})
    )
    report = json.loads(verification.output.read_text())
    assert report["pid"] == "HZDR/synthetic"
    assert report["registration"]["scicat_failed_stage"] == "file_blocks"
    assert report["status"] == "failed"


def test_complete_run_and_restart_preserve_identity(runner, tmp_path, monkeypatch):
    monkeypatch.setenv("VERIFICATION_TEST_KEY", "private-key")
    invocation = ["a" * 32]
    monkeypatch.setattr(runner, "invocation_id", lambda _: invocation[0])
    monkeypatch.setattr(
        runner.httpx,
        "get",
        lambda *a, **k: httpx.Response(
            200, json={"managed_configured": True}, request=httpx.Request("GET", a[0])
        ),
    )
    monkeypatch.setattr(
        runner,
        "register_campaign_nexus",
        lambda **k: {
            "scicat_pid": "HZDR/synthetic",
            "scicat_action": "update" if k["previous"] else "create",
        },
    )
    bodies = []

    def post(url, **kwargs):
        bodies.append(kwargs["json"])
        return httpx.Response(
            200,
            json={"pid": "HZDR/synthetic", "action": "unchanged"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(runner.httpx, "post", post)
    first = runner.Verification(arguments(tmp_path))
    assert first.run() == 0
    assert first.report["status"] == "restart_pending"
    invocation[0] = "b" * 32
    resumed = runner.Verification(arguments(tmp_path, after_restart=True))
    assert resumed.run() == 0
    report = json.loads(resumed.output.read_text())
    assert report["status"] == "passed"
    assert report["observed_pids"] == ["HZDR/synthetic"]
    assert report["restart_evidence"]["type"] == "systemd-invocation-changed"
    assert len(bodies[-1]["files"]) == 2
    assert "private-key" not in resumed.output.read_text()


def test_refuses_unowned_directory_and_restart_without_initial(runner, tmp_path):
    with pytest.raises(ValueError, match="initial verification"):
        runner.Verification(arguments(tmp_path, after_restart=True))
    (tmp_path / "verification/user-data.txt").write_text("preserve")
    with pytest.raises(ValueError, match="empty"):
        runner.Verification(arguments(tmp_path))


def test_unexpected_replay_action_is_saved_without_raw_response(
    runner, tmp_path, monkeypatch
):
    verification = runner.Verification(arguments(tmp_path))
    verification.report.update(last_metadata={}, registration={})
    monkeypatch.setattr(runner, "publishing_body", lambda *a: {})
    monkeypatch.setattr(
        runner.httpx,
        "post",
        lambda url, **k: httpx.Response(
            200,
            json={"action": "update", "pid": "HZDR/synthetic", "detail": "private-key"},
            request=httpx.Request("POST", url),
        ),
    )
    assert not verification.step("remote-unchanged", verification.remote_unchanged)
    report = json.loads(verification.output.read_text())
    assert report["last_plugin_response"] == {"http_status": 200, "action": "update"}
    assert report["pid"] == "HZDR/synthetic"
    assert "private-key" not in verification.output.read_text()
