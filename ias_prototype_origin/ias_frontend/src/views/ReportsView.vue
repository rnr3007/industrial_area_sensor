<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  BarController,
  BarElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';
import api, { downloadFile } from '@/api/client';
import { useCompanyStore } from '@/stores/companies';
import { useToastStore } from '@/stores/toast';
import { CHART_THEME, METRIC_COLORS, METRIC_META, dateTime, num, toLocalInput } from '@/utils/format';
import StatCard from '@/components/ui/StatCard.vue';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  BarController,
  BarElement,
  Filler,
  Tooltip,
  Legend
);

const companies = useCompanyStore();
const toasts = useToastStore();
const route = useRoute();

const form = reactive({
  companyId: route.query.companyId || '',
  from: toLocalInput(new Date(Date.now() - 7 * 86400000)),
  to: toLocalInput(new Date()),
  bucket: 'hour'
});

const PRESETS = [
  { label: 'Last 24 hours', hours: 24, bucket: 'hour' },
  { label: 'Last 7 days', hours: 24 * 7, bucket: 'hour' },
  { label: 'Last 30 days', hours: 24 * 30, bucket: 'day' },
  { label: 'Last 90 days', hours: 24 * 90, bucket: 'day' }
];

const report = ref(null);
const loading = ref(false);
const downloading = ref('');
const error = ref('');
const canvas = ref(null);
const chart = shallowRef(null);
const chartMetric = ref('waterLevelM');

const company = computed(() => companies.byId(form.companyId));

function applyPreset(preset) {
  const to = new Date();
  form.to = toLocalInput(to);
  form.from = toLocalInput(new Date(to.getTime() - preset.hours * 3600 * 1000));
  form.bucket = preset.bucket;
  generate();
}

function params() {
  return {
    companyId: form.companyId,
    from: new Date(form.from).toISOString(),
    to: new Date(form.to).toISOString(),
    bucket: form.bucket
  };
}

async function generate() {
  if (!form.companyId) {
    error.value = 'Select a site first.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/reports/preview', { params: params() });
    report.value = data;
    renderChart();
  } catch (err) {
    error.value = err.message;
    report.value = null;
  } finally {
    loading.value = false;
  }
}

async function download(kind) {
  if (!form.companyId) return;
  downloading.value = kind;
  try {
    const name = await downloadFile(`/reports/${kind}`, params(), `ias-report.${kind === 'pdf' ? 'pdf' : 'xlsx'}`);
    toasts.success(`${kind.toUpperCase()} export ready`, name);
  } catch (err) {
    toasts.error('Export failed', err.message);
  } finally {
    downloading.value = '';
  }
}

function renderChart() {
  if (!canvas.value || !report.value) return;

  const rows = report.value.rows;
  const key = chartMetric.value;
  const labels = rows.map((r) =>
    new Date(r.ts).toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  );

  const data = {
    labels,
    datasets: [
      {
        label: `${METRIC_META[key].label} avg`,
        data: rows.map((r) => r[key]?.avg ?? null),
        borderColor: METRIC_COLORS[key],
        backgroundColor: `${METRIC_COLORS[key]}22`,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25,
        fill: true,
        spanGaps: true
      },
      {
        label: 'min',
        data: rows.map((r) => r[key]?.min ?? null),
        borderColor: `${CHART_THEME.ink2}8c`,
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false,
        spanGaps: true
      },
      {
        label: 'max',
        data: rows.map((r) => r[key]?.max ?? null),
        borderColor: `${CHART_THEME.ink2}8c`,
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false,
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
        legend: { labels: { color: CHART_THEME.ink2, boxWidth: 10, font: { family: "'IBM Plex Sans'", size: 11 } } },
        tooltip: {
          backgroundColor: CHART_THEME.paper3,
          borderColor: CHART_THEME.rule2,
          borderWidth: 1,
          titleColor: CHART_THEME.ink,
          bodyColor: CHART_THEME.ink2,
          bodyFont: { family: "'JetBrains Mono'" }
        }
      },
      scales: {
        x: {
          grid: { color: CHART_THEME.rule },
          ticks: { color: CHART_THEME.muted, maxTicksLimit: 10, font: { family: "'JetBrains Mono'", size: 10 } }
        },
        y: {
          grid: { color: CHART_THEME.rule },
          ticks: { color: CHART_THEME.muted, font: { family: "'JetBrains Mono'", size: 10 } }
        }
      }
    }
  });
}

watch(chartMetric, renderChart);

onMounted(async () => {
  if (!companies.items.length) await companies.fetchAll();
  if (!form.companyId) form.companyId = companies.selectedId || companies.items[0]?._id || '';
  if (form.companyId) generate();
});

onBeforeUnmount(() => chart.value?.destroy());
</script>

<template>
  <div class="grid" style="gap: 16px">
    <div class="panel">
      <div class="panel-head">
        <h2>Monitoring report</h2>
        <div class="row" style="gap: 6px">
          <button
            v-for="preset in PRESETS"
            :key="preset.label"
            class="btn sm"
            @click="applyPreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <div class="panel-body">
        <div class="builder">
          <label class="field">
            <span>Site *</span>
            <select v-model="form.companyId">
              <option value="" disabled>Select a site…</option>
              <option v-for="c in companies.items" :key="c._id" :value="c._id">
                {{ c.name }} ({{ c.code }})
              </option>
            </select>
          </label>
          <label class="field">
            <span>From</span>
            <input v-model="form.from" type="datetime-local" />
          </label>
          <label class="field">
            <span>To</span>
            <input v-model="form.to" type="datetime-local" />
          </label>
          <label class="field">
            <span>Aggregation</span>
            <select v-model="form.bucket">
              <option value="hour">Hourly</option>
              <option value="day">Daily</option>
            </select>
          </label>
          <div class="row" style="align-items: flex-end; padding-bottom: 12px; gap: 8px">
            <button class="btn primary" :disabled="loading" @click="generate">
              {{ loading ? 'Generating…' : 'Generate' }}
            </button>
            <button
              class="btn"
              :disabled="!report || downloading === 'pdf'"
              @click="download('pdf')"
            >
              {{ downloading === 'pdf' ? '…' : '⎙ PDF' }}
            </button>
            <button
              class="btn"
              :disabled="!report || downloading === 'excel'"
              @click="download('excel')"
            >
              {{ downloading === 'excel' ? '…' : '▦ Excel' }}
            </button>
          </div>
        </div>

        <div v-if="error" class="alert-box error">{{ error }}</div>
      </div>
    </div>

    <template v-if="report">
      <div class="kpis">
        <StatCard label="Samples" :value="report.summary.samples.toLocaleString()" />
        <StatCard
          label="Total intake"
          :value="report.summary.totalIntakeM3 ?? '—'"
          unit="m³"
          :hint="report.summary.quotaM3 ? `permit ${num(report.summary.quotaM3, 0)} m³` : 'no quota set'"
        />
        <StatCard
          label="Quota usage"
          :value="report.summary.quotaUsagePct != null ? `${report.summary.quotaUsagePct}%` : '—'"
          :status="
            report.summary.quotaUsagePct > 100
              ? 'critical'
              : report.summary.quotaUsagePct > 85
                ? 'warning'
                : 'normal'
          "
        />
        <StatCard
          label="Alerts in period"
          :value="report.alertSummary.total"
          :hint="`${report.alertSummary.critical} critical · ${report.alertSummary.warning} warning`"
          :status="report.alertSummary.critical ? 'critical' : report.alertSummary.total ? 'warning' : 'normal'"
        />
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>{{ report.company.name }} — {{ dateTime(report.from) }} to {{ dateTime(report.to) }}</h2>
          <select v-model="chartMetric" style="width: 170px">
            <option v-for="(meta, key) in METRIC_META" :key="key" :value="key">
              {{ meta.label }}
            </option>
          </select>
        </div>
        <div class="panel-body">
          <div class="chart-wrap">
            <div v-if="!report.rows.length" class="chart-overlay tiny dim">
              No readings in this period
            </div>
            <canvas ref="canvas"></canvas>
          </div>
        </div>
      </div>

      <div class="two-col">
        <div class="panel">
          <div class="panel-head"><h2>Metric summary</h2></div>
          <div class="panel-body flush">
            <table class="data">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th class="right">Average</th>
                  <th class="right">Minimum</th>
                  <th class="right">Maximum</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(stat, key) in report.summary.metrics" :key="key">
                  <td class="small">{{ stat.label }} <span class="dim tiny">{{ stat.unit }}</span></td>
                  <td class="right mono">{{ stat.avg ?? '—' }}</td>
                  <td class="right mono">{{ stat.min ?? '—' }}</td>
                  <td class="right mono">{{ stat.max ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>Alerts in period</h2>
            <span class="tiny dim">{{ report.alertSummary.total }} total</span>
          </div>
          <div class="panel-body flush" style="max-height: 340px; overflow: auto">
            <table class="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Severity</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="alert in report.alerts" :key="alert._id">
                  <td class="small nowrap">{{ dateTime(alert.ts) }}</td>
                  <td><span class="badge" :class="alert.severity">{{ alert.severity }}</span></td>
                  <td class="small">{{ alert.message }}</td>
                </tr>
                <tr v-if="!report.alerts.length">
                  <td colspan="3" class="empty">No alerts were raised in this period.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>Aggregated readings ({{ report.bucket }}ly)</h2>
          <span class="tiny dim">{{ report.rows.length }} row(s)</span>
        </div>
        <div class="panel-body flush table-scroll">
          <table class="data">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th class="right">Samples</th>
                <th v-for="(meta, key) in METRIC_META" :key="key" class="right">
                  {{ meta.label }}
                </th>
                <th class="right">Intake (m³)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in report.rows" :key="row.ts">
                <td class="small nowrap">{{ dateTime(row.ts) }}</td>
                <td class="right mono">{{ row.samples }}</td>
                <td v-for="(meta, key) in METRIC_META" :key="key" class="right mono">
                  {{ row[key]?.avg ?? '—' }}
                </td>
                <td class="right mono">{{ row.intakeM3 ?? '—' }}</td>
              </tr>
              <tr v-if="!report.rows.length">
                <td :colspan="9" class="empty">No readings in this period.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.builder { display: grid; grid-template-columns: 2fr 1.2fr 1.2fr 1fr auto; gap: 0 14px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }

.chart-wrap { position: relative; height: 300px; }
.chart-overlay { position: absolute; inset: 0; display: grid; place-items: center; }

@media (max-width: 1200px) {
  .builder { grid-template-columns: 1fr 1fr; }
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .two-col { grid-template-columns: 1fr; }
}
</style>
