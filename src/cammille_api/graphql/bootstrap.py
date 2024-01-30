from typing import Any

from sqlalchemy import select, desc

from .. import db, utils
from . import models


async def get_dtypes(proposal_number: str = db.DEFAULT_PROPOSAL) -> dict[str, models.DamnitType]:
    """Loads a DAMNIT database and finds the types of data contained in its columns.
    Returns a dictionary of column names and their corresponding types.

    Args:
        proposal_number (str): The proposal number for the DAMNIT database.

    Returns:
        dict[str, DamnitType]: A dictionary of column names and their corresponding types.
    """
    table = await db.async_table(proposal_number)

    known_dtypes = models.DamnitRun.known_dtypes()
    dtypes: dict[str, models.DamnitType] = {}
    async with db.get_session(proposal_number) as session:
        order_with = desc("added_at")

        for name, column in table.columns.items():
            query = (select(column)
                     .order_by(order_with)
                     .where(column.is_not(None))
                     .limit(1))
            result = await session.execute(query)

            value = result.first()
            if value:
                value: Any = value[0]

            dtypes[name] = known_dtypes.get(name, utils.map_dtype(type(value)))

    return dtypes


async def bootstrap(proposal=db.DEFAULT_PROPOSAL):
    """Sets up the DAMNIT model by adding annotations to its class definition and
    converting it to a Strawberry type. This function should only be called once.

    Raises:
        RuntimeError: If setup is called more than once.
    """

    model = models.get_model(proposal)
    model.update(dtypes=await get_dtypes(proposal))

    num_rows = await db.async_count(proposal, table='run_info')
    model.num_rows = num_rows or 0

    return model
