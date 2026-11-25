import fs from 'node:fs';
import { baseProfile, applyParams, liftTable } from '../web/js/sounding.js';
import { createSolver } from '../web/js/physics.js';
import { buildCloudVolume, rotorField } from '../web/js/cloudfield.js';
const buf = fs.readFileSync('web/data/height_512.f32');
const s = createSolver(new Float32Array(buf.buffer, buf.byteOffset, 512 * 512), 512, 64000);
for (let rep = 0; rep < 2; rep++) {
let t = performance.now(); const lap = (l) => { const n = performance.now(); console.log(l, (n - t).toFixed(0)); t = n; };
const p = applyParams(baseProfile('12z'), { lensBoost: 10 }); lap('profile');
const r = s.solve(p, {}); lap('solve(total incl liftTable) inner=' + r.ms.toFixed(0));
liftTable(p); lap('liftTable');
buildCloudVolume(s, r, 96); lap('volume');
rotorField(s, r, p); lap('rotor');
}
