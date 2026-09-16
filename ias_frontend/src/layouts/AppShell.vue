<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAlertStore } from '@/stores/alerts';
import { useCompanyStore } from '@/stores/companies';
import { useToastStore } from '@/stores/toast';
import { useConfirmStore } from '@/stores/confirm';
import { getSocket, onSocket } from '@/services/socket';

const auth = useAuthStore();
const alerts = useAlertStore();
const companies = useCompanyStore();
const toasts = useToastStore();
const confirm = useConfirmStore();
const router = useRouter();

const connected = ref(false);
const offs = [];

const nav = computed(() =>
  [
    { name: 'dashboard', label: 'Dashboard', icon: '▦' },
    { name: 'companies', label: 'Companies', icon: '▤' },
    { name: 'alerts', label: 'Early warning', icon: '⚠', badge: alerts.stats.open },
    { name: 'reports', label: 'Reports', icon: '⎙' },
    { name: 'users', label: 'Users', icon: '◍', admin: true },
    { name: 'audit-trail', label: 'Audit trail', icon: '☷', admin: true }
  ].filter((item) => !item.admin || auth.isAdmin)
);

async function logout() {
  const ok = await confirm.ask({
    title: 'Sign out',
    message: 'You will need to log in again to access the console. Sign out now?',
    confirmLabel: 'Sign out',
    danger: true
  });
  if (!ok) return;

  await auth.logout();
  router.push({ name: 'login' });
}

onMounted(async () => {
  await Promise.all([companies.fetchAll(), alerts.fetchStats()]);

  const socket = getSocket();
  connected.value = Boolean(socket?.connected);

  offs.push(
    onSocket('connect', () => {
      connected.value = true;
    }),
    onSocket('disconnect', () => {
      connected.value = false;
    }),
    // Alerts are global: an operator watching site A must still be told that
    // site B breached a limit.
    onSocket('alert:new', (alert) => {
      alerts.pushLive(alert);
      toasts.push({
        title: `${alert.severity === 'critical' ? 'CRITICAL' : 'Warning'} - ${alert.companyName}`,
        message: alert.message,
        type: alert.severity === 'critical' ? 'critical' : 'warning',
        timeout: alert.severity === 'critical' ? 12000 : 7000
      });
    })
  );
});

onUnmounted(() => offs.forEach((off) => off?.()));
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">IAS</div>
        <div>
          <div class="brand-title">Industrial Area Sensor</div>
          <div class="tiny dim">Water &amp; environment monitoring</div>
        </div>
      </div>

      <nav>
        <RouterLink v-for="item in nav" :key="item.name" :to="{ name: item.name }" class="nav-item">
          <span class="nav-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
          <span v-if="item.badge" class="badge critical" style="margin-left: auto">
            {{ item.badge }}
          </span>
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        <div class="row tiny">
          <span class="dot" :class="connected ? 'ok pulse' : 'offline'"></span>
          <span :class="connected ? 'muted' : 'dim'">
            {{ connected ? 'Live stream connected' : 'Live stream offline' }}
          </span>
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <h1>{{ $route.meta.title }}</h1>
        <div class="spacer"></div>

        <div class="alert-pills tiny">
          <span class="badge critical">{{ alerts.stats.bySeverity.critical }} critical</span>
          <span class="badge warning">{{ alerts.stats.bySeverity.warning }} warning</span>
        </div>

        <div class="user-chip">
          <div>
            <div class="small">{{ auth.user?.name }}</div>
            <div class="tiny dim">{{ auth.role }}</div>
          </div>
          <button class="btn sm ghost" title="Sign out" @click="logout">⏻</button>
        </div>
      </header>

      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 248px 1fr;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--color-paper-2);
  border-right: 1px solid var(--color-rule);
  padding: var(--space-md) var(--space-sm);
}

.brand {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  padding: var(--space-2xs) var(--space-xs) var(--space-lg);
}
.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: var(--color-accent-ink);
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: var(--text-xs);
  letter-spacing: 0.04em;
  flex: none;
}
.brand-title { font-family: var(--font-display); font-size: var(--text-sm); font-weight: 600; }

nav { display: flex; flex-direction: column; gap: 2px; }

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  border-left: 2px solid transparent;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  text-decoration: none;
  transition: background-color var(--dur-short) var(--ease-out), color var(--dur-short) var(--ease-out);
}
.nav-item:hover { background: var(--color-paper-3); color: var(--color-ink); text-decoration: none; }
.nav-item:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.nav-item.router-link-exact-active {
  background: var(--color-accent-soft);
  border-left-color: var(--color-accent);
  color: var(--color-ink);
}
.nav-icon { width: 16px; text-align: center; opacity: 0.85; }

.sidebar-foot { margin-top: auto; padding: var(--space-sm) var(--space-xs) var(--space-2xs); border-top: 1px solid var(--color-rule); }

.main { display: flex; flex-direction: column; overflow: hidden; }

.topbar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 0 var(--space-lg);
  height: 56px;
  border-bottom: 1px solid var(--color-rule);
  background: var(--color-paper-2);
  flex: none;
}

.alert-pills { display: flex; gap: var(--space-2xs); }

.user-chip {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding-left: var(--space-md);
  border-left: 1px solid var(--color-rule);
}

.content { flex: 1; overflow: auto; padding: var(--space-lg); }

@media (max-width: 900px) {
  .shell { grid-template-columns: 64px 1fr; }
  .brand-title, .brand div div, .nav-item span:not(.nav-icon):not(.badge), .sidebar-foot span:last-child { display: none; }
  .alert-pills { display: none; }
}
</style>
