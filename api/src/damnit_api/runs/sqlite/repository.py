from collections import defaultdict
from datetime import datetime

from sqlalchemy import (
    Table,
    desc,
    func,
    select,
)

from ...utils import create_map
from .session import DamnitDBRegistry, get_session


async def async_table(
    registry: DamnitDBRegistry, proposal, name: str = "runs"
) -> Table | None:
    return await registry.get(proposal).get_table(name)


async def async_variables(registry: DamnitDBRegistry, proposal):
    variables = await async_table(registry, proposal, name="variables")
    if variables is None:
        return {}
    selection_variables = select(variables.c.name, variables.c.title)
    async with get_session(registry, proposal) as session:
        result = await session.execute(selection_variables)

    variable_rows = result.mappings().all()

    return create_map(variable_rows, key="name")


async def async_latest_rows(
    registry: DamnitDBRegistry,
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

    async with get_session(registry, proposal) as session:
        result = await session.execute(selection)
    return result.mappings().all()  # FIX: # pyright: ignore[reportReturnType]


async def async_max(registry: DamnitDBRegistry, proposal, *, table: str, column: str):
    table = await async_table(registry, proposal, name=table)
    if table is None:
        return None
    selection = select(func.max(table.c.get(column)))
    async with get_session(registry, proposal) as session:
        result = await session.execute(selection)
    return result.scalar()


async def async_column(registry: DamnitDBRegistry, proposal, *, table: str, name: str):
    table = await async_table(registry, proposal, name=table)
    if table is None:
        return []
    selection = select(table.c.get(name))

    async with get_session(registry, proposal) as session:
        result = await session.execute(selection)

    return result.scalars().all()


async def async_all_tags(registry: DamnitDBRegistry, proposal):
    tags_table = await async_table(registry, proposal, name="tags")
    if tags_table is None:
        return {}
    selection = select(
        tags_table.c.id,
        tags_table.c.name,
    )
    async with get_session(registry, proposal) as session:
        result = await session.execute(selection)

    return create_map(result.mappings().all(), key="id")


async def async_variable_tags(registry: DamnitDBRegistry, proposal):
    variable_tags_table = await async_table(registry, proposal, name="variable_tags")
    if variable_tags_table is None:
        return {}

    selection = select(
        variable_tags_table.c.variable_name, variable_tags_table.c.tag_id
    )
    async with get_session(registry, proposal) as session:
        result = await session.execute(selection)

    variable_tags: dict[str, list[int]] = defaultdict(list)
    for row in result.mappings().all():
        variable_tags[row["variable_name"]].append(row["tag_id"])

    return variable_tags
