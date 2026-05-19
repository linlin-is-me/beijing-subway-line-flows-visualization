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

  let _diagnosed = false;
  function diagnoseIds(svgRoot) {
    if (_diagnosed) return;
    _diagnosed = true;
    const all = svgRoot.querySelectorAll('g');
    let count = 0;
    for (const g of all) { count++; }
    console.log('svgRenderer: total <g> elements:', count);
  }

  // The SVG uses &#byte; HTML entities for each UTF-8 byte of Chinese chars.
  // The browser decodes each &#byte; via Windows-1252, producing garbled text.
  // E.g. "昌平线" → "æ˜Œå¹³çº¿" in the DOM. We match against this garbled form.
  function toSvgId(str) {
    // Use TextDecoder with windows-1252 to mimic browser's &#byte; decoding
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const decoder = new TextDecoder('windows-1252');
    return decoder.decode(bytes);
  }

  // Pre-compute garbled IDs at runtime (browser's Windows-1252)
  const SVG_ID_MAP = {};
  (() => {
    const names = ['房山+燕房线','昌平线','亦庄线','亦庄T1线','S1线','西郊线','首都机场线','大兴机场线'];
    for (const n of names) SVG_ID_MAP[n] = toSvgId(n);
  })();

  function findGroup(svgRoot, id) {
    diagnoseIds(svgRoot);
    // Try normal CSS selector (works for ASCII IDs like L1)
    let group = svgRoot.querySelector(`[id="${id}"]`);
    if (group) return group;
    // Try garbled version for Chinese-named groups (NO CSS.escape — raw string)
    const garbled = SVG_ID_MAP[id];
    if (garbled) {
      group = svgRoot.querySelector('[id="' + garbled + '"]');
      if (group) return group;
    }
    // Exhaustive fallback
    const all = svgRoot.querySelectorAll('g');
    for (const g of all) {
      const attr = g.getAttribute('id');
      if (attr === id || (garbled && attr === garbled)) return g;
    }
    return null;
  }

  function render(svgRoot, svgGroupTierMap) {
    ensureBreathStyle(svgRoot);

    let totalModified = 0;
    for (const [svgId, tier] of Object.entries(svgGroupTierMap)) {
      const group = findGroup(svgRoot, svgId);
      if (!group) { console.warn('svgRenderer: group not found:', svgId); continue; }

      const width = STROKE_WIDTH_MAP[tier];

      const shapes = group.querySelectorAll('path, polyline, line, polygon');
      let modified = 0, skippedFill = 0, skippedStroke = 0;
      for (const shape of shapes) {
        const fill = shape.getAttribute('fill');
        const stroke = shape.getAttribute('stroke');

        if (fill && fill !== 'none') { skippedFill++; continue; }
        if (!stroke || stroke === 'none') { skippedStroke++; continue; }
        if (stroke.toLowerCase() === '#fff' || stroke.toLowerCase() === '#ffffff') { skippedStroke++; continue; }

        shape.setAttribute('stroke-width', width);
        shape.setAttribute('stroke-linecap', 'round');
        shape.setAttribute('stroke-linejoin', 'round');
        modified++;

        if (tier === 6) {
          shape.setAttribute('stroke-dasharray', '40,3');
          shape.classList.add('tier6-pulse');
        } else {
          shape.removeAttribute('stroke-dasharray');
          shape.classList.remove('tier6-pulse');
        }
      }
      if (modified > 0) totalModified += modified;
    }
    console.log('svgRenderer: modified ' + totalModified + ' paths across ' + Object.keys(svgGroupTierMap).length + ' groups');
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

  return { render, resetAll };
})();
