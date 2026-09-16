<script setup>
import { reactive, ref, watch } from 'vue';
import ModalDialog from '@/components/ui/ModalDialog.vue';

const props = defineProps({
  company: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

const emit = defineEmits(['save', 'close']);

const tab = ref('general');

const blank = () => ({
  name: '',
  code: '',
  industry: '',
  address: '',
  city: '',
  province: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  location: { lat: null, lng: null },
  geofenceRadiusM: 500,
  active: true,
  waterIntake: {
    sourceType: 'river',
    permitNumber: '',
    quotaM3PerDay: 0,
    pipeDiameterMm: 0,
    notes: ''
  },
  thresholds: {
    waterLevelMin: 0.5,
    waterLevelMax: 4.5,
    flowRateMax: 120,
    phMin: 6,
    phMax: 9,
    turbidityMax: 50,
    tdsMax: 1000,
    temperatureMax: 40,
    offlineAfterMinutes: 15
  }
});

const form = reactive(blank());

watch(
  () => props.company,
  (company) => {
    const base = blank();
    if (!company) {
      Object.assign(form, base);
      return;
    }
    Object.assign(form, {
      ...base,
      ...company,
      location: { ...base.location, ...company.location },
      waterIntake: { ...base.waterIntake, ...company.waterIntake },
      thresholds: { ...base.thresholds, ...company.thresholds }
    });
  },
  { immediate: true }
);

const numeric = (value) => (value === '' || value === null ? null : Number(value));

function submit() {
  emit('save', {
    name: form.name,
    code: form.code.toUpperCase(),
    industry: form.industry,
    address: form.address,
    city: form.city,
    province: form.province,
    contactName: form.contactName,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    location: { lat: Number(form.location.lat), lng: Number(form.location.lng) },
    geofenceRadiusM: Number(form.geofenceRadiusM),
    active: form.active,
    waterIntake: {
      ...form.waterIntake,
      quotaM3PerDay: numeric(form.waterIntake.quotaM3PerDay) ?? 0,
      pipeDiameterMm: numeric(form.waterIntake.pipeDiameterMm) ?? 0
    },
    thresholds: Object.fromEntries(
      Object.entries(form.thresholds).map(([key, value]) => [key, numeric(value)])
    )
  });
}
</script>

<template>
  <ModalDialog
    :title="company ? `Edit ${company.name}` : 'Add company'"
    width="760px"
    @close="emit('close')"
  >
    <div v-if="error" class="alert-box error" style="margin-bottom: 14px">{{ error }}</div>

    <div class="tabs">
      <button
        v-for="t in [
          { key: 'general', label: 'General' },
          { key: 'intake', label: 'Water intake' },
          { key: 'thresholds', label: 'Alert thresholds' }
        ]"
        :key="t.key"
        class="tab"
        :class="{ active: tab === t.key }"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <form id="company-form" @submit.prevent="submit">
      <div v-show="tab === 'general'" class="form-grid">
        <label class="field">
          <span>Company name *</span>
          <input v-model="form.name" required minlength="2" />
        </label>
        <label class="field">
          <span>Site code *</span>
          <input
            v-model="form.code"
            required
            pattern="[A-Za-z0-9_-]{2,20}"
            placeholder="PTAJ"
            style="text-transform: uppercase"
          />
        </label>
        <label class="field">
          <span>Industry</span>
          <input v-model="form.industry" placeholder="Textile, chemicals…" />
        </label>
        <label class="field">
          <span>City</span>
          <input v-model="form.city" />
        </label>
        <label class="field" style="grid-column: 1 / -1">
          <span>Address</span>
          <input v-model="form.address" />
        </label>
        <label class="field">
          <span>Province</span>
          <input v-model="form.province" />
        </label>
        <label class="field">
          <span>Contact name</span>
          <input v-model="form.contactName" />
        </label>
        <label class="field">
          <span>Contact email</span>
          <input v-model="form.contactEmail" type="email" />
        </label>
        <label class="field">
          <span>Contact phone</span>
          <input v-model="form.contactPhone" />
        </label>
        <label class="field">
          <span>Latitude *</span>
          <input v-model="form.location.lat" type="number" step="any" min="-90" max="90" required />
        </label>
        <label class="field">
          <span>Longitude *</span>
          <input v-model="form.location.lng" type="number" step="any" min="-180" max="180" required />
        </label>
        <label class="field">
          <span>Geofence radius (m)</span>
          <input v-model="form.geofenceRadiusM" type="number" min="10" max="50000" />
        </label>
        <label class="row" style="gap: 8px; align-items: center">
          <input v-model="form.active" type="checkbox" />
          <span class="small">Active</span>
        </label>
      </div>

      <div v-show="tab === 'intake'" class="form-grid">
        <label class="field">
          <span>Source type</span>
          <select v-model="form.waterIntake.sourceType">
            <option value="river">River</option>
            <option value="groundwater">Groundwater</option>
            <option value="reservoir">Reservoir</option>
            <option value="municipal">Municipal</option>
            <option value="sea">Sea</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label class="field">
          <span>Permit number</span>
          <input v-model="form.waterIntake.permitNumber" placeholder="SIPA-…" />
        </label>
        <label class="field">
          <span>Daily quota (m³/day)</span>
          <input v-model="form.waterIntake.quotaM3PerDay" type="number" min="0" step="1" />
        </label>
        <label class="field">
          <span>Pipe diameter (mm)</span>
          <input v-model="form.waterIntake.pipeDiameterMm" type="number" min="0" step="1" />
        </label>
        <label class="field" style="grid-column: 1 / -1">
          <span>Notes</span>
          <textarea v-model="form.waterIntake.notes"></textarea>
        </label>
      </div>

      <div v-show="tab === 'thresholds'">
        <p class="tiny dim" style="margin-top: 0">
          A reading outside these limits raises an early-warning alert. Exceeding a limit by more
          than 20% escalates it to critical.
        </p>
        <div class="form-grid">
          <label class="field">
            <span>Water level min (m)</span>
            <input v-model="form.thresholds.waterLevelMin" type="number" step="0.1" />
          </label>
          <label class="field">
            <span>Water level max (m)</span>
            <input v-model="form.thresholds.waterLevelMax" type="number" step="0.1" />
          </label>
          <label class="field">
            <span>Flow rate max (m³/h)</span>
            <input v-model="form.thresholds.flowRateMax" type="number" step="1" />
          </label>
          <label class="field">
            <span>Offline after (minutes)</span>
            <input v-model="form.thresholds.offlineAfterMinutes" type="number" min="1" step="1" />
          </label>
          <label class="field">
            <span>pH min</span>
            <input v-model="form.thresholds.phMin" type="number" step="0.1" />
          </label>
          <label class="field">
            <span>pH max</span>
            <input v-model="form.thresholds.phMax" type="number" step="0.1" />
          </label>
          <label class="field">
            <span>Turbidity max (NTU)</span>
            <input v-model="form.thresholds.turbidityMax" type="number" step="1" />
          </label>
          <label class="field">
            <span>TDS max (ppm)</span>
            <input v-model="form.thresholds.tdsMax" type="number" step="10" />
          </label>
          <label class="field">
            <span>Temperature max (°C)</span>
            <input v-model="form.thresholds.temperatureMax" type="number" step="0.5" />
          </label>
        </div>
      </div>
    </form>

    <template #footer>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn primary" form="company-form" type="submit" :disabled="saving">
        {{ saving ? 'Saving…' : company ? 'Save changes' : 'Create company' }}
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
.tab {
  padding: 8px 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.tab:hover { color: var(--text); }
.tab.active { color: var(--text); border-bottom-color: var(--accent); }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
@media (max-width: 620px) { .form-grid { grid-template-columns: 1fr; } }
</style>
