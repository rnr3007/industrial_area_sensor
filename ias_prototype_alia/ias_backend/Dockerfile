# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache tini curl su-exec

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY entrypoint.sh /app/entrypoint.sh

RUN addgroup -S alia && adduser -S alia -G alia \
  && mkdir -p /app/logs && chown -R alia:alia /app \
  && sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh
# Stays root here on purpose - entrypoint.sh fixes bind-mount ownership
# then drops to the "alia" user itself before exec'ing the app.

EXPOSE 4110

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS http://127.0.0.1:4110/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
CMD ["node", "src/index.js"]
