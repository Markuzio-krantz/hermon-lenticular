// The main 3-D view, volumetric: a physical atmosphere (Bruneton, via Takram) with volumetric clouds,
// over the true terrain placed on the globe. It draws on its own canvas UNDER the stage; the stage
// keeps drawing the explanation layers (air layers, curtain, flow, rotors, labels) on top, with its
// terrain in depth only so mountains still hide what is behind them. The stage camera drives both.
//
// Clouds come from a "local weather" texture: the site's physics (or the CM1 simulation) decides
// where each plate of the lens is; the renderer gives it light, shadow, haze and sky.
import * as THREE from 'three';
import { EffectComposer, EffectPass, NormalPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { AerialPerspectiveEffect, PrecomputedTexturesLoader, DEFAULT_PRECOMPUTED_TEXTURES_URL } from '@takram/three-atmosphere';
import { CloudsEffect, DEFAULT_SHAPE_URL, DEFAULT_SHAPE_DETAIL_URL, DEFAULT_TURBULENCE_URL, CLOUD_SHAPE_TEXTURE_SIZE, CLOUD_SHAPE_DETAIL_TEXTURE_SIZE } from '@takram/three-clouds';
import { DataTextureLoader, Ellipsoid, Geodetic, parseUint8Array, radians, STBNLoader, DEFAULT_STBN_URL } from '@takram/three-geospatial';

const CLAT = 33.25, CLON = 35.72, HALF_KM = 64;

// Takram tiles local weather on a cube-sphere UV; same mapping in JS so we can place our texture
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

export async function createVolume(container, { heights, res = 1024, satURL, coreURL, landURL, mobile = false, quality = 'medium' }) {
  const canvas = document.createElement('canvas'); canvas.className = 'volume';
  container.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, depth: false, logarithmicDepthBuffer: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
  renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 10;
  const camera = new THREE.PerspectiveCamera(40, 1, 10, 1e6);
  const scene = new THREE.Scene();

  const center = new Geodetic(radians(CLON), radians(CLAT), 0).toECEF();
  const E = new THREE.Vector3(), N = new THREE.Vector3(), U = new THREE.Vector3();
  Ellipsoid.WGS84.getEastNorthUpVectors(center, E, N, U);

  const aerial = new AerialPerspectiveEffect(camera);
  aerial.sky = true; aerial.sunLight = true; aerial.skyLight = true;
  const normalPass = new NormalPass(scene, camera); aerial.normalBuffer = normalPass.texture;
  const clouds = new CloudsEffect(camera);
  clouds.events.addEventListener('change', (e) => {
    if (e.property === 'atmosphereOverlay') aerial.overlay = clouds.atmosphereOverlay;
    if (e.property === 'atmosphereShadow') aerial.shadow = clouds.atmosphereShadow;
    if (e.property === 'atmosphereShadowLength') aerial.shadowLength = clouds.atmosphereShadowLength;
  });
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera)); composer.addPass(normalPass);
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
  clouds.qualityPreset = quality; clouds.coverage = 0.62;

  // cloud layers in km (multiplied by the vertical exaggeration when placed)
  let exag = 2, amount = 1, layerKm = [];
  const BASE = [
    { channel: 'r', densityScale: 0.34, shapeAmount: 0.1, shapeDetailAmount: 0.18, shapeAlteringBias: 0.5, coverageFilterWidth: 0.18, shadow: true },
    { channel: 'g', densityScale: 0.3, shapeAmount: 0.1, shapeDetailAmount: 0.18, shapeAlteringBias: 0.5, coverageFilterWidth: 0.18, shadow: true },
    { channel: 'b', densityScale: 0.2, shapeAmount: 0.45, shapeDetailAmount: 0.5, shapeAlteringBias: 0.35, coverageFilterWidth: 0.3, shadow: true },
  ];
  function applyLayers() {
    const L = BASE.map((b, i) => ({ ...b, altitude: (layerKm[i]?.[0] ?? 0) * 1000 * exag, height: layerKm[i] ? (layerKm[i][1] - layerKm[i][0]) * 1000 * Math.min(exag, 1.15) : 0, /* exaggerate where, not how thick: lenses stay flat */ densityScale: layerKm[i] ? b.densityScale * amount : 0 }));
    clouds.cloudLayers.set([...L, { channel: 'a', altitude: 0, height: 0, densityScale: 0 }]);
  }

  // terrain: the same 128 km map, true heights times the exaggeration, imagery + land cover
  const small = mobile, S = small ? 512 : 1024, st = res / S;
  const geo = new THREE.PlaneGeometry(HALF_KM * 2000, HALF_KM * 2000, S - 1, S - 1), pos = geo.attributes.position;
  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) pos.setZ(r * S + c, Math.max(0, heights[(r * st) * res + c * st]));
  geo.computeVertexNormals();
  const tl = new THREE.TextureLoader(), aniso = renderer.capabilities.getMaxAnisotropy();
  const sat = tl.load(satURL); sat.colorSpace = THREE.SRGBColorSpace; sat.anisotropy = aniso;
  const U2 = { core: { value: null }, lc: { value: null }, coreOn: { value: 0 }, lcOn: { value: 0 } };
  if (coreURL) tl.load(coreURL, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; U2.core.value = t; U2.coreOn.value = 1; });
  if (landURL) tl.load(landURL, (t) => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = aniso; U2.lc.value = t; U2.lcOn.value = 1; });
  const mat = new THREE.MeshBasicMaterial({ map: sat });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U2);
    sh.fragmentShader = 'uniform sampler2D core, lc; uniform float coreOn, lcOn;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 sc = texture2D(map, vMapUv);
      if (coreOn > 0.5) { vec2 cu = (vMapUv - 0.25) * 2.0; float w = smoothstep(0.0, 0.03, min(min(cu.x, 1.0 - cu.x), min(cu.y, 1.0 - cu.y)));
        if (w > 0.0) sc = mix(sc, texture2D(core, clamp(cu, 0.0, 1.0)), w); }
      if (lcOn > 0.5) { vec4 l = texture2D(lc, vMapUv);
        sc.rgb = mix(sc.rgb, sc.rgb * vec3(0.62, 0.8, 0.56), l.g * 0.7);
        sc.rgb = mix(sc.rgb, sc.rgb * vec3(0.8, 0.95, 0.7), l.a * 0.5);
        sc.rgb = mix(sc.rgb, vec3(0.025, 0.06, 0.1), smoothstep(0.15, 0.6, l.r) * 0.9); }
      diffuseColor *= sc;`);
  };
  const ground = new THREE.Mesh(geo, mat);
  const g = new THREE.Group(); Ellipsoid.WGS84.getEastNorthUpFrame(center).decompose(g.position, g.quaternion, g.scale);
  g.add(ground); scene.add(g);

  // weather texture from a sampler f(band 0..2, x east km, n north km) -> 0..1
  let anchor = null;
  function writeWeather(f) {
    const p0 = center.clone().addScaledVector(U, 4000), uv0 = cubeUv(p0);
    const ue = cubeUv(p0.clone().addScaledVector(E, 1000)), un = cubeUv(p0.clone().addScaledVector(N, 1000));
    const J = [[ue[0] - uv0[0], un[0] - uv0[0]], [ue[1] - uv0[1], un[1] - uv0[1]]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0], Ji = [[J[1][1] / det, -J[0][1] / det], [-J[1][0] / det, J[0][0] / det]];
    const perKm = Math.max(Math.hypot(J[0][0], J[1][0]), Math.hypot(J[0][1], J[1][1])), R = 1 / (perKm * 160);
    const T = 512, data = new Uint8Array(T * T * 4);
    for (let t = 0; t < T; t++) for (let s = 0; s < T; s++) {
      const du = ((s + 0.5) / T - 0.5) / R, dv = ((t + 0.5) / T - 0.5) / R;
      const x = Ji[0][0] * du + Ji[0][1] * dv, n = Ji[1][0] * du + Ji[1][1] * dv, o = (t * T + s) * 4;
      for (let b = 0; b < 3; b++) data[o + b] = Math.round(255 * Math.max(0, Math.min(1, f(b, x, n))));
    }
    const tex = new THREE.DataTexture(data, T, T, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipMapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
    clouds.localWeatherTexture?.dispose?.(); clouds.localWeatherTexture = tex;
    clouds.localWeatherRepeat.set(R, R); clouds.localWeatherVelocity.set(0, 0); anchor = { p0, R };
  }
  const tmp = new THREE.Vector3();
  function reanchor() { // the shader samples at ECEF + altitudeCorrection, which follows the camera
    if (!anchor) return;
    const uv = cubeUv(tmp.copy(anchor.p0).add(clouds.altitudeCorrection));
    clouds.localWeatherOffset.set(0.5 - uv[0] * anchor.R, 0.5 - uv[1] * anchor.R);
  }

  // from the site's physics result: lower plate, upper plate, cap cloud
  function fromField(r) {
    const [nx, ny, nz] = r.volDims, dz = 8 / nz, vol = r.vol;
    const bands = [[3.45, 4.05], [4.05, 4.9], [1.2, 3.35]];
    const B = bands.map(() => new Float32Array(nx * ny)), mx = [0, 0, 0];
    for (let v = 0; v < nz; v++) { const z = (v + 0.5) * dz; for (let b = 0; b < 3; b++) { if (z < bands[b][0] || z >= bands[b][1]) continue;
      for (let k = 0; k < nx * ny; k++) { const q = vol[v * nx * ny + k]; if (q > B[b][k]) { B[b][k] = q; if (q > mx[b]) mx[b] = q; } } } }
    const at = (b, x, n) => {
      const fi = (x + 32) / 64 * nx - 0.5, fj = (32 - n) / 64 * ny - 0.5, i = Math.floor(fi), j = Math.floor(fj);
      if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return 0;
      const a = fi - i, c = fj - j, A = B[b];
      return (A[j * nx + i] * (1 - a) + A[j * nx + i + 1] * a) * (1 - c) + (A[(j + 1) * nx + i] * (1 - a) + A[(j + 1) * nx + i + 1] * a) * c;
    };
    layerKm = [[3.5, 3.95], [4.05, 4.5], [2.4, 3.1]]; applyLayers();
    writeWeather((b, x, n) => Math.sqrt(at(b, x, n) / Math.max(1e-6, mx[b])));
  }
  // from the CM1 3-D simulation (two plates), at a time in minutes
  let cm1 = null;
  async function fromCM1(tMin = 120) {
    if (!cm1) {
      const [meta, buf] = await Promise.all([fetch('data/cm1_meta.json').then((r) => r.json()), fetch('data/cm1_weather.bin').then((r) => r.arrayBuffer())]);
      cm1 = { meta, data: new Uint8Array(buf) };
    }
    const { meta, data } = cm1, nx = meta.nx, ny = meta.ny, dk = meta.dx_km, nb = meta.bands_km.length;
    const times = meta.times_s.map((s) => s / 60), last = times.length - 1;
    let f = 0; while (f < last && times[f + 1] <= tMin) f++;
    const w = f < last ? Math.min(1, (tMin - times[f]) / (times[f + 1] - times[f])) : 0, f1 = Math.min(last, f + 1);
    const sx = (meta.summit.lon - CLON) * 111.2 * Math.cos(CLAT * Math.PI / 180), sn = (meta.summit.lat - CLAT) * 111.2;
    const a = meta.wind_toward_deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const px = (fr, b, i, j) => data[((fr * nb + b) * ny + j) * nx + i] / 255;
    layerKm = [meta.bands_km[0], meta.bands_km[1], null]; applyLayers();
    writeWeather((b, x, n) => {
      if (b > 1) return 0;
      const dx = x - sx, dn = n - sn, s = dx * ca + dn * sa, c = -dx * sa + dn * ca;
      const fi = (s - meta.s0_km) / dk, fj = (c - meta.c0_km) / dk, i = Math.floor(fi), j = Math.floor(fj);
      if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return 0;
      const u = fi - i, v = fj - j;
      const bil = (fr) => (px(fr, b, i, j) * (1 - u) + px(fr, b, i + 1, j) * u) * (1 - v) + (px(fr, b, i, j + 1) * (1 - u) + px(fr, b, i + 1, j + 1) * u) * v;
      return bil(f) * (1 - w) + bil(f1) * w;
    });
  }

  // camera: the stage camera works in km, x east, y up, z south; map it onto ECEF metres
  const M = new THREE.Matrix4().makeBasis(E, U, N.clone().negate()), qM = new THREE.Quaternion().setFromRotationMatrix(M);
  function syncCamera(c) {
    camera.position.copy(center).addScaledVector(E, c.position.x * 1000).addScaledVector(U, c.position.y * 1000).addScaledVector(N, -c.position.z * 1000);
    camera.quaternion.copy(qM).multiply(c.quaternion);
    camera.fov = c.fov; camera.aspect = c.aspect; camera.near = Math.max(10, c.near * 1000); camera.far = 1e6;
    if (c.view?.enabled) camera.setViewOffset(c.view.fullWidth, c.view.fullHeight, c.view.offsetX, c.view.offsetY, c.view.width, c.view.height); else camera.clearViewOffset();
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }
  function setSunLocal(d) { // d: unit vector to the sun in the stage frame
    const s = new THREE.Vector3().addScaledVector(E, d.x).addScaledVector(U, d.y).addScaledVector(N, -d.z).normalize();
    aerial.sunDirection.copy(s); clouds.sunDirection.copy(s);
  }
  function setExag(e) { exag = e; ground.scale.set(1, 1, e); applyLayers(); }
  function setAmount(a) { if (Math.abs(a - amount) < 0.01) return; amount = a; applyLayers(); }
  function resize() { const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h); }
  resize(); addEventListener('resize', resize);
  let active = true;
  return {
    canvas, clouds, aerial,
    render(stageCamera) { if (!active) return; syncCamera(stageCamera); reanchor(); composer.render(); },
    fromField, fromCM1, setSunLocal, setExag, setAmount, setQuality(q) { clouds.qualityPreset = q; },
    set active(v) { active = v; canvas.hidden = !v; }, get active() { return active; },
    resize,
  };
}
