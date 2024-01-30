from typing import List

import numpy as np
from sqlalchemy import Column, MetaData, Table, desc, select
import strawberry
from strawberry.scalars import JSON

from ..db import get_extracted_data, get_session
from .models import DamnitRun, DamnitType, get_model
from .utils import DatabaseInput


@strawberry.type
class Query:
    """
    Defines the GraphQL queries for the Damnit API.
    """

    @strawberry.field
    async def runs(
        self,
        database: DatabaseInput,
        page: int = 1,
        per_page: int = 10
    ) -> List[DamnitRun]:
        """
        Returns a list of Damnit runs, with pagination support.

        Args:
            page (int, optional): The page number to retrieve. Defaults to 1.
            per_page (int, optional): The number of runs per page. Defaults to 10.

        Returns:
            List[DamnitRun]: A list of Damnit runs.
        """
        proposal = database.proposal

        table_model = get_model(proposal)
        if table_model is None:
            raise RuntimeError(f"Table model for proposal {proposal} "
                               "is not found.")

        columns = [Column(variable) for variable in table_model.variables]
        table = Table("runs", MetaData(), *columns)
        async with get_session(proposal) as session:
            selection = (
                select(table).order_by("run")  # desc("run")
                .limit(per_page)
                .offset((page - 1) * per_page)
            )

            result = await session.execute(selection)
            if not result:
                raise ValueError()

            runs = [table_model.as_stype(**res)
                    for res in result.mappings().all()]  # type: ignore

        # REMOVEME: Replace scalar to array from run data
        for variable, properties in table_model.schema.items():
            if properties['dtype'] == DamnitType.ARRAY.value:
                for run in runs:
                    array = get_extracted_data(proposal, run.run, variable)
                    setattr(run, variable, array.tolist())

        return runs

    @strawberry.field
    def metadata(self, database: DatabaseInput) -> JSON:
        model = get_model(database.proposal)
        return {
            "schema": model.schema,
            "rows": model.num_rows,
            "timestamp": model.timestamp * 1000,  # deserialize to JS
        }

    @strawberry.field
    def extracted_data(database: DatabaseInput, run: int, variable: str) -> JSON:
        dataset = get_extracted_data(database.proposal, run, variable)
        array_name = next(iter(dataset))
        coords = [name for name in dataset.keys() if name != array_name]
        array_dtypes = {
            1: DamnitType.ARRAY,
            2: DamnitType.IMAGE,
            3: DamnitType.RGBA,
        }

        return {
            'data': {key: data.tolist() for key, data in dataset.items()},
            'metadata': {
                'name': array_name,
                'coords': coords,
                'dtype': array_dtypes[dataset[array_name].ndim].value
            }
        }
