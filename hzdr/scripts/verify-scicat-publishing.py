#!/usr/bin/env python3
"""Controlled campaign publishing test with a shareable, credential-free receipt."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess  # noqa: S404 -- read-only systemctl invocation, without a shell
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

import h5py
import httpx

from damnit_api.metadata.hzdr_nexus import write_json_atomic
from damnit_api.metadata.hzdr_scicat_publishing import publishing_body
from damnit_api.metadata.hzdr_scicat_summary import campaign_summary
from damnit_api.metadata.scicat import register_campaign_nexus
from damnit_api.shared.hzdr_settings import HZDRScicatSettings

SCHEMA = "fwkt-scicat-publishing-test-v1"


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def invocation_id(unit: str) -> str | None:
    """Read a systemd invocation ID; never restart services or read their env."""
    if not re.fullmatch(r"[A-Za-z0-9_.@-]+", unit):
        message = "Invalid systemd unit name"
        raise ValueError(message)
    command = shutil.which("systemctl")
    if command is None:
        return None
    try:
        response = subprocess.run(  # noqa: S603 -- read-only command, validated unit, no shell
            [command, "show", unit, "--property=InvocationID", "--value"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    value = response.stdout.strip()
    return value if re.fullmatch(r"[0-9a-fA-F]{32}", value) else None


def safe_url(value: str) -> str:
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        message = "Plugin URL must be HTTP(S), without credentials, query or fragment"
        raise ValueError(message)
    return value.rstrip("/")


def owned_file(root: Path, name: str) -> Path:
    path = root / name
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        message = "Verification files must stay inside the owned work directory"
        raise ValueError(message)
    return path


def prepare_files(root: Path, marker: dict) -> Path:
    master = owned_file(root, "verification.nxs")
    companion = owned_file(root, "shots/verification-shot.nxs")
    companion.parent.mkdir(exist_ok=True)
    for path in (master, companion):
        if path.exists():
            with h5py.File(path, "r") as handle:
                if handle.attrs.get("verification_identity") != marker["experiment_id"]:
                    message = (
                        "Refusing to modify a file not owned by this verification run"
                    )
                    raise ValueError(message)
            continue
        with h5py.File(path, "x") as handle:
            handle.attrs["verification_identity"] = marker["experiment_id"]
            handle.attrs["synthetic_verification"] = True
            entry = handle.create_group("entry")
            entry.attrs["NX_class"] = "NXentry"
            entry.create_dataset("verification_value", data=0)
            if path == master:
                handle["verification_shot"] = h5py.ExternalLink(
                    "shots/verification-shot.nxs", "/entry"
                )
    return master


class Verification:
    def __init__(self, args):
        self.args = args
        self.root = args.work_dir.expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        output = args.out or self.root / "scicat-publishing-results.json"
        if output.is_symlink():
            message = "Results path must not be a symlink"
            raise ValueError(message)
        self.output = output.resolve()
        marker_path = owned_file(self.root, "verification-identity.json")
        if args.after_restart and (
            not marker_path.exists() or not self.output.exists()
        ):
            message = "Run the initial verification before --after-restart"
            raise ValueError(message)
        self.url = safe_url(args.plugin_url)
        if marker_path.exists():
            self.marker = json.loads(marker_path.read_text())
            if (
                self.marker.get("schema") != SCHEMA
                or self.marker.get("plugin_url") != self.url
            ):
                message = "Work directory belongs to another verification target"
                raise ValueError(message)
        else:
            if any(self.root.iterdir()):
                message = "Choose a new empty verification work directory"
                raise ValueError(message)
            self.marker = {
                "schema": SCHEMA,
                "plugin_url": self.url,
                "created_at": utc_now(),
                "experiment_id": "SCICAT_Verification_" + uuid.uuid4().hex,
            }
            write_json_atomic(marker_path, self.marker)
        self.report = {
            "schema": SCHEMA,
            "plugin_url": self.url,
            "experiment_id": self.marker["experiment_id"],
            "synthetic": True,
            "started_at": utc_now(),
            "checks": [],
            "status": "running",
            "notes": [
                "No production campaign is changed or deleted.",
                "Previews are omitted; missing attachment permission is irrelevant.",
            ],
        }
        if self.output.exists():
            existing = json.loads(self.output.read_text())
            if (
                existing.get("schema") != SCHEMA
                or existing.get("experiment_id") != self.marker["experiment_id"]
            ):
                message = (
                    "Results path belongs to another file/run; choose another --out"
                )
                raise ValueError(message)
            self.report.update(existing)
        self.key = os.environ.get(args.key_env) or os.environ.get(
            "SCICAT_PLUGIN_API_KEY", ""
        )
        self.settings = None
        self.master = None

    def save(self):
        self.report["updated_at"] = utc_now()
        write_json_atomic(self.output, self.report)

    def step(self, name, callback):
        started = time.monotonic()
        try:
            details = callback() or {}
        except Exception as exc:
            self.report["checks"].append({
                "name": name,
                "status": "fail",
                "error": type(exc).__name__,
                "at": utc_now(),
            })
            self.report["status"] = "failed"
            self.save()
            return False
        self.report["checks"].append({
            "name": name,
            "status": "pass",
            "at": utc_now(),
            "elapsed_ms": round((time.monotonic() - started) * 1000),
            **details,
        })
        self.save()
        return True

    def preflight(self):
        if not self.key:
            message = "Missing plugin service key; set the key environment variable"
            raise ValueError(message)
        self.settings = HZDRScicatSettings(
            enabled=True,
            plugin_url=self.url,
            endpoint="publish",
            api_key=self.key,
            publisher="fwkt-scicat-verification",
            owner_group=self.args.owner_group,
            timeout=self.args.timeout,
        )
        response = httpx.get(
            self.url + "/scicat/capabilities",
            headers={"X-SciCat-Plugin-Key": self.key},
            timeout=self.args.timeout,
        )
        response.raise_for_status()
        capabilities = response.json()
        if not capabilities.get("managed_configured"):
            message = "Configure plugin authentication and a persistent journal path"
            raise ValueError(message)
        self.master = prepare_files(self.root, self.marker)
        self.report.setdefault(
            "service_invocation_before", invocation_id(self.args.service_unit)
        )
        return {"contract": capabilities.get("contract"), "managed_configured": True}

    def metadata(self):
        value = campaign_summary(
            self.marker["experiment_id"],
            [
                {
                    "shot_key": self.marker["experiment_id"] + "/synthetic-shot",
                    "fired_at": self.marker["created_at"],
                    "metadata": {},
                }
            ],
            [],
        )
        value["synthetic_verification"] = True
        value.update(test_entry=True, release_evidence=False, representative=False)
        value["verification_measurement"] = {"value": 1.5, "unit": "MeV"}
        return value

    def record_pid(self, result):
        pid = result.get("scicat_pid") or result.get("pid")
        if pid:
            seen = self.report.setdefault("observed_pids", [])
            if pid not in seen:
                seen.append(pid)
            self.save()
            if self.report.get("pid") not in (None, pid):
                message = "Unexpected PID change; inspect observed_pids in the results"
                raise ValueError(message)
            self.report["pid"] = pid

    def register(self, metadata, expected):
        result = register_campaign_nexus(
            settings=self.settings,
            nexus_path=self.master,
            experiment_id=self.marker["experiment_id"],
            source_key="fwkt-scicat-verification",
            scientific_metadata=metadata,
            source_folder=str(self.root),
            previous=self.report.get("registration"),
        )
        if result:
            self.record_pid(result)
            self.report["registration"] = result
            self.report["last_metadata"] = metadata
            self.save()
        action = (result or {}).get("scicat_action")
        if not result or not result.get("scicat_pid") or action not in expected:
            message = f"Unexpected publishing outcome: {action or 'no registration'}"
            raise ValueError(message)
        return {"action": action, "pid": result["scicat_pid"]}

    def remote_unchanged(self):
        body = publishing_body(
            self.settings,
            self.master,
            self.marker["experiment_id"],
            "fwkt-scicat-verification",
            self.report["last_metadata"],
            self.report["registration"],
        )
        response = httpx.post(
            self.url + "/scicat/publish",
            json=body,
            headers={"X-SciCat-Plugin-Key": self.key},
            timeout=self.args.timeout,
        )
        data = response.json()
        actions = {"create", "update", "unchanged", "partial", "reconciliation"}
        self.report["last_plugin_response"] = {
            "http_status": response.status_code,
            "action": data.get("action")
            if data.get("action") in actions
            else "unexpected",
        }
        self.save()
        self.record_pid(data)
        if response.is_error or data.get("action") != "unchanged":
            message = f"Expected remote unchanged; HTTP {response.status_code}"
            raise ValueError(message)
        return {
            key: data[key]
            for key in (
                "pid",
                "action",
                "file_count",
                "block_count",
                "checksum_policy",
                "checksums_verified",
            )
            if key in data
        }

    def change_companion(self):
        companion = owned_file(self.root, "shots/verification-shot.nxs")
        with h5py.File(companion, "r+") as handle:
            handle["entry/verification_value"][()] += 1
        return self.register(self.report["last_metadata"], {"update"})

    def restart_check(self):
        if self.report["status"] not in {"restart_pending", "passed"}:
            message = "Complete the initial verification successfully before restart"
            raise ValueError(message)
        before = self.report.get("service_invocation_before")
        after = invocation_id(self.args.service_unit)
        if before and after and before == after:
            message = "Service invocation unchanged; restart before --after-restart"
            raise ValueError(message)
        self.report["restart_evidence"] = {
            "before": before,
            "after": after,
            "type": "systemd-invocation-changed"
            if before and after
            else "operator-attested",
        }
        return self.remote_unchanged()

    def run(self):
        if not self.step("preflight", self.preflight):
            return 1
        if self.args.after_restart:
            passed = self.step("post-restart-unchanged", self.restart_check)
            self.report["status"] = "passed" if passed else "failed"
        else:
            metadata = self.metadata()
            passed = self.step(
                "initial-publish",
                lambda: self.register(metadata, {"create", "update", "unchanged"}),
            )
            passed = passed and self.step("remote-unchanged", self.remote_unchanged)
            metadata = {**metadata, "verification_stage": "metadata-update"}
            passed = passed and self.step(
                "metadata-only-update",
                lambda: self.register(metadata, {"update", "unchanged"}),
            )
            passed = passed and self.step(
                "companion-file-update", self.change_companion
            )
            passed = passed and self.step(
                "updated-remote-unchanged", self.remote_unchanged
            )
            self.report["status"] = "restart_pending" if passed else "failed"
        self.save()
        return 0 if passed else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path)
    parser.add_argument(
        "--plugin-url",
        default=os.environ.get(
            "DW_API_HZDR_SCICAT__PLUGIN_URL", "http://127.0.0.1:5001"
        ),
    )
    parser.add_argument("--key-env", default="DW_API_HZDR_SCICAT__API_KEY")
    parser.add_argument(
        "--owner-group", default=os.environ.get("DW_API_HZDR_SCICAT__OWNER_GROUP", "")
    )
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--service-unit", default="scicatplugin.service")
    parser.add_argument("--after-restart", action="store_true")
    args = parser.parse_args(argv)
    verification = Verification(args)
    result = verification.run()
    print(f"{verification.report['status']}: {verification.output}")
    return result


if __name__ == "__main__":
    raise SystemExit(main())
