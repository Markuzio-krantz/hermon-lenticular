"""Pack the CM1 cloud field for the web prototype.

Reads gpu/out_cm1/qc_layer_*.npy (cloud water 3-5.5 km on the wind-aligned CM1 grid) and writes
  web/data/cm1_weather.bin   uint8, [time][band][y][x]: column max of cloud water per band, sqrt-scaled
  web/data/cm1_meta.json     grid, rotation, bands, times, scale
usage: python tools/export_cm1.py
"""
import json, pathlib
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, DST = ROOT / "gpu/out_cm1", ROOT / "web/data"
NX, NY, DX = 240, 120, 0.4
BANDS = [(4.0, 4.5), (4.5, 5.15)]          # lower and upper plate, km (from the run's cloud profile)

z = np.frombuffer((SRC / "z.npy").read_bytes(), np.float32) / 1000
k0, k1 = np.searchsorted(z, 3.0), np.searchsorted(z, 5.5)
zl = z[k0:k1]
times = sorted(int(p.stem.split("_")[-1]) for p in SRC.glob("qc_layer_*.npy"))
cols = []
for t in times:
    q = np.frombuffer((SRC / f"qc_layer_{t:05d}.npy").read_bytes(), np.float16).astype(np.float32).reshape(k1 - k0, NY, NX)
    cols.append([q[(zl >= a) & (zl < b)].max(0) for a, b in BANDS])
cols = np.array(cols)                        # [t][band][y][x], kg/kg
qmax = float(cols.max())
packed = np.round(255 * np.sqrt(np.clip(cols / qmax, 0, 1))).astype(np.uint8)
DST.mkdir(parents=True, exist_ok=True)
(DST / "cm1_weather.bin").write_bytes(packed.tobytes())
axes = json.loads((SRC / "axes.json").read_text())
meta = {
    "nx": NX, "ny": NY, "dx_km": DX, "times_s": times, "bands_km": BANDS, "qmax_gkg": qmax * 1000,
    "s0_km": axes["s_km"][0], "c0_km": axes["c_km"][0],
    "summit": {"lat": 33.416, "lon": 35.857}, "wind_toward_deg": -11.68,
    "note": "CM1 (NCAR, MIT) 3-D run of the 19.11.2026 sounding over SRTM terrain; s along the wind from the summit, c across (left of the wind positive)",
}
(DST / "cm1_meta.json").write_text(json.dumps(meta))
print(f"{len(times)} times, bands {BANDS}, qmax {qmax * 1000:.2f} g/kg, {packed.nbytes / 1024:.0f} KB")
