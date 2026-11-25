"""Wide basemap (128 x 128 km around the physics centre 33.25N 35.72E):
  - wide_height_1024.png  Terrarium-encoded heights, 125 m spacing (centre 512 = physics grid)
  - wide_normal_2048.webp tangent-free world normals for relief shading (62.5 m)
  - wide_sat_4096.webp / wide_sat_2048.webp  Sentinel-2 cloudless 2016 mosaic (EOX, CC BY 4.0)
usage: python build_wide.py <dem11_dir> <s2_12_dir> <out_dir>
"""
import math, sys
import numpy as np
from PIL import Image, ImageEnhance

CLAT, CLON, HALF = 33.25, 35.72, 64000.0
R = 6371008.8

def grid(res):
    xs = (np.arange(res) + 0.5) / res * 2 * HALF - HALF
    ys = HALF - (np.arange(res) + 0.5) / res * 2 * HALF
    lon = CLON + np.degrees(xs / (R * math.cos(math.radians(CLAT))))
    lat = CLAT + np.degrees(ys / R)
    return np.meshgrid(lon, lat)

def mosaic(dirp, z, x0, x1, y0, y1, ext, loader):
    tiles = {}
    W = (x1 - x0 + 1) * 256; H = (y1 - y0 + 1) * 256
    first = loader(f"{dirp}/{x0}_{y0}.{ext}")
    out = np.zeros((H, W) + first.shape[2:], np.float32)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            out[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = loader(f"{dirp}/{x}_{y}.{ext}")
    return out

def sample(img, z, x0, y0, LON, LAT):
    n = 2 ** z
    px = ((LON + 180) / 360 * n - x0) * 256 - 0.5
    py = ((1 - np.arcsinh(np.tan(np.radians(LAT))) / np.pi) / 2 * n - y0) * 256 - 0.5
    assert px.min() >= 0 and py.min() >= 0 and px.max() < img.shape[1] - 1 and py.max() < img.shape[0] - 1
    xi = np.floor(px).astype(int); yi = np.floor(py).astype(int); fx = px - xi; fy = py - yi
    if img.ndim == 3: fx = fx[..., None]; fy = fy[..., None]
    return (img[yi, xi] * (1 - fx) * (1 - fy) + img[yi, xi + 1] * fx * (1 - fy)
            + img[yi + 1, xi] * (1 - fx) * fy + img[yi + 1, xi + 1] * fx * fy)

def dem_loader(p):
    a = np.asarray(Image.open(p).convert("RGB"), np.float32)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768

def despike(g, r=2, tol=150.0):
    pad = np.pad(g, r, mode="edge")
    st = [pad[r + dy:r + dy + g.shape[0], r + dx:r + dx + g.shape[1]] for dy in range(-r, r + 1) for dx in range(-r, r + 1)]
    med = np.median(np.stack(st), axis=0)
    return np.where(np.abs(g - med) > tol, med, g)

def main(dem_dir, s2_dir, out):
    dem = mosaic(dem_dir, 11, 1223, 1231, 819, 827, "png", dem_loader)
    for res in (1024, 2048):
        LON, LAT = grid(res)
        h = sample(dem, 11, 1223, 819, LON, LAT)
        sea = (h < 0) & (LON < 35.2)                     # Mediterranean -> sea level
        h = np.where(sea, 0, np.maximum(h, -215))        # Kinneret surface ~ -210 m
        h = despike(h)
        if res == 1024:
            v = np.round((h.astype(np.float64) + 32768) * 256).astype(np.int64)
            Image.fromarray(np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], -1).astype(np.uint8), "RGB").save(f"{out}/wide_height_1024.png", optimize=True)
            # physics grid: central 64 km at 125 m
            c = h[256:768, 256:768].astype(np.float32)
            c.tofile(f"{out}/height_512.f32")
            v = np.round((np.maximum(c, 0).astype(np.float64) + 32768) * 256).astype(np.int64)
            Image.fromarray(np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], -1).astype(np.uint8), "RGB").save(f"{out}/height_512.png", optimize=True)
            np.maximum(h, -215).astype(np.float32).tofile(f"{out}/wide_height_1024.f32")
            print("heights", h.min(), h.max())
        else:
            dx = 2 * HALF / res
            gy, gx = np.gradient(h * 2.0, dx)            # x2 = the viewer default vertical exaggeration
            nx, ny, nz = -gx, gy, np.ones_like(h)        # world: x east, y north, z up
            l = np.sqrt(nx * nx + ny * ny + nz * nz)
            rgb = np.stack([nx / l, nz / l, -ny / l], -1)  # three.js: x east, y up, z south
            Image.fromarray(((rgb * 0.5 + 0.5) * 255).astype(np.uint8), "RGB").save(f"{out}/wide_normal_2048.webp", quality=90)
    sat = mosaic(s2_dir, 12, 2446, 2462, 1638, 1654, "jpg", lambda p: np.asarray(Image.open(p).convert("RGB"), np.float32))
    for res in (4096, 2048):
        LON, LAT = grid(res)
        img = Image.fromarray(np.clip(sample(sat, 12, 2446, 1638, LON, LAT), 0, 255).astype(np.uint8))
        img = ImageEnhance.Contrast(img).enhance(1.06)
        img.save(f"{out}/wide_sat_{res}.webp", quality=80, method=6)
        if res == 2048: img.resize((1024, 1024), Image.LANCZOS).save(f"{out}/wide_sat_preview.jpg", quality=85)
    print("done")

if __name__ == "__main__":
    main(*sys.argv[1:4])
