// Upstream sounding panel. Four views, all with height (0-10 km) on the vertical axis.
const ZMAX = 10000;

export function createProfileChart(canvas) {
  const ctx = canvas.getContext('2d');
  let F = null, view = 'thermo';
  const css = (v) => getComputedStyle(canvas).getPropertyValue(v).trim();

  function frame(W, H) {
    const padL = 34, padR = 12, padT = 18, padB = 24;
    const w = W - padL - padR, h = H - padT - padB;
    return { padL, padR, padT, padB, w, h, Y: (z) => padT + h - z / ZMAX * h };
  }
  function axes(f, W, xticks, xlabel) {
    const fg = css('--fg-dim'), grid = css('--grid');
    ctx.strokeStyle = grid; ctx.fillStyle = fg; ctx.lineWidth = 1; ctx.font = '10px "IBM Plex Mono", monospace';
    for (let z = 0; z <= ZMAX; z += 1000) { ctx.beginPath(); ctx.moveTo(f.padL, f.Y(z)); ctx.lineTo(W - f.padR, f.Y(z)); ctx.stroke(); if (z % 2000 === 0) ctx.fillText(`${z / 1000}`, 6, f.Y(z) + 3); }
    ctx.fillText('ק"מ', 6, f.padT - 6);
    for (const [x, lab] of xticks) { ctx.beginPath(); ctx.moveTo(x, f.padT); ctx.lineTo(x, f.padT + f.h); ctx.stroke(); ctx.fillText(lab, x - 8, f.padT + f.h + 14); }
    ctx.textAlign = 'end'; ctx.fillText(xlabel, W - f.padR, f.padT - 6); ctx.textAlign = 'start';
  }
  function line(f, X, val, color, width = 2, dash) {
    const p = F.prof; ctx.strokeStyle = color; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (let k = 0; k * p.dz <= ZMAX && k < p.nz; k++) { const x = X(val(k)), y = f.Y(k * p.dz); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  function bands(f, W) {
    // shade moist layers (RH > 60 %) and inversions/very stable layers
    const p = F.prof;
    for (let k = 0; k * p.dz < ZMAX; k++) {
      const z = k * p.dz;
      if (p.RH[k] > 60) { ctx.fillStyle = css('--moist-band'); ctx.fillRect(f.padL, f.Y(z + p.dz), f.w, f.Y(z) - f.Y(z + p.dz) + 0.5); }
      if (k > 0 && p.T[k] > p.T[k - 1] + 0.02) { ctx.fillStyle = css('--inv-band'); ctx.fillRect(f.padL, f.Y(z + p.dz), f.w, f.Y(z) - f.Y(z + p.dz) + 0.5); }
    }
  }
  function legend(items, W) {
    ctx.font = '11px Assistant, sans-serif'; let x = W - 12; ctx.textAlign = 'end';
    for (const [c, t] of items) { ctx.fillStyle = css('--fg'); ctx.fillText(t, x, 12); x -= ctx.measureText(t).width + 6; ctx.fillStyle = c; ctx.fillRect(x - 10, 6, 10, 3); x -= 18; }
    ctx.textAlign = 'start';
  }

  const views = {
    thermo(W, H) {
      const f = frame(W, H), X = (t) => f.padL + (t + 30) / 55 * f.w;
      bands(f, W);
      axes(f, W, [-30, -15, 0, 15].map(t => [X(t), `${t}°`]), '°C');
      line(f, X, (k) => F.prof.T[k], css('--temp'));
      line(f, X, (k) => F.prof.Td[k], css('--dew'));
      legend([[css('--temp'), 'טמפרטורה'], [css('--dew'), 'נקודת טל'], [css('--moist-band-solid'), 'שכבה לחה'], [css('--inv-band-solid'), 'אינוורסיה']], W);
    },
    wind(W, H) {
      const f = frame(W, H), X = (v) => f.padL + v / 30 * f.w;
      axes(f, W, [0, 10, 20, 30].map(v => [X(v), `${v}`]), 'מ\'/ש · N×1000');
      line(f, X, (k) => Math.hypot(F.prof.U[k], F.prof.V[k]), css('--wind'));
      line(f, X, (k) => Math.sqrt(F.prof.N2[k]) * 1000, css('--stab'), 1.6);
      // direction ticks
      ctx.strokeStyle = css('--fg-dim'); ctx.lineWidth = 1.2;
      for (let z = 500; z < ZMAX; z += 500) {
        const k = Math.round(z / F.prof.dz), u = F.prof.U[k], v = F.prof.V[k], s = Math.hypot(u, v) || 1;
        const x = f.padL + f.w - 16, y = f.Y(z);
        ctx.beginPath(); ctx.moveTo(x - u / s * 9, y + v / s * 9); ctx.lineTo(x + u / s * 9, y - v / s * 9); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + u / s * 9, y - v / s * 9, 1.8, 0, 7); ctx.fill();
      }
      legend([[css('--wind'), 'מהירות רוח'], [css('--stab'), 'יציבות N']], W);
    },
    lift(W, H) {
      const f = frame(W, H), MAXL = 1500, X = (m) => f.padL + Math.min(m, MAXL) / MAXL * f.w;
      axes(f, W, [0, 500, 1000, 1500].map(m => [X(m), `${m}`]), 'מטר');
      const { outZ, satLift, maxLift } = F;
      for (let o = 0; o < outZ.length; o++) {
        const z = outZ[o]; if (z > ZMAX) break;
        const y0 = f.Y(z + 50), hh = f.Y(z - 50) - y0;
        const ignite = maxLift[o] > satLift[o];
        ctx.fillStyle = ignite ? css('--cloud-solid') : css('--need');
        ctx.fillRect(f.padL, y0, X(satLift[o]) - f.padL, hh * 0.8);
      }
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath();
      for (let o = 0; o < outZ.length; o++) { const x = X(maxLift[o]), y = f.Y(outZ[o]); o ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      legend([[css('--need'), 'הרמה דרושה לרוויה'], [css('--accent'), 'הרמה מרבית של הגל'], [css('--cloud-solid'), 'נדלק ענן']], W);
    },
    scorer(W, H) {
      const f = frame(W, H), lo = -8, hi = -4, X = (l2) => f.padL + (Math.log10(Math.max(1e-9, l2)) - lo) / (hi - lo) * f.w;
      axes(f, W, [-8, -7, -6, -5, -4].map(e => [X(10 ** e), `1e${e}`]), 'ℓ² [1/מ²]');
      line(f, X, (k) => F.prof.N2[k] / Math.max(1, F.prof.U[k] ** 2 + F.prof.V[k] ** 2), css('--stab'));
      for (const [lam, lab] of [[5000, 'λ=5'], [10000, 'λ=10'], [20000, 'λ=20 ק"מ']]) {
        const k2 = (2 * Math.PI / lam) ** 2, x = X(k2);
        ctx.strokeStyle = css('--accent'); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, f.padT); ctx.lineTo(x, f.padT + f.h); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = css('--accent'); ctx.fillText(lab, x + 3, f.padT + 10);
      }
      legend([[css('--stab'), 'פרמטר סקורר ℓ²=N²/U²'], [css('--accent'), 'k² של הר ברוחב λ']], W);
    },
  };

  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (F) views[view](W, H);
  }
  new ResizeObserver(() => draw()).observe(canvas);
  return { setField(f) { F = f; draw(); }, setView(v) { view = v; draw(); }, draw };
}
