import { defineStore } from 'pinia';
import { onSocket, getSocket } from '@/services/socket';

const LOG_LIMIT = 200;

export const useAliaStore = defineStore('alia', {
  state: () => ({
    // Device-owned reading - always overwritten by the next poll result from
    // the backend, never computed client-side. See esp32-simulator/ locally,
    // or the real AUF750 device's own /data endpoint in production.
    currentMA: 0,
    flowRate: 0, // m3/h
    flowLpm: 0,
    flowLps: 0,
    totalLiters: 0,
    totalM3: 0,
    status: 'IDLE', // RUN | IDLE | OVER

    trend: [], // recent flowRate samples, for the chart
    maxTrendPoints: 60,

    // Fuller reading history for CSV/PDF export - mirrors the firmware
    // dashboard's own dataLog array (capped so a long session doesn't grow
    // memory unbounded).
    readingLog: [],
    maxReadingLog: 3600,

    logs: [],
    socketConnected: false,
    linkConnected: false,
    bootstrapped: false,

    offs: []
  }),

  actions: {
    addLog(type, message) {
      // Raw ISO, same shape as server-originated entries (see the backend's
      // esp32.service.js log()) - formatted into the viewer's own local
      // timezone only at render time, in ActivityLog.vue.
      this.logs.push({ time: new Date().toISOString(), type, message });
      if (this.logs.length > LOG_LIMIT) this.logs.shift();
    },

    clearLogsLocal() {
      this.logs = [];
      this.addLog('info', 'Log dibersihkan');
    },

    applyReading(reading) {
      if (!reading) return;
      Object.assign(this, reading);
      this.trend.push(reading.flowRate);
      if (this.trend.length > this.maxTrendPoints) this.trend.shift();

      this.readingLog.push({ time: new Date(), ...reading });
      if (this.readingLog.length > this.maxReadingLog) this.readingLog.shift();
    },

    clearReadingLog() {
      this.readingLog = [];
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
          this.linkConnected = Boolean(data.linkConnected);
          if (data.reading) this.applyReading(data.reading);
          if (Array.isArray(data.logs) && data.logs.length) {
            this.logs = data.logs.slice(-LOG_LIMIT);
          }
          if (!data.linkConnected) this.addLog('warn', 'Perangkat Alia AUF750 belum mengirim data');
        }),
        onSocket('reading', (payload) => this.applyReading(payload)),
        onSocket('log', (entry) => {
          this.logs.push(entry);
          if (this.logs.length > LOG_LIMIT) this.logs.shift();
        }),
        onSocket('link:status', ({ connected }) => {
          this.linkConnected = connected;
        })
      ];
    },

    teardownSocket() {
      this.offs.forEach((off) => off?.());
      this.offs = [];
    }
  }
});
