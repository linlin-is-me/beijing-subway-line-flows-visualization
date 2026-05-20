/**
 * Pressure heatmap — radial gradient overlay on the SVG map.
 * Uses additive alpha blending of radial gradients (linear-decay kernel)
 * to approximate weighted kernel density estimation of station pressure.
 */

const HeatmapRenderer = (() => {
  const BANDWIDTH = 80; // radius in SVG coordinate space (2400x2400)

  function heatColor(pressure) {
    if (pressure >= 5)      return [255, 0, 0];     // red — high risk
    if (pressure >= 4.5)    return [253, 180, 37];  // orange-yellow
    if (pressure >= 4)      return [253, 231, 37];  // yellow
    if (pressure >= 3)      return [120, 200, 80];  // yellow-green
    return [4, 120, 87];                            // green — low pressure
  }

  function render(canvas, pressures) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of pressures) {
      const intensity = Math.min(p.pressure / 6, 1);
      const [r, g, b] = heatColor(p.pressure);

      const grad = ctx.createRadialGradient(p.cx, p.cy, 0, p.cx, p.cy, BANDWIDTH);
      grad.addColorStop(0,    `rgba(${r},${g},${b},${Math.min(intensity * 1.2, 1)})`);
      grad.addColorStop(0.5,  `rgba(${r},${g},${b},${Math.min(intensity * 0.6, 0.7)})`);
      grad.addColorStop(1,    'rgba(0,0,0,0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, BANDWIDTH, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { render };
})();
