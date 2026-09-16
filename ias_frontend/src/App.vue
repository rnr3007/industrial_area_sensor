<script setup>
import { useToastStore } from '@/stores/toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';

const toasts = useToastStore();
</script>

<template>
  <RouterView />

  <ConfirmDialog />

  <div class="toast-stack">
    <div v-for="toast in toasts.items" :key="toast.id" class="toast" :class="toast.type">
      <div class="row" style="align-items: flex-start">
        <div style="flex: 1">
          <strong class="small">{{ toast.title }}</strong>
          <div v-if="toast.message" class="tiny muted" style="margin-top: 2px">
            {{ toast.message }}
          </div>
        </div>
        <button class="btn ghost sm" @click="toasts.dismiss(toast.id)">✕</button>
      </div>
    </div>
  </div>
</template>
