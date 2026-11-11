"""Debounced auto-trigger for the canonical NeXus/catalog builder.

The durable spool consumers land ``hzdr-event-v1`` events on disk but do not
rebuild the canonical NeXus file + ``hzdr_sources.json`` catalog.  This module
closes that gap: each consumer's ``on_new_events_hook`` calls
:meth:`BuilderTrigger.notify`, and a single background task coalesces bursts of
events into one debounced rerun of ``hzdr-hdf5-builder.py``.

The builder runs as a **subprocess** so its single-writer PID lock and full
isolation are preserved unchanged, and a slow HDF5 build stays off the API event
loop.  The builder reads the entire spool on every run and republishes
atomically, so coalescing and duplicate triggers converge to the same catalog —
the trigger adds no correctness burden, it only removes the manual step.

With ``containers_enabled`` it also starts ``hzdr-container-worker.py``
(campaign output phase 3) once before each build, so already published shots
convert while it runs, and once after a successful build, for the shots it
published. The worker is not awaited: it converts outside the campaign lock,
under its own, and a second start while one runs only leaves it a request.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import time
from collections.abc import Awaitable, Callable, Sequence
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..shared.hzdr_settings import HZDRBuilderSettings

logger = logging.getLogger(__name__)

# (returncode, combined_output_text) — separated out so tests can inject a fake
# runner instead of spawning a real builder subprocess.
BuilderRunner = Callable[[Sequence[str]], Awaitable[tuple[int, str]]]
# Starts the container worker and returns once it is running (not finished).
WorkerLauncher = Callable[[Sequence[str]], Awaitable[None]]

_DEFAULT_SCRIPT = (
    Path(__file__).resolve().parents[3] / "scripts" / "hzdr-hdf5-builder.py"
)
_DEFAULT_WORKER_SCRIPT = (
    Path(__file__).resolve().parents[3] / "scripts" / "hzdr-container-worker.py"
)
WORKER_LOG_NAME = ".hzdr-container-worker.log"
_DEFAULT_VALIDATION_SCRIPT = (
    Path(__file__).resolve().parents[3] / "scripts" / "hzdr-nexus-validate.py"
)
VALIDATION_LOG_NAME = ".hzdr-validation.log"
# hzdr-container-worker.py's exit status for "containers written that the
# published master does not link yet" (hzdr_containers.RELINK_EXIT).
RELINK_EXIT = 3
# ... and for "converted nothing" (hzdr_containers.BUSY_EXIT).
BUSY_EXIT = 5
# hzdr-nexus-validate.py's exit status when the gate could not run.
VALIDATION_CANNOT_RUN = 2
# Past this size the log is moved to ``<name>.1`` (one generation kept).
WORKER_LOG_MAX_BYTES = 5 * 1024 * 1024

# Cap how much builder output we echo into a single log line on failure so a
# large traceback cannot flood the structured logs.
_MAX_LOGGED_OUTPUT = 2000

# The trigger whose run() loop is live, so the API can ask it for a rebuild.
_RUNNING: dict[str, BuilderTrigger] = {}


def scicat_lines(output: str) -> list[str]:
    """The builder's ``SciCat:`` outcome lines (one per campaign registered)."""
    return [line.strip() for line in output.splitlines() if line.startswith("SciCat: ")]


def request_rebuild() -> bool:
    """Ask the running auto-trigger for a debounced rebuild.

    For inputs that change outside the spool, such as a reviewer's campaign
    ruling: without this it would wait for the next spooled event. Returns
    False when no trigger is running (auto-build off).
    """
    trigger = _RUNNING.get("trigger")
    if trigger is None:
        return False
    trigger.notify()
    return True


def _written_since(report: dict, since: float) -> bool:
    """Whether the gate stamped ``report`` at or after ``since`` (epoch s)."""
    try:
        stamped = datetime.fromisoformat(str(report["validated_at"]))
    except (KeyError, TypeError, ValueError):
        return False  # no stamp: not this run's
    if stamped.tzinfo is None:
        return False
    return stamped.timestamp() >= since


class BuilderTrigger:
    """Coalesce spool events into debounced builder subprocess runs."""

    def __init__(
        self,
        settings: HZDRBuilderSettings,
        events_jsonl: Sequence[Path] = (),
        trigger_jsonl: Sequence[Path] = (),
        runner: BuilderRunner | None = None,
        unassigned_events_jsonl: Sequence[Path] = (),
        unassigned_trigger_jsonl: Sequence[Path] = (),
        events_spools: Sequence[tuple[Path, str]] = (),
        trigger_spools: Sequence[tuple[Path, str]] = (),
        worker_launcher: WorkerLauncher | None = None,
        validation_launcher: WorkerLauncher | None = None,
    ) -> None:
        self._settings = settings
        self._events_jsonl = list(events_jsonl)
        self._trigger_jsonl = list(trigger_jsonl)
        # The shared ``_unassigned`` spool files (decision D1). Every build
        # reads them so the resolution stage can route their events; they are
        # passed only once they exist, since a campaign may never see one.
        self._unassigned_events_jsonl = list(unassigned_events_jsonl)
        self._unassigned_trigger_jsonl = list(unassigned_trigger_jsonl)
        # Multi-campaign mode: each consumer's (spool_dir, filename), from which
        # the builder finds every campaign folder and the _unassigned one.
        self._events_spools = list(events_spools)
        self._trigger_spools = list(trigger_spools)
        self._runner = runner or self._run_subprocess
        self._worker_launcher = worker_launcher or self._spawn_worker
        self._validation_launcher = validation_launcher or self._spawn_validation
        # One validation at a time; a request while one runs is remembered once.
        self._validating = False
        self._validate_again = False
        # When the running gate started: an older report is not its result.
        self._validation_started: float | None = None
        self._workers: set[asyncio.Task] = set()
        self._wake = asyncio.Event()

    def notify(self, paths: list[Path] | None = None) -> None:
        """Signal that new events landed.  Safe to call from the consumer loop."""
        self._wake.set()

    def _labfrog_exports(self) -> list[Path]:
        """The LabFrog exports the builds read, as far as they exist."""
        s = self._settings
        if s.multi_campaign:
            if s.curated_root is None or not s.curated_root.is_dir():
                return []
            return sorted(s.curated_root.glob("*/*.sqlite"))
        return [p for p in (s.labfrog_sqlite, s.labfrog_nexus) if p is not None]

    def _export_signature(self) -> dict[Path, tuple[int, int]]:
        signature: dict[Path, tuple[int, int]] = {}
        for path in self._labfrog_exports():
            try:
                stat = path.stat()
            except OSError:
                continue
            signature[path] = (stat.st_mtime_ns, stat.st_size)
        return signature

    async def _watch_labfrog_exports(self, stop: asyncio.Event) -> None:
        """Rebuild when a LabFrog export changes; its refresh lands outside the spool.

        The exporter replaces each file atomically, so a changed signature is a
        finished export. The first look only records the state: starting up is
        not a change.
        """
        interval = self._settings.labfrog_poll_seconds
        last = await asyncio.to_thread(self._export_signature)
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=interval)
                return
            except TimeoutError:
                pass
            current = await asyncio.to_thread(self._export_signature)
            changed = sorted(
                str(path)
                for path in current.keys() | last.keys()
                if current.get(path) != last.get(path)
            )
            last = current
            if changed:
                logger.info(
                    "LabFrog export changed, rebuilding: %s", ", ".join(changed)
                )
                self.notify()

    def build_command(self) -> list[str]:
        """Assemble the ``hzdr-hdf5-builder.py`` command line from settings."""
        s = self._settings
        python = s.python_executable or sys.executable
        script = s.script_path or _DEFAULT_SCRIPT
        if s.output_root is not None:
            return [python, str(script), *self._multi_campaign_args()]
        return [python, str(script), *self._single_campaign_args()]

    def worker_command(self) -> list[str]:
        """The ``hzdr-container-worker.py`` command for the campaign(s) built."""
        s = self._settings
        python = s.python_executable or sys.executable
        script = s.container_worker_script or _DEFAULT_WORKER_SCRIPT
        if s.output_root is not None:
            cmd = [python, str(script), "--output-root", str(s.output_root)]
            if s.containers_include_unassigned:
                cmd.append("--include-unassigned")
            return cmd
        return [python, str(script), "--master", str(s.output_nexus)]

    def validation_command(self) -> list[str]:
        """The ``hzdr-nexus-validate.py`` command, run in NDS's environment."""
        s = self._settings
        script = s.validation_script or _DEFAULT_VALIDATION_SCRIPT
        if s.output_root is not None:
            where = ["--output-root", str(s.output_root)]
        else:
            where = ["--master", str(s.output_nexus)]
        return [s.validation_python, str(script), *where]

    def _worker_log(self, name: str = WORKER_LOG_NAME) -> Path:
        s = self._settings
        if s.output_root is not None:
            return s.output_root / name
        folder = s.output_nexus.parent if s.output_nexus is not None else Path()
        return folder / name

    def _single_campaign_args(self) -> list[str]:
        """The one configured campaign (``OUTPUT_NEXUS``), as before plan C2."""
        s = self._settings
        cmd: list[str] = []
        for path in self._events_jsonl:
            cmd += ["--events-jsonl", str(path)]
        for path in self._trigger_jsonl:
            cmd += ["--trigger-jsonl", str(path)]
        cmd += self._unassigned_args()
        if s.output_nexus is not None:
            cmd += ["--output-nexus", str(s.output_nexus)]
        if s.experiment_id:
            cmd += ["--experiment-id", s.experiment_id]
        if s.source_key:
            cmd += ["--source-key", s.source_key]
        if s.campaign_timezone:
            cmd += ["--campaign-timezone", s.campaign_timezone]
        if s.labfrog_nexus is not None:
            cmd += ["--labfrog-nexus", str(s.labfrog_nexus)]
        if s.labfrog_sqlite is not None:
            cmd += ["--labfrog-sqlite", str(s.labfrog_sqlite)]
        if s.sources_file is not None:
            cmd += ["--sources-file", str(s.sources_file)]
        cmd += ["--match-tolerance-s", str(s.match_tolerance_s)]
        cmd += self._resolution_args()
        cmd += list(s.extra_args)
        return cmd

    def _multi_campaign_args(self) -> list[str]:
        """``--output-root`` mode: one run builds every campaign (plan C2)."""
        s = self._settings
        args = ["--output-root", str(s.output_root)]
        if s.catalog_file is not None:
            args += ["--sources-file", str(s.catalog_file)]
        if s.curated_root is not None:
            args += ["--curated-root", str(s.curated_root)]
        for campaign in s.campaigns:
            args += ["--campaign", campaign]
        for flag, spools in (
            ("--events-spool", self._events_spools),
            ("--trigger-spool", self._trigger_spools),
        ):
            for directory, filename in spools:
                args += [flag, str(directory), filename]
        if s.campaign_timezone:
            args += ["--campaign-timezone", s.campaign_timezone]
        args += ["--match-tolerance-s", str(s.match_tolerance_s)]
        args += self._resolution_args()
        return args + list(s.extra_args)

    def _unassigned_args(self) -> list[str]:
        """Inputs from the shared ``_unassigned`` spools that exist so far."""
        args: list[str] = []
        for flag, paths in (
            ("--events-jsonl", self._unassigned_events_jsonl),
            ("--trigger-jsonl", self._unassigned_trigger_jsonl),
        ):
            for path in paths:
                if path.exists():
                    args += [flag, str(path)]
        return args

    def _resolution_args(self) -> list[str]:
        """Campaign-schedule and time-match flags (plan W1/W6.2)."""
        s = self._settings
        args: list[str] = []
        if s.campaign_schedule is not None:
            args += ["--campaign-schedule", str(s.campaign_schedule)]
        # Always explicit, so the setting governs whatever the script's own
        # default is.
        args.append(
            "--time-match-autoassign"
            if s.time_match_autoassign
            else "--no-time-match-autoassign"
        )
        return args

    async def _run_subprocess(self, cmd: Sequence[str]) -> tuple[int, str]:
        # Merge stderr into stdout so a single captured stream carries the full
        # builder diagnostics (the builder prints its result paths to stdout and
        # tracebacks to stderr); interleaving keeps them in order for the log.
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await proc.communicate()
        return proc.returncode or 0, (stdout or b"").decode("utf-8", errors="replace")

    async def _spawn_worker(self, cmd: Sequence[str]) -> None:
        """Start the worker in its own session, logging to a file; do not wait.

        Its output goes to ``.hzdr-container-worker.log`` beside the output,
        not to a pipe, so it outlives an API restart without blocking on a
        full pipe; conversion is resumable either way.
        """
        proc = await self._spawn(cmd, self._worker_log())
        task = asyncio.create_task(self._reap_worker(proc))
        self._workers.add(task)
        task.add_done_callback(self._workers.discard)

    async def _spawn_validation(self, cmd: Sequence[str]) -> None:
        """Start the validation gate like the worker, logging to its own file.

        One at a time: a request while one runs sets a flag, and the running
        one starts a single follow-up when it ends, so a burst of builds costs
        at most two runs, never a pile of overlapping ones.
        """
        if self._validating:
            self._validate_again = True
            return
        self._validating = True
        self._validation_started = time.time()
        try:
            proc = await self._spawn(cmd, self._worker_log(VALIDATION_LOG_NAME))
        except BaseException:
            self._validating = False
            raise
        task = asyncio.create_task(self._reap_validation(proc))
        self._workers.add(task)
        task.add_done_callback(self._workers.discard)

    @staticmethod
    def _rotate(log_path: Path) -> None:
        """Make the log's folder; past the size limit keep one older generation."""
        log_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            if log_path.stat().st_size > WORKER_LOG_MAX_BYTES:
                log_path.replace(log_path.with_name(log_path.name + ".1"))
        except OSError:
            pass  # no log yet, or another start rotated it first

    async def _spawn(
        self, cmd: Sequence[str], log_path: Path
    ) -> asyncio.subprocess.Process:
        self._rotate(log_path)
        with log_path.open("ab") as log:
            return await asyncio.create_subprocess_exec(
                *cmd,
                stdout=log,
                stderr=asyncio.subprocess.STDOUT,
                start_new_session=True,
            )

    async def _reap_worker(self, proc: asyncio.subprocess.Process) -> None:
        returncode = await proc.wait()
        self.worker_finished(returncode)
        if returncode in {RELINK_EXIT, RELINK_EXIT + 1}:
            return  # a build is coming to link them; validate after its worker
        if returncode == BUSY_EXIT:
            return  # it converted nothing; the worker that is converting checks
        # The containers are as this worker left them: check them and the master.
        await self._start_validation("after the container worker")

    async def _reap_validation(self, proc: asyncio.subprocess.Process) -> None:
        try:
            returncode = await proc.wait()
            self.validation_finished(returncode)
        finally:
            self._validating = False
        if self._validate_again:
            self._validate_again = False
            await self._start_validation("requested while the last one ran")

    def validation_finished(self, returncode: int) -> None:
        """Log the gate's result, with each campaign's counts from its report."""
        if returncode == VALIDATION_CANNOT_RUN:
            logger.error(
                "Auto-trigger: NeXus validation could not run; see %s",
                VALIDATION_LOG_NAME,
            )
            return
        for master, s in self._validation_reports():
            if s.get("passed") is None:
                continue  # that campaign's gate did not run
            logger.info(
                "Auto-trigger: NeXus validation of %s: %s; master %s error(s); "
                "%s container(s), %s error(s); subentries %s/%s certified",
                master,
                "passed" if s.get("passed") else "FAILED",
                s.get("master_errors"),
                s.get("containers"),
                s.get("container_errors"),
                s.get("subentries_certified"),
                s.get("subentries"),
            )
        if returncode:
            logger.error(
                "Auto-trigger: NeXus validation failed (exit %d); see %s",
                returncode,
                VALIDATION_LOG_NAME,
            )
        else:
            logger.info("Auto-trigger: NeXus validation passed")

    def _validation_reports(self) -> list[tuple[str, dict]]:
        """The reports this run wrote: one older than its start is stale.

        Under ``OUTPUT_ROOT`` the gate checks only campaigns whose master is
        published, so a campaign folder left without one keeps the report of
        an earlier run; logging it would pass it off as this run's result.
        Judged by the report's own ``validated_at``, which the gate stamps
        with this host's clock, never by the file's mtime, which a share's
        server stamps with its own.
        """
        s = self._settings
        if s.output_root is not None:
            paths = sorted(s.output_root.glob("*/.validation.json"))
        elif s.output_nexus is not None:
            paths = [s.output_nexus.parent / ".validation.json"]
        else:
            paths = []
        found = []
        since = self._validation_started
        for path in paths:
            try:
                report = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if since is not None and not _written_since(report, since):
                continue
            found.append((
                str(report.get("master", path.parent.name)),
                report.get("summary", {}),
            ))
        return found

    async def _start_validation(self, when: str) -> None:
        if not self._settings.validation_python:
            return
        cmd = self.validation_command()
        logger.info("Auto-trigger: starting NeXus validation (%s)", when)
        try:
            await self._validation_launcher(cmd)
        except Exception:
            logger.exception("Auto-trigger: NeXus validation failed to start")

    def worker_finished(self, returncode: int) -> None:
        """Log a worker's exit; one that left unlinked containers asks for a build.

        ``RELINK_EXIT`` (``+1`` when something also failed) means containers
        are in place that the published master does not link. One more build
        links them; its own workers then find nothing new, so this converges.
        """
        relink = returncode in {RELINK_EXIT, RELINK_EXIT + 1}
        if returncode == BUSY_EXIT:
            logger.info("Auto-trigger: container worker found the campaign busy")
        elif returncode and returncode != RELINK_EXIT:
            logger.error(
                "Auto-trigger: container worker exited %d; see %s",
                returncode,
                WORKER_LOG_NAME,
            )
        else:
            logger.info("Auto-trigger: container worker finished")
        if relink:
            logger.info("Auto-trigger: new containers to link; rebuilding")
            self.notify()

    async def wait_for_workers(self) -> None:
        """Wait for the workers this trigger started (tests, shutdown)."""
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)

    async def _start_container_worker(self, when: str) -> None:
        if not self._settings.containers_enabled:
            return
        cmd = self.worker_command()
        logger.info("Auto-trigger: starting container worker (%s build)", when)
        try:
            await self._worker_launcher(cmd)
        except Exception:
            logger.exception("Auto-trigger: container worker failed to start")

    async def _run_builder_once(self) -> None:
        await self._start_container_worker("before")
        cmd = self.build_command()
        logger.info("Auto-trigger: running builder %s", " ".join(cmd))
        # Note: a CancelledError from shutdown propagates out of this ``try``
        # (it is a BaseException, not caught by ``except Exception``) so a build
        # interrupted by shutdown is never mislogged as a failure.
        try:
            returncode, output = await self._runner(cmd)
        except Exception:
            logger.exception("Auto-trigger: builder subprocess failed to launch")
            return
        if returncode == 0:
            logger.info("Auto-trigger: builder finished successfully")
            for line in scicat_lines(output):
                logger.info("Auto-trigger: %s", line)
            if self._settings.containers_enabled:
                await self._start_container_worker("after")  # validates when done
            else:
                await self._start_validation("after the build")
        else:
            logger.error(
                "Auto-trigger: builder exited %d: %s",
                returncode,
                output.strip()[-_MAX_LOGGED_OUTPUT:],
            )

    async def run(self, stop: asyncio.Event) -> None:
        """Wait for events, debounce, rebuild.  Exits cleanly when stop is set."""
        logger.info(
            "Builder auto-trigger started (debounce=%.1fs)",
            self._settings.debounce_seconds,
        )
        _RUNNING["trigger"] = self
        watcher = (
            asyncio.create_task(self._watch_labfrog_exports(stop))
            if self._settings.labfrog_poll_seconds > 0
            else None
        )
        try:
            while not stop.is_set():
                if not await self._wait_for_wake(stop):
                    break
                self._wake.clear()
                # Coalesce a burst: sleep the debounce window, absorbing further
                # notifies, then clear once more so mid-build events queue
                # exactly one follow-up rebuild rather than one per event.
                await asyncio.sleep(self._settings.debounce_seconds)
                self._wake.clear()
                await self._run_builder_once()
        finally:
            if watcher is not None:
                watcher.cancel()
            if _RUNNING.get("trigger") is self:
                del _RUNNING["trigger"]
            # Stop watching the workers, not the workers: each runs in its own
            # session and a conversion cut short resumes on the next start.
            for task in list(self._workers):
                task.cancel()
        logger.info("Builder auto-trigger stopped")

    async def _wait_for_wake(self, stop: asyncio.Event) -> bool:
        """Block until a notify or stop.  Returns False if stop won the race."""
        wake_task = asyncio.ensure_future(self._wake.wait())
        stop_task = asyncio.ensure_future(stop.wait())
        try:
            await asyncio.wait(
                {wake_task, stop_task}, return_when=asyncio.FIRST_COMPLETED
            )
        finally:
            for task in (wake_task, stop_task):
                if not task.done():
                    task.cancel()
        return not stop.is_set()
