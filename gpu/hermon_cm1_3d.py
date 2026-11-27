"""Stage C: the same CM1 run as hermon_cm1.py (19.11.2026 sounding, SRTM terrain, 400 m / 150 m grid, 2 h),
this time keeping what the website's 3-D layers need, plus four what-if scenarios run in parallel.

Kept per run (on the CM1 grid, s along the wind x c across):
  qc_layer_*, qc_xz_*, w_xz_*    as before (cloud water 3-5.5 km every 20 min, the cut through the summit)
  iso_eta.npy    float16 [6][NY][NX]  height of six potential-temperature surfaces minus their upstream height (m):
                 the "air layers" of the story, at 1.5 ... 6.5 km upstream
  moist_eta.npy  float16 [2][NY][NX]  the same for the moist layers at 3.8 and 4.3 km
  moist_rh.npy   float16 [2][NY][NX]  relative humidity (%) on those two surfaces
  ulow.npy       float16 [NY][NX]     along-wind speed ~300 m above the ground (m/s): negative = reversed flow, rotor
  iso_meta.json  the target heights and theta values

Scenarios: base, wind15 (all winds x1.5), jet (winds stronger above 5 km), dry (RH -8 points), moist (RH +8 points).

    python -m modal run gpu/hermon_cm1_3d.py          # outputs to gpu/out_cm1_3d/<scenario>/
"""
import json, math, pathlib, re, time
import modal

HERE = pathlib.Path(__file__).parent
app = modal.App("hermon-lenticular-cm1-3d")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "make", "gfortran", "libnetcdf-dev", "libnetcdff-dev", "netcdf-bin")
    .pip_install("numpy", "netCDF4")
    .run_commands(
        "git clone --depth 1 https://github.com/NCAR/CM1.git /opt/cm1",
        "cd /opt/cm1/src && sed -i 's/-lnetcdf -lnetcdff/-Wl,--no-as-needed -lnetcdff -lnetcdf/' Makefile && make FC=gfortran USE_OPENMP=true USE_NETCDF=true NETCDFBASE=/usr -j8 2>&1 | tail -4",
        "ls -la /opt/cm1/run/cm1.exe",
    )
)

NX, NY, NZ = 240, 120, 100
DX, DZ = 400.0, 150.0
TIMAX, TAPFRQ = 7200.0, 1200.0
UPWIND_KM, ANG = 60.0, -11.68
ISO_Z = [1500, 2500, 3500, 4500, 5500, 6500]
MOIST_Z = [3800, 4300]

SET = {
    "nx": NX, "ny": NY, "nz": NZ, "terrain_flag": ".true.",
    "dx": f"{DX:.1f}", "dy": f"{DX:.1f}", "dz": f"{DZ:.1f}", "dtl": "2.0", "timax": f"{TIMAX:.1f}", "tapfrq": f"{TAPFRQ:.1f}",
    "adapt_dt": 1, "ptype": 1, "isnd": 7, "iwnd": 0, "itern": 4, "wbc": 2, "ebc": 2, "sbc": 1, "nbc": 1,
    "imove": 0, "irdamp": 1, "hrdamp": 0, "icor": 0, "zd": "11000.0",
    "output_format": 2, "output_filetype": 2, "output_interp": 1, "output_zs": 1, "output_rain": 0,
    "output_qv": 1, "output_q": 1, "output_u": 1, "output_w": 1, "output_th": 1, "output_prs": 1,
}

SCENARIOS = ["base", "wind15", "jet", "dry", "moist"]


def scenario(profile, tag):
    """the sounding for one what-if (local, before it is sent)"""
    import numpy as np
    p = {k: (list(v) if isinstance(v, list) else v) for k, v in profile.items()}
    z = np.array(p["z"], float); U = np.array(p["U"], float); V = np.array(p["V"], float); RH = np.array(p["RH"], float)
    if tag == "wind15": U, V = U * 1.5, V * 1.5
    if tag == "jet":
        k = 1 + 1.2 * np.clip((z - 5000) / 3000, 0, 1); U, V = U * k, V * k
    if tag == "dry": RH = np.clip(RH - 8, 2, 100)
    if tag == "moist": RH = np.clip(RH + 8, 2, 100)
    p["U"], p["V"], p["RH"] = U.tolist(), V.tolist(), RH.tolist()
    return p


@app.function(image=image, cpu=8, memory=16384, timeout=3 * 60 * 60)
def run(profile: dict, dem: list, tag: str) -> dict:
    import os, subprocess, glob, numpy as np, netCDF4 as nc
    t0 = time.time()
    work = pathlib.Path("/tmp/cm1"); work.mkdir(parents=True, exist_ok=True); os.chdir(work)
    subprocess.run("cp /opt/cm1/run/cm1.exe /opt/cm1/run/LANDUSE.TBL . && cp -r /opt/cm1/run/RRTMG_* . ", shell=True, check=True)
    nl = open("/opt/cm1/run/namelist.input").read()
    for k, v in SET.items():
        nl, n = re.subn(rf"(\n\s*{k}\s*=\s*)[^,\n]+,", rf"\g<1>{v},", nl)
        if n == 0: print("namelist key not found:", k)
    open("namelist.input", "w").write(nl)
    z = np.array(profile["z"], float); th = np.array(profile["theta"]); T = np.array(profile["T"]) + 273.15
    p = np.array(profile["p"]) * 100; RH = np.array(profile["RH"]) / 100
    es = 611.2 * np.exp(17.67 * (T - 273.15) / (T - 29.65)); e = RH * es; qv = 0.622 * e / (p - e) * 1000
    a = math.radians(ANG); U, V = np.array(profile["U"]), np.array(profile["V"])
    ua = U * math.cos(a) + V * math.sin(a); va = -U * math.sin(a) + V * math.cos(a)
    with open("input_sounding", "w") as f:
        f.write(f"{p[0] / 100:.2f} {th[0]:.3f} {qv[0]:.4f}\n")
        for k in range(1, len(z)):
            if z[k] > 16000: break
            f.write(f"{z[k]:.1f} {th[k]:.3f} {qv[k]:.4f} {ua[k]:.3f} {va[k]:.3f}\n")
    np.asarray(dem, dtype=np.float32).tofile("perts.dat")
    zs = np.asarray(dem, dtype=np.float32).reshape(NY, NX)
    env = dict(os.environ, OMP_NUM_THREADS="8", OMP_STACKSIZE="512M")
    r = subprocess.run(["./cm1.exe"], capture_output=True, text=True, env=env)
    lines = r.stdout.splitlines()
    log = f"[{tag}] rc={r.returncode} t={time.time() - t0:.0f}s\n" + "\n".join(lines[:40] + ["..."] + lines[-40:]) + "\n" + r.stderr[-3000:]
    print(log[-1500:])
    out = {"log": log.encode()}
    files = sorted(f for f in glob.glob("cm1out_*.nc") if "stats" not in f)  # cm1out_stats.nc sorts last but is not a frame
    summary = []
    th_up = {h: float(np.interp(h, z, th)) for h in ISO_Z + MOIST_Z}   # theta of each surface, from the inflow sounding
    for fn in files:
        try:
            d = nc.Dataset(fn); v = d.variables
            zz = np.asarray(v["zh"][:], dtype=float).ravel()
            if zz.max() < 100: zz = zz * 1000.0
            tsec = float(v["time"][0])
            q = np.asarray(v["qc"][0], dtype=np.float32)
            w = np.asarray(v["winterp"][0] if "winterp" in v else v["w"][0], dtype=np.float32)
            k0, k1 = np.searchsorted(zz, 3000), np.searchsorted(zz, 5500)
            out[f"qc_layer_{int(tsec):05d}.npy"] = np.ascontiguousarray(q[k0:k1]).astype(np.float16).tobytes()
            out[f"qc_xz_{int(tsec):05d}.npy"] = np.ascontiguousarray(q[:, NY // 2, :]).astype(np.float32).tobytes()
            out[f"w_xz_{int(tsec):05d}.npy"] = np.ascontiguousarray(w[:, NY // 2, :]).tobytes()
            hi = q[k0:k1]; summary.append({"t": tsec, "qcmax": float(hi.max()), "cells": int((hi > 1e-5).sum())})
            if fn == files[0]:
                out["z.npy"] = zz.astype(np.float32).tobytes()
                out["vars.txt"] = "\n".join(f"{k} {v[k].dimensions}" for k in v).encode()
            if fn == files[-1]:  # the 3-D layers, at the end of the run
                TH = np.asarray(v["th"][0], dtype=np.float64); QV = np.asarray(v["qv"][0], dtype=np.float64)
                P = np.asarray(v["prs"][0], dtype=np.float64); UL = np.asarray(v["uinterp"][0], dtype=np.float64)
                bad = (TH < 0) | (TH > 1e4)
                TH[bad] = np.nan

                def surface(theta0):
                    """height (m) where theta first exceeds theta0 going up, per column"""
                    above = np.nan_to_num(TH, nan=-1) >= theta0
                    k = np.argmax(above, axis=0); k = np.clip(k, 1, len(zz) - 1)
                    jj, ii = np.indices(k.shape)
                    t1, t0_ = TH[k, jj, ii], TH[k - 1, jj, ii]
                    f = np.where(np.isfinite(t0_) & (t1 != t0_), (theta0 - t0_) / (t1 - t0_), 0.0)
                    h = zz[k - 1] + np.clip(f, 0, 1) * (zz[k] - zz[k - 1])
                    return h, k, np.clip(f, 0, 1)

                iso = []
                for h0 in ISO_Z:
                    h, _, _ = surface(th_up[h0]); iso.append(np.nan_to_num(h - h0, nan=0.0))
                out["iso_eta.npy"] = np.stack(iso).astype(np.float16).tobytes()
                me, mr = [], []
                for h0 in MOIST_Z:
                    h, k, f = surface(th_up[h0]); jj, ii = np.indices(k.shape)
                    lerp = lambda A: A[k - 1, jj, ii] * (1 - f) + A[k, jj, ii] * f
                    t_c = lerp(TH) * (lerp(P) / 1e5) ** 0.2857 - 273.15; qq = lerp(QV); pp = lerp(P)
                    e_ = qq * pp / (0.622 + qq); es_ = 611.2 * np.exp(17.67 * t_c / (t_c + 243.5))
                    me.append(np.nan_to_num(h - h0, nan=0.0)); mr.append(np.nan_to_num(np.clip(100 * e_ / es_, 0, 120), nan=0.0))
                out["moist_eta.npy"] = np.stack(me).astype(np.float16).tobytes()
                out["moist_rh.npy"] = np.stack(mr).astype(np.float16).tobytes()
                # along-wind speed about 300 m above the ground (the box is rotated: u is along the wind)
                kz = np.clip(np.searchsorted(zz, zs + 300.0), 0, len(zz) - 1); jj, ii = np.indices(kz.shape)
                ul = UL[kz, jj, ii]; ul[np.abs(ul) > 1e3] = 0
                out["ulow.npy"] = ul.astype(np.float16).tobytes()
                out["iso_meta.json"] = json.dumps({"iso_z": ISO_Z, "moist_z": MOIST_Z, "theta": th_up, "t": tsec, "tag": tag}).encode()
            d.close()
        except Exception as ex:
            out[f"error_{os.path.basename(fn)}.txt"] = repr(ex).encode()
    out["summary.json"] = json.dumps(summary).encode()
    out["seconds"] = str(time.time() - t0).encode()
    return out


@app.local_entrypoint()
def main(only: str = ""):
    import numpy as np
    from hermon_cm1 import terrain   # same terrain as the first run
    profile = json.loads((HERE / "case_profile.json").read_text())
    zs, s, c = terrain()
    tags = [t for t in SCENARIOS if not only or t in only.split(",")]
    print(f"CM1 3-D x{len(tags)} ({', '.join(tags)}): {NX}x{NY}x{NZ}, {TIMAX / 3600:.1f} h simulated each, in parallel")
    t0 = time.time()
    dem = zs.ravel().tolist()
    for tag, out in zip(tags, run.starmap([(scenario(profile, t), dem, t) for t in tags])):
        dst = HERE / "out_cm1_3d" / tag; dst.mkdir(parents=True, exist_ok=True)
        for k, v in out.items(): (dst / k).write_bytes(v)
        np.save(dst / "zs.npy", zs); (dst / "axes.json").write_text(json.dumps({"s_km": s, "c_km": c}))
        print(f"[{tag}] remote {float(out['seconds']):.0f} s, files {len(out)}, errors {[k for k in out if k.startswith('error')]}")
        print(out["summary.json"].decode()[-300:])
    print(f"all done in {time.time() - t0:.0f} s")
