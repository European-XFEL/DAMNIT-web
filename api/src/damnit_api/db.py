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

from .utils import Registry, create_map

DAMNIT_PATH = "usr/Shared/amore/"


# -----------------------------------------------------------------------------
# Asynchronous


class DatabaseSessionManager(metaclass=Registry):
    def __init__(self, db_path: Path):
        if not db_path.exists():
            msg = f"Database file does not exist: {db_path}"
            raise FileNotFoundError(msg)

        self.db_uri = f"sqlite+aiosqlite:///{db_path}"
        self._engine = create_async_engine(self.db_uri)
        self._sessionmaker = async_sessionmaker(autocommit=False, bind=self._engine)

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


def get_session(db_path: Path) -> AsyncSession:
    return DatabaseSessionManager(
        db_path
    ).session()  # FIX: # pyright: ignore[reportReturnType]


def get_connection(db_path: Path) -> AsyncConnection:
    return DatabaseSessionManager(
        db_path
    ).connect()  # FIX: # pyright: ignore[reportReturnType]


async def async_table(db_path: Path, name: str = "runs") -> Table:
    async with get_connection(db_path) as conn:
        return await conn.run_sync(
            lambda conn: Table(name, MetaData(), autoload_with=conn)
        )


async def async_variables(db_path: Path):
    variables = await async_table(db_path, name="variables")
    selection_variables = select(variables.c.name, variables.c.title)
    async with get_session(db_path) as session:
        result = await session.execute(selection_variables)

    variable_rows = result.mappings().all()

    return create_map(variable_rows, key="name")


async def async_latest_rows(
    db_path: Path,
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
        table = await async_table(db_path, name=table)

    selection = (
        select(table)
        .where(
            table.c.get(by) > start_at  # FIX: # pyright: ignore[reportOptionalOperand]
        )
        .order_by(order_by)
    )

    async with get_session(db_path) as session:
        result = await session.execute(selection)
    return result.mappings().all()  # FIX: # pyright: ignore[reportReturnType]


async def async_column(db_path: Path, *, table: str, name: str):
    table = await async_table(
        db_path, name=table
    )  # FIX:  # pyright: ignore[reportAssignmentType]
    selection = select(
        table.c.get(name)  # FIX:  # pyright: ignore[reportAttributeAccessIssue]
    )

    async with get_session(db_path) as session:
        result = await session.execute(selection)

    return result.scalars().all()


async def async_all_tags(db_path: Path):
    tags_table = await async_table(db_path, name="tags")
    selection = select(
        tags_table.c.id,
        tags_table.c.name,
    )
    async with get_session(db_path) as session:
        result = await session.execute(selection)

    return create_map(result.mappings().all(), key="id")


async def async_variable_tags(db_path: Path):
    try:
        variable_tags_table = await async_table(db_path, name="variable_tags")
        selection = select(
            variable_tags_table.c.variable_name, variable_tags_table.c.tag_id
        )
        async with get_session(db_path) as session:
            result = await session.execute(selection)
        return result.mappings().all()
    except NoSuchTableError:
        return []
