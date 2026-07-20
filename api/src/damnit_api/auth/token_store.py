"""TokenStore protocol and implementations."""

from typing import Any, Protocol


class TokenStore(Protocol):
    def store(self, sub: str, token: dict[str, Any]) -> None: ...
    def pop_token_field(self, sub: str, field: str) -> Any: ...


class InMemoryTokenStore:
    def __init__(self) -> None:
        self._tokens: dict[str, dict[str, Any]] = {}

    def store(self, sub: str, token: dict[str, Any]) -> None:
        self._tokens[sub] = token

    def pop_token_field(self, sub: str, field: str) -> Any:
        return self._tokens.get(sub, {}).pop(field, None)
