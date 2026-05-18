/**
 * 7×4 Small Multiples grid — mini tidal charts for all 28 lines.
 */
const SmallMultiples = (() => {
  let container = null;
  let visible = false;

  function init(el) {
    container = el;
    visible = false;
  }

  function toggle() {
    visible = !visible;
    container.style.display = visible ? 'grid' : 'none';
    return visible;
  }

  function show()  { visible = true;  container.style.display = 'grid'; }
  function hide()  { visible = false; container.style.display = 'none'; }

  function render(date, lineNames, getInOutFn, tiiData) {
    if (!date || !lineNames.length) return;
    if (container.style.display === 'none') return;
    container.innerHTML = '';

    for (const ln of lineNames) {
      const wrapper = document.createElement('div');
      wrapper.className = 'sm-cell';
      if (tiiData && tiiData[ln] && tiiData[ln].extreme) wrapper.classList.add('sm-extreme');

      const label = document.createElement('span');
      label.className = 'sm-label';
      label.textContent = ln.replace('号线-八通线','号线').replace('号线-大兴线','号线');
      wrapper.appendChild(label);

      const canvas = document.createElement('canvas');
      canvas.width = 130; canvas.height = 60;
      canvas.className = 'sm-canvas';
      wrapper.appendChild(canvas);

      const pts = [];
      for (const slot of DataLoader.HOUR_SLOTS) {
        const data = getInOutFn(date, slot);
        pts.push(data && data[ln] ? { in: data[ln].inbound, out: data[ln].outbound } : null);
      }

      const dpr = window.devicePixelRatio || 1;
      const W = 130, H = 60;
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      let yMax = 0;
      for (const p of pts) { if (p) yMax = Math.max(yMax, p.in, p.out); }
      yMax = Math.ceil(yMax * 1.2 * 10) / 10 || 1;

      const stepX = W / (pts.length - 1);
      const yTo = (v) => H - (v / yMax) * (H - 6) - 3;

      ['in', 'out'].forEach((key, ki) => {
        const color = ki === 0 ? '#3498db' : '#e67e22';
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < pts.length; i++) {
          if (!pts[i]) continue;
          const x = i * stepX, y = yTo(pts[i][key]);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      container.appendChild(wrapper);
    }
  }

  return { init, render, toggle, show, hide };
})();
