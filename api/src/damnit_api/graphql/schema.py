import strawberry
from graphql import GraphQLNamedType, GraphQLNonNull
from graphql.type.schema import InterfaceImplementations, remap_named_type
from strawberry.annotation import StrawberryAnnotation
from strawberry.schema.config import StrawberryConfig
from strawberry.types import has_object_definition

from . import directives, models, mutations, queries, subscriptions


class Schema(strawberry.Schema):
    def __init__(self):
        super().__init__(
            query=queries.Query,
            mutation=mutations.Mutation,
            subscription=subscriptions.Subscription,
            types=[models.DamnitVariable],
            directives=[directives.lightweight],
            config=StrawberryConfig(auto_camel_case=False),
        )

    def update(self, *types):
        graphql_schema = self._schema
        type_map = graphql_schema.type_map

        interface = self._get_stype_name(models.DamnitRun)
        implementations_map = graphql_schema._implementations_map
        implementations = implementations_map.get(interface)
        if implementations is None:
            implementations = InterfaceImplementations(objects=[], interfaces=[])
            implementations_map[interface] = implementations

        # Invalidate the subtypes
        graphql_schema._sub_type_map.pop(interface, None)

        # Update the implementations objects
        for type_ in types:
            name = self._get_stype_name(type_)

            # Remove the current value from the type maps
            gtype = type_map.pop(name, None)
            if gtype in implementations.objects:
                implementations.objects.remove(
                    gtype  # FIX: # pyright: ignore[reportArgumentType]
                )
            self.schema_converter.type_map.pop(name, None)

            # Replace with the new GraphQL type
            gtype = self._get_graphql_type(type_)
            type_map[name] = gtype
            remap_named_type(gtype, type_map)
            implementations.objects.append(
                gtype  # FIX: # pyright: ignore[reportArgumentType]
            )

    def _get_graphql_type(self, type_):
        """Lifted from strawberry.Schema.__init__"""
        if (
            has_object_definition(type_)
            and type_.__strawberry_definition__.is_generic  # FIX: # pyright: ignore[reportAttributeAccessIssue]  # noqa: E501
        ):
            type_ = StrawberryAnnotation(type_).resolve()
        graphql_type = self.schema_converter.from_maybe_optional(type_)
        if isinstance(graphql_type, GraphQLNonNull):
            graphql_type = graphql_type.of_type
        if not isinstance(graphql_type, GraphQLNamedType):
            msg = f"{graphql_type} is not a named GraphQL Type"
            raise TypeError(msg)

        return graphql_type

    def _get_stype_name(self, type_):
        name_converter = self.schema_converter.config.name_converter
        return name_converter.from_type(type_.__strawberry_definition__)
