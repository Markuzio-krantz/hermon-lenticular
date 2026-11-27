// The CM1 cut: a vertical slice along the wind through the Hermon summit, from the GPU run of 19.11.2026.
// Holds the simulated vertical wind (w) and cloud water (qc); used by the formation curtain and the parcel.
//   C = { meta, data, f (time index), sx, sn (summit, map km), ca, sa (wind direction) }

/** sample the cut at map km x, n and height z (m): { w m/s, q 0..1 of the cut's peak, under } */
export function cutAt(C, x, n, z) {
  const m = C.meta, X = m.xz, nx = m.nx, sc = (x - C.sx) * C.ca + (n - C.sn) * C.sa;
  const fi = (sc - m.s0_km) / m.dx_km, fk = (z / 1000 - X.z0_km) / X.dz_km;
  if (fi < 0 || fi >= nx - 1 || fk < 0 || fk >= X.nz - 1) return { w: 0, q: 0, under: false };
  const i = fi | 0, k = fk | 0, u = fi - i, v = fk - k, base = C.f * 2 * X.nz * nx, d = C.data;
  const W = (kk, ii) => { const b = d[base + kk * nx + ii]; return b === 128 ? NaN : (b > 127 ? b - 256 : b) / 127 * X.wmax; };
  const Q = (kk, ii) => d[base + X.nz * nx + kk * nx + ii] / 255;
  const w00 = W(k, i), w10 = W(k, i + 1), w01 = W(k + 1, i), w11 = W(k + 1, i + 1);
  if (Number.isNaN(w00) && Number.isNaN(w01)) return { w: 0, q: 0, under: true };
  const z0 = (a) => (Number.isNaN(a) ? 0 : a);
  const w = (z0(w00) * (1 - u) + z0(w10) * u) * (1 - v) + (z0(w01) * (1 - u) + z0(w11) * u) * v;
  const q = (Q(k, i) * (1 - u) + Q(k, i + 1) * u) * (1 - v) + (Q(k + 1, i) * (1 - u) + Q(k + 1, i + 1) * u) * v;
  return { w, q: q * q, under: false };  // stored sqrt-scaled
}

/** wind speed along the cut at height z (m), from the upstream sounding; never below 3 m/s */
export function alongWind(prof, z, ca, sa) {
  const k = Math.max(0, Math.min(prof.U.length - 1, Math.round(z / prof.dz)));
  return Math.max(3, prof.U[k] * ca + prof.V[k] * sa);
}

/**
 * Follow one layer of air through the cut: starting level z0 (m), along the line x = cx + ca s, n = cn + sa s.
 * The lift grows with the simulated vertical wind, d(eta)/ds = w / U. Returns per-sample { s, eta, q, w, under }.
 */
export function streamline(C, prof, z0, cx, cn, ca, sa, s0, s1, step) {
  const U = alongWind(prof, z0, ca, sa), out = [];
  let eta = 0;
  for (let s = s0; s <= s1 + 1e-6; s += step) {
    const c = cutAt(C, cx + ca * s, cn + sa * s, z0 + eta);
    if (c.under) eta = 0; else eta = Math.max(-1500, Math.min(1500, eta + c.w / U * step * 1000));
    out.push({ s, eta, q: c.q, w: c.w, under: c.under });
  }
  return out;
}
