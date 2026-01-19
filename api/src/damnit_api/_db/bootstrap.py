"""Bootstrapping for the database layer.

This module configures an async SQLModel engine and sessionmaker and provides helpers
and dependencies for FastAPI integration.
"""

from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import (
    async_sessionmaker,
    create_async_engine,
)
from sqlmodel.ext.asyncio.session import AsyncSession

from .. import get_logger

logger = get_logger()

if TYPE_CHECKING:
    from ..shared.settings import Settings


async def bootstrap(settings: "Settings") -> None:
    """Initialize the async engine and sessionmaker.

    This function is intended to be called during application startup.
    """
    import damnit_api._db

    if damnit_api._db.__ENGINE is not None:
        await logger.awarning("Database engine already initialized")
        return

    db_url = f"sqlite+aiosqlite:///{settings.db_path}"
    await logger.ainfo("Configuring database engine", db_url=db_url)
    damnit_api._db.__ENGINE = create_async_engine(str(db_url), echo=False, future=True)
    damnit_api._db.__SESSION_LOCAL = async_sessionmaker(
        bind=damnit_api._db.__ENGINE, class_=AsyncSession, expire_on_commit=False
    )


def init_db() -> None:
    """Create database tables from SQLModel metadata."""
    from sqlalchemy import create_engine
    from sqlmodel import SQLModel

    engine = create_engine(f"sqlite:///{settings.db_path}", echo=True, future=True)

    SQLModel.metadata.create_all(engine)


if __name__ == "__main__":
    import asyncio

    from ..metadata import models as _md  # noqa: F401
    from ..shared.settings import settings

    asyncio.run(bootstrap(settings))

    if settings.db_path.exists():
        logger.warning("Database file already exists.", db_path=settings.db_path)
        if input("Delete table? [y/n]: ").lower() != "y":
            exit(0)

    init_db()
