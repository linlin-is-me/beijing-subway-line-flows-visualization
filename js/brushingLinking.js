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

  // Garbled ID support for new SVG
  function toSvgId(s){const b=new TextEncoder().encode(s);return new TextDecoder('windows-1252').decode(b);}
  const G2={},UG={};
  for(const id of allSvgIds){if(/[^\x00-\x7F]/.test(id)){const g=toSvgId(id);G2[id]=g;UG[g]=id;svgToLines[g]=svgToLines[id]||[];lineToSvg[g]=id;}}
  function normId(id){return UG[id]||id;}
  function findGroup(id){let g=svgRoot.querySelector('[id=\"'+id+'\"]');if(g)return g;const gb=G2[id];if(gb){g=svgRoot.querySelector('[id=\"'+gb+'\"]');if(g)return g;}const all=svgRoot.querySelectorAll('g');for(const el of all){const a=el.getAttribute('id');if(a===id||(gb&&a===gb))return el;}return null;}

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
      const group = findGroup(id);
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
      const group = findGroup(id);
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
      const group = e.target.closest('g[id]');
      if (!group) { console.log('br: no [id] on', e.target.tagName); resetAll(); return; }
      const rawId = group.getAttribute('id');
      const id = normId(rawId);
      if (!svgToLines[id]) { console.log('br: id='+rawId+' norm='+id+' not a line'); resetAll(); return; }
      if (id === hoveredSvgId) return;
      hoveredSvgId = id;
      console.log('br:hover', rawId, '->', id);
      clearDimmed();
      dimByLevel(id);
      highlightRankingRows(svgToLines[id]);
    });

    svgRoot.addEventListener('mouseout', (e) => {
      const rel = e.relatedTarget;
      const relGroup = rel && rel.closest ? rel.closest('[id]') : null;
      const rawRelId = relGroup ? relGroup.getAttribute('id') : null;
      const relId = rawRelId ? normId(rawRelId) : null;
      if (relId === hoveredSvgId) { console.log('br: stay in same line'); return; }
      console.log('br:clear, hovered='+hoveredSvgId+' rel='+rawRelId);
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
