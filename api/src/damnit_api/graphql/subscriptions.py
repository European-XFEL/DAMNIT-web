import asyncio
from collections.abc import AsyncGenerator

import strawberry
from async_lru import alru_cache
from strawberry.scalars import JSON
from strawberry.types import Info

from ..auth.permissions import PROPOSAL_PERMISSIONS
from ..runs.sqlite import async_latest_rows, async_max, async_table
from ..runs.types import DamnitRun, Timestamp
from ..utils import create_map
from .metadata import fetch_metadata
from .utils import DatabaseInput, LatestData, fetch_info

POLLING_INTERVAL = 1  # seconds


class SubscriptionCursors:
    """Server-side high-water mark per proposal so each tick only fetches rows
    newer than what the previous tick already shipped. Hashable by identity
    for alru_cache."""

    def __init__(self) -> None:
        self._data: dict[str, float] = {}

    def __contains__(self, proposal: str) -> bool:
        return proposal in self._data

    def __getitem__(self, proposal: str) -> float:
        return self._data[proposal]

    def __setitem__(self, proposal: str, value: float) -> None:
        self._data[proposal] = value


# Per-client cursor is deliberately omitted from the cache key so that
# concurrent subscribers coalesce into a single DB read per tick.
@alru_cache(maxsize=32, ttl=POLLING_INTERVAL)
async def poll_proposal(registry, proposal, cursors: SubscriptionCursors):
    table = await async_table(registry, proposal, name="run_variables")
    if table is None:
        return None

    if proposal not in cursors:
        max_timestamp = await async_max(
            registry, proposal, table="run_variables", column="timestamp"
        )
        cursors[proposal] = max_timestamp or 0

    rows = await async_latest_rows(
        registry,
        proposal,
        table=table,
        by="timestamp",
        start_at=cursors[proposal],
    )
    if not rows:
        return None

    latest_data = LatestData.from_list(rows)

    latest_runs = await fetch_info(
        registry, proposal, runs=list(latest_data.runs.keys())
    )
    latest_runs = create_map(latest_runs, key="run")

    fetch_metadata.cache_invalidate(registry, proposal)
    metadata = await fetch_metadata(registry, proposal)

    runs = {}
    run_timestamps = {}
    for run, variables in latest_data.runs.items():
        run_values = {
            name: {
                "value": data.value,
                "summary_type": data.summary_type,
                "attributes": data.attributes,
            }
            for name, data in variables.items()
        }
        run_values.setdefault("run", {"value": run})

        if run_info := latest_runs.get(run):
            run_values.update(run_info)

        runs[run] = DamnitRun.resolve(run_values)
        run_timestamps[run] = max(data.timestamp for data in variables.values())

    if not runs:
        return None

    if latest_data.timestamp is None:
        msg = "Latest data has no timestamp."
        raise ValueError(msg)

    cursors[proposal] = latest_data.timestamp

    metadata = {
        "runs": sorted(set(metadata["runs"]) | set(runs.keys())),
        "variables": metadata["variables"],
        "timestamp": latest_data.timestamp * 1000,  # ms for JS
    }
    return {
        "runs": runs,
        "run_timestamps": run_timestamps,
        "max_timestamp": max(run_timestamps.values()),
        "metadata": metadata,
    }


def filter_for_client(snapshot, since):
    if snapshot is None or not since or snapshot["max_timestamp"] <= since:
        return None
    runs = {
        run: value
        for run, value in snapshot["runs"].items()
        if snapshot["run_timestamps"][run] > since
    }
    if not runs:
        return None
    return {"runs": runs, "metadata": snapshot["metadata"]}


@strawberry.type
class Subscription:
    @strawberry.subscription(permission_classes=PROPOSAL_PERMISSIONS)
    async def latest_data(
        self,
        info: Info,
        database: DatabaseInput,
        timestamp: Timestamp,
    ) -> AsyncGenerator[JSON]:  # FIX: # pyright: ignore[reportInvalidTypeForm]
        while True:
            await asyncio.sleep(POLLING_INTERVAL)

            snapshot = await poll_proposal(
                info.context.damnit_registry,
                proposal=database.proposal,
                cursors=info.context.subscription_cursors,
            )
            result = filter_for_client(snapshot, timestamp)
            if result is not None:
                yield result  # FIX: # pyright: ignore[reportReturnType]
