"""Stage B (take 2): 3-D simulation of the 19.11.2026 flow over the Hermon with CM1 (George Bryan,
NCAR, MIT licence) on Modal CPUs.

CM1 uses terrain-following coordinates (the grid bends over the mountain) instead of carving the
mountain out of a straight grid, which is what failed with MicroHH's immersed boundary in 3-D.
Box: 96 km along the wind (60 km upwind of the summit), 48 km across, 400 m cells, 150 m levels to
15 km; open boundaries along the wind, periodic across; Kessler warm-rain microphysics.

    python -m modal run gpu/hermon_cm1.py            # outputs to gpu/out_cm1/
"""
import json, math, pathlib, re, time
import modal

HERE = pathlib.Path(__file__).parent
app = modal.App("hermon-lenticular-cm1")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "make", "gfortran", "libnetcdf-dev", "libnetcdff-dev", "netcdf-bin")
    .pip_install("numpy", "netCDF4")
    .run_commands(
        "git clone --depth 1 https://github.com/NCAR/CM1.git /opt/cm1",
        # Debian links with --as-needed: keep the netCDF libraries, Fortran one first
        "cd /opt/cm1/src && sed -i 's/-lnetcdf -lnetcdff/-Wl,--no-as-needed -lnetcdff -lnetcdf/' Makefile && make FC=gfortran USE_OPENMP=true USE_NETCDF=true NETCDFBASE=/usr -j8 2>&1 | tail -4",
        "ls -la /opt/cm1/run/cm1.exe",
    )
)

NX, NY, NZ = 240, 120, 100
DX, DZ = 400.0, 150.0
TIMAX, TAPFRQ = 7200.0, 1200.0
UPWIND_KM, ANG = 60.0, -11.68

SET = {  # namelist values replaced in CM1's default namelist.input
    "nx": NX, "ny": NY, "nz": NZ, "terrain_flag": ".true.",
    "dx": f"{DX:.1f}", "dy": f"{DX:.1f}", "dz": f"{DZ:.1f}", "dtl": "2.0", "timax": f"{TIMAX:.1f}", "tapfrq": f"{TAPFRQ:.1f}",
    "adapt_dt": 1, "ptype": 1, "isnd": 7, "iwnd": 0, "itern": 4, "wbc": 2, "ebc": 2, "sbc": 1, "nbc": 1,
    "imove": 0, "irdamp": 1, "hrdamp": 0, "icor": 0, "zd": "11000.0",
    "output_format": 2, "output_filetype": 2, "output_interp": 1, "output_zs": 1, "output_rain": 0,
    "output_qv": 1, "output_q": 1, "output_u": 1, "output_w": 1, "output_th": 1,
}


@app.function(image=image, cpu=8, memory=16384, timeout=3 * 60 * 60)
def run(profile: dict, dem: list) -> dict:
    import os, subprocess, glob, numpy as np, netCDF4 as nc
    t0 = time.time()
    work = pathlib.Path("/tmp/cm1"); work.mkdir(parents=True, exist_ok=True); os.chdir(work)
    subprocess.run("cp /opt/cm1/run/cm1.exe /opt/cm1/run/LANDUSE.TBL . && cp -r /opt/cm1/run/RRTMG_* . ", shell=True, check=True)
    nl = open("/opt/cm1/run/namelist.input").read()
    for k, v in SET.items():
        nl, n = re.subn(rf"(\n\s*{k}\s*=\s*)[^,\n]+,", rf"\g<1>{v},", nl)
        if n == 0: print("namelist key not found:", k)
    open("namelist.input", "w").write(nl)
    # sounding: surface p (mb), theta (K), qv (g/kg); then z (m), theta, qv (g/kg), u, v (wind rotated into the box)
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
    env = dict(os.environ, OMP_NUM_THREADS="8", OMP_STACKSIZE="512M")
    r = subprocess.run(["./cm1.exe"], capture_output=True, text=True, env=env)
    lines = r.stdout.splitlines()
    log = f"rc={r.returncode} t={time.time() - t0:.0f}s\n" + "\n".join(lines[:60] + ["..."] + lines[-60:]) + "\n" + r.stderr[-3000:]
    print(log[-2500:])
    out = {"log": log.encode()}
    # condense the output in the container: lens-height maps, a slice through the summit, the cloud layer
    files = sorted(glob.glob("cm1out_*.nc"))
    summary = []
    for fn in files:
      try:
          d = nc.Dataset(fn); zv = d.variables["zh"][:] if "zh" in d.variables else None
          qc = d.variables["qc"][0] if "qc" in d.variables else None
          w = d.variables["winterp"][0] if "winterp" in d.variables else (d.variables["w"][0] if "w" in d.variables else None)
          tsec = float(d.variables["time"][0]) if "time" in d.variables else -1
          zz = np.asarray(zv, dtype=float).ravel() if zv is not None else (np.arange(NZ) + 0.5) * DZ
          if zz.max() < 100: zz = zz * 1000.0   # CM1 writes heights in km
          q = np.asarray(qc, dtype=np.float32) if qc is not None else None
          if q is not None:
              k0, k1 = np.searchsorted(zz, 3000), np.searchsorted(zz, 5500)
              out[f"qc_layer_{int(tsec):05d}.npy"] = np.ascontiguousarray(q[k0:k1]).astype(np.float16).tobytes()
              out[f"qc_xz_{int(tsec):05d}.npy"] = np.ascontiguousarray(q[:, q.shape[1] // 2, :]).astype(np.float32).tobytes()
              hi = q[k0:k1]; m = hi > 1e-5
              summary.append({"t": tsec, "qcmax": float(hi.max()), "cells": int(m.sum()), "zlayer": [float(zz[k0]), float(zz[k1 - 1])]})
          if w is not None:
              out[f"w_xz_{int(tsec):05d}.npy"] = np.ascontiguousarray(np.asarray(w, dtype=np.float32)[:, w.shape[1] // 2, :]).tobytes()
          if fn == files[0]:
              out["z.npy"] = zz.astype(np.float32).tobytes()
              out["vars.txt"] = "\n".join(f"{k} {d.variables[k].dimensions}" for k in d.variables).encode()
          d.close()
      except Exception as ex:
        out[f"error_{os.path.basename(fn)}.txt"] = repr(ex).encode()
    out["summary.json"] = json.dumps(summary).encode()
    out["seconds"] = str(time.time() - t0).encode()
    return out


def terrain():
    import numpy as np
    from PIL import Image
    im = np.asarray(Image.open(HERE.parent / "web/data/wide_height_1024.png").convert("RGB")).astype(np.float64)
    H = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
    clat, clon = 33.25, 35.72
    sx, sn = (35.857 - clon) * 111.2 * math.cos(math.radians(clat)), (33.416 - clat) * 111.2
    a = math.radians(ANG); dk = DX / 1000
    s = (np.arange(NX) + 0.5) * dk - UPWIND_KM
    c = (np.arange(NY) + 0.5) * dk - NY * dk / 2
    S, C = np.meshgrid(s, c)
    X = sx + np.cos(a) * S - np.sin(a) * C
    N = sn + np.sin(a) * S + np.cos(a) * C
    fi, fj = (X + 64) / 128 * 1024 - 0.5, (64 - N) / 128 * 1024 - 0.5
    i0, j0 = np.clip(np.floor(fi).astype(int), 0, 1022), np.clip(np.floor(fj).astype(int), 0, 1022)
    ti, tj = np.clip(fi - i0, 0, 1), np.clip(fj - j0, 0, 1)
    h = (H[j0, i0] * (1 - ti) + H[j0, i0 + 1] * ti) * (1 - tj) + (H[j0 + 1, i0] * (1 - ti) + H[j0 + 1, i0 + 1] * ti) * tj
    h = np.maximum(h, 0)
    for _ in range(2):  # light smoothing for the 400 m grid
        h = (np.roll(h, 1, 0) + np.roll(h, -1, 0) + np.roll(h, 1, 1) + np.roll(h, -1, 1) + 4 * h) / 8
    def taper(n, ramp):
        w = np.ones(n); w[:ramp] = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, ramp)); w[-ramp:] = w[:ramp][::-1]; return w
    w = np.outer(taper(NY, int(8 / dk)), taper(NX, int(10 / dk)))
    zs = h * w   # CM1 terrain is height above the model bottom: flat (0) near the open boundaries
    return zs.astype("float32"), s.tolist(), c.tolist()


@app.local_entrypoint()
def main():
    import numpy as np
    profile = json.loads((HERE / "case_profile.json").read_text())
    zs, s, c = terrain()
    print(f"CM1 3-D: {NX}x{NY}x{NZ} = {NX * NY * NZ / 1e6:.2f} M points, terrain max {zs.max():.0f} m, {TIMAX / 3600:.1f} h simulated")
    t0 = time.time()
    out = run.remote(profile, zs.ravel().tolist())
    dst = HERE / "out_cm1"; dst.mkdir(exist_ok=True)
    for k, v in out.items(): (dst / k).write_bytes(v)
    np.save(dst / "zs.npy", zs); (dst / "axes.json").write_text(json.dumps({"s_km": s, "c_km": c}))
    print(f"done in {time.time() - t0:.0f} s (remote {float(out['seconds']):.0f} s)")
    print(out["summary.json"].decode()[:2000])
