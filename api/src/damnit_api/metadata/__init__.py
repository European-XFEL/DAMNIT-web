"""Metadata helpers, with server routers loaded only when requested."""

from importlib import import_module
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .hzdr_routers import hzdr_router
    from .routers import router

__all__ = ["hzdr_router", "router"]


def __getattr__(name: str):
    # Standalone metadata tools must not initialize server auth/settings merely
    # by importing a helper. Preserve the public router exports for the app.
    modules = {"hzdr_router": ".hzdr_routers", "router": ".routers"}
    if name not in modules:
        message = f"module {__name__!r} has no attribute {name!r}"
        raise AttributeError(message)
    value = getattr(import_module(modules[name], __name__), name)
    globals()[name] = value
    return value
