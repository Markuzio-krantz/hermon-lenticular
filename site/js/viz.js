// Story visuals. Every quantity eases toward a target, so steps flow into each other.
//  stack   : stable air drawn as stacked sheets (surfaces of equal potential temperature)
//  moist   : the moist layers; white where the wave lifts them past saturation = the lens being born
//  journey : one air parcel riding its streamline through the cloud
//  shadow  : Earth's shadow boundary after sunset
//  divide  : the dividing streamline (air below goes around the Hermon)
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { streamline, gridAt } from './cm1cut.js';
export const STACK_LEVELS = [1500, 2500, 3500, 4500, 5500, 6500];

const STACK = STACK_LEVELS;
const MOIST = [3800, 4300];
const ease = (cur, tgt, dt, rate = 2.6) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));

export function createViz(scene, groundAt) {
  let F = null, exag = 2;
  const S = { amp: 0, gain: 1, stack: 0, moist: 0, journey: 0, shadow: 0, divide: 0 };   // current
  const T = { ...S };                                                           // targets
  const group = new THREE.Group(); scene.add(group);

  function sheet(color) {
    const g = new THREE.PlaneGeometry(64, 64, 127, 127); g.rotateX(-Math.PI / 2);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    m.userData.base = color; m.renderOrder = 2; group.add(m);
    // outline along the sheet border, sharing the sheet's vertices
    const N = 128, idx = [];
    for (let i = 0; i < N; i++) idx.push(i);
    for (let j = 1; j < N; j++) idx.push(j * N + N - 1);
    for (let i = N - 2; i >= 0; i--) idx.push((N - 1) * N + i);
    for (let j = N - 2; j > 0; j--) idx.push(j * N);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', g.attributes.position); lg.setIndex(idx);
    const edge = new THREE.LineLoop(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 }));
    edge.renderOrder = 3; group.add(edge); m.userData.edge = edge;
    return m;
  }
  // potential temperature rises with height: deep blue (low) -> orange (high)
  const STACK_COL = ['#3f7df0', '#3fb0e0', '#48c79a', '#c7c34a', '#f0a043', '#f06a3c'].map(c => new THREE.Color(c));
  const stack = STACK.map((z, i) => sheet(STACK_COL[i]));
  const mask = STACK.map(() => true);
  const tags = STACK.map((z, i) => {
    const el = document.createElement('div'); el.className = 'sheet-tag';
    el.style.setProperty('--c', `#${STACK_COL[i].getHexString()}`);
    const o = new CSS2DObject(el); o.center.set(1, 0.5); scene.add(o); return { el, o };
  });
  const moist = MOIST.map(() => sheet(new THREE.Color(0x58b4ff)));
  const dry = new THREE.Color(0xd9a24a), wet = new THREE.Color(0x3d8fe8), nearSat = new THREE.Color(0xbfe6ff), cloud = new THREE.Color(0xffffff);
  const tmp = new THREE.Color();

  // journey: streamline through the Hermon summit + one parcel
  const pathGeo = new THREE.BufferGeometry(), NP = 241;
  pathGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * 3), 3));
  pathGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NP * 3), 3));
  const path = new THREE.Line(pathGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, linewidth: 2 }));
  const parcel = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  group.add(path, parcel, halo);
  let jS = -30, jAng = 0, jC = [12.8, 18.5];
  // with the CM1 cut set, the parcel rides a simulated streamline: the level whose air passes through the cut's cloud
  let C = null, jLine = null, jZ0 = 3800;
  function pickLevel() {
    let best = -1; jZ0 = 4200;
    for (let z = 3400; z <= 4800; z += 100) {
      const L = streamline(C, F.prof, z, jC[0], jC[1], Math.cos(jAng), Math.sin(jAng), -30, 30, 0.5);
      const q = L.reduce((a, p) => a + p.q, 0); if (q > best) { best = q; jZ0 = z; }
    }
  }

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(128, 128), new THREE.MeshBasicMaterial({ color: 0x1a1030, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; group.add(shadow);
  const shadowEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(128, 128)), new THREE.LineBasicMaterial({ color: 0xff9ab6, transparent: true, opacity: 0 }));
  shadow.add(shadowEdge);
  let shadowKm = -1;

  const divide = new THREE.Mesh(new THREE.CircleGeometry(15, 64), new THREE.MeshBasicMaterial({ color: 0xff5a6e, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  divide.rotation.x = -Math.PI / 2; divide.position.set(10.5, 0, -15.5); group.add(divide);
  let divideKm = 2;

  // callouts
  const callouts = new Map();
  function setCallouts(list) {
    const keep = new Set(list.map(c => c.id));
    for (const [id, c] of callouts) if (!keep.has(id)) c.target = 0;
    for (const c of list) {
      let e = callouts.get(c.id);
      if (!e) {
        const el = document.createElement('div'); el.className = 'callout'; el.innerHTML = `<span>${c.text}</span>`;
        const obj = new CSS2DObject(el); obj.center.set(0.5, 1); scene.add(obj);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
        scene.add(line);
        e = { el, obj, line, cur: 0 }; callouts.set(c.id, e);
      }
      e.el.firstChild.textContent = c.text; e.at = c.at; e.lift = c.lift ?? 2.2; e.target = 1;
    }
  }

  function etaAt(o, x, n) {
    const N = F.inner, c = (x + 32) / 64 * N - 0.5, r = (32 - n) / 64 * N - 0.5;
    if (c < 0 || r < 0 || c > N - 1.001 || r > N - 1.001) return 0;
    const c0 = c | 0, r0 = r | 0, fx = c - c0, fy = r - r0, b = o * N * N + r0 * N + c0, e = F.eta;
    return e[b] * (1 - fx) * (1 - fy) + e[b + 1] * fx * (1 - fy) + e[b + N] * (1 - fx) * fy + e[b + N + 1] * fx * fy;
  }
  const lvl = (z) => Math.round((z - F.outZ[0]) / 100);

  function shapeSheet(m, z, mode) {
    const p = m.geometry.attributes.position, col = m.geometry.attributes.color, o = lvl(z), need = F.satLift[o];
    // with a CM1 run set, the sheet is the simulated surface of constant potential temperature, coloured by its own humidity
    const D = C?.d3, li = mode === 'moist' ? MOIST.indexOf(z) : STACK.indexOf(z);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), n = -p.getZ(i);
      if (D && li >= 0) {
        const raw = gridAt(C, mode === 'moist' ? D.me : D.iso, li, x, n), e = (raw ?? 0) * S.amp;
        p.setY(i, Math.max(z + e * S.gain, groundAt(x, n) + 40) / 1000 * exag);
        if (mode === 'moist') {
          const rh = raw === null ? 50 : gridAt(C, D.mr, li, x, n) / 2;
          if (rh >= 100) tmp.copy(cloud);
          else if (e < 0) tmp.copy(wet).lerp(dry, Math.min(1, -e / 250));
          else tmp.copy(wet).lerp(nearSat, Math.max(0, Math.min(1, (rh - 60) / 40)) ** 2);
        } else tmp.copy(m.userData.base).multiplyScalar(0.8 + Math.max(-0.3, Math.min(0.45, e / 700)));
        col.setXYZ(i, tmp.r, tmp.g, tmp.b); continue;
      }
      const e = etaAt(o, x, n) * S.amp;
      const g = groundAt(x, n);
      p.setY(i, Math.max(z + e * S.gain, g + 40) / 1000 * exag);
      if (mode === 'moist') {
        const r = need > 0 ? e / need : 0;
        if (r <= 0) tmp.copy(wet).lerp(dry, Math.min(1, -r * 1.5));
        else if (r < 1) tmp.copy(wet).lerp(nearSat, r * r);
        else tmp.copy(cloud);
      } else {
        tmp.copy(m.userData.base).multiplyScalar(0.8 + Math.max(-0.3, Math.min(0.45, e / 700)));
      }
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    p.needsUpdate = true; col.needsUpdate = true; m.geometry.computeVertexNormals();
  }
  function shapeJourney() {
    const p = pathGeo.attributes.position, col = pathGeo.attributes.color, o = lvl(3800), need = F.satLift[o];
    if (C) {
      jLine = streamline(C, F.prof, jZ0, jC[0], jC[1], Math.cos(jAng), Math.sin(jAng), -30, 30, 60 / (NP - 1));
      for (let k = 0; k < NP; k++) {
        const q = jLine[k], x = jC[0] + Math.cos(jAng) * q.s, n = jC[1] + Math.sin(jAng) * q.s, up = k ? q.eta - jLine[k - 1].eta : 0;
        p.setXYZ(k, x, (jZ0 + q.eta * S.amp * S.gain) / 1000 * exag, -n);
        tmp.copy(q.q > 0.02 ? cloud : up < -0.5 ? dry : wet); col.setXYZ(k, tmp.r, tmp.g, tmp.b);
      }
      p.needsUpdate = true; col.needsUpdate = true; return;
    }
    for (let k = 0; k < NP; k++) {
      const s = -30 + 60 * k / (NP - 1), x = jC[0] + Math.cos(jAng) * s, n = jC[1] + Math.sin(jAng) * s;
      const e = etaAt(o, x, n) * S.amp;
      p.setXYZ(k, x, (3800 + e * S.gain) / 1000 * exag, -n);
      tmp.copy(e > need ? cloud : wet).lerp(dry, e < 0 ? Math.min(1, -e / 250) : 0);
      col.setXYZ(k, tmp.r, tmp.g, tmp.b);
    }
    p.needsUpdate = true; col.needsUpdate = true;
  }

  let shapedAmp = -1, shapedExag = -1;
  return {
    S, T, group,
    set field(f) { F = f; shapedAmp = -1; if (C) pickLevel(); },
    setExag(e) { exag = e; shapedExag = -1; },
    setJourney(center, ang) { jC = center; jAng = ang; shapedAmp = -1; if (C && F) pickLevel(); },
    setCM1(c) { C = c; jLine = null; shapedAmp = -1; if (C && F) pickLevel(); },
    get journeyKm() { return C ? jZ0 / 1000 : 3.8; },
    setShadowKm(km) { shadowKm = km; },
    setDivideKm(km) { divideKm = km; },
    setCallouts,
    setStackMask(m) { m.forEach((v, i) => { mask[i] = v; }); shapedAmp = -1; },
    target(t) { Object.assign(T, { amp: 0, gain: 1, stack: 0, moist: 0, journey: 0, shadow: 0, divide: 0 }, t); },
    /** returns true while anything is still moving */
    update(dt, speed = 1) {
      if (!F) return false;
      let moving = false;
      for (const k in T) { const n = ease(S[k], T[k], dt, k === 'amp' ? 1.1 : 2.6); if (Math.abs(n - T[k]) > 0.002) moving = true; S[k] = Math.abs(n - T[k]) < 0.002 ? T[k] : n; }
      const reshape = Math.abs(S.amp * S.gain - shapedAmp) > 0.004 || shapedExag !== exag;
      stack.forEach((m, i) => {
        const on = S.stack > 0.01 && mask[i];
        m.material.opacity = 0.42 * S.stack; m.visible = on; m.userData.edge.visible = on; m.userData.edge.material.opacity = 0.95 * S.stack;
        if (on && reshape) shapeSheet(m, STACK[i], 'stack');
        const t = tags[i]; t.el.style.opacity = on ? Math.min(1, S.stack * 1.4) : 0; t.el.style.display = on ? '' : 'none';
        if (on) {
          const k = Math.round(STACK[i] / F.prof.dz), T = F.prof.T[k], th = F.prof.theta[k];
          t.el.innerHTML = `<b>\u2066${(STACK[i] / 1000).toFixed(1)}\u2069 ק"מ</b><span>\u2066${T.toFixed(0)}°C\u2069 · θ \u2066${Math.round(th)}K\u2069</span>`;
          const e = etaAt(Math.round((STACK[i] - F.outZ[0]) / 100), -31, -31) * S.amp * S.gain;
          t.o.position.set(-32.5, (STACK[i] + e) / 1000 * exag, 32);
        }
      });
      moist.forEach((m, i) => { m.material.opacity = 0.78 * S.moist * (i ? 0.85 : 1); m.visible = S.moist > 0.01; if (m.visible && reshape) shapeSheet(m, MOIST[i], 'moist'); });
      path.material.opacity = 0.9 * S.journey; path.visible = parcel.visible = halo.visible = S.journey > 0.01;
      if (path.visible) {
        if (reshape) shapeJourney();
        jS += dt * 3.2 * speed; if (jS > 30) jS = -30;
        const x = jC[0] + Math.cos(jAng) * jS, n = jC[1] + Math.sin(jAng) * jS;
        let inCloud, col;
        if (C && jLine) {  // CM1: position and colour straight from the simulated streamline
          const fk = Math.max(0, Math.min(NP - 1.001, (jS + 30) / 60 * (NP - 1))), k = fk | 0, u = fk - k, a = jLine[k], b = jLine[k + 1];
          const eta = a.eta + (b.eta - a.eta) * u; inCloud = a.q + (b.q - a.q) * u > 0.02;
          parcel.position.set(x, (jZ0 + eta * S.amp * S.gain) / 1000 * exag, -n);
          col = inCloud ? 0xffffff : b.eta < a.eta - 0.5 ? 0xe0b062 : 0x6fb2ff;
        } else {
          const o = lvl(3800), e = etaAt(o, x, n) * S.amp;
          parcel.position.set(x, (3800 + e * S.gain) / 1000 * exag, -n);
          inCloud = e > F.satLift[o]; col = inCloud ? 0xffffff : e < 0 ? 0xe0b062 : 0x6fb2ff;
        }
        halo.position.copy(parcel.position); parcel.material.color.set(col);
        parcel.material.opacity = S.journey; halo.material.opacity = (inCloud ? 0.35 : 0.12) * S.journey;
        moving = true;
      }
      if (reshape) { shapedAmp = S.amp * S.gain; shapedExag = exag; }
      shadow.visible = S.shadow > 0.01; shadow.material.opacity = 0.32 * S.shadow; shadowEdge.material.opacity = 0.9 * S.shadow;
      shadow.position.y = Math.max(0.02, shadowKm) * exag;
      divide.visible = S.divide > 0.01; divide.material.opacity = 0.3 * S.divide; divide.position.y = divideKm * exag;
      for (const [id, c] of callouts) {
        c.cur = ease(c.cur, c.target, dt, 3.5); if (Math.abs(c.cur - c.target) > 0.01) moving = true;
        const [x, n, z] = c.at, base = new THREE.Vector3(x, z * exag, -n), top = base.clone(); top.y += c.lift;
        c.obj.position.copy(top); c.el.style.opacity = c.cur; c.el.style.display = c.cur < 0.02 ? 'none' : '';
        const lp = c.line.geometry.attributes.position; lp.setXYZ(0, base.x, base.y, base.z); lp.setXYZ(1, top.x, top.y, top.z); lp.needsUpdate = true;
        c.line.material.opacity = 0.7 * c.cur; c.line.visible = c.cur > 0.02;
      }
      return moving;
    },
  };
}
