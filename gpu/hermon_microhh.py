"""Stage A: a 2-D, non-linear, moist large-eddy simulation of the 19.11.2026 flow over the Hermon,
with MicroHH (GPU) on Modal.

The slice runs along the wind at lens height (toward -11.7 deg, ESE) through the summit. Terrain comes
from the same SRTM map as the site; the atmosphere from the same sounding (gpu/case_profile.json,
written by gpu/dump_case.mjs). MicroHH is GPL-3.0; it is built inside the container and not
distributed with this project.

    python -m modal run gpu/hermon_microhh.py            # build (cached) + run, outputs to gpu/out/
"""
import json, math, pathlib, time
import modal

HERE = pathlib.Path(__file__).parent
app = modal.App("hermon-lenticular-microhh")

image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.11")
    .apt_install("git", "cmake", "g++", "gfortran", "libfftw3-dev", "libnetcdf-dev", "libboost-dev", "libhdf5-dev")
    .pip_install("numpy", "netCDF4")
    .run_commands(
        "git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/microhh/microhh.git /opt/microhh",
        "cd /opt/microhh/config && cp ubuntu_20lts.cmake default.cmake && sed -i 's/CMAKE_CUDA_ARCHITECTURES 86/CMAKE_CUDA_ARCHITECTURES 89/' default.cmake",
        "mkdir -p /opt/microhh/build && cd /opt/microhh/build && cmake .. -DUSECUDA=TRUE -DUSESP=TRUE && make -j8 2>&1 | tail -5",
        "ls -la /opt/microhh/build/microhh",
        "mkdir -p /opt/microhh/build_cpu && cd /opt/microhh/build_cpu && cmake .. -DUSESP=TRUE && make -j8 2>&1 | tail -3",
        "ls -la /opt/microhh/build_cpu/microhh",
    )
)

# ---------------- case
ITOT, KTOT, XSIZE, ZSIZE = 600, 160, 120000.0, 12000.0
ENDTIME, CROSS_EVERY = 7200, 300

INI = f"""
[master]
npx=1
npy=1

[grid]
itot={ITOT}
jtot=8
ktot={KTOT}
xsize={XSIZE}
ysize=1600.
zsize={ZSIZE}
swspatialorder=2

[advec]
swadvec=2
cflmax=1.2

[diff]
swdiff=smag2
dnmax=0.3

[thermo]
swbasestate=anelastic
swthermo=moist
pbot=101640.
swupdatebasestate=0

[force]
swlspres=0

[boundary]
mbcbot=freeslip
mbctop=freeslip
sbcbot=neumann
sbctop=neumann
sbot=0.
stop=0.
swboundary=default

[IB]
sw_immersed_boundary=dem
n_idw_points=5
sbcbot=neumann
sbot=0.

[fields]
visc=1.e-5
svisc=1.e-5
rndseed=2
rndamp[thl]=0.05
rndz=1500.
rndexp=2.

[buffer]
swbuffer=1
zstart=8500.
sigma=0.0022
beta=2.

[time]
endtime={ENDTIME}
dt=1.
dtmax=10.
savetime={ENDTIME}
outputiter=50
adaptivestep=true
starttime=0
rkorder=3

[stats]
swstats=0

[cross]
swcross=1
sampletime={CROSS_EVERY}
xz=100.
crosslist=ql,w,thl,u,qt
"""


@app.function(image=image, gpu="L4", timeout=60 * 60)
def run_case(profile: dict, dem: list) -> dict:
    return _run(profile, dem, "/opt/microhh/build/microhh")


@app.function(image=image, cpu=8, timeout=60 * 60)
def run_case_cpu(profile: dict, dem: list) -> dict:
    return _run(profile, dem, "/opt/microhh/build_cpu/microhh")


def _run(profile: dict, dem: list, binary: str) -> dict:
    import os, subprocess, numpy as np, netCDF4 as nc
    t0 = time.time()
    work = pathlib.Path("/tmp/hermon"); work.mkdir(parents=True, exist_ok=True); os.chdir(work)
    (work / "hermon.ini").write_text(INI)
    # model levels (cell centres) and the sounding interpolated onto them
    dz = ZSIZE / KTOT; z = (np.arange(KTOT) + 0.5) * dz
    pz = np.array(profile["z"]); ang = math.radians(-11.68)
    T = np.interp(z, pz, profile["T"]) + 273.15; RH = np.interp(z, pz, profile["RH"]) / 100
    p = np.interp(z, pz, profile["p"]) * 100; th = np.interp(z, pz, profile["theta"])
    U = np.interp(z, pz, profile["U"]); V = np.interp(z, pz, profile["V"])
    es = 611.2 * np.exp(17.67 * (T - 273.15) / (T - 29.65)); e = RH * es
    qt = 0.622 * e / (p - 0.378 * e)
    ua = U * math.cos(ang) + V * math.sin(ang); va = -U * math.sin(ang) + V * math.cos(ang)
    f = nc.Dataset("hermon_input.nc", "w"); f.createDimension("z", KTOT)
    f.createVariable("z", "f4", ("z",))[:] = z
    g = f.createGroup("init")
    for name, arr in (("thl", th), ("qt", qt), ("u", ua), ("v", va)): g.createVariable(name, "f4", ("z",))[:] = arr
    f.close()
    np.tile(np.asarray(dem, dtype=np.float32), 8).tofile("dem.0000000")  # same profile on each of the 8 rows
    subprocess.run(["cp", binary, "."], check=True)
    log = []
    for step in ("init", "run"):
        r = subprocess.run(["./microhh", step, "hermon"], capture_output=True, text=True)
        log.append(f"--- {step} rc={r.returncode}\n" + r.stdout[-6000:] + r.stderr[-4000:])
        print(log[-1][-3000:])
        if r.returncode: break
    out = {"log": "\n".join(log).encode(), "z": z.astype(np.float32).tobytes(), "qt0": qt.astype(np.float32).tobytes()}
    for fn in os.listdir("."):
        if ".xz." in fn: out[fn] = (work / fn).read_bytes()
    out["seconds"] = str(time.time() - t0).encode()
    return out


def terrain_slice():
    """Heights along the wind (toward -11.68 deg) through the Hermon summit, 200 m spacing, ends tapered
    to a common height so the cyclic domain closes."""
    import numpy as np
    from PIL import Image
    im = np.asarray(Image.open(HERE.parent / "web/data/wide_height_1024.png").convert("RGB")).astype(np.float64)
    H = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
    clat, clon = 33.25, 35.72
    sx, sn = (35.857 - clon) * 111.2 * math.cos(math.radians(clat)), (33.416 - clat) * 111.2  # summit, km
    a = math.radians(-11.68); dx = XSIZE / ITOT / 1000
    s = (np.arange(ITOT) + 0.5) * dx - 70.0           # 70 km upwind of the summit, 50 km downwind
    x, n = sx + np.cos(a) * s, sn + np.sin(a) * s
    fi, fj = (x + 64) / 128 * 1024 - 0.5, (64 - n) / 128 * 1024 - 0.5
    i0, j0 = np.clip(np.floor(fi).astype(int), 0, 1022), np.clip(np.floor(fj).astype(int), 0, 1022)
    ti, tj = np.clip(fi - i0, 0, 1), np.clip(fj - j0, 0, 1)
    h = (H[j0, i0] * (1 - ti) + H[j0, i0 + 1] * ti) * (1 - tj) + (H[j0 + 1, i0] * (1 - ti) + H[j0 + 1, i0 + 1] * ti) * tj
    h = np.maximum(h, 0)
    base, ramp = 350.0, int(12 / dx)
    w = np.ones(ITOT); w[:ramp] = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, ramp)); w[-ramp:] = w[:ramp][::-1]
    return (base + (h - base) * w).tolist(), s.tolist()


@app.local_entrypoint()
def main():
    profile = json.loads((HERE / "case_profile.json").read_text())
    dem, s = terrain_slice()
    print(f"terrain: max {max(dem):.0f} m, {ITOT} x {KTOT}, dx {XSIZE / ITOT:.0f} m, dz {ZSIZE / KTOT:.0f} m, {ENDTIME / 3600:.1f} h simulated")
    t0 = time.time()
    import os
    fn = run_case_cpu if os.environ.get("MHH_CPU") else run_case
    out = fn.remote(profile, dem)
    dst = HERE / "out"; dst.mkdir(exist_ok=True)
    for k, v in out.items(): (dst / k).write_bytes(v)
    (dst / "terrain.json").write_text(json.dumps({"s_km": s, "h_m": dem}))
    print(f"done in {time.time() - t0:.0f} s (remote {float(out['seconds']):.0f} s); {sum(1 for k in out if '.xz.' in k)} cross-section files in {dst}")
