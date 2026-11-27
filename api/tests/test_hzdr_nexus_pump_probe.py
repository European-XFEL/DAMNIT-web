# h5py's `Group.__getitem__` is typed as Group | Dataset | Datatype.
# pyright: reportIndexIssue=false, reportAttributeAccessIssue=false
"""NXhzdr_target v0.11: Part A's added fields and the `/pump_probe` entry.

Decisions D1-D13 of hzdr/docs/plans/plan-nxhzdr-target-v0.11-implementation.md;
ruling R-2026-11-27a for the events / events_unidentified split.
"""

from __future__ import annotations

import copy
import logging
from typing import TYPE_CHECKING, Any

import h5py
import numpy as np
import pytest

from damnit_api.metadata.hzdr_nexus import (
    PUMP_PROBE_CORE_DEFINITION,
    PUMP_PROBE_EVENT_ISSUER,
    PUMP_PROBE_SITE_DEFINITION,
    write_nexus_bridge,
)

if TYPE_CHECKING:
    from pathlib import Path

LASER = {
    "system": "DRACO",
    "pulse_energy": 3.0,
    "pulse_duration": 30.0,
    "wavelength": 800.0,
    "repetition_rate": 1.0,
    "polarization": "p",
    "beam_waist_x": 2.0,
    "beam_waist_y": 2.5,
    "contrast_ratio": 1e-10,
    "contrast_time": 100.0,
}
TARGET = {"name": "Ti 5 um", "type": "foil", "material": "Ti", "thickness": 5000.0}
PROBE = {"source": "DRACO probe arm", "type": "Optical Laser", "wavelength": 400.0}
SYNC = {
    "scheme": "common oscillator",
    "delay_mechanism": "optical delay line",
    "time_zero": 1.5,
    "time_zero_method": "plasma shutter",
    "time_zero_date": "2026-11-20T08:00:00+01:00",
}


def _shot(
    number: int,
    *,
    authority: int | None,
    delay: float | None = 5.0,
    laser: dict[str, Any] | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "laser": {**LASER, **(laser or {})},
        "target": dict(TARGET),
        "sync": dict(SYNC),
        "probe": dict(PROBE),
    }
    if delay is not None:
        metadata["probe"]["delay"] = delay
        metadata["probe"]["delay_set"] = delay
    if status is not None:
        metadata["shot_status"] = status
    return {
        "shot_key": f"PP:20261120:{number:06d}",
        "shot_number": number,
        "shot_date": "2026-11-20",
        "fired_at": f"2026-11-20T09:{number:02d}:00+01:00",
        "labfrog_record_id": f"rec-{number}",
        "authority_shot_number": authority,
        "metadata": metadata,
        "events": [],
        "data_products": [],
    }


def _build(tmp_path: Path, shots: list[dict[str, Any]]) -> Path:
    output = tmp_path / "PP.nxs"
    write_nexus_bridge(output_path=output, experiment_id="PP", shots=shots, events=[])
    return output


def _strings(dataset: Any) -> list[str]:
    return list(dataset.asstr()[...])


# --- Part A ---------------------------------------------------------------


def test_part_a_fields_sit_beside_the_v010_fields(tmp_path: Path):
    output = _build(tmp_path, [_shot(1, authority=101, delay=None)])
    with h5py.File(output, "r") as handle:
        beam = handle["entry/instrument/laser/beam"]
        assert beam["beam_waist_x_1e2_radius"][()] == pytest.approx(2.0)
        assert list(beam["spot_size"][...]) == [2.0, 2.5]
        assert beam["spot_size"].attrs["units"] == "um"
        assert beam["spot_size"].attrs["definition"] == "1/e^2 intensity radius"
        assert beam["incident_polarization"].asstr()[()] == "p"
        assert beam["polarization_label"].asstr()[()] == "p"
        assert beam["contrast_ratio"][()] == pytest.approx(1e-10)
        contrast = beam["temporal_contrast"]
        assert contrast.attrs["NX_class"] == "NXdata"
        assert contrast.attrs["signal"] == "intensity_ratio"
        assert list(contrast["intensity_ratio"][...]) == [1e-10]
        assert list(contrast["time"][...]) == [-100.0]
        assert contrast["time"].attrs["units"] == "ps"
        sample = handle["entry/sample"]
        assert sample["type"].asstr()[()] == "foil"
        assert sample["target_type"].asstr()[()] == "foil"
        assert sample.attrs["damnit_nxdl_version"] == "0.11"


def test_part_a_needs_both_inputs(tmp_path: Path):
    laser = copy.deepcopy(LASER)
    del laser["beam_waist_y"], laser["contrast_time"]
    shot = _shot(1, authority=101, delay=None)
    shot["metadata"]["laser"] = laser
    output = _build(tmp_path, [shot])
    with h5py.File(output, "r") as handle:
        beam = handle["entry/instrument/laser/beam"]
        assert "beam_waist_x_1e2_radius" in beam
        assert "spot_size" not in beam
        assert "contrast_ratio" in beam
        assert "temporal_contrast" not in beam


def test_without_probe_delay_there_is_no_record(tmp_path: Path):
    output = _build(tmp_path, [_shot(1, authority=101, delay=None)])
    with h5py.File(output, "r") as handle:
        assert "pump_probe" not in handle


# --- Part B ---------------------------------------------------------------


def test_the_record_declares_the_site_definition(tmp_path: Path):
    shots = [
        _shot(1, authority=101, delay=5.0),
        _shot(2, authority=102, delay=10.0, status="misfire"),
    ]
    output = _build(tmp_path, shots)
    with h5py.File(output, "r") as handle:
        pp = handle["pump_probe"]
        assert pp.attrs["NX_class"] == "NXentry"
        assert pp["definition"].asstr()[()] == PUMP_PROBE_SITE_DEFINITION
        assert pp.get("start_time", getlink=True).path == "/entry/start_time"
        assert handle["entry/start_time"].attrs["target"] == "/entry/start_time"
        assert pp["sample"].attrs["NX_class"] == "NXsample"
        assert pp["sample/name"].asstr()[()] == "Ti 5 um"
        assert pp["sample/target_type"].asstr()[()] == "foil"
        assert "type" not in pp["sample"]  # the HZDR classes fail NXsample/type
        events = pp["events"]
        assert events.attrs["axes"] == "identifier"
        assert events.attrs["signal"] == "pulse_delay"
        assert list(events["identifier"][...]) == [101, 102]
        assert events["identifier"].attrs["issuer"] == PUMP_PROBE_EVENT_ISSUER
        assert _strings(events["status"]) == ["shot", "misfire"]
        assert _strings(events["shot_key"]) == [s["shot_key"] for s in shots]
        assert list(events["pulse_delay"][...]) == [5.0, 10.0]
        instrument = pp["instrument"]
        assert instrument["source_pump/name"].asstr()[()] == "DRACO"
        assert instrument["source_pump/frequency"][()] == pytest.approx(1.0)
        assert instrument["beam_pump/pulse_energy"][()] == pytest.approx(3.0)
        assert list(instrument["beam_pump/spot_size"][...]) == [2.0, 2.5]
        assert instrument["source_probe/probe"].asstr()[()] == "visible light"
        delay = instrument["beam_probe/pulse_delay"]
        assert delay.attrs["units"] == "ps"
        assert delay.attrs["reference_beam"] == ("/pump_probe/instrument/beam_pump")
        assert instrument["beam_probe/incident_wavelength"].attrs["units"] == "nm"
        sync = instrument["synchronization"]
        assert sync.attrs["NX_class"] == "NXsynchronization"
        assert sync["time_zero"].attrs["method"] == "plasma shutter"
        assert "events_unidentified" not in pp


def test_every_shot_is_in_exactly_one_of_events_and_unidentified(tmp_path: Path):
    shots = [
        _shot(1, authority=101),
        _shot(2, authority=None),
        _shot(3, authority=-1),
        _shot(4, authority=104),
    ]
    output = _build(tmp_path, shots)
    with h5py.File(output, "r") as handle:
        pp = handle["pump_probe"]
        identified = _strings(pp["events/shot_key"])
        unidentified = _strings(pp["events_unidentified/shot_key"])
        assert sorted(identified + unidentified) == sorted(s["shot_key"] for s in shots)
        assert not set(identified) & set(unidentified)
        assert -1 not in list(pp["events/identifier"][...])
        assert list(pp["events/identifier"][...]) == [101, 104]
        assert len(pp["instrument/beam_probe/pulse_delay"]) == 2
        collection = pp["events_unidentified"]
        assert collection.attrs["NX_class"] == "NXcollection"
        assert _strings(collection["reason"]) == ["no authority number"] * 2
        assert _strings(collection["record_id"]) == ["rec-2", "rec-3"]


def test_a_numbered_shot_without_a_delay_is_nan(tmp_path: Path):
    output = _build(
        tmp_path, [_shot(1, authority=101), _shot(2, authority=102, delay=None)]
    )
    with h5py.File(output, "r") as handle:
        delays = handle["pump_probe/instrument/beam_probe/pulse_delay"][...]
        assert delays[0] == pytest.approx(5.0)
        assert np.isnan(delays[1])


@pytest.mark.parametrize(
    ("namespace", "key"),
    [
        ("sync", "scheme"),
        ("sync", "delay_mechanism"),
        ("probe", "source"),
        ("probe", "type"),
        ("laser", "pulse_energy"),
        ("laser", "system"),
        ("target", "name"),
    ],
)
def test_a_missing_core_item_writes_no_record(
    tmp_path: Path, caplog: pytest.LogCaptureFixture, namespace: str, key: str
):
    shot = _shot(1, authority=101)
    del shot["metadata"][namespace][key]
    with caplog.at_level(logging.WARNING):
        output = _build(tmp_path, [shot])
    with h5py.File(output, "r") as handle:
        assert "pump_probe" not in handle
    assert "no /pump_probe entry" in caplog.text


def test_no_numbered_shot_writes_no_record(tmp_path: Path):
    output = _build(tmp_path, [_shot(1, authority=None)])
    with h5py.File(output, "r") as handle:
        assert "pump_probe" not in handle


def test_a_probe_type_without_a_probe_kind_writes_no_record(tmp_path: Path):
    shot = _shot(1, authority=101)
    shot["metadata"]["probe"]["type"] = "Free-Electron Laser"
    output = _build(tmp_path, [shot])
    with h5py.File(output, "r") as handle:
        assert "pump_probe" not in handle


def test_a_missing_site_item_declares_the_core(tmp_path: Path):
    laser = {"beam_waist_y": None}
    output = _build(tmp_path, [_shot(1, authority=101, laser=laser)])
    with h5py.File(output, "r") as handle:
        pp = handle["pump_probe"]
        assert pp["definition"].asstr()[()] == PUMP_PROBE_CORE_DEFINITION
        assert "spot_size" not in pp["instrument/beam_pump"]


def test_amplification_state_only_when_every_numbered_shot_has_one(tmp_path: Path):
    full = _shot(1, authority=101, laser={"amplification_state": "full"})
    reduced = _shot(2, authority=102, laser={"amplification_state": "Reduced"})
    output = _build(tmp_path, [full, reduced])
    with h5py.File(output, "r") as handle:
        values = _strings(handle["pump_probe/events/amplification_state"])
        assert values == ["full", "reduced"]
    partial = _build(tmp_path, [full, _shot(2, authority=102)])
    with h5py.File(partial, "r") as handle:
        assert "amplification_state" not in handle["pump_probe/events"]


def test_time_zero_needs_its_method_and_date(tmp_path: Path):
    shot = _shot(1, authority=101)
    del shot["metadata"]["sync"]["time_zero_date"]
    output = _build(tmp_path, [shot])
    with h5py.File(output, "r") as handle:
        assert "time_zero" not in handle["pump_probe/instrument/synchronization"]


def test_an_off_enum_polarization_is_not_linked(tmp_path: Path):
    output = _build(
        tmp_path, [_shot(1, authority=101, laser={"polarization": "circular_left"})]
    )
    with h5py.File(output, "r") as handle:
        assert "polarization_label" in handle["entry/instrument/laser/beam"]
        assert "polarization_label" not in handle["pump_probe/instrument/beam_pump"]


def test_a_rebuild_without_the_delay_drops_the_record(tmp_path: Path):
    _build(tmp_path, [_shot(1, authority=101)])
    output = _build(tmp_path, [_shot(1, authority=101, delay=None)])
    with h5py.File(output, "r") as handle:
        assert "pump_probe" not in handle
