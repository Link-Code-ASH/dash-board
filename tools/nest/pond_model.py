# Builds the Nest pond (src/nest/pond.glb) in Blender, run headless with Blender's Python module:
#   bpyenv/bin/python tools/nest/pond_model.py
# Footprint 3 × 2 tiles centred on the origin (Blender X across, -Y towards the viewer's front, Z up; the glTF
# export turns that into three.js's Y-up). Pieces are named by what they are; the game gives each its material:
#   water (vertex colours: deep in the middle, pale at the edge), foam, shore (wet sand, vertex colours),
#   lawn (grass bank that melts into the lot), stone*, pad*, petal, heart, reed*, cattail.
import math
import os
import random
import bpy
import bmesh
from mathutils import Vector, noise

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "nest", "pond.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
rng = random.Random(7)
TAU = math.tau

# ---- Shoreline ------------------------------------------------------------------------------------------
A, B = 1.1, 0.71
def shore(theta):
    wobble = 1 + 0.08 * math.sin(3 * theta + 0.6) + 0.045 * math.sin(5 * theta + 1.3) + 0.02 * math.sin(9 * theta)
    return A * wobble, B * wobble
def at(theta, s, z=0.0):
    a, b = shore(theta)
    x, y = a * s * math.cos(theta), b * s * math.sin(theta)
    return Vector((max(-1.49, min(1.49, x)), max(-0.99, min(0.99, y)), z))

def hex_rgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return srgb   # byte colour layers take sRGB values; the exporter writes them out linear
def mix(a, b, t):
    return [x + (y - x) * t for x, y in zip(a, b)]

def mesh_object(name, bm, material=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if me.color_attributes:
        me.color_attributes.active_color = me.color_attributes[0]
        me.color_attributes.render_color_index = 0
    mat = bpy.data.materials.get(material or name) or bpy.data.materials.new(material or name)
    me.materials.append(mat)
    return obj

def smooth_all(obj):
    for p in obj.data.polygons:
        p.use_smooth = True

def fit(theta, s_from, s_to, s):
    """Squeeze s between s_from and s_to so the band's outer edge stays inside the footprint."""
    a, b = shore(theta)
    reach = max(abs(a * s_to * math.cos(theta)) / 1.48, abs(b * s_to * math.sin(theta)) / 0.98, 1)
    limit = s_to / reach
    return s if s <= s_from else s_from + (s - s_from) * (max(limit, s_from + 0.02) - s_from) / (s_to - s_from)

def ring_surface(name, profile, segments=96, colours=None):
    """A band round the pond: profile = [(s, z), ...] from inside out; colours = [rgb per profile row]."""
    bm = bmesh.new()
    s_from, s_to = profile[0][0], profile[-1][0]
    rows = [[bm.verts.new(at(i / segments * TAU, fit(i / segments * TAU, s_from, s_to, s), z)) for i in range(segments)] for s, z in profile]
    layer = bm.loops.layers.color.new("Color") if colours else None
    for r, (inner, outer) in enumerate(zip(rows, rows[1:])):
        for i in range(segments):
            j = (i + 1) % segments
            face = bm.faces.new((inner[i], outer[i], outer[j], inner[j]))
            if layer:
                for loop in face.loops:
                    row = r if loop.vert in (inner[i], inner[j]) else r + 1
                    loop[layer] = (*colours[row], 1)
    obj = mesh_object(name, bm)
    smooth_all(obj)
    return obj

# Water: a disc, deep blue-green in the middle fading to pale at the edge.
WATER_Z = 0.03
bm = bmesh.new()
layer = bm.loops.layers.color.new("Color")
deep, mid, pale = hex_rgb("#3f9cc8"), hex_rgb("#6cc0e2"), hex_rgb("#a6e0f0")
centre = bm.verts.new((0, 0, WATER_Z))
rows = []
for s in (0.25, 0.5, 0.72, 0.88, 1.0):
    rows.append([bm.verts.new(at(i / 96 * TAU, s, WATER_Z)) for i in range(96)])
def water_colour(s):
    return mix(deep, mid, s / 0.7) if s < 0.7 else mix(mid, pale, (s - 0.7) / 0.3)
for i in range(96):
    j = (i + 1) % 96
    f = bm.faces.new((centre, rows[0][i], rows[0][j]))
    for loop in f.loops: loop[layer] = (*water_colour(0 if loop.vert is centre else 0.25), 1)
for r, (inner, outer) in enumerate(zip(rows, rows[1:])):
    s_in, s_out = (0.25, 0.5, 0.72, 0.88, 1.0)[r], (0.25, 0.5, 0.72, 0.88, 1.0)[r + 1]
    for i in range(96):
        j = (i + 1) % 96
        f = bm.faces.new((inner[i], outer[i], outer[j], inner[j]))
        for loop in f.loops: loop[layer] = (*water_colour(s_in if loop.vert in (inner[i], inner[j]) else s_out), 1)
mesh_object("water", bm)

# Foam: a thin pale ripple line just inside the shore, its inner edge wavy.
bm = bmesh.new()
inner = [bm.verts.new(at(i / 120 * TAU, 0.9 + 0.025 * math.sin(i * 0.9) + 0.015 * math.sin(i * 2.3), WATER_Z + 0.004)) for i in range(120)]
outer = [bm.verts.new(at(i / 120 * TAU, 0.985, WATER_Z + 0.004)) for i in range(120)]
for i in range(120):
    j = (i + 1) % 120
    bm.faces.new((inner[i], outer[i], outer[j], inner[j]))
mesh_object("foam", bm)

# Shore: wet sand dipping under the water, a sandy lip, then the grass bank.
sand_wet, sand, moss = hex_rgb("#a88f66"), hex_rgb("#e3cc98"), hex_rgb("#b9d98a")
ring_surface("shore", [(0.9, -0.02), (0.99, WATER_Z - 0.004), (1.04, 0.06), (1.09, 0.072), (1.12, 0.066)],
             colours=[sand_wet, sand_wet, sand, sand, moss])
ring_surface("lawn", [(1.1, 0.07), (1.16, 0.064), (1.24, 0.035), (1.32, 0.012), (1.4, 0.0)])

# ---- Stones round the edge ---------------------------------------------------------------------------------
def pebble(name, centre, size, squash, seed, material):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1)
    offset = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in bm.verts:
        n = noise.noise(v.co * 1.3 + offset) * 0.22 + noise.noise(v.co * 3 + offset) * 0.06
        v.co *= 1 + n
        v.co.z *= squash
        if v.co.z < -0.3 * squash: v.co.z = -0.3 * squash + (v.co.z + 0.3 * squash) * 0.2   # flat underside
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=__import__("mathutils").Matrix.Rotation(rng.random() * TAU, 3, "Z"), verts=bm.verts)
    bmesh.ops.translate(bm, vec=centre, verts=bm.verts)
    obj = mesh_object(name, bm, material)
    smooth_all(obj)
    return obj

REEDS_AT = -0.75   # the reed bed sits here on the shore (angle), so leave a gap in the stones
k = 0
for i in range(22):
    theta = i / 22 * TAU + rng.uniform(-0.08, 0.08)
    gap = abs(math.atan2(math.sin(theta - REEDS_AT), math.cos(theta - REEDS_AT)))
    if gap < 0.45 or rng.random() < 0.25: continue
    big = rng.random() < 0.3
    size = rng.uniform(0.1, 0.14) if big else rng.uniform(0.06, 0.095)
    pos = at(theta, 1.03 + rng.uniform(-0.02, 0.03), 0.04)
    pebble(f"stone{k}", pos, (size * rng.uniform(1.0, 1.35), size, size), rng.uniform(0.55, 0.75), k, "stone" if k % 3 else "stoneDark")
    k += 1
# A pair of bigger boulders at the far end, one leaning on the other.
pebble(f"stone{k}", at(2.35, 1.02, 0.05), (0.22, 0.17, 0.17), 0.8, 40, "stone")
pebble(f"stone{k + 1}", at(2.62, 1.06, 0.04), (0.14, 0.12, 0.12), 0.7, 41, "stoneDark")
pebble(f"stone{k + 2}", at(0.15, 0.55, WATER_Z - 0.01), (0.1, 0.08, 0.08), 0.6, 42, "stone")  # a stepping stone

# ---- Lily pads and a lotus ----------------------------------------------------------------------------------
def lily(name, x, y, r, turn, material):
    bm = bmesh.new()
    notch = 0.55
    centre_top = bm.verts.new((0, 0, 0.012))
    rim = [bm.verts.new((r * math.cos(a), r * math.sin(a), 0.006 + 0.004 * math.sin(a * 3)))
           for a in (notch / 2 + (TAU - notch) * i / 30 for i in range(31))]
    for a_, b_ in zip(rim, rim[1:]):
        bm.faces.new((centre_top, a_, b_))
    bm.faces.new((centre_top, rim[-1], rim[0])) if False else None
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=__import__("mathutils").Matrix.Rotation(turn, 3, "Z"), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(x, y, WATER_Z), verts=bm.verts)
    return mesh_object(name, bm, material)
lily("pad0", -0.42, 0.12, 0.16, 0.4, "pad")
lily("pad1", -0.16, 0.3, 0.11, 2.2, "padLight")
lily("pad2", 0.5, -0.18, 0.13, 4.0, "pad")
lily("pad3", 0.72, 0.05, 0.09, 1.1, "padLight")

def petal(name, base, angle, tilt, length, width, material):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1)
    for v in bm.verts:
        v.co.x *= length; v.co.y *= width; v.co.z *= width * 0.45
        v.co.x += length * 0.9
        v.co.z += (v.co.x / length) ** 2 * 0.02   # tips curl up
    M = __import__("mathutils").Matrix
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=M.Rotation(-tilt, 3, "Y"), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=M.Rotation(angle, 3, "Z"), verts=bm.verts)
    bmesh.ops.translate(bm, vec=base, verts=bm.verts)
    obj = mesh_object(name, bm, material)
    smooth_all(obj)
lotus = Vector((-0.42, 0.1, WATER_Z + 0.02))
for i in range(8):
    petal(f"petal{i}", lotus, i / 8 * TAU, 0.35, 0.06, 0.032, "petal")
for i in range(5):
    petal(f"petalIn{i}", lotus + Vector((0, 0, 0.01)), i / 5 * TAU + 0.3, 0.95, 0.045, 0.026, "petalLight")
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.022)
bmesh.ops.translate(bm, vec=lotus + Vector((0, 0, 0.03)), verts=bm.verts)
smooth_all(mesh_object("heart", bm))

# ---- Reeds and cattails, grouped so the game can sway them --------------------------------------------------
reeds = bpy.data.objects.new("reeds", None)
bpy.context.scene.collection.objects.link(reeds)
base = at(REEDS_AT, 1.0, 0.03)
reeds.location = base
def blade(name, x, y, height, lean, width, material):
    bm = bmesh.new()
    steps = 8
    left, right = [], []
    for i in range(steps + 1):
        t = i / steps
        w = width * (1 - t) ** 0.8
        bend = lean * t * t
        left.append(bm.verts.new((x + bend[0] - w, y + bend[1], height * t)))
        right.append(bm.verts.new((x + bend[0] + w, y + bend[1] + w * 0.4, height * t)))
    for i in range(steps):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.008)
    obj = mesh_object(name, bm, material)
    smooth_all(obj)
    obj.parent = reeds
    return obj
for i in range(9):
    a = rng.uniform(0, TAU)
    r = rng.uniform(0, 0.13)
    x, y = r * math.cos(a), r * math.sin(a) * 0.7
    h = rng.uniform(0.38, 0.68)
    lean = Vector((rng.uniform(-0.12, 0.12) + x * 0.6, rng.uniform(-0.05, 0.05), 0))
    blade(f"reed{i}", x, y, h, lean, rng.uniform(0.014, 0.022), "reed" if i % 3 else "reedDark")
for i, (x, y, h) in enumerate([(0.0, 0.0, 0.66), (0.07, 0.03, 0.56), (-0.06, -0.02, 0.6)]):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.006, radius2=0.006, depth=h)
    bmesh.ops.translate(bm, vec=(x, y, h / 2), verts=bm.verts)
    stem = mesh_object(f"stem{i}", bm, "reedDark")
    stem.parent = reeds
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=1)
    for v in bm.verts: v.co.x *= 0.024; v.co.y *= 0.024; v.co.z *= 0.065
    bmesh.ops.translate(bm, vec=(x, y, h - 0.04), verts=bm.verts)
    head = mesh_object(f"cattail{i}", bm, "cattail")
    smooth_all(head)
    head.parent = reeds

bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format="GLB", export_yup=True, export_materials="EXPORT",
                          export_vertex_color="ACTIVE", export_normals=True, export_apply=True)
print("objects", len(bpy.data.objects), "vertices", sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH"))
print("wrote", os.path.abspath(OUT), os.path.getsize(OUT))
