// Cloud lab for kids: a side view of a mountain, the wind, and the clouds that form.
// The rules are the same as the big model, simplified: a stable layer bounces air over the mountain
// into a standing wave (wavelength 2πU/N), air that is lifted further than it needs to reach the dew
// point becomes cloud, and air that is not "springy" rises in warm bubbles instead (heap clouds).
import { createScene, drawLens, drawPuffs, drawRotorArrow } from './kidsdraw.js';
const $ = (id) => document.getElementById(id);
const cv = $('sky'), cx = cv.getContext('2d');
const X0 = -25, X1 = 55, ZT = 9;                     // world: km along the wind, km height
const P = {};
for (const k of ['wind', 'hill', 'spring', 'up', 'low']) P[k] = +$(k).value;
P.jet = false;

// ---------------- physics, simplified
const A = 4;                                         // hill half-width, km
const ground = (x) => P.hill * A * A / (x * x + A * A);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// humidity peaks in the middle of each moist layer, so a lifted layer condenses thick in the middle
// and thin at the ends: the lens shape. A dry gap between the two layers gives two plates.
function rhAt(z0) {
  if (z0 >= 0.8 && z0 < 1.8) return P.low - 10 * ((z0 - 1.3) / 0.5) ** 2;
  if (z0 >= 3.3 && z0 < 3.7) return P.up - 12 * ((z0 - 3.5) / 0.2) ** 2;
  if (z0 >= 3.9 && z0 < 4.2) return P.up - 4 - 12 * ((z0 - 4.05) / 0.15) ** 2;
  if (z0 >= 4.4 && z0 < 4.65) return P.up - 8 - 12 * ((z0 - 4.52) / 0.12) ** 2;
  return 25;
}
const needKm = (z0) => Math.max(0, 100 - rhAt(z0)) * 0.022;   // lift needed to reach the dew point
function wave() {
  const U = P.wind, N = 0.011 * P.spring;
  const waveOn = U > 0.8 && P.spring > 0.15 ? smooth(0.15, 0.4, P.spring) : 0;
  const Fr = N > 0 ? U / (N * P.hill * 1000) : 9;
  const heff = P.hill * Math.min(1, Math.max(0.35, 0.35 + 0.8 * Fr)) * waveOn;
  const lam = N > 0 ? Math.max(2.5, (2 * Math.PI * U) / N / 1000) : 20;
  return { U, N, heff, lam, k: (2 * Math.PI) / lam, Ld: P.jet ? 70 : Math.max(4, lam * 0.8), Fr };
}
function eta(x, z0, W) {
  if (!W.heff) return 0;
  // streamlines near the ground follow the mountain; aloft the lift is about a quarter of its height
  const dz = 0.2 + 0.8 * Math.exp(-z0 / 1.2);
  let lee = 0;
  if (x > 0) {
    const env = P.jet ? Math.pow(Math.sin(Math.PI * Math.min(z0, 9) / 9), 0.6) : 1;
    const phi = P.jet ? 0 : z0 * 0.25;
    lee = (P.jet ? 1.1 : 0.8) * env * Math.sin(W.k * x - phi) * Math.exp(-x / W.Ld) * smooth(0, W.lam * 0.5, x);
  }
  return W.heff * dz * (A * A / (x * x + A * A) + lee);
}

// ---------------- the cloud field, rebuilt when a control moves
const NX = 240, NZ = 120;
let cells = [], found = {}, W = wave();
const conv = () => P.spring < 0.35 && P.wind < 18;
const HOT = [-18, -9, 8, 17, 27, 38, 47];
function build() {
  W = wave(); cells = []; const lensX = [];
  for (let i = 0; i < NX; i++) {
    const x = X0 + (i + 0.5) * (X1 - X0) / NX;
    for (let j = 0; j < NZ; j++) {
      const z0 = (j + 0.5) * ZT / NZ; if (rhAt(z0) < 40) continue;
      const e = eta(x, z0, W), need = needKm(z0);
      if (e <= need) continue;
      const z = z0 + e; if (z < ground(x) + 0.05 || z > ZT) continue;
      const d = Math.min(1, (e - need) / Math.max(0.12, need + 0.1));
      cells.push({ x, z, d, kind: z0 < 2 ? 'cap' : 'lens', plate: z0 < 3.8 ? 'L' : z0 < 4.3 ? 'M' : 'U' });
      if (z0 >= 3.3 && z0 < 3.7 && x > -6) lensX.push(x);
    }
  }
  // heap clouds: warm bubbles rise from the ground when the air is not springy
  if (conv() && P.low > 45) {
    const base = 0.6 + (100 - P.low) * 0.022, top = Math.min(8.5, 1.8 + (0.35 - P.spring) * 22);
    for (const h of [-14, 9, 25, 41]) for (let z = base; z < top; z += 0.18) {
      const w = 0.9 + 0.6 * Math.sin((z - base) * 1.7 + h) + (z - base) * 0.12;
      for (let dx = -w; dx <= w; dx += 0.35) cells.push({ x: h + dx + 0.4 * Math.sin(z * 2 + h), z, d: 0.85, kind: 'heap' });
    }
  }
  // rotor: strong wind and a strong spring roll the air under the first crest
  const rotor = P.wind > 13 && P.spring > 0.7 && P.low > 55 && W.heff > 0.5;
  if (rotor) { const xr = W.lam * 0.75; for (let k = 0; k < 40; k++) cells.push({ x: xr + Math.sin(k * 2.3) * 1.4, z: P.hill * 0.55 + Math.cos(k * 1.7) * 0.35, d: 0.6, kind: 'rotor' }); }
  // what did we make?
  lensX.sort((a, b) => a - b); let lenses = 0, last = -1e9;
  for (const x of lensX) { if (x - last > 1.6) lenses++; last = x; }
  found = {
    lens: lenses >= 1, train: lenses >= 3, cap: cells.some((c) => c.kind === 'cap' && Math.abs(c.x) < 7),
    heap: cells.some((c) => c.kind === 'heap'), rotor, clear: cells.length === 0, lenses,
  };
  makeObjects(rotor); report();
}

// ---------------- drawing: illustrated cloud objects that grow, shrink and drift smoothly
let Wpx = 0, Hpx = 0, dpr = 1;
const sx = (x) => ((x - X0) / (X1 - X0)) * Wpx, sz = (z) => Hpx - (z / ZT) * Hpx;
const scene = createScene();
function resize() {
  dpr = Math.min(2, devicePixelRatio || 1); const r = cv.getBoundingClientRect();
  Wpx = Math.round(r.width * dpr); Hpx = Math.round(r.height * dpr); cv.width = Wpx; cv.height = Hpx;
}
function groups(list, gap) {
  const out = []; list.sort((p, q) => p.x - q.x);
  for (const c of list) { const g = out[out.length - 1]; if (g && c.x - g.x1 < gap) { g.x1 = c.x; g.cs.push(c); } else out.push({ x0: c.x, x1: c.x, cs: [c] }); }
  return out;
}
function makeObjects(rotor) {
  const T = [];
  for (const [plate, scale] of [['L', 1], ['M', 0.74], ['U', 0.5]]) {
    for (const g of groups(cells.filter((c) => c.kind === 'lens' && c.plate === plate), 0.8)) {
      if (g.x1 - g.x0 < 0.2) continue;
      const zs = g.cs.map((c) => c.z), zc = zs.reduce((a, b) => a + b, 0) / zs.length;
      T.push({ id: `lens-${plate}-${Math.round((g.x0 + g.x1) / 4)}`, kind: 'lens', x0: g.x0 - 0.3, x1: g.x1 + 0.3, zc, scale, th: Math.max(0.12, Math.max(...zs) - Math.min(...zs) + 0.1) });
    }
  }
  const lows = T.filter((o) => o.kind === 'lens' && o.id.startsWith('lens-L'));
  for (const o of T) {
    if (o.kind !== 'lens' || o.id.startsWith('lens-L')) continue;
    const m = (o.x0 + o.x1) / 2, base = lows.find((l) => m > l.x0 - 2 && m < l.x1 + 2);
    if (base) { const bm = (base.x0 + base.x1) / 2, w = (o.x1 - o.x0) / 2; o.x0 = bm - w; o.x1 = bm + w; o.zc = base.zc + (o.id.startsWith('lens-M') ? 0.3 : 0.55); }
  }
  for (const g of groups(cells.filter((c) => c.kind === 'cap'), 1.2)) {
    const puffs = []; const top = Math.max(...g.cs.map((c) => c.z));
    for (let x = g.x0; x <= g.x1 + 1e-6; x += 0.55) puffs.push({ x, z: Math.max(ground(x) + 0.15, top - 0.25 - 0.15 * Math.cos(x * 2)), r: 0.42 + 0.12 * Math.sin(x * 3), ph: x * 3 });
    T.push({ id: `cap-${Math.round(g.x0)}`, kind: 'cap', puffs });
  }
  if (conv() && P.low > 45) {
    // cumulus: a flat base where the bubbles reach the dew point, a bulging body, a cauliflower top
    const base = 0.6 + (100 - P.low) * 0.022, top = Math.min(4.8, 2.2 + (0.35 - P.spring) * 10);
    // the picture stretches height ~5x, so heaps are drawn wide to keep a cumulus shape
    for (const [n, h] of [-14, 9, 25, 41].entries()) {
      const puffs = [], tt = top - n * 0.35 * (n % 2);
      for (let z = base; z < tt; z += 0.32) {
        const f = (z - base) / Math.max(0.5, tt - base), w = 3.2 + 2.6 * Math.pow(Math.sin(Math.PI * Math.min(0.8, f)), 0.6);
        for (let dx = -w; dx <= w + 1e-6; dx += 0.85) puffs.push({ x: h + dx + 0.2 * Math.sin(z * 2 + h), z: z + (z === base ? 0 : 0.1 * Math.cos(dx * 3)), r: 0.5 + 0.2 * (1 - Math.abs(dx) / (w + 0.01)), ph: dx + z });
      }
      for (let dx = -2.4; dx <= 2.4; dx += 0.8) puffs.push({ x: h + dx, z: tt + 0.2 * Math.cos(dx * 0.9), r: 0.6, ph: dx * 2 });
      T.push({ id: `heap-${h}`, kind: 'heap', puffs });
    }
  }
  if (rotor) {
    const xr = W.lam * 0.75, zr = P.hill * 0.55, puffs = [];
    for (let k = 0; k < 9; k++) puffs.push({ x: xr + Math.cos(k * 0.7) * 0.9, z: zr + Math.sin(k * 0.7) * 0.35, r: 0.38, ph: k });
    T.push({ id: 'rotor', kind: 'rotor', x: xr, z: zr, puffs });
  }
  scene.setTargets(T);
}
const parts = Array.from({ length: 55 }, (_, i) => ({ x: X0 + Math.random() * (X1 - X0), z0: 0.3 + (i / 55) * 7.5, trail: [] }));
const TREES = Array.from({ length: 30 }, (_, i) => -15 + i * 1.05 + Math.sin(i * 7.1) * 0.3);
let skyGrad = null, skyH = 0, last = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
  scene.update(dt);
  if (!skyGrad || skyH !== Hpx) { skyGrad = cx.createLinearGradient(0, 0, 0, Hpx); skyGrad.addColorStop(0, '#4f9bff'); skyGrad.addColorStop(0.6, '#a6d2ff'); skyGrad.addColorStop(1, '#ffdcae'); skyH = Hpx; }
  cx.fillStyle = skyGrad; cx.fillRect(0, 0, Wpx, Hpx);
  const sunX = Wpx * 0.86, sunY = Hpx * 0.16, sunR = Hpx * 0.065;
  cx.fillStyle = 'rgba(255,240,170,.35)'; cx.beginPath(); cx.arc(sunX, sunY, sunR * (2 + 0.08 * Math.sin(t * 0.002)), 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#fff6c2'; cx.beginPath(); cx.arc(sunX, sunY, sunR, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = 'rgba(120,150,190,.35)'; cx.beginPath(); cx.moveTo(0, Hpx);
  for (let i = 0; i <= 40; i++) { const x = i / 40; cx.lineTo(x * Wpx, Hpx * (0.86 - 0.05 * Math.sin(x * 9) - 0.03 * Math.sin(x * 23))); }
  cx.lineTo(Wpx, Hpx); cx.fill();
  // the moist layers, faint
  cx.fillStyle = `rgba(80,140,255,${0.04 + 0.14 * Math.max(0, (P.up - 40) / 60)})`;
  cx.fillRect(0, sz(3.9), Wpx, sz(3.4) - sz(3.9)); cx.fillRect(0, sz(4.6), Wpx, sz(4.1) - sz(4.6));
  // flow lines whose dashes move with the wind
  cx.lineWidth = 1.2 * dpr; cx.strokeStyle = 'rgba(255,255,255,0.35)';
  cx.setLineDash([10 * dpr, 12 * dpr]); cx.lineDashOffset = -t * 0.004 * P.wind * dpr;
  for (let z0 = 0.7; z0 < 8.6; z0 += 1.1) {
    cx.beginPath();
    for (let i = 0; i <= 120; i++) { const x = X0 + (i / 120) * (X1 - X0); const z = Math.max(ground(x), z0 + eta(x, z0, W)); i ? cx.lineTo(sx(x), sz(z)) : cx.moveTo(sx(x), sz(z)); }
    cx.stroke();
  }
  cx.setLineDash([]);
  // clouds
  const km = Wpx / (X1 - X0);
  for (const o of scene) {
    if (o.t.kind === 'lens') drawLens(cx, o, sx, sz, t, dpr);
    else drawPuffs(cx, o, sx, sz, t, dpr, km);
    if (o.t.kind === 'rotor') drawRotorArrow(cx, o, sx, sz, t, dpr);
  }
  // air bits with short trails
  const v = P.wind * 0.12;
  for (const p of parts) {
    p.x += v * dt * 6; if (p.x > X1) { p.x = X0; p.trail.length = 0; }
    const e = eta(p.x, p.z0, W), z = p.z0 + e; if (z < ground(p.x)) { p.trail.length = 0; continue; }
    const X = sx(p.x), Y = sz(z);
    if (p.trail.length && Math.hypot(X - p.trail[p.trail.length - 2], Y - p.trail[p.trail.length - 1]) > 30 * dpr) p.trail.length = 0;  // resized or jumped: start a fresh trail
    p.trail.push(X, Y); if (p.trail.length > 12) p.trail.splice(0, 2);
    const wet = rhAt(p.z0) >= 40, inCloud = wet && e > needKm(p.z0);
    const col = inCloud ? '255,255,255' : wet ? '59,130,246' : '224,160,80';
    cx.strokeStyle = `rgba(${col},.45)`; cx.lineWidth = 2 * dpr; cx.beginPath(); cx.moveTo(p.trail[0], p.trail[1]);
    for (let q = 2; q < p.trail.length; q += 2) cx.lineTo(p.trail[q], p.trail[q + 1]); cx.stroke();
    cx.fillStyle = `rgb(${col})`; cx.beginPath(); cx.arc(X, Y, (inCloud ? 3.4 : 2.6) * dpr, 0, Math.PI * 2); cx.fill();
  }
  // the mountain, trees, snow
  const mg = cx.createLinearGradient(0, sz(P.hill), 0, Hpx); mg.addColorStop(0, '#8b6f5a'); mg.addColorStop(0.45, '#6e8a4a'); mg.addColorStop(1, '#3f6b35');
  cx.fillStyle = mg; cx.beginPath(); cx.moveTo(0, Hpx);
  for (let i = 0; i <= 160; i++) { const x = X0 + (i / 160) * (X1 - X0); cx.lineTo(sx(x), sz(ground(x) + 0.06 * Math.sin(x * 1.3))); }
  cx.lineTo(Wpx, Hpx); cx.fill();
  cx.fillStyle = '#2f5d2a';
  for (const x of TREES) {
    const g = ground(x); if (g > P.hill * 0.72) continue;
    const bx = sx(x), by = sz(g) + 2 * dpr, hT = (10 + 4 * Math.sin(x * 3)) * dpr, sway = Math.sin(t * 0.002 + x) * P.wind * 0.08 * dpr;
    cx.beginPath(); cx.moveTo(bx - 4 * dpr, by); cx.lineTo(bx + 4 * dpr, by); cx.lineTo(bx + sway, by - hT); cx.fill();
  }
  if (P.hill > 1.6) {
    cx.fillStyle = '#ffffff'; cx.beginPath();
    const half = 2.2, depth = Math.min(0.5, (P.hill - 1.6) * 0.45 + 0.15);  // snow cap: thickest on the summit, thinning down both slopes
    for (let i = 0; i <= 40; i++) { const x = -half + (i / 40) * 2 * half; i ? cx.lineTo(sx(x), sz(ground(x))) : cx.moveTo(sx(x), sz(ground(x))); }
    for (let i = 40; i >= 0; i--) { const x = -half + (i / 40) * 2 * half, k = 1 - (x / half) ** 2; cx.lineTo(sx(x), sz(ground(x) - depth * k)); }
    cx.closePath(); cx.fill();
  }
  drawScales(); drawCues(t); drawFollow(t, dt);
  cx.fillStyle = 'rgba(255,255,255,.92)'; cx.font = `500 ${14 * dpr}px Rubik, sans-serif`; cx.textAlign = 'left';
  cx.fillText(P.wind < 1 ? 'אין רוח' : `רוח ← ${P.wind} מ'/ש`, 52 * dpr, Hpx - 14 * dpr);  // clear of the thermometer
}

// ---------------- follow one bubble of air: it cools as it rises, and at 100% it becomes droplets
const follow = { on: false, x: X0 + 2, z0: 3.5, drops: [] };
function rr(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
function drawFollow(t, dt) {
  if (!follow.on) return;
  follow.x += P.wind * 0.12 * dt * 3; if (follow.x > X1 - 2) follow.x = X0 + 2;
  const e = eta(follow.x, follow.z0, W), z = follow.z0 + e, X = sx(follow.x), Y = sz(z);
  const rh0 = rhAt(follow.z0), need = needKm(follow.z0), rh = Math.min(100, rh0 + (100 - rh0) * Math.max(0, e) / Math.max(0.01, need));
  const wet = rh >= 100, temp = 2.4 - (wet ? 9.8 * need + 6 * (e - need) : 9.8 * e);
  // the bubble
  cx.save();
  cx.fillStyle = wet ? 'rgba(255,255,255,.95)' : 'rgba(59,130,246,.9)'; cx.strokeStyle = '#ff7a59'; cx.lineWidth = 3 * dpr;
  cx.beginPath(); cx.arc(X, Y, 9 * dpr, 0, Math.PI * 2); cx.fill(); cx.stroke();
  if (wet) { if (Math.random() < 0.5) follow.drops.push({ x: X, y: Y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, l: 0.8 }); }
  follow.drops = follow.drops.filter((d) => (d.l -= dt) > 0);
  for (const d of follow.drops) { d.x += d.vx * dt * dpr; d.y += d.vy * dt * dpr; cx.fillStyle = `rgba(80,150,255,${d.l})`; cx.beginPath(); cx.arc(d.x, d.y, 2.4 * dpr, 0, Math.PI * 2); cx.fill(); }
  // the gauge card beside it
  const w = 150 * dpr, h = 84 * dpr, gx = Math.min(Wpx - w - 8 * dpr, X + 16 * dpr), gy = Math.max(8 * dpr, Y - h - 14 * dpr);
  cx.fillStyle = 'rgba(255,255,255,.94)'; rr(gx, gy, w, h, 12 * dpr); cx.fill();
  cx.fillStyle = '#1f2340'; cx.font = `500 ${12 * dpr}px Rubik, sans-serif`; cx.textAlign = 'right'; cx.direction = 'rtl';
  cx.fillText(`בועת אוויר · ${z.toFixed(1)} ק"מ`, gx + w - 10 * dpr, gy + 18 * dpr);
  cx.fillText(`🌡️ ${temp.toFixed(1)}°`, gx + w - 10 * dpr, gy + 40 * dpr);
  cx.fillText(wet ? '💧 טיפות! זה ענן' : `לחות ${Math.round(rh)}%`, gx + w - 10 * dpr, gy + 62 * dpr);
  cx.fillStyle = '#e7e2d4'; rr(gx + 10 * dpr, gy + 68 * dpr, w - 20 * dpr, 8 * dpr, 4 * dpr); cx.fill();
  cx.fillStyle = wet ? '#3b82f6' : '#7fb2ff'; rr(gx + 10 * dpr, gy + 68 * dpr, (w - 20 * dpr) * rh / 100, 8 * dpr, 4 * dpr); cx.fill();
  cx.restore();
}

// ---------------- picture scales: a thermometer of height, droplets that show humidity
const DROPS = Array.from({ length: 260 }, (_, i) => ({ x: X0 + ((i * 37.7) % 1) * 0 + ((i * 0.6180339) % 1) * (X1 - X0), z: (i * 0.7548776) % 1 }));
function drawScales() {
  // thermometer at the left edge: 15° at the ground, ~6.5° colder for every kilometre up
  const x = 10 * dpr, w = 10 * dpr, top = sz(8.5), bot = sz(0.2);
  const g = cx.createLinearGradient(0, bot, 0, top); g.addColorStop(0, '#ff6b4a'); g.addColorStop(0.45, '#ffd36b'); g.addColorStop(1, '#5aa0ff');
  cx.fillStyle = 'rgba(255,255,255,.7)'; rr(x - 3 * dpr, top - 4 * dpr, w + 6 * dpr, bot - top + 8 * dpr, 8 * dpr); cx.fill();
  cx.fillStyle = g; rr(x, top, w, bot - top, 5 * dpr); cx.fill();
  cx.fillStyle = '#1f2340'; cx.font = `500 ${11 * dpr}px Rubik, sans-serif`; cx.textAlign = 'left'; cx.direction = 'ltr';
  for (const z of [1, 3, 5, 7]) cx.fillText(`${Math.round(15 - 6.5 * z)}°`, x + w + 5 * dpr, sz(z) + 4 * dpr);
  cx.direction = 'rtl'; cx.textAlign = 'right';
  // humidity you can see: droplets in the moist layers, more of them when it is wetter
  const bands = [[0.8, 1.8, P.low], [3.3, 3.7, P.up], [3.9, 4.2, P.up - 4], [4.4, 4.65, P.up - 8]];
  for (const [a, b, rh] of bands) {
    const n = Math.max(0, Math.round((rh - 30) / 70 * 60));
    cx.fillStyle = 'rgba(40,110,230,.55)';
    for (let i = 0; i < n; i++) { const d = DROPS[(i * 7 + Math.round(a * 10)) % DROPS.length]; const z = a + d.z * (b - a);
      if (z < ground(d.x) + 0.1) continue; cx.beginPath(); cx.arc(sx(d.x), sz(z), 1.6 * dpr, 0, Math.PI * 2); cx.fill(); }
  }
}

// ---------------- the guided steps: how an ice-cream cloud is made
const STEPS = [
  { t: 'שלב 1: אוויר לח', x: 'הרוח מביאה אוויר מהים. בגובה 3–5 ק"מ יש שלוש שכבות לחות (הפסים הכחולים), אבל עוד אין ענן: האדים שקופים.', set: { wind: 10, hill: 2.2, spring: 1, up: 70, low: 40, jet: false }, cue: 'moist' },
  { t: 'שלב 2: ההר דוחף למעלה', x: 'כשהאוויר פוגש את ההר, הוא חייב לעלות מעליו.', set: { up: 72 }, cue: 'lift' },
  { t: 'שלב 3: קפיץ באוויר', x: 'האוויר קפיצי: אחרי שעלה הוא נופל חזרה, עובר את המקום שלו ועולה שוב. כך נוצר גל מאחורי ההר.', set: { up: 74 }, cue: 'wave' },
  { t: 'שלב 4: למעלה קר', x: 'עקבו אחרי הבועה הכתומה: כשהיא עולה היא מתקררת, והלחות שלה עולה. ב־100% האדים הופכים לטיפות.', set: { up: 80 }, cue: 'follow' },
  { t: 'שלב 5: הלוח הראשון', x: 'הלחות עולה. בפסגת הגל השכבה התחתונה מגיעה ל־100% ומופיע לוח דק של טיפות.', set: { up: 82 }, cue: 'grow1' },
  { t: 'שלב 6: הענן מתעבה', x: 'עוד לחות, עוד טיפות: הלוח מתארך ומתעבה, ומעליו מתחילה קומה שנייה.', set: { up: 87 }, cue: 'grow2' },
  { t: 'שלב 7: קומה שלישית', x: 'השכבה העליונה הכי יבשה, אז היא צריכה הכי הרבה הרמה. כשגם היא מתעבה, יש ענן גלידה בשלוש קומות!', set: { up: 93 }, cue: 'plates' },
  { t: 'שלב 6: הענן נשאר', x: 'האוויר ממשיך לעבור דרך הענן: נהיה טיפות בכניסה ומתאדה ביציאה. לכן הענן נשאר במקום, גם כשנושבת רוח.', set: {}, cue: 'stays' },
  { t: 'עכשיו תורכם!', x: 'שחקו עם המכונה ונסו לפתור את כל המשימות. מה קורה כשאין רוח? כשהאוויר לא קפיצי?', set: {}, cue: null },
];
let step = -1, tween = null;
function setStep(i) {
  step = i; const s = STEPS[i];
  $('guide').hidden = false; $('gT').textContent = s.t; $('gX').textContent = s.x; $('gN').textContent = `${i + 1}/${STEPS.length}`;
  $('gPrev').disabled = i === 0; $('gNext').textContent = i === STEPS.length - 1 ? 'סיום' : 'הבא ←';
  follow.on = s.cue === 'follow' || s.cue === 'stays' || $('follow').checked; if (s.cue === 'follow') { follow.x = X0 + 6; }
  if ('jet' in s.set) { P.jet = s.set.jet; $('jet').checked = P.jet; }
  tween = { from: { ...P }, to: { ...P, ...s.set }, t0: performance.now() };
}
function endGuide() { step = -1; $('guide').hidden = true; follow.on = $('follow').checked; }
function tweenFrame(now) {
  if (!tween) return;
  const k = Math.min(1, (now - tween.t0) / 1400), e = k * k * (3 - 2 * k);
  for (const key of ['wind', 'hill', 'spring', 'up', 'low']) {
    P[key] = tween.from[key] + (tween.to[key] - tween.from[key]) * e;
    $(key).value = P[key]; $('o-' + key).textContent = FMT[key](key === 'hill' || key === 'spring' ? P[key] : Math.round(P[key]));
  }
  build(); if (k >= 1) tween = null;
}
function arrow(x0, y0, x1, y1, col) {
  cx.strokeStyle = col; cx.fillStyle = col; cx.lineWidth = 4 * dpr; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0), L = 12 * dpr;
  cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x1 - L * Math.cos(a - 0.5), y1 - L * Math.sin(a - 0.5)); cx.lineTo(x1 - L * Math.cos(a + 0.5), y1 - L * Math.sin(a + 0.5)); cx.fill();
}
function label(txt, x, y) {
  cx.font = `700 ${15 * dpr}px Rubik, sans-serif`; cx.direction = 'rtl'; cx.textAlign = 'center';
  const w = cx.measureText(txt).width + 18 * dpr; cx.fillStyle = 'rgba(255,122,89,.95)'; rr(x - w / 2, y - 14 * dpr, w, 24 * dpr, 12 * dpr); cx.fill();
  cx.fillStyle = '#fff'; cx.fillText(txt, x, y + 3 * dpr);
}
function drawCues(t) {
  tweenFrame(performance.now());
  const cue = step >= 0 ? STEPS[step].cue : glossCue; if (!cue) return;
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.005);
  cx.save();
  if (cue === 'moist') {
    cx.strokeStyle = `rgba(255,122,89,${0.5 + 0.4 * pulse})`; cx.lineWidth = 3 * dpr; cx.setLineDash([8 * dpr, 6 * dpr]);
    for (const [a, b] of [[3.3, 3.7], [3.9, 4.2], [4.4, 4.65]]) { cx.strokeRect(4 * dpr, sz(b), Wpx - 8 * dpr, sz(a) - sz(b)); }
    cx.setLineDash([]); label('שכבות לחות', sx(-12), sz(4.9));
  }
  if (cue === 'lift') { arrow(sx(-9), sz(1.0), sx(-2.5), sz(P.hill + 0.6 + 0.3 * pulse), '#ff7a59'); label('ההר דוחף למעלה', sx(-9), sz(P.hill + 1.4)); }
  if (cue === 'wave') {
    const z0 = 3.5, xs = [];
    for (let x = 0.5; x < X1; x += 0.25) { const a = eta(x - 0.25, z0, W), b = eta(x, z0, W), c = eta(x + 0.25, z0, W); if (b > a && b >= c && b > 0.05) xs.push(x); if (xs.length > 2) break; }
    for (const x of xs) { const y = sz(z0 + eta(x, z0, W)); cx.fillStyle = `rgba(255,122,89,${0.6 + 0.4 * pulse})`; cx.beginPath(); cx.arc(sx(x), y, (8 + 4 * pulse) * dpr, 0, Math.PI * 2); cx.fill(); }
    if (xs[0] != null) { arrow(sx(xs[0] + W.lam * 0.25), sz(4.6), sx(xs[0] + W.lam * 0.45), sz(3.3), '#3b82f6'); label('למעלה, למטה, ושוב: גל', sx(xs[0] + 6), sz(6)); }
  }
  if (cue === 'grow1') label('קומה 1: לוח דק', sx(8), sz(5.6));
  if (cue === 'grow2') label('קומה 2 מתחילה', sx(8), sz(5.9));
  if (cue === 'plates') label('🍦 שלוש קומות: ענן גלידה', sx(8), sz(6.2));
  if (cue === 'temp') label('למעלה קר יותר', sx(-20), sz(7));
  if (cue === 'dew') label('100% = נקודת הטל → טיפות', sx(6), sz(6.4));
  if (cue === 'stays') label('האוויר עובר → הענן נשאר', sx(10), sz(6.2));
  cx.restore();
}

// ---------------- words, missions, stars
const NAMES = { lens: '🍦 ענן עדשה (ענן גלידה)', train: '🚂 רכבת עדשות', cap: '🎩 ענן כובע', heap: '🥦 ענני ערימה (כרובית)', rotor: '🌀 ענן רוטור', clear: '☀️ שמיים נקיים' };
const MISSIONS = [
  ['lens', 'צרו ענן גלידה: ענן עדשה מעל ההר'],
  ['cap', 'שימו לחות למטה וצרו ענן כובע על הפסגה'],
  ['train', 'צרו רכבת של 3 עדשות או יותר'],
  ['heap', 'הפכו את האוויר ללא קפיצי וצרו ענני ערימה'],
  ['rotor', 'רוח חזקה + אוויר קפיצי: צרו ענן רוטור'],
  ['clear', 'העלימו את כל העננים'],
];
// a mission counts only after the child has moved something
let touched = false; document.addEventListener('input', () => { touched = true; }, true); document.addEventListener('click', (e) => { if (e.target.closest?.('#guideBtn, #gNext, #jet')) touched = true; }, true);
let done = {}; try { done = JSON.parse(localStorage.getItem('kids.done') || '{}'); } catch { done = {}; }
function drawMissions() {
  $('missions').innerHTML = MISSIONS.map(([k, t]) => `<li class="${done[k] ? 'done' : ''}"><span class="st" aria-hidden="true">⭐</span><span>${t}</span></li>`).join('');
  const n = Object.keys(done).filter((k) => done[k]).length; $('score').textContent = `${n} מתוך ${MISSIONS.length} ⭐`;
}
function tipFor() {
  if (P.wind < 1) return 'בלי רוח האוויר לא עובר מעל ההר, ולכן אין גל ואין ענן. תנו קצת רוח!';
  if (found.heap) return 'האוויר לא קפיצי, אז הוא לא חוזר למטה. במקום גל, בועות חמות עולות מהאדמה והופכות לענני ערימה, שנראים כמו כרובית.';
  if (P.spring < 0.35) return 'האוויר כמעט לא קפיצי. כשהוא לא חוזר למטה, אין גל מאחורי ההר.';
  if (found.train) return `כשהרוח גבוה בשמיים חזקה, הגל נלכד וקופץ שוב ושוב: ${found.lenses} עדשות בשורה!`;
  if (found.rotor) return 'מתחת לגל האוויר מסתובב כמו גלגל. זה ענן רוטור, וטייסים נזהרים ממנו.';
  if (found.lens) return 'ענן גלידה! הגל הרים את השכבות הלחות עד שהתקררו והפכו לטיפות. כל שכבה היא קומה, והעליונות קטנות יותר כי הן יבשות יותר. האוויר עובר, הענן נשאר.';
  if (found.cap) return 'ענן כובע! האוויר הלח שלמטה מטפס על ההר, מתקרר ונהיה ענן שיושב על הפסגה.';
  if (P.up < 60) return 'השכבה למעלה יבשה מדי. תוסיפו לחות למעלה, והגל יוכל להפוך אותה לענן.';
  if (P.spring > 1.6 && P.wind < 6) return 'רוח חלשה ואוויר קפיצי מאוד: האוויר עוקף את ההר במקום לעלות עליו.';
  return 'יש גל, אבל הוא לא מרים את האוויר מספיק. נסו להגביה את ההר או להוסיף לחות.';
}
let lastNew = '';
function report() {
  const list = Object.keys(NAMES).filter((k) => found[k] && !(k === 'lens' && found.train));
  $('found').textContent = list.length ? list.map((k) => NAMES[k]).join(' · ') : 'עוד אין ענן';
  $('tip').textContent = tipFor();
  if (touched) for (const [k] of MISSIONS) if (found[k] && !done[k]) { done[k] = true; lastNew = k; confetti(); }  // only what the child made, not the opening sky
  try { localStorage.setItem('kids.done', JSON.stringify(done)); } catch { /* private mode */ }
  drawMissions();
}
// confetti
const cf = $('confetti'), cfx = cf.getContext('2d'); let bits = [];
function confetti() {
  cf.width = innerWidth; cf.height = innerHeight;
  bits = Array.from({ length: 120 }, () => ({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 10 - 3, c: `hsl(${Math.random() * 360},90%,60%)`, life: 90 }));
  const step = () => { cfx.clearRect(0, 0, cf.width, cf.height); bits = bits.filter((b) => b.life-- > 0);
    for (const b of bits) { b.vy += 0.3; b.x += b.vx; b.y += b.vy; cfx.fillStyle = b.c; cfx.fillRect(b.x, b.y, 7, 10); }
    if (bits.length) requestAnimationFrame(step); else cfx.clearRect(0, 0, cf.width, cf.height); };
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) step();
}

// ---------------- controls
const FMT = { wind: (v) => (v < 1 ? 'אין' : `${v} מ'/ש`), hill: (v) => `${v.toFixed(1)} ק"מ`, spring: (v) => (v < 0.35 ? 'לא קפיצי' : v < 1.2 ? 'קפיצי' : 'קפיצי מאוד'), up: (v) => `${v}%`, low: (v) => `${v}%` };
for (const k of Object.keys(FMT)) {
  const el = $(k); $('o-' + k).textContent = FMT[k](+el.value);
  el.addEventListener('input', () => { P[k] = +el.value; $('o-' + k).textContent = FMT[k](P[k]); build(); });
}
$('jet').addEventListener('change', () => { P.jet = $('jet').checked; build(); });
$('follow').addEventListener('change', () => { follow.on = $('follow').checked; follow.x = X0 + 4; });
$('guideBtn').addEventListener('click', () => setStep(0));
// picture glossary: each word has a short explanation and lights up its part of the drawing
const WORDS = {
  hum: ['לחות', 'כמה אדי מים יש באוויר. האדים שקופים, לא רואים אותם. 100% זה הכי הרבה שהאוויר יכול להחזיק.', 'moist'],
  temp: ['טמפרטורה', 'כמה חם או קר. ככל שעולים גבוה יותר בשמיים, קר יותר: בערך 6.5° פחות כל קילומטר.', 'temp'],
  dew: ['נקודת הטל', 'הטמפרטורה שבה הלחות מגיעה ל־100%. מתחתיה האדים הופכים לטיפות, כמו על כוס קרה.', 'dew'],
  spring: ['אוויר קפיצי', 'אוויר שחוזר למקום אחרי שהרימו אותו, כמו קפיץ. בלי זה אין גל.', 'wave'],
  wave: ['גל', 'האוויר עולה ויורד שוב ושוב מאחורי ההר. בפסגות הגל האוויר הכי גבוה והכי קר.', 'wave'],
  cond: ['התעבות', 'כשאדי מים מתקררים הם הופכים לטיפות זעירות. מיליוני טיפות ביחד הן ענן.', 'dew'],
  wind: ['רוח', 'אוויר שזז. הרוח מביאה את האוויר הלח אל ההר. בלי רוח, אין גל.', 'lift'],
};
let glossCue = null, glossT = 0;
for (const b of document.querySelectorAll('[data-w]')) b.addEventListener('click', () => {
  const [t, x, cue] = WORDS[b.dataset.w]; $('wordT').textContent = t; $('wordX').textContent = x; $('wordBox').hidden = false;
  document.querySelectorAll('[data-w]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  glossCue = cue; if (cue === 'dew') { follow.on = true; follow.x = X0 + 6; }
  clearTimeout(glossT); glossT = setTimeout(() => { glossCue = null; if (step < 0) follow.on = $('follow').checked; }, 9000);
  $('sky').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
$('gNext').addEventListener('click', () => (step >= STEPS.length - 1 ? endGuide() : setStep(step + 1)));
$('gPrev').addEventListener('click', () => step > 0 && setStep(step - 1));
$('gClose').addEventListener('click', endGuide);
$('reset').addEventListener('click', () => { done = {}; localStorage.removeItem('kids.done'); build(); });
addEventListener('resize', resize);
resize(); build(); requestAnimationFrame(frame);
