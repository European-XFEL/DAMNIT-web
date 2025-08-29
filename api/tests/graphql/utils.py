from typing import Optional, get_origin

from damnit_api.graphql.models import (
    DamnitRun,
    DamnitVariable,
    KnownVariable,
)
from damnit_api.utils import get_type

from .const import KNOWN_DTYPES


def create_run_variables(values, proposal=1234, run=1, timestamp=1000):
    return [
        {
            "proposal": proposal,
            "run": run,
            "timestamp": timestamp,
            "name": name,
            "value": value,
        }
        for name, value in values.items()
    ]


def create_run_info(proposal=1234, run=1, start_time=500, added_at=1000):
    return {
        "proposal": proposal,
        "run": run,
        "start_time": start_time,
        "added_at": added_at,
    }


# -----------------------------------------------------------------------------
# Assertions


def assert_model(model, proposal=None, variables=None):
    assert model.proposal == proposal
    assert_stype(model.stype, variables or {})


def assert_stype(stype, variables):
    # TODO: Change stype class name ('p1234')
    assert issubclass(stype, DamnitRun)
    for prop, type_ in stype.__annotations__.items():
        if prop in KNOWN_DTYPES:
            assert get_origin(get_type(type_)) is KnownVariable
        else:
            assert prop in variables
            assert type_ is Optional[DamnitVariable]  # noqa: UP007
