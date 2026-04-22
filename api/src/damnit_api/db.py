from collections import defaultdict
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from async_lru import alru_cache
from sqlalchemy import (
    MetaData,
    Table,
    desc,
    func,
    select,
)
from sqlalchemy.exc import NoSuchTableError
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from .shared.const import DEFAULT_PROPOSAL
from .utils import Registry, create_map, find_proposal

DAMNIT_PATH = "usr/Shared/amore/"


# -----------------------------------------------------------------------------
# Asynchronous


class DatabaseSessionManager(metaclass=Registry):
    def __init__(self, proposal: str = DEFAULT_PROPOSAL):
        self.proposal = proposal
        self.root_path = get_damnit_path(proposal)
        self._engine = create_async_engine(
            self.db_path,
            isolation_level="AUTOCOMMIT",
            poolclass=NullPool,
        )
        self._sessionmaker = async_sessionmaker(autocommit=False, bind=self._engine)

    @property
    def db_path(self):
        path = Path(self.root_path) / "runs.sqlite"
        return f"sqlite+aiosqlite:///{path}"

    async def close(self):
        if self._engine is None:
            msg = "DatabaseSessionManager is not initialized"
            raise Exception(msg)
        await self._engine.dispose()
        self._engine = None
        self._sessionmaker = None

    @asynccontextmanager
    async def connect(self) -> AsyncIterator[AsyncConnection]:
        if self._engine is None:
            msg = "DatabaseSessionManager is not initialized"
            raise Exception(msg)

        async with self._engine.begin() as connection:
            try:
                yield connection
            except Exception:
                await connection.rollback()
                raise

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        if self._sessionmaker is None:
            msg = "DatabaseSessionManager is not initialized"
            raise Exception(msg)

        session = self._sessionmaker()
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def get_session(proposal) -> AsyncSession:
    return DatabaseSessionManager(
        proposal
    ).session()  # FIX: # pyright: ignore[reportReturnType]


def get_connection(proposal) -> AsyncConnection:
    return DatabaseSessionManager(
        proposal
    ).connect()  # FIX: # pyright: ignore[reportReturnType]


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

    selection = (
        select(table)
        .where(table.c.get(by) > start_at)
        .order_by(order_by)
    )

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


async def async_config_value(proposal, key):
    metameta = await async_table(proposal, name="metameta")
    selection = select(metameta.c.value).where(metameta.c.key == key)
    async with get_session(proposal) as session:
        result = await session.execute(selection)
    return result.scalar()


async def async_changed_values(proposal, data_proposal, run, values):
    run_vars = await async_table(proposal, name="run_variables")

    selection = (
        select(run_vars)
        .where(
            run_vars.c.proposal == data_proposal,
            run_vars.c.run == run,
            run_vars.c.run.in_(values)
        )
    )

    async with get_session(proposal) as session:
        result = await session.execute(selection)
    return result.mappings().all()  # FIX: # pyright: ignore[reportReturnType]


# -----------------------------------------------------------------------------
# Etc.


def get_damnit_path(proposal_number: str = DEFAULT_PROPOSAL) -> str:
    """Returns the directory of the given proposal."""
    path = find_proposal(proposal_number)
    if not path:
        msg = f"Proposal '{proposal_number}' is not found."
        raise RuntimeError(msg)
    return str(Path(path) / DAMNIT_PATH)
