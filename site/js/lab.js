// The lab: what makes the lens bigger, smaller or gone. Core knobs first, research tools folded.
const $ = (id) => document.getElementById(id);

const FMT = {
  x: (v) => `×${(+v).toFixed(2)}`, pct: (v) => `+${Math.round(v * 100)}%`, pct1: (v) => `${Math.round(v * 100)}%`,
  plus: (v) => `${v > 0 ? '+' : ''}${v}%`, km: (v) => `${Math.round(v / 1000)} km`, xi: (v) => `×${v}`,
  m: (v) => `${v > 0 ? '+' : ''}${(v / 1000).toFixed(1)} km`, deg: (v) => `${(+v).toFixed(1)}°`,
};

// eff = one line under the slider: what you will see on the map
export const CONTROLS = {
  ctlCore: [
    { p: 'windScale', label: 'עוצמת הרוח', min: 0.3, max: 2.2, step: 0.05, fmt: 'x',
      eff: 'חלשה: האוויר עוקף את ההר והעדשה קטנה. חזקה: הגל מתארך.',
      explain: '<b>מה זה:</b> מכפיל את הרוח בכל הגבהים. <b>למה זה חשוב:</b> רוח חלשה לא מצליחה לטפס על החרמון ועוקפת אותו, ולכן הגל חלש. רוח חזקה מטפסת, והגל מתארך (אורך הגל ≈ 2πU/N). <b>מה לראות:</b> בחצי עוצמה העדשה מתכווצת ונעלמת; בעוצמה כפולה היא זזה במורד הרוח.' },
    { p: 'stabilityScale', label: 'יציבות האוויר', min: 0.2, max: 3, step: 0.05, fmt: 'x',
      eff: 'רכה: גלים ארוכים ושטוחים. קשיחה: גלים קצרים ותלולים.',
      explain: '<b>מה זה:</b> כמה חזק אוויר שהורם נמשך חזרה לגובהו (N²). <b>למה זה חשוב:</b> בלי יציבות אין גל, ולכן אין עדשה. <b>מה לראות:</b> ביציבות חלשה העננות נמרחת לשכבה רחבה; ביציבות חזקה הגל תלול, אבל יותר אוויר נחסם ועוקף את ההר.' },
    { p: 'lensBoost', label: 'לחות השכבה ב-3.8 ק"מ', min: 0, max: 30, step: 1, fmt: 'plus',
      eff: 'עוד לחות: צריך פחות הרמה כדי להתעבות, והעדשה גדלה.',
      explain: '<b>מה זה:</b> תוספת לחות לשכבה הלחה התחתונה (נמדד: 82%). <b>למה זה חשוב:</b> ענן נוצר רק אם הגל מרים את השכבה יותר ממה שהיא צריכה כדי להגיע לרוויה. ב-82% צריך כ-400 מ\'; ב-92% כ-150 מ\'. <b>מה לראות:</b> העדשה מתרחבת, ובלי התוספת היא כמעט נעלמת.' },
    { p: 'layer2Boost', label: 'לחות השכבה ב-4.3 ק"מ', min: 0, max: 35, step: 1, fmt: 'plus',
      eff: 'כששתי השכבות נדלקות: שתי עדשות זו מעל זו.',
      explain: '<b>מה זה:</b> תוספת לחות לשכבה הלחה העליונה (נמדד: 64%). השכבה היבשה ביניהן לא משתנה. <b>מה לראות:</b> כששתיהן עוברות את הסף נוצרת "ערימת צלחות": שתי עדשות עם רווח שקוף ביניהן.' },
    { p: 'moistShift', label: 'גובה השכבות הלחות', min: -1500, max: 3000, step: 100, fmt: 'm',
      eff: 'גבוה יותר: ענן קר יותר; מעל כ-6 ק"מ מופיע קרח.',
      explain: '<b>מה זה:</b> מזיז את מבנה הלחות שמעל 2.6 ק"מ למעלה או למטה. <b>למה זה חשוב:</b> הגובה קובע את הטמפרטורה בענן. מתחת ל-15°C- חלק מהטיפות קופאות, וגבישי קרח מתאדים לאט, ולכן הקצה במורד הרוח נמרח לזנב סיבי.' },
  ],
  ctlView: [
    { v: 'sun', label: 'גובה השמש', min: -4, max: 10, step: 0.1, fmt: 'deg',
      eff: 'מתחת ל-0°: העמק בצל, והעננים הגבוהים עוד מוארים.',
      explain: '<b>מה זה:</b> הזווית של השמש מעל האופק. <b>למה העננים ורודים:</b> אחרי השקיעה השמש עדיין מאירה את מה שגבוה. כשהשמש 1° מתחת לאופק, כל מה שמתחת לכ-1 ק"מ כבר בצל; ב-2°, כל מה שמתחת לכ-3.9 ק"מ.' },
  ],
  ctlMore: [
    { p: 'upperBoost', label: 'זרם סילון מעל 5 ק"מ', min: 0, max: 3, step: 0.1, fmt: 'pct',
      eff: 'חזק: הגל נלכד ונוצרת רכבת עדשות במורד הרוח.',
      explain: '<b>מה זה:</b> מחזק את הרוח רק ברום. <b>למה זה חשוב:</b> כשהרוח למעלה חזקה הרבה יותר, פרמטר סקורר יורד ו"תקרה" מחזירה את הגל למטה. הגל חוזר שוב ושוב במורד הרוח.' },
    { p: 'rhOffset', label: 'לחות בכל הגבהים', min: -30, max: 30, step: 1, fmt: 'plus',
      eff: 'הרבה לחות: שמיכת עננים מסתירה את הגלים.',
      explain: '<b>מה זה:</b> משנה את הלחות היחסית בכל העמודה. <b>מה לראות:</b> ‎+15% ומעלה: גם ענני כובע על המדרונות, ובסוף שכבה רציפה. ‎-15%: שמיים נקיים גם כשהגל חזק.' },
  ],
  ctlModel: [
    { p: 'blockFactor', label: 'עוצמת החסימה', min: 0, max: 1, step: 0.05, fmt: 'pct1', eff: 'מכויל ל-60%.',
      explain: '<b>מה זה:</b> כמה מהאוויר הנמוך עוקף את החרמון במקום לעבור מעליו (קו הזרם המפריד של שפרד). המודל לינארי, וזו הדרך שלו להתחשב בהר גבוה. ב-0 הגלים מוגזמים מאוד.' },
    { p: 'decayLength', label: 'דעיכת גלים במורד', min: 10000, max: 80000, step: 2500, fmt: 'km', eff: '',
      explain: 'אחרי כמה קילומטרים רכבת גלים דועכת. ערך קטן: ענן אחד מעל ההר. ערך גדול: רכבת ארוכה.' },
    { v: 'exag', label: 'הגבהה אנכית בתצוגה', min: 1, max: 4, step: 0.25, fmt: 'x', eff: '',
      explain: 'משפיע רק על התצוגה. ב-×1 הפרופורציות אמיתיות.' },
    { v: 'speed', label: 'האצת זמן', min: 5, max: 150, step: 5, fmt: 'xi', eff: '',
      explain: 'כמה מהר נעות חבילות האוויר ביחס למציאות.' },
  ],
};

const DIRS = ['צפון', 'צפון-מזרח', 'מזרח', 'דרום-מזרח', 'דרום', 'דרום-מערב', 'מערב', 'צפון-מערב'];
const dirName = (d) => DIRS[Math.round(((d % 360) + 360) % 360 / 45) % 8];

export function initLab({ state, PRESETS, DEFAULTS, onParams, onVisual }) {
  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(onParams, 160); };
  const inputs = {};
  for (const [box, list] of Object.entries(CONTROLS)) {
    const host = $(box);
    for (const c of list) {
      const key = c.p || c.v, id = `c-${key}`;
      const row = document.createElement('div'); row.className = 'ctl';
      row.innerHTML = `<label for="${id}">${c.label}</label><output id="o-${id}"></output>
        <button class="info" type="button" aria-expanded="false" aria-controls="x-${id}" aria-label="הסבר: ${c.label}">?</button>
        <input type="range" id="${id}" min="${c.min}" max="${c.max}" step="${c.step}">
        ${c.eff ? `<span class="eff">${c.eff}</span>` : ''}
        <p class="explain" id="x-${id}" hidden>${c.explain}</p>`;
      host.appendChild(row);
      const inp = row.querySelector('input'), info = row.querySelector('.info'), ex = row.querySelector('.explain');
      info.addEventListener('click', () => { const open = ex.hidden; ex.hidden = !open; info.setAttribute('aria-expanded', String(open)); });
      inp.addEventListener('input', () => {
        const val = +inp.value;
        if (c.p) { state.params[c.p] = val; state.preset = null; syncScn(); later(); } else { state[c.v] = val; onVisual(); }
        paint(inp, c);
      });
      inputs[key] = { inp, c };
    }
  }
  function paint(inp, c) { $(`o-${inp.id}`).textContent = FMT[c.fmt](inp.value); inp.style.setProperty('--p', `${((inp.value - c.min) / (c.max - c.min)) * 100}%`); }

  const host = $('scenarios');
  for (const p of PRESETS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'scn'; b.setAttribute('role', 'radio'); b.dataset.id = p.id;
    b.innerHTML = `<b>${p.name}</b><span>${p.short}</span>`;
    b.addEventListener('click', () => api.setPreset(p.id, true));
    host.appendChild(b);
  }
  const syncScn = () => { for (const b of host.children) b.setAttribute('aria-checked', String(b.dataset.id === state.preset)); };

  // ---------- compass (direction the wind blows FROM)
  const svg = $('compass'), ns = 'http://www.w3.org/2000/svg';
  const el = (t, a) => { const e = document.createElementNS(ns, t); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
  el('circle', { r: 60, class: 'ring' });
  for (let a = 0; a < 360; a += 30) { const r = a * Math.PI / 180; el('line', { x1: 52 * Math.sin(r), y1: -52 * Math.cos(r), x2: 58 * Math.sin(r), y2: -58 * Math.cos(r), class: 'tick' }); }
  [['צ', 0], ['מז', 90], ['ד', 180], ['מע', 270]].forEach(([t, a]) => { const r = a * Math.PI / 180; const tx = el('text', { x: 43 * Math.sin(r), y: -43 * Math.cos(r) + 4, 'text-anchor': 'middle' }); tx.textContent = t; });
  const rr = 25 * Math.PI / 180; el('line', { x1: -34 * Math.sin(rr), y1: 34 * Math.cos(rr), x2: 34 * Math.sin(rr), y2: -34 * Math.cos(rr), class: 'ridge' });
  const arrow = el('path', { class: 'arrow' }), head = el('path', { class: 'head' });
  function drawDir(d) {
    const r = d * Math.PI / 180, sx = 56 * Math.sin(r), sy = -56 * Math.cos(r), ex = -18 * Math.sin(r), ey = 18 * Math.cos(r);
    arrow.setAttribute('d', `M${sx},${sy} L${ex},${ey}`);
    const px = Math.cos(r) * 7, py = Math.sin(r) * 7, tx = -30 * Math.sin(r), ty = 30 * Math.cos(r);
    head.setAttribute('d', `M${ex + px},${ey + py} L${tx},${ty} L${ex - px},${ey - py} Z`);
    svg.setAttribute('aria-valuenow', Math.round(d)); svg.setAttribute('aria-valuetext', `${dirName(d)}, ${Math.round(d)} מעלות`);
    $('dirTxt').textContent = `${Math.round(d)}°`;
    const across = Math.abs(Math.cos((d - 295) * Math.PI / 180));
    $('dirWords').textContent = `${dirName(d)} · ${across > 0.85 ? 'ניצבת לחרמון: גל חזק' : across > 0.5 ? 'אלכסונית לחרמון' : 'כמעט לאורך הרכס: גל חלש'}`;
  }
  const setDir = (d) => { state.params.uniformDir = Math.round(((d % 360) + 360) % 360 / 5) * 5; state.preset = null; syncScn(); drawDir(state.params.uniformDir); later(); };
  let drag = false;
  const fromEvent = (e) => { const b = svg.getBoundingClientRect(); return Math.atan2(e.clientX - b.left - b.width / 2, -(e.clientY - b.top - b.height / 2)) * 180 / Math.PI; };
  svg.addEventListener('pointerdown', (e) => { drag = true; svg.setPointerCapture(e.pointerId); setDir(fromEvent(e)); });
  svg.addEventListener('pointermove', (e) => { if (drag) setDir(fromEvent(e)); });
  svg.addEventListener('pointerup', () => { drag = false; });
  svg.addEventListener('keydown', (e) => {
    const cur = state.params.uniformDir ?? api.measuredDir;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setDir(cur + 5); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setDir(cur - 5); e.preventDefault(); }
  });
  $('dirReset').addEventListener('click', () => { state.params.uniformDir = null; later(); });
  $('reset').addEventListener('click', () => api.setPreset('sunset', true));

  // ---------- verdict + size meter + readouts
  let refSize = null;
  const sizeOf = (d) => d.lensCells;
  function verdict(d) {
    const tot = d.lensCells + d.lowCells, cold = d.lensTopT != null && d.lensTopT < -15;
    const hgt = d.lensBase ? `⁦${(d.lensBase / 1000).toFixed(1)}–${(d.lensTop / 1000).toFixed(1)}⁩ ק"מ` : '';
    if (tot > 40000) return ['שמיכת עננים', 'האוויר כמעט רווי בכל הגבהים. הגלים קיימים, אבל מוסתרים בתוך שכבת עננים רציפה.'];
    if (d.lensCells > 1500 && d.trapped) return ['רכבת עדשות', `הגל לכוד וחוזר במורד הרוח כל כ-${(d.lambda / 1000).toFixed(1)} ק"מ, וכל פסגת גל יוצרת ענן (${hgt}).`];
    if (d.lensCells > 20) return [cold ? 'עדשה עם זנב קרח' : 'עדשה מעל ההר',
      `בגובה ${hgt}. ${cold ? `בראש הענן ${d.lensTopT.toFixed(0)}°C: חלק מהטיפות קופאות, וגבישי הקרח מתאדים לאט, ולכן הקצה במורד הרוח נמרח לזנב סיבי.` : 'טיפות מים נוזליות מתאדות מיד בירידה, ולכן השוליים חדים.'} כל חבילת אוויר חוצה את הענן בכ-${Math.max(1, Math.round(d.residence / 60))} דקות.`];
    if (d.lowCells > 20) return ['ענן כובע בלבד', 'האוויר הנמוך מתעבה על המדרונות, אבל הגל ברום לא מרים מספיק את השכבות הלחות.'];
    return ['אין עדשה', 'הגל קיים, אבל אף שכבה לא הורמה עד נקודת הרוויה שלה. נסו להוסיף לחות, לחזק את הרוח, או לסובב אותה כך שתהיה ניצבת לחרמון.'];
  }
  function readouts(d, prm) {
    const fr = (v) => v < 0.5 ? ['bad', 'עוקף את ההר'] : v < 1 ? ['warn', 'עובר בחלקו'] : ['ok', 'עובר מעל'];
    const items = [
      ['מספר פרוד · חרמון', d.frHermon.toFixed(2), ...fr(d.frHermon), false, 'froude'],
      ['מספר פרוד · רכס רמים', d.frNaftali.toFixed(2), ...fr(d.frNaftali), false, 'froude'],
      ['אורך גל', `${(d.lambda / 1000).toFixed(1)} km`, null, null, false, 'wave'],
      ['משטר הגל', d.trapped ? 'לכוד' : 'מתפשט מעלה', d.trapped ? 'warn' : 'ok', d.trapped ? 'רכבת במורד' : 'אנרגיה עולה', true, 'scorer'],
      ['רוח ב-4 ק"מ', `${Math.round(d.dirFrom)}° · ${d.speedLens.toFixed(0)} m/s`, null, null, false, 'wave'],
      ['קו הזרם המפריד', `${Math.round(d.zdHermon * prm.blockFactor)} m`, null, null, false, 'froude'],
      ['מפלס הקיפאון', d.freeze ? `${Math.round(d.freeze)} m` : '—', null, null, false, 'ice'],
      ['טמפ׳ בראש העדשה', d.lensTopT != null && d.lensCells > 20 ? `${d.lensTopT.toFixed(1)}°C` : '—', null, null, false, 'ice'],
    ];
    $('readouts').innerHTML = items.map(([k, v, c, t, he, topic]) => `<button type="button" class="ro" data-topic="${topic}" aria-label="${k}: ${v}. ללמוד עוד"><span>${k}</span><b${he ? ' class="he"' : ''}>${v}</b>${t ? `<i class="${c}">${t}</i>` : ''}</button>`).join('');
    const [title, text] = verdict(d);
    const ratio = refSize ? sizeOf(d) / refSize : 1;
    const rel = !refSize || ratio < 0.05 ? '' : ratio > 0.9 && ratio < 1.1 ? ' · בגודל של האירוע' : ` · ${ratio > 1 ? `פי ${ratio.toFixed(1)} מהאירוע` : `${Math.round(ratio * 100)}% מהאירוע`}`;
    $('verdict').innerHTML = `<small>מה נוצר עכשיו${rel}</small><strong>${title}</strong><p>${text}</p>`;
    $('meterFill').style.width = `${Math.min(100, (ratio / 3) * 100)}%`;
  }

  const api = {
    measuredDir: 282,
    setReference(d) { refSize = sizeOf(d) || 1; },
    setPreset(id, run) {
      const p = PRESETS.find(x => x.id === id) || PRESETS[0];
      state.preset = p.id; state.params = { ...DEFAULTS, ...p.params };
      $('scnNote').textContent = p.desc; $('src').innerHTML = 'מקור: <b>רדיוסונדה בית דגן</b>, 19.11.2026 (רוחות 12Z, לחות 23:05 UTC)';
      api.sync(); if (run) onParams();
    },
    clearPreset() { state.preset = null; $('scnNote').textContent = ''; api.sync(); },
    sync() {
      for (const { inp, c } of Object.values(inputs)) { inp.value = c.p ? state.params[c.p] : state[c.v]; paint(inp, c); }
      syncScn(); drawDir(state.params.uniformDir ?? api.measuredDir);
    },
    onResult(r, prm) { api.measuredDir = prm.uniformDir ?? r.diag.dirFrom; drawDir(api.measuredDir); readouts(r.diag, prm); },
  };
  return api;
}

// ---------- "how to use" tour of the lab
const STEPS = [
  ['#verdict', 'מה נוצר', 'אחרי כל שינוי כאן כתוב איזה ענן נוצר ולמה. הפס מתחת מראה את גודל העדשה ביחס לאירוע האמיתי.'],
  ['#compass', 'כיוון הרוח', 'גוררים את החץ, או משתמשים בחצים במקלדת. הקו המקווקו הוא ציר רכס החרמון: רוח ניצבת אליו יוצרת את הגל החזק ביותר.'],
  ['#ctlCore', 'מה יוצר את העדשה', 'חמישה מחוונים, וכל אחד משנה תנאי אחד. מתחת לכל מחוון כתוב מה צפוי לקרות, וה-? מסביר למה.'],
  ['#scenarios', 'ניסויים מוכנים', 'שאלות "מה היה קורה אילו": רוח מזרחית, רוח חלשה, זרם סילון, אוויר רווי.'],
  ['#maptools', 'המפה', 'זום, חזרה לנקודת המבט ותפריט שכבות. "שכבה לחה" מראה את השכבה שממנה נוצרת העדשה. הקשה על ענן או על נקודה במפה מסבירה מה קורה שם.'],
  ['#research', 'מחקר נוסף', 'אטמוספרה אמיתית לכל יום מ-2022, תחזית עדשות לשבוע, ומכשירים: חתך לאורך הרוח ופרופיל האוויר.'],
];
export function startTour() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ring = document.createElement('div'); ring.className = 'coach-ring';
  const box = document.createElement('div'); box.className = 'coach'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'coachT');
  document.body.append(ring, box);
  const body = document.querySelector('.lab-body');
  let i = 0;
  const close = () => { ring.remove(); box.remove(); removeEventListener('resize', place); body.removeEventListener('scroll', place); document.removeEventListener('keydown', key); $('tourBtn').focus(); };
  function place() {
    const t = document.querySelector(STEPS[i][0]); if (!t) return;
    const r = t.getBoundingClientRect(), pad = 6;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    if (innerWidth < 900) { Object.assign(box.style, { top: 'calc(env(safe-area-inset-top, 0px) + 12px)', bottom: 'auto', left: '12px' }); return; }
    Object.assign(box.style, { top: `${Math.max(70, Math.min(innerHeight - box.offsetHeight - 12, r.top))}px`, left: `${Math.max(12, r.left - box.offsetWidth - 18)}px`, bottom: 'auto' });
  }
  function show() {
    const [sel, title, text] = STEPS[i], t = document.querySelector(sel);
    if (sel === '#research' && t) t.open = true;
    box.innerHTML = `<small>${i + 1} / ${STEPS.length}</small><h4 id="coachT">${title}</h4><p>${text}</p>
      <div class="row"><button class="btn" type="button" data-a="close">סיום</button>
      <span><button class="btn" type="button" data-a="prev" ${i ? '' : 'disabled'}>הקודם</button>
      <button class="btn primary" type="button" data-a="next">${i === STEPS.length - 1 ? 'סיום' : 'הבא'}</button></span></div>`;
    box.querySelector('[data-a=next]').onclick = () => { if (i === STEPS.length - 1) close(); else { i++; show(); } };
    box.querySelector('[data-a=prev]').onclick = () => { if (i) { i--; show(); } };
    box.querySelector('[data-a=close]').onclick = close;
    t?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    place(); setTimeout(place, reduce ? 0 : 450);
    box.querySelector('[data-a=next]').focus();
  }
  const key = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('resize', place); body.addEventListener('scroll', place); document.addEventListener('keydown', key);
  show();
}
