// Map labels with a cartographic hierarchy: regions > peaks > towns > water > villages.
// Collision culling in screen space by priority; small places appear as you zoom in.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const SIZE = { region: [7.2, 16], peak: [6.6, 14], town: [6.4, 14], village: [5.6, 12], water: [5.8, 12], station: [5.6, 12] };
const MAXDIST = { region: 400, peak: 140, town: 150, water: 70, village: 42, station: 55 };

export function createLabels(scene, places, groundAt) {
  const items = places.map((p) => {
    const el = document.createElement('div');
    el.className = `pl pl-${p.t}`;
    el.innerHTML = p.t === 'peak' ? `<i></i><b>${p.n}</b><small>${p.e}</small>` : p.t === 'region' ? `<b>${p.n}</b>${p.s ? `<small>${p.s}</small>` : ''}` : `<i></i><b>${p.n}</b>`;
    const obj = new CSS2DObject(el);
    const g = Math.max(0, groundAt(p.p[0], p.p[1]) / 1000);
    obj.position.set(p.p[0], 0, -p.p[1]); obj.center.set(0.5, p.t === 'region' ? 0.5 : 1);
    scene.add(obj);
    const chars = (p.n.length + (p.e ? 5 : 0)) * SIZE[p.t][0];
    return { p, el, obj, g, w: chars + 14, h: SIZE[p.t][1] + 6, vis: true };
  });
  let exag = 2, visible = true, forced = null;
  const v = new THREE.Vector3();
  function setExag(e) { exag = e; for (const it of items) it.obj.position.y = it.g * e + (it.p.t === 'region' ? 1.2 * e : 0.12); }
  setExag(2);

  /** Screen-space declutter. focus: optional Set of names to always show (story emphasis). */
  function cull(camera, W, H) {
    if (!visible) return;
    const placed = [];
    const sorted = items.slice().sort((a, b) => (forced?.has(b.p.n) ? 1000 : b.p.pri) - (forced?.has(a.p.n) ? 1000 : a.p.pri));
    for (const it of sorted) {
      const d = camera.position.distanceTo(it.obj.position);
      let ok = d < MAXDIST[it.p.t] || forced?.has(it.p.n);
      if (ok) {
        v.copy(it.obj.position).project(camera);
        ok = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
        if (ok) {
          const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
          const r = { l: x - it.w / 2, r: x + it.w / 2, t: y - it.h, b: y };
          ok = !placed.some(q => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t);
          if (ok) placed.push(r);
        }
      }
      if (ok !== it.vis) { it.vis = ok; it.el.classList.toggle('off', !ok); }
      it.el.classList.toggle('hot', !!forced?.has(it.p.n));
    }
  }
  return {
    setExag, cull,
    set visible(on) { visible = on; for (const it of items) it.obj.visible = on; },
    focus(names) { forced = names ? new Set(names) : null; },
  };
}
