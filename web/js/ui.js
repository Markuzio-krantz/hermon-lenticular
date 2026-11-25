// Controls panel + readout strip.
const $ = (id) => document.getElementById(id);

const PARAMS = {
  windScale: (v) => `×${(+v).toFixed(2)}`,
  dirOffset: (v) => `${v > 0 ? '+' : ''}${v}°`,
  stabilityScale: (v) => `×${(+v).toFixed(2)}`,
  upperBoost: (v) => `+${Math.round(v * 100)}%`,
  rhOffset: (v) => `${v > 0 ? '+' : ''}${v}%`,
  lensBoost: (v) => `+${v}%`,
  layer2Boost: (v) => `+${v}%`,
  blockFactor: (v) => `${Math.round(v * 100)}%`,
  decayLength: (v) => `${Math.round(v / 1000)} ק"מ`,
};
const VISUAL = {
  sun: (v) => `${(+v).toFixed(1)}°`,
  exag: (v) => `×${(+v).toFixed(2)}`,
  speed: (v) => `×${v}`,
};

export function initUI({ state, PRESETS, DEFAULTS, onParams, onVisual, onChart, goTo }) {
  const sel = $('preset');
  for (const p of PRESETS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o); }
  let timer = null;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(onParams, 180); };

  for (const [id, fmt] of Object.entries(PARAMS)) {
    const el = $(id);
    el.addEventListener('input', () => { state.params[id] = +el.value; $('o-' + id).textContent = fmt(el.value); debounced(); });
  }
  for (const [id, fmt] of Object.entries(VISUAL)) {
    const el = $(id);
    el.addEventListener('input', () => { state[id] = +el.value; $('o-' + id).textContent = fmt(el.value); onVisual(); });
  }
  sel.addEventListener('change', () => api.setPreset(sel.value, true));
  $('reset').addEventListener('click', () => api.setPreset(state.preset, true));
  for (const b of $('parcelMode').children) b.addEventListener('click', () => { state.parcels = b.dataset.m; syncSeg(); onVisual(); });
  for (const [id, key] of [['tClouds', 'clouds'], ['tLabels', 'labels'], ['tRotors', 'rotors'], ['tColumn', 'column'], ['tSlice', 'slice']]) {
    $(id).addEventListener('change', () => { state[key] = $(id).checked; onVisual(); });
  }
  for (const b of $('chartTabs').children) b.addEventListener('click', () => { state.chart = b.dataset.c; syncTabs(); onChart(state.chart); });
  for (const b of $('views').children) b.addEventListener('click', () => goTo(b.dataset.v));

  function syncSeg() { for (const b of $('parcelMode').children) b.setAttribute('aria-pressed', String(b.dataset.m === state.parcels)); }
  function syncTabs() { for (const b of $('chartTabs').children) b.setAttribute('aria-selected', String(b.dataset.c === state.chart)); }

  const api = {
    setPreset(id, run) {
      const p = PRESETS.find(x => x.id === id) || PRESETS[0];
      state.preset = p.id; state.params = { ...DEFAULTS, ...p.params };
      sel.value = p.id; $('presetDesc').textContent = p.desc;
      api.syncAll();
      if (run) onParams();
    },
    syncAll() {
      for (const [id, fmt] of Object.entries(PARAMS)) { $(id).value = state.params[id]; $('o-' + id).textContent = fmt(state.params[id]); }
      for (const [id, fmt] of Object.entries(VISUAL)) { $(id).value = state[id]; $('o-' + id).textContent = fmt(state[id]); }
      $('tClouds').checked = state.clouds; $('tLabels').checked = state.labels; $('tRotors').checked = state.rotors;
      $('tColumn').checked = state.column; $('tSlice').checked = state.slice;
      syncSeg(); syncTabs();
    },
    readouts(r, prm) {
      const d = r.diag;
      const fr = (v) => v < 0.5 ? ['bad', 'חסימה'] : v < 1 ? ['warn', 'חלקית'] : ['ok', 'עובר'];
      const [c1, t1] = fr(d.frHermon), [c2, t2] = fr(d.frNaftali);
      const lens = d.lensCells > 20;
      const items = [
        ['פרוד חרמון', d.frHermon.toFixed(2), c1, t1],
        ['פרוד רמים', d.frNaftali.toFixed(2), c2, t2],
        ['אורך גל', `${(d.lambda / 1000).toFixed(1)} km`],
        ['משטר', null, d.trapped ? 'warn' : 'ok', d.trapped ? 'גלים לכודים' : 'מתפשטים מעלה'],
        ['עדשות', lens ? `${(d.lensBase / 1000).toFixed(1)}–${(d.lensTop / 1000).toFixed(1)} km` : '—', lens ? 'ok' : 'bad', lens ? 'נוצרו' : 'אין'],
        ['זמן חצייה', lens ? `~${Math.round(d.residence / 10) * 10} s` : '—'],
        ['קו מפריד', `${Math.round(d.zdHermon * prm.blockFactor)} m`],
        ['0°C', d.freeze ? `${Math.round(d.freeze)} m` : '—'],
        ['רוח ב-4 ק"מ', `${Math.round(d.dirFrom)}° · ${d.speedLens.toFixed(0)} m/s`],
      ];
      $('readouts').innerHTML = items.map(([k, v, cls, pill]) =>
        `<div class="ro"><span>${k}</span>${v ? `<b>${v}</b>` : ''}${pill ? `<span class="pill ${cls}">${pill}</span>` : ''}</div>`).join('');
    },
  };
  return api;
}
