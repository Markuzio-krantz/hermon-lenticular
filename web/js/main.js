import * as THREE from 'three';
import { createScene } from './scene3d.js';
import { createCloudRenderer } from './clouds3d.js';
import { createParcels } from './parcels.js';
import { createXSection } from './xsection.js';
import { createProfileChart } from './profilechart.js';
import { PRESETS, DEFAULTS } from './presets.js';
import { CHAPTERS } from './tour.js';
import { initUI } from './ui.js';

const $ = (id) => document.getElementById(id);
const RES = 512, EXT = 64000;

// heights ship as a Terrarium-encoded PNG: h = R*256 + G + B/256 - 32768 (lossless, 1/256 m)
async function loadHeights(url, n) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = document.createElement('canvas'); cv.width = n; cv.height = n;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0);
  const px = cx.getImageData(0, 0, n, n, { colorSpace: 'srgb' }).data, h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
  return h;
}
const [meta, heights] = await Promise.all([
  fetch('data/terrain_meta.json').then(r => r.json()),
  loadHeights('data/height_512.png', RES),
]);

// ---------- 3-D
const S = createScene($('view'), heights, RES, meta, 'data/terrain_albedo.jpg');
const clouds = createCloudRenderer(S.renderer);

const parcels = createParcels(S.scene);
const xs = createXSection($('xs'), $('xsTip')); xs.setMeta(meta);
const chart = createProfileChart($('prof'));

// ---------- physics engine (Web Worker, main-thread fallback)
let worker = null, engine = null, reqId = 0, pending = null, running = false;
async function startEngine() {
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    await new Promise((ok, fail) => {
      const t = setTimeout(() => fail(new Error('worker timeout')), 15000);
      worker.onmessage = (e) => { if (e.data.type === 'ready') { clearTimeout(t); ok(); } else if (e.data.type === 'error') fail(new Error(e.data.message)); };
      worker.onerror = (e) => { clearTimeout(t); fail(e); };
      worker.postMessage({ type: 'init', heights: heights.slice().buffer, res: RES, ext: EXT });
    });
    worker.onmessage = (e) => { if (e.data.type === 'result') onResult(e.data.r); else if (e.data.type === 'error') { console.error(e.data.message); running = false; } };
  } catch (err) {
    console.warn('worker unavailable, computing on the main thread', err);
    worker = null; engine = await import('./engine.js'); engine.initEngine(heights, RES, EXT);
  }
}

const state = {
  params: { ...DEFAULTS, ...PRESETS[0].params }, preset: PRESETS[0].id,
  exag: 2, sun: -0.8, speed: 40, parcels: 'curtain', chart: 'thermo',
  clouds: true, labels: true, rotors: false, column: true, slice: true,
  sliceCenter: [meta.landmarks.hermon[0] / 1000, meta.landmarks.hermon[1] / 1000], sliceManual: false,
};
let field = null;

function compute() {
  if (running) { pending = true; return; }
  running = true; $('busy').hidden = false;
  const p = { ...state.params };
  if (worker) worker.postMessage({ type: 'run', id: ++reqId, params: p });
  else setTimeout(() => onResult(engine.runScenario(p)), 20);
}
function onResult(r) {
  running = false; $('busy').hidden = true;
  field = r;
  clouds.setVolume(r.vol, r.volDims, r.maxQ);
  parcels.setField(r);
  xs.setField(r); xs.setBlockFactor(state.params.blockFactor);
  chart.setField(r);
  updateSlice();
  S.setColumn(r.prof, upstreamPoint(), r.diag.dirFrom);
  S.setRotors(r.rotor, r.inner, r.ground, windAngle());
  ui.readouts(r, state.params);
  if (pending) { pending = false; compute(); }
}

// wind direction (math angle, x east / y north, direction the air moves toward) at the lens layer
function windAngle() {
  if (!field) return 0;
  const p = field.prof; let u = 0, v = 0;
  for (let z = 3500; z <= 4500; z += 100) { const k = Math.round(z / p.dz); u += p.U[k]; v += p.V[k]; }
  return Math.atan2(v, u);
}
function upstreamPoint() {
  const a = windAngle(), c = state.sliceCenter;
  let x = c[0] - Math.cos(a) * 26, n = c[1] - Math.sin(a) * 26;
  return [Math.max(-30, Math.min(30, x)), Math.max(-30, Math.min(30, n))];
}
function updateSlice() {
  const a = windAngle();
  xs.setSlice(state.sliceCenter, a, 30);
  S.setSlice(state.sliceCenter, a, 60);
  const up = upstreamPoint();
  parcels.setMode(state.parcels === 'off' ? 'curtain' : state.parcels, { cx: up[0], cn: up[1], ang: a });
  const dir = (Math.round(((field?.diag.dirFrom ?? 0) + 360) % 360));
  $('xsInfo').textContent = `דרך ${state.sliceManual ? 'הנקודה שנבחרה' : 'פסגת החרמון'} · רוח מ-${dir}°`;
}

function applyVisuals() {
  S.setExaggeration(state.exag); clouds.setExag(state.exag);
  const sun = S.setSun(state.sun);
  const u = clouds.uniforms;
  u.uSunDir.value.copy(sun.dir); u.uSunColor.value.copy(sun.color); u.uShadowKm.value = sun.shadowKm;
  const tw = THREE.MathUtils.clamp((state.sun + 4) / 12, 0, 1);
  u.uAmbTop.value.setRGB(0.12 + 0.28 * tw, 0.13 + 0.32 * tw, 0.24 + 0.4 * tw);
  u.uAmbBot.value.setRGB(0.1 + 0.18 * tw, 0.09 + 0.16 * tw, 0.14 + 0.2 * tw);
  clouds.enabled = state.clouds;
  parcels.visible = state.parcels !== 'off';
  S.showLabels(state.labels); S.rotors.visible = state.rotors; S.column.visible = state.column; S.slice.visible = state.slice;
  if (field) { S.setColumn(field.prof, upstreamPoint(), field.diag.dirFrom); S.setRotors(field.rotor, field.inner, field.ground, windAngle()); S.setSlice(state.sliceCenter, windAngle(), 60); }
}

// ---------- tour
let chapter = 0;
function showChapter(i, fly = true) {
  chapter = (i + CHAPTERS.length) % CHAPTERS.length;
  const c = CHAPTERS[chapter];
  $('kicker').textContent = `פרק ${chapter + 1} מתוך ${CHAPTERS.length}`;
  $('ctitle').textContent = c.title; $('cbody').textContent = c.body; $('cdeep').textContent = c.deep;
  [...$('dots').children].forEach((b, k) => b.setAttribute('aria-current', String(k === chapter)));
  ui.setPreset(c.preset, false);
  state.sun = c.sun; state.parcels = c.parcels; state.chart = c.chart; state.rotors = !!c.rotors;
  if (c.speed) state.speed = c.speed;
  state.sliceCenter = [meta.landmarks.hermon[0] / 1000, meta.landmarks.hermon[1] / 1000]; state.sliceManual = false;
  ui.syncAll(); applyVisuals(); chart.setView(state.chart); compute();
  if (fly) S.goTo(c.view);
}

const ui = initUI({ state, PRESETS, DEFAULTS, onParams: compute, onVisual: () => { applyVisuals(); if (field) updateSlice(); }, onChart: (v) => chart.setView(v), goTo: (v) => S.goTo(v) });
CHAPTERS.forEach((c, k) => { const b = document.createElement('button'); b.textContent = k + 1; b.title = c.title; b.onclick = () => showChapter(k); $('dots').appendChild(b); });
$('prev').onclick = () => showChapter(chapter - 1);
$('next').onclick = () => showChapter(chapter + 1);

// double-click on the terrain moves the cross-section
S.labelRenderer.domElement.addEventListener('dblclick', (ev) => {
  const r = S.renderer.domElement.getBoundingClientRect();
  const hit = S.pickGround(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1));
  if (hit) { state.sliceCenter = hit; state.sliceManual = true; if (field) { updateSlice(); S.setColumn(field.prof, upstreamPoint(), field.diag.dirFrom); } }
});

// ---------- loop
await startEngine();
showChapter(0, false);
S.goTo('hula', 10);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  S.updateFly(now); S.controls.update();
  if (state.parcels !== 'off') parcels.update(dt, state.speed, state.exag);
  clouds.render(S.scene, S.camera, now / 1000);
  S.labelRenderer.render(S.scene, S.camera);
  xs.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__lent = { S, state, get field() { return field; } };
