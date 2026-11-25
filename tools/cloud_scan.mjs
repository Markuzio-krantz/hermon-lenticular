import fs from 'node:fs';
import { baseProfile, applyParams, liftToSaturate } from '../web/js/sounding.js';
import { createSolver } from '../web/js/physics.js';
const buf = fs.readFileSync('web/data/height_512.f32');
const h = new Float32Array(buf.buffer, buf.byteOffset, 512 * 512);
const s = createSolver(h, 512, 64000); const n = s.n;
for (const prm of JSON.parse(process.argv[2])) {
  const p = applyParams(baseProfile(prm.winds || '12z'), prm); const r = s.solve(p, prm);
  const rows = [];
  r.outZ.forEach((z, o) => {
    const sat = liftToSaturate(r.lt, Math.round(z / 50)); if (!isFinite(sat)) return;
    let c = 0, sx = 0, sy = 0, mx = 0;
    for (let j = s.off; j < s.off + s.inner; j++) for (let i = s.off; i < s.off + s.inner; i++) {
      const e = r.eta[o][j * n + i]; if (s.H[j * n + i] > z) continue;
      if (e > sat) { c++; sx += i; sy += j; }
      if (e > mx) mx = e;
    }
    if (z % 500 === 0 || c) rows.push(`${z}m sat${sat} max${mx.toFixed(0)}${c ? ` CLOUD n=${c} @(${((sx / c - n / 2) * s.dx / 1000).toFixed(0)}E,${(-(sy / c - n / 2) * s.dx / 1000).toFixed(0)}N)` : ''}`);
  });
  console.log(JSON.stringify(prm), r.ms.toFixed(0) + 'ms\n  ' + rows.join('\n  '));
}
