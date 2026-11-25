"""Land cover for the wide map, rasterised from OpenStreetMap (ODbL) on the same 128 x 128 km grid.
  wide_landcover_4096.webp  RGBA masks, row 0 = north:
    R water (lakes, ponds, fish ponds, wetlands at half, rivers and streams as lines)
    G forest and woodland
    B built-up (residential, industrial, commercial)
    A orchards, vineyards and plantations
usage: python build_landcover.py <overpass.json> <out_dir>
The json comes from an Overpass "out geom" query over the map's bounding box (see the docstring
in build_wide.py for the centre and extent).
"""
import json, math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CLAT, CLON, HALF = 33.25, 35.72, 64000.0
R = 6371008.8
N = 4096
KX = R * math.cos(math.radians(CLAT)) * math.pi / 180
KY = R * math.pi / 180


def px(lon, lat):
    x = (lon - CLON) * KX
    y = (lat - CLAT) * KY
    return ((x + HALF) / (2 * HALF) * N, (HALF - y) / (2 * HALF) * N)


def ring(geom):
    return [px(p["lon"], p["lat"]) for p in geom if p]


def classify(tags):
    lu, nat, ww = tags.get("landuse"), tags.get("natural"), tags.get("waterway")
    if nat == "water" or ww == "riverbank" or lu == "aquaculture":
        return "water", 255
    if nat == "wetland":
        return "water", 120
    if lu == "forest" or nat == "wood":
        return "forest", 255
    if lu in ("orchard", "vineyard", "plantation"):
        return "orchard", 255
    if lu in ("residential", "industrial", "commercial", "retail"):
        return "urban", 255
    return None, 0


def main(src, out):
    data = json.load(open(src, encoding="utf8"))
    layers = {k: Image.new("L", (N, N), 0) for k in ("water", "forest", "urban", "orchard")}
    draws = {k: ImageDraw.Draw(v) for k, v in layers.items()}
    counts = {}
    for el in data["elements"]:
        tags = el.get("tags", {})
        ww = tags.get("waterway")
        if el["type"] == "way" and ww in ("river", "stream", "canal"):
            pts = ring(el.get("geometry", []))
            if len(pts) > 1:
                draws["water"].line(pts, fill=255, width={"river": 3, "canal": 2}.get(ww, 1))
                counts["line:" + ww] = counts.get("line:" + ww, 0) + 1
            continue
        kind, val = classify(tags)
        if not kind:
            continue
        d = draws[kind]
        if el["type"] == "way":
            pts = ring(el.get("geometry", []))
            if len(pts) > 2:
                d.polygon(pts, fill=val)
        elif el["type"] == "relation":
            for m in el.get("members", []):
                if m.get("type") == "way" and m.get("role") == "outer" and m.get("geometry"):
                    pts = ring(m["geometry"])
                    if len(pts) > 2:
                        d.polygon(pts, fill=val)
            for m in el.get("members", []):
                if m.get("type") == "way" and m.get("role") == "inner" and m.get("geometry"):
                    pts = ring(m["geometry"])
                    if len(pts) > 2:
                        d.polygon(pts, fill=0)
        counts[kind] = counts.get(kind, 0) + 1
    # soften the edges a touch so the shader can feather them
    chans = [layers[k].filter(ImageFilter.GaussianBlur(0.7)) for k in ("water", "forest", "urban", "orchard")]
    img = Image.merge("RGBA", chans)
    img.save(f"{out}/wide_landcover_4096.webp", lossless=True, exact=True, quality=100, method=6)
    cover = {k: round(float(np.asarray(layers[k]).astype(bool).mean()) * 100, 2) for k in layers}
    print("features", counts)
    print("coverage %", cover)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
