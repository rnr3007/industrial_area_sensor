<script setup>
import FlowMeterDisplay from '@/components/alia/FlowMeterDisplay.vue';
import TrendChart from '@/components/alia/TrendChart.vue';
import ActivityLog from '@/components/alia/ActivityLog.vue';
import { useAliaStore } from '@/stores/alia';

const alia = useAliaStore();
</script>

<template>
  <div class="main-grid">
    <div>
      <FlowMeterDisplay />

      <div class="panel" style="margin-top: 12px">
        <div class="panel-header">
          <span class="panel-title">Tren Debit &mdash; {{ alia.maxTrendPoints }} data terakhir</span>
          <span class="badge">Log: {{ alia.readingLog.length }} baris</span>
        </div>
        <TrendChart />
      </div>

      <ActivityLog />

      <div class="footer-note">Toekang Air - Solusi Integrasi Sistem Pengelolaan Air</div>
    </div>

    <div class="panel">
      <div class="panel-header"><span class="panel-title">Status Perangkat</span></div>
      <p class="small muted" style="margin-bottom: 10px">
        Dasbor ini hanya memantau - tidak ada kontrol jarak jauh ke perangkat.
      </p>
      <div class="row" style="gap: 8px; margin-bottom: 8px">
        <span class="badge" :class="alia.linkConnected ? 'badge-active' : 'badge-danger'">
          {{ alia.linkConnected ? 'ESP32 TERHUBUNG' : 'ESP32 TERPUTUS' }}
        </span>
      </div>
      <table class="data">
        <tbody>
          <tr><td>Arus</td><td class="right mono">{{ alia.currentMA.toFixed(2) }} mA</td></tr>
          <tr><td>Debit</td><td class="right mono">{{ alia.flowRate.toFixed(3) }} m&sup3;/h</td></tr>
          <tr><td>Total volume</td><td class="right mono">{{ alia.totalM3.toFixed(3) }} m&sup3;</td></tr>
          <tr><td>Status</td><td class="right mono">{{ alia.status }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
