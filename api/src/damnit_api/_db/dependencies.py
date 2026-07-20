"""Litestar dependency helpers for database sessions."""

from collections.abc import AsyncIterator

from litestar.datastructures import State
from sqlmodel.ext.asyncio.session import AsyncSession


async def get_session(state: State) -> AsyncIterator[AsyncSession]:
    """Provide a database session from the application state."""

    async with state.app_state.db_sessionmaker() as session:  # type: ignore[attr-defined]
        yield session


# Plain type alias; Litestar injects by the parameter name `session`.
DBSession = AsyncSession
