<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useDamStore } from '@/stores/dam';

const dam = useDamStore();
const canvasRef = ref(null);
let ctx = null;
let rafId = null;
let resizeTimer = null;

function bezier(t, p0, p1, p2) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
  };
}

function bezierDerivative(t, p0, p1, p2) {
  const mt = 1 - t;
  return {
    x: 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
  };
}

/** Ported 1:1 from the original prototype's canvas renderer. */
function drawDam() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;
  const container = canvas.parentElement;
  const containerWidth = container.clientWidth;
  const aspectRatio = 650 / 300;

  let w = Math.min(containerWidth - 8, 650);
  if (w < 200) w = 200;
  let h = Math.round(w / aspectRatio);

  if (window.innerWidth <= 768) {
    const rect = container.getBoundingClientRect();
    const availableHeight = window.innerHeight - rect.top - 24;
    if (availableHeight > 0) {
      h = availableHeight;
      w = Math.round(h * aspectRatio);
      if (w > containerWidth) {
        w = containerWidth;
        h = Math.round(w / aspectRatio);
      }
    }
  }

  canvas.width = w;
  canvas.height = h;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.clearRect(0, 0, w, h);

  const sc = Math.min(w / 650, h / 300);

  const rubberLeft = 210 * sc;
  const rubberRight = 440 * sc;
  const baseY = h - 55;
  const platLength = rubberRight - rubberLeft;
  const pivotX = rubberLeft;
  const pivotY = baseY;

  const inflationNorm = Math.max(0, Math.min(1, (dam.pressure - 0.5) / 4.0));
  const maxAngle = (50 * Math.PI) / 180;
  const angle = inflationNorm * maxAngle;

  const tipX = pivotX + platLength * Math.cos(angle);
  const tipY = pivotY - platLength * Math.sin(angle);

  const waterY = h - 40 - (dam.waterLevel / 3) * 160;
  ctx.fillStyle = '#81d4fa';
  ctx.fillRect(30 * sc, waterY, 220 * sc, h - waterY);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(30 * sc, waterY, 220 * sc, h - waterY);

  ctx.strokeStyle = '#b3e5fc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(30 * sc, waterY);
  ctx.lineTo(250 * sc, waterY);
  ctx.stroke();

  ctx.fillStyle = '#e1f5fe';
  ctx.font = `bold ${Math.max(8, 11 * sc)}px "Inter", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('↕ ' + dam.waterLevel.toFixed(1) + ' m', 35 * sc, waterY - 8);

  const pondasiLeft = 190 * sc;
  const pondasiRight = 460 * sc;
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(pondasiLeft, baseY, pondasiRight - pondasiLeft, 45);
  ctx.fillStyle = '#3d4555';
  ctx.fillRect(pondasiLeft - 5 * sc, baseY + 5, pondasiRight - pondasiLeft + 10 * sc, 8);

  ctx.save();
  ctx.fillStyle = '#1c1c2e';
  ctx.strokeStyle = '#3d3d5c';
  ctx.lineWidth = 2 * sc;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  const cpX = pivotX + platLength * 0.55;
  const cpY = tipY - 18 * sc - inflationNorm * 20 * sc;
  ctx.quadraticCurveTo(cpX, cpY, tipX, tipY);
  ctx.lineTo(rubberRight, baseY);
  ctx.lineTo(pivotX, pivotY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const platThickness = 12 * sc;
  const segments = 30;

  const P0 = { x: pivotX, y: pivotY };
  const P1 = { x: cpX, y: cpY };
  const P2 = { x: tipX, y: tipY };

  const bottomPoints = [];
  const topPoints = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = bezier(t, P0, P1, P2);
    bottomPoints.push(pt);

    if (i === 0) {
      topPoints.push({ x: pt.x, y: pt.y - platThickness });
    } else {
      const deriv = bezierDerivative(t, P0, P1, P2);
      const len = Math.sqrt(deriv.x * deriv.x + deriv.y * deriv.y);
      if (len < 0.001) {
        topPoints.push({ x: pt.x, y: pt.y - platThickness });
      } else {
        let nx = deriv.y / len;
        let ny = -deriv.x / len;
        if (ny > 0) {
          nx = -nx;
          ny = -ny;
        }
        topPoints.push({
          x: pt.x + nx * platThickness,
          y: pt.y + ny * platThickness
        });
      }
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(bottomPoints[0].x, bottomPoints[0].y);
  for (let i = 1; i < bottomPoints.length; i++) {
    ctx.lineTo(bottomPoints[i].x, bottomPoints[i].y);
  }
  ctx.lineTo(topPoints[topPoints.length - 1].x, topPoints[topPoints.length - 1].y);
  for (let i = topPoints.length - 2; i >= 0; i--) {
    ctx.lineTo(topPoints[i].x, topPoints[i].y);
  }
  ctx.closePath();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fill();
  ctx.translate(2, 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.fill();
  ctx.translate(-2, -2);

  const platGrad = ctx.createLinearGradient(P0.x, P0.y, P2.x, P0.y);
  platGrad.addColorStop(0, '#d0d6dc');
  platGrad.addColorStop(0.3, '#a8b4bf');
  platGrad.addColorStop(0.7, '#6b7a8a');
  platGrad.addColorStop(1, '#4a5568');
  ctx.fillStyle = platGrad;
  ctx.fill();
  ctx.strokeStyle = '#3b444f';
  ctx.lineWidth = 1.8 * sc;
  ctx.stroke();

  const boltRadius = 2.5 * sc;
  ctx.fillStyle = '#2d3748';
  for (let i = 0; i <= segments; i++) {
    const bx = (bottomPoints[i].x + topPoints[i].x) / 2;
    const by = (bottomPoints[i].y + topPoints[i].y) / 2;
    ctx.beginPath();
    ctx.arc(bx, by, boltRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(bx - 0.8 * sc, by - 0.8 * sc, boltRadius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d3748';
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 0.5;
  for (let i = 5; i < segments; i += 5) {
    ctx.beginPath();
    ctx.moveTo(bottomPoints[i].x, bottomPoints[i].y);
    ctx.lineTo(topPoints[i].x, topPoints[i].y);
    ctx.stroke();
  }

  ctx.restore();

  const labelX = pivotX + platLength * 0.5;
  const labelY = baseY - 45 * sc;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.max(10, 14 * sc)}px "Inter", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(dam.pressure.toFixed(1) + ' Bar', labelX, labelY);

  const compX = 520 * sc;
  const compY = 60;
  ctx.fillStyle = dam.deflatingMode ? '#ff9100' : dam.compressorOn ? '#00e676' : '#546e7a';
  ctx.beginPath();
  ctx.arc(compX, compY, 8 * sc, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `${Math.max(7, 9 * sc)}px "Inter", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('KOMPRESOR', compX, compY + 20 * sc);

  if (inflationNorm > 0.2) {
    const rubberLabelX = pivotX + platLength * 0.5;
    const rubberLabelY = baseY + 25 * sc;
    ctx.fillStyle = 'rgba(200,200,220,0.7)';
    ctx.font = `${Math.max(6, 8 * sc)}px "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('RUBBER DAM', rubberLabelX, rubberLabelY);
  }
}

function loop() {
  drawDam();
  rafId = requestAnimationFrame(loop);
}

function onResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawDam, 100);
}

function onOrientationChange() {
  setTimeout(drawDam, 200);
}

onMounted(() => {
  ctx = canvasRef.value.getContext('2d');
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onOrientationChange);
  rafId = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
  if (resizeTimer) clearTimeout(resizeTimer);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('orientationchange', onOrientationChange);
});
</script>

<template>
  <div class="dam-canvas-wrap">
    <canvas ref="canvasRef" width="650" height="600"></canvas>
  </div>
</template>
