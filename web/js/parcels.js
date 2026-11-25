// Air parcels riding the computed streamlines. Each parcel keeps its upstream level z0,
// drifts with the wind of that level and sits at z0 + eta(x, y, z0). Colour shows its state:
// dry (amber) -> humid (blue) -> condensed (white). The cloud stays put while parcels pass through.
import * as THREE from 'three';
import { condensate, liftedRH } from './cloudfield.js';

const VERT = /* glsl */`
attribute vec3 color; attribute float size; varying vec3 vC; varying float vA;
uniform float uScale;
void main() {
  vC = color; vA = size > 0.0 ? 1.0 : 0.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * uScale / -mv.z, 3.0, 10.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
varying vec3 vC; varying float vA;
void main() {
  if (vA < 0.5) discard;
  vec2 d = gl_PointCoord - 0.5; float r = dot(d, d);
  if (r > 0.25) discard;
  float a = smoothstep(0.25, 0.0, r);
  gl_FragColor = vec4(vC * a, a);
}`;

export function createParcels(scene, count = 5000) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: { uScale: { value: 900 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; scene.add(points);

  // parcel state: x,n in km, o = level index, age
  const px = new Float32Array(count), pn = new Float32Array(count), po = new Uint16Array(count), age = new Float32Array(count);
  let F = null, mode = 'curtain', rake = { cx: -20, cn: 10, ang: 0 }, zRange = [1200, 7000];
  const dry = new THREE.Color(0xd9a149), wet = new THREE.Color(0x5fc8ff), cloud = new THREE.Color(0xffffff);
  const tmp = new THREE.Color();

  function levelIndex(z) { return Math.max(0, Math.min(F.outZ.length - 1, Math.round((z - F.outZ[0]) / 100))); }
  function spawn(i, anywhere) {
    const o = levelIndex(zRange[0] + Math.random() * (zRange[1] - zRange[0]));
    po[i] = o; age[i] = 0;
    if (mode === 'all' || anywhere) {
      px[i] = (Math.random() - 0.5) * 64; pn[i] = (Math.random() - 0.5) * 64;
      if (mode === 'curtain' && anywhere) { // spread along the curtain's path
        const s = Math.random() * 70, w = (Math.random() - 0.5) * 2.2;
        px[i] = rake.cx + Math.cos(rake.ang) * s - Math.sin(rake.ang) * w;
        pn[i] = rake.cn + Math.sin(rake.ang) * s + Math.cos(rake.ang) * w;
      }
      return;
    }
    // curtain: a thin vertical sheet released upstream, perpendicular to the wind
    const w = (Math.random() - 0.5) * 2.2;
    px[i] = rake.cx - Math.sin(rake.ang) * w; pn[i] = rake.cn + Math.cos(rake.ang) * w;
  }

  function etaAt(o, x, n) {
    const N = F.inner, c = (x + 32) / 64 * N - 0.5, r = (32 - n) / 64 * N - 0.5;
    if (c < 0 || r < 0 || c > N - 1.001 || r > N - 1.001) return null;
    const c0 = c | 0, r0 = r | 0, fx = c - c0, fy = r - r0, b = o * N * N + r0 * N + c0, e = F.eta;
    return e[b] * (1 - fx) * (1 - fy) + e[b + 1] * fx * (1 - fy) + e[b + N] * (1 - fx) * fy + e[b + N + 1] * fx * fy;
  }
  function groundAt(x, n) {
    const N = F.inner, c = Math.min(N - 1, Math.max(0, Math.round((x + 32) / 64 * N - 0.5))), r = Math.min(N - 1, Math.max(0, Math.round((32 - n) / 64 * N - 0.5)));
    return F.ground[r * N + c];
  }

  return {
    points,
    setField(f) { F = f; for (let i = 0; i < count; i++) spawn(i, true); },
    setMode(m, rk) { mode = m; if (rk) rake = rk; if (F) for (let i = 0; i < count; i++) spawn(i, true); },
    setRange(a, b) { zRange = [a, b]; },
    set visible(v) { points.visible = v; },
    update(dtSec, speedup, exag) {
      if (!F) return;
      const prof = F.prof;
      for (let i = 0; i < count; i++) {
        const o = po[i], z0 = F.outZ[o], k = Math.round(z0 / prof.dz);
        const u = prof.U[k], v = prof.V[k];
        px[i] += u * dtSec * speedup / 1000; pn[i] += v * dtSec * speedup / 1000; age[i] += dtSec;
        let e = etaAt(o, px[i], pn[i]);
        if (e === null || age[i] > 400) { spawn(i, false); e = etaAt(o, px[i], pn[i]) ?? 0; }
        const z = z0 + e, g = groundAt(px[i], pn[i]);
        pos[i * 3] = px[i]; pos[i * 3 + 1] = z / 1000 * exag; pos[i * 3 + 2] = -pn[i];
        if (z < g + 30) { size[i] = 0; continue; }   // blocked air: flows around, not over
        const q = condensate(F.lt, k, e);
        if (q > 0.004) {
          tmp.copy(cloud); size[i] = 0.24;
        } else {
          const rh = liftedRH(F.lt, k, Math.max(0, e));
          tmp.lerpColors(dry, wet, THREE.MathUtils.smoothstep(rh, 35, 95));
          tmp.multiplyScalar(0.55 + 0.45 * (rh / 100)); size[i] = 0.13;
        }
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.size.needsUpdate = true;
    },
  };
}
