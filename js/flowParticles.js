/**
 * Spatial Particle Flow — animated dash-offset overlays on tier ≥3 lines.
 * Direction based on inbound/outbound ratio: arrows flow along the dominant direction.
 */

const FlowParticles = (() => {
  let svgRoot = null;
  let styleEl = null;
  let overlays = [];

  function init(_svgRoot) {
    svgRoot = _svgRoot;
    styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    svgRoot.appendChild(styleEl);
  }

  function update(groupTierMap, dirs, lineFlows) {
    removeAll();

    for (const [svgId, tier] of Object.entries(groupTierMap)) {
      if (tier < 3) continue;
      const group = svgRoot.querySelector(`[id="${svgId}"]`);
      if (!group) continue;

      // Find the line's color from its first track element
      let lineColor = '#ccc';
      const shapes = group.querySelectorAll('path, polyline, line');
      for (const s of shapes) {
        const f = s.getAttribute('fill');
        const st = s.getAttribute('stroke');
        if (f && f !== 'none') continue;
        if (!st || st === 'none' || st.toLowerCase() === '#fff' || st.toLowerCase() === '#ffffff') continue;
        lineColor = st; break;
      }

      // Determine direction from peak hour data
      let dir = 'forward';
      for (const [name, cfg] of Object.entries(LINE_MAPPING)) {
        if (cfg.svgId !== svgId) continue;
        if (dirs && dirs[name] && dirs[name].cls === 'out') dir = 'reverse';
        break;
      }

      // Animation speed proportional to flow
      let flow = 0;
      for (const [name, cfg] of Object.entries(LINE_MAPPING)) {
        if (cfg.svgId !== svgId) continue;
        flow = lineFlows[name] || 0; break;
      }
      const duration = Math.max(1.5, Math.min(6, 6 - flow / 15));

      const animName = `fp-${svgId.replace(/[^a-zA-Z0-9]/g, '')}`;
      const dirVal = dir === 'reverse' ? 'reverse' : 'normal';

      styleEl.textContent += `
        @keyframes ${animName} {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: ${dir === 'reverse' ? '' : '-'}60; }
        }
      `;

      // Add overlay paths
      for (const shape of shapes) {
        const f = shape.getAttribute('fill');
        const st = shape.getAttribute('stroke');
        if (f && f !== 'none') continue;
        if (!st || st === 'none' || st.toLowerCase() === '#fff' || st.toLowerCase() === '#ffffff') continue;

        const clone = shape.cloneNode(true);
        clone.setAttribute('fill', 'none');
        clone.setAttribute('stroke', lineColor);
        clone.setAttribute('stroke-width', '0.3');
        clone.setAttribute('stroke-dasharray', '8,32');
        clone.setAttribute('opacity', '0.6');
        clone.setAttribute('pointer-events', 'none');
        clone.style.animation = `${animName} ${duration}s linear infinite ${dirVal}`;
        clone.setAttribute('data-fp', '1');

        group.appendChild(clone);
        overlays.push(clone);
      }
    }
  }

  function removeAll() {
    for (const o of overlays) { if (o.parentNode) o.remove(); }
    overlays = [];
    if (styleEl) styleEl.textContent = '';
  }

  return { init, update, remove: removeAll };
})();
