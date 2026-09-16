<script setup>
import { computed } from 'vue';
import { useDamStore } from '@/stores/dam';

const dam = useDamStore();

const compressorLabel = computed(() => {
  if (dam.deflatingMode) return 'SUSUT';
  return dam.compressorOn ? 'ON' : 'OFF';
});

const compressorBadge = computed(() => {
  if (dam.deflatingMode) return 'SUSUT';
  if (dam.compressorOn) return 'BEROPERASI';
  return dam.maintainPressure ? 'DITAHAN' : 'SIAGA';
});
</script>

<template>
  <div class="cards-row">
    <div class="info-card">
      <div class="card-label">Tekanan Rubber</div>
      <div class="card-value value-pressure">{{ dam.pressure.toFixed(2) }}</div>
      <span class="card-unit">Bar</span>
    </div>
    <div class="info-card">
      <div class="card-label">Ketinggian Air Hulu</div>
      <div class="card-value value-water">{{ dam.waterLevel.toFixed(2) }}</div>
      <span class="card-unit">Meter</span>
    </div>
    <div class="info-card">
      <div class="card-label">Status Kompresor</div>
      <div class="card-value value-compressor" :class="{ off: !dam.compressorOn || dam.deflatingMode }">
        {{ compressorLabel }}
      </div>
      <span class="card-unit">{{ compressorBadge }}</span>
    </div>
    <div class="info-card">
      <div class="card-label">Mode Operasi</div>
      <div class="card-value value-status">{{ dam.mode === 'auto' ? 'Otomatis' : 'Manual' }}</div>
      <span class="card-unit">Aktif</span>
    </div>
    <div class="info-card">
      <div class="card-label">Kekuatan Rubber</div>
      <div class="card-value value-strength">{{ dam.rubberStrength.toFixed(1) }}</div>
      <span class="card-unit">%</span>
    </div>
    <div class="info-card">
      <div class="card-label">Ketinggian Rubber</div>
      <div class="card-value value-height">{{ dam.rubberHeight.toFixed(2) }}</div>
      <span class="card-unit">Meter</span>
    </div>
  </div>
</template>
