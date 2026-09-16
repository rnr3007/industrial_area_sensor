<script setup>
import { useConfirmStore } from '@/stores/confirm';

const confirm = useConfirmStore();
</script>

<template>
  <div v-if="confirm.open" class="modal-backdrop" @click.self="confirm.settle(false)">
    <div class="modal" style="max-width: 420px">
      <div class="modal-head">
        <h2 style="flex: 1">{{ confirm.title }}</h2>
        <button class="btn ghost sm" @click="confirm.settle(false)">✕</button>
      </div>
      <div class="modal-body">
        <p class="small" style="margin: 0">{{ confirm.message }}</p>
      </div>
      <div class="modal-foot">
        <button class="btn" @click="confirm.settle(false)">{{ confirm.cancelLabel }}</button>
        <button
          class="btn"
          :class="confirm.danger ? 'danger' : 'primary'"
          @click="confirm.settle(true)"
        >
          {{ confirm.confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
