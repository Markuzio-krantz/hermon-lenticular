// Physics pipeline shared by the Web Worker and the main-thread fallback.
import { baseProfile, applyParams, liftToSaturate } from './sounding.js';
import { createSolver } from './physics.js';
import { buildCloudVolume, rotorField } from './cloudfield.js';
import { diagnostics } from './metrics.js';

let solver = null;

export function initEngine(heights, res, ext) {
  solver = createSolver(heights, res, ext);
  return { n: solver.n, inner: solver.inner, dx: solver.dx };
}

/** Runs one scenario; returns plain typed arrays (transferable). */
export function runScenario(prm) {
  const prof = applyParams(baseProfile(prm.sounding ? { rows: prm.sounding } : prm.winds), prm);
  const res = solver.solve(prof, prm);
  const { n, off, inner, H } = solver;
  // crop eta to the inner box
  const nO = res.outZ.length, cell = inner * inner;
  const eta = new Float32Array(nO * cell);
  const maxLift = new Float32Array(nO), satLift = new Float32Array(nO);
  for (let o = 0; o < nO; o++) {
    let mx = 0;
    const z = res.outZ[o];
    for (let j = 0; j < inner; j++) for (let i = 0; i < inner; i++) {
      const gi = (j + off) * n + i + off, v = res.eta[o][gi];
      eta[o * cell + j * inner + i] = v;
      if (H[gi] < z - 50 && v > mx) mx = v;
    }
    maxLift[o] = mx;
    satLift[o] = Math.min(9999, liftToSaturate(res.lt, Math.round(z / 50)));
  }
  const ground = new Float32Array(cell);
  for (let j = 0; j < inner; j++) for (let i = 0; i < inner; i++) ground[j * inner + i] = H[(j + off) * n + i + off];
  const vol = buildCloudVolume(solver, res, prm.volZ || 128, prm.volUp || 2);
  const rotor = rotorField(solver, res, prof);
  const diag = diagnostics(prof, res, vol, solver);
  return {
    outZ: Float32Array.from(res.outZ), eta, inner, ground, maxLift, satLift,
    vol: vol.data, volDims: [vol.nx, vol.ny, vol.nz], maxQ: vol.maxQ,
    rotor, zd: Float32Array.from(res.zd), ms: res.ms,
    prof: { z: prof.z, T: prof.T, Td: prof.Td, RH: prof.RH, U: prof.U, V: prof.V, N2: prof.N2, theta: prof.theta, p: prof.p, nz: prof.nz, dz: prof.dz },
    lt: { tab: res.lt.tab, rhLift: res.lt.rhLift, nL: res.lt.nL, step: res.lt.step },
    diag: { ...diag, lensT: diag.lensBase ? prof.T[Math.round(diag.lensBase / prof.dz)] : null, lensTopT: diag.lensTop ? prof.T[Math.round(diag.lensTop / prof.dz)] : null },
  };
}

export function transferables(r) {
  return [r.outZ.buffer, r.eta.buffer, r.ground.buffer, r.maxLift.buffer, r.satLift.buffer, r.vol.buffer, r.rotor.buffer, r.zd.buffer];
}
