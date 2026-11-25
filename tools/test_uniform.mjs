import fs from 'node:fs';
import { createSolver } from '../web/js/physics.js';
const buf = fs.readFileSync('web/data/height_512.f32');
const h = new Float32Array(buf.buffer, buf.byteOffset, 512 * 512);
const s = createSolver(h, 512, 64000);
const nz = 321;
for (const [U, N, mu] of [[10, 0.01, 6e-5], [10, 0.01, 1e-5], [15, 0.01, 6e-5]]) {
  const p = { dz: 50, nz, U: new Float32Array(nz).fill(U), V: new Float32Array(nz), N2: new Float32Array(nz).fill(N * N), T: new Float32Array(nz).fill(0), RH: new Float32Array(nz).fill(10), p: new Float32Array(nz).fill(700) };
  const r = s.solve(p, { blocking: false, damping: mu });
  console.log(U, N, mu, [500, 1000, 2000, 3000, 4000, 6000].map(z => { const e = r.eta[r.outZ.indexOf(z)]; let mx = 0; for (const v of e) mx = Math.max(mx, Math.abs(v)); return z + ':' + mx.toFixed(0); }).join(' '));
}
