<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useCompanyStore } from '@/stores/companies';
import { useToastStore } from '@/stores/toast';
import { useConfirmStore } from '@/stores/confirm';
import { dateTime, relativeTime } from '@/utils/format';
import ModalDialog from '@/components/ui/ModalDialog.vue';

const auth = useAuthStore();
const companies = useCompanyStore();
const toasts = useToastStore();
const confirm = useConfirmStore();

const users = ref([]);
const total = ref(0);
const loading = ref(false);
const query = ref('');
const roleFilter = ref('');
const page = ref(1);
const limit = 25;

const showForm = ref(false);
const editing = ref(null);
const saving = ref(false);
const formError = ref('');
const confirmTarget = ref(null);

const form = reactive({
  name: '',
  email: '',
  password: '',
  role: 'viewer',
  phone: '',
  active: true,
  companies: []
});

const pages = computed(() => Math.max(1, Math.ceil(total.value / limit)));

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/users', {
      params: {
        q: query.value || undefined,
        role: roleFilter.value || undefined,
        page: page.value,
        limit
      }
    });
    users.value = data.items;
    total.value = data.total;
  } catch (err) {
    toasts.error('Could not load users', err.message);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  formError.value = '';
  Object.assign(form, {
    name: '',
    email: '',
    password: '',
    role: 'viewer',
    phone: '',
    active: true,
    companies: []
  });
  showForm.value = true;
}

function openEdit(user) {
  editing.value = user;
  formError.value = '';
  Object.assign(form, {
    name: user.name,
    email: user.email,
    password: '',
    role: user.role,
    phone: user.phone || '',
    active: user.active,
    companies: (user.companies || []).map((c) => c._id || c)
  });
  showForm.value = true;
}

async function save() {
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
    const payload = { ...form };
    // An empty password field on edit means "leave it unchanged".
    if (editing.value && !payload.password) delete payload.password;

    if (editing.value) {
      await api.put(`/users/${editing.value._id}`, payload);
      toasts.success('User updated', payload.email);
    } else {
      await api.post('/users', payload);
      toasts.success('User created', payload.email);
    }
    showForm.value = false;
    await load();
  } catch (err) {
    formError.value = err.details
      ? `${err.message}: ${Object.values(err.details).join(', ')}`
      : err.message;
  } finally {
    saving.value = false;
  }
}

async function remove() {
  try {
    await api.delete(`/users/${confirmTarget.value._id}`);
    toasts.success('User deleted', confirmTarget.value.email);
    confirmTarget.value = null;
    await load();
  } catch (err) {
    toasts.error('Delete failed', err.message);
  }
}

const roleBadge = { admin: 'critical', operator: 'warning', viewer: 'info' };

onMounted(async () => {
  if (!companies.items.length) await companies.fetchAll();
  await load();
});

watch([query, roleFilter], () => {
  page.value = 1;
  load();
});
watch(page, load);
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h2>User management</h2>
      <div class="row" style="gap: 8px">
        <input v-model="query" type="search" placeholder="Search name or email…" style="width: 220px" />
        <select v-model="roleFilter" style="width: 140px">
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="operator">Operator</option>
          <option value="viewer">Viewer</option>
        </select>
        <button class="btn primary" @click="openCreate">+ Add user</button>
      </div>
    </div>

    <div class="panel-body flush table-scroll">
      <table class="data">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Site access</th>
            <th>Status</th>
            <th>Last login</th>
            <th>Created</th>
            <th class="right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user._id">
            <td>
              <strong class="small">{{ user.name }}</strong>
              <div class="tiny dim">{{ user.email }}</div>
            </td>
            <td><span class="badge" :class="roleBadge[user.role]">{{ user.role }}</span></td>
            <td class="small">
              <span v-if="!user.companies?.length" class="dim">All sites</span>
              <span v-else>{{ user.companies.map((c) => c.code || c).join(', ') }}</span>
            </td>
            <td>
              <span class="badge" :class="user.active ? 'normal' : 'unknown'">
                {{ user.active ? 'active' : 'disabled' }}
              </span>
            </td>
            <td class="small">{{ relativeTime(user.lastLoginAt) }}</td>
            <td class="small">{{ dateTime(user.createdAt) }}</td>
            <td class="right nowrap">
              <button class="btn sm" @click="openEdit(user)">Edit</button>
              <button
                class="btn sm danger"
                :disabled="user._id === auth.user?._id"
                :title="user._id === auth.user?._id ? 'You cannot delete your own account' : ''"
                @click="confirmTarget = user"
              >
                Delete
              </button>
            </td>
          </tr>
          <tr v-if="!users.length">
            <td colspan="7" class="empty">{{ loading ? 'Loading…' : 'No users found.' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="row" style="padding: 10px 14px; border-top: 1px solid var(--border-soft)">
      <span class="tiny dim">{{ total }} user(s)</span>
      <div class="spacer"></div>
      <button class="btn sm" :disabled="page <= 1" @click="page--">Previous</button>
      <span class="tiny muted">Page {{ page }} of {{ pages }}</span>
      <button class="btn sm" :disabled="page >= pages" @click="page++">Next</button>
    </div>
  </div>

  <ModalDialog
    v-if="showForm"
    :title="editing ? `Edit ${editing.name}` : 'Add user'"
    width="560px"
    @close="showForm = false"
  >
    <div v-if="formError" class="alert-box error" style="margin-bottom: 14px">{{ formError }}</div>

    <form id="user-form" @submit.prevent="save">
      <label class="field">
        <span>Full name *</span>
        <input v-model="form.name" required minlength="2" />
      </label>
      <label class="field">
        <span>Email *</span>
        <input v-model="form.email" type="email" required />
      </label>
      <label class="field">
        <span>{{ editing ? 'New password (leave blank to keep)' : 'Password *' }}</span>
        <input
          v-model="form.password"
          type="password"
          :required="!editing"
          minlength="8"
          autocomplete="new-password"
          placeholder="At least 8 characters"
        />
      </label>
      <label class="field">
        <span>Role *</span>
        <select v-model="form.role">
          <option value="admin">Admin — full access, user and audit management</option>
          <option value="operator">Operator — monitor, edit sites, acknowledge alerts</option>
          <option value="viewer">Viewer — read-only monitoring and reports</option>
        </select>
      </label>
      <label class="field">
        <span>Phone</span>
        <input v-model="form.phone" />
      </label>
      <label class="field">
        <span>Site access (leave empty for all sites)</span>
        <select v-model="form.companies" multiple size="5">
          <option v-for="c in companies.items" :key="c._id" :value="c._id">
            {{ c.name }} ({{ c.code }})
          </option>
        </select>
      </label>
      <label class="row" style="gap: 8px">
        <input v-model="form.active" type="checkbox" />
        <span class="small">Account active</span>
      </label>
    </form>

    <template #footer>
      <button class="btn" @click="showForm = false">Cancel</button>
      <button class="btn primary" form="user-form" type="submit" :disabled="saving">
        {{ saving ? 'Saving…' : editing ? 'Save changes' : 'Create user' }}
      </button>
    </template>
  </ModalDialog>

  <ModalDialog v-if="confirmTarget" title="Delete user" width="440px" @close="confirmTarget = null">
    <p>
      Delete <strong>{{ confirmTarget.name }}</strong> ({{ confirmTarget.email }})?
    </p>
    <p class="small muted">Their audit trail entries are kept for compliance.</p>
    <template #footer>
      <button class="btn" @click="confirmTarget = null">Cancel</button>
      <button class="btn danger" @click="remove">Delete</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
td .btn + .btn { margin-left: 5px; }
select[multiple] { padding: 4px; }
</style>
