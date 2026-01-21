from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from sqlalchemy import (
    MetaData,
    Table,
    desc,
    select,
)
from sqlalchemy.exc import NoSuchTableError
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .shared.const import DEFAULT_PROPOSAL
from .utils import Registry, create_map, find_proposal

DAMNIT_PATH = "usr/Shared/amore/"


# -----------------------------------------------------------------------------
# Asynchronous


class DatabaseSessionManager(metaclass=Registry):
    def __init__(self, proposal: str = DEFAULT_PROPOSAL):
        self.proposal = proposal
        self.root_path = get_damnit_path(proposal)
        self._engine = create_async_engine(self.db_path)
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


async def async_table(proposal, name: str = "runs") -> Table:
    async with get_connection(proposal) as conn:
        return await conn.run_sync(
            lambda conn: Table(name, MetaData(), autoload_with=conn)
        )


async def async_variables(proposal):
    variables = await async_table(proposal, name="variables")
    selection_variables = select(variables.c.name, variables.c.title)
    async with get_session(proposal) as session:
        result = await session.execute(selection_variables)

    variable_rows = result.mappings().all()

    return create_map(variable_rows, key="name")


async def async_latest_rows(
    proposal,
    *,
    table: str | Table,
    by: str,
    start_at=None,
    descending=True,
) -> dict:
    if start_at is None:
        start_at = datetime.now().astimezone().timestamp()
    order_by = desc(by) if descending else by

    if isinstance(table, str):
        table = await async_table(proposal, name=table)

    selection = (
        select(table)
        .where(
            table.c.get(by) > start_at  # FIX: # pyright: ignore[reportOptionalOperand]
        )
        .order_by(order_by)
    )

    async with get_session(proposal) as session:
        result = await session.execute(selection)
    return result.mappings().all()  # FIX: # pyright: ignore[reportReturnType]


async def async_column(proposal, *, table: str, name: str):
    table = await async_table(
        proposal, name=table
    )  # FIX:  # pyright: ignore[reportAssignmentType]
    selection = select(
        table.c.get(name)  # FIX:  # pyright: ignore[reportAttributeAccessIssue]
    )

    async with get_session(proposal) as session:
        result = await session.execute(selection)

    return result.scalars().all()


async def async_all_tags(proposal):
    tags_table = await async_table(proposal, name="tags")
    selection = select(
        tags_table.c.id,
        tags_table.c.name,
    )
    async with get_session(proposal) as session:
        result = await session.execute(selection)

    return create_map(result.mappings().all(), key="id")


async def async_variable_tags(proposal):
    try:
        variable_tags_table = await async_table(proposal, name="variable_tags")
        selection = select(
            variable_tags_table.c.variable_name, variable_tags_table.c.tag_id
        )
        async with get_session(proposal) as session:
            result = await session.execute(selection)
        return result.mappings().all()
    except NoSuchTableError:
        return []


# -----------------------------------------------------------------------------
# Etc.


def get_damnit_path(proposal_number: str = DEFAULT_PROPOSAL) -> str:
    """Returns the directory of the given proposal."""
    path = find_proposal(proposal_number)
    if not path:
        msg = f"Proposal '{proposal_number}' is not found."
        raise RuntimeError(msg)
    return str(Path(path) / DAMNIT_PATH)
