"""Characterization tests for the spool/builder lifespan wiring.

``consumer/bootstrap.spool_lifespan`` was extracted verbatim from ``main.py``'s
lifespan.  These tests pin its behaviour so the extraction (and any later change)
stays faithful: which consumers start for which enable gates, that the debounced
builder trigger's ``notify`` hook is wired onto *every* running consumer, and
that shutdown signals stop and closes everything.

Fakes stand in for the real ASAPO/Kafka consumers and the ``BuilderTrigger`` so
no broker connection or builder subprocess is touched.  ``spool_lifespan`` imports
those classes lazily (``from .asapo import AsapoSpoolConsumer`` etc.), so patching
the class attribute on each module is enough to intercept construction.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace
from typing import ClassVar

import pytest

from damnit_api.consumer import asapo as asapo_mod
from damnit_api.consumer import bootstrap
from damnit_api.consumer import builder_trigger as builder_mod
from damnit_api.consumer import kafka as kafka_mod


class _FakeConsumer:
    """Records construction/run/close; its run() blocks until stop is set."""

    created: ClassVar[list[_FakeConsumer]] = []

    def __init__(self, spool_root: Path, name: str) -> None:
        self.name = name
        self.config = SimpleNamespace(events_jsonl=Path(spool_root) / f"{name}.jsonl")
        self.on_new_events_hook = None
        self.stop_seen = None
        self.closed = False
        _FakeConsumer.created.append(self)

    async def run(self, stop) -> None:
        self.stop_seen = stop
        await stop.wait()

    async def aclose(self) -> None:
        self.closed = True


class _FakeAsapo(_FakeConsumer):
    @classmethod
    def from_settings(cls, spool_root):
        return cls(spool_root, "asapo")


class _FakeKafka(_FakeConsumer):
    @classmethod
    def from_settings(cls, spool_root):
        return cls(spool_root, "kafka")


class _FakeBuilderTrigger:
    created: ClassVar[list[_FakeBuilderTrigger]] = []

    def __init__(self, settings, events_jsonl=(), trigger_jsonl=()) -> None:
        self.settings = settings
        self.events_jsonl = list(events_jsonl)
        self.trigger_jsonl = list(trigger_jsonl)
        self.stop_seen = None
        _FakeBuilderTrigger.created.append(self)

    def notify(self, paths=None) -> None:  # identity is what the test asserts
        pass

    async def run(self, stop) -> None:
        self.stop_seen = stop
        await stop.wait()


class _RecordingLogger:
    """structlog-style logger stub: message positional, structured kwargs."""

    def __init__(self) -> None:
        self.info_calls: list[tuple[str, dict]] = []
        self.warning_calls: list[tuple[str, dict]] = []

    def info(self, msg, **kw) -> None:
        self.info_calls.append((msg, kw))

    def warning(self, msg, **kw) -> None:
        self.warning_calls.append((msg, kw))


@pytest.fixture
def wired(monkeypatch):
    _FakeConsumer.created.clear()
    _FakeBuilderTrigger.created.clear()
    monkeypatch.setattr(asapo_mod, "AsapoSpoolConsumer", _FakeAsapo)
    monkeypatch.setattr(kafka_mod, "KafkaSpoolConsumer", _FakeKafka)
    monkeypatch.setattr(builder_mod, "BuilderTrigger", _FakeBuilderTrigger)
    return SimpleNamespace(
        consumers=_FakeConsumer.created,
        builders=_FakeBuilderTrigger.created,
    )


def _settings(tmp_path, *, asapo=False, kafka=False, builder=False):
    return SimpleNamespace(
        damnit_path=tmp_path,
        hzdr_spool=SimpleNamespace(
            enabled=asapo,
            campaign="camp",
            broker_kind="http",
            broker_url="http://broker",
            asapo_endpoint="",
        ),
        hzdr_kafka_spool=SimpleNamespace(
            enabled=kafka,
            campaign="camp",
            bootstrap_servers="localhost:9092",
            topics=["daq.trigger"],
        ),
        hzdr_builder=SimpleNamespace(
            enabled=builder,
            output_nexus=tmp_path / "campaign.nxs",
            debounce_seconds=0.05,
        ),
    )


@pytest.mark.asyncio
async def test_noop_when_nothing_enabled(tmp_path, wired):
    logger = _RecordingLogger()
    async with bootstrap.spool_lifespan(_settings(tmp_path), logger):
        assert wired.consumers == []
    assert wired.consumers == []
    assert wired.builders == []
    assert logger.info_calls == []
    assert logger.warning_calls == []


@pytest.mark.asyncio
async def test_asapo_only_starts_runs_and_closes(tmp_path, wired):
    logger = _RecordingLogger()
    async with bootstrap.spool_lifespan(_settings(tmp_path, asapo=True), logger):
        await asyncio.sleep(0)  # let the consumer task reach its first await
        assert len(wired.consumers) == 1
        consumer = wired.consumers[0]
        assert consumer.name == "asapo"
        assert consumer.stop_seen is not None  # run() was scheduled
        assert not consumer.stop_seen.is_set()  # still running inside the ctx
        assert consumer.on_new_events_hook is None  # builder disabled -> no hook
    assert consumer.stop_seen.is_set()  # stop signalled on exit
    assert consumer.closed is True
    assert wired.builders == []
    assert [m for m, _ in logger.info_calls] == ["ASAPO spool consumer started"]


@pytest.mark.asyncio
async def test_both_consumers_wire_the_builder_trigger(tmp_path, wired):
    logger = _RecordingLogger()
    settings = _settings(tmp_path, asapo=True, kafka=True, builder=True)
    async with bootstrap.spool_lifespan(settings, logger):
        assert {c.name for c in wired.consumers} == {"asapo", "kafka"}
        assert len(wired.builders) == 1
        trigger = wired.builders[0]
        # builder points at the ASAPO event spool and the Kafka trigger spool
        assert trigger.events_jsonl == [tmp_path / "asapo.jsonl"]
        assert trigger.trigger_jsonl == [tmp_path / "kafka.jsonl"]
        # every running consumer notifies the one trigger
        for c in wired.consumers:
            assert c.on_new_events_hook == trigger.notify
    for c in wired.consumers:
        assert c.closed is True
    assert "Builder auto-trigger started" in [m for m, _ in logger.info_calls]


@pytest.mark.asyncio
async def test_builder_enabled_without_consumers_warns(tmp_path, wired):
    logger = _RecordingLogger()
    async with bootstrap.spool_lifespan(_settings(tmp_path, builder=True), logger):
        assert wired.consumers == []
        assert wired.builders == []
    assert any("no spool consumer is" in m for m, _ in logger.warning_calls), (
        logger.warning_calls
    )
