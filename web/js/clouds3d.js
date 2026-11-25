// Volumetric cloud renderer: ray-marches the cloud-water volume computed by the physics,
// limited by the scene depth so mountains hide clouds behind them. Single scattering with a
// short shadow march toward the sun, Henyey-Greenstein phase, Earth's-shadow line at sunset.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = /* glsl */`
precision highp float; precision highp sampler3D;
uniform sampler3D uVol; uniform sampler2D uDepth;
uniform vec2 uRes; uniform mat4 uProjInv, uViewInv;
uniform float uExag, uQmax, uDensity, uShadowKm, uTime, uOpacity, uArt; uniform int uSteps;
uniform vec3 uSunDir, uSunColor, uAmbTop, uAmbBot, uBMin, uBMax;
varying vec3 vWorld;
const float HALF = 32.0, ZTOP = 8.0;

vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd, t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
uniform highp sampler3D uNoise; uniform vec2 uWindDir;
float n3(vec3 p) { return texture(uNoise, p * (1.0 / 32.0)).r; }
float fbm3(vec3 p) { return (n3(p) * 0.5 + n3(p * 2.03 + 1.7) * 0.25 + n3(p * 4.1 + 5.3) * 0.125) / 0.875; }
// raw cloud water (g/kg) at p in REAL km (x east, y up, z south)
float qAt(vec3 p) {
  vec3 uvw = vec3((p.x + HALF) / (2.0 * HALF), (p.z + HALF) / (2.0 * HALF), p.y / ZTOP);
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return 0.0;
  float b = texture(uVol, uvw).r;
  return b * b * uQmax;
}
// cheap version for light, shade and normals: the smooth shell only
float densLo(vec3 p) { return smoothstep(0.003, 0.05, qAt(p)); }
// full detail: the physics decides where the lens is, the procedural layer how it looks up close:
// fibres stretched along the wind in thin sheets, eroding the rim into wisps, and ribbons in height
float dens(vec3 p) {
  float q = qAt(p);
  if (q < 0.002) return 0.0;
  vec2 w = normalize(uWindDir + 1e-5);
  float al = dot(p.xz, w), ac = dot(p.xz, vec2(-w.y, w.x));
  float n1 = n3(vec3(al * 0.5, p.y * 4.0, ac * 0.9));
  float base = smoothstep(0.003, 0.055 + 0.03 * n1, q);
  if (uArt < 0.5) return base;
  float f = fbm3(vec3(al * 1.6, p.y * 30.0 + n1 * 5.0, ac * 2.4) + 11.0);
  float rib = 0.55 + 0.45 * smoothstep(0.25, 0.75, n3(vec3(al * 0.42, p.y * 21.0 + n1 * 3.0, ac * 0.5)));
  float er = (1.0 - base) * 0.95 + 0.2;
  return clamp((base - f * er) / (1.0 - f * er * 0.6), 0.0, 1.0) * rib;
}
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

void main() {
  vec3 ro = cameraPosition, rd = normalize(vWorld - ro);
  // only march where the clouds actually are (tight box from the data)
  vec3 bmin = uBMin * vec3(1.0, uExag, 1.0), bmax = uBMax * vec3(1.0, uExag, 1.0);
  vec2 t = boxHit(ro, rd, bmin, bmax);
  t.x = max(t.x, 0.0);
  vec2 suv = gl_FragCoord.xy / uRes;
  float d = texture2D(uDepth, suv).x;
  if (d < 1.0) {
    vec4 v = uProjInv * vec4(suv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
    vec3 wp = (uViewInv * v).xyz; t.y = min(t.y, length(wp - ro));
  }
  if (t.x >= t.y) discard;
  const int STEPS = 320;
  vec3 scale = vec3(1.0, 1.0 / uExag, 1.0);
  float span = t.y - t.x, dt = max(span / float(uSteps), 0.022);
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float tt = t.x + dt * ign;
  vec3 L = normalize(uSunDir);
  float cosT = dot(normalize(rd * scale), L);
  float phase = mix(hg(cosT, 0.72), hg(cosT, -0.2), 0.35) * 4.0 * 3.14159;
  // sunset palette: warm pink-orange light on top, lavender in the shade
  vec3 sunC = uSunColor;
  vec3 glow = vec3(1.0, 0.56, 0.24) * max(max(sunC.r, sunC.g), 0.001) * 1.2;
  sunC = mix(sunC, glow, 0.7 * uArt);
  vec3 shadeCol = mix(uAmbBot, vec3(0.36, 0.24, 0.42), 0.8 * uArt);
  vec3 skyCol = mix(uAmbTop, vec3(0.78, 0.46, 0.5), 0.7 * uArt);
  vec3 col = vec3(0.0); float T = 1.0;
  for (int i = 0; i < STEPS; i++) {
    if (i >= uSteps || tt > t.y || T < 0.008) break;
    vec3 p = (ro + rd * tt) * scale;
    float dd = dens(p);
    if (dd > 0.001) {
      float sigma = dd * uDensity;
      float ds = length(rd * scale) * dt;
      float tau = 0.0, sl = 0.0, dl = 0.03;
      for (int j = 0; j < 6; j++) { sl += dl; tau += densLo(p + L * sl) * uDensity * dl; dl *= 1.8; }
      float up = 0.0; for (int j = 1; j <= 3; j++) up += densLo(p + vec3(0.0, 0.05 * float(j), 0.0)) + densLo(p + L * 0.08 * float(j));
      float lit = smoothstep(uShadowKm - 0.15, uShadowKm + 0.15, p.y);
      // surface normal from the density gradient: sculpted light and a bright rim
      const float E = 0.045;
      float d0 = densLo(p);
      vec3 gr = vec3(densLo(p + vec3(E, 0, 0)) - d0, densLo(p + vec3(0, E * 0.5, 0)) - d0, densLo(p + vec3(0, 0, E)) - d0);
      vec3 nrm = -normalize(gr + vec3(1e-5));
      float diff = clamp(dot(nrm, L) * 0.5 + 0.5, 0.0, 1.0);
      float rim = pow(1.0 - abs(dot(nrm, normalize(rd * scale))), 3.0);
      vec3 sunK = sunC * mix(vec3(1.0, 0.5, 0.5), vec3(1.0), smoothstep(uShadowKm, uShadowKm + 1.4, p.y));
      float beer = exp(-tau), powder = 1.0 - exp(-sigma * 0.12);
      vec3 S = sunK * lit * ((beer * phase * (0.45 + 0.55 * powder) + 0.3 * exp(-tau * 0.3)) * mix(0.45, 1.35, diff) + rim * 0.35 * uArt) * 1.15
             + mix(skyCol, shadeCol, clamp(up / 4.0, 0.0, 1.0)) * (0.32 + 0.3 * exp(-tau * 0.2));
      float a = exp(-sigma * ds);
      col += T * S * (1.0 - a);
      T *= a;
    }
    tt += dt;
  }
  float alpha = (1.0 - T) * uOpacity;
  gl_FragColor = vec4(col * uOpacity, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const COPY_FRAG = /* glsl */`
uniform sampler2D tDiffuse; varying vec2 vUv;
void main() { gl_FragColor = texture2D(tDiffuse, vUv);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const tmpSize = new THREE.Vector2();
// 64^3 tileable smooth noise (random voxels blurred along each axis): one fetch per octave
function makeNoise(N = 64) {
  let a = new Float32Array(N * N * N), seed = 987654321;
  for (let i = 0; i < a.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; a[i] = seed / 4294967296; }
  const id = (x, y, z) => ((z + N) % N) * N * N + ((y + N) % N) * N + ((x + N) % N);
  for (let pass = 0; pass < 2; pass++) for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    const b = new Float32Array(a.length);
    for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
      b[id(x, y, z)] = 0.25 * a[id(x - dx, y - dy, z - dz)] + 0.5 * a[id(x, y, z)] + 0.25 * a[id(x + dx, y + dy, z + dz)];
    a = b;
  }
  let lo = 1, hi = 0; for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const d = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) d[i] = Math.round(((a[i] - lo) / (hi - lo)) * 255);
  const t = new THREE.Data3DTexture(d, N, N, N);
  t.format = THREE.RedFormat; t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
export function createCloudRenderer(renderer, { scale: scale0 = 1 } = {}) {
  let scale = scale0;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const csize = () => { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); return new THREE.Vector2(Math.max(1, Math.round(s.x * scale)), Math.max(1, Math.round(s.y * scale))); };
  const crt = scale < 1 ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }) : null;
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
  rt.depthTexture.type = THREE.UnsignedIntType;

  const vol = new THREE.Data3DTexture(new Uint8Array(8), 2, 2, 2);
  vol.format = THREE.RedFormat; vol.minFilter = vol.magFilter = THREE.LinearFilter; vol.unpackAlignment = 1; vol.needsUpdate = true;

  const uniforms = {
    uVol: { value: vol }, uDepth: { value: rt.depthTexture }, uRes: { value: size.clone() },
    uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() },
    uExag: { value: 2 }, uQmax: { value: 1 }, uDensity: { value: 70 }, uShadowKm: { value: -10 }, uTime: { value: 0 }, uOpacity: { value: 1 }, uArt: { value: 1 }, uSteps: { value: 220 },
    uBMin: { value: new THREE.Vector3(-32, 0, -32) }, uBMax: { value: new THREE.Vector3(32, 8, 32) },
    uNoise: { value: makeNoise() }, uWindDir: { value: new THREE.Vector2(1, 0) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
    uAmbTop: { value: new THREE.Color(0.32, 0.38, 0.6) }, uAmbBot: { value: new THREE.Color(0.18, 0.17, 0.25) },
  };
  const box = new THREE.Mesh(new THREE.BoxGeometry(64, 8, 64), new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms, side: THREE.BackSide, transparent: true,
    depthTest: false, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  box.material.toneMapped = true;
  box.frustumCulled = false;
  const cloudScene = new THREE.Scene(); cloudScene.add(box);

  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: COPY_FRAG, depthTest: false, depthWrite: false,
  }));
  quad.material.toneMapped = true;
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  // half-resolution cloud layer composited with premultiplied alpha
  const GLOW_FRAG = `uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv); vec4 g = vec4(0.0);
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; vec2 o = vec2(cos(a), sin(a)) * uTexel;
      g += texture2D(tDiffuse, vUv + o * 2.5) + texture2D(tDiffuse, vUv + o * 5.0) * 0.5; }
    g /= 12.8;
    gl_FragColor = c + vec4(g.rgb * vec3(1.0, 0.8, 0.7) * 0.22, g.a * 0.1) * (1.0 - c.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
  const cquad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: crt ? crt.texture : null }, uTexel: { value: new THREE.Vector2(0.002, 0.002) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: GLOW_FRAG, depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  cquad.material.toneMapped = true;
  const cquadScene = new THREE.Scene(); cquadScene.add(cquad);
  let enabled = true;

  return {
    uniforms, box,
    setScale(s) { scale = s; },
    set enabled(v) { enabled = v; }, get enabled() { return enabled; },
    setVolume(data, dims, maxQ) {
      const [nx, ny, nz] = dims, bytes = new Uint8Array(nx * ny * nz);
      const qref = Math.max(0.05, maxQ);
      let x0 = nx, x1 = -1, y0 = ny, y1 = -1, z0 = nz, z1 = -1;
      for (let i = 0; i < bytes.length; i++) {
        const b = Math.min(255, Math.round(255 * Math.sqrt(Math.min(1, data[i] / qref)))); bytes[i] = b;
        if (b > 6) { const x = i % nx, y = ((i / nx) | 0) % ny, z = (i / (nx * ny)) | 0;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      }
      if (x1 < 0) { uniforms.uBMin.value.set(0, -1, 0); uniforms.uBMax.value.set(0, -1, 0); }
      else { // tight box in real km (x east, y up, z south), one voxel of margin
        uniforms.uBMin.value.set((x0 - 1) / nx * 64 - 32, Math.max(0, (z0 - 1) / nz * 8), (y0 - 1) / ny * 64 - 32);
        uniforms.uBMax.value.set((x1 + 2) / nx * 64 - 32, Math.min(8, (z1 + 2) / nz * 8), (y1 + 2) / ny * 64 - 32);
      }
      const tex = new THREE.Data3DTexture(bytes, nx, ny, nz);
      tex.format = THREE.RedFormat; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.unpackAlignment = 1;
      tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
      uniforms.uVol.value.dispose(); uniforms.uVol.value = tex; uniforms.uQmax.value = qref;
    },
    setExag(e) { uniforms.uExag.value = e; box.scale.set(1, e, 1); box.position.set(0, 4 * e, 0); },
    resize() {
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      rt.setSize(s.x, s.y); uniforms.uRes.value.copy(s);
    },
    render(scene, camera, time) {
      const s = renderer.getDrawingBufferSize(tmpSize);
      if (s.x === 0 || s.y === 0) return;
      if (rt.width !== s.x || rt.height !== s.y) rt.setSize(s.x, s.y);
      const cs = crt ? csize() : s;
      if (crt && (crt.width !== cs.x || crt.height !== cs.y)) { crt.setSize(cs.x, cs.y); cquad.material.uniforms.uTexel.value.set(1 / cs.x, 1 / cs.y); }
      uniforms.uRes.value.copy(cs);
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.autoClear = false; renderer.clear();
      renderer.render(quadScene, quadCam);
      if (enabled) {
        uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
        uniforms.uViewInv.value.copy(camera.matrixWorld);
        uniforms.uTime.value = time;
        if (crt) {
          renderer.setRenderTarget(crt); renderer.setClearColor(0x000000, 0); renderer.clear();
          renderer.render(cloudScene, camera);
          renderer.setRenderTarget(null); renderer.render(cquadScene, quadCam);
        } else renderer.render(cloudScene, camera);
      }
      renderer.autoClear = true;
    },
  };
}
