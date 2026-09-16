import { defineStore } from 'pinia';
import api, { setUnauthorizedHandler } from '@/api/client';
import { connectSocket, disconnectSocket } from '@/services/socket';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('ias_token') || '',
    user: JSON.parse(localStorage.getItem('ias_user') || 'null'),
    loading: false,
    error: ''
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    role: (state) => state.user?.role || '',
    isAdmin: (state) => state.user?.role === 'admin',
    canWrite: (state) => ['admin', 'operator'].includes(state.user?.role)
  },

  actions: {
    async login(email, password) {
      this.loading = true;
      this.error = '';
      try {
        const { data } = await api.post('/auth/login', { email, password });
        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('ias_token', data.token);
        localStorage.setItem('ias_user', JSON.stringify(data.user));
        connectSocket(data.token);
        return true;
      } catch (err) {
        this.error = err.message;
        return false;
      } finally {
        this.loading = false;
      }
    },

    /** Verify a stored token on app boot; clears it when the server rejects it. */
    async restore() {
      if (!this.token) return false;
      try {
        const { data } = await api.get('/auth/me');
        this.user = data.user;
        localStorage.setItem('ias_user', JSON.stringify(data.user));
        connectSocket(this.token);
        return true;
      } catch {
        this.clear();
        return false;
      }
    },

    async logout() {
      try {
        await api.post('/auth/logout');
      } catch {
        // The token may already be expired - the local session still ends.
      }
      this.clear();
    },

    clear() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('ias_token');
      localStorage.removeItem('ias_user');
      disconnectSocket();
    }
  }
});

/** Wire the axios 401 handler once the pinia instance exists. */
export function installAuthInterceptor(router) {
  setUnauthorizedHandler(() => {
    const store = useAuthStore();
    if (!store.token) return;
    store.clear();
    router.push({ name: 'login', query: { expired: '1' } });
  });
}
