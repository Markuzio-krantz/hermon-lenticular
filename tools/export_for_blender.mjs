// Runs the physics for the "sunset reconstruction" preset and writes the cloud-water
// volume (upsampled x2 horizontally) for Blender.  usage: node tools/export_for_blender.mjs out_dir
import fs from 'node:fs';
import { baseProfile, applyParams } from '../web/js/sounding.js';
import { createSolver } from '../web/js/physics.js';
import { buildCloudVolume, ZTOP } from '../web/js/cloudfield.js';
import { PRESETS } from '../web/js/presets.js';

const out = process.argv[2];
const buf = fs.readFileSync('web/data/height_512.f32');
const h = new Float32Array(buf.buffer, buf.byteOffset, 512 * 512);
const s = createSolver(h, 512, 64000);
import { DEFAULTS } from '../web/js/presets.js';
const presetId = process.argv[3] || 'sunset';
const prm = { ...DEFAULTS, ...PRESETS.find(p => p.id === presetId).params };
const prof = applyParams(baseProfile(prm.winds), prm);
const r = s.solve(prof, prm);
const vol = buildCloudVolume(s, r, 160);
// upsample x,y by 2 (bilinear) -> 256 x 256 x 160
const { nx, ny, nz, data } = vol, NX = nx * 2, NY = ny * 2;
const up = new Float32Array(NX * NY * nz);
for (let v = 0; v < nz; v++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const x = Math.min(nx - 1.001, Math.max(0, (i + 0.5) / 2 - 0.5)), y = Math.min(ny - 1.001, Math.max(0, (j + 0.5) / 2 - 0.5));
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, b = v * nx * ny;
  up[(v * NY + j) * NX + i] = data[b + y0 * nx + x0] * (1 - fx) * (1 - fy) + data[b + y0 * nx + x0 + 1] * fx * (1 - fy)
    + data[b + (y0 + 1) * nx + x0] * (1 - fx) * fy + data[b + (y0 + 1) * nx + x0 + 1] * fx * fy;
}
fs.writeFileSync(`${out}/cloud_volume.f32`, Buffer.from(up.buffer));
fs.writeFileSync(`${out}/cloud_volume.json`, JSON.stringify({ nx: NX, ny: NY, nz, extent_m: 64000, ztop_m: ZTOP, maxQ: vol.maxQ, order: 'z,y(north->south),x' }));
console.log('cloud volume', NX, NY, nz, 'maxQ g/kg', vol.maxQ.toFixed(3), 'solve ms', r.ms.toFixed(0));
