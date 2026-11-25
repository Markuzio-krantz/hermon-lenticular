"""Blender scene for the Hula / Hermon lenticular-cloud event of 19/11/2026.

1. Terrain mesh from the SRTM-based heightmap (1 Blender unit = 1 km, true vertical scale)
2. Procedural land-cover material (Hula fields, Naftali maquis, Golan basalt, Hermon limestone)
   baked to an albedo texture that the web viewer uses
3. Cloud-water volume computed by the web physics engine -> OpenVDB -> Principled Volume
4. Sunset lighting and two cameras: the photographer's view from the Hula Valley and an
   aerial "infographic" view; renders both with Cycles.

usage: blender -b --factory-startup -P build_scene.py -- <lenticular_dir> [--no-render] [--samples N]
"""
import sys, os, math, json
import numpy as np
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
ROOT = os.path.abspath(argv[0])
RENDER = "--no-render" not in argv
SAMPLES = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 48
SMALL = "--small" in argv
DATA = os.path.join(ROOT, "web", "data")
OUT = os.path.join(ROOT, "blender")
meta = json.load(open(os.path.join(DATA, "terrain_meta.json")))
EXT = 128.0  # km: the wide basemap (Sentinel-2 + SRTM) around the physics centre
LM = {k: (v[0] / 1000.0, v[1] / 1000.0) for k, v in meta["landmarks"].items()}

# ------------------------------------------------------------------ scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.unit_settings.system = "METRIC"
scn.render.engine = "CYCLES"
scn.cycles.device = "CPU"
scn.cycles.samples = SAMPLES
scn.cycles.use_denoising = True
scn.cycles.volume_step_rate = 4.0
scn.cycles.max_bounces = 8
scn.cycles.volume_bounces = 3
scn.render.resolution_x, scn.render.resolution_y = (480, 270) if SMALL else (1600, 900)
scn.view_settings.view_transform = "AgX"
scn.view_settings.look = "AgX - Medium High Contrast" if "AgX - Medium High Contrast" in [i.identifier for i in scn.view_settings.bl_rna.properties["look"].enum_items] else "None"

# ------------------------------------------------------------------ terrain
RES = 1024
H = np.fromfile(os.path.join(DATA, "wide_height_1024.f32"), np.float32).reshape(RES, RES)
H = np.maximum(H, -0.215 * 1000) / 1000.0  # km (Kinneret ~ -210 m)
xs = (np.arange(RES) + 0.5) / RES * EXT - EXT / 2
ys = EXT / 2 - (np.arange(RES) + 0.5) / RES * EXT
X, Y = np.meshgrid(xs, ys)
co = np.stack([X, Y, H], -1).reshape(-1, 3).astype(np.float32)
ii, jj = np.meshgrid(np.arange(RES - 1), np.arange(RES - 1))
a = (jj * RES + ii).ravel()
quads = np.stack([a, a + RES, a + RES + 1, a + 1], -1)  # CCW seen from +Z
mesh = bpy.data.meshes.new("Terrain")
mesh.vertices.add(len(co)); mesh.vertices.foreach_set("co", co.ravel())
mesh.loops.add(quads.size); mesh.loops.foreach_set("vertex_index", quads.ravel().astype(np.int32))
mesh.polygons.add(len(quads))
mesh.polygons.foreach_set("loop_start", (np.arange(len(quads)) * 4).astype(np.int32))
mesh.polygons.foreach_set("loop_total", np.full(len(quads), 4, np.int32))
uv = mesh.uv_layers.new(name="UVMap")
lv = quads.ravel()
uvs = np.stack([(lv % RES + 0.5) / RES, 1 - (lv // RES + 0.5) / RES], -1).astype(np.float32)
uv.data.foreach_set("uv", uvs.ravel())
mesh.update(calc_edges=True); mesh.validate()
mesh.polygons.foreach_set("use_smooth", np.ones(len(quads), bool))
terrain = bpy.data.objects.new("Terrain", mesh)
scn.collection.objects.link(terrain)

# ------------------------------------------------------------------ land-cover material
def node(nt, t, loc, **kw):
    n = nt.nodes.new(t); n.location = loc
    for k, v in kw.items(): setattr(n, k, v)
    return n

mat = bpy.data.materials.new("LandCover"); mat.use_nodes = True
nt = mat.node_tree; nt.nodes.clear()
out = node(nt, "ShaderNodeOutputMaterial", (1400, 0))
bsdf = node(nt, "ShaderNodeBsdfPrincipled", (1150, 0))
bsdf.inputs["Roughness"].default_value = 0.92
nt.links.new(bsdf.outputs[0], out.inputs[0])
geo = node(nt, "ShaderNodeNewGeometry", (-1200, 200))
sep = node(nt, "ShaderNodeSeparateXYZ", (-1000, 300))
nt.links.new(geo.outputs["Position"], sep.inputs[0])
sepn = node(nt, "ShaderNodeSeparateXYZ", (-1000, 0))
nt.links.new(geo.outputs["Normal"], sepn.inputs[0])
noise = node(nt, "ShaderNodeTexNoise", (-1000, -300)); noise.inputs["Scale"].default_value = 0.9; noise.inputs["Detail"].default_value = 8
fine = node(nt, "ShaderNodeTexNoise", (-1000, -550)); fine.inputs["Scale"].default_value = 9.0; fine.inputs["Detail"].default_value = 4
nt.links.new(geo.outputs["Position"], noise.inputs["Vector"]); nt.links.new(geo.outputs["Position"], fine.inputs["Vector"])

def ramp(loc, stops, src):
    r = node(nt, "ShaderNodeValToRGB", loc)
    els = r.color_ramp.elements
    while len(els) > 1: els.remove(els[-1])
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    for p, c in stops[1:]:
        e = els.new(p); e.color = (*c, 1)
    nt.links.new(src, r.inputs[0])
    return r

# height (km) with noise jitter
mapH = node(nt, "ShaderNodeMath", (-750, 300), operation="MULTIPLY_ADD")
nt.links.new(noise.outputs["Fac"], mapH.inputs[0]); mapH.inputs[1].default_value = 0.35
nt.links.new(sep.outputs["Z"], mapH.inputs[2])
hnorm = node(nt, "ShaderNodeMath", (-550, 300), operation="DIVIDE"); hnorm.inputs[1].default_value = 3.0
nt.links.new(mapH.outputs[0], hnorm.inputs[0])
elev = ramp((-350, 350), [
    (0.03, (0.13, 0.19, 0.06)),   # valley floor: crops / orchards
    (0.10, (0.15, 0.19, 0.07)),
    (0.18, (0.09, 0.14, 0.05)),   # Naftali maquis / oak
    (0.30, (0.22, 0.17, 0.09)),   # Golan basalt pasture (autumn, dry)
    (0.50, (0.30, 0.26, 0.20)),   # upper Hermon karst
    (0.80, (0.55, 0.53, 0.50)),   # summit limestone
], hnorm.outputs[0])
# slope -> rock
slope = ramp((-350, 50), [(0.0, (0, 0, 0)), (0.80, (0, 0, 0)), (0.92, (1, 1, 1))], sepn.outputs["Z"])  # 1 = flat
mixr = node(nt, "ShaderNodeMix", (300, 250), data_type="RGBA", blend_type="MIX")
nt.links.new(slope.outputs[0], mixr.inputs[0])
nt.links.new(elev.outputs[0], mixr.inputs[7]); mixr.inputs[6].default_value = (0.36, 0.33, 0.29, 1)
# Hula field patchwork: brick texture in rotated coords, masked to low ground
brick = node(nt, "ShaderNodeTexBrick", (-350, -350))
brick.inputs["Scale"].default_value = 7.0; brick.inputs["Mortar Size"].default_value = 0.01
brick.inputs["Color1"].default_value = (0.30, 0.31, 0.12, 1); brick.inputs["Color2"].default_value = (0.36, 0.28, 0.18, 1)
brick.inputs["Mortar"].default_value = (0.16, 0.2, 0.08, 1)
brick.offset = 0.37; brick.squash = 1.7
nt.links.new(geo.outputs["Position"], brick.inputs["Vector"])
fieldmask = ramp((-350, -650), [(0.0, (1, 1, 1)), (0.10, (1, 1, 1)), (0.16, (0, 0, 0))], sep.outputs["Z"])  # Hula floor ~70 m
fields = node(nt, "ShaderNodeMix", (550, 100), data_type="RGBA", blend_type="MIX")
nt.links.new(fieldmask.outputs[0], fields.inputs[0])
nt.links.new(mixr.outputs[2], fields.inputs[6]); nt.links.new(brick.outputs["Color"], fields.inputs[7])
# fine variation
var = node(nt, "ShaderNodeMix", (800, 100), data_type="RGBA", blend_type="OVERLAY")
var.inputs[0].default_value = 0.35
nt.links.new(fields.outputs[2], var.inputs[6]); nt.links.new(fine.outputs["Color"], var.inputs[7])
nt.links.new(var.outputs[2], bsdf.inputs["Base Color"])
# real colours: Sentinel-2 cloudless mosaic draped over the same 128 km square
sat_mat = bpy.data.materials.new("Sentinel2"); sat_mat.use_nodes = True
st = sat_mat.node_tree; sb = st.nodes["Principled BSDF"]; sb.inputs["Roughness"].default_value = 0.9
si = st.nodes.new("ShaderNodeTexImage"); si.image = bpy.data.images.load(os.path.join(DATA, "wide_sat_4096.webp"))
st.links.new(si.outputs["Color"], sb.inputs["Base Color"])
terrain.data.materials.append(sat_mat)

scn.cycles.samples = SAMPLES

# ------------------------------------------------------------------ clouds (OpenVDB)
import openvdb
cm = json.load(open(os.path.join(OUT, "cloud_volume.json")))
nx, ny, nz = cm["nx"], cm["ny"], cm["nz"]
q = np.fromfile(os.path.join(OUT, "cloud_volume.f32"), np.float32).reshape(nz, ny, nx)
arr = np.ascontiguousarray(np.transpose(q[:, ::-1, :], (2, 1, 0)))  # -> [x][y south->north][z]
grid = openvdb.FloatGrid(); grid.copyFromArray(arr); grid.name = "density"
CEXT = cm["extent_m"] / 1000.0   # clouds live in the 64 km physics box
vx, vy, vz = CEXT / nx, CEXT / ny, cm["ztop_m"] / 1000.0 / nz
grid.transform = openvdb.createLinearTransform([[vx, 0, 0, 0], [0, vy, 0, 0], [0, 0, vz, 0],
                                                [-CEXT / 2 + vx / 2, -CEXT / 2 + vy / 2, vz / 2, 1]])
vdb_path = os.path.join(OUT, "clouds.vdb")
openvdb.write(vdb_path, grids=[grid])
vol = bpy.data.volumes.new("Clouds"); vol.filepath = vdb_path
vobj = bpy.data.objects.new("Clouds", vol); scn.collection.objects.link(vobj)
vm = bpy.data.materials.new("CloudWater"); vm.use_nodes = True
vt = vm.node_tree; vt.nodes.clear()
vo = node(vt, "ShaderNodeOutputMaterial", (600, 0))
pv = node(vt, "ShaderNodeVolumePrincipled", (350, 0))
attr = node(vt, "ShaderNodeAttribute", (-300, 0)); attr.attribute_name = "density"
dn = node(vt, "ShaderNodeTexNoise", (-300, -250)); dn.inputs["Scale"].default_value = 3.0; dn.inputs["Detail"].default_value = 6
# soft threshold so the lens edges stay crisp, noise only breaks up the very rim
sub = node(vt, "ShaderNodeMath", (-80, 0), operation="SUBTRACT"); sub.inputs[1].default_value = 0.004
nt2 = node(vt, "ShaderNodeMath", (80, -200), operation="MULTIPLY_ADD"); nt2.inputs[1].default_value = 0.5; nt2.inputs[2].default_value = 0.75
mul = node(vt, "ShaderNodeMath", (150, 0), operation="MULTIPLY"); mul.use_clamp = False
sc = node(vt, "ShaderNodeMath", (250, 0), operation="MULTIPLY"); sc.inputs[1].default_value = 140.0
vt.links.new(attr.outputs["Fac"], sub.inputs[0]); vt.links.new(dn.outputs["Fac"], nt2.inputs[0])
vt.links.new(sub.outputs[0], mul.inputs[0]); vt.links.new(nt2.outputs[0], mul.inputs[1])
vt.links.new(mul.outputs[0], sc.inputs[0]); vt.links.new(sc.outputs[0], pv.inputs["Density"])
pv.inputs["Anisotropy"].default_value = 0.55
pv.inputs["Color"].default_value = (1, 1, 1, 1)
# cheap stand-in for multiple scattering of sunset light inside the optically thick lens
pv.inputs["Emission Color"].default_value = (1.0, 0.55, 0.5, 1)
em = node(vt, "ShaderNodeMath", (250, -150), operation="MULTIPLY"); em.inputs[1].default_value = 0.028
vt.links.new(sc.outputs[0], em.inputs[0]); vt.links.new(em.outputs[0], pv.inputs["Emission Strength"])
vt.links.new(pv.outputs[0], vo.inputs["Volume"])
vol.materials.append(vm)

# ------------------------------------------------------------------ sky + sun (sunset 16:35, az ~246)
world = bpy.data.worlds.new("Sunset"); scn.world = world; world.use_nodes = True
wt = world.node_tree; wt.nodes.clear()
wo = node(wt, "ShaderNodeOutputWorld", (400, 0)); bg = node(wt, "ShaderNodeBackground", (200, 0))
sky = node(wt, "ShaderNodeTexSky", (0, 0))
for st in ("MULTIPLE_SCATTERING", "NISHITA", "SINGLE_SCATTERING", "HOSEK_WILKIE"):
    try: sky.sky_type = st; break
    except Exception: pass
SUN_EL, SUN_AZ = math.radians(1.2), math.radians(246)
for attr_name, val in (("sun_elevation", SUN_EL), ("sun_rotation", math.pi - SUN_AZ),
                       ("altitude", 100.0), ("air_density", 1.6), ("dust_density", 3.5), ("sun_disc", False)):
    if hasattr(sky, attr_name):
        try: setattr(sky, attr_name, val)
        except Exception: pass
bg.inputs["Strength"].default_value = 0.35
wt.links.new(sky.outputs[0], bg.inputs[0]); wt.links.new(bg.outputs[0], wo.inputs[0])
sun_d = bpy.data.lights.new("Sun", "SUN"); sun_d.energy = 11.0; sun_d.angle = math.radians(0.6)
sun_d.color = (1.0, 0.36, 0.22)
sun = bpy.data.objects.new("Sun", sun_d); scn.collection.objects.link(sun)
# the lamp shines along its local -Z: point it from the sun (az 246, el 1.2) towards the ground
from mathutils import Vector
to_sun = Vector((math.sin(SUN_AZ) * math.cos(SUN_EL), math.cos(SUN_AZ) * math.cos(SUN_EL), math.sin(SUN_EL)))
sun.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()
fill = bpy.data.lights.new("SkyFill", "SUN"); fill.energy = 0.25; fill.color = (0.55, 0.65, 1.0); fill.angle = math.radians(60)
fo = bpy.data.objects.new("SkyFill", fill); fo.rotation_euler = (math.radians(20), 0, 0); scn.collection.objects.link(fo)

# ------------------------------------------------------------------ cameras
def look_at(obj, target):
    from mathutils import Vector
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

def camera(name, loc, target, lens):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.clip_start = 0.002; cd.clip_end = 400
    co_ = bpy.data.objects.new(name, cd); scn.collection.objects.link(co_)
    co_.location = loc; look_at(co_, target); return co_

def ground(x, y):
    return float(H[int((EXT / 2 - y) / EXT * RES), int((x + EXT / 2) / EXT * RES)])
hx, hy = LM["agamonHula"][0], LM["agamonHula"][1] - 3.0
cam_photo = camera("Cam_FromHula", (hx, hy, ground(hx, hy) + 0.15), (LM["hermon"][0] - 2, LM["hermon"][1], 3.2), 50)
cam_aerial = camera("Cam_Aerial", (-22, -38, 15), (12, 17, 3.2), 34)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "lenticular_hermon.blend"))
print("SAVED blend")
print("SUN_DIR", (sun.matrix_world.to_3x3() @ Vector((0, 0, -1))))

if RENDER:
    shots = ((cam_photo, "render_from_hula.png"),) if "--only-hula" in argv else ((cam_photo, "render_from_hula.png"), (cam_aerial, "render_aerial.png"))
    for cam, fn in shots:
        scn.camera = cam
        scn.render.filepath = os.path.join(OUT, fn)
        scn.render.image_settings.file_format = "PNG"
        bpy.ops.render.render(write_still=True)
        print("RENDERED", fn)
