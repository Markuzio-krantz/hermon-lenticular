# Specification

## 1. Goal

Show, from real data, why smooth lens-shaped clouds stood over Mount Hermon at sunset on 19 November 2026 while the wind blew through them, and let a visitor change the atmosphere and see what changes.

Audience: curious general public in Hebrew, first; enough depth for students of meteorology and glider pilots.

## 2. Atmosphere

- **Sounding**: Bet Dagan 40179, 00Z, 132 levels (T, RH, p, z, wind). Winds are replaced by a reconstruction for 12Z with the Har Kna'an low-level anchor (950 hPa, 265°, 17 kt), because the night-time coastal winds do not represent the afternoon flow over the Galilee.
- **Derived**: θ, dew point, Brunt–Väisälä frequency N² (smoothed), parcel lift table (dry adiabat to saturation, then moist adiabat with Bolton's e_s).
- **Lab parameters**: wind scale, direction offset or uniform direction, jet-stream boost, stability scale, RH offset, moisture at 3.83 km (Gaussian, 230 m), second moist layer at 4.32 km, vertical shift of the moist layers, blocking factor, damping length.

## 3. Mountain-wave model

- Linear, 3D, non-hydrostatic, steady flow over SRTM terrain.
- Domain 128 km with the 64 km physics box in the centre; grid 256 × 256 at 500 m; levels 200–8,000 m every 100 m.
- For each horizontal wavenumber (k, l): η″ + m²η = 0 with m² = K²(N²/Ω² − 1) and Ω = kU + lV − iμ.
- Exact propagators per layer, solved top-down from a radiation condition (Im m > 0); inverse FFT packs two real levels per complex transform.
- Damping proportional to speed, κ = 1 / decay length (30 km default).
- Blocking: the effective terrain is cut at the dividing streamline z_d(H) × 0.6 (calibrated).
- Cloud: where the streamline lift η exceeds the lift that layer needs to saturate. Condensate from the lift table.
- Diagnostics: Froude number U/(NH), wavelength 2πU/N, trapping (Scorer parameter l² aloft vs. below), lens base, top and temperature, residence time, rotor indicator u = U(1 − ∂η/∂z) < 0.
- Runs in a Web Worker in about 0.5 s; validated against the analytic Witch of Agnesi solution.

## 4. Rendering

**Map** (Three.js r170, WebGL2):
- Terrain mesh 767² (383² on phones) from a 1024² Terrarium height map, object-space normal map, Sentinel-2 at 4096², a sharper 4096² core over the physics box, and an OpenStreetMap land-cover mask (water gloss, canopy, orchard rows, built-up, settlement lights after sunset).
- Clouds: the condensate volume (128 levels, 2× horizontal upsampling) is ray-marched in a tight box, depth-aware, at reduced resolution and composited with a soft glow. A procedural layer (3D noise texture) adds fibres along the wind and erodes the rim into wisps; lighting uses a cheap density for light, shade and normals.
- Earth's shadow: anything below R(1/cos e − 1) is unlit when the sun is e° below the horizon.
- On-demand rendering, adaptive resolution, three quality tiers with automatic step-down, and a sharp still frame at full resolution when nothing moves.

**Focus on a lens**:
- The strongest lens cell between 3.2 and 4.8 km is the subject. The camera stands side-on to the wind, about 13 km away; other clouds fade (density × 0.1 beyond 7 km), a screen-space spotlight dims the map.
- Five stages on the formation curtain through the lens: air arrives (flat layers, humidity strip), rises on the wave (the inversion as the spring), condenses (moist lines whiten at the crest; the cloud grows from its wettest core outward by lowering a condensate threshold), the plates that remain, and the air passing through (one tracked parcel).
- Everything shown is the live model of the selected atmosphere, so the lab can change what the focus shows.

## 5. Data preparation

| Script | Output |
|--------|--------|
| `tools/build_wide.py` | `wide_height_1024.png` (Terrarium), `wide_normal_2048.webp`, `wide_sat_4096.webp`, `wide_sat_2048.webp` |
| `tools/build_core.py` | `core_sat_4096.webp` (z13 tiles over the physics box) |
| `tools/build_landcover.py` | `wide_landcover_4096.webp` (RGBA: water, forest, built-up, orchards) from an Overpass `out geom` dump |
| `tools/build_site.sh` | assembles the deployable folder and stamps asset versions |

All maps share one grid: centre 33.25 N 35.72 E, 128 × 128 km, row 0 north.

## 6. Interface

- Story: 12 steps with previous / next, keyboard arrows, a segmented timeline, auto-play, and a collapse button that turns the card into a slim bar with arrows.
- Layers: clouds, air flow, moist layer, air layers (θ surfaces), formation curtain, rotors, wind column, labels; each with an explanation and controls.
- Map: orbit, zoom, preset views, tap-to-probe, clean mode (H), quality menu, shareable links (`#s4`, `#lab=…`, `#focus`).
- Calm screen: one menu, a tour button, and two drawers (layers, tools) that start open on wide screens and fold to labelled tabs with arrows.
- Opening tour on the first visit: the screen empties and each step brings back only what it explains. Skippable, replayable from the menu and from About.
- Hebrew right-to-left throughout, keyboard and screen-reader support, reduced motion respected.

## 7. Limits

The model is linear: no turbulence, no real rotors, no convection. The blocking strength (60%) and the extra 10% moisture at 3.8 km are calibrated to the observation. The fine cloud texture (fibres, frayed rims) is procedural on top of the computed condensate.
