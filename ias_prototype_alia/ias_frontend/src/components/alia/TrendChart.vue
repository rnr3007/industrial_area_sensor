<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAliaStore } from '@/stores/alia';

const alia = useAliaStore();
const canvasRef = ref(null);
let ctx = null;
let resizeTimer = null;

// Reads --bg-lcd/--border/--text-secondary/--accent-yellow-bright from
// styles.css so the chart matches the design tokens exactly - resolved once
// since canvas can't consume CSS custom properties directly.
function readThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    bg: styles.getPropertyValue('--bg-lcd').trim() || '#081627',
    grid: styles.getPropertyValue('--border').trim() || '#1b3a5c',
    axis: styles.getPropertyValue('--text-secondary').trim() || '#8fb4d9',
    line: styles.getPropertyValue('--accent-yellow-bright').trim() || '#f0c419'
  };
}

/** Ported 1:1 from the device's own dashboard drawChart(). */
function drawChart() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;
  const theme = readThemeColors();

  const w = canvas.width;
  const h = canvas.height;
  const padL = 54;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);

  const points = alia.trend;
  let maxVal = 0.05;
  for (const v of points) if (v > maxVal) maxVal = v;
  maxVal *= 1.25;

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.font = '11px Arial';
  ctx.fillStyle = theme.axis;
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText((maxVal * (1 - i / 4)).toFixed(3), padL - 6, y + 4);
  }
  ctx.textAlign = 'center';
  ctx.fillText('Waktu', padL + plotW / 2, h - 6);
  ctx.save();
  ctx.translate(14, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Debit (m³/h)', 0, 0);
  ctx.restore();

  if (points.length < 2) return;

  const n = points.length;
  const xStep = plotW / (alia.maxTrendPoints - 1);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = padL + xStep * i;
    const y = padT + plotH * (1 - points[i] / maxVal);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.line;
  ctx.shadowColor = 'rgba(240,196,25,.65)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.lineTo(padL + xStep * (n - 1), padT + plotH);
  ctx.lineTo(padL, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(240,196,25,0.10)';
  ctx.fill();

  const lastX = padL + xStep * (n - 1);
  const lastY = padT + plotH * (1 - points[n - 1] / maxVal);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, 2 * Math.PI);
  ctx.fillStyle = theme.line;
  ctx.fill();
}

function resizeCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const w = Math.floor(rect.width);
  const h = Math.floor(rect.height);
  if (w > 50 && h > 50 && (canvas.width !== w || canvas.height !== h)) {
    canvas.width = w;
    canvas.height = h;
  }
  drawChart();
}

function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeCanvas, 100);
}

watch(() => alia.trend.length, drawChart);

onMounted(() => {
  ctx = canvasRef.value.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  if (resizeTimer) clearTimeout(resizeTimer);
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <div class="chart-box">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>
