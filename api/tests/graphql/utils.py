from unittest.mock import AsyncMock, Mock
from typing import get_origin, Union

from damnit_api.graphql.models import (
    DamnitRun, DamnitType, DamnitVariable, KnownVariable)

from .const import KNOWN_DTYPES


def create_schema(damnit_types):
    return {prop: {'id': prop, 'dtype': dtype.value}
            for prop, dtype in damnit_types.items()}


def create_run_variables(values, proposal=1234, run=1, timestamp=1000):
    return [{
        'proposal': proposal,
        'run': run,
        'timestamp': timestamp,
        'name': name,
        'value': value}
        for name, value in values.items()]


def create_run_info(proposal=1234, run=1, start_time=500, added_at=1000):
    return {
        'proposal': proposal,
        'run': run,
        'start_time': start_time,
        'added_at': added_at}


def serialize_data(data, dtypes):
    serialized = {}

    for prop, value in data.items():
        if dtypes.get(prop) is DamnitType.TIMESTAMP:
            value = int(value * 1000)
        serialized[prop] = value

    return serialized


# -----------------------------------------------------------------------------
# Mocks


def session_mock(return_value):
    mappings = Mock()
    mappings.all.return_value = return_value

    execute = Mock()
    execute.mappings.return_value = mappings

    session = Mock()
    session.execute = AsyncMock(return_value=execute)

    get_session = AsyncMock()
    get_session.__aenter__.return_value = session

    return get_session


# -----------------------------------------------------------------------------
# Assertions


def assert_model(model, proposal=None, dtypes=None):
    if dtypes is None:
        dtypes = {}

    assert model.proposal == proposal
    assert_schema(model.schema, dtypes)
    assert_stype(model.stype, dtypes)


def assert_schema(schema, dtypes):
    assert schema == create_schema({**KNOWN_DTYPES, **dtypes})


def assert_stype(stype, dtypes):
    if dtypes is None:
        assert stype is None
        return

    # TODO: Change stype class name ('p1234')
    assert issubclass(stype, DamnitRun)
    for prop, type_ in stype.__annotations__.items():
        if prop in KNOWN_DTYPES:
            assert type_.__origin__ is KnownVariable
        else:
            assert type_ is DamnitVariable
