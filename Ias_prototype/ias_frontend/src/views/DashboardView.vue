<script setup>
import SensorCards from '@/components/dam/SensorCards.vue';
import DamCanvas from '@/components/dam/DamCanvas.vue';
import CameraPanel from '@/components/dam/CameraPanel.vue';
import ActivityLog from '@/components/dam/ActivityLog.vue';
import ControlPanel from '@/components/dam/ControlPanel.vue';
</script>

<template>
  <div class="main-grid">
    <div>
      <SensorCards />

      <div class="dam-visual panel" style="margin-bottom: 12px">
        <DamCanvas />
        <CameraPanel />
      </div>

      <ActivityLog />
    </div>

    <ControlPanel />
  </div>
</template>
