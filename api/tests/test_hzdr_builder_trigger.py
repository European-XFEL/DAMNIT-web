"""Tests for the debounced builder auto-trigger (consumer/builder_trigger.py).

The trigger coalesces spool events into subprocess reruns of the builder.  These
tests inject a fake runner so no real builder subprocess is spawned, and drive
the debounce loop with a short window for speed.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path  # noqa: TC003

import pytest

from damnit_api.consumer.builder_trigger import BuilderTrigger
from damnit_api.consumer.spool import HZDRSpoolConsumer, SpoolConfig
from damnit_api.shared.hzdr_settings import HZDRBuilderSettings

DEBOUNCE = 0.05


def _settings(tmp_path: Path, **overrides) -> HZDRBuilderSettings:
    base = {
        "enabled": True,
        "debounce_seconds": DEBOUNCE,
        "output_nexus": tmp_path / "campaign.nxs",
    }
    base.update(overrides)
    return HZDRBuilderSettings(**base)


class _RecordingRunner:
    """Fake builder runner: counts calls, optionally simulates build time."""

    def __init__(self, build_time: float = 0.0, returncode: int = 0) -> None:
        self.calls: list[list[str]] = []
        self._build_time = build_time
        self._returncode = returncode

    async def __call__(self, cmd):
        self.calls.append(list(cmd))
        if self._build_time:
            await asyncio.sleep(self._build_time)
        return self._returncode, ""


async def _drive(trigger: BuilderTrigger, stop: asyncio.Event) -> asyncio.Task:
    task = asyncio.create_task(trigger.run(stop))
    await asyncio.sleep(0)  # let the loop reach its first wait
    return task


async def _shutdown(task: asyncio.Task, stop: asyncio.Event, trigger: BuilderTrigger):
    stop.set()
    trigger.notify()  # unblock the wait-for-wake race
    await asyncio.wait_for(task, timeout=1.0)


# ---------------------------------------------------------------------------
# Command assembly
# ---------------------------------------------------------------------------


def test_build_command_includes_spool_paths_and_settings(tmp_path):
    settings = _settings(
        tmp_path,
        experiment_id="EXP-1",
        source_key="hzdr-labfrog",
        campaign_timezone="Europe/Berlin",
        labfrog_sqlite=tmp_path / "c.sqlite",
        match_tolerance_s=90.0,
        extra_args=["--verbose"],
    )
    trigger = BuilderTrigger(
        settings,
        events_jsonl=[tmp_path / "spool/events.jsonl"],
        trigger_jsonl=[tmp_path / "spool/trigger.jsonl"],
    )
    cmd = trigger.build_command()

    assert cmd[1].endswith("hzdr-hdf5-builder.py")
    assert "--events-jsonl" in cmd
    assert str(tmp_path / "spool/events.jsonl") in cmd
    assert "--trigger-jsonl" in cmd
    assert str(tmp_path / "spool/trigger.jsonl") in cmd
    assert cmd[cmd.index("--output-nexus") + 1] == str(tmp_path / "campaign.nxs")
    assert cmd[cmd.index("--experiment-id") + 1] == "EXP-1"
    assert cmd[cmd.index("--campaign-timezone") + 1] == "Europe/Berlin"
    assert cmd[cmd.index("--labfrog-sqlite") + 1] == str(tmp_path / "c.sqlite")
    assert cmd[cmd.index("--match-tolerance-s") + 1] == "90.0"
    assert cmd[-1] == "--verbose"


def test_build_command_omits_unset_optional_inputs(tmp_path):
    trigger = BuilderTrigger(_settings(tmp_path))
    cmd = trigger.build_command()
    assert "--experiment-id" not in cmd  # empty string -> omitted
    assert "--labfrog-nexus" not in cmd
    assert "--labfrog-sqlite" not in cmd
    assert "--sources-file" not in cmd


# ---------------------------------------------------------------------------
# Debounce / coalescing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_burst_of_events_coalesces_to_one_build(tmp_path):
    runner = _RecordingRunner(build_time=2 * DEBOUNCE)
    trigger = BuilderTrigger(_settings(tmp_path), runner=runner)
    stop = asyncio.Event()
    task = await _drive(trigger, stop)

    for _ in range(5):
        trigger.notify()

    await asyncio.sleep(6 * DEBOUNCE)
    assert len(runner.calls) == 1, "burst should coalesce into a single build"

    await _shutdown(task, stop, trigger)


@pytest.mark.asyncio
async def test_events_after_build_rearm_a_second_build(tmp_path):
    runner = _RecordingRunner()
    trigger = BuilderTrigger(_settings(tmp_path), runner=runner)
    stop = asyncio.Event()
    task = await _drive(trigger, stop)

    trigger.notify()
    await asyncio.sleep(4 * DEBOUNCE)
    assert len(runner.calls) == 1

    trigger.notify()
    await asyncio.sleep(4 * DEBOUNCE)
    assert len(runner.calls) == 2

    await _shutdown(task, stop, trigger)


@pytest.mark.asyncio
async def test_idle_trigger_never_builds(tmp_path):
    runner = _RecordingRunner()
    trigger = BuilderTrigger(_settings(tmp_path), runner=runner)
    stop = asyncio.Event()
    task = await _drive(trigger, stop)

    await asyncio.sleep(4 * DEBOUNCE)
    assert runner.calls == []

    await _shutdown(task, stop, trigger)


@pytest.mark.asyncio
async def test_stop_exits_cleanly_without_building(tmp_path):
    runner = _RecordingRunner()
    trigger = BuilderTrigger(_settings(tmp_path), runner=runner)
    stop = asyncio.Event()
    task = await _drive(trigger, stop)

    stop.set()
    trigger.notify()
    await asyncio.wait_for(task, timeout=1.0)
    assert runner.calls == []


@pytest.mark.asyncio
async def test_builder_failure_does_not_crash_loop(tmp_path):
    runner = _RecordingRunner(returncode=1)
    trigger = BuilderTrigger(_settings(tmp_path), runner=runner)
    stop = asyncio.Event()
    task = await _drive(trigger, stop)

    trigger.notify()
    await asyncio.sleep(4 * DEBOUNCE)
    # Loop survives a failing build and remains ready to rebuild.
    trigger.notify()
    await asyncio.sleep(4 * DEBOUNCE)
    assert len(runner.calls) == 2

    await _shutdown(task, stop, trigger)


# ---------------------------------------------------------------------------
# Consumer hook dispatch
# ---------------------------------------------------------------------------


class _StubConsumer(HZDRSpoolConsumer):
    async def _claim(self):  # pragma: no cover - not exercised
        return [], None

    async def _ack(self, token):  # pragma: no cover - not exercised
        return None


def test_on_new_events_dispatches_to_hook(tmp_path):
    consumer = _StubConsumer(SpoolConfig("camp", "grp", tmp_path))
    seen: list[list[Path]] = []
    consumer.on_new_events_hook = seen.append

    consumer.on_new_events([tmp_path / "events.jsonl"])
    assert seen == [[tmp_path / "events.jsonl"]]


def test_on_new_events_without_hook_is_noop(tmp_path):
    consumer = _StubConsumer(SpoolConfig("camp", "grp", tmp_path))
    # Must not raise when no hook is attached (auto-trigger disabled).
    consumer.on_new_events([tmp_path / "events.jsonl"])


# ---------------------------------------------------------------------------
# Settings validation
# ---------------------------------------------------------------------------


def test_enabled_requires_output_nexus():
    with pytest.raises(ValueError, match="OUTPUT_NEXUS"):
        HZDRBuilderSettings(enabled=True)


def test_disabled_allows_missing_output_nexus():
    settings = HZDRBuilderSettings(enabled=False)
    assert settings.output_nexus is None


# ---------------------------------------------------------------------------
# Concurrency / shutdown edge cases (merged from the alternate design)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_events_during_a_running_build_rearm_exactly_one_followup(tmp_path):
    """Events landing *while a build runs* must coalesce into one follow-up.

    Unlike the sequential re-arm test, this blocks the runner mid-build to
    exercise the concurrent case: many notifies during a single build must
    schedule exactly one more build, never one per notify.
    """
    calls: list[list[str]] = []
    first_started = asyncio.Event()
    release = asyncio.Event()

    async def runner(cmd):
        idx = len(calls)
        calls.append(list(cmd))
        if idx == 0:
            first_started.set()
            await release.wait()  # hold the first build open

    trigger = BuilderTrigger(_settings(tmp_path), runner=runner)
    stop = asyncio.Event()
    task = await _drive(trigger, stop)

    trigger.notify()
    await asyncio.wait_for(first_started.wait(), timeout=1.0)

    # A burst of notifies while the first build is blocked must collapse to one.
    for _ in range(5):
        trigger.notify()
    release.set()

    await asyncio.sleep(6 * DEBOUNCE)
    assert len(calls) == 2, f"expected exactly one follow-up run, got {len(calls)}"

    await _shutdown(task, stop, trigger)


@pytest.mark.asyncio
async def test_runner_exception_is_isolated_and_loop_survives(tmp_path):
    """A runner that *raises* (launch failure) is logged, not fatal.

    Branch A's returncode!=0 test covers a builder that exits non-zero; this
    covers the harder path where the runner itself raises before returning.
    """
    calls: list[list[str]] = []

    async def runner(cmd):  # noqa: RUF029 - coroutine runner contract
        calls.append(list(cmd))
        if len(calls) == 1:
            msg = "boom"
            raise RuntimeError(msg)
        return 0, ""

    trigger = BuilderTrigger(_settings(tmp_path), runner=runner)
    stop = asyncio.Event()
    task = await _drive(trigger, stop)

    trigger.notify()
    await asyncio.sleep(4 * DEBOUNCE)
    # The worker survived the exception and is ready to build again.
    trigger.notify()
    await asyncio.sleep(4 * DEBOUNCE)
    assert len(calls) == 2

    await _shutdown(task, stop, trigger)


@pytest.mark.asyncio
async def test_cancel_during_inflight_build_stops_promptly(tmp_path):
    """The main.py shutdown path (task.cancel) must not hang on a live build.

    A build in progress is interrupted by cancelling the run() task — the same
    thing the FastAPI lifespan does on shutdown — and must unwind promptly
    rather than waiting for the (never-completing) runner.
    """
    started = asyncio.Event()
    release = asyncio.Event()

    async def runner(cmd):
        started.set()
        await release.wait()  # never released; cancel must unwind this

    trigger = BuilderTrigger(_settings(tmp_path), runner=runner)
    stop = asyncio.Event()
    task = await _drive(trigger, stop)

    trigger.notify()
    await asyncio.wait_for(started.wait(), timeout=1.0)

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(task, timeout=1.0)


# ---------------------------------------------------------------------------
# Default subprocess runner (real, trivial commands — no builder needed)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_subprocess_runner_reports_success(tmp_path):
    trigger = BuilderTrigger(_settings(tmp_path))
    rc, output = await trigger._run_subprocess([
        sys.executable,
        "-c",
        "import sys; sys.exit(0)",
    ])
    assert rc == 0
    assert output == ""


@pytest.mark.asyncio
async def test_subprocess_runner_reports_failure_with_output(tmp_path):
    trigger = BuilderTrigger(_settings(tmp_path))
    rc, output = await trigger._run_subprocess([
        sys.executable,
        "-c",
        "print('nope'); import sys; sys.exit(3)",
    ])
    assert rc == 3
    assert "nope" in output


@pytest.mark.asyncio
async def test_run_builder_once_logs_nonzero_exit(tmp_path, caplog):
    async def runner(cmd):  # noqa: RUF029 - coroutine runner contract
        return 7, "explosion in the build"

    trigger = BuilderTrigger(_settings(tmp_path), runner=runner)
    with caplog.at_level("ERROR"):
        await trigger._run_builder_once()
    assert any(
        "builder exited 7" in record.message and "explosion" in record.message
        for record in caplog.records
    )
