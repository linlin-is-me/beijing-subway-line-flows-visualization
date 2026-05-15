/**
 * Main controller: wires data loading, mode switching, classification, and rendering.
 */
(async function main() {
  const dayPicker    = document.getElementById('day-picker');
  const monthPicker  = document.getElementById('month-picker');
  const yearPicker   = document.getElementById('year-picker');
  const modeBtns     = document.querySelectorAll('.mode-btn');
  const svgContainer = document.getElementById('svg-container');
  const legendCont   = document.getElementById('legend');
  const loadingEl    = document.getElementById('loading');
  const titleEl      = document.getElementById('selected-date-label');

  let currentMode = 'day'; // 'day' | 'month' | 'year'
  let flowData;

  // ── Phase 1: Load data ─────────────────────────────────────────
  try {
    flowData = await DataLoader.load();
  } catch (err) {
    loadingEl.textContent = `数据加载失败: ${err.message}`;
    loadingEl.classList.add('error');
    console.error(err);
    return;
  }

  if (!flowData.days.length) {
    loadingEl.textContent = '没有可用的日期数据';
    loadingEl.classList.add('error');
    return;
  }

  // ── Phase 2: Init pickers ──────────────────────────────────────

  // Day picker
  dayPicker.min   = flowData.days[0];
  dayPicker.max   = flowData.days[flowData.days.length - 1];
  dayPicker.value = flowData.days[flowData.days.length - 1];

  // Month picker
  monthPicker.min   = flowData.months[0];
  monthPicker.max   = flowData.months[flowData.months.length - 1];
  monthPicker.value = flowData.months[flowData.months.length - 1];

  // Year picker
  yearPicker.innerHTML = flowData.years
    .map(y => `<option value="${y}">${y} 年</option>`)
    .join('');
  yearPicker.value = flowData.years[flowData.years.length - 1];

  // ── Phase 3: Load SVG ──────────────────────────────────────────
  let svgRoot;
  try {
    const resp = await fetch('Beijing_Subway_System_Map_zh.svg');
    if (!resp.ok) throw new Error(`SVG load failed: ${resp.status}`);
    svgContainer.innerHTML = await resp.text();
    svgRoot = svgContainer.querySelector('svg');
    if (!svgRoot) throw new Error('No <svg> element found');
  } catch (err) {
    loadingEl.textContent = `SVG 加载失败: ${err.message}`;
    loadingEl.classList.add('error');
    console.error(err);
    return;
  }

  // ── Phase 4: Static legend ─────────────────────────────────────
  renderLegend();

  // ── Phase 5: Initial render + bind events ──────────────────────
  loadingEl.style.display = 'none';
  enablePickers(true);
  updateVisualization();

  modeBtns.forEach(btn => btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode === currentMode) return;
    currentMode = mode;
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    switchPicker();
    updateVisualization();
  }));

  dayPicker.addEventListener('change', updateVisualization);
  monthPicker.addEventListener('change', updateVisualization);
  yearPicker.addEventListener('change', updateVisualization);

  // ── Functions ───────────────────────────────────────────────────

  function enablePickers(on) {
    dayPicker.disabled = monthPicker.disabled = yearPicker.disabled = !on;
  }

  function switchPicker() {
    dayPicker.style.display   = currentMode === 'day'   ? '' : 'none';
    monthPicker.style.display = currentMode === 'month' ? '' : 'none';
    yearPicker.style.display  = currentMode === 'year'  ? '' : 'none';
  }

  function getCurrentFlow() {
    if (currentMode === 'day')   return flowData.getFlowByDay(dayPicker.value);
    if (currentMode === 'month') return flowData.getFlowByMonth(monthPicker.value);
    return flowData.getFlowByYear(yearPicker.value);
  }

  function getCurrentLabel() {
    if (currentMode === 'day')   return dayPicker.value;
    if (currentMode === 'month') return monthPicker.value;
    return `${yearPicker.value} 年`;
  }

  function updateVisualization() {
    const label = getCurrentLabel();
    const lineFlows = getCurrentFlow();
    if (!lineFlows) {
      titleEl.textContent = `${label} — 无数据`;
      return;
    }

    SvgRenderer.resetAll(svgRoot);

    const lineTiers     = classifyFlows(lineFlows);
    const groupTierMap  = buildSvgGroupTierMap(lineTiers);
    const glowSvgId     = findTopSvgGroup(lineFlows);

    SvgRenderer.render(svgRoot, groupTierMap, glowSvgId);

    titleEl.textContent = `${label} 客流量分布`;

    updateLegend(lineFlows, lineTiers);
    updateRanking(lineFlows, lineTiers);
  }

  function renderLegend() {
    legendCont.innerHTML = '';
    for (let tier = 5; tier >= 1; tier--) {
      const div = document.createElement('div');
      div.className = 'legend-item';
      div.innerHTML = `
        <span class="legend-line" style="
          --legend-width: ${STROKE_WIDTH_MAP[tier]}px;
          --legend-color: ${TIER_COLORS[tier]};
        "></span>
        <span class="legend-label">${TIER_LABELS[tier]}</span>
        <span class="legend-width">${STROKE_WIDTH_MAP[tier]}px</span>
      `;
      legendCont.appendChild(div);
    }
  }

  function updateLegend(lineFlows, lineTiers) {
    const values = Object.values(lineFlows).filter(v => typeof v === 'number');
    const sorted = [...values].sort((a, b) => a - b);

    const p20 = percentile(sorted, 20);
    const p40 = percentile(sorted, 40);
    const p60 = percentile(sorted, 60);
    const p80 = percentile(sorted, 80);

    const thresholdLabels = [
      `≤ ${p20.toFixed(1)} 万`,
      `${p20.toFixed(1)} ~ ${p40.toFixed(1)} 万`,
      `${p40.toFixed(1)} ~ ${p60.toFixed(1)} 万`,
      `${p60.toFixed(1)} ~ ${p80.toFixed(1)} 万`,
      `> ${p80.toFixed(1)} 万`
    ];

    const items = legendCont.querySelectorAll('.legend-item');
    items.forEach((item, i) => {
      const tier = 5 - i;
      const label = item.querySelector('.legend-label');
      const old = item.querySelector('.legend-threshold');
      if (old) old.remove();
      if (label) {
        const span = document.createElement('span');
        span.className = 'legend-threshold';
        span.textContent = thresholdLabels[tier - 1];
        label.after(span);
      }
    });
  }

  function updateRanking(lineFlows, lineTiers) {
    const container = document.getElementById('ranking-container');
    if (!container) return;

    const allValues = Object.values(lineFlows).filter(v => typeof v === 'number');
    const maxFlow = Math.max(...allValues, 1);

    const sorted = Object.entries(lineFlows)
      .map(([name, flow]) => ({ name, flow, tier: lineTiers[name] }))
      .sort((a, b) => b.flow - a.flow);

    container.innerHTML = sorted.map((entry, i) => {
      const barPct = (entry.flow / maxFlow * 100).toFixed(1);
      const tierColor = TIER_COLORS[entry.tier];
      return `
        <div class="ranking-row">
          <span class="rank-num">${i + 1}</span>
          <span class="rank-line-name">${entry.name}</span>
          <span class="rank-bar-wrap">
            <span class="rank-bar" style="width:${barPct}%;background:${tierColor}"></span>
          </span>
          <span class="rank-flow">${entry.flow.toFixed(1)}<span class="rank-flow-unit"> 万</span></span>
          <span class="rank-tier-dot" style="background:${tierColor}"></span>
        </div>`;
    }).join('');
  }
})();
