<script setup>
import { computed } from 'vue';
import { useAliaStore } from '@/stores/alia';

const alia = useAliaStore();

// Mirrors the firmware's own dashboard: a real link failure is the only
// thing that gets the red "err" treatment; IDLE/OVER (both real sensor
// states, link still up) share the amber "idle" treatment.
const lcdClass = computed(() => {
  if (!alia.linkConnected) return 'err';
  if (alia.status === 'IDLE' || alia.status === 'OVER') return 'idle';
  return '';
});

const runLabel = computed(() => {
  if (!alia.linkConnected) return 'ERR';
  return alia.status;
});

const statusLabel = computed(() => {
  if (!alia.linkConnected) return 'LINK ERR';
  if (alia.status === 'IDLE') return 'NO SIGNAL';
  if (alia.status === 'OVER') return 'OVER RANGE';
  return 'LINK OK';
});
</script>

<template>
  <div class="meter">
    <div class="meter-head">
      <span class="model">ALIA AUF750</span>
      <span>TOYA Teknologi</span>
    </div>

    <div class="lcd" :class="lcdClass">
      <div class="lcd-row lcd-q1">
        <span class="lcd-tag">Q</span>
        <span class="lcd-digits">
          <i class="lcd-ghost">8888.888</i>
          <span class="lcd-val">{{ alia.flowRate.toFixed(3) }}</span>
        </span>
        <span class="lcd-unit">m&sup3;/h</span>
      </div>
      <div class="lcd-sub">{{ alia.flowLpm.toFixed(3) }} L/min &nbsp;|&nbsp; {{ alia.flowLps.toFixed(3) }} L/s</div>

      <div class="lcd-sep"></div>

      <div class="lcd-row lcd-q2">
        <span class="lcd-tag">&Sigma;</span>
        <span class="lcd-digits">
          <i class="lcd-ghost">88888.888</i>
          <span class="lcd-val">{{ alia.totalM3.toFixed(3) }}</span>
        </span>
        <span class="lcd-unit">m&sup3;</span>
      </div>
      <div class="lcd-sub">{{ alia.totalLiters.toFixed(2) }} Liter</div>

      <div class="lcd-sep"></div>

      <div class="lcd-status">
        <span><span class="lcd-dot"></span><span class="lcd-run">{{ runLabel }}</span></span>
        <span>{{ statusLabel }}</span>
        <span>{{ alia.currentMA.toFixed(2) }} mA</span>
      </div>
    </div>
  </div>
</template>
