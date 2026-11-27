// Spring or bubble: the parcel method on one small chart. A bubble of air heated at the valley floor rises
// while it is warmer than the air around it (a thermal). Where it reaches its dew point a cumulus begins.
// On 19.11 the measured air was stable: the bubble stalls low, and the mountain makes waves instead.
const G = 9.81, CP = 1004, RD = 287, LV = 2.5e6, EPS = 0.622, Z0 = 100;

const es = (t) => 6.112 * Math.exp(17.67 * t / (t + 243.5));         // hPa, t in °C
const rs = (t, p) => EPS * es(t) / Math.max(1, p - es(t));             // saturation mixing ratio
const pres = (z) => 1013.25 * Math.exp(-z / 8000);

/** env(z) -> °C. Returns { path: [{z, t, wet}], lcl, top } for a bubble heated by `heat` °C with ground humidity rh (%) */
export function parcel(env, heat, rh) {
  const t0 = env(Z0), r = rh / 100 * rs(t0, pres(Z0));
  let t = t0 + heat, lcl = null, top = Z0;
  const path = [{ z: Z0, t, wet: false }];
  for (let z = Z0 + 50; z <= 9000; z += 50) {
    const p = pres(z), sat = lcl !== null;
    if (!sat) { t -= 9.8 * 0.05; if (rs(t, p) <= r) lcl = z; }
    else { const tk = t + 273.15, q = rs(t, p); t -= 50 * G * (1 + LV * q / (RD * tk)) / (CP + LV * LV * q * EPS / (RD * tk * tk)); }
    if (t <= env(z)) break;
    top = z; path.push({ z, t, wet: lcl !== null });
  }
  return { path, lcl: lcl !== null && lcl <= top ? lcl : null, top };
}

export function createThermal(host, { getProf }) {
  host.innerHTML = `
    <canvas class="th-chart" aria-hidden="true"></canvas>
    <p class="th-out" role="status"></p>
    <label class="try-row"><span>חימום הקרקע</span><input type="range" min="0" max="10" step="0.5" value="3" data-k="heat"><output></output></label>
    <label class="try-row"><span>לחות ליד הקרקע</span><input type="range" min="20" max="95" step="1" value="60" data-k="rh"><output></output></label>
    <div class="th-env" role="group" aria-label="איזה אוויר">
      <button type="button" class="chip" data-env="real" aria-pressed="true">האוויר של 19.11</button>
      <button type="button" class="chip" data-env="unstable" aria-pressed="false">יום קיץ לא יציב</button>
    </div>`;
  const cv = host.querySelector('canvas'), ctx = cv.getContext('2d'), out = host.querySelector('.th-out');
  const st = { heat: 3, rh: 60, env: 'real' };
  let res = null, envF = null, raf = 0, t0 = 0;

  function makeEnv() {
    const p = getProf();
    if (st.env === 'unstable' || !p) { const s = 26; return (z) => s - 8.6 * z / 1000; }  // close to dry-adiabatic: anything warm rises
    return (z) => { const f = Math.max(0, Math.min(p.T.length - 1.001, z / p.dz)), k = f | 0; return p.T[k] + (p.T[k + 1] - p.T[k]) * (f - k); };
  }
  function solve() {
    envF = makeEnv(); res = parcel(envF, st.heat, st.rh);
    for (const i of host.querySelectorAll('input')) i.nextElementSibling.textContent = i.dataset.k === 'heat' ? `+${st[i.dataset.k]}°` : `${st[i.dataset.k]}%`;
    const rise = res.top - Z0, km = (m) => (m / 1000).toFixed(1);
    out.textContent = rise < 150 ? 'הבועה כמעט לא עולה: היא מתקררת מהר יותר מהאוויר סביבה ונעשית כבדה ממנו. אוויר יציב, כמו קפיץ.'
      : res.lcl ? `טרמיקה עם ענן ערימה: בסיס הענן בגובה ${km(res.lcl)} ק"מ, הראש ב-${km(res.top)} ק"מ.`
      : `טרמיקה יבשה עד ${km(res.top)} ק"מ: הבועה נעצרת לפני שהגיעה לנקודת הטל, ולכן אין ענן.`;
    if (st.env === 'real' && rise < 2500) out.textContent += ' בערב ההוא אין ענני ערימה: במקומם ההר עושה גלים, ובפסגות הגל נולדות העדשות.';
  }
  function draw(now) {
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const ZT = 7000, ts = []; for (let z = 0; z <= ZT; z += 250) ts.push(envF(z)); for (const p of res.path) if (p.z <= ZT) ts.push(p.t);
    const tmin = Math.floor(Math.min(...ts) / 5) * 5 - 2, tmax = Math.ceil(Math.max(...ts) / 5) * 5 + 2;
    const L = 30, R = W - 64, X = (t) => L + (t - tmin) / (tmax - tmin) * (R - L), Y = (z) => H - 16 - z / ZT * (H - 26);
    // grid: height in km
    ctx.direction = 'ltr'; ctx.textAlign = 'left';
    ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillStyle = 'rgb(255 255 255 / .45)'; ctx.strokeStyle = 'rgb(255 255 255 / .08)'; ctx.lineWidth = 1;
    for (let z = 0; z < ZT; z += 1000) { ctx.beginPath(); ctx.moveTo(L, Y(z)); ctx.lineTo(R, Y(z)); ctx.stroke(); ctx.fillText(`${z / 1000}`, 4, Y(z) + 3); }
    ctx.fillText('km', 14, Y(ZT) + 3);
    for (let t = Math.ceil(tmin / 10) * 10; t <= tmax; t += 10) ctx.fillText(`${t}°`, X(t) - 8, H - 3);
    // buoyant region
    ctx.fillStyle = 'rgb(255 155 90 / .22)'; ctx.beginPath();
    res.path.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.z)) : ctx.moveTo(X(p.t), Y(p.z))));
    for (let i = res.path.length - 1; i >= 0; i--) ctx.lineTo(X(envF(res.path[i].z)), Y(res.path[i].z));
    ctx.fill();
    // environment
    ctx.strokeStyle = '#5aa9ff'; ctx.lineWidth = 2.2; ctx.beginPath();
    for (let z = 0; z <= ZT; z += 50) (z ? ctx.lineTo(X(envF(z)), Y(z)) : ctx.moveTo(X(envF(z)), Y(z))); ctx.stroke();
    // parcel
    ctx.strokeStyle = '#ff9b5a'; ctx.lineWidth = 2.2; ctx.beginPath();
    res.path.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.z)) : ctx.moveTo(X(p.t), Y(p.z)))); ctx.stroke();
    // the cumulus, from base to top, at the right edge
    if (res.lcl) {
      const y0 = Y(res.lcl), y1 = Y(Math.min(res.top, ZT)), cx = R + 30, w = 22;
      ctx.fillStyle = 'rgb(255 255 255 / .92)'; ctx.beginPath();
      for (let y = y0; y >= y1; y -= 9) { const k = (y0 - y) / Math.max(1, y0 - y1); ctx.moveTo(cx + w * (1 - 0.3 * k), y); ctx.arc(cx, y, w * (1 - 0.3 * k), 0, Math.PI * 2); }
      ctx.fill(); ctx.fillStyle = 'rgb(255 255 255 / .7)'; ctx.font = '10px "IBM Plex Sans Hebrew", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('בסיס', cx, y0 + 12); ctx.textAlign = 'left';
    }
    // the bubble itself, rising and starting over
    const n = res.path.length, k = Math.min(n - 1, Math.floor(((now - t0) / 3500 % 1) * n)), b = res.path[k];
    ctx.fillStyle = b.wet ? '#fff' : '#ff9b5a'; ctx.beginPath(); ctx.arc(X(b.t), Y(b.z), 5, 0, Math.PI * 2); ctx.fill();
    raf = requestAnimationFrame(draw);
  }
  host.addEventListener('input', (e) => { const k = e.target.dataset.k; if (k) { st[k] = +e.target.value; solve(); } });
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-env]'); if (!b) return;
    st.env = b.dataset.env; for (const x of host.querySelectorAll('[data-env]')) x.setAttribute('aria-pressed', String(x === b)); solve();
  });
  return {
    start() { solve(); cancelAnimationFrame(raf); t0 = performance.now(); raf = requestAnimationFrame(draw); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}
