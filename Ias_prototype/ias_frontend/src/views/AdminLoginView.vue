<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');

async function submit() {
  const ok = await auth.adminLogin(email.value.trim(), password.value);
  if (ok) router.push(route.query.redirect || { name: 'dashboard' });
}
</script>

<template>
  <div class="auth-shell">
    <div class="panel auth-card">
      <div class="brand">
        <div class="logo-icon"></div>
        <div class="logo-text">
          <h1 style="font-size: 1rem">RUBBER DAM</h1>
          <div class="subtitle">Monitoring &amp; Kontrol Otomatis</div>
        </div>
      </div>

      <h2>Admin sign in</h2>
      <p class="lede">Sign in with your administrator email and password.</p>

      <div v-if="route.query.expired" class="alert-box info">
        Your session expired. Sign in again to continue.
      </div>

      <form @submit.prevent="submit">
        <div v-if="auth.error" class="alert-box error">{{ auth.error }}</div>
        <label class="field">
          <span>Email</span>
          <input v-model="email" type="email" required autocomplete="username" />
        </label>
        <label class="field">
          <span>Password</span>
          <input v-model="password" type="password" required autocomplete="current-password" />
        </label>
        <button class="btn btn-primary" type="submit" :disabled="auth.loading">
          {{ auth.loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <div class="auth-switch">
        <RouterLink :to="{ name: 'login' }">Operator? Request a sign-in link instead</RouterLink>
      </div>
    </div>
  </div>
</template>
