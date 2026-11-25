// Lens studio: one lenticular cloud, up close, forming in real time.
// A full-screen ray-marched scene with its own renderer: sunset sky, the ridge below, a stack of
// procedural lens plates (lensgl.js) that condense one after another while the air flows through.
// At rest the frame keeps refining (progressive accumulation), so a still is noise-free.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NOISE_GLSL, LENS_GLSL, makeNoiseTexture } from './lensgl.js';

const DURATION = 26; // seconds for one formation
const PHASES = [
  { t: 0.00, title: 'אוויר לח זורם מעל ההר', line: 'האוויר עוד שקוף. הוא לח, אבל רחוק מעט מרוויה.' },
  { t: 0.14, title: 'נימים ראשונים בפסגת הגל', line: 'בראש הגל האוויר מתקרר לנקודת הטל, והטיפות הראשונות נראות כחוטים דקים.' },
  { t: 0.32, title: 'הלוח הראשון מתמלא', line: 'הטיפות מתרבות מהמרכז החוצה. הקצה מול הרוח חד, הקצה במורד הרוח מתפורר.' },
  { t: 0.52, title: 'שכבות נוספות נדלקות', line: 'כל שכבה לחה שהגל מרים מעל נקודת הטל שלה נעשית לוח נוסף בערימה.' },
  { t: 0.74, title: 'עדשה שלמה, אוויר חולף', line: 'הענן נשאר במקום, אבל האוויר עובר דרכו: מתעבה בכניסה ומתאדה ביציאה.' },
];
const QUALITY = { high: { steps: 190, light: 6, scale: 0.75, still: 1 }, medium: { steps: 140, light: 5, scale: 0.62, still: 0.85 }, low: { steps: 90, light: 4, scale: 0.5, still: 0.66 } };

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform mat4 uInvProj, uInvView;
uniform vec3 uCam, uSun, uSunCol;
uniform float uSunEl, uN, uL, uW, uH, uGap, uFlow, uSeed, uFrame, uLod;
uniform float uG[5];
uniform int uSteps, uLight;
uniform vec2 uRes, uJit;
uniform sampler2D tLines; uniform float uLinesOn;
${NOISE_GLSL}
${LENS_GLSL}
const float SIG = 19.0;
float dens(vec3 p, float lod) {
  float d = 0.0;
  for (int i = 0; i < 5; i++) { if (float(i) >= uN) break; d = max(d, plate(p, float(i), uN, uG[i], uL, uW, uH, uGap, uFlow, uSeed, lod)); }
  return d;
}
// terrain below the lens: the ridge across the wind, the valley beyond (km, lens frame)
float ground(vec2 xz) {
  float rx = (xz.x + 4.5 + 1.4 * sin(xz.y * 0.09)) / 3.8;
  float ridge = 2.55 * exp(-rx * rx);
  float hills = 0.55 * fbm(vec3(xz * 0.22, 1.0), 4) + 0.25 * fbm(vec3(xz * 0.8, 3.0), 3);
  return -3.75 + ridge * (0.82 + 0.3 * fbm(vec3(xz * 0.15, 7.0), 3)) + hills;
}
vec3 skyCol(vec3 rd) {
  float mu = dot(rd, uSun), h = rd.y;
  float toward = pow(clamp(dot(normalize(rd.xz + 1e-4), normalize(uSun.xz)) * 0.5 + 0.5, 0.0, 1.0), 2.5);
  vec3 hor = mix(vec3(0.30, 0.27, 0.42), vec3(1.0, 0.45, 0.17), toward);
  vec3 zen = mix(vec3(0.035, 0.05, 0.16), vec3(0.09, 0.10, 0.27), toward);
  vec3 c = mix(hor, zen, pow(clamp(h, 0.0, 1.0), 0.38));
  // Earth's shadow and the pink belt above it, opposite the sun
  float anti = 1.0 - toward;
  c = mix(c, vec3(0.17, 0.19, 0.33), anti * smoothstep(0.08, 0.0, h) * 0.8);
  float vb = (h - 0.11) / 0.055;
  c += vec3(0.42, 0.15, 0.2) * anti * exp(-vb * vb) * 0.8;
  float sunUp = smoothstep(-0.03, 0.01, uSun.y);
  c += uSunCol * (pow(max(mu, 0.0), 900.0) * 14.0 * sunUp + pow(max(mu, 0.0), 10.0) * 0.45 + pow(max(mu, 0.0), 3.0) * 0.12);
  return c * 0.8;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd, t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  return vec2(max(max(tn.x, tn.y), max(tn.z, 0.0)), min(min(tf.x, tf.y), tf.z));
}
// light reaching a point inside the cloud: several scattering orders, each wider and less attenuated
vec3 lightAt(vec3 p, float cosT, float hfrac) {
  float tau = 0.0, ds = 0.05;
  vec3 q = p;
  for (int k = 0; k < 8; k++) { if (k >= uLight) break; q += uSun * ds; tau += dens(q, 1.0) * ds; ds *= 1.55; }
  float od = tau * SIG;
  vec3 s = vec3(0.0); float a = 1.0, b = 1.0, c = 1.0;
  for (int o = 0; o < 4; o++) {
    float ph = mix(hg(cosT, 0.62 * c), hg(cosT, -0.2 * c), 0.28);
    s += a * exp(-od * b) * ph; a *= 0.52; b *= 0.38; c *= 0.55;
  }
  float powder = 1.0 - 0.6 * exp(-od * 1.6);
  vec3 sun = uSunCol * s * 7.5 * powder;
  vec3 amb = mix(vec3(0.16, 0.13, 0.28), vec3(0.46, 0.30, 0.42), hfrac) * 0.5 * (0.5 + 0.5 * exp(-od * 0.25));
  vec3 bounce = vec3(0.16, 0.08, 0.05) * (1.0 - hfrac) * 0.4;
  return sun + amb + bounce;
}
void main() {
  vec2 ndc = (vUv * 2.0 - 1.0) + uJit / uRes;
  vec4 v = uInvProj * vec4(ndc, 1.0, 1.0); v /= v.w;
  vec3 rd = normalize((uInvView * vec4(v.xyz, 0.0)).xyz), ro = uCam;
  float jit = fract(ign(gl_FragCoord.xy) + uFrame * 0.618034);
  // ground
  float tg = 1e9; vec3 bg = skyCol(rd);
  if (rd.y < 0.25) {
    float t = 0.05;
    for (int i = 0; i < 110; i++) {
      vec3 p = ro + rd * t; float dh = p.y - ground(p.xz);
      if (dh < 0.004 * t) { tg = t; break; }
      t += max(0.02, dh * 0.45 + 0.002 * t); if (t > 90.0) break;
    }
    if (tg < 1e8) {
      vec3 p = ro + rd * tg; float e = 0.06;
      vec3 n = normalize(vec3(ground(p.xz - vec2(e, 0)) - ground(p.xz + vec2(e, 0)), 2.0 * e, ground(p.xz - vec2(0, e)) - ground(p.xz + vec2(0, e))));
      float lit = max(dot(n, uSun), 0.0) * smoothstep(-0.02, 0.03, uSun.y);
      float alt = clamp((p.y + 3.75) / 2.8, 0.0, 1.0);
      vec3 gc = mix(vec3(0.022, 0.02, 0.035), vec3(0.06, 0.045, 0.06), alt) + uSunCol * lit * 0.18 * alt;
      bg = mix(gc, vec3(0.16, 0.15, 0.26), 1.0 - exp(-tg * 0.03));
    }
  }
  // cloud
  float top = uN * (uH * 0.78 + uGap) + uH;
  vec2 hb = boxHit(ro, rd, vec3(-0.66 * uL, -0.25 * uH, -0.66 * uW), vec3(0.8 * uL, top, 0.66 * uW));
  vec3 col = vec3(0.0); float T = 1.0;
  vec4 ln = uLinesOn > 0.5 ? texture2D(tLines, vUv) : vec4(0.0);
  bool lineDone = ln.a <= 0.0;
  if (hb.x < hb.y && hb.x < tg) {
    float t1 = min(hb.y, tg), len = t1 - hb.x;
    float ds = max(len / float(uSteps), 0.006), t = hb.x + ds * jit;
    float cosT = dot(rd, uSun);
    for (int i = 0; i < 400; i++) {
      if (i >= uSteps || t > t1 || T < 0.01) break;
      if (!lineDone && t > ln.a) { col += T * ln.rgb; lineDone = true; }
      vec3 p = ro + rd * t;
      float d = dens(p, uLod);
      if (d > 0.002) {
        float a = 1.0 - exp(-d * SIG * ds);
        col += T * a * lightAt(p, cosT, clamp((p.y + 0.1) / top, 0.0, 1.0));
        T *= 1.0 - a; t += ds;
      } else t += ds * 2.0;
    }
  }
  if (!lineDone) col += T * ln.rgb;
  col += T * bg;
  col = aces(col * 1.05);
  vec2 q = vUv - 0.5; col *= 1.0 - 0.28 * dot(q, q) * 1.6;
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

const ACC_FRAG = /* glsl */`
varying vec2 vUv; uniform sampler2D tNew, tPrev; uniform float uW;
void main() { gl_FragColor = mix(texture2D(tPrev, vUv), texture2D(tNew, vUv), uW); }`;
const COPY_FRAG = /* glsl */`varying vec2 vUv; uniform sampler2D tSrc; void main() { gl_FragColor = texture2D(tSrc, vUv); }`;

// air flow lines: rendered to their own target with view distance in alpha, then composited
// inside the march so the cloud hides the lines that pass behind it
const LINE_VERT = /* glsl */`
attribute float ax; varying float vX, vD, vW;
uniform float uFlow;
void main() { vX = ax; vW = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`;
const LINE_FRAG = /* glsl */`
varying float vX, vD, vW; uniform float uFlow, uWave;
void main() {
  float dash = smoothstep(0.35, 1.0, sin((vX - uFlow * 2.2) * 2.6) * 0.5 + 0.5);
  float fade = smoothstep(9.0, 5.0, abs(vX));
  vec3 c = mix(vec3(0.42, 0.62, 1.0), vec3(1.0, 0.96, 0.9), smoothstep(0.0, 0.3, vW - uWave));
  gl_FragColor = vec4(c * (0.18 + 0.5 * dash) * fade * 0.55, vD);
}`;

export function createStudio(host, { mobile = false, quality = 'medium', onClose } = {}) {
  host.innerHTML = `
  <canvas class="st-canvas" aria-hidden="true"></canvas>
  <header class="st-top">
    <div class="st-brand"><b>סטודיו העדשה</b><span>עדשה אחת, מקרוב, נוצרת מול העיניים</span></div>
    <span class="st-acts"><button class="st-mode" type="button" data-a="cine" aria-pressed="false">קולנועי</button><button class="st-x" type="button" data-a="close" aria-label="סגירת הסטודיו">×</button></span>
  </header>
  <video class="st-video" data-r="video" src="renders/formation.mp4" poster="renders/formation_poster.jpg" muted loop playsinline preload="none" hidden aria-label="אנימציה מוכנה של היווצרות העדשה"></video>
  <div class="st-cap" aria-live="polite"><b data-r="title"></b><span data-r="line"></span></div>
  <div class="st-hint" data-r="hint">גררו לסיבוב · גלגלת או צביטה לזום</div>
  <div class="st-bar">
    <button class="st-play" type="button" data-a="play" aria-label="השהיה"><svg viewBox="0 0 24 24" aria-hidden="true"><path data-r="icon" d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg></button>
    <div class="st-time"><input type="range" min="0" max="1000" value="0" data-r="scrub" aria-label="שלב ההיווצרות"><div class="st-ticks">${PHASES.map((p) => `<i style="inset-inline-start:${p.t * 100}%"></i>`).join('')}</div></div>
    <button class="st-more" type="button" data-a="panel" aria-expanded="false">כוונון</button>
  </div>
  <div class="st-panel" data-r="panel" hidden>
    <label>מספר שכבות לחות <output data-o="n">3</output><input type="range" min="1" max="5" step="1" value="3" data-k="n"></label>
    <label>גובה השמש <output data-o="sun"></output><input type="range" min="-2" max="8" step="0.1" value="0.6" data-k="sun"></label>
    <label>מהירות הזרימה (מואצת) <output data-o="flow"></output><input type="range" min="0" max="1" step="0.01" value="0.45" data-k="flow"></label>
    <label>לחות <output data-o="moist"></output><input type="range" min="0.55" max="1.2" step="0.01" value="1" data-k="moist"></label>
    <label class="st-check"><input type="checkbox" data-k="lines"> קווי זרימה של האוויר</label>
    <div class="st-views"><button type="button" data-v="below">מהעמק</button><button type="button" data-v="side">מהצד</button><button type="button" data-v="close">צמוד לשפה</button><button type="button" data-v="above">מלמעלה</button></div>
    <p class="st-note">ההדמיה מגזימה מעט בעובי הלוחות ובצבע, כדי שיהיה קל לראות. גובה העדשה האמיתי כ-3.8 ק"מ, אורכה כ-5 ק"מ.</p>
  </div>`;
  const $ = (s) => host.querySelector(s);
  const canvas = $('.st-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.autoClear = true;
  // if the GPU gives up on a frame, come back at the lightest quality instead of a blank screen
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); q = QUALITY.low; auto = 0.6; stillCap = 0.6; });
  canvas.addEventListener('webglcontextrestored', () => { acc = 0; size(q.scale * auto); });
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 1.2; controls.maxDistance = 16;
  controls.target.set(0.2, 0.35, 0); controls.autoRotateSpeed = 0.25;
  const VIEWS = { below: [[1.2, -1.7, 7.0], [0.2, 0.5, 0]], side: [[0.3, 0.6, 6.4], [0.2, 0.4, 0]], close: [[2.6, 0.35, 1.9], [1.4, 0.3, 0]], above: [[-2.5, 4.8, 4.2], [0.3, 0.3, 0]] };
  camera.position.set(...VIEWS.below[0]); controls.target.set(...VIEWS.below[1]);

  const P = { n: 3, sun: 0.6, flow: 0.45, moist: 1, lines: false };
  const U = {
    uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() },
    uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uSunEl: { value: 0 },
    uN: { value: 3 }, uL: { value: 5.0 }, uW: { value: 2.3 }, uH: { value: 0.4 }, uGap: { value: 0.0 },
    uFlow: { value: 0 }, uSeed: { value: 1.7 }, uFrame: { value: 0 }, uLod: { value: 0 },
    uG: { value: [0, 0, 0, 0, 0] }, uSteps: { value: 128 }, uLight: { value: 6 },
    uRes: { value: new THREE.Vector2(1, 1) }, uJit: { value: new THREE.Vector2() },
    tLines: { value: null }, uLinesOn: { value: 0 }, uNoise: { value: makeNoiseTexture(THREE) },
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const mainMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, depthTest: false, depthWrite: false });
  const accMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: ACC_FRAG, uniforms: { tNew: { value: null }, tPrev: { value: null }, uW: { value: 1 } }, depthTest: false });
  const copyMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COPY_FRAG, uniforms: { tSrc: { value: null } }, depthTest: false });

  // flow lines scene
  const lineScene = new THREE.Scene();
  const lineU = { uFlow: U.uFlow, uWave: { value: 0 } };
  const lineMat = new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: lineU, transparent: false });
  for (let y0 = -0.9; y0 <= 1.75; y0 += 0.33) for (let z0 = -1.8; z0 <= 1.81; z0 += 0.9) {
    const pts = [], ax = [];
    for (let x = -10; x <= 10; x += 0.08) {
      const wave = 0.34 * Math.cos((2 * Math.PI * x) / 6) * Math.exp(-((x / 7.5) ** 2));
      pts.push(x, y0 + wave, z0); ax.push(x);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('ax', new THREE.Float32BufferAttribute(ax, 1));
    lineScene.add(new THREE.Line(g, lineMat));
  }

  const tgtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  let rtNew = new THREE.WebGLRenderTarget(4, 4, tgtOpts), rtA = new THREE.WebGLRenderTarget(4, 4, tgtOpts), rtB = new THREE.WebGLRenderTarget(4, 4, tgtOpts);
  const rtLines = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  let qName = quality;
  const cineDefault = () => mobile || qName === 'low';
  let q = QUALITY[quality] || QUALITY.medium, curScale = 0, acc = 0, w = 1, h = 1, bw = 1;
  function size(scale) {
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    w = host.clientWidth; h = host.clientHeight; renderer.setSize(w, h, false);
    let rw = Math.max(64, Math.round(w * dpr * scale)), rh = Math.max(64, Math.round(h * dpr * scale));
    const cap = (mobile ? 0.9 : 2.0) * 1e6; // pixel budget per ray-marched frame
    if (rw * rh > cap) { const k = Math.sqrt(cap / (rw * rh)); rw = Math.round(rw * k); rh = Math.round(rh * k); }
    for (const rt of [rtNew, rtA, rtB, rtLines]) rt.setSize(rw, rh);
    U.uRes.value.set(rw, rh); camera.aspect = w / h; camera.updateProjectionMatrix(); curScale = scale; acc = 0;
  }

  // ---- state
  let ft = 16, fc = 0, auto = 1, stillCap = 1;
  let open = false, playing = true, t = 0, last = 0, raf = 0, interacting = false, lastInteract = 0, flowClock = 0, phaseIdx = -1;
  controls.addEventListener('start', () => { interacting = true; controls.autoRotate = false; $('[data-r=hint]').classList.add('gone'); });
  controls.addEventListener('end', () => { interacting = false; lastInteract = performance.now(); });
  controls.addEventListener('change', () => { acc = 0; });

  function sunState() {
    const el = (P.sun * Math.PI) / 180, az = (138 * Math.PI) / 180; // low in the west, behind the observer in the valley: the lens is lit from the front
    U.uSun.value.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    const k = THREE.MathUtils.smoothstep(P.sun, -1.6, 7);
    const c = new THREE.Color(1.0, 0.36 + 0.4 * k, 0.1 + 0.42 * k).multiplyScalar(0.5 + 0.85 * THREE.MathUtils.smoothstep(P.sun, -2.4, 0.4));
    U.uSunCol.value.copy(c); U.uSunEl.value = P.sun;
  }
  function growth() {
    const n = P.n; U.uN.value = n;
    for (let i = 0; i < 5; i++) {
      const s0 = 0.16 + (i / Math.max(1, n - 1)) * 0.38 * (n > 1 ? 1 : 0);
      const g = THREE.MathUtils.smoothstep(t, s0, s0 + 0.3);
      U.uG.value[i] = i < n ? g * P.moist * (1 - 0.06 * i) : 0;
    }
    lineU.uWave.value = 0.15;
  }
  function caption() {
    let k = 0; for (let i = 0; i < PHASES.length; i++) if (t >= PHASES[i].t) k = i;
    if (k === phaseIdx) return; phaseIdx = k;
    $('[data-r=title]').textContent = PHASES[k].title; $('[data-r=line]').textContent = PHASES[k].line;
    const cap = $('.st-cap'); cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in');
  }
  function outputs() {
    $('[data-o=n]').textContent = P.n;
    $('[data-o=sun]').textContent = `⁦${P.sun.toFixed(1)}°⁩`;
    $('[data-o=flow]').textContent = P.flow < 0.02 ? 'עצורה' : `×${Math.round(20 + P.flow * 380)}`;
    $('[data-o=moist]').textContent = `${Math.round(P.moist * 100)}%`;
  }
  function setPlaying(on) {
    playing = on; $('[data-r=icon]').setAttribute('d', on ? 'M7 5h3v14H7zM14 5h3v14h-3z' : 'M8 5l11 7-11 7z');
    $('[data-a=play]').setAttribute('aria-label', on ? 'השהיה' : 'הפעלה');
    if (on && t >= 1) t = 0; acc = 0; if (!on) controls.autoRotate = false;
  }

  function render(now) {
    raf = requestAnimationFrame(render);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (playing) { t = Math.min(1, t + dt / DURATION); $('[data-r=scrub]').value = String(Math.round(t * 1000)); if (t >= 1) { /* hold at the peak, the air keeps flowing */ } }
    const flowing = P.flow > 0.02 && (playing || t >= 1);
    if (flowing) flowClock += dt * (0.02 + P.flow * 0.38);
    U.uFlow.value = flowClock;
    controls.update();
    // never let the orbit sink into the ridge (cheap upper bound of the shader's ground)
    { const c = camera.position, rx = (c.x + 4.5 + 1.4 * Math.sin(c.z * 0.09)) / 3.8, gMax = -3.75 + 2.55 * 1.12 * Math.exp(-rx * rx) + 0.85;
      if (c.y < gMax + 0.35) { c.y = gMax + 0.35; camera.lookAt(controls.target); } }
    const moving = interacting || now - lastInteract < 250;
    const animating = playing && t < 1 || flowing || controls.autoRotate;
    const want = moving || animating ? q.scale * (mobile ? 0.85 : 1) * auto : q.still * stillCap;
    if (Math.abs(want - curScale) > 0.01) size(want);
    // still frames converge; moving frames blend a little for smoothness
    bw = moving ? 1 : animating ? 0.45 : 1 / (acc + 1);
    if (!moving && !animating && acc > 48) return; // converged, nothing to do
    growth(); caption();
    camera.updateMatrixWorld();
    U.uInvProj.value.copy(camera.projectionMatrixInverse); U.uInvView.value.copy(camera.matrixWorld); U.uCam.value.copy(camera.position);
    U.uFrame.value = (U.uFrame.value + 1) % 4096;
    U.uSteps.value = moving ? Math.round(q.steps * 0.7) : q.steps;
    U.uLight.value = q.light; U.uLod.value = moving && mobile ? 1 : 0;
    const j = acc === 0 && bw === 1 ? [0, 0] : [Math.random() - 0.5, Math.random() - 0.5];
    U.uJit.value.set(j[0] * 2, j[1] * 2);
    if (P.lines) { renderer.setRenderTarget(rtLines); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(lineScene, camera); U.tLines.value = rtLines.texture; U.uLinesOn.value = 1; } else U.uLinesOn.value = 0;
    quad.material = mainMat; renderer.setRenderTarget(rtNew); renderer.render(quadScene, ortho);
    accMat.uniforms.tNew.value = rtNew.texture; accMat.uniforms.tPrev.value = rtA.texture; accMat.uniforms.uW.value = acc === 0 ? 1 : bw;
    quad.material = accMat; renderer.setRenderTarget(rtB); renderer.render(quadScene, ortho);
    [rtA, rtB] = [rtB, rtA];
    copyMat.uniforms.tSrc.value = rtA.texture; quad.material = copyMat; renderer.setRenderTarget(null); renderer.render(quadScene, ortho);
    acc = moving || animating ? Math.min(acc + 1, 3) : acc + 1;
    // keep motion smooth: lower the internal resolution when frames are slow, recover when fast
    if (moving || animating) {
      ft = ft * 0.9 + dt * 1000 * 0.1;
      if (++fc % 30 === 0) { if (ft > 42 && auto > 0.55) auto = Math.max(0.55, auto * 0.85); else if (ft < 22 && auto < 1) auto = Math.min(1, auto * 1.08); }
    }
  }

  // ---- cinematic mode: the same formation, pre-rendered at full quality, for any screen
  const video = $('[data-r=video]'), cineBtn = $('[data-a=cine]');
  let cine = false;
  function setCine(on) {
    cine = on; cineBtn.setAttribute('aria-pressed', String(on)); cineBtn.textContent = on ? 'אינטראקטיבי' : 'קולנועי';
    video.hidden = !on; host.classList.toggle('cine', on);
    if (on) { cancelAnimationFrame(raf); video.currentTime = 0; video.play().catch(() => {}); }
    else { video.pause(); last = 0; acc = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }
  }
  cineBtn.onclick = () => setCine(!cine);
  video.addEventListener('timeupdate', () => {
    t = Math.min(1, video.currentTime / (video.duration || 24) / 0.82); caption(); $('[data-r=scrub]').value = String(Math.round(t * 1000));
  });

  // ---- UI
  host.querySelector('[data-a=close]').onclick = () => api.close();
  host.querySelector('[data-a=play]').onclick = () => { if (cine) { if (video.paused) video.play(); else video.pause(); return; } setPlaying(!playing); };
  const scrub = $('[data-r=scrub]');
  scrub.addEventListener('input', () => { if (cine) { video.currentTime = (scrub.value / 1000) * 0.82 * (video.duration || 24); return; } t = scrub.value / 1000; if (playing) setPlaying(false); acc = 0; });
  const panelBtn = $('[data-a=panel]'), panel = $('[data-r=panel]');
  panelBtn.onclick = () => { panel.hidden = !panel.hidden; panelBtn.setAttribute('aria-expanded', String(!panel.hidden)); };
  for (const inp of host.querySelectorAll('[data-k]')) {
    inp.addEventListener('input', () => {
      const k = inp.dataset.k; P[k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
      if (k === 'sun') sunState(); outputs(); acc = 0;
    });
  }
  for (const b of host.querySelectorAll('[data-v]')) b.onclick = () => flyTo(VIEWS[b.dataset.v]);
  function flyTo([pos, tgt]) {
    const p0 = camera.position.clone(), t0 = controls.target.clone(), p1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...tgt), s = performance.now();
    controls.autoRotate = false;
    const step = (now) => { const k = Math.min(1, (now - s) / 1400), e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      camera.position.lerpVectors(p0, p1, e); controls.target.lerpVectors(t0, t1, e); acc = 0; lastInteract = now; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function onKey(e) {
    if (!open) return;
    if (e.key === 'Escape') { e.stopPropagation(); api.close(); }
    else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setPlaying(!playing); }
  }
  addEventListener('keydown', onKey, true);
  addEventListener('resize', () => { if (open) size(curScale || q.scale); });

  sunState(); outputs();
  const api = {
    open({ restart = true } = {}) {
      open = true; host.hidden = false; document.body.classList.add('studio-on');
      size(q.scale); if (restart) { t = 0; phaseIdx = -1; setPlaying(true); controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches; }
      last = 0; cancelAnimationFrame(raf);
      // phones and the light quality tier start with the pre-rendered version; one tap switches to live
      if (cineDefault()) setCine(true); else { if (cine) setCine(false); raf = requestAnimationFrame(render); }
      host.querySelector('[data-a=play]').focus();
    },
    close() {
      open = false; host.hidden = true; document.body.classList.remove('studio-on'); cancelAnimationFrame(raf); video.pause(); onClose?.();
    },
    setQuality(name) { qName = name; q = QUALITY[name] || q; acc = 0; },
    // offline: one frame of the formation at a given time and camera, accumulated over many samples
    capture({ time, flow, pos, tgt, samples = 12, width = 1280, height = 720, steps = 220 }) {
      cancelAnimationFrame(raf); playing = false; controls.autoRotate = false;
      if (rtNew.width !== width || rtNew.height !== height) {
        renderer.setSize(width, height, false); for (const rt of [rtNew, rtA, rtB, rtLines]) rt.setSize(width, height);
        U.uRes.value.set(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
      }
      t = time; growth(); U.uFlow.value = flow;
      camera.position.set(...pos); camera.lookAt(new THREE.Vector3(...tgt)); camera.updateMatrixWorld();
      U.uInvProj.value.copy(camera.projectionMatrixInverse); U.uInvView.value.copy(camera.matrixWorld); U.uCam.value.copy(camera.position);
      U.uSteps.value = steps; U.uLight.value = 7; U.uLod.value = 0; U.uLinesOn.value = 0;
      for (let k = 0; k < samples; k++) {
        U.uFrame.value = k * 37 + 1; U.uJit.value.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
        quad.material = mainMat; renderer.setRenderTarget(rtNew); renderer.render(quadScene, ortho);
        accMat.uniforms.tNew.value = rtNew.texture; accMat.uniforms.tPrev.value = rtA.texture; accMat.uniforms.uW.value = 1 / (k + 1);
        quad.material = accMat; renderer.setRenderTarget(rtB); renderer.render(quadScene, ortho); [rtA, rtB] = [rtB, rtA];
      }
      copyMat.uniforms.tSrc.value = rtA.texture; quad.material = copyMat; renderer.setRenderTarget(null); renderer.render(quadScene, ortho);
      return canvas;
    },
    get isOpen() { return open; },
  };
  return api;
}
