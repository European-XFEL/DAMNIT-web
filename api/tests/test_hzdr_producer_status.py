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
