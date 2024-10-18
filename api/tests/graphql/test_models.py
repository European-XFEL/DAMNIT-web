
from damnit_api.graphql.models import (
    DamnitTable,
    DamnitType,
    get_model,
    update_model,
)

from .utils import assert_model


def test_get_model():
    model = get_model("foo")
    assert_model(model, proposal="foo")


def test_update_model():
    model = update_model("foo", dtypes={"bar": DamnitType.STRING})
    assert_model(model, proposal="foo", dtypes={"bar": DamnitType.STRING})


# -----------------------------------------------------------------------------
# Test DamnitTable


def test_damnit_table_no_registered():
    assert len(DamnitTable.registry) == 0


def test_damnit_table_first_registered():
    model = DamnitTable("foo")
    assert_model(model, proposal="foo")
    assert len(DamnitTable.registry) == 1


def test_damnit_table_registered_once():
    first = DamnitTable("foo")
    second = DamnitTable("foo")
    assert first is second
    assert len(DamnitTable.registry) == 1


def test_damnit_table_second_registered():
    first = DamnitTable("first")
    second = DamnitTable("second")
    assert first is not second
    assert len(DamnitTable.registry) == 2


def test_damnit_table_valid_update():
    model = DamnitTable("foo")
    model.update({"bar": DamnitType.STRING})
    assert_model(model, proposal="foo", dtypes={"bar": DamnitType.STRING})


def test_damnit_table_multiple_update():
    model = DamnitTable("foo")
    model.update({"bar": DamnitType.STRING, "baz": DamnitType.STRING})
    assert_model(
        model,
        proposal="foo",
        dtypes={"bar": DamnitType.STRING, "baz": DamnitType.STRING},
    )

    # Update incompletely
    model.update({"bar": DamnitType.NUMBER})
    assert_model(
        model,
        proposal="foo",
        dtypes={"bar": DamnitType.NUMBER, "baz": DamnitType.STRING},
    )


def test_damnit_table_empty_update():
    model = DamnitTable("foo")
    model.update({})
    assert_model(model, proposal="foo", dtypes={})
