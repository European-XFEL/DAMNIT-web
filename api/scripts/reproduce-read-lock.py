"""Reproduce DAMNIT's writer starvation against the production read path in
`damnit_api.runs.sqlite`.

Three readers in one process overlap their reads, so the process never drops
its shared lock on the file and DAMNIT's writer waits out its 30 s timeout,
unless the API serializes the reads. The defaults copy DAMNIT's timeout and
pace.

Reads have to take about a second each, so run it from `api/` against a copy
of a big database in scratch. It reads and writes only its own staged copy:

    uv run --no-sync python scripts/reproduce-read-lock.py \
        --damnit-dir /path/to/copy --scratch-dir /path/to/copy/staging

Check the reader alone in two seconds against the committed mock database:

    uv run --no-sync python scripts/reproduce-read-lock.py \
        --no-writer --duration 2 --scratch-dir /path/to/staging --damnit-dir \
        tests/mock/data/gpfs/exfel/exp/MID/202401/p006996/usr/Shared/amore
"""

import argparse
import asyncio
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
import uuid
from contextlib import closing
from pathlib import Path

DEFAULT_DURATION_S = 60.0
DEFAULT_WRITER_TIMEOUT_S = 30.0
DEFAULT_WRITER_INTERVAL_S = 0.5
DEFAULT_READERS = 3
WRITER_STOP_TIMEOUT_S = 5.0
PROPOSAL_LABEL = "__repro__"


# -----------------------------------------------------------------------------
# Writer subprocess
#
# Runs in a separate interpreter so its lock requests go through the kernel
# and contend with the parent's read locks. `PRAGMA user_version` is a
# schema-independent write that requires EXCLUSIVE.

WRITER_SOURCE = r"""
import json
import select
import sqlite3
import sys
import time

db_path = sys.argv[1]
writer_timeout = float(sys.argv[2])
writer_interval = float(sys.argv[3])

conn = sqlite3.connect(
    db_path, timeout=writer_timeout, isolation_level=None,
)

commits = 0
lock_errors = 0
other_errors = 0
longest_wait = 0.0

while True:
    start = time.perf_counter()
    try:
        conn.execute(f"PRAGMA user_version = {commits}")
        commits += 1
    except sqlite3.OperationalError as exc:
        if "database is locked" in str(exc):
            lock_errors += 1
        else:
            other_errors += 1
    longest_wait = max(longest_wait, time.perf_counter() - start)

    # The parent closes stdin to stop the writer, which also ends this wait.
    if select.select([sys.stdin], [], [], writer_interval)[0]:
        break

sys.stdout.write(json.dumps({
    "kind": "final",
    "commits": commits,
    "lock_errors": lock_errors,
    "other_errors": other_errors,
    "longest_wait": longest_wait,
}) + "\n")
sys.stdout.flush()
"""


# -----------------------------------------------------------------------------
# Reader


async def _single_reader(deadline, newest, counts):
    # The package builds its settings on first import, so this import has to
    # wait until main() has set DW_API_DAMNIT_PATH.
    from damnit_api.runs.sqlite import (
        async_all_tags,
        async_latest_rows,
        async_table,
        async_variable_tags,
        async_variables,
    )

    while time.monotonic() < deadline:
        try:
            await async_variables(PROPOSAL_LABEL)
            run_variables = await async_table(PROPOSAL_LABEL, name="run_variables")
            # Like the live-update tick, ask only for rows newer than the
            # newest: a full scan that returns almost nothing.
            await async_latest_rows(
                PROPOSAL_LABEL,
                table=run_variables,
                by="timestamp",
                start_at=newest,
            )
            await async_all_tags(PROPOSAL_LABEL)
            await async_variable_tags(PROPOSAL_LABEL)
            counts["ops"] += 4
        except Exception as exc:
            if "database is locked" in str(exc):
                counts["lock_errors"] += 1
            else:
                counts["other_errors"] += 1


async def reader_loop(duration, readers, newest):
    deadline = time.monotonic() + duration
    counts = {"ops": 0, "lock_errors": 0, "other_errors": 0}
    await asyncio.gather(*[
        _single_reader(deadline, newest, counts) for _ in range(readers)
    ])

    return counts


# -----------------------------------------------------------------------------
# Orchestration


def stage_copy(damnit_dir, scratch_dir):
    src = damnit_dir / "runs.sqlite"
    if not src.is_file():
        msg = f"--damnit-dir does not contain runs.sqlite: {src}"
        raise SystemExit(msg)

    scratch_dir.mkdir(parents=True, exist_ok=True)
    staging = scratch_dir / f"repro-{uuid.uuid4().hex[:8]}"
    staging.mkdir()
    dst = staging / "runs.sqlite"
    shutil.copyfile(src, dst)

    # Some older sqlites lack tags/variable_tags. Create empty placeholders
    # so both branches exercise the same read path on this scratch copy.
    with sqlite3.connect(dst) as conn:
        conn.executescript(
            "CREATE TABLE IF NOT EXISTS tags ("
            "id INTEGER PRIMARY KEY, name TEXT);"
            "CREATE TABLE IF NOT EXISTS variable_tags ("
            "variable_name TEXT, tag_id INTEGER);"
        )

    return staging


def newest_timestamp(db_path):
    # Read before the writer starts, so no lock can get in the way.
    with closing(sqlite3.connect(db_path)) as conn:
        query = "SELECT max(timestamp) FROM run_variables"
        (newest,) = conn.execute(query).fetchone()

    return newest or 0


def parse_args():
    parser = argparse.ArgumentParser(
        description="Reproduce DAMNIT's writer starvation against the API read path",
    )
    parser.add_argument(
        "--damnit-dir",
        type=Path,
        required=True,
        help="DAMNIT amore folder containing runs.sqlite",
    )
    parser.add_argument(
        "--scratch-dir",
        type=Path,
        required=True,
        help="Parent dir for the per-run staging copy",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=DEFAULT_DURATION_S,
        help=(
            f"Test duration in seconds (default {DEFAULT_DURATION_S:g})."
            " Has to be longer than --writer-timeout."
        ),
    )
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Keep the staging copy on exit instead of deleting it",
    )
    parser.add_argument(
        "--no-writer",
        action="store_true",
        help="Skip the writer subprocess (sanity-check the reader)",
    )
    parser.add_argument(
        "--writer-timeout",
        type=float,
        default=DEFAULT_WRITER_TIMEOUT_S,
        help=(
            "Writer's sqlite3 busy-retry budget in seconds"
            f" (default {DEFAULT_WRITER_TIMEOUT_S:g}, DAMNIT's timeout)."
        ),
    )
    parser.add_argument(
        "--writer-interval",
        type=float,
        default=DEFAULT_WRITER_INTERVAL_S,
        help=(
            "Pause between the writer's commits in seconds"
            f" (default {DEFAULT_WRITER_INTERVAL_S:g}, DAMNIT's pace during"
            " extraction)."
        ),
    )
    parser.add_argument(
        "--readers",
        type=int,
        default=DEFAULT_READERS,
        help=f"Number of concurrent reader coroutines (default {DEFAULT_READERS}).",
    )

    args = parser.parse_args()

    # A writer starves only once a wait reaches its timeout.
    if not args.no_writer and args.duration <= args.writer_timeout:
        parser.error("--duration has to be longer than --writer-timeout")

    return args


def start_writer(db_path, args):
    return subprocess.Popen(
        [
            sys.executable,
            "-c",
            WRITER_SOURCE,
            str(db_path),
            str(args.writer_timeout),
            str(args.writer_interval),
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def empty_summary():
    return {
        "commits": 0,
        "lock_errors": 0,
        "other_errors": 0,
        "longest_wait": 0.0,
    }


def collect_writer(writer):
    """Stop the writer by closing its stdin and return its counts."""
    summary = empty_summary()
    stdout, stderr = writer.communicate(timeout=WRITER_STOP_TIMEOUT_S)

    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("kind") == "final":
            summary = event

    if writer.returncode and stderr.strip():
        sys.stderr.write("writer stderr:\n" + stderr)

    return summary


def print_summary(args, reader, writer):
    print()
    print("--------- reproduction summary ---------")
    print(f"duration:       {args.duration:.1f} s")
    print(
        f"reader ops:     {reader['ops']}"
        f"  (lock errors: {reader['lock_errors']},"
        f" other errors: {reader['other_errors']})"
    )
    if not args.no_writer:
        print(
            f"writer commits: {writer['commits']}"
            f"  (lock errors: {writer['lock_errors']},"
            f" other errors: {writer['other_errors']})"
        )
        print(
            f"longest wait:   {writer['longest_wait']:.2f} s"
            "  (capped by the writer timeout)"
        )
    print()


def print_result(args, writer):
    """Print what the run showed and return the script's exit code.

    Each result's line and its exit code come from one check, so one function
    prints the line and returns the code.
    """
    if args.no_writer:
        print("(no writer; sanity check only)")
        return 0

    if writer["lock_errors"] > 0:
        print(
            "REPRODUCED  the writer hit 'database is locked'"
            f" (lock errors: {writer['lock_errors']},"
            f" longest wait: {writer['longest_wait']:.1f} s)."
        )
        return 0

    print(
        f"NOT REPRODUCED  in {args.duration:.0f} s the writer never hit"
        f" 'database is locked' (commits: {writer['commits']})."
    )

    return 1


def main():
    args = parse_args()

    staging = stage_copy(args.damnit_dir, args.scratch_dir)
    print(f"staged copy: {staging}")
    os.environ["DW_API_DAMNIT_PATH"] = str(staging)
    db_path = staging / "runs.sqlite"

    writer = None
    writer_summary = None
    try:
        newest = newest_timestamp(db_path)
        if not args.no_writer:
            writer = start_writer(db_path, args)

        reader_summary = asyncio.run(reader_loop(args.duration, args.readers, newest))

        if writer is not None:
            writer_summary = collect_writer(writer)
    finally:
        # Stops a writer still running after a timeout or a crash, before its
        # copy is deleted.
        if writer is not None:
            writer.kill()
            writer.wait()
        if not args.keep:
            shutil.rmtree(staging, ignore_errors=True)

    print_summary(args, reader_summary, writer_summary)

    return print_result(args, writer_summary)


if __name__ == "__main__":
    raise SystemExit(main())
