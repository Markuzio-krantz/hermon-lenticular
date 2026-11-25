# A cloud that stands still, air that moves

**ענן שעומד במקום לעומת אוויר שזז: איך נוצרים ענני עדשה, שלב אחר שלב**

An interactive 3D reconstruction of the lenticular clouds photographed over Mount Hermon from the Hula Valley at sunset on 19 November 2026. A browser mountain-wave model computes where the air must condense, and the result is drawn on the real terrain of northern Israel, southern Lebanon and the Golan.

Live: **https://hermon-lenticular.pages.dev**

- Development: [Mark Burshtein (mudu.me)](https://mudu.me)
- Research: [Benny Drobot](https://www.linkedin.com/in/bennydrobot/)
- Photography: [Roy Kasher](https://www.instagram.com/roy.kasher/)

## What is in it

- **Story**: twelve steps, from the photo to the physics, each with its own view and layers on the map.
- **Lab**: change wind, stability, moisture and the model's assumptions, and watch the lenses grow, shrink, stack or vanish. Real days come from Open-Meteo.
- **Learn**: short topics (stability, standing waves, saturation, Froude number, Scorer parameter, Earth's shadow, ice, the mountain-cloud family, the model).
- **Focus on a lens**: inside the live model, the camera goes to the strongest lens the physics built, the map dims around it, and five stages show the air arriving, rising on the wave, condensing, the plates that remain, and the air passing through.

## Run it locally

No build step and no npm dependencies: the page loads Three.js from a CDN.

```sh
bash tools/build_site.sh            # assembles ./hermon-lenticular from site/ and web/
python -m http.server 5192 -d hermon-lenticular
```

Model tests (Node 18+):

```sh
node tools/test_agnesi.mjs          # analytic Witch-of-Agnesi check
node tools/test_engine.mjs          # every preset, timings and diagnostics
```

## Layout

| Path | What |
|------|------|
| `web/js/` | the model: sounding, mountain-wave solver, condensate, diagnostics, cloud ray marcher |
| `site/` | the public site: page, styles, story, lab, learn, lens focus, map stage |
| `tools/` | data preparation (heights, satellite, land cover), tests, site build |
| `blender/` | Blender scene builder for the still renders |
| `web/data/` | prepared terrain, imagery and land cover |

See [SPEC.md](SPEC.md) for the model, the rendering and the data.

## Data and licences

- Code: MIT (see [LICENSE](LICENSE)).
- Satellite imagery: Sentinel-2 cloudless 2016 by EOX IT Services, CC BY 4.0, contains modified Copernicus Sentinel data.
- Elevation: AWS Terrain Tiles (SRTM).
- Places, water, forests, orchards and built-up areas: © OpenStreetMap contributors, ODbL.
- Daily atmosphere: Open-Meteo.com, CC BY 4.0.
- Radiosonde: Bet Dagan 40179; surface stations of the Israel Meteorological Service.
- **The photographs are not included and are not covered by the licence.** The build expects `web/renders/photo_1.jpg`, `photo_2.jpg`, `lens_photo.jpg` and `preview.jpg`; without them the site works but the photo buttons show nothing.

