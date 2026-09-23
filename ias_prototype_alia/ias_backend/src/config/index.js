import dotenv from 'dotenv';

dotenv.config();

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const float = (value, fallback) => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value, fallback) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 4110),

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:4560,http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  },

  // The ESP32 pushes readings to us (POST /data) rather than us polling it -
  // it's typically on a LAN behind NAT and can always reach out, but can't
  // easily be reached from outside. No MQTT involved anywhere in this stack.
  device: {
    // Shared secret the firmware sends as the X-Device-Key header. Any
    // request to /data without a matching key is rejected.
    apiKey: process.env.DEVICE_API_KEY || 'change-me-device-key',
    // If no reading arrives within this window, the link is considered down
    // (the device went offline, lost WiFi, etc.) - there's no "poll failed"
    // signal anymore since we're not the one initiating requests.
    linkTimeoutMs: int(process.env.LINK_TIMEOUT_MS, 5000)
  },

  logHistorySize: int(process.env.LOG_HISTORY_SIZE, 200),

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27019/alia',

  jwt: {
    secret: process.env.JWT_SECRET || 'aliaproto-dev-secret-change-me',
    sessionTtl: process.env.JWT_SESSION_TTL || '30m',
    magicLinkTtl: process.env.JWT_MAGIC_LINK_TTL || '10m'
  },

  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:4560',

  smtp: {
    // Set to "gmail" to use nodemailer's built-in Gmail preset. SMTP_PASSWORD
    // must be a Google "app password" (myaccount.google.com/apppasswords),
    // not the account password.
    service: process.env.SMTP_SERVICE || '',
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'Alia AUF750 Monitoring <no-reply@ias.local>'
  },

  seed: {
    enabled: bool(process.env.SEED_ON_BOOT, true),
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@alia.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin#12345',
    adminName: process.env.SEED_ADMIN_NAME || 'Administrator'
  },

  // Flow-rate interpolation window, matching the AUF750 controller's M55/M56
  // configuration on the real firmware - used only for the /data readout
  // status thresholds (idle/over-range), not for any conversion here (the
  // device itself already returns flowRate in m3/h).
  flow: {
    idleBelowMa: float(process.env.FLOW_IDLE_BELOW_MA, 3.5),
    overAboveMa: float(process.env.FLOW_OVER_ABOVE_MA, 21.0)
  }
};

export default config;
