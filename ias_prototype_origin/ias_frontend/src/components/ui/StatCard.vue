<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '—' },
  unit: { type: String, default: '' },
  hint: { type: String, default: '' },
  status: { type: String, default: '' } // normal | warning | critical
});
</script>

<template>
  <div class="stat">
    <div class="row" style="gap: 6px; margin-bottom: 2px">
      <span v-if="status" class="dot" :class="status"></span>
      <span class="tiny muted label">{{ label }}</span>
    </div>
    <div class="value">
      {{ value }}<span v-if="unit" class="unit">{{ unit }}</span>
    </div>
    <div v-if="hint" class="tiny dim">{{ hint }}</div>
  </div>
</template>

<style scoped>
/* Hairline surface, not a side-stripe — status is carried by the .dot, not by a coloured edge. */
.stat {
  background: var(--color-paper-2);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius);
  padding: var(--space-sm) var(--space-md);
}

.label { font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em; }

.value {
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  margin: 2px 0 1px;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink);
}
.unit { font-family: var(--font-body); font-size: var(--text-xs); font-weight: 400; color: var(--color-ink-2); margin-left: 4px; }
</style>
