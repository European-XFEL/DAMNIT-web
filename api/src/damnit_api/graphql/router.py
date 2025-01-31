import numpy as np
import orjson
from strawberry.fastapi import GraphQLRouter
from strawberry.http import GraphQLHTTPResponse
from strawberry.subscriptions import GRAPHQL_TRANSPORT_WS_PROTOCOL

from ..utils import Singleton
from .schema import Schema

SUBSCRIPTION_PROTOCOLS = [
    GRAPHQL_TRANSPORT_WS_PROTOCOL,
]


class Router(GraphQLRouter, metaclass=Singleton):
    def __init__(self):
        super().__init__(
            schema=Schema(),
            context_getter=get_context,
            subscription_protocols=SUBSCRIPTION_PROTOCOLS,
        )

    def encode_json(self, data: GraphQLHTTPResponse) -> bytes:
        return orjson.dumps(
            data,
            default=lambda x: None
            if isinstance(x, float) and np.isnan(x)
            else x,
            option=orjson.OPT_SERIALIZE_NUMPY,
        )


async def get_context():  # noqa: RUF029
    return {
        "schema": Router().schema,
    }
