"""Pack the CM1 3-D runs (gpu/out_cm1_3d/<scenario>/) for the website.

Per scenario <tag> (base keeps the historical file names cm1_meta.json, cm1_weather.bin, cm1_xz.bin):
  cm1[_<tag>]_weather.bin  uint8 [time][band][NY][NX]  column max of cloud water per band, sqrt-scaled by the BASE peak
  cm1[_<tag>]_xz.bin       [time][w|qc][z][s]          the cut through the summit (w int8, -128 under ground; qc uint8)
  cm1[_<tag>]_3d.bin       int16 iso_eta[6][NY][NX] | int16 moist_eta[2][NY][NX] | uint8 moist_rh*2 [2][NY][NX] | int8 ulow*4 [NY][NX]
  cm1[_<tag>]_meta.json    grid, rotation, bands, times, scales, file names
Base keeps every 20-minute frame; scenarios keep only the last (the site shows the end of the run).
usage: python tools/export_cm1_3d.py
"""
import json, pathlib
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, DST = ROOT / "gpu/out_cm1_3d", ROOT / "web/data"
NX, NY, DX = 240, 120, 0.4
BANDS = [(4.0, 4.5), (4.5, 5.15)]
TAGS = ["base", "wind15", "jet", "dry", "moist"]
NAMES = {"base": "כפי שנמדד ב-19.11", "wind15": "רוח חזקה פי 1.5", "jet": "זרם סילון מעל 5 ק\"מ", "dry": "יבש יותר (לחות -8%)", "moist": "לח יותר (לחות +8%)"}


def load(tag):
    d = SRC / tag
    z = np.frombuffer((d / "z.npy").read_bytes(), np.float32) / 1000
    times = sorted(int(p.stem.split("_")[-1]) for p in d.glob("qc_layer_*.npy"))
    k0, k1 = np.searchsorted(z, 3.0), np.searchsorted(z, 5.5)
    zl = z[k0:k1]
    cols, ws, qs = [], [], []
    nz = int(np.searchsorted(z, 7.5))
    for t in times:
        q = np.frombuffer((d / f"qc_layer_{t:05d}.npy").read_bytes(), np.float16).astype(np.float32).reshape(k1 - k0, NY, NX)
        cols.append([q[(zl >= a) & (zl < b)].max(0) for a, b in BANDS])
        w = np.frombuffer((d / f"w_xz_{t:05d}.npy").read_bytes(), np.float32).reshape(-1, NX)[:nz]
        qq = np.frombuffer((d / f"qc_xz_{t:05d}.npy").read_bytes(), np.float32).reshape(-1, NX)[:nz]
        ws.append(w); qs.append(np.clip(qq, 0, None))
    f16 = lambda n, shape: np.frombuffer((d / n).read_bytes(), np.float16).astype(np.float32).reshape(shape)
    has3 = (d / "iso_eta.npy").exists()
    d3 = None if not has3 else {"iso": f16("iso_eta.npy", (6, NY, NX)), "me": f16("moist_eta.npy", (2, NY, NX)), "mr": f16("moist_rh.npy", (2, NY, NX)), "ul": f16("ulow.npy", (NY, NX))}
    return dict(z=z, times=times, cols=np.array(cols), ws=ws, qs=qs, nz=nz, d3=d3, iso=json.loads((d / "iso_meta.json").read_text()) if has3 else None,
                axes=json.loads((d / "axes.json").read_text()), summary=json.loads((d / "summary.json").read_text()))


def main():
    runs = {t: load(t) for t in TAGS if (SRC / t / "z.npy").exists()}
    assert "base" in runs, "the base run is missing"
    B = runs["base"]
    qmax = float(B["cols"].max()); xzq = float(max(q.max() for q in B["qs"])) or 1.0
    XZ_WMAX = 8.0
    index = []
    for tag, R in runs.items():
        pre = "cm1" if tag == "base" else f"cm1_{tag}"
        keep = range(len(R["times"])) if tag == "base" else [len(R["times"]) - 1]
        times = [R["times"][i] for i in keep]
        cols = R["cols"][list(keep)]
        (DST / f"{pre}_weather.bin").write_bytes(np.round(255 * np.sqrt(np.clip(cols / qmax, 0, 1))).astype(np.uint8).tobytes())
        xz = []
        for i in keep:
            w = R["ws"][i]; q = R["qs"][i]
            wi = np.where(w < -1e5, -128, np.clip(np.round(w / XZ_WMAX * 127), -127, 127)).astype(np.int8)
            xz.append(np.stack([wi.view(np.uint8), np.round(255 * np.sqrt(np.clip(q / xzq, 0, 1))).astype(np.uint8)]))
        (DST / f"{pre}_xz.bin").write_bytes(np.stack(xz).tobytes())
        D = R["d3"]
        if D is not None:
          blob = (np.clip(np.round(D["iso"]), -32000, 32000).astype(np.int16).tobytes() + np.clip(np.round(D["me"]), -32000, 32000).astype(np.int16).tobytes()
                + np.clip(np.round(D["mr"] * 2), 0, 255).astype(np.uint8).tobytes() + np.clip(np.round(D["ul"] * 4), -127, 127).astype(np.int8).tobytes())
          (DST / f"{pre}_3d.bin").write_bytes(blob)
        meta = {
            "tag": tag, "name": NAMES[tag], "nx": NX, "ny": NY, "dx_km": DX, "times_s": times, "bands_km": BANDS, "qmax_gkg": qmax * 1000,
            "s0_km": R["axes"]["s_km"][0], "c0_km": R["axes"]["c_km"][0],
            "summit": {"lat": 33.416, "lon": 35.857}, "wind_toward_deg": -11.68,
            "xz": {"nz": R["nz"], "z0_km": float(R["z"][0]), "dz_km": float(R["z"][1] - R["z"][0]), "wmax": XZ_WMAX, "qmax_gkg": xzq * 1000, "c_km": 0},
            "d3": {"iso_z": R["iso"]["iso_z"], "moist_z": R["iso"]["moist_z"], "theta": R["iso"]["theta"]} if D is not None else None,
            "files": {"weather": f"{pre}_weather.bin", "xz": f"{pre}_xz.bin", **({"d3": f"{pre}_3d.bin"} if D is not None else {})},
            "note": "CM1 (NCAR, MIT) 3-D run of the 19.11.2026 sounding over SRTM terrain; s along the wind from the summit, c across",
        }
        (DST / f"{pre}_meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        last = R["summary"][-1] if R["summary"] else {}
        rot = int((D["ul"] < 0).sum()) if D is not None else None
        index.append({"tag": tag, "name": NAMES[tag], "meta": f"{pre}_meta.json"})
        print(f"{tag:7s} qcmax {last.get('qcmax', 0) * 1000:.3f} g/kg, cloud cells {last.get('cells')}, 3d {'yes' if D is not None else 'no'}, reversed-flow cells {rot}")
    (DST / "cm1_index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
