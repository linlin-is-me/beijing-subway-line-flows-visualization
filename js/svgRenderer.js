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
    style.textContent = `@keyframes breath{0%,100%{opacity:1}50%{opacity:.55}}.tier6-pulse{animation:breath 4s ease-in-out infinite}`;
    svgRoot.appendChild(style);
  }

  // Garbled ID support for new SVG (UTF-8 byte HTML entities → Windows-1252 DOM ids)
  function toSvgId(s){const b=new TextEncoder().encode(s);return new TextDecoder('windows-1252').decode(b);}
  const GID={};['房山+燕房线','昌平线','亦庄线','亦庄T1线','S1线','西郊线','首都机场线','大兴机场线','线路名'].forEach(n=>GID[n]=toSvgId(n));
  function findGroup(root,id){
    let g=root.querySelector('[id=\"'+id+'\"]');if(g)return g;
    const gb=GID[id];if(gb){g=root.querySelector('[id=\"'+gb+'\"]');if(g)return g;}
    const all=root.querySelectorAll('g');for(const el of all){const a=el.getAttribute('id');if(a===id||(gb&&a===gb))return el;}
    return null;
  }

  function render(svgRoot, svgGroupTierMap) {
    ensureBreathStyle(svgRoot);

    for (const [svgId, tier] of Object.entries(svgGroupTierMap)) {
      const group = findGroup(svgRoot, svgId);
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
        shape.setAttribute('stroke', TIER_COLORS[tier]);
        shape.setAttribute('stroke-linecap', 'round');
        shape.setAttribute('stroke-linejoin', 'round');

        if (tier === 6) {
          shape.setAttribute('stroke-dasharray', '40,3');
        } else {
          shape.removeAttribute('stroke-dasharray');
        }
      }
    }

    // line name coloring removed — group is hidden
  }

  function resetAll(svgRoot) {
    const allGroupIds = new Set(
      Object.values(LINE_MAPPING).map(m => m.svgId)
    );

    for (const svgId of allGroupIds) {
      const group = findGroup(svgRoot, svgId);
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

  function renderUniform(svgRoot, color) {
    const allGroupIds = new Set(Object.values(LINE_MAPPING).map(m => m.svgId));
    for (const svgId of allGroupIds) {
      const group = findGroup(svgRoot, svgId);
      if (!group) continue;
      const shapes = group.querySelectorAll('path, polyline, line, polygon');
      for (const shape of shapes) {
        const fill = shape.getAttribute('fill');
        if (fill && fill !== 'none') continue;
        const stroke = shape.getAttribute('stroke');
        if (!stroke || stroke === 'none') continue;
        if (/^#fff/i.test(stroke)) continue;
        shape.setAttribute('stroke-width', DEFAULT_WIDTH);
        shape.setAttribute('stroke', color);
        shape.removeAttribute('stroke-dasharray');
        shape.removeAttribute('stroke-linecap');
        shape.removeAttribute('stroke-linejoin');
      }
    }
  }

  return { render, resetAll, renderUniform };
})();
