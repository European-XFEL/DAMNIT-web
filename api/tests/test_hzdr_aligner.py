"""shot-aligner's decisions as evidence (hzdr/docs/plans/plan-aligner-bridge.md).

The fixture is trimmed from shot-aligner's committed 2025-12-03 index: set1
events 1 to 3, all confirmed by a reviewer, with BAM's clock 73 s fast, so
by raw time BAM's file of shot 2 is nearer row 3 than row 2.
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from damnit_api.metadata.hzdr_aligner import (
    claim_for_event,
    claims_from_index,
    event_file_keys,
    load_aligner_claims,
)
from damnit_api.metadata.hzdr_nexus import (
    MATCH_RANK,
    REVIEW_REASONS,
    SUGGESTION_REASONS,
    reconcile_canonical_shots,
)

FIXTURES = Path(__file__).parent / "fixtures" / "hzdr-aligner"
BERLIN = ZoneInfo("Europe/Berlin")
EXPERIMENT = "vanlife-2025-12"
DATA = "/home/tippey/mnt/bigdata/HPLexp/Ions/rawdata/2025/2025_12_03"


def _index() -> dict:
    return json.loads((FIXTURES / "2025_12_03.index.json").read_text())


def _decisions() -> dict:
    return json.loads((FIXTURES / "2025_12_03.decisions.json").read_text())


def _claims(index: dict | None = None, decisions: dict | None = None):
    return claims_from_index(
        index or _index(), _decisions() if decisions is None else decisions
    )


def _file_events() -> list[dict]:
    """Each fixture acquisition as the watchdog would send it: no number."""
    events = []
    for event in _index()["sets"]["set1"]["events"]:
        for acquisition in event["acquisitions"]:
            png = next(f for f in acquisition["files"] if f.endswith(".png"))
            local = datetime.fromisoformat(acquisition["iso"]).replace(tzinfo=BERLIN)
            events.append({
                "event_id": f"file-{acquisition['key']}",
                "experiment_id": EXPERIMENT,
                "shot_id": f"file-{acquisition['key']}",
                "shot_number": None,
                "source": "DAQ-File-Watchdog",
                "kind": "watchdog.file",
                "timestamp": local.astimezone(ZoneInfo("UTC")).isoformat(),
                "transport": "kafka",
                "payload_ref": {
                    "path": f"{DATA}/{png}",
                    "members": [
                        {"path": f"{DATA}/{name}"} for name in acquisition["files"]
                    ],
                },
                "metadata": {"instrument": {"id": acquisition["instrument"]}},
            })
    return events


def _labfrog(count: int, time: str, **extra) -> dict:
    """A LabFrog record of 2025-12-03 with LabFrog's Count; number = 100 + Count."""
    record = {
        "record_id": f"mongo-{count}",
        "shot_number": 100 + count,
        "shot_date": "2025-12-03",
        "labfrog_date_time": f"2025-12-03 {time}",
        "campaign": EXPERIMENT,
        "local_count": count,
        "metadata": {"gvd": 39000, "tod": 0},
    }
    record.update(extra)
    return record


def _shots() -> list[dict]:
    """LabFrog's three records, a few seconds from the Shotsheet's Zeit."""
    return [
        _labfrog(1, "15:22:05"),
        _labfrog(2, "15:25:04"),
        _labfrog(
            3,
            "15:27:02",
            metadata={"gvd": 39000, "tod": 0, "laser": {"pulse_energy": 0.456}},
        ),
    ]


def _build(events=None, shots=None, claims=None):
    return reconcile_canonical_shots(
        _file_events() if events is None else events,
        experiment_id=EXPERIMENT,
        source_key=EXPERIMENT,
        labfrog_shots=_shots() if shots is None else shots,
        match_tolerance_s=120.0,
        campaign_timezone="Europe/Berlin",
        include_trigger_only=False,
        aligner_claims=_claims() if claims is None else claims,
    )


def _changed(rank: int, **changes):
    """The fixture's claims with event ``rank``'s changed (one object per event)."""
    from dataclasses import replace

    claims = _claims()
    new = {}
    for key, claim in claims.items():
        if claim.event_rank == rank:
            claims[key] = new.setdefault(id(claim), replace(claim, **changes))
    return claims


def _by_id(built):
    return {event["event_id"]: event for event in built}


# --- the reader (B2, B3) -------------------------------------------------------


def test_every_shot_file_is_claimed_with_its_row_and_confirmation():
    claims = _claims()
    # 3 events x 3 instruments x 2 files; the auxiliary files are no shot's.
    assert len(claims) == 18
    claim = claims["2025_12_03", "BAM", "set1_2025-12-03_15h-26m-10s_2_original.png"]
    assert (claim.set_name, claim.event_rank, claim.excel_row, claim.count) == (
        "set1",
        2,
        5,
        2,
    )
    assert claim.confirmed
    assert claim.row_time == "15:25:00"
    assert claim.row_values["gvd"] == 39000
    assert not any(name == "BAM" and "synchro" in file for _, name, file in claims)


KEY_2 = ("2025_12_03", "BAM", "set1_2025-12-03_15h-26m-10s_2.csv")


def test_the_ledger_decides_as_shot_aligner_does():
    """shot-aligner's Ledger.pairing: a decision stands on the pairing it saw."""

    def confirmed(change=None, *, band=None, ledger=True):
        index, decisions = _index(), _decisions()
        if band is not None:
            index["sets"]["set1"]["links"][1]["band"] = band
        if change is not None:
            decisions["links"]["set1:2"] = change
        claims = claims_from_index(index, decisions if ledger else None)
        return claims[KEY_2].confirmed

    assert confirmed()  # confirmed, witness Count 2, link Count 2
    assert not confirmed({"action": "reject"})
    # Confirmed after the index was written (band still "high"): it counts.
    assert confirmed({"action": "confirm", "matched_count": 2}, band="high")
    # Re-aligning moved the event to another Count: the approval does not follow.
    assert not confirmed({"action": "confirm", "matched_count": 3})
    # A version-1 decision has no witness: applied, as shot-aligner does.
    assert confirmed({"action": "confirm"})
    assert confirmed({"action": "repin", "row_count": 2})
    assert not confirmed({"action": "repin", "row_count": 5})
    # No ledger at all: the index's band says it.
    assert confirmed(ledger=False)
    assert not confirmed(band="high", ledger=False)


def test_a_ledger_without_an_entry_for_the_link_does_not_confirm():
    decisions = _decisions()
    del decisions["links"]["set1:2"]
    assert not _claims(decisions=decisions)[KEY_2].confirmed


def test_a_file_two_events_claim_is_nobodys():
    index = _index()
    first, second = index["sets"]["set1"]["events"][:2]
    second["acquisitions"][0]["files"].append(first["acquisitions"][0]["files"][0])
    assert ("2025_12_03", "BAM", "set1_2025-12-03_15h-22m-51s_1.csv") not in _claims(
        index
    )


def test_a_half_written_index_is_skipped(tmp_path):
    shutil.copy(FIXTURES / "2025_12_03.index.json", tmp_path)
    shutil.copy(FIXTURES / "2025_12_03.decisions.json", tmp_path)
    (tmp_path / "2025_12_04.index.json").write_text('{"date": "2025_12_04", "se')
    claims = load_aligner_claims(tmp_path)
    assert len(claims) == 18
    assert load_aligner_claims(tmp_path, dates={"2025-12-01"}) == {}


def test_an_event_is_found_by_its_path_or_its_watch_folder():
    claims = _claims()
    event = _file_events()[0]
    assert ("BAM", "set1_2025-12-03_15h-22m-51s_1_original.png") in [
        key[:2] for key in event_file_keys(event)
    ]
    assert claim_for_event(event, claims, local_date=None) is not None
    # A filename and the watch folder only, no date folder: the local date.
    bare = {
        "payload_ref": {"filename": "set1_2025-12-03_15h-22m-51s_1_original.png"},
        "metadata": {"watch": {"watch_path": "Z:\\Ions\\BAM"}},
    }
    assert claim_for_event(bare, claims, local_date=None) is None
    found = claim_for_event(bare, claims, local_date="2025-12-03")
    assert found is not None
    assert found.event_rank == 1


# --- the matcher (B4, B5) ------------------------------------------------------


def test_confirmed_files_attach_to_their_shot_despite_a_fast_clock():
    shots, built = _build()
    keys = {shot["labfrog_record_id"]: shot["shot_key"] for shot in shots}
    events = _by_id(built)
    for event in _file_events():
        got = events[event["event_id"]]
        assert got["match_quality"] == "aligner_confirmed", got.get("aligner_detail")
    # BAM's file of shot 2 (15:26:10, 73 s fast) is on shot 2, not on row 3.
    bam_2 = events["file-BAM|set1_2025-12-03_15h-26m-10s_2"]
    assert bam_2["shot_key"] == keys["mongo-2"]
    assert (
        MATCH_RANK["exact_day_shot_number_time_window"]
        < MATCH_RANK["aligner_confirmed"]
        < MATCH_RANK["shot_number"]
    )


def test_without_the_bridge_the_same_files_wait():
    _, built = _build(claims={})
    assert not any(event.get("match_quality") == "aligner_confirmed" for event in built)


@pytest.mark.parametrize(
    ("field", "value", "reason"),
    [
        ("labfrog_record_id", "mongo-3", "aligner_disagrees"),
        ("labfrog_record_id", "mongo-gone", "aligner_no_shot"),
        ("authority_shot_number", 4242, "aligner_no_shot"),
    ],
)
def test_every_piece_of_evidence_must_name_the_same_shot(field, value, reason):
    """Authority, record and Count (R-2026-11-22b): one that differs stops it."""
    _, built = _build(claims=_changed(2, **{field: value}))
    bam_2 = _by_id(built)["file-BAM|set1_2025-12-03_15h-26m-10s_2"]
    assert not bam_2.get("shot_key")
    assert bam_2["review_reason"] == reason
    assert "set1:2" in bam_2["aligner_detail"]


def test_the_authority_number_is_used_when_it_agrees():
    shots = _shots()
    shots[1]["authority_shot_number"] = 9002
    _, built = _build(shots=shots, claims=_changed(2, authority_shot_number=9002))
    bam_2 = _by_id(built)["file-BAM|set1_2025-12-03_15h-26m-10s_2"]
    assert bam_2["match_quality"] == "aligner_confirmed"
    assert "authority+count" in bam_2["aligner_detail"]


def test_labfrogs_time_must_agree_with_the_shotsheet():
    shots = _shots()
    shots[1]["labfrog_date_time"] = "2025-12-03 15:40:00"  # 15 min off Zeit
    _, built = _build(shots=shots)
    bam_2 = _by_id(built)["file-BAM|set1_2025-12-03_15h-26m-10s_2"]
    assert bam_2["review_reason"] == "aligner_check_failed"
    assert "time" in bam_2["aligner_detail"]


def test_values_both_record_must_agree():
    shots = _shots()
    shots[2]["metadata"]["laser"]["pulse_energy"] = 1.5  # Shotsheet: 0.456 J
    _, built = _build(shots=shots)
    events = _by_id(built)
    bam_3 = events["file-BAM|set1_2025-12-03_15h-27m-51s_3"]
    assert bam_3["review_reason"] == "aligner_check_failed"
    assert "elaser" in bam_3["aligner_detail"]
    # The other shots' files are unaffected.
    assert events["file-BAM|set1_2025-12-03_15h-26m-10s_2"]["match_quality"] == (
        "aligner_confirmed"
    )


def test_a_counter_reset_is_told_apart_by_time():
    shots = [*_shots(), _labfrog(2, "17:40:00", record_id="mongo-2-again")]
    shots[3]["shot_number"] = 202
    shot_rows, built = _build(shots=shots)
    keys = {shot["labfrog_record_id"]: shot["shot_key"] for shot in shot_rows}
    bam_2 = _by_id(built)["file-BAM|set1_2025-12-03_15h-26m-10s_2"]
    assert bam_2["shot_key"] == keys["mongo-2"]


def test_an_unconfirmed_link_is_only_a_suggestion():
    index = _index()
    for link in index["sets"]["set1"]["links"]:
        link["band"] = "high"
    shot_rows, built = _build(claims=claims_from_index(index, None))
    keys = {shot["labfrog_record_id"]: shot["shot_key"] for shot in shot_rows}
    bam_2 = _by_id(built)["file-BAM|set1_2025-12-03_15h-26m-10s_2"]
    assert not bam_2.get("shot_key")
    assert bam_2["match_status"] == "ambiguous"
    assert bam_2["suggested_shot_key"] == keys["mongo-2"]
    assert bam_2["suggestion_reason"] == "shot_aligner"
    assert bam_2["review_reason"] == "aligner_unconfirmed"
    assert keys["mongo-2"] in bam_2["candidate_shot_keys"]


def test_a_shot_never_gets_a_second_file_of_one_instrument():
    events = _file_events()
    extra = dict(events[0])
    extra["event_id"] = "file-BAM-duplicate"
    extra["payload_ref"] = {"path": f"{DATA}/BAM/set1_2025-12-03_15h-22m-51s_1.csv"}
    built = _by_id(_build(events=[*events, extra])[1])
    assert built["file-BAM-duplicate"]["review_reason"] == "shot_has_other_event"


def test_a_numbered_event_is_left_to_its_number():
    events = _file_events()
    events[0]["shot_number"] = 7
    built = _by_id(_build(events=events)[1])
    assert built[events[0]["event_id"]].get("match_quality") != "aligner_confirmed"


def test_the_new_reasons_are_declared():
    for reason in (
        "aligner_unconfirmed",
        "aligner_disagrees",
        "aligner_check_failed",
        "aligner_no_shot",
    ):
        assert reason in REVIEW_REASONS
    assert "shot_aligner" in SUGGESTION_REASONS


# --- settings and the builder (B6) ---------------------------------------------


def test_the_trigger_passes_the_index_folder_and_watches_it(tmp_path):
    from damnit_api.consumer.builder_trigger import BuilderTrigger
    from damnit_api.shared.hzdr_settings import HZDRBuilderSettings

    index_dir = tmp_path / "index"
    index_dir.mkdir()
    off = HZDRBuilderSettings(enabled=True, output_nexus=tmp_path / "c.nxs")
    assert (
        "--aligner-index-dir"
        not in BuilderTrigger(off, trigger_jsonl=[]).build_command()
    )

    settings = HZDRBuilderSettings(
        enabled=True, output_nexus=tmp_path / "c.nxs", aligner_index_dir=index_dir
    )
    trigger = BuilderTrigger(settings, trigger_jsonl=[])
    command = " ".join(trigger.build_command())
    assert f"--aligner-index-dir {index_dir}" in command
    assert trigger._export_signature() == {}
    shutil.copy(FIXTURES / "2025_12_03.decisions.json", index_dir)
    (index_dir / "notes.json").write_text("{}")  # not an index: not watched
    assert list(trigger._export_signature()) == [
        index_dir / "2025_12_03.decisions.json"
    ]


def _export(path: Path) -> Path:
    import sqlite3
    from contextlib import closing

    with closing(sqlite3.connect(path)) as connection, connection:
        connection.execute(
            "CREATE TABLE shots (mongo_id TEXT PRIMARY KEY, shot_number INTEGER, "
            "date_time TEXT, campaign TEXT, experiment_id TEXT, local_count INTEGER, "
            "gvd REAL, tod REAL, laser_energy REAL, status TEXT)"
        )
        connection.executemany(
            "INSERT INTO shots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    f"mongo-{count}",
                    100 + count,
                    f"2025-12-03T{time}",
                    EXPERIMENT,
                    EXPERIMENT,
                    count,
                    39000,
                    0,
                    energy,
                    "active",
                )
                for count, time, energy in (
                    (1, "15:22:05", None),
                    (2, "15:25:04", None),
                    (3, "15:27:02", 0.456),
                )
            ],
        )
    return path


def test_the_builder_attaches_confirmed_files_from_the_index_folder(tmp_path):
    import subprocess  # noqa: S404
    import sys

    events = tmp_path / "events.jsonl"
    events.write_text("".join(json.dumps(event) + "\n" for event in _file_events()))
    index_dir = tmp_path / "index"
    index_dir.mkdir()
    for name in ("2025_12_03.index.json", "2025_12_03.decisions.json"):
        shutil.copy(FIXTURES / name, index_dir)
    script = Path(__file__).parents[1] / "scripts" / "hzdr-hdf5-builder.py"
    result = subprocess.run(  # noqa: S603
        [
            sys.executable,
            str(script),
            "--experiment-id",
            EXPERIMENT,
            "--campaign-timezone",
            "Europe/Berlin",
            "--labfrog-sqlite",
            str(_export(tmp_path / "c.sqlite")),
            "--events-jsonl",
            str(events),
            "--output-nexus",
            str(tmp_path / "c.nxs"),
            "--aligner-index-dir",
            str(index_dir),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    catalog = json.loads((tmp_path / "hzdr_sources.json").read_text())
    qualities = [
        event["match_quality"]
        for shot in catalog["sources"][0]["shots"]
        for event in shot["events"]
        if event["source"] == "DAQ-File-Watchdog"
    ]
    assert qualities == ["aligner_confirmed"] * 9


# --- this year's campaigns (plan-campaign-backfill) ----------------------------

from damnit_api.metadata.hzdr_aligner import (  # noqa: E402
    acquisition_events,
    backfill,
    parse_campaign_dates,
    shotsheet_shots,
)

VANLIFE = "Vanlife_12.2025"


def test_shotsheet_rows_become_shots_numbered_through_the_day():
    index = _index()
    rows = index["shotsheet"]["rows"]
    # A second set restarting its Count, and a placeholder row it does not count.
    rows.append({**rows[0], "set_name": "set2", "count": 1, "excel_row": 90})
    rows.append({
        **rows[0],
        "set_name": "set2",
        "count": 2,
        "excel_row": 91,
        "counted": False,
    })
    shots = shotsheet_shots(index, VANLIFE)
    assert [
        (s["shot_number"], s["local_count"], s["metadata"]["shotsheet"]["set"])
        for s in shots
    ] == [
        (1, 1, "set1"),
        (2, 2, "set1"),
        (3, 3, "set1"),
        (4, 1, "set2"),
    ]
    third = shots[2]
    assert third["record_id"] == "shotsheet:2025-12-03:6"
    assert third["labfrog_date_time"] == "2025-12-03T15:27:00"
    assert third["record_source"] == "shotsheet"
    assert third["metadata"]["laser"] == {"pulse_energy": 0.456}
    assert third["metadata"]["gvd"] == 39000
    assert "count" not in third["metadata"]["shotsheet"]["values"]
    assert "authority_shot_number" not in third


def test_acquisitions_become_file_events_the_container_worker_can_read():
    events = acquisition_events(_index(), VANLIFE)
    assert len(events) == 9  # 3 events x 3 instruments; auxiliary files get none
    bam = next(
        e for e in events if e["shot_id"].endswith("BAM|set1_2025-12-03_15h-22m-51s_1")
    )
    assert bam["metadata"]["instrument"] == {
        "id": "bam",
        "format": "camera_png_csv",
        "record_source": "catalogue",
        "group": bam["metadata"]["instrument"].get("group"),
        "timing_role": bam["metadata"]["instrument"].get("timing_role"),
    }
    assert bam["shot_number"] is None
    assert "attribution" not in bam["metadata"]
    assert (
        bam["payload_ref"]["path"]
        == f"{DATA}/BAM/set1_2025-12-03_15h-22m-51s_1_original.png"
    )
    assert {m["path"] for m in bam["payload_ref"]["members"]} == {
        f"{DATA}/BAM/set1_2025-12-03_15h-22m-51s_1.csv",
        f"{DATA}/BAM/set1_2025-12-03_15h-22m-51s_1_original.png",
    }
    assert bam["metadata"]["acquisition"]["time_source"] == "filename"
    # Deterministic: the same index gives the same ids.
    assert [e["event_id"] for e in acquisition_events(_index(), VANLIFE)] == [
        e["event_id"] for e in events
    ]


def test_an_uncatalogued_folder_gets_no_instrument_but_its_own_stream():
    index = _index()
    acquisition = index["sets"]["set1"]["events"][0]["acquisitions"][0]
    acquisition["files"] = [
        name.replace("BAM/", "Mystery cam/") for name in acquisition["files"]
    ]
    event = next(
        e
        for e in acquisition_events(index, VANLIFE)
        if "Mystery" in e["payload_ref"]["path"]
    )
    assert event["metadata"]["instrument"] == {"id": None, "record_source": "none"}
    assert event["metadata"]["producer"]["instance_id"] == "shot-aligner:Mystery cam"


def _index_dir(tmp_path: Path) -> Path:
    for name in ("2025_12_03.index.json", "2025_12_03.decisions.json"):
        shutil.copy(FIXTURES / name, tmp_path)
    return tmp_path


def test_labfrog_keeps_its_dates_and_a_producer_keeps_its_files(tmp_path):
    index_dir = _index_dir(tmp_path)
    shots, events = backfill(
        index_dir, VANLIFE, ["2025_12_03"], labfrog_shots=[], events=[]
    )
    assert (len(shots), len(events)) == (3, 9)
    # LabFrog has records of that date: no Shotsheet shots, the files still come.
    shots, events = backfill(
        index_dir, VANLIFE, ["2025_12_03"], labfrog_shots=_shots(), events=[]
    )
    assert (len(shots), len(events)) == (0, 9)
    # The watchdog sent one of the files: its event wins, the copy is dropped.
    watchdog = _file_events()[:1]
    _, events = backfill(
        index_dir, VANLIFE, ["2025_12_03"], labfrog_shots=[], events=watchdog
    )
    assert len(events) == 8
    # The same file name on another day is another file.
    watchdog[0]["payload_ref"] = {
        "path": watchdog[0]["payload_ref"]["path"].replace("2025_12_03", "2025_12_04")
    }
    _, events = backfill(
        index_dir, VANLIFE, ["2025_12_03"], labfrog_shots=[], events=watchdog
    )
    assert len(events) == 9
    # A date with no index is skipped, not an error.
    assert backfill(
        index_dir, VANLIFE, ["2025_12_05"], labfrog_shots=[], events=[]
    ) == ([], [])


def test_campaign_dates_are_parsed_strictly():
    assert parse_campaign_dates([
        f"{VANLIFE}=2025_12_01",
        f"{VANLIFE}=2025-12-03",
        f"{VANLIFE}=2025_12_01",
    ]) == {VANLIFE: ["2025_12_01", "2025_12_03"]}
    with pytest.raises(ValueError, match="<campaign>="):
        parse_campaign_dates(["Vanlife"])


def test_the_trigger_passes_each_campaign_date(tmp_path):
    from damnit_api.consumer.builder_trigger import BuilderTrigger
    from damnit_api.shared.hzdr_settings import HZDRBuilderSettings

    settings = HZDRBuilderSettings(
        enabled=True,
        output_nexus=tmp_path / "c.nxs",
        aligner_index_dir=tmp_path,
        aligner_campaigns={VANLIFE: ["2025_12_01", "2025_12_03"]},
    )
    command = " ".join(BuilderTrigger(settings, trigger_jsonl=[]).build_command())
    first, second = (
        f"--aligner-campaign {VANLIFE}={d}" for d in ("2025_12_01", "2025_12_03")
    )
    assert f"{first} {second}" in command


def _run_builder(*arguments: str) -> None:
    import subprocess  # noqa: S404
    import sys

    script = Path(__file__).parents[1] / "scripts" / "hzdr-hdf5-builder.py"
    result = subprocess.run(  # noqa: S603
        [
            sys.executable,
            str(script),
            "--campaign-timezone",
            "Europe/Berlin",
            *arguments,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_a_campaign_is_built_from_shotsheet_and_index_alone(tmp_path):
    (tmp_path / "index").mkdir()
    index_dir = _index_dir(tmp_path / "index")
    events = tmp_path / "none.jsonl"
    events.write_text("")
    _run_builder(
        "--experiment-id", VANLIFE,
        "--events-jsonl", str(events),
        "--output-nexus", str(tmp_path / "out" / f"{VANLIFE}.nxs"),
        "--aligner-index-dir", str(index_dir),
        "--aligner-campaign", f"{VANLIFE}=2025_12_03",
    )  # fmt: skip
    catalog = json.loads((tmp_path / "out" / "hzdr_sources.json").read_text())
    shots = catalog["sources"][0]["shots"]
    assert [shot["experiment_id_source"] for shot in shots] == ["shotsheet"] * 3
    assert [len(shot["events"]) for shot in shots] == [4, 4, 4]  # 3 files + its row
    assert {
        event["match_quality"]
        for shot in shots
        for event in shot["events"]
        if event["source"] == "shot-aligner"
    } == {"aligner_confirmed"}


def test_multi_campaign_mode_builds_a_backfilled_campaign_without_a_spool(tmp_path):
    index_dir = tmp_path / "index"
    index_dir.mkdir()
    _index_dir(index_dir)
    _run_builder(
        "--output-root", str(tmp_path / "nexus"),
        "--aligner-index-dir", str(index_dir),
        "--aligner-campaign", f"{VANLIFE}=2025_12_03",
    )  # fmt: skip
    assert (tmp_path / "nexus" / VANLIFE / f"{VANLIFE}.nxs").is_file()
    catalog = json.loads((tmp_path / "nexus" / "hzdr_sources.json").read_text())
    vanlife = next(s for s in catalog["sources"] if s["key"] == VANLIFE)
    assert len(vanlife["shots"]) == 3


# --- the stored, parsed day (plan-backfill-store-and-console G1, G3) ------------

import os  # noqa: E402

from damnit_api.metadata.hzdr_aligner import load_day_data, local_dates  # noqa: E402


def _touch_later(path: Path) -> None:
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))


def test_a_day_is_stored_once_and_read_back_while_unchanged(tmp_path):
    (tmp_path / "index").mkdir()
    index_dir = _index_dir(tmp_path / "index")
    cache = tmp_path / "cache"
    first = load_day_data(index_dir, "2025_12_03", cache_dir=cache)
    assert first is not None
    assert not first.from_cache
    assert (cache / "2025_12_03.aligner.json").is_file()
    again = load_day_data(index_dir, "2025_12_03", cache_dir=cache)
    assert again is not None
    assert again.from_cache
    # The same content, and one claim object per shot-aligner event again.
    assert again.shots_for(VANLIFE) == first.shots_for(VANLIFE)
    assert again.events_for(VANLIFE) == first.events_for(VANLIFE)
    assert len({id(c) for c in again.claims.values()}) == 3
    assert {k: c.event_key for k, c in again.claims.items()} == {
        k: c.event_key for k, c in first.claims.items()
    }


@pytest.mark.parametrize(
    "changed", ["2025_12_03.index.json", "2025_12_03.decisions.json"]
)
def test_a_changed_index_or_decision_is_parsed_again(tmp_path, changed):
    (tmp_path / "index").mkdir()
    index_dir = _index_dir(tmp_path / "index")
    cache = tmp_path / "cache"
    load_day_data(index_dir, "2025_12_03", cache_dir=cache)
    # A reviewer rejects shot 2 in shot-aligner (or the index is rewritten).
    decisions = json.loads((index_dir / "2025_12_03.decisions.json").read_text())
    decisions["links"]["set1:2"]["action"] = "reject"
    if changed.endswith("decisions.json"):
        (index_dir / changed).write_text(json.dumps(decisions))
    _touch_later(index_dir / changed)
    day = load_day_data(index_dir, "2025_12_03", cache_dir=cache)
    assert day is not None
    assert not day.from_cache
    if changed.endswith("decisions.json"):
        confirmed = {c.event_rank: c.confirmed for c in day.claims.values()}
        assert confirmed == {1: True, 2: False, 3: True}


def test_a_corrupt_stored_day_is_ignored_and_rewritten(tmp_path):
    (tmp_path / "index").mkdir()
    index_dir = _index_dir(tmp_path / "index")
    cache = tmp_path / "cache"
    cache.mkdir()
    (cache / "2025_12_03.aligner.json").write_text('{"fingerprint": ')
    day = load_day_data(index_dir, "2025_12_03", cache_dir=cache)
    assert day is not None
    assert len(day.events) == 9
    rewritten = load_day_data(index_dir, "2025_12_03", cache_dir=cache)
    assert rewritten is not None
    assert rewritten.from_cache


def test_a_build_reads_only_the_dates_its_events_fall_on(tmp_path):
    from damnit_api.metadata import hzdr_aligner

    (tmp_path / "index").mkdir()
    index_dir = _index_dir(tmp_path / "index")
    other = json.loads((FIXTURES / "2025_12_03.index.json").read_text())
    other["date"] = "2025_12_04"
    (index_dir / "2025_12_04.index.json").write_text(json.dumps(other))
    read: list[str] = []
    real = hzdr_aligner.load_day

    def spy(directory, date_folder):
        read.append(date_folder)
        return real(directory, date_folder)

    hzdr_aligner.load_day = spy
    try:
        dates = local_dates(_file_events(), "Europe/Berlin")
        assert dates == {"2025-12-03"}
        hzdr_aligner.load_aligner_claims(index_dir, dates=dates)
    finally:
        hzdr_aligner.load_day = real
    assert read == ["2025_12_03"]


def test_a_stored_build_equals_one_without_the_store(tmp_path):
    (tmp_path / "index").mkdir()
    index_dir = _index_dir(tmp_path / "index")
    cache = tmp_path / "cache"
    plain = backfill(index_dir, VANLIFE, ["2025_12_03"], labfrog_shots=[], events=[])
    stored = [
        backfill(
            index_dir,
            VANLIFE,
            ["2025_12_03"],
            labfrog_shots=[],
            events=[],
            cache_dir=cache,
        )
        for _ in range(2)
    ]
    assert stored[0] == plain
    assert stored[1] == plain


def test_the_trigger_passes_the_cache_folder_only_when_set(tmp_path):
    from damnit_api.consumer.builder_trigger import BuilderTrigger
    from damnit_api.shared.hzdr_settings import HZDRBuilderSettings

    base = {
        "enabled": True,
        "output_nexus": tmp_path / "c.nxs",
        "aligner_index_dir": tmp_path,
    }
    plain = " ".join(
        BuilderTrigger(HZDRBuilderSettings(**base), trigger_jsonl=[]).build_command()
    )
    assert "--aligner-cache-dir" not in plain
    settings = HZDRBuilderSettings(**base, aligner_cache_dir=tmp_path / "store")
    command = " ".join(BuilderTrigger(settings, trigger_jsonl=[]).build_command())
    assert f"--aligner-cache-dir {tmp_path / 'store'}" in command
