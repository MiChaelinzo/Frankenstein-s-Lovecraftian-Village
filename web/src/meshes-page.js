import { KINDS, loadGlbBuffer, projectModel } from './glb.js';

const grid = document.getElementById('grid'), summary = document.getElementById('summary');
const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const views = [];

function draw(v, yaw) {
  const { ctx, model, w, h } = v;
  ctx.clearRect(0, 0, w, h);
  for (const t of projectModel(model, { yaw, w, h })) {
    ctx.beginPath(); ctx.moveTo(...t.pts[0]); ctx.lineTo(...t.pts[1]); ctx.lineTo(...t.pts[2]); ctx.closePath();
    ctx.fillStyle = t.fill; ctx.strokeStyle = t.fill; ctx.lineWidth = 0.6; ctx.fill(); ctx.stroke();
  }
}

async function main() {
  let ok = 0;
  for (const kind of KINDS) {
    const fig = document.createElement('figure');
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 240;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', kind + ' original mesh');
    const cap = document.createElement('figcaption');
    fig.append(canvas, cap); grid.append(fig);
    try {
      const res = await fetch('assets/meshes/' + kind + '.glb');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const model = loadGlbBuffer(await res.arrayBuffer());
      const v = { ctx: canvas.getContext('2d'), model, w: 240, h: 240 };
      views.push(v); draw(v, 0.6); ok++;
      cap.textContent = kind + ': ' + model.stats.triangles + ' triangles';
    } catch (e) { cap.textContent = kind + ': failed (' + e.message + ')'; }
  }
  summary.textContent = ok + ' of ' + KINDS.length + ' meshes loaded.';
  if (!reduce) {
    let t0 = 0;
    const tick = (t) => { if (!t0) t0 = t; for (const v of views) draw(v, 0.6 + (t - t0) / 2500); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
}
main();
