# syntax=docker/dockerfile:1

FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /src/damnit-web/api

ENV \
  PYTHONOPTIMIZE=2 \
  UV_COMPILE_BYTECODE=1 \
  UV_LINK_MODE=copy \
  UV_CACHE_DIR=/opt/uv-cache/

# Install dependencies
RUN --mount=type=cache,target=/opt/uv-cache/ \
  --mount=type=bind,source=uv.lock,target=uv.lock \
  --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
  uv sync --locked --no-install-project

ADD pyproject.toml uv.lock README.md src ./

RUN --mount=type=cache,target=/opt/uv-cache/ \
  uv sync --locked

EXPOSE 8000

CMD ["uv", "run", "-m", "damnit_api.main"]
