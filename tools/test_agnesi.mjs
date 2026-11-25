import { createSolver } from '../web/js/physics.js';
const res = 256, ext = 64000; const h = new Float32Array(res * res);
const a = 5000, H0 = 300;
for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) { const x = (i + 0.5) / res * ext - ext / 2; h[j * res + i] = H0 * a * a / (x * x + a * a); }
const s = createSolver(h, res, ext);
const nz = 321, p = { dz: 50, nz, U: new Float32Array(nz).fill(10), V: new Float32Array(nz), N2: new Float32Array(nz).fill(1e-4), T: new Float32Array(nz).fill(0), RH: new Float32Array(nz).fill(10), p: new Float32Array(nz).fill(700) };
const r = s.solve(p, { blocking: false });
const n = s.n, row = n / 2;
for (const z of [200, 1000, 2000, 3000, 4000, 6000]) { const e = r.eta[r.outZ.indexOf(z)]; let mx = -1e9, imx = 0; for (let i = 0; i < n; i++) { const v = e[row * n + i]; if (v > mx) { mx = v; imx = i; } } console.log(z, 'max', mx.toFixed(1), 'at x(km)', ((imx - n / 2) * s.dx / 1000).toFixed(1)); }
