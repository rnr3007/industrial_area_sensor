<script setup>
import FlowMeterDisplay from '@/components/alia/FlowMeterDisplay.vue';
import TrendChart from '@/components/alia/TrendChart.vue';
import ActivityLog from '@/components/alia/ActivityLog.vue';
import CCTVCard from '@/components/alia/CCTVCard.vue';
import DeviceStatus from '../components/alia/DeviceStatus.vue';
</script>

<template>
  <div class="main-grid">
    <div>
      <FlowMeterDisplay />

      <!-- <TrendChart /> -->

      <CCTVCard />

      <ActivityLog />

      <!-- <DeviceStatus /> -->

      <div class="footer-note">Toekang Air &mdash; Solusi Integrasi Sistem Pengelolaan Air</div>
    </div>
  </div>
</template>
