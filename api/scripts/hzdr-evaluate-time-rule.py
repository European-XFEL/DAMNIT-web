"""Score the one-to-one time rule against real shot days from shot-aligner.

    uv run python api/scripts/hzdr-evaluate-time-rule.py \\
        <shot-aligner>/shot_aligner/index/2025_12_03.index.json [more ...] \\
        [--tolerance 30 --tolerance 120 ...] [--timezone Europe/Berlin] \\
        [--json report.json]

Plan: hzdr/docs/plans/plan-time-rule-real-data.md. A shot-aligner day index
holds every acquisition with its instrument's own time, the Shotsheet rows
with their typed times, and each event's link to a row confirmed by a
reviewer. This script turns each acquisition into the event DAMNIT would
receive (no shot number, the raw instrument time, the instrument as its
stream) and each row into a LabFrog shot at its time, runs the builder's
matcher with ``time_match_one_to_one=True`` at each tolerance, and scores
every pair against the reviewer's link:

- ``right``: paired to the row the reviewer confirmed;
- ``wrong``: paired to another row (a silent error);
- ``waiting``: left for a person, counted by ``review_reason``;
- ``auxiliary_paired``: a file that belongs to no shot (alignment, synchro)
  paired anyway (also a silent error).

It reads only the index files given; no share, no network. Exit 0 always
(it measures; it does not gate).
"""

from __future__ import annotations

import argparse
import json
import statistics
from collections import Counter, defaultdict
from datetime import UTC, datetime
from itertools import pairwise
from pathlib import Path
from typing import Any

from damnit_api.metadata.hzdr_nexus import parse_datetime, reconcile_canonical_shots

DEFAULT_TOLERANCES = (30.0, 60.0, 90.0, 120.0, 180.0)
EXPERIMENT = "evaluation"


def _iso_utc(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, UTC).isoformat()


def day_date(index: dict[str, Any]) -> str:
    """The index's day as ISO (``2025_12_03`` -> ``2025-12-03``)."""
    return str(index["date"]).replace("_", "-")


def rows_as_shots(index: dict[str, Any]) -> list[dict[str, Any]]:
    """Every Shotsheet row with a time, as a LabFrog record (E2).

    The row's spreadsheet line is its record id and its number: Counts
    restart in every set, and a number held twice would give two shots one
    ``shot_key``. No authority number: this is the no-number case.
    """
    day = day_date(index)
    shots = []
    for row in index["shotsheet"]["rows"]:
        seconds = row.get("time_seconds")
        if seconds is None:
            continue
        hours, rest = divmod(int(seconds), 3600)
        minutes, secs = divmod(rest, 60)
        shots.append({
            "record_id": str(row["excel_row"]),
            "shot_number": int(row["excel_row"]),
            "shot_date": day,
            "labfrog_date_time": f"{day}T{hours:02d}:{minutes:02d}:{secs:02d}",
            "metadata": {},
        })
    return shots


def _epoch(acquisition: dict[str, Any], timezone: str, clock: str) -> float | None:
    """The instrument's own time (``timestamp``, else the local ``iso``), or
    with ``clock="corrected"`` the aligner's corrected time where it has one."""
    if clock == "corrected" and acquisition.get("corrected") is not None:
        return float(acquisition["corrected"])
    if acquisition.get("timestamp") is not None:
        return float(acquisition["timestamp"])
    stamp = parse_datetime(acquisition.get("iso"), naive_timezone=timezone)
    return stamp.timestamp() if stamp else None


def _watchdog_event(acquisition: dict[str, Any], when: float) -> dict[str, Any]:
    """One acquisition as the watchdog file event DAMNIT receives (E2)."""
    key = str(acquisition["key"])
    return {
        "event_id": key,
        "experiment_id": EXPERIMENT,
        "shot_id": key,
        "source": "DAQ-File-Watchdog",
        "kind": f"daq.{acquisition.get('kind') or 'file'}",
        "timestamp": _iso_utc(when),
        "transport": "kafka",
        "payload_ref": {"path": key},
        "values": None,
        "metadata": {"instrument": {"id": acquisition["instrument"]}},
    }


def acquisitions_as_events(
    index: dict[str, Any],
    timezone: str = "Europe/Berlin",
    *,
    truth_from: str = "confirmed",
    clock: str = "raw",
) -> tuple[list[dict[str, Any]], dict[str, int | None]]:
    """Every acquisition as a watchdog event, and the row each truly belongs to.

    The truth is the reviewer-confirmed link of the acquisition's event
    (E1); an auxiliary acquisition (no shot) maps to ``None``. With
    ``truth_from="matched"`` the aligner's own links count too (a day nobody
    reviewed; reported as such). ``clock="corrected"`` uses the aligner's
    clock-corrected time instead of the instrument's (an upper bound for
    what correcting clocks would give; DAMNIT does not do it).
    """
    events: list[dict[str, Any]] = []
    truth: dict[str, int | None] = {}

    for data in index["sets"].values():
        rows_by_rank = _rows_by_rank(data, truth_from)
        for shot_event in data.get("events", []):
            row = rows_by_rank.get(shot_event["rank"])
            for acquisition in shot_event.get("acquisitions", []):
                when = _epoch(acquisition, timezone, clock)
                if when is None:
                    continue
                events.append(_watchdog_event(acquisition, when))
                truth[str(acquisition["key"])] = row
    for acquisition in index.get("auxiliary", []):
        when = _epoch(acquisition, timezone, clock)
        if when is None:
            continue
        events.append(_watchdog_event(acquisition, when))
        truth[str(acquisition["key"])] = None
    return events, truth


def _rows_by_rank(data: dict[str, Any], truth_from: str) -> dict[int, int]:
    """A set's event rank -> the Shotsheet row its link names (E1)."""
    return {
        link["event_rank"]: link["excel_row"]
        for link in data.get("links", [])
        if link.get("status") == "matched"
        and (truth_from == "matched" or link.get("band") == "confirmed")
    }


def score(
    index: dict[str, Any],
    tolerance: float,
    timezone: str,
    *,
    truth_from: str = "confirmed",
    clock: str = "raw",
) -> dict[str, Any]:
    """Run the matcher at one tolerance and score it against the truth."""
    shots = rows_as_shots(index)
    events, truth = acquisitions_as_events(
        index, timezone, truth_from=truth_from, clock=clock
    )
    canonical, built = reconcile_canonical_shots(
        events,
        experiment_id=EXPERIMENT,
        source_key=EXPERIMENT,
        labfrog_shots=shots,
        match_tolerance_s=tolerance,
        campaign_timezone=timezone,
        time_match_one_to_one=True,
        include_trigger_only=False,
    )
    row_of_shot = {
        shot["shot_key"]: int(shot["labfrog_record_id"])
        for shot in canonical
        if shot.get("labfrog_record_id")
    }
    counts: Counter[str] = Counter()
    reasons: Counter[str] = Counter()
    wrong_by_instrument: Counter[str] = Counter()
    for item in built:
        key = str(item.get("event_id"))
        if key not in truth:
            continue  # the LabFrog record's own event
        correct = truth[key]
        instrument = item["metadata"]["instrument"]["id"]
        paired = item.get("match_quality") == "time_one_to_one"
        if correct is None:
            counts["auxiliary_paired" if paired else "auxiliary_waiting"] += 1
            continue
        if paired:
            if row_of_shot.get(item["shot_key"]) == correct:
                counts["right"] += 1
            else:
                counts["wrong"] += 1
                wrong_by_instrument[instrument] += 1
        else:
            counts["waiting"] += 1
            reasons[str(item.get("review_reason") or item.get("match_status"))] += 1
    shot_files = counts["right"] + counts["wrong"] + counts["waiting"]
    return {
        "tolerance_s": tolerance,
        "shot_files": shot_files,
        "right": counts["right"],
        "wrong": counts["wrong"],
        "waiting": counts["waiting"],
        "auxiliary_paired": counts["auxiliary_paired"],
        "auxiliary_waiting": counts["auxiliary_waiting"],
        "paired_share": round(counts["right"] / shot_files, 3) if shot_files else 0,
        "waiting_reasons": dict(reasons.most_common()),
        "wrong_by_instrument": dict(wrong_by_instrument.most_common()),
    }


def context(
    index: dict[str, Any], timezone: str, *, truth_from: str = "confirmed"
) -> dict[str, Any]:
    """What explains the score: shot spacing and each instrument's clock offset."""
    shots = rows_as_shots(index)
    times = sorted(
        stamp.timestamp()
        for shot in shots
        if (stamp := parse_datetime(shot["labfrog_date_time"], naive_timezone=timezone))
    )
    gaps = [later - earlier for earlier, later in pairwise(times)]
    row_time = {
        int(shot["record_id"]): parse_datetime(
            shot["labfrog_date_time"], naive_timezone=timezone
        )
        for shot in shots
    }
    events, truth = acquisitions_as_events(index, timezone, truth_from=truth_from)
    offsets: dict[str, list[float]] = defaultdict(list)
    for event in events:
        row = truth.get(event["event_id"])
        when = row_time.get(row) if row is not None else None
        stamp = parse_datetime(event["timestamp"])
        if when and stamp:
            offsets[event["metadata"]["instrument"]["id"]].append(
                (stamp - when).total_seconds()
            )
    return {
        "date": day_date(index),
        "campaign": index.get("campaign"),
        "rows": len(shots),
        "acquisitions": len(events),
        "row_spacing_s": {
            "min": min(gaps) if gaps else None,
            "p10": statistics.quantiles(gaps, n=10)[0] if len(gaps) > 1 else None,
            "median": statistics.median(gaps) if gaps else None,
            "under_120": sum(1 for gap in gaps if gap < 120),
            "count": len(gaps),
        },
        "instrument_offset_s": {
            name: {
                "median": statistics.median(values),
                "spread": max(values) - min(values),
            }
            for name, values in sorted(offsets.items())
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument(
        "index", nargs="+", type=Path, help="shot-aligner day index(es)"
    )
    parser.add_argument(
        "--tolerance", type=float, action="append", help="seconds; repeatable"
    )
    parser.add_argument("--timezone", default="Europe/Berlin")
    parser.add_argument(
        "--truth",
        choices=("confirmed", "matched"),
        default="confirmed",
        help="reviewer-confirmed links only (default), or the aligner's own too",
    )
    parser.add_argument(
        "--clock",
        choices=("raw", "corrected"),
        default="raw",
        help="the instrument's time as DAMNIT gets it (default), or the "
        "aligner's corrected time (an upper bound)",
    )
    parser.add_argument("--json", type=Path, help="write the full report here")
    args = parser.parse_args()
    tolerances = args.tolerance or list(DEFAULT_TOLERANCES)

    report = []
    for path in args.index:
        index = json.loads(path.read_text(encoding="utf-8"))
        day = context(index, args.timezone, truth_from=args.truth)
        day["truth"], day["clock"] = args.truth, args.clock
        day["reviewed"] = bool(index.get("statistics", {}).get("decisions"))
        day["scores"] = [
            score(index, tol, args.timezone, truth_from=args.truth, clock=args.clock)
            for tol in tolerances
        ]
        report.append(day)
        spacing = day["row_spacing_s"]
        print(
            f"\n{day['date']} ({day['campaign']}; truth {args.truth}, clock "
            f"{args.clock}, {'reviewed' if day['reviewed'] else 'NOT reviewed'}): "
            f"{day['rows']} rows, "
            f"{day['acquisitions']} acquisitions; row spacing min "
            f"{spacing['min']:.0f} s, median {spacing['median']:.0f} s, "
            f"{spacing['under_120']} of {spacing['count']} under 120 s"
        )
        header = f"{'tol s':>6} {'right':>6} {'wrong':>6} {'wait':>6} {'aux+':>5}"
        print(f"{header}  waiting reasons")
        for row in day["scores"]:
            reasons = ", ".join(f"{k} {v}" for k, v in row["waiting_reasons"].items())
            print(
                f"{row['tolerance_s']:>6.0f} {row['right']:>6} {row['wrong']:>6} "
                f"{row['waiting']:>6} {row['auxiliary_paired']:>5}  {reasons}"
            )
    if args.json:
        args.json.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nwrote {args.json}")


if __name__ == "__main__":
    main()
