/**
 * Main controller: 4 modes (year / month / day / hour) + playback.
 */
(async function main() {
  const dayPicker   = document.getElementById('day-picker');
  const modeBtns    = document.querySelectorAll('.mode-btn');
  const svgContainer= document.getElementById('svg-container');
  const legendCont  = document.getElementById('legend');
  const rankingCont = document.getElementById('ranking-container');
  const loadingEl   = document.getElementById('loading');
  const titleEl     = document.getElementById('selected-date-label');
  const sceneTags   = document.getElementById('scene-tags');
  const tidalSect   = document.getElementById('tidal-section');
  const tidalName   = document.getElementById('tidal-line-name');
  const btnSM       = document.getElementById('btn-sm');
  const btnRidge    = document.getElementById('btn-ridge');
  const btnHeatmap  = document.getElementById('btn-heatmap');
  const btnPlay     = document.getElementById('btn-play');
  const btnStepBack = document.getElementById('btn-step-back');
  const btnStepFwd  = document.getElementById('btn-step-fwd');
  const speedSel    = document.getElementById('speed-select');
  const progressFill= document.getElementById('progress-bar-fill');
  const progressLbl = document.getElementById('progress-label');
  const progressBg  = document.getElementById('progress-bar-bg');
  const thumb       = document.getElementById('progress-thumb');

  let currentMode = 'day';
  let flowData, svgRoot, tidalLine = null, heatmapCanvas;
  let playing = false, playTimer = null, rafId = null;
  let seqIndex = 0, seqKeys = [];
  let scrubbing = false, wasPlayingBeforeScrub = false;
  const viewActive = { sm: false, ridge: false, heatmap: false };

  const TAG_MAP = {
    day_type: { normal: '工作日', weekend: '周末', holiday: '长假/春节', return: '返程高峰', exodus: '节前离京' },
    weather: { normal: null, rain: '降雨', snow: '降雪' },
    event: { none: null }
  };

  try {
    flowData = await DataLoader.load();
  } catch (err) { loadingEl.textContent = `数据加载失败: ${err.message}`; loadingEl.classList.add('error'); console.error(err); return; }
  if (!flowData.days.length) { loadingEl.textContent = '没有可用的日期数据'; loadingEl.classList.add('error'); return; }

  dayPicker.min = flowData.days[0]; dayPicker.max = flowData.days[flowData.days.length - 1];
  dayPicker.value = flowData.days[flowData.days.length - 1];

  try {
    const resp = await fetch('Beijing_Subway_System_Map_zh.svg');
    if (!resp.ok) throw new Error(`SVG load failed: ${resp.status}`);
    svgContainer.innerHTML = await resp.text();
    svgRoot = svgContainer.querySelector('svg');
    if (!svgRoot) throw new Error('No <svg> element found');
    // hide the "Beijing Subway System Map" text watermark
    const watermark = svgRoot.querySelector('#Beijing_Subway_System_Map_zh');
    if (watermark) watermark.style.display = 'none';
    // hide line name labels
    const lineNameGarbled = new TextDecoder('windows-1252').decode(new TextEncoder().encode('线路名'));
    const lineNameGroup = svgRoot.querySelector('#' + CSS.escape(lineNameGarbled));
    if (lineNameGroup) lineNameGroup.style.display = 'none';
    // create heatmap canvas overlay
    heatmapCanvas = document.createElement('canvas');
    heatmapCanvas.id = 'heatmap-canvas';
    heatmapCanvas.width = 2400;
    heatmapCanvas.height = 2400;
    heatmapCanvas.style.display = 'none';
    svgContainer.appendChild(heatmapCanvas);
  } catch (err) { loadingEl.textContent = `SVG 加载失败: ${err.message}`; loadingEl.classList.add('error'); console.error(err); return; }

  // Scale station name labels by 1.4x
  svgRoot.querySelectorAll('g[id^="zh-hans"], g[id^="zh-hant"]').forEach(g => {
    try {
      const bb = g.getBBox();
      if (bb.width === 0 && bb.height === 0) return;
      const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
      const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      wrap.setAttribute('transform', 'translate(' + cx + ',' + cy + ') scale(1.35) translate(' + (-cx) + ',' + (-cy) + ')');
      while (g.firstChild) wrap.appendChild(g.firstChild);
      g.appendChild(wrap);
    } catch(e) {}
  });

  // Hide built-in SVG legend
  const legendG = svgRoot.querySelector('g[id=\"' + (function(s){const b=new TextEncoder().encode(s);return new TextDecoder('windows-1252').decode(b);})('图例') + '\"]');
  if (legendG) legendG.style.display = 'none';

  TooltipManager.init(svgRoot);
  BrushingLinking.init(svgRoot, rankingCont);
  TidalChart.init(document.getElementById('tidal-canvas'));
  SmallMultiples.init(document.getElementById('sm-grid'));
  RidgelinePlot.init(document.body, () => { viewActive.ridge = false; btnRidge.classList.remove('active'); });
  FlowParticles.init(svgRoot);
  await TransferStations.init(svgRoot);

  renderLegend();
  loadingEl.style.display = 'none';
  switchPicker();
  rebuildSequence();
  updateVisualization();

  modeBtns.forEach(btn => btn.addEventListener('click', () => {
    const mode = btn.dataset.mode; if (mode === currentMode) return;
    stopPlayback(); currentMode = mode;
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    switchPicker(); rebuildSequence(); updateVisualization();
  }));

  dayPicker.addEventListener('change', onPickerChange);
  function onPickerChange() { if (playing) return; rebuildSequence(); updateVisualization(); }

  btnPlay.addEventListener('click', togglePlayback);
  btnStepBack.addEventListener('click', () => { stopPlayback(); stepBack(); });
  btnStepFwd.addEventListener('click', () => { stopPlayback(); stepForward(); });

  // View toggle buttons
  function clearViewBtns() { for (const b of [btnSM, btnRidge, btnHeatmap]) b.classList.remove('active'); }
  btnSM.addEventListener('click', () => {
    viewActive.sm = SmallMultiples.toggle();
    btnSM.classList.toggle('active', viewActive.sm);
    if (viewActive.sm) renderSmallMultiples();
  });
  btnRidge.addEventListener('click', () => {
    RidgelinePlot.toggle();
    viewActive.ridge = !viewActive.ridge;
    btnRidge.classList.toggle('active', viewActive.ridge);
    if (viewActive.ridge) renderRidgeline();
  });
  btnHeatmap.addEventListener('click', () => {
    viewActive.heatmap = !viewActive.heatmap;
    btnHeatmap.classList.toggle('active', viewActive.heatmap);
    if (heatmapCanvas) heatmapCanvas.style.display = viewActive.heatmap ? '' : 'none';
    renderCurrentFrame();
  });
  function getScrubFraction(e) { const r = progressBg.getBoundingClientRect(); return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); }
  function scrubTo(f) { f=Math.max(0,Math.min(1,f)); const idx=Math.round(f*Math.max(0,seqKeys.length-1)); if(idx===seqIndex)return; seqIndex=idx;applySeqIndex();renderCurrentFrame();updateProgressUI(); }
  progressBg.addEventListener('mousedown',(e)=>{scrubbing=true;wasPlayingBeforeScrub=playing;if(playing)stopPlayback();progressBg.classList.add('dragging');scrubTo(getScrubFraction(e));});
  document.addEventListener('mousemove',(e)=>{if(!scrubbing)return;scrubTo(getScrubFraction(e));});
  document.addEventListener('mouseup',()=>{if(!scrubbing)return;scrubbing=false;progressBg.classList.remove('dragging');if(wasPlayingBeforeScrub)startPlayback();});

  function switchPicker(){tidalSect.style.display=(currentMode=="hour")?"":"none";}
  function getSequence() {
    if(currentMode==='year')return flowData.years;
    if(currentMode==="month"){const d=dayPicker.value;if(!d)return[];const y=d.substring(0,4);return flowData.months.filter(m=>m.startsWith(y));}
    if(currentMode==="day"){const d=dayPicker.value;if(!d)return[];const m=d.substring(0,7);return flowData.getDaysOfMonth(m);}
    return DataLoader.HOUR_SLOTS;
  }
  function rebuildSequence() { seqKeys=getSequence(); seqIndex=currentMode==='hour'?0:Math.max(0,seqKeys.length-1); updateProgressUI(); }
  function applySeqIndex() {
    if(currentMode==="day")dayPicker.value=seqKeys[seqIndex];
  }
  function getFlowForIndex() {
    if(currentMode==='year')return flowData.getFlowByYear(seqKeys[seqIndex]);if(currentMode==='month')return flowData.getFlowByMonth(seqKeys[seqIndex]);if(currentMode==='day')return flowData.getFlowByDay(seqKeys[seqIndex]);
    return flowData.getFlowByHour(dayPicker.value, seqKeys[seqIndex]);
  }
  function getLabelForIndex() { if(currentMode==='year')return`${seqKeys[seqIndex]} 年`;if(currentMode==='month')return seqKeys[seqIndex];if(currentMode==='day')return seqKeys[seqIndex];return`${dayPicker.value}  ${seqKeys[seqIndex]}`; }
  function getCurrentDate() { if(currentMode==='hour')return dayPicker.value;if(currentMode==='day')return seqKeys[seqIndex];return null; }

  function updateSceneTags() {
    const date=getCurrentDate(); const meta=date?flowData.getMeta(date):null;
    if(!meta){sceneTags.innerHTML='';return;}
    const tags=[];
    const dtLabel=TAG_MAP.day_type[meta.day_type]||meta.day_type; tags.push(`<span class="scene-tag day_type-${meta.day_type}">${dtLabel}</span>`);
    const wLabel=TAG_MAP.weather[meta.weather]; if(wLabel)tags.push(`<span class="scene-tag weather-${meta.weather}">${wLabel}</span>`);
    if(meta.event&&meta.event!=='none'){const s=meta.event.length>10?meta.event.substring(0,10)+'…':meta.event;tags.push(`<span class="scene-tag event">${s}</span>`);}
    sceneTags.innerHTML=tags.join('');
  }

  function computeDirections() {
    const date=getCurrentDate();if(!date)return null;const data=flowData.getInOutByHour(date,'7:00-8:00');if(!data)return null;
    const dirs={};
    for(const[line,v]of Object.entries(data)){const r=v.outbound>0?v.inbound/v.outbound:(v.inbound>0?99:1);dirs[line]={cls:r>1.3?'in':r<0.77?'out':'bal',label:r>1.3?'↑ 进城':r<0.77?'↓ 出城':'↔ 均衡'};}
    return dirs;
  }

  function computeTII() {
    const date=getCurrentDate();if(!date)return null;const data=flowData.getInOutByHour(date,'7:00-8:00');if(!data)return null;
    const tiiData={};
    for(const[line,v]of Object.entries(data)){const mn=Math.max(Math.min(v.inbound,v.outbound),0.01);tiiData[line]={tii:Math.max(v.inbound,v.outbound)/mn,extreme:Math.max(v.inbound,v.outbound)/mn>3.0};}
    return tiiData;
  }

  function togglePlayback() { if(playing){stopPlayback();return;} playing=true;btnPlay.textContent='⏸';btnPlay.classList.add('playing');disableControlsDuringPlayback(true);scheduleNextStep(); }
  function stopPlayback() { playing=false;if(playTimer){clearTimeout(playTimer);playTimer=null;}if(rafId){cancelAnimationFrame(rafId);rafId=null;}btnPlay.textContent='▶';btnPlay.classList.remove('playing');disableControlsDuringPlayback(false);scheduleRankingUpdate(); }
  function disableControlsDuringPlayback(l){modeBtns.forEach(b=>b.disabled=l);dayPicker.disabled=l;}
  function scheduleNextStep(){if(!playing)return;if(seqIndex>=seqKeys.length-1){stopPlayback();return;}seqIndex++;applySeqIndex();rafId=requestAnimationFrame(()=>{rafId=null;if(!playing)return;renderCurrentFrame();updateProgressUI();playTimer=setTimeout(scheduleNextStep,parseInt(speedSel.value,10));});}
  function stepForward(){if(seqIndex>=seqKeys.length-1)return;seqIndex++;applySeqIndex();renderCurrentFrame();updateProgressUI();}
  function stepBack(){if(seqIndex<=0)return;seqIndex--;applySeqIndex();renderCurrentFrame();updateProgressUI();}

  function renderCurrentFrame() {
    const label=getLabelForIndex();const lineFlows=getFlowForIndex();if(!lineFlows){titleEl.textContent=`${label} — 无数据`;return;}
    const curRanking=computeRanking(lineFlows);const prevFlows=getPrevFlowForIndex();TooltipManager.updateData(lineFlows,curRanking,computeRanking(prevFlows));
    SvgRenderer.resetAll(svgRoot);const lineTiers=classifyFlows(lineFlows);let groupTierMap;
    if(viewActive.heatmap){SvgRenderer.renderUniform(svgRoot,'#999999');}else{const glowSvgId=findTopSvgGroup(lineFlows);groupTierMap=buildSvgGroupTierMap(lineTiers);if(glowSvgId){groupTierMap[glowSvgId]=6;for(const[n,c]of Object.entries(LINE_MAPPING)){if(c.svgId===glowSvgId)lineTiers[n]=6;}}SvgRenderer.render(svgRoot,groupTierMap);}
    const pressures=TransferStations.computePressures(lineTiers);TransferStations.renderMarkers(svgRoot,pressures);HeatmapRenderer.render(heatmapCanvas,pressures);const dirs=computeDirections();
    if(!viewActive.heatmap)FlowParticles.update(groupTierMap,dirs,lineFlows);
    titleEl.textContent=`${label} 客流量分布`;updateSceneTags();updateLegend(lineFlows,lineTiers);
    if(currentMode==='hour'){if(!tidalLine)tidalLine=Object.keys(lineFlows)[0];tidalName.textContent=tidalLine;TidalChart.render(dayPicker.value,tidalLine,DataLoader.HOUR_SLOTS,(date,slot)=>flowData.getInOutByHour(date,slot));}
    if(!playing){updateRanking(lineFlows,lineTiers,dirs,buildSparkData(getCurrentDate()),computeTII());}
    if(viewActive.sm)renderSmallMultiples();
  }

  let rankingPending=false;
  function scheduleRankingUpdate(){if(rankingPending)return;rankingPending=true;requestAnimationFrame(()=>{rankingPending=false;const lf=getFlowForIndex();if(!lf)return;const lt=classifyFlows(lf);const tid=findTopSvgGroup(lf);if(tid)for(const[n,c]of Object.entries(LINE_MAPPING)){if(c.svgId===tid)lt[n]=6;}updateRanking(lf,lt,computeDirections(),buildSparkData(getCurrentDate()),computeTII());});}
  function updateProgressUI(){const t=seqKeys.length;const pct=t>0?Math.max(0,Math.min(100,(seqIndex+1)/t*100)):0;progressLbl.textContent=t>0?`${Math.max(1,seqIndex+1)}/${t}`:'0/0';progressFill.style.width=`${pct.toFixed(1)}%`;thumb.style.left=`${pct.toFixed(1)}%`;}

  function updateVisualization(){const pv=dayPicker.value;const idx=seqKeys.indexOf(pv);if(idx>=0)seqIndex=idx;updateProgressUI();const lf=getFlowForIndex();if(!lf)return;renderCurrentFrame();}

  function renderLegend(){legendCont.innerHTML='';for(let t=6;t>=1;t--){const d=document.createElement('div');d.className='legend-item';d.innerHTML=`<span class="legend-line" style="--legend-width:${STROKE_WIDTH_MAP[t]}px;--legend-color:${TIER_COLORS[t]};"></span><span class="legend-label">${TIER_LABELS[t]}</span><span class="legend-width">${STROKE_WIDTH_MAP[t]}px</span>`;legendCont.appendChild(d);}}
  function updateLegend(lf,lt){const v=Object.values(lf).filter(x=>typeof x==='number');const s=[...v].sort((a,b)=>a-b);const[p20,p40,p60,p80]=[20,40,60,80].map(p=>percentile(s,p));const labels=[`> ${p80.toFixed(2)} 万`,`${p60.toFixed(2)} ~ ${p80.toFixed(2)} 万`,`${p40.toFixed(2)} ~ ${p60.toFixed(2)} 万`,`${p20.toFixed(2)} ~ ${p40.toFixed(2)} 万`,`≤ ${p20.toFixed(2)} 万`];legendCont.querySelectorAll('.legend-item').forEach((item,i)=>{const lbl=item.querySelector('.legend-label');const old=item.querySelector('.legend-threshold');if(old)old.remove();if(i===0)return;if(lbl){const sp=document.createElement('span');sp.className='legend-threshold';sp.textContent=labels[i-1];lbl.after(sp);}});}

  function updateRanking(lineFlows,lineTiers,dirs,sparkData,tiiData){if(!rankingCont)return;const av=Object.values(lineFlows).filter(v=>typeof v==='number');const maxF=Math.max(...av,1);const s=Object.entries(lineFlows).map(([n,f])=>({name:n,flow:f,tier:lineTiers[n],dir:dirs?dirs[n]:null,tii:tiiData?tiiData[n]:null})).sort((a,b)=>b.flow-a.flow);
  rankingCont.innerHTML=s.map((e,i)=>{const bp=(e.flow/maxF*100).toFixed(1);const tc=TIER_COLORS[e.tier];const dh=e.dir?`<span class="rank-direction ${e.dir.cls}">${e.dir.label}</span>`:'<span class="rank-direction"></span>';const sp=sparkData?'<canvas class="rank-spark" width="80" height="20"></canvas>':'<span class="rank-spark"></span>';const tiiTag=(e.tii&&e.tii.extreme)?'<span class="tag-extreme-tidal">极端潮汐</span>':'<span class="tag-extreme-tidal"></span>';return`<div class="ranking-row" data-line-name="${e.name}"><span class="rank-num">${i+1}</span><span class="rank-line-name">${e.name}</span><span class="rank-bar-wrap"><span class="rank-bar" style="width:${bp}%;background:${tc}"></span></span><span class="rank-flow">${e.flow.toFixed(2)}<span class="rank-flow-unit"> 万</span></span><span class="rank-tier-dot" style="background:${tc}"></span>${dh}${sp}${tiiTag}</div>`;}).join('');
  if(sparkData){rankingCont.querySelectorAll('.ranking-row').forEach(row=>{const ln=row.dataset.lineName;const c=row.querySelector('.rank-spark');if(!c||!sparkData[ln])return;drawSparkline(c,sparkData[ln],TIER_COLORS[lineTiers[ln]]||'#888');});}
  rankingCont.querySelectorAll('.ranking-row').forEach(row=>{row.addEventListener('click',()=>{const ln=row.dataset.lineName;if(!ln)return;tidalLine=ln;tidalName.textContent=ln;if(currentMode==='hour')TidalChart.render(dayPicker.value,tidalLine,DataLoader.HOUR_SLOTS,(d,sl)=>flowData.getInOutByHour(d,sl));});});}

  function computeRanking(lf){if(!lf)return null;const r={};Object.entries(lf).filter(([,v])=>typeof v==='number').sort((a,b)=>b[1]-a[1]).forEach(([n],i)=>{r[n]=i+1;});return r;}
  function getPrevFlowForIndex(){if(seqIndex<=0)return null;const pk=seqKeys[seqIndex-1];if(currentMode==='year')return flowData.getFlowByYear(pk);if(currentMode==='month')return flowData.getFlowByMonth(pk);if(currentMode==='day')return flowData.getFlowByDay(pk);return flowData.getFlowByHour(dayPicker.value,pk);}

  function drawSparkline(canvas,data,color){const dpr=window.devicePixelRatio||1;const W=canvas.clientWidth,H=canvas.clientHeight;canvas.width=W*dpr;canvas.height=H*dpr;const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);const pts=data.filter(p=>p!==null&&p!==undefined);if(pts.length<2)return;const max=Math.max(...pts,0.01),min=Math.min(...pts),range=max-min||1,stepX=W/(pts.length-1);ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.lineJoin='round';ctx.beginPath();for(let i=0;i<pts.length;i++){const x=i*stepX,y=H-((pts[i]-min)/range)*(H-3)-1;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();const pi=pts.indexOf(max),px=pi*stepX,py=H-((max-min)/range)*(H-3)-1;ctx.fillStyle=color;ctx.beginPath();ctx.arc(px,py,2,0,Math.PI*2);ctx.fill();}
  function buildSparkData(date){if(!date)return null;const r={};for(const slot of DataLoader.HOUR_SLOTS){const hd=flowData.getInOutByHour(date,slot);if(!hd)continue;for(const[l,v]of Object.entries(hd)){if(!r[l])r[l]=[];r[l].push(v.inbound+v.outbound);}}return r;}

  function renderSmallMultiples(){const date=getCurrentDate()||flowData.days[flowData.days.length-1];SmallMultiples.render(date,Object.keys(LINE_MAPPING).sort(),(d,slot)=>flowData.getInOutByHour(d,slot),computeTII());}
  function renderRidgeline(){const date=getCurrentDate()||flowData.days[flowData.days.length-1];RidgelinePlot.render(date,Object.keys(LINE_MAPPING).sort(),(d,slot)=>flowData.getInOutByHour(d,slot));}
})();
