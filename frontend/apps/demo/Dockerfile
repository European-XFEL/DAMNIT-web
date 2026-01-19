# -------------------------------------------------
# Globals
# -------------------------------------------------
ARG APP_DIR=apps/demo

# -------------------------------------------------
# Base: Node + pnpm + dependencies
# -------------------------------------------------
FROM node:24-alpine AS base
ARG APP_DIR

RUN corepack enable
WORKDIR /usr/src/app

# Prepare workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ${APP_DIR}/package.json ${APP_DIR}/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/

# Install workspace dependencies
RUN pnpm install --recursive --frozen-lockfile

# -------------------------------------------------
# Build: Create static web pages using Vite
# -------------------------------------------------
FROM base AS build
ARG APP_DIR

ARG SITE_URL
ENV VITE_SITE_URL=${SITE_URL}

ARG BASE_PATH
ENV VITE_BASE_URL=${BASE_PATH}

# Copy the rest of the codebase
COPY . .

WORKDIR /usr/src/app/${APP_DIR}
RUN pnpm build

# -------------------------------------------------
# Preview: Serve static web pages using Vite
# -------------------------------------------------
FROM base AS preview
ARG APP_DIR

ARG PREVIEW_PORT=4173
ENV PREVIEW_PORT=${PREVIEW_PORT}

ARG BASE_PATH
ENV VITE_BASE_URL=${BASE_PATH}

ARG API_URL
ENV VITE_API=${API_URL}

# Copy the rest of the codebase
COPY . .

# Copy built dist from build stage
COPY --from=build /usr/src/app/${APP_DIR}/dist /usr/src/app/${APP_DIR}/dist

# Start preview server
WORKDIR /usr/src/app/${APP_DIR}

EXPOSE ${PREVIEW_PORT}
CMD pnpm preview --host 0.0.0.0 --port "$PREVIEW_PORT"
