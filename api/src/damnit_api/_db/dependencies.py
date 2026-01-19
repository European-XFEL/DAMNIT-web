"""FastAPI dependency helpers for database sessions."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlmodel.ext.asyncio.session import AsyncSession

import damnit_api._db


async def get_session() -> AsyncIterator[AsyncSession]:
    """Provide a database session for FastAPI dependencies."""

    async with damnit_api._db.__SESSION_LOCAL() as session:
        yield session


DBSession = Annotated[AsyncSession, Depends(get_session)]
