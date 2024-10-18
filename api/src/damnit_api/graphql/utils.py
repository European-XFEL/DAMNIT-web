from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Optional

import strawberry

from ..const import DEFAULT_PROPOSAL
from ..utils import map_dtype
from .models import DamnitType


@strawberry.input
class DatabaseInput:
    proposal: Optional[str] = strawberry.field(default=DEFAULT_PROPOSAL)
    path: Optional[str] = strawberry.field(default=strawberry.UNSET)


@dataclass
class MetaData:
    dtype: DamnitType = DamnitType.STRING
    timestamp: float = 0


@dataclass
class Data(MetaData):
    value: Any = None


class LatestData:
    def __init__(self):
        self.runs = defaultdict(lambda: defaultdict(Data))
        self.variables = defaultdict(MetaData)

    def add(self, data):
        timestamp = data["timestamp"]
        dtype = map_dtype(type(data["value"]))

        # Bookkeep by runs
        run = self.runs[data["run"]]
        if run[data["name"]].timestamp < timestamp:
            run[data["name"]] = Data(
                value=data["value"], dtype=dtype, timestamp=timestamp
            )

        # Bookkeep by variables
        variable = self.variables[data["name"]]
        if variable.timestamp < timestamp:
            variable.dtype = dtype
            variable.timestamp = timestamp

    @property
    def dtypes(self):
        return {variable: data.dtype for variable, data in self.variables.items()}

    @property
    def timestamp(self):
        timestamps = [data.timestamp for data in self.variables.values()]
        return max(timestamps) if len(timestamps) else None

    @classmethod
    def from_list(cls, sequence):
        instance = cls()
        for seq in sequence:
            instance.add(seq)

        return instance
