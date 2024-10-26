import asyncio
from collections import defaultdict
from collections.abc import AsyncGenerator

from cachetools import TTLCache
import strawberry
from strawberry.scalars import JSON
from strawberry.types import Info

from ..db import async_count, async_latest_rows, async_variables
from ..utils import create_map
from .models import Timestamp, get_model
from .utils import DatabaseInput, LatestData


POLLING_INTERVAL = 1  # seconds

LATEST_DATA: dict[int, TTLCache] = defaultdict(
    lambda: TTLCache(maxsize=3, ttl=POLLING_INTERVAL)
)


@strawberry.type
class Subscription:

    @strawberry.subscription
    async def latest_data(
        self,
        info: Info,
        database: DatabaseInput,
        timestamp: Timestamp,
    ) -> AsyncGenerator[JSON]:
        proposal = database.proposal
        model = get_model(proposal)

        while True:
            # Sleep first :)
            await asyncio.sleep(POLLING_INTERVAL)

            if cached := LATEST_DATA[proposal].get(timestamp):
                yield cached

            # Get latest data
            latest_data = await async_latest_rows(
                proposal,
                table="run_variables",
                by="timestamp",
                start_at=timestamp,
            )
            if not len(latest_data):
                continue
            latest_data = LatestData.from_list(latest_data)

            # Get latest runs
            latest_runs = await async_latest_rows(
                proposal, table="run_info", by="added_at", start_at=timestamp
            )
            latest_runs = create_map(latest_runs, key="run")

            # Update model
            model_changed = model.update(
                await async_variables(proposal),
                timestamp=latest_data.timestamp,
            )
            if model_changed:
                # Update GraphQL schema
                info.context["schema"].update(model.stype)
            model.num_rows = await async_count(proposal, table="run_info")

            # Aggregate run values from latest data and runs
            runs = {}
            for run, variables in latest_data.runs.items():
                run_values = {name: data.value for name, data in variables.items()}
                if run_info := latest_runs.get(run):
                    run_values.update(run_info)

                runs[run] = model.resolve(**run_values)

            # Return the latest values if any
            if len(runs):
                metadata = {
                    "rows": model.num_rows,
                    "variables": model.variables,
                    "timestamp": model.timestamp * 1000,  # deserialize to JS
                }

                result = {"runs": runs, "metadata": metadata}
                LATEST_DATA[proposal][timestamp] = result

                yield result
