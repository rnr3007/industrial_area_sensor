<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/api/client';
import { useCompanyStore } from '@/stores/companies';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useConfirmStore } from '@/stores/confirm';
import { onSocket, subscribeCompany } from '@/services/socket';
import { METRIC_META, dateTime, metric, metricStatus, num, relativeTime } from '@/utils/format';
import StatCard from '@/components/ui/StatCard.vue';
import SensorLocationMap from '@/components/dashboard/SensorLocationMap.vue';
import CompanyForm from '@/components/companies/CompanyForm.vue';

const route = useRoute();
const router = useRouter();
const companies = useCompanyStore();
const auth = useAuthStore();
const toasts = useToastStore();
const confirm = useConfirmStore();

const detail = ref(null);
const latest = ref(null);
const loading = ref(true);
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const offs = [];

const thresholds = computed(() => detail.value?.thresholds || {});
const intake = computed(() => detail.value?.waterIntakeStats || {});

const quotaStatus = computed(() => {
  const pct = intake.value.quotaUsagePct;
  if (pct == null) return '';
  return pct > 100 ? 'critical' : pct > 85 ? 'warning' : 'normal';
});

async function load() {
  loading.value = true;
  try {
    const [detailData, latestData] = await Promise.all([
      api.get(`/companies/${route.params.id}`).then((r) => r.data),
      api.get(`/telemetry/latest/${route.params.id}`).then((r) => r.data)
    ]);
    detail.value = detailData;
    latest.value = latestData;
    subscribeCompany(route.params.id);
  } catch (err) {
    toasts.error('Could not load site', err.message);
    router.push({ name: 'companies' });
  } finally {
    loading.value = false;
  }
}

async function save(payload) {
  const ok = await confirm.ask({
    title: 'Save changes',
    message: `Apply these changes to ${detail.value.name}?`,
    confirmLabel: 'Save changes'
  });
  if (!ok) return;

  saving.value = true;
  formError.value = '';
  try {
    await companies.update(detail.value._id, payload);
    await load();
    showForm.value = false;
    toasts.success('Company updated', payload.name);
  } catch (err) {
    formError.value = err.message;
  } finally {
    saving.value = false;
  }
}

function monitorOnDashboard() {
  companies.select(detail.value._id);
  router.push({ name: 'dashboard' });
}

onMounted(() => {
  load();
  offs.push(
    onSocket('telemetry', (reading) => {
      if (reading.company === route.params.id) latest.value = reading;
    })
  );
});

watch(() => route.params.id, load);
onBeforeUnmount(() => offs.forEach((off) => off?.()));
</script>

<template>
  <div v-if="loading && !detail" class="empty">Loading site…</div>

  <div v-else-if="detail" class="grid" style="gap: 16px">
    <!-- Header -->
    <div class="panel">
      <div class="row wrap" style="padding: 16px">
        <span class="dot" :class="detail.environmentStatus.level"></span>
        <div>
          <h1>{{ detail.name }}</h1>
          <div class="small dim">
            {{ detail.code }} · {{ detail.industry || 'industry n/a' }} ·
            {{ detail.city || '—' }}{{ detail.province ? `, ${detail.province}` : '' }}
          </div>
        </div>
        <div class="spacer"></div>
        <span class="badge" :class="detail.environmentStatus.level">
          {{ detail.environmentStatus.label }}
        </span>
        <button class="btn" @click="monitorOnDashboard">Monitor live</button>
        <RouterLink
          class="btn"
          :to="{ name: 'reports', query: { companyId: detail._id } }"
        >
          Report
        </RouterLink>
        <button v-if="auth.canWrite" class="btn primary" @click="((formError = ''), (showForm = true))">
          Edit
        </button>
      </div>
      <div
        v-if="detail.environmentStatus.reasons?.length"
        class="reasons tiny"
        :class="detail.environmentStatus.level"
      >
        <span v-for="(reason, index) in detail.environmentStatus.reasons" :key="index">
          {{ reason }}
        </span>
      </div>
    </div>

    <!-- Live metric strip -->
    <div class="metrics">
      <StatCard
        v-for="(meta, key) in METRIC_META"
        :key="key"
        :label="meta.label"
        :value="latest?.[key] != null ? metric(key, latest[key]) : '—'"
        :status="metricStatus(key, latest?.[key], thresholds)"
        :hint="latest ? relativeTime(latest.ts) : 'no telemetry'"
      />
    </div>

    <div class="two-col">
      <!-- Location -->
      <div class="panel">
        <div class="panel-head"><h2>Location</h2></div>
        <div class="panel-body">
          <dl class="kv">
            <dt>Latitude</dt>
            <dd class="mono">{{ detail.location.lat }}</dd>
            <dt>Longitude</dt>
            <dd class="mono">{{ detail.location.lng }}</dd>
            <dt>Geofence radius</dt>
            <dd>{{ detail.geofenceRadiusM }} m</dd>
            <dt>Address</dt>
            <dd>{{ detail.address || '—' }}</dd>
            <dt>Contact</dt>
            <dd>
              {{ detail.contactName || '—' }}
              <div v-if="detail.contactEmail" class="tiny dim">{{ detail.contactEmail }}</div>
              <div v-if="detail.contactPhone" class="tiny dim">{{ detail.contactPhone }}</div>
            </dd>
            <dt>Sensor position</dt>
            <dd class="mono">
              <template v-if="latest?.location?.lat != null">
                {{ latest.location.lat.toFixed(5) }}, {{ latest.location.lng.toFixed(5) }}
              </template>
              <template v-else>—</template>
            </dd>
          </dl>
        </div>
      </div>

      <!-- Water intake -->
      <div class="panel">
        <div class="panel-head">
          <h2>Water intake</h2>
          <span v-if="quotaStatus" class="badge" :class="quotaStatus">
            {{ intake.quotaUsagePct }}% of permit
          </span>
        </div>
        <div class="panel-body">
          <div class="quota-bar" v-if="intake.quotaM3PerDay">
            <div
              class="quota-fill"
              :class="quotaStatus"
              :style="{ width: `${Math.min(100, intake.quotaUsagePct || 0)}%` }"
            ></div>
          </div>
          <div class="tiny dim" style="margin-bottom: 12px" v-if="intake.quotaM3PerDay">
            {{ num(intake.last24hM3, 1) }} m³ of {{ intake.quotaM3PerDay }} m³ permitted in the last
            24 h
          </div>

          <dl class="kv">
            <dt>Source type</dt>
            <dd style="text-transform: capitalize">{{ detail.waterIntake?.sourceType || '—' }}</dd>
            <dt>Permit number</dt>
            <dd class="mono">{{ detail.waterIntake?.permitNumber || '—' }}</dd>
            <dt>Daily quota</dt>
            <dd>{{ detail.waterIntake?.quotaM3PerDay || 0 }} m³/day</dd>
            <dt>Pipe diameter</dt>
            <dd>{{ detail.waterIntake?.pipeDiameterMm || 0 }} mm</dd>
            <dt>Intake (24h)</dt>
            <dd>{{ num(intake.last24hM3, 1) }} m³</dd>
            <dt>Average flow (24h)</dt>
            <dd>{{ num(intake.avgFlowM3h, 1) }} m³/h</dd>
            <dt>Samples (24h)</dt>
            <dd>{{ intake.samples24h ?? 0 }}</dd>
            <dt v-if="detail.waterIntake?.notes">Notes</dt>
            <dd v-if="detail.waterIntake?.notes" class="small">{{ detail.waterIntake.notes }}</dd>
          </dl>
        </div>
      </div>
    </div>

    <div class="two-col">
      <!-- Devices -->
      <div class="panel">
        <div class="panel-head">
          <h2>Devices</h2>
          <span class="tiny dim">{{ detail.devices.length }} registered</span>
        </div>
        <div class="panel-body flush">
          <table class="data">
            <thead>
              <tr>
                <th>Device</th>
                <th>Type</th>
                <th>Status</th>
                <th>Battery</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="device in detail.devices" :key="device._id">
                <td>
                  <strong class="small">{{ device.name }}</strong>
                  <div class="tiny mono dim">{{ device.deviceId }}</div>
                </td>
                <td class="small">{{ device.type }}</td>
                <td>
                  <span class="badge" :class="device.online ? 'normal' : 'unknown'">
                    {{ device.online ? 'online' : 'offline' }}
                  </span>
                </td>
                <td class="small">{{ device.battery != null ? `${device.battery}%` : '—' }}</td>
                <td class="small">{{ relativeTime(device.lastSeenAt) }}</td>
              </tr>
              <tr v-if="!detail.devices.length">
                <td colspan="5" class="empty">No devices registered for this site.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Open alerts -->
      <div class="panel">
        <div class="panel-head">
          <h2>Open alerts</h2>
          <RouterLink class="tiny" :to="{ name: 'alerts', query: { companyId: detail._id } }">
            View all →
          </RouterLink>
        </div>
        <div class="panel-body flush">
          <table class="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Severity</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="alert in detail.openAlerts" :key="alert._id">
                <td class="small nowrap">{{ dateTime(alert.ts) }}</td>
                <td><span class="badge" :class="alert.severity">{{ alert.severity }}</span></td>
                <td class="small">{{ alert.message }}</td>
              </tr>
              <tr v-if="!detail.openAlerts.length">
                <td colspan="3" class="empty">No open alerts.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <SensorLocationMap :company="detail" :latest="latest" height="380px" />

    <CompanyForm
      v-if="showForm"
      :company="detail"
      :saving="saving"
      :error="formError"
      @save="save"
      @close="showForm = false"
    />
  </div>
</template>

<style scoped>
.metrics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }

.reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--border-soft);
  color: var(--text-muted);
}
.reasons.critical { background: var(--color-critical-soft); color: oklch(85% 0.10 25); }
.reasons.warning { background: var(--color-warning-soft); color: oklch(87% 0.09 80); }

.kv { display: grid; grid-template-columns: 150px 1fr; gap: 7px 12px; margin: 0; font-size: 13px; }
.kv dt { color: var(--text-muted); font-size: 12px; }
.kv dd { margin: 0; }

.quota-bar {
  height: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 6px;
}
.quota-fill { height: 100%; background: var(--ok); transition: width 0.6s ease; }
.quota-fill.warning { background: var(--warn); }
.quota-fill.critical { background: var(--crit); }

@media (max-width: 1300px) { .metrics { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 1000px) {
  .two-col { grid-template-columns: 1fr; }
  .metrics { grid-template-columns: repeat(2, 1fr); }
}
</style>
