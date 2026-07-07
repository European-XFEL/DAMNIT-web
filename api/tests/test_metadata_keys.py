"""Tests for the metadata key registry and warn-only legacy-key linter.

See CLAUDE.md "Metadata key registry (binding, signed off 2026-07-02)" for
the authoritative human-readable table this module's constants must match,
and hzdr/docs/target-ontology.md §4/§5 for the `properties` exemption and units
convention this linter must respect.
"""

from damnit_api.metadata.hzdr_event import (
    LEGACY_KEY_MAP,
    METADATA_KEY_REGISTRY,
    lint_metadata_keys,
)


class TestRegistryCompleteness:
    """Every legacy key must map to a real, registered canonical key."""

    def test_every_legacy_key_maps_to_a_registered_key(self):
        for legacy_key, canonical_key in LEGACY_KEY_MAP.items():
            assert canonical_key in METADATA_KEY_REGISTRY, (
                f"{legacy_key!r} maps to {canonical_key!r}, which is missing "
                "from METADATA_KEY_REGISTRY"
            )

    def test_registry_keys_are_namespaced(self):
        for key in METADATA_KEY_REGISTRY:
            assert "." in key, f"{key!r} is not a namespaced 'namespace.key' string"


class TestLintMetadataKeys:
    """lint_metadata_keys() warns on legacy keys, never mutates, never raises."""

    def test_silent_on_all_bare_key_metadata(self):
        metadata = {
            "target": {
                "type": "foil",
                "name": "Au 5 um #A12",
                "provenance": "wiki",
                "material": "Au",
                "thickness": 5000.0,
                "diameter": 3.0,
            },
            "laser": {
                "pulse_energy": 12.4,
                "wavelength": 800.0,
                "repetition_rate": 10.0,
            },
            "vacuum": {
                "chamber_pressure": 2.5e-5,
                "pre_shot_pressure": 1.0e-4,
            },
            "run": {"facility": "HZDR"},
        }

        assert lint_metadata_keys(metadata) == []

    def test_flags_legacy_top_level_key(self):
        warnings = lint_metadata_keys({"laser_energy_j": 12.4})

        assert len(warnings) == 1
        assert "laser_energy_j" in warnings[0]
        assert "laser.pulse_energy" in warnings[0]

    def test_flags_legacy_key_nested_in_namespace_dict(self):
        warnings = lint_metadata_keys({
            "laser": {"wavelength_nm": 800.0},
            "vacuum": {"chamber_pressure_mbar": 2.5e-5},
        })

        assert len(warnings) == 2
        joined = " ".join(warnings)
        assert "laser.wavelength_nm" in joined
        assert "laser.wavelength" in joined
        assert "vacuum.chamber_pressure_mbar" in joined
        assert "vacuum.chamber_pressure" in joined

    def test_flags_multiple_legacy_keys_top_level_and_nested(self):
        warnings = lint_metadata_keys({
            "pulse_energy_j": 12.4,
            "target": {"thickness_nm": 250.0},
        })

        assert len(warnings) == 2

    def test_properties_subobject_is_exempt(self):
        metadata = {
            "target": {
                "type": "foil",
                "name": "Au 5 um #A12",
                "provenance": "wiki",
                "properties": {
                    "areal_density_mg_cm2": 9.65,
                    # Looks legacy-suffixed, but properties is a free-form
                    # bag exempt from the registry - must not be flagged.
                    "thickness_nm": 5000.0,
                },
            }
        }

        assert lint_metadata_keys(metadata) == []

    def test_does_not_mutate_input(self):
        metadata = {"laser_energy_j": 12.4, "laser": {"wavelength_nm": 800.0}}
        before = {
            "laser_energy_j": 12.4,
            "laser": {"wavelength_nm": 800.0},
        }

        lint_metadata_keys(metadata)

        assert metadata == before

    def test_never_raises_on_odd_shapes(self):
        assert lint_metadata_keys({}) == []
        assert lint_metadata_keys({"laser": "not-a-dict"}) == []
        assert lint_metadata_keys({"laser": None}) == []
        assert lint_metadata_keys({"laser": [1, 2, 3]}) == []
