<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAlertStore } from '@/stores/alerts';
import { useCompanyStore } from '@/stores/companies';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { onSocket } from '@/services/socket';
import { dateTime, metric, toLocalInput } from '@/utils/format';
import StatCard from '@/components/ui/StatCard.vue';
import ModalDialog from '@/components/ui/ModalDialog.vue';

const alerts = useAlertStore();
const companies = useCompanyStore();
const auth = useAuthStore();
const toasts = useToastStore();
const route = useRoute();

const filters = reactive({
  companyId: route.query.companyId || '',
  status: 'open',
  severity: '',
  type: '',
  from: toLocalInput(new Date(Date.now() - 7 * 86400000)),
  to: toLocalInput(new Date())
});

const page = ref(1);
const limit = 50;
const actioning = ref(null);
const noteTarget = ref(null);
const note = ref('');
const offs = [];

const TYPES = [
  ['threshold-high', 'Above limit'],
  ['threshold-low', 'Below limit'],
  ['rate-of-change', 'Sudden change'],
  ['device-offline', 'Device offline'],
  ['geofence-exit', 'Geofence exit'],
  ['low-battery', 'Low battery']
];

const pages = computed(() => Math.max(1, Math.ceil(alerts.total / limit)));

function query() {
  return {
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    from: new Date(filters.from).toISOString(),
    to: new Date(filters.to).toISOString(),
    page: page.value,
    limit
  };
}

async function load() {
  await Promise.all([alerts.fetch(query()), alerts.fetchStats(filters.companyId)]);
}

async function act(alert, action) {
  actioning.value = alert._id;
  try {
    if (action === 'acknowledge') await alerts.acknowledge(alert._id, note.value);
    else await alerts.resolve(alert._id, note.value);
    toasts.success(`Alert ${action}d`, alert.message);
    noteTarget.value = null;
    note.value = '';
    await alerts.fetchStats(filters.companyId);
  } catch (err) {
    toasts.error('Action failed', err.message);
  } finally {
    actioning.value = null;
  }
}

function companyName(id) {
  return companies.byId(id)?.name || '—';
}

onMounted(async () => {
  if (!companies.items.length) await companies.fetchAll();
  await load();

  offs.push(
    onSocket('alert:new', (alert) => {
      // Only prepend when the new alert matches the active filter.
      const matchesCompany = !filters.companyId || alert.company === filters.companyId;
      const matchesSeverity = !filters.severity || alert.severity === filters.severity;
      if (page.value === 1 && filters.status !== 'resolved' && matchesCompany && matchesSeverity) {
        alerts.items.unshift(alert);
        alerts.total += 1;
      }
    }),
    onSocket('alert:update', (alert) => alerts.replace(alert))
  );
});

watch(
  () => ({ ...filters }),
  () => {
    page.value = 1;
    load();
  },
  { deep: true }
);
watch(page, load);

onBeforeUnmount(() => offs.forEach((off) => off?.()));
</script>

<template>
  <div class="grid" style="gap: 16px">
    <div class="kpis">
      <StatCard
        label="Open alerts"
        :value="alerts.stats.open"
        :status="alerts.stats.open ? 'warning' : 'normal'"
      />
      <StatCard
        label="Critical"
        :value="alerts.stats.bySeverity.critical"
        :status="alerts.stats.bySeverity.critical ? 'critical' : 'normal'"
      />
      <StatCard label="Warning" :value="alerts.stats.bySeverity.warning" status="warning" />
      <StatCard label="Raised in last 24h" :value="alerts.stats.last24h" />
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>Early warning alerts</h2>
        <button class="btn sm" @click="load">Refresh</button>
      </div>

      <div class="filters">
        <label class="field">
          <span>Site</span>
          <select v-model="filters.companyId">
            <option value="">All sites</option>
            <option v-for="c in companies.items" :key="c._id" :value="c._id">{{ c.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Status</span>
          <select v-model="filters.status">
            <option value="">Any</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label class="field">
          <span>Severity</span>
          <select v-model="filters.severity">
            <option value="">Any</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </label>
        <label class="field">
          <span>Type</span>
          <select v-model="filters.type">
            <option value="">Any</option>
            <option v-for="[value, label] in TYPES" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <label class="field">
          <span>From</span>
          <input v-model="filters.from" type="datetime-local" />
        </label>
        <label class="field">
          <span>To</span>
          <input v-model="filters.to" type="datetime-local" />
        </label>
      </div>

      <div class="panel-body flush table-scroll">
        <table class="data">
          <thead>
            <tr>
              <th style="width: 150px">When</th>
              <th>Severity</th>
              <th>Site</th>
              <th>Device</th>
              <th>Message</th>
              <th>Reading</th>
              <th>Status</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="alert in alerts.items" :key="alert._id">
              <td class="small nowrap">{{ dateTime(alert.ts) }}</td>
              <td>
                <span class="badge" :class="alert.severity">{{ alert.severity }}</span>
              </td>
              <td class="small">{{ alert.companyName || companyName(alert.company) }}</td>
              <td class="tiny mono dim">{{ alert.deviceId || '—' }}</td>
              <td class="small">
                {{ alert.message }}
                <div v-if="alert.note" class="tiny dim">note: {{ alert.note }}</div>
              </td>
              <td class="small nowrap">
                <template v-if="alert.value != null">
                  {{ metric(alert.metric, alert.value) }}
                  <div class="tiny dim" v-if="alert.threshold != null">
                    limit {{ metric(alert.metric, alert.threshold) }}
                  </div>
                </template>
                <template v-else>—</template>
              </td>
              <td>
                <span class="badge" :class="alert.status">{{ alert.status }}</span>
                <div v-if="alert.acknowledgedBy" class="tiny dim">
                  by {{ alert.acknowledgedBy.name || 'operator' }}
                </div>
              </td>
              <td class="right nowrap">
                <template v-if="auth.canWrite && alert.status !== 'resolved'">
                  <button
                    v-if="alert.status === 'open'"
                    class="btn sm"
                    :disabled="actioning === alert._id"
                    @click="noteTarget = { alert, action: 'acknowledge' }"
                  >
                    Ack
                  </button>
                  <button
                    class="btn sm"
                    :disabled="actioning === alert._id"
                    @click="noteTarget = { alert, action: 'resolve' }"
                  >
                    Resolve
                  </button>
                </template>
                <span v-else class="tiny dim">—</span>
              </td>
            </tr>
            <tr v-if="!alerts.items.length">
              <td colspan="8" class="empty">
                {{ alerts.loading ? 'Loading…' : 'No alerts match these filters.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="row" style="padding: 10px 14px; border-top: 1px solid var(--border-soft)">
        <span class="tiny dim">{{ alerts.total }} alert(s)</span>
        <div class="spacer"></div>
        <button class="btn sm" :disabled="page <= 1" @click="page--">Previous</button>
        <span class="tiny muted">Page {{ page }} of {{ pages }}</span>
        <button class="btn sm" :disabled="page >= pages" @click="page++">Next</button>
      </div>
    </div>

    <ModalDialog
      v-if="noteTarget"
      :title="noteTarget.action === 'acknowledge' ? 'Acknowledge alert' : 'Resolve alert'"
      width="520px"
      @close="((noteTarget = null), (note = ''))"
    >
      <p class="small">{{ noteTarget.alert.message }}</p>
      <p class="tiny dim">
        {{ noteTarget.alert.companyName }} · {{ dateTime(noteTarget.alert.ts) }}
      </p>
      <label class="field">
        <span>Note (optional)</span>
        <textarea v-model="note" placeholder="What was checked or done?"></textarea>
      </label>

      <template #footer>
        <button class="btn" @click="((noteTarget = null), (note = ''))">Cancel</button>
        <button class="btn primary" @click="act(noteTarget.alert, noteTarget.action)">
          Confirm
        </button>
      </template>
    </ModalDialog>
  </div>
</template>

<style scoped>
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }

.filters {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0 12px;
  padding: 12px 16px 0;
  border-bottom: 1px solid var(--border-soft);
}

td .btn + .btn { margin-left: 5px; }

@media (max-width: 1200px) {
  .filters { grid-template-columns: repeat(3, 1fr); }
  .kpis { grid-template-columns: repeat(2, 1fr); }
}
</style>
