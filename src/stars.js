let skyRun = 0;
function starShow(level) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#sky'), ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight, run = ++skyRun;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); cv.hidden = false;
  const n = level === 1 ? 1 : level === 2 ? 14 : 42, total = level === 1 ? 1900 : level === 2 ? 4200 : 7500, veilMax = level === 1 ? .3 : .72;
  const R = Math.random, dx = -.64, dy = .77;
  const stars = Array.from({ length: n }, () => ({ t0: level === 1 ? 150 : R() * (total - 1900), x: W * (.25 + R() * 1.05), y: -30 + R() * H * .35, v: .55 + R() * .5, len: 90 + R() * 140, life: 1100 + R() * 600, w: 1.4 + R() * 1.6 }));
  const dots = Array.from({ length: level === 1 ? 0 : level === 2 ? 30 : 70 }, () => ({ x: R() * W, y: R() * H * .8, r: 1 + R() * 2.2, ph: R() * 6.3, sp: .002 + R() * .004 }));
  const start = performance.now();
  (function frame(now) {
    if (run !== skyRun) return;
    const t = now - start; ctx.clearRect(0, 0, W, H);
    if (t > total) { cv.hidden = true; return; }
    const veil = Math.min(1, t / 500, (total - t) / 700);
    ctx.fillStyle = 'rgba(7,16,30,' + (veilMax * veil).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
    dots.forEach(d => { const a = veil * (.35 + .65 * Math.abs(Math.sin(d.ph + t * d.sp))); ctx.strokeStyle = 'rgba(255,240,200,' + a.toFixed(3) + ')'; ctx.lineWidth = 1; const r = d.r * 2.4;
      ctx.beginPath(); ctx.moveTo(d.x - r, d.y); ctx.lineTo(d.x + r, d.y); ctx.moveTo(d.x, d.y - r); ctx.lineTo(d.x, d.y + r); ctx.stroke();
      ctx.fillStyle = 'rgba(255,248,225,' + a.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * .6, 0, 6.3); ctx.fill(); });
    stars.forEach(s => { const age = t - s.t0; if (age < 0 || age > s.life) return;
      const a = Math.sin(Math.PI * age / s.life), hx = s.x + dx * s.v * age, hy = s.y + dy * s.v * age, tx = hx - dx * s.len, ty = hy - dy * s.len;
      const g = ctx.createLinearGradient(hx, hy, tx, ty); g.addColorStop(0, 'rgba(255,244,210,' + a.toFixed(3) + ')'); g.addColorStop(.3, 'rgba(255,214,120,' + (a * .7).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.strokeStyle = g; ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(hx, hy, s.w * 1.3, 0, 6.3); ctx.fill(); });
    requestAnimationFrame(frame);
  })(start);
}
