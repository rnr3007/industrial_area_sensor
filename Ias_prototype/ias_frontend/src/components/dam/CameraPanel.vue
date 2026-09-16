<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { useToastStore } from '@/stores/toast';
import { useDamStore } from '@/stores/dam';

const toasts = useToastStore();
const dam = useDamStore();

const videoRef = ref(null);
const status = ref('OFF'); // OFF | LIVE | ERROR
const busy = ref(false);
let stream = null;
let facingMode = 'environment';

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    dam.addLog('danger', 'Browser tidak mendukung akses kamera');
    toasts.error('Kamera tidak didukung', 'Browser ini tidak mendukung akses kamera.');
    return;
  }
  try {
    stopCamera(true);
    busy.value = true;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    videoRef.value.srcObject = stream;
    await videoRef.value.play().catch(() => {});
    status.value = 'LIVE';
    dam.addLog('success', 'Kamera diaktifkan (' + (facingMode === 'user' ? 'depan' : 'belakang') + ')');
    toasts.success('Kamera aktif');
  } catch (err) {
    status.value = 'ERROR';
    dam.addLog('danger', 'Gagal mengaktifkan kamera: ' + err.message);
    toasts.error('Kamera gagal', err.message);
  } finally {
    busy.value = false;
  }
}

function stopCamera(silent = false) {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (videoRef.value) videoRef.value.srcObject = null;
  status.value = 'OFF';
  if (!silent) dam.addLog('info', 'Kamera dimatikan');
}

async function switchCamera() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  dam.addLog('info', 'Ganti kamera ke ' + (facingMode === 'user' ? 'depan' : 'belakang'));
  if (stream) await startCamera();
}

onBeforeUnmount(() => stopCamera(true));
</script>

<template>
  <div class="camera-inline">
    <div class="panel-header">
      <span class="panel-title">📷 Kamera Monitoring</span>
      <span class="badge" :class="status === 'LIVE' ? 'badge-active' : 'badge-standby'">{{ status }}</span>
    </div>
    <div class="camera-container">
      <video ref="videoRef" autoplay playsinline muted></video>
      <div v-if="status !== 'LIVE'" class="camera-placeholder">
        <div class="cam-icon">📷</div>
        <div>Kamera belum aktif</div>
      </div>
    </div>
    <div class="camera-controls">
      <button class="btn btn-compressor-on" :disabled="status === 'LIVE' || busy" @click="startCamera">AKTIFKAN</button>
      <button class="btn btn-compressor-off" :disabled="status !== 'LIVE'" @click="stopCamera()">MATIKAN</button>
    </div>
    <button class="btn btn-mode" style="font-size: 0.65rem; padding: 8px 8px" @click="switchCamera">
      🔄 GANTI KAMERA
    </button>
  </div>
</template>
