from __future__ import annotations

import json
from typing import TYPE_CHECKING

from damnit_api.consumer.asapo import RealAsapoSpoolConsumer
from damnit_api.consumer.spool import SpoolConfig
from damnit_api.metadata.hzdr_nexus import load_normalized_events

if TYPE_CHECKING:
    from pathlib import Path


_FAKE_ASAPO_TOKEN = "token"  # noqa: S105 -- not a real credential, test fixture only


def _event(values: object) -> dict:
    return {
        "schema_version": "hzdr-event-v1",
        "event_id": "event-large-asapo",
        "experiment_id": "campaign-a",
        "shot_id": "shot-000001",
        "shot_number": 1,
        "source": "LaserData",
        "kind": "waveform",
        "timestamp": "2025-01-15T10:00:00Z",
        "transport": "asapo",
        "payload_ref": {},
        "values": values,
    }


def test_real_asapo_consumer_externalizes_oversized_values(tmp_path: Path):
    event = _event(values=[float(i) for i in range(5000)])
    sdk_consumer = _FakeAsapoConsumer([
        (
            json.dumps(event).encode(),
            {"_id": 42, "name": "/asapo/laserdata/shot-000001.bin"},
        )
    ])
    cfg = SpoolConfig(
        campaign="campaign-a",
        consumer_group="damnit",
        spool_dir=tmp_path / "spool",
    )
    consumer = RealAsapoSpoolConsumer(
        config=cfg,
        endpoint="asapo-broker.example:8400",
        beamtime="asapo_test",
        data_source="laserdata",
        token=_FAKE_ASAPO_TOKEN,
        stream="laser",
        sdk_consumer=sdk_consumer,
        sdk_module=_FakeAsapoModule,
    )

    messages, _ = consumer._claim_sync()
    message = messages[0]

    assert message["values"] is None
    assert message["payload_ref"]["asapo_message_id"] == 42
    assert message["payload_ref"]["path"] == "/asapo/laserdata/shot-000001.bin"
    assert message["payload_ref"]["stream"] == "laser"
    assert message["payload_ref"]["uri"].startswith("asapo://message?")
    assert "message_id=42" in message["payload_ref"]["uri"]
    assert "data_source=laserdata" in message["payload_ref"]["uri"]

    consumer.consume_one(message)
    loaded = load_normalized_events([cfg.events_jsonl])
    assert loaded[0]["values"] is None
    assert loaded[0]["payload_ref"]["uri"] == message["payload_ref"]["uri"]


def test_real_asapo_consumer_keeps_small_values_inline(tmp_path: Path):
    event = _event(values=[1.0, 2.0, 3.0])
    sdk_consumer = _FakeAsapoConsumer([(json.dumps(event).encode(), {"_id": 43})])
    consumer = RealAsapoSpoolConsumer(
        config=SpoolConfig(
            campaign="campaign-a",
            consumer_group="damnit",
            spool_dir=tmp_path / "spool",
        ),
        endpoint="asapo-broker.example:8400",
        beamtime="asapo_test",
        data_source="laserdata",
        token=_FAKE_ASAPO_TOKEN,
        stream="laser",
        sdk_consumer=sdk_consumer,
        sdk_module=_FakeAsapoModule,
    )

    messages, _ = consumer._claim_sync()

    assert messages[0]["values"] == [1.0, 2.0, 3.0]
    assert "uri" not in messages[0]["payload_ref"]


class _FakeAsapoModule:
    class AsapoEndOfStreamError(Exception):
        pass

    class AsapoStreamFinishedError(Exception):
        pass


class _FakeAsapoConsumer:
    def __init__(self, messages: list[tuple[bytes, dict]]) -> None:
        self.messages = list(messages)

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
