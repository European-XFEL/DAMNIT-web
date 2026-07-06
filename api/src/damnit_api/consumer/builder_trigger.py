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
"""

from __future__ import annotations

import asyncio
import logging
import sys
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..shared.settings import HZDRBuilderSettings

logger = logging.getLogger(__name__)

# (returncode, combined_output_text) — separated out so tests can inject a fake
# runner instead of spawning a real builder subprocess.
BuilderRunner = Callable[[Sequence[str]], Awaitable[tuple[int, str]]]

_DEFAULT_SCRIPT = (
    Path(__file__).resolve().parents[3] / "scripts" / "hzdr-hdf5-builder.py"
)

# Cap how much builder output we echo into a single log line on failure so a
# large traceback cannot flood the structured logs.
_MAX_LOGGED_OUTPUT = 2000


class BuilderTrigger:
    """Coalesce spool events into debounced builder subprocess runs."""

    def __init__(
        self,
        settings: HZDRBuilderSettings,
        events_jsonl: Sequence[Path] = (),
        trigger_jsonl: Sequence[Path] = (),
        runner: BuilderRunner | None = None,
    ) -> None:
        self._settings = settings
        self._events_jsonl = list(events_jsonl)
        self._trigger_jsonl = list(trigger_jsonl)
        self._runner = runner or self._run_subprocess
        self._wake = asyncio.Event()

    def notify(self, paths: list[Path] | None = None) -> None:
        """Signal that new events landed.  Safe to call from the consumer loop."""
        self._wake.set()

    def build_command(self) -> list[str]:
        """Assemble the ``hzdr-hdf5-builder.py`` command line from settings."""
        s = self._settings
        python = s.python_executable or sys.executable
        script = s.script_path or _DEFAULT_SCRIPT
        cmd = [python, str(script)]
        for path in self._events_jsonl:
            cmd += ["--events-jsonl", str(path)]
        for path in self._trigger_jsonl:
            cmd += ["--trigger-jsonl", str(path)]
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
        cmd += list(s.extra_args)
        return cmd

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

    async def _run_builder_once(self) -> None:
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
        while not stop.is_set():
            if not await self._wait_for_wake(stop):
                break
            self._wake.clear()
            # Coalesce a burst: sleep the debounce window, absorbing further
            # notifies, then clear once more so mid-build events queue exactly
            # one follow-up rebuild rather than one per event.
            await asyncio.sleep(self._settings.debounce_seconds)
            self._wake.clear()
            await self._run_builder_once()
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
