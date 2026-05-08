from dataclasses import dataclass

from damnit_api.shared.const import DamnitType
from damnit_api.utils import create_map

PROPOSAL = 900485
RUNS = [348, 349, 350]


@dataclass(frozen=True, kw_only=True)
class DatabaseVariable:
    value: object
    summary_type: str | None = None
    # Expected serialization results
    damnit_value: object = None
    damnit_dtype: DamnitType = DamnitType.STRING

    def __post_init__(self):
        if self.damnit_value is None:
            object.__setattr__(self, "damnit_value", self.value)


def get_values(data):
    return {k: v.value for k, v in data.items()}


# -----------------------------------------------------------------------------
# Known fields (run_info columns)

KNOWN_DATA = {
    "proposal": DatabaseVariable(
        value=PROPOSAL,
        damnit_dtype=DamnitType.NUMBER,
    ),
    "run": DatabaseVariable(
        value=348,
        damnit_dtype=DamnitType.NUMBER,
    ),
    "start_time": DatabaseVariable(
        value=1740154563.795096,
        damnit_value=1740154563795,
        damnit_dtype=DamnitType.TIMESTAMP,
    ),
    "added_at": DatabaseVariable(
        value=1775038442.775598,
        damnit_value=1775038442775,
        damnit_dtype=DamnitType.TIMESTAMP,
    ),
}


# -----------------------------------------------------------------------------
# Variables metadata (as returned by async_variables)

EXAMPLE_VARIABLES = create_map(
    [
        {"name": "n_trains", "title": "Trains"},
        {"name": "run_length", "title": "Run length"},
        {"name": "xgm_intensity", "title": "XGM intensity [uJ]"},
        {"name": "etof_settings.ret0", "title": "eTOF settings/Retardation, sector 0"},
        {"name": "etof.eTOF_calibration", "title": "eTOF calib./eTOF calibration"},
        {"name": "etof.eTOF_response_width", "title": "eTOF calib./eTOF response FWHM"},
    ],
    key="name",
)

# -----------------------------------------------------------------------------
# Tags (as returned by async_all_tags)

EXAMPLE_TAGS = create_map(
    [
        {"id": 1, "name": "eTOF setting"},
        {"id": 7, "name": "eTOF"},
    ],
    key="id",
)

# -----------------------------------------------------------------------------
# Variable -> tag mapping (as returned by async_variable_tags)

EXAMPLE_VARIABLE_TAGS = {
    "n_trains": [],
    "run_length": [],
    "xgm_intensity": [],
    "etof_settings.ret0": [1],
    "etof.eTOF_calibration": [7],
    "etof.eTOF_response_width": [7],
}

# -----------------------------------------------------------------------------
# Run variable values for a single run

EXAMPLE_DATA = {
    "proposal": DatabaseVariable(
        value=PROPOSAL,
        damnit_dtype=DamnitType.NUMBER,
    ),
    "run": DatabaseVariable(
        value=348,
        damnit_dtype=DamnitType.NUMBER,
    ),
    "n_trains": DatabaseVariable(
        value=3641,
        damnit_dtype=DamnitType.NUMBER,
    ),
    "run_length": DatabaseVariable(
        value="0:06:03",
    ),
    "xgm_intensity": DatabaseVariable(
        value=2.073,
        damnit_dtype=DamnitType.NUMBER,
    ),
    "etof_settings.ret0": DatabaseVariable(
        value=-77.0,
        damnit_dtype=DamnitType.NUMBER,
    ),
}

# -----------------------------------------------------------------------------
# Subscription: new values arriving for a new run

NEW_DATA = {
    "n_trains": DatabaseVariable(
        value=1200,
        damnit_dtype=DamnitType.NUMBER,
    ),
    "run_length": DatabaseVariable(
        value="0:02:30",
    ),
    "xgm_intensity": DatabaseVariable(
        value=1.5,
        damnit_dtype=DamnitType.NUMBER,
    ),
}
