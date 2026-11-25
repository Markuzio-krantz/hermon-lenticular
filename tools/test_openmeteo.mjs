import fs from 'node:fs';
import { fetchDay, fetchWindow, rowsAt, potential } from '../site/js/openmeteo.js';
import { initEngine, runScenario } from '../web/js/engine.js';
import { DEFAULTS } from '../web/js/presets.js';
const b = fs.readFileSync('web/data/height_512.f32');
initEngine(new Float32Array(b.buffer, b.byteOffset, 512 * 512), 512, 64000);
const h = await fetchDay('2026-11-19');
for (const hr of [10, 13, 16, 19]) {
  const p = potential(h, hr), rows = rowsAt(h, hr);
  const r = runScenario({ ...DEFAULTS, sounding: rows });
  const r2 = runScenario({ ...DEFAULTS, sounding: rows, lensBoost: 10 });
  console.log(h.time[hr], 'score', p.score.toFixed(2), JSON.stringify(Object.fromEntries(Object.entries(p.parts).map(([k, v]) => [k, +v.toFixed(2)]))), 'lens', r.diag.lensCells, 'lens+10', r2.diag.lensCells, 'dir', r.diag.dirFrom.toFixed(0));
}
const w = await fetchWindow();
const sc = w.time.map((t, i) => [t, potential(w, i)?.score ?? -1]).filter((_, i) => i % 3 === 0);
console.log(sc.map(([t, s]) => t.slice(5, 13) + ':' + s.toFixed(2)).join(' '));
