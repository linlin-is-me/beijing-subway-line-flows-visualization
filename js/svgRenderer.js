/**
 * Manipulates the inline SVG DOM to reflect passenger flow via stroke-width.
 *
 * Rules for selecting elements within each <g> to modify:
 * - Only modify elements where fill="none" (paths/polylines, not station fills)
 * - Skip elements with stroke="none" or stroke="#fff" or stroke="#ffffff"
 *   (white station-gap masks should stay thin)
 */

const SvgRenderer = (() => {
  const DEFAULT_WIDTH = 5;

  function render(svgRoot, svgGroupTierMap) {
    // Collect stats for legend
    const stats = {};

    for (const [svgId, tier] of Object.entries(svgGroupTierMap)) {
      const group = svgRoot.querySelector(`[id="${svgId}"]`);
      if (!group) {
        console.warn(`SVG group "${svgId}" not found`);
        continue;
      }

      const width = STROKE_WIDTH_MAP[tier];

      // Modify all path and polyline elements that have a colored stroke
      const shapes = group.querySelectorAll('path, polyline, line, polygon');
      for (const shape of shapes) {
        const fill = shape.getAttribute('fill');
        const stroke = shape.getAttribute('stroke');

        // Skip if not a track line (has fill, or no stroke, or white stroke)
        if (fill && fill !== 'none') continue;
        if (!stroke || stroke === 'none') continue;
        if (stroke.toLowerCase() === '#fff' || stroke.toLowerCase() === '#ffffff') continue;

        shape.setAttribute('stroke-width', width);
      }

      stats[svgId] = { tier, width };
    }

    return stats;
  }

  function resetAll(svgRoot) {
    // Find all known SVG line groups and reset to default width
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
      }
    }
  }

  return { render, resetAll };
})();
