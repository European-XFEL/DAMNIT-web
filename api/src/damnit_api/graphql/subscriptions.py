import asyncio
from collections.abc import AsyncGenerator

import strawberry
from async_lru import alru_cache
from strawberry.scalars import JSON
from strawberry.types import Info

from ..db import async_latest_rows, async_variables
from ..utils import create_map
from .models import Timestamp, get_model
from .utils import DatabaseInput, LatestData, fetch_info

POLLING_INTERVAL = 1  # seconds


@alru_cache(ttl=POLLING_INTERVAL)
async def get_latest_data(proposal, timestamp, schema):
    # Get latest data
    latest_data = await async_latest_rows(
        proposal,
        table="run_variables",
        by="timestamp",
        start_at=timestamp,
    )
    if not len(latest_data):
        return None

    latest_data = LatestData.from_list(latest_data)

    # Get latest runs
    latest_runs = await fetch_info(proposal, runs=list(latest_data.runs.keys()))
    latest_runs = create_map(latest_runs, key="run")

    # Update model
    model = get_model(proposal)
    latest_variables = await async_variables(proposal)
    model_changed = model.update(
        latest_variables,
        timestamp=latest_data.timestamp,
    )
    if model_changed:
        # Update GraphQL schema
        schema.update(model.stype)

    # Aggregate run values from latest data and runs
    runs = {}
    for run, variables in latest_data.runs.items():
        run_values = {name: data.value for name, data in variables.items()}
        run_values.setdefault("run", run)

        if run_info := latest_runs.get(run):
            run_values.update(run_info)

        runs[run] = model.resolve(**run_values)

    # Return the latest values if any
    if len(runs):
        # Update the model with new runs
        model.runs = sorted(set(model.runs + list(runs.keys())))

        metadata = {
            "runs": model.runs,
            "variables": model.variables,
            "timestamp": model.timestamp * 1000,  # deserialize to JS
        }

        return {"runs": runs, "metadata": metadata}

    return None


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
            # Sleep first :)
            await asyncio.sleep(POLLING_INTERVAL)

            result = await get_latest_data(
                proposal=database.proposal,
                timestamp=timestamp,
                schema=info.context["schema"],
            )
            if result is not None:
                yield result  # FIX: # pyright: ignore[reportReturnType]
