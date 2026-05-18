/**
 * Main controller: 4 modes (year / month / day / hour) + playback.
 */
(async function main() {
  const yearPicker  = document.getElementById('year-picker');
  const monthPicker = document.getElementById('month-picker');
  const dayPicker   = document.getElementById('day-picker');
  const hourDisplay = document.getElementById('hour-display');
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
  const btnPlay     = document.getElementById('btn-play');
  const btnStepBack = document.getElementById('btn-step-back');
  const btnStepFwd  = document.getElementById('btn-step-fwd');
  const speedSel    = document.getElementById('speed-select');
  const progressFill= document.getElementById('progress-bar-fill');
  const progressLbl = document.getElementById('progress-label');
  const progressBg  = document.getElementById('progress-bar-bg');
  const thumb       = document.getElementById('progress-thumb');

  let currentMode = 'day';
  let flowData, svgRoot, tidalLine = null;
  let playing = false, playTimer = null, rafId = null;
  let seqIndex = 0, seqKeys = [];
  let scrubbing = false, wasPlayingBeforeScrub = false;
  const viewActive = { sm: false, ridge: false };

  const TAG_MAP = {
    day_type: { normal: '工作日', weekend: '周末', holiday: '长假/春节', return: '返程高峰', exodus: '节前离京' },
    weather: { normal: null, rain: '降雨', snow: '降雪' },
    event: { none: null }
  };

  try {
    flowData = await DataLoader.load();
  } catch (err) { loadingEl.textContent = `数据加载失败: ${err.message}`; loadingEl.classList.add('error'); console.error(err); return; }
  if (!flowData.days.length) { loadingEl.textContent = '没有可用的日期数据'; loadingEl.classList.add('error'); return; }

  yearPicker.innerHTML = flowData.years.map(y => `<option value="${y}">${y} 年</option>`).join('');
  yearPicker.value = flowData.years[flowData.years.length - 1];
  monthPicker.min = flowData.months[0]; monthPicker.max = flowData.months[flowData.months.length - 1]; monthPicker.value = flowData.months[flowData.months.length - 1];
  dayPicker.min   = flowData.days[0]; dayPicker.max   = flowData.days[flowData.days.length - 1]; dayPicker.value = flowData.days[flowData.days.length - 1];

  try {
    const resp = await fetch('Beijing_Subway_System_Map_zh.svg');
    if (!resp.ok) throw new Error(`SVG load failed: ${resp.status}`);
    svgContainer.innerHTML = await resp.text();
    svgRoot = svgContainer.querySelector('svg');
    if (!svgRoot) throw new Error('No <svg> element found');
  } catch (err) { loadingEl.textContent = `SVG 加载失败: ${err.message}`; loadingEl.classList.add('error'); console.error(err); return; }

  TransferStations.init(svgRoot);
  TooltipManager.init(svgRoot);
  BrushingLinking.init(svgRoot, rankingCont);
  TidalChart.init(document.getElementById('tidal-canvas'));
  SmallMultiples.init(document.getElementById('sm-grid'));
  RidgelinePlot.init(document.body);
  FlowParticles.init(svgRoot);

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

  yearPicker.addEventListener('change', onPickerChange);
  monthPicker.addEventListener('change', onPickerChange);
  dayPicker.addEventListener('change', onPickerChange);
  function onPickerChange() { if (playing) return; rebuildSequence(); updateVisualization(); }

  btnPlay.addEventListener('click', togglePlayback);
  btnStepBack.addEventListener('click', () => { stopPlayback(); stepBack(); });
  btnStepFwd.addEventListener('click', () => { stopPlayback(); stepForward(); });

  // View toggle buttons
  function clearViewBtns() { for (const b of [btnSM, btnRidge]) b.classList.remove('active'); }
  btnSM.addEventListener('click', () => {
    viewActive.sm = SmallMultiples.toggle();
    btnSM.classList.toggle('active', viewActive.sm);
    if (viewActive.sm) renderSmallMultiples();
  });
  btnRidge.addEventListener('click', () => { RidgelinePlot.toggle(); btnRidge.classList.toggle('active'); if (!viewActive.ridge) renderRidgeline(); });
  function getScrubFraction(e) { const r = progressBg.getBoundingClientRect(); return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); }
  function scrubTo(f) { f=Math.max(0,Math.min(1,f)); const idx=Math.round(f*Math.max(0,seqKeys.length-1)); if(idx===seqIndex)return; seqIndex=idx;applySeqIndex();renderCurrentFrame();updateProgressUI(); }
  progressBg.addEventListener('mousedown',(e)=>{scrubbing=true;wasPlayingBeforeScrub=playing;if(playing)stopPlayback();progressBg.classList.add('dragging');scrubTo(getScrubFraction(e));});
  document.addEventListener('mousemove',(e)=>{if(!scrubbing)return;scrubTo(getScrubFraction(e));});
  document.addEventListener('mouseup',()=>{if(!scrubbing)return;scrubbing=false;progressBg.classList.remove('dragging');if(wasPlayingBeforeScrub)startPlayback();});

  function switchPicker() {
    yearPicker.style.display = (currentMode==='year'||currentMode==='month')?'':'none';
    monthPicker.style.display = (currentMode==='day')?'':'none';
    dayPicker.style.display = (currentMode==='hour')?'':'none';
    hourDisplay.style.display = (currentMode==='hour')?'':'none';
    tidalSect.style.display = (currentMode==='hour')?'':'none';
  }
  function getSequence() {
    if(currentMode==='year')return flowData.years;
    if(currentMode==='month'){const y=yearPicker.value||flowData.years[flowData.years.length-1];return flowData.months.filter(m=>m.startsWith(y));}
    if(currentMode==='day'){const m=monthPicker.value;if(!m)return[];return flowData.getDaysOfMonth(m);}
    return DataLoader.HOUR_SLOTS;
  }
  function rebuildSequence() { seqKeys=getSequence(); seqIndex=currentMode==='hour'?0:Math.max(0,seqKeys.length-1); updateProgressUI(); }
  function applySeqIndex() {
    if(currentMode==='year')yearPicker.value=seqKeys[seqIndex];else if(currentMode==='month')monthPicker.value=seqKeys[seqIndex];else if(currentMode==='day')dayPicker.value=seqKeys[seqIndex];
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

  function togglePlayback() { if(playing){stopPlayback();return;} playing=true;btnPlay.textContent='⏸';btnPlay.classList.add('playing');disableControlsDuringPlayback(true);scheduleNextStep(); }
  function stopPlayback() { playing=false;if(playTimer){clearTimeout(playTimer);playTimer=null;}if(rafId){cancelAnimationFrame(rafId);rafId=null;}btnPlay.textContent='▶';btnPlay.classList.remove('playing');disableControlsDuringPlayback(false);scheduleRankingUpdate(); }
  function disableControlsDuringPlayback(l){modeBtns.forEach(b=>b.disabled=l);yearPicker.disabled=l;monthPicker.disabled=l;dayPicker.disabled=l;}
  function scheduleNextStep(){if(!playing)return;if(seqIndex>=seqKeys.length-1){stopPlayback();return;}seqIndex++;applySeqIndex();rafId=requestAnimationFrame(()=>{rafId=null;if(!playing)return;renderCurrentFrame();updateProgressUI();playTimer=setTimeout(scheduleNextStep,parseInt(speedSel.value,10));});}
  function stepForward(){if(seqIndex>=seqKeys.length-1)return;seqIndex++;applySeqIndex();renderCurrentFrame();updateProgressUI();}
  function stepBack(){if(seqIndex<=0)return;seqIndex--;applySeqIndex();renderCurrentFrame();updateProgressUI();}

  function renderCurrentFrame() {
    const label=getLabelForIndex();const lineFlows=getFlowForIndex();if(!lineFlows){titleEl.textContent=`${label} — 无数据`;return;}
    const curRanking=computeRanking(lineFlows);const prevFlows=getPrevFlowForIndex();TooltipManager.updateData(lineFlows,curRanking,computeRanking(prevFlows));
    SvgRenderer.resetAll(svgRoot);const lineTiers=classifyFlows(lineFlows);const glowSvgId=findTopSvgGroup(lineFlows);const groupTierMap=buildSvgGroupTierMap(lineTiers);if(glowSvgId)groupTierMap[glowSvgId]=6;
    SvgRenderer.render(svgRoot,groupTierMap);const dirs=computeDirections();FlowParticles.update(groupTierMap,dirs,lineFlows);
    titleEl.textContent=`${label} 客流量分布`;updateSceneTags();updateLegend(lineFlows,lineTiers);
    if(currentMode==='hour')hourDisplay.textContent=label;
    if(currentMode==='hour'){if(!tidalLine)tidalLine=Object.keys(lineFlows)[0];tidalName.textContent=tidalLine;TidalChart.render(dayPicker.value,tidalLine,DataLoader.HOUR_SLOTS,(date,slot)=>flowData.getInOutByHour(date,slot));}
    if(!playing){updateRanking(lineFlows,lineTiers,dirs,buildSparkData(getCurrentDate()));}
    if(viewActive.sm)renderSmallMultiples();
  }

  let rankingPending=false;
  function scheduleRankingUpdate(){if(rankingPending)return;rankingPending=true;requestAnimationFrame(()=>{rankingPending=false;const lf=getFlowForIndex();if(lf)updateRanking(lf,classifyFlows(lf),computeDirections(),buildSparkData(getCurrentDate()));});}
  function updateProgressUI(){const t=seqKeys.length;const pct=t>0?Math.max(0,Math.min(100,(seqIndex+1)/t*100)):0;progressLbl.textContent=t>0?`${Math.max(1,seqIndex+1)}/${t}`:'0/0';progressFill.style.width=`${pct.toFixed(1)}%`;thumb.style.left=`${pct.toFixed(1)}%`;}

  function updateVisualization(){const pv=currentMode==='year'?yearPicker.value:currentMode==='month'?monthPicker.value:currentMode==='day'?dayPicker.value:seqKeys[0];const idx=seqKeys.indexOf(pv);if(idx>=0)seqIndex=idx;updateProgressUI();const lf=getFlowForIndex();if(!lf)return;renderCurrentFrame();updateRanking(lf,classifyFlows(lf),computeDirections(),buildSparkData(getCurrentDate()));}

  function renderLegend(){legendCont.innerHTML='';for(let t=6;t>=1;t--){const d=document.createElement('div');d.className='legend-item';d.innerHTML=`<span class="legend-line" style="--legend-width:${STROKE_WIDTH_MAP[t]}px;--legend-color:${TIER_COLORS[t]};"></span><span class="legend-label">${TIER_LABELS[t]}</span><span class="legend-width">${STROKE_WIDTH_MAP[t]}px</span>`;legendCont.appendChild(d);}}
  function updateLegend(lf,lt){const v=Object.values(lf).filter(x=>typeof x==='number');const s=[...v].sort((a,b)=>a-b);const[p20,p40,p60,p80]=[20,40,60,80].map(p=>percentile(s,p));const labels=[`> ${p80.toFixed(2)} 万`,`${p60.toFixed(2)} ~ ${p80.toFixed(2)} 万`,`${p40.toFixed(2)} ~ ${p60.toFixed(2)} 万`,`${p20.toFixed(2)} ~ ${p40.toFixed(2)} 万`,`≤ ${p20.toFixed(2)} 万`];legendCont.querySelectorAll('.legend-item').forEach((item,i)=>{const lbl=item.querySelector('.legend-label');const old=item.querySelector('.legend-threshold');if(old)old.remove();if(i===0)return;if(lbl){const sp=document.createElement('span');sp.className='legend-threshold';sp.textContent=labels[i-1];lbl.after(sp);}});}

  function updateRanking(lineFlows,lineTiers,dirs,sparkData){if(!rankingCont)return;const av=Object.values(lineFlows).filter(v=>typeof v==='number');const maxF=Math.max(...av,1);const s=Object.entries(lineFlows).map(([n,f])=>({name:n,flow:f,tier:lineTiers[n],dir:dirs?dirs[n]:null})).sort((a,b)=>b.flow-a.flow);
  rankingCont.innerHTML=s.map((e,i)=>{const bp=(e.flow/maxF*100).toFixed(1);const tc=TIER_COLORS[e.tier];const dh=e.dir?`<span class="rank-direction ${e.dir.cls}">${e.dir.label}</span>`:'';const sp=sparkData?'<canvas class="rank-spark" width="80" height="20"></canvas>':'';return`<div class="ranking-row" data-line-name="${e.name}"><span class="rank-num">${i+1}</span><span class="rank-line-name">${e.name}</span><span class="rank-bar-wrap"><span class="rank-bar" style="width:${bp}%;background:${tc}"></span></span><span class="rank-flow">${e.flow.toFixed(2)}<span class="rank-flow-unit"> 万</span></span><span class="rank-tier-dot" style="background:${tc}"></span>${dh}${sp}</div>`;}).join('');
  if(sparkData){rankingCont.querySelectorAll('.ranking-row').forEach(row=>{const ln=row.dataset.lineName;const c=row.querySelector('.rank-spark');if(!c||!sparkData[ln])return;drawSparkline(c,sparkData[ln],TIER_COLORS[lineTiers[ln]]||'#888');});}
  rankingCont.querySelectorAll('.ranking-row').forEach(row=>{row.addEventListener('click',()=>{const ln=row.dataset.lineName;if(!ln)return;tidalLine=ln;tidalName.textContent=ln;if(currentMode==='hour')TidalChart.render(dayPicker.value,tidalLine,DataLoader.HOUR_SLOTS,(d,sl)=>flowData.getInOutByHour(d,sl));});});}

  function computeRanking(lf){if(!lf)return null;const r={};Object.entries(lf).filter(([,v])=>typeof v==='number').sort((a,b)=>b[1]-a[1]).forEach(([n],i)=>{r[n]=i+1;});return r;}
  function getPrevFlowForIndex(){if(seqIndex<=0)return null;const pk=seqKeys[seqIndex-1];if(currentMode==='year')return flowData.getFlowByYear(pk);if(currentMode==='month')return flowData.getFlowByMonth(pk);if(currentMode==='day')return flowData.getFlowByDay(pk);return flowData.getFlowByHour(dayPicker.value,pk);}

  function drawSparkline(canvas,data,color){const dpr=window.devicePixelRatio||1;const W=canvas.clientWidth,H=canvas.clientHeight;canvas.width=W*dpr;canvas.height=H*dpr;const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);const pts=data.filter(p=>p!==null&&p!==undefined);if(pts.length<2)return;const max=Math.max(...pts,0.01),min=Math.min(...pts),range=max-min||1,stepX=W/(pts.length-1);ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.lineJoin='round';ctx.beginPath();for(let i=0;i<pts.length;i++){const x=i*stepX,y=H-((pts[i]-min)/range)*(H-3)-1;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();const pi=pts.indexOf(max),px=pi*stepX,py=H-((max-min)/range)*(H-3)-1;ctx.fillStyle=color;ctx.beginPath();ctx.arc(px,py,2,0,Math.PI*2);ctx.fill();}
  function buildSparkData(date){if(!date)return null;const r={};for(const slot of DataLoader.HOUR_SLOTS){const hd=flowData.getInOutByHour(date,slot);if(!hd)continue;for(const[l,v]of Object.entries(hd)){if(!r[l])r[l]=[];r[l].push(v.inbound+v.outbound);}}return r;}

  function renderSmallMultiples(){const date=getCurrentDate()||flowData.days[flowData.days.length-1];SmallMultiples.render(date,Object.keys(LINE_MAPPING).sort(),(d,slot)=>flowData.getInOutByHour(d,slot));}
  function renderRidgeline(){const date=getCurrentDate()||flowData.days[flowData.days.length-1];RidgelinePlot.render(date,Object.keys(LINE_MAPPING).sort(),(d,slot)=>flowData.getInOutByHour(d,slot));}
})();
