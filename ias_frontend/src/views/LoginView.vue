<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const notice = ref('');

onMounted(() => {
  if (route.query.expired) notice.value = 'Your session expired, please sign in again.';
});

async function submit() {
  notice.value = '';
  const ok = await auth.login(email.value.trim(), password.value);
  if (ok) router.push(route.query.redirect || { name: 'dashboard' });
}

function useDemo(demoEmail, demoPassword) {
  email.value = demoEmail;
  password.value = demoPassword;
}
</script>

<template>
  <div class="login-page">
    <div class="login-card panel">
      <div class="login-head">
        <div class="brand-mark">IAS</div>
        <div>
          <h1>Industrial Area Sensor</h1>
          <div class="small muted">Water intake &amp; environment monitoring console</div>
        </div>
      </div>

      <form class="login-body" @submit.prevent="submit">
        <div v-if="notice" class="alert-box ok" style="margin-bottom: 14px">{{ notice }}</div>
        <div v-if="auth.error" class="alert-box error" style="margin-bottom: 14px">
          {{ auth.error }}
        </div>

        <label class="field">
          <span>Email</span>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            required
            placeholder="you@company.com"
          />
        </label>

        <label class="field">
          <span>Password</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            placeholder="••••••••"
          />
        </label>

        <button class="btn primary" style="width: 100%" :disabled="auth.loading">
          {{ auth.loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <div class="login-foot">
        <div class="tiny dim" style="margin-bottom: 8px">Demo accounts</div>
        <div class="row wrap">
          <button class="btn sm" type="button" @click="useDemo('admin@ias.local', 'Admin#12345')">
            Admin
          </button>
          <button
            class="btn sm"
            type="button"
            @click="useDemo('operator@ias.local', 'Operator#12345')"
          >
            Operator
          </button>
          <button class="btn sm" type="button" @click="useDemo('viewer@ias.local', 'Viewer#12345')">
            Viewer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: var(--space-lg);
  background:
    radial-gradient(900px 500px at 12% -10%, var(--color-accent-soft), transparent 60%),
    var(--color-paper);
}

.login-card { width: 100%; max-width: 400px; box-shadow: 0 12px 32px oklch(6% 0.01 250 / 0.5); }

.login-head {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  padding: var(--space-lg) var(--space-lg) var(--space-md);
  border-bottom: 1px solid var(--color-rule);
}
.login-head h1 { font-size: var(--text-md); }

.brand-mark {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: var(--color-accent-ink);
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: var(--text-sm);
  flex: none;
}

.login-body { padding: var(--space-lg); }
.login-foot { padding: var(--space-sm) var(--space-lg) var(--space-lg); border-top: 1px solid var(--color-rule); }
</style>
