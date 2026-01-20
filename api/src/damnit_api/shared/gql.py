from dataclasses import dataclass

import numpy as np
import orjson
import strawberry
from strawberry.fastapi import BaseContext, GraphQLRouter
from strawberry.http import GraphQLHTTPResponse
from strawberry.schema.config import StrawberryConfig
from strawberry.subscriptions import GRAPHQL_TRANSPORT_WS_PROTOCOL

from .. import graphql as gql_main
from .._db.dependencies import DBSession
from .._mymdc.dependencies import MyMdCClient
from ..auth import gql as auth
from ..auth.dependencies import OAuthUserInfo
from ..metadata import gql as metadata

SUBSCRIPTION_PROTOCOLS = [
    GRAPHQL_TRANSPORT_WS_PROTOCOL,
]


@strawberry.type
class Query(auth.Query, gql_main.queries.Query, metadata.Query):
    pass


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


@dataclass(slots=True)
class Context(BaseContext):
    mymdc: MyMdCClient
    oauth_user: OAuthUserInfo
    session: DBSession


async def get_context(  # noqa: RUF029
    oauth_user: OAuthUserInfo, mymdc: MyMdCClient, session: DBSession
):
    return Context(oauth_user=oauth_user, mymdc=mymdc, session=session)


def get_gql_app():
    schema = Schema(
        query=Query,
        mutation=Mutation,
        subscription=Subscription,
        types=[gql_main.models.DamnitVariable],
        directives=[gql_main.directives.lightweight],
        config=StrawberryConfig(auto_camel_case=False),
    )

    return Router(
        schema=schema,
        subscription_protocols=SUBSCRIPTION_PROTOCOLS,
        context_getter=get_context,  # pyright: ignore[reportArgumentType]
    )
