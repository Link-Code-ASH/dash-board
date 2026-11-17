# Builds the Nest hero's body (src/nest/hero.glb) in Blender, run headless:
#   python -m venv bpyenv && bpyenv/bin/pip install bpy && bpyenv/bin/python tools/nest/hero_model.py
# Blender is Z-up with the front at -Y; the glTF export turns that into three.js's Y-up with the front at +Z.
# The body is one smooth skinned mesh grown from a stick figure (skin modifier + subdivision). Its faces carry
# material slots by region (skin, top, sleeve, forearm, bottom, shin, shoes) that the game recolours per look.
# The head is its own mesh with a "face" slot (front, with UVs projected from the front) for the painted face.
import math
import os
import bpy
import bmesh
from mathutils import Vector

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "nest", "hero.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---- Skeleton -----------------------------------------------------------------------------------------------
BONES = {
    # name: (head, tail, parent)
    "hips": ((0, 0, 0.6), (0, 0, 0.7), None),
    "spine": ((0, 0, 0.7), (0, 0, 0.83), "hips"),
    "chest": ((0, 0, 0.83), (0, 0, 0.95), "spine"),
    "neck": ((0, 0, 0.95), (0, 0, 1.04), "chest"),
    "head": ((0, 0, 1.04), (0, 0, 1.42), "neck"),
}
for side, sx in (("L", 1), ("R", -1)):
    BONES.update({
        f"upperarm_{side}": ((sx * 0.12, 0.004, 0.905), (sx * 0.158, 0.008, 0.735), "chest"),
        f"forearm_{side}": ((sx * 0.158, 0.008, 0.735), (sx * 0.172, -0.004, 0.6), f"upperarm_{side}"),
        f"hand_{side}": ((sx * 0.172, -0.004, 0.6), (sx * 0.177, -0.008, 0.51), f"forearm_{side}"),
        f"thigh_{side}": ((sx * 0.07, 0, 0.58), (sx * 0.072, -0.005, 0.315), "hips"),
        f"shin_{side}": ((sx * 0.072, -0.005, 0.315), (sx * 0.072, 0.008, 0.075), f"thigh_{side}"),
        f"foot_{side}": ((sx * 0.072, 0.008, 0.075), (sx * 0.074, -0.085, 0.025), f"shin_{side}"),
    })

arm_data = bpy.data.armatures.new("rig")
rig = bpy.data.objects.new("rig", arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for name, (head, tail, parent) in BONES.items():
    bone = arm_data.edit_bones.new(name)
    bone.head, bone.tail = Vector(head), Vector(tail)
    bone.roll = 0
    if parent:
        bone.parent = arm_data.edit_bones[parent]
        bone.use_connect = (Vector(head) - arm_data.edit_bones[parent].tail).length < 1e-6
bpy.ops.object.mode_set(mode="OBJECT")

# ---- Body: a stick figure with radii, skinned and smoothed ---------------------------------------------------
# (position, radius x, radius y) per joint; edges join them.
J = {
    "pelvis": ((0, 0.0, 0.6), 0.122, 0.09),
    "waist": ((0, 0.004, 0.72), 0.092, 0.07),
    "chest": ((0, -0.006, 0.835), 0.114, 0.082),
    "collar": ((0, 0.004, 0.925), 0.075, 0.058),
    "neck": ((0, 0.008, 0.99), 0.04, 0.04),
    "neckTop": ((0, 0.008, 1.06), 0.038, 0.038),
}
for side, sx in (("L", 1), ("R", -1)):
    J.update({
        f"shoulder{side}": ((sx * 0.128, 0.004, 0.9), 0.047, 0.047),
        f"elbow{side}": ((sx * 0.16, 0.008, 0.735), 0.035, 0.035),
        f"wrist{side}": ((sx * 0.174, -0.004, 0.6), 0.028, 0.026),
        f"palm{side}": ((sx * 0.178, -0.006, 0.56), 0.036, 0.022),
        f"fingers{side}": ((sx * 0.179, -0.008, 0.524), 0.028, 0.019),
        f"hip{side}": ((sx * 0.072, 0, 0.555), 0.076, 0.074),
        f"knee{side}": ((sx * 0.074, -0.006, 0.315), 0.048, 0.05),
        f"calf{side}": ((sx * 0.074, 0.006, 0.225), 0.05, 0.053),
        f"ankle{side}": ((sx * 0.073, 0.008, 0.09), 0.032, 0.033),
        f"heel{side}": ((sx * 0.073, 0.02, 0.035), 0.038, 0.038),
        f"toe{side}": ((sx * 0.075, -0.075, 0.03), 0.04, 0.033),
    })
EDGES = [("pelvis", "waist"), ("waist", "chest"), ("chest", "collar"), ("collar", "neck"), ("neck", "neckTop")]
for s in ("L", "R"):
    EDGES += [("collar", f"shoulder{s}"), (f"shoulder{s}", f"elbow{s}"), (f"elbow{s}", f"wrist{s}"), (f"wrist{s}", f"palm{s}"), (f"palm{s}", f"fingers{s}"),
              ("pelvis", f"hip{s}"), (f"hip{s}", f"knee{s}"), (f"knee{s}", f"calf{s}"), (f"calf{s}", f"ankle{s}"), (f"ankle{s}", f"heel{s}"), (f"heel{s}", f"toe{s}")]
names = list(J)
mesh = bpy.data.meshes.new("body")
mesh.from_pydata([J[n][0] for n in names], [(names.index(a), names.index(b)) for a, b in EDGES], [])
body = bpy.data.objects.new("body", mesh)
bpy.context.scene.collection.objects.link(body)
skin = body.modifiers.new("skin", "SKIN")
skin.use_smooth_shade = True
skin.branch_smoothing = 0.6
for i, n in enumerate(names):
    v = mesh.skin_vertices[0].data[i]
    v.radius = (J[n][1], J[n][2])
    v.use_root = n == "pelvis"
sub = body.modifiers.new("sub", "SUBSURF")
sub.levels = sub.render_levels = 2
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.modifier_apply(modifier="skin")
bpy.ops.object.modifier_apply(modifier="sub")
bpy.ops.object.shade_smooth()

# ---- Head: a rounded skull with a softly pointed chin -------------------------------------------------------
HEAD_C = Vector((0, 0.0, 1.2))
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=1, location=(0, 0, 0))
head = bpy.context.object
head.name = "head"
def smooth(a, b, x):
    t = min(1, max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
for v in head.data.vertices:
    x, y, z = v.co
    front = smooth(0.1, -0.9, y)       # 1 at the face
    low = smooth(-0.05, -1.0, z)       # 1 at the chin
    # Narrow the jaw towards a soft chin, more at the front; flatten the face a touch; round the back.
    x *= 1 - 0.34 * low ** 1.6 * (0.5 + 0.5 * front)   # full cheeks, then a small soft chin
    y *= 1 - 0.1 * front * (1 - low * 0.5) - 0.12 * low * (1 - front)
    y -= 0.05 * low * front            # chin forward
    z *= 1 - 0.08 * low                # a short lower face
    v.co = Vector((x * 0.19, y * 0.19, z * 0.2)) + HEAD_C
bpy.ops.object.shade_smooth()

# ---- Outfit pieces -----------------------------------------------------------------------------------------
def lathe(name, profile, segments=40, scale_y=1.0):
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(a), r * math.sin(a) * scale_y, z)) for a in (i / segments * math.tau for i in range(segments))]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((a[i], a[j], b[j], b[i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for p in me.polygons:
        p.use_smooth = True
    me.flip_normals() if False else None
    return obj
skirt = lathe("skirt", [(0.215, 0.38), (0.2, 0.44), (0.158, 0.56), (0.118, 0.66), (0.104, 0.7)], segments=28, scale_y=0.86)
hood = lathe("hood", [(0.075, 0.9), (0.11, 0.93), (0.115, 0.97), (0.09, 1.0)], segments=28, scale_y=0.9)
hood.location = (0, 0.035, 0)
# The hood is only the back half, folded on the shoulders.
bpy.context.view_layer.objects.active = hood
bm = bmesh.new(); bm.from_mesh(hood.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.02], context="VERTS")
bm.to_mesh(hood.data); bm.free()
for obj in (skirt, hood):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects: o.select_set(False)
    obj.select_set(True)
    m = obj.modifiers.new("thick", "SOLIDIFY"); m.thickness = 0.012; m.offset = 1
    s = obj.modifiers.new("sub", "SUBSURF"); s.levels = 1
    bpy.ops.object.modifier_apply(modifier="thick")
    bpy.ops.object.modifier_apply(modifier="sub")
    bpy.ops.object.transform_apply(location=True)
# The overall bib: a curved panel on the front of the chest, following the body.
bm = bmesh.new()
rows = []
for r, z in [(0.104, 0.64), (0.102, 0.7), (0.112, 0.78), (0.12, 0.84), (0.118, 0.87)]:
    rows.append([bm.verts.new((r * math.sin(a), -r * 0.76 * math.cos(a), z)) for a in (math.radians(-38 + 76 * i / 10) for i in range(11))])
for lo, hi in zip(rows, rows[1:]):
    for i in range(10):
        bm.faces.new((lo[i], lo[i + 1], hi[i + 1], hi[i]))
me = bpy.data.meshes.new("bib")
bm.to_mesh(me)
bib = bpy.data.objects.new("bib", me)
bpy.context.scene.collection.objects.link(bib)
for p_ in me.polygons: p_.use_smooth = True
for o in bpy.context.selected_objects: o.select_set(False)
bib.select_set(True); bpy.context.view_layer.objects.active = bib
m = bib.modifiers.new("thick", "SOLIDIFY"); m.thickness = 0.01; m.offset = 1
bpy.ops.object.modifier_apply(modifier="thick")

# ---- Materials by region ------------------------------------------------------------------------------------
def material(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    return mat
SLOTS = ["skin", "top", "forearm", "bottom", "shin", "shoes"]
for name in SLOTS:
    body.data.materials.append(material(name))
# Clean cuts where one region meets the next: waist, sleeve ends, wrists, knees and ankles.
B = {n: (Vector(h), Vector(t)) for n, (h, t, _) in BONES.items()}
def along(bone, f):
    h, t = B[bone]
    return h.lerp(t, f), (t - h).normalized()
CUTS = {"waist": (Vector((0, 0, 0.635)), Vector((0, 0, 1))), "ankle": (Vector((0, 0, 0.105)), Vector((0, 0, 1)))}
for s_ in ("L", "R"):
    CUTS[f"sleeve{s_}"] = along(f"upperarm_{s_}", 0.42)
    CUTS[f"wrist{s_}"] = along(f"forearm_{s_}", 0.92)
    CUTS[f"knee{s_}"] = along(f"thigh_{s_}", 0.97)
bm = bmesh.new(); bm.from_mesh(body.data)
for co, no in CUTS.values():
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
bm.to_mesh(body.data); bm.free()
THICK = {"hips": 0.11, "spine": 0.09, "chest": 0.105, "neck": 0.04, "upperarm": 0.042, "forearm": 0.031, "hand": 0.03, "thigh": 0.07, "shin": 0.047, "foot": 0.035}
def seg_dist(p, a, b):
    ab = b - a
    t = max(0, min(1, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length
def side(p, cut):
    co, no = CUTS[cut]
    return (p - co).dot(no)
for poly in body.data.polygons:
    c = poly.center
    # Nearest limb by distance to its surface (bone distance less its thickness), so the body's sides next to a
    # hanging arm stay body.
    near = min((n for n in B if n != "head"), key=lambda n: seg_dist(c, *B[n]) - THICK[n.split("_")[0]])
    s_ = near[-1]
    if near.startswith(("upperarm", "forearm", "hand")):
        region = "top" if side(c, f"sleeve{s_}") < 0 else "forearm" if side(c, f"wrist{s_}") < 0 else "skin"
    elif near.startswith(("thigh", "shin", "foot")):
        region = "bottom" if side(c, f"knee{s_}") < 0 else "shin" if c.z > 0.105 else "shoes"
    elif c.z > 0.962:
        region = "skin"
    else:
        region = "top" if c.z > 0.635 else "bottom"
    poly.material_index = SLOTS.index(region)
head.data.materials.append(material("skin"))
head.data.materials.append(material("face"))
for poly in head.data.polygons:
    n = poly.normal
    c = poly.center - HEAD_C
    if n.y < -0.25 and c.z < 0.11:
        poly.material_index = 1
# Face UVs: projected straight from the front over a 0.4 × 0.4 window centred on the head.
while head.data.uv_layers:
    head.data.uv_layers.remove(head.data.uv_layers[0])
uv = head.data.uv_layers.new(name="UVMap")
for loop in head.data.loops:
    co = head.data.vertices[loop.vertex_index].co - HEAD_C
    uv.data[loop.index].uv = (0.5 + co.x / 0.4, 0.5 + co.z / 0.4)
skirt.data.materials.append(material("skirt"))
hood.data.materials.append(material("hood"))
bib.data.materials.append(material("bib"))

# ---- Skinning ----------------------------------------------------------------------------------------------
def bind(obj, auto=True, bone=None):
    for o in bpy.context.selected_objects: o.select_set(False)
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    if auto:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    else:
        bpy.ops.object.parent_set(type="ARMATURE_NAME")
        group = obj.vertex_groups[bone]
        group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
bind(body)
bind(head, auto=False, bone="head")
bind(skirt, auto=False, bone="hips")
bind(hood, auto=False, bone="chest")
bind(bib, auto=False, bone="chest")

bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format="GLB", export_yup=True, export_skins=True, export_animations=False,
                          export_materials="PLACEHOLDER" if False else "EXPORT", export_texcoords=True, export_normals=True, export_apply=True)
print("vertices", {o.name: len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH"})
print("wrote", os.path.abspath(OUT), os.path.getsize(OUT))
