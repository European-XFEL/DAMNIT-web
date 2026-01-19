"""Database package exports for damnit_api._db."""

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    async_sessionmaker,
)
from sqlmodel.ext.asyncio.session import AsyncSession

from .bootstrap import bootstrap

global __ENGINE, __SESSION_LOCAL

__ENGINE: AsyncEngine = None  # pyright: ignore[reportAssignmentType]

__SESSION_LOCAL: async_sessionmaker[AsyncSession] = None  # pyright: ignore[reportAssignmentType]

__all__ = ["bootstrap"]
