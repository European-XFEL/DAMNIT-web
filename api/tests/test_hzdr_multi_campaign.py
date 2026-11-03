"""Multi-campaign builds (DAMNIT readiness plan C2).

One builder run with ``--output-root`` builds every campaign that receives
events, plus the ``_unassigned`` bucket, into one shared catalog; the
auto-trigger runs it when ``DW_API_HZDR_BUILDER__OUTPUT_ROOT`` is set. These
tests drive the real builder script end to end on temporary spool, curated
and output folders, and pin that single-campaign mode is unchanged.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import sqlite3
import sys
from contextlib import closing
from pathlib import Path
from typing import Any

import h5py
import pytest

from damnit_api.consumer import builder_trigger as builder_trigger_mod
from damnit_api.consumer.builder_trigger import BuilderTrigger, request_rebuild
from damnit_api.consumer.campaign_builds import (
    SpoolRoot,
    campaign_labfrog_export,
    campaign_output_nexus,
    discover_spool_campaigns,
    foreign_experiment_ids,
    stamp_campaign,
)
from damnit_api.metadata.hzdr_event import UNASSIGNED_EXPERIMENT_ID
from damnit_api.metadata.hzdr_nexus import (
    SHOT_IDENTITY_ATTR,
    BuilderAlreadyRunningError,
    append_experiment_ruling,
    catalog_write_lock,
    reconcile_canonical_shots,
    write_nexus_bridge,
    write_sources_catalog,
)
from damnit_api.shared.hzdr_settings import HZDRBuilderSettings

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "hzdr-hdf5-builder.py"
_SPEC = importlib.util.spec_from_file_location("hzdr_hdf5_builder_multi", SCRIPT_PATH)
assert _SPEC is not None
assert _SPEC.loader is not None
builder = importlib.util.module_from_spec(_SPEC)
sys.modules["hzdr_hdf5_builder_multi"] = builder
_SPEC.loader.exec_module(builder)

RADBIO = "Beamline_radbio_2026"
OTHER = "TOFBeamline_2026"
OLD = "Solenoid_Beamline_Tests_01.2025"


def trigger(
    shot_number: int,
    *,
    experiment_id: str = UNASSIGNED_EXPERIMENT_ID,
    hour: int = 12,
) -> dict[str, Any]:
    return {
        "schema_version": "hzdr-event-v1",
        "event_id": f"trigger-{shot_number}",
        "experiment_id": experiment_id,
        "shot_id": f"shot-{shot_number:06d}",
        "shot_number": shot_number,
        "source": "DRACO-Trigger",
        "kind": "draco.trigger",
        "timestamp": f"2026-06-10T{hour:02d}:{shot_number % 60:02d}:00Z",
        "transport": "kafka",
        "payload_ref": {
            "topic": "draco.trigger",
            "partition": 0,
            "offset": shot_number,
        },
        "metadata": {},
    }


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(record) + "\n" for record in records), encoding="utf-8"
    )
    return path


def write_export(
    curated_root: Path,
    campaign: str,
    shot_numbers: list[int],
    *,
    claimed: bool = True,
) -> Path:
    """A curated export; only schema v13 claimed rows carry authority numbers."""
    folder = curated_root / campaign
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{campaign}.sqlite"
    with closing(sqlite3.connect(path)) as connection, connection:
        rows = [
            (
                f"{campaign}-{number}",
                number,
                f"2026-06-10T14:{number % 60:02d}:00",
                f"2026-06-10T12:{number % 60:02d}:00Z",
                campaign.replace("_", " "),
                None,
            )
            for number in shot_numbers
        ]
        if claimed:
            connection.execute(
                "CREATE TABLE shots (mongo_id TEXT PRIMARY KEY, shot_number INTEGER, "
                "date_time TEXT, date_time_utc TEXT, campaign TEXT, "
                "experiment_id TEXT, "
                "authority_shot_number INTEGER)"
            )
            connection.executemany(
                "INSERT INTO shots VALUES (?, ?, ?, ?, ?, ?, ?)",
                [(*row, row[1]) for row in rows],
            )
        else:
            connection.execute(
                "CREATE TABLE shots (mongo_id TEXT PRIMARY KEY, shot_number INTEGER, "
                "date_time TEXT, date_time_utc TEXT, campaign TEXT, experiment_id TEXT)"
            )
            connection.executemany("INSERT INTO shots VALUES (?, ?, ?, ?, ?, ?)", rows)
    return path


class Site:
    """A spool, curated root and output root laid out like the server."""

    def __init__(self, tmp_path: Path) -> None:
        self.spool = tmp_path / "spool" / "kafka"
        self.curated = tmp_path / "curated_files"
        self.output = tmp_path / "hzdr"
        self.catalog = self.output / "hzdr_sources.json"

    def unassigned(self, *records: dict[str, Any]) -> None:
        write_jsonl(self.spool / "_unassigned" / "trigger.jsonl", list(records))

    def named(self, campaign: str, *records: dict[str, Any]) -> None:
        write_jsonl(self.spool / campaign / "trigger.jsonl", list(records))

    def argv(self, *campaigns: str, extra: tuple[str, ...] = ()) -> list[str]:
        argv = [
            str(SCRIPT_PATH),
            "--output-root",
            str(self.output),
            "--curated-root",
            str(self.curated),
            "--trigger-spool",
            str(self.spool),
            "trigger.jsonl",
            "--campaign-timezone",
            "Europe/Berlin",
        ]
        for campaign in campaigns:
            argv += ["--campaign", campaign]
        return argv + list(extra)

    def sources(self) -> dict[str, dict[str, Any]]:
        payload = json.loads(self.catalog.read_text(encoding="utf-8"))
        return {source["key"]: source for source in payload["sources"]}

    def shots(self, key: str) -> dict[int, dict[str, Any]]:
        return {shot["shot_number"]: shot for shot in self.sources()[key]["shots"]}


@pytest.fixture(autouse=True)
def _no_scicat(monkeypatch):
    """A developer's api/.env may enable SciCat; never post from a test."""
    monkeypatch.setattr(builder, "_register_scicat", lambda *args: None)


def run_builder(monkeypatch, argv: list[str]) -> int:
    monkeypatch.setattr(sys, "argv", argv)
    with pytest.raises(SystemExit) as exited:
        builder.main()
    return int(exited.value.code or 0)


# --- end to end --------------------------------------------------------------


def test_two_campaigns_and_the_unassigned_bucket_each_build(tmp_path, monkeypatch):
    site = Site(tmp_path)
    write_export(site.curated, RADBIO, [1, 2])
    # The shot authority sends every trigger unassigned; LabFrog claims 1 and 2.
    site.unassigned(trigger(1), trigger(2), trigger(3))
    # Another campaign's producer names it; it has no LabFrog export.
    site.named(OTHER, trigger(50, experiment_id=OTHER, hour=15))

    assert run_builder(monkeypatch, site.argv(RADBIO)) == 0

    assert set(site.sources()) == {RADBIO, OTHER, UNASSIGNED_EXPERIMENT_ID}
    radbio = site.shots(RADBIO)
    assert set(radbio) == {1, 2}
    assert {shot["experiment_id_source"] for shot in radbio.values()} == {"labfrog"}
    assert all(shot["match_status"] == "matched" for shot in radbio.values())

    other = site.shots(OTHER)
    assert set(other) == {50}
    assert other[50]["experiment_id_source"] == "producer"

    bucket = site.shots(UNASSIGNED_EXPERIMENT_ID)
    assert set(bucket) == {3}  # 1 and 2 are radbio's, never counted twice
    assert bucket[3]["experiment_id_source"] == "unassigned"
    assert site.sources()[UNASSIGNED_EXPERIMENT_ID]["title"].startswith("Unassigned")

    for key in (RADBIO, OTHER, UNASSIGNED_EXPERIMENT_ID):
        nexus = campaign_output_nexus(site.output.resolve(), key)
        assert nexus.is_file()
        assert site.sources()[key]["data_paths"] == [str(nexus)]
    assert (site.output / RADBIO / f"{RADBIO}.nxs").is_file()
    assert (site.output / "_unassigned" / "unassigned.nxs").is_file()


def test_a_campaign_without_an_export_builds_from_its_triggers(tmp_path, monkeypatch):
    site = Site(tmp_path)
    site.curated.mkdir(parents=True)
    site.named(OTHER, trigger(7, experiment_id=OTHER), trigger(8, experiment_id=OTHER))

    assert campaign_labfrog_export(site.curated, OTHER) is None
    assert run_builder(monkeypatch, site.argv()) == 0

    other = site.shots(OTHER)
    assert set(other) == {7, 8}
    assert not any(shot.get("record_id") for shot in other.values())
    # The bucket is built (empty) once any spool exists, so it can also empty.
    assert site.shots(UNASSIGNED_EXPERIMENT_ID) == {}


def test_a_listed_campaign_builds_before_any_event_names_it(tmp_path, monkeypatch):
    site = Site(tmp_path)
    write_export(site.curated, RADBIO, [1])
    site.spool.mkdir(parents=True)

    assert run_builder(monkeypatch, site.argv(RADBIO)) == 0
    assert site.shots(RADBIO)[1]["match_status"] == "labfrog-only"


def test_a_ruling_reaches_the_build(tmp_path, monkeypatch):
    site = Site(tmp_path)
    write_export(site.curated, RADBIO, [1])
    site.unassigned(trigger(1), trigger(7))
    assert run_builder(monkeypatch, site.argv(RADBIO)) == 0
    assert set(site.shots(UNASSIGNED_EXPERIMENT_ID)) == {7}

    # Review matches writes the ruling beside the catalog the API serves,
    # which is the shared catalog every build reads.
    append_experiment_ruling(site.catalog, shot_number=7, experiment_id=OTHER, by="pi")
    assert run_builder(monkeypatch, site.argv(RADBIO)) == 0

    # OTHER has no spool folder and no export: the ruling alone builds it.
    assert site.shots(OTHER)[7]["experiment_id_source"] == "ruling"
    assert site.shots(UNASSIGNED_EXPERIMENT_ID) == {}
    assert set(site.shots(RADBIO)) == {1}


def test_old_exports_do_not_claim_unassigned_triggers(tmp_path, monkeypatch):
    # An old export has typed numbers but no authority claim for either shot.
    site = Site(tmp_path)
    write_export(site.curated, RADBIO, [1], claimed=False)
    write_export(site.curated, OLD, [1, 2], claimed=False)
    site.unassigned(trigger(1), trigger(2))

    assert run_builder(monkeypatch, site.argv(RADBIO)) == 0

    assert site.shots(RADBIO)[1]["experiment_id_source"] == "labfrog"
    assert site.shots(RADBIO)[1]["match_status"] == "labfrog-only"
    assert set(site.shots(UNASSIGNED_EXPERIMENT_ID)) == {1, 2}
    assert OLD not in site.sources()


def test_a_failed_campaign_does_not_stop_the_others(tmp_path, monkeypatch, capsys):
    site = Site(tmp_path)
    site.named(OTHER, trigger(5, experiment_id=OTHER))
    site.unassigned(trigger(6))
    locked = campaign_output_nexus(site.output.resolve(), OTHER)
    locked.parent.mkdir(parents=True)
    lock = locked.with_name(locked.name + ".lock")
    lock.write_text(str(os.getpid()), encoding="utf-8")  # a live builder holds it

    assert run_builder(monkeypatch, site.argv()) == 1

    assert "Build failed for campaign TOFBeamline_2026" in capsys.readouterr().err
    assert set(site.sources()) == {UNASSIGNED_EXPERIMENT_ID}
    lock.unlink()


def test_output_root_refuses_single_campaign_inputs(tmp_path, monkeypatch, capsys):
    site = Site(tmp_path)
    code = run_builder(monkeypatch, site.argv(extra=("--experiment-id", RADBIO)))
    assert code == 2
    assert "--experiment-id" in capsys.readouterr().err
    code = run_builder(
        monkeypatch,
        [
            str(SCRIPT_PATH),
            "--output-nexus",
            str(tmp_path / "c.nxs"),
            "--campaign",
            RADBIO,
        ],
    )
    assert code == 2
    assert "only apply with --output-root" in capsys.readouterr().err


def _shots_for(*numbers: int) -> list[dict[str, Any]]:
    shots, _ = reconcile_canonical_shots(
        [trigger(number) for number in numbers],
        experiment_id=UNASSIGNED_EXPERIMENT_ID,
        source_key=UNASSIGNED_EXPERIMENT_ID,
    )
    return shots


def _shot_numbers(path) -> list[int]:
    with h5py.File(path, "r") as handle:
        return list(handle["entry/shots/shot_number"][...])


def test_a_damnit_owned_shot_table_may_shrink_and_reorder(tmp_path):
    # C6: single-campaign builds seed from their previous output, but a table
    # DAMNIT wrote itself preserves nothing, so it is rewritten like the first.
    output = tmp_path / "unassigned.nxs"
    write_nexus_bridge(
        output_path=output, experiment_id="u", shots=_shots_for(3, 7), events=[]
    )
    with h5py.File(output, "r") as handle:
        assert handle["entry/shots"].attrs[SHOT_IDENTITY_ATTR]

    write_nexus_bridge(
        output_path=output, experiment_id="u", shots=_shots_for(3), events=[]
    )
    assert _shot_numbers(output) == [3]

    write_nexus_bridge(
        output_path=output, experiment_id="u", shots=_shots_for(9, 3), events=[]
    )
    assert sorted(_shot_numbers(output)) == [3, 9]


def test_a_labfrog_owned_shot_table_still_may_not_shrink(tmp_path):
    output = tmp_path / "campaign.nxs"
    write_nexus_bridge(
        output_path=output, experiment_id="u", shots=_shots_for(3, 7), events=[]
    )
    # A table LabFrog wrote carries no DAMNIT ownership marker; its rows are
    # referenced by LabFrog's other groups, so seeding still guards them.
    with h5py.File(output, "r+") as handle:
        del handle["entry/shots"].attrs[SHOT_IDENTITY_ATTR]
    with pytest.raises(ValueError, match="does not match the preserved"):
        write_nexus_bridge(
            output_path=output, experiment_id="u", shots=_shots_for(3), events=[]
        )
    write_nexus_bridge(
        output_path=output,
        experiment_id="u",
        shots=_shots_for(3),
        events=[],
        seed_from_output=False,
    )
    assert _shot_numbers(output) == [3]


# --- layout rules ------------------------------------------------------------


def test_spool_folders_are_named_by_slug_but_built_by_experiment_id(tmp_path):
    spool = tmp_path / "kafka"
    write_jsonl(
        spool / "Beamline_radbio_2026" / "trigger.jsonl",
        [trigger(1, experiment_id="Beamline radbio 2026")],
    )
    write_jsonl(spool / "_unassigned" / "trigger.jsonl", [trigger(2)])
    write_jsonl(spool / "default" / "trigger.jsonl", [{"kind": "x"}])
    (spool / "empty").mkdir()

    found = discover_spool_campaigns(trigger_spools=[SpoolRoot(spool, "trigger.jsonl")])

    assert list(found) == ["Beamline radbio 2026"]
    assert found["Beamline radbio 2026"].trigger_jsonl == [
        spool / "Beamline_radbio_2026" / "trigger.jsonl"
    ]
    assert discover_spool_campaigns([SpoolRoot(tmp_path / "missing", "e.jsonl")]) == {}


def test_exports_are_found_by_name_and_records_stamped(tmp_path):
    write_export(tmp_path, RADBIO, [1])
    assert campaign_labfrog_export(tmp_path, RADBIO) == (
        tmp_path / RADBIO / f"{RADBIO}.sqlite"
    )
    assert campaign_labfrog_export(tmp_path, UNASSIGNED_EXPERIMENT_ID) is None
    assert campaign_labfrog_export(None, RADBIO) is None

    records = [
        {"shot_number": 1},
        {"shot_number": 2, "experiment_id": OTHER},
        {"shot_number": 3, "metadata": {"experiment_id": OTHER}},
    ]
    stamped = stamp_campaign(records, RADBIO)
    assert [record.get("experiment_id") for record in stamped] == [RADBIO, OTHER, None]
    assert foreign_experiment_ids(records, RADBIO) == {OTHER}


# --- shared catalog ----------------------------------------------------------


def _write(sources_file: Path, key: str, *, merge: bool) -> None:
    write_sources_catalog(
        sources_file=sources_file,
        source_key=key,
        experiment_id=key,
        nexus_path=sources_file.parent / f"{key}.nxs",
        shots=[],
        merge=merge,
    )


def test_a_merged_entry_keeps_every_other_source(tmp_path):
    sources_file = tmp_path / "hzdr_sources.json"
    sources_file.write_text(
        json.dumps({"sources": [{"key": "emulator"}, {"key": RADBIO}], "x": 1}),
        encoding="utf-8",
    )
    _write(sources_file, RADBIO, merge=True)
    _write(sources_file, OTHER, merge=True)

    payload = json.loads(sources_file.read_text(encoding="utf-8"))
    assert [source["key"] for source in payload["sources"]] == [
        "emulator",
        RADBIO,
        OTHER,
    ]
    assert payload["sources"][1]["metadata"]["experiment_id"] == RADBIO
    assert payload["x"] == 1
    assert not sources_file.with_name("hzdr_sources.json.lock").exists()


def test_an_unreadable_catalog_is_replaced_by_a_merge(tmp_path):
    sources_file = tmp_path / "hzdr_sources.json"
    sources_file.write_text("{not json", encoding="utf-8")
    _write(sources_file, RADBIO, merge=True)
    payload = json.loads(sources_file.read_text(encoding="utf-8"))
    assert [source["key"] for source in payload["sources"]] == [RADBIO]

    sources_file.write_text(json.dumps([{"key": "listed"}]), encoding="utf-8")
    _write(sources_file, RADBIO, merge=True)
    payload = json.loads(sources_file.read_text(encoding="utf-8"))
    assert [source["key"] for source in payload["sources"]] == ["listed", RADBIO]


def test_single_campaign_catalog_still_holds_one_source(tmp_path):
    sources_file = tmp_path / "hzdr_sources.json"
    sources_file.write_text(json.dumps({"sources": [{"key": "old"}]}), encoding="utf-8")
    _write(sources_file, "hzdr-labfrog", merge=False)
    payload = json.loads(sources_file.read_text(encoding="utf-8"))
    assert [source["key"] for source in payload["sources"]] == ["hzdr-labfrog"]


def test_the_catalog_lock_waits_then_gives_up(tmp_path):
    sources_file = tmp_path / "hzdr_sources.json"
    lock = tmp_path / "hzdr_sources.json.lock"
    lock.write_text(str(os.getpid()), encoding="utf-8")
    with (
        pytest.raises(BuilderAlreadyRunningError),
        catalog_write_lock(sources_file, timeout_s=0.05, poll_s=0.01),
    ):
        pass  # pragma: no cover - never entered
    lock.unlink()
    with catalog_write_lock(sources_file):
        assert lock.exists()
    assert not lock.exists()


# --- settings and auto-trigger -----------------------------------------------


def test_multi_campaign_settings_default_off():
    settings = HZDRBuilderSettings()
    assert settings.output_root is None
    assert settings.curated_root is None
    assert settings.campaigns == []
    assert settings.multi_campaign is False
    assert settings.catalog_file is None


def test_multi_campaign_settings_refuse_single_campaign_ones(tmp_path):
    with pytest.raises(ValueError, match="OUTPUT_NEXUS, DW_API_HZDR_BUILDER__EXP"):
        HZDRBuilderSettings(
            output_root=tmp_path, output_nexus=tmp_path / "c.nxs", experiment_id="x"
        )
    with pytest.raises(ValueError, match="only apply with"):
        HZDRBuilderSettings(campaigns=[RADBIO])
    with pytest.raises(ValueError, match="OUTPUT_ROOT"):
        HZDRBuilderSettings(enabled=True)
    settings = HZDRBuilderSettings(enabled=True, output_root=tmp_path)
    assert settings.catalog_file == tmp_path / "hzdr_sources.json"
    shared = HZDRBuilderSettings(output_root=tmp_path, sources_file=tmp_path / "s.json")
    assert shared.catalog_file == tmp_path / "s.json"


def test_trigger_command_in_multi_campaign_mode(tmp_path):
    settings = HZDRBuilderSettings(
        enabled=True,
        output_root=tmp_path / "hzdr",
        curated_root=tmp_path / "curated",
        campaigns=[RADBIO],
        campaign_timezone="Europe/Berlin",
        campaign_schedule=tmp_path / "schedule.json",
        extra_args=["--experiment-rulings", "x.review.jsonl"],
    )
    command = BuilderTrigger(
        settings,
        events_jsonl=[tmp_path / "ignored.jsonl"],
        events_spools=[(tmp_path / "asapo", "events.jsonl")],
        trigger_spools=[(tmp_path / "kafka", "trigger.jsonl")],
    ).build_command()
    assert command[2:] == [
        "--output-root",
        str(tmp_path / "hzdr"),
        "--sources-file",
        str(tmp_path / "hzdr" / "hzdr_sources.json"),
        "--curated-root",
        str(tmp_path / "curated"),
        "--campaign",
        RADBIO,
        "--events-spool",
        str(tmp_path / "asapo"),
        "events.jsonl",
        "--trigger-spool",
        str(tmp_path / "kafka"),
        "trigger.jsonl",
        "--campaign-timezone",
        "Europe/Berlin",
        "--match-tolerance-s",
        "120.0",
        "--campaign-schedule",
        str(tmp_path / "schedule.json"),
        "--no-time-match-autoassign",
        "--experiment-rulings",
        "x.review.jsonl",
    ]


def test_single_campaign_command_is_unchanged(tmp_path):
    settings = HZDRBuilderSettings(
        enabled=True,
        output_nexus=tmp_path / "c.nxs",
        experiment_id=RADBIO,
        labfrog_sqlite=tmp_path / "c.sqlite",
        campaign_timezone="Europe/Berlin",
    )
    command = BuilderTrigger(
        settings,
        trigger_jsonl=[tmp_path / "t.jsonl"],
        trigger_spools=[(tmp_path / "kafka", "trigger.jsonl")],
    ).build_command()
    assert command[2:] == [
        "--trigger-jsonl",
        str(tmp_path / "t.jsonl"),
        "--output-nexus",
        str(tmp_path / "c.nxs"),
        "--experiment-id",
        RADBIO,
        "--source-key",
        "hzdr-labfrog",
        "--campaign-timezone",
        "Europe/Berlin",
        "--labfrog-sqlite",
        str(tmp_path / "c.sqlite"),
        "--match-tolerance-s",
        "120.0",
        "--no-time-match-autoassign",
    ]


@pytest.mark.asyncio
async def test_a_ruling_requests_a_rebuild_while_the_trigger_runs(tmp_path):
    assert request_rebuild() is False
    runs: list[list[str]] = []

    async def runner(cmd):
        await asyncio.sleep(0)
        runs.append(list(cmd))
        return 0, ""

    settings = HZDRBuilderSettings(
        enabled=True, output_root=tmp_path, debounce_seconds=0.01
    )
    trigger_task = BuilderTrigger(settings, runner=runner)
    stop = asyncio.Event()
    task = asyncio.create_task(trigger_task.run(stop))
    for _ in range(100):
        if builder_trigger_mod._RUNNING:
            break
        await asyncio.sleep(0.01)
    assert request_rebuild() is True
    for _ in range(100):
        if runs:
            break
        await asyncio.sleep(0.01)
    stop.set()
    await task
    assert len(runs) == 1
    assert "--output-root" in runs[0]
    assert request_rebuild() is False


def test_an_unmounted_share_refuses_the_build_and_writes_nothing(tmp_path, monkeypatch):
    """2026-11-03: a build into an unmounted share landed on the local disk."""
    site = Site(tmp_path)
    write_export(site.curated, RADBIO, [1])
    site.unassigned(trigger(1))
    site.output.mkdir()

    argv = site.argv(RADBIO, extra=("--require-mount", str(site.output)))
    monkeypatch.setattr(sys, "argv", argv)
    with pytest.raises(SystemExit) as exited:
        builder.main()

    assert "Refusing to build" in str(exited.value.code)
    assert list(site.output.iterdir()) == []
