"""Stage B: a 3-D, non-linear, moist large-eddy simulation of the 19.11.2026 flow over the Hermon
with MicroHH (CPU build) on Modal.

The box is aligned with the wind at lens height (toward -11.68 deg, ESE): 96 km along the wind
(60 km upwind of the summit, 36 km downwind) and 48 km across, 400 m x 400 m x 100 m cells.
In 3-D the low air can go round the mountain instead of being forced over it, which the 2-D slice
of stage A could not do.

    python -m modal run gpu/hermon_microhh3d.py           # outputs to gpu/out3d/
"""
import json, math, pathlib, time
import modal

HERE = pathlib.Path(__file__).parent
app = modal.App("hermon-lenticular-microhh-3d")

image = (  # same definition as stage A, so the built image is reused from cache
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

ITOT, JTOT, KTOT = 240, 120, 160
XSIZE, YSIZE, ZSIZE = 96000.0, 48000.0, 12000.0
UPWIND_KM = 60.0
ENDTIME, CROSS_EVERY = 7200, 600
ANG = -11.68

INI = f"""
[master]
npx=1
npy=1

[grid]
itot={ITOT}
jtot={JTOT}
ktot={KTOT}
xsize={XSIZE}
ysize={YSIZE}
zsize={ZSIZE}
swspatialorder=2

[advec]
swadvec=2
cflmax=0.8

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
dtmax=6.
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
xz={YSIZE / 2}
xy=3900,4300
crosslist=ql,w,thl,u,v

[dump]
swdump=1
sampletime={ENDTIME // 2}
dumplist=ql
"""


@app.function(image=image, cpu=4, memory=8192, timeout=3 * 60 * 60)
def run3d(profile: dict, dem: list, diag: bool = False) -> dict:
    import os, subprocess, numpy as np, netCDF4 as nc
    t0 = time.time()
    work = pathlib.Path("/tmp/hermon3d"); work.mkdir(parents=True, exist_ok=True); os.chdir(work)
    ini = INI
    if diag:  # short run, a line every step: find when and where it breaks
        ini = ini.replace(f"endtime={ENDTIME}", "endtime=300").replace("outputiter=50", "outputiter=1").replace("swcross=1", "swcross=0").replace("swdump=1", "swdump=0")
    (work / "hermon.ini").write_text(ini)
    dz = ZSIZE / KTOT; z = (np.arange(KTOT) + 0.5) * dz
    pz = np.array(profile["z"]); ang = math.radians(ANG)
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
    np.asarray(dem, dtype=np.float32).tofile("dem.0000000")
    subprocess.run(["cp", "/opt/microhh/build_cpu/microhh", "."], check=True)
    log = []
    for step in ("init", "run"):
        r = subprocess.run(["./microhh", step, "hermon"], capture_output=True, text=True)
        lines = [l for l in r.stdout.splitlines() if not l.startswith(("Saving", "Loading", "["))]
        log.append(f"--- {step} rc={r.returncode} t={time.time() - t0:.0f}s\n" + "\n".join(lines[:80] + ["..."] + lines[-40:]) + r.stderr[-3000:])
        print(log[-1][-2500:])
        if r.returncode: break
    out = {"log": "\n".join(log).encode(), "z": z.astype(np.float32).tobytes()}
    for fn in os.listdir("."):
        if ".xz." in fn or ".xy." in fn or fn.startswith("ql.0") or fn.endswith(".out"): out[fn] = (work / fn).read_bytes()
    out["seconds"] = str(time.time() - t0).encode()
    return out


def terrain3d():
    """Heights on the wind-aligned grid (x along the wind, y across), from the site's 128 km map,
    edges tapered to a common height so the cyclic box closes."""
    import numpy as np
    from PIL import Image
    im = np.asarray(Image.open(HERE.parent / "web/data/wide_height_1024.png").convert("RGB")).astype(np.float64)
    H = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
    clat, clon = 33.25, 35.72
    sx, sn = (35.857 - clon) * 111.2 * math.cos(math.radians(clat)), (33.416 - clat) * 111.2
    a = math.radians(ANG); dx, dy = XSIZE / ITOT / 1000, YSIZE / JTOT / 1000
    s = (np.arange(ITOT) + 0.5) * dx - UPWIND_KM
    c = (np.arange(JTOT) + 0.5) * dy - YSIZE / 2000
    S, C = np.meshgrid(s, c)                                    # rows = y (across), cols = x (along)
    X = sx + np.cos(a) * S - np.sin(a) * C
    N = sn + np.sin(a) * S + np.cos(a) * C
    fi, fj = (X + 64) / 128 * 1024 - 0.5, (64 - N) / 128 * 1024 - 0.5
    i0, j0 = np.clip(np.floor(fi).astype(int), 0, 1022), np.clip(np.floor(fj).astype(int), 0, 1022)
    ti, tj = np.clip(fi - i0, 0, 1), np.clip(fj - j0, 0, 1)
    h = (H[j0, i0] * (1 - ti) + H[j0, i0 + 1] * ti) * (1 - tj) + (H[j0 + 1, i0] * (1 - ti) + H[j0 + 1, i0 + 1] * ti) * tj
    h = np.maximum(h, 0)
    # light smoothing (~1 km): the 400 m grid cannot carry the Hermon's steepest slopes stably
    for _ in range(2):
        h = (np.roll(h, 1, 0) + np.roll(h, -1, 0) + np.roll(h, 1, 1) + np.roll(h, -1, 1) + 4 * h) / 8
    base = 350.0
    def taper(n, ramp):
        w = np.ones(n); r = np.minimum(ramp, n // 3); w[:r] = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, r)); w[-r:] = w[:r][::-1]; return w
    w = np.outer(taper(JTOT, int(8 / dy)), taper(ITOT, int(10 / dx)))
    dem = base + (h - base) * w
    return dem.astype("float32"), s.tolist(), c.tolist()


@app.local_entrypoint()
def main():
    import numpy as np
    profile = json.loads((HERE / "case_profile.json").read_text())
    dem, s, c = terrain3d()
    print(f"3-D: {ITOT}x{JTOT}x{KTOT} = {ITOT * JTOT * KTOT / 1e6:.2f} M cells, terrain max {dem.max():.0f} m, {ENDTIME / 3600:.1f} h simulated")
    t0 = time.time()
    import os
    v = os.environ.get("MHH_VARIANT", "")
    if v == "flat": dem = np.full_like(dem, 350.0) + 0.001 * (dem - 350.0)
    if v == "half": dem = 350.0 + 0.5 * (dem - 350.0)
    out = run3d.remote(profile, dem.ravel().tolist(), bool(os.environ.get("MHH_DIAG")))
    dst = HERE / "out3d"; dst.mkdir(exist_ok=True)
    for k, v in out.items(): (dst / k).write_bytes(v)
    np.save(dst / "dem.npy", dem); (dst / "axes.json").write_text(json.dumps({"s_km": s, "c_km": c}))
    print(f"done in {time.time() - t0:.0f} s (remote {float(out['seconds']):.0f} s); files: {len(out)}")
