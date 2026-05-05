from . import models
from .routers import router


class _ContextFileCache:
    """Compatibility helper for tests that clear context-file caches."""

    TTL = 5

    @property
    def file_mtime_cache(self):
        return self

    def clear(self) -> None:
        """Clear cached context-file and modified-time reads."""
        models.ModifiedTime.from_file.cache_clear()
        models.ContextFile.from_file.cache_clear()


mtime_cache = _ContextFileCache()

__all__ = ["mtime_cache", "router"]
