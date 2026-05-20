/**
 * Transfer station data — line adjacency for network cascading hover
 * + station pressure warning (Module 2).
 */

const LINE_ALIAS = {
  '1号线':'1号线-八通线','八通线':'1号线-八通线',
  '2号线':'2号线','3号线':'3号线',
  '4号线':'4号线-大兴线','大兴线':'4号线-大兴线',
  '5号线':'5号线','6号线':'6号线','7号线':'7号线',
  '8号线':'8号线','9号线':'9号线','10号线':'10号线',
  '11号线':'11号线','12号线':'12号线','13号线':'13号线',
  '14号线':'14号线','15号线':'15号线','16号线':'16号线',
  '17号线':'17号线','18号线':'18号线','19号线':'19号线',
  '房山线':'房山线','昌平线':'昌平线','亦庄线':'亦庄线',
  '燕房线':'燕房线','S1线':'S1线','西郊线':'西郊线',
  '首都机场线':'首都机场线','大兴机场线':'大兴机场线',
};

const TRANSFER_STATIONS = [
  ['1号线','2号线'],['1号线','4号线'],['1号线','5号线'],['1号线','8号线'],
  ['1号线','9号线'],['1号线','10号线'],['1号线','14号线'],['1号线','16号线'],
  ['1号线','17号线'],['1号线','6号线','S1线'],
  ['八通线','7号线'],
  ['2号线','3号线'],['2号线','4号线'],['2号线','5号线'],['2号线','6号线'],
  ['2号线','8号线'],['2号线','13号线'],['2号线','19号线'],
  ['2号线','13号线','首都机场线'],
  ['3号线','14号线'],['3号线','17号线'],
  ['4号线','6号线','19号线'],['4号线','7号线'],['4号线','9号线','16号线'],
  ['4号线','10号线'],['4号线','12号线'],['4号线','14号线'],['4号线','16号线'],
  ['4号线','19号线'],
  ['5号线','6号线'],['5号线','7号线'],['5号线','10号线'],['5号线','10号线','亦庄线'],
  ['5号线','12号线'],['5号线','13号线'],['5号线','14号线'],['5号线','15号线'],
  ['5号线','18号线'],['5号线','首都机场线'],
  ['6号线','8号线'],['6号线','9号线'],['6号线','10号线'],['6号线','11号线','S1线'],
  ['6号线','14号线'],['6号线','16号线'],['6号线','17号线'],
  ['7号线','8号线'],['7号线','9号线'],['7号线','10号线'],['7号线','14号线'],
  ['7号线','16号线'],['7号线','17号线'],
  ['8号线','10号线'],['8号线','12号线'],['8号线','13号线'],['8号线','14号线'],
  ['8号线','15号线'],['8号线','18号线'],['8号线','昌平线'],
  ['9号线','10号线'],['9号线','14号线'],['9号线','16号线'],['9号线','房山线'],
  ['10号线','12号线','首都机场线'],['10号线','13号线'],['10号线','14号线','17号线'],
  ['10号线','16号线'],['10号线','17号线'],['10号线','19号线'],['10号线','昌平线'],
  ['10号线','西郊线'],['10号线','房山线'],['10号线','19号线','大兴机场线'],
  ['12号线','13号线'],['12号线','14号线'],['12号线','16号线'],['12号线','17号线'],
  ['12号线','19号线'],['12号线','昌平线'],
  ['13号线','15号线','17号线'],['13号线','昌平线'],
  ['14号线','15号线'],['14号线','16号线'],['14号线','19号线'],
  ['15号线','昌平线'],
  ['16号线','18号线'],['16号线','房山线'],
  ['17号线','18号线'],['17号线','亦庄线'],
  ['房山线','燕房线'],
];

const TransferStations = (() => {
  function dataLine(alias) { return LINE_ALIAS[alias] || alias; }

  function getLineAdjacency() {
    const adj = new Map();
    for (const st of TRANSFER_STATIONS) {
      const dl = st.map(dataLine);
      for (const a of dl) {
        if (!adj.has(a)) adj.set(a, new Set());
        for (const b of dl) {
          if (a !== b) adj.get(a).add(b);
        }
      }
    }
    return adj;
  }

  // ---- Station pressure (Module 2) ----

  let stationData = [];   // [{name, cx, cy, lines: [...]}, ...]
  let markerGroup = null;

  async function init(svgRoot) {
    try {
      const resp = await fetch('data/transfer_stations_positions.json');
      if (!resp.ok) throw new Error('Failed to load transfer stations: ' + resp.status);
      const raw = await resp.json();

      // Deduplicate by name + rounded position
      const seen = new Set();
      stationData = [];
      for (const st of raw) {
        if (!st.lines || st.lines.length < 2) continue;
        const key = st.name + '|' + Math.round(st.cx) + ',' + Math.round(st.cy);
        if (seen.has(key)) continue;
        seen.add(key);
        stationData.push({
          name: st.name,
          cx: st.cx,
          cy: st.cy,
          lines: [...st.lines]
        });
      }
      console.log('Transfer stations loaded:', stationData.length);
    } catch (e) {
      console.error('TransferStations init failed:', e);
      stationData = [];
    }
  }

  function computePressures(lineTiers) {
    return stationData.map(st => {
      let sum = 0;
      for (const l of st.lines) {
        sum += lineTiers[dataLine(l)] || 1;
      }
      const avgTier = sum / st.lines.length;
      return {
        name: st.name,
        cx: st.cx,
        cy: st.cy,
        lines: st.lines,
        pressure: avgTier,
        isHighRisk: avgTier >= 5
      };
    });
  }

  let pTooltip = null;
  function ensurePTooltip() {
    if (pTooltip) return;
    pTooltip = document.createElement('div');
    pTooltip.className = 'pressure-tooltip';
    document.body.appendChild(pTooltip);
  }

  function pressureLabel(avg) {
    if (avg >= 5) return '高压站点';
    if (avg >= 4) return '拥堵站点';
    return '通畅站点';
  }

  function renderMarkers(svgRoot, pressures) {
    if (markerGroup) markerGroup.remove();
    ensurePTooltip();

    markerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    markerGroup.setAttribute('id', 'pressure-markers');
    svgRoot.appendChild(markerGroup);

    for (const p of pressures) {
      let color, radius, strokeW, hasPulse;
      if (p.pressure >= 5) {
        color = '#ff0000'; radius = 20; strokeW = 5; hasPulse = true;   // pure red
      } else if (p.pressure >= 4) {
        color = '#fde725'; radius = 10; strokeW = 4; hasPulse = true;   // yellow
      } else {
        color = '#047857'; radius = 8;  strokeW = 3; hasPulse = false;  // green
      }

      const plabel = pressureLabel(p.pressure);
      const tipHtml = '<div class="pt-row"><b>' + p.name + '</b></div><div class="pt-row pt-' + (p.pressure >= 5 ? 'red' : p.pressure >= 4 ? 'yel' : 'grn') + '">' + plabel + '</div>';

      // black outer border (slightly thinner for low-pressure stations)
      const borderGap = p.pressure < 4 ? 3 : 4;
      const borderWidth = p.pressure < 4 ? '2' : '3';
      const outerHalf = radius + borderGap;
      const outerPoints = `${p.cx},${p.cy - outerHalf} ${p.cx + outerHalf},${p.cy} ${p.cx},${p.cy + outerHalf} ${p.cx - outerHalf},${p.cy}`;
      const border = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      border.setAttribute('points', outerPoints);
      border.setAttribute('fill', '#000000');
      border.setAttribute('stroke', '#000000');
      border.setAttribute('stroke-width', borderWidth);
      border.setAttribute('pointer-events', 'none');
      markerGroup.appendChild(border);

      const half = radius;
      const points = `${p.cx},${p.cy - half} ${p.cx + half},${p.cy} ${p.cx},${p.cy + half} ${p.cx - half},${p.cy}`;
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      ring.setAttribute('points', points);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', color);
      ring.setAttribute('stroke-width', strokeW);
      ring.setAttribute('class', 'pressure-marker');
      if (p.pressure >= 5) ring.classList.add('pressure-high-risk');
      else if (p.pressure < 4) ring.classList.add('pressure-marker-low');
      ring.addEventListener('mouseover', (e) => { pTooltip.innerHTML = tipHtml; pTooltip.style.display = 'block'; });
      ring.addEventListener('mousemove', (e) => { pTooltip.style.left = (e.clientX + 12) + 'px'; pTooltip.style.top = (e.clientY + 12) + 'px'; });
      ring.addEventListener('mouseout', () => { pTooltip.style.display = 'none'; });
      markerGroup.appendChild(ring);

      if (hasPulse) {
        const innerHalf = p.pressure >= 5 ? 6 : 4;
        const innerPoints = `${p.cx},${p.cy - innerHalf} ${p.cx + innerHalf},${p.cy} ${p.cx},${p.cy + innerHalf} ${p.cx - innerHalf},${p.cy}`;
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        dot.setAttribute('points', innerPoints);
        dot.setAttribute('fill', color);
        dot.setAttribute('class', 'pressure-pulse' + (p.pressure >= 5 ? ' pressure-pulse-high' : ''));
        dot.style.transformOrigin = `${p.cx}px ${p.cy}px`;
        dot.addEventListener('mouseover', (e) => { pTooltip.innerHTML = tipHtml; pTooltip.style.display = 'block'; });
        dot.addEventListener('mousemove', (e) => { pTooltip.style.left = (e.clientX + 12) + 'px'; pTooltip.style.top = (e.clientY + 12) + 'px'; });
        dot.addEventListener('mouseout', () => { pTooltip.style.display = 'none'; });
        markerGroup.appendChild(dot);
      }
    }
  }

  return { getLineAdjacency, init, computePressures, renderMarkers };
})();
