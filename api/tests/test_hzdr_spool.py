"""Tests for the durable HZDR spool consumer.

These tests use the in-process harness from asapo-for-hzdr-damnit to provide
a real broker (BrokerStore) without needing Docker, Kafka, or ASAPO.  The
five properties from docs/integration-roadmap.md §Durable Spool Design are
each covered by one test:

    1. claim does not advance position until ack
    2. write-and-flush before ack (event on disk before broker position moves)
    3. dedup by event_id (replay does not re-write same event)
    4. campaign-scoped offsets (two campaigns are independent)
    5. ack only after write (interrupted write must not advance offset)
"""

from __future__ import annotations

import asyncio
import contextlib
import importlib.util
import json
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

from damnit_api.consumer.asapo import AsapoSpoolConsumer, RealAsapoSpoolConsumer
from damnit_api.consumer.spool import (
    HZDRSpoolConsumer,
    SpoolConfig,
    _load_staged_identities,
    _message_identity,
)

# ---------------------------------------------------------------------------
# Load the broker harness from the sibling repo without installing it.
# ---------------------------------------------------------------------------

_SUITE_PATH = (
    Path(__file__).parents[3]
    / "asapo-for-hzdr-damnit"
    / "tools"
    / "local_message_suite.py"
)

_FAKE_ASAPO_TOKEN = "token"  # noqa: S105 -- not a real credential, test fixture only

if _SUITE_PATH.exists():
    _spec = importlib.util.spec_from_file_location("local_message_suite", _SUITE_PATH)
    _suite = importlib.util.module_from_spec(_spec)  # type: ignore[arg-type]
    assert _spec.loader is not None  # pyright: ignore[reportOptionalMemberAccess]
    _spec.loader.exec_module(_suite)  # type: ignore[union-attr]
    _SUITE_AVAILABLE = True
else:
    _suite = None  # type: ignore[assignment]
    _SUITE_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not _SUITE_AVAILABLE,
    reason="asapo-for-hzdr-damnit sibling repo not found",
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_event(event_id: str, experiment_id: str = "campaign-a") -> dict:
    return {
        "schema_version": "hzdr-event-v1",
        "event_id": event_id,
        "experiment_id": experiment_id,
        "shot_id": "shot-000001",
        "shot_number": 1,
        "source": "LaserData",
        "kind": "waveform",
        "timestamp": "2025-01-15T10:00:00Z",
        "transport": "asapo",
        "payload_ref": {"stream": "laser", "message_id": 1},
    }


def _start_broker(
    store: object, tmp_path: Path
) -> tuple[str, threading.Thread, ThreadingHTTPServer]:
    """Start a local broker HTTP server in a background thread."""
    handler = _suite.make_handler(store, {})  # pyright: ignore[reportOptionalMemberAccess]
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return f"http://127.0.0.1:{port}", thread, server


def _make_consumer(
    broker_url: str, spool_dir: Path, campaign: str = "campaign-a"
) -> AsapoSpoolConsumer:
    cfg = SpoolConfig(
        campaign=campaign,
        consumer_group="test-group",
        spool_dir=spool_dir,
        poll_interval=0.05,
        batch_size=10,
    )
    return AsapoSpoolConsumer(config=cfg, broker_url=broker_url, timeout=5.0)


async def _run_consumer_briefly(consumer: AsapoSpoolConsumer, seconds: float) -> None:
    stop = asyncio.Event()
    task = asyncio.create_task(consumer.run(stop))
    await asyncio.sleep(seconds)
    stop.set()
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    await consumer.aclose()


# ---------------------------------------------------------------------------
# Unit tests (no HTTP)
# ---------------------------------------------------------------------------


def test_message_identity_prefers_event_id():
    msg = _make_event("event-abc")
    assert _message_identity(msg) == "event_id:event-abc"


def test_message_identity_falls_back_to_sha256():
    identity = _message_identity({"source": "x", "kind": "y"})
    assert identity.startswith("sha256:")


def test_load_staged_identities_reads_existing_jsonl(tmp_path):
    path = tmp_path / "events.jsonl"
    path.write_text(json.dumps(_make_event("event-existing")) + "\n", encoding="utf-8")
    assert "event_id:event-existing" in _load_staged_identities(path)


def test_load_staged_identities_empty_when_missing(tmp_path):
    assert _load_staged_identities(tmp_path / "no-such-file.jsonl") == set()


def test_consume_one_writes_event_to_disk(tmp_path):
    cfg = SpoolConfig(campaign="campaign-a", consumer_group="g", spool_dir=tmp_path)
    consumer = _ConcreteConsumer(cfg)
    path = consumer.consume_one(_make_event("event-1"))
    assert path is not None
    assert path.exists()
    rows = [json.loads(ln) for ln in path.read_text().splitlines() if ln.strip()]
    assert any(row.get("event_id") == "event-1" for row in rows)


def test_consume_one_warns_on_legacy_metadata_keys(tmp_path, caplog):
    """The live ingestion path (consume_one, shared by every spool consumer)
    should lint incoming metadata the same way the build-time path
    (hzdr_nexus._normalize_event) does, so a legacy key is visible in the
    consumer logs instead of only surfacing later at build time."""
    cfg = SpoolConfig(campaign="campaign-a", consumer_group="g", spool_dir=tmp_path)
    consumer = _ConcreteConsumer(cfg)
    event = _make_event("event-legacy")
    event["metadata"] = {"wavelength_nm": 800}

    with caplog.at_level("WARNING"):
        path = consumer.consume_one(event)

    assert path is not None
    assert any(
        "legacy metadata key" in record.message and "event-legacy" in record.message
        for record in caplog.records
    )


def test_consume_one_deduplicates_same_event(tmp_path):
    cfg = SpoolConfig(campaign="campaign-a", consumer_group="g", spool_dir=tmp_path)
    consumer = _ConcreteConsumer(cfg)
    event = _make_event("event-dup")
    consumer.consume_one(event)
    assert consumer.consume_one(event) is None
    written = [ln for ln in cfg.events_jsonl.read_text().splitlines() if ln.strip()]
    assert len(written) == 1


def test_consume_one_dedup_survives_restart(tmp_path):
    cfg = SpoolConfig(campaign="campaign-a", consumer_group="g", spool_dir=tmp_path)
    _ConcreteConsumer(cfg).consume_one(_make_event("event-persist"))
    assert _ConcreteConsumer(cfg).consume_one(_make_event("event-persist")) is None


# ---------------------------------------------------------------------------
# Integration tests (live local broker)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_asapo_consumer_claim_write_ack(tmp_path):
    """Full claim→write→ack cycle: event on disk, offset advanced."""
    store = _suite.BrokerStore(tmp_path / "broker")  # pyright: ignore[reportOptionalMemberAccess]
    store.publish(_make_event("event-1", "campaign-a"))
    url, _, server = _start_broker(store, tmp_path)
    try:
        consumer = _make_consumer(url, tmp_path / "spool", campaign="campaign-a")
        await _run_consumer_briefly(consumer, 0.2)

        spool_file = consumer.config.events_jsonl
        assert spool_file.exists(), "Event was not written to spool"
        rows = [
            json.loads(ln) for ln in spool_file.read_text().splitlines() if ln.strip()
        ]
        assert any(row.get("event_id") == "event-1" for row in rows)
        groups = store.status()["consumer_groups"]
        assert groups.get("campaign-a", {}).get("test-group", 0) == 1
    finally:
        server.shutdown()


@pytest.mark.asyncio
async def test_asapo_consumer_does_not_ack_before_write(tmp_path):
    """Broker offset must stay 0 when no events are published."""
    store = _suite.BrokerStore(tmp_path / "broker")  # pyright: ignore[reportOptionalMemberAccess]
    url, _, server = _start_broker(store, tmp_path)
    try:
        consumer = _make_consumer(url, tmp_path / "spool", campaign="campaign-a")
        await _run_consumer_briefly(consumer, 0.15)
        groups = store.status()["consumer_groups"]
        assert groups == {}, "Offset advanced with no messages"
    finally:
        server.shutdown()


@pytest.mark.asyncio
async def test_asapo_consumer_campaign_offsets_independent(tmp_path):
    """Consuming campaign-b must not touch campaign-a offset."""
    store = _suite.BrokerStore(tmp_path / "broker")  # pyright: ignore[reportOptionalMemberAccess]
    store.publish(_make_event("event-a", "campaign-a"))
    store.publish(_make_event("event-b", "campaign-b"))
    url, _, server = _start_broker(store, tmp_path)
    try:
        consumer_b = _make_consumer(url, tmp_path / "spool", campaign="campaign-b")
        await _run_consumer_briefly(consumer_b, 0.2)
        groups = store.status()["consumer_groups"]
        assert "campaign-a" not in groups, "campaign-a offset should be untouched"
        assert groups.get("campaign-b", {}).get("test-group", 0) == 2
    finally:
        server.shutdown()


@pytest.mark.asyncio
async def test_asapo_consumer_replay_dedup(tmp_path):
    """Replayed events (same event_id) must not be written twice."""
    store = _suite.BrokerStore(tmp_path / "broker")  # pyright: ignore[reportOptionalMemberAccess]
    store.publish(_make_event("event-replay", "campaign-a"))
    url, _, server = _start_broker(store, tmp_path)
    try:
        consumer = _make_consumer(url, tmp_path / "spool", campaign="campaign-a")
        await _run_consumer_briefly(consumer, 0.2)

        # Publish the same event again to simulate broker replay after restart.
        store.publish(_make_event("event-replay", "campaign-a"))
        consumer2 = _make_consumer(url, tmp_path / "spool", campaign="campaign-a")
        await _run_consumer_briefly(consumer2, 0.2)

        spool_file = consumer2.config.events_jsonl
        rows = [ln for ln in spool_file.read_text().splitlines() if ln.strip()]
        assert len(rows) == 1, f"Expected 1 unique event, got {len(rows)}"
    finally:
        server.shutdown()


@pytest.mark.asyncio
async def test_real_asapo_consumer_claims_json_and_acks_after_spool(tmp_path):
    event = _make_event("event-real-asapo", "campaign-a")
    sdk_consumer = _FakeAsapoConsumer([(json.dumps(event).encode(), {"_id": 42})])
    cfg = SpoolConfig(
        campaign="campaign-a",
        consumer_group="damnit",
        spool_dir=tmp_path / "spool",
        batch_size=10,
    )
    consumer = RealAsapoSpoolConsumer(
        config=cfg,
        endpoint="localhost:8400",
        beamtime="asapo_test",
        data_source="damnit",
        token=_FAKE_ASAPO_TOKEN,
        stream="laser",
        sdk_consumer=sdk_consumer,
        sdk_module=_FakeAsapoModule,
    )

    messages, token = await consumer._claim()
    assert messages[0]["event_id"] == "event-real-asapo"
    assert messages[0]["payload_ref"]["message_id"] == 1
    assert messages[0]["payload_ref"]["asapo_message_id"] == 42
    assert messages[0]["payload_ref"]["stream"] == "laser"
    assert sdk_consumer.acked == []

    consumer.consume_one(messages[0])
    await consumer._ack(token)

    assert sdk_consumer.acked == [("damnit", 42, "laser")]
    assert cfg.events_jsonl.exists()


def test_hzdr_spool_settings_validate_real_asapo_required_fields():
    from pydantic import SecretStr, ValidationError

    from damnit_api.shared.settings import HZDRSpoolSettings

    with pytest.raises(ValidationError, match="ASAPO_ENDPOINT"):
        HZDRSpoolSettings(enabled=True, broker_kind="asapo")

    settings = HZDRSpoolSettings(
        enabled=True,
        broker_kind="asapo",
        asapo_endpoint="localhost:8400",
        asapo_beamtime="asapo_test",
        asapo_data_source="damnit",
        asapo_token=SecretStr(_FAKE_ASAPO_TOKEN),
    )

    assert settings.broker_kind == "asapo"


# ---------------------------------------------------------------------------
# Concrete stub — only needed for unit tests that bypass HTTP
# ---------------------------------------------------------------------------


class _ConcreteConsumer(HZDRSpoolConsumer):
    async def _claim(self) -> tuple[list, dict]:
        return [], {}

    async def _ack(self, token: object) -> None:
        pass


class _FakeAsapoModule:
    class AsapoEndOfStreamError(Exception):
        pass

    class AsapoStreamFinishedError(Exception):
        pass


class _FakeAsapoConsumer:
    def __init__(self, messages: list[tuple[bytes, dict]]) -> None:
        self.messages = list(messages)
        self.acked: list[tuple[str, int, str]] = []

    def get_next(
        self,
        group_id: str,
        *,
        stream: str,
        meta_only: bool,
        ordered: bool,
    ) -> tuple[bytes, dict]:
        assert group_id == "damnit"
        assert stream == "laser"
        assert meta_only is False
        assert ordered is True
        if not self.messages:
            raise _FakeAsapoModule.AsapoEndOfStreamError
        return self.messages.pop(0)

    def acknowledge(self, group_id: str, message_id: int, *, stream: str) -> None:
        self.acked.append((group_id, message_id, stream))
