"""Unit tests for shared models, particularly ProposalNumber."""

import pytest

from damnit_api.shared.models import ProposalNumber

# -----------------------------------------------------------------------------
# Valid int inputs


def test_proposal_number_min_boundary():
    assert int(ProposalNumber(1)) == 1


def test_proposal_number_typical_int():
    assert int(ProposalNumber(900485)) == 900485


def test_proposal_number_max_boundary():
    assert int(ProposalNumber(999999)) == 999999


# -----------------------------------------------------------------------------
# Invalid int inputs


def test_proposal_number_zero_raises():
    with pytest.raises(ValueError, match="out of range"):
        ProposalNumber(0)


def test_proposal_number_too_large_raises():
    with pytest.raises(ValueError, match="out of range"):
        ProposalNumber(1_000_000)


def test_proposal_number_negative_raises():
    with pytest.raises(ValueError, match="out of range"):
        ProposalNumber(-1)


# -----------------------------------------------------------------------------
# Float rejection: floats must raise, never be silently truncated.


def test_proposal_number_float_raises():
    with pytest.raises(TypeError):
        ProposalNumber(1.9)  # ty: ignore[invalid-argument-type]


def test_proposal_number_float_in_range_raises():
    with pytest.raises(TypeError):
        ProposalNumber(999999.0)  # ty: ignore[invalid-argument-type]


# -----------------------------------------------------------------------------
# Valid string inputs


def test_proposal_number_str_with_p_prefix():
    assert int(ProposalNumber("p001234")) == 1234


def test_proposal_number_str_no_prefix():
    assert int(ProposalNumber("1234")) == 1234


def test_proposal_number_str_leading_zeros():
    assert int(ProposalNumber("p000001")) == 1


def test_proposal_number_str_short():
    assert int(ProposalNumber("p1")) == 1


# -----------------------------------------------------------------------------
# Invalid string inputs


def test_proposal_number_str_too_many_digits_raises():
    with pytest.raises(ValueError, match="Invalid proposal number"):
        ProposalNumber("p1234567")


def test_proposal_number_str_double_p_raises():
    with pytest.raises(ValueError, match="Invalid proposal number"):
        ProposalNumber("pp1234")


def test_proposal_number_str_not_a_number_raises():
    with pytest.raises(ValueError, match="Invalid proposal number"):
        ProposalNumber("not-a-number")


def test_proposal_number_str_empty_raises():
    with pytest.raises(ValueError, match="Invalid proposal number"):
        ProposalNumber("")


def test_proposal_number_str_zero_raises():
    with pytest.raises(ValueError, match="out of range"):
        ProposalNumber("p000000")


def test_proposal_number_str_too_large_raises():
    with pytest.raises(ValueError, match="Invalid proposal number"):
        ProposalNumber("p1000000")


# -----------------------------------------------------------------------------
# Canonical str / repr


def test_proposal_number_str_min():
    assert str(ProposalNumber(1)) == "p000001"


def test_proposal_number_str_max():
    assert str(ProposalNumber(999999)) == "p999999"


def test_proposal_number_str_typical():
    assert str(ProposalNumber(1234)) == "p001234"


def test_proposal_number_repr():
    assert repr(ProposalNumber(1234)) == "ProposalNumber(1234)"


# -----------------------------------------------------------------------------
# Hash / dict-key interchangeability with plain int


def test_proposal_number_as_dict_key_interchangeable():
    d: dict[int, str] = {ProposalNumber(900485): "proposal-data"}
    assert d[900485] == "proposal-data"


def test_proposal_number_hash_equals_int_hash():
    assert hash(ProposalNumber(42)) == hash(42)
