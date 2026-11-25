// Bet Dagan (LLBD, WMO 40179) radiosonde, launched 19/11/2026 23:05 UTC.
// Columns: T [°C], RH [%], p [hPa], height MSL [m], wind dir [deg], wind speed [kt].
// Thinned from the raw 10-second file (every ~100 m up to 12.5 km).
export const SOUNDING_00Z = [[14.4,78,1016.4,31,100,2.9],[21,34,1004.5,132,161,5.4],[22,31,993.4,228,193,4.8],[21.3,31,982.8,321,207,4.5],[20.6,33,971.5,421,243,5.8],[19.9,35,960.8,516,245,6.2],[19.3,37,950.6,608,247,6],[19,36,940.2,703,262,6],[18.7,45,930.1,795,280,5.4],[18.1,45,919.7,892,294,5],[17.2,48,909,991,301,4.7],[16.5,47,898.3,1093,319,5.6],[15.8,49,887.9,1192,322,7.4],[15,51,877.5,1292,320,8.3],[14.2,57,867.1,1393,321,9.1],[13.6,55,856.7,1494,321,8.5],[12.8,59,846.6,1594,305,8.1],[12.4,62,836.7,1692,293,9.9],[12,60,827.3,1787,287,10.3],[12.1,52,818.6,1876,294,11.1],[11.9,44,810,1964,290,10.9],[11.7,45,801.5,2053,296,10.9],[11.6,44,792.6,2145,296,10.1],[12.2,24,783.8,2239,302,12.8],[13.1,8,773.9,2345,293,12],[12.5,13,765.8,2434,273,10.9],[12.3,14,756.8,2533,263,11.1],[11.8,24,747.8,2632,281,12.2],[10.9,39,739,2731,272,12.8],[10.1,48,730.6,2827,276,13.8],[9.8,52,722.3,2922,284,14.2],[9.1,56,713.9,3019,290,14.2],[8.2,58,705.3,3119,293,14],[7.4,62,696.5,3223,291,13],[6.7,63,687.9,3325,285,13],[5.9,66,679.3,3428,282,13.6],[5,69,670.8,3531,282,14.4],[4,73,662.2,3637,282,14.5],[3,78,653.8,3741,286,14.7],[2,82,645.4,3844,291,14.2],[1.7,71,637.1,3950,303,14.5],[1.4,59,629.1,4052,300,15.9],[1,50,621.1,4154,297,17.5],[0.5,64,613.3,4256,301,18],[-0.1,64,605.7,4356,302,19.2],[-0.5,56,598.3,4454,304,20.4],[-0.8,39,591.1,4552,302,19.8],[-1,37,584,4648,298,19.8],[-1.6,39,576.8,4746,301,19.8],[-2,25,569.6,4846,309,16.7],[-2.4,9,563.9,4926,313,14.7],[-2.6,11,556.4,5032,318,15.7],[-3.3,15,550.6,5114,318,18.4],[-3.8,17,545.1,5194,318,20.2],[-4.6,26,538,5298,319,20.2],[-5.4,26,530.9,5402,320,18.6],[-6,19,524,5505,326,18],[-6.6,16,517.2,5607,325,17.1],[-7.5,19,510.4,5709,322,16.1],[-8.3,35,503.6,5813,316,17.8],[-9.1,39,497,5916,318,18.8],[-9.8,41,490.5,6017,320,18.2],[-10.7,41,484.2,6117,322,18.2],[-11.6,36,478.1,6215,325,19],[-12.5,51,472,6312,330,19.2],[-13,48,466.1,6409,327,19.2],[-13.7,46,460.2,6506,324,22.1],[-14.4,44,454.3,6604,321,23.3],[-15.2,41,448.4,6702,320,25.4],[-14.8,23,442.3,6805,313,27],[-14.8,21,437.6,6887,310,30.1],[-15.1,20,432.9,6969,309,29.5],[-15.4,17,428.2,7051,303,27.9],[-15.9,16,423.3,7138,298,26],[-16.6,17,418.4,7225,294,24.1],[-17.5,17,412.7,7329,288,22.9],[-18.2,13,407.1,7430,287,22.1],[-18.7,9,401.6,7533,295,21.1],[-19.1,7,396.1,7634,305,21.9],[-19.7,7,391.8,7715,311,22.9],[-20.4,7,386.3,7820,315,25.8],[-21.2,7,380.8,7925,315,27.9],[-22,7,375.5,8028,311,28.9],[-22.8,7,370.2,8134,307,29.7],[-23.7,8,364.8,8241,308,30.5],[-24.5,8,360.8,8322,309,29.9],[-25.2,8,356.7,8404,310,29.7],[-25.9,9,352.8,8484,310,29.3],[-26.7,9,348.9,8564,312,29.5],[-27.7,10,343.9,8668,312,29.5],[-28.6,11,339.2,8767,313,29.5],[-29.5,11,334.7,8863,312,29.3],[-30.2,12,330.5,8953,311,28.7],[-31,12,326.4,9040,311,28.9],[-31.7,13,322.6,9123,309,28.9],[-32.1,12,318.6,9211,312,29.1],[-33.1,13,314,9315,314,29.3],[-33.9,14,310.2,9400,313,28.7],[-34.7,15,306.6,9481,314,28.7],[-35.5,16,302.7,9571,317,28.5],[-36.2,16,299,9657,321,28.1],[-37.1,18,294.5,9762,323,27.5],[-38,20,290,9867,321,27.9],[-38.7,20,286.5,9952,318,27.7],[-39.2,22,283,10035,319,27.7],[-39.9,22,279.7,10116,320,27.7],[-40.7,23,276.2,10202,322,27.4],[-41.4,21,272.6,10291,325,27],[-42.2,22,269,10381,324,27.5],[-43,23,265.4,10471,323,28.3],[-43.7,24,261.9,10560,324,28.9],[-44.5,26,258.5,10649,326,28.9],[-45.3,26,255.2,10736,329,28.7],[-46.1,29,252,10819,331,29.3],[-46.8,30,248.8,10904,332,29.7],[-47.5,32,245.6,10990,329,29.1],[-48.3,36,242.3,11078,326,29.1],[-48.7,44,239.2,11163,324,29.9],[-49.3,51,236.2,11246,324,30.8],[-50,62,232.4,11351,325,33],[-50.9,51,228.8,11452,327,33.8],[-51.4,48,225.5,11546,329,34.7],[-52.1,47,222.4,11639,329,35.7],[-52.9,64,219.2,11730,329,35.3],[-53.6,63,216,11825,330,34.9],[-54.3,60,212.6,11927,330,36.9],[-55,58,209.3,12028,330,38],[-55.4,65,206.7,12108,328,37.6],[-56.2,65,203.2,12215,327,38],[-56.9,66,200.6,12298,326,37.6],[-57.4,60,198,12380,326,36.7],[-58,58,195.4,12463,327,36.9]];

// 12 UTC winds (≈2.5 h before the photo), standard levels from the 12Z tephigram:
// [height m, dir deg, speed kt]. The 950 m anchor is Har Kna'an (934 m) 15:30-17:00 local:
// 251-274 deg, 8-9.9 m/s - Bet Dagan's low levels are not representative of the Galilee.
export const WINDS_12Z = [[950,265,17],[1500,252,9],[3160,280,21],[5850,286,18],[9590,296,40]];

const G = 9.81, RD = 287.04, CP = 1004.6, LV = 2.5e6, EPS = 0.622, KT = 0.514444;

export const esat = (tc) => 6.112 * Math.exp(17.67 * tc / (tc + 243.5));      // hPa, over water (Bolton)
export const qsat = (tc, p) => { const e = esat(tc); return EPS * e / (p - (1 - EPS) * e); };
export const dewpoint = (tc, rh) => { const g = Math.log(Math.max(rh, 1) / 100) + 17.67 * tc / (tc + 243.5); return 243.5 * g / (17.67 - g); };

function interp(zs, vs, z) {
  if (z <= zs[0]) return vs[0];
  const n = zs.length;
  if (z >= zs[n - 1]) return vs[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (zs[m] <= z) lo = m; else hi = m; }
  const f = (z - zs[lo]) / (zs[hi] - zs[lo]);
  return vs[lo] + f * (vs[hi] - vs[lo]);
}

/** Interpolated base profile on a uniform 50 m grid 0..16 km. winds: '00z' | '12z' */
export function baseProfile(winds = '12z') {
  // winds: '12z' | '00z' (Bet Dagan) or {rows} = any sounding in SOUNDING_00Z's column layout
  const custom = winds && typeof winds === 'object';
  const S = custom ? winds.rows : SOUNDING_00Z;
  const zs = S.map(r => r[3]);
  const col = (i) => S.map(r => r[i]);
  const T = col(0), RH = col(1), P = col(2);
  // wind components (direction = where wind blows FROM)
  let U = S.map(r => -r[5] * KT * Math.sin(r[4] * Math.PI / 180));
  let V = S.map(r => -r[5] * KT * Math.cos(r[4] * Math.PI / 180));
  if (!custom && winds === '12z') {
    const w = WINDS_12Z;
    const wz = w.map(a => a[0]);
    const wu = w.map(a => -a[2] * KT * Math.sin(a[1] * Math.PI / 180));
    const wv = w.map(a => -a[2] * KT * Math.cos(a[1] * Math.PI / 180));
    const s00 = (z) => Math.hypot(interp(zs, U, z), interp(zs, V, z));
    const last = w.length - 1, topScale = Math.hypot(wu[last], wv[last]) / s00(9590);
    U = zs.map((z, i) => z <= 9590 ? interp(wz, wu, z) : U[i] * topScale);
    V = zs.map((z, i) => z <= 9590 ? interp(wz, wv, z) : V[i] * topScale);
  }
  const dz = 50, nz = 321;
  const out = { dz, nz, z: new Float32Array(nz), T: new Float32Array(nz), RH: new Float32Array(nz), p: new Float32Array(nz), U: new Float32Array(nz), V: new Float32Array(nz) };
  const ztop = zs[zs.length - 1], Ttop = T[T.length - 1], Ptop = P[P.length - 1];
  for (let k = 0; k < nz; k++) {
    const z = k * dz; out.z[k] = z;
    if (z <= ztop) {
      out.T[k] = interp(zs, T, z); out.RH[k] = interp(zs, RH, z); out.p[k] = interp(zs, P, z);
    } else { // lower stratosphere: isothermal above the measured top
      out.T[k] = Ttop - Math.max(0, Math.min(z, 13000) - ztop) * 0.004; out.RH[k] = 10;
      out.p[k] = Ptop * Math.exp(-(z - ztop) * G / (RD * (out.T[k] + 273.15)));
    }
    out.U[k] = interp(zs, U, Math.min(z, ztop)); out.V[k] = interp(zs, V, Math.min(z, ztop));
  }
  return out;
}

/** Apply the learner's knobs to a base profile; returns derived quantities too. */
export function applyParams(base, prm) {
  const { nz, dz } = base;
  const p = { ...base, T: base.T.slice(), RH: base.RH.slice(), U: new Float32Array(nz), V: new Float32Array(nz), N2: new Float32Array(nz), theta: new Float32Array(nz), Td: new Float32Array(nz) };
  const rot = (prm.dirOffset || 0) * Math.PI / 180;
  for (let k = 0; k < nz; k++) {
    const z = k * dz;
    let u = base.U[k], v = base.V[k];
    if (prm.uniformDir != null) { // force one direction, keep speed
      const s = Math.hypot(u, v), d = prm.uniformDir * Math.PI / 180;
      u = -s * Math.sin(d); v = -s * Math.cos(d);
    }
    const cu = Math.cos(rot), su = Math.sin(rot);
    let uu = u * cu + v * su, vv = -u * su + v * cu;      // rotate clockwise by dirOffset
    let s = (prm.windScale ?? 1);
    if (prm.upperBoost) s *= 1 + prm.upperBoost * smooth((z - 4500) / 2500); // jet aloft -> trapping
    p.U[k] = uu * s; p.V[k] = vv * s;
    // moistShift lifts or lowers the whole mid-level moisture structure (above 2.6 km)
    const sh = prm.moistShift || 0;
    const ks = z > 2600 ? Math.min(nz - 1, Math.max(Math.round(2600 / dz), Math.round((z - sh) / dz))) : k;
    let rh = base.RH[ks] + (prm.rhOffset || 0);
    // the two thin moist layers seen in the sounding (3.84 km, 82 %; 4.33 km, 64 %), dry gap left alone
    if (prm.lensBoost) rh += prm.lensBoost * Math.exp(-(((z - 3830 - sh) / 230) ** 2));
    if (prm.layer2Boost) rh += prm.layer2Boost * Math.exp(-(((z - 4320 - sh) / 150) ** 2));
    if (prm.uniformMoist) rh = Math.max(rh, prm.uniformMoist);
    p.RH[k] = Math.min(100, Math.max(2, rh));
  }
  for (let k = 0; k < nz; k++) {
    p.theta[k] = (p.T[k] + 273.15) * Math.pow(1000 / p.p[k], 0.2857);
    p.Td[k] = dewpoint(p.T[k], p.RH[k]);
  }
  // N^2 = g/theta dtheta/dz, smoothed over ±200 m, then scaled
  const raw = new Float32Array(nz);
  for (let k = 0; k < nz; k++) {
    const a = Math.max(0, k - 1), b = Math.min(nz - 1, k + 1);
    raw[k] = G / p.theta[k] * (p.theta[b] - p.theta[a]) / ((b - a) * dz);
  }
  const W = 4;
  for (let k = 0; k < nz; k++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, k - W); j <= Math.min(nz - 1, k + W); j++) { s += raw[j]; c++; }
    p.N2[k] = Math.max(2e-6, (s / c) * (prm.stabilityScale ?? 1));
  }
  return p;
}

const smooth = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

/** Condensate table: for every profile level, cloud water (g/kg) after lifting by L metres.
 * Dry adiabat to saturation, then saturated adiabat; reversible (no fallout). */
export function liftTable(p, maxLift = 2000, step = 25) {
  const nL = Math.floor(maxLift / step) + 1;
  const tab = new Float32Array(p.nz * nL);
  const rhLift = new Float32Array(p.nz * nL);
  for (let k = 0; k < p.nz; k++) {
    let T = p.T[k] + 273.15, pr = p.p[k];
    const qt = qsat(p.T[k], pr) * p.RH[k] / 100;
    for (let i = 0; i < nL; i++) {
      const qs = qsat(T - 273.15, pr);
      tab[k * nL + i] = Math.max(0, qt - qs) * 1000;
      rhLift[k * nL + i] = Math.min(100, 100 * qt / qs);
      // advance one step
      const Tv = T * (1 + 0.61 * Math.min(qt, qs));
      pr *= Math.exp(-step * G / (RD * Tv));
      if (qt < qs) T -= step * G / CP;
      else { const q = qs; T -= step * G * (1 + LV * q / (RD * T)) / (CP + LV * LV * q * EPS / (RD * T * T)); }
    }
  }
  return { tab, rhLift, nL, step };
}

/** Saturation lift (m) needed for the level k, from the table. */
export function liftToSaturate(lt, k) {
  const { tab, nL, step } = lt;
  for (let i = 0; i < nL; i++) if (tab[k * nL + i] > 0) return i * step;
  return Infinity;
}
