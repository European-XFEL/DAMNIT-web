from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncIterator
from pathlib import Path
from typing import Union

from fastapi import Depends
from sqlalchemy import (
    Engine,
    MetaData,
    Select,
    Table,
    create_engine,
    desc,
    func,
    inspect,
    select,
)
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine
)

from damnit_api.utils import get_run_data
from .const import DEFAULT_PROPOSAL
from .utils import Registry, find_proposal

DAMNIT_PATH = 'usr/Shared/amore/'


# -----------------------------------------------------------------------------
# Asynchronous


class DatabaseSessionManager(metaclass=Registry):

    def __init__(self, proposal: str = DEFAULT_PROPOSAL):
        self.proposal = proposal
        self.root_path = get_damnit_path(proposal)
        self._engine = create_async_engine(self.db_path)
        self._sessionmaker = async_sessionmaker(autocommit=False,
                                                bind=self._engine)

    @property
    def db_path(self):
        path = Path(self.root_path) / 'runs.sqlite'
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


async def async_table(proposal, name: str = 'runs') -> Table:
    async with get_connection(proposal) as conn:
        return await conn.run_sync(
            lambda conn: Table(name, MetaData(), autoload_with=conn))


async def async_latest_rows(
        proposal,
        *,
        table: Union[str, Table],
        by: str,
        start_at=None,
        descending=True) -> dict:
    if start_at is None:
        start_at = datetime.now().timestamp()
    order_by = desc(by) if descending else by

    if isinstance(table, str):
        table = await async_table(proposal, name=table)

    selection = (select(table)
                 .where(table.c.get(by) > start_at)
                 .order_by(order_by))

    async with get_session(proposal) as session:
        result = await session.execute(selection)
    return result.mappings().all()


async def async_count(proposal, *, table: str, by='run'):
    table = await async_table(proposal, name=table)
    selection = select(func.count(table.c.get(by)))

    async with get_session(proposal) as session:
        result = await session.execute(selection)

    return result.scalar()


# -----------------------------------------------------------------------------
# Run data

def get_extracted_data(proposal, run, variable):
    root_path = DatabaseSessionManager(proposal).root_path
    data_path = str(Path(root_path) / "extracted_data"
                    / f"p{proposal}_r{run}.h5")
    return get_run_data(data_path, variable)


# -----------------------------------------------------------------------------
# Synchronous


def get_damnit_path(proposal_number: str = DEFAULT_PROPOSAL) -> str:
    """Returns the directory of the given proposal."""
    path = find_proposal(proposal_number)
    if not path:
        raise RuntimeError(f"Proposal '{proposal_number}' is not found.")
    return str(Path(path) / DAMNIT_PATH)


def get_engine(
    damnit_path: str = Depends(get_damnit_path),
) -> Engine:
    """
    Returns a SQLAlchemy engine instance for the specified database file.
    """
    db_path = str(Path(damnit_path) / 'runs.sqlite')
    engine = create_engine(f"sqlite:///{db_path}")
    return engine


def get_conn(engine: Engine = Depends(get_engine)):
    """
    Returns a SQLAlchemy connection instance for the specified engine.
    """
    with engine.connect() as conn:
        yield conn


def get_table(
    engine: Engine = Depends(get_engine),
    table_name: str = "runs"
) -> Table:
    """Returns a SQLAlchemy table for the specified table name and engine."""
    return Table(table_name, MetaData(), autoload_with=engine)


def get_base_selection(table: Table = Depends(get_table)) -> Select:
    """
    Returns a base SQLAlchemy select statement for the specified table name and engine.
    """
    return select(table)


def get_selection(
    selection: Select = Depends(get_base_selection),
    run_number: int = None,
    page_size: int = 100,
    offset: int = 0,
):
    """
    Returns a SQLAlchemy select statement with optional filters and pagination.
    """
    if run_number:
        selection = selection.filter_by(runnr=run_number)

    return selection.offset(offset).limit(page_size)


def get_column_names(
    engine: Engine = Depends(get_engine),
    table_name: str = "runs"
):
    """Returns a list of the column names for the specified table name and engine"""
    return [column['name'] for column in inspect(engine).get_columns(table_name)]


def get_column_datum(table: Table = Depends(get_table)):
    """Returns a function which generates a SQLAlchemy select statement
       that fetches one non-null value from the specified column"""
    def inner(column_name):
        column = table.c[column_name]
        return select(column).where(column.is_not(None)).limit(1)

    return inner
