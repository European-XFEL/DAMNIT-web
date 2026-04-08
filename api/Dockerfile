# syntax=docker/dockerfile:1

FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /src/damnit-web

ENV \
  PYTHONOPTIMIZE=2 \
  UV_COMPILE_BYTECODE=1 \
  UV_LINK_MODE=copy \
  UV_CACHE_DIR=/opt/uv-cache/

# Copy workspace root + API project metadata for dependency install
COPY pyproject.toml uv.lock ./
COPY api/pyproject.toml api/

RUN --mount=type=cache,target=/opt/uv-cache/ \
  uv sync --locked --package damnit-api --no-install-project

# Copy only the files needed to install the project
COPY api/README.md api/
COPY api/src/ api/src/

RUN --mount=type=cache,target=/opt/uv-cache/ \
  uv sync --locked --package damnit-api

EXPOSE 8443

WORKDIR /src/damnit-web/api
CMD ["uv", "run", "-m", "damnit_api.main"]
