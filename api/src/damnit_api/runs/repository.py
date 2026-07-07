"""Repository interface for DAMNIT run/variable data."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

from .. import get_logger

logger = get_logger()

if TYPE_CHECKING:
    from collections.abc import Callable

    from ..shared.models import ProposalNumber
    from .models import MetadataSnapshot, RunRecord


class DamnitRepository(ABC):
    """Per-proposal data-access interface.

    One instance per proposal. Implementations own their own session management
    and caching (e.g. metadata TTL).
    """

    @property
    @abstractmethod
    def proposal(self) -> ProposalNumber: ...

    @abstractmethod
    async def get_runs(
        self,
        *,
        limit: int,
        offset: int,
        variable_names: list[str] | None = None,
    ) -> list[RunRecord]:
        """Return paginated runs with their latest variable values.

        Args:
            limit: Maximum number of runs to return.
            offset: Number of runs to skip (for pagination).
            variable_names: If given, only include these variables in each
                run's `variables` dict. `None` means all variables.
        """

    @abstractmethod
    async def get_latest_runs(
        self,
        *,
        start_at: float | None = None,
    ) -> list[RunRecord]:
        """Return runs with timestamps newer than `start_at`.

        Used by the `latest_data` subscription to stream incremental updates. `start_at`
        defaults to *now* when `None`.
        """

    @abstractmethod
    async def get_metadata(self) -> MetadataSnapshot:
        """Return the full proposal-level metadata snapshot.

        Implementations are expected to cache this with a short TTL (e.g. ~10s) because
        it is fetched on every subscription tick.
        """

    @abstractmethod
    async def get_extracted_data(
        self,
        *,
        run: int,
        variable: str,
    ) -> Any:
        """Return the preview data for one (run, variable) pair.

        The return type is intentionally `Any` as the concrete type depends on the
        variable's dtype (scalar, PNG bytes, numpy array, etc..).

        Implementations must **not** block the event loop.
        """

    def invalidate_metadata_cache(self) -> None:
        """Invalidate any cached metadata so the next `get_metadata` call re-fetches.

        The default implementation is a no-op; override in implementations that cache.
        """
        return


class DamnitRepositoryRegistry:
    """Lazily creates and caches one `DamnitRepository` per proposal.

    `factory` callable receives a `ProposalNumber`, must return a fully initialised
    `DamnitRepository`.
    """

    def __init__(
        self,
        factory: Callable[[ProposalNumber], DamnitRepository],
    ) -> None:
        self._factory = factory
        self._repos: dict[ProposalNumber, DamnitRepository] = {}

    def __contains__(self, proposal_number: ProposalNumber) -> bool:
        return proposal_number in self._repos

    def get(self, proposal_number: ProposalNumber) -> DamnitRepository:
        """Return the cached repository, creating it on first access."""
        if proposal_number not in self._repos:
            try:
                self._repos[proposal_number] = self._factory(proposal_number)
            except Exception:
                logger.exception(
                    "Failed to create repository for proposal",
                    proposal=proposal_number,
                )
                raise
        return self._repos[proposal_number]

    def pop(
        self,
        proposal_number: ProposalNumber,
        default: DamnitRepository | None = None,
    ) -> DamnitRepository | None:
        """Remove and return the repository for *proposal_number*, if present."""
        return self._repos.pop(proposal_number, default)

    def clear(self) -> None:
        """Evict all cached repositories."""
        self._repos.clear()
