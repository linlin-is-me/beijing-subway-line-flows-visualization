/**
 * Brushing & Linking — bidirectional cross-highlight between map and ranking list.
 *
 * v2: Network cascading hover — when hovering a line, its 1-hop transfer neighbours
 *     are dimmed to 50% while unconnected lines dim to 10%.
 */

const BrushingLinking = (() => {
  let svgRoot = null;
  let rankingContainer = null;
  let hoveredSvgId = null;
  let adjacency = null; // Map<lineName, Set<neighbourName>>

  const DIM_HALF  = '0.5';
  const DIM_FULL  = '0.1';

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

  // ── Map dimming (3 levels) ──────────────────────────────────────

  function getNeighbourSvgIds(svgId) {
    if (!adjacency) return new Set();
    const lineNames = svgToLines[svgId] || [];
    const neighbours = new Set();
    for (const ln of lineNames) {
      const adjs = adjacency.get(ln);
      if (adjs) for (const a of adjs) neighbours.add(lineToSvg[a]);
    }
    neighbours.delete(svgId);
    return neighbours;
  }

  function dimByLevel(svgId) {
    const neighbours = getNeighbourSvgIds(svgId);
    for (const id of allSvgIds) {
      if (id === svgId) continue;
      const group = svgRoot.querySelector(`[id="${id}"]`);
      if (!group) continue;
      if (neighbours.has(id)) {
        group.setAttribute('opacity', DIM_HALF);
      } else {
        group.setAttribute('opacity', DIM_FULL);
      }
    }
  }

  function clearDimmed() {
    for (const id of allSvgIds) {
      const group = svgRoot.querySelector(`[id="${id}"]`);
      if (group) group.removeAttribute('opacity');
    }
  }

  // ── Ranking highlight ────────────────────────────────────────────

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

  function resetAll() {
    clearDimmed();
    clearRankingHL();
    hoveredSvgId = null;
  }

  // ── Init ─────────────────────────────────────────────────────────

  function init(_svgRoot, _rankingContainer) {
    svgRoot = _svgRoot;
    rankingContainer = _rankingContainer;

    // Build adjacency from transfer stations
    adjacency = TransferStations.getLineAdjacency();

    // Map → Ranking
    svgRoot.addEventListener('mouseover', (e) => {
      const group = e.target.closest('[id]');
      if (!group) { resetAll(); return; }
      const id = group.getAttribute('id');
      if (!svgToLines[id]) { resetAll(); return; }
      if (id === hoveredSvgId) return;
      hoveredSvgId = id;
      clearDimmed();
      dimByLevel(id);
      highlightRankingRows(svgToLines[id]);
    });

    svgRoot.addEventListener('mouseout', (e) => {
      const rel = e.relatedTarget;
      const relGroup = rel && rel.closest ? rel.closest('[id]') : null;
      const relId = relGroup ? relGroup.getAttribute('id') : null;
      if (relId === hoveredSvgId) return;
      resetAll();
    });

    // Ranking → Map
    rankingContainer.addEventListener('mouseover', (e) => {
      const row = e.target.closest('.ranking-row');
      if (!row) { resetAll(); return; }
      const lineName = row.dataset.lineName;
      if (!lineName) return;
      hoveredSvgId = lineToSvg[lineName];
      clearRankingHL();
      row.classList.add('hl');
      if (hoveredSvgId) {
        clearDimmed();
        dimByLevel(hoveredSvgId);
      }
    });

    rankingContainer.addEventListener('mouseout', (e) => {
      const rel = e.relatedTarget;
      const relRow = rel && rel.closest ? rel.closest('.ranking-row') : null;
      if (relRow) return;
      resetAll();
    });
  }

  return { init };
})();
