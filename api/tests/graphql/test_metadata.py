from damnit_api.graphql.metadata import (
    _assign_groups,
    _group_entry,
    _order_by_group,
    _variable_group,
)


def variables(*names):
    """Build the variable map exactly as `fetch_metadata` hands it over."""
    entries = {name: {"name": name} for name in names}
    _assign_groups(entries)
    return entries


# -----------------------------------------------------------------------------
# Splitting a grouped variable


def test_dotted_variable_takes_its_group_from_the_first_dot_and_slash():
    assert _variable_group("I0.intensities", "I0/Intensities") == ("I0", "I0")
    assert _variable_group("fel.mono.energy", "FEL/Monochromator/ħω") == ("fel", "FEL")
    assert _variable_group("tresor.dld_image_spectrum", "TRESOR/DLD/Spectrum/corr") == (
        "tresor",
        "TRESOR",
    )


def test_undotted_variable_has_no_group_however_many_slashes_its_title_has():
    assert _variable_group("fluence", "Fluence [J/cm^2]") is None
    assert _variable_group("jf_roi", "JF ROI on/off") is None
    assert _variable_group("n_trains", "Trains") is None


def test_grouped_variable_supplies_no_title_when_its_own_holds_no_slash():
    assert _variable_group("I0.intensities", None) == ("I0", None)
    assert _variable_group("I0.intensities", "Intensities") == ("I0", None)


def test_custom_separator_is_unrecognised_so_the_first_slash_still_decides():
    assert _variable_group("detector.energy", "Detector :: Energy") == (
        "detector",
        None,
    )
    assert _variable_group("tresor.spectrum", "TRESOR :: DLD/Spectrum") == (
        "tresor",
        "TRESOR :: DLD",
    )


# -----------------------------------------------------------------------------
# Choosing a group's title


def test_group_takes_the_title_most_of_its_members_agree_on():
    # SQS/p900580 titles one `etof` member differently from all the rest.
    assert _group_entry("etof", ["eTOF calib.", "eTOF", "eTOF"]) == {
        "name": "etof",
        "title": "eTOF",
    }


def test_group_keeps_no_title_when_most_of_its_members_supply_none():
    assert _group_entry("detector", [None, "Detector :: Flow [ml", None]) == {
        "name": "detector"
    }


def test_group_title_tie_goes_to_the_member_seen_first():
    assert _group_entry("detector", [None, "Detector :: Flow [ml"]) == {
        "name": "detector"
    }
    assert _group_entry("detector", ["Detector :: Flow [ml", None]) == {
        "name": "detector",
        "title": "Detector :: Flow [ml",
    }


# -----------------------------------------------------------------------------
# Ordering the columns


# Names and order from SQS/202401/p005688, thinned: `fel` and the `etof`s each
# come back in two stretches of rowids with the rest of the table in between.
SCATTERED = [
    "fel.beamblock",
    "laser.shutter",
    "etof2.v_drift",
    "etof1.v_drift",
    "pressure_f1",
    "etof2.adq_hits_phd",
    "etof1.adq_hits_phd",
    "fel.mono.energy",
]


def test_ordering_gathers_scattered_group_members_into_one_block():
    ordered = _order_by_group(variables(*SCATTERED))

    assert list(ordered) == [
        "fel.beamblock",
        "fel.mono.energy",
        "laser.shutter",
        "etof2.v_drift",
        "etof2.adq_hits_phd",
        "etof1.v_drift",
        "etof1.adq_hits_phd",
        "pressure_f1",
    ]


# Names and order from FXE/202601/p010236, thinned: two ungrouped columns
# trail the last group, where gathering them would have to move them.
TRAILING = [
    "n_trains",
    "jf500k_preview",
    "xes_roi1.preview",
    "xes_roi1.projection",
    "If.intensities",
    "xas_correlation",
    "jf1m_hist",
]


def test_ordering_leaves_ungrouped_variables_where_they_were_written():
    assert list(_order_by_group(variables(*TRAILING))) == TRAILING


def test_ordering_keeps_a_group_apart_from_a_variable_of_the_same_name():
    ordered = _order_by_group(variables("xes_roi1", "n_trains", "xes_roi1.preview"))

    assert list(ordered) == ["xes_roi1", "n_trains", "xes_roi1.preview"]


def test_ordering_anchors_a_group_where_its_first_member_was():
    ordered = _order_by_group(variables("xgm.intensity", "n_trains", "xgm.pulses"))

    assert list(ordered) == ["xgm.intensity", "xgm.pulses", "n_trains"]


def test_ordering_leaves_a_proposal_without_groups_untouched():
    names = ["proposal", "run", "n_trains", "xgm_intensity"]

    assert list(_order_by_group(variables(*names))) == names
