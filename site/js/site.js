import * as THREE from 'three';
import { createStage } from './stage.js';
import { createCloudRenderer } from './clouds3d.js';
import { createParcels } from './parcels.js';
import { createViz } from './viz.js';
import { createCurtain } from './curtain.js';
import { createXSection } from './xsection.js';
import { createProfileChart } from './profilechart.js';
import { PRESETS, DEFAULTS } from './presets.js';
import { STEPS } from './story.js';
import { initLab, startTour } from './lab.js';
import { initLearn } from './learn.js';
import { initSiteTour } from './sitetour.js';
import { createFocus } from './focus.js';
import { fetchWindow, fetchDay, rowsAt, potential, POINT } from './openmeteo.js';

const $ = (id) => document.getElementById(id);
const mobile = matchMedia('(max-width: 899px), (pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const localIso = () => { const n = new Date(); return new Date(n - n.getTimezoneOffset() * 60000).toISOString(); };

// ---------- data
async function loadHeights(url, n) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = document.createElement('canvas'); cv.width = n; cv.height = n;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0);
  const px = cx.getImageData(0, 0, n, n).data, h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
  return h;
}
const [places, wide] = await Promise.all([fetch('data/places.json').then(r => r.json()), loadHeights('data/wide_height_1024.png', 1024)]);
const phys = new Float32Array(512 * 512);                          // central 64 km of the 128 km grid
for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) phys[j * 512 + i] = Math.max(0, wide[(j + 256) * 1024 + i + 256]);

// ---------- stage
const S = createStage($('stage'), { heights: wide, res: 1024, places, satLowURL: 'data/wide_sat_2048.webp', satURL: `data/wide_sat_${mobile ? 2048 : 4096}.webp`, coreURL: mobile ? null : 'data/core_sat_4096.webp', landURL: 'data/wide_landcover_4096.webp', normalURL: 'data/wide_normal_2048.webp', mobile });
const clouds = createCloudRenderer(S.renderer, { scale: mobile ? 0.5 : 0.7 });
clouds.uniforms.uSteps.value = mobile ? 140 : 220;
const parcels = createParcels(S.scene, mobile ? 2600 : 4500);
const viz = createViz(S.scene, S.groundAt);
const curtain = createCurtain(S.scene, S.groundAt);
const xs = createXSection($('xs'), $('xsTip'));
const chart = createProfileChart($('prof'));

const state = {
  mode: 'story', params: { ...DEFAULTS, ...PRESETS[0].params }, preset: 'sunset',
  exag: 2, sun: -0.6, speed: reduceMotion ? 12 : 40,
  layers: { clouds: true, flow: false, moist: false, labels: true, rotors: false, wind: false, stack: false, curtain: false },
};
let field = null, ref = null;
const tw = { sun: -0.6, sunT: -0.6, cloud: 0, cloudT: 1, loop: null, loopT0: 0 };

// ---------- physics in a worker
let worker = null, engine = null, running = false, pending = false;
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('timeout')), 20000);
    worker.onmessage = (e) => { if (e.data.type === 'ready') { clearTimeout(t); ok(); } else if (e.data.type === 'error') fail(new Error(e.data.message)); };
    worker.onerror = (e) => { clearTimeout(t); fail(e); };
    worker.postMessage({ type: 'init', heights: phys.slice().buffer, res: 512, ext: 64000 });
  });
  worker.onmessage = (e) => { if (e.data.type === 'result') onResult(e.data.r); else { console.error(e.data.message); running = false; $('busy').hidden = true; } };
} catch (err) {
  console.warn('worker unavailable, computing on the main thread', err);
  worker = null; engine = await import('./engine.js'); engine.initEngine(phys, 512, 64000);
}
let fadeNext = false;
function compute(fade = false) {
  fadeNext = fadeNext || fade;
  if (running) { pending = true; return; }
  running = true; $('busy').hidden = false;
  const p = { ...state.params, volUp: mobile ? 1 : 2, volZ: mobile ? 112 : 128 };
  if (worker) worker.postMessage({ type: 'run', params: p });
  else setTimeout(() => onResult(engine.runScenario(p)), 30);
}
function onResult(r) {
  running = false; $('busy').hidden = true; field = r;
  if (fadeNext) { tw.cloud = 0; fadeNext = false; }
  clouds.setVolume(r.vol, r.volDims, r.maxQ);
  parcels.setField(r); parcels.update(0, 0, state.exag);
  viz.field = r; curtain.field = r; xs.setField(r); xs.setBlockFactor(state.params.blockFactor); chart.setField(r);
  if (!ref && state.preset === 'sunset') { ref = r.diag; lab.setReference(r.diag); }
  geometry(); anchors = computeAnchors(r); applyCallouts(); focusRef?.refresh();
  cm1Anchors();
  if (vol && !vol.useCM1) vol.fromField(r);
  else if (vol?.useCM1 && state.mode === 'lab' && !cm1LabNote) { cm1LabNote = true; toast('העננים כאן הם מסימולציית הענן (CM1) של ערב 19.11 ולא משתנים עם המחוונים · לראות את ההשפעה: כפתור CM1 בכלים עובר למודל הגיבוי'); }
  lab.onResult(r, state.params);
  if (state.mode === 'lab') { const v = $('verdict'); say(v.querySelector('strong')?.textContent + '. ' + (v.querySelector('p')?.textContent || '')); }
  S.invalidate();
  if (pending) { pending = false; compute(); }
}
function windAngle() {
  if (!field) return 0; const p = field.prof; let u = 0, v = 0;
  for (let z = 3500; z <= 4500; z += 100) { const k = Math.round(z / p.dz); u += p.U[k]; v += p.V[k]; }
  return Math.atan2(v, u);
}
const HERMON = [12.8, 18.5];
let flowMode = 'curtain';
function geometry() {
  if (!field) return;
  const a = windAngle(), c = HERMON;
  const up = [Math.max(-30, Math.min(30, c[0] - Math.cos(a) * 26)), Math.max(-30, Math.min(30, c[1] - Math.sin(a) * 26))];
  xs.setSlice(c, a, 30); S.setSlice(c, a, 60); viz.setJourney(c, a); curtainPath(c, a);
  parcels.setMode(flowMode, { cx: up[0], cn: up[1], ang: a });
  S.setColumn(field.prof, up);
  S.setRotors(field.rotor, field.inner, field.ground, a);
  viz.setDivideKm(field.diag.zdHermon * state.params.blockFactor / 1000);
  $('xsInfo').textContent = `דרך פסגת החרמון · רוח מ-${Math.round(field.diag.dirFrom)}°`;
}

// ---------- callout anchors from the computed field
let anchors = {}, focusRef = null;
// the formation curtain: with the CM1 clouds on screen it shows the CM1 cut along the wind through the summit
let cm1Cut = null;
function curtainPath(c, a) {
  const F = cm1Cut && vol?.active && vol.useCM1 ? vol.cm1Frame : null;
  if (F) { curtain.setPath([F.sx - F.ca * 3, F.sn - F.sa * 3], Math.atan2(F.sa, F.ca)); curtain.setCM1({ ...cm1Cut, ...F }); }
  else { curtain.setPath([c[0] - Math.cos(a) * 3, c[1] - Math.sin(a) * 3], a); curtain.setCM1(null); }
}
async function loadCM1Cut() {
  const [meta, buf] = await Promise.all([fetch('data/cm1_meta.json').then((r) => r.json()), fetch('data/cm1_xz.bin').then((r) => r.arrayBuffer())]);
  if (!meta.xz) return; cm1Cut = { meta, data: new Uint8Array(buf) };
}
// where the cut's own cloud starts and ends: the labels "enters / leaves the cloud" point there
function cm1CutAnchors(F) {
  const m = cm1Cut.meta, X = m.xz, nx = m.nx, base = F.f * 2 * X.nz * nx + X.nz * nx, d = cm1Cut.data;
  let s0 = Infinity, s1 = -Infinity, zs = 0, n = 0;
  for (let k = 0; k < X.nz; k++) for (let i = 0; i < nx; i++) if (d[base + k * nx + i] > 60) { const s = m.s0_km + i * m.dx_km; s0 = Math.min(s0, s); s1 = Math.max(s1, s); zs += X.z0_km + k * X.dz_km; n++; }
  if (!n) return null; const z = zs / n, at = (s) => [F.sx + s * F.ca, F.sn + s * F.sa, z];
  return { enter: at(s0), exit: at(s1), birth: at((s0 + s1) / 2) };
}
function computeAnchors(r) {
  const [nx, ny, nz] = r.volDims, dz = 8 / nz, cell = 64 / nx, A = {};
  const L = [0, 0, 0, 0], C = [0, 0, 0, 0]; let pk = 0;
  const col = new Float32Array(nx * ny), peakV = new Float32Array(nx * ny), peakZ = new Int16Array(nx * ny);
  for (let v = 0; v < nz; v++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = r.vol[(v * ny + j) * nx + i]; if (q < 0.02) continue;
    const u = nx / r.inner, x = (i + 0.5) * cell - 32, n = 32 - (j + 0.5) * cell, z = (v + 0.5) * dz, g = r.ground[((j / u) | 0) * r.inner + ((i / u) | 0)] / 1000;
    const T = z - g > 0.9 ? L : C; T[0] += x * q; T[1] += n * q; T[2] = Math.max(T[2], z); T[3] += q;
    if (T === L && z > 3.2 && z < 4.8) { col[j * nx + i] += q; if (q > (peakV[j * nx + i] || 0)) { peakV[j * nx + i] = q; peakZ[j * nx + i] = v; } }
  }
  if (L[3]) A.lens = [L[0] / L[3], L[1] / L[3], L[2]];
  // the lens to focus on: the biggest cloud mass at lens height (a 5x5 neighbourhood), not a single bright cell
  for (let j = 2; j < ny - 2; j += 1) for (let i = 2; i < nx - 2; i += 1) {
    if (!col[j * nx + i]) continue; let m = 0;
    for (let b = -2; b <= 2; b++) for (let a2 = -2; a2 <= 2; a2++) m += col[(j + b) * nx + i + a2];
    if (m > pk) { pk = m; A.lensQ = peakV[j * nx + i]; A._pk = [i, j, peakZ[j * nx + i]]; A.lensPeak = [(i + 0.5) * cell - 32, 32 - (j + 0.5) * cell, (peakZ[j * nx + i] + 0.5) * dz]; }
  }
  if (C[3]) A.cap = [C[0] / C[3], C[1] / C[3], C[2]];
  const a = windAngle(), o = Math.round((3800 - r.outZ[0]) / 100), N = r.inner, need = r.satLift[o];
  let best = -1e9, worst = 1e9, prev = null;
  for (let s = -26; s <= 26; s += 0.25) {
    const x = HERMON[0] + Math.cos(a) * s, n = HERMON[1] + Math.sin(a) * s;
    const ci = Math.round((x + 32) / 64 * N - 0.5), rj = Math.round((32 - n) / 64 * N - 0.5);
    if (ci < 0 || rj < 0 || ci >= N || rj >= N) continue;
    const e = r.eta[o * N * N + rj * N + ci];
    if (e > best) { best = e; A.crest = [x, n, 3.8 + e / 1000]; }
    if (e < worst && s > 0) { worst = e; A.trough = [x, n, 3.8 + e / 1000]; }
    if (prev !== null && prev <= need && e > need && !A.enter) A.enter = [x, n, 3.8 + e / 1000];
    if (prev !== null && prev > need && e <= need && A.enter && !A.exit) A.exit = [x, n, 3.8 + e / 1000];
    prev = e;
  }
  A.birth = A.lens || A.crest;
  // the focused lens: length along the wind, thickness, and how many separate plates it has
  if (A._pk) {
    const [pi, pj, pv] = A._pk, at = (i, j, v) => (i < 0 || j < 0 || v < 0 || i >= nx || j >= ny || v >= nz ? 0 : r.vol[(v * ny + j) * nx + i]);
    const wa = windAngle(), dx = Math.cos(wa), dy = -Math.sin(wa); let len = 0;
    for (const sg of [1, -1]) for (let k = 1; k < nx; k++) { if (at(Math.round(pi + sg * dx * k), Math.round(pj + sg * dy * k), pv) < 0.02) break; len += cell; }
    let plates = 0, inside = false, z0 = null, z1 = null;
    for (let v = 0; v < nz; v++) { const w = at(pi, pj, v) >= 0.02 && (v + 0.5) * dz > 2.8; if (w && !inside) plates++; if (w) { z0 ??= (v + 0.5) * dz; z1 = (v + 0.5) * dz; } inside = w; }
    A.lensDims = { len: len + cell, thick: z0 != null ? (z1 - z0 + dz) : 0, plates, base: z0 };
  }
  A.moistLayer = [HERMON[0] - Math.cos(a) * 18, HERMON[1] - Math.sin(a) * 18, 3.8];
  A.upstream = [-24, 8, 5.5]; A.box = [-32, -32, 0.6]; A.shadow = [-6, -12, 0.5];
  const ri = r.rotor.findIndex(v => v < 0);
  if (ri >= 0) { const j = Math.floor(ri / N), i = ri % N; A.rotor = [(i + 0.5) * cell - 32, 32 - (j + 0.5) * cell, r.ground[ri] / 1000 + 0.5]; }
  A.train = A.lens; A.lensHi = A.lens;
  const at = (s, z) => [HERMON[0] + Math.cos(a) * s, HERMON[1] + Math.sin(a) * s, z];
  A.layer1 = at(-23, 3.84); A.gap = at(-18, 4.08); A.layer2 = at(-13, 4.33);
  if (A.crest) { A.birth = [A.crest[0], A.crest[1], 3.8 + (A.crest[2] - 3.8) * 2.5]; }
  return A;
}
const CALLOUT_TEXT = {
  lens: 'עדשות · 3.9 ק"מ', box: 'תחום החישוב · 64×64 ק"מ', upstream: 'רוח מערבית', crest: 'פסגת הגל', trough: 'שקע הגל',
  moistLayer: 'שכבה לחה · 82%', birth: 'כאן האוויר מגיע לרוויה', enter: 'נכנס לענן: מתעבה', exit: 'יוצא: מתאדה',
  shadow: 'העמק כבר בצל', layer1: 'שכבה לחה · 82%', gap: 'שכבה יבשה · 50%', layer2: 'שכבה לחה · 64%', train: 'רכבת עדשות', cap: 'ענן כובע', lensHi: 'עדשה', rotor: 'רוטור',
};
let calloutIds = [];
function applyCallouts() { viz.setCallouts(calloutIds.filter(id => anchors[id]).map(id => ({ id, text: CALLOUT_TEXT[id], at: anchors[id], lift: { rotor: 1.6, shadow: 1.6, exit: 4.2, trough: 4.2, layer1: 1.2, gap: 2.4, layer2: 3.6 }[id] ?? 2.4 }))); }

// ---------- visuals
function applyVisuals() {
  S.setExaggeration(state.exag); clouds.setExag(state.exag); vol?.setExag(state.exag); viz.setExag(state.exag); curtain.setExag(state.exag);
  const L = state.layers;
  parcels.visible = L.flow; S.labels.visible = L.labels; S.rotors.visible = L.rotors; S.column.visible = !!L.wind;
  if (state.mode === 'lab') { tw.sunT = state.sun; tw.loop = null; }
  if (field) geometry();
  S.invalidate();
}
function setSunNow(e) {
  const sun = S.setSun(e), u = clouds.uniforms; vol?.setSunLocal(sun.dir);
  u.uSunDir.value.copy(sun.dir); u.uSunColor.value.copy(sun.color); u.uShadowKm.value = sun.shadowKm;
  const t = THREE.MathUtils.clamp((e + 4) / 12, 0, 1);
  u.uAmbTop.value.setRGB(0.14 + 0.28 * t, 0.15 + 0.32 * t, 0.26 + 0.4 * t);
  u.uAmbBot.value.setRGB(0.11 + 0.18 * t, 0.1 + 0.16 * t, 0.15 + 0.2 * t);
  viz.setShadowKm(sun.shadowKm);
}
function setView(v, ms = 2200) {
  if (v === 'curtain') {
    const a = windAngle(), px = Math.sin(a), pn = -Math.cos(a), c = [HERMON[0] - Math.cos(a) * 3, HERMON[1] - Math.sin(a) * 3], e = state.exag;
    // stand back far enough that the whole cut fits the width, the humidity strip at its upstream end included
    const hf = 2 * Math.atan(Math.tan(S.camera.fov * Math.PI / 360) * S.camera.aspect);
    // portrait phones cannot fit 52 km across: they get the wave over the summit and the cloud, large
    const tall = S.camera.aspect < 0.85, d = tall ? 52 : Math.max(30, Math.min(60, 28 / Math.tan(hf / 2)));
    if (tall) { c[0] += Math.cos(a) * 7; c[1] += Math.sin(a) * 7; }
    S.goToPose([c[0] + px * d, 3.6 * e, -(c[1] + pn * d)], [c[0], 3.6 * e, -c[1]], reduceMotion ? 1 : ms);
  } else S.goTo(v, reduceMotion ? 1 : ms);
  for (const b of $('views').children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
}
for (const b of $('views').children) b.addEventListener('click', () => { setView(b.dataset.v, 1500); if (mobile) { $('views').classList.remove('open'); document.querySelector('[data-t=views]').setAttribute('aria-expanded', 'false'); } });
for (const b of $('maptools').children) b.addEventListener('click', () => {
  const t = b.dataset.t;
  if (t === 'in') S.zoom(0.7);
  if (t === 'out') S.zoom(1.45);
  if (t === 'reset') setView(state.mode === 'lab' ? 'overview' : STEPS[step].view, 1200);
  if (t === 'views') { const open = $('views').classList.toggle('open'); b.setAttribute('aria-expanded', String(open)); if (open) $('views').querySelector('button')?.focus(); }
  if (t === 'share') share();
  if (t === 'quality') { const m = $('qualityMenu'), open = m.hidden; m.hidden = !open; b.setAttribute('aria-expanded', String(open)); if (open) m.querySelector('[aria-checked=true]')?.focus(); }
  if (t === 'focus') setClean(!document.body.classList.contains('clean'));
});


// ---------- layers: one bar on the map, one panel that explains and controls each layer
const LAYERS = [
  { k: 'clouds', name: 'עננים', color: '#ffffff', op: true, def: 1, desc: 'העננים שהמודל מחשב: בכל מקום שבו הגל מרים שכבה לחה מעבר לנקודת הרוויה שלה. נוצרים ומתאדים כשמשנים את התנאים במעבדה.' },
  { k: 'stack', name: 'שכבות אוויר', color: '#48c79a', op: true, alts: true, def: 1, desc: 'שישה משטחים, כל אחד שכבת אוויר בגובה אחר. הצבע הוא הטמפרטורה הפוטנציאלית (θ): כחול נמוכה, כתום גבוהה. כש-θ עולה עם הגובה האוויר יציב, ואז ההר מקמט את המשטחים לגל. התווית ליד כל משטח מראה גובה, טמפרטורה אמיתית ו-θ.' },
  { k: 'moist', name: 'שכבה לחה', color: '#3d8fe8', op: true, def: 0.7, desc: 'השכבות הלחות ב-3.8 וב-4.3 ק"מ, צבועות לפי המרחק מרוויה: כחול כהה רחוק, תכלת קרוב, לבן רווי (שם נוצרת העדשה), וצהוב היכן שהאוויר יורד ומתייבש.' },
  { k: 'curtain', name: 'חתך היווצרות', color: '#8fc6ff', op: true, def: 1, desc: 'חתך אנכי לאורך הרוח דרך החרמון. כל קו הוא שכבת אוויר; הגרף בקצה מראה לחות לפי גובה. הקווים הלחים מלבינים בפסגת הגל: כך נבנית העדשה, שכבה אחר שכבה.' },
  { k: 'flow', name: 'זרימת אוויר', color: '#6fb2ff', desc: 'חבילות אוויר שנעות עם הרוח לאורך קווי הזרם. צהוב יבש, כחול לח, לבן כשהן בתוך ענן. רואים שהאוויר עובר דרך הענן והענן נשאר.' },
  { k: 'wind', name: 'חיצי רוח', color: '#ffe2c4', desc: 'עמוד אוויר במעלה הרוח: חץ לכל קילומטר גובה, באורך שמתאים למהירות, וצבע העמוד לפי הלחות.' },
  { k: 'rotors', name: 'רוטורים', color: '#ff5a4e', desc: 'טבעות אדומות היכן שהרוח ליד הקרקע מתהפכת מתחת לפסגות הגל. אזור מערבולות מסוכן לטיסה.' },
  { k: 'labels', name: 'שמות', color: '#ffd7a8', desc: 'אזורים, פסגות עם גובה, ישובים ונחלים. שמות קטנים מופיעים כשמתקרבים.' },
];
state.op = { clouds: 1, stack: 1, moist: 1, curtain: 1 };
const stackMask = [true, true, true, true, true, true];
let stepBase = {};
function layerTargets() {
  const L = state.layers, b = stepBase;
  const val = (k, d) => (L[k] ? (b[k] || d) * (state.op[k] ?? 1) : 0);
  viz.T.stack = val('stack', 1); viz.T.moist = val('moist', 0.7);
  curtain.T.show = val('curtain', 1);
  if (L.stack || L.moist || L.curtain) { if (state.mode === 'lab' || !b.ampSet) { viz.T.amp = Math.max(viz.T.amp, 1); curtain.T.amp = Math.max(curtain.T.amp, 1); } if (viz.T.gain < 2) viz.T.gain = 2.5; }
  tw.cloudT = val('clouds', 1);
  viz.setStackMask(stackMask);
  S.invalidate();
}
function buildLayerBar() {
  const bar = $('layerMenu'); bar.innerHTML = '';
  for (const l of LAYERS) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.layer = l.k;
    b.innerHTML = `<i class="sw" style="background:${l.color}"></i><span>${l.name}</span>`; b.title = `${l.name}: ${l.desc}`; b.setAttribute('aria-label', l.name);
    b.addEventListener('click', () => { state.layers[l.k] = !state.layers[l.k]; applyVisuals(); layerTargets(); syncLayers(); });
    bar.appendChild(b);
  }
  const more = document.createElement('button'); more.type = 'button'; more.className = 'more-btn'; more.id = 'layerMore';
  more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', 'layerPanel'); more.textContent = 'הסבר ושליטה';
  more.addEventListener('click', () => { const p = $('layerPanel'), open = p.hidden; p.hidden = !open; more.setAttribute('aria-expanded', String(open)); if (open) buildLayerPanel(); });
  bar.appendChild(more);
}
function buildLayerPanel() {
  const p = $('layerPanel');
  p.innerHTML = '<header><h3>שכבות המפה</h3><button class="info" type="button" aria-label="סגירה">×</button></header>';
  p.querySelector('header .info').onclick = () => { p.hidden = true; $('layerMore').setAttribute('aria-expanded', 'false'); };
  for (const l of LAYERS) {
    const it = document.createElement('div'); it.className = 'lp-item';
    it.innerHTML = `<i class="sw" style="background:${l.color}"></i><b>${l.name}</b><button class="switch" type="button" aria-label="${l.name}"></button><p>${l.desc}</p>`
      + (l.op ? `<input type="range" min="0.1" max="1" step="0.05" aria-label="שקיפות: ${l.name}">` : '')
      + (l.alts ? `<div class="alts" role="group" aria-label="גבהים">${[1.5, 2.5, 3.5, 4.5, 5.5, 6.5].map((z, i) => `<button type="button" data-i="${i}"><i style="background:${['#3f7df0', '#3fb0e0', '#48c79a', '#c7c34a', '#f0a043', '#f06a3c'][i]}"></i>${z} ק"מ</button>`).join('')}</div>` : '');
    const sw = it.querySelector('.switch');
    sw.onclick = () => { state.layers[l.k] = !state.layers[l.k]; applyVisuals(); layerTargets(); syncLayers(); };
    const r = it.querySelector('input'); if (r) { r.value = state.op[l.k]; r.oninput = () => { state.op[l.k] = +r.value; layerTargets(); }; }
    for (const a of it.querySelectorAll('.alts button')) a.onclick = () => { const i = +a.dataset.i; stackMask[i] = !stackMask[i]; if (!state.layers.stack) state.layers.stack = true; layerTargets(); syncLayers(); };
    p.appendChild(it);
  }
  syncLayers();
}
function syncLayers() {
  for (const b of $('layerMenu').querySelectorAll('[data-layer]')) b.setAttribute('aria-pressed', String(!!state.layers[b.dataset.layer]));
  $('layerPanel').querySelectorAll('.lp-item').forEach((it, i) => it.querySelector('.switch').setAttribute('aria-pressed', String(!!state.layers[LAYERS[i].k])));
  $('layerPanel').querySelectorAll('.alts button').forEach((a) => a.setAttribute('aria-pressed', String(stackMask[+a.dataset.i])));
}
buildLayerBar();

// ---------- legends beside the map
const LEGEND = {
  wind: [['#e0b062', 'אוויר יבש'], ['#6fb2ff', 'אוויר לח'], ['#ffffff', 'אוויר שהתעבה']],
  layers: [['#3f7df0', 'θ נמוכה · 1.5 ק"מ'], ['#48c79a', 'θ בינונית · 3.5 ק"מ'], ['#f06a3c', 'θ גבוהה · 6.5 ק"מ'], ['transparent', 'θ = טמפרטורה פוטנציאלית']],
  wave: [['#3f7df0', 'שכבה נמוכה'], ['#f06a3c', 'שכבה גבוהה'], ['#ffffff', 'בהיר יותר: האוויר הורם'], ['transparent', 'הגל מוגדל פי 2.5 לתצוגה']],
  moist: [['#e0b062', 'יורד ומתייבש'], ['#3d8fe8', 'לח, רחוק מרוויה'], ['#bfe6ff', 'קרוב לרוויה'], ['#ffffff', 'רווי: נוצר ענן'], ['transparent', 'הגל מוגדל לתצוגה']],
  through: [['#6fb2ff', 'החבילה בדרך למעלה'], ['#ffffff', 'בתוך הענן'], ['#e0b062', 'יורדת ומתאדה']],
  curtain: [['#5aa9ff', 'שכבה לחה'], ['#e0b062', 'שכבה יבשה'], ['#ffffff', 'התעבתה: ענן'], ['transparent', 'הגל מוגדל פי 2.5 לתצוגה']],
  light: [['#2a1c48', 'מתחת לגבול: כבר בצל'], ['#ff9ab6', 'גבול הצל של כדור הארץ']],
  family: [['#ff5a4e', 'רוטור: הרוח ליד הקרקע מתהפכת']],
};
LEGEND.birth = LEGEND.curtain; LEGEND.moist = LEGEND.curtain;
function legend(id) { const L = LEGEND[id], html = L ? L.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('') : ''; $('legend').innerHTML = html; $('legendInline').innerHTML = html; }


// ---------- original photos beside the map
function showPhoto(on) {
  const s = STEPS[step], p = $('pip');
  if (on && s?.photo) { $('pipImg').src = s.photo[0]; $('pipImg').alt = s.photo[1]; $('pipCap').textContent = s.photo[1]; }
  p.hidden = !(on && s?.photo); $('photoBtn').setAttribute('aria-pressed', String(!p.hidden));
  if (!p.hidden) focusOnly('photo');
}
$('photoBtn').addEventListener('click', () => showPhoto($('pip').hidden));
$('pipClose').addEventListener('click', () => showPhoto(false));

// ---------- status for screen readers, toast, share links
const say = (t) => { $('srStatus').textContent = t; };
let toastT = 0;
function toast(t) {
  const el = $('toast'); el.textContent = t; el.hidden = false;
  if (innerWidth < 900) { const st = $('story'), r = st && !st.hidden && st.getClientRects().length ? st.getBoundingClientRect() : null; el.style.top = 'auto'; el.style.bottom = `${r ? innerHeight - r.top + 10 : 90}px`; } else { el.style.top = el.style.bottom = ''; } clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2200); }
function setHash(h) { try { history.replaceState(null, '', `#${h}`); } catch { /* ignore */ } }
const SHARE_KEYS = ['windScale', 'stabilityScale', 'lensBoost', 'layer2Boost', 'moistShift', 'uniformDir', 'upperBoost', 'rhOffset', 'blockFactor', 'decayLength'];
function labHash() {
  const o = { p: state.preset }; for (const k of SHARE_KEYS) if (state.params[k] != null && state.params[k] !== DEFAULTS[k]) o[k] = state.params[k];
  return 'lab=' + btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '');
}
async function share() {
  const h = state.mode === 'lab' ? labHash() : `s${step + 1}`; setHash(h);
  const url = location.href;
  try { await navigator.clipboard.writeText(url); toast('הקישור הועתק'); } catch { prompt?.('העתיקו את הקישור', url); }
}
$('labShare').addEventListener('click', share);
function readHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (/^s\d+$/.test(h)) return { step: Math.min(STEPS.length, Math.max(1, +h.slice(1))) - 1 };
  if (h.startsWith('lab=')) { try { return { lab: JSON.parse(decodeURIComponent(escape(atob(h.slice(4))))) }; } catch { return null; } }
  if (h === 'lab') return { lab: {} };
  return null;
}

// ---------- clean screen: the map and nothing else but the story bar
function setClean(on) {
  document.body.classList.toggle('clean', on);
  const b = document.querySelector('[data-t=focus]'); b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on ? 'החזרת הכפתורים' : 'הסתרת הכפתורים: רק המפה');
  if (on && state.mode === 'story' && !$('story').classList.contains('min')) $('storyMin').click();
  if (on) { closeFloating(); toast('מסך נקי · H או העין מחזירים את הכפתורים'); }
  fitFrame();
}
document.addEventListener('keydown', (e) => { if ((e.key === 'h' || e.key === 'ה') && !e.target.closest?.('input, select, textarea')) setClean(!document.body.classList.contains('clean')); });
// ---------- keep the subject out from under the cards
function fitFrame() {
  requestAnimationFrame(() => {
    const card = state.mode === 'lab' ? $('lab') : $('story');
    if (!card || card.hidden) { S.setFrameOffset(0, 0); return; }
    const r = card.getBoundingClientRect();
    if (innerWidth >= 900) S.setFrameOffset(Math.round(Math.min(r.width, innerWidth * 0.4) / 2), 0);
    else S.setFrameOffset(0, Math.round(Math.min(r.height, innerHeight * 0.5) * 0.45));
  });
}
addEventListener('resize', fitFrame);
for (const id of ['storyMin', 'labMin', 'sheetBtn']) $(id).addEventListener('click', fitFrame);

// ---------- keyboard: Escape closes whatever floats; focus stays inside open panels
function closeFloating() {
  let closed = false;
  if (!$('probe').hidden) { $('probe').hidden = true; closed = true; S.invalidate(); }
  if (!$('layerPanel').hidden) { $('layerPanel').hidden = true; $('layerMore')?.setAttribute('aria-expanded', 'false'); $('layerMore')?.focus(); closed = true; }
  if ($('views').classList.contains('open')) { $('views').classList.remove('open'); document.querySelector('[data-t=views]').setAttribute('aria-expanded', 'false'); closed = true; }
  if (!$('pip').hidden) { showPhoto(false); closed = true; }
  if (!$('qualityMenu').hidden) { $('qualityMenu').hidden = true; document.querySelector('[data-t=quality]').setAttribute('aria-expanded', 'false'); closed = true; }
  if (learn.isOpen) { learn.close(); closed = true; }
  return closed;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('.coach')) { if (closeFloating()) e.preventDefault(); }
  if (e.key === 'Tab' && !$('layerPanel').hidden && $('layerPanel').contains(document.activeElement)) {
    const f = [...$('layerPanel').querySelectorAll('button, input')]; if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
  }
});
new MutationObserver(() => { if (!$('layerPanel').hidden) setTimeout(() => $('layerPanel').querySelector('button')?.focus(), 30); }).observe($('layerPanel'), { attributes: true, attributeFilter: ['hidden'] });


// ---------- learn: topics beside the lab
const STEP_TOPIC = { scene: 'shadow', map: 'model', wind: 'wave', layers: 'stability', wave: 'wave', moist: 'saturation', birth: 'saturation', through: 'ice', light: 'shadow', train: 'scorer', family: 'family', lab: 'model' };
const TOPIC_NAME = { stability: 'יציבות', wave: 'גל עומד', saturation: 'רוויה ונקודת טל', froude: 'חסימה', scorer: 'לכידת גלים', shadow: 'צל כדור הארץ', ice: 'טיפות וקרח', family: 'משפחת העננים', model: 'איך זה מחושב' };
const learn = initLearn($('learn'), (tr) => {
  if (state.mode !== 'lab') setMode('lab');
  lab.setPreset('sunset', false);
  Object.assign(state.params, tr.params || {}); state.preset = null;
  Object.assign(state.layers, { flow: false, moist: false, stack: false, curtain: false, rotors: false, wind: false, clouds: true }, tr.layers || {});
  if (tr.sun != null) state.sun = tr.sun;
  lab.sync(); compute(true); applyVisuals(); layerTargets(); syncLayers(); setView(tr.view || 'overview');
  $('lab').classList.remove('min'); $('labMin').setAttribute('aria-pressed', 'false');
  if (tr.research) $('research').open = true;
  if (tr.slider) {
    const row = $('c-' + tr.slider)?.closest('.ctl');
    if (row) { row.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' }); row.classList.remove('pulse'); void row.offsetWidth; row.classList.add('pulse'); }
  }
  if (mobile) learn.close();
  toast(`${tr.label}: הזיזו את המחוון המסומן וראו מה קורה לעדשה`);
});
const openLearn = (id, from) => { focusOnly('learn'); learn.open(id, from); };
$('learnBtn').addEventListener('click', () => (learn.isOpen ? learn.close() : openLearn(null, $('learnBtn'))));
$('stepLearn').addEventListener('click', (e) => openLearn(e.currentTarget.dataset.topic, e.currentTarget));
$('readouts').addEventListener('click', (e) => { const b = e.target.closest?.('[data-topic]'); if (b) openLearn(b.dataset.topic, b); });

// ---------- story director
let step = 0, playing = false, stepT0 = performance.now();
const segs = $('segs');
STEPS.forEach((s, i) => {
  const li = document.createElement('li'), b = document.createElement('button');
  b.type = 'button'; b.setAttribute('aria-label', `שלב ${i + 1}: ${s.title}`); b.innerHTML = '<i><b></b></i>';
  b.addEventListener('click', () => { setPlaying(false); go(i); });
  li.appendChild(b); segs.appendChild(li);
});
function go(i) {
  step = Math.max(0, Math.min(STEPS.length - 1, i)); stepT0 = performance.now();
  const s = STEPS[step];
  $('stepNo').textContent = `שלב ${step + 1} מתוך ${STEPS.length}`;
  $('stepTitle').textContent = s.title; $('stepLine').textContent = s.line;
  $('stepMore').querySelector('p').textContent = s.more; $('stepMore').open = false;
  const topic = STEP_TOPIC[s.id]; const sl = $('stepLearn'); sl.hidden = !topic;
  if (topic) { sl.dataset.topic = topic; sl.textContent = `ללמוד עוד: ${TOPIC_NAME[topic]} ←`; }
  $('prev').disabled = step === 0;
  $('next').querySelector('.lbl').textContent = s.cta ? 'למעבדה' : 'הבא'; $('next').setAttribute('aria-label', s.cta ? 'למעבדה' : 'השלב הבא');
  [...segs.querySelectorAll('button')].forEach((b, k) => { b.classList.toggle('done', k < step); b.setAttribute('aria-current', String(k === step)); b.querySelector('b').style.width = '0'; });
  const preset = s.preset || state.preset;
  if (preset !== state.preset || !field) { lab.setPreset(preset, false); compute(true); }
  viz.target(s.viz); curtain.target(s.curtain || {});
  tw.sunT = s.sun; tw.loop = s.sunLoop || null; tw.loopT0 = performance.now();
  tw.cloudT = s.clouds;
  state.layers.flow = !!s.flow; flowMode = s.flow === 'all' ? 'all' : 'curtain';
  state.layers.rotors = !!s.rotors; state.layers.wind = !!s.column; state.layers.clouds = s.clouds > 0; state.layers.moist = !!(s.viz.moist);
  state.layers.stack = !!s.viz.stack; state.layers.curtain = !!(s.curtain && s.curtain.show);
  stepBase = { stack: s.viz.stack, moist: s.viz.moist, curtain: s.curtain?.show, clouds: s.clouds, ampSet: true };
  S.labels.focus(s.focus || null);
  calloutIds = s.callouts || []; applyCallouts();
  legend(s.id);
  $('photoBtn').hidden = !s.photo; showPhoto(false);
  $('studioCta').hidden = !['wave', 'moist', 'birth', 'through'].includes(s.id);
  setHash(`s${step + 1}`);
  say(`שלב ${step + 1} מתוך ${STEPS.length}: ${s.title}. ${s.line}`);
  applyVisuals(); setView(s.view); syncLayers(); fitFrame();
}
function setPlaying(p) { playing = p; $('play').setAttribute('aria-pressed', String(p)); $('play').setAttribute('aria-label', p ? 'עצירה' : 'הפעלה אוטומטית'); stepT0 = performance.now(); }
$('play').addEventListener('click', () => setPlaying(!playing));
$('prev').addEventListener('click', () => { setPlaying(false); go(step - 1); });
$('next').addEventListener('click', () => { if (STEPS[step].cta) setMode('lab'); else go(step + 1); });
document.addEventListener('keydown', (e) => {
  if (state.mode !== 'story' || e.target.closest?.('input, select, textarea, dialog')) return;
  if (e.key === 'ArrowLeft') { setPlaying(false); go(step + 1); }        // RTL: left moves forward
  if (e.key === 'ArrowRight') { setPlaying(false); go(step - 1); }
  if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setPlaying(!playing); }
});

// ---------- modes
function setMode(m) {
  state.mode = m;
  $('story').hidden = m !== 'story'; $('lab').hidden = m !== 'lab';
  $('modeBtn').setAttribute('aria-pressed', String(m === 'lab')); $('modeBtn').textContent = m === 'lab' ? 'חזרה לסיפור' : 'מעבדה';
  setPlaying(false);
  if (m === 'lab') {
    calloutIds = []; viz.setCallouts([]); legend(null); S.labels.focus(null);
    state.layers = { clouds: true, flow: true, moist: false, labels: true, rotors: false, wind: false, stack: false, curtain: false }; flowMode = 'curtain'; tw.cloudT = 1;
    stepBase = {}; viz.target({ amp: 1, gain: 2.5 }); curtain.target({ amp: 1 }); layerTargets(); syncLayers();
    if (state.preset !== 'sunset' || state.params.sounding) lab.setPreset('sunset', true);
    lab.sync(); applyVisuals(); setView('overview'); setHash('lab'); say('המעבדה פתוחה. שנו רוח, יציבות ולחות וראו איך העדשה משתנה.'); fitFrame();
  } else go(step);
}
$('modeBtn').addEventListener('click', () => setMode(state.mode === 'lab' ? 'story' : 'lab'));
$('sheetBtn').addEventListener('click', () => $('lab').classList.toggle('full'));
for (const [btn, card, onTxt, offTxt] of [['storyMin', 'story', 'הצגת ההסבר', 'הסתרת ההסבר'], ['labMin', 'lab', 'פתיחת המעבדה', 'מזעור המעבדה']]) {
  $(btn).addEventListener('click', () => {
    const min = $(card).classList.toggle('min');
    $(btn).setAttribute('aria-pressed', String(min)); $(btn).setAttribute('aria-label', min ? onTxt : offTxt);
  });
}
$('aboutBtn').addEventListener('click', () => $('about').showModal());
// about: two tabs, the story and science / the development and code
{
  const tabs = [$('tabStory'), $('tabDev')];
  const pick = (t) => { for (const b of tabs) { const on = b === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $(b.getAttribute('aria-controls')).hidden = !on; } $('about').scrollTop = 0; };
  tabs.forEach((b, k) => { b.onclick = () => pick(b); b.onkeydown = (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const n = tabs[(k + 1) % 2]; pick(n); n.focus(); } }; });
  $('aboutTour').addEventListener('click', () => { $('about').close(); siteTour.start(); });
}

// ---------- lab
const lab = initLab({ state, PRESETS, DEFAULTS, onParams: () => compute(), onVisual: applyVisuals });
$('tourBtn').addEventListener('click', startTour);
// clean, cinematic look at the lenses as they are now: sunset light, no helper layers, lab folded
$('beautyBtn').addEventListener('click', () => {
  Object.assign(state.layers, { clouds: true, flow: false, moist: false, stack: false, curtain: false, wind: false, rotors: false, labels: false });
  state.sun = -0.4; state.op.clouds = 1;
  $('lab').classList.add('min'); $('labMin').setAttribute('aria-pressed', 'true');
  lab.sync(); applyVisuals(); layerTargets(); syncLayers(); setView('hula', 2400);
});
const NOTES = {
  thermo: 'אדום: טמפרטורה. כחול: נקודת טל. כשהקווים קרובים, האוויר לח. רצועות כתומות: אינוורסיה.',
  wind: 'מהירות הרוח (צהוב) והיציבות N (סגול) לפי גובה. הקווקווים מימין: כיוון הרוח בכל גובה.',
  lift: 'העמודות: כמה צריך להרים כל שכבה כדי שתתעבה. הקו הוורוד: כמה הגל מרים בפועל. היכן שהקו עובר את העמודה, נוצר ענן.',
  scorer: 'פרמטר סקורר ℓ². כשהוא יורד עם הגובה אל משמאל לקווים המקווקווים, הגל נלכד ונוצרת רכבת עננים.',
};
function setChart(v) { chart.setView(v); $('chartNote').textContent = NOTES[v]; for (const b of $('chartTabs').children) b.setAttribute('aria-selected', String(b.dataset.c === v)); }
for (const b of $('chartTabs').children) b.addEventListener('click', () => setChart(b.dataset.c));
setChart('lift');

// real atmosphere (Open-Meteo)
let win = null;
const hourSel = $('hour');
for (let h = 0; h < 24; h++) { const o = document.createElement('option'); o.value = h; o.textContent = `${String(h).padStart(2, '0')}:00`; hourSel.appendChild(o); }
function useRows(rows, label) {
  if (!rows) { $('src').textContent = 'אין נתונים לשעה הזו.'; return; }
  state.params = { ...DEFAULTS, uniformDir: state.params.uniformDir, sounding: rows };
  lab.clearPreset();
  $('src').innerHTML = `מקור: <b>Open-Meteo</b> · ${label} · ${POINT.name}. נתוני מודל בשכבות של כ-1 ק"מ מחליקים שכבות לחות דקות; אפשר להוסיף לחות במחוונים.`;
  compute(true);
}
async function loadDay() {
  const d = $('date').value, h = +hourSel.value; if (!d) return;
  $('src').textContent = 'טוען נתונים…';
  try { useRows(rowsAt(await fetchDay(d), h), `${d.split('-').reverse().join('.')} ${String(h).padStart(2, '0')}:00`); }
  catch (e) { $('src').textContent = `הטעינה נכשלה: ${e.message}`; }
}
$('date').addEventListener('change', loadDay); hourSel.addEventListener('change', loadDay);
function pickWindow(i) {
  const t = win.time[i]; $('date').value = t.slice(0, 10); hourSel.value = +t.slice(11, 13);
  for (const b of $('timeline').children) b.setAttribute('aria-pressed', String(+b.dataset.i === i));
  useRows(rowsAt(win, i), `${t.slice(8, 10)}.${t.slice(5, 7)} ${t.slice(11, 16)}`);
}
let timelineBuilt = false;
async function buildTimeline() {
  if (timelineBuilt) return; timelineBuilt = true;
  try { win = await fetchWindow(); } catch { $('timeline').textContent = 'לא הצלחתי לטעון את נתוני השבוע.'; return; }
  const tl = $('timeline'), nowIso = localIso().slice(0, 13); let nowBtn = null;
  for (let i = 0; i < win.time.length; i += 3) {
    const p = potential(win, i); if (!p) continue;
    const t = win.time[i], b = document.createElement('button'); b.type = 'button'; b.dataset.i = i;
    b.className = (p.score > 0.5 ? 'hi ' : '') + (t.endsWith('00:00') ? 'day' : '');
    if (t.endsWith('00:00')) b.dataset.day = `${t.slice(8, 10)}.${t.slice(5, 7)}`;
    b.setAttribute('aria-label', `${t.slice(8, 10)}.${t.slice(5, 7)} ${t.slice(11, 16)}: היתכנות ${Math.round(p.score * 100)}%`); b.title = b.getAttribute('aria-label');
    b.innerHTML = `<i style="height:${Math.max(3, p.score * 52)}px"></i>`;
    b.addEventListener('click', () => pickWindow(i));
    tl.appendChild(b); if (t <= nowIso) nowBtn = b;
  }
  if (nowBtn) { nowBtn.classList.add('now'); tl.scrollLeft = nowBtn.offsetLeft - tl.clientWidth / 2; }
}
$('research').addEventListener('toggle', () => { if ($('research').open) buildTimeline(); });
for (const b of $('quick').children) b.addEventListener('click', () => {
  const q = b.dataset.q;
  if (q === 'event') { lab.setPreset('sunset', true); $('date').value = '2026-11-19'; hourSel.value = 16; }
  if (q === 'eventModel') { $('date').value = '2026-11-19'; hourSel.value = 16; loadDay(); }
  if (q === 'now') { $('date').value = localIso().slice(0, 10); hourSel.value = new Date().getHours(); loadDay(); }
  if (q === 'best' && win) {
    const nowIso = localIso().slice(0, 13); let bi = -1, bs = -1;
    for (let i = 0; i < win.time.length; i += 3) { if (win.time[i] < nowIso) continue; const p = potential(win, i); if (p && p.score > bs) { bs = p.score; bi = i; } }
    if (bi >= 0) pickWindow(bi);
  }
});
$('date').value = '2026-11-19'; hourSel.value = 16;

// ---------- tap the map: what happens here
const probeEl = $('probe');
const pin = new THREE.Group();
pin.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff8fb0 })));
const pinLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0xff8fb0 }));
pin.add(pinLine); pin.visible = false; S.scene.add(pin);
const nearPlace = (x, n) => { let best = null, bd = 6; for (const p of places) { const d = Math.hypot(p.p[0] - x, p.p[1] - n); if (d < bd && p.t !== 'region') { bd = d; best = p; } } return best; };
function volAt(x, n, zKm) {
  if (!field) return 0;
  const [nx, ny, nz] = field.volDims;
  const i = Math.floor((x + 32) / 64 * nx), j = Math.floor((32 - n) / 64 * ny), v = Math.floor(zKm / 8 * nz);
  if (i < 0 || j < 0 || v < 0 || i >= nx || j >= ny || v >= nz) return 0;
  return field.vol[(v * ny + j) * nx + i];
}
function cloudOnRay(ndc) {
  if (!field || !state.layers.clouds) return null;
  const r = S.pickRay(ndc), p = r.origin.clone(), d = r.direction.clone();
  for (let k = 0; k < 900; k++) {
    p.addScaledVector(d, 0.25);
    const z = p.y / state.exag;
    if (z < 0) break;
    if (volAt(p.x, -p.z, z) > 0.03) return [p.x, -p.z, z];
  }
  return null;
}
function column(x, n) {
  let base = null, top = null;
  for (let z = 0.05; z < 8; z += 0.0833) if (volAt(x, n, z) > 0.02) { base ??= z; top = z; }
  return base == null ? null : [base, top];
}
function etaAtPoint(x, n, z) {
  const N = field.inner, o = Math.round((z - field.outZ[0]) / 100), c = Math.round((x + 32) / 64 * N - 0.5), r = Math.round((32 - n) / 64 * N - 0.5);
  return c < 0 || r < 0 || c >= N || r >= N ? null : field.eta[o * N * N + r * N + c];
}
const km = (v) => `⁦${v.toFixed(1)}⁩ ק"מ`;
const span = (c) => Math.abs(c[1] - c[0]) < 0.15 ? km((c[0] + c[1]) / 2) : `${km(c[0])} עד ${km(c[1])}`;
function showProbe(clientX, clientY, ndc) {
  const hitCloud = cloudOnRay(ndc), g = S.pickGround(ndc);
  if (!hitCloud && !g) { probeEl.hidden = true; pin.visible = false; S.invalidate(); return; }
  const [x, n] = hitCloud || g, ground = S.groundAt(x, n), place = nearPlace(x, n), inBox = Math.abs(x) < 32 && Math.abs(n) < 32;
  const d = field?.diag;
  let html;
  if (hitCloud) {
    const k = Math.round(hitCloud[2] * 1000 / field.prof.dz), T = field.prof.T[k], col = column(x, n);
    html = `<h3>${col && col[0] - ground / 1000 < 0.9 ? 'ענן כובע' : 'עדשה'}</h3><small>${place ? `מעל ${place.n}` : 'מעל נקודה במפה'}</small>
      <dl><dt>גובה</dt><dd>${col ? span(col) : km(hitCloud[2])}</dd>
      <dt>טמפרטורה</dt><dd>⁦${T.toFixed(1)}°C⁩ ${T < -15 ? '· חלק מהטיפות קופאות' : '· טיפות מים'}</dd>
      <dt>רוח בתוכו</dt><dd>⁦${Math.round(d.speedLens)} m/s⁩ מ-${Math.round(d.dirFrom)}°</dd>
      <dt>זמן חצייה</dt><dd>כ-${Math.max(1, Math.round(d.residence / 60))} דקות</dd></dl>
      <p>האוויר זורם דרך הענן ומתחלף כל כמה דקות. הענן נשאר כי פסגת הגל נשארת במקום.</p>`;
  } else {
    html = `<h3>${place ? place.n : 'נקודה במפה'}</h3><small>גובה הקרקע ⁦${Math.round(ground)} מ'⁩</small>`;
    if (inBox && field) {
      const e = etaAtPoint(x, n, 3800), need = field.satLift[Math.round((3800 - field.outZ[0]) / 100)], col = column(x, n);
      html += `<dl><dt>הגל ב-3.8 ק"מ</dt><dd>${e >= 0 ? `מרים את האוויר ב-${Math.round(e)} מ'` : `מוריד את האוויר ב-${Math.round(-e)} מ'`}</dd>
        <dt>כדי להתעבות</dt><dd>צריך הרמה של ${Math.round(need)} מ'</dd>
        <dt>ענן מעל</dt><dd>${col ? span(col) : 'אין'}</dd></dl>
        <p>${e > need ? 'כאן פסגת הגל מרימה את השכבה הלחה מעבר לרוויה, ולכן יש כאן ענן.' : e > 0 ? 'הגל מרים כאן את האוויר, אבל לא מספיק כדי להגיע לרוויה.' : 'כאן האוויר יורד ומתחמם, ולכן לא נוצר ענן.'}</p>`;
    } else html += '<p>מחוץ לריבוע המקווקו: כאן לא מחושבים גלים, רק המפה.</p>';
  }
  probeEl.innerHTML = `<button class="x" type="button" aria-label="סגירה">×</button>${html}`;
  probeEl.querySelector('.x').onclick = () => { probeEl.hidden = true; pin.visible = false; S.invalidate(); };
  probeEl.hidden = false;
  const w = probeEl.offsetWidth, h = probeEl.offsetHeight;
  // beside the tapped point, never on top of it
  const side = clientX + 28 + w < innerWidth - 12 ? clientX + 28 : clientX - 28 - w;
  probeEl.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, side))}px`;
  probeEl.style.top = `${Math.max(60, Math.min(innerHeight - h - 12, clientY - h / 2))}px`;
  const zTop = hitCloud ? hitCloud[2] : ground / 1000;
  pin.position.set(x, (ground / 1000) * state.exag, -n);
  pinLine.scale.y = Math.max(0.6, (zTop - ground / 1000) * state.exag + 0.6);
  pin.visible = true; S.invalidate();
  $('hint').classList.add('gone');
}
let down = null;
S.renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; $('hint').classList.add('gone'); });
S.renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 450) return;
  const r = S.renderer.domElement.getBoundingClientRect();
  showProbe(e.clientX, e.clientY, new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1));
});

// ---------- loop: render only when something moves
let last = performance.now(), lastCull = 0, lastXs = 0;
let slowAvg = 16, lastMove = performance.now(), slowSince = 0;
// ---------- quality: automatic by default, or chosen by the viewer
const QUALITY = {
  high: { dpr: 2, scale: 0.85, steps: 260, sharp: true, tag: 'HD' },
  medium: { dpr: 1.4, scale: 0.65, steps: 190, sharp: true, tag: 'MD' },
  low: { dpr: 1.0, scale: 0.45, steps: 110, sharp: false, tag: 'LO' },
};
const INTER = { scale: 0.65, steps: 190, sharp: true };
let qualityMode = 'auto', qualityLevel = mobile ? 'medium' : 'high';
try { qualityMode = localStorage.getItem('lenticular.quality') || 'auto'; } catch { /* private mode */ }
function applyQuality(level) {
  qualityLevel = level; const q = QUALITY[level];
  Object.assign(INTER, { scale: q.scale, steps: q.steps, sharp: q.sharp });
  S.setDprCap(q.dpr); clouds.setScale(q.scale); clouds.uniforms.uSteps.value = q.steps;
  vol?.setQuality(level);
  $('qualityTag').textContent = qualityMode === 'auto' ? `אוטו` : q.tag;
  for (const b of $('qualityMenu').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.q === qualityMode));
  S.invalidate();
}
function setQualityMode(m) {
  qualityMode = m; try { localStorage.setItem('lenticular.quality', m); } catch { /* ignore */ }
  applyQuality(m === 'auto' ? (mobile ? 'medium' : 'high') : m);
}
for (const b of $('qualityMenu').querySelectorAll('button')) b.addEventListener('click', () => { setQualityMode(b.dataset.q); $('qualityMenu').hidden = true; document.querySelector('[data-t=quality]').setAttribute('aria-expanded', 'false'); toast(`איכות: ${b.firstChild.textContent.trim()}`); });
setQualityMode(qualityMode);
function autoDowngrade() {
  const next = qualityLevel === 'high' ? 'medium' : qualityLevel === 'medium' ? 'low' : null; if (!next) return;
  applyQuality(next);
  toast('התצוגה עברה לאיכות קלה יותר כדי לשמור על תנועה חלקה · אפשר לבחור איכות בכפתור המסומן');
  const qb = document.querySelector('[data-t=quality]'); qb.classList.remove('attn'); void qb.offsetWidth; qb.classList.add('attn');
}
// ---------- nothing on the map hides behind the panels, and nothing hides the map's own labels
// the free area: below the header and the folded drawers' row, above the story card, clear of the open panels
function chromeRects() {
  const sel = ['.hud-top', '#docks > *', '#layersPanel', '#toolsPanel', '.kids-corner', '#story', '#lab', '#legend', '#toast', '.tour-offer', '#learn'];
  const out = [];
  for (const q of sel) for (const e of document.querySelectorAll(q)) {
    if (e.hidden || !e.getClientRects().length) continue; const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.1) continue;
    const r = e.getBoundingClientRect(); if (r.width && r.height) out.push(r);
  }
  return out;
}
const hits = (a, b, m = 2) => a.left < b.right - m && b.left < a.right - m && a.top < b.bottom - m && b.top < a.bottom - m;
// story callouts: slide each one into the free area, and apart from each other
function keepCallouts() {
  const els = [...document.querySelectorAll('.callout')].filter((e) => e.style.display !== 'none' && +getComputedStyle(e).opacity > 0.05);
  if (!els.length) return;
  const W = innerWidth, hb = document.querySelector('.hud-top')?.getBoundingClientRect().bottom || 50;
  // phones: below the drawers' buttons and the kids button too
  const top = (W < 900 ? Math.max(hb, ...[...document.querySelectorAll('#docks > *, .kids-corner')].map((e) => e.getBoundingClientRect()).filter((r) => r.height && r.top < 160).map((r) => r.bottom)) : hb) + 6;
  const st = $('story'), stR = st && st.getClientRects().length ? st.getBoundingClientRect() : null;
  const bottom = (innerWidth < 900 && stR ? stR.top : innerHeight) - 8;
  const placed = [];
  for (const el of els) {
    const sp = el.firstElementChild; if (!sp) continue;
    const ox = +sp.dataset.ox || 0, oy = +sp.dataset.oy || 0, r0 = sp.getBoundingClientRect();
    const r = { left: r0.left - ox, right: r0.right - ox, top: r0.top - oy, bottom: r0.bottom - oy };
    let dx = 0, dy = 0;
    if (r.left < 8) dx = 8 - r.left; else if (r.right > W - 8) dx = W - 8 - r.right;
    if (r.top < top) dy = top - r.top; else if (r.bottom > bottom) dy = bottom - r.bottom;
    let R = { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy };
    for (const q of placed) if (hits(R, q, 0)) { const down = q.bottom + 4 - R.top; dy += R.bottom + down > bottom ? -(R.bottom - q.top + 4) : down; R = { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy }; }
    placed.push(R);
    if (Math.abs(dx - ox) > 0.5 || Math.abs(dy - oy) > 0.5) { sp.dataset.ox = dx; sp.dataset.oy = dy; sp.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : ''; }
  }
}
// place names: hide the ones under a panel or under a story callout
function declutter() {
  const block = chromeRects();
  for (const c of document.querySelectorAll('.callout span')) { const r = c.getBoundingClientRect(); if (r.width) block.push(r); }
  for (const el of document.querySelectorAll('.pl')) {
    if (el.classList.contains('off') || el.style.display === 'none') { el.classList.remove('covered'); continue; }
    const r = el.getBoundingClientRect(), cov = !!r.width && (r.left < 4 || r.right > innerWidth - 4 || block.some((b) => hits(r, b)));  // cut by the screen edge counts as covered
    el.classList.toggle('covered', cov); if (!cov && r.width) block.push(r);  // first come keeps its place: no two names on top of each other
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  if (vol?.active) { vol.setAmount(tw.cloud); vol.render(S.camera); volWatch(now); }
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  let moving = S.updateFly(now);
  if (focus.update(now, S.camera)) moving = true;
  S.controls.update();
  let sunGoal = tw.sunT;
  if (tw.loop && state.mode === 'story') { const [a, b] = tw.loop, ph = ((now - tw.loopT0) / 10000) % 1; sunGoal = a + (b - a) * (0.5 - 0.5 * Math.cos(ph * 2 * Math.PI)); }
  const ns = tw.sun + (sunGoal - tw.sun) * (1 - Math.exp(-2.2 * dt));
  if (Math.abs(ns - tw.sun) > 0.002) { tw.sun = ns; setSunNow(ns); moving = true; }
  const nc = tw.cloud + (tw.cloudT - tw.cloud) * (1 - Math.exp(-1.6 * dt));
  if (Math.abs(nc - tw.cloudT) > 0.003) { tw.cloud = nc; moving = true; } else tw.cloud = tw.cloudT;
  clouds.uniforms.uOpacity.value = tw.cloud; clouds.enabled = tw.cloud > 0.01;
  if (viz.update(dt, reduceMotion ? 0.4 : 1)) moving = true;
  if (curtain.update(dt)) moving = true;
  if (state.mode === 'story' && STEPS[step].cloudsDelay && state.layers.clouds) tw.cloudT = now - stepT0 > STEPS[step].cloudsDelay ? STEPS[step].clouds * state.op.clouds : 0;
  if (state.layers.flow) { parcels.update(dt, state.speed, state.exag); moving = true; }
  if (playing && state.mode === 'story') {
    const s = STEPS[step], k = (now - stepT0) / Math.max(1, s.ms);
    segs.children[step]?.querySelector('b')?.style.setProperty('width', `${Math.min(100, k * 100)}%`);
    if (k >= 1) { const nxt = step + 1; if (nxt >= STEPS.length - 1) setPlaying(false); go(nxt); }
  }
  if (moving || S.dirty) {
    if (S.isSharp) { S.sharp(false); clouds.setScale(INTER.scale); clouds.uniforms.uSteps.value = Math.min(clouds.uniforms.uSteps.value, INTER.steps); }
    lastMove = now;
    const t0 = performance.now();
    if (vol?.active) S.renderer.render(S.scene, S.camera); else clouds.render(S.scene, S.camera, now / 1000);
    S.labelRenderer.render(S.scene, S.camera);
    if (now - lastCull > 180) { S.labels.cull(S.camera, innerWidth, innerHeight); lastCull = now; declutter(); }
    keepCallouts();
    S.dirty = false;
    if (moving) {
      S.adapt(dt * 1000); slowAvg = slowAvg * 0.93 + dt * 1000 * 0.07;
      if (qualityMode === 'auto' && slowAvg > 38) { if (!slowSince) slowSince = now; else if (now - slowSince > 2000) { slowSince = 0; slowAvg = 20; autoDowngrade(); } } else slowSince = 0;
    } void t0;
  }
  else if (!S.isSharp && INTER.sharp && now - lastMove > 320) {
    // at rest: one sharp frame at full resolution with full-quality clouds
    S.sharp(true); clouds.setScale(1); const keep = clouds.uniforms.uSteps.value; clouds.uniforms.uSteps.value = 320;
    if (vol?.active) S.renderer.render(S.scene, S.camera); else clouds.render(S.scene, S.camera, now / 1000); S.labelRenderer.render(S.scene, S.camera);
    clouds.uniforms.uSteps.value = keep;
  }
  if (state.mode === 'lab' && $('research').open && now - lastXs > 40) { xs.draw(); lastXs = now; }
}

// ---------- focus on one lens, inside the live model
const focus = createFocus({ S, clouds, viz, curtain, state, windAngle,
  slice: (c, len) => { const a = windAngle(); curtain.setPath(c, a, len); viz.setJourney([c[0] - Math.cos(a) * 1.5, c[1] - Math.sin(a) * 1.5], a); },
  unslice: () => geometry(),
  tune: (k, v) => { state.params[k] = v; state.preset = null; lab.sync(); compute(); }, getAnchors: () => anchors, say,
  apply: () => {
    const v = viz.T, c = curtain.T;
    stepBase = { stack: v.stack || 1, moist: v.moist || 0.7, curtain: c.show || 1, clouds: 1, ampSet: true };
    flowMode = 'curtain'; calloutIds = []; viz.setCallouts([]); S.labels.focus(null);
    applyVisuals(); layerTargets(); syncLayers(); S.invalidate();
  },
  onEnter: () => { if (playing) setPlaying(false); closeFloating(); S.setFrameOffset(0, 0); $('focusBtn').setAttribute('aria-pressed', 'true'); setHash('focus'); },
  onExit: () => {
    $('focusBtn').setAttribute('aria-pressed', 'false'); clouds.uniforms.uGrow.value = 1;
    if (state.mode === 'lab') { setMode('lab'); } else go(step);
    fitFrame();
  },
});
function enterFocus() {
  menu(false);
  if (focus.isOn) return focus.exit();
  if (!focus.enter()) toast('אין עדשה במצב הנוכחי. נסו את ערב 19.11 במעבדה, או שלב אחר בסיפור.');
}
focusRef = focus;
$('focusBtn').addEventListener('click', enterFocus);
$('studioCta').addEventListener('click', enterFocus);

// ---------- one menu, two docks: everything else stays off the map until asked for
function menu(open) {
  const m = $('menu'); open = open ?? m.hidden; if (open) focusOnly('menu'); m.hidden = !open; $('menuBtn').setAttribute('aria-expanded', String(open));
  if (open) { m.querySelector('button:not([style*="none"])')?.focus(); }
}
$('menuBtn').addEventListener('click', () => menu());
for (const b of $('menu').querySelectorAll('button')) b.addEventListener('click', () => {
  menu(false);
  if (b.dataset.go === 'focus') enterFocus();
  if (b.dataset.go === 'lab') $('modeBtn').click();
});
function setDock(which, open, persist = true) {
  // which: a panel id, or null for all; open: true / false / undefined (toggle)
  for (const [id, peek] of [['layersPanel', 'layersPeek'], ['toolsPanel', 'toolsPeek']]) {
    if (which && which !== id) continue;
    const o = open ?? $(id).hidden; $(id).hidden = !o; $(peek).setAttribute('aria-expanded', String(o));
  }
  if (persist) try { localStorage.setItem('lenticular.docks', JSON.stringify({ l: !$('layersPanel').hidden, t: !$('toolsPanel').hidden })); } catch { /* private mode */ }
}
$('layersPeek').addEventListener('click', () => { if ($('layersPanel').hidden) focusOnly('docks'); setDock('layersPanel'); });
$('toolsPeek').addEventListener('click', () => { if ($('toolsPanel').hidden) focusOnly('docks'); setDock('toolsPanel'); });
// one focus at a time: whatever the visitor opens now takes the screen, the rest folds out of the way.
// The drawers can both stay open (they stack); the photo, the learn drawer and the menu each stand alone.
function focusOnly(kind) {
  if (kind !== 'photo' && !$('pip').hidden) { $('pip').hidden = true; $('photoBtn').setAttribute('aria-pressed', 'false'); }
  if (kind !== 'learn' && learn.isOpen) learn.close();
  if (kind !== 'menu' && !$('menu').hidden) { $('menu').hidden = true; $('menuBtn').setAttribute('aria-expanded', 'false'); }
  if (kind === 'photo' || kind === 'learn') { setDock(null, false, false); if (!$('layerPanel').hidden) $('layerPanel').hidden = true; }
  if (!$('qualityMenu').hidden) $('qualityMenu').hidden = true;
}
{ // open on wide screens unless the visitor folded them before
  let d = null; try { d = JSON.parse(localStorage.getItem('lenticular.docks')); } catch { /* none */ }
  const wide = innerWidth >= 900;
  setDock('layersPanel', d && !mobile ? d.l : wide); setDock('toolsPanel', d && !mobile ? d.t : wide);  // phones: everything folded except the story
}
// touching the map closes the menu; the drawers stay as the visitor left them
S.renderer.domElement.addEventListener('pointerdown', () => { menu(false); if (!$('qualityMenu').hidden) { $('qualityMenu').hidden = true; } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('menu').hidden) menu(false); else if (!$('layersPanel').hidden || !$('toolsPanel').hidden) setDock(null, false); } });

// ---------- the volumetric main view (physical sky, volumetric clouds); the classic view stays as fallback
var vol = null; let volSlow = 0, volLast = 0, cm1LabNote = false, volThinNote = false, volT0 = 0;
// with the CM1 clouds on screen, the lens labels point at the simulated lens, not the linear model's
function cm1Anchors() {
  const on = !!(vol?.active && vol.useCM1 && vol.cm1Peak);
  CALLOUT_TEXT._lens ??= CALLOUT_TEXT.lens;
  CALLOUT_TEXT.lens = on ? (innerWidth < 600 ? 'עדשות · 4–5 ק"מ' : 'עדשות · 4–5 ק"מ (סימולציה)') : CALLOUT_TEXT._lens;
  const pk = on ? vol.cm1Peak : null, hadAim = !!S._aimOn;
  S.setAim(pk ? [pk[0], pk[2], -pk[1]] : null); S._aimOn = !!pk;
  if (!!pk !== hadAim && state.mode === 'story') setView(STEPS[step].view, 1400);  // re-frame once the lens is known
  if (on && anchors) { anchors.lens = anchors.lensHi = anchors.train = anchors.birth = vol.cm1Peak; const cut = cm1Cut && vol.cm1Frame ? cm1CutAnchors(vol.cm1Frame) : null; if (cut) Object.assign(anchors, cut); }
  geometry();
  if (anchors) applyCallouts();
}  // var: the quality code above already asks for it
function volWatch(now) { // too slow for this device: step the quality down, then the resolution
  if (location.search.includes('volforce')) return;  // testing: keep the volumetric view whatever the speed
  if (now - volT0 < 6000) { volLast = now; return; }  // shaders compiling and data arriving: not a measure of the device
  const dt = volLast ? now - volLast : 16; volLast = now;
  volSlow = dt > 75 ? volSlow + dt : Math.max(0, volSlow - dt);
  if (volSlow < 3000) return;
  volSlow = 0;
  // the CM1 clouds stay on screen at every step: slow devices get fewer pixels, never the linear model
  if (qualityMode === 'auto' && qualityLevel !== 'low') { autoDowngrade(); return; }
  if (vol.thinner() && !volThinNote) { volThinNote = true; toast('המכשיר עמוס, התצוגה עברה לרזולוציה נמוכה יותר כדי לשמור על העננים מהסימולציה'); }
}
function setVolume(on, persist = true) {
  if (!vol) return;
  vol.active = on; if (on) volT0 = performance.now(); S.setOverlay(on); clouds.enabled = !on && tw.cloud > 0.01; volSlow = 0; volLast = 0;
  $('volBtn')?.setAttribute('aria-pressed', String(on));
  if (field) { anchors = computeAnchors(field); cm1Anchors(); }
  if (persist) try { localStorage.setItem('lenticular.volume2', on ? '1' : '0'); } catch { /* private mode */ }  // only the visitor's own choice is remembered
  S.invalidate();
}
async function startVolume() {
  let pref = null; try { pref = localStorage.getItem('lenticular.volume2'); } catch { /* none */ }
  if (pref === '0' || !document.createElement('canvas').getContext('webgl2')) return;  // phones too: the full view is the main view everywhere
  try {
    const { createVolume } = await import('./volume.js');
    vol = await createVolume($('stage'), { heights: wide, res: 1024, satURL: 'data/wide_sat_4096.webp', coreURL: 'data/core_sat_4096.webp', landURL: mobile ? null : 'data/wide_landcover_4096.webp', mobile, quality: qualityLevel });  // phones skip the land-cover tint to save GPU memory
    vol.setExag(state.exag);
    // the clouds come from the CM1 run in the GPU cloud (the evening of 19.11); the site's own linear model is the backup
    try { await vol.fromCM1(120); vol.useCM1 = true; await loadCM1Cut().catch((e) => console.warn('CM1 cut unavailable', e)); } catch (e) { console.warn('CM1 field unavailable, using the linear model', e); vol.useCM1 = false; if (field) vol.fromField(field); }
    $('cm1Btn')?.setAttribute('aria-pressed', String(vol.useCM1));
    setSunNow(tw.sun); setVolume(true); cm1Anchors();
  } catch (err) { console.warn('volumetric view unavailable', err); vol = null; }
}
$('volBtn')?.addEventListener('click', () => { if (!vol) return startVolume(); setVolume(!vol.active); });
$('cm1Btn')?.addEventListener('click', async () => {
  if (!vol) return;
  vol.useCM1 = !vol.useCM1; $('cm1Btn').setAttribute('aria-pressed', String(vol.useCM1));
  if (vol.useCM1) { await vol.fromCM1(120); toast('העננים מסימולציית הענן (CM1) של ערב 19.11'); } else { if (field) vol.fromField(field); toast('מודל הגיבוי: המודל הלינארי, מגיב למחוונים'); }
  if (field) anchors = computeAnchors(field); cm1Anchors();
});

// ---------- start
const startHash = location.hash;
setSunNow(tw.sun); lab.setPreset('sunset', false); lab.sync(); applyVisuals();
S.goTo('hula', 1);
const linked = readHash();
if (linked?.lab) {
  go(0); setMode('lab');
  const L = linked.lab; if (L.p) lab.setPreset(L.p, false);
  for (const k of SHARE_KEYS) if (L[k] != null) state.params[k] = L[k];
  if (Object.keys(L).length) { state.preset = L.p && Object.keys(L).length === 1 ? L.p : null; lab.sync(); }
  compute(); setHash(labHash());
} else { go(linked?.step ?? 0); compute(); }
if (startHash === '#focus' || startHash === '#studio') setTimeout(enterFocus, 2500);
// opening tour: once on the first visit (not on shared links), always from the "סיור" button
let dockSave = null;
const siteTour = initSiteTour({ button: $('siteTourBtn'), onDock: (d) => { setDock(null, false, false); if (d) setDock(d, true, false); menu(false); },
  onEnd: () => { if (dockSave) { setDock('layersPanel', dockSave.l, false); setDock('toolsPanel', dockSave.t, false); } },
  onMenu: (o) => menu(o), onStart: () => {
  dockSave = { l: !$('layersPanel').hidden, t: !$('toolsPanel').hidden };
  if (focus.isOn) focus.exit();
  if (state.mode !== 'story') setMode('story');
  if (learn.isOpen) learn.close();
  if (document.body.classList.contains('clean')) setClean(false);
  if ($('storyMin').getAttribute('aria-pressed') === 'true') $('storyMin').click();
  if (playing) setPlaying(false);
} });
$('tourChip').addEventListener('click', () => siteTour.start());
if (!siteTour.seen && !startHash) setTimeout(() => { if ($('about').open || focus.isOn) return; if (mobile) offerTour(); else siteTour.start(); }, 2200);
function offerTour() {  // a small card above the story: take the half-minute tour, or not
  const box = document.createElement('div'); box.className = 'tour-offer chrome'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'הצעה לסיור');
  box.innerHTML = '<p><b>פעם ראשונה כאן?</b> סיור קצר, חצי דקה, מראה איך משתמשים באתר.</p><div class="row"><button class="btn ghost" type="button" data-a="no">לא עכשיו</button><button class="btn primary" type="button" data-a="go">לסיור</button></div>';
  const place = () => { const r = $('story').getBoundingClientRect(); box.style.bottom = `${innerHeight - r.top + 10}px`; };
  const done = (go) => { box.remove(); removeEventListener('resize', place); if (go) siteTour.start(); else siteTour.close(); };
  box.querySelector('[data-a=go]').onclick = () => done(true);
  box.querySelector('[data-a=no]').onclick = () => done(false);
  $('hint').classList.add('gone'); document.body.append(box); place(); addEventListener('resize', place);
}
// pull-to-refresh: a drag down that starts at the top edge reloads the page
if (matchMedia('(pointer: coarse)').matches) {
  const ind = document.createElement('div'); ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v12M6 11l6 6 6-6"/></svg>'; document.body.append(ind);
  const band = () => $('docks').getBoundingClientRect().top + 6;  // the header strip, above the drawers
  let y0 = null, pull = 0;
  // in the strip the drag belongs to the refresh, not to the camera
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && e.clientY < band() && e.target === S.renderer.domElement) e.stopPropagation(); }, true);
  addEventListener('touchstart', (e) => { y0 = e.touches.length === 1 && e.touches[0].clientY < band() && !document.body.classList.contains('touring') ? e.touches[0].clientY : null; pull = 0; }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    pull = Math.max(0, (e.touches[0].clientY - y0) * 0.55);
    ind.style.transform = `translate(-50%, ${Math.min(pull, 90) - 50}px) rotate(${Math.min(pull, 70) / 70 * 180}deg)`;
    ind.classList.toggle('on', pull > 8); ind.classList.toggle('ready', pull > 70);
  }, { passive: true });
  addEventListener('touchend', () => {
    if (y0 == null) return; y0 = null;
    if (pull > 70) { ind.classList.add('go'); setTimeout(() => location.reload(), 150); return; }
    ind.classList.remove('on', 'ready'); ind.style.transform = '';
  });
}
requestAnimationFrame(frame);
startVolume();
setTimeout(() => $('hint').classList.add('gone'), 9000);
setTimeout(() => { $('loader').classList.add('done'); setTimeout(() => $('loader').remove(), 700); }, 400);
window.__lent = { S, state, viz, curtain, clouds, get vol() { return vol; }, get field() { return field; }, get anchors() { return anchors; }, go, setMode };
