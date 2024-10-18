import strawberry
from strawberry.scalars import JSON
from strawberry.types import Info

from .bootstrap import bootstrap
from .utils import DatabaseInput


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def refresh(self, info: Info, database: DatabaseInput) -> JSON:
        proposal = database.proposal

        # Bootstrap
        model = await bootstrap(proposal)
        info.context["schema"].update(model.stype)

        metadata = {
            "rows": model.num_rows,
            "variables": model.variables,
            "timestamp": model.timestamp * 1000,  # deserialize to JS
        }
        return {"metadata": metadata}
