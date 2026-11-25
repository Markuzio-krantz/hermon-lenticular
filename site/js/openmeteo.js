// Real atmosphere from Open-Meteo (open, no key, CORS): pressure-level temperature, humidity,
// wind and geopotential height for one point over the Upper Galilee / Hula.
// Output rows use the radiosonde layout: [T °C, RH %, p hPa, z m, dir deg, speed kt].
const LEVELS = [1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200];
const VARS = ['temperature', 'relative_humidity', 'wind_speed', 'wind_direction', 'geopotential_height'];
export const POINT = { lat: 33.15, lon: 35.55, name: 'הגליל העליון, מערבית לעמק החולה' };
const KT = 1 / 0.514444;

function url(base, extra) {
  const hourly = VARS.flatMap(v => LEVELS.map(l => `${v}_${l}hPa`)).join(',');
  return `${base}?latitude=${POINT.lat}&longitude=${POINT.lon}&hourly=${hourly}&wind_speed_unit=ms&timezone=Asia%2FJerusalem&${extra}`;
}

async function get(u) {
  const r = await fetch(u);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.reason || `HTTP ${r.status}`);
  return j.hourly;
}

/** Hourly data for a window around now: past 7 days and next 7 days. */
export async function fetchWindow() {
  return get(url('https://api.open-meteo.com/v1/forecast', 'past_days=7&forecast_days=7'));
}

/** Hourly data for one calendar day (any date since 2022). */
export async function fetchDay(isoDate) {
  const extra = `start_date=${isoDate}&end_date=${isoDate}`;
  try { return await get(url('https://api.open-meteo.com/v1/forecast', extra)); }
  catch { return get(url('https://historical-forecast-api.open-meteo.com/v1/forecast', extra)); }
}

/** Sounding rows for hour index i (levels below the ground and missing values dropped). */
export function rowsAt(h, i) {
  const rows = [];
  for (const l of LEVELS) {
    const z = h[`geopotential_height_${l}hPa`]?.[i], T = h[`temperature_${l}hPa`]?.[i];
    const rh = h[`relative_humidity_${l}hPa`]?.[i], ws = h[`wind_speed_${l}hPa`]?.[i], wd = h[`wind_direction_${l}hPa`]?.[i];
    if ([z, T, rh, ws, wd].some(v => v == null || Number.isNaN(v))) continue;
    if (z < 50) continue;
    rows.push([T, rh, l, z, wd, ws * KT]);
  }
  rows.sort((a, b) => a[3] - b[3]);
  return rows.length >= 6 ? rows : null;
}

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const at = (h, v, l, i) => h[`${v}_${l}hPa`]?.[i];

/**
 * Simple lenticular-potential index 0..1 for hour i (a heuristic, not a forecast):
 * wind across the Hermon at 700 hPa, steady direction with height, a stable "spring"
 * between 850 and 600 hPa, and humid-but-not-saturated air in the 700-500 hPa band.
 */
export function potential(h, i) {
  const d7 = at(h, 'wind_direction', 700, i), s7 = at(h, 'wind_speed', 700, i), d5 = at(h, 'wind_direction', 500, i);
  if (d7 == null || s7 == null || d5 == null) return null;
  const across = s7 * Math.abs(Math.cos((d7 - 295) * Math.PI / 180));       // Hermon axis runs NNE-SSW
  const turn = Math.abs(((d5 - d7 + 540) % 360) - 180);
  const th = (l) => (at(h, 'temperature', l, i) + 273.15) * Math.pow(1000 / l, 0.2857);
  const dz = at(h, 'geopotential_height', 600, i) - at(h, 'geopotential_height', 850, i);
  const N2 = 9.81 / th(700) * (th(600) - th(850)) / dz;
  const N = Math.sqrt(Math.max(0, N2));
  const rh = Math.max(...[700, 650, 600, 550, 500].map(l => at(h, 'relative_humidity', l, i) ?? 0));
  const parts = {
    wind: sm(4, 11, across), steady: 1 - sm(25, 70, turn), stable: sm(0.006, 0.011, N),
    moist: sm(45, 78, rh) * (1 - 0.6 * sm(93, 100, rh)),
  };
  return { score: parts.wind * parts.steady * parts.stable * parts.moist, parts, across, d7, N, rh };
}
