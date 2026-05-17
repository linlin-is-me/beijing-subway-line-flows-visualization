/**
 * Manipulates the inline SVG DOM to reflect passenger flow via stroke-width.
 *
 * Rules for selecting elements within each <g> to modify:
 * - Only modify elements where fill="none" (paths/polylines, not station fills)
 * - Skip elements with stroke="none" or stroke="#fff" or stroke="#ffffff"
 *   (white station-gap masks should stay thin)
 * - Tier 5 (highest flow) gets a fluorescent glow filter
 */

const SvgRenderer = (() => {
  const DEFAULT_WIDTH = 5;
  const GLOW_FILTER_ID = 'metro-glow';
  let filterInjected = false;

  function ensureGlowFilter(svgRoot) {
    if (filterInjected) return;
    filterInjected = true;

    const defs = svgRoot.querySelector('defs');
    if (!defs) return;

    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', GLOW_FILTER_ID);
    // Use userSpaceOnUse with entire viewBox to avoid clipping on large elements (e.g. L10 loop)
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', '2440');
    filter.setAttribute('height', '2440');

    // Outer glow — thicker, more transparent
    filter.innerHTML = `
      <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur1" />
      <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur2" />
      <feMerge>
        <feMergeNode in="blur1" />
        <feMergeNode in="blur2" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    `;
    defs.appendChild(filter);
  }

  function render(svgRoot, svgGroupTierMap, glowSvgId = null) {
    ensureGlowFilter(svgRoot);

    const stats = {};

    for (const [svgId, tier] of Object.entries(svgGroupTierMap)) {
      const group = svgRoot.querySelector(`[id="${svgId}"]`);
      if (!group) {
        console.warn(`SVG group "${svgId}" not found`);
        continue;
      }

      const width = STROKE_WIDTH_MAP[tier];

      const shapes = group.querySelectorAll('path, polyline, line, polygon');
      for (const shape of shapes) {
        const fill = shape.getAttribute('fill');
        const stroke = shape.getAttribute('stroke');

        if (fill && fill !== 'none') continue;
        if (!stroke || stroke === 'none') continue;
        if (stroke.toLowerCase() === '#fff' || stroke.toLowerCase() === '#ffffff') continue;

        shape.setAttribute('stroke-width', width);

        // Only the single top-flow line gets the fluorescent glow
        if (svgId === glowSvgId) {
          shape.setAttribute('filter', `url(#${GLOW_FILTER_ID})`);
        } else {
          shape.removeAttribute('filter');
        }
      }

      stats[svgId] = { tier, width };
    }

    return stats;
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
        shape.removeAttribute('filter');
      }
    }
  }

  return { render, resetAll };
})();
