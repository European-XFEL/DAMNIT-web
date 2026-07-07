from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from pathlib import Path

from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from ...shared.const import DEFAULT_PROPOSAL
from ...utils import find_proposal

DAMNIT_PATH = "usr/Shared/amore/"


# -----------------------------------------------------------------------------
# Asynchronous


class DatabaseSessionManager:
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


class DamnitDBRegistry:
    """Per-proposal DAMNIT database registry."""

    def __init__(self) -> None:
        self._managers: dict[str, DatabaseSessionManager] = {}

    def get(self, proposal: str) -> DatabaseSessionManager:
        if proposal not in self._managers:
            self._managers[proposal] = DatabaseSessionManager(proposal)
        return self._managers[proposal]

    def pop(
        self, proposal: str, default: DatabaseSessionManager | None = None
    ) -> DatabaseSessionManager | None:
        return self._managers.pop(proposal, default)

    def clear(self) -> None:
        self._managers.clear()


# TODO: remove, replace with app state (next commit)
damnit_registry = DamnitDBRegistry()


def get_session(proposal: str) -> AbstractAsyncContextManager[AsyncSession]:
    return damnit_registry.get(proposal).session()


def get_connection(proposal: str) -> AbstractAsyncContextManager[AsyncConnection]:
    return damnit_registry.get(proposal).connect()


# -----------------------------------------------------------------------------
# Etc.


def get_damnit_path(proposal_number: str = DEFAULT_PROPOSAL) -> str:
    """Returns the directory of the given proposal."""
    from ...shared.settings import settings

    if settings.is_local:
        return str(settings.damnit_path)

    path = find_proposal(proposal_number)
    if not path:
        msg = f"Proposal '{proposal_number}' is not found."
        raise RuntimeError(msg)
    return str(Path(path) / DAMNIT_PATH)
