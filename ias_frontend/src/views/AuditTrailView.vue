<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api, { downloadFile } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import { dateTime, toLocalInput } from '@/utils/format';
import ModalDialog from '@/components/ui/ModalDialog.vue';

const toasts = useToastStore();

const entries = ref([]);
const total = ref(0);
const actions = ref([]);
const loading = ref(false);
const exporting = ref(false);
const detail = ref(null);
const page = ref(1);
const limit = 50;

const filters = reactive({
  q: '',
  action: '',
  resource: '',
  success: '',
  from: toLocalInput(new Date(Date.now() - 7 * 86400000)),
  to: toLocalInput(new Date())
});

const pages = computed(() => Math.max(1, Math.ceil(total.value / limit)));

function params() {
  return {
    q: filters.q || undefined,
    action: filters.action || undefined,
    resource: filters.resource || undefined,
    success: filters.success === '' ? undefined : filters.success,
    from: new Date(filters.from).toISOString(),
    to: new Date(filters.to).toISOString()
  };
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/audit-logs', {
      params: { ...params(), page: page.value, limit }
    });
    entries.value = data.items;
    total.value = data.total;
  } catch (err) {
    toasts.error('Could not load audit trail', err.message);
  } finally {
    loading.value = false;
  }
}

async function exportExcel() {
  exporting.value = true;
  try {
    const name = await downloadFile('/audit-logs/export', params(), 'audit-trail.xlsx');
    toasts.success('Export ready', name);
  } catch (err) {
    toasts.error('Export failed', err.message);
  } finally {
    exporting.value = false;
  }
}

const actionBadge = (action) => {
  if (action.includes('delete')) return 'critical';
  if (action.includes('failed') || action.includes('blocked')) return 'warning';
  if (action.includes('create')) return 'normal';
  return 'info';
};

onMounted(async () => {
  await load();
  try {
    const { data } = await api.get('/audit-logs/actions');
    actions.value = data.items;
  } catch {
    // Non-fatal: the filter simply stays empty.
  }
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
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h2>User audit trail</h2>
      <div class="row" style="gap: 8px">
        <button class="btn sm" @click="load">Refresh</button>
        <button class="btn sm primary" :disabled="exporting" @click="exportExcel">
          {{ exporting ? 'Exporting…' : 'Export to Excel' }}
        </button>
      </div>
    </div>

    <div class="filters">
      <label class="field">
        <span>Search</span>
        <input v-model="filters.q" type="search" placeholder="User, email or path…" />
      </label>
      <label class="field">
        <span>Action</span>
        <select v-model="filters.action">
          <option value="">Any action</option>
          <option v-for="action in actions" :key="action" :value="action">{{ action }}</option>
        </select>
      </label>
      <label class="field">
        <span>Resource</span>
        <select v-model="filters.resource">
          <option value="">Any</option>
          <option value="auth">auth</option>
          <option value="user">user</option>
          <option value="company">company</option>
          <option value="device">device</option>
          <option value="alert">alert</option>
          <option value="report">report</option>
        </select>
      </label>
      <label class="field">
        <span>Outcome</span>
        <select v-model="filters.success">
          <option value="">Any</option>
          <option value="true">Success</option>
          <option value="false">Failure</option>
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
            <th style="width: 160px">Timestamp</th>
            <th>User</th>
            <th>Action</th>
            <th>Resource</th>
            <th>Request</th>
            <th>Outcome</th>
            <th>IP</th>
            <th class="right"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry._id">
            <td class="small nowrap">{{ dateTime(entry.ts) }}</td>
            <td class="small">
              {{ entry.userName }}
              <div class="tiny dim">{{ entry.userEmail || '—' }} · {{ entry.role || 'n/a' }}</div>
            </td>
            <td><span class="badge" :class="actionBadge(entry.action)">{{ entry.action }}</span></td>
            <td class="small">
              {{ entry.resource || '—' }}
              <div v-if="entry.resourceId" class="tiny mono dim">{{ entry.resourceId }}</div>
            </td>
            <td class="tiny mono dim">{{ entry.method }} {{ entry.path }}</td>
            <td>
              <span class="badge" :class="entry.success ? 'normal' : 'critical'">
                {{ entry.statusCode }}
              </span>
            </td>
            <td class="tiny mono dim">{{ entry.ip || '—' }}</td>
            <td class="right">
              <button class="btn sm ghost" @click="detail = entry">Details</button>
            </td>
          </tr>
          <tr v-if="!entries.length">
            <td colspan="8" class="empty">
              {{ loading ? 'Loading…' : 'No audit entries match these filters.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="row" style="padding: 10px 14px; border-top: 1px solid var(--border-soft)">
      <span class="tiny dim">{{ total }} entr{{ total === 1 ? 'y' : 'ies' }}</span>
      <div class="spacer"></div>
      <button class="btn sm" :disabled="page <= 1" @click="page--">Previous</button>
      <span class="tiny muted">Page {{ page }} of {{ pages }}</span>
      <button class="btn sm" :disabled="page >= pages" @click="page++">Next</button>
    </div>
  </div>

  <ModalDialog v-if="detail" title="Audit entry" width="640px" @close="detail = null">
    <dl class="kv">
      <dt>Timestamp</dt>
      <dd>{{ dateTime(detail.ts) }}</dd>
      <dt>User</dt>
      <dd>{{ detail.userName }} ({{ detail.userEmail || 'n/a' }}) · {{ detail.role || 'n/a' }}</dd>
      <dt>Action</dt>
      <dd class="mono">{{ detail.action }}</dd>
      <dt>Resource</dt>
      <dd class="mono">{{ detail.resource }} {{ detail.resourceId }}</dd>
      <dt>Request</dt>
      <dd class="mono">{{ detail.method }} {{ detail.path }} → {{ detail.statusCode }}</dd>
      <dt>IP address</dt>
      <dd class="mono">{{ detail.ip || '—' }}</dd>
      <dt>User agent</dt>
      <dd class="tiny">{{ detail.userAgent || '—' }}</dd>
    </dl>

    <div v-if="detail.meta && Object.keys(detail.meta).length" style="margin-top: 14px">
      <div class="tiny muted" style="margin-bottom: 6px">Metadata</div>
      <pre class="meta mono">{{ JSON.stringify(detail.meta, null, 2) }}</pre>
    </div>

    <template #footer>
      <button class="btn" @click="detail = null">Close</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.filters {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0 12px;
  padding: 12px 16px 0;
  border-bottom: 1px solid var(--border-soft);
}

.kv { display: grid; grid-template-columns: 130px 1fr; gap: 7px 12px; margin: 0; font-size: 13px; }
.kv dt { color: var(--text-muted); font-size: 12px; }
.kv dd { margin: 0; word-break: break-word; }

.meta {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  margin: 0;
  max-height: 240px;
  overflow: auto;
  font-size: 11px;
}

@media (max-width: 1200px) { .filters { grid-template-columns: repeat(3, 1fr); } }
</style>
