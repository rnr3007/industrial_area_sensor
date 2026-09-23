<script setup>
import { useToastStore } from '@/stores/toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';

const toasts = useToastStore();
</script>

<template>
  <RouterView />

  <ConfirmDialog />

  <div class="toast-container">
    <div v-for="toast in toasts.items" :key="toast.id" class="toast" :class="`toast-${toast.type}`">
      <div>{{ toast.title }}</div>
      <div v-if="toast.message" class="tiny" style="margin-top: 2px; font-weight: 400">
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>
