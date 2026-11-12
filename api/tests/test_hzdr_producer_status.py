from pathlib import Path

from damnit_api.metadata.hzdr_event import HZDRPayloadRef
from damnit_api.metadata.hzdr_sources import (
    HZDRReviewEvent,
    HZDRShot,
    HZDRSource,
    HZDRSourceEvent,
)
from damnit_api.metadata.producer_status import derive_producer_status


def _source_with_events() -> HZDRSource:
    shot = HZDRShot(
        source_key="hzdr",
        shot_number=1,
        fired_at="2026-05-22T08:30:00+00:00",
        events=[
            HZDRSourceEvent(
                event_id="w1",
                source="DAQ-File-Watchdog",
                kind="watchdog_shot_event",
                timestamp="2026-05-22T08:30:01+00:00",
                transport="kafka",
                payload_ref=HZDRPayloadRef(topic="planet.watchdog.events"),
                metadata={"watch_name": "png-originals"},
            ),
            HZDRSourceEvent(
                event_id="w2",
                source="DAQ-File-Watchdog",
                kind="watchdog_shot_event",
                timestamp="2026-05-22T08:31:00+00:00",
                transport="kafka",
                payload_ref=HZDRPayloadRef(topic="planet.watchdog.events"),
                metadata={"watch_name": "png-originals"},
            ),
            HZDRSourceEvent(
                event_id="s1",
                source="Shotcounter",
                kind="draco01",
                timestamp="2026-05-22T08:30:00+00:00",
                transport="kafka",
            ),
            HZDRSourceEvent(
                event_id="laser",
                source="LaserData",
                kind="pulse_energy_j",
                timestamp="2026-05-22T08:30:00+00:00",
            ),
        ],
    )
    return HZDRSource(
        key="hzdr",
        title="HZDR",
        damnit_path=Path("damnit/hzdr"),
        shots=[shot],
        review_events=[
            HZDRReviewEvent(
                event_id="w3",
                experiment_id="exp",
                source="PLANET-Watchdog",
                kind="mongodb_shotsheet",
                timestamp="2026-05-22T09:00:00+00:00",
                match_status="unmatched",
                metadata={"watch_name": "mongodb_shotsheet"},
            )
        ],
    )


def test_watchdog_hosts_grouped_from_events():
    status = derive_producer_status(_source_with_events())

    hosts = {host.host: host for host in status.watchdog_hosts}
    # Topic-derived host from the shot events plus the review-event watch_name host.
    assert "planet.watchdog.events" in hosts
    assert hosts["planet.watchdog.events"].event_count == 2
    assert hosts["planet.watchdog.events"].last_seen == "2026-05-22T08:31:00+00:00"
    assert "mongodb_shotsheet" in hosts


def test_shotcounter_status_active_with_tkey():
    status = derive_producer_status(_source_with_events()).shotcounter

    assert status.status == "active"
    assert status.tkeys_seen == ["draco01"]
    assert status.event_count == 1
    assert status.last_event_at == "2026-05-22T08:30:00+00:00"


def test_absent_shotcounter_when_no_events():
    source = HZDRSource(key="empty", title="Empty", damnit_path=Path("damnit/empty"))

    status = derive_producer_status(source)

    assert status.shotcounter.status == "absent"
    assert status.watchdog_hosts == []


def _source_with_real_envelopes() -> HZDRSource:
    """Events as the shot authority and two DAQ File Watchdog PCs send them."""

    def watchdog(event_id: str, instance: str, second: int) -> HZDRSourceEvent:
        return HZDRSourceEvent(
            event_id=event_id,
            source="DAQ-File-Watchdog",
            kind="watchdog.M1_Spec_Fib_Cer",
            timestamp=f"2026-05-22T08:30:{second:02d}+00:00",
            transport="kafka",
            # Both PCs publish to the one topic: it cannot tell them apart.
            payload_ref=HZDRPayloadRef(topic="planet.watchdog.events"),
            metadata={
                "watch": {"watch_name": "M1_Spec_Fib_Cer", "host": "ignored"},
                "producer": {"instance_id": instance, "host": "daq-pc"},
            },
        )

    shot = HZDRShot(
        source_key="hzdr",
        shot_number=1,
        fired_at="2026-05-22T08:30:00+00:00",
        events=[
            HZDRSourceEvent(
                event_id="t1",
                source="DRACO-Trigger",
                kind="trigger.threshold_crossing",
                timestamp="2026-05-22T08:30:00+00:00",
                transport="kafka",
                payload_ref=HZDRPayloadRef.model_validate({
                    "topic": "draco.trigger",
                    "channel_id": "Draco01",
                }),
                metadata={"trigger": {"channel_id": "Draco01"}},
            ),
            watchdog("w1", "watchdog-ions-01", 1),
            watchdog("w2", "watchdog-ions-01", 2),
            watchdog("w3", "watchdog-electrons-01", 3),
        ],
    )
    return HZDRSource(
        key="hzdr", title="HZDR", damnit_path=Path("damnit/hzdr"), shots=[shot]
    )


def test_shot_authority_trigger_counts_as_the_shotcounter():
    """Flow mesh plan M11 (X15): a real trigger must not read as ``absent``."""
    status = derive_producer_status(_source_with_real_envelopes()).shotcounter

    assert status.status == "active"
    assert status.tkeys_seen == ["draco01"]
    assert status.event_count == 1


def test_watchdog_pcs_are_told_apart_by_producer_instance():
    """One card per PC and the rule's own name, not one card per Kafka topic."""
    hosts = {
        host.host: host
        for host in derive_producer_status(_source_with_real_envelopes()).watchdog_hosts
    }

    assert set(hosts) == {"watchdog-ions-01", "watchdog-electrons-01"}
    assert hosts["watchdog-ions-01"].event_count == 2
    assert hosts["watchdog-ions-01"].watcher == "M1_Spec_Fib_Cer"
    assert hosts["watchdog-ions-01"].last_seen == "2026-05-22T08:30:02+00:00"
