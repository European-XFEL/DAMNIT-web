"""App-DB repository for cached proposal metadata (Advanced Alchemy).

This is the app database's data access (ADR-010: `dw_api.sqlite`, writable) -
distinct from the read-only `DamnitRepository` over per-proposal DAMNIT files.
"""

from advanced_alchemy.repository import SQLAlchemyAsyncRepository

from .models import ProposalMeta


class ProposalMetaRepository(
    SQLAlchemyAsyncRepository[ProposalMeta]  # ty: ignore[invalid-type-arguments]
):
    """CRUD/upsert access to the proposal-metadata cache.

    SQLModel `table=True` models satisfy Advanced Alchemy's `ModelProtocol` at
    runtime (they have `__table__`/`__mapper__`), but ty cannot verify that
    structurally.
    """

    model_type = ProposalMeta
