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

    model.runs = await db.async_column(proposal, table="run_info", name="run") or []

    return model
