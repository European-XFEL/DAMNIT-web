# syntax=docker/dockerfile:1

FROM node:25-alpine AS base
WORKDIR /usr/src/app
COPY package*.json package-lock.json ./
RUN npm ci

FROM base AS development
COPY ./ ./
CMD ["npm", "run", "dev"]

FROM base AS build
COPY ./ ./
RUN npm run build

FROM nginx:stable-alpine AS production
COPY --from=build /usr/src/app/nginx /etc/nginx
COPY --from=build /usr/src/app/dist /usr/share/nginx/html
