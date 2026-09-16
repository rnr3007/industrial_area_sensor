<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeSeriesScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';
import api from '@/api/client';
import { CHART_THEME, METRIC_COLORS, metric, metricStatus, num, timeOnly } from '@/utils/format';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeSeriesScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
);

const props = defineProps({
  company: { type: Object, default: null },
  latest: { type: Object, default: null }
});

const RANGES = [
  { key: '6h', label: '6H', hours: 6 },
  { key: '24h', label: '24H', hours: 24 },
  { key: '7d', label: '7D', hours: 24 * 7 },
  { key: '30d', label: '30D', hours: 24 * 30 }
];

const canvas = ref(null);
const chart = shallowRef(null);
const range = ref('24h');
const loading = ref(false);
const points = ref([]);

const thresholds = computed(() => props.company?.thresholds || {});

const level = computed(() => props.latest?.waterLevelM ?? null);
const levelStatus = computed(() => metricStatus('waterLevelM', level.value, thresholds.value));

// Number-tick: live values count into place over 400ms rather than jump-cutting.
const tickedLevel = ref(level.value);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let tickFrame = null;

watch(level, (next, prev) => {
  if (next == null) {
    tickedLevel.value = null;
    return;
  }
  if (prev == null || reduceMotion) {
    tickedLevel.value = next;
    return;
  }
  cancelAnimationFrame(tickFrame);
  const start = performance.now();
  const from = tickedLevel.value ?? prev;
  const step = (now) => {
    const t = Math.min(1, (now - start) / 400);
    const eased = 1 - Math.pow(1 - t, 3);
    tickedLevel.value = from + (next - from) * eased;
    if (t < 1) tickFrame = requestAnimationFrame(step);
    else tickedLevel.value = next;
  };
  tickFrame = requestAnimationFrame(step);
});

/** Fill height of the tank graphic, scaled to the configured operating band. */
const tankFill = computed(() => {
  if (level.value == null) return 0;
  const max = (thresholds.value.waterLevelMax ?? 5) * 1.15;
  return Math.max(2, Math.min(100, (level.value / max) * 100));
});

const markerPos = (value) => {
  if (value == null) return null;
  const max = (thresholds.value.waterLevelMax ?? 5) * 1.15;
  return Math.max(0, Math.min(100, (value / max) * 100));
};

const minMarker = computed(() => markerPos(thresholds.value.waterLevelMin));
const maxMarker = computed(() => markerPos(thresholds.value.waterLevelMax));

async function load() {
  if (!props.company?._id) return;
  loading.value = true;
  try {
    const hours = RANGES.find((r) => r.key === range.value).hours;
    const to = new Date();
    const from = new Date(to.getTime() - hours * 3600 * 1000);
    const { data } = await api.get(`/telemetry/${props.company._id}/series`, {
      params: {
        from: from.toISOString(),
        to: to.toISOString(),
        metrics: 'waterLevelM,flowRateM3h'
      }
    });
    points.value = data.points;
    render();
  } finally {
    loading.value = false;
  }
}

function render() {
  if (!canvas.value) return;

  const labels = points.value.map((p) => timeOnly(p.ts));
  const data = {
    labels,
    datasets: [
      {
        label: 'Water level (m)',
        data: points.value.map((p) => p.waterLevelM),
        borderColor: METRIC_COLORS.waterLevelM,
        backgroundColor: `${METRIC_COLORS.waterLevelM}1f`,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
        yAxisID: 'y',
        spanGaps: true
      },
      {
        label: 'Flow (m³/h)',
        data: points.value.map((p) => p.flowRateM3h),
        borderColor: METRIC_COLORS.flowRateM3h,
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        tension: 0.3,
        fill: false,
        yAxisID: 'y1',
        spanGaps: true
      }
    ]
  };

  if (chart.value) {
    chart.value.data = data;
    chart.value.update('none');
    return;
  }

  chart.value = new Chart(canvas.value, {
    type: 'line',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: CHART_THEME.ink2, boxWidth: 10, boxHeight: 10, font: { family: "'IBM Plex Sans'", size: 11 } }
        },
        tooltip: {
          backgroundColor: CHART_THEME.paper3,
          borderColor: CHART_THEME.rule2,
          borderWidth: 1,
          titleColor: CHART_THEME.ink,
          bodyColor: CHART_THEME.ink2,
          bodyFont: { family: "'JetBrains Mono'" },
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { color: CHART_THEME.rule },
          ticks: { color: CHART_THEME.muted, maxTicksLimit: 8, font: { family: "'JetBrains Mono'", size: 10 } }
        },
        y: {
          position: 'left',
          grid: { color: CHART_THEME.rule },
          ticks: { color: CHART_THEME.muted, font: { family: "'JetBrains Mono'", size: 10 } },
          title: { display: true, text: 'm', color: CHART_THEME.muted, font: { size: 10 } }
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: CHART_THEME.muted, font: { family: "'JetBrains Mono'", size: 10 } },
          title: { display: true, text: 'm³/h', color: CHART_THEME.muted, font: { size: 10 } }
        }
      }
    }
  });
}

/** Append a live frame so the chart keeps moving between refetches. */
watch(
  () => props.latest,
  (reading) => {
    if (!reading || !chart.value || !points.value.length) return;
    points.value.push({
      ts: reading.ts,
      waterLevelM: reading.waterLevelM,
      flowRateM3h: reading.flowRateM3h
    });
    if (points.value.length > 400) points.value.shift();
    render();
  }
);

watch(() => [props.company?._id, range.value], load);
onMounted(load);
onBeforeUnmount(() => chart.value?.destroy());
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h2>Water level monitor</h2>
      <div class="row" style="gap: 4px">
        <button
          v-for="r in RANGES"
          :key="r.key"
          class="btn sm"
          :class="{ primary: range === r.key }"
          @click="range = r.key"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <div class="panel-body monitor">
      <div class="gauge">
        <div class="tank">
          <div class="water" :class="levelStatus" :style="{ height: `${tankFill}%` }">
            <div class="wave"></div>
          </div>
          <div
            v-if="maxMarker !== null"
            class="marker max"
            :style="{ bottom: `${maxMarker}%` }"
            :title="`Max ${thresholds.waterLevelMax} m`"
          >
            <span class="tiny">max</span>
          </div>
          <div
            v-if="minMarker !== null"
            class="marker min"
            :style="{ bottom: `${minMarker}%` }"
            :title="`Min ${thresholds.waterLevelMin} m`"
          >
            <span class="tiny">min</span>
          </div>
        </div>

        <div class="readout">
          <div class="big" :class="levelStatus" aria-live="polite" :aria-label="`Water level ${num(level, 2)} metres`">
            {{ num(tickedLevel, 2) }}<span class="unit">m</span>
          </div>
          <span class="badge" :class="levelStatus">{{ levelStatus }}</span>
          <div class="tiny dim" style="margin-top: 8px">
            Band {{ num(thresholds.waterLevelMin, 1) }} – {{ num(thresholds.waterLevelMax, 1) }} m
          </div>
          <div class="tiny muted" style="margin-top: 10px">
            Flow {{ metric('flowRateM3h', latest?.flowRateM3h) }}
          </div>
        </div>
      </div>

      <div class="chart-wrap">
        <div v-if="loading" class="chart-overlay tiny dim">loading…</div>
        <div v-else-if="!points.length" class="chart-overlay tiny dim">
          No telemetry in this range
        </div>
        <canvas ref="canvas"></canvas>
      </div>
    </div>
  </div>
</template>

<style scoped>
.monitor { display: grid; grid-template-columns: 200px 1fr; gap: var(--space-lg); }

.gauge { display: flex; gap: var(--space-md); align-items: stretch; }

.tank {
  position: relative;
  width: 62px;
  border: 1px solid var(--color-rule-2);
  border-radius: var(--radius-sm);
  background: var(--color-paper);
  overflow: hidden;
  min-height: 190px;
}

.water {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-accent);
  opacity: 0.55;
  transition: height 0.7s var(--ease-out);
}
.water.warning { background: var(--color-warning); }
.water.critical { background: var(--color-critical); }

.wave {
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--color-ink);
  opacity: 0.4;
}

.marker {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed var(--color-rule-2);
  pointer-events: none;
}
.marker span {
  position: absolute;
  right: 2px;
  top: -12px;
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 9px;
}
.marker.max { border-color: color-mix(in oklch, var(--color-critical) 65%, transparent); }
.marker.min { border-color: color-mix(in oklch, var(--color-warning) 65%, transparent); }

.readout { display: flex; flex-direction: column; justify-content: center; }
.big {
  font-family: var(--font-display);
  font-size: 1.875rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink);
}
.big.warning { color: var(--color-warning); }
.big.critical { color: var(--color-critical); }
.unit { font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-2); margin-left: 3px; font-weight: 400; }

.chart-wrap { position: relative; height: 220px; }
.chart-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: var(--z-raised);
}

@media (prefers-reduced-motion: reduce) {
  .water { transition: none; }
}

@media (max-width: 1100px) {
  .monitor { grid-template-columns: 1fr; }
  .tank { min-height: 150px; }
}
</style>
