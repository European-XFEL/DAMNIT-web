#!/bin/env sh

# Fetch latest spec
pnpm --package=@redocly/cli dlx -- redocly \
    bundle \
    https://in.xfel.eu/metadata/api-docs/v1/swagger.yaml \
    -o openapi.yaml

# Create slimmed down version with only relevant schemas
pnpm --package=@redocly/cli dlx -- redocly \
    bundle \
    wrapper.yaml \
    -o openapi.slim.yaml \
    --dereferenced

# Generate models
datamodel-codegen \
    --input openapi.slim.yaml \
    --input-file-type openapi \
    --output-model-type pydantic_v2.BaseModel \
    --formatters ruff-format \
    --use-annotated \
    --use-union-operator \
    --use-standard-collections \
    --reuse-model \
    --target-python-version 3.13 \
    --output models.py

# Second pass to format with ruff
uv run ruff format models.py
uv run ruff check --fix models.py
