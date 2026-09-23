import { defineStore } from 'pinia';
import api, { setUnauthorizedHandler } from '@/api/client';
import { connectSocket, disconnectSocket } from '@/services/socket';
import { getTokenExpiryMs } from '@/utils/jwt';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('alia_token') || '',
    user: JSON.parse(localStorage.getItem('alia_user') || 'null'),
    loading: false,
    error: ''
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    role: (state) => state.user?.role || '',
    isAdmin: (state) => state.user?.role === 'admin',
    expiresAt: (state) => getTokenExpiryMs(state.token)
  },

  actions: {
    _applySession(data) {
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('alia_token', data.token);
      localStorage.setItem('alia_user', JSON.stringify(data.user));
      connectSocket(data.token);
    },

    async requestMagicLink(email) {
      this.loading = true;
      this.error = '';
      try {
        await api.post('/auth/magic-link', { email });
        return true;
      } catch (err) {
        this.error = err.message;
        return false;
      } finally {
        this.loading = false;
      }
    },

    async consumeMagicLink(token) {
      this.loading = true;
      this.error = '';
      try {
        const { data } = await api.post('/auth/magic-link/consume', { token });
        this._applySession(data);
        return true;
      } catch (err) {
        this.error = err.message;
        return false;
      } finally {
        this.loading = false;
      }
    },

    async adminLogin(email, password) {
      this.loading = true;
      this.error = '';
      try {
        const { data } = await api.post('/auth/admin/login', { email, password });
        this._applySession(data);
        return true;
      } catch (err) {
        this.error = err.message;
        return false;
      } finally {
        this.loading = false;
      }
    },

    async restore() {
      if (!this.token) return false;
      try {
        const { data } = await api.get('/auth/me');
        this.user = data.user;
        localStorage.setItem('alia_user', JSON.stringify(data.user));
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
        // Token may already be expired - the local session still ends.
      }
      this.clear();
    },

    clear() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('alia_token');
      localStorage.removeItem('alia_user');
      disconnectSocket();
    }
  }
});

export function installAuthInterceptor(router) {
  setUnauthorizedHandler(() => {
    const store = useAuthStore();
    if (!store.token) return;
    store.clear();
    router.push({ name: 'login', query: { expired: '1' } });
  });
}
