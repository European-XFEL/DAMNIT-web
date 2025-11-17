import numpy as np
import orjson
import strawberry
from fastapi import Depends
from strawberry.fastapi import GraphQLRouter
from strawberry.http import GraphQLHTTPResponse
from strawberry.schema.config import StrawberryConfig
from strawberry.subscriptions import GRAPHQL_TRANSPORT_WS_PROTOCOL

from .. import graphql as gql_main
from ..auth import gql as auth
from ..instance import gql as instance
from ..metadata import routers_gql as metadata

SUBSCRIPTION_PROTOCOLS = [
    GRAPHQL_TRANSPORT_WS_PROTOCOL,
]


@strawberry.type
class Query(auth.Query, gql_main.queries.Query, instance.Query):
    pass


class Context(metadata.Context):
    """Per-request context for the main GraphQL API.

    Note that this includes `auth.Context` via `metadata.Context`."""


class Mutation(gql_main.mutations.Mutation):
    pass


class Router(GraphQLRouter):
    def encode_json(  # FIX: # pyright: ignore[reportIncompatibleMethodOverride]
        self, data: GraphQLHTTPResponse
    ) -> bytes:
        return orjson.dumps(
            data,
            default=lambda x: None if isinstance(x, float) and np.isnan(x) else x,
            option=orjson.OPT_SERIALIZE_NUMPY | orjson.OPT_NON_STR_KEYS,
        )


class Schema(gql_main.schema.Schema):
    pass


class Subscription(gql_main.subscriptions.Subscription):
    pass


def custom_context_dependency() -> Context:
    return Context()


async def get_context(custom_context=Depends(custom_context_dependency)):
    return custom_context


def get_gql_app():
    schema = Schema(
        query=Query,
        mutation=Mutation,
        subscription=Subscription,
        types=[gql_main.models.DamnitVariable, instance.ListenerStatus],
        directives=[gql_main.directives.lightweight],
        config=StrawberryConfig(auto_camel_case=False),
    )

    return Router(
        schema=schema,
        subscription_protocols=SUBSCRIPTION_PROTOCOLS,
        context_getter=get_context,
    )
