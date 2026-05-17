/**
 * Transfer station detection & rendering.
 * Finds stations served by ≥3 lines, marks them with larger dots on the SVG,
 * and shows a tooltip listing the passing lines.
 */

const TransferStations = (() => {
  let svgRoot = null;
  let tooltipEl = null;
  let markers = [];  // { circle, lines: [name], cx, cy }

  function init(_svgRoot) {
    svgRoot = _svgRoot;

    // Build position→lines index by scanning each line group's circles
    const posMap = new Map(); // "cx,cy" → [{line, circle}]
    const allSvgIds = Object.values(LINE_MAPPING).map(c => c.svgId);

    for (const svgId of allSvgIds) {
      const group = svgRoot.querySelector(`[id="${svgId}"]`);
      if (!group) continue;

      // Get line data names for this SVG group
      const lineNames = [];
      for (const [name, cfg] of Object.entries(LINE_MAPPING)) {
        if (cfg.svgId === svgId) lineNames.push(name);
      }

      const circles = group.querySelectorAll('circle');
      for (const c of circles) {
        const cx = Math.round(parseFloat(c.getAttribute('cx')) / 5) * 5;
        const cy = Math.round(parseFloat(c.getAttribute('cy')) / 5) * 5;
        const key = `${cx},${cy}`;
        if (!posMap.has(key)) posMap.set(key, []);
        for (const ln of lineNames) {
          if (!posMap.get(key).some(e => e.line === ln)) {
            posMap.get(key).push({ line: ln });
          }
        }
      }
    }

    // Filter: positions with ≥3 distinct lines
    const transferLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    transferLayer.setAttribute('id', 'transfer-stations');
    svgRoot.appendChild(transferLayer);

    for (const [key, entries] of posMap) {
      if (entries.length < 3) continue;
      const [cx, cy] = key.split(',').map(Number);
      const lines = entries.map(e => e.line).sort();

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', cx);
      dot.setAttribute('cy', cy);
      dot.setAttribute('r', 6);
      dot.setAttribute('fill', '#fff');
      dot.setAttribute('stroke', '#3498db');
      dot.setAttribute('stroke-width', 2.5);
      dot.setAttribute('class', 'transfer-dot');
      dot.setAttribute('data-lines', lines.join('|'));
      dot.style.cursor = 'pointer';
      transferLayer.appendChild(dot);

      markers.push({ el: dot, lines, cx, cy });
    }

    // Mouse events
    ensureTooltip();
    transferLayer.addEventListener('mouseover', onOver);
    transferLayer.addEventListener('mousemove', onMove);
    transferLayer.addEventListener('mouseout', onOut);
  }

  function ensureTooltip() {
    if (tooltipEl) return;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'transfer-tooltip';
    document.body.appendChild(tooltipEl);
  }

  function onOver(e) {
    const dot = e.target.closest('.transfer-dot');
    if (!dot) return;
    const lines = (dot.getAttribute('data-lines') || '').split('|');
    tooltipEl.innerHTML = `<div class="tt-title">换乘站 · ${lines.length}条线路</div>
      ${lines.map(l => `<span class="tt-line">${l}</span>`).join('')}`;
    tooltipEl.style.display = 'block';
  }

  function onMove(e) {
    const rect = tooltipEl.getBoundingClientRect();
    let left = e.clientX + 14, top = e.clientY + 14;
    if (left + rect.width > window.innerWidth - 10) left = e.clientX - rect.width - 14;
    if (top + rect.height > window.innerHeight - 10) top = e.clientY - rect.height - 14;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }

  function onOut(e) {
    const rel = e.relatedTarget;
    if (rel && rel.closest && rel.closest('.transfer-dot')) return;
    tooltipEl.style.display = 'none';
  }

  return { init };
})();
