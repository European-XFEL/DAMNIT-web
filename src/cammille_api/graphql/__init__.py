from fastapi import FastAPI

from . import router


def add_graphql_router(app: FastAPI):
    """
    Adds a GraphQL router to the provided FastAPI instance.

    Parameters:
        app (FastAPI): The FastAPI instance to add the GraphQL router to.
    """

    app.include_router(router.Router(), prefix="/graphql")
