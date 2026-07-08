import numpy as np
import orjson
import strawberry
from strawberry.http import GraphQLHTTPResponse
from strawberry.litestar import BaseContext, make_graphql_controller
from strawberry.schema.config import StrawberryConfig
from strawberry.subscriptions import GRAPHQL_TRANSPORT_WS_PROTOCOL

from .. import graphql as gql_main
from .._db.dependencies import DBSession
from .._mymdc.dependencies import MyMdCClient
from ..auth import gql as auth
from ..auth.dependencies import OAuthUserInfo
from ..auth.models import User
from ..graphql.dependencies import SubscriptionCursorsDep
from ..metadata import gql as metadata
from ..runs import types as run_types
from ..runs.dependencies import Repositories

SUBSCRIPTION_PROTOCOLS = [
    GRAPHQL_TRANSPORT_WS_PROTOCOL,
]


@strawberry.type
class Query(auth.Query, gql_main.queries.Query, metadata.Query):
    pass


class Schema(strawberry.Schema):
    pass


class Subscription(gql_main.subscriptions.Subscription):
    pass


class Context(BaseContext):
    mymdc: MyMdCClient
    oauth_user: OAuthUserInfo
    session: DBSession
    repositories: Repositories
    subscription_cursors: SubscriptionCursorsDep
    _user: User | None = None

    async def get_user(self) -> User:
        """Resolve and memoize the full `User` for this request."""
        if self._user is None:
            self._user = await User.from_oauth_user(
                self.mymdc, self.session, self.oauth_user
            )
        return self._user


async def get_context(  # noqa: RUF029
    oauth_user: OAuthUserInfo,
    mymdc: MyMdCClient,
    session: DBSession,
    repositories: Repositories,
    subscription_cursors: SubscriptionCursorsDep,
) -> Context:
    return Context(
        oauth_user=oauth_user,
        mymdc=mymdc,
        session=session,
        repositories=repositories,
        subscription_cursors=subscription_cursors,
    )


def get_gql_controller() -> type:
    schema = Schema(
        query=Query,
        subscription=Subscription,
        types=[run_types.DamnitVariable],
        directives=[gql_main.directives.lightweight],
        config=StrawberryConfig(
            auto_camel_case=False,
            scalar_map=run_types.SCALAR_MAP,
        ),
    )

    base_controller = make_graphql_controller(
        schema=schema,
        path="/graphql",
        context_getter=get_context,
        subscription_protocols=tuple(SUBSCRIPTION_PROTOCOLS),
    )

    class GraphQLController(base_controller):  # ty: ignore[unsupported-base]
        def encode_json(self, data: GraphQLHTTPResponse) -> str | bytes:  # type: ignore[override]
            encoded = orjson.dumps(
                data,
                default=lambda x: None if isinstance(x, float) and np.isnan(x) else x,
                option=orjson.OPT_SERIALIZE_NUMPY | orjson.OPT_NON_STR_KEYS,
            )
            # WebSocket protocol messages are strings
            if isinstance(data, dict) and "type" in data:
                return encoded.decode("utf-8")
            return encoded

    return GraphQLController
