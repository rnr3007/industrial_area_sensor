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
  port: int(process.env.PORT, 4100),

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4546')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  },

  mqtt: {
    url: process.env.MQTT_URL || 'mqtt://127.0.0.1:1884',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
    clientId: process.env.MQTT_CLIENT_ID || `ias-proto-backend-${Math.random().toString(16).slice(2, 8)}`,
    // <baseTopic>/{telemetry,log,status,cmd}
    baseTopic: process.env.MQTT_BASE_TOPIC || 'rubberdam'
  },

  // How many recent activity-log lines to keep in memory for late-joining clients.
  logHistorySize: int(process.env.LOG_HISTORY_SIZE, 200),

  // A dedicated MongoDB instance - separate database/volume/credentials from
  // the main IAS platform's Mongo, so the two stacks never share data.
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27018/rubberdam',

  jwt: {
    secret: process.env.JWT_SECRET || 'iasproto-dev-secret-change-me',
    // Session token handed out after either login flow succeeds.
    sessionTtl: process.env.JWT_SESSION_TTL || '30m',
    // Much shorter-lived: the magic-link URL itself, single-use.
    magicLinkTtl: process.env.JWT_MAGIC_LINK_TTL || '10m'
  },

  // Used to build the clickable link embedded in the magic-link email.
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:4546',

  smtp: {
    // Set to "gmail" to use nodemailer's built-in Gmail preset (recommended -
    // it gets host/port/TLS right automatically). Requires SMTP_USER to be a
    // full @gmail.com address and SMTP_PASSWORD to be a 16-character Google
    // "app password" (myaccount.google.com/apppasswords), NOT the normal
    // account password - Gmail rejects plain-password SMTP login outright.
    service: process.env.SMTP_SERVICE || '',
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'IAS Rubber Dam <no-reply@ias.local>'
  },

  seed: {
    enabled: bool(process.env.SEED_ON_BOOT, true),
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@rubberdam.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin#12345',
    adminName: process.env.SEED_ADMIN_NAME || 'Administrator'
  }
};

export default config;
