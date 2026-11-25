// Opening tour: the screen empties, and each step brings back only the thing it explains.
// Shown once on the first visit, skippable at any step, always available again from the menu.
const KEY = 'lenticular.tour';

// show: the chrome block to bring back; sel: what to ring; dock/menu: open it for this step
const STEPS = [
  { title: 'ענן שעומד במקום, אוויר שזז', text: 'סיור של חצי דקה. בכל שלב יופיע רק הדבר שמדובר עליו. אפשר לדלג בכל רגע.' },
  { show: '#story', sel: '.step-nav', title: 'הסיפור: שלב אחר שלב', text: 'הסיפור בנוי מ-12 שלבים. "הבא" ו"הקודם" כאן, או החצים במקלדת. אפשר גם להחליק על המפה בלי לקרוא.' },
  { show: '#story', sel: '#storyMin', title: 'להסתיר את ההסבר', text: 'החץ הזה מקפל את חלון ההסבר לפס דק עם חצים, והמפה מקבלת את כל המסך. לחיצה נוספת פותחת אותו.' },
  { show: '#docks', sel: '#layersDock', dock: 'layersPanel', title: 'שכבות', text: 'מה מוצג על המפה: עננים, זרימת אוויר, שכבות לחות ועוד. החץ פותח וסוגר, ונגיעה במפה מקפלת הכול.' },
  { show: '#docks', sel: '#toolsDock', dock: 'toolsPanel', title: 'כלים', text: 'נקודות מבט, זום, איכות התצוגה, קישור למה שמוצג, ו"רק מפה" שמסתיר את כל הכפתורים (גם מקש H).' },
  { show: '.hud-top', sel: '#menuBtn', menu: true, title: 'התפריט', text: 'מיקוד בעדשה: עדשה אחת מקרוב, מהאוויר שמגיע ועד הענן. וגם מעבדה, ללמוד, על הפרויקט, והסיור הזה שוב.' },
];

export function initSiteTour({ button, onStart, onDock, onMenu } = {}) {
  let ring = null, box = null, i = 0, opener = null, shown = null;
  const q = (s) => s && document.querySelector(s);

  function stage(s) {
    shown?.classList.remove('tour-on'); shown = q(s.show); shown?.classList.add('tour-on');
    onDock?.(s.dock || null); onMenu?.(!!s.menu);
  }
  function close(done = true) {
    ring?.remove(); box?.remove(); ring = box = null;
    shown?.classList.remove('tour-on'); shown = null; document.body.classList.remove('touring');
    onDock?.(null); onMenu?.(false);
    removeEventListener('resize', place); document.removeEventListener('keydown', key, true);
    if (done) { try { localStorage.setItem(KEY, 'done'); } catch { /* private mode */ } }
    opener?.focus?.();
  }
  function place() {
    if (!box) return;
    const t = q(STEPS[i].sel);
    if (!t || !t.getClientRects().length) { ring.style.opacity = '0'; Object.assign(box.style, { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }); return; }
    const r = t.getBoundingClientRect(), pad = 6;
    Object.assign(ring.style, { opacity: '1', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    box.style.transform = 'none';
    // the open menu or dock hangs below its button: measure the whole thing, then sit beside it
    const extra = STEPS[i].dock ? q('#' + STEPS[i].dock) : STEPS[i].menu ? q('#menu') : null;
    const b = extra && extra.getClientRects().length ? extra.getBoundingClientRect() : r;
    const bottom = Math.max(r.bottom, b.bottom), bw = box.offsetWidth, bh = box.offsetHeight, gap = 14;
    let top = bottom + gap; if (top + bh > innerHeight - 12) top = Math.max(12, r.top - gap - bh);
    if (top < r.bottom && top + bh > r.top) top = innerHeight - bh - 12;
    const left = Math.min(innerWidth - bw - 12, Math.max(12, r.left + r.width / 2 - bw / 2));
    Object.assign(box.style, { top: `${top}px`, left: `${left}px` });
  }
  function show() {
    const s = STEPS[i], last = i === STEPS.length - 1;
    stage(s);
    box.innerHTML = `<small>${i + 1} / ${STEPS.length}</small><h4 id="tourT">${s.title}</h4><p>${s.text}</p>
      <div class="row"><button class="btn ghost" type="button" data-a="skip">${last ? 'סגירה' : 'דלגו'}</button>
      <span>${i ? '<button class="btn" type="button" data-a="prev">הקודם</button>' : ''}
      <button class="btn primary" type="button" data-a="next">${last ? 'מתחילים' : 'הבא'}</button></span></div>`;
    box.querySelector('[data-a=next]').onclick = () => { if (last) close(); else { i++; show(); } };
    box.querySelector('[data-a=prev]')?.addEventListener('click', () => { i--; show(); });
    box.querySelector('[data-a=skip]').onclick = () => close();
    place(); requestAnimationFrame(() => requestAnimationFrame(place));
    box.querySelector('[data-a=next]').focus();
  }
  function key(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.stopPropagation(); e.preventDefault();
      i = Math.max(0, Math.min(STEPS.length - 1, i + (e.key === 'ArrowLeft' ? 1 : -1))); show(); // RTL: left = forward
    }
  }
  const api = {
    start() {
      if (box) return; opener = document.activeElement; onStart?.();
      document.body.classList.add('touring');
      ring = document.createElement('div'); ring.className = 'coach-ring tour-ring';
      box = document.createElement('div'); box.className = 'coach tour'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-labelledby', 'tourT');
      document.body.append(ring, box); i = 0;
      addEventListener('resize', place); document.addEventListener('keydown', key, true);
      show();
    },
    get seen() { try { return localStorage.getItem(KEY) === 'done'; } catch { return true; } },
    close,
  };
  button?.addEventListener('click', () => api.start());
  return api;
}
