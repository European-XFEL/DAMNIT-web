# -------------------------------------------------
# Base: Node + pnpm + dependencies
# -------------------------------------------------
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /usr/src/app

# Prepare workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/app/package.json apps/app/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/

# Install workspace dependencies
RUN pnpm install --recursive --frozen-lockfile

# -------------------------------------------------
# Build: Create static web pages using Vite
# -------------------------------------------------
FROM base AS build

# Copy the rest of the codebase
COPY . .

WORKDIR /usr/src/app/apps/app
RUN pnpm build

# -------------------------------------------------
# Preview: Serve static web pages using Vite
# -------------------------------------------------
FROM base AS preview

# Copy the rest of the codebase
COPY . .

# Copy built dist from build stage
COPY --from=build /usr/src/app/apps/app/dist /usr/src/app/apps/app/dist

WORKDIR /usr/src/app/apps/app

EXPOSE 4173
CMD ["pnpm", "preview", "--host", "0.0.0.0", "--port", "4173"]

# -------------------------------------------------
# Production: Serve static web pages using Nginx
# -------------------------------------------------
FROM nginx:stable-alpine AS production

COPY --from=build /usr/src/app/apps/app/nginx /etc/nginx
COPY --from=build /usr/src/app/apps/app/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
