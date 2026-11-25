// Dump the 19.11.2026 sunset atmosphere for the MicroHH experiment -> gpu/case_profile.json
import { writeFileSync } from 'node:fs';
import { baseProfile, applyParams } from '../web/js/sounding.js';
import { DEFAULTS, PRESETS } from '../web/js/presets.js';
const prm = { ...DEFAULTS, ...PRESETS[0].params };
const p = applyParams(baseProfile(prm.winds), prm);
const keys = Object.keys(p).filter((k) => ArrayBuffer.isView(p[k]) || Array.isArray(p[k]));
const out = { dz: p.dz, nz: p.nz, keys };
for (const k of keys) out[k] = Array.from(p[k]).map((v) => +(+v).toFixed(5));
writeFileSync(new URL('./case_profile.json', import.meta.url), JSON.stringify(out));
console.log('dz', p.dz, 'nz', p.nz, 'keys', keys.join(','));
