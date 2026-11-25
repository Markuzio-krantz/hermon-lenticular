// The map: 128 x 128 km of real terrain (Sentinel-2 imagery, SRTM relief) around the 64 km
// physics box. Units: km. x = east, -z = north, y = up * exaggeration. Renders on demand.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createLabels } from './labels.js';

export const WIDE = 128, BOX = 64;
const R_EARTH = 6371;

export function sunState(elevDeg) {
  const e = elevDeg * Math.PI / 180;
  const t = THREE.MathUtils.clamp((elevDeg + 2) / 12, 0, 1);
  const color = new THREE.Color().setRGB(1.0, 0.32 + 0.62 * t ** 0.8, 0.22 + 0.68 * t ** 1.2);
  // below the horizon the sun still lights everything above this height (km): R (1/cos e - 1)
  const shadowKm = elevDeg < 0 ? R_EARTH * (1 / Math.cos(e) - 1) : -10;
  return { color, shadowKm, groundLight: THREE.MathUtils.clamp((elevDeg + 0.4) / 4, 0, 1) };
}

export function createStage(container, { heights, res, places, satURL, satLowURL, coreURL, landURL, normalURL, mobile }) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  let maxDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  let dpr = Math.min(maxDpr, mobile ? 1.25 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.8;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const labelRenderer = new CSS2DRenderer(); labelRenderer.domElement.className = 'labels';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 50 : 40, 1, 0.05, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = true; controls.panSpeed = 0.9; controls.rotateSpeed = 0.7; controls.zoomSpeed = 1.1;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 2; controls.maxDistance = 260; controls.screenSpacePanning = false;
  let dirty = true; const invalidate = () => { dirty = true; };
  controls.addEventListener('change', invalidate);

  // ---------- sky, light, haze
  const sky = new Sky(); sky.scale.setScalar(5000); scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 5; su.rayleigh.value = 2.4; su.mieCoefficient.value = 0.005; su.mieDirectionalG.value = 0.86;
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -72, right: 72, top: 72, bottom: -72, near: 1, far: 500 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.08;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xb4c3f2, 0x4a4030, 1.0); scene.add(hemi);

  // ---------- terrain
  const seg = mobile ? 383 : 767;
  const geo = new THREE.PlaneGeometry(WIDE, WIDE, seg, seg); geo.rotateX(-Math.PI / 2);
  const hAt = (x, n) => { // bilinear, km coords
    const c = (x + WIDE / 2) / WIDE * res - 0.5, r = (WIDE / 2 - n) / WIDE * res - 0.5;
    const cc = Math.min(res - 1.001, Math.max(0, c)), rr = Math.min(res - 1.001, Math.max(0, r));
    const c0 = cc | 0, r0 = rr | 0, fx = cc - c0, fy = rr - r0, i = r0 * res + c0;
    return heights[i] * (1 - fx) * (1 - fy) + heights[i + 1] * fx * (1 - fy) + heights[i + res] * (1 - fx) * fy + heights[i + res + 1] * fx * fy;
  };
  const baseY = new Float32Array(geo.attributes.position.count);
  { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) baseY[i] = hAt(p.getX(i), -p.getZ(i)) / 1000; }
  const loader = new THREE.TextureLoader();
  // progressive: a light texture first, the sharp one swapped in when it arrives
  const sat = loader.load(satLowURL || satURL, invalidate); sat.colorSpace = THREE.SRGBColorSpace; sat.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (satLowURL && satURL !== satLowURL) setTimeout(() => loader.load(satURL, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = sat.anisotropy; mat.map = t; mat.needsUpdate = true; invalidate(); }), 1500);
  const nrm = loader.load(normalURL, invalidate);
  const mat = new THREE.MeshStandardMaterial({ map: sat, normalMap: nrm, normalMapType: THREE.ObjectSpaceNormalMap, roughness: 0.92, metalness: 0 });
  // sharper imagery over the central 64 km (the physics box), feathered into the wide map
  const coreU = { coreMap: { value: null }, coreOn: { value: 0 }, lcMap: { value: null }, lcOn: { value: 0 }, uCity: { value: 0 }, uWaterSky: { value: new THREE.Color(0.3, 0.35, 0.5) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, coreU);
    sh.fragmentShader = `uniform sampler2D coreMap, lcMap; uniform float coreOn, lcOn, uCity; uniform vec3 uWaterSky;
      vec4 lcV = vec4(0.0); vec2 lcFu = vec2(0.0);
      float lcH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float lcN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(lcH(i), lcH(i + vec2(1, 0)), f.x), mix(lcH(i + vec2(0, 1)), lcH(i + 1.0), f.x), f.y); }
` + sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.14, smoothstep(0.2, 0.6, lcV.r));`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (lcOn > 0.5 && uCity > 0.0) {
        // settlements light up after sunset: a soft glow far away, single lights up close
        vec2 cell = lcFu * 0.35; float fw = fwidth(cell.x);
        float sp = step(0.8, lcH(floor(cell))) * (0.5 + lcH(floor(cell) + 7.0));
        float lights = mix(0.05 + 0.05 * lcH(floor(lcFu * 0.05)), sp * 2.2, smoothstep(1.2, 0.35, fw));
        totalEmissiveRadiance += vec3(1.0, 0.62, 0.26) * smoothstep(0.3, 0.9, lcV.b) * lights * uCity * 1.6;
      }`).replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        if (coreOn > 0.5) {
          vec2 cuv = (vMapUv - 0.25) * 2.0;
          float w = smoothstep(0.0, 0.03, min(min(cuv.x, 1.0 - cuv.x), min(cuv.y, 1.0 - cuv.y)));
          if (w > 0.0) sampledDiffuseColor = mix(sampledDiffuseColor, texture2D(coreMap, clamp(cuv, 0.0, 1.0)), w);
        }
        diffuseColor *= sampledDiffuseColor;
        if (lcOn > 0.5) {
          // OpenStreetMap land cover over the satellite image: canopy, orchard rows, built-up, water
          lcV = texture2D(lcMap, vMapUv); lcFu = vMapUv * 8192.0;
          float can = lcN(lcFu) * 0.6 + lcN(lcFu * 2.7) * 0.4;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.6, 0.8, 0.55) * (0.7 + 0.55 * can), lcV.g * 0.85);
          float rows = 0.72 + 0.28 * sin(lcFu.x * 2.6 + lcFu.y * 1.1);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.94, 0.68) * rows, lcV.a * 0.7);
          float blk = 0.82 + 0.34 * lcH(floor(lcFu * 0.7));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2))) * vec3(0.92, 0.9, 0.9) * blk, lcV.b * 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.015, 0.04, 0.07), uWaterSky, 0.4), smoothstep(0.15, 0.6, lcV.r));
        }
      #endif`);
  };
  if (landURL) setTimeout(() => loader.load(landURL, (t) => {
    t.colorSpace = THREE.NoColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    coreU.lcMap.value = t; coreU.lcOn.value = 1; invalidate();
  }), 1500);
  if (coreURL) setTimeout(() => loader.load(coreURL, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    coreU.coreMap.value = t; coreU.coreOn.value = 1; invalidate();
  }), 2500);
  const terrain = new THREE.Mesh(geo, mat); terrain.castShadow = terrain.receiveShadow = true; scene.add(terrain);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(WIDE, 2, WIDE), new THREE.MeshBasicMaterial({ color: 0x0b0c12 }));
  skirt.position.y = -1.25; scene.add(skirt);
  // the world beyond the map fades into haze instead of ending at a hard edge
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshBasicMaterial({ color: 0x3a3a3c }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.03; scene.add(apron);

  // physics box outline draped on the terrain
  const boxPts = [];
  const edge = (x0, n0, x1, n1) => { for (let k = 0; k <= 64; k++) { const x = x0 + (x1 - x0) * k / 64, n = n0 + (n1 - n0) * k / 64; boxPts.push(new THREE.Vector3(x, 0, -n)); } };
  edge(-32, -32, 32, -32); edge(32, -32, 32, 32); edge(32, 32, -32, 32); edge(-32, 32, -32, -32);
  const boxLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(boxPts), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.8, gapSize: 0.6, transparent: true, opacity: 0.55 }));
  scene.add(boxLine);

  let exag = 2;
  function setExaggeration(e) {
    exag = e;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, baseY[i] * e);
    p.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
    const bp = boxLine.geometry.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setY(i, hAt(bp.getX(i), -bp.getZ(i)) / 1000 * e + 0.05);
    bp.needsUpdate = true; boxLine.computeLineDistances();
    labels.setExag(e); renderer.shadowMap.needsUpdate = true; invalidate();
  }
  const labels = createLabels(scene, places, (x, n) => hAt(x, n));

  // ---------- upstream air column + wind arrows
  const column = new THREE.Group(); scene.add(column);
  function setColumn(prof, posKm) {
    column.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); column.clear();
    const [cx, cn] = posKm, boxG = new THREE.BoxGeometry(0.7, 1, 0.7);
    for (let z = 200; z < 8000; z += 100) {
      const k = Math.round(z / prof.dz), moist = THREE.MathUtils.smoothstep(prof.RH[k], 45, 85);
      const b = new THREE.Mesh(boxG, new THREE.MeshBasicMaterial({ color: new THREE.Color().lerpColors(new THREE.Color(0xd7a24a), new THREE.Color(0x6fe0ff), moist), transparent: true, opacity: 0.18 + 0.6 * moist, depthWrite: false }));
      b.scale.y = 0.1 * exag * 0.92; b.position.set(cx, (z + 50) / 1000 * exag, -cn); column.add(b);
    }
    for (let z = 1000; z <= 9000; z += 1000) {
      const k = Math.round(z / prof.dz), u = prof.U[k], v = prof.V[k], sp = Math.hypot(u, v);
      const a = new THREE.ArrowHelper(new THREE.Vector3(u, 0, -v).normalize(), new THREE.Vector3(cx + 0.8, z / 1000 * exag, -cn), 0.35 * sp, 0xffe2c4, 0.9, 0.55);
      column.add(a);
    }
    invalidate();
  }
  // ---------- cross-section plane
  const slice = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffb38a, transparent: true, opacity: 0.025, side: THREE.DoubleSide, depthWrite: false }));
  slice.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xffb38a, transparent: true, opacity: 0.35 })));
  scene.add(slice);
  function setSlice(c, ang, len) { slice.scale.set(len, 8 * exag, 1); slice.position.set(c[0], 4 * exag, -c[1]); slice.rotation.set(0, ang, 0); invalidate(); }
  // ---------- rotors
  const rotors = new THREE.InstancedMesh(new THREE.TorusGeometry(0.45, 0.07, 6, 20), new THREE.MeshBasicMaterial({ color: 0xff5a4e, transparent: true, opacity: 0.8 }), 400);
  rotors.count = 0; scene.add(rotors);
  function setRotors(field, inner, ground, ang) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang + Math.PI / 2, 0)), cell = BOX / inner; let c = 0;
    for (let j = 0; j < inner && c < 400; j += 3) for (let i = 0; i < inner && c < 400; i += 3) if (field[j * inner + i] < 0) {
      m.compose(new THREE.Vector3((i + 0.5) * cell - 32, (ground[j * inner + i] / 1000 + 0.45) * exag, -(32 - (j + 0.5) * cell)), q, new THREE.Vector3(1, 1, 1));
      rotors.setMatrixAt(c++, m);
    }
    rotors.count = c; rotors.instanceMatrix.needsUpdate = true; invalidate();
  }

  // ---------- sun
  let sunElev = 1; const sunAz = 246;
  function setSun(elevDeg) {
    sunElev = elevDeg;
    const st = sunState(elevDeg), phi = THREE.MathUtils.degToRad(90 - elevDeg), th = THREE.MathUtils.degToRad(sunAz);
    const dir = new THREE.Vector3(Math.sin(th) * Math.sin(phi), Math.cos(phi), -Math.cos(th) * Math.sin(phi));
    su.sunPosition.value.copy(dir);
    sun.position.copy(dir.clone().multiplyScalar(200)); sun.target.position.set(0, 0, 0);
    sun.color.copy(st.color); sun.intensity = 3.4 * st.groundLight;
    const tw = THREE.MathUtils.clamp((elevDeg + 4) / 12, 0, 1);
    hemi.intensity = 0.75 + 0.6 * tw;
    hemi.color.setHSL(0.63, 0.55, 0.55 + 0.2 * tw);
    const fogC = new THREE.Color().setHSL(0.66 - 0.06 * (1 - tw), 0.28, 0.16 + 0.34 * tw);
    scene.fog = new THREE.FogExp2(fogC, mobile ? 0.0058 : 0.0048);
    apron.material.color.copy(fogC).multiplyScalar(0.42);
    coreU.uCity.value = THREE.MathUtils.clamp((1.5 - elevDeg) / 3, 0, 1);
    coreU.uWaterSky.value.setHSL(0.62 - 0.08 * (1 - tw), 0.4, 0.22 + 0.4 * tw);
    renderer.shadowMap.needsUpdate = true; invalidate();
    return { dir, ...st };
  }

  // ---------- sizing + adaptive resolution
  let fx = 0, fy = 0;
  function resize() {
    const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h); labelRenderer.setSize(w, h); camera.aspect = w / h;
    if (fx || fy) camera.setViewOffset(w, h, fx, fy, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix(); invalidate();
  }
  /** shift the picture so the subject sits in the part of the screen no card covers */
  function setFrameOffset(x, y) { if (Math.abs(x - fx) < 1 && Math.abs(y - fy) < 1) return; fx = x; fy = y; resize(); }
  new ResizeObserver(resize).observe(container); resize();
  // still frames are rendered sharp: full device resolution while nothing moves
  let hiDpr = Math.min(window.devicePixelRatio || 1, 2);
  function setDprCap(c) { maxDpr = Math.min(window.devicePixelRatio || 1, c); hiDpr = Math.min(window.devicePixelRatio || 1, Math.max(c, 1) * 1.4, 2); dpr = Math.min(dpr, maxDpr); if (!hi) setDpr(dpr); }
  let hi = false;
  function setDpr(p) { const w = container.clientWidth, h = container.clientHeight; renderer.setPixelRatio(p); renderer.setSize(w, h); }
  function sharp(on) { if (on === hi) return; hi = on; setDpr(on ? hiDpr : dpr); }
  let ft = 16, frames = 0;
  function adapt(ms) {
    if (hi) return;
    ft = ft * 0.9 + ms * 0.1; if (++frames % 40) return;
    if (ft > 24 && dpr > 0.7) { dpr = Math.max(0.7, dpr - 0.15); renderer.setPixelRatio(dpr); resize(); }
    else if (ft < 11 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + 0.1); renderer.setPixelRatio(dpr); resize(); }
  }

  // ---------- cameras
  const V = {
    region: { pos: [-26, 78, 92], target: [2, 0, -6] },
    overview: { pos: [-42, 30, 50], target: [6, 2.5, -8] },
    side: { pos: [6, 9, 58], target: [6, 4, -6] },
    wave: { pos: [2, 5.2, 20], target: [11, 4.2, -17] },
    layersView: { pos: [-62, 13, 58], target: [2, 3.6, -4] },
    hermon: { pos: [-13, 13, -4], target: [12.8, 4.5, -18.5] },
    top: { pos: [0.01, 150, 0.01], target: [0, 0, 0] },
  };
  let fly = null;
  function goTo(name, ms = 1600) {
    let pos, tgt;
    if (name === 'hula') {
      const x = -10.7, n = -18.5;
      pos = new THREE.Vector3(x, (hAt(x, n) / 1000 + 0.07) * exag, -n); tgt = new THREE.Vector3(9.5, 3.5 * exag, -18.5);
    } else {
      const v = V[name]; if (!v) return;
      pos = new THREE.Vector3(...v.pos); tgt = new THREE.Vector3(...v.target);
      if (name !== 'top' && name !== 'region') { pos.y *= exag / 2; tgt.y *= exag / 2; }
    }
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, start: performance.now(), ms: Math.max(1, ms) };
    invalidate();
  }
  function goToPose(p, t, ms = 1800) {
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...p), t1: new THREE.Vector3(...t), start: performance.now(), ms: Math.max(1, ms) };
    invalidate();
  }
  function updateFly(now) {
    if (!fly) return false;
    const k = Math.min(1, (now - fly.start) / fly.ms), e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (k >= 1) fly = null;
    return true;
  }
  function zoom(f) {
    const off = camera.position.clone().sub(controls.target);
    const d = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance);
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: controls.target.clone().add(off.setLength(d)), t1: controls.target.clone(), start: performance.now(), ms: 350 };
    invalidate();
  }
  const ray = new THREE.Raycaster();
  function pickRay(ndc) { ray.setFromCamera(ndc, camera); return ray.ray; }
  function pickGround(ndc) { ray.setFromCamera(ndc, camera); const h = ray.intersectObject(terrain)[0]; return h ? [h.point.x, -h.point.z] : null; }

  return {
    renderer, labelRenderer, scene, camera, controls, terrain, column, slice, rotors, labels, boxLine,
    get exag() { return exag; }, get flying() { return !!fly; }, get dirty() { return dirty; }, set dirty(v) { dirty = v; },
    invalidate, adapt, setDprCap, sharp, get isSharp() { return hi; }, setFrameOffset, setExaggeration, setSun, setColumn, setSlice, setRotors, goTo, goToPose, updateFly, pickGround, pickRay, zoom, groundAt: hAt,
  };
}
