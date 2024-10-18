from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from sqlalchemy import (
    MetaData,
    Table,
    desc,
    func,
    select,
)
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from damnit_api.utils import get_run_data

from .const import DEFAULT_PROPOSAL
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
            raise Exception("DatabaseSessionManager is not initialized")
        await self._engine.dispose()
        self._engine = None
        self._sessionmaker = None

    @asynccontextmanager
    async def connect(self) -> AsyncIterator[AsyncConnection]:
        if self._engine is None:
            raise Exception("DatabaseSessionManager is not initialized")

        async with self._engine.begin() as connection:
            try:
                yield connection
            except Exception:
                await connection.rollback()
                raise

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        if self._sessionmaker is None:
            raise Exception("DatabaseSessionManager is not initialized")

        session = self._sessionmaker()
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def get_session(proposal) -> AsyncSession:
    return DatabaseSessionManager(proposal).session()


def get_connection(proposal) -> AsyncConnection:
    return DatabaseSessionManager(proposal).connect()


async def async_table(proposal, name: str = "runs") -> Table:
    async with get_connection(proposal) as conn:
        return await conn.run_sync(
            lambda conn: Table(name, MetaData(), autoload_with=conn)
        )


async def async_variables(proposal):
    variables = await async_table(proposal, name="variables")
    selection = select(variables.c.name, variables.c.title)

    async with get_session(proposal) as session:
        result = await session.execute(selection)

    return create_map(result.mappings().all(), key="name")


async def async_latest_rows(
    proposal,
    *,
    table: Union[str, Table],
    by: str,
    start_at=None,
    descending=True,
) -> dict:
    if start_at is None:
        start_at = datetime.now().timestamp()
    order_by = desc(by) if descending else by

    if isinstance(table, str):
        table = await async_table(proposal, name=table)

    selection = select(table).where(table.c.get(by) > start_at).order_by(order_by)

    async with get_session(proposal) as session:
        result = await session.execute(selection)
    return result.mappings().all()


async def async_count(proposal, *, table: str, by="run"):
    table = await async_table(proposal, name=table)
    selection = select(func.count(table.c.get(by)))

    async with get_session(proposal) as session:
        result = await session.execute(selection)

    return result.scalar()


# -----------------------------------------------------------------------------
# Run data


def get_extracted_data(proposal, run, variable):
    root_path = DatabaseSessionManager(proposal).root_path
    data_path = str(Path(root_path) / "extracted_data" / f"p{proposal}_r{run}.h5")
    return get_run_data(data_path, variable)


# -----------------------------------------------------------------------------
# Etc.


def get_damnit_path(proposal_number: str = DEFAULT_PROPOSAL) -> str:
    """Returns the directory of the given proposal."""
    path = find_proposal(proposal_number)
    if not path:
        raise RuntimeError(f"Proposal '{proposal_number}' is not found.")
    return str(Path(path) / DAMNIT_PATH)
