/**
 * Tidal scissors chart — inbound vs outbound hourly flow for a selected line.
 * Only visible in hour mode. Rendered on a <canvas>.
 *
 * API:
 *   TidalChart.init(canvasEl)
 *   TidalChart.render(date, selectedLine, hourSlots, getInOutFn)
 *   TidalChart.setLine(lineName)
 *   TidalChart.hide()
 */

const TidalChart = (() => {
  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let currentLine = null;

  const COLORS = { inbound: '#3498db', outbound: '#e67e22' };

  function init(canvasEl) {
    canvas = canvasEl;
    dpr = window.devicePixelRatio || 1;
  }

  function setLine(lineName) {
    currentLine = lineName;
  }

  function hide() {
    if (canvas) canvas.style.display = 'none';
  }

  function show() {
    if (canvas) canvas.style.display = '';
  }

  function render(date, lineName, hourSlots, getInOutFn) {
    if (!canvas) return;
    currentLine = lineName;

    // Gather data
    const pts = [];
    for (const slot of hourSlots) {
      const data = getInOutFn(date, slot);
      if (!data || !data[lineName]) { pts.push(null); continue; }
      pts.push({
        label: slot.substring(0, 5), // "7:00"
        inbound: data[lineName].inbound,
        outbound: data[lineName].outbound
      });
    }
    if (pts.every(p => p === null)) { hide(); return; }
    show();

    // Layout
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = { top: 14, right: 16, bottom: 32, left: 44 };
    const pw = W - pad.left - pad.right;
    const ph = H - pad.top - pad.bottom;

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Y-axis max
    let yMax = 0;
    for (const p of pts) {
      if (!p) continue;
      yMax = Math.max(yMax, p.inbound, p.outbound);
    }
    yMax = Math.ceil(yMax * 1.15 * 10) / 10; // 15% headroom
    if (yMax === 0) yMax = 1;

    const xTo = (i) => pad.left + (i / (pts.length - 1)) * pw;
    const yTo = (v) => pad.top + ph - (v / yMax) * ph;

    // Grid lines
    ctx.strokeStyle = '#1f3058';
    ctx.lineWidth = 0.5;
    const gridLines = 5;
    for (let g = 0; g <= gridLines; g++) {
      const y = pad.top + (g / gridLines) * ph;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    // Y-axis ticks
    ctx.fillStyle = '#777';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    for (let g = 0; g <= gridLines; g++) {
      const v = yMax - (g / gridLines) * yMax;
      const y = pad.top + (g / gridLines) * ph;
      ctx.fillText(v.toFixed(1), pad.left - 5, y + 3);
    }

    // X-axis labels (every 3 hours)
    ctx.textAlign = 'center';
    for (let i = 0; i < pts.length; i++) {
      if (!pts[i]) continue;
      if (i % 3 !== 0) continue;
      const x = xTo(i);
      ctx.fillText(pts[i].label, x, pad.top + ph + 16);
    }
    ctx.fillText('万', pad.left - 2, pad.top - 6);

    // X-axis
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, pad.top + ph); ctx.lineTo(W - pad.right, pad.top + ph); ctx.stroke();

    // Draw lines
    for (const dir of ['inbound', 'outbound']) {
      ctx.strokeStyle = COLORS[dir];
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < pts.length; i++) {
        if (!pts[i]) continue;
        const x = xTo(i);
        const y = yTo(pts[i][dir]);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Dot at each point
      for (let i = 0; i < pts.length; i++) {
        if (!pts[i]) continue;
        const x = xTo(i);
        const y = yTo(pts[i][dir]);
        ctx.fillStyle = COLORS[dir];
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Legend
    const lx = W - pad.right - 120, ly = pad.top + 4;
    ctx.fillStyle = COLORS.inbound;
    ctx.fillRect(lx, ly, 14, 3);
    ctx.fillStyle = '#ccc'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('inbound 进城', lx + 18, ly + 4);

    ctx.fillStyle = COLORS.outbound;
    ctx.fillRect(lx, ly + 14, 14, 3);
    ctx.fillText('outbound 出城', lx + 18, ly + 18);
  }

  return { init, render, setLine, hide, show, getCurrentLine: () => currentLine };
})();
