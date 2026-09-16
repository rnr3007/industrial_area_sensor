---
name: ias-backend
description: Work on the IAS backend (ias_prototype_origin/ias_backend/) — REST API, MQTT/TCP ingest, anomaly detection, auth, reports. Use for running it locally, understanding its structure, or adding/changing server-side behavior including new telemetry metrics. This is the original/main IAS platform, unrelated to the ias_prototype/ Rubber Dam stack.
---

# IAS backend (`ias_prototype_origin/ias_backend/`)

Node/Express REST API + Socket.IO gateway + MQTT client + raw TCP
DualCam/FMC125 ingest service, backed by MongoDB.

## Structure

- `src/index.js` — entry point: connects DB, seeds, starts HTTP/Socket.IO/MQTT/TCP, offline-device sweep.
- `src/app.js` — Express app assembly (middleware, routes, error handler).
- `src/config/` — env config (`index.js`) and DB connection (`db.js`).
- `src/models/` — Mongoose schemas: `User`, `Company`, `Device`, `Reading`, `Alert`, `AuditLog`, `Snapshot`.
- `src/routes/*.routes.js` — one file per resource, mounted under `/api` in `routes/index.js`.
- `src/middleware/` — `auth.js` (JWT), `audit.js` (audit-trail logging), `validate.js` (zod), `error.js`.
- `src/services/` — the interesting logic:
  - `ingest.service.js` — normalizes raw device payloads, upserts `Device`, stores `Reading`/`Snapshot`, triggers anomaly eval, fans out over Socket.IO.
  - `mqtt.service.js` — subscribes `ias/+/+/{telemetry,snapshot,status}`, publishes downlink commands.
  - `tcp.service.js` — newline-delimited JSON socket server for DualCam/FMC125, optional CRC16 check.
  - `anomaly.service.js` — threshold + rate-of-change + geofence + battery + offline-device rules, raises `Alert` docs, dedupes, emits `alert:new`.
  - `realtime.service.js` — Socket.IO room management (per-company subscriptions + a global room for alerts).
  - `report.service.js` — aggregates `Reading`s into PDF (pdfkit) and Excel (exceljs) exports.
- `src/utils/seed.js` — idempotent demo data (admin/operator/viewer users, 4 companies, 8 devices).

The device simulator is a separate service, not part of this package — see
`ias_simulate/` (its own `SKILL.md`-less directory, documented below and in
the `ias-infra` skill).

## Running locally (hot-reload, no container rebuild)

Mongo + MQTT are the only things that need Docker; the backend itself runs
natively for fast iteration:

```bash
cd ias_prototype_origin/ias_infra && docker compose -f docker_compose.yaml up -d ias_mongodb ias_mqtt
cd ../ias_backend
npm install        # first time only
npm run dev        # node --watch, hot-reloads on save
```

Listens on `:4000` (REST + Socket.IO) and `:5027` (TCP). Point `.env`
(copy from `.env.example`) at `MONGO_URI=mongodb://ias_app:<password>@127.0.0.1:27017/ias?authSource=ias`
and `MQTT_URL=mqtt://127.0.0.1:1883` — both are published to localhost by
compose. **Never read/print `.env`/`.env.local`** (denied by project
settings) — only `.env.example`; ask the user for values if needed.

`SEED_ON_BOOT=true` (default) seeds demo data idempotently on every boot.
Re-seed on demand without restarting: `npm run seed`.

## Generating live telemetry without hardware

The simulator now lives in its own package, `ias_simulate/` (a sibling of
`ias_backend/` under `ias_prototype_origin/`):

```bash
cd ../ias_simulate
npm install        # first time only
npm start
```
Publishes telemetry + snapshot frames over MQTT — one independent
water-level/flow/quality profile per company (`SIM_COMPANIES=PTAJ,PTBKN,PTSLP,PTHPS`
by default) — with occasional injected anomalies to exercise the alert
pipeline. See `ias_simulate/src/simulator.js`'s header comment for all env
knobs, or the `ias-infra` skill for running it as a Docker profile.

## Verifying changes

- Syntax check without running anything: `node --check <file>` (no DB/MQTT needed).
- No test suite exists yet — verify via the running API: login
  (`POST /api/auth/login`, seeded admin is `admin@ias.local` /
  `SEED_ADMIN_PASSWORD`, default `Admin#12345`), then exercise the relevant
  endpoint with the returned JWT.
- `GET /api/health` reports Mongo/MQTT/TCP connectivity in one call — check
  this first when something seems broken.

## Adding a new telemetry metric (backend side)

1. **`src/models/Reading.js`** — add the field to the schema, add it to the
   `METRICS` array (drives automatic avg/min/max aggregation everywhere),
   add a `METRIC_LABELS` entry (`{ label, unit }`).
2. **`src/services/ingest.service.js`**, `normalizeTelemetry()` — accept the
   canonical name plus any short device-side alias. This function is
   shared by MQTT, TCP, and the `/api/telemetry/ingest` HTTP fallback, so
   one change covers all ingest paths.
3. **Thresholds/alerting (optional)** — add min/max fields to
   `thresholdSchema` in `src/models/Company.js`, then add a rule to the
   `RULES` array in `src/services/anomaly.service.js` (`{ metric, limit,
   direction }`). `evaluateReading()` handles severity, dedup, persistence,
   and Socket.IO emission automatically.
4. **Reports** — `report.service.js` iterates `METRICS` automatically; no
   change needed unless the metric needs custom formatting.
5. **Simulator (optional)** — add the field to `step()`'s returned payload
   in `ias_simulate/src/simulator.js` with a believable base value + drift,
   so local testing exercises it.

See the `ias-frontend` skill for surfacing the new metric in the UI.
