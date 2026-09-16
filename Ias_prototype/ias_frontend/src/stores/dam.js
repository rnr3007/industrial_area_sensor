import { defineStore } from 'pinia';
import api from '@/api/client';
import { onSocket, getSocket } from '@/services/socket';

const LOG_LIMIT = 200;

export const useDamStore = defineStore('dam', {
  state: () => ({
    // Device-owned physics/state - always overwritten by the next telemetry
    // push, never computed client-side. See ias_simulate/src/rubber-dam-simulator.js.
    mode: 'auto',
    compressorOn: false,
    deflatingMode: false,
    maintainPressure: false,
    pressure: 3.2,
    waterLevel: 2.85,
    thresholdMin: 2.5,
    thresholdMax: 4.5,
    rubberStrength: 98.5,
    rubberHeight: 2.35,

    logs: [],
    socketConnected: false,
    brokerConnected: false,
    deviceOnline: false,
    bootstrapped: false,

    offs: []
  }),

  actions: {
    addLog(type, message) {
      const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
      this.logs.push({ time, type, message });
      if (this.logs.length > LOG_LIMIT) this.logs.shift();
    },

    clearLogsLocal() {
      this.logs = [];
      this.addLog('info', 'Log dibersihkan');
    },

    applyTelemetry(payload) {
      if (!payload) return;
      Object.assign(this, payload);
    },

    wireSocket() {
      this.teardownSocket();

      const socket = getSocket();
      this.socketConnected = Boolean(socket?.connected);

      this.offs = [
        onSocket('connect', () => {
          this.socketConnected = true;
          this.addLog('success', 'Terhubung ke server');
        }),
        onSocket('disconnect', () => {
          this.socketConnected = false;
          this.addLog('danger', 'Koneksi ke server terputus, mencoba menghubungkan kembali...');
        }),
        onSocket('bootstrap', (data) => {
          this.bootstrapped = true;
          this.brokerConnected = Boolean(data.connected);
          this.deviceOnline = Boolean(data.deviceOnline);
          if (data.telemetry) this.applyTelemetry(data.telemetry);
          if (Array.isArray(data.logs) && data.logs.length) {
            this.logs = data.logs.slice(-LOG_LIMIT);
          }
          if (!data.deviceOnline) this.addLog('warn', 'Perangkat rubber dam belum mengirim data');
        }),
        onSocket('telemetry', (payload) => this.applyTelemetry(payload)),
        onSocket('log', (entry) => {
          this.logs.push(entry);
          if (this.logs.length > LOG_LIMIT) this.logs.shift();
        }),
        onSocket('device:status', ({ online }) => {
          this.deviceOnline = online;
          this.addLog(online ? 'success' : 'danger', online ? 'Perangkat rubber dam online' : 'Perangkat rubber dam offline');
        }),
        onSocket('broker:status', ({ connected }) => {
          this.brokerConnected = connected;
        })
      ];
    },

    teardownSocket() {
      this.offs.forEach((off) => off?.());
      this.offs = [];
    },

    async requestMode(mode) {
      // Optimistic UI - the device is the source of truth, reconciled on
      // the next telemetry push.
      this.mode = mode;
      if (mode === 'auto') this.deflatingMode = false;
      await api.post('/control/mode', { mode });
    },

    async requestCompressor(on) {
      await api.post('/control/compressor', { on });
    },

    async requestDeflate(active) {
      this.deflatingMode = active;
      await api.post('/control/deflate', { active });
    },

    async requestThreshold(min, max) {
      await api.post('/control/threshold', { min, max });
    }
  }
});
