import fs from 'node:fs';
import { initEngine, runScenario } from '../web/js/engine.js';
import { PRESETS, DEFAULTS } from '../web/js/presets.js';
const buf = fs.readFileSync('web/data/height_512.f32');
initEngine(new Float32Array(buf.buffer, buf.byteOffset, 512 * 512), 512, 64000);
for (const ps of PRESETS) {
  const t = performance.now(); const r = runScenario({ ...DEFAULTS, ...ps.params });
  const d = r.diag;
  console.log(ps.id.padEnd(9), (performance.now() - t).toFixed(0) + 'ms', `FrH=${d.frHermon.toFixed(2)} FrN=${d.frNaftali.toFixed(2)} λ=${(d.lambda / 1000).toFixed(1)}km trapped=${d.trapped} dir=${d.dirFrom.toFixed(0)} lens=${d.lensCells}[${d.lensBase}-${d.lensTop}] low=${d.lowCells} res=${d.residence.toFixed(0)}s maxQ=${d.maxQ.toFixed(2)}`);
}
