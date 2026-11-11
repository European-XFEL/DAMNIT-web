#!/usr/bin/env python
"""List, and with --apply delete, DAMNIT's duplicate SciCat datasets (ledger I7).

Until the content-fingerprint fix, every rebuild of a campaign registered a
new SciCat dataset (about 100 a day for radbio). Each campaign's datasets
share DAMNIT's name for it, ``HZDR canonical campaign (<experiment_id>)``.
It deletes only **provable replicates**: older registrations DAMNIT made of
the very file the catalog's dataset (``scicat_pid``) names. A dataset is one
only if every check passes:

- the same name and, in its scientific metadata, the same ``experiment_id``;
- created by the same account as the catalog's dataset, and not edited by
  anyone else since (``updatedBy``);
- the same source folder, so the same file;
- created before the catalog's dataset and at least ``--min-age-hours`` (24)
  ago; not published.

A missing or unreadable field counts as not proven, so that dataset stays. A
dataset newer than the catalog's (a registration that has not reached
DAMNIT's catalog yet) stays. If SciCat lacks the catalog's dataset, or that
dataset lacks DAMNIT's marks, nothing of the campaign is deleted. Datasets
with any other name, including campaigns DAMNIT does not know, are never read.

SciCat's address and login are the scicat_plugin's own, read from its env
file (``SCICAT_URL`` and ``SCICAT_USERNAME``/``SCICAT_PASSWORD``, or
``SCICAT_TOKEN``); nothing secret is printed. On fwkt-webapps that file is
root-only, so run it with sudo and the checkout's own Python, from ``api/``::

    sudo ../.venv/bin/python scripts/hzdr-scicat-duplicates.py \\
        --env-file /etc/fwkt-webapps/scicatplugin.env \\
        --sources-file /home/tippey/mnt/bigdata/HPLexp/nexus/hzdr_sources.json
    # it ends with the number of replicates N; to delete them:
    #   ... --apply --expect N        (--campaign NAME limits it to one campaign)

Without ``--apply`` it changes nothing. ``--apply`` deletes only when
``--expect`` equals the number planned at that moment, and fetches each
dataset again right before deleting it: if it no longer passes every check
(published or edited meanwhile), it is kept. ``--report FILE`` writes every
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
                params={"filter": json.dumps({"where": where})},
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

    def get(self, pid: str) -> dict[str, Any] | None:
        """The dataset as SciCat has it now, or None if it is gone."""
        resp = self.client.get(
            f"{self.url}/datasets/{quote(pid, safe='')}", headers=self._headers
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

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


def _meta(dataset: dict[str, Any], key: str) -> Any:
    value = (dataset.get("scientificMetadata") or {}).get(key)
    if isinstance(value, dict) and "value" in value:
        value = value["value"]
    return value


def keep_reason(
    dataset: dict[str, Any],
    current: dict[str, Any],
    experiment_id: str,
    *,
    now: datetime,
    min_age: timedelta,
) -> str | None:
    """Why ``dataset`` must be kept, or None when it is provably a replicate.

    A replicate is an older registration DAMNIT made of the very file the
    catalog's dataset (``current``) names. Every condition must hold; a field
    that is missing or unreadable counts as "not proven", so the dataset stays.
    """
    if dataset.get("pid") == current.get("pid"):
        return "current"
    return _identity_reason(dataset, current, experiment_id) or _timing_reason(
        dataset, current, now=now, min_age=min_age
    )


def _identity_reason(
    dataset: dict[str, Any], current: dict[str, Any], experiment_id: str
) -> str | None:
    """Not DAMNIT's registration of the same file, or not to be touched."""
    if dataset.get("datasetName") != TITLE.format(experiment_id=experiment_id):
        return "another name"
    if dataset.get("isPublished"):
        return "published"
    if _meta(dataset, "experiment_id") != experiment_id:
        return "its metadata does not name this campaign"
    creator = dataset.get("createdBy")
    if not creator or creator != current.get("createdBy"):
        return "created by another account"
    if dataset.get("updatedBy") not in (None, creator):
        return "edited by someone since"
    folder = dataset.get("sourceFolder")
    if not folder or folder != current.get("sourceFolder"):
        return "another source folder (not DAMNIT's file)"
    return None


def _timing_reason(
    dataset: dict[str, Any],
    current: dict[str, Any],
    *,
    now: datetime,
    min_age: timedelta,
) -> str | None:
    """Not an old registration superseded by the catalog's dataset."""
    created, current_time = _when(dataset), _when(current)
    if created is None or current_time is None:
        return "no readable creation time"
    if created >= current_time:
        return "newer than the catalog's dataset (not in DAMNIT yet)"
    if now - created < min_age:
        return f"younger than {min_age}"
    return None


def plan(
    datasets: list[dict[str, Any]],
    current_pid: str,
    experiment_id: str,
    *,
    now: datetime | None = None,
    min_age: timedelta = timedelta(hours=24),
) -> list[dict[str, Any]]:
    """Each dataset with ``action`` keep/delete and why (see ``keep_reason``).

    Nothing of a campaign is deleted when SciCat lacks the catalog's dataset,
    or when that dataset itself does not carry DAMNIT's marks (its name, this
    campaign in its metadata, an account and a source folder): without a
    trustworthy reference there is nothing to prove a replicate against.
    """
    now = now or datetime.now(UTC)
    current = next((d for d in datasets if d["pid"] == current_pid), None)
    if current is None:
        why = "the catalog's dataset is not in SciCat: nothing deleted"
        return [{**d, "action": "keep", "why": why} for d in datasets]
    trusted = (
        current.get("datasetName") == TITLE.format(experiment_id=experiment_id)
        and _meta(current, "experiment_id") == experiment_id
        and current.get("createdBy")
        and current.get("sourceFolder")
    )
    if not trusted:
        why = "the catalog's dataset lacks DAMNIT's marks: nothing deleted"
        return [{**d, "action": "keep", "why": why} for d in datasets]
    rows = []
    for d in datasets:
        why = keep_reason(d, current, experiment_id, now=now, min_age=min_age)
        if why is None:
            rows.append({**d, "action": "delete", "why": "replicate"})
        else:
            rows.append({**d, "action": "keep", "why": why})
    return rows


def _summarise(experiment_id: str, rows: list[dict[str, Any]]) -> None:
    doomed = sum(r["action"] == "delete" for r in rows)
    reasons = Counter(r["why"] for r in rows if r["action"] == "keep")
    kept = "; ".join(f"{n} {why}" for why, n in sorted(reasons.items()))
    current = next((r["pid"] for r in rows if r["why"] == "current"), "none")
    print(
        f"{experiment_id}: {len(rows)} datasets, catalog's {current}; "
        f"keep {kept or 'none'}; {doomed} replicate(s) to delete"
    )


def _delete(
    scicat: SciCat,
    experiment_id: str,
    rows: list[dict[str, Any]],
    min_age: timedelta,
) -> tuple[int, bool]:
    """Delete the planned replicates, each re-checked on a fresh copy first.

    Returns (failures, stopped on 401/403).
    """
    current_row = next((r for r in rows if r["why"] == "current"), None)
    current = scicat.get(current_row["pid"]) if current_row else None
    failed = 0
    for row in rows:
        if row["action"] != "delete":
            continue
        fresh = scicat.get(row["pid"])
        if fresh is None:
            row["result"] = "already gone"
            continue
        why = (
            keep_reason(
                fresh, current, experiment_id, now=datetime.now(UTC), min_age=min_age
            )
            if current
            else "the catalog's dataset is gone"
        )
        if why is not None:
            row["result"] = f"kept: changed since the plan ({why})"
            print(f"  {row['pid']}: {row['result']}")
            continue
        status = scicat.delete(row["pid"])
        row["result"] = f"HTTP {status}"
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
    parser.add_argument("--apply", action="store_true", help="delete the replicates")
    parser.add_argument(
        "--expect",
        type=int,
        help="with --apply: the replicate count the look-only run printed",
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

    min_age = timedelta(hours=args.min_age_hours)
    plans: list[tuple[str, list[dict[str, Any]]]] = []
    for experiment_id, current in campaigns:
        try:
            datasets = scicat.datasets_named(TITLE.format(experiment_id=experiment_id))
        except httpx.HTTPError as exc:
            print(f"{experiment_id}: SciCat query failed: {exc}", file=sys.stderr)
            return 2
        rows = plan(datasets, current, experiment_id, min_age=min_age)
        _summarise(experiment_id, rows)
        plans.append((experiment_id, rows))

    total = sum(r["action"] == "delete" for _, rows in plans for r in rows)
    if not args.apply:
        _write_report(args.report, plans)
        print(
            f"{total} replicate(s) would be deleted. To delete them, run again "
            f"with --apply --expect {total}."
        )
        return 0
    if args.expect != total:
        _write_report(args.report, plans)
        print(
            f"Nothing deleted: --expect {args.expect} but {total} replicate(s) "
            "are planned now. Read the summary, then pass the number it shows.",
            file=sys.stderr,
        )
        return 2

    failed = 0
    for experiment_id, rows in plans:
        failed_here, stopped = _delete(scicat, experiment_id, rows, min_age)
        failed += failed_here
        if stopped:
            break
    _write_report(args.report, plans)
    deleted = sum(
        r.get("result", "").startswith("HTTP 2") for _, rows in plans for r in rows
    )
    print(f"Deleted {deleted} of {total} planned replicate(s).")
    return 1 if failed else 0


def _write_report(
    path: Path | None, plans: list[tuple[str, list[dict[str, Any]]]]
) -> None:
    if path is None:
        return
    rows = [{"experiment_id": e, **r} for e, rs in plans for r in rs]
    path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"Report: {path}")


if __name__ == "__main__":
    sys.exit(main())
