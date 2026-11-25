// Focus on one lens: the camera circles the lens the physics built, the rest of the map steps back,
// and five short stages show the air arriving, rising on the wave, condensing, the plates that remain,
// and the air passing through a cloud that stays. Everything shown is the live model, not a film.
import * as THREE from 'three';

export const PHASES = [
  { id: 'arrive', title: 'האוויר מגיע',
    line: 'החתך עומד לאורך הרוח, דרך העדשה. כל קו הוא שכבת אוויר, והפס בקצה מראה לחות: כחול לח, צהוב יבש. אוויר לח מהים מגיע משמאל, השכבות עוד ישרות.',
    layers: { flow: true, curtain: true }, viz: { amp: 0, gain: 2.5 }, curtain: { show: 1, amp: 0 }, grow: [0, 0], ms: 9000 },
  { id: 'rise', title: 'עולה על הגל ומתקרר',
    line: 'ההר מרים את האוויר, והשכבה היציבה בגובה 2 ק"מ (אינוורסיה) פועלת כקפיץ: הקווים מתעקמים לגל עומד. בעלייה האוויר מתפשט ומתקרר בכ-1°C לכל 100 מטר.',
    layers: { curtain: true }, viz: { amp: 1, gain: 2.5, journey: 1 }, curtain: { show: 1, amp: 1 }, grow: [0, 0], ms: 10000 },
  { id: 'condense', title: 'נאסף ומתעבה',
    line: 'בפסגת הגל השכבות הלחות מגיעות לנקודת הטל ומלבינות. הטיפות הראשונות מופיעות במרכז הפסגה ומתפשטות החוצה.',
    layers: { curtain: true }, viz: { amp: 1, gain: 2.5 }, curtain: { show: 1, amp: 1, restart: true }, grow: [0, 0.6], ms: 11000 },
  { id: 'plates', title: 'השכבות נותרות',
    line: 'כל שכבה לחה מתעבה לחוד, והשכבה היבשה ביניהן נשארת שקופה. כך נבנית העדשה: לוח על לוח, בדיוק בגבהים שבהם היה לח.',
    layers: { curtain: true }, viz: { amp: 1, gain: 2.5 }, curtain: { show: 0.55, amp: 1 }, grow: [0.6, 1], ms: 10000 },
  { id: 'stand', title: 'ענן עומד, אוויר חולף',
    line: 'עקבו אחרי חבילת האוויר: היא מלבינה כשהיא עולה לפסגת הגל ונעלמת כשהיא יורדת. החומר מתחלף כל כמה דקות, הצורה נשארת.',
    layers: { curtain: true }, viz: { journey: 1, amp: 1, gain: 2.5 }, curtain: { show: 0.3, amp: 1 }, grow: [1, 1], ms: 12000 },
];

export function createFocus({ S, clouds, viz, curtain, state, windAngle, apply, getAnchors, onEnter, onExit, say }) {
  const $ = (id) => document.getElementById(id);
  const bar = $('focusBar'), spot = $('spot'), dots = $('fbDots');
  let on = false, i = 0, t0 = 0, playing = true, saved = null, center = new THREE.Vector3(), grow = 1;
  PHASES.forEach((p, k) => { const li = document.createElement('li'); li.innerHTML = `<button type="button" aria-label="${k + 1}: ${p.title}"><b></b></button>`; li.firstChild.onclick = () => go(k); dots.appendChild(li); });

  function lensCenter() {
    const A = getAnchors(); const a = A.lensPeak || A.lens || A.crest || A.birth;
    if (!a) return null;
    return new THREE.Vector3(a[0], a[2] * state.exag, -a[1]);
  }
  function go(k) {
    i = Math.max(0, Math.min(PHASES.length - 1, k)); t0 = performance.now();
    const p = PHASES[i];
    $('fbNo').textContent = `מיקוד בעדשה · ${i + 1} מתוך ${PHASES.length}`;
    $('fbTitle').textContent = p.title; $('fbLine').textContent = p.line;
    $('fbPrev').disabled = i === 0;
    [...dots.querySelectorAll('button')].forEach((b, n) => { b.classList.toggle('done', n < i); b.setAttribute('aria-current', String(n === i)); b.querySelector('b').style.width = '0'; });
    Object.assign(state.layers, { clouds: true, flow: false, moist: false, stack: false, curtain: false, rotors: false, wind: false, labels: false }, p.layers);
    viz.target({ ...p.viz }); curtain.target({ ...p.curtain });
    apply();
    say?.(`${p.title}. ${p.line}`);
  }
  function setPlay(v) { playing = v; $('fbPlay').setAttribute('aria-pressed', String(v)); $('fbPlay').setAttribute('aria-label', v ? 'השהיה' : 'הפעלה'); t0 = performance.now() - (grow >= 0 ? 0 : 0); }

  function enter() {
    const c = lensCenter(); if (!c) return false;
    saved = { layers: { ...state.layers } };
    on = true; center.copy(c); document.body.classList.add('focusing'); bar.hidden = false;
    onEnter?.();
    // side-on to the wind, like the formation curtain, but close: the lens and its slice fill the view
    const a = windAngle(), px = Math.sin(a), pn = -Math.cos(a), d = 13;
    S.goToPose([center.x + px * d, center.y - 0.25 * state.exag, center.z - pn * d], center.toArray(), 2200);
    clouds.uniforms.uFocus.value.set(center.x, center.y / state.exag, center.z, 7);
    go(0); setPlay(true);
    $('fbNext').focus();
    return true;
  }
  function exit() {
    if (!on) return;
    on = false; document.body.classList.remove('focusing'); bar.hidden = true;
    clouds.uniforms.uFocus.value.set(0, 0, 0, 0); clouds.uniforms.uGrow.value = 1;
    if (saved) Object.assign(state.layers, saved.layers);
    onExit?.();
  }
  // per frame: stage clock, cloud growth, spotlight position. Returns true while something animates.
  function update(now, camera) {
    if (!on) return false;
    const p = PHASES[i], k = Math.min(1, (now - t0) / p.ms);
    const g = p.grow[0] + (p.grow[1] - p.grow[0]) * (k * k * (3 - 2 * k));
    grow = g; clouds.uniforms.uGrow.value = Math.max(0.0, g); state.layers.clouds = g > 0.001;
    dots.children[i]?.querySelector('b')?.style.setProperty('width', `${(playing ? k : 1) * 100}%`);
    if (playing && k >= 1) { if (i < PHASES.length - 1) go(i + 1); else setPlay(false); }
    // the camera aims at the lens, so the spotlight sits in the middle; it tightens as you come closer
    const d = camera.position.distanceTo(center);
    spot.style.setProperty('--sr', `${Math.max(16, Math.min(40, 330 / d))}vmin`);
    return playing;
  }
  $('fbExit').onclick = () => exit();
  $('fbPrev').onclick = () => { go(i - 1); };
  $('fbNext').onclick = () => { if (i === PHASES.length - 1) exit(); else go(i + 1); };
  $('fbPlay').onclick = () => setPlay(!playing);
  addEventListener('keydown', (e) => {
    if (!on || e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'Escape') { e.stopPropagation(); exit(); }
    else if (e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowRight') { e.stopPropagation(); e.preventDefault(); go(i - 1); }
  }, true);
  return { enter, exit, update, get isOn() { return on; } };
}
