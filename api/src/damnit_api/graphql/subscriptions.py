import asyncio
from collections.abc import AsyncGenerator

import strawberry
from strawberry.scalars import JSON
from strawberry.types import Info

from ..db import async_count, async_latest_rows
from ..utils import create_map
from .models import Timestamp, get_model, get_stype
from .utils import DatabaseInput, LatestData


@strawberry.type
class Subscription:
    """CC: Subscription is currently broken.
    I will revisit again once I come back from vacation"""

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
            # Get latest data
            latest_data = await async_latest_rows(
                proposal,
                table="run_variables",
                by="timestamp",
                start_at=timestamp,
            )
            latest_data = LatestData.from_list(latest_data)

            # Get latest runs
            latest_runs = await async_latest_rows(
                proposal, table="run_info", by="added_at", start_at=timestamp
            )
            latest_runs = create_map(latest_runs, key="run")

            # Update model
            # TODO: Only update the model when there are actual changes
            model.update(latest_data.dtypes, latest_data.timestamp)
            model.num_rows = await async_count(proposal, table="run_info")
            info.context["schema"].update(get_stype(proposal))

            # Aggregate run values from latest data and runs
            runs = {}
            for run, variables in latest_data.runs.items():
                run_values = {name: data.value for name, data in variables.items()}
                if run_info := latest_runs.get(run):
                    run_values.update(run_info)

                runs[run] = model.as_dict(**run_values)

            # Return the latest values if any
            if len(runs):
                metadata = {
                    "rows": model.num_rows,
                    "timestamp": model.timestamp * 1000,  # deserialize to JS
                }

                yield {"runs": runs, "metadata": metadata}

            await asyncio.sleep(1)
