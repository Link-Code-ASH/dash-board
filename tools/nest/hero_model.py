# Builds the Nest hero (src/nest/hero.glb) in Blender, run headless with Blender's Python module:
#   python -m venv bpyenv && bpyenv/bin/pip install bpy && bpyenv/bin/python tools/nest/hero_model.py
# Blender is Z-up with the front at -Y; the glTF export turns that into three.js's Y-up with the front at +Z.
#
# An anime-style person about five heads tall, standing in an A-pose (the game lowers the arms):
#   body    one skin mesh, lofted from anatomical cross-sections (shoulders, waist, hips, knees, calves, hands),
#           fused and smoothed by a voxel remesh; its faces are split into region slots (bChest, bArmU, …) so the
#           game can hide what an outfit covers
#   head    a sculpted sphere (cheeks, small chin, nose, ears) with a "face" slot whose UVs are projected from
#           the front for the painted face
#   clothes separate solid meshes over the body (tee, hoodie + hood, pants, shorts, dressTop + skirt + collar +
#           bow, bib + strap, socks, shoes + sole), weighted like the body under them
#   hair    one mesh per style (hair_short, hair_bob, …) made of chunky tapered clumps over a scalp cap, with
#           sway bones (hair_back, hair_back2, hair_L, hair_R, hair_tail)
import math
import os
import random
import bpy
import bmesh
from mathutils import Vector, noise

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "nest", "hero.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
TAU = math.tau
rng = random.Random(11)
def V(*a): return Vector(a)
def lerp(a, b, t): return a + (b - a) * t
def smooth(a, b, x):
    t = min(1, max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
def mat(name):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)
def link(name, bm, material=None, normals=True):
    if normals:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if material:
        me.materials.append(mat(material))
    for p in me.polygons:
        p.use_smooth = True
    return obj
def activate(obj):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
def modify(obj, kind, **props):
    m = obj.modifiers.new(kind.lower(), kind)
    for k, v in props.items():
        setattr(m, k, v)
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=m.name)
def fuse(obj, voxel=0.006, smooth_steps=3, keep=0.25):
    """Union of the overlapping shells into one smooth skin."""
    modify(obj, "REMESH", mode="VOXEL", voxel_size=voxel, use_smooth_shade=True)
    if smooth_steps:
        modify(obj, "SMOOTH", factor=0.5, iterations=smooth_steps)
    if keep < 1:
        modify(obj, "DECIMATE", ratio=keep)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj

def loft(bm, rings, seg=16, ref=None, power=2.0):
    """A closed tube through rings [(centre, radius along ref, radius across)]."""
    ref = ref or V(1, 0, 0)
    loops = []
    n = len(rings)
    for i, (c, ru, rv) in enumerate(rings):
        t = (rings[min(i + 1, n - 1)][0] - rings[max(i - 1, 0)][0]).normalized()
        u = (ref - t * ref.dot(t)).normalized()
        v = t.cross(u)
        e = 2 / power
        loop = []
        for k in range(seg):
            ca, sa = math.cos(k / seg * TAU), math.sin(k / seg * TAU)
            loop.append(bm.verts.new(c + u * ru * math.copysign(abs(ca) ** e, ca) + v * rv * math.copysign(abs(sa) ** e, sa)))
        loops.append(loop)
    for a, b in zip(loops, loops[1:]):
        for k in range(seg):
            j = (k + 1) % seg
            bm.faces.new((a[k], a[j], b[j], b[k]))
    for loop, flip in ((loops[0], True), (loops[-1], False)):
        centre = bm.verts.new(sum((v.co for v in loop), Vector()) / seg)
        for k in range(seg):
            j = (k + 1) % seg
            bm.faces.new((centre, loop[j], loop[k]) if flip else (centre, loop[k], loop[j]))
def ellipsoid(bm, centre, radii, seg=16, rings=10):
    made = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    for v in made["verts"]:
        v.co = V(v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]) + Vector(centre)
    return made["verts"]
def cut(spec, a, b):
    """Rows of a spec [(p, ...)] between a and b (in the spec's own order), with the ends interpolated."""
    def at(p):
        for lo, hi in zip(spec, spec[1:]):
            if min(lo[0], hi[0]) <= p <= max(lo[0], hi[0]):
                t = (p - lo[0]) / (hi[0] - lo[0])
                return tuple(lerp(x, y, t) for x, y in zip(lo, hi))
        return min(spec, key=lambda r: abs(r[0] - p))
    lo, hi = min(a, b), max(a, b)
    ends = (lo, hi) if spec[0][0] < spec[-1][0] else (hi, lo)
    return [at(ends[0])] + [r for r in spec if lo < r[0] < hi] + [at(ends[1])]

# ---- Proportions ------------------------------------------------------------------------------------------
HEAD_C = V(0, 0, 1.365)
# Torso, bottom to top: (z, y, half width, half depth)
TORSO = [(0.675, 0.006, 0.05, 0.045), (0.7, 0.008, 0.1, 0.075), (0.735, 0.01, 0.122, 0.088), (0.775, 0.01, 0.128, 0.092), (0.83, 0.006, 0.114, 0.08),
         (0.89, 0.0, 0.094, 0.066), (0.95, -0.003, 0.102, 0.073), (1.02, -0.008, 0.116, 0.084), (1.075, -0.004, 0.12, 0.078),
         (1.115, 0.002, 0.108, 0.064), (1.145, 0.006, 0.07, 0.048), (1.165, 0.008, 0.042, 0.04)]
# Leg, top to bottom: (z, y, half width, half depth); knee at 0.385
LEG = [(0.78, 0.008, 0.06, 0.07), (0.71, 0.007, 0.066, 0.074), (0.62, 0.003, 0.059, 0.065), (0.5, -0.002, 0.049, 0.053), (0.42, -0.005, 0.042, 0.045),
       (0.385, -0.011, 0.041, 0.046), (0.35, -0.004, 0.038, 0.041), (0.28, 0.008, 0.041, 0.046), (0.19, 0.007, 0.032, 0.035), (0.105, 0.006, 0.024, 0.027), (0.06, 0.008, 0.026, 0.03)]
LEG_X = 0.07
# Arm, shoulder to wrist: (distance, half depth (front-back), half thickness); elbow at 0.215
ARM = [(-0.03, 0.03, 0.03), (0.015, 0.041, 0.04), (0.07, 0.04, 0.038), (0.14, 0.036, 0.034), (0.2, 0.032, 0.031), (0.215, 0.033, 0.031), (0.25, 0.035, 0.032),
       (0.3, 0.032, 0.029), (0.36, 0.026, 0.023), (0.405, 0.022, 0.018), (0.42, 0.023, 0.017)]
HAND = [(0.405, 0.022, 0.017), (0.43, 0.032, 0.016), (0.465, 0.037, 0.015), (0.498, 0.034, 0.013), (0.526, 0.026, 0.011), (0.54, 0.014, 0.007)]
ARM_DROP = math.radians(42)   # the A-pose: arms this far from straight down
UPPER, FORE = 0.215, 0.2
def arm(sx):
    S = V(sx * 0.128, 0.005, 1.105)
    dU = V(sx * math.sin(ARM_DROP), 0, -math.cos(ARM_DROP))
    dF = (dU + V(0, -0.1, 0)).normalized()   # the forearm comes a little forward
    E = S + dU * UPPER
    return S, E, E + dF * FORE, E + dF * (HAND[-1][0] - UPPER), dU, dF
def arm_point(sx, d):
    S, E, W, H, dU, dF = arm(sx)
    return S + dU * d if d <= UPPER else E + dF * (d - UPPER)
FRONT = V(0, -1, 0)
def arm_rings(sx, spec, grow=0.0):
    return [(arm_point(sx, d), ru + (grow(d) if callable(grow) else grow), rv + (grow(d) if callable(grow) else grow)) for d, ru, rv in spec]
def leg_rings(sx, spec, grow=0.0):
    return [(V(sx * LEG_X, y, z), rx + (grow(z) if callable(grow) else grow), ry + (grow(z) if callable(grow) else grow)) for z, y, rx, ry in spec]
def torso_rings(spec, grow=0.0):
    return [(V(0, y, z), rx + (grow(z) if callable(grow) else grow), ry + (grow(z) if callable(grow) else grow)) for z, y, rx, ry in spec]
TORSO_POWER = 2.35

# ---- Skeleton -----------------------------------------------------------------------------------------------
BONES = {
    "hips": ((0, 0.004, 0.74), (0, 0.002, 0.86), None),
    "spine": ((0, 0.002, 0.86), (0, -0.002, 0.98), "hips"),
    "chest": ((0, -0.002, 0.98), (0, 0.004, 1.135), "spine"),
    "neck": ((0, 0.004, 1.135), (0, 0.0, 1.215), "chest"),
    "head": ((0, 0.0, 1.215), (0, 0, 1.5), "neck"),
    "hair_back": ((0, 0.11, 1.3), (0, 0.12, 1.12), "head"),
    "hair_back2": ((0, 0.12, 1.12), (0, 0.12, 0.9), "hair_back"),
    "hair_tail": ((0, 0.13, 1.44), (0, 0.2, 1.25), "head"),
}
for side, sx in (("L", 1), ("R", -1)):
    S, E, W, H, dU, dF = arm(sx)
    BONES.update({
        f"upperarm_{side}": (S, E, "chest"),
        f"forearm_{side}": (E, W, f"upperarm_{side}"),
        f"hand_{side}": (W, H, f"forearm_{side}"),
        f"thigh_{side}": ((sx * 0.068, 0.006, 0.72), (sx * LEG_X, -0.006, 0.385), "hips"),
        f"shin_{side}": ((sx * LEG_X, -0.006, 0.385), (sx * LEG_X, 0.006, 0.075), f"thigh_{side}"),
        f"foot_{side}": ((sx * LEG_X, 0.006, 0.075), (sx * LEG_X, -0.1, 0.02), f"shin_{side}"),
        f"hair_{side}": ((sx * 0.12, -0.03, 1.36), (sx * 0.13, -0.04, 1.2), "head"),
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
bpy.ops.object.mode_set(mode="OBJECT")
HAIR_BONES = {"hair_back", "hair_back2", "hair_tail", "hair_L", "hair_R"}
for name in HAIR_BONES:
    arm_data.bones[name].use_deform = False   # keep them out of the body's automatic weights

# ---- Body -------------------------------------------------------------------------------------------------
bm = bmesh.new()
loft(bm, torso_rings(TORSO), seg=28, power=TORSO_POWER)
loft(bm, [(V(0, 0.006, 1.12), 0.04, 0.038), (V(0, 0.004, 1.17), 0.034, 0.034), (V(0, 0.0, 1.22), 0.033, 0.034), (V(0, -0.004, 1.26), 0.034, 0.035)], seg=16)
for sx in (1, -1):
    loft(bm, leg_rings(sx, LEG), seg=20)
    loft(bm, arm_rings(sx, ARM), seg=16, ref=FRONT)
    loft(bm, arm_rings(sx, HAND), seg=14, ref=FRONT)
    S, E, W, H, dU, dF = arm(sx)
    loft(bm, [(arm_point(sx, 0.425) + FRONT * 0.02, 0.013, 0.013), (arm_point(sx, 0.452) + FRONT * 0.04, 0.012, 0.011), (arm_point(sx, 0.484) + FRONT * 0.051, 0.008, 0.0075)], seg=8, ref=dF.cross(FRONT))
body = link("body", bm)
fuse(body, voxel=0.0055, smooth_steps=4, keep=0.14)

# ---- Head -------------------------------------------------------------------------------------------------
FACE_W = 0.27   # the painted face covers this window, centred on the head
bm = bmesh.new()
made = bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1)
for v in made["verts"]:
    x, y, z = v.co
    front = smooth(0.25, -0.75, y)
    low = max(0.0, -z)
    X = x * 0.124
    Y = y * 0.14
    Z = z * (0.14 if z > 0 else 0.152)
    # Full cheeks, then the jaw closes to a small soft chin; the back of the skull tucks in towards the neck.
    X *= 1 - 0.5 * smooth(0.3, 1.0, low) ** 1.05 * (0.4 + 0.6 * front)
    X *= 1 + 0.05 * front * math.exp(-((z + 0.42) / 0.25) ** 2)           # cheeks
    Y *= 1 - 0.1 * front * (1 - low)                                      # a flatter face
    Y -= 0.08 * low ** 1.3                                                # the chin sits forward, under the face
    Y *= 1 - 0.22 * (1 - front) * smooth(0.1, 0.9, low)
    Z *= 1 + 0.04 * smooth(-0.2, 0.9, y) * (1 if z > 0 else 0)            # a rounder back of the crown
    # A small nose.
    Y -= 0.009 * math.exp(-((x / 0.1) ** 2 + ((z + 0.56) / 0.08) ** 2)) * front
    v.co = V(X, Y, Z) + HEAD_C
for sx in (1, -1):
    ellipsoid(bm, HEAD_C + V(sx * 0.119, 0.012, -0.03), (0.012, 0.02, 0.031), seg=10, rings=8)
head = link("head", bm, "face")   # one material for the whole head: the painted face fades into plain skin at its edges
uv = head.data.uv_layers.new(name="UVMap")
for loop in head.data.loops:
    co = head.data.vertices[loop.vertex_index].co - HEAD_C
    uv.data[loop.index].uv = (0.5 + co.x / FACE_W, 0.5 + co.z / FACE_W)

# ---- Clothes ----------------------------------------------------------------------------------------------
def piece(name, build, material=None, voxel=0.0065, keep=0.18, smooth_steps=2):
    bm = bmesh.new()
    build(bm)
    obj = link(name, bm, material or name)
    return fuse(obj, voxel=voxel, smooth_steps=smooth_steps, keep=keep)

def tee(bm, hem=0.795, grow=0.011, sleeve=0.125, loose=0.012):
    def torso_grow(z):
        return grow + loose * smooth(0.95, hem, z) + 0.004 * smooth(0.84, 0.8, z)
    loft(bm, torso_rings(cut(TORSO, hem, 1.15), torso_grow), seg=28, power=TORSO_POWER)
    for sx in (1, -1):
        loft(bm, arm_rings(sx, cut(ARM, -0.03, sleeve), lambda d: grow + 0.006 * smooth(0.05, sleeve, d)), seg=16, ref=FRONT)
def hoodie(bm):
    def torso_grow(z):
        return 0.02 + 0.016 * math.sin(math.pi * smooth(0.76, 1.0, z)) - 0.008 * smooth(0.79, 0.75, z)
    loft(bm, torso_rings(cut(TORSO, 0.745, 1.158), torso_grow), seg=28, power=TORSO_POWER)
    for sx in (1, -1):
        loft(bm, arm_rings(sx, cut(ARM, -0.03, 0.4), lambda d: 0.016 + 0.006 * math.sin(math.pi * smooth(0.02, 0.37, d)) - 0.006 * smooth(0.365, 0.385, d)), seg=16, ref=FRONT)
    ellipsoid(bm, (0, -0.088, 0.865), (0.07, 0.03, 0.045))            # the front pocket
    made = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=8, radius=1)   # a soft collar where the hood meets the neck
    for v in made["verts"]:
        a = math.atan2(v.co.y, v.co.x)
        v.co = V(math.cos(a) * 0.058 + v.co.x * 0.02, math.sin(a) * 0.052 + v.co.y * 0.02 + 0.008, 1.16 + v.co.z * 0.022)
def hood(bm):
    ellipsoid(bm, (0, 0.078, 1.14), (0.092, 0.05, 0.075), seg=20, rings=12)
    ellipsoid(bm, (0, 0.1, 1.09), (0.06, 0.04, 0.06), seg=16, rings=10)
def legs(bm, top, hem, grow, flare=0.0, hip_from=0.69):
    def g(z):
        return grow + flare * smooth(hem + 0.14, hem, z)
    loft(bm, torso_rings(cut(TORSO, 0.675, top), lambda z: grow + 0.003), seg=28, power=TORSO_POWER)
    for sx in (1, -1):
        rings = leg_rings(sx, cut(LEG, hem, 0.78), g)
        c, rx, ry = rings[-1]
        rings.append((c - V(0, 0, 0.007), rx - (grow + flare) * 0.8, ry - (grow + flare) * 0.8))   # the hem rolls in to the leg
        loft(bm, rings, seg=20)
def socks(bm):
    for sx in (1, -1):
        loft(bm, leg_rings(sx, cut(LEG, 0.06, 0.215), 0.0065), seg=18)
def shoes(bm):
    for sx in (1, -1):
        x = sx * (LEG_X + 0.002)
        loft(bm, [(V(x, 0.052, 0.045), 0.018, 0.026), (V(x, 0.034, 0.05), 0.033, 0.042), (V(x, 0.004, 0.053), 0.039, 0.046), (V(x, -0.035, 0.044), 0.042, 0.037),
                  (V(x, -0.075, 0.036), 0.043, 0.03), (V(x, -0.108, 0.031), 0.037, 0.025), (V(x, -0.128, 0.027), 0.022, 0.016)], seg=18)
        loft(bm, [(V(sx * LEG_X, 0.007, 0.05), 0.033, 0.037), (V(sx * LEG_X, 0.007, 0.1), 0.031, 0.035), (V(sx * LEG_X, 0.007, 0.118), 0.03, 0.033)], seg=16)
def soles(bm):
    for sx in (1, -1):
        x = sx * (LEG_X + 0.002)
        loft(bm, [(V(x, 0.056, 0.012), 0.02, 0.012), (V(x, 0.036, 0.012), 0.036, 0.012), (V(x, 0.004, 0.012), 0.042, 0.012), (V(x, -0.035, 0.012), 0.045, 0.012),
                  (V(x, -0.075, 0.012), 0.046, 0.012), (V(x, -0.11, 0.012), 0.04, 0.012), (V(x, -0.133, 0.012), 0.024, 0.011)], seg=18, power=3)

cloth = {}
cloth["tee"] = piece("tee", tee)
cloth["hoodie"] = piece("hoodie", hoodie)
cloth["hood"] = piece("hood", hood, keep=0.4)
cloth["pants"] = piece("pants", lambda bm: legs(bm, 0.875, 0.088, 0.011, flare=0.007))
cloth["shorts"] = piece("shorts", lambda bm: legs(bm, 0.875, 0.535, 0.013, flare=0.012))
cloth["dressTop"] = piece("dressTop", lambda bm: tee(bm, hem=0.87, grow=0.01, sleeve=0.1, loose=0.0))
cloth["socks"] = piece("socks", socks, keep=0.4)
cloth["shoes"] = piece("shoes", shoes, voxel=0.005, keep=0.25)
cloth["sole"] = piece("sole", soles, voxel=0.005, keep=0.3, smooth_steps=1)

# A flared, softly pleated skirt.
SKIRT = [(0.905, 0.106, 0.08), (0.875, 0.128, 0.1), (0.8, 0.168, 0.14), (0.7, 0.2, 0.172), (0.6, 0.224, 0.196), (0.53, 0.236, 0.208)]
bm = bmesh.new()
rows = []
for k, (z, rx, ry) in enumerate(SKIRT):
    depth = k / (len(SKIRT) - 1)
    rows.append([bm.verts.new(V(rx * math.cos(a) * (1 + 0.045 * depth * math.cos(12 * a)), 0.006 + ry * math.sin(a) * (1 + 0.045 * depth * math.cos(12 * a)), z))
                 for a in (i / 72 * TAU for i in range(72))])
for a, b in zip(rows, rows[1:]):
    for i in range(72):
        j = (i + 1) % 72
        bm.faces.new((a[i], b[i], b[j], a[j]))
skirt = link("skirt", bm, "skirt", normals=False)
modify(skirt, "SOLIDIFY", thickness=0.01, offset=-1)
cloth["skirt"] = skirt
# A round collar and a ribbon bow for the dress.
bm = bmesh.new()
for sx in (1, -1):
    pts = [V(sx * 0.006, -0.074, 1.112), V(sx * 0.03, -0.078, 1.098), V(sx * 0.06, -0.06, 1.118), V(sx * 0.074, -0.014, 1.15), V(sx * 0.062, 0.034, 1.16), V(sx * 0.032, 0.058, 1.162), V(sx * 0.002, 0.064, 1.162)]
    loft(bm, [(V(p.x * 1.1, p.y * 1.12, p.z + 0.009), 0.022 if 0 < i < 6 else 0.013, 0.009) for i, p in enumerate(pts)], seg=10, ref=V(0, 0, 1))
cloth["collar"] = link("collar", bm, "collar")
modify(cloth["collar"], "SUBSURF", levels=1)
bm = bmesh.new()
BOW = V(0, -0.094, 1.074)
for sx in (1, -1):
    loft(bm, [(BOW, 0.009, 0.007), (BOW + V(sx * 0.026, -0.004, 0.006), 0.026, 0.011), (BOW + V(sx * 0.05, 0.002, 0.008), 0.03, 0.009), (BOW + V(sx * 0.058, 0.006, 0.006), 0.016, 0.005)], seg=10, ref=V(0, 0, 1))
    loft(bm, [(BOW, 0.009, 0.006), (BOW + V(sx * 0.016, -0.004, -0.04), 0.013, 0.006), (BOW + V(sx * 0.026, -0.002, -0.075), 0.008, 0.004)], seg=8, ref=V(1, 0, 0))
ellipsoid(bm, BOW + V(0, -0.004, 0), (0.013, 0.011, 0.013), seg=10, rings=6)
cloth["bow"] = link("bow", bm, "bow")
modify(cloth["bow"], "SUBSURF", levels=1)
# Overalls: a bib over the tee and straps over the shoulders.
def tee_surface(z, angle, out):
    row = cut(TORSO, z, z)[0]
    g = 0.011 + 0.012 * smooth(0.95, 0.795, z) + out
    e = 2 / TORSO_POWER
    ca, sa = math.cos(angle), math.sin(angle)   # angle 0 = straight ahead
    return V((row[2] + g) * math.copysign(abs(sa) ** e, sa), row[1] - (row[3] + g) * abs(ca) ** e, z)
bm = bmesh.new()
rows = [[tee_surface(z, math.radians(a), 0.004) for a in range(-38, 39, 4)] for z in (0.865, 0.9, 0.94, 0.98, 1.02, 1.05)]
rows = [[bm.verts.new(p) for p in row] for row in rows]
for a, b in zip(rows, rows[1:]):
    for i in range(len(a) - 1):
        bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
bib = link("bib", bm, "bib", normals=False)
modify(bib, "SOLIDIFY", thickness=0.012, offset=1)
cloth["bib"] = bib
bm = bmesh.new()
for sx in (1, -1):
    pts = [V(sx * 0.06, -0.104, 1.035), V(sx * 0.068, -0.1, 1.08), V(sx * 0.076, -0.072, 1.13), V(sx * 0.08, -0.02, 1.16), V(sx * 0.076, 0.035, 1.152),
           V(sx * 0.062, 0.078, 1.1), V(sx * 0.04, 0.094, 1.02), V(sx * 0.015, 0.09, 0.93), V(sx * 0.0, 0.094, 0.87)]
    loft(bm, [(p, 0.014, 0.007) for p in pts], seg=8, ref=V(1, 0, 0), power=3)
cloth["strap"] = link("strap", bm, "strap")

# ---- Hair -------------------------------------------------------------------------------------------------
HR = V(0.13, 0.148, 0.147)   # the hair's shell round the skull
DOWN = V(0, 0, -1)
def dirv(theta, phi):
    """theta: 0 = front, 90 = the character's left, 180 = back; phi: 0 = straight up."""
    t, p = math.radians(theta), math.radians(phi)
    return V(math.sin(p) * math.sin(t), -math.sin(p) * math.cos(t), math.cos(p))
def on_shell(d, lift=0.0):
    return HEAD_C + V(d.x * (HR.x + lift), d.y * (HR.y + lift), d.z * (HR.z + lift) + 0.004)
class Hair:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.meta = []   # per vertex: (kind, distance hung below the scalp)
    def tube(self, points, widths, thick, kind="head", hung=None, normal=None):
        """A clump along points; widths per point; lens-shaped section, closed to a tip at the end."""
        bm = self.bm
        loops = []
        n = len(points)
        for i, p in enumerate(points):
            t = (points[min(i + 1, n - 1)] - points[max(i - 1, 0)]).normalized()
            out = normal(p, t) if normal else V(p.x, p.y - HEAD_C.y, max(0.0, p.z - HEAD_C.z) * 1.0)
            if out.length < 1e-5: out = V(0, 1, 0)
            b = t.cross(out)
            if b.length < 1e-5: b = V(1, 0, 0)
            b.normalize()
            nrm = b.cross(t).normalized()
            w, th = widths[i], thick * (0.35 + 0.65 * widths[i] / max(widths))
            section = [(1, 0), (0.55, 0.9), (-0.55, 0.9), (-1, 0), (-0.55, -0.45), (0.55, -0.45)]
            loops.append([bm.verts.new(p + b * w * sx + nrm * th * sy) for sx, sy in section])
            self.meta += [(kind, hung[i] if hung else 0.0)] * 6
        for a, c in zip(loops, loops[1:]):
            for k in range(6):
                j = (k + 1) % 6
                bm.faces.new((a[k], a[j], c[j], c[k]))
        for loop in (loops[0], loops[-1]):
            centre = bm.verts.new(sum((v.co for v in loop), Vector()) / 6)
            self.meta.append((kind, hung[0 if loop is loops[0] else -1] if hung else 0.0))
            for k in range(6):
                bm.faces.new((centre, loop[k], loop[(k + 1) % 6]))
    def strand(self, d0, d1, hang=0.0, w=0.034, thick=0.013, lift=0.006, out=0.0, up=0.0, wave=0.0, kind="head", tip=0.5, steps=7, curl=0.0, side=0.0):
        """From d0 to d1 over the scalp, then hanging `hang` further: falling, flicking out/up or curling in."""
        pts, hung = [], []
        angle = d0.angle(d1)
        for i in range(steps + 1):
            t = i / steps
            d = d0.slerp(d1, t) if angle > 1e-4 else d0
            pts.append(on_shell(d.normalized(), lift * (0.4 + 0.9 * math.sin(math.pi * min(1, t * 0.9 + 0.1)))))
            hung.append(0.0)
        if hang > 0:
            hsteps = max(3, int(hang / 0.03) + 2)
            v = (pts[-1] - pts[-2]).normalized()
            p = pts[-1].copy()
            for i in range(1, hsteps + 1):
                s = i / hsteps
                radial = V(p.x, p.y - HEAD_C.y, 0)
                radial = radial.normalized() if radial.length > 1e-4 else V(0, 1, 0)
                target = (DOWN * (1 - up * s) + radial * (out * s * s - curl * s * s) + V(0, 0, 1) * up * s * 1.5 + V(1, 0, 0) * side * s).normalized()
                v = (v * (1 - 0.45) + target * 0.45).normalized()
                p = p + v * (hang / hsteps)
                if wave:
                    across = v.cross(radial).normalized()
                    pts.append(p + across * wave * math.sin(s * hang / 0.045 + rng.random() * 0.3) + radial * wave * 0.6 * math.cos(s * hang / 0.045))
                else:
                    pts.append(p.copy())
                hung.append(s * hang)
        n = len(pts)
        widths = []
        for i in range(n):
            s = i / (n - 1)
            widths.append(max(0.0015, w * (0.3 + 0.7 * smooth(0, 0.3, s)) * (1 - smooth(tip, 1.0, s) ** 1.3 * 0.97)))
        self.tube(pts, widths, thick, kind, hung)
    def cap(self, front=52, side=96, back=122):
        """The scalp under the clumps, down to the hairline."""
        made = bmesh.ops.create_uvsphere(self.bm, u_segments=32, v_segments=20, radius=1)
        drop = []
        for v in made["verts"]:
            d = v.co.normalized()
            theta = abs(math.degrees(math.atan2(d.x, -d.y)))
            phi = math.degrees(math.acos(max(-1, min(1, d.z))))
            limit = lerp(front, side, smooth(40, 88, theta)) if theta < 90 else lerp(side, back, smooth(90, 150, theta))
            if phi > limit + 4:
                drop.append(v)
            else:
                v.co = on_shell(d, -0.005)
                self.meta.append(("head", 0.0))
        bmesh.ops.delete(self.bm, geom=drop, context="VERTS")
    def ball(self, centre, radius, kind="head"):
        made = bmesh.ops.create_icosphere(self.bm, subdivisions=2, radius=1)
        for v in made["verts"]:
            n = 1 + 0.06 * math.sin(v.co.z * 9 + math.atan2(v.co.y, v.co.x) * 3)
            v.co = Vector(centre) + v.co * radius * n
            self.meta.append((kind, 0.0))
    def finish(self):
        # The cap is deleted from in the middle of the vertex list, so rebuild meta by order: cap verts first.
        obj = link(f"hair_{self.name}", self.bm, "hair")
        return obj

def bangs(h, tips, w=0.036, hang=0.012, out=0.0, up=0.0, sweep=8, thick=0.013, wave=0.0, part=None):
    for i, (theta, phi) in enumerate(tips):
        root = dirv(theta * 0.45 + (180 if False else 0), 16) if part is None else dirv(part + theta * 0.25, 14)
        h.strand(root, dirv(theta + sweep, phi), hang=hang * (0.7 + 0.6 * rng.random()), w=w * (0.85 + 0.3 * rng.random()), thick=thick, lift=0.006 + 0.006 * (i % 2),
                 out=out, up=up, kind="head", tip=0.45, steps=7, wave=wave)
def sides(h, hang, w=0.034, out=0.0, curl=0.0, wave=0.0, thick=0.013, phi=98, thetas=(70, 86, 100)):
    for sx in (1, -1):
        for i, theta in enumerate(thetas):
            h.strand(dirv(sx * theta * 0.75, 12), dirv(sx * theta, phi), hang=hang * (1 - 0.12 * i) * (0.9 + 0.2 * rng.random()), w=w, thick=thick, lift=0.005 + 0.006 * (i % 2),
                     out=out, curl=curl, wave=wave, kind="L" if sx > 0 else "R", tip=0.55)
def back(h, hang, w=0.04, out=0.0, up=0.0, curl=0.0, wave=0.0, thick=0.014, phi=112, count=9, layers=2, kind="back", tip=0.55, start=112):
    for layer in range(layers):
        n = count - layer
        for i in range(n):
            theta = lerp(start, 360 - start, (i + 0.5 * (layer == 1) + (0 if layer else 0)) / (count - 1)) if n > 1 else 180
            jitter = rng.uniform(-3, 3)
            h.strand(dirv(theta * 1.0 + jitter, 8 + 5 * layer), dirv(theta + jitter, phi - 10 * layer), hang=hang * (1 - 0.18 * layer) * (0.88 + 0.24 * rng.random()), w=w, thick=thick,
                     lift=0.004 + 0.008 * layer + 0.004 * (i % 2), out=out, up=up, curl=curl, wave=wave, kind=kind, tip=tip)
BANG_TIPS = [(-66, 86), (-50, 80), (-34, 85), (-18, 78), (-3, 90), (12, 79), (28, 85), (44, 80), (61, 87)]

def style_short(h):
    h.cap()
    bangs(h, BANG_TIPS)
    sides(h, 0.05, out=0.15)
    back(h, 0.035, out=0.5, phi=116)
def style_bob(h):
    h.cap()
    bangs(h, BANG_TIPS, hang=0.025)
    sides(h, 0.14, curl=0.5, w=0.038)
    back(h, 0.12, curl=0.6, w=0.044, phi=106)
def style_long(h):
    h.cap()
    bangs(h, BANG_TIPS, hang=0.03)
    sides(h, 0.3, w=0.036, thetas=(68, 84))
    back(h, 0.42, w=0.046, phi=104, count=9, tip=0.7)
def style_ponytail(h):
    h.cap(back=128)
    bangs(h, BANG_TIPS)
    sides(h, 0.1, thetas=(72,))
    tie = dirv(180, 58)
    for theta in list(range(70, 291, 20)):
        for phi in (100, 122) if 100 < theta < 260 else (96,):
            h.strand(dirv(theta, phi), tie, w=0.05, thick=0.01, lift=0.004 + 0.004 * ((theta // 20) % 2), tip=0.9, steps=6)
    knot = on_shell(tie, 0.012)
    h.ball(knot, 0.03)
    for i, (dx, length) in enumerate([(-0.035, 0.3), (0.0, 0.36), (0.035, 0.3), (-0.018, 0.33), (0.018, 0.32)]):
        pts, hung = [], []
        for k in range(10):
            s = k / 9
            pts.append(knot + V(dx * smooth(0, 0.5, s) * (1.6 if i < 3 else 1), 0.03 + 0.1 * math.sin(s * 1.9) - 0.02 * s + (0.012 if i > 2 else 0), 0.035 * math.sin(s * 3.0) - length * s * s * 0.25 - length * s * 0.75))
            hung.append(s * length)
        widths = [0.03 * (0.5 + 0.5 * smooth(0, 0.25, k / 9)) * (1 - smooth(0.55, 1, k / 9) ** 1.3 * 0.96) for k in range(10)]
        h.tube(pts, widths, 0.016, "tail", hung, normal=lambda p, t: t.cross(V(1, 0, 0)))
def style_buns(h):
    h.cap(back=128)
    bangs(h, BANG_TIPS)
    sides(h, 0.12, thetas=(72,))
    for sx in (1, -1):
        bun = dirv(sx * 128, 40)
        for theta in range(0, 181, 18):
            h.strand(dirv(sx * theta, 100 if theta > 90 else 60 + theta * 0.4), bun, w=0.05, thick=0.01, lift=0.004 + 0.004 * ((theta // 18) % 2), tip=0.9, steps=6)
        h.strand(dirv(sx * 170, 122), bun, w=0.05, thick=0.01, tip=0.9, steps=6)
        h.ball(on_shell(bun, 0.03), 0.058)
def style_spiky(h):
    h.cap()
    bangs(h, [(t, p - 8) for t, p in BANG_TIPS], hang=0.035, out=0.9, w=0.034)
    sides(h, 0.05, out=1.2, phi=92)
    back(h, 0.07, out=1.6, up=0.5, phi=96, count=8, w=0.042)
    for theta, phi in [(-40, 28), (30, 22), (150, 30), (-140, 34), (90, 36), (-95, 40)]:
        h.strand(dirv(theta, 4), dirv(theta, phi), hang=0.07, out=1.4, up=1.0, w=0.036, lift=0.01, tip=0.4)
def style_curly(h):
    h.cap()
    bangs(h, BANG_TIPS, hang=0.03, wave=0.007, w=0.04, thick=0.018)
    sides(h, 0.15, wave=0.012, w=0.04, thick=0.02, out=0.3)
    back(h, 0.15, wave=0.012, w=0.046, thick=0.021, out=0.35, phi=104)

SWAY = {"back": "hair_back", "L": "hair_L", "R": "hair_R", "tail": "hair_tail"}
hair_objects = []
for name, build in (("short", style_short), ("bob", style_bob), ("long", style_long), ("ponytail", style_ponytail), ("buns", style_buns), ("spiky", style_spiky), ("curly", style_curly)):
    h = Hair(name)
    build(h)
    # Sway weights by how far each point hangs below the scalp. (Vertex order: bmesh keeps creation order, minus the
    # deleted cap vertices, whose meta were never recorded.)
    obj = link(f"hair_{name}", h.bm, "hair")
    assert len(obj.data.vertices) == len(h.meta), (name, len(obj.data.vertices), len(h.meta))
    groups = {b: obj.vertex_groups.new(name=b) for b in ("head", "hair_back", "hair_back2", "hair_L", "hair_R", "hair_tail")}
    for i, (kind, hung) in enumerate(h.meta):
        bone = SWAY.get(kind)
        w = smooth(0.0, 0.14, hung) if bone else 0.0
        w2 = smooth(0.2, 0.42, hung) if kind == "back" else 0.0
        groups["head"].add([i], 1 - w, "REPLACE")
        if bone and w > 0:
            groups[bone].add([i], w * (1 - w2), "REPLACE")
        if w2 > 0:
            groups["hair_back2"].add([i], w * w2, "REPLACE")
    hair_objects.append(obj)

# ---- Body regions ------------------------------------------------------------------------------------------
SLOTS = ["bNeck", "bChest", "bArmU", "bArmL", "bHand", "bHips", "bLegU", "bLegL", "bAnkle"]
for name in SLOTS:
    body.data.materials.append(mat(name))
def arm_reach(c):
    best = (1e9, 0)
    for sx in (1, -1):
        S, E, W, H, dU, dF = arm(sx)
        for a, b, base in ((S, E, 0.0), (E, H, UPPER)):
            ab = b - a
            t = max(0, min(1, (c - a).dot(ab) / ab.length_squared))
            dist = (a + ab * t - c).length
            if dist < best[0]:
                best = (dist, base + t * ab.length)
    return best
for poly in body.data.polygons:
    c = poly.center
    dist, d = arm_reach(c)
    if d > 0.105 and dist < 0.06:
        region = "bArmU" if d < 0.2 else "bArmL" if d < 0.398 else "bHand"
    elif c.z < 0.69:
        region = "bHips" if c.z > 0.545 else "bLegU" if c.z > 0.39 else "bLegL" if c.z > 0.2 else "bAnkle"
    else:
        region = "bHips" if c.z < 0.86 else "bChest" if c.z < 1.14 else "bNeck"
    poly.material_index = SLOTS.index(region)

# ---- Skinning ----------------------------------------------------------------------------------------------
def parent(obj):
    activate(obj)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
def bind_auto(obj):
    parent(obj)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
def bind_groups(obj):
    parent(obj)
    bpy.ops.object.parent_set(type="ARMATURE")
def bind_bone(obj, weights):
    """weights(co) -> {bone: weight}"""
    groups = {}
    for v in obj.data.vertices:
        for bone, w in weights(v.co).items():
            if w > 0:
                groups.setdefault(bone, obj.vertex_groups.new(name=bone) if bone not in obj.vertex_groups else obj.vertex_groups[bone]).add([v.index], w, "REPLACE")
    bind_groups(obj)
def bind_like_body(obj):
    m = obj.modifiers.new("weights", "DATA_TRANSFER")
    m.object = body
    m.use_vert_data = True
    m.data_types_verts = {"VGROUP_WEIGHTS"}
    m.vert_mapping = "POLYINTERP_NEAREST"
    activate(obj)
    bpy.ops.object.datalayout_transfer(modifier=m.name)
    bpy.ops.object.modifier_apply(modifier=m.name)
    bind_groups(obj)

bind_auto(body)
bind_bone(head, lambda co: {"head": 1})
for name in ("tee", "hoodie", "pants", "shorts", "dressTop", "socks", "bib", "strap"):
    bind_like_body(cloth[name])
for name in ("hood", "collar", "bow"):
    bind_bone(cloth[name], lambda co: {"chest": 1})
for name in ("shoes", "sole"):
    bind_bone(cloth[name], lambda co: {"foot_L" if co.x > 0 else "foot_R": 1})
def skirt_weights(co):
    legs_w = 0.42 * smooth(0.86, 0.6, co.z)
    left = smooth(-0.12, 0.12, co.x)
    return {"hips": 1 - legs_w, "thigh_L": legs_w * left, "thigh_R": legs_w * (1 - left)}
bind_bone(cloth["skirt"], skirt_weights)
for name in HAIR_BONES:
    arm_data.bones[name].use_deform = True
for obj in hair_objects:
    bind_groups(obj)

bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format="GLB", export_yup=True, export_skins=True, export_animations=False,
                          export_materials="EXPORT", export_texcoords=True, export_normals=True, export_apply=True, export_all_influences=False)

# ---- Pack: 16-bit positions, 8-bit normals and weights (KHR_mesh_quantization), about half the size -------------
import json
import struct
import numpy as np
UNIT = 1e-4   # stored positions are whole numbers of this; the skin's inverse bind matrices scale them back
def pack(path):
    data = open(path, "rb").read()
    json_len = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + json_len])
    binary = data[20 + json_len + 8:]
    out = bytearray()
    views = []
    def read(accessor):
        view = gltf["bufferViews"][accessor["bufferView"]]
        kind = {5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[accessor["componentType"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[accessor["type"]]
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        return np.frombuffer(binary, dtype=kind, count=accessor["count"] * width, offset=start).reshape(accessor["count"], width)
    def write(accessor, array, component, target=None, normalized=False):
        while len(out) % 4: out.append(0)
        raw = np.ascontiguousarray(array).tobytes()
        view = {"buffer": 0, "byteOffset": len(out), "byteLength": len(raw)}
        if target: view["target"] = target
        if array.ndim == 2 and target == 34962 and array.shape[1] * array.itemsize % 4 == 0: view["byteStride"] = array.shape[1] * array.itemsize
        views.append(view)
        out.extend(raw)
        accessor.update(bufferView=len(views) - 1, componentType=component)
        accessor.pop("byteOffset", None)
        accessor.pop("normalized", None)
        if normalized: accessor["normalized"] = True
    roles = {}
    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            for name, index in prim["attributes"].items(): roles[index] = name
            roles[prim["indices"]] = "INDEX"
    for skin in gltf.get("skins", []): roles[skin["inverseBindMatrices"]] = "IBM"
    for index, accessor in enumerate(gltf["accessors"]):
        role = roles.get(index)
        array = read(accessor)
        if role == "POSITION":
            q = np.round(array / UNIT).astype("<i2")
            q = np.concatenate([q, np.zeros((len(q), 1), "<i2")], axis=1)   # padded to 8 bytes
            write(accessor, q[:, :3] if False else q, 5122, 34962)
            accessor["type"] = "VEC3"
            views[-1]["byteStride"] = 8
            accessor["min"] = [int(v) for v in q[:, :3].min(axis=0)]
            accessor["max"] = [int(v) for v in q[:, :3].max(axis=0)]
        elif role == "NORMAL":
            q = np.round(array * 127).astype("i1")
            q = np.concatenate([q, np.zeros((len(q), 1), "i1")], axis=1)
            write(accessor, q, 5120, 34962, normalized=True)
            views[-1]["byteStride"] = 4
        elif role == "WEIGHTS_0":
            q = np.round(array / np.maximum(array.sum(axis=1, keepdims=True), 1e-6) * 255).astype("u1")
            write(accessor, q, 5121, 34962, normalized=True)
        elif role == "IBM":
            m = array.reshape(-1, 4, 4).copy()   # column-major: rows of this array are the matrix's columns
            m[:, :3, :] *= UNIT
            write(accessor, m.reshape(-1, 16).astype("<f4"), 5126)
        elif role == "INDEX":
            write(accessor, array.astype("<u2") if array.max() < 65535 else array.astype("<u4"), 5123 if array.max() < 65535 else 5125, 34963)
        else:
            write(accessor, array, accessor["componentType"], 34962 if role else None)
    while len(out) % 4: out.append(0)
    gltf["bufferViews"] = views
    gltf["buffers"] = [{"byteLength": len(out)}]
    gltf["extensionsUsed"] = sorted(set(gltf.get("extensionsUsed", [])) | {"KHR_mesh_quantization"})
    gltf["extensionsRequired"] = sorted(set(gltf.get("extensionsRequired", [])) | {"KHR_mesh_quantization"})
    text = json.dumps(gltf, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(text) + 8 + len(out)))
        f.write(struct.pack("<I4s", len(text), b"JSON") + text)
        f.write(struct.pack("<I4s", len(out), b"BIN\0") + bytes(out))
print("vertices", {o.name: len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH"})
print("exported", os.path.getsize(OUT))
pack(os.path.abspath(OUT))
print("wrote", os.path.abspath(OUT), os.path.getsize(OUT))
