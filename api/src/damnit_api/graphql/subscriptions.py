import asyncio
from collections.abc import AsyncGenerator

import strawberry
from async_lru import alru_cache
from strawberry.scalars import JSON
from strawberry.types import Info

from ..db import async_latest_rows, async_table, async_variables
from ..utils import create_map, wrap_values
from .models import Timestamp, get_model
from .utils import DatabaseInput, LatestData, fetch_info

POLLING_INTERVAL = 1  # seconds


# Per-client cursor is deliberately omitted from the cache key so that
# concurrent subscribers coalesce into a single DB read per tick.
@alru_cache(maxsize=32, ttl=POLLING_INTERVAL)
async def poll_proposal(proposal, schema):
    model = get_model(proposal)
    table = await async_table(proposal, name="run_variables")
    if table is None:
        return None
    rows = await async_latest_rows(
        proposal,
        table=table,
        by="timestamp",
        start_at=model.timestamp,
    )
    if not rows:
        return None

    latest_data = LatestData.from_list(rows)
    latest_runs = create_map(
        await fetch_info(proposal, runs=list(latest_data.runs.keys())),
        key="run",
    )

    latest_variables = await async_variables(proposal)
    if model.update(latest_variables, timestamp=latest_data.timestamp):
        schema.update(model.stype)

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

        runs[run] = model.resolve(**run_values)
        run_timestamps[run] = max(
            data.timestamp for data in variables.values()
        )

    if not runs:
        return None

    model.runs = sorted(set(model.runs + list(runs.keys())))
    metadata = {
        "runs": model.runs,
        "variables": model.variables,
        "timestamp": model.timestamp * 1000,  # deserialize to JS
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
        info: Info,
        database: DatabaseInput,
        timestamp: Timestamp,  # FIX: # pyright: ignore[reportInvalidTypeForm]
    ) -> AsyncGenerator[JSON]:  # FIX: # pyright: ignore[reportInvalidTypeForm]
        while True:
            await asyncio.sleep(POLLING_INTERVAL)

            snapshot = await poll_proposal(
                proposal=database.proposal,
                schema=info.schema,
            )
            result = filter_for_client(snapshot, timestamp)
            if result is not None:
                yield result  # FIX: # pyright: ignore[reportReturnType]
