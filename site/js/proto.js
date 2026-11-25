// Prototype: Takram's volumetric clouds and physical atmosphere, driven by our mountain-wave model.
// The physics decides where each plate of the lens is (a "local weather" texture placed exactly over
// the Hermon on the globe); Takram's renderer gives it light, shadow, aerial perspective and sky.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer, EffectPass, NormalPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { AerialPerspectiveEffect, getSunDirectionECEF, PrecomputedTexturesLoader, DEFAULT_PRECOMPUTED_TEXTURES_URL } from '@takram/three-atmosphere';
import { CloudsEffect, DEFAULT_SHAPE_URL, DEFAULT_SHAPE_DETAIL_URL, DEFAULT_TURBULENCE_URL, CLOUD_SHAPE_TEXTURE_SIZE, CLOUD_SHAPE_DETAIL_TEXTURE_SIZE } from '@takram/three-clouds';
import { DataTextureLoader, Ellipsoid, Geodetic, parseUint8Array, radians, STBNLoader, DEFAULT_STBN_URL } from '@takram/three-geospatial';
import { initEngine, runScenario } from './engine.js';
import { DEFAULTS, PRESETS } from './presets.js';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('status').textContent = t; $('status').hidden = !t; };
const CLAT = 33.25, CLON = 35.72, HALF_KM = 64;
const ecef = (lat, lon, h) => new Geodetic(radians(lon), radians(lat), h).toECEF();

// ---------- renderer, camera, post-processing (after Takram's vanilla story)
const renderer = new THREE.WebGLRenderer({ depth: false, logarithmicDepthBuffer: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 10;
$('stage').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 10, 1e6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 200;
const scene = new THREE.Scene();

const center = ecef(CLAT, CLON, 0);
const E = new THREE.Vector3(), N = new THREE.Vector3(), U = new THREE.Vector3();
Ellipsoid.WGS84.getEastNorthUpVectors(center, E, N, U);

const aerial = new AerialPerspectiveEffect(camera);
aerial.sky = true; aerial.sunLight = true; aerial.skyLight = true;
const normalPass = new NormalPass(scene, camera);
aerial.normalBuffer = normalPass.texture;
const clouds = new CloudsEffect(camera);
clouds.events.addEventListener('change', (e) => {
  if (e.property === 'atmosphereOverlay') aerial.overlay = clouds.atmosphereOverlay;
  if (e.property === 'atmosphereShadow') aerial.shadow = clouds.atmosphereShadow;
  if (e.property === 'atmosphereShadowLength') aerial.shadowLength = clouds.atmosphereShadowLength;
});
const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
composer.addPass(new RenderPass(scene, camera));
composer.addPass(normalPass);
composer.addPass(new EffectPass(camera, clouds, aerial));
composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX })));

const textures = new PrecomputedTexturesLoader().setType(renderer).load(DEFAULT_PRECOMPUTED_TEXTURES_URL);
Object.assign(aerial, textures); Object.assign(clouds, textures);
const tex3 = (url, size, set) => new DataTextureLoader(THREE.Data3DTexture, parseUint8Array, { width: size, height: size, depth: size }).load(url, (t) => {
  t.format = THREE.RedFormat; t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; set(t);
});
tex3(DEFAULT_SHAPE_URL, CLOUD_SHAPE_TEXTURE_SIZE, (t) => { clouds.shapeTexture = t; });
tex3(DEFAULT_SHAPE_DETAIL_URL, CLOUD_SHAPE_DETAIL_TEXTURE_SIZE, (t) => { clouds.shapeDetailTexture = t; });
new THREE.TextureLoader().load(DEFAULT_TURBULENCE_URL, (t) => { t.minFilter = THREE.LinearMipMapLinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; clouds.turbulenceTexture = t; });
new STBNLoader().load(DEFAULT_STBN_URL, (t) => { aerial.stbnTexture = t; clouds.stbnTexture = t; });

// lens plates are smooth and symmetric; the cap cloud hugs the summit
clouds.cloudLayers.set([
  { channel: 'r', altitude: 3450, height: 600, densityScale: 0.32, shapeAmount: 0.12, shapeDetailAmount: 0.22, shapeAlteringBias: 0.5, coverageFilterWidth: 0.3, shadow: true },
  { channel: 'g', altitude: 4060, height: 700, densityScale: 0.28, shapeAmount: 0.12, shapeDetailAmount: 0.22, shapeAlteringBias: 0.5, coverageFilterWidth: 0.3, shadow: true },
  { channel: 'b', altitude: 2000, height: 1200, densityScale: 0.22, shapeAmount: 0.6, shapeDetailAmount: 0.6, shapeAlteringBias: 0.35, coverageFilterWidth: 0.4, shadow: true },
  { channel: 'a', altitude: 0, height: 0, densityScale: 0 },
]);
clouds.coverage = 0.62;

// ---------- terrain: the same 128 km map as the site, at true scale, placed on the globe
async function loadHeights(url, n) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = document.createElement('canvas'); cv.width = n; cv.height = n;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0);
  const px = cx.getImageData(0, 0, n, n).data, h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
  return h;
}
const wide = await loadHeights('data/wide_height_1024.png', 1024);
{
  const small = innerWidth < 760, S = small ? 512 : 1024, st = 1024 / S;
  const geo = new THREE.PlaneGeometry(HALF_KM * 2000, HALF_KM * 2000, S - 1, S - 1), pos = geo.attributes.position;
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) pos.setZ(r * S + c, Math.max(0, wide[(r * st) * 1024 + c * st]));
  geo.computeVertexNormals();
  const tl = new THREE.TextureLoader(), aniso = renderer.capabilities.getMaxAnisotropy();
  const sat = tl.load('data/wide_sat_4096.webp'); sat.colorSpace = THREE.SRGBColorSpace; sat.anisotropy = aniso;
  const U2 = { core: { value: null }, lc: { value: null }, coreOn: { value: 0 }, lcOn: { value: 0 } };
  if (!small) tl.load('data/core_sat_4096.webp', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; U2.core.value = t; U2.coreOn.value = 1; });
  tl.load('data/wide_landcover_4096.webp', (t) => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = aniso; U2.lc.value = t; U2.lcOn.value = 1; });
  const mat = new THREE.MeshBasicMaterial({ map: sat });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U2);
    sh.fragmentShader = 'uniform sampler2D core, lc; uniform float coreOn, lcOn;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 sc = texture2D(map, vMapUv);
      if (coreOn > 0.5) { vec2 cu = (vMapUv - 0.25) * 2.0; float w = smoothstep(0.0, 0.03, min(min(cu.x, 1.0 - cu.x), min(cu.y, 1.0 - cu.y)));
        if (w > 0.0) sc = mix(sc, texture2D(core, clamp(cu, 0.0, 1.0)), w); }
      if (lcOn > 0.5) { vec4 l = texture2D(lc, vMapUv);
        sc.rgb = mix(sc.rgb, sc.rgb * vec3(0.62, 0.8, 0.56), l.g * 0.7);                    // forest canopy
        sc.rgb = mix(sc.rgb, sc.rgb * vec3(0.8, 0.95, 0.7), l.a * 0.5);                     // orchards
        sc.rgb = mix(sc.rgb, vec3(0.025, 0.06, 0.1), smoothstep(0.15, 0.6, l.r) * 0.9); }  // lakes, ponds, rivers
      diffuseColor *= sc;`);
  };
  const ground = new THREE.Mesh(geo, mat);
  const g = new THREE.Group(); Ellipsoid.WGS84.getEastNorthUpFrame(center).decompose(g.position, g.quaternion, g.scale);
  g.add(ground); scene.add(g);
}

// ---------- physics → local weather texture on Takram's cube-sphere UV
function cubeUv(p) {
  const l = Math.hypot(p.x, p.y, p.z), n = [p.x / l, p.y / l, p.z / l], f = n.map(Math.abs), mx = Math.max(...f), c = n.map((v) => v / mx);
  let m;
  if (f[1] > f[0] && f[1] > f[2]) m = c[1] > 0 ? [-n[0], n[2]] : [n[0], n[2]];
  else if (f[0] > f[1] && f[0] > f[2]) m = c[0] > 0 ? [n[1], n[2]] : [-n[1], n[2]];
  else m = c[2] > 0 ? [n[0], n[1]] : [n[0], -n[1]];
  const m2 = [m[0] * m[0], m[1] * m[1]], q = -2 * m2[0] + 2 * m2[1] - 3;
  const ux = Math.sqrt(1.5 + m2[0] - m2[1] - 0.5 * Math.sqrt(-24 * m2[0] + q * q)) * (m[0] > 0 ? 1 : -1);
  const uy = Math.sqrt(6 / (3 - ux * ux)) * m[1];
  return [ux * 0.5 + 0.5, uy * 0.5 + 0.5];
}
let weatherAnchor = null;
// the shader samples weather at (ECEF + altitudeCorrection), and the correction follows the camera:
// keep the tile centred on the physics box by re-anchoring the offset with the same correction
const tmpP = new THREE.Vector3();
function anchorWeather() {
  if (!weatherAnchor) return;
  const uv = cubeUv(tmpP.copy(weatherAnchor.p0).add(clouds.altitudeCorrection)), R = weatherAnchor.R;
  clouds.localWeatherOffset.set(0.5 - uv[0] * R, 0.5 - uv[1] * R);
}
function buildWeather(r) {
  const [nx, ny, nz] = r.volDims, dz = 8 / nz, vol = r.vol;
  const bands = [[3.45, 4.05], [4.05, 4.9], [1.2, 3.35]];
  const B = bands.map(() => new Float32Array(nx * ny)), mx = [0, 0, 0];
  for (let v = 0; v < nz; v++) { const z = (v + 0.5) * dz; for (let b = 0; b < 3; b++) { if (z < bands[b][0] || z >= bands[b][1]) continue;
    for (let k = 0; k < nx * ny; k++) { const q = vol[v * nx * ny + k]; if (q > B[b][k]) { B[b][k] = q; if (q > mx[b]) mx[b] = q; } } } }
  const at = (b, x, n) => { // bilinear, x east / n north in km from the centre
    const fi = (x + 32) / 64 * nx - 0.5, fj = (32 - n) / 64 * ny - 0.5, i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return 0;
    const a = fi - i, c = fj - j, A = B[b];
    return (A[j * nx + i] * (1 - a) + A[j * nx + i + 1] * a) * (1 - c) + (A[(j + 1) * nx + i] * (1 - a) + A[(j + 1) * nx + i + 1] * a) * c;
  };
  // local linearisation of the cube-sphere UV around the centre, at lens height
  const p0 = center.clone().addScaledVector(U, 4000), uv0 = cubeUv(p0);
  const ue = cubeUv(p0.clone().addScaledVector(E, 1000)), un = cubeUv(p0.clone().addScaledVector(N, 1000));
  const J = [[ue[0] - uv0[0], un[0] - uv0[0]], [ue[1] - uv0[1], un[1] - uv0[1]]]; // uv per km
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0], Ji = [[J[1][1] / det, -J[0][1] / det], [-J[1][0] / det, J[0][0] / det]];
  const TILE = 160, perKm = Math.max(Math.hypot(J[0][0], J[1][0]), Math.hypot(J[0][1], J[1][1])), R = 1 / (perKm * TILE);
  const S = 512, data = new Uint8Array(S * S * 4);
  for (let t = 0; t < S; t++) for (let s = 0; s < S; s++) {
    const du = ((s + 0.5) / S - 0.5) / R, dv = ((t + 0.5) / S - 0.5) / R;
    const x = Ji[0][0] * du + Ji[0][1] * dv, n = Ji[1][0] * du + Ji[1][1] * dv, o = (t * S + s) * 4;
    for (let b = 0; b < 3; b++) data[o + b] = Math.round(255 * Math.min(1, Math.sqrt(at(b, x, n) / Math.max(1e-6, mx[b]))));
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipMapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  clouds.localWeatherTexture = tex;
  clouds.localWeatherRepeat.set(R, R);
  weatherAnchor = { p0, R };
  clouds.localWeatherOffset.set(0.5 - uv0[0] * R, 0.5 - uv0[1] * R);
  clouds.localWeatherVelocity.set(0, 0);
  // where is the main lens? the column with the most lower-plate condensate (5x5 neighbourhood)
  let best = 0, bi = nx / 2, bj = ny / 2;
  for (let j = 2; j < ny - 2; j++) for (let i = 2; i < nx - 2; i++) { let m = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) m += B[0][(j + b) * nx + i + a]; if (m > best) { best = m; bi = i; bj = j; } }
  const xk = (bi + 0.5) / nx * 64 - 32, nk = 32 - (bj + 0.5) / ny * 64;
  return { lat: CLAT + nk / 111.2, lon: CLON + xk / (111.2 * Math.cos(CLAT * Math.PI / 180)) };
}
status('מחשב את גל ההר…');
await new Promise((r) => setTimeout(r, 30));
const phys = new Float32Array(512 * 512);
for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) phys[j * 512 + i] = Math.max(0, wide[(j + 256) * 1024 + i + 256]);
initEngine(phys, 512, 64000);
const result = runScenario({ ...DEFAULTS, ...PRESETS[0].params, volUp: 2, volZ: 128 });
let lens = buildWeather(result), last = result;
status('');

// ---------- views, time, controls
const L = (dlat, dlon, h) => [lens.lat + dlat, lens.lon + dlon, h];
const VIEWS = {
  hula: { from: [33.10, 35.585, 450], to: L(0, 0, 3800) },          // the photographers' view, from the valley
  near: { from: L(-0.045, -0.06, 3300), to: L(0, 0, 3900) },        // 7 km away, just under the plates
  above: { from: L(-0.22, -0.05, 9000), to: L(0, 0, 3600) },
};
function setView(k) {
  const v = VIEWS[k]; camera.position.copy(ecef(...v.from)); controls.target.copy(ecef(...v.to));
  camera.up.copy(Ellipsoid.WGS84.getSurfaceNormal(camera.position)); controls.update();
  document.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === k)));
}
document.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
setView('hula');
const sun = new THREE.Vector3();
function setTime() {
  const m = +$('time').value; $('o-time').textContent = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  getSunDirectionECEF(new Date(Date.UTC(2026, 10, 19, 0, m - 120)), sun); aerial.sunDirection.copy(sun); clouds.sunDirection.copy(sun);
}
$('time').addEventListener('input', setTime); setTime();
$('cov').addEventListener('input', () => { clouds.coverage = +$('cov').value; $('o-cov').textContent = (+$('cov').value).toFixed(2); });
$('o-cov').textContent = '0.62';
$('hide').addEventListener('click', () => { const p = document.querySelector('.panel'); const on = p.classList.toggle('folded'); $('hide').textContent = on ? 'כוונון' : 'הסתרה'; $('hide').setAttribute('aria-expanded', String(!on)); });
if (matchMedia('(max-width: 760px)').matches) { $('q').value = 0; document.querySelector('.panel').classList.add('folded'); $('hide').textContent = 'כוונון'; }
const QN = ['low', 'medium', 'high', 'ultra'], QH = ['חסכונית', 'בינונית', 'גבוהה', 'מרבית'];
function setQ() { const i = +$('q').value; clouds.qualityPreset = QN[i]; $('o-q').textContent = QH[i]; }
$('q').addEventListener('input', setQ); setQ();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labels?.setSize(innerWidth, innerHeight); });

let fpsT = performance.now(), fpsN = 0;
renderer.setAnimationLoop(() => {
  controls.update(); formationFrame(performance.now()); anchorWeather(); composer.render(); labels.render(scene, camera);
  fpsN++; const now = performance.now(); if (now - fpsT > 1000) { $('fps').textContent = `${(fpsN * 1000 / (now - fpsT)).toFixed(0)} fps`; fpsN = 0; fpsT = now; }
});
// ---------- the air layers, named where they are: what each one is, its height, its humidity
const labels = new CSS2DRenderer(); labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 3, direction: 'ltr' });
document.body.appendChild(labels.domElement);
const tags = [];
function rhAt(prof, z) { return prof.RH[Math.min(prof.nz - 1, Math.round(z / prof.dz))]; }
function placeTags() {
  for (const t of tags) t.removeFromParent(); tags.length = 0;
  const prof = last.prof;
  const LAY = [
    { z: 4450, t: 'שכבה לחה עליונה', d: `⁦4.05–4.8⁩ ק"מ · ${Math.round(rhAt(prof, 4350))}% לחות → הלוח העליון`, c: '#f0a043' },
    { z: 4050, t: 'שכבה יבשה ביניהן', d: `${Math.round(rhAt(prof, 4050))}% לחות → רווח שקוף בין הלוחות`, c: '#c9b38a' },
    { z: 3750, t: 'שכבה לחה תחתונה', d: `⁦3.5–4.05⁩ ק"מ · ${Math.round(rhAt(prof, 3800))}% לחות → הלוח התחתון`, c: '#48c79a' },
    { z: 2200, t: 'אינוורסיה', d: '⁦1.8–2.6⁩ ק"מ · האוויר יציב מאוד: הקפיץ שיוצר את הגל', c: '#3fb0e0' },
  ];
  // the explanation lives in a side card (collapsible); in the scene only small numbered markers sit at
  // each layer's height beside the lens, so the lens itself stays clear in the middle
  LAY.forEach((L, i) => {
    const m = document.createElement('div'); m.className = 'mark'; m.style.background = L.c; m.textContent = String(i + 1);
    m.title = L.t; const o = new CSS2DObject(m); o.position.copy(ecef(lens.lat, lens.lon - 0.028, L.z)); scene.add(o); tags.push(o);
  });
  $('layersList').innerHTML = LAY.map((L, i) => `<li><i style="background:${L.c}">${i + 1}</i><b>${L.t}</b><span>${L.d}</span></li>`).join('');
}
placeTags();
$('tags').addEventListener('change', () => { labels.domElement.hidden = !$('tags').checked; $('layersCard').hidden = !$('tags').checked; });
if (innerWidth < 760) $('layersCard').open = false;

// ---------- formation in real time: cap, then the lower plate, then the upper plate, each from its core outward
const BASE = Array.from(clouds.cloudLayers, (l) => l.densityScale);
const STAGES = [
  [0.00, 'אוויר לח זורם מעל ההר. עוד אין ענן.'],
  [0.12, 'האוויר הנמוך מטפס על המדרון: ענן כובע נצמד לפסגה.'],
  [0.28, 'בפסגת הגל השכבה הלחה התחתונה מגיעה לנקודת הטל.'],
  [0.45, 'הלוח התחתון מתעבה ומתפשט מהליבה החוצה.'],
  [0.62, 'השכבה הלחה העליונה מתעבה: לוח שני מעל הראשון, והשכבה היבשה ביניהם נשארת שקופה.'],
  [0.85, 'עדשה שלמה. האוויר ממשיך לחלוף דרכה, הצורה נשארת.'],
];
let form = null; // { t0 }
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
function formationFrame(now) {
  if (!form) return;
  const u = Math.min(1, (now - form.t0) / 24000), r = (a, b) => ease((u - a) / (b - a));
  const g = [r(0.28, 0.6), r(0.6, 0.88), r(0.1, 0.3)];
  for (let i = 0; i < 3; i++) clouds.cloudLayers[i].densityScale = BASE[i] * g[i];
  clouds.coverage = 0.3 + (+$('cov').value - 0.3) * r(0.25, 0.95);
  let k = 0; for (let i = 0; i < STAGES.length; i++) if (u >= STAGES[i][0]) k = i;
  if ($('cap').dataset.k !== String(k)) { $('cap').dataset.k = String(k); $('cap').textContent = STAGES[k][1]; $('cap').classList.remove('in'); void $('cap').offsetWidth; $('cap').classList.add('in'); }
  if (u >= 1) { form = null; $('play').textContent = 'הפעלת ההיווצרות שוב'; setTimeout(() => { $('cap').hidden = true; }, 4000); }
}
$('play').addEventListener('click', () => { form = { t0: performance.now() }; $('cap').hidden = false; $('cap').dataset.k = ''; $('play').textContent = 'מתחיל מההתחלה…'; });

// ---------- conditions: recompute the atmosphere, rebuild the clouds, say what changed
function lensStats(r) {
  const [nx, ny, nz] = r.volDims, dz = 8 / nz, cell = 64 / nx;
  const B0 = new Float32Array(nx * ny), B1 = new Float32Array(nx * ny);
  for (let v = 0; v < nz; v++) { const z = (v + 0.5) * dz; const B = z >= 3.45 && z < 4.05 ? B0 : z >= 4.05 && z < 4.9 ? B1 : null; if (!B) continue;
    for (let k = 0; k < nx * ny; k++) if (r.vol[v * nx * ny + k] > B[k]) B[k] = r.vol[v * nx * ny + k]; }
  let a0 = 0, a1 = 0, n = 0, mx0 = 0; const th = 0.02;
  for (let k = 0; k < nx * ny; k++) if (B0[k] > mx0) mx0 = B0[k];
  for (let k = 0; k < nx * ny; k++) { if (B0[k] > th) a0++; if (B1[k] > th) a1++; }
  // separate lenses: local maxima of the lower plate, at least 3 km apart
  const pk = [];
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const q = B0[j * nx + i]; if (q < 0.35 * mx0) continue;
    let ok = true; for (let b = -1; b <= 1 && ok; b++) for (let a = -1; a <= 1; a++) if (B0[(j + b) * nx + i + a] > q) { ok = false; break; }
    if (ok && !pk.some(([pi, pj]) => Math.hypot(pi - i, pj - j) * cell < 4)) pk.push([i, j]); }
  n = pk.length;
  return { area0: a0 * cell * cell, area1: a1 * cell * cell, lenses: n };
}
let stats = lensStats(result);
function showStats(prev) {
  const d = (a, b, f = 0) => (b == null ? '' : ` <em>(${a - b >= 0 ? '+' : ''}${(a - b).toFixed(f)})</em>`);
  $('stats').innerHTML = `לוח תחתון ${stats.area0.toFixed(0)} קמ"ר${d(stats.area0, prev?.area0)} · לוח עליון ${stats.area1.toFixed(0)} קמ"ר${d(stats.area1, prev?.area1)} · עדשות באזור ${stats.lenses}${d(stats.lenses, prev?.lenses)}`;
}
showStats(null);
const P = { ...DEFAULTS, ...PRESETS[0].params };
const FMT = { windScale: (v) => `×${v.toFixed(2)}`, stabilityScale: (v) => `×${v.toFixed(2)}`, lensBoost: (v) => `+${v.toFixed(0)}%` };
for (const k of Object.keys(FMT)) {
  const el = $('p-' + k); el.value = P[k]; $('o-' + k).textContent = FMT[k](+P[k]);
  el.addEventListener('input', () => { $('o-' + k).textContent = FMT[k](+el.value); });
  el.addEventListener('change', () => {
    P[k] = +el.value; status('מחשב את האטמוספרה מחדש…');
    setTimeout(() => {
      const prev = stats; last = runScenario({ ...P, volUp: 2, volZ: 128 }); lens = buildWeather(last); stats = lensStats(last);
      showStats(prev); placeTags(); status('');
    }, 30);
  });
}
$('reset').addEventListener('click', () => { Object.assign(P, DEFAULTS, PRESETS[0].params); for (const k of Object.keys(FMT)) { $('p-' + k).value = P[k]; $('o-' + k).textContent = FMT[k](+P[k]); } $('p-lensBoost').dispatchEvent(new Event('change')); });

window.__proto = { clouds, aerial, camera, result };
