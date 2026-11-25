// Three.js scene: real terrain (km units, x = east, -z = north, y = up * exaggeration),
// physical sky, sunset sun with Earth's shadow, labels, column of upstream air, wind arrows.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export const EXT_KM = 64;
const R_EARTH = 6371;

export function sunState(elevDeg) {
  const e = elevDeg * Math.PI / 180;
  // colour of direct sunlight after the long low path (rough Rayleigh/Mie reddening)
  const t = THREE.MathUtils.clamp((elevDeg + 2) / 12, 0, 1);
  const col = new THREE.Color().setRGB(1.0, 0.32 + 0.62 * t ** 0.8, 0.22 + 0.68 * t ** 1.2);
  // height (km) of Earth's shadow above the observer's horizon level for a sun below the horizon
  const shadowKm = elevDeg < 0 ? R_EARTH * (1 / Math.cos(e) - 1) : -10;
  return { color: col, shadowKm, groundLight: THREE.MathUtils.clamp((elevDeg + 0.5) / 4, 0, 1) };
}

export function createScene(container, heights, res, meta, albedoURL) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.75;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 2000);
  camera.position.set(-38, 26, 52);
  const controls = new OrbitControls(camera, labelRenderer.domElement);
  controls.target.set(4, 3, -4); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 2; controls.maxDistance = 220;

  // ---------- sky
  const sky = new Sky(); sky.scale.setScalar(4000); scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 6; su.rayleigh.value = 2.2; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.86;

  // ---------- lights
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xa9b8f0, 0x4a4030, 1.0); scene.add(hemi);

  // ---------- terrain
  const geo = new THREE.PlaneGeometry(EXT_KM, EXT_KM, res - 1, res - 1);
  geo.rotateX(-Math.PI / 2);
  const tex = new THREE.TextureLoader().load(albedoURL);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  const terrain = new THREE.Mesh(geo, mat); terrain.castShadow = terrain.receiveShadow = true;
  scene.add(terrain);
  // dark skirt so the model reads as a diorama
  const base = new THREE.Mesh(new THREE.BoxGeometry(EXT_KM, 1, EXT_KM), new THREE.MeshStandardMaterial({ color: 0x14131c, roughness: 1 }));
  base.position.y = -0.5; scene.add(base);

  let exag = 2;
  function setExaggeration(e) {
    exag = e;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i] / 1000 * e);
    pos.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
    for (const l of labels) l.obj.position.y = (l.h / 1000) * e + 0.35 * e;
  }
  const groundAt = (xKm, northKm) => {
    const c = Math.round((xKm + EXT_KM / 2) / EXT_KM * res - 0.5), r = Math.round((EXT_KM / 2 - northKm) / EXT_KM * res - 0.5);
    return heights[Math.min(res - 1, Math.max(0, r)) * res + Math.min(res - 1, Math.max(0, c))];
  };

  // ---------- labels
  const NAMES = {
    hermon: 'החרמון 2814', harDov: 'הר דוב', hulaValley: 'עמק החולה', kiryatShmona: 'קריית שמונה',
    ramim: 'רכס רמים', golan: 'רמת הגולן', merom: 'מרום גולן', dafna: 'דפנה', kfarBlum: 'כפר בלום', harKnaan: 'הר כנען (צפת)',
  };
  const labels = [];
  for (const [k, name] of Object.entries(NAMES)) {
    const lm = meta.landmarks[k]; if (!lm) continue;
    const el = document.createElement('div'); el.className = 'lbl' + (k === 'hermon' ? ' lbl-major' : ''); el.textContent = name;
    const obj = new CSS2DObject(el);
    const x = lm[0] / 1000, n = lm[1] / 1000, h = groundAt(x, n);
    obj.position.set(x, 0, -n); scene.add(obj);
    labels.push({ obj, h });
  }
  const compass = document.createElement('div'); compass.className = 'lbl lbl-n'; compass.textContent = 'צפון ↑';
  const cobj = new CSS2DObject(compass); cobj.position.set(0, 0.2, -EXT_KM / 2 - 2); scene.add(cobj);

  // ---------- upstream air column (radiosonde) + wind arrows
  const column = new THREE.Group(); scene.add(column);
  function setColumn(prof, posKm, windDirFrom) {
    column.clear();
    const [cx, cn] = posKm;
    for (let z = 200; z < 8000; z += 100) {
      const k = Math.round(z / prof.dz), rh = prof.RH[k];
      const moist = THREE.MathUtils.smoothstep(rh, 45, 85);
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().lerpColors(new THREE.Color(0xd7a24a), new THREE.Color(0x6fe0ff), moist), transparent: true, opacity: 0.18 + 0.6 * moist, depthWrite: false });
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1 * exag * 0.92, 0.7), m);
      b.position.set(cx, (z + 50) / 1000 * exag, -cn); column.add(b);
    }
    for (let z = 1000; z <= 9000; z += 1000) {
      const k = Math.round(z / prof.dz), u = prof.U[k], v = prof.V[k], sp = Math.hypot(u, v);
      const dir = new THREE.Vector3(u, 0, -v).normalize();
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(cx + 0.8, z / 1000 * exag, -cn), 0.35 * sp, 0xffe2c4, 0.9, 0.55);
      arrow.line.material.transparent = true; arrow.line.material.opacity = 0.8;
      column.add(arrow);
    }
  }

  // ---------- slice plane (cross-section location)
  const sliceMat = new THREE.MeshBasicMaterial({ color: 0xffb38a, transparent: true, opacity: 0.022, side: THREE.DoubleSide, depthWrite: false });
  const slice = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sliceMat); scene.add(slice);
  const sliceEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xffb38a, transparent: true, opacity: 0.35 }));
  slice.add(sliceEdge);
  function setSlice(centerKm, angleRad, lenKm) {
    slice.scale.set(lenKm, 8 * exag, 1);
    slice.position.set(centerKm[0], 4 * exag, -centerKm[1]);
    slice.rotation.set(0, angleRad, 0);
  }

  // ---------- rotors
  const rotorGeo = new THREE.TorusGeometry(0.45, 0.07, 6, 20);
  const rotors = new THREE.InstancedMesh(rotorGeo, new THREE.MeshBasicMaterial({ color: 0xff5a4e, transparent: true, opacity: 0.75 }), 400);
  rotors.count = 0; scene.add(rotors);
  function setRotors(field, inner, ground, windAngle) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, windAngle + Math.PI / 2, 0));
    let c = 0; const step = 3, cell = EXT_KM / inner;
    for (let j = 0; j < inner && c < 400; j += step) for (let i = 0; i < inner && c < 400; i += step) {
      if (field[j * inner + i] < 0) {
        const x = (i + 0.5) * cell - EXT_KM / 2, n = EXT_KM / 2 - (j + 0.5) * cell;
        m.compose(new THREE.Vector3(x, (ground[j * inner + i] / 1000 + 0.45) * exag, -n), q, new THREE.Vector3(1, 1, 1));
        rotors.setMatrixAt(c++, m);
      }
    }
    rotors.count = c; rotors.instanceMatrix.needsUpdate = true;
  }

  // ---------- sun / time of day
  let sunElev = 1.0;
  const sunAz = 246;
  function setSun(elevDeg) {
    sunElev = elevDeg;
    const st = sunState(elevDeg);
    const phi = THREE.MathUtils.degToRad(90 - elevDeg), theta = THREE.MathUtils.degToRad(sunAz);
    const dir = new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(phi), -Math.cos(theta) * Math.sin(phi));
    su.sunPosition.value.copy(dir);
    sun.position.copy(dir.clone().multiplyScalar(120)); sun.target.position.set(0, 0, 0);
    sun.color.copy(st.color); sun.intensity = 3.2 * st.groundLight;
    hemi.intensity = 0.9 + 0.5 * THREE.MathUtils.clamp((elevDeg + 4) / 10, 0, 1);
    const fogC = new THREE.Color().setHSL(0.68, 0.25, 0.1 + 0.18 * THREE.MathUtils.clamp((elevDeg + 4) / 14, 0, 1));
    scene.fog = new THREE.FogExp2(fogC, 0.0045);
    return { dir, ...st };
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h); labelRenderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container); resize();

  const views = {
    overview: { pos: [-38, 26, 52], target: [4, 3, -4] },
    hula: () => { const a = meta.landmarks.agamonHula; const x = a[0] / 1000, n = a[1] / 1000 - 2; return { pos: [x, (groundAt(x, n) / 1000 + 0.08) * exag, -n], target: [12.8 - 4, 3.4 * exag, -18.5] }; },
    side: { pos: [4, 9, 58], target: [4, 4, -2] },
    hermon: { pos: [-14, 14, -2], target: [12.8, 4.5, -18.5] },
    top: { pos: [0.01, 95, 0.01], target: [0, 0, 0] },
  };
  let fly = null;
  function goTo(name, ms = 1600) {
    let v = views[name]; if (typeof v === 'function') v = v(); if (!v) return;
    const pos = new THREE.Vector3(...v.pos), tgt = new THREE.Vector3(...v.target);
    if (name !== 'hula' && name !== 'top') { pos.y *= exag / 2; tgt.y *= exag / 2; }
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, start: performance.now(), ms };
  }
  function updateFly(now) {
    if (!fly) return;
    const k = Math.min(1, (now - fly.start) / fly.ms), e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (k >= 1) fly = null;
  }
  const raycaster = new THREE.Raycaster();
  function pickGround(ndc) {
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(terrain)[0];
    return hit ? [hit.point.x, -hit.point.z] : null;
  }

  return {
    THREE, renderer, labelRenderer, scene, camera, controls, terrain, labels, column, slice, rotors,
    get exag() { return exag; }, get sunElev() { return sunElev; },
    setExaggeration, setSun, setColumn, setSlice, setRotors, goTo, updateFly, groundAt, pickGround,
    showLabels: (on) => { labelRenderer.domElement.style.display = on ? '' : 'none'; },
  };
}
