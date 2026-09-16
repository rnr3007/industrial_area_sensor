<script setup>
import { onMounted, onUnmounted } from 'vue';

const props = defineProps({
  title: { type: String, default: '' },
  width: { type: String, default: '720px' }
});

const emit = defineEmits(['close']);

const onKey = (event) => {
  if (event.key === 'Escape') emit('close');
};

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal" :style="{ maxWidth: props.width }">
      <div class="modal-head">
        <h2 style="flex: 1">{{ title }}</h2>
        <button class="btn ghost sm" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
      <div class="modal-foot">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
