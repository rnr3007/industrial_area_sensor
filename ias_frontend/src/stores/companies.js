import { defineStore } from 'pinia';
import api from '@/api/client';
import { subscribeCompany } from '@/services/socket';

const LAST_KEY = 'ias_last_company';

export const useCompanyStore = defineStore('companies', {
  state: () => ({
    items: [],
    selectedId: localStorage.getItem(LAST_KEY) || '',
    detail: null,
    loading: false,
    error: ''
  }),

  getters: {
    selected: (state) => state.items.find((c) => c._id === state.selectedId) || null,
    byId: (state) => (id) => state.items.find((c) => c._id === id) || null
  },

  actions: {
    async fetchAll({ withStatus = true } = {}) {
      this.loading = true;
      this.error = '';
      try {
        const { data } = await api.get('/companies', { params: { withStatus } });
        this.items = data.items;

        // Keep the previous selection when it still exists, else fall back to
        // the first site so the dashboard is never empty.
        if (!this.items.some((c) => c._id === this.selectedId)) {
          this.select(this.items[0]?._id || '');
        }
        return this.items;
      } catch (err) {
        this.error = err.message;
        return [];
      } finally {
        this.loading = false;
      }
    },

    select(companyId) {
      this.selectedId = companyId;
      if (companyId) {
        localStorage.setItem(LAST_KEY, companyId);
        subscribeCompany(companyId);
      } else {
        localStorage.removeItem(LAST_KEY);
      }
    },

    async fetchDetail(companyId) {
      this.loading = true;
      try {
        const { data } = await api.get(`/companies/${companyId}`);
        this.detail = data;
        return data;
      } finally {
        this.loading = false;
      }
    },

    async create(payload) {
      const { data } = await api.post('/companies', payload);
      await this.fetchAll();
      return data;
    },

    async update(id, payload) {
      const { data } = await api.put(`/companies/${id}`, payload);
      await this.fetchAll();
      return data;
    },

    async remove(id, force = false) {
      await api.delete(`/companies/${id}`, { params: force ? { force: 'true' } : {} });
      if (this.selectedId === id) this.select('');
      await this.fetchAll();
    },

    /** Merge a live telemetry frame into the cached list entry. */
    applyTelemetry(reading) {
      const company = this.items.find((c) => c._id === reading.company);
      if (company) company.latestReading = reading;
      if (this.detail && this.detail._id === reading.company) {
        this.detail.latestReading = reading;
      }
    }
  }
});
