# syntax=docker/dockerfile:1
# No dependencies (uses Node's built-in fetch) - a single stage is enough.
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache tini

COPY package.json ./
COPY src ./src

RUN addgroup -S sim && adduser -S sim -G sim && chown -R sim:sim /app
USER sim

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
