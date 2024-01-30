from strawberry.fastapi import GraphQLRouter
from strawberry.subscriptions import (
    GRAPHQL_TRANSPORT_WS_PROTOCOL)

from .schema import Schema
from ..utils import Singleton


SUBSCRIPTION_PROTOCOLS = [
    GRAPHQL_TRANSPORT_WS_PROTOCOL,
]


class Router(GraphQLRouter, metaclass=Singleton):

    def __init__(self):
        super().__init__(schema=Schema(),
                         context_getter=get_context,
                         subscription_protocols=SUBSCRIPTION_PROTOCOLS)


async def get_context():
    return {
        "schema": Router().schema,
    }
