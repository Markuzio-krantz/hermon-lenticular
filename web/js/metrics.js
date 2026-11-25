// Scalar diagnostics shown in the instrument strip.
const layerMean = (p, arr, z0, z1) => { let s = 0, c = 0; for (let k = Math.round(z0 / p.dz); k <= Math.round(z1 / p.dz); k++) { s += arr(k); c++; } return s / c; };

export function diagnostics(p, res, vol, solver) {
  const speed = (k) => Math.hypot(p.U[k], p.V[k]);
  const Nk = (k) => Math.sqrt(p.N2[k]);
  // Hermon: relief ~2000 m above the foothills, flow at 1.2-2.8 km
  const Uh = layerMean(p, speed, 1200, 2800), Nh = layerMean(p, Nk, 1200, 2800);
  const frHermon = Uh / (Nh * 2000);
  // Ramim / Naftali escarpment: ~700 m above the Hula floor, flow at 0.5-1.2 km
  const Un = layerMean(p, speed, 500, 1200), Nn = layerMean(p, Nk, 500, 1200);
  const frNaftali = Un / (Nn * 700);
  // lens layer
  const Ul = layerMean(p, speed, 3500, 4500), Nl = layerMean(p, Nk, 3500, 4500);
  const lambda = 2 * Math.PI * Ul / Nl;
  // Scorer parameter low vs high
  const l2 = (k) => p.N2[k] / Math.max(1, speed(k) ** 2);
  const l2low = layerMean(p, l2, 1500, 4500), l2high = layerMean(p, l2, 6500, 10000);
  const kTerr = 2 * Math.PI / 10000;
  const trapped = l2low > kTerr * kTerr && l2high < kTerr * kTerr;
  // dominant wind direction at the lens layer (meteorological, from)
  const u = layerMean(p, (k) => p.U[k], 3500, 4500), v = layerMean(p, (k) => p.V[k], 3500, 4500);
  const dirFrom = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
  // freezing level
  let freeze = null; for (let k = 0; k < p.nz; k++) if (p.T[k] <= 0) { freeze = k * p.dz; break; }
  // clouds from the volume
  const { nx, ny, nz, data, dz } = vol;
  let base = Infinity, top = -Infinity, cells = 0, minX = Infinity, maxX = -Infinity, lensCells = 0, lowCells = 0;
  const thr = 0.01;
  for (let v2 = 0; v2 < nz; v2++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = data[(v2 * ny + j) * nx + i];
    if (q > thr) {
      const z = (v2 + 0.5) * dz; cells++;
      const u = vol.up || 1, g = solver.H[(((j / u) | 0) + solver.off) * solver.n + ((i / u) | 0) + solver.off];
      if (z - g > 900) { lensCells++; if (z < base) base = z; if (z > top) top = z; if (i < minX) minX = i; if (i > maxX) maxX = i; }
      else lowCells++;
    }
  }
  const cellKm = 64 / nx;
  // residence time across a typical lens (along-wind width ~ half the wavelength, capped by what is seen)
  const lensWidth = Math.min(lambda / 2, lensCells ? (maxX - minX + 1) * cellKm * 1000 : lambda / 2);
  return {
    frHermon, frNaftali, lambda, l2low, l2high, trapped, dirFrom, speedLens: Ul, Nlens: Nl, freeze,
    zdHermon: res.zd[28], lensBase: isFinite(base) ? base : null, lensTop: isFinite(top) ? top : null,
    lensCells, lowCells, residence: lensWidth / Math.max(1, Ul), maxQ: vol.maxQ,
  };
}
