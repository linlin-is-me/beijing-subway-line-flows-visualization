/**
 * Pulse dot animation: glowing dots flowing along the top 3 highest-flow lines.
 * Uses rAF to animate dots along SVG paths/polylines.
 *
 * API:
 *   PulseAnimator.start(svgRoot, topSvgIds)
 *   PulseAnimator.stop()
 *   PulseAnimator.update(svgRoot, topSvgIds)  // restart if targets changed
 */

const PulseAnimator = (() => {
  const DOT_COUNT  = 4;    // dots per path segment
  const DOT_R      = 5;    // main dot radius
  const TAIL_R     = 2.5;  // tail dot radius
  const MIN_SPEED  = 0.08; // % per frame (~3s full trip @60fps)
  const MAX_SPEED  = 0.20; // % per frame (~6s full trip)

  let dots     = [];  // { el, tailEl, pathEl, pos, speed, length, color }
  let rafId    = null;
  let svgRoot  = null;
  let activeIds = [];

  // ── Public ───────────────────────────────────────────────────────

  function start(_svgRoot, topSvgIds) {
    svgRoot = _svgRoot;
    activeIds = [...topSvgIds];
    buildDots();
    if (dots.length && !rafId) loop();
  }

  function stop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    removeAllDots();
    dots = [];
    activeIds = [];
  }

  function update(_svgRoot, topSvgIds) {
    const same = topSvgIds.length === activeIds.length
              && topSvgIds.every((id, i) => id === activeIds[i]);
    if (same) return; // nothing changed

    stop();
    start(_svgRoot, topSvgIds);
  }

  // ── Build dots ───────────────────────────────────────────────────

  function buildDots() {
    removeAllDots();
    dots = [];

    for (const svgId of activeIds) {
      const group = svgRoot.querySelector(`[id="${svgId}"]`);
      if (!group) continue;

      // Collect color from the group's first colored stroke element
      const shapes = group.querySelectorAll('path, polyline, line, polygon');
      let lineColor = '#3498db';

      for (const shape of shapes) {
        const fill = shape.getAttribute('fill');
        const stroke = shape.getAttribute('stroke');
        if (fill && fill !== 'none') continue;
        if (!stroke || stroke === 'none') continue;
        const lc = stroke.toLowerCase();
        if (lc === '#fff' || lc === '#ffffff') continue;
        lineColor = stroke;
        break;
      }

      // Find track paths/polylines in this group
      for (const shape of shapes) {
        const fill = shape.getAttribute('fill');
        const stroke = shape.getAttribute('stroke');
        if (fill && fill !== 'none') continue;
        if (!stroke || stroke === 'none') continue;
        const lc = stroke.toLowerCase();
        if (lc === '#fff' || lc === '#ffffff') continue;

        // Must have a stroke color matching the line (exclude station rings)
        const tag = shape.tagName.toLowerCase();
        if (tag !== 'path' && tag !== 'polyline') continue;

        const len = getPathLength(shape);
        if (len < 20) continue; // skip tiny segments

        // Create dots for this segment
        for (let i = 0; i < DOT_COUNT; i++) {
          const pos   = i / DOT_COUNT;
          const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
          const el    = createDot(shape, lineColor, DOT_R);
          const tailEl = createDot(shape, lineColor, TAIL_R, 0.35);
          dots.push({ el, tailEl, pathEl: shape, pos, speed, length: len, color: lineColor });
        }
      }
    }
  }

  function getPathLength(shape) {
    const tag = shape.tagName.toLowerCase();
    if (tag === 'path') {
      return shape.getTotalLength();
    }
    if (tag === 'polyline') {
      // Approximate polyline length from points
      const pts = shape.getAttribute('points');
      if (!pts) return 0;
      const coords = pts.trim().split(/[\s,]+/).map(Number);
      let total = 0;
      for (let i = 2; i < coords.length; i += 2) {
        const dx = coords[i] - coords[i - 2];
        const dy = coords[i + 1] - coords[i - 1];
        total += Math.sqrt(dx * dx + dy * dy);
      }
      return total;
    }
    return 0;
  }

  function getPointAt(shape, fraction) {
    const tag = shape.tagName.toLowerCase();
    if (tag === 'path') {
      const pt = shape.getPointAtLength(fraction * shape.getTotalLength());
      return { x: pt.x, y: pt.y };
    }
    if (tag === 'polyline') {
      const pts = shape.getAttribute('points');
      if (!pts) return { x: 0, y: 0 };
      const coords = pts.trim().split(/[\s,]+/).map(Number);
      let total = 0;
      const segs = [];
      for (let i = 2; i < coords.length; i += 2) {
        const dx = coords[i] - coords[i - 2];
        const dy = coords[i + 1] - coords[i - 1];
        const segLen = Math.sqrt(dx * dx + dy * dy);
        segs.push({ x1: coords[i-2], y1: coords[i-1], x2: coords[i], y2: coords[i+1], len: segLen });
        total += segLen;
      }
      if (total === 0) return { x: coords[0] || 0, y: coords[1] || 0 };
      let target = fraction * total;
      for (const s of segs) {
        if (target <= s.len) {
          const t = s.len > 0 ? target / s.len : 0;
          return { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t };
        }
        target -= s.len;
      }
      const last = segs[segs.length - 1];
      return { x: last.x2, y: last.y2 };
    }
    return { x: 0, y: 0 };
  }

  function createDot(shape, color, r, opacity = 0.9) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', r);
    circle.setAttribute('fill', color);
    circle.setAttribute('opacity', opacity);
    circle.setAttribute('filter', 'url(#metro-glow)');
    circle.setAttribute('pointer-events', 'none');

    // Position at start of path
    const pt = getPointAt(shape, 0);
    circle.setAttribute('cx', pt.x);
    circle.setAttribute('cy', pt.y);

    svgRoot.appendChild(circle);
    return circle;
  }

  function removeAllDots() {
    for (const d of dots) {
      if (d.el && d.el.parentNode)     d.el.remove();
      if (d.tailEl && d.tailEl.parentNode) d.tailEl.remove();
    }
  }

  // ── Animation loop ───────────────────────────────────────────────

  function loop() {
    if (!dots.length) { rafId = null; return; }

    for (const d of dots) {
      d.pos += d.speed / 60; // normalize to ~60fps
      if (d.pos > 1) d.pos -= 1;
      if (d.pos < 0) d.pos += 1;

      const pt = getPointAt(d.pathEl, d.pos);
      d.el.setAttribute('cx', pt.x);
      d.el.setAttribute('cy', pt.y);

      // Tail trails behind
      let tailPos = d.pos - 0.025;
      if (tailPos < 0) tailPos += 1;
      const tpt = getPointAt(d.pathEl, tailPos);
      d.tailEl.setAttribute('cx', tpt.x);
      d.tailEl.setAttribute('cy', tpt.y);
    }

    rafId = requestAnimationFrame(loop);
  }

  return { start, stop, update };
})();
