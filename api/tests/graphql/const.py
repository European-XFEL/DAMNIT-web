from damnit_api.graphql.models import DamnitType
from damnit_api.utils import create_map

RUNS = list(range(10))

# TODO: Create dataclass for test values


EXAMPLE_VARIABLES = create_map(
    [
        {"name": "integer", "title": "Integer"},
        {"name": "float", "title": "Float"},
        {"name": "string", "title": "String"},
    ],
    key="name",
)

KNOWN_ANNOTATIONS = {
    "proposal": int,
    "run": int,
    "start_time": float,
    "added_at": float,
    # 'comment': str,
}

KNOWN_VALUES = {
    "proposal": 1234,
    "run": 1,
    "start_time": 1697493600.0,
    "added_at": 1697580000.0,
    # 'comment': 'Run number 1',
}

KNOWN_DTYPES = {
    "proposal": DamnitType.NUMBER,
    "run": DamnitType.NUMBER,
    "start_time": DamnitType.TIMESTAMP,
    "added_at": DamnitType.TIMESTAMP,
    # 'comment': DamnitType.STRING,
}


EXAMPLE_ANNOTATIONS = {
    "integer": int,
    "float": float,
    "string": str,
}


EXAMPLE_VALUES = {
    "proposal": 1234,
    "run": 1,
    "integer": 1,
    "float": 0.1,
    "string": "one",
}


EXAMPLE_DTYPES = {
    "proposal": DamnitType.NUMBER,
    "run": DamnitType.NUMBER,
    "integer": DamnitType.NUMBER,
    "float": DamnitType.NUMBER,
    "string": DamnitType.STRING,
}


NEW_VALUES = {
    "integer": 2,
    "float": "not a float",
    "string": 0.2,
}

NEW_DTYPES = {
    "integer": DamnitType.NUMBER,
    "float": DamnitType.STRING,
    "string": DamnitType.NUMBER,
}
