"""Database session type alias for Litestar handlers."""

from sqlalchemy.ext.asyncio import AsyncSession

# Type alias used for annotations in other modules; the session itself is
# provided by the Advanced Alchemy plugin (session_dependency_key="session").
DBSession = AsyncSession
