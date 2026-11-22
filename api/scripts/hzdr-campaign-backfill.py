#!/usr/bin/env python
"""A campaign built from shot-aligner, in one command: where it stands, then the steps.

Plan: hzdr/docs/plans/plan-backfill-store-and-console.md (ruling
R-2026-11-22g). Run from ``api/`` as the user who owns the output (on
fwkt-webapps: tippey)::

    uv run --no-sync python scripts/hzdr-campaign-backfill.py          # report only
    uv run --no-sync python scripts/hzdr-campaign-backfill.py --apply  # run the steps
    uv run --no-sync python scripts/hzdr-campaign-backfill.py --apply \\
        --aligner-build ~/mnt/bigdata/HPLexp/Ions/nexus/<build>     # and compare

It works on the campaigns in ``DW_API_HZDR_BUILDER__ALIGNER_CAMPAIGNS``
(``api/.env``, read through the API's own settings), or ``--campaign``.

**The report** changes nothing. For each date of each campaign it says:
- whether shot-aligner's day index is there, and how old it is;
- how many of its links a reviewer confirmed;
- how many Shotsheet rows are shots;
- whether DAMNIT's stored copy is current;
- from the published catalog, the shots of that day, the files attached and
  the files waiting as suggestions.

It ends with the next step.

**``--apply``** runs, in order, stopping at the first failure:
1. shot-aligner's ``align.py --site <site> index <date> --if-changed`` for
   each date without an index (in ``--shot-aligner``, default
   ``~/shot-aligner``);
2. the rebuild: ``hzdr-rebuild.py``, the auto-trigger's own command;
3. the container worker on each campaign's master, and one more rebuild
   when it asks to have containers linked (exit 3);
4. with ``--aligner-build``, ``hzdr-compare-containers.py`` against
   shot-aligner's containers;
5. the report again.

Reviewing a day and deciding which dates belong to a campaign are a
person's job: the report names them and the script never does them.

To try it where ``api/.env`` has no builder (a laptop, a test), give the
paths: ``--index-dir``, ``--output-root`` and ``--campaign <id>=<date>``.
The rebuild is then the builder itself, in multi-campaign mode, with those
paths.

Exit status: 0 when every step passed, or (report only) when no date
lacks an index; 1 when a date has no index or a step failed; 2 when there is
no shot-aligner index folder or no campaign to work on.
"""

from __future__ import annotations

import argparse
import json
import shlex
import shutil
import subprocess
import sys
import time
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from damnit_api.consumer.campaign_builds import CATALOG_FILENAME, campaign_output_nexus
from damnit_api.metadata.hzdr_aligner import (
    ALIGNER_EVENT_SOURCE,
    CACHE_DIRNAME,
    CACHE_SUFFIX,
    INDEX_SUFFIX,
    _read_json,
    day_fingerprint,
    load_day_data,
    parse_campaign_dates,
)
from damnit_api.metadata.hzdr_containers import RELINK_EXIT
from damnit_api.metadata.hzdr_nexus import parse_datetime, resolve_timezone

SCRIPTS = Path(__file__).resolve().parent
Runner = Callable[[Sequence[str], Path | None], int]


@dataclass
class Config:
    """Everything the script works from (settings, or paths given by hand)."""

    index_dir: Path
    campaigns: dict[str, list[str]]
    output_root: Path | None = None
    output_nexus: Path | None = None
    sources_file: Path | None = None
    cache_dir: Path | None = None
    timezone: str = "Europe/Berlin"
    shot_aligner: Path = field(default_factory=lambda: Path.home() / "shot-aligner")
    site: str = "fwkt-webapps"
    uv: str = "uv"
    from_settings: bool = True

    def catalog(self) -> Path | None:
        if self.sources_file is not None:
            return self.sources_file
        if self.output_root is not None:
            return self.output_root / CATALOG_FILENAME
        if self.output_nexus is not None:
            return self.output_nexus.parent / CATALOG_FILENAME
        return None

    def store(self) -> Path | None:
        if self.cache_dir is not None:
            return self.cache_dir
        catalog = self.catalog()
        return catalog.parent / CACHE_DIRNAME if catalog is not None else None

    def master(self, campaign: str) -> Path | None:
        if self.output_root is not None:
            return campaign_output_nexus(self.output_root, campaign)
        return self.output_nexus


# --- the report ----------------------------------------------------------------


@dataclass
class DateState:
    campaign: str
    date_folder: str
    index_age_h: float | None = None  # None: no index
    stale: bool = False  # the decisions are newer than the index
    links: int = 0
    confirmed: int = 0
    shotsheet_shots: int = 0
    stored: bool = False
    shots: int = 0
    attached: int = 0
    suggested: int = 0

    @property
    def has_index(self) -> bool:
        return self.index_age_h is not None


def _catalog_counts(
    catalog: Path | None, campaign: str, timezone: str
) -> dict[str, Counter[str]]:
    """Per campaign-local date: shots, files attached, files suggested."""
    counts = {"shots": Counter(), "attached": Counter(), "suggested": Counter()}
    data = _read_json(catalog) if catalog is not None and catalog.is_file() else None
    source = next(
        (s for s in (data or {}).get("sources", []) if s.get("key") == campaign), None
    )
    if source is None:
        return counts
    zone = resolve_timezone(timezone)

    def day(value: Any) -> str:
        stamp = parse_datetime(value)
        return stamp.astimezone(zone).strftime("%Y_%m_%d") if stamp else ""

    for shot in source.get("shots", []):
        shot_day = str(shot.get("shot_date") or "").replace("-", "_")
        counts["shots"][shot_day] += 1
        counts["attached"][shot_day] += sum(
            1
            for event in shot.get("events", [])
            if event.get("source") == ALIGNER_EVENT_SOURCE
            and event.get("match_quality") == "aligner_confirmed"
        )
    shot_days = {
        str(shot.get("shot_key")): str(shot.get("shot_date") or "").replace("-", "_")
        for shot in source.get("shots", [])
    }
    for event in source.get("review_events", []):
        if event.get("suggestion_reason") == "shot_aligner":
            # By the suggested shot's day: an instrument clock can be days off.
            suggested = str(event.get("suggested_shot_key") or "")
            counts["suggested"][
                shot_days.get(suggested) or day(event.get("timestamp"))
            ] += 1
    return counts


def date_states(config: Config) -> list[DateState]:
    states: list[DateState] = []
    store = config.store()
    for campaign, dates in sorted(config.campaigns.items()):
        counts = _catalog_counts(config.catalog(), campaign, config.timezone)
        for date_folder in dates:
            state = DateState(campaign, date_folder)
            index = config.index_dir / f"{date_folder}{INDEX_SUFFIX}"
            if index.is_file():
                state.index_age_h = (time.time() - index.stat().st_mtime) / 3600
                ledger = config.index_dir / f"{date_folder}.decisions.json"
                state.stale = (
                    ledger.is_file() and ledger.stat().st_mtime > index.stat().st_mtime
                )
                day = load_day_data(
                    config.index_dir,
                    date_folder,
                    cache_dir=None,
                    timezone=config.timezone,
                )
                if day is not None:
                    claims = {id(c): c for c in day.claims.values()}.values()
                    state.links = sum(1 for c in claims if c.excel_row is not None)
                    state.confirmed = sum(1 for c in claims if c.confirmed)
                    state.shotsheet_shots = len(day.shots)
                if store is not None:
                    stored = (
                        _read_json(store / f"{date_folder}{CACHE_SUFFIX}")
                        if (store / f"{date_folder}{CACHE_SUFFIX}").is_file()
                        else None
                    )
                    state.stored = bool(stored) and stored.get("fingerprint") == (
                        day_fingerprint(config.index_dir, date_folder, config.timezone)
                    )
            state.shots = counts["shots"][date_folder]
            state.attached = counts["attached"][date_folder]
            state.suggested = counts["suggested"][date_folder]
            states.append(state)
    return states


def _age(hours: float | None, stale: bool = False) -> str:
    if hours is None:
        return "MISSING"
    age = f"{hours:.0f} h" if hours < 48 else f"{hours / 24:.0f} d"
    return f"{age}*" if stale else age


def print_report(states: list[DateState], out: Callable[[str], None] = print) -> str:
    """The table, then the next step; returns the next step."""
    out(
        f"{'campaign':<18} {'date':<10} {'index':>7} {'reviewed':>9} {'rows':>5} "
        f"{'stored':>6} {'shots':>5} {'attached':>8} {'waiting':>7}"
    )
    for s in states:
        reviewed = f"{s.confirmed}/{s.links}" if s.has_index else "-"
        out(
            f"{s.campaign:<18} {s.date_folder:<10} {_age(s.index_age_h, s.stale):>7} "
            f"{reviewed:>9} {s.shotsheet_shots if s.has_index else '-':>5} "
            f"{('yes' if s.stored else 'no') if s.has_index else '-':>6} "
            f"{s.shots:>5} {s.attached:>8} {s.suggested:>7}"
        )
    if any(s.stale for s in states):
        out(
            "* decisions newer than the index: confirmations still count; "
            "--apply rewrites the index"
        )
    step = next_step(states)
    out(f"Next: {step}")
    return step


def next_step(states: list[DateState]) -> str:
    missing = [s.date_folder for s in states if not s.has_index]
    if missing:
        return (
            f"build the day index of {', '.join(missing)} (--apply runs shot-aligner's "
            "align.py index for them)"
        )
    unreviewed = [s.date_folder for s in states if s.confirmed < s.links]
    unbuilt = [s.date_folder for s in states if s.shotsheet_shots and not s.shots]
    if unbuilt:
        return (
            f"rebuild: {', '.join(unbuilt)} have no shots in the catalog yet (--apply)"
        )
    if unreviewed:
        return (
            f"review {', '.join(unreviewed)} in shot-aligner; confirmed days attach "
            "at the next build"
        )
    return "nothing waits: every listed day is indexed, reviewed and built"


# --- the steps -----------------------------------------------------------------


def run_command(cmd: Sequence[str], cwd: Path | None) -> int:
    print("$ " + shlex.join(cmd), flush=True)
    return subprocess.run(list(cmd), cwd=cwd, check=False).returncode


def rebuild_command(config: Config) -> list[str]:
    """The auto-trigger's command (settings), else the builder with the given paths."""
    if config.from_settings:
        return [sys.executable, str(SCRIPTS / "hzdr-rebuild.py")]
    cmd = [
        sys.executable,
        str(SCRIPTS / "hzdr-hdf5-builder.py"),
        "--campaign-timezone",
        config.timezone,
        "--aligner-index-dir",
        str(config.index_dir),
    ]
    if config.output_root is not None:
        cmd += ["--output-root", str(config.output_root)]
    if config.cache_dir is not None:
        cmd += ["--aligner-cache-dir", str(config.cache_dir)]
    for campaign, dates in sorted(config.campaigns.items()):
        cmd += [
            arg
            for date in dates
            for arg in ("--aligner-campaign", f"{campaign}={date}")
        ]
    return cmd


def apply(
    config: Config,
    states: list[DateState],
    *,
    aligner_build: Path | None = None,
    run: Runner = run_command,
) -> int:
    """The steps in order; the number of the step that failed, else 0."""
    if not _index_missing(config, states, run):
        return 1
    rebuild = rebuild_command(config)
    if run(rebuild, SCRIPTS.parent) != 0:
        print("FAIL step 2: the rebuild failed")
        return 2
    for campaign in sorted(config.campaigns):
        master = config.master(campaign)
        if master is None:
            continue
        failed = _containers(campaign, master, rebuild, aligner_build, run)
        if failed:
            return failed
    return 0


def _index_missing(config: Config, states: list[DateState], run: Runner) -> bool:
    """Step 1: shot-aligner writes each date's index that is missing or stale.

    ``--if-changed`` keeps an index nothing it is made from has changed.
    """
    for state in states:
        if state.has_index and not state.stale:
            continue
        rc = run(
            [config.uv, "run", "--no-sync", "--no-default-groups",
             "shot_aligner/scripts/align.py", "--site", config.site,
             "index", state.date_folder, "--if-changed"],
            config.shot_aligner,
        )  # fmt: skip
        if rc != 0:
            print(f"FAIL step 1: shot-aligner could not index {state.date_folder}")
            return False
    return True


def _containers(
    campaign: str,
    master: Path,
    rebuild: list[str],
    aligner_build: Path | None,
    run: Runner,
) -> int:
    """Steps 3 and 4 for one campaign: containers, links, the comparison."""
    worker = [sys.executable, str(SCRIPTS / "hzdr-container-worker.py")]
    rc = run([*worker, "--master", str(master)], SCRIPTS.parent)
    # 3 (or 4, with a failure): containers written that the master does not
    # link yet, so one more build links them.
    if rc in (RELINK_EXIT, RELINK_EXIT + 1) and run(rebuild, SCRIPTS.parent) != 0:
        print("FAIL step 3: the rebuild that links the containers failed")
        return 3
    if rc not in (0, RELINK_EXIT):
        print(f"FAIL step 3: the container worker for {campaign} exited {rc}")
        return 3
    if aligner_build is None:
        return 0
    compare = [
        sys.executable,
        str(SCRIPTS / "hzdr-compare-containers.py"),
        "--damnit",
        str(master.parent),
        "--aligner",
        str(aligner_build),
    ]
    if run(compare, SCRIPTS.parent) != 0:
        print(f"FAIL step 4: {campaign}'s containers differ from shot-aligner's")
        return 4
    return 0


# --- settings and main ---------------------------------------------------------


def config_from(args: argparse.Namespace) -> Config | None:
    campaigns = parse_campaign_dates(args.campaign_date)
    if args.index_dir is not None:
        return Config(
            index_dir=args.index_dir,
            campaigns=campaigns,
            output_root=args.output_root,
            cache_dir=args.cache_dir,
            timezone=args.timezone or "Europe/Berlin",
            shot_aligner=args.shot_aligner,
            site=args.site,
            uv=args.uv,
            from_settings=False,
        )
    from damnit_api.shared.settings import settings

    builder = settings.hzdr_builder
    if builder.aligner_index_dir is None:
        return None
    listed = {c: list(d) for c, d in builder.aligner_campaigns.items()}
    if args.only:
        listed = {c: d for c, d in listed.items() if c in args.only}
    for campaign, dates in campaigns.items():
        listed.setdefault(campaign, [])
        listed[campaign] += [d for d in dates if d not in listed[campaign]]
    return Config(
        index_dir=builder.aligner_index_dir,
        campaigns=listed,
        output_root=builder.output_root,
        output_nexus=builder.output_nexus,
        sources_file=settings.metadata.sources_file,
        cache_dir=builder.aligner_cache_dir,
        timezone=args.timezone or builder.campaign_timezone,
        shot_aligner=args.shot_aligner,
        site=args.site,
        uv=args.uv,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(__doc__ or "").split("\n\n")[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--apply", action="store_true", help="run the steps")
    parser.add_argument(
        "--only", action="append", default=[], metavar="CAMPAIGN",
        help="only this listed campaign (repeatable)",
    )  # fmt: skip
    parser.add_argument(
        "--campaign", dest="campaign_date", action="append", default=[],
        metavar="CAMPAIGN=YYYY_MM_DD", help="a date to work on as well (repeatable)",
    )  # fmt: skip
    parser.add_argument(
        "--aligner-build",
        type=Path,
        help="shot-aligner's container folder to compare with",
    )
    parser.add_argument(
        "--shot-aligner", type=Path, default=Path.home() / "shot-aligner"
    )
    parser.add_argument("--site", default="fwkt-webapps", help="shot-aligner's --site")
    parser.add_argument(
        "--uv", default=shutil.which("uv") or str(Path.home() / ".local/bin/uv")
    )
    parser.add_argument("--timezone", help="default: the builder's campaign time zone")
    parser.add_argument("--json", type=Path, help="write the report here too")
    hand = parser.add_argument_group("paths by hand (no builder in api/.env)")
    hand.add_argument("--index-dir", type=Path, help="shot-aligner's index folder")
    hand.add_argument("--output-root", type=Path, help="where the campaigns are built")
    hand.add_argument("--cache-dir", type=Path, help="DAMNIT's stored days")
    args = parser.parse_args(argv)

    config = config_from(args)
    if config is None:
        print(
            "DW_API_HZDR_BUILDER__ALIGNER_INDEX_DIR is not set (and no --index-dir): "
            "there is no shot-aligner folder to work from.",
            file=sys.stderr,
        )
        return 2
    if not config.campaigns:
        print(
            "No campaign to work on: set DW_API_HZDR_BUILDER__ALIGNER_CAMPAIGNS, or "
            "give --campaign <id>=<YYYY_MM_DD>.",
            file=sys.stderr,
        )
        return 2

    states = date_states(config)
    print_report(states)
    if args.apply:
        failed = apply(config, states, aligner_build=args.aligner_build)
        if failed:
            return 1
        print("\nAfter the steps:")
        states = date_states(config)
        print_report(states)
    if args.json:
        args.json.write_text(
            json.dumps([vars(s) for s in states], indent=2), encoding="utf-8"
        )
    return 1 if any(not s.has_index for s in states) else 0


if __name__ == "__main__":
    sys.exit(main())
