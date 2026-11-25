import fs from 'node:fs';
import { baseProfile, applyParams } from '../web/js/sounding.js';
import { createSolver } from '../web/js/physics.js';
const buf = fs.readFileSync('web/data/height_512.f32');
const h = new Float32Array(buf.buffer, buf.byteOffset, 512 * 512);
const s = createSolver(h, 512, 64000);
const prm = JSON.parse(process.argv[2] || '{}');
const r = s.solve(applyParams(baseProfile(prm.winds || '12z'), prm), prm);
const n = s.n, o0 = s.off, m = s.inner;
const out = { n: m, outZ: r.outZ, zd: r.zd, H: [], eta: [] };
for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) out.H.push(Math.round(s.H[(j + o0) * n + i + o0]));
for (const e of r.eta) { const a = []; for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) a.push(Math.round(e[(j + o0) * n + i + o0])); out.eta.push(a); }
fs.writeFileSync(process.argv[3], JSON.stringify(out));
