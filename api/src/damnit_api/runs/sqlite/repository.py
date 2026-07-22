from collections import defaultdict
from datetime import datetime

from async_lru import alru_cache
from sqlalchemy import (
    MetaData,
    Table,
    case,
    desc,
    func,
    select,
)
from sqlalchemy.exc import NoSuchTableError

from ...utils import create_map
from .session import get_connection, get_session


def order_by_active(table, active):
    """Order rows with the active proposal's block first, then (proposal, run).

    `active` is the addressing proposal from the file's `metameta`, which is
    DAMNIT's own definition of the active proposal. Guest proposals follow,
    ordered by (proposal, run). When there is no active proposal the ordering
    falls back to plain (proposal, run).
    """
    columns = [table.c.proposal, table.c.run]
    if active is None:
        return columns
    return [case((table.c.proposal == active, 0), else_=1), *columns]


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


async def _read_active_proposal(proposal) -> int | None:
    table = await async_table(proposal, name="metameta")
    if table is None:
        return None
    selection = select(table.c.value).where(table.c.key == "proposal")
    async with get_session(proposal) as session:
        result = await session.execute(selection)
    value = result.scalar()
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        # `metameta` is DAMNIT's file, not ours. A value that is not a number
        # means the file names no active proposal, which orders rows plainly;
        # raising here would instead fail every `runs` query on the file.
        return None


@alru_cache(ttl=300)
async def async_active_proposal(proposal) -> int | None:
    """Return the file's active proposal from `metameta`, or None if absent.

    Cached like `async_table`: the value is fixed for a file's lifetime, and
    every `runs` query and every subscription tick asks for it to order rows.
    """
    active = await _read_active_proposal(proposal)
    if active is None:
        # Don't cache misses; the table or the key may appear shortly. This
        # drops the cache entry without touching the task still running it.
        async_active_proposal.cache_invalidate(proposal)
    return active


async def async_run_identifiers(proposal) -> list[tuple[int, int]]:
    """Return every (proposal, run) pair in `run_info`, server-ordered."""
    table = await async_table(proposal, name="run_info")
    if table is None:
        return []
    active = await async_active_proposal(proposal)
    selection = select(table.c.proposal, table.c.run).order_by(
        *order_by_active(table, active)
    )
    async with get_session(proposal) as session:
        result = await session.execute(selection)
    return [(row["proposal"], row["run"]) for row in result.mappings().all()]


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
