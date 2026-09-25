<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const videoRef = ref(null);
// connecting | live | error
const status = ref('connecting');

let hls = null;

// Same-origin, proxied by the backend (authenticate() + http-proxy-middleware
// -> alia_mediamtx). The RTSP URL/credentials never reach this bundle.
const STREAM_URL = '/api/cctv/cctv/index.m3u8';

function authHeader(xhr) {
  if (auth.token) xhr.setRequestHeader('Authorization', `Bearer ${auth.token}`);
}

async function attach() {
  const video = videoRef.value;
  if (!video) return;

  // Split into its own chunk - a ~190kB (gzip) library the dashboard
  // shouldn't have to parse before it's even rendered a flow reading.
  const { default: Hls } = await import('hls.js');
  if (!videoRef.value) return; // unmounted while the chunk was loading

  if (Hls.isSupported()) {
    hls = new Hls({ xhrSetup: authHeader, liveDurationInfinity: true });
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      status.value = 'live';
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (data.fatal) status.value = 'error';
    });
    hls.loadSource(STREAM_URL);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari plays HLS natively - fetch() with auth header first since a
    // bare <video src> can't carry the Authorization header itself.
    fetch(STREAM_URL, { headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        video.src = STREAM_URL;
      })
      .catch(() => {
        status.value = 'error';
      });
    video.addEventListener('loadedmetadata', () => {
      status.value = 'live';
      video.play().catch(() => {});
    });
    video.addEventListener('error', () => {
      status.value = 'error';
    });
  } else {
    status.value = 'error';
  }
}

onMounted(attach);
onBeforeUnmount(() => {
  hls?.destroy();
  hls = null;
});
</script>

<template>
  <div class="panel cctv-card">
    <div class="panel-header">
      <span class="panel-title">📷 CCTV Langsung</span>
      <span class="badge" :class="status === 'live' ? 'badge-active' : status === 'error' ? 'badge-danger' : 'badge-standby'">
        {{ status === 'live' ? 'LIVE' : status === 'error' ? 'OFFLINE' : 'MENGHUBUNGKAN...' }}
      </span>
    </div>
    <div class="cctv-video-wrap">
      <video ref="videoRef" class="cctv-video" muted autoplay playsinline controls></video>
      <div v-if="status !== 'live'" class="cctv-overlay">
        {{ status === 'connecting' ? 'Menghubungkan ke kamera...' : 'Stream CCTV tidak tersedia' }}
      </div>
    </div>
  </div>
</template>
