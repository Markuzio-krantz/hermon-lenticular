// Vertical cross-section along the wind: terrain, streamlines coloured by the humidity of the
// layer they came from, cloud water, the dividing streamline, freezing level and flowing dashes.
const ZMAX = 8000;

export function createXSection(canvas, tip) {
  const ctx = canvas.getContext('2d');
  let F = null, meta = null, center = [6, 12], ang = 0, half = 30, blockFactor = 0.6, t0 = performance.now();
  const css = (v) => getComputedStyle(canvas).getPropertyValue(v).trim();

  function sampleEta(o, x, n) {
    const N = F.inner, c = (x + 32) / 64 * N - 0.5, r = (32 - n) / 64 * N - 0.5;
    if (c < 0 || r < 0 || c > N - 1.001 || r > N - 1.001) return null;
    const c0 = c | 0, r0 = r | 0, fx = c - c0, fy = r - r0, b = o * N * N + r0 * N + c0, e = F.eta;
    return e[b] * (1 - fx) * (1 - fy) + e[b + 1] * fx * (1 - fy) + e[b + N] * (1 - fx) * fy + e[b + N + 1] * fx * fy;
  }
  function sampleGrid(arr, x, n, N) {
    const c = (x + 32) / 64 * N - 0.5, r = (32 - n) / 64 * N - 0.5;
    if (c < 0 || r < 0 || c > N - 1.001 || r > N - 1.001) return null;
    const c0 = c | 0, r0 = r | 0, fx = c - c0, fy = r - r0, b = r0 * N + c0;
    return arr[b] * (1 - fx) * (1 - fy) + arr[b + 1] * fx * (1 - fy) + arr[b + N] * (1 - fx) * fy + arr[b + N + 1] * fx * fy;
  }
  const pt = (s) => [center[0] + Math.cos(ang) * s, center[1] + Math.sin(ang) * s];

  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!F) return;
    const padL = 34, padR = 10, padT = 10, padB = 22, w = W - padL - padR, h = H - padT - padB;
    const X = (s) => padL + (s + half) / (2 * half) * w, Y = (z) => padT + h - z / ZMAX * h;
    const fg = css('--fg-dim'), grid = css('--grid');
    // grid
    ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillStyle = fg; ctx.strokeStyle = grid; ctx.lineWidth = 1;
    for (let z = 0; z <= ZMAX; z += 1000) { ctx.beginPath(); ctx.moveTo(padL, Y(z)); ctx.lineTo(W - padR, Y(z)); ctx.stroke(); ctx.fillText(`${z / 1000}`, 4, Y(z) + 3); }
    ctx.fillText('ק"מ', 4, padT + 8);
    // cloud water (from the 3-D volume)
    const [nx, ny, nz] = F.volDims, dzv = ZMAX / nz;
    const cols = 160;
    ctx.save(); ctx.filter = 'blur(2.5px)';
    for (let c = 0; c < cols; c++) {
      const s = -half + (c + 0.5) / cols * 2 * half, [x, n] = pt(s);
      const ci = Math.round((x + 32) / 64 * nx - 0.5), rj = Math.round((32 - n) / 64 * ny - 0.5);
      if (ci < 0 || rj < 0 || ci >= nx || rj >= ny) continue;
      for (let v = 0; v < nz; v++) {
        const q = F.vol[(v * ny + rj) * nx + ci];
        if (q > 0.003) {
          ctx.fillStyle = `rgba(255,248,244,${Math.min(0.95, 0.25 + q * 3)})`;
          ctx.fillRect(X(s) - w / cols / 2, Y((v + 1) * dzv), w / cols + 0.6, h / nz * 1.02);
        }
      }
    }
    ctx.restore();
    // streamlines
    const time = (performance.now() - t0) / 1000, prof = F.prof;
    for (let o = 3; o < F.outZ.length; o += 2) {
      const z0 = F.outZ[o], k = Math.round(z0 / prof.dz), rh = prof.RH[k];
      const moist = Math.min(1, Math.max(0, (rh - 40) / 45));
      const hue = 38 + 160 * moist, sat = 55 + 30 * moist, lit = 55 + 10 * moist;
      ctx.beginPath(); let started = false;
      for (let s = -half; s <= half; s += 0.25) {
        const [x, n] = pt(s), e = sampleEta(o, x, n);
        if (e === null) { started = false; continue; }
        const g = sampleGrid(F.ground, x, n, F.inner) ?? 0, z = z0 + e;
        if (z < g + 30) { started = false; continue; }
        if (!started) { ctx.moveTo(X(s), Y(z)); started = true; } else ctx.lineTo(X(s), Y(z));
      }
      const speed = Math.hypot(prof.U[k], prof.V[k]);
      ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lit}%, ${0.18 + 0.3 * moist})`; ctx.lineWidth = 0.8 + 1.4 * moist; ctx.stroke();
      ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lit + 15}%, ${0.55 + 0.4 * moist})`; ctx.lineWidth = 1.2 + 1.4 * moist;
      ctx.setLineDash([3, 22]); ctx.lineDashOffset = -time * speed * 1.6; ctx.stroke(); ctx.setLineDash([]);
    }
    // terrain
    ctx.beginPath(); ctx.moveTo(X(-half), Y(0));
    for (let s = -half; s <= half; s += 0.2) { const [x, n] = pt(s); const g = sampleGrid(F.ground, x, n, F.inner); ctx.lineTo(X(s), Y(g ?? 0)); }
    ctx.lineTo(X(half), Y(0)); ctx.closePath();
    const grd = ctx.createLinearGradient(0, Y(2800), 0, Y(0));
    grd.addColorStop(0, css('--rock-hi')); grd.addColorStop(1, css('--rock-lo'));
    ctx.fillStyle = grd; ctx.fill();
    // freezing level + dividing streamline
    const d = F.diag;
    if (d.freeze) { ctx.strokeStyle = css('--ice'); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(padL, Y(d.freeze)); ctx.lineTo(W - padR, Y(d.freeze)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = css('--ice'); ctx.fillText('0°C', W - padR - 26, Y(d.freeze) - 3); }
    const zd = d.zdHermon * blockFactor;
    if (zd > 200) { ctx.strokeStyle = css('--accent'); ctx.setLineDash([6, 3]); ctx.beginPath(); ctx.moveTo(padL, Y(zd)); ctx.lineTo(W - padR, Y(zd)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = css('--accent'); ctx.fillText('קו הזרם המפריד (חרמון)', padL + 4, Y(zd) - 4); }
    // landmarks near the slice
    if (meta) {
      ctx.fillStyle = css('--fg'); ctx.font = '11px Assistant, sans-serif'; ctx.textAlign = 'center';
      const names = { hermon: 'חרמון', hulaValley: 'עמק החולה', ramim: 'רכס רמים', harDov: 'הר דוב', golan: 'גולן', kiryatShmona: 'ק. שמונה', merom: 'מרום גולן' };
      for (const [k, nm] of Object.entries(names)) {
        const lm = meta.landmarks[k]; if (!lm) continue;
        const dx = lm[0] / 1000 - center[0], dn = lm[1] / 1000 - center[1];
        const along = dx * Math.cos(ang) + dn * Math.sin(ang), across = -dx * Math.sin(ang) + dn * Math.cos(ang);
        if (Math.abs(across) < 4 && Math.abs(along) < half) { const g = sampleGrid(F.ground, lm[0] / 1000, lm[1] / 1000, F.inner) ?? 0; ctx.fillText(nm, X(along), Y(g) - 6); }
      }
      ctx.textAlign = 'start';
    }
    // wind arrow
    ctx.fillStyle = fg; ctx.font = '11px Assistant, sans-serif';
    ctx.fillText('רוח →', W - padR - 40, H - 6);
    ctx.fillText(`${half * 2} ק"מ לאורך הרוח`, padL, H - 6);
  }

  canvas.addEventListener('mousemove', (ev) => {
    if (!F || !tip) return;
    const r = canvas.getBoundingClientRect(), padL = 34, padR = 10, padT = 10, padB = 22;
    const w = r.width - padL - padR, h = r.height - padT - padB;
    const s = (ev.clientX - r.left - padL) / w * 2 * half - half, z = (h - (ev.clientY - r.top - padT)) / h * ZMAX;
    if (s < -half || s > half || z < 0) { tip.hidden = true; return; }
    const k = Math.min(F.prof.nz - 1, Math.round(z / F.prof.dz));
    tip.hidden = false; tip.style.left = `${ev.clientX - r.left + 12}px`; tip.style.top = `${ev.clientY - r.top - 10}px`;
    tip.textContent = `${(z / 1000).toFixed(1)} ק"מ · ${F.prof.T[k].toFixed(1)}°C · לחות במעלה הרוח ${F.prof.RH[k].toFixed(0)}%`;
  });
  canvas.addEventListener('mouseleave', () => { if (tip) tip.hidden = true; });

  return {
    setField(f) { F = f; },
    setMeta(m) { meta = m; },
    setSlice(c, a, hl = 30) { center = c; ang = a; half = hl; },
    setBlockFactor(b) { blockFactor = b; },
    get slice() { return { center, ang, half }; },
    draw,
  };
}
