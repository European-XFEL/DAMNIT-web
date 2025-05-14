from damnit_api.graphql.models import (
    DamnitTable,
    get_model,
    update_model,
)
from damnit_api.utils import create_map

from .const import EXAMPLE_VARIABLES
from .utils import assert_model


def test_get_model():
    model = get_model("foo")
    assert_model(model, proposal="foo")


def test_update_model():
    model = update_model("foo", EXAMPLE_VARIABLES)
    assert_model(model, proposal="foo", variables=EXAMPLE_VARIABLES)


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
    variables = create_map([{"name": "foo", "title": "Foo"}], key="name")
    model = DamnitTable("foo")
    model.update(variables)
    assert_model(
        model,
        proposal="foo",
        variables=variables,
    )


def test_damnit_table_multiple_update():
    model = DamnitTable("foo")
    first = create_map(
        [{"name": "bar", "title": "Bar"}, {"name": "baz", "title": "Baz"}],
        key="name",
    )
    model.update(first)
    assert_model(
        model,
        proposal="foo",
        variables=first,
    )

    # Update incompletely
    second = {"bar": {"name": "bar", "title": "Barbar"}}
    model.update(second)
    assert_model(
        model,
        proposal="foo",
        variables={**first, **second},
    )


def test_damnit_table_empty_update():
    model = DamnitTable("foo")
    model.update({})
    assert_model(model, proposal="foo", variables={})
