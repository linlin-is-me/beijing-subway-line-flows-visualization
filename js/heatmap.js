/**
 * Pressure heatmap — Gaussian KDE computed on a coarse grid, then upscaled.
 *
 * density(x,y) = Σ pressure_i × exp(−dist² / (2σ²))
 *
 * The KDE is evaluated on a 300×300 grid (each cell = 8 SVG units),
 * stored in a Uint8ClampedArray, then painted via ImageData.
 */

const HeatmapRenderer = (() => {
  const GRID = 300;          // coarse grid resolution
  const SCALE = 2400 / GRID; // 8 SVG units per grid cell
  const SIGMA = 50;          // bandwidth (SVG coordinate units)
  const TWO_SIGMA2 = 2 * SIGMA * SIGMA;
  const RADIUS = Math.ceil(3 * SIGMA / SCALE); // search radius in grid cells (~19)

  // Off-screen grid
  let density = new Float32Array(GRID * GRID);

  function render(canvas, pressures) {
    if (!canvas || !pressures.length) return;
    density.fill(0);

    // 1. Splat stations into density grid
    let maxD = 0;
    for (const p of pressures) {
      const gx = Math.round(p.cx / SCALE);
      const gy = Math.round(p.cy / SCALE);
      const x0 = Math.max(0, gx - RADIUS);
      const y0 = Math.max(0, gy - RADIUS);
      const x1 = Math.min(GRID - 1, gx + RADIUS);
      const y1 = Math.min(GRID - 1, gy + RADIUS);

      for (let gy2 = y0; gy2 <= y1; gy2++) {
        const dy = (gy2 - gy) * SCALE;
        for (let gx2 = x0; gx2 <= x1; gx2++) {
          const dx = (gx2 - gx) * SCALE;
          const d2 = dx * dx + dy * dy;
          const w = p.pressure * p.pressure * p.pressure * Math.exp(-d2 / TWO_SIGMA2);
          const idx = gy2 * GRID + gx2;
          density[idx] += w;
          if (density[idx] > maxD) maxD = density[idx];
        }
      }
    }

    if (maxD === 0) return;

    // 2. Density → ImageData (with color ramp)
    const imgData = new ImageData(GRID, GRID);
    const px = imgData.data;

    // continuous color ramp — alpha rises gradually from zero
    const stops = [
      { t: 0.0,  r: 0,   g: 100, b: 60,  a: 0 },
      { t: 0.08, r: 4,   g: 130, b: 87,  a: 0.08 },
      { t: 0.2,  r: 80,  g: 180, b: 80,  a: 0.3 },
      { t: 0.4,  r: 200, g: 220, b: 50,  a: 0.6 },
      { t: 0.6,  r: 253, g: 180, b: 25,  a: 0.78 },
      { t: 0.8,  r: 253, g: 60,  b: 5,   a: 0.9 },
      { t: 1.0,  r: 255, g: 0,   b: 0,   a: 0.95 },
    ];

    for (let i = 0; i < GRID * GRID; i++) {
      const t = density[i] / maxD;
      if (t < 0.003) continue;

      // find enclosing stops
      let lo = stops[0], hi = stops[stops.length - 1];
      for (let k = 0; k < stops.length - 1; k++) {
        if (t >= stops[k].t && t <= stops[k + 1].t) { lo = stops[k]; hi = stops[k + 1]; break; }
      }

      const range = hi.t - lo.t;
      const raw = range > 0 ? (t - lo.t) / range : 0;
      // smoothstep for softer edge transitions
      const s = raw * raw * (3 - 2 * raw);

      const r = Math.round(lo.r + (hi.r - lo.r) * s);
      const g = Math.round(lo.g + (hi.g - lo.g) * s);
      const b = Math.round(lo.b + (hi.b - lo.b) * s);
      const a = lo.a + (hi.a - lo.a) * s;

      const j = i * 4;
      px[j]     = r;
      px[j + 1] = g;
      px[j + 2] = b;
      px[j + 3] = Math.min(255, a * 255);
    }

    // 3. Paint ImageData onto an off-screen canvas, then upscale to main
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const off = document.createElement('canvas');
    off.width = GRID; off.height = GRID;
    off.getContext('2d').putImageData(imgData, 0, 0);

    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  return { render };
})();
