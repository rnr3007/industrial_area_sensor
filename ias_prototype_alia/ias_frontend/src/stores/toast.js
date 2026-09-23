import { defineStore } from 'pinia';

let nextId = 1;

export const useToastStore = defineStore('toast', {
  state: () => ({ items: [] }),

  actions: {
    push({ title, message = '', type = 'info', timeout = 6000 }) {
      const id = nextId++;
      this.items.push({ id, title, message, type });
      if (timeout) setTimeout(() => this.dismiss(id), timeout);
      return id;
    },
    success(title, message) {
      return this.push({ title, message, type: 'success' });
    },
    error(title, message) {
      return this.push({ title, message, type: 'danger', timeout: 9000 });
    },
    dismiss(id) {
      const index = this.items.findIndex((t) => t.id === id);
      if (index !== -1) this.items.splice(index, 1);
    }
  }
});
