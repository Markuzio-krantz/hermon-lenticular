// Turns the solver output into fields the renderer can use:
//  - a 3-D cloud-water volume (g/kg) on the inner 64 km box, 0..ZTOP m
//  - per-level displaced streamline heights for particles and the cross-section
//  - near-ground wind reversal (rotor) indicator
export const ZTOP = 8000;

/** Cloud water of level index k (50 m profile grid) lifted by L metres (lift table lookup). */
export function condensate(lt, k, L) {
  if (!(L > 0)) return 0;
  const x = L / lt.step;
  if (x >= lt.nL - 1) return lt.tab[k * lt.nL + lt.nL - 1];
  const i = x | 0, f = x - i, b = k * lt.nL + i;
  return lt.tab[b] * (1 - f) + lt.tab[b + 1] * f;
}
export function liftedRH(lt, k, L) {
  const x = Math.min(lt.nL - 1.001, Math.max(0, L / lt.step)), i = x | 0, f = x - i, b = k * lt.nL + i;
  return lt.rhLift[b] * (1 - f) + lt.rhLift[b + 1] * f;
}

/**
 * @returns {{data: Float32Array, nx, ny, nz, maxQ}} volume indexed [z][y][x], y row 0 = north
 */
export function buildCloudVolume(solver, res, nz = 96, up = 1) {
  const { n, off, inner, H } = solver;
  const nx = inner * up, ny = inner * up, dzv = ZTOP / nz;
  const data = new Float32Array(nx * ny * nz);
  const no = res.outZ.length;
  const ks = res.outZ.map(z => Math.round(z / 50));
  const zdisp = new Float32Array(no), q = new Float32Array(no);
  let maxQ = 0;
  const bil = (arr, fx, fy, b) => arr[b] * (1 - fx) * (1 - fy) + arr[b + 1] * fx * (1 - fy) + arr[b + n] * (1 - fx) * fy + arr[b + n + 1] * fx * fy;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const pi = Math.min(inner - 1.001, Math.max(0, (i + 0.5) / up - 0.5)), pj = Math.min(inner - 1.001, Math.max(0, (j + 0.5) / up - 0.5));
    const i0 = pi | 0, j0 = pj | 0, fx = pi - i0, fy = pj - j0, gi = (j0 + off) * n + (i0 + off);
    const ground = up === 1 ? H[gi] : bil(H, fx, fy, gi);
    for (let o = 0; o < no; o++) {
      const e = up === 1 ? res.eta[o][gi] : bil(res.eta[o], fx, fy, gi);
      zdisp[o] = res.outZ[o] + e;
      q[o] = zdisp[o] < ground + 40 ? 0 : condensate(res.lt, ks[o], e);
    }
    for (let o = 0; o < no - 1; o++) {
      if (q[o] <= 0 && q[o + 1] <= 0) continue;
      let za = zdisp[o], zb = zdisp[o + 1], qa = q[o], qb = q[o + 1];
      if (zb < za) { [za, zb] = [zb, za]; [qa, qb] = [qb, qa]; }
      const v0 = Math.max(0, Math.ceil(za / dzv - 0.5)), v1 = Math.min(nz - 1, Math.floor(zb / dzv - 0.5));
      for (let v = v0; v <= v1; v++) {
        const zc = (v + 0.5) * dzv, f = zb > za ? (zc - za) / (zb - za) : 0;
        const val = qa + (qb - qa) * f;
        const idx = (v * ny + j) * nx + i;
        if (val > data[idx]) data[idx] = val;
        if (val > maxQ) maxQ = val;
      }
    }
  }
  return { data, nx, ny, nz, maxQ, dz: dzv, up };
}

/** Near-ground total along-wind speed; negative = flow reversal under a wave crest (rotor). */
export function rotorField(solver, res, prof) {
  const { n, off, inner, H } = solver;
  const out = new Float32Array(inner * inner);
  const outZ = res.outZ;
  for (let j = 0; j < inner; j++) for (let i = 0; i < inner; i++) {
    const gi = (j + off) * n + (i + off), g = H[gi];
    // first level at least 300 m above ground
    let o = outZ.findIndex(z => z > g + 300);
    if (o < 1 || o >= outZ.length - 1) continue;
    const k = Math.round(outZ[o] / 50), U = Math.hypot(prof.U[k], prof.V[k]);
    const dEta = (res.eta[o + 1][gi] - res.eta[o - 1][gi]) / (outZ[o + 1] - outZ[o - 1]);
    out[j * inner + i] = U * (1 - dEta);                 // u = U(1 - dη/dz) for 2-D incompressible flow
  }
  return out;
}
