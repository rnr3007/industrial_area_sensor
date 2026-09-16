<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '@/api/client';
import { onSocket } from '@/services/socket';
import { useToastStore } from '@/stores/toast';
import { useAuthStore } from '@/stores/auth';
import { dateTime, relativeTime } from '@/utils/format';

const props = defineProps({
  company: { type: Object, default: null }
});

const toasts = useToastStore();
const auth = useAuthStore();

const frames = ref([]);
const selectedIndex = ref(0);
const live = ref(true);
const loading = ref(false);
const requesting = ref(false);
const cameras = ref([]);
const activeCamera = ref('');
const offSnapshot = ref(null);
const tickTimer = ref(null);
const now = ref(Date.now());

const current = computed(() => frames.value[selectedIndex.value] || null);

// Referenced so the "x ago" label re-renders on the ticker.
const age = computed(() => {
  void now.value;
  return current.value ? relativeTime(current.value.ts) : '—';
});

const cameraDevice = computed(
  () => props.company?.devices?.find((d) => d.type === 'dualcam') || null
);

async function load() {
  if (!props.company?._id) return;
  loading.value = true;
  try {
    const { data } = await api.get(`/telemetry/${props.company._id}/snapshots`, {
      params: { limit: 12 }
    });
    frames.value = data.items;
    selectedIndex.value = 0;
    cameras.value = [...new Set(data.items.map((f) => f.camera))];
    if (!activeCamera.value) activeCamera.value = cameras.value[0] || 'front';
  } finally {
    loading.value = false;
  }
}

/** Ask the camera for a fresh frame over MQTT. */
async function capture() {
  if (!cameraDevice.value) {
    toasts.error('No camera', 'This site has no DualCam device registered.');
    return;
  }
  requesting.value = true;
  try {
    await api.post(`/devices/${cameraDevice.value._id}/command`, { command: 'capture' });
    toasts.push({ title: 'Capture requested', message: 'Waiting for the next frame…' });
  } catch (err) {
    toasts.error('Capture failed', err.message);
  } finally {
    requesting.value = false;
  }
}

onMounted(() => {
  load();

  offSnapshot.value = onSocket('snapshot', (frame) => {
    if (frame.company !== props.company?._id) return;
    frames.value.unshift(frame);
    if (frames.value.length > 24) frames.value.pop();
    // Jump to the newest frame only while the operator is in live mode.
    if (live.value) selectedIndex.value = 0;
    else selectedIndex.value += 1;
  });

  tickTimer.value = setInterval(() => {
    now.value = Date.now();
  }, 5000);
});

watch(() => props.company?._id, load);

onBeforeUnmount(() => {
  offSnapshot.value?.();
  clearInterval(tickTimer.value);
});
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h2>CCTV monitor</h2>
      <div class="row" style="gap: 6px">
        <span class="badge" :class="live ? 'critical' : 'muted'">
          <span class="dot" :class="live ? 'critical pulse' : 'offline'"></span>
          {{ live ? 'LIVE' : 'PAUSED' }}
        </span>
        <button class="btn sm" @click="live = !live">{{ live ? 'Pause' : 'Resume' }}</button>
        <button
          v-if="auth.canWrite"
          class="btn sm"
          :disabled="requesting"
          title="Request a fresh frame from the DualCam"
          @click="capture"
        >
          {{ requesting ? '…' : 'Capture' }}
        </button>
      </div>
    </div>

    <div class="panel-body flush">
      <div class="viewer">
        <img v-if="current" :src="current.dataUrl" :alt="`Frame from ${current.deviceId}`" />
        <div v-else class="no-signal">
          <div class="bars"><i></i><i></i><i></i><i></i></div>
          <div class="small">{{ loading ? 'Connecting to camera…' : 'No signal' }}</div>
          <div class="tiny dim" v-if="!loading">
            The DualCam has not sent a frame yet for this site.
          </div>
        </div>

        <div v-if="current" class="osd">
          <div class="row tiny">
            <span class="mono">{{ current.deviceId }}</span>
            <span class="dim">·</span>
            <span class="mono">CAM-{{ (current.camera || 'front').toUpperCase() }}</span>
            <span class="spacer"></span>
            <span class="mono">{{ dateTime(current.ts) }}</span>
          </div>
        </div>
      </div>

      <div class="filmstrip">
        <div class="tiny dim" style="padding: 0 4px">
          {{ frames.length }} frame(s) · newest {{ age }}
        </div>
        <div class="thumbs">
          <button
            v-for="(frame, index) in frames"
            :key="frame._id || index"
            class="thumb"
            :class="{ active: index === selectedIndex }"
            @click="((selectedIndex = index), (live = index === 0))"
          >
            <img :src="frame.dataUrl" alt="" />
          </button>
          <div v-if="!frames.length" class="tiny dim" style="padding: 12px">No stored frames</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.viewer {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--color-paper);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.viewer img { width: 100%; height: 100%; object-fit: cover; display: block; }

.osd {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: var(--space-xs) var(--space-sm);
  background: linear-gradient(transparent, oklch(6% 0.01 250 / 0.78));
  color: var(--color-ink-2);
  font-family: var(--font-mono);
}

.no-signal { text-align: center; color: var(--color-muted); padding: var(--space-xl); }
.bars { display: flex; gap: 4px; justify-content: center; margin-bottom: var(--space-sm); }
.bars i {
  width: 10px;
  height: 34px;
  background: repeating-linear-gradient(180deg, var(--color-paper-3) 0 6px, var(--color-rule) 6px 12px);
  border-radius: 2px;
  animation: flicker 1.1s infinite alternate;
}
.bars i:nth-child(2) { animation-delay: 0.15s; }
.bars i:nth-child(3) { animation-delay: 0.3s; }
.bars i:nth-child(4) { animation-delay: 0.45s; }
@keyframes flicker { from { opacity: 0.3; } to { opacity: 0.85; } }
@media (prefers-reduced-motion: reduce) { .bars i { animation: none; opacity: 0.6; } }

.filmstrip { padding: var(--space-sm) var(--space-sm) var(--space-sm); border-top: 1px solid var(--color-rule); }
.thumbs { display: flex; gap: var(--space-2xs); overflow-x: auto; padding: var(--space-xs) 2px 2px; }

.thumb {
  flex: none;
  width: 84px;
  height: 48px;
  padding: 0;
  border: 1px solid var(--color-rule);
  border-radius: 4px;
  overflow: hidden;
  background: var(--color-paper);
  cursor: pointer;
  opacity: 0.65;
  transition: opacity var(--dur-short) var(--ease-out), border-color var(--dur-short) var(--ease-out);
}
.thumb:hover { opacity: 1; }
.thumb:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 1px; }
.thumb.active { opacity: 1; border-color: var(--color-accent); }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
</style>
