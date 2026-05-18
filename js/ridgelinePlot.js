/**
 * Ridgeline Plot — 28 overlapping area charts stacked vertically.
 * Full-screen Canvas overlay showing per-hour congestion across all lines.
 */

const RidgelinePlot = (() => {
  let overlay = null;
  let canvas = null;

  function init(parentEl) {
    overlay = document.createElement('div');
    overlay.className = 'ridgeline-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="ridgeline-header">
        <span class="ridgeline-title">全线路客流山脊图</span>
        <button class="ridgeline-close" id="ridgeline-close">&times;</button>
      </div>
      <canvas id="ridgeline-canvas"></canvas>`;
    parentEl.appendChild(overlay);

    document.getElementById('ridgeline-close').addEventListener('click', hide);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hide();
    });

    canvas = overlay.querySelector('canvas');
  }

  function show()  { overlay.style.display = 'flex'; resize(); render(); }
  function hide()  { overlay.style.display = 'none'; }
  function toggle() { overlay.style.display === 'flex' ? hide() : show(); }

  let currentDate = null;
  let currentGetInOut = null;

  function render(date, lineNames, getInOutFn) {
    if (date) currentDate = date;
    if (getInOutFn) currentGetInOut = getInOutFn;
    if (!currentDate || !currentGetInOut || overlay.style.display === 'none') return;
    if (!lineNames || !lineNames.length) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = Math.max(lineNames.length * 28 + 40, 400);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const slots = DataLoader.HOUR_SLOTS;
    const pad = { top: 10, right: 16, bottom: 16, left: 52 };
    const pw = W - pad.left - pad.right;
    const rowH = (H - pad.top - pad.bottom) / lineNames.length;

    for (let li = 0; li < lineNames.length; li++) {
      const ln = lineNames[li];
      const baseY = pad.top + li * rowH;

      // Gather data
      const pts = [];
      for (const slot of slots) {
        const d = currentGetInOut(currentDate, slot);
        pts.push(d && d[ln] ? d[ln].inbound + d[ln].outbound : 0);
      }
      const maxV = Math.max(...pts, 0.01);

      // Fill area
      const amp = rowH * 0.75;
      const stepX = pw / (pts.length - 1);
      ctx.fillStyle = `rgba(52,152,219,0.12)`;
      ctx.beginPath();
      ctx.moveTo(pad.left, baseY + amp);
      for (let i = 0; i < pts.length; i++) {
        const x = pad.left + i * stepX;
        const y = baseY + amp - (pts[i] / maxV) * amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(pad.left + pw, baseY + amp);
      ctx.closePath();
      ctx.fill();

      // Top edge line
      ctx.strokeStyle = '#3498db';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = pad.left + i * stepX;
        const y = baseY + amp - (pts[i] / maxV) * amp;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Label
      ctx.fillStyle = '#aaa';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(ln.replace('号线-八通线','').replace('号线-大兴线',''), pad.left - 4, baseY + amp / 2 + 3);
    }
  }

  function resize() {
    if (canvas) {
      canvas.style.width = '95vw';
      canvas.style.height = '85vh';
    }
  }

  window.addEventListener('resize', () => { if (overlay && overlay.style.display === 'flex') { resize(); render(); } });

  return { init, show, hide, toggle, render };
})();
