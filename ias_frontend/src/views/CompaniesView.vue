<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useCompanyStore } from '@/stores/companies';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useConfirmStore } from '@/stores/confirm';
import { metric, relativeTime } from '@/utils/format';
import CompanyForm from '@/components/companies/CompanyForm.vue';
import ModalDialog from '@/components/ui/ModalDialog.vue';

const companies = useCompanyStore();
const auth = useAuthStore();
const toasts = useToastStore();
const confirm = useConfirmStore();
const router = useRouter();

const query = ref('');
const statusFilter = ref('');
const editing = ref(null);
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const confirmTarget = ref(null);
const deleting = ref(false);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return companies.items.filter((company) => {
    const matchesQuery =
      !q ||
      [company.name, company.code, company.city, company.industry]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q));
    const matchesStatus =
      !statusFilter.value || company.environmentStatus?.level === statusFilter.value;
    return matchesQuery && matchesStatus;
  });
});

function openCreate() {
  editing.value = null;
  formError.value = '';
  showForm.value = true;
}

function openEdit(company) {
  editing.value = company;
  formError.value = '';
  showForm.value = true;
}

async function save(payload) {
  if (editing.value) {
    const ok = await confirm.ask({
      title: 'Save changes',
      message: `Apply these changes to ${editing.value.name}?`,
      confirmLabel: 'Save changes'
    });
    if (!ok) return;
  }

  saving.value = true;
  formError.value = '';
  try {
    if (editing.value) {
      await companies.update(editing.value._id, payload);
      toasts.success('Company updated', payload.name);
    } else {
      await companies.create(payload);
      toasts.success('Company created', payload.name);
    }
    showForm.value = false;
  } catch (err) {
    formError.value = err.details
      ? `${err.message}: ${Object.values(err.details).join(', ')}`
      : err.message;
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(force = false) {
  deleting.value = true;
  try {
    await companies.remove(confirmTarget.value._id, force);
    toasts.success('Company deleted', confirmTarget.value.name);
    confirmTarget.value = null;
  } catch (err) {
    // 409 means devices are still attached - offer the forced path.
    if (err.status === 409 && !force) {
      confirmTarget.value = { ...confirmTarget.value, warning: err.message };
    } else {
      toasts.error('Delete failed', err.message);
    }
  } finally {
    deleting.value = false;
  }
}

function monitor(company) {
  companies.select(company._id);
  router.push({ name: 'dashboard' });
}

onMounted(() => companies.fetchAll());
</script>

<template>
  <div class="grid" style="gap: 16px">
    <div class="panel">
      <div class="panel-head">
        <h2>Company list</h2>
        <div class="row" style="gap: 8px">
          <input
            v-model="query"
            type="search"
            placeholder="Search…"
            style="width: 220px"
          />
          <select v-model="statusFilter" style="width: 150px">
            <option value="">All statuses</option>
            <option value="normal">Normal</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
            <option value="unknown">No data</option>
          </select>
          <button class="btn" @click="companies.fetchAll()">Refresh</button>
          <button v-if="auth.canWrite" class="btn primary" @click="openCreate">
            + Add company
          </button>
        </div>
      </div>

      <div class="panel-body flush table-scroll">
        <table class="data">
          <thead>
            <tr>
              <th style="width: 30%">Company</th>
              <th>Location</th>
              <th>Water intake</th>
              <th>Environment</th>
              <th>Devices</th>
              <th>Last reading</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="company in filtered" :key="company._id">
              <td>
                <div class="row" style="gap: 8px">
                  <span class="dot" :class="company.environmentStatus?.level || 'unknown'"></span>
                  <div>
                    <RouterLink :to="{ name: 'company-detail', params: { id: company._id } }">
                      <strong>{{ company.name }}</strong>
                    </RouterLink>
                    <div class="tiny dim">
                      {{ company.code }} · {{ company.industry || 'industry n/a' }}
                    </div>
                  </div>
                </div>
              </td>
              <td class="small">
                {{ company.city || '—' }}
                <div class="tiny mono dim">
                  {{ company.location.lat.toFixed(4) }}, {{ company.location.lng.toFixed(4) }}
                </div>
              </td>
              <td class="small">
                {{ company.waterIntake?.sourceType || '—' }}
                <div class="tiny dim">
                  quota {{ company.waterIntake?.quotaM3PerDay || 0 }} m³/day
                </div>
              </td>
              <td>
                <span class="badge" :class="company.environmentStatus?.level || 'unknown'">
                  {{ company.environmentStatus?.label || 'No data' }}
                </span>
                <div v-if="company.openAlerts" class="tiny dim" style="margin-top: 3px">
                  {{ company.openAlerts }} open alert(s)
                </div>
              </td>
              <td class="small nowrap">
                {{ company.devices?.online ?? 0 }}/{{ company.devices?.total ?? 0 }}
              </td>
              <td class="small nowrap">
                {{ metric('waterLevelM', company.latestReading?.waterLevelM) }}
                <div class="tiny dim">{{ relativeTime(company.latestReading?.ts) }}</div>
              </td>
              <td class="right nowrap">
                <button class="btn sm" @click="monitor(company)">Monitor</button>
                <button v-if="auth.canWrite" class="btn sm" @click="openEdit(company)">Edit</button>
                <button
                  v-if="auth.isAdmin"
                  class="btn sm danger"
                  @click="confirmTarget = company"
                >
                  Delete
                </button>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="7" class="empty">
                {{ companies.loading ? 'Loading…' : 'No companies match the current filter.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <CompanyForm
      v-if="showForm"
      :company="editing"
      :saving="saving"
      :error="formError"
      @save="save"
      @close="showForm = false"
    />

    <ModalDialog
      v-if="confirmTarget"
      title="Delete company"
      width="480px"
      @close="confirmTarget = null"
    >
      <p>
        Delete <strong>{{ confirmTarget.name }}</strong> ({{ confirmTarget.code }})?
      </p>
      <p class="small muted">
        Its devices, readings and alerts are removed as well. This cannot be undone.
      </p>
      <div v-if="confirmTarget.warning" class="alert-box error">{{ confirmTarget.warning }}</div>

      <template #footer>
        <button class="btn" @click="confirmTarget = null">Cancel</button>
        <button
          class="btn danger"
          :disabled="deleting"
          @click="confirmDelete(Boolean(confirmTarget.warning))"
        >
          {{ deleting ? 'Deleting…' : confirmTarget.warning ? 'Delete anyway' : 'Delete' }}
        </button>
      </template>
    </ModalDialog>
  </div>
</template>

<style scoped>
td .btn + .btn { margin-left: 5px; }
</style>
