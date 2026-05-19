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

  let stationData = [];   // [{cx, cy, dataLines: [...]}, ...]
  let markerGroup = null;

  function buildSvgToDataMap() {
    const map = {};
    for (const [dataLine, cfg] of Object.entries(LINE_MAPPING)) {
      if (!map[cfg.svgId]) map[cfg.svgId] = [];
      map[cfg.svgId].push(dataLine);
    }
    return map;
  }

  function init(svgRoot) {
    const svgToData = buildSvgToDataMap();

    // Line-group circles (r=4)
    const lineCirclesByGroup = {};
    const processedSvgIds = new Set();
    for (const cfg of Object.values(LINE_MAPPING)) {
      if (processedSvgIds.has(cfg.svgId)) continue;
      processedSvgIds.add(cfg.svgId);
      const group = svgRoot.querySelector('[id="' + cfg.svgId + '"]');
      if (!group) continue;
      const circles = group.querySelectorAll('circle[r="4"]');
      lineCirclesByGroup[cfg.svgId] = Array.from(circles).map(c => ({
        cx: parseFloat(c.getAttribute('cx')),
        cy: parseFloat(c.getAttribute('cy'))
      }));
    }

    // Transfer circles (r=5) from 换乘站
    const transferGroup = svgRoot.querySelector('[id="换乘站"]');
    if (!transferGroup) { console.warn('Transfer group not found'); return; }
    const transferCircles = transferGroup.querySelectorAll('circle[r="5"]');

    const THRESHOLD = 60;
    stationData = [];

    for (const tc of transferCircles) {
      const tcx = parseFloat(tc.getAttribute('cx'));
      const tcy = parseFloat(tc.getAttribute('cy'));

      const matchedDataLines = new Set();
      for (const [svgId, circles] of Object.entries(lineCirclesByGroup)) {
        let minDist = Infinity;
        for (const c of circles) {
          const dx = c.cx - tcx, dy = c.cy - tcy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) minDist = dist;
        }
        if (minDist < THRESHOLD) {
          const aliases = svgToData[svgId];
          if (aliases) aliases.forEach(dl => matchedDataLines.add(dl));
        }
      }

      if (matchedDataLines.size >= 2) {
        stationData.push({
          cx: tcx,
          cy: tcy,
          dataLines: [...matchedDataLines]
        });
      }
    }
  }

  function computePressures(lineTiers) {
    return stationData.map(st => {
      let pressure = 0;
      for (const dl of st.dataLines) {
        pressure += lineTiers[dl] || 1;
      }
      return {
        cx: st.cx,
        cy: st.cy,
        dataLines: st.dataLines,
        pressure,
        isHighRisk: pressure >= 12
      };
    });
  }

  function renderMarkers(svgRoot, pressures) {
    if (markerGroup) markerGroup.remove();

    markerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    markerGroup.setAttribute('id', 'pressure-markers');
    svgRoot.appendChild(markerGroup);

    for (const p of pressures) {
      if (p.pressure < 8) continue;
      let color, radius;
      if (p.pressure >= 12)       { color = '#ff4444'; radius = 12; }
      else                        { color = '#fde725'; radius = 10; }

      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', p.cx);
      ring.setAttribute('cy', p.cy);
      ring.setAttribute('r', radius);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', color);
      ring.setAttribute('stroke-width', '4');
      ring.setAttribute('class', 'pressure-marker');
      if (p.isHighRisk) ring.classList.add('pressure-high-risk');
      markerGroup.appendChild(ring);

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', p.cx);
      dot.setAttribute('cy', p.cy);
      dot.setAttribute('r', '4');
      dot.setAttribute('fill', color);
      dot.setAttribute('class', 'pressure-pulse');
      markerGroup.appendChild(dot);
    }
  }

  return { getLineAdjacency, init, computePressures, renderMarkers };
})();
