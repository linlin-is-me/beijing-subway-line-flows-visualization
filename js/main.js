/**
 * Main controller: wires data loading, classification, and rendering.
 */

(async function main() {
  const dateInput = document.getElementById('date-picker');
  const svgContainer = document.getElementById('svg-container');
  const legendContainer = document.getElementById('legend');
  const loadingEl = document.getElementById('loading');
  const titleEl = document.getElementById('selected-date-label');

  // ── Phase 1: Load flow data ────────────────────────────────────
  let flowData;
  try {
    flowData = await DataLoader.load();
  } catch (err) {
    loadingEl.textContent = `数据加载失败: ${err.message}`;
    loadingEl.classList.add('error');
    console.error(err);
    return;
  }

  // Initialize date picker
  const dates = flowData.dates;
  if (dates.length === 0) {
    loadingEl.textContent = '没有可用的日期数据';
    loadingEl.classList.add('error');
    return;
  }

  dateInput.min = dates[0];
  dateInput.max = dates[dates.length - 1];
  dateInput.value = dates[dates.length - 1]; // default to latest
  dateInput.disabled = false;

  // ── Phase 2: Load SVG ──────────────────────────────────────────
  let svgRoot;
  try {
    const svgResp = await fetch('Beijing_Subway_System_Map_zh.svg');
    if (!svgResp.ok) throw new Error(`SVG load failed: ${svgResp.status}`);
    const svgText = await svgResp.text();
    svgContainer.innerHTML = svgText;
    svgRoot = svgContainer.querySelector('svg');
    if (!svgRoot) throw new Error('No <svg> element found');
  } catch (err) {
    loadingEl.textContent = `SVG 加载失败: ${err.message}`;
    loadingEl.classList.add('error');
    console.error(err);
    return;
  }

  // ── Phase 3: Render legend (static, always visible) ─────────────
  renderLegend();

  // ── Phase 4: Render initial date ────────────────────────────────
  loadingEl.style.display = 'none';
  updateVisualization();

  // ── Phase 5: Bind date change ───────────────────────────────────
  dateInput.addEventListener('change', updateVisualization);

  // ── Functions ───────────────────────────────────────────────────

  function updateVisualization() {
    const date = dateInput.value;
    if (!date) return;

    const lineFlows = flowData.getFlowByDate(date);
    if (!lineFlows) {
      titleEl.textContent = `${date} — 无数据`;
      return;
    }

    // Reset all lines to default width first
    SvgRenderer.resetAll(svgRoot);

    // Classify
    const lineTiers = classifyFlows(lineFlows);

    // Build SVG group → tier map (handles combined lines)
    const groupTierMap = buildSvgGroupTierMap(lineTiers);

    // Render
    SvgRenderer.render(svgRoot, groupTierMap);

    // Update title
    titleEl.textContent = `${date} 客流量分布`;

    // Update legend with current tier info
    updateLegend(lineFlows, lineTiers);
  }

  function renderLegend() {
    legendContainer.innerHTML = '';
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
      legendContainer.appendChild(div);
    }
  }

  function updateLegend(lineFlows, lineTiers) {
    // Add tier counts and threshold info
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

    const items = legendContainer.querySelectorAll('.legend-item');
    items.forEach((item, i) => {
      const tier = 5 - i;
      const label = item.querySelector('.legend-label');
      const oldThreshold = item.querySelector('.legend-threshold');
      if (oldThreshold) oldThreshold.remove();

      if (label) {
        const span = document.createElement('span');
        span.className = 'legend-threshold';
        span.textContent = thresholdLabels[tier - 1];
        label.after(span);
      }
    });
  }
})();
