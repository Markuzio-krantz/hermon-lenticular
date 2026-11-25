// Illustrated, smooth drawing for the kids' cloud lab. Clouds are objects (lens plates, cap puffs,
// heap towers, a rotor) that tween toward their targets, drawn from sprites cached once, so every
// frame is cheap: a few gradients, paths and drawImage calls.

// a soft puff sprite, drawn once per size bucket
const puffCache = new Map();
function puff(r) {
  const key = Math.max(4, Math.round(r / 2) * 2);
  if (puffCache.has(key)) return puffCache.get(key);
  const c = document.createElement('canvas'), s = key * 2 + 8; c.width = c.height = s;
  const g = c.getContext('2d'), m = s / 2;
  const grd = g.createRadialGradient(m - key * 0.35, m - key * 0.45, key * 0.1, m, m, key);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.62, '#f7f8ff'); grd.addColorStop(1, 'rgba(214,222,244,0.0)');
  g.fillStyle = grd; g.beginPath(); g.arc(m, m, key, 0, Math.PI * 2); g.fill();
  puffCache.set(key, c); return c;
}
const ease = (a, b, k) => a + (b - a) * k;

// objects keep a target and a current value for every number; new ones grow in, old ones fade out
export function createScene() {
  const objs = new Map();
  return {
    setTargets(list) {
      const seen = new Set();
      for (const t of list) {
        seen.add(t.id);
        const o = objs.get(t.id);
        if (o) { o.t = t; o.dead = false; } else objs.set(t.id, { t, c: { ...t, s: 0 }, dead: false });
      }
      for (const [id, o] of objs) if (!seen.has(id)) o.dead = true;
    },
    update(dt) {
      const k = 1 - Math.exp(-4 * dt);
      for (const [id, o] of objs) {
        for (const key of Object.keys(o.t)) if (typeof o.t[key] === 'number') o.c[key] = ease(o.c[key] ?? o.t[key], o.t[key], k);
        o.c.s = ease(o.c.s, o.dead ? 0 : 1, k);
        if (o.dead && o.c.s < 0.02) objs.delete(id);
      }
    },
    *[Symbol.iterator]() { yield* objs.values(); },
  };
}

// a lens plate: smooth domed top, flatter base, light from above, a soft shadow under it
export function drawLens(cx, o, sx, sz, t, dpr) {
  const c = o.c, s = c.s; if (s < 0.01) return;
  // a lens is long and flat: at least four times wider than thick (drawn a little larger than life)
  const xm = (c.x0 + c.x1) / 2, half = Math.max(1.6, (c.x1 - c.x0) / 2 + 0.6) * (0.35 + 0.65 * s);
  const a = sx(xm - half), b = sx(xm + half), y = sz(c.zc);
  const th = Math.min((b - a) / 4.5, Math.max(7 * dpr, (sz(c.zc - c.th) - y) * 1.2)) * (0.4 + 0.6 * s);
  const top = y - th * 0.7, bot = y + th * 0.3, wob = Math.sin(t * 0.0012 + c.x0) * 1.5 * dpr;
  cx.save();
  cx.globalAlpha = 0.18 * s; cx.fillStyle = '#4a5a8a';
  cx.beginPath(); cx.ellipse((a + b) / 2, bot + th * 0.55, (b - a) * 0.42, th * 0.18, 0, 0, Math.PI * 2); cx.fill();
  cx.globalAlpha = Math.min(1, 0.25 + s);
  const g = cx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f3f5ff'); g.addColorStop(1, '#c9d2ee');
  cx.fillStyle = g;
  cx.beginPath(); cx.moveTo(a, y);
  cx.bezierCurveTo(a + (b - a) * 0.22, top + wob, a + (b - a) * 0.72, top - wob, b, y);
  cx.bezierCurveTo(a + (b - a) * 0.7, bot, a + (b - a) * 0.3, bot, a, y);
  cx.fill();
  // a highlight along the top edge
  cx.globalAlpha = 0.55 * s; cx.strokeStyle = '#ffffff'; cx.lineWidth = 2 * dpr;
  cx.beginPath(); cx.moveTo(a + (b - a) * 0.12, y - th * 0.35);
  cx.bezierCurveTo(a + (b - a) * 0.3, top + th * 0.3, a + (b - a) * 0.65, top + th * 0.25, b - (b - a) * 0.15, y - th * 0.3); cx.stroke();
  cx.restore();
}

// puffy clouds (cap, heap, rotor) are bundles of puffs
export function drawPuffs(cx, o, sx, sz, t, dpr, scaleKm) {
  const c = o.c, s = c.s; if (s < 0.01) return;
  cx.save(); cx.globalAlpha = Math.min(1, 0.2 + s);
  for (const p of o.t.puffs) {
    const r = p.r * scaleKm * 2.3 * (0.3 + 0.7 * s);
    const bob = Math.sin(t * 0.0015 + p.ph) * 0.06 * r;
    const im = puff(r);
    let x = sx(p.x), y = sz(p.z) + bob;
    if (o.t.kind === 'rotor') { const a = t * 0.0025 + p.ph; x += Math.cos(a) * r * 0.5; y += Math.sin(a) * r * 0.5; }
    cx.drawImage(im, x - im.width / 2, y - im.height / 2);
  }
  cx.restore();
}

// rotation arrow for the rotor, so kids see the air turning
export function drawRotorArrow(cx, o, sx, sz, t, dpr) {
  const s = o.c.s; if (s < 0.05) return;
  const x = sx(o.c.x), y = sz(o.c.z), r = 26 * dpr;
  cx.save(); cx.globalAlpha = 0.75 * s; cx.strokeStyle = '#ff7a59'; cx.lineWidth = 3 * dpr; cx.lineCap = 'round';
  const a0 = t * 0.003; cx.beginPath(); cx.arc(x, y, r, a0, a0 + 4.6); cx.stroke();
  const ax = x + Math.cos(a0 + 4.6) * r, ay = y + Math.sin(a0 + 4.6) * r, d = a0 + 4.6 + Math.PI / 2;
  cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(ax - Math.cos(d - 0.5) * 9 * dpr, ay - Math.sin(d - 0.5) * 9 * dpr);
  cx.moveTo(ax, ay); cx.lineTo(ax - Math.cos(d + 0.5) * 9 * dpr, ay - Math.sin(d + 0.5) * 9 * dpr); cx.stroke();
  cx.restore();
}
