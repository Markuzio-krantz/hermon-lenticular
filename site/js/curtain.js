// The formation curtain: a vertical cut along the wind through the Hermon, standing on the map.
// Every line is one layer of air (its upstream height). Moist layers are thick and blue, dry ones
// thin and amber. Where the wave lifts a layer past its saturation lift the line turns white:
// the lens is built layer by layer. `reveal` sweeps the air in from upstream.
import * as THREE from 'three';

const L = 52, ZT = 7.5, W = 2048, H = 640;

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG = `uniform sampler2D map; uniform float reveal, opacity; varying vec2 vUv;
void main(){
  vec4 c = texture2D(map, vUv);
  float m = smoothstep(reveal + 0.004, reveal - 0.025, vUv.x);
  float front = exp(-abs(vUv.x - reveal) * 160.0) * step(vUv.x, reveal + 0.01) * step(0.001, reveal) * step(reveal, 0.999);
  gl_FragColor = vec4(c.rgb + vec3(0.9, 0.95, 1.0) * front * 0.5, (c.a * m + front * 0.25) * opacity);
}`;

export function createCurtain(scene, groundAt) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { map: { value: tex }, reveal: { value: 1 }, opacity: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L, ZT), mat); mesh.renderOrder = 3; mesh.visible = false; scene.add(mesh);
  let F = null, exag = 2, center = [10, 18.5], ang = 0;
  const S = { show: 0, amp: 0, gain: 2.5, reveal: 1 }, T = { ...S };
  let drawnKey = '';

  function etaAt(o, x, n) {
    const N = F.inner, c = (x + 32) / 64 * N - 0.5, r = (32 - n) / 64 * N - 0.5;
    if (c < 0 || r < 0 || c > N - 1.001 || r > N - 1.001) return 0;
    const c0 = c | 0, r0 = r | 0, fx = c - c0, fy = r - r0, b = o * N * N + r0 * N + c0, e = F.eta;
    return e[b] * (1 - fx) * (1 - fy) + e[b + 1] * fx * (1 - fy) + e[b + N] * (1 - fx) * fy + e[b + N + 1] * fx * fy;
  }
  const X = (s) => (s + L / 2) / L * W, Y = (z) => H - z / ZT * H;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(12,14,24,0.0)'); g.addColorStop(0.35, 'rgba(12,14,24,0.28)'); g.addColorStop(1, 'rgba(12,14,24,0.38)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // altitude ticks
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '22px "IBM Plex Mono", monospace';
    ctx.direction = 'ltr'; ctx.textAlign = 'left';
    for (let z = 1; z < ZT; z++) { ctx.beginPath(); ctx.moveTo(0, Y(z)); ctx.lineTo(W, Y(z)); ctx.stroke(); ctx.fillText(`${z} km`, W - 90, Y(z) - 6); }
    const prof = F.prof, cos = Math.cos(ang), sin = Math.sin(ang), step = 0.13;
    // humidity bands from the upstream sounding: why each line has its colour
    const bands = []; let cur = null;
    for (let z = 1500; z <= 6500; z += 50) {
      const rh = prof.RH[Math.round(z / prof.dz)], kind = rh >= 60 ? 'wet' : rh <= 52 ? 'dry' : null;
      if (kind && cur && cur.kind === kind) { cur.z1 = z; cur.ext = kind === 'wet' ? Math.max(cur.ext, rh) : Math.min(cur.ext, rh); }
      else { if (cur) bands.push(cur); cur = kind ? { kind, z0: z, z1: z, ext: rh } : null; }
    }
    if (cur) bands.push(cur);
    for (const b of bands) {
      if (b.z1 - b.z0 < 120) continue;
      ctx.fillStyle = b.kind === 'wet' ? 'rgba(70,150,255,0.16)' : 'rgba(224,176,98,0.10)';
      ctx.fillRect(0, Y((b.z1 + 50) / 1000), W, Y(b.z0 / 1000) - Y((b.z1 + 50) / 1000));
    }
    // humidity strip at the upstream edge (left): bar length = relative humidity
    const SX = 150;
    ctx.fillStyle = 'rgba(8,10,18,0.55)'; ctx.fillRect(0, 0, SX + 20, H);
    for (let z = 500; z <= 7400; z += 100) {
      const rh = prof.RH[Math.round(z / prof.dz)], len = rh / 100 * SX;
      ctx.fillStyle = rh >= 60 ? 'rgba(90,170,255,0.95)' : rh <= 52 ? 'rgba(224,176,98,0.75)' : 'rgba(200,200,210,0.5)';
      ctx.fillRect(10, Y((z + 50) / 1000) + 1, len, Math.max(2, Y(z / 1000) - Y((z + 50) / 1000) - 2));
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '600 24px "IBM Plex Sans Hebrew", sans-serif'; ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillText('לחות', SX + 10, 34);
    const lines = [];
    for (let z0 = 600; z0 <= 7000; z0 += 100) {
      const o = Math.round((z0 - F.outZ[0]) / 100), k = Math.round(z0 / prof.dz), rh = prof.RH[k];
      const moist = Math.min(1, Math.max(0, (rh - 55) / 30)), need = F.satLift[o];
      if (moist < 0.05 && z0 % 200) continue;            // dry air: every other layer is enough
      const pts = [];
      for (let s = -L / 2; s <= L / 2 + 1e-6; s += step) {
        const x = center[0] + cos * s, n = center[1] + sin * s, e = etaAt(o, x, n) * S.amp;
        const z = z0 + e * S.gain, gnd = groundAt(x, n);
        pts.push({ s, z, under: z < gnd + 40, wet: e > need, r: need > 0 && isFinite(need) ? e / need : 0 });
      }
      lines.push({ pts, moist, rh });
    }
    // 1) every layer
    // moist layers brighten as the wave brings them toward saturation (r = lift / lift needed)
    const BINS = [[-9, 0, 'rgba(70,120,210,0.75)'], [0, 0.4, 'rgba(80,165,255,0.92)'], [0.4, 0.7, 'rgba(130,200,255,0.95)'], [0.7, 1, 'rgba(195,232,255,0.98)']];
    for (const ln of lines) {
      const m = ln.moist;
      if (m <= 0.05) { ctx.strokeStyle = 'rgba(224,176,98,0.38)'; ctx.lineWidth = 1.3; path(ln.pts, () => true); ctx.stroke(); continue; }
      ctx.lineWidth = 1.6 + 4.5 * m;
      for (const [lo, hi, col] of BINS) { ctx.strokeStyle = col; path(ln.pts, (p) => p.r >= lo && p.r < hi, true); ctx.stroke(); }
    }
    // 2) condensed parts, glowing white, drawn on top
    ctx.save(); ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 14;
    for (const ln of lines) {
      ctx.strokeStyle = 'rgba(255,255,255,0.97)'; ctx.lineWidth = 7 + 5 * ln.moist;
      path(ln.pts, (p) => p.wet); ctx.stroke();
    }
    ctx.restore();
    // band labels, written next to the strip so each label sits on its layer
    ctx.direction = 'rtl'; ctx.textAlign = 'left';
    for (const b of bands) {
      if (b.z1 - b.z0 < 120) continue;
      const zm = (b.z0 + b.z1 + 50) / 2000, txt = b.kind === 'wet' ? `שכבה לחה · ${Math.round(b.ext)}%` : `שכבה יבשה · ${Math.round(b.ext)}%`;
      ctx.font = '600 30px "IBM Plex Sans Hebrew", sans-serif';
      const w = ctx.measureText(txt).width + 28, x0 = SX + 34;
      ctx.fillStyle = b.kind === 'wet' ? 'rgba(70,150,255,0.92)' : 'rgba(200,150,70,0.92)';
      roundRect(x0, Y(zm) - 22, w, 44, 22); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(txt, x0 + w - 14, Y(zm) + 10);
    }
    tex.needsUpdate = true;
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function path(pts, ok, join = false) {
    ctx.beginPath(); let on = false, prev = null;
    for (const p of pts) {
      if (p.under || !ok(p)) { on = false; prev = p; continue; }
      if (!on) { const q = join && prev && !prev.under ? prev : p; ctx.moveTo(X(q.s), Y(q.z / 1000)); on = true; }
      ctx.lineTo(X(p.s), Y(p.z / 1000)); prev = p;
    }
  }
  function place() {
    mesh.position.set(center[0], ZT / 2 * exag, -center[1]);
    mesh.rotation.set(0, ang, 0); mesh.scale.set(1, exag, 1);
  }
  return {
    S, T,
    set field(f) { F = f; drawnKey = ''; },
    setExag(e) { exag = e; place(); },
    setPath(c, a) { center = c; ang = a; place(); drawnKey = ''; },
    target(t) { Object.assign(T, { show: 0, amp: 0, gain: 2.5, reveal: 1 }, t); if (t.restart) S.reveal = 0; },
    update(dt) {
      if (!F) return false;
      let moving = false;
      for (const k of ['show', 'amp', 'gain']) {
        const n = S[k] + (T[k] - S[k]) * (1 - Math.exp(-(k === 'amp' ? 0.9 : 2.4) * dt));
        S[k] = Math.abs(n - T[k]) < 0.002 ? T[k] : n; if (S[k] !== T[k]) moving = true;
      }
      if (S.reveal < T.reveal) { S.reveal = Math.min(T.reveal, S.reveal + dt / 7); moving = true; } else S.reveal = T.reveal;
      mesh.visible = S.show > 0.01; mat.uniforms.opacity.value = S.show; mat.uniforms.reveal.value = S.reveal;
      if (mesh.visible) {
        const key = `${S.amp.toFixed(3)}|${S.gain.toFixed(2)}`;
        if (key !== drawnKey) { draw(); drawnKey = key; }
      }
      return moving;
    },
  };
}
