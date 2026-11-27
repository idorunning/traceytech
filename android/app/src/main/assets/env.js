/* Conductor IO: the living background, in the same spirit as traceytech.app.
   A quiet hub (Conductor) with one light per lens around it and the things each lens found around
   those, slowly turning in depth and out of focus so it never fights the words. Pulses travel from a
   lens into the hub when it has news; red means something needs you. Drawn on a 2D canvas so it is
   light on the battery: about 30 frames a second, and nothing at all while the app is hidden. */
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.getElementById('env'); if (!cv) return;
  const x = cv.getContext('2d');
  const PAPER = [239, 237, 232], COOL = [196, 212, 255], RED = [229, 50, 43];
  let W = 0, H = 0, DPR = 1;
  function size() { DPR = Math.min(devicePixelRatio || 1, 1.75); W = innerWidth; H = Math.max(innerHeight, document.documentElement.clientHeight);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  size(); addEventListener('resize', size);

  /* sprites: a sharp glowing point and an out-of-focus bokeh disc, drawn once */
  function sprite(draw, s = 128) { const c = document.createElement('canvas'); c.width = c.height = s; draw(c.getContext('2d'), s); return c; }
  const sharp = sprite((g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,253,248,1)'); r.addColorStop(.18, 'rgba(255,253,248,.75)'); r.addColorStop(.45, 'rgba(255,253,248,.12)'); r.addColorStop(1, 'rgba(255,253,248,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s); });
  const bokeh = sprite((g, s) => { const c = s / 2; const r = g.createRadialGradient(c, c, 0, c, c, c);
    r.addColorStop(0, 'rgba(255,253,248,.30)'); r.addColorStop(.72, 'rgba(255,253,248,.42)'); r.addColorStop(.86, 'rgba(255,253,248,.75)'); r.addColorStop(.93, 'rgba(255,253,248,.35)'); r.addColorStop(1, 'rgba(255,253,248,0)');
    g.fillStyle = r; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill(); });
  const ring = sprite((g, s) => { const c = s / 2; g.strokeStyle = 'rgba(255,253,248,.9)'; g.lineWidth = s * .06; g.beginPath(); g.arc(c, c, c * .78, 0, 7); g.stroke(); });
  const redGlow = sprite((g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,90,80,1)'); r.addColorStop(.3, 'rgba(229,50,43,.5)'); r.addColorStop(1, 'rgba(229,50,43,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });
  const halo = sprite((g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,253,248,.85)'); r.addColorStop(.2, 'rgba(255,253,248,.22)'); r.addColorStop(1, 'rgba(255,253,248,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }, 256);

  /* the graph */
  const flows = [];
  let nodes = [], edges = [];
  const fib = (i, n, r) => { const y = 1 - (i + .5) / n * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996; return [Math.cos(a) * rr * r, y * r * .8, Math.sin(a) * rr * r]; };
  let seedN = 1; const rnd = () => { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; };
  function setGraph(sources) {
    seedN = 7; flows.length = 0; nodes = [{ id: 'hub', kind: 'hub', p: [0, 0, 0], s: 1.25, a: 1, seed: 0 }]; edges = [];
    const n = Math.max(1, sources.length);
    sources.forEach((src, i) => {
      const p = fib(i, n, 4.4); const si = nodes.length;
      nodes.push({ id: src.id, kind: 'source', p, s: .5, a: .95, seed: rnd() * 6.28, crit: !!src.crit });
      edges.push([0, si, src.crit ? .42 : .26]);
      const k = Math.min(9, src.n || 0);
      for (let j = 0; j < k; j++) { const q = [p[0] + (rnd() - .5) * 2.4, p[1] + (rnd() - .5) * 2.4, p[2] + (rnd() - .5) * 2.4];
        const ii = nodes.length; nodes.push({ id: src.id + ':' + j, kind: 'item', p: q, s: .24, a: .85, seed: rnd() * 6.28, crit: !!src.crit && j === 0, src: si });
        edges.push([si, ii, src.crit && j === 0 ? .4 : .16]); }
      if (i > 0 && rnd() > .45) edges.push([si - 1 - Math.min(9, sources[i - 1].n || 0), si, .07]);
    });
    for (let i = 0; i < (W < 700 ? 150 : 240); i++) { const r = 9 + rnd() * 26, th = rnd() * 6.283, ph = Math.acos(2 * rnd() - 1);
      nodes.push({ id: 'd' + i, kind: 'dust', p: [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * .6, r * Math.sin(ph) * Math.sin(th)], s: .05 + rnd() * .12, a: .08 + rnd() * .16, seed: rnd() * 6.28 }); }
  }
  setGraph([]);

  /* pulses: news travelling from a lens into the hub */
  function pulse(id, crit) { const si = nodes.findIndex(n => n.id === id); if (si < 0) return;
    const kids = nodes.filter(n => n.src === si); const from = kids.length ? kids[Math.floor(Math.random() * kids.length)] : null;
    flows.push({ path: [from, nodes[si], nodes[0]].filter(Boolean), t: 0, dur: 1.6 + (from ? .9 : .6), crit: !!crit }); }

  const env = { scroll: 0, think: 0, thinkGoal: 0, look: null, tx: .5, ty: .5, mx: .5, my: .5, rip: 0, crit: false, setGraph, pulse };
  window.Env = env;
  addEventListener('deviceorientation', e => { if (e.gamma == null) return; env.tx = .5 + Math.max(-1, Math.min(1, e.gamma / 35)) * .5; env.ty = .5 + Math.max(-1, Math.min(1, (e.beta - 45) / 35)) * .5; }, { passive: true });
  addEventListener('scroll', () => { env.scroll = Math.min(1.4, scrollY / Math.max(1, innerHeight)); }, { passive: true });

  let t = 0, last = performance.now(), rotY = 0, acc = 0, idle = 0;
  const tmp = [0, 0, 0];
  function drift(n, o) { o[0] = n.p[0] + .09 * Math.sin(t * .31 + n.seed * 6); o[1] = n.p[1] + .09 * Math.sin(t * .27 + n.seed * 4); o[2] = n.p[2] + .09 * Math.cos(t * .23 + n.seed * 5); return o; }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now; acc += dt;
    if (document.hidden || acc < 1 / 30) return; const step = acc; acc = 0; if (!reduce) t += step;
    env.mx += (env.tx - env.mx) * .05; env.my += (env.ty - env.my) * .05; env.think += (env.thinkGoal - env.think) * .05; env.rip *= Math.pow(.3, step);
    const sc = env.scroll, portrait = W < H;
    rotY += step * (.035 + env.think * .05);
    const ry = rotY + (env.mx - .5) * .4, rx = .12 + (env.my - .5) * .15;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    const camZ = (portrait ? 19 : 15.5) + sc * 3, f = (H * .5) / Math.tan((portrait ? 50 : 38) * Math.PI / 360);
    const ox = W * .5 + (env.mx - .5) * 24, oy = H * (portrait ? .30 : .42) - sc * H * .28;
    const focal = camZ * .55, ap = .4 + sc * .12, dim = (1 - sc * .35);
    x.setTransform(DPR, 0, 0, DPR, 0, 0); x.globalCompositeOperation = 'source-over'; x.fillStyle = '#09090a'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    // project every node once
    const P = nodes.map(n => { drift(n, tmp); let X = tmp[0], Y = tmp[1], Z = tmp[2];
      if (n.kind === 'dust') { const a = t * .01, c = Math.cos(a), s = Math.sin(a); const X2 = X * c - Z * s; Z = X * s + Z * c; X = X2; }
      else { const X2 = X * cy - Z * sy, Z2 = X * sy + Z * cy; X = X2; Z = Z2; const Y2 = Y * cx - Z * sx, Z3 = Y * sx + Z * cx; Y = Y2; Z = Z3; }
      const d = camZ - Z; const k = f / d; return { x: ox + X * k, y: oy - Y * k, d, k, coc: Math.min(Math.abs(d - focal) * ap, 3.5) }; });
    // hub halo
    const hb = P[0]; const br = (1 + Math.sin(t * .9) * .05 + env.rip * .25 + env.think * .2) * hb.k * 5;
    x.globalAlpha = (.16 + env.think * .1 + env.rip * .12) * (1 - sc * .4); x.drawImage(halo, hb.x - br / 2, hb.y - br / 2, br, br);
    if (env.crit) { const r2 = hb.k * 4.2; x.globalAlpha = .07 + .06 * Math.sin(t * 2.4); x.drawImage(redGlow, hb.x - r2 / 2, hb.y - r2 / 2, r2, r2); }
    // links
    x.lineWidth = 1;
    for (const [i, j, al] of edges) { const a = P[i], b = P[j]; const coc = (a.coc + b.coc) / 2; const hot = env.look && (nodes[i].id === env.look || nodes[j].id === env.look);
      const crit = nodes[i].crit || nodes[j].crit; const c = crit ? RED : PAPER;
      x.globalAlpha = Math.min(1, al * (hot ? 2.4 : 1) * dim / (1 + coc * 1.1)); x.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }
    // nodes
    for (let i = 0; i < nodes.length; i++) { const n = nodes[i], p = P[i]; if (p.d <= .5) continue;
      const hot = env.look && (n.id === env.look || (n.src != null && nodes[n.src].id === env.look)) ? 1.6 : 1;
      const px = Math.max(.75, Math.min(60, n.s * 170 / p.d * (1 + p.coc * .9) * (H / 900)));
      const alpha = n.a * dim * hot / (1 + p.coc * p.coc * .45);
      const blur = Math.min(1, p.coc * .8);
      if (n.crit) { x.globalAlpha = Math.min(1, alpha * 1.2); x.drawImage(redGlow, p.x - px, p.y - px, px * 2, px * 2); continue; }
      if (blur < 1) { x.globalAlpha = alpha * (1 - blur); x.drawImage(sharp, p.x - px, p.y - px, px * 2, px * 2); }
      if (blur > 0) { x.globalAlpha = alpha * blur * .9; x.drawImage(n.kind === 'source' && i % 3 === 0 ? ring : bokeh, p.x - px, p.y - px, px * 2, px * 2); } }
    // pulses
    for (let fi = flows.length - 1; fi >= 0; fi--) { const fl = flows[fi]; fl.t += step / fl.dur;
      const pts = fl.path.map(n => P[nodes.indexOf(n)]); const L = pts.length - 1; if (L < 1 || pts.some(q => !q)) { flows.splice(fi, 1); continue; }
      for (let j = 0; j < 7; j++) { const u = fl.t - j * .03; if (u <= 0 || u >= 1) continue; const ff = Math.min(L - 1e-4, u * L), k = Math.floor(ff), e = ff - k;
        const X = pts[k].x + (pts[k + 1].x - pts[k].x) * e, Y = pts[k].y + (pts[k + 1].y - pts[k].y) * e; const s = (j ? 5 : 9) * (1 - j / 9);
        x.globalAlpha = (1 - j / 8) * .95; x.drawImage(fl.crit ? redGlow : sharp, X - s, Y - s, s * 2, s * 2); }
      if (fl.t >= 1 + .25) { flows.splice(fi, 1); env.rip = Math.min(1, env.rip + .5); } }
    // quiet life: now and then a lens sends news to the hub
    idle -= step * (1 + env.think * 2);
    if (idle <= 0 && !reduce) { const src = nodes.filter(n => n.kind === 'source'); if (src.length) { const s = src[Math.floor(Math.random() * src.length)]; pulse(s.id, s.crit && Math.random() < .5); } idle = 1.8 + Math.random() * 1.8; }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }
  requestAnimationFrame(frame);
})();
