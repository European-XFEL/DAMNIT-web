# syntax=docker/dockerfile:1

# Base Stage
# Only for installing dependencies used by dev/prod stages
FROM node:22-alpine AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Development Stage
# Run dev server with hot reloading
FROM base AS dev

ENV NODE_ENV=development

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Static Build Stage
# Build static files for production
FROM base AS static

ENV NODE_ENV=production

COPY . .

RUN npm run build

# Production Stage
# Serve static files with nginx
FROM nginx:stable-alpine AS production

COPY --from=static /app/nginx /etc/nginx
COPY --from=static /app/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
