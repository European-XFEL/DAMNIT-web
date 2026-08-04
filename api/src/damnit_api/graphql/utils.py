from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import strawberry
from sqlalchemy import select, tuple_

from ..runs.sqlite import async_table, get_session
from ..shared.const import DEFAULT_PROPOSAL


@strawberry.input
class DatabaseInput:
    proposal: str | None = strawberry.field(default=DEFAULT_PROPOSAL)
    path: str | None = strawberry.field(default=strawberry.UNSET)


@dataclass
class MetaData:
    timestamp: float = 0


@dataclass
class Data(MetaData):
    value: Any = None
    summary_type: str | None = None
    attributes: str | None = None


class LatestData:
    def __init__(self):
        self.runs = defaultdict(lambda: defaultdict(Data))
        self.variables = defaultdict(MetaData)

    def add(self, data):
        timestamp = data["timestamp"]

        # Bookkeep by (proposal, run): run numbers collide across proposals in
        # one file, so keying by run alone would merge two runs into one.
        run = self.runs[data["proposal"], data["run"]]
        if run[data["name"]].timestamp < timestamp:
            run[data["name"]] = Data(
                value=data["value"],
                summary_type=data.get("summary_type"),
                attributes=data.get("attributes"),
                timestamp=timestamp,
            )

        # Bookkeep by variables
        variable = self.variables[data["name"]]
        if variable.timestamp < timestamp:
            variable.timestamp = timestamp

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
    """Fetch `run_info` rows for the given (proposal, run) pairs.

    Returns a mapping keyed by (proposal, run) so callers align rows even when
    run numbers collide across proposals in one file.
    """
    table = await async_table(proposal, name="run_info")
    if table is None:
        return {}
    # One `(proposal, run) IN (...)` predicate rather than an OR of per-pair
    # ANDs: the unpaginated table asks for up to ALL_RUNS_PAGE_SIZE pairs, and a
    # 10000-branch OR builds thousands of expressions SQLite runs as separate
    # index probes. Mirrors the tuple IN already used in `fetch_cells`.
    query = select(table).where(tuple_(table.c.proposal, table.c.run).in_(runs))

    async with get_session(proposal) as session:
        result = await session.execute(query)
        return {(row["proposal"], row["run"]): row for row in result.mappings().all()}
