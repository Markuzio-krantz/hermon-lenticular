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
const renderer = new THREE.WebGLRenderer({ depth: true, logarithmicDepthBuffer: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 10;
$('stage').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 10, 1e6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 200;
const scene = new THREE.Scene();
const overlay = new THREE.Scene();   // the air layers: translucent sheets drawn over the finished image

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
  // the same ground, depth only, so the layer sheets drawn after the volumetric passes hide behind mountains
  const gd = new THREE.Group(); gd.position.copy(g.position); gd.quaternion.copy(g.quaternion);
  gd.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false }))); overlay.add(gd);
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
  writeWeather((b, x, n) => Math.sqrt(at(b, x, n) / Math.max(1e-6, mx[b])));
  // where is the main lens? the column with the most lower-plate condensate (5x5 neighbourhood)
  let best = 0, bi = nx / 2, bj = ny / 2;
  for (let j = 2; j < ny - 2; j++) for (let i = 2; i < nx - 2; i++) { let m = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) m += B[0][(j + b) * nx + i + a]; if (m > best) { best = m; bi = i; bj = j; } }
  const xk = (bi + 0.5) / nx * 64 - 32, nk = 32 - (bj + 0.5) / ny * 64;
  return { lat: CLAT + nk / 111.2, lon: CLON + xk / (111.2 * Math.cos(CLAT * Math.PI / 180)) };
}
// weather texture from any sampler f(band, x east km, n north km) -> 0..1, placed on Takram's cube-sphere UV
function writeWeather(f) {
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
    for (let b = 0; b < 3; b++) data[o + b] = Math.round(255 * Math.min(1, f(b, x, n)));
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipMapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  clouds.localWeatherTexture = tex;
  clouds.localWeatherRepeat.set(R, R);
  weatherAnchor = { p0, R };
  clouds.localWeatherOffset.set(0.5 - uv0[0] * R, 0.5 - uv0[1] * R);
  clouds.localWeatherVelocity.set(0, 0);
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
const VIEWS = () => ({
  hula: { from: [33.10, 35.585, 450], to: L(0, 0, 3800) },          // the photographers' view, from the valley
  near: { from: L(-0.045, -0.06, 3300), to: L(0, 0, 3900) },        // 7 km away, just under the plates
  above: { from: L(-0.22, -0.05, 9000), to: L(0, 0, 3600) },
});
function setView(k) {
  const v = VIEWS()[k]; camera.position.copy(ecef(...v.from)); controls.target.copy(ecef(...v.to));
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
  controls.update(); formationFrame(performance.now()); anchorWeather(); composer.render();
  if (sheets.visible) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(overlay, camera); renderer.autoClear = true; }
  labels.render(scene, camera);
  fpsN++; const now = performance.now(); if (now - fpsT > 1000) { $('fps').textContent = `${(fpsN * 1000 / (now - fpsT)).toFixed(0)} fps`; fpsN = 0; fpsT = now; }
});
// ---------- the air layers, named where they are: what each one is, its height, its humidity
const labels = new CSS2DRenderer(); labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 3, direction: 'ltr' });
document.body.appendChild(labels.domElement);
const tags = [];
const sheets = new THREE.Group(); overlay.add(sheets);
const SHEET_KM = 44;
let source = 'linear';   // 'linear' (the site's model) or 'cm1' (the 3-D simulation)
function rhAt(prof, z) { return prof.RH[Math.min(prof.nz - 1, Math.round(z / prof.dz))]; }
function placeTags() {
  for (const t of tags) t.removeFromParent(); tags.length = 0;
  for (const c of [...sheets.children]) { c.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); sheets.remove(c); }
  const prof = last.prof;
  const LAY = source === 'cm1' ? [
    { z: 4800, z0: 4500, z1: 5150, t: 'לוח עליון (CM1)', d: '⁦4.5–5.15⁩ ק"מ · ענן שהסימולציה יצרה', c: '#f0a043' },
    { z: 4250, z0: 4000, z1: 4500, t: 'לוח תחתון (CM1)', d: '⁦4.0–4.5⁩ ק"מ · ענן שהסימולציה יצרה', c: '#48c79a' },
    { z: 2200, z0: 1800, z1: 2600, t: 'אינוורסיה', d: '⁦1.8–2.6⁩ ק"מ · האוויר יציב מאוד: הקפיץ שיוצר את הגל', c: '#3fb0e0' },
  ] : [
    { z: 4450, z0: 4050, z1: 4800, t: 'שכבה לחה עליונה', d: `⁦4.05–4.8⁩ ק"מ · ${Math.round(rhAt(prof, 4350))}% לחות → הלוח העליון`, c: '#f0a043' },
    { z: 4050, z0: 3950, z1: 4050, dry: true, t: 'שכבה יבשה ביניהן', d: `${Math.round(rhAt(prof, 4050))}% לחות → רווח שקוף בין הלוחות`, c: '#c9b38a' },
    { z: 3750, z0: 3500, z1: 3950, t: 'שכבה לחה תחתונה', d: `⁦3.5–4.05⁩ ק"מ · ${Math.round(rhAt(prof, 3800))}% לחות → הלוח התחתון`, c: '#48c79a' },
    { z: 2200, z0: 1800, z1: 2600, t: 'אינוורסיה', d: '⁦1.8–2.6⁩ ק"מ · האוויר יציב מאוד: הקפיץ שיוצר את הגל', c: '#3fb0e0' },
  ];
  // each layer is drawn for real: a translucent slab of its true depth around the lens (east-north-up frame),
  // with a bright rim; the numbers sit side by side inside the slabs, west of the lens
  const at = ecef(lens.lat, lens.lon, 0), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  Ellipsoid.WGS84.getEastNorthUpFrame(at).decompose(pos, q, sc);
  const W = SHEET_KM * 1000;
  LAY.forEach((L, i) => {
    const h = Math.max(60, L.z1 - L.z0), col = new THREE.Color(L.c);
    const box = new THREE.BoxGeometry(W, W, h);
    const slab = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: L.dry ? 0.03 : 0.07, depthWrite: false, side: THREE.DoubleSide }));
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: L.dry ? 0.35 : 0.8 }));
    const g = new THREE.Group(); g.position.copy(pos); g.quaternion.copy(q); g.translateZ((L.z0 + L.z1) / 2);
    g.add(slab, rim); g.renderOrder = 10 - i; sheets.add(g);
    const m = document.createElement('div'); m.className = 'mark'; m.style.background = L.c; m.textContent = String(i + 1);
    m.title = `${L.t} · ${L.d}`;
    const o = new CSS2DObject(m); o.position.copy(ecef(lens.lat, lens.lon - 0.12, (L.z0 + L.z1) / 2));  // 11 km west of the lens, inside the slab
    o.center.set(0.5 + (i - (LAY.length - 1) / 2) * 1.4, 0.5);  // side by side, so they never pile up
    scene.add(o); tags.push(o);
  });
  $('layersList').innerHTML = LAY.map((L, i) => `<li><i style="background:${L.c}">${i + 1}</i><b>${L.t}</b><span>${L.d}</span></li>`).join('');
}
placeTags();

// ---------- second source: the CM1 3-D simulation of the same evening (non-linear, terrain-following)
// The linear model stays the default; CM1 is an extra view, played through its two simulated hours.
let cm1 = null, cm1T = 0, cm1Play = null;
const LINEAR_LAYERS = Array.from(clouds.cloudLayers, (l) => ({ altitude: l.altitude, height: l.height, densityScale: l.densityScale }));
async function loadCM1() {
  if (cm1) return cm1;
  const [meta, buf] = await Promise.all([fetch('data/cm1_meta.json').then((r) => r.json()), fetch('data/cm1_weather.bin').then((r) => r.arrayBuffer())]);
  cm1 = { meta, data: new Uint8Array(buf) };
  return cm1;
}
function cm1Sampler(tMin) {
  const { meta, data } = cm1, nx = meta.nx, ny = meta.ny, dk = meta.dx_km, nb = meta.bands_km.length;
  const times = meta.times_s.map((s) => s / 60), last = times.length - 1;
  let f = 0; while (f < last && times[f + 1] <= tMin) f++;
  const g = f < last ? Math.min(1, (tMin - times[f]) / (times[f + 1] - times[f])) : 0, f1 = Math.min(last, f + 1);
  const sx = (meta.summit.lon - CLON) * 111.2 * Math.cos(CLAT * Math.PI / 180), sn = (meta.summit.lat - CLAT) * 111.2;
  const a = meta.wind_toward_deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const px = (fr, b, i, j) => data[((fr * nb + b) * ny + j) * nx + i] / 255;
  return (b, x, n) => {
    if (b > 1) return 0;                                  // CM1 gives the two plates; no cap layer here
    const dx = x - sx, dn = n - sn, s = dx * ca + dn * sa, c = -dx * sa + dn * ca;
    const fi = (s - meta.s0_km) / dk, fj = (c - meta.c0_km) / dk, i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return 0;
    const u = fi - i, v = fj - j;
    const bil = (fr) => (px(fr, b, i, j) * (1 - u) + px(fr, b, i + 1, j) * u) * (1 - v) + (px(fr, b, i, j + 1) * (1 - u) + px(fr, b, i + 1, j + 1) * u) * v;
    return bil(f) * (1 - g) + bil(f1) * g;
  };
}
function cm1Lens() { // the strongest lower-plate column at the last time, as lat/lon
  const { meta, data } = cm1, nx = meta.nx, ny = meta.ny, nb = meta.bands_km.length, fr = meta.times_s.length - 1;
  let best = -1, bi = 0, bj = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = data[((fr * nb) * ny + j) * nx + i]; if (v > best) { best = v; bi = i; bj = j; } }
  const s = meta.s0_km + bi * meta.dx_km, c = meta.c0_km + bj * meta.dx_km, a = meta.wind_toward_deg * Math.PI / 180;
  const dlat = (Math.sin(a) * s + Math.cos(a) * c) / 111.2, dlon = (Math.cos(a) * s - Math.sin(a) * c) / (111.2 * Math.cos(CLAT * Math.PI / 180));
  return { lat: meta.summit.lat + dlat, lon: meta.summit.lon + dlon };
}
function showCM1(tMin) {
  cm1T = tMin; writeWeather(cm1Sampler(tMin));
  $('o-simT').textContent = `${Math.round(tMin)} דק'`; $('simT').value = tMin;
}
async function setSource(src) {
  source = src;
  document.querySelectorAll('[data-src]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.src === src)));
  $('cm1Box').hidden = src !== 'cm1'; $('linBox').hidden = src === 'cm1';
  if (src === 'cm1') {
    status('טוען את הסימולציה…'); await loadCM1(); status('');
    const [lo, hi] = cm1.meta.bands_km;
    clouds.cloudLayers.set([
      { channel: 'r', altitude: lo[0] * 1000, height: (lo[1] - lo[0]) * 1000, densityScale: 0.34, shapeAmount: 0.12, shapeDetailAmount: 0.22, shapeAlteringBias: 0.5, coverageFilterWidth: 0.3, shadow: true },
      { channel: 'g', altitude: hi[0] * 1000, height: (hi[1] - hi[0]) * 1000, densityScale: 0.3, shapeAmount: 0.12, shapeDetailAmount: 0.22, shapeAlteringBias: 0.5, coverageFilterWidth: 0.3, shadow: true },
      { channel: 'b', altitude: 0, height: 0, densityScale: 0 }, { channel: 'a', altitude: 0, height: 0, densityScale: 0 },
    ]);
    lens = cm1Lens(); showCM1(+$('simT').value); placeTags();
  } else {
    if (cm1Play) { cancelAnimationFrame(cm1Play); cm1Play = null; $('simPlay').textContent = '▶ הפעלת השעתיים'; }
    LINEAR_LAYERS.forEach((l, i) => Object.assign(clouds.cloudLayers[i], l));
    lens = buildWeather(last); placeTags();
  }
}
document.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => setSource(b.dataset.src)));
let simQueued = false;
$('simT').addEventListener('input', () => { if (simQueued) return; simQueued = true; requestAnimationFrame(() => { simQueued = false; showCM1(+$('simT').value); }); });
$('simPlay').addEventListener('click', () => {
  if (cm1Play) { cancelAnimationFrame(cm1Play); cm1Play = null; $('simPlay').textContent = '▶ הפעלת השעתיים'; return; }
  let t = cm1T >= 119 ? 0 : cm1T, lastT = performance.now();
  $('simPlay').textContent = '⏸ עצירה';
  const step = (now) => { t = Math.min(120, t + (now - lastT) / 1000 * 6); lastT = now; showCM1(t); // 20 s for two hours
    if (t < 120) cm1Play = requestAnimationFrame(step); else { cm1Play = null; $('simPlay').textContent = '▶ הפעלת השעתיים'; } };
  cm1Play = requestAnimationFrame(step);
});
$('tags').addEventListener('change', () => { const on = $('tags').checked; labels.domElement.hidden = !on; $('layersCard').hidden = !on; sheets.visible = on; });
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
