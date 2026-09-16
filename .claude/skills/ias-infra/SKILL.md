---
name: ias-infra
description: Build, start, stop, and troubleshoot the Dockerized IAS stack (ias_infra/docker_compose.yaml) — mongodb, mqtt, backend, frontend containers. Use when the user wants to run the full stack in containers, reset data volumes, enable the simulator profile, or diagnose a service/port that won't come up.
---

# IAS infrastructure (`ias_infra/`)

Everything is orchestrated from `ias_infra/docker_compose.yaml`. Always run
compose commands from `ias_infra/` (or pass `-f ias_infra/docker_compose.yaml`
explicitly) — build contexts are relative to that file, pointing at
`../ias_backend`, `../ias_frontend`, and `../ias_simulate`.

## Services

| Service | Image build context | Purpose | Host ports |
|---|---|---|---|
| `ias_mongodb` | `ias_backend/mongo` | MongoDB 7 + first-boot init script (creates least-privilege app user + indexes) | `127.0.0.1:27017` (loopback only) |
| `ias_mqtt` | `ias_backend/mqtt` | Eclipse Mosquitto broker, password-file auth, MQTT + WebSocket listeners | `1883`, `9001` |
| `ias_backend` | `ias_backend` | REST/Socket.IO/MQTT-client/TCP ingest | `4000`, `5027` |
| `ias_frontend` | `ias_frontend` | nginx serving the built SPA, proxies `/api` + `/socket.io` | `8080` → 80 |
| `ias_simulator` (profile `simulator`) | `ias_simulate` | Standalone per-company water-level/telemetry simulator, off by default | — |

## Standard lifecycle

```bash
cd ias_infra
docker compose -f docker_compose.yaml up -d --build   # build + start everything
docker compose -f docker_compose.yaml ps                # check status/health
docker compose -f docker_compose.yaml logs -f ias_backend  # tail one service
docker compose -f docker_compose.yaml down               # stop, keep volumes/data
```

## Env file

`ias_infra/.env` (copy from `.env.example`) holds all credentials and ports.
Compose loads it automatically from the same directory — **never read or
print `.env`/`.env.local` contents** (denied by project settings); if a
value needs to change, ask the user to edit it, or use
`docker compose config` to see the *resolved* values without echoing the
raw file.

Changing `.env` only affects **new** containers — recreate, don't just
restart:
```bash
docker compose -f docker_compose.yaml up -d --force-recreate ias_backend
```

## Enabling the device simulator (synthetic telemetry, no hardware)

```bash
docker compose -f docker_compose.yaml --profile simulator up -d
```
Runs `ias_simulator` (built from `../ias_simulate`, its own standalone Node
package) alongside the stack — each company code in `SIM_COMPANIES` gets an
independent water-level/flow/quality profile that drifts toward its own
baseline and occasionally injects an anomaly. (For local, non-Docker
iteration instead: `cd ias_simulate && npm install && npm start` — see
`ias_simulate/.env.example` for every knob.)

## Resetting all data (destructive — confirm with the user first)

The Mongo/MQTT volumes persist credentials and seed data across restarts. If
`.env` credentials changed *after* the volumes were first created, the
backend will crash-loop with `MongoServerError: Authentication failed`
(Mongo only re-runs its init script — which creates the app user — on an
empty data directory). Fix:

```bash
docker compose -f docker_compose.yaml down -v   # removes ias_mongo_data, ias_mongo_config, ias_mqtt_data, ias_mqtt_log
docker compose -f docker_compose.yaml up -d
```
This wipes all seeded/demo data and reseeds from scratch on next boot. Only
do this after explicit confirmation — it is irreversible for anything not
seed-generated.

## Health checks

`docker compose ps` shows health status per service. The backend's own
health endpoint reports downstream connectivity too:
```bash
curl http://localhost:4000/api/health
# { "status": "ok", "mongo": {"connected": true}, "mqtt": {"connected": true}, "tcp": {...} }
```

## Troubleshooting a published port that won't respond

If a container shows `healthy` in `docker compose ps` but the **host**
port doesn't respond (e.g. a generic Go-style `404 page not found` instead
of nginx's response), it's likely a *host-level* port collision, not a bug
in the compose file — commonly another process (often something inside
WSL2, which forwards to Windows `127.0.0.1` via `wslrelay.exe` and can
shadow Docker Desktop's own forwarder). Diagnose without touching the
compose config:

```bash
docker exec ias_backend curl -s -o /dev/null -w "%{http_code}\n" http://ias_frontend/   # container-to-container, bypasses host networking
netstat -ano | grep ":<port>"   # (Windows) see what's really bound to that host port
```
If the container-to-container check succeeds, the fix is to pick a
different host port in `.env` (e.g. `FRONTEND_PORT=8090`) rather than
debugging the compose/nginx setup further.

## Key files

- `ias_infra/docker_compose.yaml` — service definitions, networks, volumes
- `ias_infra/.env.example` — every configurable variable, documented
- `ias_backend/Dockerfile`, `ias_backend/mongo/Dockerfile`, `ias_backend/mqtt/Dockerfile`
- `ias_backend/mongo/init/01-init-ias.js` — Mongo first-boot user/index setup
- `ias_backend/mqtt/config/mosquitto.conf`, `ias_backend/mqtt/entrypoint.sh` — broker config + password-file generation from env
- `ias_frontend/Dockerfile`, `ias_frontend/nginx.conf`
- `ias_simulate/Dockerfile`, `ias_simulate/src/simulator.js`, `ias_simulate/.env.example`
