<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '@/api/client';
import { useCompanyStore } from '@/stores/companies';
import { useAlertStore } from '@/stores/alerts';
import { onSocket, subscribeCompany } from '@/services/socket';
import { METRIC_META, dateTime, metric, metricStatus, relativeTime } from '@/utils/format';
import StatCard from '@/components/ui/StatCard.vue';
import WaterLevelMonitor from '@/components/dashboard/WaterLevelMonitor.vue';
import CctvMonitor from '@/components/dashboard/CctvMonitor.vue';
import SensorLocationMap from '@/components/dashboard/SensorLocationMap.vue';
import CompanySwitcher from '@/components/dashboard/CompanySwitcher.vue';

const companies = useCompanyStore();
const alerts = useAlertStore();

const overview = ref({
  companies: 0,
  devices: { total: 0, online: 0 },
  openAlerts: 0,
  alertsBySeverity: { info: 0, warning: 0, critical: 0 },
  readings24h: 0
});
const latest = ref(null);
const detail = ref(null);
const offs = [];
const clock = ref(Date.now());
let clockTimer = null;

const selected = computed(() => companies.selected);
const thresholds = computed(() => detail.value?.thresholds || selected.value?.thresholds || {});

const envStatus = computed(
  () => detail.value?.environmentStatus || selected.value?.environmentStatus || { level: 'unknown', label: 'No data', reasons: [] }
);

const lastSeen = computed(() => {
  void clock.value;
  return latest.value ? relativeTime(latest.value.ts) : 'no data';
});

const gaugeMetrics = ['ph', 'turbidityNtu', 'tdsPpm', 'temperatureC'];

const siteAlerts = computed(() =>
  [
    ...alerts.live.filter((a) => a.company === selected.value?._id),
    ...(detail.value?.openAlerts || [])
  ]
    .filter((a, index, list) => list.findIndex((x) => x._id === a._id) === index)
    .slice(0, 8)
);

async function loadSite(companyId) {
  if (!companyId) {
    detail.value = null;
    latest.value = null;
    return;
  }
  subscribeCompany(companyId);
  const [detailData, latestData] = await Promise.all([
    companies.fetchDetail(companyId),
    api.get(`/telemetry/latest/${companyId}`).then((r) => r.data)
  ]);
  detail.value = detailData;
  latest.value = latestData;
}

function selectCompany(companyId) {
  companies.select(companyId);
}

onMounted(async () => {
  const [, { data }] = await Promise.all([
    companies.items.length ? Promise.resolve() : companies.fetchAll(),
    api.get('/dashboard/overview')
  ]);
  overview.value = data;

  await loadSite(companies.selectedId);

  offs.push(
    onSocket('telemetry', (reading) => {
      latest.value = reading;
      companies.applyTelemetry(reading);
    }),
    onSocket('alert:new', (alert) => {
      if (alert.company === companies.selectedId) {
        overview.value.openAlerts += 1;
      }
    })
  );

  clockTimer = setInterval(() => {
    clock.value = Date.now();
  }, 5000);
});

watch(() => companies.selectedId, loadSite);

onBeforeUnmount(() => {
  offs.forEach((off) => off?.());
  clearInterval(clockTimer);
});
</script>

<template>
  <div class="dashboard">
    <!-- KPI strip -->
    <div class="kpis">
      <StatCard label="Monitored sites" :value="overview.companies" />
      <StatCard
        label="Devices online"
        :value="`${overview.devices.online}/${overview.devices.total}`"
        :status="overview.devices.online < overview.devices.total ? 'warning' : 'normal'"
      />
      <StatCard
        label="Open alerts"
        :value="overview.openAlerts"
        :hint="`${overview.alertsBySeverity.critical} critical · ${overview.alertsBySeverity.warning} warning`"
        :status="overview.alertsBySeverity.critical ? 'critical' : overview.openAlerts ? 'warning' : 'normal'"
      />
      <StatCard label="Readings (24h)" :value="overview.readings24h.toLocaleString()" />
      <StatCard
        label="Intake last 24h"
        :value="detail?.waterIntakeStats?.last24hM3 ?? '—'"
        unit="m³"
        :hint="
          detail?.waterIntakeStats?.quotaUsagePct != null
            ? `${detail.waterIntakeStats.quotaUsagePct}% of permit`
            : 'no permit quota set'
        "
        :status="
          detail?.waterIntakeStats?.quotaUsagePct > 100
            ? 'critical'
            : detail?.waterIntakeStats?.quotaUsagePct > 85
              ? 'warning'
              : 'normal'
        "
      />
    </div>

    <div class="layout">
      <!-- Left: live monitoring for the selected site -->
      <div class="col-main">
        <div class="site-head panel">
          <div class="row wrap" style="padding: 14px 16px">
            <span class="dot" :class="envStatus.level"></span>
            <div>
              <h2 style="font-size: 15px">{{ selected?.name || 'No site selected' }}</h2>
              <div class="tiny dim">
                {{ selected?.code }} · {{ selected?.city || '—' }} · last frame {{ lastSeen }}
              </div>
            </div>
            <div class="spacer"></div>
            <span class="badge" :class="envStatus.level">{{ envStatus.label }}</span>
            <RouterLink
              v-if="selected"
              class="btn sm"
              :to="{ name: 'company-detail', params: { id: selected._id } }"
            >
              Site detail
            </RouterLink>
          </div>
        </div>

        <WaterLevelMonitor :company="detail || selected" :latest="latest" />

        <div class="grid gauges">
          <StatCard
            v-for="key in gaugeMetrics"
            :key="key"
            :label="METRIC_META[key].label"
            :value="latest?.[key] != null ? metric(key, latest[key]) : '—'"
            :status="metricStatus(key, latest?.[key], thresholds)"
            :hint="dateTime(latest?.ts)"
          />
        </div>

        <div class="two-col">
          <CctvMonitor :company="detail || selected" />

          <div class="panel">
            <div class="panel-head">
              <h2>Early warning</h2>
              <RouterLink class="tiny" :to="{ name: 'alerts' }">View all →</RouterLink>
            </div>
            <div class="panel-body flush">
              <div v-if="!siteAlerts.length" class="empty">
                No open alerts for this site.<br />
                <span class="tiny">All monitored parameters are within their limits.</span>
              </div>
              <div v-for="alert in siteAlerts" :key="alert._id" class="alert-row">
                <span class="dot" :class="alert.severity"></span>
                <div style="flex: 1; min-width: 0">
                  <div class="small">{{ alert.message }}</div>
                  <div class="tiny dim">
                    {{ alert.deviceId || 'site' }} · {{ dateTime(alert.ts) }}
                  </div>
                </div>
                <span class="badge" :class="alert.status">{{ alert.status }}</span>
              </div>
            </div>
          </div>
        </div>

        <SensorLocationMap
          :company="detail || selected"
          :latest="latest"
          @select-company="selectCompany"
        />
      </div>

      <!-- Right: site picker -->
      <div class="col-side">
        <CompanySwitcher
          :companies="companies.items"
          :selected-id="companies.selectedId"
          @select="selectCompany"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 16px; }

.kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }

.layout { display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start; }
.col-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.col-side { position: sticky; top: 0; max-height: calc(100vh - 98px); display: flex; }
.col-side > * { flex: 1; }

.gauges { grid-template-columns: repeat(4, 1fr); }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.alert-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-soft);
}
.alert-row:last-child { border-bottom: none; }
.alert-row .dot { margin-top: 5px; }

@media (max-width: 1400px) {
  .kpis { grid-template-columns: repeat(3, 1fr); }
  .two-col { grid-template-columns: 1fr; }
}
@media (max-width: 1100px) {
  .layout { grid-template-columns: 1fr; }
  .col-side { position: static; max-height: 420px; }
  .gauges { grid-template-columns: repeat(2, 1fr); }
}
</style>
