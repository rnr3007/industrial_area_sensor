#!/bin/sh
# The container starts as root so this can fix ownership of the bind-mounted
# logs/ directory before dropping to the unprivileged app user. Needed
# because a bind mount takes on whatever UID/GID owns it on the HOST - on
# Linux that's the real deploying user (commonly UID 1000), which almost
# never matches the "alia" user's UID baked into the image at build time.
# (This is invisible on Windows/Docker Desktop, which doesn't enforce Unix
# UID permissions on bind mounts the same way - hence "works on my machine".)
set -e

mkdir -p /app/logs
chown -R alia:alia /app/logs

exec su-exec alia "$@"
