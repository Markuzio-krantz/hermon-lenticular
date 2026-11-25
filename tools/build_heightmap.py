"""Mosaic Terrarium elevation tiles (AWS Open Data, SRTM-based) and resample to a
local metric grid centred on the Hula Valley / Hermon. x = east, y = north.

usage: python -I build_heightmap.py <tiles_dir> <out_dir>
"""
import math, sys, json
import numpy as np
from PIL import Image

Z = 11
X0, X1, Y0, Y1 = 1225, 1229, 821, 825
CLAT, CLON = 33.25, 35.72          # domain centre
EXT = 64000.0                      # metres, square domain
R = 6371008.8

def tile_lonlat(x, y):
    n = 2 ** Z
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon, lat

def despike(g, r=3, tol=120.0):
    """SRTM voids show up as narrow spikes/pits: replace pixels far from the local median."""
    pad = np.pad(g, r, mode="edge")
    stack = [pad[r + dy:r + dy + g.shape[0], r + dx:r + dx + g.shape[1]] for dy in range(-r, r + 1) for dx in range(-r, r + 1)]
    med = np.median(np.stack(stack), axis=0)
    bad = np.abs(g - med) > tol
    print("despiked", int(bad.sum()), "px")
    return np.where(bad, med, g)

def main(tiles, out):
    W = (X1 - X0 + 1) * 256; H = (Y1 - Y0 + 1) * 256
    mos = np.zeros((H, W), np.float32)
    for x in range(X0, X1 + 1):
        for y in range(Y0, Y1 + 1):
            a = np.asarray(Image.open(f"{tiles}/{x}_{y}.png").convert("RGB"), np.float32)
            e = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
            mos[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = e
    n = 2 ** Z
    def lonlat_to_px(lon, lat):
        px = ((lon + 180) / 360 * n - X0) * 256
        py = ((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n - Y0) * 256
        return px, py
    for res in (1024, 512):
        g = np.zeros((res, res), np.float32)
        xs = (np.arange(res) + 0.5) / res * EXT - EXT / 2        # east metres
        ys = EXT / 2 - (np.arange(res) + 0.5) / res * EXT        # north metres (row 0 = north)
        lon = CLON + np.degrees(xs / (R * math.cos(math.radians(CLAT))))
        lat = CLAT + np.degrees(ys / R)
        LON, LAT = np.meshgrid(lon, lat)
        px = ((LON + 180) / 360 * n - X0) * 256 - 0.5
        py = ((1 - np.arcsinh(np.tan(np.radians(LAT))) / np.pi) / 2 * n - Y0) * 256 - 0.5
        assert px.min() >= 0 and py.min() >= 0 and px.max() < W - 1 and py.max() < H - 1, "tiles do not cover domain"
        x0 = np.floor(px).astype(int); y0 = np.floor(py).astype(int)
        fx = px - x0; fy = py - y0
        g = (mos[y0, x0] * (1 - fx) * (1 - fy) + mos[y0, x0 + 1] * fx * (1 - fy)
             + mos[y0 + 1, x0] * (1 - fx) * fy + mos[y0 + 1, x0 + 1] * fx * fy)
        g = despike(np.maximum(g, 0)).astype(np.float32)
        g.tofile(f"{out}/height_{res}.f32")
        if res == 512:  # the web page reads a Terrarium-encoded PNG (artifacts do not serve raw binaries)
            v = np.round((g.astype(np.float64) + 32768) * 256).astype(np.int64)
            Image.fromarray(np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], -1).astype(np.uint8), "RGB").save(f"{out}/height_512.png", optimize=True)
        print(res, "min", g.min(), "max", g.max())
    # landmarks -> local metres
    marks = {
        "hermon": (33.4163, 35.8572), "harDov": (33.29, 35.75), "hulaValley": (33.10, 35.61),
        "kiryatShmona": (33.207, 35.571), "ramim": (33.13, 35.52), "hNaftali": (33.08, 35.535),
        "golan": (33.05, 35.78), "kfarBlum": (33.172, 35.611), "dafna": (33.229, 35.633),
        "kfarGiladi": (33.243, 35.575), "merom": (33.135, 35.775), "harKnaan": (32.966, 35.508),
        "agamonHula": (33.105, 35.605),
    }
    lm = {}
    for k, (la, lo) in marks.items():
        xe = math.radians(lo - CLON) * R * math.cos(math.radians(CLAT))
        yn = math.radians(la - CLAT) * R
        lm[k] = [round(xe), round(yn)]
    meta = {"extent_m": EXT, "centre": [CLAT, CLON], "landmarks": lm,
            "source": "AWS Open Data Terrain Tiles (Terrarium, SRTM-based), zoom 11"}
    json.dump(meta, open(f"{out}/terrain_meta.json", "w"), indent=1)
    print(json.dumps(lm))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
