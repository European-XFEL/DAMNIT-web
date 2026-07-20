"""FastAPI dependency helpers for database sessions."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlmodel.ext.asyncio.session import AsyncSession

from ..state import get_app_state


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Provide a database session from the application state."""

    async with get_app_state(request).db_sessionmaker() as session:
        yield session


DBSession = Annotated[AsyncSession, Depends(get_session)]
