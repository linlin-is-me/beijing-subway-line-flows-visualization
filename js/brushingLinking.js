/**
 * Brushing & Linking — bidirectional cross-highlight between map and ranking list.
 *
 * - Hover a line on the map  →  its ranking row highlights, other map lines dim
 * - Hover a ranking row      →  the corresponding map line stays bright, others dim
 *
 * Uses SVG-native opacity attribute (NOT CSS opacity) for reliable cross-browser
 * dimming that cascades to all child elements including pulse-dot <circle>s.
 * Uses [id] selector instead of g[id] to avoid SVG-namespace matching issues
 * when closest() runs inside an HTML document.
 */
const BrushingLinking = (() => {
  let svgRoot = null;
  let rankingContainer = null;
  let hoveredSvgId = null;
  let hoveredLineName = null;

  const DIM_OPACITY = '0.1';

  // ── Indexes ────────────────────────────────────────────────────────
  const svgToLines = (() => {
    const map = {};
    for (const [name, cfg] of Object.entries(LINE_MAPPING)) {
      if (!map[cfg.svgId]) map[cfg.svgId] = [];
      if (!map[cfg.svgId].includes(name)) map[cfg.svgId].push(name);
    }
    return map;
  })();

  const lineToSvg = {};
  for (const [name, cfg] of Object.entries(LINE_MAPPING)) {
    lineToSvg[name] = cfg.svgId;
  }

  const allSvgIds = new Set(Object.values(LINE_MAPPING).map(c => c.svgId));

  // ── Map dimming (SVG-native opacity attribute) ─────────────────────

  function dimOthers(svgId) {
    for (const id of allSvgIds) {
      if (id === svgId) continue;
      const group = svgRoot.querySelector(`[id="${id}"]`);
      if (group) group.setAttribute('opacity', DIM_OPACITY);
    }
  }

  function clearDimmed() {
    for (const id of allSvgIds) {
      const group = svgRoot.querySelector(`[id="${id}"]`);
      if (group) group.removeAttribute('opacity');
    }
  }

  // ── Ranking highlight ──────────────────────────────────────────────

  function highlightRankingRows(lineNames) {
    const nameSet = new Set(lineNames);
    const rows = rankingContainer.querySelectorAll('.ranking-row');
    for (const row of rows) {
      row.classList.toggle('hl', nameSet.has(row.dataset.lineName));
    }
  }

  function clearRankingHL() {
    const rows = rankingContainer.querySelectorAll('.ranking-row.hl');
    for (const r of rows) r.classList.remove('hl');
  }

  // ── Clear both sides ───────────────────────────────────────────────

  function resetAll() {
    clearDimmed();
    clearRankingHL();
    hoveredSvgId = null;
    hoveredLineName = null;
  }

  // ── Init ───────────────────────────────────────────────────────────

  function init(_svgRoot, _rankingContainer) {
    svgRoot = _svgRoot;
    rankingContainer = _rankingContainer;

    // ── Map → Ranking ──────────────────────────────────────────────

    svgRoot.addEventListener('mouseover', (e) => {
      // [id] not g[id] — avoids SVG-ns mismatch in HTML document's CSS selector engine
      const group = e.target.closest('[id]');
      if (!group) { resetAll(); return; }
      const id = group.getAttribute('id');
      if (!svgToLines[id]) { resetAll(); return; }
      if (id === hoveredSvgId) return;
      hoveredSvgId = id;
      clearDimmed();
      dimOthers(id);
      highlightRankingRows(svgToLines[id]);
    });

    svgRoot.addEventListener('mouseout', (e) => {
      const rel = e.relatedTarget;
      const relGroup = rel && rel.closest ? rel.closest('[id]') : null;
      const relId = relGroup ? relGroup.getAttribute('id') : null;
      if (relId === hoveredSvgId) return;
      resetAll();
    });

    // ── Ranking → Map ──────────────────────────────────────────────

    rankingContainer.addEventListener('mouseover', (e) => {
      const row = e.target.closest('.ranking-row');
      if (!row) { resetAll(); return; }
      const lineName = row.dataset.lineName;
      if (!lineName || lineName === hoveredLineName) return;
      hoveredLineName = lineName;
      clearRankingHL();
      row.classList.add('hl');
      const svgId = lineToSvg[lineName];
      if (svgId) {
        clearDimmed();
        dimOthers(svgId);
      }
    });

    rankingContainer.addEventListener('mouseout', (e) => {
      const rel = e.relatedTarget;
      const relRow = rel && rel.closest ? rel.closest('.ranking-row') : null;
      const relName = relRow ? relRow.dataset.lineName : null;
      if (relName === hoveredLineName) return;
      resetAll();
    });
  }

  return { init };
})();
