// Procedural lenticular cloud: stacked lens-shaped plates with wind-stretched ribbons.
// Shared by the studio (one lens, animated growth) and the map (many lenses from the physics).
// Lens frame: x along the wind, y up, z across the wind; units km.
export const NOISE_GLSL = /* glsl */`
uniform highp sampler3D uNoise;
float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
// smooth tileable value noise from a 64^3 texture: one fetch instead of eight hashes
float vnoise(vec3 x) { return texture(uNoise, x * (1.0 / 32.0)).r; }
float fbm(vec3 p, int oct) { float a = 0.5, s = 0.0, n = 0.0; for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise(p); n += a; p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / n * 0.94; }
`;

// 64^3 tileable noise: random voxels blurred twice along each axis, normalised to 0..1
export function makeNoiseTexture(THREE, N = 64) {
  let a = new Float32Array(N * N * N);
  let seed = 1234567;
  for (let i = 0; i < a.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; a[i] = seed / 4294967296; }
  const idx = (x, y, z) => ((z + N) % N) * N * N + ((y + N) % N) * N + ((x + N) % N);
  for (let pass = 0; pass < 2; pass++) for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    const b = new Float32Array(a.length);
    for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
      b[idx(x, y, z)] = 0.25 * a[idx(x - dx, y - dy, z - dz)] + 0.5 * a[idx(x, y, z)] + 0.25 * a[idx(x + dx, y + dy, z + dz)];
    a = b;
  }
  let lo = 1, hi = 0; for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const d = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) d[i] = Math.round(((a[i] - lo) / (hi - lo)) * 255);
  const t = new THREE.Data3DTexture(d, N, N, N);
  t.format = THREE.RedFormat; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

/**
 * plate(q, i, n, g, L, W, H, gap, flowT, seed, lod)
 *   q    point in lens frame (km)      i  plate index (0 = lowest)   n  plates in the stack
 *   g    growth 0..1 (blooms from the crest outward)
 *   L,W  length along / across wind    H  plate thickness at the centre
 *   flowT wind advection of the texture (km)  seed  per-lens variation  lod 0 = full, 1 = light march
 */
export const LENS_GLSL = /* glsl */`
float plate(vec3 q, float i, float n, float g, float L, float W, float H, float gap, float flowT, float seed, float lod) {
  if (g <= 0.0) return 0.0;
  float sc = 1.0 - 0.12 * i - 0.05 * i * i;                 // upper plates smaller, like a pile of saucers
  float yc = i * (H * 0.6 + gap);
  vec3 c = q - vec3((0.06 + 0.03 * sin(seed + i)) * i * L, yc, 0.02 * i * W * sin(seed * 2.0 + i));
  float hx = 0.5 * L * sc, hz = 0.5 * W * sc;
  if (abs(c.y) > H * 1.2 || abs(c.x) > hx * 1.25 || abs(c.z) > hz * 1.25) return 0.0;
  float rx = c.x / hx, rz = c.z / hz, r = sqrt(rx * rx + rz * rz);
  vec3 fp = vec3(c.x - flowT, c.y, c.z) + seed * 3.1;
  float n1 = fbm(fp * vec3(0.55, 6.0, 1.2), lod > 0.5 ? 2 : 4);
  float n2 = lod > 0.5 ? 0.5 : fbm(fp * vec3(2.2, 9.0, 2.6) + 4.0, 3);
  // ragged downstream edge, crisp upstream edge
  float down = smoothstep(-0.3, 1.0, rx);
  float edge = r + (n1 - 0.5) * (0.22 + 0.34 * down) + (n2 - 0.5) * (0.08 + 0.3 * down);
  float grow = smoothstep(g * 1.06, g * 1.06 - 0.14, edge);
  if (grow <= 0.0) return 0.0;
  // lens profile: domed top, flatter base, thin rim
  float t = H * sc * pow(max(0.0, 1.0 - r * r), 0.55);
  // the underside carries ripples across the wind, the top small domes and steps
  float rip = sin(c.x * 15.0 / max(sc, 0.4) + n1 * 4.0 + seed) * 0.5 + 0.5;
  float top = 0.64 * t * (0.86 + 0.3 * n1 + 0.08 * n2), bot = -0.36 * t + 0.03 * t / max(H, 0.05) * rip * smoothstep(1.0, 0.3, r);
  float base = smoothstep(bot - 0.01, bot + 0.03, c.y) * smoothstep(top + 0.01, top - 0.05, c.y) * grow * smoothstep(1.06, 0.72, edge);
  if (base <= 0.0 || lod > 0.5) return base;
  // fine fibres stretched along the wind, in thin sheared sheets: they erode the rim into wisps
  float sheet = c.y * 34.0 + n1 * 5.0 - r * 4.0;
  float f = fbm(vec3(fp.x * 1.7, sheet, fp.z * 2.6) + 11.0, 4);
  float rib = 0.5 + 0.5 * smoothstep(0.25, 0.75, vnoise(vec3(fp.x * 0.42, c.y * 21.0 + n1 * 3.0 - r * 2.5, fp.z * 0.5)));
  float er = (1.0 - base) * 0.95 + 0.24;
  return clamp((base - f * er) / (1.0 - f * er * 0.6), 0.0, 1.0) * rib;
}
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
`;
