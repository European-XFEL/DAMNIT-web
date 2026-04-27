"""Reproduce the writer-side `database is locked` error against the
production read path in `damnit_api.db`.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path

DEFAULT_DURATION = 30.0
DEFAULT_WRITER_TIMEOUT = 0.0
DEFAULT_READERS = 1
PROPOSAL_LABEL = "__repro__"


# ---------------------------------------------------------------------------
# Writer subprocess
#
# Runs in a separate interpreter so its lock requests go through the kernel
# and contend with the parent's read locks. `PRAGMA user_version` is a
# schema-independent write that requires EXCLUSIVE.

WRITER_SOURCE = r"""
import json
import signal
import sqlite3
import sys
import time

db_path = sys.argv[1]
duration = float(sys.argv[2])
writer_timeout = float(sys.argv[3])

stop = False

def _stop(*_):
    global stop
    stop = True

signal.signal(signal.SIGTERM, _stop)
signal.signal(signal.SIGINT, _stop)

conn = sqlite3.connect(
    db_path, timeout=writer_timeout, isolation_level=None,
)

attempts = 0
successes = 0
lock_errors = 0
other_errors = 0
counter = 0
last_report = time.monotonic()
deadline = time.monotonic() + duration

while not stop and time.monotonic() < deadline:
    attempts += 1
    try:
        conn.execute(f"PRAGMA user_version = {counter}")
        successes += 1
        counter += 1
    except sqlite3.OperationalError as exc:
        if "database is locked" in str(exc):
            lock_errors += 1
        else:
            other_errors += 1
    now = time.monotonic()
    if now - last_report >= 1.0:
        sys.stdout.write(json.dumps({
            "kind": "tick",
            "attempts": attempts,
            "successes": successes,
            "lock_errors": lock_errors,
            "other_errors": other_errors,
        }) + "\n")
        sys.stdout.flush()
        last_report = now
    time.sleep(0.001)

sys.stdout.write(json.dumps({
    "kind": "final",
    "attempts": attempts,
    "successes": successes,
    "lock_errors": lock_errors,
    "other_errors": other_errors,
}) + "\n")
sys.stdout.flush()
"""


# ---------------------------------------------------------------------------
# Reader

async def _single_reader(deadline):
    from damnit_api.db import (
        async_all_tags,
        async_latest_rows,
        async_table,
        async_variable_tags,
        async_variables,
    )

    ops = 0
    lock_errors = 0
    other_errors = 0

    while time.monotonic() < deadline:
        try:
            await async_variables(PROPOSAL_LABEL)
            run_variables = await async_table(
                PROPOSAL_LABEL, name="run_variables"
            )
            await async_latest_rows(
                PROPOSAL_LABEL,
                table=run_variables,
                by="timestamp",
                start_at=0,
            )
            await async_all_tags(PROPOSAL_LABEL)
            await async_variable_tags(PROPOSAL_LABEL)
            ops += 4
        except Exception as exc:
            if "database is locked" in str(exc):
                lock_errors += 1
            else:
                other_errors += 1

    return ops, lock_errors, other_errors


async def reader_loop(duration, readers):
    deadline = time.monotonic() + duration
    results = await asyncio.gather(
        *[_single_reader(deadline) for _ in range(readers)]
    )
    total_ops = total_locks = total_others = 0
    for ops, locks, others in results:
        total_ops += ops
        total_locks += locks
        total_others += others
    return total_ops, total_locks, total_others


# ---------------------------------------------------------------------------
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
    import sqlite3
    with sqlite3.connect(dst) as conn:
        conn.executescript(
            "CREATE TABLE IF NOT EXISTS tags ("
            "id INTEGER PRIMARY KEY, name TEXT);"
            "CREATE TABLE IF NOT EXISTS variable_tags ("
            "variable_name TEXT, tag_id INTEGER);"
        )

    return staging


def patch_path(staging):
    """Point damnit_api.db at the staged copy."""
    import damnit_api.db as db_module
    import damnit_api.utils as utils_module

    staged_path = str(staging)
    db_module.get_damnit_path = lambda *_a, **_kw: staged_path
    db_module.find_proposal = lambda *_a, **_kw: staged_path
    utils_module.find_proposal = lambda *_a, **_kw: staged_path


def parse_args():
    parser = argparse.ArgumentParser(
        description="Reproduce writer-side SQLITE_BUSY against the API read path",
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
        default=DEFAULT_DURATION,
        help=f"Test duration in seconds (default {DEFAULT_DURATION:.0f})",
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
        default=DEFAULT_WRITER_TIMEOUT,
        help=(
            "Writer's sqlite3 busy-retry budget in seconds (default 0)."
            " The DAMNIT backend uses 30."
        ),
    )
    parser.add_argument(
        "--readers",
        type=int,
        default=DEFAULT_READERS,
        help="Number of concurrent reader coroutines (default 1).",
    )
    return parser.parse_args()


def empty_summary():
    return {
        "attempts": 0,
        "successes": 0,
        "lock_errors": 0,
        "other_errors": 0,
    }


def collect_writer(writer):
    summary = empty_summary()
    try:
        stdout, stderr = writer.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        writer.send_signal(signal.SIGTERM)
        stdout, stderr = writer.communicate(timeout=5)

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


def main():
    args = parse_args()

    staging = stage_copy(args.damnit_dir, args.scratch_dir)
    print(f"staged copy: {staging}")
    patch_path(staging)

    writer = None
    writer_summary = empty_summary()
    try:
        if not args.no_writer:
            writer = subprocess.Popen(
                [
                    sys.executable,
                    "-c",
                    WRITER_SOURCE,
                    str(staging / "runs.sqlite"),
                    str(args.duration),
                    str(args.writer_timeout),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

        reader_ops, reader_locks, reader_others = asyncio.run(
            reader_loop(args.duration, args.readers)
        )

        if writer is not None:
            writer_summary = collect_writer(writer)
            writer = None
    finally:
        if writer is not None and writer.poll() is None:
            writer.send_signal(signal.SIGTERM)
            writer.wait(timeout=5)
        if not args.keep:
            shutil.rmtree(staging, ignore_errors=True)

    print()
    print("--------- reproduction summary ---------")
    print(f"duration:        {args.duration:.1f} s")
    print(
        f"reader ops:      {reader_ops}"
        f"  (lock errors: {reader_locks}, other errors: {reader_others})"
    )
    print(
        f"writer attempts: {writer_summary['attempts']}"
        f"  (lock errors: {writer_summary['lock_errors']},"
        f" other errors: {writer_summary['other_errors']})"
    )
    print(f"writer success:  {writer_summary['successes']}")
    print()

    if args.no_writer:
        print("(no writer; sanity check only)")
        return 0
    if writer_summary["lock_errors"] > 0:
        print(
            "REPRODUCED  the production read path on this branch causes"
            " SQLITE_BUSY on the writer."
        )
        return 0
    print(
        "NOT REPRODUCED  raise --duration or check that the writer"
        " subprocess actually ran."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
