# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

# Baked into the bundle at build time; the defaults route through nginx on the
# same origin, so no absolute URL is needed for the standard compose setup.
ARG VITE_API_BASE_URL=/api
ARG VITE_SOCKET_URL=
ARG VITE_MAP_STYLE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SOCKET_URL=$VITE_SOCKET_URL \
    VITE_MAP_STYLE_URL=$VITE_MAP_STYLE_URL

RUN npm run build

FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache curl
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
