'use strict';

/* ================================================================
   KONFIGURASI
   ================================================================ */
const CONFIG = {
  dataUrl      : '/data',
  pollMs       : 1000,
  maxPoints    : 60,
  maxLogSize   : 3600,
  tableRows    : 20,
  flowAt4mA    : 0,
  flowAt20mA   : 100
};

/* ================================================================
   DOM
   ================================================================ */
const $ = (id) => document.getElementById(id);

const dom = {
  lcd       : $('lcd'),
  runTxt    : $('runTxt'),
  status    : $('status'),
  flowM3H   : $('flowM3H'),
  flowSub   : $('flowSub'),
  totalM3   : $('totalM3'),
  totalSub  : $('totalSub'),
  currMA    : $('currMA'),
  logBadge  : $('logBadge'),
  okBadge   : $('okBadge'),
  uptime    : $('uptimeBadge'),
  clock     : $('clock'),
  connPill  : $('connPill'),
  logBody   : $('logBody'),
  stMin     : $('stMin'),
  stMax     : $('stMax'),
  stAvg     : $('stAvg'),
  stIavg    : $('stIavg'),
  canvas    : $('chartCanvas'),
  btnExcel  : $('btnExcel'),
  btnPdf    : $('btnPdf'),
  btnReset  : $('btnReset')
};

const ctx = dom.canvas.getContext('2d');

/* ================================================================
   STATE
   ================================================================ */
let dataPoints = [];
let dataLog    = [];
let okCount    = 0;
let errCount   = 0;
let polling    = false;

const stats = { min: null, max: null, sumQ: 0, sumI: 0, n: 0 };

let chartW = 0, chartH = 0;
const startedAt = Date.now();

/* ================================================================
   UTIL
   ================================================================ */
const pad2 = (n) => (n < 10 ? '0' : '') + n;

function fmtTimestamp(d){
  return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate())
       + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

function fmtTimestampFile(d){
  return d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate())
       + '_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}

function fmtDuration(ms){
  const s = Math.floor(ms / 1000);
  return pad2(Math.floor(s/3600)) + ':' + pad2(Math.floor(s%3600/60)) + ':' + pad2(s%60);
}

/* ================================================================
   CHART
   ================================================================ */
function resizeCanvas(){
  const rect = dom.canvas.getBoundingClientRect();
  const dpr  = window.devicePixelRatio || 1;
  const w    = Math.max(50, Math.floor(rect.width));
  const h    = Math.max(50, Math.floor(rect.height));

  if (dom.canvas.width !== Math.floor(w*dpr) || dom.canvas.height !== Math.floor(h*dpr)){
    dom.canvas.width  = Math.floor(w*dpr);
    dom.canvas.height = Math.floor(h*dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  chartW = w; chartH = h;
  drawChart();
}

function drawChart(){
  const w = chartW, h = chartH;
  if (!w || !h) return;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#081627';
  ctx.fillRect(0, 0, w, h);

  const padL = 56, padR = 14, padT = 14, padB = 26;
  const plotW = Math.max(10, w - padL - padR);
  const plotH = Math.max(10, h - padT - padB);

  let maxVal = 0.05;
  for (let i = 0; i < dataPoints.length; i++){
    if (dataPoints[i] > maxVal) maxVal = dataPoints[i];
  }
  maxVal *= 1.25;

  /* grid + label Y */
  ctx.font = '11px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++){
    const y = padT + plotH * i / 4;
    ctx.strokeStyle = '#1b3a5c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();

    ctx.fillStyle = '#8fb4d9';
    ctx.fillText((maxVal * (1 - i/4)).toFixed(3), padL - 6, y);
  }

  /* label sumbu */
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#8fb4d9';
  ctx.fillText('Waktu (detik)', padL + plotW/2, h - 6);

  ctx.save();
  ctx.translate(14, padT + plotH/2);
  ctx.rotate(-Math.PI/2);
  ctx.textBaseline = 'middle';
  ctx.fillText('Debit (m\u00B3/h)', 0, 0);
  ctx.restore();

  if (dataPoints.length < 2) return;

  const n     = dataPoints.length;
  const xStep = plotW / (CONFIG.maxPoints - 1);

  /* garis */
  ctx.beginPath();
  for (let i = 0; i < n; i++){
    const x = padL + xStep * i;
    const y = padT + plotH * (1 - dataPoints[i] / maxVal);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.strokeStyle = '#f0c419';
  ctx.shadowColor = 'rgba(240,196,25,.65)';
  ctx.shadowBlur  = 8;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  /* area fill */
  ctx.lineTo(padL + xStep * (n - 1), padT + plotH);
  ctx.lineTo(padL, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(240,196,25,0.10)';
  ctx.fill();

  /* titik terakhir */
  const lx = padL + xStep * (n - 1);
  const ly = padT + plotH * (1 - dataPoints[n-1] / maxVal);
  ctx.beginPath();
  ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#f0c419';
  ctx.fill();
}

/* ================================================================
   UI UPDATE
   ================================================================ */
function updateBadges(){
  dom.logBadge.innerText = 'Log: ' + dataLog.length + ' baris';
  dom.okBadge.innerText  = 'OK ' + okCount + ' \u00B7 ERR ' + errCount;
}

function updateStats(){
  if (stats.n === 0){
    dom.stMin.innerText  = '0.000';
    dom.stMax.innerText  = '0.000';
    dom.stAvg.innerText  = '0.000';
    dom.stIavg.innerText = '0.00';
    return;
  }
  dom.stMin.innerText  = stats.min.toFixed(3);
  dom.stMax.innerText  = stats.max.toFixed(3);
  dom.stAvg.innerText  = (stats.sumQ / stats.n).toFixed(3);
  dom.stIavg.innerText = (stats.sumI / stats.n).toFixed(2);
}

function pushLogRow(entry, no){
  if (dataLog.length === 1){
    dom.logBody.innerHTML = '';
  }
  const tr = document.createElement('tr');
  tr.innerHTML =
      '<td class="ctr">' + no + '</td>'
    + '<td>' + fmtTimestamp(entry.time).substring(11) + '</td>'
    + '<td class="num">' + entry.currentMA.toFixed(2) + '</td>'
    + '<td class="num">' + entry.qM3h.toFixed(3) + '</td>'
    + '<td class="num">' + entry.qLmin.toFixed(3) + '</td>'
    + '<td class="num">' + entry.totL.toFixed(2) + '</td>';

  dom.logBody.insertBefore(tr, dom.logBody.firstChild);

  while (dom.logBody.children.length > CONFIG.tableRows){
    dom.logBody.removeChild(dom.logBody.lastChild);
  }
}

/* ================================================================
   POLLING /data
   ================================================================ */
async function fetchData(){
  if (polling) return;
  polling = true;

  try {
    const res = await fetch(CONFIG.dataUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const d = await res.json();

    const qM3h = Number(d.flowRate)    || 0;
    const mA   = Number(d.currentMA)   || 0;
    const totL = Number(d.totalLiters) || 0;

    const qLmin = qM3h * 1000 / 60;
    const qLs   = qM3h * 1000 / 3600;
    const totM3 = totL / 1000;

    /* --- LCD --- */
    dom.flowM3H.innerText  = qM3h.toFixed(3);
    dom.flowSub.innerHTML  = qLmin.toFixed(3) + ' L/min &nbsp;|&nbsp; ' + qLs.toFixed(3) + ' L/s';
    dom.totalM3.innerText  = totM3.toFixed(3);
    dom.totalSub.innerText = totL.toFixed(2) + ' Liter';
    dom.currMA.innerText   = mA.toFixed(2) + ' mA';

    /* --- status --- */
    dom.lcd.classList.remove('err', 'idle');
    if (mA < 3.5){
      dom.lcd.classList.add('idle');
      dom.runTxt.innerText = 'IDLE';
      dom.status.innerText = 'NO SIGNAL';
    } else if (mA > 21.0){
      dom.lcd.classList.add('idle');
      dom.runTxt.innerText = 'OVER';
      dom.status.innerText = 'OVER RANGE';
    } else {
      dom.runTxt.innerText = 'RUN';
      dom.status.innerText = 'LINK OK #' + okCount;
    }

    dom.connPill.className = 'pill on';
    dom.connPill.innerText = 'ONLINE';

    /* --- chart --- */
    dataPoints.push(qM3h);
    if (dataPoints.length > CONFIG.maxPoints) dataPoints.shift();
    drawChart();

    /* --- log --- */
    const entry = {
      time: new Date(),
      qM3h: qM3h, qLmin: qLmin, qLs: qLs,
      totL: totL, totM3: totM3,
      currentMA: mA
    };
    dataLog.push(entry);
    if (dataLog.length > CONFIG.maxLogSize) dataLog.shift();

    /* --- statistik --- */
    if (stats.min === null || qM3h < stats.min) stats.min = qM3h;
    if (stats.max === null || qM3h > stats.max) stats.max = qM3h;
    stats.sumQ += qM3h;
    stats.sumI += mA;
    stats.n++;

    /* --- render --- */
    okCount++;
    pushLogRow(entry, dataLog.length);
    updateBadges();
    updateStats();

  } catch (err){
    errCount++;
    dom.lcd.classList.add('err');
    dom.lcd.classList.remove('idle');
    dom.runTxt.innerText   = 'ERR';
    dom.status.innerText   = 'LINK ERR ' + errCount + 'x';
    dom.connPill.className = 'pill off';
    dom.connPill.innerText = 'OFFLINE';
    updateBadges();
  } finally {
    polling = false;
  }
}

/* ================================================================
   EXPORT EXCEL (.csv)
   ================================================================ */
function downloadExcel(){
  if (dataLog.length === 0){ alert('Belum ada data.'); return; }

  let csv = '\uFEFF';
  csv += 'No,Waktu,Arus (mA),Debit (m3/h),Debit (L/min),Debit (L/s),Total (L),Total (m3)\n';

  for (let i = 0; i < dataLog.length; i++){
    const e = dataLog[i];
    csv += (i+1) + ','
        +  fmtTimestamp(e.time) + ','
        +  e.currentMA.toFixed(2) + ','
        +  e.qM3h.toFixed(3) + ','
        +  e.qLmin.toFixed(3) + ','
        +  e.qLs.toFixed(3) + ','
        +  e.totL.toFixed(2) + ','
        +  e.totM3.toFixed(3) + '\n';
  }

  csv += '\nRINGKASAN,,,,\n';
  csv += 'Total baris,' + dataLog.length + ',,,\n';
  csv += 'Waktu mulai,' + fmtTimestamp(dataLog[0].time) + ',,,\n';
  csv += 'Waktu akhir,' + fmtTimestamp(dataLog[dataLog.length-1].time) + ',,,\n';
  csv += 'Total volume (L),' + dataLog[dataLog.length-1].totL.toFixed(2) + ',,,\n';

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');

  a.href     = url;
  a.download = 'alia_auf750_4-20mA_' + fmtTimestampFile(new Date()) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ================================================================
   EXPORT PDF (via jendela print)
   ================================================================ */
function downloadPDF(){
  if (dataLog.length === 0){ alert('Belum ada data.'); return; }

  const now      = new Date();
  const startT   = fmtTimestamp(dataLog[0].time);
  const endT     = fmtTimestamp(dataLog[dataLog.length-1].time);
  const lastTotL = dataLog[dataLog.length-1].totL;

  let sumQ = 0, sumI = 0;
  for (let i = 0; i < dataLog.length; i++){
    sumQ += dataLog[i].qM3h;
    sumI += dataLog[i].currentMA;
  }
  const avgQ = sumQ / dataLog.length;
  const avgI = sumI / dataLog.length;

  /* --- baris tabel (dibatasi 2000 baris) --- */
  let rows = '';
  const maxRows = 2000;
  const step    = Math.max(1, Math.ceil(dataLog.length / maxRows));
  let rowNo = 0;

  for (let i = 0; i < dataLog.length; i += step){
    const e = dataLog[i];
    rowNo++;
    rows += '<tr>'
         +  '<td class="ctr">' + rowNo + '</td>'
         +  '<td>' + fmtTimestamp(e.time) + '</td>'
         +  '<td class="num">' + e.currentMA.toFixed(2) + '</td>'
         +  '<td class="num">' + e.qM3h.toFixed(3) + '</td>'
         +  '<td class="num">' + e.qLmin.toFixed(3) + '</td>'
         +  '<td class="num">' + e.totL.toFixed(2) + '</td>'
         +  '<td class="num">' + e.totM3.toFixed(3) + '</td>'
         +  '</tr>';
  }

  /* --- CSS laporan --- */
  const css =
      '*{box-sizing:border-box;}'
    + 'body{font-family:Arial,Helvetica,sans-serif;color:#0e2138;margin:24px;background:#fff;}'
    + 'h1{margin:0 0 4px;font-size:20px;color:#0e2138;}'
    + 'h1 span.kuning{color:#c9960a;}'
    + '.sub{color:#5b7a9a;font-size:12px;margin-bottom:14px;}'
    + '.summary{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;}'
    + '.card{border:1px solid #cfd9e4;border-left:4px solid #e8b007;border-radius:6px;'
    +       'padding:8px 12px;min-width:150px;background:#f7fafd;}'
    + '.card .lbl{font-size:10px;color:#1f4d7a;text-transform:uppercase;'
    +            'letter-spacing:.5px;font-weight:700;}'
    + '.card .v{font-size:15px;font-weight:700;margin-top:2px;color:#0e2138;}'
    + 'table{border-collapse:collapse;width:100%;font-size:11px;table-layout:fixed;}'
    + 'th{background:#0e2138;color:#f0c419;padding:6px 8px;text-align:left;'
    +    'font-weight:700;vertical-align:middle;border-bottom:2px solid #e8b007;}'
    + 'th.num{text-align:right;}'
    + 'th.ctr{text-align:center;}'
    + 'td{border-bottom:1px solid #e6eaee;padding:4px 8px;text-align:left;'
    +    'vertical-align:middle;color:#0e2138;}'
    + 'td.num{text-align:right;font-variant-numeric:tabular-nums;}'
    + 'td.ctr{text-align:center;font-variant-numeric:tabular-nums;'
    +        'color:#1f4d7a;font-weight:700;}'
    + 'tr:nth-child(even) td{background:#f2f6fb;}'
    + 'col.c-no{width:6%;}'
    + 'col.c-time{width:24%;}'
    + 'col.c-num{width:14%;}'
    + '.footer{margin-top:18px;font-size:10px;color:#5b7a9a;text-align:center;'
    +         'border-top:1px solid #e8b007;padding-top:8px;}'
    + '@media print{'
    +   'body{margin:10mm;}'
    +   '.noprint{display:none !important;}'
    +   'thead{display:table-header-group;}'
    +   'tr{page-break-inside:avoid;}'
    + '}';

  /* --- HTML laporan --- */
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<title>Alia AUF750 Report</title>'
    + '<style>' + css + '</style></head><body>'

    + '<h1>Laporan Monitoring <span class="kuning">Alia AUF750</span> (4-20mA)</h1>'
    + '<div class="sub">Dicetak: ' + fmtTimestamp(now) + '</div>'

    + '<div class="summary">'
    +   '<div class="card"><div class="lbl">Periode</div>'
    +     '<div class="v">' + startT.substring(11) + ' &ndash; ' + endT.substring(11) + '</div></div>'
    +   '<div class="card"><div class="lbl">Jumlah Data</div>'
    +     '<div class="v">' + dataLog.length + ' data</div></div>'
    +   '<div class="card"><div class="lbl">Arus Rata-rata</div>'
    +     '<div class="v">' + avgI.toFixed(2) + ' mA</div></div>'
    +   '<div class="card"><div class="lbl">Debit Rata-rata</div>'
    +     '<div class="v">' + avgQ.toFixed(3) + ' m&sup3;/h</div></div>'
    +   '<div class="card"><div class="lbl">Total Volume</div>'
    +     '<div class="v">' + lastTotL.toFixed(2) + ' L ('
    +       (lastTotL/1000).toFixed(3) + ' m&sup3;)</div></div>'
    + '</div>'

    + '<p class="noprint" style="font-size:12px;color:#1f4d7a;">'
    +   'Pada dialog print, pilih <b>Tujuan &rarr; Save as PDF</b>.</p>'

    + '<table>'
    +   '<colgroup>'
    +     '<col class="c-no"><col class="c-time">'
    +     '<col class="c-num"><col class="c-num"><col class="c-num">'
    +     '<col class="c-num"><col class="c-num">'
    +   '</colgroup>'
    +   '<thead><tr>'
    +     '<th class="ctr">No</th><th>Waktu</th>'
    +     '<th class="num">Arus (mA)</th>'
    +     '<th class="num">Debit (m&sup3;/h)</th>'
    +     '<th class="num">Debit (L/min)</th>'
    +     '<th class="num">Total (L)</th>'
    +     '<th class="num">Total (m&sup3;)</th>'
    +   '</tr></thead>'
    +   '<tbody>' + rows + '</tbody>'
    + '</table>'

    + '<div class="footer">Toekang Air &mdash; Solusi Integrasi Sistem Pengelolaan Air</div>'
    + '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print();},350);};</scr' + 'ipt>'
    + '</body></html>';

  const w = window.open('', '_blank');
  if (!w){ alert('Popup diblokir. Izinkan popup untuk halaman ini.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/* ================================================================
   RESET
   ================================================================ */
function resetLog(){
  if (dataLog.length === 0){ alert('Log sudah kosong.'); return; }
  if (!confirm('Hapus ' + dataLog.length + ' baris riwayat?')) return;

  dataLog    = [];
  dataPoints = [];
  stats.min = null;
  stats.max = null;
  stats.sumQ = 0;
  stats.sumI = 0;
  stats.n    = 0;

  dom.logBody.innerHTML = '<tr class="empty"><td colspan="6">Belum ada data&hellip;</td></tr>';

  drawChart();
  updateBadges();
  updateStats();
}

/* ================================================================
   TIMER: jam + uptime
   ================================================================ */
function tick(){
  const now = new Date();
  dom.clock.innerText  = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
  dom.uptime.innerText = fmtDuration(Date.now() - startedAt);
}

/* ================================================================
   INIT
   ================================================================ */
function init(){
  dom.btnExcel.addEventListener('click', downloadExcel);
  dom.btnPdf.addEventListener('click', downloadPDF);
  dom.btnReset.addEventListener('click', resetLog);

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 150));

  resizeCanvas();
  updateBadges();
  updateStats();
  tick();

  setInterval(tick, 1000);
  setInterval(fetchData, CONFIG.pollMs);
  fetchData();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}