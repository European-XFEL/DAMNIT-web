"""The hand rebuild: the auto-trigger's own command, without starting a consumer."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import h5py
import numpy as np
import pytest

from damnit_api.consumer import asapo as asapo_mod
from damnit_api.consumer import bootstrap
from damnit_api.consumer import kafka as kafka_mod
from damnit_api.consumer.spool import SpoolConfig
from damnit_api.shared.hzdr_settings import HZDRBuilderSettings

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "hzdr-rebuild.py"
_spec = importlib.util.spec_from_file_location("hzdr_rebuild", SCRIPT)
assert _spec is not None
assert _spec.loader is not None
rebuild = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rebuild)


def _settings(tmp_path: Path, *, builder: HZDRBuilderSettings, kafka: bool = True):
    return SimpleNamespace(
        damnit_path=tmp_path,
        hzdr_spool=SimpleNamespace(enabled=False),
        hzdr_kafka_spool=SimpleNamespace(enabled=kafka),
        hzdr_builder=builder,
    )


@pytest.fixture
def no_consumers(monkeypatch, tmp_path):
    """Building a consumer would join the Kafka group: make it fail loudly."""

    def refuse(*_args, **_kwargs):
        msg = "builder_command must not build a consumer"
        raise AssertionError(msg)

    kafka_cfg = SpoolConfig(
        campaign="camp",
        consumer_group="g",
        spool_dir=tmp_path / "spool",
        filename="trigger.jsonl",
    )
    monkeypatch.setattr(
        kafka_mod.KafkaSpoolConsumer, "from_settings", classmethod(refuse)
    )
    monkeypatch.setattr(
        kafka_mod.KafkaSpoolConsumer,
        "config_from_settings",
        staticmethod(lambda _root: kafka_cfg),
    )
    monkeypatch.setattr(
        asapo_mod.AsapoSpoolConsumer, "from_settings", classmethod(refuse)
    )
    return kafka_cfg


def test_builder_command_is_none_when_the_trigger_is_off(tmp_path, no_consumers):
    settings = _settings(tmp_path, builder=HZDRBuilderSettings(enabled=False))
    assert bootstrap.builder_command(settings) is None


def test_builder_command_is_none_without_a_consumer(tmp_path, no_consumers):
    builder = HZDRBuilderSettings(enabled=True, output_root=tmp_path / "out")
    settings = _settings(tmp_path, builder=builder, kafka=False)
    assert bootstrap.builder_command(settings) is None


def test_builder_command_matches_the_trigger_without_a_consumer(tmp_path, no_consumers):
    builder = HZDRBuilderSettings(
        enabled=True,
        output_root=tmp_path / "out",
        curated_root=tmp_path / "curated",
        campaigns=["radbio"],
        campaign_timezone="Europe/Berlin",
    )
    cmd = bootstrap.builder_command(_settings(tmp_path, builder=builder))
    assert cmd is not None
    joined = " ".join(cmd)
    assert "--output-root " + str(tmp_path / "out") in joined
    assert "--campaign radbio" in joined
    assert "--trigger-spool " + str(tmp_path / "spool") + " trigger.jsonl" in joined
    assert "--campaign-timezone Europe/Berlin" in joined


def test_builder_inputs_from_configs(tmp_path):
    cfg = SpoolConfig(
        campaign="camp", consumer_group="g", spool_dir=tmp_path, filename="t.jsonl"
    )
    inputs = bootstrap.builder_inputs(None, cfg)
    assert inputs["trigger_spools"] == [(tmp_path, "t.jsonl")]
    assert inputs["trigger_jsonl"] == [cfg.events_jsonl]
    assert inputs["unassigned_trigger_jsonl"] == [cfg.unassigned_jsonl]
    assert inputs["events_spools"] == []


def test_extra_campaigns_are_added_once():
    cmd = ["py", "builder", "--campaign", "a"]
    assert rebuild._with_campaigns(cmd, ["a", "b", "b"]) == [
        *cmd,
        "--campaign",
        "b",
    ]


def test_export_campaigns_need_their_sqlite(tmp_path):
    (tmp_path / "A").mkdir()
    (tmp_path / "A" / "A.sqlite").write_bytes(b"x")
    (tmp_path / "B").mkdir()
    assert rebuild._export_campaigns(tmp_path) == ["A"]


def test_check_v6_counts_files_without_the_column(tmp_path, capsys):
    for name, with_column in (("new", True), ("old", False)):
        folder = tmp_path / name
        folder.mkdir()
        with h5py.File(folder / f"{name}.nxs", "w") as f:
            shots = f.create_group("entry/shots")
            if with_column:
                shots["authority_shot_number"] = np.array([-1, 7, 8])
    paths = rebuild.campaign_files(tmp_path)
    assert [p.name for p in paths] == ["new.nxs", "old.nxs"]
    assert rebuild.check_v6(paths) == 1
    out = capsys.readouterr().out
    assert "3 shots, 2 with a number" in out
    assert "MISSING" in out
