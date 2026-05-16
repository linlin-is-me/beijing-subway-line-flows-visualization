/**
 * Main controller: wires data loading, mode switching, classification,
 * rendering, and time-series playback animation.
 */
(async function main() {
  // ── DOM refs ─────────────────────────────────────────────────────
  const dayPicker    = document.getElementById('day-picker');
  const monthPicker  = document.getElementById('month-picker');
  const yearPicker   = document.getElementById('year-picker');
  const modeBtns     = document.querySelectorAll('.mode-btn');
  const svgContainer = document.getElementById('svg-container');
  const legendCont   = document.getElementById('legend');
  const loadingEl    = document.getElementById('loading');
  const titleEl      = document.getElementById('selected-date-label');

  // Player
  const btnPlay      = document.getElementById('btn-play');
  const btnStepBack  = document.getElementById('btn-step-back');
  const btnStepFwd   = document.getElementById('btn-step-fwd');
  const speedSel     = document.getElementById('speed-select');
  const progressFill = document.getElementById('progress-bar-fill');
  const progressLbl  = document.getElementById('progress-label');

  let currentMode  = 'day';
  let flowData;
  let svgRoot;

  // Player state
  let playing      = false;
  let playTimer    = null;
  let rafId        = null;   // requestAnimationFrame id for render batching
  let seqIndex     = 0;
  let seqKeys      = [];

  // ── Phase 1: Load data ──────────────────────────────────────────
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

  // ── Phase 2: Init pickers ───────────────────────────────────────
  dayPicker.min   = flowData.days[0];
  dayPicker.max   = flowData.days[flowData.days.length - 1];
  dayPicker.value = flowData.days[flowData.days.length - 1];

  monthPicker.min   = flowData.months[0];
  monthPicker.max   = flowData.months[flowData.months.length - 1];
  monthPicker.value = flowData.months[flowData.months.length - 1];

  yearPicker.innerHTML = flowData.years
    .map(y => `<option value="${y}">${y} 年</option>`)
    .join('');
  yearPicker.value = flowData.years[flowData.years.length - 1];

  // ── Phase 3: Load SVG ───────────────────────────────────────────
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

  // ── Phase 4: Static legend + initial render ─────────────────────
  renderLegend();
  loadingEl.style.display = 'none';
  enablePickers(true);
  rebuildSequence();
  updateVisualization();

  // ── Phase 5: Mode buttons ───────────────────────────────────────
  modeBtns.forEach(btn => btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode === currentMode) return;
    stopPlayback();
    currentMode = mode;
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    switchPicker();
    rebuildSequence();
    updateVisualization();
  }));

  // ── Phase 6: Picker change ──────────────────────────────────────
  dayPicker.addEventListener('change', onPickerChange);
  monthPicker.addEventListener('change', onPickerChange);
  yearPicker.addEventListener('change', onPickerChange);

  function onPickerChange() {
    if (playing) return;
    seqIndex = getCurrentIndex();
    updateVisualization();
  }

  // ── Phase 7: Player buttons ─────────────────────────────────────
  btnPlay.addEventListener('click', togglePlayback);
  btnStepBack.addEventListener('click', () => { stopPlayback(); stepBack(); });
  btnStepFwd.addEventListener('click', () => { stopPlayback(); stepForward(); });

  // ═══════════════════════════════════════════════════════════════════
  //  PLAYER — decoupled scheduling + rendering for responsive clicks
  // ═══════════════════════════════════════════════════════════════════

  function getSequence() {
    if (currentMode === 'day')   return flowData.days;
    if (currentMode === 'month') return flowData.months;
    return flowData.years;
  }

  function rebuildSequence() {
    seqKeys = getSequence();
    seqIndex = getCurrentIndex();
    updateProgressUI();
  }

  function getCurrentIndex() {
    const keys = getSequence();
    const val = getPickerValue();
    const idx = keys.indexOf(val);
    return idx >= 0 ? idx : keys.length - 1;
  }

  function getPickerValue() {
    if (currentMode === 'day')   return dayPicker.value;
    if (currentMode === 'month') return monthPicker.value;
    return yearPicker.value;
  }

  function setPickerValue(val) {
    if (currentMode === 'day')   dayPicker.value = val;
    else if (currentMode === 'month') monthPicker.value = val;
    else yearPicker.value = val;
  }

  function togglePlayback() {
    if (playing) { stopPlayback(); return; }
    // Start
    playing = true;
    btnPlay.textContent = '⏸';
    btnPlay.classList.add('playing');
    disableControlsDuringPlayback(true);
    scheduleNextStep();
  }

  function stopPlayback() {
    playing = false;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    btnPlay.textContent = '▶';
    btnPlay.classList.remove('playing');
    disableControlsDuringPlayback(false);
    // Final ranking update (may have been skipped during playback)
    scheduleRankingUpdate();
  }

  function disableControlsDuringPlayback(lock) {
    modeBtns.forEach(b => b.disabled = lock);
    dayPicker.disabled = lock || currentMode !== 'day';
    monthPicker.disabled = lock || currentMode !== 'month';
    yearPicker.disabled = lock || currentMode !== 'year';
  }

  // ── Scheduling (timer → next frame render) ─────────────────

  function scheduleNextStep() {
    if (!playing) return;
    if (seqIndex >= seqKeys.length - 1) {
      stopPlayback();
      return;
    }

    seqIndex++;
    setPickerValue(seqKeys[seqIndex]);

    // Schedule the render on the next animation frame.
    // If the user clicks pause before the frame fires, we cancel it.
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (!playing) return;  // aborted by stopPlayback

      renderCurrentFrame();
      updateProgressUI();

      // Schedule next timer AFTER render completes.
      // The timer fires even if render was slow — clicks between frames
      // are handled by the browser's event loop between macro-tasks.
      const delay = parseInt(speedSel.value, 10);
      playTimer = setTimeout(scheduleNextStep, delay);
    });
  }

  function stepForward() {
    if (seqIndex >= seqKeys.length - 1) return;
    seqIndex++;
    setPickerValue(seqKeys[seqIndex]);
    renderCurrentFrame();
    updateProgressUI();
  }

  function stepBack() {
    if (seqIndex <= 0) return;
    seqIndex--;
    setPickerValue(seqKeys[seqIndex]);
    renderCurrentFrame();
    updateProgressUI();
  }

  // ── Lightweight render (only SVG + title + legend; ranking deferred) ─

  function renderCurrentFrame() {
    const label = getCurrentLabel();
    const lineFlows = getCurrentFlow();
    if (!lineFlows) {
      titleEl.textContent = `${label} — 无数据`;
      return;
    }

    SvgRenderer.resetAll(svgRoot);

    const lineTiers    = classifyFlows(lineFlows);
    const groupTierMap = buildSvgGroupTierMap(lineTiers);
    const glowSvgId    = findTopSvgGroup(lineFlows);

    SvgRenderer.render(svgRoot, groupTierMap, glowSvgId);

    // Pulse animation on top 3 lines
    const top3Ids = findTopNSvgGroups(lineFlows, 3);
    PulseAnimator.update(svgRoot, top3Ids);

    titleEl.textContent = `${label} 客流量分布`;

    updateLegend(lineFlows, lineTiers);

    // During playback, defer ranking rebuild. Too heavy per frame.
    if (!playing) {
      updateRanking(lineFlows, lineTiers);
    }
  }

  let rankingPending = false;
  function scheduleRankingUpdate() {
    if (rankingPending) return;
    rankingPending = true;
    requestAnimationFrame(() => {
      rankingPending = false;
      const lineFlows = getCurrentFlow();
      if (lineFlows) {
        const lineTiers = classifyFlows(lineFlows);
        updateRanking(lineFlows, lineTiers);
      }
    });
  }

  // ── Progress ─────────────────────────────────────────────────────

  function updateProgressUI() {
    const total = seqKeys.length;
    progressLbl.textContent = total ? `${seqIndex + 1} / ${total}` : '0 / 0';
    progressFill.style.width = total ? `${((seqIndex + 1) / total * 100).toFixed(1)}%` : '0%';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CORE RENDER (does full ranking — used on mode/picker change)
  // ═══════════════════════════════════════════════════════════════════

  function enablePickers(on) {
    dayPicker.disabled = !on;
    monthPicker.disabled = !on;
    yearPicker.disabled = !on;
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
    const lineFlows = getCurrentFlow();
    if (!lineFlows) return;
    renderCurrentFrame();
    const lineTiers = classifyFlows(lineFlows);
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
