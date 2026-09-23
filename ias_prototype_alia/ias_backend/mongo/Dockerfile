# syntax=docker/dockerfile:1
# MongoDB for the Alia AUF750 prototype - a separate instance/volume from
# every other stack in this repo, pre-loaded with a first-boot init script
# that creates the least-privilege application user and the users index.
FROM mongo:7.0

COPY init/ /docker-entrypoint-initdb.d/

EXPOSE 27017

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD mongosh --quiet --eval "db.adminCommand('ping').ok" || exit 1
