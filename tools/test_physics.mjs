import fs from 'node:fs';
import { baseProfile, applyParams, liftToSaturate } from '../web/js/sounding.js';
import { createSolver } from '../web/js/physics.js';
const buf = fs.readFileSync('web/data/height_512.f32');
const h = new Float32Array(buf.buffer, buf.byteOffset, 512 * 512);
const s = createSolver(h, 512, 64000);
console.log('grid', s.n, 'dx', s.dx, 'inner', s.inner, 'off', s.off);
for (const [name, prm, w] of [['12z real', {}, '12z'], ['00z real', {}, '00z'], ['no blocking', { blocking: false }, '12z'], ['upper boost', { upperBoost: 1.5 }, '12z']]) {
  const p = applyParams(baseProfile(w), prm);
  const r = s.solve(p, prm);
  const lines = [];
  for (const z of [1000, 2000, 3000, 3800, 4300, 5000, 6000, 8000]) {
    const o = r.outZ.indexOf(z); const e = r.eta[o];
    let mx = -1e9, mn = 1e9; for (const v of e) { if (v > mx) mx = v; if (v < mn) mn = v; }
    lines.push(`${z}:${mn.toFixed(0)}..${mx.toFixed(0)}`);
  }
  // cloud count: lift exceeds saturation lift
  let cells = 0; const sat = r.outZ.map(z => liftToSaturate(r.lt, Math.round(z / 50)));
  r.outZ.forEach((z, o) => { for (const v of r.eta[o]) if (v > sat[o]) cells++; });
  console.log(name, `ms=${r.ms.toFixed(0)} k=${r.count} maxEff=${r.maxEff.toFixed(0)} zd(2800)=${r.zd[28]} zd(900)=${r.zd[9]}`, lines.join(' '), 'cloudcells', cells);
}
const p = applyParams(baseProfile('12z'), {});
console.log('sat lift 3800:', liftToSaturate((await import('../web/js/sounding.js')).liftTable(p), 76), ' 4300:', liftToSaturate((await import('../web/js/sounding.js')).liftTable(p), 86), ' 1800:', liftToSaturate((await import('../web/js/sounding.js')).liftTable(p), 36));
for (const z of [1000,1500,2000,2500,3000,3500,4000,5000,7000,10000]) { const k=z/50; console.log(z, 'N', Math.sqrt(p.N2[k]).toFixed(4), 'U', p.U[k].toFixed(1), 'V', p.V[k].toFixed(1), 'l2', (p.N2[k]/(p.U[k]**2+p.V[k]**2)).toExponential(2)); }
