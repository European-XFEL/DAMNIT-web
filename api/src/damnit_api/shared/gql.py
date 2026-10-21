import asyncio
from dataclasses import dataclass, field

import numpy as np
import orjson
import strawberry
from strawberry.exceptions import ConnectionRejectionError
from strawberry.fastapi import BaseContext, GraphQLRouter
from strawberry.http import GraphQLHTTPResponse
from strawberry.schema.config import StrawberryConfig
from strawberry.subscriptions import GRAPHQL_TRANSPORT_WS_PROTOCOL

from .. import get_logger
from .. import graphql as gql_main
from .._db.dependencies import DBSession
from .._mymdc.dependencies import MyMdCClient
from ..auth import gql as auth
from ..auth.dependencies import OAuthUserInfo
from ..auth.models import User
from ..metadata import gql as metadata
from ..runs import types as run_types

logger = get_logger()

SUBSCRIPTION_PROTOCOLS = [
    GRAPHQL_TRANSPORT_WS_PROTOCOL,
]


@strawberry.type
class Query(auth.Query, gql_main.queries.Query, metadata.Query):
    pass


class Router(GraphQLRouter["Context", None]):
    def encode_json(self, data: GraphQLHTTPResponse) -> str | bytes:  # pyright: ignore[reportIncompatibleMethodOverride]
        encoded = orjson.dumps(
            data,
            default=lambda x: None if isinstance(x, float) and np.isnan(x) else x,
            option=orjson.OPT_SERIALIZE_NUMPY | orjson.OPT_NON_STR_KEYS,
        )

        # WebSocket protocol messages are strings
        if isinstance(data, dict) and "type" in data:
            return encoded.decode("utf-8")

        return encoded

    async def on_ws_connect(self, context):
        # A failed lookup here closes the handshake with 4403, which graphql-ws
        # retries; the same failure at subscribe time reads as a refusal.
        try:
            await context.get_user()
        except Exception as exc:
            logger.warning(
                "Could not resolve the user for live updates, rejecting the connection",
                error=repr(exc),
                exc_info=True,
            )
            raise ConnectionRejectionError from exc

        return await super().on_ws_connect(context)


class Schema(strawberry.Schema):
    pass


class Subscription(gql_main.subscriptions.Subscription):
    pass


@dataclass(slots=True)
class Context(BaseContext):
    mymdc: MyMdCClient
    oauth_user: OAuthUserInfo
    session: DBSession
    _user: User | None = None
    # One request can resolve many root fields at once (a preview aliases
    # `extracted_data` once per run), and they all share the session above.
    # SQLAlchemy forbids concurrent use of a single session, so the paths that
    # memoize below take this lock before touching it. Each memoized answer then
    # costs one serialization rather than one lookup per field.
    session_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    checked_proposals: set[str] = field(default_factory=set)

    async def get_user(self) -> User:
        """Resolve and memoize the full `User` for this request."""
        async with self.session_lock:
            if self._user is None:
                self._user = await User.from_oauth_user(
                    self.mymdc, self.session, self.oauth_user
                )
            return self._user


async def get_context(  # noqa: RUF029
    oauth_user: OAuthUserInfo, mymdc: MyMdCClient, session: DBSession
):
    return Context(oauth_user=oauth_user, mymdc=mymdc, session=session)


def get_gql_app():
    schema = Schema(
        query=Query,
        subscription=Subscription,
        types=[run_types.Cell],
        directives=[gql_main.directives.lightweight],
        config=StrawberryConfig(
            auto_camel_case=False,
            scalar_map=run_types.SCALAR_MAP,
        ),
    )

    return Router(
        schema=schema,
        subscription_protocols=SUBSCRIPTION_PROTOCOLS,
        context_getter=get_context,
    )
