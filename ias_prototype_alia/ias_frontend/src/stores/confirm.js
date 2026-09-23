import { defineStore } from 'pinia';

export const useConfirmStore = defineStore('confirm', {
  state: () => ({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    danger: false,
    resolver: null
  }),

  actions: {
    ask({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
      this.resolver?.(false);
      this.title = title;
      this.message = message;
      this.confirmLabel = confirmLabel;
      this.cancelLabel = cancelLabel;
      this.danger = danger;
      this.open = true;
      return new Promise((resolve) => {
        this.resolver = resolve;
      });
    },
    settle(result) {
      this.open = false;
      this.resolver?.(result);
      this.resolver = null;
    }
  }
});
