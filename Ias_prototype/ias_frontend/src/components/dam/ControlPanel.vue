<script setup>
import { computed, ref, watch } from 'vue';
import { useDamStore } from '@/stores/dam';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const dam = useDamStore();
const auth = useAuthStore();
const toasts = useToastStore();

const threshMin = ref(dam.thresholdMin);
const threshMax = ref(dam.thresholdMax);

// Keep the sliders in sync with the device's authoritative values, but only
// while the operator isn't actively dragging them (dragging is tracked via
// the `interacting` flag so an in-flight drag never gets yanked mid-motion).
const interacting = ref(false);
watch(
  () => [dam.thresholdMin, dam.thresholdMax],
  ([min, max]) => {
    if (interacting.value) return;
    threshMin.value = min;
    threshMax.value = max;
  }
);

function onThresholdInput() {
  interacting.value = true;
  if (threshMin.value >= threshMax.value) threshMax.value = Number((threshMin.value + 0.3).toFixed(1));
}

async function commitThreshold() {
  interacting.value = false;
  try {
    await dam.requestThreshold(Number(threshMin.value), Number(threshMax.value));
  } catch (err) {
    toasts.error('Gagal mengubah threshold', err.message);
  }
}

const canControl = computed(() => auth.canControl);

async function setMode(mode) {
  if (mode === dam.mode) return;
  try {
    await dam.requestMode(mode);
  } catch (err) {
    toasts.error('Gagal mengubah mode', err.message);
  }
}

const manualBlocked = computed(() => dam.mode !== 'manual' || dam.deflatingMode);

async function manualCompressorOn() {
  if (manualBlocked.value || dam.compressorOn) return;
  try {
    await dam.requestCompressor(true);
  } catch (err) {
    toasts.error('Gagal menghidupkan kompresor', err.message);
  }
}

async function manualCompressorOff() {
  if (manualBlocked.value || !dam.compressorOn) return;
  try {
    await dam.requestCompressor(false);
  } catch (err) {
    toasts.error('Gagal mematikan kompresor', err.message);
  }
}

async function toggleDeflate() {
  if (dam.mode !== 'manual') return;
  try {
    await dam.requestDeflate(!dam.deflatingMode);
  } catch (err) {
    toasts.error('Gagal mengubah mode susut', err.message);
  }
}
</script>

<template>
  <div class="control-panel-wrapper">
    <div v-if="!canControl" class="panel">
      <div class="badge badge-info">Mode lihat saja - hubungi admin untuk akses kontrol</div>
    </div>

    <div class="panel">
      <div class="panel-header"><span class="panel-title">🎛️ Mode Kontrol</span></div>
      <div class="row" style="gap: 8px">
        <button
          class="btn btn-mode"
          :class="{ 'active-mode': dam.mode === 'auto' }"
          :disabled="!canControl"
          @click="setMode('auto')"
        >
          OTOMATIS
        </button>
        <button
          class="btn btn-mode"
          :class="{ 'active-mode': dam.mode === 'manual' }"
          :disabled="!canControl"
          @click="setMode('manual')"
        >
          MANUAL
        </button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><span class="panel-title">⚡ Threshold Otomatis</span></div>
      <div class="threshold-group">
        <label>
          Tekanan Minimum (ON)
          <span class="threshold-value">{{ Number(threshMin).toFixed(1) }} Bar</span>
        </label>
        <input
          v-model.number="threshMin"
          type="range"
          min="1.0"
          max="4.0"
          step="0.1"
          :disabled="!canControl"
          @input="onThresholdInput"
          @change="commitThreshold"
        />
      </div>
      <div class="threshold-group">
        <label>
          Tekanan Maksimum (OFF)
          <span class="threshold-value">{{ Number(threshMax).toFixed(1) }} Bar</span>
        </label>
        <input
          v-model.number="threshMax"
          type="range"
          min="3.0"
          max="6.0"
          step="0.1"
          :disabled="!canControl"
          @input="onThresholdInput"
          @change="commitThreshold"
        />
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">🔧 Kontrol Kompresor</span>
        <span v-if="dam.mode === 'auto'" class="badge badge-standby">Mode Otomatis</span>
      </div>
      <button
        class="btn btn-compressor-on"
        :disabled="!canControl || manualBlocked || dam.compressorOn"
        @click="manualCompressorOn"
      >
        HIDUPKAN KOMPRESOR
      </button>
      <button
        class="btn btn-compressor-off"
        style="margin-top: 7px"
        :disabled="!canControl || manualBlocked || !dam.compressorOn"
        @click="manualCompressorOff"
      >
        MATIKAN KOMPRESOR
      </button>
      <button
        class="btn btn-deflate"
        style="margin-top: 7px"
        :class="{ 'active-deflate': dam.deflatingMode }"
        :disabled="!canControl || dam.mode !== 'manual'"
        @click="toggleDeflate"
      >
        {{ dam.deflatingMode ? 'HENTIKAN SUSUT' : 'SUSUTKAN RUBBER' }}
      </button>
    </div>
  </div>
</template>
