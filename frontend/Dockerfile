# syntax=docker/dockerfile:1

ARG NODE_VERSION=21

FROM node:${NODE_VERSION}

ENV NODE_ENV development

WORKDIR /src/damnit-web/frontend

RUN corepack enable

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

CMD npm start
