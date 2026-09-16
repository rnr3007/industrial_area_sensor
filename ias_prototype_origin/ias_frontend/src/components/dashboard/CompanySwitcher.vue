<script setup>
import { computed, ref } from 'vue';
import { metric, relativeTime } from '@/utils/format';

const props = defineProps({
  companies: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' }
});

const emit = defineEmits(['select']);

const query = ref('');

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = q
    ? props.companies.filter((c) =>
        [c.name, c.code, c.city].filter(Boolean).some((v) => v.toLowerCase().includes(q))
      )
    : [...props.companies];

  // Sites in trouble float to the top - that is what an operator needs first.
  const rank = { critical: 0, warning: 1, normal: 2, unknown: 3 };
  return list.sort(
    (a, b) =>
      (rank[a.environmentStatus?.level] ?? 9) - (rank[b.environmentStatus?.level] ?? 9) ||
      a.name.localeCompare(b.name)
  );
});
</script>

<template>
  <div class="panel company-panel">
    <div class="panel-head">
      <h2>Companies</h2>
      <span class="tiny dim">{{ companies.length }} site(s)</span>
    </div>

    <div style="padding: 10px 12px; border-bottom: 1px solid var(--border-soft)">
      <input v-model="query" type="search" placeholder="Search site, code or city…" />
    </div>

    <div class="list">
      <button
        v-for="company in filtered"
        :key="company._id"
        class="company"
        :class="{ active: company._id === selectedId }"
        @click="emit('select', company._id)"
      >
        <span class="dot" :class="company.environmentStatus?.level || 'unknown'"></span>

        <span class="info">
          <span class="row" style="gap: 6px">
            <strong class="small">{{ company.name }}</strong>
            <span class="badge muted tiny">{{ company.code }}</span>
          </span>
          <span class="tiny dim">
            {{ company.city || '—' }} ·
            {{ company.devices?.online ?? 0 }}/{{ company.devices?.total ?? 0 }} devices online
          </span>
          <span class="tiny muted">
            Level {{ metric('waterLevelM', company.latestReading?.waterLevelM) }} ·
            {{ relativeTime(company.latestReading?.ts) }}
          </span>
        </span>

        <span v-if="company.openAlerts" class="badge" :class="company.criticalAlerts ? 'critical' : 'warning'">
          {{ company.openAlerts }}
        </span>
      </button>

      <div v-if="!filtered.length" class="empty tiny">No matching sites</div>
    </div>
  </div>
</template>

<style scoped>
.company-panel { display: flex; flex-direction: column; }
.list { overflow: auto; flex: 1; }

.company {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-rule);
  border-left: 2px solid transparent;
  color: var(--color-ink);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: background-color var(--dur-short) var(--ease-out);
}
.company:hover { background: var(--color-paper-3); }
.company:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -2px; }
.company.active { background: var(--color-accent-soft); border-left-color: var(--color-accent); }

.company .dot { margin-top: 5px; }
.info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
