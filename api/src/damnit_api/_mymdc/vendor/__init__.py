"""Models generated from the OpenAPI specification for MyMDC.

This is done by:

1. Fetching the OpenAPI spec from MyMDC using `redocly`.
2. Filtering the spec to only include models we're interested in by using a wrapper spec
  and `redocly bundle`.
3. Generating pydantic models using `datamodel-codegen`.

Running `generate.sh` will regenerate these models.

To add new models, update the wrapper spec in `wrapper.yaml` by adding in additional
schemas.
"""
