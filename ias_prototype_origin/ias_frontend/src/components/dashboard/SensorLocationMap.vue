<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import api from '@/api/client';
import { CHART_THEME, num, relativeTime } from '@/utils/format';

const props = defineProps({
  company: { type: Object, default: null },
  latest: { type: Object, default: null },
  height: { type: String, default: '420px' }
});

const emit = defineEmits(['select-company']);

const container = ref(null);
const map = shallowRef(null);
const ready = ref(false);
const showTrack = ref(true);
const distanceFromSite = ref(null);
const markers = [];

// Raster OSM style keeps the map key-free. Point VITE_MAP_STYLE_URL at a
// Mapbox/MapTiler style URL (with its token) to swap in vector basemaps.
const STYLE = import.meta.env.VITE_MAP_STYLE_URL || {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors'
    }
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': CHART_THEME.paper2 } },
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: { 'raster-brightness-max': 0.7, 'raster-saturation': -0.6, 'raster-contrast': 0.15 }
    }
  ]
};

const STATUS_COLOR = { normal: CHART_THEME.ok, warning: CHART_THEME.warning, critical: CHART_THEME.critical, unknown: CHART_THEME.muted };
// A distinct categorical hue for the device breadcrumb trail - deliberately
// not the UI accent, so it reads apart from the geofence ring on the map.
const TRACK_COLOR = '#a371f7';

function clearMarkers() {
  while (markers.length) markers.pop().remove();
}

function siteMarker(site) {
  const el = document.createElement('div');
  el.className = 'site-pin';
  el.style.setProperty('--pin', STATUS_COLOR[site.status] || STATUS_COLOR.unknown);
  el.title = site.name;
  el.innerHTML = '<span></span>';
  el.addEventListener('click', () => emit('select-company', site._id));

  const popup = new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
    `<strong>${site.name}</strong><br><span style="color:${CHART_THEME.ink2}">${site.code} · ${
      site.city || ''
    }</span><br>
     <span style="color:${STATUS_COLOR[site.status]}; font-family:'JetBrains Mono',monospace">${site.status.toUpperCase()}</span>
     &nbsp;<span style="color:${CHART_THEME.ink2}">${site.alerts.critical} critical / ${
       site.alerts.warning
     } warning</span>`
  );

  return new maplibregl.Marker({ element: el })
    .setLngLat([site.location.lng, site.location.lat])
    .setPopup(popup);
}

function deviceMarker(device) {
  const el = document.createElement('div');
  el.className = `device-pin ${device.online ? 'online' : 'offline'}`;
  el.title = device.name;

  const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(
    `<strong>${device.name}</strong><br>
     <span style="color:${CHART_THEME.ink2}; font-family:'JetBrains Mono',monospace">${device.deviceId} · ${device.type}</span><br>
     <span style="color:${device.online ? CHART_THEME.ok : CHART_THEME.muted}">${
       device.online ? 'online' : 'offline'
     }</span>
     <span style="color:${CHART_THEME.ink2}"> · seen ${relativeTime(device.lastSeenAt)}</span>`
  );

  return new maplibregl.Marker({ element: el })
    .setLngLat([device.location.lng, device.location.lat])
    .setPopup(popup);
}

/** Geofence ring for the focused site, drawn with turf so the radius is true on the ground. */
function drawGeofence(company) {
  if (!map.value || !company?.location) return;

  const circle = turf.circle([company.location.lng, company.location.lat], (company.geofenceRadiusM || 500) / 1000, {
    steps: 96,
    units: 'kilometers'
  });

  const source = map.value.getSource('geofence');
  if (source) {
    source.setData(circle);
  } else {
    map.value.addSource('geofence', { type: 'geojson', data: circle });
    map.value.addLayer({
      id: 'geofence-fill',
      type: 'fill',
      source: 'geofence',
      paint: { 'fill-color': CHART_THEME.accent, 'fill-opacity': 0.08 }
    });
    map.value.addLayer({
      id: 'geofence-line',
      type: 'line',
      source: 'geofence',
      paint: { 'line-color': CHART_THEME.accent, 'line-width': 1.5, 'line-dasharray': [3, 2] }
    });
  }
}

async function drawTrack() {
  if (!map.value || !props.company?._id) return;

  const empty = { type: 'FeatureCollection', features: [] };
  if (!showTrack.value) {
    map.value.getSource('track')?.setData(empty);
    return;
  }

  const to = new Date();
  const from = new Date(to.getTime() - 24 * 3600 * 1000);
  const { data } = await api.get(`/telemetry/${props.company._id}/track`, {
    params: { from: from.toISOString(), to: to.toISOString() }
  });

  const coords = data.items
    .filter((p) => p.location?.lng != null)
    .map((p) => [p.location.lng, p.location.lat]);

  const geojson =
    coords.length > 1
      ? turf.featureCollection([turf.lineString(coords)])
      : empty;

  const source = map.value.getSource('track');
  if (source) {
    source.setData(geojson);
  } else {
    map.value.addSource('track', { type: 'geojson', data: geojson });
    map.value.addLayer({
      id: 'track-line',
      type: 'line',
      source: 'track',
      paint: { 'line-color': TRACK_COLOR, 'line-width': 2, 'line-opacity': 0.75 }
    });
  }
}

async function loadOverlay() {
  if (!map.value || !ready.value) return;

  const { data } = await api.get('/dashboard/map');
  clearMarkers();

  for (const site of data.companies) {
    markers.push(siteMarker(site).addTo(map.value));
  }
  for (const device of data.devices) {
    if (device.location?.lat == null) continue;
    markers.push(deviceMarker(device).addTo(map.value));
  }

  focusCompany();
  drawGeofence(props.company);
  drawTrack();
}

function focusCompany() {
  if (!map.value || !props.company?.location) return;
  map.value.easeTo({
    center: [props.company.location.lng, props.company.location.lat],
    zoom: 14,
    duration: 900
  });
}

/** Live distance between the sensor and the registered site coordinates. */
watch(
  () => props.latest,
  (reading) => {
    if (!reading?.location?.lat || !props.company?.location) return;

    distanceFromSite.value = turf.distance(
      turf.point([props.company.location.lng, props.company.location.lat]),
      turf.point([reading.location.lng, reading.location.lat]),
      { units: 'meters' }
    );

    if (showTrack.value) drawTrack();
  }
);

watch(
  () => props.company?._id,
  () => {
    focusCompany();
    drawGeofence(props.company);
    drawTrack();
  }
);

watch(showTrack, drawTrack);

onMounted(() => {
  map.value = new maplibregl.Map({
    container: container.value,
    style: STYLE,
    center: props.company?.location
      ? [props.company.location.lng, props.company.location.lat]
      : [106.8, -6.2],
    zoom: props.company ? 13 : 5,
    attributionControl: { compact: true }
  });

  map.value.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.value.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');

  map.value.on('load', () => {
    ready.value = true;
    loadOverlay();
  });
});

onBeforeUnmount(() => {
  clearMarkers();
  map.value?.remove();
});

defineExpose({ refresh: loadOverlay });
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h2>Sensor location</h2>
      <div class="row" style="gap: 8px">
        <span v-if="distanceFromSite !== null" class="tiny muted nowrap">
          {{ num(distanceFromSite, 0) }} m from site centre
        </span>
        <label class="row tiny nowrap" style="gap: 5px; margin: 0">
          <input v-model="showTrack" type="checkbox" />
          24h track
        </label>
        <button class="btn sm" @click="focusCompany">Recentre</button>
      </div>
    </div>
    <div class="panel-body flush">
      <div ref="container" class="map" :style="{ height }"></div>
      <div class="legend tiny">
        <span><i class="sw" style="background: var(--color-ok)"></i> normal</span>
        <span><i class="sw" style="background: var(--color-warning)"></i> warning</span>
        <span><i class="sw" style="background: var(--color-critical)"></i> critical</span>
        <span><i class="sw" style="background: #a371f7"></i> device track</span>
        <span><i class="sw" style="background: var(--color-accent-soft)"></i> geofence</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map { width: 100%; background: var(--color-paper); }

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  padding: var(--space-xs) var(--space-md);
  border-top: 1px solid var(--color-rule);
  color: var(--color-ink-2);
}
.legend span { display: inline-flex; align-items: center; gap: var(--space-2xs); }
.sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
</style>

<style>
/* Marker elements are created imperatively, so these cannot be scoped. */
.site-pin {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--pin);
  border: 2px solid var(--color-paper);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--pin) 30%, transparent);
  cursor: pointer;
  display: grid;
  place-items: center;
}
.site-pin span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-paper);
  opacity: 0.55;
}

.device-pin {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  transform: rotate(45deg);
  cursor: pointer;
}
.device-pin.online { background: var(--color-accent); box-shadow: 0 0 8px oklch(66% 0.17 254 / 0.7); }
.device-pin.offline { background: var(--color-muted); }
</style>
