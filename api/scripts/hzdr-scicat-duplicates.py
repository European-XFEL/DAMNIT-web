#!/usr/bin/env python
"""List, and with --apply delete, DAMNIT's duplicate SciCat datasets (ledger I7).

Until the content-fingerprint fix, every rebuild of a campaign registered a
new SciCat dataset (about 100 a day for radbio). Each campaign's datasets
share DAMNIT's name for it, ``HZDR canonical campaign (<experiment_id>)``.
For every campaign in DAMNIT's catalog it deletes only what is provably an
older, superseded registration of the same file: a dataset of that name,
created before the one the catalog points at (``scicat_pid``), at least
``--min-age-hours`` old (24), with the same source folder, and not
published. Everything else is kept: a dataset newer than the catalog's (a
registration that has not reached DAMNIT's catalog yet), another folder's,
and every dataset of a campaign whose catalog dataset SciCat does not have.
Datasets with any other name, including campaigns DAMNIT does not know, are
never looked at.

SciCat's address and login are the scicat_plugin's own, read from its env
file (``SCICAT_URL`` and ``SCICAT_USERNAME``/``SCICAT_PASSWORD``, or
``SCICAT_TOKEN``); nothing secret is printed. On fwkt-webapps that file is
root-only, so run it with sudo and the checkout's own Python, from ``api/``::

    sudo ../.venv/bin/python scripts/hzdr-scicat-duplicates.py \\
        --env-file /etc/fwkt-webapps/scicatplugin.env \\
        --sources-file /home/tippey/mnt/bigdata/HPLexp/nexus/hzdr_sources.json
    # the same with --apply deletes; --campaign NAME limits it to one campaign

Without ``--apply`` it changes nothing. ``--report FILE`` writes every
dataset found and the decision as JSON (for a SciCat admin, if the
functional account may not delete). Exit status: 0 done, 1 a delete failed,
2 bad usage or SciCat unreachable.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

TITLE = "HZDR canonical campaign ({experiment_id})"
FIELDS = ["pid", "datasetName", "creationTime", "isPublished", "sourceFolder"]


def read_env_file(path: Path) -> dict[str, str]:
    """``KEY=VALUE`` lines (``export`` and quotes allowed); comments skipped."""
    env: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.removeprefix("export ").partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        env[key.strip()] = value
    return env


def campaigns_from_catalog(
    sources_file: Path, only: set[str] | None = None
) -> list[tuple[str, str]]:
    """``(experiment_id, current scicat_pid)`` for each registered campaign."""
    payload = json.loads(sources_file.read_text(encoding="utf-8"))
    out = []
    for source in payload.get("sources", []):
        meta = source.get("metadata", {})
        pid = meta.get("scicat_pid")
        experiment_id = meta.get("experiment_id") or source.get("key")
        if not pid or not experiment_id:
            continue
        if only and experiment_id not in only and source.get("key") not in only:
            continue
        out.append((str(experiment_id), str(pid)))
    return out


class SciCat:
    """The few SciCat calls this needs. ``client`` is injectable for tests."""

    def __init__(self, env: dict[str, str], client: httpx.Client | None = None):
        self.url = (env.get("SCICAT_URL") or "").rstrip("/")
        if not self.url:
            msg = "SCICAT_URL is not set in the env file"
            raise ValueError(msg)
        verify = (env.get("SCICAT_TLS_VERIFY") or "true").strip().lower() not in {
            "0",
            "false",
            "no",
            "off",
        }
        self.client = client or httpx.Client(timeout=30, verify=verify)
        self.token = self._token(env)

    def _token(self, env: dict[str, str]) -> str:
        user, password = env.get("SCICAT_USERNAME"), env.get("SCICAT_PASSWORD")
        if user and password:
            resp = self.client.post(
                f"{self.url}/auth/login", json={"username": user, "password": password}
            )
            if resp.status_code >= 400:
                msg = f"SciCat login for {user!r} failed: HTTP {resp.status_code}"
                raise ValueError(msg)
            token = str(resp.json().get("access_token") or "")
        else:
            token = (env.get("SCICAT_TOKEN") or "").strip()
        if not token:
            msg = "no SciCat login: set SCICAT_USERNAME/PASSWORD or SCICAT_TOKEN"
            raise ValueError(msg)
        return token

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def datasets_named(self, name: str) -> list[dict[str, Any]]:
        """Every dataset with this name, oldest first.

        This SciCat ignores ``limit``/``order`` (it answers with its first 100,
        oldest first) but honours ``where``, so it pages by creation time.
        """
        found: dict[str, dict[str, Any]] = {}
        after = ""
        while True:
            where: dict[str, Any] = {"datasetName": name}
            if after:
                where["creationTime"] = {"gt": after}
            resp = self.client.get(
                f"{self.url}/datasets",
                params={"filter": json.dumps({"where": where, "fields": FIELDS})},
                headers=self._headers,
            )
            resp.raise_for_status()
            batch = [d for d in resp.json() if d.get("pid") not in found]
            if not batch:
                break
            for dataset in batch:
                found[dataset["pid"]] = dataset
            latest = max(str(d.get("creationTime") or "") for d in batch)
            if not latest or latest == after:
                break
            after = latest
        return sorted(found.values(), key=lambda d: str(d.get("creationTime") or ""))

    def delete(self, pid: str) -> int:
        resp = self.client.delete(
            f"{self.url}/datasets/{quote(pid, safe='')}", headers=self._headers
        )
        return resp.status_code


def _when(dataset: dict[str, Any]) -> datetime | None:
    try:
        when = datetime.fromisoformat(str(dataset.get("creationTime")))
    except ValueError:
        return None
    return when if when.tzinfo else when.replace(tzinfo=UTC)


def plan(
    datasets: list[dict[str, Any]],
    current_pid: str,
    *,
    now: datetime | None = None,
    min_age: timedelta = timedelta(hours=24),
) -> list[dict[str, Any]]:
    """Each dataset with ``action`` keep/delete and why.

    Deletes only what is provably an older, superseded registration of the
    file the catalog's dataset names. Anything else is kept: the catalog's
    dataset, published ones, any created after it (a build that registered but
    has not reached DAMNIT's catalog yet, or failed to), any younger than
    ``min_age`` (a build may be running), any with another source folder (not
    that file), and any without a readable creation time. If the catalog's
    dataset is not in SciCat, nothing of that campaign is deleted.
    """
    now = now or datetime.now(UTC)
    current = next((d for d in datasets if d["pid"] == current_pid), None)
    if current is None:
        why = "kept: the catalog's dataset is not in SciCat, nothing is deleted"
        return [{**d, "action": "keep", "why": why} for d in datasets]
    current_time = _when(current)
    rows = []
    for d in datasets:
        created = _when(d)
        if d["pid"] == current_pid:
            why = "current"
        elif d.get("isPublished"):
            why = "published"
        elif created is None or current_time is None:
            why = "no readable creation time"
        elif created >= current_time:
            why = "newer than the catalog's dataset (not in DAMNIT yet)"
        elif now - created < min_age:
            why = f"younger than {min_age}"
        elif d.get("sourceFolder") != current.get("sourceFolder"):
            why = "another source folder (not DAMNIT's file)"
        else:
            rows.append({**d, "action": "delete", "why": "older registration"})
            continue
        rows.append({**d, "action": "keep", "why": why})
    return rows


def _summarise(experiment_id: str, rows: list[dict[str, Any]]) -> None:
    doomed = sum(r["action"] == "delete" for r in rows)
    reasons = Counter(r["why"] for r in rows if r["action"] == "keep")
    kept = "; ".join(f"{n} {why}" for why, n in sorted(reasons.items()))
    current = next((r["pid"] for r in rows if r["why"] == "current"), "none")
    print(
        f"{experiment_id}: {len(rows)} datasets, catalog's {current}; "
        f"keep {kept or 'none'}; {doomed} older registration(s) to delete"
    )


def _delete(scicat: SciCat, rows: list[dict[str, Any]]) -> tuple[int, bool]:
    """Delete the rows marked delete; return (failures, stopped on 401/403)."""
    failed = 0
    for row in rows:
        if row["action"] != "delete":
            continue
        status = scicat.delete(row["pid"])
        row["delete_status"] = status
        if status < 400:
            continue
        failed += 1
        print(f"  delete {row['pid']}: HTTP {status}", file=sys.stderr)
        if status in {401, 403}:
            print(
                "  This account may not delete datasets; stopping. Give the "
                "--report file to a SciCat admin.",
                file=sys.stderr,
            )
            return failed, True
    return failed, False


def main(argv: list[str] | None = None, client: httpx.Client | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__.split("\n\n")[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--sources-file", type=Path, required=True)
    parser.add_argument("--campaign", action="append", default=[])
    parser.add_argument(
        "--apply", action="store_true", help="delete the older registrations"
    )
    parser.add_argument("--report", type=Path, help="write the plan as JSON")
    parser.add_argument(
        "--min-age-hours",
        type=float,
        default=24,
        help="never delete a dataset younger than this (default 24)",
    )
    args = parser.parse_args(argv)

    try:
        scicat = SciCat(read_env_file(args.env_file), client=client)
        campaigns = campaigns_from_catalog(args.sources_file, set(args.campaign))
    except (OSError, ValueError, httpx.HTTPError) as exc:
        print(f"Cannot start: {exc}", file=sys.stderr)
        return 2

    report: list[dict[str, Any]] = []
    failed = 0
    for experiment_id, current in campaigns:
        try:
            rows = plan(
                scicat.datasets_named(TITLE.format(experiment_id=experiment_id)),
                current,
                min_age=timedelta(hours=args.min_age_hours),
            )
        except httpx.HTTPError as exc:
            print(f"{experiment_id}: SciCat query failed: {exc}", file=sys.stderr)
            return 2
        _summarise(experiment_id, rows)
        stopped = False
        if args.apply:
            failed_here, stopped = _delete(scicat, rows)
            failed += failed_here
        report.extend({"experiment_id": experiment_id, **r} for r in rows)
        if stopped:
            break

    if args.report:
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Report: {args.report}")
    total = sum(r["action"] == "delete" for r in report)
    if args.apply:
        print(f"Deleted {total - failed} of {total} older registration(s).")
    else:
        print(
            f"{total} older registration(s) would be deleted; run again with --apply."
        )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
