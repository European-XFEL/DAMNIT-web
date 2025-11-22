from typing import TYPE_CHECKING

import strawberry
from strawberry.scalars import JSON

from .bootstrap import bootstrap
from .utils import DamnitDataSpecifierInput

if TYPE_CHECKING:
    from strawberry.types import Info

    from ..shared.gql import Context


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def refresh(
        self,
        info: "Info[Context]",
        damnit_data_specifier: DamnitDataSpecifierInput,
    ) -> JSON:  # FIX: # pyright: ignore[reportInvalidTypeForm]
        """Refreshes the DAMNIT model for the given database input."""
        proposal_meta = (
            await damnit_data_specifier.get_proposal_meta_with_auth(
                info.context.oauth_user, info.context.mymdc
            )
        ).with_damnit_path()

        db_path = proposal_meta.damnit_path / "runs.sqlite"

        model = await bootstrap(db_path)

        if model.stype is None:
            msg = f"Table model not found in {db_path}."
            raise RuntimeError(msg)

        info.schema.update(model.stype)  # pyright: ignore[reportAttributeAccessIssue]

        md = {
            "runs": model.runs,
            "variables": model.variables,
            "timestamp": model.timestamp * 1000,  # deserialize to JS
            "tags": model.tags,
        }
        return {"metadata": md}
