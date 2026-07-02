"""Tests for write_nexus_sample() (`/entry/sample`, NXsample).

See docs/target-ontology.md §6 (examples) and §8 (NeXus mapping table) for
the binding shapes this module writes against.
"""

from pathlib import Path
from typing import Any, cast

import h5py
import pytest

from damnit_api.metadata.hzdr_event import METADATA_KEY_REGISTRY
from damnit_api.metadata.hzdr_nexus import (
    HZDR_TARGET_PROFILE_VERSION,
    write_nexus_sample,
)


def _sample_group(handle: h5py.File) -> Any:
    return cast("Any", handle["entry/sample"])


def test_wiki_foil_example_with_properties(tmp_path: Path):
    """The full wiki-selected foil example from target-ontology.md §6."""
    target = {
        "type": "foil",
        "name": "Au 5 μm #A12",
        "provenance": "wiki",
        "wiki_page": "Target_Au_5um_A12",
        "wiki_ref": "https://wiki.hzdr.de/index.php/Target_Au_5um_A12",
        "material": "Au",
        "thickness": 5000.0,
        "diameter": 3.0,
        "properties": {"supplier": "Goodfellow", "batch": "AU-2024-117"},
    }
    path = tmp_path / "campaign.nxs"

    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        write_nexus_sample(entry, target)

    with h5py.File(path, "r") as handle:
        sample = _sample_group(handle)
        assert sample.attrs["NX_class"] == "NXsample"
        assert sample.attrs["damnit_nx_class"] == "NXhzdr_target"
        assert sample.attrs["damnit_nxdl_version"] == HZDR_TARGET_PROFILE_VERSION
        assert sample["name"].asstr()[()] == "Au 5 μm #A12"
        assert sample["chemical_formula"].asstr()[()] == "Au"
        assert sample["thickness"][()] == pytest.approx(5000.0)
        assert sample["thickness"].attrs["units"] == "nm"
        assert sample["diameter"][()] == pytest.approx(3.0)
        assert sample["diameter"].attrs["units"] == "mm"
        assert sample.attrs["damnit_provenance"] == "wiki"
        assert sample.attrs["target_ref"] == (
            "https://wiki.hzdr.de/index.php/Target_Au_5um_A12"
        )
        assert sample.attrs["prop_supplier"] == "Goodfellow"
        assert sample.attrs["prop_batch"] == "AU-2024-117"
        # Fields not provided in this example must not be written at all.
        assert "temperature" not in sample
        assert "gas_pressure" not in sample
        assert "substrate_material" not in sample
        assert "description" not in sample
        assert "gas_species" not in sample.attrs


def test_manual_other_example_omits_absent_fields(tmp_path: Path):
    """The manual "OTHER" wedge example from target-ontology.md §6.

    wiki_ref and gas_species are not provided and must be entirely absent
    from the written group/attrs, not written as null/empty.
    """
    target = {
        "type": "other",
        "name": "test wedge",
        "provenance": "manual",
        "material": "Al",
        "thickness": 250.0,
        "notes": "stepped wedge, ad-hoc mount",
    }
    path = tmp_path / "campaign.nxs"

    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        write_nexus_sample(entry, target)

    with h5py.File(path, "r") as handle:
        sample = _sample_group(handle)
        assert sample.attrs["NX_class"] == "NXsample"
        assert sample.attrs["damnit_nx_class"] == "NXhzdr_target"
        assert sample.attrs["damnit_nxdl_version"] == HZDR_TARGET_PROFILE_VERSION
        assert sample["name"].asstr()[()] == "test wedge"
        assert sample["chemical_formula"].asstr()[()] == "Al"
        assert sample["thickness"][()] == pytest.approx(250.0)
        assert sample["thickness"].attrs["units"] == "nm"
        assert sample["description"].asstr()[()] == "stepped wedge, ad-hoc mount"
        assert sample.attrs["damnit_provenance"] == "manual"

        assert "target_ref" not in sample.attrs
        assert "gas_species" not in sample.attrs
        assert "diameter" not in sample
        assert "gas_pressure" not in sample
        assert "substrate_material" not in sample


def test_legacy_string_target_normalizes(tmp_path: Path):
    """A bare `metadata.target` string (target-ontology.md §7) must widen.

    -> {"name": <string>, "type": "other", "provenance": "manual"} before
    anything is written, so a legacy producer/emulator payload still lands a
    usable NXsample group.
    """
    path = tmp_path / "campaign.nxs"

    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        write_nexus_sample(entry, "target-1")

    with h5py.File(path, "r") as handle:
        sample = _sample_group(handle)
        assert sample.attrs["NX_class"] == "NXsample"
        assert sample.attrs["damnit_nx_class"] == "NXhzdr_target"
        assert sample.attrs["damnit_nxdl_version"] == HZDR_TARGET_PROFILE_VERSION
        assert sample["name"].asstr()[()] == "target-1"
        assert sample.attrs["damnit_provenance"] == "manual"
        # No material/thickness/etc. were ever provided for the legacy form.
        assert "chemical_formula" not in sample
        assert "thickness" not in sample


def test_properties_become_prop_prefixed_group_attributes(tmp_path: Path):
    """`properties.*` entries land as `/entry/sample` attrs prefixed `prop_`."""
    target = {
        "name": "structured target",
        "provenance": "wiki",
        "properties": {
            "supplier": "Goodfellow",
            "areal_density_mg_cm2": 9.65,
            "geometry": "grating, 200 nm pitch",
        },
    }
    path = tmp_path / "campaign.nxs"

    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        write_nexus_sample(entry, target)

    with h5py.File(path, "r") as handle:
        sample = _sample_group(handle)
        assert sample.attrs["prop_supplier"] == "Goodfellow"
        assert sample.attrs["prop_areal_density_mg_cm2"] == pytest.approx(9.65)
        assert sample.attrs["prop_geometry"] == "grating, 200 nm pitch"


def test_units_match_registry_exactly(tmp_path: Path):
    """@units values must come from METADATA_KEY_REGISTRY, not a hardcoded copy.

    Cross-checks directly against the registry so drift between the two
    would fail this test.
    """
    target = {
        "name": "unit-check target",
        "provenance": "manual",
        "thickness": 100.0,
        "diameter": 2.0,
        "temperature": 20.0,
        "gas_pressure": 1.5,
    }
    path = tmp_path / "campaign.nxs"

    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        write_nexus_sample(entry, target)

    with h5py.File(path, "r") as handle:
        sample = _sample_group(handle)
        assert (
            sample["thickness"].attrs["units"]
            == METADATA_KEY_REGISTRY["target.thickness"]
        )
        assert (
            sample["diameter"].attrs["units"]
            == METADATA_KEY_REGISTRY["target.diameter"]
        )
        assert (
            sample["temperature"].attrs["units"]
            == METADATA_KEY_REGISTRY["target.temperature"]
        )
        assert (
            sample["gas_pressure"].attrs["units"]
            == METADATA_KEY_REGISTRY["target.gas_pressure"]
        )
        assert METADATA_KEY_REGISTRY["target.thickness"] == "nm"
        assert METADATA_KEY_REGISTRY["target.diameter"] == "mm"
        assert METADATA_KEY_REGISTRY["target.temperature"] == "C"
        assert METADATA_KEY_REGISTRY["target.gas_pressure"] == "bar"


def test_gas_species_written_when_present(tmp_path: Path):
    target = {
        "name": "gas jet",
        "provenance": "manual",
        "type": "gas_jet",
        "gas_species": "Ar",
        "gas_pressure": 3.2,
    }
    path = tmp_path / "campaign.nxs"

    with h5py.File(path, "w") as handle:
        entry = handle.create_group("entry")
        write_nexus_sample(entry, target)

    with h5py.File(path, "r") as handle:
        sample = _sample_group(handle)
        assert sample.attrs["gas_species"] == "Ar"
        assert sample["gas_pressure"][()] == pytest.approx(3.2)
        assert sample["gas_pressure"].attrs["units"] == "bar"
