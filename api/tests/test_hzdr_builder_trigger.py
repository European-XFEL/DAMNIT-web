"""Tests for the debounced builder auto-trigger (consumer/builder_trigger.py).

The trigger coalesces spool events into subprocess reruns of the builder.  These
tests inject a fake runner so no real builder subprocess is spawned, and drive
the debounce loop with a short window for speed.
"""

from __future__ import annotations

import asyncio
from pathlib import Path  # noqa: TC003

import pytest

from damnit_api.consumer.builder_trigger import BuilderTrigger
from damnit_api.consumer.spool import HZDRSpoolConsumer, SpoolConfig
from damnit_api.shared.settings import HZDRBuilderSettings

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
