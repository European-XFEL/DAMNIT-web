import strawberry
from sqlalchemy import and_, func, or_, select
from strawberry.scalars import JSON

from ..db import async_table, get_extracted_data, get_session
from .models import DamnitRun, DamnitType, get_model
from .utils import DatabaseInput


def group_by_run(data):
    grouped = {}

    for entry in data:
        key = (entry["proposal"], entry["run"])
        if key not in grouped:
            grouped[key] = {"proposal": entry["proposal"], "run": entry["run"]}
        grouped[key][entry["name"]] = entry["value"]

    return list(grouped.values())


async def fetch_variables(proposal, *, limit, offset):
    table = await async_table(proposal, name="run_variables")

    runs_subquery = (
        select(table.c.run)
        .distinct()
        .order_by(table.c.run)
        .limit(limit)
        .offset(offset)
        .subquery()
    )

    latest_timestamp_subquery = (
        select(
            table.c.proposal,
            table.c.run,
            table.c.name,
            func.max(table.c.timestamp).label("latest_timestamp"),
        )
        .where(
            table.c.run.in_(select(runs_subquery.c.run))
        )  # Only consider the paginated runs
        .group_by(table.c.run, table.c.name)
        .subquery()
    )

    query = select(
        table.c.proposal,
        table.c.run,
        table.c.name,
        table.c.value,
        table.c.timestamp,
    ).join(
        latest_timestamp_subquery,
        and_(
            table.c.proposal == latest_timestamp_subquery.c.proposal,
            table.c.run == latest_timestamp_subquery.c.run,
            table.c.name == latest_timestamp_subquery.c.name,
            table.c.timestamp == latest_timestamp_subquery.c.latest_timestamp,
        ),
    )

    async with get_session(proposal) as session:
        result = await session.execute(query)
        if not result:
            raise ValueError  # TODO: Better error handling

        entries = group_by_run(result.mappings().all())  # type: ignore

    return entries


async def fetch_info(proposal, variables):
    table = await async_table(proposal, name="run_info")

    conditions = [
        and_(table.c.proposal == variable["proposal"], table.c.run == variable["run"])
        for variable in variables
    ]

    query = select(table).where(or_(*conditions))

    async with get_session(proposal) as session:
        result = await session.execute(query)
        if not result:
            raise ValueError  # TODO: Better error handling

        entries = result.mappings().all()

    return entries


@strawberry.type
class Query:
    """
    Defines the GraphQL queries for the Damnit API.
    """

    @strawberry.field
    async def runs(
        self, database: DatabaseInput, page: int = 1, per_page: int = 10
    ) -> list[DamnitRun]:
        """
        Returns a list of Damnit runs, with pagination support.

        Args:
            page (int, optional): The page number to retrieve. Defaults to 1.
            per_page (int, optional): The number of runs per page. Defaults to 10.

        Returns:
            List[DamnitRun]: A list of Damnit runs.
        """
        proposal = database.proposal

        model = get_model(proposal)
        if model is None:
            msg = f"Table model for proposal {proposal} is not found."
            raise RuntimeError(msg)

        variables = await fetch_variables(
            proposal, limit=per_page, offset=(page - 1) * per_page
        )

        info = await fetch_info(proposal, variables)

        runs = [model.as_stype(**{**v, **i}) for v, i in zip(variables, info)]
        return runs

    @strawberry.field
    def metadata(self, database: DatabaseInput) -> JSON:
        model = get_model(database.proposal)
        return {
            "rows": model.num_rows,
            "variables": model.variables,
            "timestamp": model.timestamp * 1000,  # deserialize to JS
        }

    @strawberry.field
    def extracted_data(database: DatabaseInput, run: int, variable: str) -> JSON:
        dataset = get_extracted_data(database.proposal, run, variable)
        array_name = next(iter(dataset))
        coords = [name for name in dataset.keys() if name != array_name]
        array_dtypes = {
            1: DamnitType.ARRAY,
            2: DamnitType.IMAGE,
            3: DamnitType.RGBA,
        }

        return {
            "data": {key: data.tolist() for key, data in dataset.items()},
            "metadata": {
                "name": array_name,
                "coords": coords,
                "dtype": array_dtypes[dataset[array_name].ndim].value,
            },
        }
