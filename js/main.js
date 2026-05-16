/**
 * Main controller: 4 modes (year / month / day / hour) + playback.
 *
 * Playback scope:
 *   年 — all years 2019-2025
 *   月 — 12 months of the selected year
 *   日 — all days of the selected month
 *   时 — 5:00-23:00 of the selected day
 */
(async function main() {
  // ── DOM refs ─────────────────────────────────────────────────────
  const yearPicker  = document.getElementById('year-picker');
  const monthPicker = document.getElementById('month-picker');
  const dayPicker   = document.getElementById('day-picker');
  const hourDisplay = document.getElementById('hour-display');
  const modeBtns    = document.querySelectorAll('.mode-btn');
  const svgContainer= document.getElementById('svg-container');
  const legendCont  = document.getElementById('legend');
  const loadingEl   = document.getElementById('loading');
  const titleEl     = document.getElementById('selected-date-label');

  // Player
  const btnPlay     = document.getElementById('btn-play');
  const btnStepBack = document.getElementById('btn-step-back');
  const btnStepFwd  = document.getElementById('btn-step-fwd');
  const speedSel    = document.getElementById('speed-select');
  const progressFill= document.getElementById('progress-bar-fill');
  const progressLbl = document.getElementById('progress-label');
  const progressBg  = document.getElementById('progress-bar-bg');
  const thumb       = document.getElementById('progress-thumb');

  let currentMode = 'day';
  let flowData;
  let svgRoot;

  // Player state
  let playing   = false;
  let playTimer = null;
  let rafId     = null;
  let seqIndex  = 0;
  let seqKeys   = [];
  let scrubbing = false;
  let wasPlayingBeforeScrub = false;

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
  yearPicker.innerHTML = flowData.years
    .map(y => `<option value="${y}">${y} 年</option>`).join('');
  yearPicker.value = flowData.years[flowData.years.length - 1];

  monthPicker.min = flowData.months[0];
  monthPicker.max = flowData.months[flowData.months.length - 1];
  monthPicker.value = flowData.months[flowData.months.length - 1];

  dayPicker.min   = flowData.days[0];
  dayPicker.max   = flowData.days[flowData.days.length - 1];
  dayPicker.value = flowData.days[flowData.days.length - 1];

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

  TooltipManager.init(svgRoot);

  // ── Phase 4: Initial render ─────────────────────────────────────
  renderLegend();
  loadingEl.style.display = 'none';
  switchPicker();
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

  // ── Phase 6: Picker changes ─────────────────────────────────────
  yearPicker.addEventListener('change', onPickerChange);
  monthPicker.addEventListener('change', onPickerChange);
  dayPicker.addEventListener('change', onPickerChange);

  function onPickerChange() {
    if (playing) return;
    rebuildSequence();
    updateVisualization();
  }

  // ── Phase 7: Player buttons ─────────────────────────────────────
  btnPlay.addEventListener('click', togglePlayback);
  btnStepBack.addEventListener('click', () => { stopPlayback(); stepBack(); });
  btnStepFwd.addEventListener('click', () => { stopPlayback(); stepForward(); });

  // ── Scrubber ────────────────────────────────────────────────────
  function getScrubFraction(e) {
    const rect = progressBg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  }
  function scrubTo(fraction) {
    const idx = Math.round(fraction * (seqKeys.length - 1));
    if (idx === seqIndex) return;
    seqIndex = idx;
    applySeqIndex();
    renderCurrentFrame();
    updateProgressUI();
  }
  progressBg.addEventListener('mousedown', (e) => {
    scrubbing = true;
    wasPlayingBeforeScrub = playing;
    if (playing) stopPlayback();
    progressBg.classList.add('dragging');
    scrubTo(getScrubFraction(e));
  });
  document.addEventListener('mousemove', (e) => {
    if (!scrubbing) return;
    scrubTo(getScrubFraction(e));
  });
  document.addEventListener('mouseup', () => {
    if (!scrubbing) return;
    scrubbing = false;
    progressBg.classList.remove('dragging');
    if (wasPlayingBeforeScrub) startPlayback();
  });

  // ═══════════════════════════════════════════════════════════════════
  //  MODE HELPERS
  // ═══════════════════════════════════════════════════════════════════

  function switchPicker() {
    yearPicker.style.display  = (currentMode === 'year' || currentMode === 'month') ? '' : 'none';
    monthPicker.style.display = (currentMode === 'day')   ? '' : 'none';
    dayPicker.style.display   = (currentMode === 'hour')  ? '' : 'none';
    hourDisplay.style.display = (currentMode === 'hour')  ? '' : 'none';
  }

  function getSequence() {
    if (currentMode === 'year') {
      return flowData.years;
    }
    if (currentMode === 'month') {
      const y = yearPicker.value || flowData.years[flowData.years.length - 1];
      return flowData.months.filter(m => m.startsWith(y));
    }
    if (currentMode === 'day') {
      const m = monthPicker.value;
      if (!m) return [];
      return flowData.getDaysOfMonth(m);
    }
    // hour
    return DataLoader.HOUR_SLOTS;
  }

  function rebuildSequence() {
    seqKeys = getSequence();
    seqIndex = currentMode === 'hour' ? 0 : Math.max(0, seqKeys.length - 1);
    updateProgressUI();
  }

  function applySeqIndex() {
    if (currentMode === 'year')       yearPicker.value = seqKeys[seqIndex];
    else if (currentMode === 'month') monthPicker.value = seqKeys[seqIndex];
    else if (currentMode === 'day')   dayPicker.value = seqKeys[seqIndex];
    // hour: seqKeys are already hour slots, nothing to set in a picker
  }

  function getFlowForIndex() {
    if (currentMode === 'year')       return flowData.getFlowByYear(seqKeys[seqIndex]);
    if (currentMode === 'month')      return flowData.getFlowByMonth(seqKeys[seqIndex]);
    if (currentMode === 'day')        return flowData.getFlowByDay(seqKeys[seqIndex]);
    return flowData.getFlowByHour(dayPicker.value, seqKeys[seqIndex]);
  }

  function getLabelForIndex() {
    if (currentMode === 'year')       return `${seqKeys[seqIndex]} 年`;
    if (currentMode === 'month')      return seqKeys[seqIndex];
    if (currentMode === 'day')        return seqKeys[seqIndex];
    return `${dayPicker.value}  ${seqKeys[seqIndex]}`;
  }

  function computeRanking(lineFlows) {
    if (!lineFlows) return null;
    const ranking = {};
    Object.entries(lineFlows)
      .filter(([, v]) => typeof v === 'number')
      .sort((a, b) => b[1] - a[1])
      .forEach(([name], i) => { ranking[name] = i + 1; });
    return ranking;
  }

  function getPrevFlowForIndex() {
    if (seqIndex <= 0) return null;
    const prevKey = seqKeys[seqIndex - 1];
    if (currentMode === 'year')  return flowData.getFlowByYear(prevKey);
    if (currentMode === 'month') return flowData.getFlowByMonth(prevKey);
    if (currentMode === 'day')   return flowData.getFlowByDay(prevKey);
    return flowData.getFlowByHour(dayPicker.value, prevKey);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PLAYER
  // ═══════════════════════════════════════════════════════════════════

  function togglePlayback() {
    if (playing) { stopPlayback(); return; }
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
    scheduleRankingUpdate();
  }

  function disableControlsDuringPlayback(lock) {
    modeBtns.forEach(b => b.disabled = lock);
    yearPicker.disabled = lock;
    monthPicker.disabled = lock;
    dayPicker.disabled = lock;
  }

  function scheduleNextStep() {
    if (!playing) return;
    if (seqIndex >= seqKeys.length - 1) { stopPlayback(); return; }

    seqIndex++;
    applySeqIndex();

    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (!playing) return;
      renderCurrentFrame();
      updateProgressUI();
      const delay = parseInt(speedSel.value, 10);
      playTimer = setTimeout(scheduleNextStep, delay);
    });
  }

  function stepForward() {
    if (seqIndex >= seqKeys.length - 1) return;
    seqIndex++;
    applySeqIndex();
    renderCurrentFrame();
    updateProgressUI();
  }

  function stepBack() {
    if (seqIndex <= 0) return;
    seqIndex--;
    applySeqIndex();
    renderCurrentFrame();
    updateProgressUI();
  }

  // ── Render (light during playback, full when stopped) ────────────

  function renderCurrentFrame() {
    const label = getLabelForIndex();
    const lineFlows = getFlowForIndex();
    if (!lineFlows) {
      titleEl.textContent = `${label} — 无数据`;
      return;
    }

    // Tooltip: update data for the next hover
    const curRanking = computeRanking(lineFlows);
    const prevFlows  = getPrevFlowForIndex();
    const prevRanks  = computeRanking(prevFlows);
    TooltipManager.updateData(lineFlows, curRanking, prevRanks);

    SvgRenderer.resetAll(svgRoot);

    const lineTiers    = classifyFlows(lineFlows);
    const groupTierMap = buildSvgGroupTierMap(lineTiers);
    const glowSvgId    = findTopSvgGroup(lineFlows);

    SvgRenderer.render(svgRoot, groupTierMap, glowSvgId);

    const top3Ids = findTopNSvgGroups(lineFlows, 3);
    PulseAnimator.update(svgRoot, top3Ids);

    titleEl.textContent = `${label} 客流量分布`;

    updateLegend(lineFlows, lineTiers);

    // Update the hour display in the picker area
    if (currentMode === 'hour') {
      hourDisplay.textContent = label;
    }

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
      const lineFlows = getFlowForIndex();
      if (lineFlows) {
        const lineTiers = classifyFlows(lineFlows);
        updateRanking(lineFlows, lineTiers);
      }
    });
  }

  function updateProgressUI() {
    const total = seqKeys.length;
    const pct = total ? ((seqIndex + 1) / total * 100) : 0;
    progressLbl.textContent = total ? `${seqIndex + 1} / ${total}` : '0 / 0';
    progressFill.style.width = `${pct.toFixed(1)}%`;
    thumb.style.left = `${pct.toFixed(1)}%`;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  FULL RENDER (picker change)
  // ═══════════════════════════════════════════════════════════════════

  function updateVisualization() {
    // Set seqIndex to match current picker value
    const pickerVal = currentMode === 'year' ? yearPicker.value
                    : currentMode === 'month' ? monthPicker.value
                    : currentMode === 'day' ? dayPicker.value
                    : seqKeys[0]; // hour always starts at first slot
    const idx = seqKeys.indexOf(pickerVal);
    if (idx >= 0) seqIndex = idx;
    updateProgressUI();

    const lineFlows = getFlowForIndex();
    if (!lineFlows) return;
    renderCurrentFrame();
    const lineTiers = classifyFlows(lineFlows);
    updateRanking(lineFlows, lineTiers);
  }

  // ── Legend ───────────────────────────────────────────────────────

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
    const p20 = percentile(sorted, 20), p40 = percentile(sorted, 40);
    const p60 = percentile(sorted, 60), p80 = percentile(sorted, 80);
    const thresholdLabels = [
      `≤ ${p20.toFixed(2)} 万`,
      `${p20.toFixed(2)} ~ ${p40.toFixed(2)} 万`,
      `${p40.toFixed(2)} ~ ${p60.toFixed(2)} 万`,
      `${p60.toFixed(2)} ~ ${p80.toFixed(2)} 万`,
      `> ${p80.toFixed(2)} 万`
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
          <span class="rank-flow">${entry.flow.toFixed(2)}<span class="rank-flow-unit"> 万</span></span>
          <span class="rank-tier-dot" style="background:${tierColor}"></span>
        </div>`;
    }).join('');
  }
})();
