export const METRIC_META = {
  waterLevelM: { label: 'Water level', unit: 'm', digits: 2 },
  flowRateM3h: { label: 'Flow rate', unit: 'm³/h', digits: 1 },
  ph: { label: 'pH', unit: '', digits: 2 },
  turbidityNtu: { label: 'Turbidity', unit: 'NTU', digits: 1 },
  tdsPpm: { label: 'TDS', unit: 'ppm', digits: 0 },
  temperatureC: { label: 'Temperature', unit: '°C', digits: 1 }
};

export const METRIC_COLORS = {
  waterLevelM: '#4c8ef5',
  flowRateM3h: '#4fc97a',
  ph: '#a371f7',
  turbidityNtu: '#dba53f',
  tdsPpm: '#f778ba',
  temperatureC: '#ef5b4e'
};

/**
 * Hex mirrors of the OKLCH tokens in styles.css, for contexts that can't
 * consume CSS custom properties directly (Chart.js canvas rendering,
 * MapLibre style specs, inline popup HTML). Keep in sync with design.md.
 */
export const CHART_THEME = {
  paper2: '#171b23',
  paper3: '#1c212a',
  rule: '#262c37',
  rule2: '#313847',
  ink: '#e7eaf0',
  ink2: '#b8c0cc',
  muted: '#7c8697',
  accent: '#4c8ef5',
  ok: '#4fc97a',
  warning: '#dba53f',
  critical: '#ef5b4e'
};

export function num(value, digits = 2, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function metric(key, value) {
  const meta = METRIC_META[key];
  if (!meta) return num(value);
  const formatted = num(value, meta.digits);
  return meta.unit && formatted !== '—' ? `${formatted} ${meta.unit}` : formatted;
}

export function dateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export function timeOnly(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

export function relativeTime(value) {
  if (!value) return 'never';
  const diff = Date.now() - new Date(value).getTime();
  const seconds = Math.round(diff / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Local datetime string accepted by <input type="datetime-local">. */
export function toLocalInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/**
 * Colour band for a reading against the company thresholds.
 * Returns 'normal' | 'warning' | 'critical' | 'unknown'.
 */
export function metricStatus(key, value, thresholds = {}) {
  if (value === null || value === undefined) return 'unknown';

  const bounds = {
    waterLevelM: [thresholds.waterLevelMin, thresholds.waterLevelMax],
    flowRateM3h: [null, thresholds.flowRateMax],
    ph: [thresholds.phMin, thresholds.phMax],
    turbidityNtu: [null, thresholds.turbidityMax],
    tdsPpm: [null, thresholds.tdsMax],
    temperatureC: [null, thresholds.temperatureMax]
  }[key];

  if (!bounds) return 'normal';
  const [min, max] = bounds;

  if (max != null && value > max) return value > max * 1.2 ? 'critical' : 'warning';
  if (min != null && value < min) return value < min * 0.8 ? 'critical' : 'warning';

  // Within 10% of a limit: worth showing amber before it trips.
  if (max != null && value > max * 0.9) return 'warning';
  if (min != null && min > 0 && value < min * 1.1) return 'warning';

  return 'normal';
}
