<script setup>
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const email = ref('');
const sent = ref(false);

async function submit() {
  sent.value = false;
  const ok = await auth.requestMagicLink(email.value.trim());
  if (ok) sent.value = true;
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

      <h2>Operator sign in</h2>
      <p class="lede">Enter your email and we'll send you a one-time sign-in link.</p>

      <div v-if="sent" class="alert-box success">
        If that email is registered, a sign-in link has been sent. Check your inbox (and the
        server logs, if this is a local dev environment without SMTP configured) and open the
        link within 10 minutes.
      </div>

      <form v-else @submit.prevent="submit">
        <div v-if="auth.error" class="alert-box error">{{ auth.error }}</div>
        <label class="field">
          <span>Email</span>
          <input v-model="email" type="email" required autocomplete="email" placeholder="you@example.com" />
        </label>
        <button class="btn btn-primary" type="submit" :disabled="auth.loading">
          {{ auth.loading ? 'Sending…' : 'Send sign-in link' }}
        </button>
      </form>

      <div class="auth-switch">
        <RouterLink :to="{ name: 'login-admin' }">Sign in as admin instead</RouterLink>
      </div>
    </div>
  </div>
</template>
