"""Shareable controlled-test receipts survive partial writes and restarts."""

import argparse
import importlib.util
import json
import os
import subprocess  # noqa: S404 -- isolated interpreter import regression test
import sys
from pathlib import Path

import httpx
import pytest


def test_standalone_runner_does_not_load_server_settings():
    script = (
        Path(__file__).resolve().parents[2] / "hzdr/scripts/verify-scicat-publishing.py"
    )
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
