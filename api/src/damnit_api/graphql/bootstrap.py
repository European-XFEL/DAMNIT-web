from .. import db
from . import models


async def bootstrap(proposal=db.DEFAULT_PROPOSAL):
    """Sets up the DAMNIT model by adding annotations to its class definition and
    converting it to a Strawberry type. This function should only be called once.

    Raises:
        RuntimeError: If setup is called more than once.
    """

    model = models.get_model(proposal)

    variables = await db.async_variables(proposal)
    model.update(variables)

    num_rows = await db.async_count(proposal, table="run_info")
    model.num_rows = num_rows or 0

    return model
