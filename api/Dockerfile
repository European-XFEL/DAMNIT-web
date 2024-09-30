# syntax=docker/dockerfile:1

# NOTE: bullseye instead of alpine as h5py not built for musl :(
FROM python:3.12-slim-bullseye

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV PYTHONOPTIMIZE 2

WORKDIR /src/damnit-web/api

RUN --mount=type=cache,target=/root/.cache \
  python3 -m pip install poetry

COPY ./pyproject.toml ./poetry.lock ./

RUN --mount=type=cache,target=/root/.cache \
  touch README.md && \
  poetry lock --no-update && \
  poetry install --no-root --no-directory --no-interaction --only main

COPY ./src ./src

RUN --mount=type=cache,target=/root/.cache \
  poetry install --no-interaction --only main

COPY ./README.md ./README.md

EXPOSE 8000

CMD ["poetry", "run", "uvicorn", "damnit_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
