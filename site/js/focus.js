// Focus on one lens: the camera circles the lens the physics built, the rest of the map steps back,
// and five short stages show the air arriving, rising on the wave, condensing, the plates that remain,
// and the air passing through a cloud that stays. Everything shown is the live model, not a film.
import * as THREE from 'three';

export const PHASES = [
  { id: 'arrive', title: 'האוויר מגיע',
    line: 'החתך עומד לאורך הרוח, דרך העדשה. כל קו הוא שכבת אוויר, והפס בקצה מראה לחות: כחול לח, צהוב יבש. אוויר לח מהים מגיע משמאל, השכבות עוד ישרות.',
    layers: { flow: true, curtain: true }, viz: { amp: 0, gain: 2.5 }, curtain: { show: 1, amp: 0 }, grow: [0, 0], ms: 7000 },
  { id: 'rise', title: 'עולה על הגל ומתקרר',
    line: 'ההר מרים את האוויר, והשכבה היציבה בגובה 2 ק"מ (אינוורסיה) פועלת כקפיץ: הקווים מתעקמים לגל עומד. בעלייה האוויר מתפשט ומתקרר בכ-1°C לכל 100 מטר.',
    layers: { curtain: true }, viz: { amp: 1, gain: 2.5, journey: 1 }, curtain: { show: 1, amp: 1 }, grow: [0, 0], ms: 10000 },
  { id: 'condense', title: 'נאסף ומתעבה',
    line: 'בפסגת הגל השכבות הלחות מגיעות לנקודת הטל ומלבינות. הטיפות הראשונות מופיעות במרכז הפסגה ומתפשטות החוצה.',
    layers: { curtain: true }, viz: { amp: 1, gain: 2.5 }, curtain: { show: 1, amp: 1, restart: true }, grow: [0, 0.6], ms: 11000 },
  { id: 'plates', title: 'השכבות נותרות',
    line: 'כל שכבה לחה מתעבה לחוד, והשכבה היבשה ביניהן נשארת שקופה. כך נבנית העדשה: לוח על לוח, בדיוק בגבהים שבהם היה לח.',
    layers: { curtain: true }, viz: { amp: 1, gain: 2.5 }, curtain: { show: 0.55, amp: 1 }, grow: [0.6, 1], ms: 9000 },
  { id: 'stand', title: 'ענן עומד, אוויר חולף',
    line: 'עקבו אחרי חבילת האוויר: היא מלבינה כשהיא עולה לפסגת הגל ונעלמת כשהיא יורדת. החומר מתחלף כל כמה דקות, הצורה נשארת.',
    layers: { curtain: true }, viz: { journey: 1, amp: 1, gain: 2.5 }, curtain: { show: 0.3, amp: 1 }, grow: [1, 1], ms: 12000 },
];

export function createFocus({ S, clouds, viz, curtain, state, windAngle, slice, unslice, tune, apply, getAnchors, onEnter, onExit, say }) {
  const $ = (id) => document.getElementById(id);
  const bar = $('focusBar'), spot = $('spot'), dots = $('fbDots');
  // one timeline: each stage has a start, and every quantity is a smooth function of the clock
  const starts = []; let total = 0; for (const p of PHASES) { starts.push(total); total += p.ms; }
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const ramp = (ms, a, b) => ease((ms - a) / (b - a));
  let on = false, i = -1, clock = 0, last = 0, playing = true, saved = null, center = new THREE.Vector3(), flagsKey = '';
  let userCam = false, prevDims = null;
  const camP = new THREE.Vector3(), camT = new THREE.Vector3();
  // a camera path in the lens frame: [along the wind, across, height] in km, one key per stage + an end
  const KEYS = [
    { p: [-17, 9, -0.7], t: [-5, 0, -0.3] },   // upwind: the air arriving, the mountain ahead
    { p: [-4, 13, -0.35], t: [-1, 0, -0.1] },  // side-on: the wave rises
    { p: [-1.5, 8, -0.35], t: [0, 0, 0] },     // closing in on the crest as it condenses
    { p: [4, 6.5, -0.55], t: [0, 0, 0] },      // three-quarter view under the plates
    { p: [6.5, 4.5, -0.45], t: [0.5, 0, 0.05] },    // round the downwind end
    { p: [3, -7, -0.4], t: [0.5, 0, 0.05] },      // and to the far side, air still passing
  ];
  function framePoint(k, out) {
    const a = windAngle(), wx = Math.cos(a), wn = Math.sin(a), sx = Math.sin(a), sn = -Math.cos(a);
    return out.set(center.x + wx * k[0] + sx * k[1], center.y + k[2] * state.exag, center.z - (wn * k[0] + sn * k[1]));
  }
  const A0 = new THREE.Vector3(), A1 = new THREE.Vector3(), B0 = new THREE.Vector3(), B1 = new THREE.Vector3();
  function driveCamera() {
    if (userCam) return;
    let k = 0; for (let n = 0; n < starts.length; n++) if (clock >= starts[n]) k = n;
    const f = ease(Math.min(1, (clock - starts[k]) / PHASES[k].ms));
    framePoint(KEYS[k].p, A0); framePoint(KEYS[k + 1].p, A1); framePoint(KEYS[k].t, B0); framePoint(KEYS[k + 1].t, B1);
    camP.lerpVectors(A0, A1, f); camT.lerpVectors(B0, B1, f);
    S.camera.position.copy(camP); S.controls.target.copy(camT);
  }
  S.controls.addEventListener('start', () => { if (on) userCam = true; });
  // conditions inside the focus: each one recomputes the atmosphere, and the lens answers
  const TUNE = { windScale: (v) => `×${v.toFixed(2)}`, stabilityScale: (v) => `×${v.toFixed(2)}`, lensBoost: (v) => `+${v.toFixed(0)}%` };
  for (const k of Object.keys(TUNE)) {
    const inp = $('fb-' + k);
    inp.addEventListener('input', () => { $('fbo-' + k).textContent = TUNE[k](+inp.value); });
    inp.addEventListener('change', () => { prevDims = getAnchors().lensDims || null; tune(k, +inp.value); });
  }
  function syncTune() { for (const k of Object.keys(TUNE)) { const v = state.params[k] ?? 0; $('fb-' + k).value = v; $('fbo-' + k).textContent = TUNE[k](+v); } }
  function dimsText() {
    const d = getAnchors().lensDims, el = $('fbDims');
    if (!d) { el.textContent = 'במצב הזה אין עדשה: האוויר לא מורם מספיק כדי להגיע לרוויה.'; return; }
    const ch = (now, was, unit, f = 1) => was == null ? '' : ` <span class="chg">(${now - was >= 0 ? '+' : ''}${((now - was) * f).toFixed(unit === 'm' ? 0 : 1)})</span>`;
    el.innerHTML = `אורך ${d.len.toFixed(1)} ק"מ${ch(d.len, prevDims?.len, 'km')} · עובי ${Math.round(d.thick * 1000)} מ'${ch(d.thick, prevDims?.thick, 'm', 1000)} · ${d.plates} ${d.plates === 1 ? 'לוח' : 'לוחות'}`;
  }
  PHASES.forEach((p, k) => { const li = document.createElement('li'); li.innerHTML = `<button type="button" aria-label="${k + 1}: ${p.title}"><b></b></button>`; li.firstChild.onclick = () => seek(k); dots.appendChild(li); });

  function lensCenter() {
    const A = getAnchors(); const a = A.lensPeak || A.lens || A.crest || A.birth;
    if (!a) return null;
    return new THREE.Vector3(a[0], a[2] * state.exag, -a[1]);
  }
  const S0 = (k) => starts[k], E0 = (k) => starts[k] + PHASES[k].ms;
  // continuous targets at time ms
  function targets(ms) {
    return {
      amp: ramp(ms, S0(1), S0(1) + 0.6 * PHASES[1].ms),                         // the wave rises out of flat layers
      show: 1 - 0.45 * ramp(ms, S0(3), E0(3)) - 0.25 * ramp(ms, S0(4), S0(4) + 4000),
      grow: 0.6 * ramp(ms, S0(2) + 1500, E0(2)) + 0.4 * ramp(ms, S0(3), E0(3) - 1500),
      journey: ramp(ms, 1500, 4000),
      flow: false,
    };
  }
  function caption(k) {
    if (k === i) return; const first = i < 0; i = k; const p = PHASES[k];
    $('fbNo').textContent = `מיקוד בעדשה · ${k + 1} מתוך ${PHASES.length}`;
    const t = $('fbTitle'), l = $('fbLine');
    t.textContent = p.title; l.textContent = p.line;
    for (const el of [t, l]) { el.classList.remove('fade-in'); void el.offsetWidth; el.classList.add('fade-in'); }
    $('fbPrev').disabled = k === 0;
    if (k === 2 && !first) curtain.target({ restart: true });   // the condensation sweep starts with its stage
    say?.(`${p.title}. ${p.line}`);
  }
  function seek(k) {
    userCam = false;
    k = Math.max(0, Math.min(PHASES.length - 1, k)); clock = starts[k];
    if (k === 2) curtain.target({ restart: true });
    i = -2; tick(0);
  }
  function tick(dt) {
    if (playing) clock = Math.min(total, clock + dt);
    let k = 0; for (let n = 0; n < starts.length; n++) if (clock >= starts[n]) k = n;
    caption(k);
    const T = targets(clock);
    viz.T.amp = T.amp; viz.T.gain = 1.4; viz.T.journey = T.journey; curtain.T.amp = T.amp; curtain.T.gain = 1.4; curtain.T.show = T.show;
    clouds.uniforms.uGrow.value = T.grow;
    // layer switches change only when needed (they rebuild state), the numbers above glide every frame
    const want = { clouds: T.grow > 0.002, flow: T.flow, curtain: true, moist: false, stack: false, rotors: false, wind: false, labels: false };
    const key = JSON.stringify(want);
    if (key !== flagsKey) { flagsKey = key; Object.assign(state.layers, want); apply(); viz.T.amp = T.amp; viz.T.gain = 1.4; curtain.T.show = T.show; curtain.T.amp = T.amp; curtain.T.gain = 1.4; }
    [...dots.querySelectorAll('button')].forEach((b, n) => {
      const f = Math.max(0, Math.min(1, (clock - starts[n]) / PHASES[n].ms));
      b.querySelector('b').style.width = `${f * 100}%`; b.setAttribute('aria-current', String(n === k));
    });
    if (playing && clock >= total) setPlay(false);
  }
  function setPlay(v) {
    if (v) userCam = false;
    if (v && clock >= total) { clock = 0; curtain.target({ restart: true }); }
    playing = v; $('fbPlay').setAttribute('aria-pressed', String(v)); $('fbPlay').setAttribute('aria-label', v ? 'השהיה' : 'הפעלה');
  }

  function enter() {
    const c = lensCenter(); if (!c) return false;
    saved = { layers: { ...state.layers } };
    on = true; center.copy(c); document.body.classList.add('focusing'); bar.hidden = false;
    onEnter?.();
    // side-on to the wind, like the formation curtain, but close: the lens and its slice fill the view
    userCam = false; slice([center.x, -center.z], 20); syncTune(); prevDims = null; dimsText();
    framePoint(KEYS[0].p, A0); framePoint(KEYS[0].t, B0); S.goToPose(A0.toArray(), B0.toArray(), 1800);
    setTimeout(() => { if (on) { clock = 0; } }, 1800);
    clouds.uniforms.uFocus.value.set(center.x, center.y / state.exag, center.z, 7);
    clouds.uniforms.uGrowRef.value = getAnchors().lensQ || 0;
    clock = 0; i = -1; flagsKey = ''; last = 0; setPlay(true); tick(0);
    $('fbNext').focus();
    return true;
  }
  function exit() {
    if (!on) return;
    on = false; document.body.classList.remove('focusing'); bar.hidden = true;
    clouds.uniforms.uFocus.value.set(0, 0, 0, 0); clouds.uniforms.uGrow.value = 1; clouds.uniforms.uGrowRef.value = 0;
    if (saved) Object.assign(state.layers, saved.layers);
    unslice(); onExit?.();
  }
  // per frame. Returns true while something animates.
  function update(now, camera) {
    if (!on) return false;
    const dt = last ? Math.min(200, now - last) : 0; last = now;
    tick(dt);
    if (!S.flying) driveCamera();
    const d = camera.position.distanceTo(center);
    spot.style.setProperty('--sr', `${Math.max(16, Math.min(40, 330 / d))}vmin`);
    return playing;
  }
  $('fbExit').onclick = () => exit();
  $('fbPrev').onclick = () => seek(i - 1);
  $('fbNext').onclick = () => { if (i === PHASES.length - 1) exit(); else seek(i + 1); };
  $('fbPlay').onclick = () => setPlay(!playing);
  addEventListener('keydown', (e) => {
    if (!on || e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'Escape') { e.stopPropagation(); exit(); }
    else if (e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); seek(i + 1); }
    else if (e.key === 'ArrowRight') { e.stopPropagation(); e.preventDefault(); seek(i - 1); }
    else if (e.key === ' ') { e.preventDefault(); setPlay(!playing); }
  }, true);
  // after a recompute: follow the lens to where the new atmosphere put it, and say what changed
  function refresh() {
    if (!on) return;
    const A = getAnchors(), a = A.lensPeak || A.lens || A.crest;
    clouds.uniforms.uGrowRef.value = A.lensQ || 0;
    if (a) { center.set(a[0], a[2] * state.exag, -a[1]); slice([center.x, -center.z], 20); clouds.uniforms.uFocus.value.set(center.x, a[2], center.z, 7); }
    dimsText(); flagsKey = ''; S.invalidate();
  }
  return { enter, exit, update, refresh, get isOn() { return on; }, get clock() { return clock; }, get stage() { return i; } };
}
