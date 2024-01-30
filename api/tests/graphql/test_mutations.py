import pytest
import pytest_asyncio

from cammille_api.graphql.models import DamnitType, get_model
from cammille_api.graphql.schema import Schema

from .const import EXAMPLE_DTYPES, KNOWN_VALUES, NEW_VALUES, NUM_ROWS
from .utils import create_schema, assert_model


@pytest_asyncio.fixture
async def mocked_latest_rows(mocker):
    latest_rows = [{**KNOWN_VALUES, **NEW_VALUES}]
    mocker.patch('cammille_api.graphql.mutations.async_latest_rows',
                 return_value=latest_rows)


@pytest.mark.asyncio
async def test_refresh(mocked_dtypes, mocked_count):
    model = get_model(proposal='1234')
    assert_model(model, proposal='1234', dtypes=None)

    gql_schema = Schema()
    result = await gql_schema.execute(
        """
        mutation RefreshMutation($proposal: String) {
          refresh(database: { proposal: $proposal })
        }
        """,
        variable_values={'proposal': '1234'},
        context_value={'schema': gql_schema},
    )

    assert result.errors is None
    assert set(result.data['refresh'].keys()) == {'metadata'}

    metadata = result.data['refresh']['metadata']
    assert set(metadata.keys()) == {'schema', 'rows', 'timestamp'}
    assert metadata['schema'] == create_schema({
        'proposal': DamnitType.NUMBER,
        'run': DamnitType.NUMBER,
        'start_time': DamnitType.TIMESTAMP,
        'added_at': DamnitType.TIMESTAMP,
        # 'comment': DamnitType.STRING,

        'integer': DamnitType. NUMBER,
        'float': DamnitType.NUMBER,
        'string': DamnitType.STRING
    })
    assert metadata['rows'] == NUM_ROWS

    assert_model(model, proposal='1234', dtypes=EXAMPLE_DTYPES)
