import { defineStore } from 'pinia';
import api from '@/api/client';

export const useAlertStore = defineStore('alerts', {
  state: () => ({
    items: [],
    total: 0,
    stats: { open: 0, bySeverity: { info: 0, warning: 0, critical: 0 }, last24h: 0 },
    // Live feed for the dashboard ticker, newest first, capped.
    live: [],
    loading: false
  }),

  getters: {
    openCritical: (state) => state.stats.bySeverity.critical
  },

  actions: {
    async fetch(params = {}) {
      this.loading = true;
      try {
        const { data } = await api.get('/alerts', { params });
        this.items = data.items;
        this.total = data.total;
        return data;
      } finally {
        this.loading = false;
      }
    },

    async fetchStats(companyId) {
      const { data } = await api.get('/alerts/stats', {
        params: companyId ? { companyId } : {}
      });
      this.stats = data;
      return data;
    },

    async acknowledge(id, note) {
      const { data } = await api.post(`/alerts/${id}/acknowledge`, { note });
      this.replace(data);
      return data;
    },

    async resolve(id, note) {
      const { data } = await api.post(`/alerts/${id}/resolve`, { note });
      this.replace(data);
      return data;
    },

    replace(alert) {
      const index = this.items.findIndex((a) => a._id === alert._id);
      if (index !== -1) this.items.splice(index, 1, alert);
      const liveIndex = this.live.findIndex((a) => a._id === alert._id);
      if (liveIndex !== -1) this.live.splice(liveIndex, 1, alert);
    },

    pushLive(alert) {
      this.live.unshift(alert);
      if (this.live.length > 40) this.live.length = 40;

      this.stats.open += 1;
      this.stats.last24h += 1;
      if (this.stats.bySeverity[alert.severity] !== undefined) {
        this.stats.bySeverity[alert.severity] += 1;
      }
    }
  }
});
