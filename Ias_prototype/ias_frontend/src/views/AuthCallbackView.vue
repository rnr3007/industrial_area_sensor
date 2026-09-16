<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const failed = ref(false);

onMounted(async () => {
  const token = route.query.token;
  if (!token) {
    failed.value = true;
    return;
  }
  const ok = await auth.consumeMagicLink(String(token));
  if (ok) {
    router.replace({ name: 'dashboard' });
  } else {
    failed.value = true;
  }
});
</script>

<template>
  <div class="auth-shell">
    <div class="panel auth-card" style="text-align: center">
      <template v-if="!failed">
        <div class="brand" style="justify-content: center">
          <div class="logo-icon"></div>
        </div>
        <h2>Signing you in…</h2>
        <p class="lede">Verifying your sign-in link.</p>
      </template>
      <template v-else>
        <h2>This link didn't work</h2>
        <div class="alert-box error">{{ auth.error || 'The sign-in link is invalid, expired, or already used.' }}</div>
        <RouterLink :to="{ name: 'login' }" class="btn btn-primary" style="text-decoration: none">
          Request a new link
        </RouterLink>
      </template>
    </div>
  </div>
</template>
