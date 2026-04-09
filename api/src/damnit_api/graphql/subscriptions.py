import asyncio
from collections.abc import AsyncGenerator

import strawberry
from async_lru import alru_cache
from strawberry.scalars import JSON

from ..db import async_latest_rows, async_max, async_table
from ..utils import create_map, wrap_values
from .metadata import fetch_metadata
from .models import DamnitRun, Timestamp
from .utils import DatabaseInput, LatestData, fetch_info

POLLING_INTERVAL = 1  # seconds

# Server-side high-water mark per proposal so each tick only fetches rows
# newer than what the previous tick already shipped. Bridges the role
# `model.timestamp` used to play before the flat-model refactor.
_last_seen_timestamp: dict[str, float] = {}


# Per-client cursor is deliberately omitted from the cache key so that
# concurrent subscribers coalesce into a single DB read per tick.
@alru_cache(maxsize=32, ttl=POLLING_INTERVAL)
async def poll_proposal(proposal):
    table = await async_table(proposal, name="run_variables")
    if table is None:
        return None

    if proposal not in _last_seen_timestamp:
        max_timestamp = await async_max(
            proposal, table="run_variables", column="timestamp"
        )
        _last_seen_timestamp[proposal] = max_timestamp or 0

    rows = await async_latest_rows(
        proposal,
        table=table,
        by="timestamp",
        start_at=_last_seen_timestamp[proposal],
    )
    if not rows:
        return None

    latest_data = LatestData.from_list(rows)

    latest_runs = await fetch_info(proposal, runs=list(latest_data.runs.keys()))
    latest_runs = create_map(latest_runs, key="run")

    # New rows arrived. Clear the metadata cache so the next read is fresh.
    fetch_metadata.cache_invalidate(proposal)
    metadata = await fetch_metadata(proposal)

    runs = {}
    run_timestamps = {}
    for run, variables in latest_data.runs.items():
        run_values = {
            name: {"value": data.value, "summary_type": data.summary_type}
            for name, data in variables.items()
        }
        run_values.setdefault("run", {"value": run})

        if run_info := latest_runs.get(run):
            run_values.update(wrap_values(run_info))

        runs[run] = DamnitRun.resolve(run_values)
        run_timestamps[run] = max(
            data.timestamp for data in variables.values()
        )

    if not runs:
        return None

    assert latest_data.timestamp is not None  # noqa: S101
    _last_seen_timestamp[proposal] = latest_data.timestamp

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
    # A zero cursor means the client never completed REFRESH; skip the tick
    # rather than flooding it with every row newer than epoch.
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
    @strawberry.subscription
    async def latest_data(
        self,
        database: DatabaseInput,
        timestamp: Timestamp,
    ) -> AsyncGenerator[JSON]:  # FIX: # pyright: ignore[reportInvalidTypeForm]
        while True:
            await asyncio.sleep(POLLING_INTERVAL)

            snapshot = await poll_proposal(proposal=database.proposal)
            result = filter_for_client(snapshot, timestamp)
            if result is not None:
                yield result  # FIX: # pyright: ignore[reportReturnType]
