/**
 * Map hover tooltip — "details on demand" for subway line groups.
 *
 * Uses event delegation on the SVG root so listeners survive frame
 * re-renders.  Shows line name, passenger flow (万), current rank,
 * and ranking change vs. the previous sequence step.
 */
const TooltipManager = (() => {
  let tooltipEl = null;
  let svgRoot = null;
  let currentLineFlows = null;
  let currentRanking = null;   // { lineName: rank }
  let prevRanking = null;      // { lineName: rank }
  let hoveredSvgId = null;
  let hideTimer = null;

  // Reverse index: svgId → [lineNames]  (handles combined groups)
  const svgToLines = (() => {
    const map = {};
    for (const [name, cfg] of Object.entries(LINE_MAPPING)) {
      if (!map[cfg.svgId]) map[cfg.svgId] = [];
      if (!map[cfg.svgId].includes(name)) map[cfg.svgId].push(name);
    }
    return map;
  })();

  // Garbled ID support for new SVG (same as svgRenderer / brushingLinking)
  function toSvgId(s){const b=new TextEncoder().encode(s);return new TextDecoder('windows-1252').decode(b);}
  const UNGARBLE = {};
  (() => {
    for (const id of Object.keys(svgToLines)) {
      if (/[^\x00-\x7F]/.test(id)) { const g = toSvgId(id); UNGARBLE[g] = id; svgToLines[g] = svgToLines[id]; }
    }
  })();
  function normId(id) { return UNGARBLE[id] || id; }

  function ensureTooltip() {
    if (tooltipEl) return;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'map-tooltip';
    document.body.appendChild(tooltipEl);
  }

  function position(e) {
    if (!tooltipEl) return;
    const offset = 14;
    let left = e.clientX + offset;
    let top = e.clientY + offset;
    const rect = tooltipEl.getBoundingClientRect();
    if (left + rect.width > window.innerWidth - 10) {
      left = e.clientX - rect.width - offset;
    }
    if (top + rect.height > window.innerHeight - 10) {
      top = e.clientY - rect.height - offset;
    }
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }

  function buildHtml(svgId) {
    const names = svgToLines[svgId];
    if (!names) return '';

    return names.map(name => {
      const flow = currentLineFlows ? currentLineFlows[name] : undefined;
      const rank = currentRanking ? currentRanking[name] : undefined;
      const prev = prevRanking ? prevRanking[name] : undefined;

      let changeHtml = '';
      if (rank && prev) {
        const diff = prev - rank;
        if (diff > 0)      changeHtml = `<span class="tooltip-change up">↑${diff}</span>`;
        else if (diff < 0) changeHtml = `<span class="tooltip-change down">↓${Math.abs(diff)}</span>`;
        else               changeHtml = `<span class="tooltip-change same">─</span>`;
      }

      const flowStr = typeof flow === 'number' ? `${flow.toFixed(2)} 万` : '';
      const rankStr = rank ? `#${rank}` : '';

      return `<div class="tooltip-row">
        <span class="tooltip-line-name">${name}</span>
        <span class="tooltip-rank-num">${rankStr}</span>
        ${changeHtml}
        <span class="tooltip-flow-val">${flowStr}</span>
      </div>`;
    }).join('');
  }

  function show(e, svgId) {
    clearTimeout(hideTimer);
    hideTimer = null;
    if (!tooltipEl) return;

    tooltipEl.innerHTML = buildHtml(svgId);
    tooltipEl.style.display = 'block';
    position(e);
  }

  function hide() {
    hoveredSvgId = null;
    // tiny delay avoids flicker when hopping between adjacent groups
    hideTimer = setTimeout(() => {
      if (!hoveredSvgId && tooltipEl) {
        tooltipEl.style.display = 'none';
      }
    }, 80);
  }

  function init(_svgRoot) {
    if (svgRoot === _svgRoot) return;
    svgRoot = _svgRoot;
    ensureTooltip();

    // Delegation listeners
    svgRoot.addEventListener('mouseover', (e) => {
      const group = e.target.closest('g[id]');
      if (!group) { hide(); return; }
      const rawId = group.getAttribute('id');
      const id = normId(rawId);
      if (!svgToLines[id]) { hide(); return; }
      if (id === hoveredSvgId) return;
      hoveredSvgId = id;
      show(e, id);
    });

    svgRoot.addEventListener('mousemove', (e) => {
      if (hoveredSvgId) position(e);
    });

    svgRoot.addEventListener('mouseout', (e) => {
      const rel = e.relatedTarget;
      const relGroup = rel && rel.closest ? rel.closest('g[id]') : null;
      const rawRelId = relGroup ? relGroup.getAttribute('id') : null;
      const relId = rawRelId ? normId(rawRelId) : null;
      if (relId === hoveredSvgId) return;
      hide();
    });
  }

  function updateData(lineFlows, currentRanks, prevRanks) {
    currentLineFlows = lineFlows;
    currentRanking = currentRanks;
    prevRanking = prevRanks;
  }

  return { init, updateData, hide };
})();
