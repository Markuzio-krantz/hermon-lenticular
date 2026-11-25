// Linear 3-D mountain-wave solver (Boussinesq, non-hydrostatic, layered atmosphere).
// For every horizontal wavevector (k,l) the streamline displacement eta(z) obeys
//   eta'' + m^2 eta = 0,  m^2 = K^2 (N^2/Ω^2 - 1),  Ω = kU + lV - iμ,  K^2 = k^2 + l^2
// in each thin layer (N, U, V constant). Across layers eta and Ω^2 eta' are continuous.
// Top: radiation / decay (Im m > 0). Bottom: eta(0) = effective terrain.
// Solved top-down with exact layer propagators, then inverse 2-D FFT per output level.
// References: Smith (1980) Tellus 32; Durran (1990) in "Atmospheric Processes over Complex Terrain".

import { liftTable } from './sounding.js';

// ---------- FFT (radix-2, in place, separate re/im arrays) ----------
function makeFFT(n) {
  const rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = Math.sin(2 * Math.PI * i / n); }
  return function fft(re, im, off, stride, inv) {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { const a = off + i * stride, b = off + j * stride; let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; } }
    const sgn = inv ? 1 : -1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let s = 0; s < n; s += size) for (let j = 0; j < half; j++) {
        const wr = cs[j * step], wi = sgn * sn[j * step];
        const a = off + (s + j) * stride, b = off + (s + j + half) * stride;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  };
}
function fft2(re, im, n, fft, inv) {
  for (let r = 0; r < n; r++) fft(re, im, r * n, 1, inv);
  for (let c = 0; c < n; c++) fft(re, im, c, n, inv);
  if (inv) { const s = 1 / (n * n); for (let i = 0; i < n * n; i++) { re[i] *= s; im[i] *= s; } }
}

// ---------- complex helpers ----------
const csqrt = (a, b) => { const r = Math.hypot(a, b); let x = Math.sqrt((r + a) / 2), y = Math.sqrt(Math.max(0, (r - a) / 2)); if (b < 0) y = -y; return [x, y]; };

/**
 * @param {Float32Array} h  terrain heights (res x res, row 0 = north), metres MSL
 * @param {number} ext      side length of h in metres
 */
export function createSolver(h, res, ext, opts = {}) {
  const n = opts.n ?? 256, L = opts.domain ?? 2 * ext, dx = L / n;
  const fft = makeFFT(n);
  const inner = Math.round(ext / dx), off = (n - inner) >> 1;           // inner box in physics grid
  // resample terrain to physics grid (inner box) + tapered padding
  const H = new Float32Array(n * n);
  const sample = (x, y) => { // x,y in [0,res)
    x = Math.min(res - 1.001, Math.max(0, x)); y = Math.min(res - 1.001, Math.max(0, y));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * res + x0;
    return h[i] * (1 - fx) * (1 - fy) + h[i + 1] * fx * (1 - fy) + h[i + res] * (1 - fx) * fy + h[i + res + 1] * fx * fy;
  };
  const taper = off * 0.85;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i - off + 0.5) / inner * res - 0.5, v = (j - off + 0.5) / inner * res - 0.5;
    // average a 2x2 block to anti-alias
    let e = 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) e += sample(u + (a - 0.5) * res / inner / 2, v + (b - 0.5) * res / inner / 2);
    e = Math.max(0, e / 4);
    const di = Math.max(0, off - i, i - (off + inner - 1)), dj = Math.max(0, off - j, j - (off + inner - 1));
    const d = Math.hypot(di, dj);
    const w = d <= 0 ? 1 : d >= taper ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * d / taper);
    H[j * n + i] = e * w;
  }
  // local relief max (radius ~6 km) used for the per-obstacle dividing streamline
  const Hmax = maxFilter(H, n, Math.round(6000 / dx));

  return { n, dx, L, off, inner, H, Hmax, solve: (prof, prm) => solve(prof, prm) };

  function solve(prof, prm = {}) {
    const t0 = performance.now();
    // spatial damping: Rayleigh rate proportional to layer wind speed -> wave trains decay
    // over ~1/kappa downstream regardless of speed (keeps the periodic domain clean)
    const kappa = 1 / (prm.decayLength ?? 30000);
    // ---- 1. effective terrain (blocking): air below z_d(H) splits around the obstacle
    const zd = dividingTable(prof);
    const eff = new Float64Array(n * n), effIm = new Float64Array(n * n);
    let maxEff = 0;
    for (let i = 0; i < n * n; i++) {
      const hm = Hmax[i];
      const z0 = prm.blocking === false ? 0 : (prm.blockFactor ?? 0.6) * zdAt(zd, hm);
      eff[i] = Math.max(0, H[i] - z0);
      if (eff[i] > maxEff) maxEff = eff[i];
    }
    fft2(eff, effIm, n, fft, false);
    // ---- 2. layers
    const layers = buildLayers(prof);
    const outZ = [];
    for (let z = 200; z <= 8000; z += 100) outZ.push(z);
    const nOut = outZ.length;
    const outIdx = outZ.map(z => layers.findIndex(l => Math.abs(l.zb - z) < 1));
    // spectral output storage
    const spRe = Array.from({ length: nOut }, () => new Float64Array(n * n));
    const spIm = Array.from({ length: nOut }, () => new Float64Array(n * n));
    const dk = 2 * Math.PI / L, kc = 2 * Math.PI / (prm.minWavelength ?? 2000);
    const nl = layers.length;
    const vRe = new Float64Array(nl + 1), vIm = new Float64Array(nl + 1), sc = new Float64Array(nl + 1);
    let count = 0;
    for (let jy = 0; jy < n; jy++) {
      const ly = (jy <= n / 2 ? jy : jy - n) * dk;
      for (let ix = 0; ix <= n / 2; ix++) {
        const kx = ix * dk;
        if (ix === 0 && jy > n / 2) continue;
        const K2 = kx * kx + ly * ly;
        if (K2 === 0 || K2 > kc * kc) continue;
        count++;
        // ---- top-down integration. state (eta, P = Ω² eta') complex
        // north-up grid: row index grows southward -> y = -j*dy, so l -> -ly for the physical V
        const top = layers[nl - 1];
        let [m2r, m2i] = mSquared(K2, kx * top.U - ly * top.V, kappa * top.S, top.N2);
        let [mr, mi] = csqrt(m2r, m2i);
        if (mi < 0) { mr = -mr; mi = -mi; }
        // eta = 1, eta' = i m eta at the top
        let er = 1, ei = 0, dr = -mi, di = mr;               // eta' = i m
        let logS = 0;
        vRe[nl] = er; vIm[nl] = ei; sc[nl] = 0;
        for (let li = nl - 1; li >= 0; li--) {
          const lay = layers[li];
          const Om = kx * lay.U - ly * lay.V;
          [m2r, m2i] = mSquared(K2, Om, kappa * lay.S, lay.N2);
          [mr, mi] = csqrt(m2r, m2i);
          const d = lay.dz;
          // cos(m d), sin(m d) complex
          const ar = mr * d, ai = mi * d;
          const ch = Math.cosh(ai), sh = Math.sinh(ai);
          const cr = Math.cos(ar) * ch, cim = -Math.sin(ar) * sh;
          const sr = Math.sin(ar) * ch, sim = Math.cos(ar) * sh;
          // sin(md)/m and m sin(md)
          const mm = mr * mr + mi * mi || 1e-30;
          const smr = (sr * mr + sim * mi) / mm, smi = (sim * mr - sr * mi) / mm;
          const msr = mr * sr - mi * sim, msi = mr * sim + mi * sr;
          // eta(z-d) = eta cos - eta' sin/m ; eta'(z-d) = eta m sin + eta' cos
          const ner = er * cr - ei * cim - (dr * smr - di * smi);
          const nei = er * cim + ei * cr - (dr * smi + di * smr);
          const ndr = er * msr - ei * msi + dr * cr - di * cim;
          const ndi = er * msi + ei * msr + dr * cim + di * cr;
          er = ner; ei = nei; dr = ndr; di = ndi;
          // interface below this layer: Ω² eta' continuous -> eta'_below = eta'_above * Ω_above² / Ω_below²
          if (li > 0) {
            const lb = layers[li - 1];
            const Ob = kx * lb.U - ly * lb.V;
            const [rr, ri] = cdiv2(Om, Ob, kappa * lay.S, kappa * lb.S);
            const t = dr * rr - di * ri; di = dr * ri + di * rr; dr = t;
          }
          const s = Math.max(Math.hypot(er, ei), Math.hypot(dr, di) * 300, 1e-300);
          er /= s; ei /= s; dr /= s; di /= s; logS += Math.log(s);
          vRe[li] = er; vIm[li] = ei; sc[li] = logS;
        }
        // ratio eta(z)/eta(0)
        const b0r = vRe[0], b0i = vIm[0], b0 = b0r * b0r + b0i * b0i || 1e-300;
        const idx = jy * n + ix;
        const hr = eff[idx], hi = effIm[idx];
        const jm = (n - jy) % n, im2 = (n - ix) % n, idm = jm * n + im2;
        for (let o = 0; o < nOut; o++) {
          const li = outIdx[o];
          const f = Math.exp(sc[li] - sc[0]);                 // sc[li] <= sc[0]
          if (f < 1e-12) continue;
          const xr = vRe[li] * f, xi = vIm[li] * f;
          const rr = (xr * b0r + xi * b0i) / b0, ri = (xi * b0r - xr * b0i) / b0;
          const pr = hr * rr - hi * ri, pi = hr * ri + hi * rr;
          spRe[o][idx] = pr; spIm[o][idx] = pi;
          if (idm !== idx) { spRe[o][idm] = pr; spIm[o][idm] = -pi; }    // Hermitian
        }
      }
    }
    // ---- 3. inverse FFT, two real levels packed per complex transform
    const eta = [];
    const re = new Float64Array(n * n), im = new Float64Array(n * n);
    for (let o = 0; o < nOut; o += 2) {
      const a = o, b = Math.min(o + 1, nOut - 1);
      for (let i = 0; i < n * n; i++) { re[i] = spRe[a][i] - spIm[b][i]; im[i] = spIm[a][i] + spRe[b][i]; }
      fft2(re, im, n, fft, true);
      eta[a] = Float32Array.from(re);
      if (b !== a) eta[b] = Float32Array.from(im);
    }
    const lt = liftTable(prof);
    return { outZ, eta, zd, lt, maxEff, ms: performance.now() - t0, count, layers };
  }
}

function mSquared(K2, Om, mu, N2) {
  // Ω = Om - iμ ; m² = K² (N²/Ω² - 1)
  const a = Om, b = -mu;
  const o2r = a * a - b * b, o2i = 2 * a * b, den = o2r * o2r + o2i * o2i || 1e-30;
  const ir = o2r / den, ii = -o2i / den;            // 1/Ω²
  return [K2 * (N2 * ir - 1), K2 * N2 * ii];
}
function cdiv2(Oa, Ob, ma, mb) { // (Ωa/Ωb)² with Ω = O - iμ
  const ar = Oa, ai = -ma, br = Ob, bi = -mb, den = br * br + bi * bi || 1e-30;
  const qr = (ar * br + ai * bi) / den, qi = (ai * br - ar * bi) / den;
  return [qr * qr - qi * qi, 2 * qr * qi];
}

function buildLayers(p) {
  const layers = [];
  const add = (zb, zt) => {
    const k0 = Math.floor(zb / p.dz), k1 = Math.min(p.nz - 1, Math.ceil(zt / p.dz));
    let U = 0, V = 0, N2 = 0, c = 0;
    for (let k = k0; k <= k1; k++) { U += p.U[k]; V += p.V[k]; N2 += p.N2[k]; c++; }
    layers.push({ zb, zt, dz: zt - zb, U: U / c, V: V / c, N2: N2 / c, S: Math.max(2, Math.hypot(U / c, V / c)) });
  };
  for (let z = 0; z < 8000; z += 100) add(z, z + 100);
  for (let z = 8000; z < 15000; z += 250) add(z, z + 250);
  return layers;
}

/** Sheppard (1956) dividing streamline: lowest level whose kinetic energy lifts it over height Hc. */
function dividingTable(p) {
  const out = [];
  for (let Hc = 0; Hc <= 3000; Hc += 100) {
    let zd = 0;
    for (let z = Hc; z >= 0; z -= 50) {
      const k = Math.round(z / p.dz);
      const ke = 0.5 * (p.U[k] ** 2 + p.V[k] ** 2);
      let pe = 0;
      for (let zz = z; zz < Hc; zz += 50) pe += p.N2[Math.round(zz / p.dz)] * (Hc - zz) * 50;
      if (pe > ke) { zd = z + 50; break; }
    }
    out.push(Math.min(zd, Hc));
  }
  return out;
}
const zdAt = (t, h) => { const x = Math.min(29.999, Math.max(0, h / 100)), i = x | 0, f = x - i; return t[i] * (1 - f) + t[i + 1] * f; };

function maxFilter(a, n, r) {
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let m = 0; for (let d = -r; d <= r; d++) { const x = i + d; if (x >= 0 && x < n) m = Math.max(m, a[j * n + x]); } tmp[j * n + i] = m; }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let m = 0; for (let d = -r; d <= r; d++) { const y = j + d; if (y >= 0 && y < n) m = Math.max(m, tmp[y * n + i]); } out[j * n + i] = m; }
  return out;
}
