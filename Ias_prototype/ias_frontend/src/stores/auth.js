import { defineStore } from 'pinia';
import api, { setUnauthorizedHandler } from '@/api/client';
import { connectSocket, disconnectSocket } from '@/services/socket';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('rubberdam_token') || '',
    user: JSON.parse(localStorage.getItem('rubberdam_user') || 'null'),
    loading: false,
    error: ''
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    role: (state) => state.user?.role || '',
    isAdmin: (state) => state.user?.role === 'admin',
    // Guest operators get a read-only dashboard.
    canControl: (state) => ['admin', 'operator'].includes(state.user?.role)
  },

  actions: {
    _applySession(data) {
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('rubberdam_token', data.token);
      localStorage.setItem('rubberdam_user', JSON.stringify(data.user));
      connectSocket(data.token);
    },

    /** Step 1 of the operator/guest flow: request a sign-in link by email. */
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

    /** Step 2: exchange the token from the emailed link for a session. */
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

    /** Verify a stored token on app boot; clears it when the server rejects it. */
    async restore() {
      if (!this.token) return false;
      try {
        const { data } = await api.get('/auth/me');
        this.user = data.user;
        localStorage.setItem('rubberdam_user', JSON.stringify(data.user));
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
      localStorage.removeItem('rubberdam_token');
      localStorage.removeItem('rubberdam_user');
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
