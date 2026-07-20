"""TokenStore protocol and implementations."""

from typing import Any, Protocol, runtime_checkable


# `runtime_checkable` is required so Litestar's msgspec-based signature
# validation (which does `isinstance(value, TokenStore)`) doesn't raise a
# TypeError on every request that injects this dependency.
@runtime_checkable
class TokenStore(Protocol):
    def store(self, sub: str, token: dict[str, Any]) -> None: ...
    def pop_token_field(self, sub: str, field: str) -> str | None: ...


class InMemoryTokenStore:
    def __init__(self) -> None:
        self._tokens: dict[str, dict[str, Any]] = {}

    def store(self, sub: str, token: dict[str, Any]) -> None:
        self._tokens[sub] = token

    def pop_token_field(self, sub: str, field: str) -> str | None:
        token = self._tokens.get(sub)
        if token is None:
            return None
        value = token.pop(field, None)
        if not token:
            del self._tokens[sub]
        return value
