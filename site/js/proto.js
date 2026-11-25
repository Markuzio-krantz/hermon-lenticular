// Prototype: Takram's volumetric clouds and physical atmosphere, driven by our mountain-wave model.
// The physics decides where each plate of the lens is (a "local weather" texture placed exactly over
// the Hermon on the globe); Takram's renderer gives it light, shadow, aerial perspective and sky.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
  const S = 512, geo = new THREE.PlaneGeometry(HALF_KM * 2000, HALF_KM * 2000, S - 1, S - 1), pos = geo.attributes.position;
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) pos.setZ(r * S + c, Math.max(0, wide[(r * 2) * 1024 + c * 2]));
  geo.computeVertexNormals();
  const sat = new THREE.TextureLoader().load('data/wide_sat_4096.webp'); sat.colorSpace = THREE.SRGBColorSpace; sat.anisotropy = 8;
  const ground = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: sat }));
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
const lens = buildWeather(result);
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
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

let fpsT = performance.now(), fpsN = 0;
renderer.setAnimationLoop(() => {
  controls.update(); anchorWeather(); composer.render();
  fpsN++; const now = performance.now(); if (now - fpsT > 1000) { $('fps').textContent = `${(fpsN * 1000 / (now - fpsT)).toFixed(0)} fps`; fpsN = 0; fpsT = now; }
});
window.__proto = { clouds, aerial, camera, result };
