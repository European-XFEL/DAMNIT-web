"""Canonical HZDR shot reconciliation and NeXus bridge helpers."""

from __future__ import annotations

import contextlib
import errno
import hashlib
import json
import logging
import os
import pathlib
import re
import shutil
import socket
import sqlite3
import time
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from operator import itemgetter
from typing import TYPE_CHECKING, Any, cast
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import h5py
import numpy as np

from .hzdr_event import (
    EVENT_REQUIRED_FIELDS,
    METADATA_KEY_REGISTRY,
    UNASSIGNED_EXPERIMENT_ID,
    check_values_size,
    lint_metadata_keys,
)

if TYPE_CHECKING:
    from collections.abc import Container, Iterable, Iterator, Mapping
    from pathlib import Path

logger = logging.getLogger(__name__)


class BuilderAlreadyRunningError(RuntimeError):
    """Another hzdr-hdf5-builder invocation already holds the output lock."""


_WIN_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
_WIN_ERROR_INVALID_PARAMETER = 87


def _pid_is_alive_windows(pid: int) -> bool:
    """Windows has no signal-0 probe; os.kill(pid, 0) raises a generic
    OSError for *any* invalid pid, alive or not, so it can't distinguish
    them. OpenProcess + GetLastError can: error 87 (ERROR_INVALID_PARAMETER)
    means no such pid; anything else (e.g. 5, access denied) means it exists
    but we can't query it, so treat that as alive."""
    import ctypes
    import sys

    if sys.platform != "win32":
        return False
    kernel32 = ctypes.windll.kernel32
    handle = kernel32.OpenProcess(_WIN_PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if handle:
        kernel32.CloseHandle(handle)
        return True
    return kernel32.GetLastError() != _WIN_ERROR_INVALID_PARAMETER


def _pid_is_alive(pid: int) -> bool:
    """Best-effort liveness check, used only to reclaim a stale lock file."""
    if pid <= 0:
        return False
    if os.name == "nt":
        return _pid_is_alive_windows(pid)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        # Process exists but is owned by someone else - treat as alive.
        return True
    except OSError:
        # Conservatively treat any other unexpected failure as "alive" so we
        # never steal a lock we can't actually verify is stale.
        return True
    return True


# An empty lock file is one being written (between the O_EXCL create and the
# record write); only one older than this is a crash's leftover.
LOCK_EMPTY_GRACE_S = 5.0
# Bounded retries for a rename refused because the target is open elsewhere
# (Windows: a reader holding the master or a container).
REPLACE_ATTEMPTS = 10
REPLACE_DELAY_S = 0.5


def replace_with_retry(
    source: Path,
    target: Path,
    *,
    attempts: int = REPLACE_ATTEMPTS,
    delay: float = REPLACE_DELAY_S,
) -> None:
    """``source.replace(target)``, retried while the target is held open.

    Atomic on one filesystem on POSIX and Windows; Windows alone refuses it
    with ``PermissionError`` while another process has the target open (a
    container worker reading the master, a viewer). Bounded: the last refusal
    is raised.
    """
    for attempt in range(attempts):
        try:
            source.replace(target)
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(delay)
        else:
            return


def _process_start_token(pid: int) -> str:
    """When ``pid`` started, where the OS says (Linux ``/proc``); else ``""``.

    A PID reused after its holder died, or after a reboot, starts at another
    time, so this tells a recycled PID from the holder.
    """
    try:
        text = pathlib.Path(f"/proc/{pid}/stat").read_text(encoding="ascii")
        fields = text.rsplit(")", 1)[1].split()
    except (OSError, IndexError):
        return ""
    return fields[19] if len(fields) > 19 else ""  # starttime, field 22


def _lock_record() -> str:
    """``host:pid:process-start:nonce``; the nonce makes every acquisition unique."""
    pid = os.getpid()
    nonce = uuid.uuid4().hex[:12]
    return f"{socket.gethostname()}:{pid}:{_process_start_token(pid)}:{nonce}"


def _parse_lock(text: str) -> tuple[str | None, int, str] | None:
    """``(host, pid, start)``; ``host`` None for a legacy bare-PID lock."""
    parts = text.strip().split(":")
    try:
        if len(parts) == 1:
            return None, int(parts[0]), ""
        if len(parts) >= 3:  # host:pid:start, and :nonce since the reclaim fix
            return parts[0], int(parts[1]), parts[2]
    except ValueError:
        return None
    return None


def _judge_lock(
    lock_path: Path, stale_after: float | None
) -> tuple[str | None, str | None]:
    """``(holder, text)``: who holds the lock (None: stale) and what it said.

    ``text`` None means the lock vanished while being looked at.
    """
    try:
        text = lock_path.read_text(encoding="utf-8")
        age = time.time() - lock_path.stat().st_mtime
    except FileNotFoundError:
        return None, None
    except OSError:
        return "a process this host cannot read", ""
    parsed = _parse_lock(text)
    if parsed is None:
        holder = "a process still writing it" if age < LOCK_EMPTY_GRACE_S else None
        return holder, text
    host, pid, start = parsed
    if host is not None and host != socket.gethostname():
        # Another host's PID cannot be checked from here; only age reclaims it.
        if stale_after is not None and age > stale_after:
            return None, text
        return f"pid {pid} on {host}", text
    # On this host the PID decides, never age: a live holder that stalled (a
    # hung read on a mount, one huge container) keeps its lock.
    if not _pid_is_alive(pid):
        return None, text
    if start and _process_start_token(pid) not in {"", start}:
        return None, text  # the PID was reused
    return f"pid {pid}", text


# How long an acquirer waits for another's create/reclaim/release step, which
# takes milliseconds; the guard is never held while a lock is held.
GUARD_TIMEOUT_S = 10.0
# EBADF: Linux emulates flock on NFS as a byte-range lock, which refuses an
# exclusive lock on a read-only descriptor (a guard another user created).
# Treated like no kernel locks: nothing is reclaimed, a free lock is taken.
_GUARD_UNSUPPORTED = {
    getattr(errno, name)
    for name in ("ENOLCK", "EOPNOTSUPP", "ENOTSUP", "ENOSYS", "EINVAL", "EBADF")
    if hasattr(errno, name)
}


def _lock_fd(fd: int, path: Path, timeout: float = GUARD_TIMEOUT_S) -> bool:
    """Take an exclusive kernel lock on ``fd``; False where none is available.

    ``flock`` on POSIX (per open file, so threads exclude each other too, and
    released by the kernel when the holder dies: it never goes stale), one
    byte through ``msvcrt.locking`` on Windows. Waits up to
    ``GUARD_TIMEOUT_S`` for another process's step to finish.
    """
    deadline = time.monotonic() + timeout
    while True:
        try:
            if os.name == "nt":
                import msvcrt

                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)  # type: ignore[attr-defined]
            else:
                import fcntl

                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            pass  # POSIX: another process is in its step
        except OSError as error:
            if error.errno in _GUARD_UNSUPPORTED:
                return False
            # Windows reports a held byte as EACCES/EDEADLK. An SMB/CIFS mount
            # on Linux reports a lock another client or process holds as
            # EACCES too, not EWOULDBLOCK: wait for it like any busy guard.
            busy = {errno.EACCES, errno.EDEADLK} if os.name == "nt" else {errno.EACCES}
            if error.errno not in busy:
                raise
        else:
            return True
        if time.monotonic() > deadline:
            message = f"Lock guard {path} stayed busy for {timeout:.1f} s"
            raise BuilderAlreadyRunningError(message)
        time.sleep(0.002)


def _unlock_fd(fd: int) -> None:
    if os.name == "nt":
        import msvcrt

        os.lseek(fd, 0, os.SEEK_SET)
        msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)  # type: ignore[attr-defined]
    else:
        import fcntl

        fcntl.flock(fd, fcntl.LOCK_UN)


def _open_guard(guard: Path) -> int:
    """Open (creating) the guard, writable by every user; read-only if need be.

    The service user and an operator running the builder by hand share it, so
    a new guard is chmodded 0666 (over the umask; errors ignored); one another
    user created without write access is opened read-only, which ``flock`` and
    ``msvcrt.locking`` (a read handle suffices for ``LockFile``) both accept.
    """
    binary = getattr(os, "O_BINARY", 0)
    try:
        fd = os.open(guard, os.O_CREAT | os.O_EXCL | os.O_RDWR | binary, 0o666)
    except FileExistsError:
        pass
    else:
        with contextlib.suppress(OSError):
            # Shared on purpose: an empty lock-guard file, holding no data.
            os.chmod(guard, 0o666)  # noqa: PTH101, S103
        return fd
    try:
        return os.open(guard, os.O_RDWR | binary)
    except PermissionError:
        return os.open(guard, os.O_RDONLY | binary)


@contextlib.contextmanager
def _guard(
    lock_path: Path, *, timeout: float = GUARD_TIMEOUT_S, warn: bool = True
) -> Iterator[bool]:
    """Serialize every create, reclaim and release of ``lock_path``.

    A kernel lock on the sidecar ``<lock>.guard`` (kept, never removed, so
    its identity never changes), held for the few milliseconds of one step,
    never while the lock itself is held. Yields whether it is guarded: where
    the filesystem has no kernel locks (``ENOLCK``: NFS without lockd) it is
    not, and :func:`_acquire` then reclaims nothing (fails closed), because
    the tombstone check alone does not exclude two reclaimers.

    The guard is per host on a FUSE mount such as sshfs (the kernel emulates
    the lock locally): it serializes every process on this host, which is
    where the worker and the builder run, not processes on two hosts.
    """
    guard = lock_path.with_name(f"{lock_path.name}.guard")
    fd = _open_guard(guard)
    try:
        if not _lock_fd(fd, guard, timeout):
            if warn:
                logger.warning(
                    "No kernel lock on %s; stale locks are not reclaimed automatically",
                    guard,
                )
            yield False
            return
        try:
            yield True
        finally:
            _unlock_fd(fd)
    finally:
        os.close(fd)


def _reclaim(lock_path: Path, judged: str) -> None:
    """Remove the stale lock that said ``judged``, and nothing else.

    Renamed to a unique tombstone first (one atomic step on POSIX and Windows;
    the tombstone name is new, so ``rename`` never overwrites). Only one
    reclaimer's rename can move a given lock; the others find nothing
    (``FileNotFoundError``) and try to create again. If the tombstone does not
    say what was judged, a live lock was moved after the judgment: it is put
    back with ``os.link`` (which never overwrites) and the reclaimer gives up.
    Called only under :func:`_guard`; on its own it narrows the race but does
    not close it (a third process can create while a moved lock is out).
    """
    tombstone = lock_path.with_name(f"{lock_path.name}.{uuid.uuid4().hex}.stale")
    try:
        lock_path.rename(tombstone)
    except FileNotFoundError:
        return  # another reclaimer moved it first
    try:
        moved = tombstone.read_text(encoding="utf-8")
    except OSError:
        moved = None
    if moved == judged:
        tombstone.unlink(missing_ok=True)
        return
    try:
        os.link(tombstone, lock_path)
    except FileExistsError:
        logger.error(
            "Lock %s was replaced while being reclaimed; the moved lock (%r) "
            "could not be put back",
            lock_path,
            moved,
        )
    except OSError:
        if not lock_path.exists():
            tombstone.rename(lock_path)
    tombstone.unlink(missing_ok=True)
    message = f"Builder output is locked by another process: {lock_path}"
    raise BuilderAlreadyRunningError(message)


def _acquire(
    lock_path: Path,
    record: str,
    stale_after: float | None,
    *,
    may_reclaim: bool = True,
) -> None:
    for _ in range(3):
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            pass
        else:
            try:
                os.write(fd, record.encode("utf-8"))
            finally:
                os.close(fd)
            return
        holder, text = _judge_lock(lock_path, stale_after)
        if holder is not None:
            message = (
                f"Builder output is locked by {holder}: {lock_path}. "
                "If that process is no longer running, remove the lock file "
                "and retry."
            )
            raise BuilderAlreadyRunningError(message)
        if text is not None and not may_reclaim:
            message = (
                f"Builder output lock {lock_path} looks stale, but this filesystem "
                "has no kernel locks to reclaim it safely; remove it by hand if "
                "its holder is gone."
            )
            raise BuilderAlreadyRunningError(message)
        if text is not None:
            _reclaim(lock_path, text)  # stale: move it aside, then create again
    message = f"Builder output is locked by another process: {lock_path}"
    raise BuilderAlreadyRunningError(message)


class LockLostError(RuntimeError):
    """A held lock no longer holds this holder's record: it was reclaimed."""


class WriterLock:
    """A held ``single_writer_lock``; ``refresh()`` marks it as still in use."""

    def __init__(self, path: Path, record: str = "") -> None:
        self.path = path
        self.record = record

    @property
    def nonce(self) -> str:
        """This acquisition's unique token (the record's last field)."""
        return self.record.rsplit(":", 1)[-1]

    def refresh(self) -> None:
        """Mark the lock as in use; raise :class:`LockLostError` if it is not ours.

        A holder calls this before each unit of work and before publishing, so
        one whose lock was taken (by age, from another host) stops instead of
        writing beside the new holder.
        """
        try:
            current = self.path.read_text(encoding="utf-8")
        except OSError as error:
            message = f"Lock {self.path} is gone: {error}"
            raise LockLostError(message) from error
        if current != self.record:
            message = f"Lock {self.path} was taken over: it now says {current!r}"
            raise LockLostError(message)
        with contextlib.suppress(OSError):
            os.utime(self.path)


def _release(lock_path: Path, record: str) -> None:
    """Remove the lock if it is still this holder's (an expired one is not)."""
    try:
        current = lock_path.read_text(encoding="utf-8")
    except OSError:
        return
    if current != record:
        logger.warning(
            "Lock %s was reclaimed from this holder; left to %r", lock_path, current
        )
        return
    with contextlib.suppress(OSError):
        lock_path.unlink()


@contextlib.contextmanager
def single_writer_lock(
    output_path: Path,
    *,
    stale_after: float | None = None,
    guard_timeout: float = GUARD_TIMEOUT_S,
) -> Iterator[WriterLock]:
    """Guard one campaign's builder output against a second concurrent run.

    `hzdr-hdf5-builder.py` is invoked manually/by cron with no orchestration
    above it; two invocations for the same --output-nexus would otherwise
    race on the same NeXus/catalog files. This takes an exclusive lock file
    next to `output_path` (atomic create via O_EXCL on both POSIX and Windows)
    holding ``host:pid:process-start:nonce`` and removes it on exit if it is
    still its own. A lock left behind by a crashed/killed process is reclaimed
    automatically: an empty one older than ``LOCK_EMPTY_GRACE_S``, one whose
    PID is dead on this host or was reused (another start time), and, with
    ``stale_after``, one not refreshed (``WriterLock.refresh``) for that many
    seconds, but only when it is another host's (on this host the PID
    decides, so a live holder that stalled keeps it). The builder passes no
    ``stale_after`` and never steals another host's lock.

    Every create, reclaim and release runs under :func:`_guard` (a kernel
    lock, so two reclaimers of one stale lock cannot both win), and a reclaim
    moves the stale file to a tombstone it then checks (:func:`_reclaim`)
    rather than unlinking whatever is at the path. Without kernel locks a
    stale lock is not reclaimed at all: two holders are worse than a lock to
    remove by hand. This is single-writer
    locking only - it does not replace write_json_atomic's protection for
    concurrent *readers*.
    """
    lock_path = output_path.with_name(f"{output_path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    record = _lock_record()
    with _guard(lock_path, timeout=guard_timeout) as guarded:
        _acquire(lock_path, record, stale_after, may_reclaim=guarded)
    try:
        yield WriterLock(lock_path, record)
    finally:
        try:
            with _guard(lock_path, warn=False):
                _release(lock_path, record)
        except (BuilderAlreadyRunningError, OSError):
            _release(lock_path, record)


MATCH_RANK = {
    "unmatched": 0,
    "labfrog_only": 1,
    "nearest_time": 2,
    "shot_number_time_window": 3,
    "exact_day_shot_number_time_window": 4,
    # The authoritative number names exactly one shot, on another day or with
    # no event day: attached on the number alone (plan W6.2), only while the
    # time-based ranks are off, i.e. while numbers are trusted as identity.
    "shot_number": 5,
    "exact_day_shot_number": 6,
    "event_identity": 7,
    "exact_transport_position": 8,
    "exact_kafka_event_id": 9,
}


def write_json_atomic(path: Path, payload: Any) -> None:
    """Write hzdr_sources.json (derived/review/catalog state) atomically.

    JSONL under events/ is the staged source-event log and is only ever
    appended to; this file (and any other catalog/review JSON DAMNIT-web
    writes) is fully rebuilt/rewritten on every update, so a writer crashing
    or being killed mid-write must not leave a half-written file for the next
    reader (e.g. a concurrent GET /metadata/hzdr/sources/{key}/review) to
    trip over. Write to a sibling temp file in the same directory, then
    replace() it over the target - Path.replace (os.replace under the hood)
    is atomic on the same filesystem on both POSIX and Windows, unlike a
    plain write_text().
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        replace_with_retry(temp_path, path)
    except BaseException:
        temp_path.unlink(missing_ok=True)
        raise


REVIEW_LEVELS = ("BASE", "REVIEWED", "VERIFIED")
_REVIEW_LEVEL_RANK = {level: rank for rank, level in enumerate(REVIEW_LEVELS)}


def review_sidecar_path(sources_file: Path) -> Path:
    """Return the operator-decision sidecar path next to sources_file."""
    return sources_file.with_name(sources_file.stem + ".review.jsonl")


def review_sidecar_backup_path(sources_file: Path) -> Path:
    """Return the rolling backup path for the operator-decision sidecar.

    ``append_review_decision`` copies the sidecar here after every successful
    fsync, so there is always a coherent backup one write behind the live file.
    """
    sidecar = review_sidecar_path(sources_file)
    return sidecar.with_name(sidecar.name + ".bak")


def append_review_decision(
    sources_file: Path,
    *,
    source_key: str,
    event_id: str,
    action: str,
    by: str,
    note: str | None = None,
    shot_key: str | None = None,
    candidate_shot_keys: list[str] | None = None,
    review_level: str = "REVIEWED",
) -> None:
    """Append one operator review decision to the durable sidecar JSONL.

    The sidecar (``<sources_file_stem>.review.jsonl``) survives builder
    rebuilds: ``write_sources_catalog`` merges decisions back in at publish
    time so confirm/dismiss actions are not lost when the builder reruns.

    ``review_level`` is one of ``"BASE"`` (matcher output, not stored here),
    ``"REVIEWED"`` (operator action), or ``"VERIFIED"`` (countersigned). The
    highest-rank decision for each ``event_id`` wins when merging.

    ``action`` is one of ``"confirm"`` (with ``shot_key``) or ``"dismiss"``.
    The full event shape (source, kind, timestamp) is not duplicated here;
    only identity and the decision matter for merge. ``candidate_shot_keys``
    is stored so a rebuild can re-validate the shot_key is still a candidate.
    """
    if review_level not in _REVIEW_LEVEL_RANK:
        message = f"review_level must be one of {REVIEW_LEVELS}"
        raise ValueError(message)
    record: dict[str, Any] = {
        "source_key": source_key,
        "event_id": event_id,
        "action": action,
        "review_level": review_level,
        "by": by,
        "at": datetime.now(UTC).isoformat(),
        "note": note,
    }
    if shot_key is not None:
        record["shot_key"] = shot_key
    if candidate_shot_keys is not None:
        record["candidate_shot_keys"] = candidate_shot_keys
    sidecar = review_sidecar_path(sources_file)
    sidecar.parent.mkdir(parents=True, exist_ok=True)
    with sidecar.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")
        fh.flush()
        os.fsync(fh.fileno())
    # Rolling backup — copied after fsync so it is always a coherent snapshot.
    # If the sidecar is lost, recover by renaming this file back to the sidecar
    # path. At most one decision is lost (the one written before the failure).
    shutil.copy2(sidecar, review_sidecar_backup_path(sources_file))


def load_review_decisions(
    sources_file: Path, source_key: str
) -> dict[str, dict[str, Any]]:
    """Load the highest-precedence decision per event_id from the sidecar.

    Returns a mapping of ``event_id`` → decision record. If the same event
    has multiple entries (e.g. REVIEWED then VERIFIED), the one with the
    highest ``review_level`` rank wins; ties go to the last entry (latest in
    time, since entries are appended in order).
    """
    sidecar = review_sidecar_path(sources_file)
    if not sidecar.exists():
        return {}
    decisions: dict[str, dict[str, Any]] = {}
    for lineno, raw in enumerate(sidecar.read_text(encoding="utf-8").splitlines(), 1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            record = json.loads(raw)
        except json.JSONDecodeError as exc:
            msg = f"Corrupt review sidecar {sidecar}, line {lineno}: {exc}"
            raise ValueError(msg) from exc
        if record.get("source_key") != source_key:
            continue
        event_id = record.get("event_id")
        if not event_id:
            continue
        existing = decisions.get(event_id)
        incoming_rank = _REVIEW_LEVEL_RANK.get(record.get("review_level", ""), -1)
        existing_rank = _REVIEW_LEVEL_RANK.get(
            (existing or {}).get("review_level", ""), -1
        )
        if existing is None or incoming_rank >= existing_rank:
            decisions[event_id] = record
    return decisions


# A campaign ruling is the third step of the experiment_id resolution chain
# (see resolve_event_experiments): a reviewer assigns a shot that no LabFrog
# record and no campaign-schedule window claimed to a campaign. It lives in the
# same durable review sidecar as confirm/dismiss decisions, but is keyed by
# shot_number, not event_id, so load_review_decisions() never sees it (it skips
# records without an event_id) and the two mechanisms cannot interfere.
EXPERIMENT_RULING_ACTION = "assign_experiment"


def append_experiment_ruling(
    sources_file: Path,
    *,
    shot_number: int,
    experiment_id: str,
    by: str,
    note: str | None = None,
    review_level: str = "REVIEWED",
) -> None:
    """Append one reviewer ruling assigning a shot number to a campaign.

    Written to the same ``.review.jsonl`` sidecar (with the same fsync and
    rolling-backup discipline) as ``append_review_decision``. The builder reads
    rulings back through ``load_experiment_rulings`` on every rebuild, so a
    ruling routes the shot's unassigned events into ``experiment_id`` from then
    on. It is the one writer, behind ``POST /metadata/hzdr/experiment-rulings``
    (the frontend's Review matches page).
    """
    if review_level not in _REVIEW_LEVEL_RANK:
        message = f"review_level must be one of {REVIEW_LEVELS}"
        raise ValueError(message)
    if not experiment_id or experiment_id == UNASSIGNED_EXPERIMENT_ID:
        message = "a ruling must name a real campaign experiment_id"
        raise ValueError(message)
    record: dict[str, Any] = {
        "action": EXPERIMENT_RULING_ACTION,
        "shot_number": int(shot_number),
        "experiment_id": experiment_id,
        "review_level": review_level,
        "by": by,
        "at": datetime.now(UTC).isoformat(),
        "note": note,
    }
    sidecar = review_sidecar_path(sources_file)
    sidecar.parent.mkdir(parents=True, exist_ok=True)
    with sidecar.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")
        fh.flush()
        os.fsync(fh.fileno())
    shutil.copy2(sidecar, review_sidecar_backup_path(sources_file))


def load_experiment_rulings(sidecars: Iterable[Path]) -> dict[int, str]:
    """Read campaign rulings (shot_number -> experiment_id) from sidecar files.

    Same precedence as ``load_review_decisions``: the highest review level wins
    per shot number, ties go to the latest entry. Missing files are skipped, so
    a build can always pass its own sidecar path. Non-ruling lines are ignored.
    """
    return {
        number: str(record["experiment_id"])
        for number, record in load_experiment_ruling_records(sidecars).items()
    }


def load_experiment_ruling_records(
    sidecars: Iterable[Path],
) -> dict[int, dict[str, Any]]:
    """The winning ruling record per shot number, with who/when/note.

    The same selection as ``load_experiment_rulings`` (which is built on it),
    for the review page to show a ruling that is waiting for a rebuild.
    """
    rulings: dict[int, tuple[int, dict[str, Any]]] = {}
    for sidecar in sidecars:
        if not sidecar.exists():
            continue
        text = sidecar.read_text(encoding="utf-8")
        for lineno, raw in enumerate(text.splitlines(), 1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                record = json.loads(raw)
            except json.JSONDecodeError as exc:
                msg = f"Corrupt review sidecar {sidecar}, line {lineno}: {exc}"
                raise ValueError(msg) from exc
            if record.get("action") != EXPERIMENT_RULING_ACTION:
                continue
            shot_number = _as_optional_int(record.get("shot_number"))
            experiment_id = _as_optional_string(record.get("experiment_id"))
            if shot_number is None or not experiment_id:
                continue
            rank = _REVIEW_LEVEL_RANK.get(record.get("review_level", ""), -1)
            existing = rulings.get(shot_number)
            if existing is None or rank >= existing[0]:
                rulings[shot_number] = (
                    rank,
                    {
                        **record,
                        "shot_number": shot_number,
                        "experiment_id": experiment_id,
                    },
                )
    return {number: record for number, (_, record) in rulings.items()}


def _apply_review_decisions(
    review_events: list[dict[str, Any]],
    shots: list[dict[str, Any]],
    decisions: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Merge durable operator decisions into freshly-built catalog lists.

    Mutates ``shots`` in-place (attaching confirmed events) and returns a
    filtered ``review_events`` list (confirmed events removed, dismissed ones
    flagged). Called by ``write_sources_catalog`` after ``decisions`` is loaded
    from the sidecar, so a builder rebuild restores prior operator actions.
    """
    if not decisions:
        return review_events, shots

    shots_by_key: dict[str, dict[str, Any]] = {}
    for shot in shots:
        key = shot.get("shot_key")
        if key and key not in shots_by_key:
            shots_by_key[key] = shot

    remaining: list[dict[str, Any]] = []
    for event in review_events:
        event_id = event.get("event_id")
        decision = decisions.get(event_id) if event_id is not None else None
        if decision is None:
            remaining.append(event)
            continue

        action = decision.get("action")
        review_level = decision.get("review_level", "REVIEWED")
        by = decision.get("by", "")
        at = decision.get("at", "")
        note = decision.get("note")

        if action == "confirm":
            shot_key = decision.get("shot_key")
            shot = shots_by_key.get(shot_key) if shot_key else None
            if shot is None:
                # Shot may have been renumbered; keep as review event.
                remaining.append(event)
                continue
            attached = {
                k: v
                for k, v in event.items()
                if k not in {"match_status", "experiment_id", "candidate_shot_keys"}
            }
            attached["match_quality"] = "operator_confirmed"
            attached["review_level"] = review_level
            shot.setdefault("events", []).append(attached)
            shot["match_status"] = "matched"
            history = shot.setdefault("metadata", {}).setdefault(
                "match_confirmation_history", []
            )
            if isinstance(history, list):
                history.append({
                    "at": at,
                    "event_id": event_id,
                    "by": by,
                    "note": note or "Confirmed ambiguous match",
                    "review_level": review_level,
                })
        elif action == "dismiss":
            flagged = dict(event)
            flagged["acknowledged"] = True
            flagged["acknowledged_at"] = at
            flagged["acknowledged_by"] = by
            flagged["acknowledged_note"] = note or "Acknowledged with no shot attached"
            flagged["review_level"] = review_level
            remaining.append(flagged)
        else:
            remaining.append(event)

    return remaining, shots


def load_normalized_events(paths: Iterable[Path]) -> list[dict[str, Any]]:
    """Load normalized events from JSON or JSONL files.

    Raises ValueError (not a raw JSONDecodeError) naming the file and, for
    JSONL, the 1-based line number, so a corrupt staged event - e.g. a
    truncated line from a crash mid-append, or a hand-edited fixture typo -
    is something a developer can locate immediately instead of a bare
    "Expecting value: line 1 column 1" with no file context.
    """
    events: list[dict[str, Any]] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        records = (
            _load_jsonl_records(path, text)
            if path.suffix.lower() == ".jsonl"
            else [_load_json_record(path, text)]
        )
        for record in records:
            missing = sorted(EVENT_REQUIRED_FIELDS - set(record))
            if missing:
                message = f"{path} is missing normalized event field(s): " + ", ".join(
                    missing
                )
                raise ValueError(message)
            if not isinstance(record["payload_ref"], dict):
                message = f"{path} payload_ref must be an object"
                raise ValueError(message)
            values_error = check_values_size(record.get("values"))
            if values_error:
                message = f"{path}: {values_error}"
                raise ValueError(message)
            events.append(record)
    return events


def _load_jsonl_records(path: Path, text: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError as exc:
            message = f"{path}:{line_number} is not valid JSON: {exc.msg}"
            raise ValueError(message) from exc
    return records


def _load_json_record(path: Path, text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        message = f"{path} is not valid JSON: {exc.msg}"
        raise ValueError(message) from exc


def read_labfrog_nexus_shots(path: Path) -> list[dict[str, Any]]:
    """Read the compact LabFrog shot table without interpreting rich metadata."""
    with h5py.File(path, "r") as handle:
        if "/entry/shots" not in handle:
            message = f"{path} does not contain /entry/shots"
            raise ValueError(message)
        group = cast("h5py.Group", handle["/entry/shots"])
        count = _table_length(group)
        fields = {
            name: _read_hdf5_column(group, name, count)
            for name in (
                "record_id",
                "shot_number",
                "authority_shot_number",
                "shot_date",
                "date_time",
                "campaign",
                "has_newer_version",
                "shot_status",
            )
        }

    shots: list[dict[str, Any]] = []
    for index in range(count):
        has_newer_version = _as_bool(fields["has_newer_version"][index])
        labfrog_time = _as_optional_string(fields["date_time"][index])
        shot_date = _as_optional_string(fields["shot_date"][index])
        if not shot_date:
            shot_date = source_date(labfrog_time)
        shot_record = {
            "record_index": index,
            "record_id": _as_optional_string(fields["record_id"][index]),
            "shot_number": _as_optional_int(fields["shot_number"][index]),
            "shot_date": shot_date,
            "labfrog_date_time": labfrog_time,
            "campaign": _as_optional_string(fields["campaign"][index]),
            "metadata": {
                "labfrog_record_index": index,
                "has_newer_version": has_newer_version,
                **(
                    {"shot_status": status}
                    if (status := _as_optional_string(fields["shot_status"][index]))
                    else {}
                ),
            },
        }
        # Older compact exports have no authority column; their typed number
        # must not become a trigger-matching number by default. A newer one
        # writes -1 (its missing_value) where a record has no authority
        # number; authority numbers are whole numbers >= 0.
        authority_number = _as_optional_int(fields["authority_shot_number"][index])
        if authority_number is not None and authority_number >= 0:
            shot_record["authority_shot_number"] = authority_number
        shots.append(shot_record)
    return shots


# hzdr/docs/target-ontology.md §2.3: the wiki `type` vocabulary doesn't match the
# §3 enum one-to-one. Map the obvious ones; anything else falls back to
# "other" and the original wiki text is kept in properties.wiki_type.
_WIKI_TARGET_TYPE_MAP = {
    "foil": "foil",
    "gas_jet": "gas_jet",
    "cluster": "cluster",
    "liquid": "liquid",
    "structured": "structured",
    "other": "other",
    "wafer": "foil",
    "solution": "liquid",
}


def _map_wiki_target_type(raw_type: str) -> str:
    return _WIKI_TARGET_TYPE_MAP.get(raw_type.casefold(), "other")


def _apply_labfrog_target_provenance(
    target: dict[str, Any],
    record: dict[str, Any],
    *,
    wiki_page: str | None,
    wiki_ref: str | None,
    source: str | None,
    wiki_type: str | None,
) -> bool:
    """Set ``target["provenance"]``/``["type"]``; return True for wiki targets."""
    if _is_manual_labfrog_target(record):
        target["type"] = _map_wiki_target_type(wiki_type) if wiki_type else "other"
        target["provenance"] = "manual"
        return False

    is_wiki = bool(wiki_page or wiki_ref or (source and source.casefold() == "wiki"))
    if is_wiki:
        target["provenance"] = "wiki"
        if wiki_type:
            target["type"] = _map_wiki_target_type(wiki_type)
    return is_wiki


def _labfrog_target_metadata(record: dict[str, Any]) -> dict[str, Any]:
    """Build canonical ``metadata.target`` from LabFrog SQLite target columns.

    Wiki-catalog extras exported by labfrog-sqlite-tools map per
    hzdr/docs/target-ontology.md: ``target_wiki_page``/``target_wiki_ref`` become the
    typed ``wiki_page``/``wiki_ref`` keys, ``target_type`` maps through the wiki
    vocabulary to the ontology ``type`` enum (original kept in
    ``properties.wiki_type``), and ``target_provider``/``target_status``/
    ``target_amount``/``target_production_date``/``target_origin`` (from the
    wiki's IonenTargetOrigin columns) land in the ``properties`` bag as
    ``supplier``/``status``/``amount``/``production_date``/``origin``.
    """
    target_display = _as_optional_string(record.get("target"))
    target_name = _as_optional_string(record.get("target_name")) or target_display
    material = _as_optional_string(record.get("target_material"))
    notes = _as_optional_string(record.get("target_notes"))
    source = _as_optional_string(record.get("target_source"))
    wiki_page = _as_optional_string(record.get("target_wiki_page"))
    wiki_ref = _as_optional_string(record.get("target_wiki_ref"))
    wiki_type = _as_optional_string(record.get("target_type"))
    gas_species = _as_optional_string(record.get("target_gas_species"))
    gas_pressure = _canonical_target_gas_pressure_bar(
        record.get("target_gas_pressure_value"),
        record.get("target_gas_pressure_unit"),
    )
    thickness = _canonical_target_thickness_nm(
        record.get("target_thickness_value"), record.get("target_thickness_unit")
    )

    target: dict[str, Any] = {}
    if target_name:
        target["name"] = target_name
    is_wiki = _apply_labfrog_target_provenance(
        target,
        record,
        wiki_page=wiki_page,
        wiki_ref=wiki_ref,
        source=source,
        wiki_type=wiki_type,
    )
    if material:
        target["material"] = material
    if thickness is not None:
        target["thickness"] = thickness
    if notes:
        target["notes"] = notes
    if gas_species:
        target["gas_species"] = gas_species
    if gas_pressure is not None:
        target["gas_pressure"] = gas_pressure
    if wiki_page:
        target["wiki_page"] = wiki_page
    if wiki_ref:
        target["wiki_ref"] = wiki_ref

    properties = _labfrog_target_properties(
        record, thickness=thickness, wiki_type=wiki_type if is_wiki else None
    )
    if target and properties:
        target["properties"] = properties

    return target


def _labfrog_target_properties(
    record: dict[str, Any], *, thickness: float | None, wiki_type: str | None
) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    for column, property_key in (
        ("target_provider", "supplier"),
        ("target_status", "status"),
        ("target_amount", "amount"),
        ("target_production_date", "production_date"),
        ("target_origin", "origin"),
    ):
        value = _as_optional_string(record.get(column))
        if value:
            properties[property_key] = value

    if wiki_type:
        properties["wiki_type"] = wiki_type

    if thickness is None:
        source_thickness = _source_target_thickness(record)
        if source_thickness:
            properties["source_thickness"] = source_thickness
    return properties


def _is_manual_labfrog_target(record: dict[str, Any]) -> bool:
    source = (_as_optional_string(record.get("target_source")) or "").casefold()
    if source == "wiki":
        return False
    if _as_optional_string(record.get("target_wiki_page")) or _as_optional_string(
        record.get("target_wiki_ref")
    ):
        return False
    if source in {"manual", "operator"}:
        return True
    target_display = (_as_optional_string(record.get("target")) or "").casefold()
    target_name = (_as_optional_string(record.get("target_name")) or "").casefold()
    if target_display.startswith("other") or target_name == "other":
        return True
    return any(
        _as_optional_string(record.get(key))
        for key in ("target_material", "target_notes")
    ) or record.get("target_thickness_value") not in (None, "")


def _canonical_target_thickness_nm(value: Any, unit: Any) -> float | None:
    parsed = _as_optional_float(value)
    if parsed is None:
        return None
    unit_text = _normalised_length_unit(unit)
    if unit_text in {None, "", "nm", "nanometer", "nanometers"}:
        return parsed
    if unit_text in {"um", "\u03bcm", "micrometer", "micrometers"}:
        return parsed * 1_000.0
    if unit_text in {"mm", "millimeter", "millimeters"}:
        return parsed * 1_000_000.0
    if unit_text in {"m", "meter", "meters"}:
        return parsed * 1_000_000_000.0
    return None


def _canonical_target_gas_pressure_bar(value: Any, unit: Any) -> float | None:
    parsed = _as_optional_float(value)
    if parsed is None:
        return None
    unit_text = (_as_optional_string(unit) or "bar").strip().casefold()
    if unit_text != "bar":
        return None
    return parsed


def _normalised_length_unit(unit: Any) -> str | None:
    unit_text = _as_optional_string(unit)
    if unit_text is None:
        return None
    return (
        unit_text
        .strip()
        .replace("\u00c2\u00b5", "\u03bc")
        .replace("\u00b5", "\u03bc")
        .casefold()
    )


def _source_target_thickness(record: dict[str, Any]) -> str | None:
    value = _as_optional_string(record.get("target_thickness_value"))
    unit = _as_optional_string(record.get("target_thickness_unit"))
    if value and unit:
        return f"{value} {unit}"
    return value or unit


def _read_labfrog_shot_variables(
    connection: sqlite3.Connection,
) -> dict[str, dict[str, dict[str, Any]]]:
    """Per-shot values from LabFrog's ``shot_variables`` table, by ``mongo_id``.

    Each shot maps ``variable_name`` to ``{"value", "unit", "kind"}`` (unit and
    kind only when recorded). Returns ``{}`` for an export without the table.
    """
    columns = {
        str(row[1]) for row in connection.execute("PRAGMA table_info(shot_variables)")
    }
    if not {"shot_id", "variable_name", "value"} <= columns:
        return {}
    optional = [name for name in ("unit", "variable_kind") if name in columns]
    selected = ["shot_id", "variable_name", "value", *optional]
    by_shot: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for row in connection.execute(
        f"SELECT {', '.join(selected)} FROM shot_variables "  # noqa: S608
        "ORDER BY shot_id, variable_name"
    ):
        entry = dict(zip(selected, row, strict=True))
        shot_id = _as_optional_string(entry["shot_id"])
        name = _as_optional_string(entry["variable_name"])
        if shot_id is None or name is None or entry["value"] in (None, ""):
            continue
        variable: dict[str, Any] = {"value": entry["value"]}
        unit = _as_optional_string(entry.get("unit"))
        if unit:
            variable["unit"] = unit
        kind = _as_optional_string(entry.get("variable_kind"))
        if kind:
            variable["kind"] = kind
        by_shot[shot_id][name] = variable
    return dict(by_shot)


def _read_labfrog_authority_claims(
    connection: sqlite3.Connection,
) -> dict[str, list[int]]:
    """Every shot-authority number each record claimed, by ``mongo_id``.

    From the ``authority_shots`` table of labfrog-sqlite-tools schema v14: one
    row per shot a current record claimed, so a set that claimed several
    keeps each number, while its v13 ``authority_shot_number`` is NULL. A row
    without a whole number is skipped. Returns ``{}`` for an export without
    the table.
    """
    columns = {
        str(row[1]) for row in connection.execute("PRAGMA table_info(authority_shots)")
    }
    if not {"mongo_id", "shot_index", "shot_number"} <= columns:
        return {}
    claims: dict[str, list[int]] = defaultdict(list)
    for mongo_id, number in connection.execute(
        "SELECT mongo_id, shot_number FROM authority_shots "
        "ORDER BY mongo_id, shot_index"
    ):
        record_id = _as_optional_string(mongo_id)
        value = _as_optional_int(number)
        if record_id is not None and value is not None:
            claims[record_id].append(value)
    return dict(claims)


def _labfrog_authority_fields(
    record: Mapping[str, Any], claims_by_shot: Mapping[str, list[int]]
) -> dict[str, Any]:
    """The shot authority's numbers of one export row, as shot-record fields."""
    fields: dict[str, Any] = {}
    # The shot authority's number (schema v13), the only number an
    # authoritative trigger is matched or resolved on (ruling R3). Absent for
    # a typed row and on every row of an older export - never defaulted to
    # the typed shot_number.
    authority_number = _as_optional_int(record.get("authority_shot_number"))
    if authority_number is not None:
        fields["authority_shot_number"] = authority_number
    # Schema v14: every number the record claimed, a set's several too. Used
    # only to resolve an unassigned event's campaign, never to match an event
    # to this row (a set row is not one shot).
    claimed = claims_by_shot.get(_as_optional_string(record.get("mongo_id")) or "")
    if claimed:
        fields["authority_shot_numbers"] = list(claimed)
    return fields


def read_labfrog_sqlite_shots(path: Path) -> list[dict[str, Any]]:
    """Read LabFrog's canonical SQLite shots table using its stable columns."""
    # Guard against a partial write: labfrog-sqlite-tools writes to a .tmp file
    # and atomically renames it, so a zero-size or very-small file means the
    # rename never happened (either the export is still in flight or a previous
    # run crashed before the rename). Fail fast with an actionable message rather
    # than opening what may be an empty or corrupt database.
    stat = path.stat()
    if stat.st_size < 1024:
        message = (
            f"{path} is {stat.st_size} bytes — too small to be a complete "
            "LabFrog curated export. The export may still be running, or a "
            "previous run may have crashed before the atomic rename completed."
        )
        raise ValueError(message)
    # closing(): sqlite3's own context manager only ends the transaction, and a
    # multi-campaign build reads several exports LabFrog may be replacing.
    with contextlib.closing(sqlite3.connect(path)) as connection:
        columns = {
            str(row[1]) for row in connection.execute("PRAGMA table_info(shots)")
        }
        if not columns:
            message = f"{path} does not contain a shots table"
            raise ValueError(message)
        requested = [
            name
            for name in (
                "mongo_id",
                "shot_number",
                "shot_day",
                "date_time",
                "date_time_utc",
                "date_time_timezone",
                "campaign",
                "experiment_id",
                "target",
                "target_name",
                "target_material",
                "target_thickness_value",
                "target_thickness_unit",
                "target_notes",
                "target_source",
                "target_wiki_page",
                "target_wiki_ref",
                "target_status",
                "target_provider",
                "target_amount",
                "target_type",
                "target_production_date",
                "target_origin",
                "target_gas_species",
                "target_gas_pressure_value",
                "target_gas_pressure_unit",
                "target_series",
                "target_series_id",
                "target_series_label",
                "target_series_index",
                "target_series_sample",
                "target_series_planned_count",
                "target_series_actual_count",
                "target_series_notes",
                "target_series_status",
                "status",
                "shot_status",
                "version",
                "kafka_topic",
                "kafka_partition",
                "kafka_offset",
                "kafka_key",
                "kafka_value",
                "kafka_event_id",
                "kafka_experiment_id",
                "kafka_shot_number",
                "kafka_timestamp",
                "kafka_source",
                "damnit_shot_key",
                "damnit_match_quality",
                # Schema v12 (labfrog-sqlite-tools v0.2.3); older exports
                # lack the column and still load.
                "local_count",
                # Schema v13: the shot authority's number from the record's
                # shot_details claim. An older export has no authority number.
                "authority_shot_number",
                # The shot parameters LabFrog records per row. laser_energy
                # (J) becomes metadata.laser.pulse_energy; the others are
                # kept as-is under their LabFrog names.
                "laser_energy",
                "gvd",
                "tod",
                "tw_delay",
                "comments",
                "mode",
            )
            if name in columns
        ]
        rows = connection.execute(
            f"SELECT {', '.join(requested)} FROM shots "  # noqa: S608
            "ORDER BY CASE WHEN date_time IS NULL THEN 1 ELSE 0 END, "
            "date_time, shot_number, mongo_id"
        ).fetchall()
        variables_by_shot = _read_labfrog_shot_variables(connection)
        claims_by_shot = _read_labfrog_authority_claims(connection)

    shots: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        record = dict(zip(requested, row, strict=True))
        local_time = _as_optional_string(record.get("date_time"))
        labfrog_time = _as_optional_string(record.get("date_time_utc")) or local_time
        # experiment_id is promoted to the top-level shot field (the single
        # location select_experiment_id reads), so it is excluded here rather
        # than left duplicated in metadata. local_count likewise rides the
        # record itself, as the /entry/shots/labfrog_local_count column.
        metadata = {
            key: value
            for key, value in record.items()
            if key
            not in {
                "mongo_id",
                "shot_number",
                "date_time",
                "date_time_utc",
                "campaign",
                "experiment_id",
                "target",
                "target_name",
                "target_material",
                "target_thickness_value",
                "target_thickness_unit",
                "target_notes",
                "target_source",
                "target_wiki_page",
                "target_wiki_ref",
                "target_status",
                "target_provider",
                "target_amount",
                "target_type",
                "target_production_date",
                "target_origin",
                "target_gas_species",
                "target_gas_pressure_value",
                "target_gas_pressure_unit",
                "local_count",
                "authority_shot_number",
                "laser_energy",
            }
            and value is not None
            and value != ""
        }
        target_metadata = _labfrog_target_metadata(record)
        if target_metadata:
            metadata["target"] = target_metadata
        # Registry key laser.pulse_energy is in J, the unit LabFrog records.
        laser_energy = _as_optional_float(record.get("laser_energy"))
        if laser_energy is not None:
            metadata["laser"] = {"pulse_energy": laser_energy}
        variables = variables_by_shot.get(
            _as_optional_string(record.get("mongo_id")) or ""
        )
        if variables:
            metadata["labfrog_variables"] = variables

        shot_record = {
            "record_index": index,
            "record_id": _as_optional_string(record.get("mongo_id")),
            "shot_number": _as_optional_int(record.get("shot_number")),
            "shot_date": source_date(local_time) or source_date(labfrog_time),
            "labfrog_date_time": labfrog_time,
            "campaign": _as_optional_string(record.get("campaign")),
            "metadata": metadata,
        }
        experiment_id = _as_optional_string(record.get("experiment_id"))
        if experiment_id is not None:
            shot_record["experiment_id"] = experiment_id
        # The experimenters' Count (LabFrog local-counter reset): a user aid,
        # never the governed shot_number. Absent when the export has no
        # column (pre-v12) or no active reset covers the shot.
        local_count = _as_optional_int(record.get("local_count"))
        if local_count is not None:
            shot_record["local_count"] = local_count
        shot_record.update(_labfrog_authority_fields(record, claims_by_shot))
        shots.append(shot_record)
    _mark_superseded_labfrog_rows(shots)
    return shots


def _row_version(row: dict[str, Any]) -> int | None:
    """Parse a curated LabFrog row `version`, or None when absent/unparseable."""
    raw = row.get("metadata", {}).get("version")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _warn_if_active_row_not_latest(
    active_rows: list[dict[str, Any]], rows: list[dict[str, Any]]
) -> None:
    """Warn when the curated export has conflicting `active` rows.

    The supersede decision is keyed on `status == active` (an accepted pilot
    simplification). Multiple active rows require source-owner review even when
    they carry the same version. When a `version` is present we can also detect
    the malformed case where one active row is older than the latest row. Both
    conditions are surfaced without changing the status-authoritative decision.
    """
    known_versions = [v for v in (_row_version(r) for r in rows) if v is not None]
    active_versions = [_row_version(r) for r in active_rows]
    max_version = max(known_versions) if known_versions else None
    if len(active_rows) > 1:
        sample = active_rows[0]
        logger.warning(
            "Curated LabFrog export marks multiple rows active "
            "(campaign=%s shot_date=%s shot_number=%s active_count=%s "
            "active_versions=%s max_version=%s); all remain current because "
            "status is authoritative, but source-owner review is required",
            sample.get("campaign"),
            sample.get("shot_date"),
            sample.get("shot_number"),
            len(active_rows),
            active_versions,
            max_version,
        )
        return
    if max_version is None:
        return
    if any(v is not None and v < max_version for v in active_versions):
        sample = active_rows[0]
        logger.warning(
            "Curated LabFrog export marks a non-latest row active "
            "(campaign=%s shot_date=%s shot_number=%s active_version=%s "
            "max_version=%s); has_newer_version follows status, not version",
            sample.get("campaign"),
            sample.get("shot_date"),
            sample.get("shot_number"),
            active_versions,
            max_version,
        )


def _mark_superseded_labfrog_rows(shots: list[dict[str, Any]]) -> None:
    """Prefer current LabFrog rows when curated exports include history rows."""
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for shot in shots:
        grouped[
            shot.get("campaign"),
            shot.get("shot_date"),
            shot.get("shot_number"),
        ].append(shot)

    for rows in grouped.values():
        if len(rows) < 2:
            continue
        active_rows = [
            row
            for row in rows
            if str(row.get("metadata", {}).get("status", "")).casefold() == "active"
        ]
        if not active_rows:
            continue
        _warn_if_active_row_not_latest(active_rows, rows)
        active_ids = {id(row) for row in active_rows}
        for row in rows:
            if id(row) in active_ids:
                row.setdefault("metadata", {}).setdefault("has_newer_version", False)
            else:
                row.setdefault("metadata", {})["has_newer_version"] = True


def normalize_labfrog_mongo_shots(
    records: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Map LabFrog Mongo documents to the same reconciliation input shape."""
    shots: list[dict[str, Any]] = []
    for index, record in enumerate(records):
        shot_number = record.get(
            "shot_number", record.get("shot", record.get("shotNumber"))
        )
        if shot_number is None:
            continue
        labfrog_time = record.get(
            "date_time", record.get("timestamp", record.get("fired_at"))
        )
        if isinstance(labfrog_time, datetime):
            labfrog_time = labfrog_time.isoformat()
        record_id = record.get("_id", record.get("record_id"))
        authority_number = _claimed_authority_number(record.get("shot_details"))
        if authority_number is not None:
            authority = {"authority_shot_number": authority_number}
        else:
            authority = {}
        shots.append({
            **authority,
            "record_index": index,
            "record_id": str(record_id) if record_id is not None else None,
            "shot_number": int(shot_number),
            "shot_date": source_date(labfrog_time),
            "labfrog_date_time": _as_optional_string(labfrog_time),
            "campaign": _as_optional_string(
                record.get("Campaign", record.get("campaign"))
            ),
            "metadata": {
                key: _json_safe(value)
                for key, value in record.items()
                if key
                not in {
                    "_id",
                    "record_id",
                    "shot_number",
                    "shot",
                    "shotNumber",
                    "date_time",
                    "timestamp",
                    "fired_at",
                    "Campaign",
                    "campaign",
                }
            },
        })
    return shots


def _claimed_authority_number(shot_details: Any) -> int | None:
    """The authority's number of a Mongo record that claimed exactly one shot.

    The same rule labfrog-sqlite-tools applies for ``shots.authority_shot_number``
    (schema v13): only a ``labfrog-shot-details-v1`` block with one shot and a
    whole-number ``shot_number``; a set that claimed several, a typed record,
    or anything else has none.
    """
    if (
        not isinstance(shot_details, dict)
        or shot_details.get("schema_version") != "labfrog-shot-details-v1"
    ):
        return None
    shots = shot_details.get("shots")
    if not isinstance(shots, list) or len(shots) != 1 or not isinstance(shots[0], dict):
        return None
    number = shots[0].get("shot_number")
    if isinstance(number, bool) or not isinstance(number, int) or number < 0:
        return None
    return int(number)


def merge_labfrog_shots(
    *shot_sets: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge LabFrog exports while preserving the first source's row ordering."""
    merged: list[dict[str, Any]] = []
    by_identity: dict[tuple[Any, ...], dict[str, Any]] = {}
    for records in shot_sets:
        for record in records:
            identity = _labfrog_identity(record)
            existing = by_identity.get(identity)
            if existing is None:
                copied = {**record, "metadata": dict(record.get("metadata", {}))}
                by_identity[identity] = copied
                merged.append(copied)
                continue
            for field in (
                "record_id",
                "shot_number",
                "authority_shot_number",
                "authority_shot_numbers",
                "shot_date",
                "labfrog_date_time",
                "campaign",
            ):
                if existing.get(field) in (None, "") and record.get(field) not in (
                    None,
                    "",
                ):
                    existing[field] = record[field]
            existing.setdefault("metadata", {}).update(record.get("metadata", {}))
    return merged


# Where a canonical shot's experiment_id came from (/entry/shots column
# `experiment_id_source`, bridge profile v4). The first four are the resolution
# chain of the automatic shot assembly plan (W1), first match wins; "producer"
# is an event that arrived already naming its campaign, which is every event a
# producer emits today and is kept as-is rather than second-guessed.
EXPERIMENT_ID_SOURCES = ("labfrog", "schedule", "ruling", "producer", "unassigned")
_EXPERIMENT_ID_SOURCE_RANK = {
    source: rank for rank, source in enumerate(EXPERIMENT_ID_SOURCES)
}

# The trigger source whose authoritative shot_number founds a trigger-only shot
# (W6.1 union): shotcounter's hzdr-event-v1 envelope and the legacy
# processed_message adapter both use this label.
TRIGGER_SOURCE = "DRACO-Trigger"

_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# The one campaign-schedule format DAMNIT reads: LabFrog's export
# (labfrog/labfrog/campaign_schedule.py, scripts/export_campaign_schedule.py,
# documented in labfrog/doc/data_integrations.md "Campaign Schedule"). Windows
# come from the MediaWiki FWKTBeamtime dates until new campaign settings exist
# (decision D4).
CAMPAIGN_SCHEDULE_SCHEMA = "labfrog-campaign-schedule-v1"


def load_campaign_schedule(path: Path) -> list[dict[str, Any]]:
    """Load a LabFrog ``labfrog-campaign-schedule-v1`` export as window rows.

    The document is ``{"schema", "timezone", "window_rule", "campaigns":
    [{"campaign", "experiment_id", "start", "end", "source"}], "warnings"}``.
    ``start``/``end`` are inclusive calendar days in ``timezone``; each row
    becomes the local window ``[start 00:00, end + 1 day 00:00)``. A row with a
    null ``start``, ``end`` or ``experiment_id`` never matches and is dropped
    here. ``experiment_id`` is used as-is: it is LabFrog's canonical slug. An
    unknown ``schema`` is rejected rather than half-read. LabFrog's own
    ``warnings`` (overlaps, collisions) are logged; an overlap needs no special
    handling because a time inside two windows is never a match.
    """
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        message = f"{path} is not valid JSON: {exc.msg}"
        raise ValueError(message) from exc
    if not isinstance(document, dict):
        message = f"{path} is not a {CAMPAIGN_SCHEDULE_SCHEMA} document"
        raise ValueError(message)
    schema = document.get("schema")
    if schema != CAMPAIGN_SCHEDULE_SCHEMA:
        message = (
            f"{path} has campaign schedule schema {schema!r}; DAMNIT reads only "
            f"{CAMPAIGN_SCHEDULE_SCHEMA!r}"
        )
        raise ValueError(message)
    timezone = _as_optional_string(document.get("timezone"))
    if not timezone:
        message = f"{path} does not name a timezone"
        raise ValueError(message)
    resolve_timezone(timezone)
    campaigns = document.get("campaigns")
    if not isinstance(campaigns, list):
        message = f"{path} campaigns must be a list"
        raise ValueError(message)
    for warning in document.get("warnings") or []:
        logger.warning("Campaign schedule %s: %s", path, warning)
    schedule: list[dict[str, Any]] = []
    for index, row in enumerate(campaigns):
        if not isinstance(row, dict):
            message = f"{path} campaigns[{index}] is not an object"
            raise ValueError(message)
        experiment_id = _as_optional_string(row.get("experiment_id"))
        start = _as_optional_string(row.get("start"))
        end = _as_optional_string(row.get("end"))
        if not experiment_id or not start or not end:
            continue
        schedule.append({
            "experiment_id": experiment_id,
            "start": start,
            "end": end,
            "timezone": timezone,
        })
    return schedule


def _schedule_windows(
    schedule: Iterable[Mapping[str, Any]], *, campaign_timezone: str
) -> list[tuple[datetime, datetime, str]]:
    """Turn schedule rows into UTC ``[start, end)`` windows.

    A row's own ``timezone`` (from the LabFrog export) wins over the build's
    ``campaign_timezone``. A date-only ``end`` is inclusive, so the window
    closes at 00:00 local on the following day.
    """
    windows: list[tuple[datetime, datetime, str]] = []
    for entry in schedule:
        experiment_id = _as_optional_string(entry.get("experiment_id"))
        start_text = _as_optional_string(entry.get("start"))
        end_text = _as_optional_string(entry.get("end"))
        timezone = _as_optional_string(entry.get("timezone")) or campaign_timezone
        start = parse_datetime(start_text, naive_timezone=timezone)
        if end_text and _DATE_ONLY.match(end_text):
            end_day = datetime.fromisoformat(end_text) + timedelta(days=1)
            end = parse_datetime(end_day, naive_timezone=timezone)
        else:
            end = parse_datetime(end_text, naive_timezone=timezone)
        if not experiment_id or start is None or end is None or end <= start:
            logger.warning("Skipping unusable campaign schedule entry: %s", entry)
            continue
        windows.append((start, end, experiment_id))
    return windows


def _authoritative_shot_number(event: dict[str, Any]) -> int | None:
    """The envelope's own ``shot_number`` only - never a nested/local counter."""
    return _as_optional_int(event.get("shot_number"))


def _authority_number(shot: Mapping[str, Any]) -> int | None:
    """The shot authority's number of a LabFrog row or canonical shot.

    Readiness ruling R3 (2026-10-03): an authoritative trigger is matched and
    campaign-resolved on this number only, never on LabFrog's ``shot_number``,
    which an operator may have typed (radbio types 1-70 again every day). It
    comes from the export's ``authority_shot_number`` (labfrog-sqlite-tools
    schema 13); a typed row, a set that claimed several shots and every row
    of an older export have none and are reachable only by the non-number
    rules (identity, campaign schedule, a reviewer's ruling) or review. A
    set's claimed numbers (schema v14, ``authority_shot_numbers``) still
    name its campaign in resolution step 1; they never match a shot.
    """
    return _as_optional_int(shot.get("authority_shot_number"))


def _labfrog_experiment_by_shot_number(
    labfrog_shots: Iterable[dict[str, Any]], default_experiment_id: str
) -> dict[int, set[str]]:
    """Map each authority shot number to the campaign(s) LabFrog records it in.

    Keyed on the shot authority's numbers only (ruling R3): a row whose number
    was typed takes no part. Those are the row's ``authority_shot_number``
    (schema v13) and, from schema v14's ``authority_shots``, every number the
    record claimed (``authority_shot_numbers``), so a set that claimed several
    shots names its campaign for each. A record with no experiment_id of its
    own belongs to the export the builder was pointed at, i.e.
    ``default_experiment_id``.
    """
    by_number: dict[int, set[str]] = defaultdict(set)
    for record in labfrog_shots:
        numbers = {
            number
            for number in (
                _authority_number(record),
                *(
                    _as_optional_int(value)
                    for value in record.get("authority_shot_numbers") or ()
                ),
            )
            if number is not None
        }
        if not numbers:
            continue
        metadata = record.get("metadata")
        experiment_id = _as_optional_string(record.get("experiment_id")) or (
            _as_optional_string(metadata.get("experiment_id"))
            if isinstance(metadata, dict)
            else None
        )
        for number in numbers:
            by_number[number].add(experiment_id or default_experiment_id)
    return by_number


def resolve_event_experiments(
    events: Iterable[dict[str, Any]],
    *,
    labfrog_shots: Iterable[dict[str, Any]] = (),
    labfrog_experiment_id: str,
    campaign_schedule: Iterable[Mapping[str, Any]] = (),
    experiment_rulings: Mapping[int, str] | None = None,
    campaign_timezone: str = "UTC",
) -> list[dict[str, Any]]:
    """Resolve the campaign of every ``unassigned`` event (decision D1).

    Returns shallow copies with ``experiment_id`` set to the resolved campaign
    and ``experiment_id_source`` recording why. An event that arrived naming a
    campaign keeps it (source ``producer``). An ``unassigned`` event with an
    authoritative ``shot_number`` goes down the chain, first match wins:

    1. a LabFrog record carrying that number as its ``authority_shot_number``
       names exactly one campaign -> ``labfrog`` (a typed ``shot_number`` is
       never used, ruling R3);
    2. exactly one campaign-schedule window contains the event time ->
       ``schedule`` (overlapping windows are no match, never a guess);
    3. a reviewer's ruling for that shot_number -> ``ruling``;
    4. otherwise it stays ``unassigned`` and is built in the ``_unassigned``
       bucket, never dropped.

    ``event_id`` is fixed *before* experiment_id is rewritten, so a legacy
    event without one keeps the synthesized id it would have had.
    """
    labfrog_by_number = _labfrog_experiment_by_shot_number(
        labfrog_shots, labfrog_experiment_id
    )
    windows = _schedule_windows(campaign_schedule, campaign_timezone=campaign_timezone)
    rulings = experiment_rulings or {}
    resolved: list[dict[str, Any]] = []
    for event in events:
        copied = dict(event)
        if not copied.get("event_id"):
            copied["event_id"] = _event_id(event)
        experiment_id = str(copied.get("experiment_id"))
        if experiment_id != UNASSIGNED_EXPERIMENT_ID:
            copied["experiment_id_source"] = "producer"
            resolved.append(copied)
            continue
        experiment_id, source = _resolve_unassigned(
            copied, labfrog_by_number, windows, rulings
        )
        copied["experiment_id"] = experiment_id
        copied["experiment_id_source"] = source
        resolved.append(copied)
    return resolved


def _resolve_unassigned(
    event: dict[str, Any],
    labfrog_by_number: Mapping[int, set[str]],
    windows: list[tuple[datetime, datetime, str]],
    rulings: Mapping[int, str],
) -> tuple[str, str]:
    shot_number = _authoritative_shot_number(event)
    if shot_number is None:
        return UNASSIGNED_EXPERIMENT_ID, "unassigned"
    labfrog = labfrog_by_number.get(shot_number, set())
    if len(labfrog) == 1:
        return next(iter(labfrog)), "labfrog"
    event_time = parse_datetime(event.get("timestamp"))
    if event_time is not None:
        containing = {
            experiment_id
            for start, end, experiment_id in windows
            if start <= event_time < end
        }
        if len(containing) == 1:
            return containing.pop(), "schedule"
    ruling = rulings.get(shot_number)
    if ruling:
        return ruling, "ruling"
    return UNASSIGNED_EXPERIMENT_ID, "unassigned"


def _shot_experiment_id_source(events: Iterable[dict[str, Any]]) -> str:
    """The strongest resolution source among a shot's events."""
    sources = [
        str(event.get("experiment_id_source"))
        for event in events
        if event.get("experiment_id_source") in _EXPERIMENT_ID_SOURCE_RANK
    ]
    if not sources:
        return "producer"
    return min(sources, key=_EXPERIMENT_ID_SOURCE_RANK.__getitem__)


def _is_trigger_only_candidate(
    event: dict[str, Any], labfrog_numbers: Container[int]
) -> bool:
    shot_number = _authoritative_shot_number(event)
    return (
        event.get("source") == TRIGGER_SOURCE
        and shot_number is not None
        and shot_number not in labfrog_numbers
        and not event.get("shot_key")
    )


def _trigger_only_shots(
    events: list[dict[str, Any]],
    labfrog_numbers: Container[int],
    experiment_id: str,
    source_key: str,
    *,
    campaign_timezone: str,
    taken_shot_keys: Container[str] = (),
) -> list[dict[str, Any]]:
    """Build the trigger-only half of the W6.1 union.

    A DRACO-Trigger event with an authoritative shot_number that no LabFrog
    record carries as its authority number (``labfrog_numbers``, ruling R3),
    and that the matcher left unattached, founds its own shot. Other
    unattached events with the same identity group (local date, number,
    shot_id - the rule the LabFrog-less build already uses) join it. LabFrog
    columns stay null; nothing is invented for them.

    A trigger whose shot_key a LabFrog row already holds (same day and the
    same *typed* number) founds nothing: two shots cannot share a key, and
    the typed number is not evidence that they are one shot. It stays
    unattached for review.
    """

    def _founded_key(event: dict[str, Any]) -> str | None:
        group = _identity_group_key(event, campaign_timezone=campaign_timezone)
        if group is None:
            return None
        shot_date, shot_number, _shot_id = group
        return make_shot_key(experiment_id, shot_date or None, shot_number)

    triggers = []
    for event in events:
        if not _is_trigger_only_candidate(event, labfrog_numbers):
            continue
        founded_key = _founded_key(event)
        if founded_key is not None and founded_key in taken_shot_keys:
            continue
        triggers.append(event)
    if not triggers:
        return []
    trigger_groups = {
        _identity_group_key(event, campaign_timezone=campaign_timezone)
        for event in triggers
    }
    members = [
        event
        for event in events
        if not event.get("shot_key")
        and _identity_group_key(event, campaign_timezone=campaign_timezone)
        in trigger_groups
    ]
    for event in members:
        event["candidate_shot_keys"] = []
    return _canonical_from_event_identities(
        members, experiment_id, source_key, campaign_timezone=campaign_timezone
    )


def reconcile_canonical_shots(  # noqa: C901
    events: list[dict[str, Any]],
    *,
    experiment_id: str,
    source_key: str,
    labfrog_shots: list[dict[str, Any]] | None = None,
    match_tolerance_s: float = 120.0,
    campaign_timezone: str = "UTC",
    campaign_schedule: Iterable[Mapping[str, Any]] = (),
    experiment_rulings: Mapping[int, str] | None = None,
    time_match_autoassign: bool = False,
    include_trigger_only: bool = True,
    resolution_labfrog_shots: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Link normalized source events to canonical shots.

    Resolution comes first: ``unassigned`` events are routed to a campaign by
    ``resolve_event_experiments`` and only then filtered to ``experiment_id``
    (pass ``experiment_id="unassigned"`` to build the ``_unassigned`` bucket).
    Its LabFrog step reads ``labfrog_shots`` unless ``resolution_labfrog_shots``
    is given: a multi-campaign build passes every active campaign's records
    there, each naming its campaign, so all builds of one run route an
    ``unassigned`` event to the same single campaign.

    With LabFrog records, the canonical shots are the union (plan W6.1) of the
    LabFrog records and, when ``include_trigger_only``, the trigger-only shots
    the matcher left unattached. The time-based match ranks never attach
    events by default (plan W6.2's "never guess", ruling A7, 2026-09-30): they
    become review candidates, and an authoritative ``shot_number`` that names
    exactly one shot attaches on the number alone. ``time_match_autoassign=True``
    restores the pre-2026-09-30 ladder exactly.
    """
    labfrog_shots = labfrog_shots or []
    trigger_only_keys: set[str] = set()
    resolved_events = resolve_event_experiments(
        events,
        labfrog_shots=(
            labfrog_shots
            if resolution_labfrog_shots is None
            else resolution_labfrog_shots
        ),
        labfrog_experiment_id=experiment_id,
        campaign_schedule=campaign_schedule,
        experiment_rulings=experiment_rulings,
        campaign_timezone=campaign_timezone,
    )
    selected_events = [
        event
        for event in resolved_events
        if str(event.get("experiment_id")) == experiment_id
    ]
    normalized_events = _deduplicate_by_event_id(
        _normalize_event(event) for event in selected_events
    )

    if labfrog_shots:
        canonical = [
            _canonical_from_labfrog(record, experiment_id, source_key)
            for record in labfrog_shots
        ]
        for event in normalized_events:
            match, quality, status, candidate_shot_keys = _match_event(
                event,
                canonical,
                match_tolerance_s=match_tolerance_s,
                campaign_timezone=campaign_timezone,
                time_match_autoassign=time_match_autoassign,
            )
            if match is None:
                attributed_keys = _attribution_candidate_keys(event, canonical)
                if attributed_keys:
                    candidate_shot_keys = list(
                        dict.fromkeys([*candidate_shot_keys, *attributed_keys])
                    )
                    status = quality = "ambiguous"
            event["match_quality"] = quality
            event["match_status"] = status
            event["match_time_delta_s"] = None
            event["shot_key"] = ""
            event["candidate_shot_keys"] = candidate_shot_keys
            if match is None:
                continue

            event["shot_key"] = match["shot_key"]
            delta = _time_delta_seconds(
                match.get("labfrog_date_time"),
                event.get("timestamp"),
                campaign_timezone=campaign_timezone,
            )
            event["match_time_delta_s"] = delta
            match["events"].append(_event_api_record(event))
            match["match_status"] = "matched"
            if MATCH_RANK.get(quality, 0) >= MATCH_RANK.get(
                str(match.get("match_quality")), 0
            ):
                match["match_quality"] = quality
                match["match_time_delta_s"] = delta
        for shot in canonical:
            shot["experiment_id_source"] = "labfrog"
        if include_trigger_only:
            # The union's number set is the authority's numbers only (R3): a
            # trigger is not absorbed by a row whose number was typed.
            authority_numbers = {
                number
                for shot in canonical
                if (number := _authority_number(shot)) is not None
            }
            trigger_only = _trigger_only_shots(
                normalized_events,
                authority_numbers,
                experiment_id,
                source_key,
                campaign_timezone=campaign_timezone,
                taken_shot_keys={shot["shot_key"] for shot in canonical},
            )
            trigger_only_keys = {shot["shot_key"] for shot in trigger_only}
            canonical.extend(trigger_only)
    else:
        canonical = _canonical_from_event_identities(
            normalized_events,
            experiment_id,
            source_key,
            campaign_timezone=campaign_timezone,
        )

    events_by_id = {event["event_id"]: event for event in normalized_events}
    for shot in canonical:
        if "experiment_id_source" not in shot:
            shot["experiment_id_source"] = _shot_experiment_id_source(
                events_by_id[event["event_id"]]
                for event in shot["events"]
                if event.get("event_id") in events_by_id
            )
        shot["metadata"] = _merge_shot_metadata(
            shot["metadata"], _merged_event_metadata(shot["events"])
        )
        event_times = [
            parse_datetime(event["timestamp"])
            for event in shot["events"]
            if event.get("timestamp")
        ]
        event_times = [value for value in event_times if value is not None]
        if event_times:
            shot["fired_at"] = min(event_times).isoformat()
        elif shot.get("labfrog_date_time"):
            shot["fired_at"] = str(shot["labfrog_date_time"])
        if not shot["events"]:
            shot["match_status"] = "labfrog-only"
            shot["match_quality"] = "labfrog_only"
        shot["data_products"] = build_event_data_products(
            shot["events"], shot_key=shot["shot_key"]
        )
    if labfrog_shots:
        for shot in canonical:
            if shot["shot_key"] in trigger_only_keys:
                continue  # trigger-only shot: there is no LabFrog row to cite
            labfrog_event = _labfrog_source_event(shot, experiment_id)
            normalized_events.append(labfrog_event)
            shot["events"].append(_event_api_record(labfrog_event))
    return canonical, normalized_events


def build_event_data_products(
    events: Iterable[dict[str, Any]], *, shot_key: str
) -> list[dict[str, Any]]:
    """Build compact product descriptors from normalized source events."""
    products: list[dict[str, Any]] = []
    for event in events:
        event_id = str(event["event_id"])
        source = str(event["source"])
        kind = str(event["kind"])
        values = event.get("values")
        metadata = event.get("metadata", {})
        if isinstance(values, list):
            array = np.asarray(values)
            dataset_path = (
                f"/entry/{source_group_name(source)}/{safe_hdf5_name(kind)}/"
                f"{safe_hdf5_name(event_id)}/values"
            )
            products.append({
                "product_id": f"{event_id}:values",
                "shot_key": shot_key,
                "source": source,
                "kind": "hdf5_dataset",
                "path": None,
                "dataset_name": dataset_path,
                "preview_kind": preview_kind_for_shape(array.shape),
                "shape": [int(value) for value in array.shape],
                "dtype": str(array.dtype),
                "units": _as_optional_string(
                    metadata.get("unit") if isinstance(metadata, dict) else None
                ),
                "metadata": {"event_id": event_id, "source_kind": kind},
            })

        payload_ref = event.get("payload_ref", {})
        if not isinstance(payload_ref, dict):
            continue
        dataset_name = _first_string(
            payload_ref, "dataset_path", "dataset", "hdf5_dataset"
        )
        path = _first_string(
            payload_ref,
            "hdf5_path",
            "filepath",
            "file_path",
            "path",
            "file",
            "uri",
            "url",
        )
        if path or dataset_name:
            products.append({
                "product_id": f"{event_id}:reference",
                "shot_key": shot_key,
                "source": source,
                "kind": "hdf5_dataset" if dataset_name else "file",
                "path": path,
                "dataset_name": dataset_name,
                "preview_kind": _as_optional_string(payload_ref.get("preview_kind")),
                "shape": list(payload_ref.get("shape", []))
                if isinstance(payload_ref.get("shape"), list)
                else [],
                "dtype": _as_optional_string(payload_ref.get("dtype")),
                "units": _as_optional_string(payload_ref.get("units")),
                "metadata": {
                    "event_id": event_id,
                    "transport": event.get("transport"),
                },
            })
    return products


def discover_labfrog_data_products(
    nexus_path: Path, shots: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Describe selected shot-indexed LabFrog datasets without copying data."""
    if not nexus_path.exists() or not shots:
        return []
    products: list[dict[str, Any]] = []
    allowed_prefixes = ("/entry/derived/", "/entry/instrument/laser/")
    with h5py.File(nexus_path, "r") as handle:
        datasets: list[tuple[str, h5py.Dataset]] = []

        def collect(name: str, item: Any) -> None:
            full_name = f"/{name}"
            if (
                isinstance(item, h5py.Dataset)
                and full_name.startswith(allowed_prefixes)
                and item.shape
                and item.shape[0] == len(shots)
                and np.issubdtype(item.dtype, np.number)
            ):
                datasets.append((full_name, item))

        handle.visititems(collect)
        for dataset_name, dataset in datasets:
            item_shape = dataset.shape[1:]
            units = _as_optional_string(dataset.attrs.get("units"))
            for index, shot in enumerate(shots):
                products.append({
                    "product_id": (f"labfrog:{index}:{dataset_name.removeprefix('/')}"),
                    "shot_key": shot["shot_key"],
                    "source": "LabFrog",
                    "kind": "hdf5_dataset",
                    "path": str(nexus_path),
                    "dataset_name": dataset_name,
                    "preview_kind": preview_kind_for_shape(item_shape),
                    "shape": [int(value) for value in item_shape],
                    "dtype": str(dataset.dtype),
                    "units": units,
                    "metadata": {
                        "shot_index": index,
                        "shot_indexed": True,
                    },
                })
    return products


def write_nexus_bridge(
    *,
    output_path: Path,
    experiment_id: str,
    shots: list[dict[str, Any]],
    events: list[dict[str, Any]],
    source_nexus: Path | None = None,
    laser_config: dict[str, Any] | None = None,
    seed_from_output: bool = True,
) -> list[dict[str, Any]]:
    """Preserve a LabFrog NeXus file and add the DAMNIT bridge tables.

    Writes to a sibling .tmp.nxs file first, then atomically replaces
    output_path on success — the same pattern as write_json_atomic(). A crash
    or exception mid-write leaves the previous output_path intact and a stale
    .tmp.nxs sibling that is cleaned up on the next invocation.

    `laser_config` carries the deployment's fixed laser-system constants
    (`DW_API_HZDR_LASER__*`, bare `metadata.laser.*` keys) that no per-shot
    event supplies; see `_merge_laser_config()`.

    Without a `source_nexus`, the previous `output_path` seeds the new file
    unless `seed_from_output` is False. Multi-campaign builds pass False: their
    shot lists shrink and reorder as rulings and LabFrog rows move shots
    between campaigns, which a seeded shot table (only ever extended) refuses;
    unseeded, every build is written like the first one. A previous output
    whose shot table DAMNIT wrote itself (`SHOT_IDENTITY_ATTR`) is not seeded
    either: only a LabFrog-owned table has rows other groups refer to.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_name(f"{output_path.name}.{uuid.uuid4().hex}.tmp.nxs")
    try:
        _stage_bridge_temp_file(
            output_path,
            temp_path,
            source_nexus,
            seed_from_output=seed_from_output,
        )

        mode = "r+" if temp_path.exists() else "w"
        with h5py.File(temp_path, mode) as handle:
            handle.attrs["damnit_bridge_profile"] = HZDR_BRIDGE_PROFILE_VERSION
            handle.attrs["experiment_id"] = experiment_id
            handle.attrs["damnit_bridge_updated_at"] = datetime.now(UTC).isoformat()
            if "default" not in handle.attrs:
                handle.attrs["default"] = "entry"
            entry = handle.require_group("entry")
            if "NX_class" not in entry.attrs:
                entry.attrs["NX_class"] = "NXentry"
            # Declares the NXhzdr_target application definition so NXDL tooling
            # (pynxtools) can certify the file against hzdr/nxdl/. Profile >= 0.2.
            if "definition" not in entry:
                entry.create_dataset("definition", data="NXhzdr_target")
            # Standard NXentry field. The LabFrog projection writes it too, but
            # a canonical build without a source_nexus must not depend on the
            # preserved projection for the campaign's primary identifier.
            if "experiment_identifier" not in entry:
                entry.create_dataset("experiment_identifier", data=experiment_id)
            entry.attrs["damnit_shot_table"] = "shots"
            entry.attrs["damnit_source_events"] = "source_events"
            entry.attrs["damnit_data_products"] = "data_products"

            _write_campaign_time_bounds(entry, shots)
            _write_semantic_metadata_groups(entry, shots, laser_config)

            shots_group = entry.require_group("shots")
            if "NX_class" not in shots_group.attrs:
                shots_group.attrs["NX_class"] = "NXcollection"
            existing_count = _table_length(shots_group)
            if existing_count > len(shots):
                message = (
                    "Canonical shot count does not match the preserved LabFrog "
                    f"/entry/shots table ({len(shots)} != {existing_count})"
                )
                raise ValueError(message)
            if 0 < existing_count < len(shots):
                _extend_preserved_shot_table(shots_group, shots, existing_count)
            _write_shot_bridge_columns(
                shots_group, shots, write_identity=existing_count == 0
            )
            _write_source_payloads(entry, events)

            products = [
                product for shot in shots for product in shot.get("data_products", [])
            ]
            _fill_default_product_paths(products, output_path)
            _write_source_events(entry, events)
            _write_instrument_event_groups(entry, events)
            _write_data_products(entry, products, output_path=output_path)
            write_nexus_detector_groups(entry, products)
            # Every link targets a container already renamed into place, and
            # the master is renamed last: it never names a missing container.
            _write_shot_container_links(handle, shots, events, output_path=output_path)

        replace_with_retry(temp_path, output_path)
    except BaseException:
        temp_path.unlink(missing_ok=True)
        raise
    return products


def _write_campaign_time_bounds(entry: h5py.Group, shots: list[dict[str, Any]]) -> None:
    """Write `/entry/start_time` and `/entry/end_time` (standard NXentry fields).

    Derived from the earliest/latest parseable shot `fired_at` (itself the
    minimum event timestamp per shot, or the LabFrog date_time fallback).
    Standard NeXus catalog tooling and the SciCat mapping read these first, so
    they are refreshed on every rebuild as the campaign grows — but only when
    DAMNIT wrote them: an existing dataset without the `damnit_source` marker
    (e.g. from a future LabFrog projection) is preserved, mirroring the
    `_claim_damnit_group` rule for groups.
    """
    times = []
    for shot in shots:
        parsed = parse_datetime(shot.get("fired_at"))
        if parsed is not None:
            times.append(parsed)
    if not times:
        return
    bounds = {"start_time": min(times), "end_time": max(times)}
    for name, value in bounds.items():
        existing = entry.get(name)
        if existing is not None:
            if (
                not isinstance(existing, h5py.Dataset)
                or existing.attrs.get("damnit_source") != "shots"
            ):
                continue
            del entry[name]
        dataset = entry.create_dataset(name, data=value.isoformat())
        dataset.attrs["damnit_source"] = "shots"


def _write_semantic_metadata_groups(
    entry: h5py.Group,
    shots: list[dict[str, Any]],
    laser_config: dict[str, Any] | None = None,
) -> None:
    """Promote namespaced `metadata.*` blocks into their semantic NeXus homes.

    Campaign-level snapshots (laser -> NXsource/NXbeam, target -> NXsample,
    vacuum -> NXenvironment) come from the first shot carrying the block;
    the inherently per-shot families (laser shot series, diagnostic scalars)
    are written as full series.

    `laser_config` holds the deployment's fixed laser-system constants and
    only *fills gaps*: any key a producer sent wins, and the group is written
    even when no shot carried a laser block at all (wavelength, repetition
    rate, polarization and system name are properties of the laser, so a
    campaign with no LaserData events still has them).
    """
    laser = _first_shot_laser(shots)
    merged_laser, config_keys = _merge_laser_config(laser, laser_config)
    if merged_laser is not None:
        write_nexus_laser_group(entry, merged_laser, config_keys=config_keys)
    write_nexus_laser_shot_series(entry, shots)

    target = _first_shot_target(shots)
    if target is not None:
        write_nexus_sample(entry, target)

    vacuum = _first_shot_vacuum(shots)
    if vacuum is not None:
        write_nexus_vacuum_group(entry, vacuum)

    write_nexus_diagnostic_groups(entry, shots)


def _stage_bridge_temp_file(
    output_path: Path,
    temp_path: Path,
    source_nexus: Path | None,
    *,
    seed_from_output: bool = True,
) -> None:
    """Seed `temp_path` with prior bridge content before it is opened for writing."""
    if source_nexus is not None and source_nexus.resolve() != output_path.resolve():
        shutil.copy2(source_nexus, temp_path)
    elif output_path.exists() and (
        source_nexus is not None
        or (seed_from_output and not _owns_shot_identity(output_path))
    ):
        # Preserve existing LabFrog + bridge content across incremental rebuilds.
        shutil.copy2(output_path, temp_path)


def _owns_shot_identity(path: Path) -> bool:
    """True when DAMNIT wrote this file's `/entry/shots` rows from scratch.

    Such a table preserves nothing: every build regenerates it, so a shot list
    that shrinks or reorders (single-campaign mode, C6) is simply rewritten.
    """
    try:
        with h5py.File(path, "r") as handle:
            shots = handle.get("entry/shots")
            return isinstance(shots, h5py.Group) and bool(
                shots.attrs.get(SHOT_IDENTITY_ATTR, False)
            )
    except OSError:
        return False


def _fill_default_product_paths(
    products: list[dict[str, Any]], output_path: Path
) -> None:
    for product in products:
        if not product.get("path"):
            product["path"] = str(output_path)


def _merge_laser_config(
    laser: dict[str, Any] | None, laser_config: dict[str, Any] | None
) -> tuple[dict[str, Any] | None, frozenset[str]]:
    """Fill the campaign laser snapshot from fixed config, producer values first.

    Returns the merged block (None when there is nothing at all to write) and
    the set of keys the config supplied, which `write_nexus_laser_group()`
    stamps as `damnit_source="config"`.
    """
    configured = {
        key: value for key, value in (laser_config or {}).items() if value is not None
    }
    if not configured:
        return laser, frozenset()
    # A producer value always wins - config states what the laser *is*, not
    # what a shot measured, so it must never overwrite a measurement.
    sent = laser or {}
    filled = {key: value for key, value in configured.items() if key not in sent}
    if not filled:
        return laser, frozenset()
    return {**filled, **sent}, frozenset(filled)


def _first_shot_laser(shots: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Pick the first namespaced laser metadata block for `/entry/instrument/laser`.

    Later shots carrying a *different* non-empty laser block are silently
    dropped (single campaign-level NXsource, same limitation as
    `_first_shot_target` below) - log one warning so a divergent laser config
    mid-campaign is at least visible instead of silently ignored.
    """
    chosen: dict[str, Any] | None = None
    warned = False
    for shot in shots:
        metadata = shot.get("metadata")
        if not isinstance(metadata, dict):
            continue
        laser = metadata.get("laser")
        if not (isinstance(laser, dict) and laser):
            continue
        if chosen is None:
            chosen = laser
        elif not warned and laser != chosen:
            logger.warning(
                "Shot %s has a laser metadata block that differs from the "
                "campaign's chosen block (shot_key=%s); only the first "
                "shot's laser block is written to /entry/instrument/laser.",
                shot.get("shot_number"),
                shot.get("shot_key"),
            )
            warned = True
    return chosen


def _first_shot_vacuum(shots: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Pick the first namespaced vacuum metadata block for `/entry/sample/environment`.

    Same single campaign-level group limitation as `_first_shot_laser` above /
    `_first_shot_target` below: later shots carrying a *different* non-empty
    vacuum block are dropped, with one warning so a mid-campaign pressure-regime
    change is at least visible instead of silently ignored.
    """
    chosen: dict[str, Any] | None = None
    warned = False
    for shot in shots:
        metadata = shot.get("metadata")
        if not isinstance(metadata, dict):
            continue
        vacuum = metadata.get("vacuum")
        if not (isinstance(vacuum, dict) and vacuum):
            continue
        if chosen is None:
            chosen = vacuum
        elif not warned and vacuum != chosen:
            logger.warning(
                "Shot %s has a vacuum metadata block that differs from the "
                "campaign's chosen block (shot_key=%s); only the first "
                "shot's vacuum block is written to /entry/sample/environment.",
                shot.get("shot_number"),
                shot.get("shot_key"),
            )
            warned = True
    return chosen


def _shot_target_metadata(shot: dict[str, Any]) -> dict[str, Any]:
    """Return one shot's canonical target block for lossless bridge storage."""
    metadata = shot.get("metadata")
    if not isinstance(metadata, dict):
        return {}
    target = metadata.get("target")
    return target if isinstance(target, dict) else {}


def _first_shot_target(shots: list[dict[str, Any]]) -> Any:
    """Pick the campaign's target for `/entry/sample` from the shot list.

    `metadata.target` arrives per-shot (merged from the events attached to
    that shot - see `_merged_event_metadata`), but `/entry/sample` is a
    single campaign-level NeXus group, not a per-shot one (target-ontology.md
    §8: one `write_nexus_sample()` call per built file). A LabFrog campaign is
    overwhelmingly single-target in practice, so the first shot carrying a
    non-empty `metadata.target` is used for that snapshot. Every canonical
    per-shot block is also retained losslessly in
    `/entry/shots/target_metadata_json`; a later differing block logs once so
    consumers know the campaign snapshot is not uniform.
    """
    chosen: Any = None
    warned = False
    for shot in shots:
        metadata = shot.get("metadata")
        if not isinstance(metadata, dict):
            continue
        target = metadata.get("target")
        if not target:
            continue
        if chosen is None:
            chosen = target
        elif not warned and target != chosen:
            logger.warning(
                "Shot %s has a target metadata block that differs from the "
                "campaign's chosen block (shot_key=%s); /entry/sample uses "
                "the first block while every shot is preserved in "
                "/entry/shots/target_metadata_json.",
                shot.get("shot_number"),
                shot.get("shot_key"),
            )
            warned = True
    return chosen


def write_nexus_laser_group(
    entry_group: h5py.Group,
    laser: dict[str, Any],
    *,
    config_keys: Container[str] = frozenset(),
) -> None:
    """Write `/entry/instrument/laser` from canonical `metadata.laser.*` keys.

    `config_keys` names the `laser` keys that came from the deployment's fixed
    laser-system configuration (`DW_API_HZDR_LASER__*`) rather than from a
    producer event; those datasets are stamped `damnit_source="config"` so a
    campaign constant is never read as a measured per-shot value. See
    hzdr/docs/nexus-semantic-maps.md §2.
    """
    instrument = entry_group.require_group("instrument")
    if "NX_class" not in instrument.attrs:
        instrument.attrs["NX_class"] = "NXinstrument"

    def source_of(key: str) -> str | None:
        return "config" if key in config_keys else None

    source = instrument.require_group("laser")
    source.attrs["NX_class"] = "NXsource"
    _write_optional_string_dataset(source, "type", "Laser")
    _write_optional_string_dataset(source, "probe", "visible light")
    _write_optional_string_dataset(
        source, "name", laser.get("system"), source=source_of("system")
    )
    _write_optional_numeric_dataset(
        source,
        "frequency",
        laser.get("repetition_rate"),
        unit_key="laser.repetition_rate",
        source=source_of("repetition_rate"),
    )
    _write_optional_numeric_dataset(
        source,
        "pulse_energy",
        laser.get("pulse_energy"),
        unit_key="laser.pulse_energy",
        source=source_of("pulse_energy"),
    )

    beam = source.require_group("beam")
    beam.attrs["NX_class"] = "NXbeam"
    _write_optional_numeric_dataset(
        beam,
        "incident_energy",
        laser.get("pulse_energy"),
        unit_key="laser.pulse_energy",
        source=source_of("pulse_energy"),
    )
    _write_optional_numeric_dataset(
        beam,
        "pulse_duration",
        laser.get("pulse_duration"),
        unit_key="laser.pulse_duration",
        source=source_of("pulse_duration"),
    )
    _write_optional_numeric_dataset(
        beam,
        "incident_wavelength",
        laser.get("wavelength"),
        unit_key="laser.wavelength",
        source=source_of("wavelength"),
    )
    _write_optional_string_dataset(
        beam,
        "incident_polarization",
        laser.get("polarization"),
        source=source_of("polarization"),
    )
    _write_optional_numeric_dataset(
        beam,
        "beam_position_x",
        laser.get("beam_pos_x"),
        unit_key="laser.beam_pos_x",
        source=source_of("beam_pos_x"),
    )
    _write_optional_numeric_dataset(
        beam,
        "beam_position_y",
        laser.get("beam_pos_y"),
        unit_key="laser.beam_pos_y",
        source=source_of("beam_pos_y"),
    )
    _write_optional_numeric_dataset(
        beam,
        "beam_waist_x_1e2_radius",
        laser.get("beam_waist_x"),
        unit_key="laser.beam_waist_x",
        source=source_of("beam_waist_x"),
    )
    _write_optional_numeric_dataset(
        beam,
        "beam_waist_y_1e2_radius",
        laser.get("beam_waist_y"),
        unit_key="laser.beam_waist_y",
        source=source_of("beam_waist_y"),
    )
    _write_optional_numeric_dataset(
        beam,
        "contrast_ratio",
        laser.get("contrast_ratio"),
        unit_key="laser.contrast_ratio",
        source=source_of("contrast_ratio"),
    )


# HZDR-local NXhzdr_target profile version. Bump on any semantic-map change
# (fields added/removed/retyped) covered by the application definition — since
# v0.6 that is the whole canonical entry (sample, instrument/laser,
# sample/environment, detector series, start_time/end_time), not just the
# metadata.target.* -> /entry/sample mapping; the profile doc version AND the
# damnit_nxdl_version enumeration in hzdr/nxdl/NXhzdr_target.nxdl.xml must be
# bumped to match. See hzdr/docs/nxhzdr-target-profile.md (target map) and
# hzdr/docs/nexus-semantic-maps.md (laser/vacuum/diagnostic maps).
HZDR_TARGET_PROFILE_VERSION = "0.10"
HZDR_BRIDGE_PROFILE_VERSION = "hzdr-canonical-shot-v6"
LABFROG_LOCAL_COUNT_DESCRIPTION = (
    "The experimenters' shot count from LabFrog's local-counter reset (the "
    "Count written on the Shotsheet). A user aid for finding a shot, not an "
    "identifier: shot_number is the governed shot identity. -1 where LabFrog "
    "has no count for the shot."
)
AUTHORITY_SHOT_NUMBER_DESCRIPTION = (
    "The shot authority's number for this shot (planet-watchdog's shot "
    "authority, ruling R3): from the LabFrog export's authority_shot_number "
    "for a LabFrog-backed shot, else the shot_number its authoritative events "
    "carried. -1 where the shot has none, e.g. a LabFrog record typed by hand "
    "or a set that claimed several shots. For LabFrog-backed shots shot_number "
    "is LabFrog's own number, so join on this column to find a trigger."
)
# On /entry/shots when DAMNIT wrote its identity rows itself, not LabFrog.
SHOT_IDENTITY_ATTR = "damnit_shot_identity"

# Shot containers (campaign output phases 3-4): one file per shot under
# <campaign folder>/shots/, linked from the master's root (indexed in
# /entry/shot_containers).
SHOTS_DIRNAME = "shots"
SHOT_CONTAINERS_GROUP = "shot_containers"
# Beside the master: which containers the last build found in place, so the
# next one need not open each of them again (see _InPlaceCache).
CONTAINER_CHECK_NAME = ".hzdr-container-check.json"
_SHOT_KEY_PARTS = re.compile(
    r"^(?P<campaign>.+):(?P<date>\d{8}|unknown):(?P<number>\d{6,})$"
)


def shot_container_name(shot_key: str) -> str:
    """``<YYYYMMDD>_<shot_number:06d>.nxs`` from ``campaign:YYYYMMDD:NNNNNN``.

    Not the ``shot_key`` itself: its colons are illegal on Windows and on the
    ``Z:`` share, and its campaign part changes when a ruling moves the shot.
    """
    match = _SHOT_KEY_PARTS.match(shot_key)
    if match is None:
        msg = f"not a shot_key (campaign:YYYYMMDD:NNNNNN): {shot_key!r}"
        raise ValueError(msg)
    return f"{match['date']}_{int(match['number']):06d}.nxs"


def is_acquisition(metadata: Any) -> bool:
    """Whether an event's metadata names a file to convert (``instrument.format``).

    The one rule for "this shot has a container": the worker plans containers
    from these events, and the builder links only shots that have one, so a
    shot whose files a ruling moved elsewhere is not linked to a stale file.
    """
    if not isinstance(metadata, dict):
        return False
    instrument = metadata.get("instrument")
    return isinstance(instrument, dict) and bool(instrument.get("format"))


def _container_in_place(path: Path, shot_key: str) -> bool:
    """True when ``path`` is a finished container of exactly this shot.

    The worker renames a container into place only when it is whole, so a
    file that opens, names this ``shot_key`` and holds ``/entry`` is one the
    master may link; anything else (a shot that moved here from another
    campaign under the same date and number, a foreign file) is not linked.
    """
    try:
        if not path.is_file() or not h5py.is_hdf5(path):
            return False
        with h5py.File(path, "r") as handle:
            recorded = handle.attrs.get("shot_key")
            if isinstance(recorded, bytes):
                recorded = recorded.decode("utf-8")
            return recorded == shot_key and "entry" in handle
    except OSError:
        return False


class _InPlaceCache:
    """``_container_in_place`` across builds, keyed by each file's stat.

    Each build runs as its own process and would otherwise open every
    container of the campaign to check it, which on the SMB share costs one
    open per shot per build. A container whose size, mtime and inode are
    those it had when a build last found it in place for the same shot_key is
    not opened again: the worker only ever renames a whole new file into
    place, which changes them. Only finds are kept, and each build keeps only
    its own, so a container gone or no longer linked drops out. An unreadable
    or foreign cache file is ignored, and one that cannot be written costs the
    next build the full check, never this build.
    """

    VERSION = 1

    def __init__(self, path: Path) -> None:
        self.path = path
        self.opened = 0
        self._found: dict[str, dict[str, Any]] = {}
        self._known: dict[str, dict[str, Any]] = {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        if isinstance(payload, dict) and payload.get("version") == self.VERSION:
            containers = payload.get("containers")
            if isinstance(containers, dict):
                self._known = containers

    @staticmethod
    def _stat(path: Path) -> list[int] | None:
        try:
            stat = path.stat()
        except OSError:
            return None
        return [stat.st_size, stat.st_mtime_ns, stat.st_ino]

    def in_place(self, path: Path, shot_key: str) -> bool:
        stat = self._stat(path)
        if stat is None:
            return False
        entry = {"shot_key": shot_key, "stat": stat}
        if self._known.get(path.name) != entry:
            self.opened += 1
            if not _container_in_place(path, shot_key):
                return False
        self._found[path.name] = entry
        return True

    def save(self) -> None:
        if self._found == self._known:
            return
        try:
            write_json_atomic(
                self.path, {"version": self.VERSION, "containers": self._found}
            )
        except OSError as error:
            logger.warning("Could not write %s: %s", self.path, error)


def shot_container_links(handle: h5py.File) -> dict[str, h5py.ExternalLink]:
    """The master's links to its containers: root members linking into ``shots/``."""
    links = {}
    for name in handle:
        link = handle.get(name, getlink=True)
        if isinstance(link, h5py.ExternalLink) and link.filename.startswith(
            f"{SHOTS_DIRNAME}/"
        ):
            links[str(name)] = link
    return links


def _write_shot_container_links(
    handle: h5py.File,
    shots: list[dict[str, Any]],
    events: list[dict[str, Any]],
    *,
    output_path: Path,
) -> int:
    """Link each shot's container from the master's root; return the count.

    One relative ``ExternalLink("shots/<name>", "/entry")`` per container in
    place, at the root and named by the container's stem (``20251201_001044``),
    so the master is a multi-entry NeXus file: ``/entry`` (the campaign,
    certified against NXhzdr_target) beside one ``NXentry`` per shot, the way
    shot-aligner's masters are built. Under ``/entry`` a validator would read
    the containers as part of the campaign entry and refuse them; at the root
    each is an entry of its own. Relative, so the campaign folder travels as
    one unit and ``silx``/h5py follow the links. ``/entry/shot_containers``
    (``NXcollection``) indexes them with ``shot_key``/``container`` datasets,
    so a reader joins ``/entry/shots`` without parsing names. Both are
    rewritten whole on every build (a seeded previous master's links are
    dropped first), so neither names a container the shot table no longer
    holds. Containers are written by the worker, outside this lock; one not
    yet in place is linked by the next build (the worker asks for it).
    """
    for name in shot_container_links(handle):
        del handle[name]
    entry = handle["entry"]
    group = _replace_group(entry, SHOT_CONTAINERS_GROUP)
    group.attrs["NX_class"] = "NXcollection"
    group.attrs["damnit_source"] = "shot_containers"
    group.attrs["description"] = (
        "Index of the per-shot NeXus containers in "
        f"{SHOTS_DIRNAME}/ this file links: each is an external link at the "
        "file's root named by its container stem, pointing at the container's "
        "/entry. Join /entry/shots on shot_key here, never by position."
    )
    folder = output_path.parent / SHOTS_DIRNAME
    with_files = {
        event.get("shot_key")
        for event in events
        if event.get("shot_key") and is_acquisition(event.get("metadata"))
    }
    linked_keys: list[str] = []
    linked_names: list[str] = []
    if folder.is_dir():
        checked = _InPlaceCache(output_path.parent / CONTAINER_CHECK_NAME)
        seen: set[str] = set()
        for shot in shots:
            shot_key = shot.get("shot_key")
            if not isinstance(shot_key, str) or shot_key in seen:
                continue
            if shot_key not in with_files:
                continue  # no file to convert in this build: nothing to link
            seen.add(shot_key)
            try:
                name = shot_container_name(shot_key)
            except ValueError:
                continue
            stem = name.removesuffix(".nxs")
            if stem in handle or not checked.in_place(folder / name, shot_key):
                continue
            handle[stem] = h5py.ExternalLink(f"{SHOTS_DIRNAME}/{name}", "/entry")
            linked_keys.append(shot_key)
            linked_names.append(stem)
        checked.save()
    string = h5py.string_dtype(encoding="utf-8")
    group.create_dataset("shot_key", data=linked_keys, dtype=string)
    group.create_dataset("container", data=linked_names, dtype=string)
    return len(linked_names)


# All 118 IUPAC element symbols, for the conservative formula check below.
_ELEMENTS = (
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co "
    "Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb "
    "Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re "
    "Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es "
    "Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og"
)
_ELEMENT_SYMBOLS = frozenset(_ELEMENTS.split())

_FORMULA_TOKEN = re.compile(r"([A-Z][a-z]?)(\d*)")


def _is_chemical_formula(value: str) -> bool:
    """True when *value* is a plain Hill-style formula (element symbols with
    optional integer counts, e.g. "Au", "Si3N4", "CH").

    Deliberately conservative: real target.material values are often trade
    names ("Formvar"), layer lists ("Si, Cu"), or gas mixes ("He + 5% N2"),
    which must NOT be stamped into NXsample.chemical_formula (profile doc
    section 2, v0.4).
    """
    text = value.strip()
    if not text or not re.fullmatch(r"(?:[A-Z][a-z]?\d*)+", text):
        return False
    return all(symbol in _ELEMENT_SYMBOLS for symbol, _ in _FORMULA_TOKEN.findall(text))


def write_nexus_sample(entry_group: h5py.Group, target: Any) -> None:
    """Write `/entry/sample` (`NXsample`) from `metadata.target.*`.

    Implements hzdr/docs/target-ontology.md §8 exactly. Tolerates the legacy flat
    string form of `metadata.target` (§7) by normalizing it first via
    `_normalize_target_metadata`. Missing/None fields are skipped entirely -
    never written as null/empty into HDF5 datasets or attributes. `@units`
    attributes are pulled from `METADATA_KEY_REGISTRY` (not hardcoded), so a
    registry change cannot silently drift out of sync with what gets stamped
    on disk.

    HELPMI is finished (2026-07-02) and will publish no further base classes,
    so the group is `NXsample` permanently (no planned `NXtarget` wait). The
    group also carries the HZDR-local compatibility profile attrs
    `damnit_nx_class="NXhzdr_target"` and `damnit_nxdl_version` (see
    hzdr/docs/nxhzdr-target-profile.md). The profile's NXDL lives at
    hzdr/nxdl/NXhzdr_target.nxdl.xml (declared via /entry/definition, written
    by write_nexus_bridge). Decision closed 2026-07-18 (profile doc §6):
    NX_class stays "NXsample" permanently — /entry/definition plus
    damnit_nx_class carry the profile identity, and swapping the class would
    break generic NXsample consumers for no validation gain.
    """
    target = _normalize_target_metadata(target)
    if not isinstance(target, dict):
        target = {}

    sample = entry_group.require_group("sample")
    sample.attrs["NX_class"] = "NXsample"
    sample.attrs["damnit_nx_class"] = "NXhzdr_target"
    sample.attrs["damnit_nxdl_version"] = HZDR_TARGET_PROFILE_VERSION

    _write_optional_string_dataset(sample, "name", target.get("name"))
    # Ontology-required classification (target-ontology.md section 3 enum);
    # standard NXsample field name, HZDR enum values. Profile v0.5.
    _write_optional_string_dataset(sample, "type", target.get("type"))
    material = target.get("material")
    _write_optional_string_dataset(sample, "material", material)
    if material is not None and _is_chemical_formula(str(material)):
        _write_optional_string_dataset(sample, "chemical_formula", material)
    _write_optional_numeric_dataset(
        sample, "thickness", target.get("thickness"), unit_key="target.thickness"
    )
    _write_optional_numeric_dataset(
        sample, "diameter", target.get("diameter"), unit_key="target.diameter"
    )
    _write_optional_numeric_dataset(
        sample,
        "temperature",
        target.get("temperature"),
        unit_key="target.temperature",
    )
    _write_optional_numeric_dataset(
        sample,
        "gas_pressure",
        target.get("gas_pressure"),
        unit_key="target.gas_pressure",
    )
    _write_optional_string_dataset(
        sample, "substrate_material", target.get("substrate_material")
    )
    _write_optional_string_dataset(sample, "description", target.get("notes"))

    provenance = target.get("provenance")
    if provenance is not None:
        sample.attrs["damnit_provenance"] = str(provenance)
    wiki_ref = target.get("wiki_ref")
    if wiki_ref is not None:
        sample.attrs["target_ref"] = str(wiki_ref)
    gas_species = target.get("gas_species")
    if gas_species is not None:
        sample.attrs["gas_species"] = str(gas_species)

    properties = target.get("properties")
    if isinstance(properties, dict):
        for key, value in properties.items():
            if value is None:
                continue
            sample.attrs[f"prop_{key}"] = value


def write_nexus_vacuum_group(entry_group: h5py.Group, vacuum: dict[str, Any]) -> None:
    """Write `/entry/sample/environment` (`NXenvironment`) from `metadata.vacuum.*`.

    The chamber vacuum describes the sample surroundings, so it lands under
    NXsample as an NXenvironment group — the canonical placement the
    nexus-design-studio catalog assigns the class (BASE_CLASS_PATHS:
    NXenvironment -> /entry/sample/environment). `@units` come from
    METADATA_KEY_REGISTRY like every other namespaced writer. Since profile
    v0.6 the NXhzdr_target application definition covers this group (optional
    NXenvironment under sample — see hzdr/docs/nexus-semantic-maps.md §3); the
    sample profile marker attrs are still stamped when absent so a vacuum-only
    file keeps /entry/sample certifiable.
    """
    sample = entry_group.require_group("sample")
    if "NX_class" not in sample.attrs:
        sample.attrs["NX_class"] = "NXsample"
        sample.attrs["damnit_nx_class"] = "NXhzdr_target"
        sample.attrs["damnit_nxdl_version"] = HZDR_TARGET_PROFILE_VERSION

    environment = sample.require_group("environment")
    environment.attrs["NX_class"] = "NXenvironment"
    _write_optional_string_dataset(environment, "description", "target chamber vacuum")
    _write_optional_numeric_dataset(
        environment,
        "chamber_pressure",
        vacuum.get("chamber_pressure"),
        unit_key="vacuum.chamber_pressure",
    )
    _write_optional_numeric_dataset(
        environment,
        "pre_shot_pressure",
        vacuum.get("pre_shot_pressure"),
        unit_key="vacuum.pre_shot_pressure",
    )
    _write_optional_string_dataset(
        environment,
        "rga_dominant_species",
        vacuum.get("rga_dominant_species"),
    )


def _collect_laser_series(shots: list[dict[str, Any]]) -> dict[str, list[float]]:
    """Numeric `metadata.laser.<key>` series across shots, NaN where absent."""
    series: dict[str, list[float]] = {}
    for index, shot in enumerate(shots):
        metadata = shot.get("metadata")
        laser = metadata.get("laser") if isinstance(metadata, dict) else None
        if not isinstance(laser, dict):
            continue
        for key, value in laser.items():
            name = str(key)
            if not _DIAGNOSTIC_NAME_PATTERN.fullmatch(name):
                continue
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                series.setdefault(name, [np.nan] * len(shots))[index] = float(value)
    return series


def write_nexus_laser_shot_series(
    entry_group: h5py.Group, shots: list[dict[str, Any]]
) -> None:
    """Write `/entry/instrument/laser/shot_series` (`NXdata`): per-shot laser values.

    The campaign-level `/entry/instrument/laser` NXsource (+ nested NXbeam)
    holds a first-shot snapshot; per-shot variation (energy jitter is data,
    not noise) was previously dropped by the warn-once picker. Every numeric
    `metadata.laser.<key>` seen on any shot becomes a shot-indexed dataset
    here, aligned with the canonical `/entry/shots` table, NaN where a shot
    lacks the key, `@units` from METADATA_KEY_REGISTRY. String-valued keys
    (system, polarization) stay campaign-level in the NXsource group. The
    signal is `pulse_energy` when present (standards-alignment section 3.7:
    LaserData series belong in per-shot NXbeam-shaped data, not only in a
    campaign scalar).
    """
    series = _collect_laser_series(shots)
    if not series:
        return

    instrument = entry_group.require_group("instrument")
    if "NX_class" not in instrument.attrs:
        instrument.attrs["NX_class"] = "NXinstrument"
    laser_group = instrument.require_group("laser")
    if "NX_class" not in laser_group.attrs:
        laser_group.attrs["NX_class"] = "NXsource"
    group = _replace_group(laser_group, "shot_series")
    group.attrs["NX_class"] = "NXdata"
    names = sorted(series)
    signal = "pulse_energy" if "pulse_energy" in series else names[0]
    group.attrs["signal"] = signal
    group.attrs["axes"] = "shot_index"
    auxiliary = [name for name in names if name != signal]
    if auxiliary:
        group.attrs["auxiliary_signals"] = auxiliary
    group.create_dataset("shot_index", data=list(range(len(shots))))
    for name in names:
        dataset = group.create_dataset(name, data=series[name])
        unit = METADATA_KEY_REGISTRY.get(f"laser.{name}")
        if unit is not None:
            dataset.attrs["units"] = unit


# Data-product kind -> NeXus-style detector_type tag (standards-alignment
# section 3.6). Deliberately small and exact: an unknown kind still gets its
# NXdetector group, just without a detector_type claim.
_DETECTOR_TYPE_BY_KIND = {
    "streak_camera": "STREAK",
    "proton_spectrometer": "POS",
    "thomson_parabola": "THOMSON",
    "frog": "FROG",
    "scintillator": "SCINT",
}

# Generic transport kinds that describe how a product arrived, not what
# recorded it - they carry no detector identity to promote.
_NON_DETECTOR_PRODUCT_KINDS = frozenset({"hdf5_dataset", "file"})


def write_nexus_detector_groups(
    entry_group: h5py.Group, products: list[dict[str, Any]]
) -> None:
    """Write one `NXdetector` group per data-product kind.

    `/entry/data_products` stays the flat transport table; this adds the
    semantic layer standards-alignment section 3.6/3.7 calls for: per kind a
    `/entry/instrument/detector_<kind>` (`NXdetector`) group carrying
    `detector_type` (when the kind maps to a known tag) and the
    product-id/shot-key/file-path/dataset-name references back to the rows,
    so a NeXus reader can find "everything this diagnostic recorded" without
    knowing DAMNIT's table layout. Generic transport kinds (`hdf5_dataset`,
    `file`) are skipped - they say how a product arrived, not what recorded
    it. Groups owned by someone else are never overwritten.
    """
    by_kind: dict[str, list[dict[str, Any]]] = {}
    for product in products:
        kind = str(product.get("kind") or "")
        if not kind or kind in _NON_DETECTOR_PRODUCT_KINDS:
            continue
        if not _DIAGNOSTIC_NAME_PATTERN.fullmatch(kind):
            continue
        by_kind.setdefault(kind, []).append(product)
    if not by_kind:
        return

    instrument = entry_group.require_group("instrument")
    if "NX_class" not in instrument.attrs:
        instrument.attrs["NX_class"] = "NXinstrument"
    for kind in sorted(by_kind):
        name = f"detector_{kind}"
        if not _claim_damnit_group(instrument, name, "data_products"):
            logger.warning(
                "Skipping detector group %r: /entry/instrument/%s already "
                "exists and is not a DAMNIT data-product detector group",
                kind,
                name,
            )
            continue
        detector = instrument.create_group(name)
        detector.attrs["NX_class"] = "NXdetector"
        detector.attrs["damnit_source"] = "data_products"
        detector.attrs["description"] = (
            f"Data products of kind '{kind}'; rows in /entry/data_products."
        )
        detector_type = _DETECTOR_TYPE_BY_KIND.get(kind)
        if detector_type is not None:
            detector.attrs["detector_type"] = detector_type
        rows = by_kind[kind]
        detector.create_dataset(
            "product_ids", data=[str(row.get("product_id") or "") for row in rows]
        )
        detector.create_dataset(
            "shot_keys", data=[str(row.get("shot_key") or "") for row in rows]
        )
        detector.create_dataset(
            "file_paths", data=[str(row.get("path") or "") for row in rows]
        )
        detector.create_dataset(
            "dataset_names",
            data=[str(row.get("dataset_name") or "") for row in rows],
        )


# Known pre-namespace producer spellings of diagnostic scalars, folded into
# `metadata.diagnostic.*` by the NeXus writer. Since 2026-07-18 the
# diagnostic.* namespace is registry-backed (METADATA_KEY_REGISTRY carries
# `diagnostic.<name>` entries and LEGACY_KEY_MAP maps these flat spellings),
# so the linter warns about them too; this fold stays here because it moves
# data, which the warn-only linter never does. Producers should emit
# metadata.diagnostic.<name> going forward.
_LEGACY_DIAGNOSTIC_SCALARS = ("xray_counts", "detector_signal_mean", "alignment_score")

_DIAGNOSTIC_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _shot_diagnostic_values(shot: dict[str, Any]) -> dict[str, Any]:
    """One shot's diagnostic scalars: namespaced dict plus legacy flat spellings."""
    metadata = shot.get("metadata")
    if not isinstance(metadata, dict):
        return {}
    values: dict[str, Any] = {}
    for legacy_key in _LEGACY_DIAGNOSTIC_SCALARS:
        if metadata.get(legacy_key) is not None:
            values[legacy_key] = metadata[legacy_key]
    diagnostic = metadata.get("diagnostic")
    if isinstance(diagnostic, dict):
        for name, value in diagnostic.items():
            if value is not None:
                # The namespaced spelling wins over a legacy duplicate.
                values[str(name)] = value
    return values


def write_nexus_diagnostic_groups(
    entry_group: h5py.Group, shots: list[dict[str, Any]]
) -> None:
    """Write one `NXdetector` group per `metadata.diagnostic.*` scalar.

    Each diagnostic key becomes `/entry/instrument/<key>` (`NXdetector`) with
    a shot-indexed `data` dataset aligned with the canonical `/entry/shots`
    table - multiple NXdetector groups under NXinstrument is standard NeXus,
    and NXdetector is the nexus-design-studio ruling for the `diagnostic.*`
    registry namespace. Unlike the laser/target/vacuum campaign-level groups
    these are inherently per-shot QA scalars, so the full series is written
    (NaN / "" where a shot lacks the key) instead of a first-shot snapshot.
    `@units` comes from METADATA_KEY_REGISTRY when a `diagnostic.<key>` entry
    exists; a name that collides with a non-DAMNIT group (e.g. a preserved
    LabFrog projection group) is skipped with a warning, never overwritten.
    """
    series: dict[str, list[Any]] = {}
    for index, shot in enumerate(shots):
        for name, value in _shot_diagnostic_values(shot).items():
            series.setdefault(name, [None] * len(shots))[index] = value
    if not series:
        return

    instrument = entry_group.require_group("instrument")
    if "NX_class" not in instrument.attrs:
        instrument.attrs["NX_class"] = "NXinstrument"
    for name in sorted(series):
        if not _DIAGNOSTIC_NAME_PATTERN.fullmatch(name):
            logger.warning("Skipping diagnostic %r: not a safe HDF5 group name", name)
            continue
        if not _claim_damnit_group(instrument, name, "metadata.diagnostic"):
            logger.warning(
                "Skipping diagnostic %r: /entry/instrument/%s already exists "
                "and is not a DAMNIT diagnostic group",
                name,
                name,
            )
            continue
        _write_diagnostic_detector(instrument, name, series[name])


def _claim_damnit_group(parent: h5py.Group, name: str, damnit_source: str) -> bool:
    """Delete a previously DAMNIT-written child so it can be rewritten.

    Returns False (claim refused) when the name is taken by anything that
    does not carry the matching `damnit_source` marker — e.g. a preserved
    LabFrog projection group — so preserved content is never overwritten.
    """
    existing = parent.get(name)
    if existing is None:
        return True
    if (
        not isinstance(existing, h5py.Group)
        or existing.attrs.get("damnit_source") != damnit_source
    ):
        return False
    del parent[name]
    return True


def _write_diagnostic_detector(
    instrument: h5py.Group, name: str, values: list[Any]
) -> None:
    detector = instrument.create_group(name)
    detector.attrs["NX_class"] = "NXdetector"
    detector.attrs["damnit_source"] = "metadata.diagnostic"
    detector.attrs["coordinates"] = "/entry/shots/shot_index"
    numeric = all(
        value is None
        or (isinstance(value, (int, float)) and not isinstance(value, bool))
        for value in values
    )
    if numeric:
        data = detector.create_dataset(
            "data",
            data=[np.nan if value is None else float(value) for value in values],
        )
    else:
        data = detector.create_dataset(
            "data",
            data=["" if value is None else str(value) for value in values],
        )
    unit = METADATA_KEY_REGISTRY.get(f"diagnostic.{name}")
    if unit is not None:
        data.attrs["units"] = unit


def _write_optional_string_dataset(
    group: h5py.Group, name: str, value: Any, *, source: str | None = None
) -> None:
    if value is None:
        return
    if name in group:
        del group[name]
    dataset = group.create_dataset(name, data=str(value))
    if source is not None:
        dataset.attrs["damnit_source"] = source


def _write_optional_numeric_dataset(
    group: h5py.Group,
    name: str,
    value: Any,
    *,
    unit_key: str,
    source: str | None = None,
) -> None:
    if value is None:
        return
    if name in group:
        del group[name]
    dataset = group.create_dataset(name, data=float(value))
    unit = METADATA_KEY_REGISTRY.get(unit_key)
    if unit is not None:
        dataset.attrs["units"] = unit
    if source is not None:
        dataset.attrs["damnit_source"] = source


def write_sources_catalog(
    *,
    sources_file: Path,
    source_key: str,
    experiment_id: str,
    nexus_path: Path,
    shots: list[dict[str, Any]],
    events: list[dict[str, Any]] | None = None,
    scicat: dict[str, Any] | None = None,
    merge: bool = False,
    title: str | None = None,
) -> None:
    """Write DAMNIT-web's compact source catalog from canonical shots.

    `events` is the full normalized event list from `reconcile_canonical_shots`
    (matched, ambiguous, and unmatched). Matched events are already visible via
    their shot's `events` list; here we additionally surface the ambiguous and
    unmatched ones as `review_events`, plus a `match_summary` count, since
    otherwise they are only ever written to the NeXus file's `source_events`
    group and have no API/frontend visibility at all.

    By default the file holds this one source. With ``merge`` (multi-campaign
    builds, which share one catalog) only the entry with ``source_key`` is
    replaced and every other source is kept, under ``catalog_write_lock`` so
    two builders cannot drop each other's entry.
    """
    current_shots = [
        dict(shot)
        for shot in shots
        if not _as_bool(shot.get("metadata", {}).get("has_newer_version"))
    ]
    review_events = [
        _review_event_api_record(event)
        for event in (events or [])
        if event.get("match_status") in {"ambiguous", "unmatched"}
    ]
    decisions = load_review_decisions(sources_file, source_key)
    review_events, current_shots = _apply_review_decisions(
        review_events, current_shots, decisions
    )
    match_summary = _build_match_summary(current_shots, review_events)
    source_metadata: dict[str, Any] = {
        "facility": "HZDR",
        "source_type": "canonical-nexus",
        "integration_profile": HZDR_BRIDGE_PROFILE_VERSION,
        "experiment_id": experiment_id,
        "canonical_nexus_path": str(nexus_path),
        "combined_hdf5_path": str(nexus_path),
        "catalog_built_at": datetime.now(UTC).isoformat(),
    }
    # SciCat registration (scicat_pid, dataset URL, version hash, …) is stamped
    # here so it flows to the /scicat API endpoint and back-populates
    # payload_ref.scicat_pid via the NeXus bridge target reader.
    if scicat:
        source_metadata.update(scicat)
    source = {
        "key": source_key,
        "title": title or f"HZDR canonical campaign ({experiment_id})",
        "damnit_path": str(sources_file.parent / "damnit" / source_key),
        "data_paths": [str(nexus_path)],
        "metadata": source_metadata,
        "shots": [
            {
                **shot,
                "hdf5_path": str(nexus_path),
                "nexus_entry": "/entry",
            }
            for shot in current_shots
        ],
        "review_events": review_events,
        "match_summary": match_summary,
    }
    if not merge:
        write_json_atomic(sources_file, {"sources": [source]})
        return
    with catalog_write_lock(sources_file):
        write_json_atomic(sources_file, _merged_catalog(sources_file, source))


def _merged_catalog(sources_file: Path, source: dict[str, Any]) -> dict[str, Any]:
    """The catalog on disk with ``source`` put in place of its old entry.

    A catalog that cannot be read is replaced, with a warning: every
    multi-campaign run rebuilds each campaign, so the other entries return
    within that run.
    """
    payload: dict[str, Any] = {}
    records: list[Any] = []
    if sources_file.exists():
        try:
            existing = json.loads(sources_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Replacing unreadable catalog %s: %s", sources_file, exc)
            existing = {}
        if isinstance(existing, dict):
            payload = existing
            records = list(existing.get("sources") or [])
        elif isinstance(existing, list):
            records = existing
    merged: list[Any] = []
    placed = False
    for record in records:
        if isinstance(record, dict) and record.get("key") == source["key"]:
            if not placed:
                merged.append(source)
                placed = True
            continue
        merged.append(record)
    if not placed:
        merged.append(source)
    return {**payload, "sources": merged}


@contextlib.contextmanager
def catalog_write_lock(
    sources_file: Path, *, timeout_s: float = 60.0, poll_s: float = 0.2
) -> Iterator[None]:
    """Serialise read-merge-write updates of one shared catalog.

    The same PID-stamped lock file as ``single_writer_lock`` (next to the
    catalog), but a second builder waits for it instead of failing: a merge
    holds it only for one read and one atomic write.
    """
    deadline = time.monotonic() + timeout_s
    with contextlib.ExitStack() as stack:
        while True:
            try:
                left = max(0.0, deadline - time.monotonic())
                stack.enter_context(
                    single_writer_lock(sources_file, guard_timeout=left)
                )
                break
            except BuilderAlreadyRunningError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(poll_s)
        yield


def _review_event_api_record(event: dict[str, Any]) -> dict[str, Any]:
    """Build the API-facing record for one ambiguous or unmatched event.

    Unlike `_event_api_record` (used for events already attached to a shot),
    this keeps `match_status`, `experiment_id`, `shot_number`, and
    `candidate_shot_keys` since a reviewer needs them to decide what to do.
    """
    return {
        key: event.get(key)
        for key in (
            "event_id",
            "experiment_id",
            "shot_number",
            "source",
            "kind",
            "timestamp",
            "transport",
            "payload_ref",
            "metadata",
            "match_status",
            "match_quality",
            "candidate_shot_keys",
        )
        if event.get(key) is not None
    }


def _build_match_summary(
    shots: list[dict[str, Any]], review_events: list[dict[str, Any]]
) -> dict[str, int]:
    """Count matched/ambiguous/unmatched, the literal go-live-gate wording.

    "matched" counts shots whose match_status is "matched" - i.e. at least one
    non-LabFrog event was actually linked to them. Every shot also gets its own
    synthetic LabFrog event appended unconditionally (see the labfrog_event loop
    above), so shot.get("events") is always truthy and cannot be used to tell
    "an external producer matched this shot" from "labfrog-only" - match_status
    is set before that append and is the field that actually distinguishes them.

    confirmed/dismissed reflect operator review actions merged from the
    sidecar (via _apply_review_decisions) before this is called, so they
    survive a rebuild. routers._recompute_match_summary uses the same logic
    for the live catalog-edit path (after a confirm/dismiss HTTP call).
    """
    matched = sum(1 for shot in shots if shot.get("match_status") == "matched")
    ambiguous = sum(
        1 for event in review_events if event.get("match_status") == "ambiguous"
    )
    unmatched = sum(
        1
        for event in review_events
        if event.get("match_status") == "unmatched" and not event.get("acknowledged")
    )
    confirmed = sum(
        1
        for shot in shots
        for event in shot.get("events", [])
        if event.get("match_quality") == "operator_confirmed"
    )
    dismissed = sum(
        1
        for event in review_events
        if event.get("match_status") == "unmatched" and event.get("acknowledged")
    )
    return {
        "matched": matched,
        "ambiguous": ambiguous,
        "unmatched": unmatched,
        "confirmed": confirmed,
        "dismissed": dismissed,
    }


def make_shot_key(experiment_id: str, shot_date: str | None, shot_number: int) -> str:
    """Build the stable cross-system key used by source events and products."""
    date_token = (shot_date or "unknown").replace("-", "")
    return f"{experiment_id}:{date_token}:{shot_number:06d}"


def parse_datetime(value: Any, *, naive_timezone: str = "UTC") -> datetime | None:
    """Parse common ISO timestamps and normalize naive values to UTC."""
    if isinstance(value, datetime):
        parsed = value
    elif value in (None, ""):
        return None
    else:
        try:
            parsed = datetime.fromisoformat(str(value))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=resolve_timezone(naive_timezone))
    return parsed.astimezone(UTC)


def resolve_timezone(name: str) -> ZoneInfo:
    """Resolve a configured IANA timezone and report configuration errors."""
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        message = f"Unknown campaign timezone: {name}"
        raise ValueError(message) from exc


def source_date(value: Any) -> str | None:
    """Keep the calendar date recorded by LabFrog for date-scoped shot IDs."""
    text = _as_optional_string(value)
    if not text:
        return None
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", text)
    return match.group(1) if match else None


def preview_kind_for_shape(shape: Iterable[int]) -> str:
    """Map an array shape to the existing DAMNIT preview vocabulary."""
    dimensions = tuple(shape)
    if not dimensions or dimensions == (1,):
        return "scalar"
    if len(dimensions) == 1:
        return "line"
    if len(dimensions) == 2:
        return "image"
    return "stack"


def source_group_name(source: str) -> str:
    """Map external producer names to stable NeXus group names."""
    normalized = source.lower().replace("planet-", "").replace("_", "-")
    if "laser" in normalized or "asapo" in normalized:
        return "laserdata"
    if "watchdog" in normalized:
        return "watchdog"
    if "labfrog" in normalized or "shotsheet" in normalized:
        return "labfrog"
    return safe_hdf5_name(normalized)


def normalize_watchdog_document(
    document: dict[str, Any], *, experiment_id: str
) -> dict[str, Any]:
    """Adapt a DAQ File Watchdog processed document to the shared event contract."""
    event = document.get("event", {})
    analysis = document.get("analysis", {})
    shot_number = _find_nested_shot_number(document)
    shot_id = str(
        document.get("shot_id")
        or (f"shot-{shot_number:06d}" if shot_number is not None else "")
    )
    if not shot_id:
        message = "Watchdog document does not contain a usable shot identifier"
        raise ValueError(message)
    timestamp = _as_optional_string(
        document.get("timestamp")
        or (event.get("timestamp") if isinstance(event, dict) else None)
    )
    if not timestamp:
        message = "Watchdog document does not contain an event timestamp"
        raise ValueError(message)

    watch = document.get("watch", {})
    watch_name = (
        watch.get("watch_name") if isinstance(watch, dict) else None
    ) or "file"
    payload_ref: dict[str, Any] = {}
    if isinstance(event, dict):
        _copy_payload_ref_fields(event, payload_ref)
        path = _first_string(event, "filepath", "filepath_src", "file_path", "path")
        if path and "filepath" not in payload_ref:
            payload_ref["filepath"] = path
        if event.get("filename"):
            payload_ref["filename"] = event["filename"]
    _copy_payload_ref_fields(document, payload_ref)
    kafka = document.get("_kafka", {})
    if isinstance(kafka, dict):
        _copy_payload_ref_fields(kafka, payload_ref)
    metadata = {
        "watch": _json_safe(watch),
        "analysis": _json_safe(analysis),
    }
    for attachment_name in ("zmq_data", "kafka_data"):
        if attachment_name in document:
            metadata[attachment_name] = _json_safe(document[attachment_name])
    normalized = {
        "experiment_id": experiment_id,
        "shot_id": shot_id,
        "shot_number": shot_number,
        "source": "DAQ-File-Watchdog",
        "kind": f"watchdog.{safe_hdf5_name(str(watch_name))}",
        "timestamp": timestamp,
        "transport": "kafka",
        "payload_ref": payload_ref,
        "metadata": metadata,
    }
    normalized["event_id"] = _event_id(normalized)
    return normalized


def _selected_trigger_experiment(
    override: str | None, document_experiment: str | None
) -> str | None:
    """Apply the builder's --experiment-id override, except to the sentinel.

    A trigger that says it does not know its campaign (``unassigned``, decision
    D1) keeps saying so, so the resolution stage in reconcile_canonical_shots
    can route it; overriding it here would silently claim every shot in the
    shared ``_unassigned`` spool for whichever campaign happened to build.
    """
    if document_experiment == UNASSIGNED_EXPERIMENT_ID:
        return document_experiment
    return _as_optional_string(override or document_experiment)


def _normalize_hzdr_event_v1_trigger(
    document: dict[str, Any], *, experiment_id: str | None = None
) -> dict[str, Any]:
    """Pass through a shotcounter hzdr-event-v1 Kafka envelope with minimal adaptation.

    The shotcounter branch emits a flat dict with schema_version, event_id,
    experiment_id, shot_number, source, kind, trigger_role (top-level),
    timestamp, transport, payload_ref, values, and metadata. It is already
    in the canonical shape; we only need to:
    - Override experiment_id if the caller supplies one (builder --experiment-id
      flag) - unless the envelope carries the ``unassigned`` sentinel.
    - Normalise shot_id from shot_number, matching the convention used for the
      legacy path.
    - Strip trigger_role from the top level (it belongs in metadata.trigger.role,
      same as the legacy path produces) so downstream code sees one consistent shape.
    """
    selected_experiment = _selected_trigger_experiment(
        experiment_id, _as_optional_string(document.get("experiment_id"))
    )
    if not selected_experiment:
        message = "hzdr-event-v1 trigger message does not contain experiment_id"
        raise ValueError(message)

    event_id = _as_optional_string(document.get("event_id"))
    if not event_id:
        message = "hzdr-event-v1 trigger message does not contain event_id"
        raise ValueError(message)

    shot_number = _as_optional_int(document.get("shot_number"))
    # trigger_role: current producers fold this into metadata.trigger.role before
    # sending, so document.get("trigger_role") is typically None. The pop+setdefault
    # below is kept as a shim for in-flight events from older producer versions.
    trigger_role = safe_hdf5_name(
        _as_optional_string(document.get("trigger_role")) or "threshold_crossing"
    )

    normalized = dict(document)
    normalized["experiment_id"] = selected_experiment
    normalized["shot_id"] = (
        f"shot-{shot_number:06d}"
        if shot_number is not None
        else f"unassigned-{event_id}"
    )
    normalized.pop("trigger_role", None)  # shim: no-op for current producers
    metadata = dict(normalized.get("metadata") or {})
    trigger_meta = dict(metadata.get("trigger") or {})
    trigger_meta.setdefault("role", trigger_role)
    metadata["trigger"] = trigger_meta
    normalized["metadata"] = metadata

    if shot_number is None:
        normalized.pop("shot_number", None)

    return normalized


def normalize_processed_trigger_message(
    document: dict[str, Any], *, experiment_id: str | None = None
) -> dict[str, Any]:
    """Adapt a trigger payload to the shared event contract.

    Accepts two shapes:
    - A flat ``hzdr-event-v1`` envelope (shotcounter's Kafka output): returned
      directly after validating the required fields are present, with
      ``experiment_id`` overridden if the caller provides one.
    - The legacy ``processed_message`` wrapper (ZMQ relay / pre-branch Kafka):
      adapted into the same envelope shape.
    """
    if document.get("schema_version") == "hzdr-event-v1":
        return _normalize_hzdr_event_v1_trigger(document, experiment_id=experiment_id)

    payload = document.get("processed_message", document)
    if not isinstance(payload, dict):
        message = "processed_message must be an object"
        raise ValueError(message)

    selected_experiment = _selected_trigger_experiment(
        experiment_id,
        _as_optional_string(payload.get("experiment_id") or payload.get("Campaign")),
    )
    if not selected_experiment:
        message = "Trigger message does not contain Campaign/experiment_id"
        raise ValueError(message)

    channel_id = _as_optional_string(payload.get("channel_id") or payload.get("Name"))
    if not channel_id:
        message = "Trigger message does not contain Name/channel_id"
        raise ValueError(message)

    timestamp = _as_optional_string(
        payload.get("timestamp") or payload.get("Event_timestamp")
    )
    if not timestamp:
        message = "Trigger message does not contain Event_timestamp/timestamp"
        raise ValueError(message)

    shot_number = _as_optional_int(
        payload.get("shot_number") or payload.get("Shot_number")
    )
    trigger_role = safe_hdf5_name(
        _as_optional_string(payload.get("trigger_role") or payload.get("Trigger_role"))
        or "threshold_crossing"
    )
    kafka = document.get("_kafka", {})
    payload_ref: dict[str, Any] = {
        "channel_id": channel_id,
        "key": "processed_message",
    }
    _copy_payload_ref_fields(document, payload_ref)
    _copy_payload_ref_fields(payload, payload_ref)
    if isinstance(kafka, dict):
        _copy_payload_ref_fields(kafka, payload_ref)

    adc_value = payload.get("adc_value", payload.get("ADC_value"))
    metadata = {
        "trigger": {
            "channel_id": channel_id,
            "nickname": payload.get("nickname", payload.get("Nickname")),
            "role": trigger_role,
            "threshold": payload.get("threshold", payload.get("Trigger_threshold")),
            "comparison": payload.get("comparison", ">"),
            "adc_value": adc_value,
            "adc_unit": payload.get("adc_unit", payload.get("ADC_unit")),
            "channel_trigger_count": payload.get(
                "channel_trigger_count", payload.get("Channel_counter")
            ),
            "acquisition_run_id": payload.get("run_id", payload.get("Run_id")),
            "sample_counter_10hz": payload.get(
                "sample_counter_10hz", payload.get("10Hz_counter")
            ),
        },
        "legacy_message_type": "processed_message",
    }
    normalized: dict[str, Any] = {
        "experiment_id": selected_experiment,
        "shot_id": (
            f"shot-{shot_number:06d}" if shot_number is not None else "unassigned"
        ),
        "source": "DRACO-Trigger",
        "kind": f"trigger.{trigger_role}",
        "timestamp": timestamp,
        "transport": "kafka",
        "payload_ref": payload_ref,
        "metadata": metadata,
    }
    if shot_number is not None:
        normalized["shot_number"] = shot_number
    if isinstance(adc_value, int | float):
        normalized["values"] = [float(adc_value)]
    normalized["event_id"] = str(
        document.get("event_id") or payload.get("event_id") or _event_id(normalized)
    )
    if shot_number is None:
        normalized["shot_id"] = f"unassigned-{normalized['event_id']}"
    return normalized


def safe_hdf5_name(value: str) -> str:
    """Return a stable HDF5 path component for source-controlled labels."""
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", value.strip())
    return cleaned or "unnamed"


def _copy_payload_ref_fields(source: dict[str, Any], target: dict[str, Any]) -> None:
    """Copy canonical traceability aliases into ``payload_ref``.

    Producers still use a few historical field names. Keep those legacy extras
    when already present, but always populate the canonical names used by
    HZDRPayloadRef so replay/debug tooling has one stable place to look.
    """
    for key in ("topic", "partition", "offset"):
        if source.get(key) is not None:
            target[key] = source[key]

    message_key = _first_string(source, "message_key", "key")
    if message_key is not None:
        target["message_key"] = message_key
        target.setdefault("key", message_key)

    uri = _first_string(source, "uri", "file_uri", "fileUri", "url")
    if uri is not None:
        target["uri"] = uri

    path = _first_string(source, "path", "filepath", "file_path", "filepath_src")
    if path is not None:
        target["path"] = path
        if "filepath" in source:
            target.setdefault("filepath", path)

    mongo_id = _first_string(
        source, "mongo_id", "mongoId", "mongodb_id", "mongo_record_id", "_id"
    )
    if mongo_id is not None:
        target["mongo_id"] = mongo_id

    scicat_pid = _first_string(source, "scicat_pid", "scicatPid", "pid")
    if scicat_pid is not None:
        target["scicat_pid"] = scicat_pid


# LabFrog's not-a-shot marker (automatic shot assembly plan W10). LabFrog's
# labfrog/helpers/choices.py owns the vocabulary; labfrog-sqlite-tools exports
# it as shots.shot_status (schema v12). DAMNIT only carries it.
LABFROG_SHOT_STATUS_VALUES = ("shot", "misfire", "test", "dark", "calibration")
DEFAULT_LABFROG_SHOT_STATUS = "shot"


def labfrog_shot_status(value: Any) -> str:
    """Return a LabFrog record's shot_status; absent, NULL or empty is "shot".

    A known value comes back lower-case. An unknown one is kept as written and
    logged, never coerced to "shot": carrying it is the contract, and turning
    an unexpected status into a real shot would hide it.
    """
    text = _as_optional_string(value)
    text = text.strip() if text else ""
    if not text:
        return DEFAULT_LABFROG_SHOT_STATUS
    folded = text.casefold()
    if folded in LABFROG_SHOT_STATUS_VALUES:
        return folded
    logger.warning(
        "LabFrog shot_status %r is not one of %s; carried as written",
        text,
        ", ".join(LABFROG_SHOT_STATUS_VALUES),
    )
    return text


def _canonical_from_labfrog(
    record: dict[str, Any], experiment_id: str, source_key: str
) -> dict[str, Any]:
    shot_number = record.get("shot_number")
    if shot_number is None:
        message = "LabFrog shot rows must contain shot_number"
        raise ValueError(message)
    shot_date = _as_optional_string(record.get("shot_date"))
    canonical: dict[str, Any] = {
        "source_key": source_key,
        "shot_number": int(shot_number),
        "fired_at": _as_optional_string(record.get("labfrog_date_time")) or "",
        "shot_key": make_shot_key(experiment_id, shot_date, int(shot_number)),
        "shot_date": shot_date,
        "labfrog_record_id": _as_optional_string(record.get("record_id")),
        "labfrog_date_time": _as_optional_string(record.get("labfrog_date_time")),
        "match_status": "labfrog-only",
        "match_quality": "labfrog_only",
        "match_time_delta_s": None,
        "metadata": {
            "experiment_id": experiment_id,
            "campaign": record.get("campaign"),
            **record.get("metadata", {}),
            # Every LabFrog-backed shot says whether it is a real shot; a
            # record or export without the field is one. Never used to drop a
            # shot - a misfire is built and flagged like any other.
            "shot_status": labfrog_shot_status(
                record.get("metadata", {}).get("shot_status")
            ),
        },
        "events": [],
        "data_products": [],
    }
    # Bridge profile v5: carried only when LabFrog has a count, so a shot
    # without one has no value invented for it (the column writes -1).
    local_count = _as_optional_int(record.get("local_count"))
    if local_count is not None:
        canonical["labfrog_local_count"] = local_count
    # The only number authoritative triggers are matched on (ruling R3).
    authority_number = _authority_number(record)
    if authority_number is not None:
        canonical["authority_shot_number"] = authority_number
    return canonical


def _labfrog_source_event(shot: dict[str, Any], experiment_id: str) -> dict[str, Any]:
    record_id = shot.get("labfrog_record_id") or shot["shot_key"]
    event = {
        "experiment_id": experiment_id,
        "shot_id": f"shot-{shot['shot_number']:06d}",
        "shot_number": shot["shot_number"],
        "source": "LabFrog",
        "kind": "shotsheet.row",
        "timestamp": shot.get("labfrog_date_time") or shot.get("fired_at") or "",
        "transport": "nexus",
        "payload_ref": {"record_id": record_id, "nexus_path": "/entry/shots"},
        # shot_status rides this row's metadata_json, so the NeXus file keeps
        # it without a new /entry/shots column (bridge profile unchanged).
        "metadata": {
            "campaign": shot.get("metadata", {}).get("campaign"),
            "shot_status": labfrog_shot_status(
                shot.get("metadata", {}).get("shot_status")
            ),
        },
        "shot_key": shot["shot_key"],
        "match_status": "canonical",
        "match_quality": "canonical_record",
        "match_time_delta_s": None,
    }
    event["event_id"] = (
        f"labfrog-{hashlib.sha256(str(record_id).encode()).hexdigest()[:16]}"
    )
    return event


def _identity_group_key(
    event: dict[str, Any], *, campaign_timezone: str
) -> tuple[str, int, str] | None:
    """(local date, shot number, shot_id): how LabFrog-less shots are grouped."""
    shot_number = _event_shot_number(event)
    if shot_number is None:
        return None
    timestamp = parse_datetime(event.get("timestamp"))
    shot_date = (
        timestamp.astimezone(resolve_timezone(campaign_timezone)).date().isoformat()
        if timestamp
        else None
    )
    return shot_date or "", shot_number, str(event.get("shot_id"))


def _canonical_from_event_identities(
    events: list[dict[str, Any]],
    experiment_id: str,
    source_key: str,
    *,
    campaign_timezone: str,
) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, int, str], list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        key = _identity_group_key(event, campaign_timezone=campaign_timezone)
        if key is None:
            continue
        grouped[key].append(event)

    shots: list[dict[str, Any]] = []
    for (shot_date, shot_number, shot_id), shot_events in grouped.items():
        shot_key = make_shot_key(experiment_id, shot_date or None, shot_number)
        api_events = []
        for event in shot_events:
            event["shot_key"] = shot_key
            event["match_quality"] = "event_identity"
            event["match_status"] = "matched"
            event["match_time_delta_s"] = None
            api_events.append(_event_api_record(event))
        fired_at = min(
            str(event["timestamp"]) for event in shot_events if event.get("timestamp")
        )
        shots.append({
            "source_key": source_key,
            "shot_number": shot_number,
            "fired_at": fired_at,
            "shot_key": shot_key,
            "shot_date": shot_date or None,
            "labfrog_record_id": None,
            "labfrog_date_time": None,
            "match_status": "matched",
            "match_quality": "event_identity",
            "match_time_delta_s": None,
            "metadata": {
                "experiment_id": experiment_id,
                "shot_id": shot_id,
                **_merged_event_metadata(shot_events),
            },
            "events": api_events,
            "data_products": build_event_data_products(api_events, shot_key=shot_key),
        })
    return sorted(
        shots, key=lambda shot: (shot["shot_date"] or "", shot["shot_number"])
    )


def _identity_match_result(
    matches: list[dict[str, Any]], quality: str
) -> tuple[dict[str, Any] | None, str, str, list[str]] | None:
    if len(matches) == 1:
        return matches[0], quality, "matched", []
    if len(matches) > 1:
        return None, "ambiguous", "ambiguous", [shot["shot_key"] for shot in matches]
    return None


def _shots_matching_event_id(
    event_id: str, candidates: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    return [
        shot
        for shot in candidates
        if _as_optional_string(shot.get("metadata", {}).get("kafka_event_id"))
        == event_id
    ]


def _shots_matching_transport_position(
    payload_ref: dict[str, Any], candidates: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Match on Kafka ``(topic, partition, offset)``, ignoring date scoping.

    This trusts that a transport position is globally unique and stable: the
    curated SQLite export writers (in the sibling LabFrog/shotcounter repos)
    must persist the *original* committed offset for each message and never
    rewrite or renumber it. A topic that is recreated/compacted such that an
    offset is reused would violate this; if that ever happens, fall back to
    identity (``kafka_event_id``) matching instead of offsets.
    """
    topic = _as_optional_string(payload_ref.get("topic"))
    partition = _as_optional_int(payload_ref.get("partition"))
    offset = _as_optional_int(payload_ref.get("offset"))
    if topic is None or partition is None or offset is None:
        return []

    matches = []
    for shot in candidates:
        metadata = shot.get("metadata", {})
        if not isinstance(metadata, dict):
            continue
        if (
            _as_optional_string(metadata.get("kafka_topic")) == topic
            and _as_optional_int(metadata.get("kafka_partition")) == partition
            and _as_optional_int(metadata.get("kafka_offset")) == offset
        ):
            matches.append(shot)
    return matches


def _match_event_identity(
    event: dict[str, Any], candidates: list[dict[str, Any]]
) -> tuple[dict[str, Any] | None, str, str, list[str]]:
    event_id = _as_optional_string(event.get("event_id"))
    if event_id:
        result = _identity_match_result(
            _shots_matching_event_id(event_id, candidates), "exact_kafka_event_id"
        )
        if result is not None:
            return result

    payload_ref = event.get("payload_ref")
    if isinstance(payload_ref, dict):
        result = _identity_match_result(
            _shots_matching_transport_position(payload_ref, candidates),
            "exact_transport_position",
        )
        if result is not None:
            return result
    return None, "unmatched", "unmatched", []


def _match_event(
    event: dict[str, Any],
    shots: list[dict[str, Any]],
    *,
    match_tolerance_s: float,
    campaign_timezone: str,
    time_match_autoassign: bool = False,
) -> tuple[dict[str, Any] | None, str, str, list[str]]:
    """Match one event to a canonical shot.

    Returns (matched_shot_or_None, match_quality, match_status, candidate_shot_keys).
    candidate_shot_keys is only populated when match_status is "ambiguous": it lists
    the shot_key of every tied candidate, so a reviewer can be offered exactly the
    shots the matcher actually considered, not the whole source.

    With ``time_match_autoassign=False`` (the default since ruling A7,
    2026-09-30) the three time-based ranks (``exact_day_shot_number_time_window``,
    ``shot_number_time_window``, ``nearest_time``) never attach: the shot(s) they
    would have picked are returned as review candidates with status
    ``ambiguous`` instead. An authoritative ``shot_number`` that names exactly
    one row by its ``authority_shot_number`` attaches on the number alone
    (rank ``shot_number``). Before A7, a trigger numbered 1 with no matching
    LabFrog shot was attached by nearest time to LabFrog shot 2.
    """
    result = _match_event_ranked(
        event,
        shots,
        match_tolerance_s=match_tolerance_s,
        campaign_timezone=campaign_timezone,
        number_is_identity=not time_match_autoassign,
    )
    match, quality, _status, candidates = result
    if (
        time_match_autoassign
        or match is None
        or quality not in _TIME_BASED_MATCH_QUALITIES
    ):
        return result
    return None, "ambiguous", "ambiguous", candidates or [match["shot_key"]]


def _attribution_candidate_keys(
    event: dict[str, Any], shots: list[dict[str, Any]]
) -> list[str]:
    """Offer watchdog candidate numbers as review choices, never as an auto-match.

    The candidates are authority numbers, so they name only rows carrying
    them as ``authority_shot_number`` (ruling R3), never a typed number.
    """
    metadata = event.get("metadata")
    attribution = metadata.get("attribution") if isinstance(metadata, dict) else None
    numbers = attribution.get("candidates") if isinstance(attribution, dict) else None
    if not isinstance(numbers, list):
        return []
    candidate_numbers = {number for number in numbers if type(number) is int}
    return list(
        dict.fromkeys(
            shot["shot_key"]
            for shot in shots
            if _authority_number(shot) in candidate_numbers
            and not _as_bool(shot.get("metadata", {}).get("has_newer_version"))
        )
    )


def _unique_number_match(
    candidates: list[dict[str, Any]], shot_number: int, event_date: str | None
) -> tuple[dict[str, Any], str, str, list[str]] | None:
    """The one shot holding ``shot_number``, if exactly one does (plan W6.2).

    With unique shot numbers the number alone is the identity, on any day. A
    number several shots hold (a rebase) is not, and falls through to the day
    and time ranks, which then only propose. Only the authority's number
    counts (ruling R3): a row whose number was typed holds none.
    """
    same_number = [
        shot for shot in candidates if _authority_number(shot) == shot_number
    ]
    if len(same_number) != 1:
        return None
    only = same_number[0]
    same_day = bool(event_date) and only.get("shot_date") == event_date
    return only, "exact_day_shot_number" if same_day else "shot_number", "matched", []


_TIME_BASED_MATCH_QUALITIES = frozenset({
    "exact_day_shot_number_time_window",
    "shot_number_time_window",
    "nearest_time",
})


def _match_event_ranked(
    event: dict[str, Any],
    shots: list[dict[str, Any]],
    *,
    match_tolerance_s: float,
    campaign_timezone: str,
    number_is_identity: bool = False,
) -> tuple[dict[str, Any] | None, str, str, list[str]]:
    current_shots = [
        shot
        for shot in shots
        if not _as_bool(shot.get("metadata", {}).get("has_newer_version"))
    ]
    candidates = current_shots or shots
    event_time = parse_datetime(event.get("timestamp"))

    identity_match, identity_quality, identity_status, identity_keys = (
        _match_event_identity(event, candidates)
    )
    if identity_match is not None or identity_status == "ambiguous":
        return identity_match, identity_quality, identity_status, identity_keys

    shot_number = _event_shot_number(event)
    event_date = (
        event_time.astimezone(resolve_timezone(campaign_timezone)).date().isoformat()
        if event_time
        else None
    )
    if shot_number is not None and number_is_identity:
        unique = _unique_number_match(candidates, shot_number, event_date)
        if unique is not None:
            return unique
    return _match_by_number_and_time(
        candidates,
        shot_number,
        event_time,
        event_date,
        match_tolerance_s=match_tolerance_s,
        campaign_timezone=campaign_timezone,
    )


def _match_by_number_and_time(
    candidates: list[dict[str, Any]],
    shot_number: int | None,
    event_time: datetime | None,
    event_date: str | None,
    *,
    match_tolerance_s: float,
    campaign_timezone: str,
) -> tuple[dict[str, Any] | None, str, str, list[str]]:
    """The day, number and time ranks, in the order the ladder tries them.

    Split out of ``_match_event_ranked`` unchanged when the unique-number
    rank was added (ruling A7): it is the whole ladder when time
    auto-assignment is on, and only proposes when it is off. The number ranks
    compare the authority's number only (ruling R3); with no row carrying
    it, a numbered event falls through to the time rank.
    """
    if shot_number is not None and event_date:
        exact = [
            shot
            for shot in candidates
            if _authority_number(shot) == shot_number
            and shot.get("shot_date") == event_date
        ]
        if len(exact) == 1:
            return exact[0], "exact_day_shot_number", "matched", []
        if len(exact) > 1:
            nearest = _unique_nearest_shot(
                exact,
                event_time,
                match_tolerance_s,
                campaign_timezone=campaign_timezone,
            )
            if nearest is not None:
                return nearest, "exact_day_shot_number_time_window", "matched", []
            return None, "ambiguous", "ambiguous", [shot["shot_key"] for shot in exact]

    if shot_number is not None:
        same_number = [
            shot for shot in candidates if _authority_number(shot) == shot_number
        ]
        nearest = _unique_nearest_shot(
            same_number,
            event_time,
            match_tolerance_s,
            campaign_timezone=campaign_timezone,
        )
        if nearest is not None:
            return nearest, "shot_number_time_window", "matched", []
        if len(same_number) > 1:
            return (
                None,
                "ambiguous",
                "ambiguous",
                [shot["shot_key"] for shot in same_number],
            )

    nearest = _unique_nearest_shot(
        candidates,
        event_time,
        match_tolerance_s,
        campaign_timezone=campaign_timezone,
    )
    if nearest is not None:
        return nearest, "nearest_time", "matched", []
    return None, "unmatched", "unmatched", []


def _unique_nearest_shot(
    shots: list[dict[str, Any]],
    event_time: datetime | None,
    tolerance_s: float,
    *,
    campaign_timezone: str,
) -> dict[str, Any] | None:
    if event_time is None:
        return None
    distances: list[tuple[float, dict[str, Any]]] = []
    for shot in shots:
        shot_time = parse_datetime(
            shot.get("labfrog_date_time"), naive_timezone=campaign_timezone
        )
        if shot_time is None:
            continue
        distances.append((abs((shot_time - event_time).total_seconds()), shot))
    distances.sort(key=itemgetter(0))
    if not distances or distances[0][0] > tolerance_s:
        return None
    if len(distances) > 1 and distances[0][0] == distances[1][0]:
        return None
    return distances[0][1]


def _normalize_target_metadata(target: Any) -> Any:
    """Widen the legacy flat `metadata.target` string to the object form.

    Per hzdr/docs/target-ontology.md §7: the emulator and early exports set
    `metadata.target` to a plain string (e.g. "target-1"). Readers must
    tolerate both shapes, so a string is normalized here to
    `{"name": <string>, "type": "other", "provenance": "manual"}` before
    downstream consumers (catalog, NeXus writer, UI) ever see it. An
    object form (or anything else) passes through unchanged - this is a
    read-side widening only, not a transport-schema change.
    """
    if isinstance(target, str):
        return {"name": target, "type": "other", "provenance": "manual"}
    return target


def _normalize_event(event: dict[str, Any]) -> dict[str, Any]:
    normalized = {**event}
    normalized["event_id"] = str(event.get("event_id") or _event_id(event))
    metadata = (
        dict(event.get("metadata", {}))
        if isinstance(event.get("metadata"), dict)
        else {}
    )
    if "target" in metadata:
        metadata["target"] = _normalize_target_metadata(metadata["target"])
    normalized["metadata"] = metadata

    for warning in lint_metadata_keys(metadata):
        logger.warning(
            "hzdr-event-v1 metadata for event_id=%s: %s",
            normalized["event_id"],
            warning,
        )
    return normalized


def _deduplicate_by_event_id(
    events: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Drop later events that repeat an already-seen event_id, keep the first.

    A staged JSONL file is an append-only log; a producer retry, an emulator
    re-run over the same fixture, or an at-least-once transport can append the
    same logical event twice. Without this, reconcile_canonical_shots would
    count and attach it twice (double matched/ambiguous/unmatched counts, a
    duplicated row in a shot's events list). event_id is deterministic for a
    given (experiment_id, shot_id, source, kind, timestamp, transport,
    payload_ref) tuple (see _event_id), so an exact repeat - not just two
    events that happen to share a shot - is what gets collapsed here.
    """
    seen: set[str] = set()
    deduplicated: list[dict[str, Any]] = []
    for event in events:
        event_id = str(event["event_id"])
        if event_id in seen:
            continue
        seen.add(event_id)
        deduplicated.append(event)
    return deduplicated


def _event_id(event: dict[str, Any]) -> str:
    payload = json.dumps(
        {
            key: event.get(key)
            for key in (
                "experiment_id",
                "shot_id",
                "source",
                "kind",
                "timestamp",
                "transport",
                "payload_ref",
            )
        },
        sort_keys=True,
        default=str,
    ).encode("utf-8")
    return f"evt-{hashlib.sha256(payload).hexdigest()[:16]}"


def _event_api_record(event: dict[str, Any]) -> dict[str, Any]:
    return {
        key: event.get(key)
        for key in (
            "event_id",
            "source",
            "kind",
            "timestamp",
            "transport",
            "payload_ref",
            "metadata",
            "values",
            "match_quality",
            "match_time_delta_s",
        )
        if event.get(key) is not None
    }


def _merge_shot_metadata(
    labfrog_metadata: dict[str, Any], event_metadata: dict[str, Any]
) -> dict[str, Any]:
    """Merge event metadata without flattening richer LabFrog namespaces.

    A namespace both sides carry as a dict (``target``, ``laser``, ...) is merged
    key by key, the event's value winning, so an event that reports one laser
    key does not drop the pulse energy LabFrog recorded.
    """
    merged = dict(labfrog_metadata)
    for key, value in event_metadata.items():
        if isinstance(merged.get(key), dict) and isinstance(value, dict):
            merged[key] = {**merged[key], **value}
            continue
        merged[key] = value
    return merged


def _merged_event_metadata(events: Iterable[dict[str, Any]]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for event in events:
        metadata = event.get("metadata", {})
        if isinstance(metadata, dict):
            merged.update(metadata)
        values = event.get("values")
        if isinstance(values, list) and values:
            numeric = [
                float(value) for value in values if isinstance(value, int | float)
            ]
            if numeric:
                merged[f"{event.get('kind', 'value')}_mean"] = round(
                    sum(numeric) / len(numeric), 6
                )
    return merged


def _event_producer_instance(event: dict[str, Any]) -> str:
    """Read `metadata.producer.instance_id` for the source-events column.

    Free-form producer metadata, so anything non-scalar or absent degrades to
    "" rather than raising - a campaign whose producers predate the key still
    builds, it just cannot attribute rows to an instance.
    """
    metadata = event.get("metadata")
    if not isinstance(metadata, dict):
        return ""
    producer = metadata.get("producer")
    if not isinstance(producer, dict):
        return ""
    return _as_optional_string(producer.get("instance_id")) or ""


def _event_instrument_id(event: dict[str, Any]) -> str:
    """Read `metadata.instrument.id` for the source-events column (v4).

    Same degradation as `_event_producer_instance`: absent, null (an
    unregistered instrument) or non-scalar all write "".
    """
    metadata = event.get("metadata")
    if not isinstance(metadata, dict):
        return ""
    instrument = metadata.get("instrument")
    if not isinstance(instrument, dict):
        return ""
    return _as_optional_string(instrument.get("id")) or ""


def _event_shot_number(event: dict[str, Any]) -> int | None:
    for value in (
        event.get("shot_number"),
        event.get("metadata", {}).get("shot_number")
        if isinstance(event.get("metadata"), dict)
        else None,
    ):
        parsed = _as_optional_int(value)
        if parsed is not None:
            return parsed
    match = re.fullmatch(r"shot-(\d+)", str(event.get("shot_id", "")))
    return int(match.group(1)) if match else None


def _find_nested_shot_number(value: Any) -> int | None:  # noqa: C901
    if isinstance(value, dict):
        for key in ("shot_number", "shotNumber", "shot", "shot_id"):
            if key in value:
                parsed = _as_optional_int(value[key])
                if parsed is not None:
                    return parsed
                match = re.search(r"(\d+)$", str(value[key]))
                if match:
                    return int(match.group(1))
        for item in value.values():
            parsed = _find_nested_shot_number(item)
            if parsed is not None:
                return parsed
    elif isinstance(value, list):
        for item in value:
            parsed = _find_nested_shot_number(item)
            if parsed is not None:
                return parsed
    return None


def _write_shot_bridge_columns(
    group: h5py.Group, shots: list[dict[str, Any]], *, write_identity: bool
) -> None:
    if write_identity:
        group.attrs[SHOT_IDENTITY_ATTR] = True
        _replace_dataset(group, "shot_index", list(range(len(shots))))
        _replace_dataset(
            group,
            "record_id",
            [shot.get("labfrog_record_id") or "" for shot in shots],
        )
        _replace_dataset(group, "shot_number", [shot["shot_number"] for shot in shots])
        _replace_dataset(
            group, "shot_date", [shot.get("shot_date") or "" for shot in shots]
        )
        _replace_dataset(
            group,
            "date_time",
            [shot.get("labfrog_date_time") or "" for shot in shots],
        )
    columns = {
        "shot_key": [shot["shot_key"] for shot in shots],
        "fired_at": [shot.get("fired_at") or "" for shot in shots],
        "labfrog_date_time": [shot.get("labfrog_date_time") or "" for shot in shots],
        "match_status": [shot.get("match_status") or "" for shot in shots],
        "match_quality": [shot.get("match_quality") or "" for shot in shots],
        "match_time_delta_s": [
            np.nan
            if shot.get("match_time_delta_s") is None
            else shot["match_time_delta_s"]
            for shot in shots
        ],
        "target_metadata_json": [
            json.dumps(_shot_target_metadata(shot), sort_keys=True, default=str)
            for shot in shots
        ],
        # Bridge profile v4: why this shot sits in this campaign -
        # labfrog / schedule / ruling / producer / unassigned
        # (EXPERIMENT_ID_SOURCES, resolve_event_experiments).
        "experiment_id_source": [
            shot.get("experiment_id_source") or "" for shot in shots
        ],
        # Bridge profile v5: LabFrog's local_count, -1 where there is none
        # (the integer sentinel /entry/source_events/shot_number uses). Named
        # so it can never be read as the governed shot_number (aligner G8).
        "labfrog_local_count": np.asarray(
            [
                -1
                if shot.get("labfrog_local_count") is None
                else int(shot["labfrog_local_count"])
                for shot in shots
            ],
            dtype=np.int64,
        ),
        # Bridge profile v6: the shot authority's number, -1 where none.
        "authority_shot_number": np.asarray(
            [_shot_authority_column_value(shot) for shot in shots], dtype=np.int64
        ),
    }
    for name, values in columns.items():
        _replace_dataset(group, name, values)
    group["labfrog_local_count"].attrs["description"] = LABFROG_LOCAL_COUNT_DESCRIPTION
    group["authority_shot_number"].attrs["description"] = (
        AUTHORITY_SHOT_NUMBER_DESCRIPTION
    )
    group["authority_shot_number"].attrs["missing_value"] = -1
    group.attrs["damnit_bridge_profile"] = HZDR_BRIDGE_PROFILE_VERSION
    group.attrs["stable_key"] = "shot_key"


def _shot_authority_column_value(shot: Mapping[str, Any]) -> int:
    """The shot authority's number of one canonical shot, or -1.

    A LabFrog-backed shot has it only from the export (``authority_shot_number``;
    its ``shot_number`` may be typed). A shot built from events (trigger-only,
    or grouped by identity with no LabFrog record) carries the number its
    events did, which only the shot authority issues.
    """
    number = _authority_number(shot)
    if number is None and not shot.get("labfrog_record_id"):
        number = _as_optional_int(shot.get("shot_number"))
    return number if number is not None and number >= 0 else -1


def _extend_preserved_shot_table(
    group: h5py.Group, shots: list[dict[str, Any]], existing_count: int
) -> None:
    """Append trigger-only rows to a copied LabFrog shot table.

    LabFrog's other groups remain byte-for-byte preserved: their data refers to
    the original prefix of this table. New rows carry no LabFrog measurements.
    """
    original_numbers = list(group["shot_number"][...])
    expected_numbers = [shot["shot_number"] for shot in shots[:existing_count]]
    if original_numbers != expected_numbers:
        message = "Canonical shots do not preserve the LabFrog row order"
        raise ValueError(message)
    extra = shots[existing_count:]
    known = {
        "shot_index": list(range(existing_count, len(shots))),
        "record_id": ["" for _ in extra],
        "shot_number": [shot["shot_number"] for shot in extra],
        "shot_date": [shot.get("shot_date") or "" for shot in extra],
        "date_time": ["" for _ in extra],
        "campaign": ["" for _ in extra],
        "shot_status": ["shot" for _ in extra],
        "has_newer_version": [False for _ in extra],
    }
    for name, dataset in list(group.items()):
        if not isinstance(dataset, h5py.Dataset) or not dataset.shape:
            continue
        if dataset.shape[0] != existing_count:
            continue
        if dataset.ndim != 1:
            message = (
                "Cannot append trigger-only rows to multidimensional "
                f"/entry/shots/{name}"
            )
            raise ValueError(message)
        values = known.get(name)
        if values is None:
            values = [_neutral_shot_column_value(dataset.dtype) for _ in extra]
        old_values = dataset[...]
        attrs = dict(dataset.attrs)
        dtype = dataset.dtype
        layout = {
            "chunks": dataset.chunks,
            "compression": dataset.compression,
            "compression_opts": dataset.compression_opts,
            "shuffle": dataset.shuffle,
            "fletcher32": dataset.fletcher32,
            "scaleoffset": dataset.scaleoffset,
        }
        extension = np.asarray(values, dtype=dtype)
        combined = np.concatenate((old_values, extension))
        del group[name]
        replacement = group.create_dataset(name, data=combined, dtype=dtype, **layout)
        for key, value in attrs.items():
            replacement.attrs[key] = value
    group.attrs["labfrog_shot_count"] = existing_count


def _neutral_shot_column_value(dtype: np.dtype) -> Any:
    if h5py.check_string_dtype(dtype) is not None:
        return ""
    if np.issubdtype(dtype, np.floating):
        return np.nan
    if np.issubdtype(dtype, np.signedinteger):
        return -1
    return 0


def _write_source_payloads(entry: h5py.Group, events: list[dict[str, Any]]) -> None:
    for event in events:
        values = event.get("values")
        if not isinstance(values, list):
            continue
        source_group = entry.require_group(source_group_name(str(event["source"])))
        kind_group = source_group.require_group(safe_hdf5_name(str(event["kind"])))
        event_group = kind_group.require_group(safe_hdf5_name(str(event["event_id"])))
        # Unclassed groups fail structural NeXus validation (nds validate,
        # pynxtools); these are DAMNIT-internal tables, so NXcollection applies
        # (same as /entry/shots and /entry/source_events).
        for group in (source_group, kind_group, event_group):
            if "NX_class" not in group.attrs:
                group.attrs["NX_class"] = "NXcollection"
        _replace_dataset(event_group, "values", np.asarray(values))
        event_group.attrs["event_id"] = str(event["event_id"])
        event_group.attrs["shot_key"] = str(event.get("shot_key") or "")
        event_group.attrs["source"] = str(event["source"])
        event_group.attrs["kind"] = str(event["kind"])


def _write_source_events(entry: h5py.Group, events: list[dict[str, Any]]) -> None:
    group = _replace_group(entry, "source_events")
    group.attrs["NX_class"] = "NXcollection"
    group.attrs["description"] = "Normalized source events linked to canonical shots."
    columns = {
        "event_index": list(range(len(events))),
        "event_id": [event["event_id"] for event in events],
        "experiment_id": [event["experiment_id"] for event in events],
        "shot_key": [event.get("shot_key") or "" for event in events],
        "source": [event["source"] for event in events],
        "kind": [event["kind"] for event in events],
        "timestamp": [event["timestamp"] for event in events],
        "shot_number": [
            -1 if _event_shot_number(event) is None else _event_shot_number(event)
            for event in events
        ],
        "source_ref": [event.get("transport") or "" for event in events],
        # Bridge profile v3: promoted out of metadata_json so a projection rule
        # can name the emitting PC. Descriptive only - `event_id` stays the
        # discriminator, and "" is the normal value for a single-instance
        # producer that never sets it.
        "producer_instance_id": [_event_producer_instance(event) for event in events],
        # Bridge profile v4: the instrument-catalogue id from
        # metadata.instrument.id, "" for an unregistered instrument or a
        # producer that predates the key.
        "instrument_id": [_event_instrument_id(event) for event in events],
        "payload_ref_json": [
            json.dumps(event.get("payload_ref", {}), sort_keys=True) for event in events
        ],
        "metadata_json": [
            json.dumps(event.get("metadata", {}), sort_keys=True, default=str)
            for event in events
        ],
        "match_status": [event.get("match_status") or "" for event in events],
        "match_quality": [event.get("match_quality") or "" for event in events],
        "match_time_delta_s": [
            np.nan
            if event.get("match_time_delta_s") is None
            else event["match_time_delta_s"]
            for event in events
        ],
        "candidate_shot_keys_json": [
            json.dumps(event.get("candidate_shot_keys") or []) for event in events
        ],
    }
    for name, values in columns.items():
        _replace_dataset(group, name, values)


def _write_instrument_event_groups(
    entry: h5py.Group, events: list[dict[str, Any]]
) -> None:
    """Index source events under their declared instrument id.

    The canonical event table remains /entry/source_events. These groups give
    NeXus readers an instrument route without copying measurements or guessing
    an id for unregistered files.
    """
    by_id: dict[str, list[tuple[int, dict[str, Any]]]] = {}
    for index, event in enumerate(events):
        instrument_id = _event_instrument_id(event)
        if instrument_id:
            by_id.setdefault(instrument_id, []).append((index, event))
    if not by_id:
        return
    instrument = entry.require_group("instrument")
    if "NX_class" not in instrument.attrs:
        instrument.attrs["NX_class"] = "NXinstrument"
    names: set[str] = set()
    for instrument_id, members in sorted(by_id.items()):
        name = safe_hdf5_name(instrument_id)
        if name in names:
            message = f"instrument ids collide as HDF5 name {name!r}"
            raise ValueError(message)
        names.add(name)
        if not _claim_damnit_group(instrument, name, "instrument_events"):
            message = f"/entry/instrument/{name} is owned by the preserved NeXus file"
            raise ValueError(message)
        group = instrument.create_group(name)
        group.attrs["NX_class"] = "NXcollection"
        group.attrs["damnit_source"] = "instrument_events"
        group.attrs["instrument_id"] = instrument_id
        group.attrs["event_table"] = "/entry/source_events"
        _replace_dataset(group, "event_index", [index for index, _ in members])
        _replace_dataset(group, "event_id", [event["event_id"] for _, event in members])
        _replace_dataset(
            group, "shot_key", [event.get("shot_key") or "" for _, event in members]
        )


def _write_data_products(
    entry: h5py.Group, products: list[dict[str, Any]], *, output_path: Path
) -> None:
    group = _replace_group(entry, "data_products")
    group.attrs["NX_class"] = "NXcollection"
    group.attrs["description"] = "Per-shot references to previewable or external data."
    columns = {
        "product_index": list(range(len(products))),
        "product_id": [product["product_id"] for product in products],
        "shot_key": [product.get("shot_key") or "" for product in products],
        "source": [product.get("source") or "" for product in products],
        "kind": [product.get("kind") or "" for product in products],
        "path": [product.get("path") or str(output_path) for product in products],
        "dataset_path": [product.get("dataset_name") or "" for product in products],
        "preview_kind": [product.get("preview_kind") or "" for product in products],
        "dtype": [product.get("dtype") or "" for product in products],
        "shape_json": [json.dumps(product.get("shape", [])) for product in products],
        "units": [product.get("units") or "" for product in products],
        "metadata_json": [
            json.dumps(product.get("metadata", {}), sort_keys=True, default=str)
            for product in products
        ],
    }
    for name, values in columns.items():
        _replace_dataset(group, name, values)


def _replace_group(parent: h5py.Group, name: str) -> h5py.Group:
    if name in parent:
        del parent[name]
    return parent.create_group(name)


def _replace_dataset(group: h5py.Group, name: str, values: Any) -> h5py.Dataset:
    if name in group:
        del group[name]
    array = np.asarray(values)
    if array.dtype.kind in {"U", "O"}:
        dtype = h5py.string_dtype(encoding="utf-8")
        array = np.asarray(
            ["" if value is None else str(value) for value in values], dtype=dtype
        )
    return group.create_dataset(name, data=array)


def _table_length(group: h5py.Group) -> int:
    for name in ("shot_index", "record_index", "record_id", "shot_number"):
        item = group.get(name)
        if isinstance(item, h5py.Dataset) and item.ndim >= 1:
            return int(item.shape[0])
    return 0


def _read_hdf5_column(group: h5py.Group, name: str, count: int) -> list[Any]:
    item = group.get(name)
    if not isinstance(item, h5py.Dataset):
        return [None] * count
    values = item.asstr()[...] if item.dtype.kind in {"S", "O", "U"} else item[...]
    if np.asarray(values).ndim == 0:
        return [np.asarray(values).item()] * count
    return [_python_scalar(value) for value in values]


def _labfrog_identity(record: dict[str, Any]) -> tuple[Any, ...]:
    if record.get("record_id"):
        return ("record", str(record["record_id"]))
    return (
        "shot",
        record.get("campaign"),
        record.get("shot_date"),
        record.get("shot_number"),
    )


def _time_delta_seconds(
    labfrog_time: Any, fired_at: Any, *, campaign_timezone: str
) -> float | None:
    left = parse_datetime(labfrog_time, naive_timezone=campaign_timezone)
    right = parse_datetime(fired_at)
    return (left - right).total_seconds() if left and right else None


def _as_optional_string(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(_python_scalar(value))


def _as_optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(_python_scalar(value))
    except (TypeError, ValueError):
        return None


def _as_optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(_python_scalar(value))
    except (TypeError, ValueError):
        return None


def _as_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes"}
    return bool(_python_scalar(value)) if value is not None else False


def _python_scalar(value: Any) -> Any:
    return value.item() if isinstance(value, np.generic) else value


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_json_safe(item) for item in value]
    return _python_scalar(value)


def _first_string(mapping: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = _as_optional_string(mapping.get(key))
        if value:
            return value
    return None
