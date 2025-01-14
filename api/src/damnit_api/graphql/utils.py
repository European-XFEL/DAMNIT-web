from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from sqlalchemy import or_, select

import strawberry

from ..const import DEFAULT_PROPOSAL
from ..db import async_table, get_session
from ..utils import map_dtype
from .models import DamnitType


@strawberry.input
class DatabaseInput:
    proposal: str | None = strawberry.field(default=DEFAULT_PROPOSAL)
    path: str | None = strawberry.field(default=strawberry.UNSET)


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


async def fetch_info(proposal, *, runs):
    table = await async_table(proposal, name="run_info")
    conditions = [table.c.run == run for run in runs]
    query = select(table).where(or_(*conditions)).order_by(table.c.run)

    async with get_session(proposal) as session:
        result = await session.execute(query)
        if not result:
            raise ValueError  # TODO: Better error handling

        entries = result.mappings().all()

    return entries
