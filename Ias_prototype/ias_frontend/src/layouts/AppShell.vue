<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useDamStore } from '@/stores/dam';
import { useConfirmStore } from '@/stores/confirm';

const auth = useAuthStore();
const dam = useDamStore();
const confirm = useConfirmStore();
const router = useRouter();

const now = ref(new Date());
let clockTimer = null;

const timeLabel = computed(() =>
  now.value.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
);

// Session countdown, derived straight from the token's own `exp` claim -
// ticks off the same 1s clock timer below rather than a second interval.
const secondsLeft = computed(() => {
  if (!auth.expiresAt) return null;
  return Math.max(0, Math.round((auth.expiresAt - now.value.getTime()) / 1000));
});

const sessionLabel = computed(() => {
  if (secondsLeft.value === null) return '--:--';
  const m = Math.floor(secondsLeft.value / 60)
    .toString()
    .padStart(2, '0');
  const s = (secondsLeft.value % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
});

// Under a minute left - give the operator a visual heads-up before it logs
// them out mid-task.
const sessionLow = computed(() => secondsLeft.value !== null && secondsLeft.value <= 60);

async function logout() {
  const ok = await confirm.ask({
    title: 'Sign out',
    message: 'You will need to sign in again to access the console. Sign out now?',
    confirmLabel: 'Sign out',
    danger: true
  });
  if (!ok) return;

  await auth.logout();
  router.push({ name: 'login' });
}

let loggedOutForExpiry = false;

onMounted(() => {
  // The socket connection itself is established by the auth store on
  // login/restore; this just wires the dam store's listeners onto it.
  dam.wireSocket();
  clockTimer = setInterval(() => {
    now.value = new Date();

    // Auto-logout the moment the session token expires - no confirmation
    // prompt (there is nothing left to confirm, the server will reject the
    // token anyway), just a clean drop back to the login screen.
    if (!loggedOutForExpiry && secondsLeft.value === 0) {
      loggedOutForExpiry = true;
      auth.clear();
      router.push({ name: 'login', query: { expired: '1' } });
    }
  }, 1000);
});

onBeforeUnmount(() => {
  dam.teardownSocket();
  clearInterval(clockTimer);
});
</script>

<template>
  <header class="header">
    <div class="logo-area">
      <div class="logo-icon"></div>
      <div class="logo-text">
        <h1>RUBBER DAM</h1>
        <div class="subtitle">Monitoring &amp; Kontrol Otomatis</div>
      </div>
    </div>

    <nav class="nav-links">
      <RouterLink :to="{ name: 'dashboard' }" class="nav-link" active-class="active-link">Dashboard</RouterLink>
      <RouterLink v-if="auth.isAdmin" :to="{ name: 'users' }" class="nav-link" active-class="active-link">
        Users
      </RouterLink>
    </nav>

    <div class="status-bar">
      <span class="badge" :class="dam.socketConnected ? 'badge-active' : 'badge-standby'">
        {{ dam.socketConnected ? 'TERHUBUNG' : 'TERPUTUS' }}
      </span>
      <span class="time-display">{{ timeLabel }}</span>
      <span
        class="time-display session-countdown"
        :class="{ low: sessionLow }"
        :title="sessionLow ? 'Session expiring soon - sign in again to stay logged in' : 'Time left in this session'"
      >
        ⏳ {{ sessionLabel }}
      </span>
      <div class="user-chip">
        <div class="who">
          <div class="name">{{ auth.user?.name }}</div>
          <div class="role">{{ auth.role }}</div>
        </div>
        <button class="btn-download" title="Sign out" @click="logout">⏻</button>
      </div>
    </div>
  </header>

  <RouterView />
</template>

<style scoped>
.session-countdown {
  transition: color 0.2s, border-color 0.2s;
}
.session-countdown.low {
  color: var(--accent-red);
  border-color: rgba(255, 61, 79, 0.4);
  animation: pulse-deflate 1s infinite;
}
</style>
