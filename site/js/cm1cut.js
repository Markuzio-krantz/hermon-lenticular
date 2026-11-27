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

/** the 3-D layers of a run: { iso Int16[6], me Int16[2], mr Uint8[2] (RH x2), ul Int8 (u x4) }, each [NY][NX] */
export function parse3d(meta, buf) {
  const n = meta.nx * meta.ny, b = new Uint8Array(buf);
  const i16 = (off, count) => new Int16Array(b.slice(off, off + count * 2).buffer);
  const sm = (a, L) => smooth(a, L, meta.nx, meta.ny);
  return { n, iso: sm(i16(0, 6 * n), 6), me: sm(i16(12 * n, 2 * n), 2), mr: b.slice(16 * n, 18 * n), ul: new Int8Array(b.slice(18 * n, 19 * n).buffer) };
}

/**
 * The raw surfaces carry the 400 m grid's turbulence and terrain-hugging spikes; drawn exaggerated they become walls.
 * Two passes of a 5x5 box blur (about 1 km) per layer keep the wave (wavelength ~10 km) and drop the noise.
 */
function smooth(src, layers, nx, ny, r = 2, passes = 2) {
  let a = Float32Array.from(src);
  const t = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let L = 0; L < layers; L++) {
      const o = L * nx * ny;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        let s = 0, c = 0;
        for (let d = -r; d <= r; d++) { const ii = i + d; if (ii >= 0 && ii < nx) { s += a[o + j * nx + ii]; c++; } }
        t[o + j * nx + i] = s / c;
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        let s = 0, c = 0;
        for (let d = -r; d <= r; d++) { const jj = j + d; if (jj >= 0 && jj < ny) { s += t[o + jj * nx + i]; c++; } }
        a[o + j * nx + i] = s / c;
      }
    }
  }
  return a;
}

/** CM1 surfaces are real heights, already large (up to ~700 m at 4.5 km): exaggerate them far less than the quick model */
export const CM1_GAIN = (g) => 1 + (g - 1) * 0.2;

/** bilinear sample of one layer of a [layer][NY][NX] grid at map km x, n; null outside the CM1 box */
export function gridAt(C, arr, layer, x, n) {
  const m = C.meta, dx = x - C.sx, dn = n - C.sn, s = dx * C.ca + dn * C.sa, c = -dx * C.sa + dn * C.ca;
  const fi = (s - m.s0_km) / m.dx_km, fj = (c - m.c0_km) / m.dx_km, nx = m.nx, ny = m.ny;
  if (fi < 0 || fj < 0 || fi >= nx - 1 || fj >= ny - 1) return null;
  const i = fi | 0, j = fj | 0, u = fi - i, v = fj - j, o = layer * nx * ny + j * nx + i;
  return (arr[o] * (1 - u) + arr[o + 1] * u) * (1 - v) + (arr[o + nx] * (1 - u) + arr[o + nx + 1] * u) * v;
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
