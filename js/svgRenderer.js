/**
 * Manipulates the inline SVG DOM to reflect passenger flow via stroke-width.
 */

const SvgRenderer = (() => {
  const DEFAULT_WIDTH = 5;
  let styleInjected = false;

  function ensureBreathStyle(svgRoot) {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `@keyframes breath{0%,100%{opacity:1}50%{opacity:.55}}.tier6-pulse{animation:breath 2s ease-in-out infinite}`;
    svgRoot.appendChild(style);
  }

  function render(svgRoot, svgGroupTierMap) {
    ensureBreathStyle(svgRoot);

    for (const [svgId, tier] of Object.entries(svgGroupTierMap)) {
      const group = svgRoot.querySelector(`[id="${svgId}"]`);
      if (!group) continue;

      const width = STROKE_WIDTH_MAP[tier];

      const shapes = group.querySelectorAll('path, polyline, line, polygon');
      for (const shape of shapes) {
        const fill = shape.getAttribute('fill');
        const stroke = shape.getAttribute('stroke');

        if (fill && fill !== 'none') continue;
        if (!stroke || stroke === 'none') continue;
        if (stroke.toLowerCase() === '#fff' || stroke.toLowerCase() === '#ffffff') continue;

        shape.setAttribute('stroke-width', width);
        shape.setAttribute('stroke-linecap', 'round');
        shape.setAttribute('stroke-linejoin', 'round');

        // Tier 6 (top line): dash + breathing pulse
        if (tier === 6) {
          shape.setAttribute('stroke-dasharray', '40,3');
          shape.classList.add('tier6-pulse');
        } else {
          shape.removeAttribute('stroke-dasharray');
          shape.classList.remove('tier6-pulse');
        }
      }
    }
  }

  function resetAll(svgRoot) {
    const allGroupIds = new Set(
      Object.values(LINE_MAPPING).map(m => m.svgId)
    );

    for (const svgId of allGroupIds) {
      const group = svgRoot.querySelector(`[id="${svgId}"]`);
      if (!group) continue;

      const shapes = group.querySelectorAll('path, polyline, line, polygon');
      for (const shape of shapes) {
        const fill = shape.getAttribute('fill');
        if (fill && fill !== 'none') continue;
        const stroke = shape.getAttribute('stroke');
        if (!stroke || stroke === 'none') continue;
        if (stroke.toLowerCase() === '#fff' || stroke.toLowerCase() === '#ffffff') continue;
        shape.setAttribute('stroke-width', DEFAULT_WIDTH);
        shape.removeAttribute('stroke-dasharray');
        shape.removeAttribute('stroke-linecap');
        shape.removeAttribute('stroke-linejoin');
        shape.classList.remove('tier6-pulse');
      }
    }
  }

  return { render, resetAll };
})();
