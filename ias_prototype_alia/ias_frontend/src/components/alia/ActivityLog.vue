<script setup>
import { computed, ref } from 'vue';
import { useAliaStore } from '@/stores/alia';
import { useToastStore } from '@/stores/toast';
import { useConfirmStore } from '@/stores/confirm';
import { fmtTimestamp, fmtTimestampFile, fmtDatePart, fmtTimePart, combineDateTime } from '@/utils/formatter';
import api from '@/api/client';
import ModalDialog from '@/components/ui/ModalDialog.vue';

const alia = useAliaStore();
const toasts = useToastStore();
const confirm = useConfirmStore();

const recentLogs = computed(() => alia.logs.slice(-50));

// Date+hour-range export - fetches from the server's persisted history
// (GET /api/readings), not just what this tab happened to see live, so a
// download works even for a range before the page was opened.
//
// Each boundary is a native <input type="date"> (calendar picker) paired
// with a native <input type="time"> (clock picker) rather than a single
// <input type="datetime-local">, because a datetime-local's WIDGET can
// render in whatever the browser/OS locale dictates (12-hour AM/PM,
// mm/dd/yyyy, ...). Splitting them out keeps the calendar/clock picker UX
// while guaranteeing the format: type="date"'s value is always "yyyy-mm-dd"
// and type="time"'s value is always 24-hour "HH:mm" - both are hard
// per-spec guarantees on the underlying value, regardless of how the
// widget visually presents itself.
const showRangeModal = ref(false);
const pendingFormat = ref('excel'); // 'excel' | 'pdf'
const rangeFromDate = ref('');
const rangeFromTime = ref('');
const rangeToDate = ref('');
const rangeToTime = ref('');
const exporting = ref(false);

// Mirrors the backend's tiered downsampling (routes/index.js pickBucket) -
// purely informational, so the export is honest about what it contains.
function bucketLabel(bucket) {
  if (bucket === '15m') return 'Rata-rata per 15 menit (rentang 2 jam - 1 hari)';
  if (bucket === '1h') return 'Rata-rata per 1 jam (rentang lebih dari 1 hari)';
  return 'Data lengkap, tiap pembacaan (rentang di bawah 2 jam)';
}

function openRangeModal(format) {
  pendingFormat.value = format;
  if (!rangeFromDate.value || !rangeToDate.value) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    rangeFromDate.value = fmtDatePart(oneHourAgo);
    rangeFromTime.value = fmtTimePart(oneHourAgo);
    rangeToDate.value = fmtDatePart(now);
    rangeToTime.value = fmtTimePart(now);
  }
  showRangeModal.value = true;
}

async function confirmRangeExport() {
  const fromDate = combineDateTime(rangeFromDate.value, rangeFromTime.value);
  const toDate = combineDateTime(rangeToDate.value, rangeToTime.value);
  if (!fromDate || !toDate) {
    toasts.error('Waktu belum lengkap', 'Pilih tanggal & jam awal dan akhir.');
    return;
  }
  if (fromDate > toDate) {
    toasts.error('Rentang waktu tidak valid', 'Waktu awal harus sebelum atau sama dengan waktu akhir.');
    return;
  }

  exporting.value = true;
  try {
    const from = fromDate.toISOString();
    const to = toDate.toISOString();
    const { data } = await api.get('/readings', { params: { from, to }, timeout: 60000 });

    const log = data.items.map((item) => ({
      time: new Date(item.ts),
      currentMA: item.currentMA,
      flowRate: item.flowRate,
      flowLpm: item.flowLpm,
      flowLps: item.flowLps,
      totalLiters: item.totalLiters,
      totalM3: item.totalM3
    }));

    if (!log.length) {
      toasts.error('Tidak ada data', 'Tidak ada data pada rentang waktu yang dipilih.');
      return;
    }

    const bucketNote = bucketLabel(data.bucket);
    if (pendingFormat.value === 'excel') downloadExcel(log, bucketNote);
    else downloadPDF(log, bucketNote);

    showRangeModal.value = false;
  } catch (err) {
    toasts.error('Gagal mengambil data', err.message);
  } finally {
    exporting.value = false;
  }
}

const logClass = (type) => {
  if (type === 'warn') return 'log-warn';
  if (type === 'danger') return 'log-danger';
  if (type === 'success') return 'log-success';
  return 'log-info';
};

function clearLog() {
  alia.clearLogsLocal();
}

/** Ported from the device's own dashboard downloadExcel() - a CSV, not a
 * real .xlsx, same as the firmware (no library needed for either). `log`
 * is the date-range result fetched in confirmRangeExport(); `bucketNote`
 * discloses whether it's raw or server-side-averaged data. */
function downloadExcel(log, bucketNote) {
  let csv = '﻿';
  csv += 'No,Waktu,Arus (mA),Debit (m3/h),Debit (L/min),Debit (L/s),Total (L),Total (m3)\n';
  log.forEach((e, i) => {
    csv += `${i + 1},${fmtTimestamp(e.time)},${e.currentMA.toFixed(2)},${e.flowRate.toFixed(3)},${e.flowLpm.toFixed(3)},${e.flowLps.toFixed(3)},${e.totalLiters.toFixed(2)},${e.totalM3.toFixed(3)}\n`;
  });
  csv += '\nRINGKASAN,,,,\n';
  csv += `Total baris,${log.length},,,\n`;
  csv += `Waktu mulai,${fmtTimestamp(log[0].time)},,,\n`;
  csv += `Waktu akhir,${fmtTimestamp(log[log.length - 1].time)},,,\n`;
  csv += `Total volume (L),${log[log.length - 1].totalLiters.toFixed(2)},,,\n`;
  if (bucketNote) csv += `Granularitas,"${bucketNote}",,,\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `alia_auf750_${fmtTimestampFile(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  alia.addLog('success', 'Download Excel berhasil: ' + a.download);
  toasts.success('Excel berhasil diunduh');
}

/** Ported from the device's own dashboard downloadPDF() - opens a print
 * window, same approach as the firmware (no PDF library needed). The
 * generated report is its own standalone document, not part of the app's
 * UI, so its styling is self-contained here rather than in styles.css.
 * `log` is the date-range result fetched in confirmRangeExport(); `bucketNote`
 * discloses whether it's raw or server-side-averaged data. */
function downloadPDF(log, bucketNote) {
  const now = new Date();
  const startT = fmtTimestamp(log[0].time);
  const endT = fmtTimestamp(log[log.length - 1].time);
  const lastTotL = log[log.length - 1].totalLiters;
  let sumQ = 0;
  let sumI = 0;
  for (const e of log) {
    sumQ += e.flowRate;
    sumI += e.currentMA;
  }
  const avgQ = sumQ / log.length;
  const avgI = sumI / log.length;

  const maxRows = Math.min(log.length, 2000);
  const step = Math.max(1, Math.ceil(log.length / maxRows));
  let rows = '';
  let rowNo = 0;
  for (let i = 0; i < log.length; i += step) {
    const e = log[i];
    rowNo++;
    rows += `<tr><td class="ctr">${rowNo}</td><td>${fmtTimestamp(e.time)}</td><td class="num">${e.currentMA.toFixed(2)}</td><td class="num">${e.flowRate.toFixed(3)}</td><td class="num">${e.flowLpm.toFixed(3)}</td><td class="num">${e.totalLiters.toFixed(2)}</td><td class="num">${e.totalM3.toFixed(3)}</td></tr>`;
  }

  const css = `
    *{box-sizing:border-box;}
    body{font-family:Arial,Helvetica,sans-serif;color:#0e2138;margin:24px;background:#fff;}
    h1{margin:0 0 4px;font-size:20px;color:#0e2138;}
    h1 span.kuning{color:#c9960a;}
    .sub{color:#5b7a9a;font-size:12px;margin-bottom:14px;}
    .summary{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;}
    .card{border:1px solid #cfd9e4;border-left:4px solid #e8b007;border-radius:6px;padding:8px 12px;min-width:150px;background:#f7fafd;}
    .card .lbl{font-size:10px;color:#1f4d7a;text-transform:uppercase;letter-spacing:.5px;font-weight:700;}
    .card .v{font-size:15px;font-weight:700;margin-top:2px;color:#0e2138;}
    table{border-collapse:collapse;width:100%;font-size:11px;table-layout:fixed;}
    th{background:#0e2138;color:#f0c419;padding:6px 8px;text-align:left;font-weight:700;border-bottom:2px solid #e8b007;}
    th.num{text-align:right;} th.ctr{text-align:center;}
    td{border-bottom:1px solid #e6eaee;padding:4px 8px;color:#0e2138;}
    td.num{text-align:right;font-variant-numeric:tabular-nums;}
    td.ctr{text-align:center;font-variant-numeric:tabular-nums;color:#1f4d7a;font-weight:700;}
    tr:nth-child(even) td{background:#f2f6fb;}
    .footer{margin-top:18px;font-size:10px;color:#5b7a9a;text-align:center;border-top:1px solid #e8b007;padding-top:8px;}
    @media print{ body{margin:10mm;} .noprint{display:none !important;} thead{display:table-header-group;} tr{page-break-inside:avoid;} }
  `;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Alia AUF750 Report</title><style>${css}</style></head><body>
    <h1>Laporan Monitoring <span class="kuning">Alia AUF750</span> (4-20mA)</h1>
    <div class="sub">Dicetak: ${fmtTimestamp(now)}</div>
    <div class="summary">
      <div class="card"><div class="lbl">Periode</div><div class="v">${startT.substring(11)} &ndash; ${endT.substring(11)}</div></div>
      <div class="card"><div class="lbl">Jumlah Data</div><div class="v">${log.length} data</div></div>
      <div class="card"><div class="lbl">Arus Rata-rata</div><div class="v">${avgI.toFixed(2)} mA</div></div>
      <div class="card"><div class="lbl">Debit Rata-rata</div><div class="v">${avgQ.toFixed(3)} m&sup3;/h</div></div>
      <div class="card"><div class="lbl">Total Volume</div><div class="v">${lastTotL.toFixed(2)} L (${(lastTotL / 1000).toFixed(3)} m&sup3;)</div></div>
      <div class="card"><div class="lbl">Granularitas</div><div class="v" style="font-size:12px">${bucketNote || '-'}</div></div>
    </div>
    <p class="noprint" style="font-size:12px;color:#1f4d7a;">Pada dialog print, pilih <b>Tujuan &rarr; Save as PDF</b>.</p>
    <table>
      <thead><tr><th class="ctr">No</th><th>Waktu</th><th class="num">Arus (mA)</th><th class="num">Debit (m&sup3;/h)</th><th class="num">Debit (L/min)</th><th class="num">Total (L)</th><th class="num">Total (m&sup3;)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">Toekang Air &mdash; Solusi Integrasi Sistem Pengelolaan Air</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    toasts.error('Popup diblokir', 'Izinkan popup untuk mengunduh PDF.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  alia.addLog('success', 'PDF report dibuka di tab baru');
}

async function resetLog() {
  if (!alia.readingLog.length) {
    toasts.error('Log sudah kosong');
    return;
  }
  const ok = await confirm.ask({
    title: 'Reset log',
    message: `Hapus ${alia.readingLog.length} baris riwayat data? Tindakan ini tidak dapat dibatalkan.`,
    confirmLabel: 'Hapus',
    danger: true
  });
  if (!ok) return;
  alia.clearReadingLog();
  toasts.success('Log riwayat dihapus');
}
</script>

<template>
  <div class="panel" style="margin-top: 12px">
    <div class="panel-header">
      <span class="panel-title">📋 Log Aktivitas</span>
      <div class="log-actions">
        <button class="btn-download" title="Download data (CSV) by tanggal" @click="openRangeModal('excel')">📥 Excel</button>
        <button class="btn-download" title="Download laporan PDF by tanggal" @click="openRangeModal('pdf')">📄 PDF</button>
        <button class="btn-download" title="Reset riwayat data" @click="resetLog">🗑 Reset</button>
        <button class="btn-download" @click="clearLog">Bersihkan tampilan</button>
      </div>
    </div>
    <div class="log-area">
      <div v-if="!recentLogs.length" class="log-entry">
        <span class="log-time">--:--:--</span> <span class="log-info">Belum ada log.</span>
      </div>
      <div v-for="(l, index) in recentLogs" :key="index" class="log-entry">
        <span class="log-time">{{ fmtTimestamp(new Date(l.time)) }}</span>
        <span :class="logClass(l.type)">{{ l.message }}</span>
      </div>
    </div>
  </div>

  <ModalDialog
    v-if="showRangeModal"
    :title= "pendingFormat === 'excel' ? 'Download Excel' : 'Download PDF'"    
    width="380px"
    @close="showRangeModal = false"
  >
    <form id="range-export-form" @submit.prevent="confirmRangeExport">
      <label class="field">
        <span>Dari*</span>
        <div class="row" style="gap: 8px">
          <input v-model="rangeFromDate" type="date" required style="flex: 1.3" />
          <input v-model="rangeFromTime" type="time" lang="en-GB" required style="flex: 1" />
        </div>
      </label>
      <label class="field">
        <span>Hingga*</span>
        <div class="row" style="gap: 8px">
          <input v-model="rangeToDate" type="date" required style="flex: 1.3" />
          <input v-model="rangeToTime" type="time" lang="en-GB" required style="flex: 1" />
        </div>
      </label>
      <p class="hint">
        Data di-housekeeping hingga 30 hari terakhir<br>
        - Rentang data dua jam: data per detik akan diunduh<br>
        - Rentang data dua jam hingga satu hari: rata-rata data per 15 menit akan diunduh<br>
        - Data lebih dari satu hari akan diunduh dengan detail rata-rata per jam
      </p>
    </form>

    <template #footer>
      <button class="btn btn-ghost" style="width: auto" @click="showRangeModal = false">Batal</button>
      <button
        class="btn btn-primary"
        style="width: auto"
        form="range-export-form"
        type="submit"
        :disabled="exporting"
      >
        {{ exporting ? 'Mengambil data…' : 'Download' }}
      </button>
    </template>
  </ModalDialog>
</template>
