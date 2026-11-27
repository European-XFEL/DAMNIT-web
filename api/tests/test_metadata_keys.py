"""Tests for the metadata key registry and warn-only legacy-key linter.

See CLAUDE.md "Metadata key registry (binding, signed off 2026-07-02)" for
the authoritative human-readable table this module's constants must match,
and hzdr/docs/target-ontology.md §4/§5 for the `properties` exemption and units
convention this linter must respect.
"""

from damnit_api.metadata.hzdr_event import (
    LASER_POLARIZATION_VALUES,
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
            "diagnostic": {
                "xray_counts": 1500,
                "detector_signal_mean": 2.25,
                "alignment_score": 0.82,
            },
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

    def test_flags_legacy_flat_diagnostic_spelling_at_top_level(self):
        warnings = lint_metadata_keys({"xray_counts": 1500})

        assert len(warnings) == 1
        assert "xray_counts" in warnings[0]
        assert "diagnostic.xray_counts" in warnings[0]

    def test_namespaced_diagnostic_key_is_not_flagged_as_legacy(self):
        # The legacy flat spelling equals the namespaced bare name, so the
        # linter must skip the identity case: diagnostic.xray_counts is the
        # canonical spelling, not a legacy one.
        assert lint_metadata_keys({"diagnostic": {"xray_counts": 1500}}) == []

    def test_flags_unregistered_diagnostic_key(self):
        warnings = lint_metadata_keys({"diagnostic": {"proton_max_energy": 12.5}})

        assert len(warnings) == 1
        assert "diagnostic.proton_max_energy" in warnings[0]
        assert "METADATA_KEY_REGISTRY" in warnings[0]

    def test_unregistered_keys_in_other_namespaces_stay_silent(self):
        # Only the diagnostic namespace is registry-governed for presence;
        # laser/target/vacuum linting stays legacy-suffix-only (an extra
        # laser key may be a future typed key, not necessarily a mistake).
        assert lint_metadata_keys({"laser": {"front_end_energy": 0.4}}) == []

    def test_accepts_every_vocabulary_polarization_label(self):
        for label in LASER_POLARIZATION_VALUES:
            assert lint_metadata_keys({"laser": {"polarization": label}}) == []

    def test_polarization_vocabulary_is_case_insensitive(self):
        assert lint_metadata_keys({"laser": {"polarization": "P"}}) == []

    def test_flags_off_vocabulary_polarization_label(self):
        # The registry types laser.polarization as a string enum; an
        # unrecognized spelling reaches NXbeam.incident_polarization verbatim
        # and fragments the vocabulary across producers.
        warnings = lint_metadata_keys({"laser": {"polarization": "p-pol @45deg"}})

        assert len(warnings) == 1
        assert "p-pol @45deg" in warnings[0]
        assert "vocabulary" in warnings[0]

    def test_polarization_lint_tolerates_non_string_values(self):
        assert lint_metadata_keys({"laser": {"polarization": None}}) == []
        assert lint_metadata_keys({"laser": {"polarization": 45}}) == []

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


# Registry keys that are deliberately captured-but-unwritten: signed off into
# METADATA_KEY_REGISTRY but not (yet) routed anywhere by the NeXus writer.
# Every entry needs a reason - an empty set means the writer covers the whole
# registry. (vacuum.* sat here implicitly and undetected from sign-off
# 2026-07-02 until the NXenvironment group landed 2026-07-17; this test exists
# so that state is a visible ruling, never a silent gap.)
EXPECTED_UNWRITTEN_KEYS: dict[str, str] = {
    # producer.instance_id *is* written — bridge profile v3 promotes it to the
    # /entry/source_events/producer_instance_id column. producer.host is
    # deliberately not: one identifier per producer is enough to attribute a
    # row, and a hostname is descriptive detail that stays in metadata_json
    # rather than becoming a second, competing identity in the shot table.
    "producer.host": (
        "descriptive producer detail retained in metadata_json; instance_id is "
        "the promoted identity (bridge profile hzdr-canonical-shot-v3)"
    ),
    # Registered 2026-09-29 (decision D2) ahead of any producer. Only
    # instrument.id is promoted (the /entry/source_events/instrument_id column,
    # bridge profile v4); the rest describe the instrument or the producer's
    # attribution of a file and are retained verbatim in metadata_json for
    # audit and review. Grouping data_products under /entry/instrument/<id>
    # (W3) and feeding attribution.candidates into review (W6.3) will route
    # some of them - remove each from here when it does.
    **dict.fromkeys(
        (
            "instrument.group",
            "instrument.timing_role",
            "instrument.format",
            "instrument.record_source",
            "attribution.method",
            "attribution.status",
            "attribution.delta_s",
            "attribution.candidates",
            "acquisition.time",
            "acquisition.time_source",
            "acquisition.laserdata_counter",
        ),
        "retained in metadata_json; not yet routed (plan W3/W6.3), audit only",
    ),
}


class TestRegistryWriterCoverage:
    """Every registry key is either written by hzdr_nexus.py or exempted above.

    A key lands in the writer as a literal in one of three forms: a
    ``unit_key="namespace.key"`` argument (numeric datasets, @units stamped
    from the registry), a ``<namespace>.get("key")`` lookup on the namespace
    dict (string-valued datasets/attributes), or a whole-namespace dynamic
    lookup ``f"namespace.{name}"`` (the per-shot series writers, which route
    every key of the namespace - e.g. diagnostic.* NXdetector series and the
    laser shot_series NXdata group). Where a key routes is a semantic ruling,
    so this test only detects - it can never auto-fix.
    """

    @staticmethod
    def _writer_source() -> str:
        import inspect

        from damnit_api.metadata import hzdr_nexus

        return inspect.getsource(hzdr_nexus)

    def test_every_registry_key_reaches_the_writer(self):
        import re

        source = self._writer_source()
        uncovered = []
        for registry_key in METADATA_KEY_REGISTRY:
            namespace, _, bare_key = registry_key.partition(".")
            patterns = (
                rf'unit_key="{re.escape(registry_key)}"',
                rf'\b{re.escape(namespace)}\.get\(\s*"{re.escape(bare_key)}"',
                rf'\.get\(\s*"{re.escape(registry_key)}"',
                rf'f"{re.escape(namespace)}\.\{{',
                # _shot_value / _campaign_constant / _per_event_floats
                # (NXhzdr_target v0.11's /pump_probe entry): "ns", "key".
                rf'"{re.escape(namespace)}",\s*"{re.escape(bare_key)}"',
            )
            if not any(re.search(pattern, source) for pattern in patterns):
                uncovered.append(registry_key)

        unexpected = [key for key in uncovered if key not in EXPECTED_UNWRITTEN_KEYS]
        assert not unexpected, (
            "registry keys captured but never written by hzdr_nexus.py "
            f"(route them or add them to EXPECTED_UNWRITTEN_KEYS with a "
            f"reason): {unexpected}"
        )

    def test_exemption_list_is_not_stale(self):
        source = self._writer_source()
        stale = [
            key
            for key in EXPECTED_UNWRITTEN_KEYS
            if f'"{key}"' in source or f'unit_key="{key}"' in source
        ]
        assert not stale, (
            f"keys listed as unwritten but referenced by the writer: {stale}"
        )

    def test_exemptions_are_registry_keys(self):
        unknown = [k for k in EXPECTED_UNWRITTEN_KEYS if k not in METADATA_KEY_REGISTRY]
        assert not unknown, f"exempted keys missing from the registry: {unknown}"
