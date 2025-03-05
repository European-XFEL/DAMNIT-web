# syntax=docker/dockerfile:1

# NOTE: bullseye instead of alpine as h5py not built for musl :(
FROM python:3.12-slim-bullseye

ENV PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1 \
  PYTHONOPTIMIZE=2

ENV POETRY_NO_INTERACTION=1 \
  POETRY_VIRTUALENVS_IN_PROJECT=1 \
  POETRY_VIRTUALENVS_CREATE=1

WORKDIR /src/damnit-web/api

RUN --mount=type=cache,target=/root/.cache \
  python3 -m pip install poetry

COPY ./pyproject.toml ./poetry.lock ./

RUN --mount=type=cache,target=/root/.cache \
  touch README.md && \
  poetry install --no-root --no-directory --only main

COPY ./src ./src

RUN --mount=type=cache,target=/root/.cache \
  poetry install --only main

COPY ./README.md ./README.md

EXPOSE 8000

CMD ["poetry", "run", "python3", "-m", "damnit_api.main"]
