import dotenv from 'dotenv';

dotenv.config();

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value, fallback) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 4000),

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ias',

  jwt: {
    secret: process.env.JWT_SECRET || 'ias-dev-secret-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL || '12h',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d'
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8080')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  },

  mqtt: {
    url: process.env.MQTT_URL || 'mqtt://127.0.0.1:1883',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
    clientId: process.env.MQTT_CLIENT_ID || `ias-web-service-${Math.random().toString(16).slice(2, 8)}`,
    // ias/<companyCode>/<deviceId>/<channel>
    baseTopic: process.env.MQTT_BASE_TOPIC || 'ias'
  },

  tcp: {
    enabled: bool(process.env.TCP_ENABLED, true),
    port: int(process.env.TCP_PORT, 5027)
  },

  seed: {
    enabled: bool(process.env.SEED_ON_BOOT, true),
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@ias.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin#12345'
  },

  retention: {
    // seconds; snapshots are bulky so they expire automatically
    snapshotTtl: int(process.env.SNAPSHOT_TTL_SECONDS, 60 * 60 * 6)
  }
};

export default config;
