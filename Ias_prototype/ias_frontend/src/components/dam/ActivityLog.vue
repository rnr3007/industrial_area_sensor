<script setup>
import { computed } from 'vue';
import { useDamStore } from '@/stores/dam';
import { useToastStore } from '@/stores/toast';

const dam = useDamStore();
const toasts = useToastStore();

const recentLogs = computed(() => dam.logs.slice(-50));

const logClass = (type) => {
  if (type === 'warn') return 'log-warn';
  if (type === 'danger') return 'log-danger';
  if (type === 'success') return 'log-success';
  return 'log-info';
};

function clearLog() {
  dam.clearLogsLocal();
}

function downloadPDF() {
  if (typeof window.html2pdf === 'undefined') {
    toasts.error('Library PDF belum termuat', 'Cek koneksi internet Anda.');
    dam.addLog('danger', 'Gagal download PDF: html2pdf tidak tersedia');
    return;
  }

  const now = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const wrapper = document.createElement('div');
  wrapper.style.padding = '24px';
  wrapper.style.background = '#ffffff';
  wrapper.style.color = '#000000';
  wrapper.style.fontFamily = 'Arial, Helvetica, sans-serif';
  wrapper.style.width = '100%';
  wrapper.style.maxWidth = '760px';

  const statusComp = dam.deflatingMode ? 'SUSUT' : dam.compressorOn ? 'ON' : 'OFF';

  wrapper.innerHTML = `
    <div style="border-bottom:2px solid #0077b6;padding-bottom:10px;margin-bottom:16px;">
      <h1 style="margin:0;font-size:20px;color:#0077b6;">LAPORAN SISTEM RUBBER DAM</h1>
      <p style="margin:4px 0 0;font-size:12px;color:#555;">Monitoring &amp; Kontrol Otomatis</p>
      <p style="margin:4px 0 0;font-size:11px;color:#777;">Dicetak: ${now}</p>
    </div>

    <h2 style="font-size:14px;margin:0 0 8px;color:#222;">1. Data Sensor &amp; Status</h2>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px;">
      <thead>
        <tr style="background:#e3f2fd;">
          <th style="border:1px solid #999;padding:6px;text-align:left;">Parameter</th>
          <th style="border:1px solid #999;padding:6px;text-align:right;">Nilai</th>
          <th style="border:1px solid #999;padding:6px;text-align:left;">Satuan</th>
        </tr>
      </thead>
      <tbody>
        <tr><td style="border:1px solid #999;padding:6px;">Tekanan Rubber (Sensor Tekanan Udara)</td><td style="border:1px solid #999;padding:6px;text-align:right;"><b>${dam.pressure.toFixed(2)}</b></td><td style="border:1px solid #999;padding:6px;">Bar</td></tr>
        <tr><td style="border:1px solid #999;padding:6px;">Ketinggian Air Hulu (Sensor Air)</td><td style="border:1px solid #999;padding:6px;text-align:right;"><b>${dam.waterLevel.toFixed(2)}</b></td><td style="border:1px solid #999;padding:6px;">Meter</td></tr>
        <tr><td style="border:1px solid #999;padding:6px;">Kekuatan Rubber</td><td style="border:1px solid #999;padding:6px;text-align:right;">${dam.rubberStrength.toFixed(1)}</td><td style="border:1px solid #999;padding:6px;">%</td></tr>
        <tr><td style="border:1px solid #999;padding:6px;">Ketinggian Rubber</td><td style="border:1px solid #999;padding:6px;text-align:right;">${dam.rubberHeight.toFixed(2)}</td><td style="border:1px solid #999;padding:6px;">Meter</td></tr>
        <tr><td style="border:1px solid #999;padding:6px;">Status Kompresor</td><td style="border:1px solid #999;padding:6px;text-align:right;">${statusComp}</td><td style="border:1px solid #999;padding:6px;">-</td></tr>
        <tr><td style="border:1px solid #999;padding:6px;">Mode Operasi</td><td style="border:1px solid #999;padding:6px;text-align:right;">${dam.mode.toUpperCase()}</td><td style="border:1px solid #999;padding:6px;">-</td></tr>
        <tr><td style="border:1px solid #999;padding:6px;">Threshold Min (ON)</td><td style="border:1px solid #999;padding:6px;text-align:right;">${dam.thresholdMin.toFixed(1)}</td><td style="border:1px solid #999;padding:6px;">Bar</td></tr>
        <tr><td style="border:1px solid #999;padding:6px;">Threshold Max (OFF)</td><td style="border:1px solid #999;padding:6px;text-align:right;">${dam.thresholdMax.toFixed(1)}</td><td style="border:1px solid #999;padding:6px;">Bar</td></tr>
      </tbody>
    </table>

    <h2 style="font-size:14px;margin:0 0 8px;color:#222;">2. Log Aktivitas (50 Terakhir)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead>
        <tr style="background:#e3f2fd;">
          <th style="border:1px solid #999;padding:5px;text-align:left;width:70px;">Waktu</th>
          <th style="border:1px solid #999;padding:5px;text-align:left;width:60px;">Tipe</th>
          <th style="border:1px solid #999;padding:5px;text-align:left;">Pesan</th>
        </tr>
      </thead>
      <tbody>
        ${
          recentLogs.value
            .map(
              (l) => `
          <tr>
            <td style="border:1px solid #999;padding:4px;">${l.time}</td>
            <td style="border:1px solid #999;padding:4px;">${l.type}</td>
            <td style="border:1px solid #999;padding:4px;">${l.message}</td>
          </tr>`
            )
            .join('') ||
          '<tr><td colspan="3" style="border:1px solid #999;padding:6px;text-align:center;">Tidak ada log</td></tr>'
        }
      </tbody>
    </table>

    <p style="font-size:10px;color:#888;margin-top:18px;text-align:center;">
      — Laporan dihasilkan otomatis oleh Sistem Monitoring Rubber Dam —
    </p>
  `;

  document.body.appendChild(wrapper);

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const opt = {
    margin: 10,
    filename: `rubber-dam-report-${timestamp}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  dam.addLog('info', 'Menyiapkan file PDF...');
  window
    .html2pdf()
    .set(opt)
    .from(wrapper)
    .save()
    .then(() => {
      dam.addLog('success', 'Download PDF berhasil');
      toasts.success('PDF berhasil diunduh');
      wrapper.remove();
    })
    .catch((err) => {
      dam.addLog('danger', 'Gagal membuat PDF: ' + err.message);
      toasts.error('Gagal download PDF', err.message);
      wrapper.remove();
    });
}

function downloadExcel() {
  if (typeof window.XLSX === 'undefined') {
    toasts.error('Library Excel belum termuat', 'Cek koneksi internet Anda.');
    dam.addLog('danger', 'Gagal download Excel: SheetJS tidak tersedia');
    return;
  }

  const XLSX = window.XLSX;
  const now = new Date().toLocaleString('id-ID');
  const statusComp = dam.deflatingMode ? 'SUSUT' : dam.compressorOn ? 'ON' : 'OFF';

  const sensorRows = [
    ['LAPORAN SISTEM RUBBER DAM'],
    ['Waktu Export', now],
    [],
    ['Parameter', 'Nilai', 'Satuan'],
    ['Tekanan Rubber (Sensor Tekanan Udara)', Number(dam.pressure.toFixed(2)), 'Bar'],
    ['Ketinggian Air Hulu (Sensor Air)', Number(dam.waterLevel.toFixed(2)), 'Meter'],
    ['Kekuatan Rubber', Number(dam.rubberStrength.toFixed(1)), '%'],
    ['Ketinggian Rubber', Number(dam.rubberHeight.toFixed(2)), 'Meter'],
    ['Status Kompresor', statusComp, '-'],
    ['Mode Operasi', dam.mode.toUpperCase(), '-'],
    ['Threshold Min (ON)', Number(dam.thresholdMin.toFixed(1)), 'Bar'],
    ['Threshold Max (OFF)', Number(dam.thresholdMax.toFixed(1)), 'Bar']
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sensorRows);
  ws1['!cols'] = [{ wch: 38 }, { wch: 18 }, { wch: 12 }];

  const logRows = [['Waktu', 'Tipe', 'Pesan']];
  dam.logs.forEach((l) => logRows.push([l.time, l.type, l.message]));
  const ws2 = XLSX.utils.aoa_to_sheet(logRows);
  ws2['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Data Sensor');
  XLSX.utils.book_append_sheet(wb, ws2, 'Log Aktivitas');

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `rubber-dam-data-${timestamp}.xlsx`;

  try {
    XLSX.writeFile(wb, filename);
    dam.addLog('success', 'Download Excel berhasil: ' + filename);
    toasts.success('Excel berhasil diunduh');
  } catch (err) {
    dam.addLog('danger', 'Gagal membuat Excel: ' + err.message);
    toasts.error('Gagal download Excel', err.message);
  }
}
</script>

<template>
  <div class="panel" style="margin-top: 12px">
    <div class="panel-header">
      <span class="panel-title">📋 Log Aktivitas</span>
      <div class="log-actions">
        <button class="btn-download pdf" title="Download laporan PDF" @click="downloadPDF">📄 PDF</button>
        <button class="btn-download excel" title="Download data Excel" @click="downloadExcel">📊 EXCEL</button>
        <button class="btn-download" @click="clearLog">🗑 BERSIHKAN</button>
      </div>
    </div>
    <div class="log-area">
      <div v-if="!recentLogs.length" class="log-entry">
        <span class="log-time">--:--:--</span> <span class="log-info">Belum ada log.</span>
      </div>
      <div v-for="(l, index) in recentLogs" :key="index" class="log-entry">
        <span class="log-time">{{ l.time }}</span>
        <span :class="logClass(l.type)">{{ l.message }}</span>
      </div>
    </div>
  </div>
</template>
