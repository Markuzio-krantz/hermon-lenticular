// Opening tour: a few light coach marks that show where things are. Shown once on the first visit,
// skippable at any step, and always available again from the "סיור" button.
const KEY = 'lenticular.tour';

const STEPS = [
  { sel: null, title: 'ענן שעומד במקום, אוויר שזז', text: 'סיור קצר של חצי דקה: איפה מסתירים את ההסבר, איך עוברים בין שלבים ואיפה כל השאר. אפשר לדלג בכל רגע.' },
  { sel: '.step-nav', title: 'מעבר בין שלבים', text: 'הסיפור בנוי מ-12 שלבים. "הבא" ו"הקודם" כאן, או החצים במקלדת. הפס שלמעלה מראה איפה אתם, ואפשר ללחוץ על כל קטע בו.' },
  { sel: '#storyMin', title: 'להסתיר את ההסבר', text: 'הכפתור הזה מקפל את חלון ההסבר לפס דק עם חצים, והמפה מקבלת את כל המסך. לחיצה נוספת פותחת אותו שוב.' },
  { sel: '#layerMenu', title: 'מה מוצג על המפה', text: 'כל עיגול הוא שכבה: עננים, זרימת אוויר, שכבות לחות ועוד. לחיצה מדליקה או מכבה, ו"הסבר ושליטה" מסביר כל אחת.' },
  { sel: '#maptools', title: 'המפה בידיים שלכם', text: 'גוררים כדי לסובב, גלגלת או שתי אצבעות לזום, והקשה על ענן או על המפה מסבירה מה קורה שם. העין מסתירה את כל הכפתורים (גם מקש H).' },
  { sel: '.hud-actions', title: 'עוד ארבעה מקומות', text: 'סטודיו העדשה: עדשה אחת מקרוב, נוצרת מול העיניים. ללמוד: נושאים קצרים. מעבדה: משנים את האטמוספרה בעצמכם. על הפרויקט: המדע, הפיתוח והקוד.' },
  { sel: '#siteTourBtn', title: 'הסיור תמיד כאן', text: 'סימן השאלה פותח את הסיור הזה שוב, בכל רגע.' },
];

export function initSiteTour({ button, onStart } = {}) {
  let ring = null, box = null, i = 0, opener = null;
  const visible = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const steps = () => STEPS.filter((s) => !s.sel || visible(document.querySelector(s.sel)));

  function close(done = true) {
    ring?.remove(); box?.remove(); ring = box = null;
    removeEventListener('resize', place); document.removeEventListener('keydown', key, true);
    if (done) { try { localStorage.setItem(KEY, 'done'); } catch { /* private mode */ } }
    (opener || button)?.focus?.();
  }
  function place() {
    if (!box) return;
    const list = steps(), s = list[i], t = s?.sel && document.querySelector(s.sel);
    if (!t) { ring.style.opacity = '0'; Object.assign(box.style, { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', bottom: 'auto' }); return; }
    const r = t.getBoundingClientRect(), pad = 6;
    Object.assign(ring.style, { opacity: '1', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    box.style.transform = 'none';
    const bw = box.offsetWidth, bh = box.offsetHeight, gap = 14;
    // below the target if there is room, otherwise above; centred on it, kept on screen
    let top = r.bottom + gap; if (top + bh > innerHeight - 12) top = Math.max(12, r.top - gap - bh);
    const left = Math.min(innerWidth - bw - 12, Math.max(12, r.left + r.width / 2 - bw / 2));
    Object.assign(box.style, { top: `${top}px`, left: `${left}px`, bottom: 'auto' });
  }
  function show() {
    const list = steps(), s = list[i], last = i === list.length - 1;
    box.innerHTML = `<small>${i + 1} / ${list.length}</small><h4 id="tourT">${s.title}</h4><p>${s.text}</p>
      <div class="row"><button class="btn ghost" type="button" data-a="skip">${last ? 'סגירה' : 'דלגו על הסיור'}</button>
      <span>${i ? '<button class="btn" type="button" data-a="prev">הקודם</button>' : ''}
      <button class="btn primary" type="button" data-a="next">${last ? 'מתחילים' : 'הבא'}</button></span></div>`;
    box.querySelector('[data-a=next]').onclick = () => { if (last) close(); else { i++; show(); } };
    box.querySelector('[data-a=prev]')?.addEventListener('click', () => { i--; show(); });
    box.querySelector('[data-a=skip]').onclick = () => close();
    place(); requestAnimationFrame(place);
    box.querySelector('[data-a=next]').focus();
  }
  function key(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.stopPropagation(); e.preventDefault(); const n = steps().length;
      // RTL: left = forward
      i = Math.max(0, Math.min(n - 1, i + (e.key === 'ArrowLeft' ? 1 : -1))); show(); }
  }
  const api = {
    start() {
      if (box) return; opener = document.activeElement; onStart?.();
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
