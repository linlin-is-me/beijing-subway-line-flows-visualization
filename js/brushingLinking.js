/**
 * Brushing & Linking — bidirectional cross-highlight between map and ranking list.
 *
 * v2: When hovering a line, all other lines turn uniform light gray.
 */

const BrushingLinking = (() => {
  let svgRoot = null;
  let rankingContainer = null;
  let hoveredSvgId = null;
  let adjacency = null; // Map<lineName, Set<neighbourName>>

  // Non-selected lines become uniform light gray
  const DIM_GRAY = '#c8c8c8';
  const DIM_GRAY_WIDTH = '2';
  const STORED = new Map(); // groupId → [{el, stroke, strokeWidth}]

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

  // Garbled ID support for new SVG
  function toSvgId(s){const b=new TextEncoder().encode(s);return new TextDecoder('windows-1252').decode(b);}
  const G2={},UG={};
  for(const id of allSvgIds){if(/[^\x00-\x7F]/.test(id)){const g=toSvgId(id);G2[id]=g;UG[g]=id;svgToLines[g]=svgToLines[id]||[];lineToSvg[g]=id;}}
  function normId(id){return UG[id]||id;}
  function findGroup(id){let g=svgRoot.querySelector('[id=\"'+id+'\"]');if(g)return g;const gb=G2[id];if(gb){g=svgRoot.querySelector('[id=\"'+gb+'\"]');if(g)return g;}const all=svgRoot.querySelectorAll('g');for(const el of all){const a=el.getAttribute('id');if(a===id||(gb&&a===gb))return el;}return null;}

  // ── Map dimming ──────────────────────────────────────

  function dimByLevel(svgId) {
    for (const id of allSvgIds) {
      if (id === svgId) continue;
      if (STORED.has(id)) continue; // already dimmed, skip
      const group = findGroup(id);
      if (!group) continue;
      const shapes = group.querySelectorAll('path, polyline, line, polygon');
      const stored = [];
      for (const shape of shapes) {
        const stroke = shape.getAttribute('stroke');
        if (!stroke || stroke === 'none' || /^#fff/i.test(stroke)) continue;
        const fill = shape.getAttribute('fill');
        if (fill && fill !== 'none') continue;
        stored.push({ el: shape, stroke: stroke, strokeWidth: shape.getAttribute('stroke-width') });
        shape.setAttribute('stroke', DIM_GRAY);
        shape.setAttribute('stroke-width', DIM_GRAY_WIDTH);
      }
      if (stored.length) STORED.set(id, stored);
    }
  }

  function clearDimmed() {
    for (const [, stored] of STORED) {
      for (const { el, stroke, strokeWidth } of stored) {
        el.setAttribute('stroke', stroke);
        if (strokeWidth) el.setAttribute('stroke-width', strokeWidth);
        else el.removeAttribute('stroke-width');
      }
    }
    STORED.clear();
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
      const group = e.target.closest('g[id]');
      if (!group) { resetAll(); return; }
      const rawId = group.getAttribute('id');
      const id = normId(rawId);
      if (!svgToLines[id]) { resetAll(); return; }
      if (id === hoveredSvgId) return;
      hoveredSvgId = id;
      clearDimmed();
      dimByLevel(id);
      highlightRankingRows(svgToLines[id]);
    });

    svgRoot.addEventListener('mouseout', (e) => {
      const rel = e.relatedTarget;
      const relGroup = rel && rel.closest ? rel.closest('g[id]') : null;
      const rawRelId = relGroup ? relGroup.getAttribute('id') : null;
      const relId = rawRelId ? normId(rawRelId) : null;
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
