from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from ...shared.const import DEFAULT_PROPOSAL
from ...shared.errors import ProposalNotFoundError
from ...shared.models import ProposalNumber
from ...utils import find_proposal

DAMNIT_PATH = "usr/Shared/amore/"
_DEFAULT_PROPOSAL = ProposalNumber(DEFAULT_PROPOSAL)


class DatabaseSessionManager:
    """Async SQLAlchemy session manager for a single DAMNIT proposal DB.

    One instance per proposal, held by `SQLiteDamnitRepository`.
    """

    def __init__(self, proposal: ProposalNumber = _DEFAULT_PROPOSAL):
        self.proposal = proposal
        self.root_path = get_damnit_path(proposal)
        self._engine = create_async_engine(
            self.db_path,
            isolation_level="AUTOCOMMIT",
            poolclass=NullPool,
            connect_args={"timeout": 30},
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


def get_damnit_path(proposal: ProposalNumber = _DEFAULT_PROPOSAL) -> str:
    """Returns the directory of the given proposal."""
    from ...shared.settings import settings

    if settings.is_local:
        return str(settings.damnit_path)

    path = find_proposal(proposal)
    if not path:
        msg = f"Proposal '{proposal}' is not found."
        raise ProposalNotFoundError(msg)
    return str(Path(path) / DAMNIT_PATH)
