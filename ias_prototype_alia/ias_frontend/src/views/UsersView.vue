<script setup>
import { onMounted, reactive, ref } from 'vue';
import api from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useConfirmStore } from '@/stores/confirm';
import ModalDialog from '@/components/ui/ModalDialog.vue';

const auth = useAuthStore();
const toasts = useToastStore();
const confirm = useConfirmStore();

const users = ref([]);
const loading = ref(false);

const showForm = ref(false);
const editing = ref(null);
const saving = ref(false);
const formError = ref('');

const ROLE_LABEL = { admin: 'Admin', operator: 'Operator', guest_operator: 'Guest operator' };
const ROLE_BADGE = { admin: 'badge-danger', operator: 'badge-active', guest_operator: 'badge-info' };

const blankForm = () => ({ email: '', name: '', role: 'operator', password: '', active: true });
const form = reactive(blankForm());

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/users');
    users.value = data.items;
  } catch (err) {
    toasts.error('Could not load users', err.message);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  formError.value = '';
  Object.assign(form, blankForm());
  showForm.value = true;
}

function openEdit(user) {
  editing.value = user;
  formError.value = '';
  Object.assign(form, { email: user.email, name: user.name, role: user.role, password: '', active: user.active });
  showForm.value = true;
}

async function save() {
  saving.value = true;
  formError.value = '';
  try {
    if (editing.value) {
      const payload = { email: form.email, name: form.name, role: form.role, active: form.active };
      if (form.password) payload.password = form.password;
      await api.put(`/users/${editing.value.id}`, payload);
      toasts.success('User updated', form.email);
    } else {
      const payload = { email: form.email, name: form.name || undefined, role: form.role };
      if (form.role === 'admin') payload.password = form.password;
      await api.post('/users', payload);
      toasts.success('User created', form.email);
    }
    showForm.value = false;
    await load();
  } catch (err) {
    formError.value = err.details ? `${err.message}: ${Object.values(err.details).join(', ')}` : err.message;
  } finally {
    saving.value = false;
  }
}

async function remove(user) {
  const ok = await confirm.ask({
    title: 'Delete user',
    message: `Delete ${user.name} (${user.email})? They will immediately lose access.`,
    confirmLabel: 'Delete',
    danger: true
  });
  if (!ok) return;

  try {
    await api.delete(`/users/${user.id}`);
    toasts.success('User deleted', user.email);
    await load();
  } catch (err) {
    toasts.error('Delete failed', err.message);
  }
}

onMounted(load);
</script>

<template>
  <div class="main-grid single-column">
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Users &amp; roles</span>
        <button class="btn btn-primary" style="width: auto" @click="openCreate">+ Add user</button>
      </div>

      <div class="table-scroll">
        <table class="data">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>
                <strong class="small">{{ user.name }}</strong>
                <div class="tiny dim">{{ user.email }}</div>
              </td>
              <td><span class="badge" :class="ROLE_BADGE[user.role]">{{ ROLE_LABEL[user.role] }}</span></td>
              <td>
                <span class="badge" :class="user.active ? 'badge-active' : 'badge-standby'">
                  {{ user.active ? 'active' : 'disabled' }}
                </span>
              </td>
              <td class="right">
                <div class="row-actions">
                  <button class="btn btn-ghost" @click="openEdit(user)">Edit</button>
                  <button
                    class="btn btn-danger"
                    :disabled="user.id === auth.user?.id"
                    :title="user.id === auth.user?.id ? 'You cannot delete your own account' : ''"
                    @click="remove(user)"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!users.length">
              <td colspan="4" class="empty">{{ loading ? 'Loading…' : 'No users yet.' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <ModalDialog v-if="showForm" :title="editing ? `Edit ${editing.name}` : 'Add user'" @close="showForm = false">
    <div v-if="formError" class="alert-box error">{{ formError }}</div>

    <form id="user-form" @submit.prevent="save">
      <label class="field">
        <span>Email *</span>
        <input v-model="form.email" type="email" required />
        <span v-if="editing" class="hint">Changing this changes where their sign-in link is sent.</span>
      </label>

      <label class="field">
        <span>Name{{ form.role === 'guest_operator' ? ' (optional)' : ' *' }}</span>
        <input v-model="form.name" :required="form.role !== 'guest_operator'" placeholder="Defaults to the email address" />
      </label>

      <label class="field">
        <span>Role *</span>
        <select v-model="form.role">
          <option value="admin">Admin — password login, full access + user management</option>
          <option value="operator">Operator — magic-link login, dashboard access</option>
          <option value="guest_operator">Guest operator — magic-link login, view only</option>
        </select>
      </label>

      <label v-if="form.role === 'admin'" class="field">
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
      <p v-else class="hint">
        {{ form.role === 'guest_operator' ? 'Guest operators only need an email — they sign in via a one-time link.' : 'Operators sign in via a one-time email link, no password needed.' }}
      </p>

      <label v-if="editing" class="row" style="gap: 8px; margin-top: 6px">
        <input v-model="form.active" type="checkbox" style="width: auto; min-height: auto" />
        <span class="small">Account active</span>
      </label>
    </form>

    <template #footer>
      <button class="btn btn-ghost" style="width: auto" @click="showForm = false">Cancel</button>
      <button class="btn btn-primary" style="width: auto" form="user-form" type="submit" :disabled="saving">
        {{ saving ? 'Saving…' : editing ? 'Save changes' : 'Create user' }}
      </button>
    </template>
  </ModalDialog>
</template>
