"""Sharp core texture: Sentinel-2 cloudless (EOX, CC BY 4.0) at zoom 13 over the central 64 km
(the physics box), 4096 px = 15.6 m per pixel. usage: python build_core.py <s2_13_dir> <out_dir>"""
import sys, math
import numpy as np
from PIL import Image, ImageEnhance
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_wide import mosaic, sample, CLAT, CLON, R

def grid(res, half=32000.0):
    xs = (np.arange(res) + 0.5) / res * 2 * half - half
    ys = half - (np.arange(res) + 0.5) / res * 2 * half
    lon = CLON + np.degrees(xs / (R * math.cos(math.radians(CLAT))))
    lat = CLAT + np.degrees(ys / R)
    return np.meshgrid(lon, lat)

s2, out = sys.argv[1], sys.argv[2]
sat = mosaic(s2, 13, 4900, 4916, 3285, 3300, "jpg", lambda p: np.asarray(Image.open(p).convert("RGB"), np.float32))
LON, LAT = grid(4096)
img = Image.fromarray(np.clip(sample(sat, 13, 4900, 3285, LON, LAT), 0, 255).astype(np.uint8))
ImageEnhance.Contrast(img).enhance(1.06).save(f"{out}/core_sat_4096.webp", quality=80, method=6)
print("ok")
