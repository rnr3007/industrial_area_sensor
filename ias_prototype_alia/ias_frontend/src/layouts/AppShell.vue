<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAliaStore } from '@/stores/alia';
import { useConfirmStore } from '@/stores/confirm';

const auth = useAuthStore();
const alia = useAliaStore();
const confirm = useConfirmStore();
const router = useRouter();

const now = ref(new Date());
let clockTimer = null;
let loggedOutForExpiry = false;

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

const timeLabel = computed(() => {
  const d = now.value;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
});

const secondsLeft = computed(() => {
  if (!auth.expiresAt) return null;
  return Math.max(0, Math.round((auth.expiresAt - now.value.getTime()) / 1000));
});

const sessionLabel = computed(() => {
  if (secondsLeft.value === null) return '--:--';
  const m = Math.floor(secondsLeft.value / 60).toString().padStart(2, '0');
  const s = (secondsLeft.value % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
});

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

onMounted(() => {
  alia.wireSocket();
  clockTimer = setInterval(() => {
    now.value = new Date();

    if (!loggedOutForExpiry && secondsLeft.value === 0) {
      loggedOutForExpiry = true;
      auth.clear();
      router.push({ name: 'login', query: { expired: '1' } });
    }
  }, 1000);
});

onBeforeUnmount(() => {
  alia.teardownSocket();
  clearInterval(clockTimer);
});
</script>

<template>
  <header class="header">
    <div class="logo-area">
      <div class="logo-icon"></div>
      <div class="logo-text">
        <h1>TOYA<span class="brand-acc">Teknologi</span></h1>
        <div class="subtitle">Alia AUF750 &middot; Flow Meter Monitoring</div>
      </div>
    </div>

    <nav class="nav-links">
      <RouterLink :to="{ name: 'dashboard' }" class="nav-link" active-class="active-link">Dashboard</RouterLink>
      <RouterLink v-if="auth.isAdmin" :to="{ name: 'users' }" class="nav-link" active-class="active-link">
        Users
      </RouterLink>
    </nav>

    <div class="status-bar">
      <span class="badge" :class="alia.socketConnected ? 'badge-active' : 'badge-standby'">
        {{ alia.socketConnected ? 'SOCKET TERHUBUNG' : 'SOCKET TERPUTUS' }}
      </span>
      <span class="time-display">{{ timeLabel }}</span>
      <span class="time-display" :class="{ low: sessionLow }" title="Time left in this session">
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
