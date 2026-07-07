from collections import defaultdict
from datetime import datetime

from async_lru import alru_cache
from sqlalchemy import (
    MetaData,
    Table,
    desc,
    func,
    select,
)
from sqlalchemy.exc import NoSuchTableError

from ...utils import create_map
from .session import get_connection, get_session


@alru_cache(ttl=300)
async def async_table(proposal, name: str = "runs") -> Table | None:
    async with get_connection(proposal) as conn:
        try:
            return await conn.run_sync(
                lambda conn: Table(name, MetaData(), autoload_with=conn)
            )
        except NoSuchTableError:
            # Don't cache misses; the table may appear shortly.
            async_table.cache_invalidate(proposal, name)
            return None


async def async_variables(proposal):
    variables = await async_table(proposal, name="variables")
    if variables is None:
        return {}
    selection_variables = select(variables.c.name, variables.c.title)
    async with get_session(proposal) as session:
        result = await session.execute(selection_variables)

    variable_rows = result.mappings().all()

    return create_map(variable_rows, key="name")


async def async_latest_rows(
    proposal,
    *,
    table: Table,
    by: str,
    start_at=None,
    descending=True,
) -> dict:
    if start_at is None:
        start_at = datetime.now().astimezone().timestamp()
    order_by = desc(by) if descending else by

    selection = select(table).where(table.c.get(by) > start_at).order_by(order_by)

    async with get_session(proposal) as session:
        result = await session.execute(selection)
    return result.mappings().all()  # FIX: # pyright: ignore[reportReturnType]


async def async_max(proposal, *, table: str, column: str):
    table = await async_table(proposal, name=table)
    if table is None:
        return None
    selection = select(func.max(table.c.get(column)))
    async with get_session(proposal) as session:
        result = await session.execute(selection)
    return result.scalar()


async def async_column(proposal, *, table: str, name: str):
    table = await async_table(proposal, name=table)
    if table is None:
        return []
    selection = select(table.c.get(name))

    async with get_session(proposal) as session:
        result = await session.execute(selection)

    return result.scalars().all()


async def async_all_tags(proposal):
    tags_table = await async_table(proposal, name="tags")
    if tags_table is None:
        return {}
    selection = select(
        tags_table.c.id,
        tags_table.c.name,
    )
    async with get_session(proposal) as session:
        result = await session.execute(selection)

    return create_map(result.mappings().all(), key="id")


async def async_variable_tags(proposal):
    variable_tags_table = await async_table(proposal, name="variable_tags")
    if variable_tags_table is None:
        return {}

    selection = select(
        variable_tags_table.c.variable_name, variable_tags_table.c.tag_id
    )
    async with get_session(proposal) as session:
        result = await session.execute(selection)

    variable_tags: dict[str, list[int]] = defaultdict(list)
    for row in result.mappings().all():
        variable_tags[row["variable_name"]].append(row["tag_id"])

    return variable_tags
