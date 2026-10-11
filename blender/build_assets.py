"""
Iroh's Tea House - procedural asset builder (Blender 4.2+ / 5.x).

Builds every chibi character, dish and prop used by the game and exports them
as GLB files. Characters reuse the body parts and the 13-bone rig of the
hand-made Aang asset (Aang_GameReady.blend) so they all share one style,
one skeleton and one animation set.

Usage (run from the project root):
  blender -b Aang_GameReady/Aang_GameReady.blend --python blender/build_assets.py -- public/models [preview_dir]

The source .blend is never saved; everything happens in memory.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Quaternion, Euler

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(ARGV[0] if ARGV else "public/models")
PREVIEW = os.path.abspath(ARGV[1]) if len(ARGV) > 1 else None
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
scene.render.fps = 30
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'

GEN = bpy.data.collections.new("Generated")
scene.collection.children.link(GEN)

HC = Vector((0.0, 0.015, 0.777))      # head centre of the shared chibi head
HR = Vector((0.228, 0.21, 0.22))      # head radii

# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------
def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hexcol(h):
    h = h.lstrip('#')
    return tuple(_lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))

_mats = {}
def M(h, rough=0.72, alpha=1.0, emit=0.0, metal=0.0):
    key = (h, rough, alpha, emit, metal)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new("M_%s%s%s%s" % (h.strip('#'), "_r%d" % int(rough * 100),
                                                "_a" if alpha < 1 else "", "_e" if emit else ""))
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get("Principled BSDF")
    c = hexcol(h)
    b.inputs["Base Color"].default_value = (*c, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
    if emit > 0:
        b.inputs["Emission Color"].default_value = (*c, 1.0)
        b.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = (*c, alpha)
    _mats[key] = m
    return m

# --------------------------------------------------------------------------
# Mesh helpers (bmesh based, no operator context needed)
# --------------------------------------------------------------------------
def _finish(name, bm, mat, bone, smooth=True):
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    GEN.objects.link(ob)
    me.materials.append(mat)
    ob["bone"] = bone
    return ob

def _mat4(loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), quat=None):
    R = quat.to_matrix().to_4x4() if quat is not None else \
        Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
    return Matrix.Translation(Vector(loc)) @ R @ Matrix.Diagonal((*scale, 1.0))

def _bevel_sharp(bm, offset, segs=2, angle=40):
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and
             e.link_faces[0].normal.angle(e.link_faces[1].normal, 0) > math.radians(angle)]
    if edges and offset > 0:
        bmesh.ops.bevel(bm, geom=edges, offset=offset, segments=segs, profile=0.5,
                        affect='EDGES', clamp_overlap=True)

def sphere(name, loc, scale, mat, bone="head", rot=(0, 0, 0), quat=None, seg=24, ring=14):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=1.0)
    bmesh.ops.transform(bm, matrix=_mat4(loc, scale, rot, quat), verts=bm.verts)
    return _finish(name, bm, mat, bone)

def cyl(name, loc, r1, r2, depth, mat, bone="spine", rot=(0, 0, 0), quat=None, seg=24,
        scale=(1, 1, 1), bevel=0.012):
    """Cone/cylinder along local Z, r1 = bottom radius, r2 = top radius."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r1, radius2=r2, depth=depth)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((*scale, 1.0)), verts=bm.verts)
    bm.normal_update()
    if r2 > 0 and r1 > 0:
        _bevel_sharp(bm, min(bevel, depth * 0.3, r1 * 0.3, r2 * 0.3))
    bmesh.ops.transform(bm, matrix=_mat4(loc, (1, 1, 1), rot, quat), verts=bm.verts)
    return _finish(name, bm, mat, bone)

def rbox(name, loc, size, mat, bone="spine", rot=(0, 0, 0), quat=None, bev=0.02, segs=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((*size, 1.0)), verts=bm.verts)
    bm.normal_update()
    _bevel_sharp(bm, min(bev, min(size) * 0.45), segs)
    bmesh.ops.transform(bm, matrix=_mat4(loc, (1, 1, 1), rot, quat), verts=bm.verts)
    return _finish(name, bm, mat, bone)

def torus(name, loc, R, r, mat, bone="head", rot=(0, 0, 0), scale=(1, 1, 1), seg=32, rseg=10, arc=360.0):
    bm = bmesh.new()
    full = arc >= 360.0
    n = seg if full else seg + 1
    rings = []
    for i in range(n):
        a = math.radians(arc) * i / seg
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            ring.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a),
                                      (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        rings.append(ring)
    for i in range(seg):
        A, B = rings[i], rings[(i + 1) % n]
        for j in range(rseg):
            bm.faces.new((A[j], B[j], B[(j + 1) % rseg], A[(j + 1) % rseg]))
    if not full:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.transform(bm, matrix=_mat4(loc, scale, rot), verts=bm.verts)
    return _finish(name, bm, mat, bone)

def cone_along(name, base, axis, length, radius, mat, bone="head", seg=12):
    """Cone whose base sits at `base` and tip points along `axis`."""
    axis = Vector(axis).normalized()
    q = Vector((0, 0, 1)).rotation_difference(axis)
    centre = Vector(base) + axis * (length * 0.5)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=radius, radius2=0.0, depth=length)
    bmesh.ops.transform(bm, matrix=_mat4(centre, (1, 1, 1), quat=q), verts=bm.verts)
    return _finish(name, bm, mat, bone)

def cap(name, mat, planes, scale=1.07, thick=0.014, centre=HC, radii=HR, squash=(1, 1, 1), seg=40, ring=24):
    """Hair shell: an inflated head sphere trimmed by planes (keeps the side the normal points to)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=1.0)
    s = (radii.x * scale * squash[0], radii.y * scale * squash[1], radii.z * scale * squash[2])
    bmesh.ops.transform(bm, matrix=_mat4(centre, s), verts=bm.verts)
    for co, no in planes:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co), plane_no=Vector(no).normalized(),
                               clear_inner=True)
    if thick > 0:
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thick)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(name, bm, mat, "head")

def hairline(front_z, back_z):
    """Plane keeping everything above a line that runs from front_z (forehead) to back_z (nape)."""
    k = (front_z - back_z) / 0.44
    return ((0, -0.21, front_z), (0, k, 1))

def surf(head, target):
    """Ray-cast from outside toward the head centre through `target`; returns (location, normal)."""
    bpy.context.view_layer.update()
    d = (Vector(target) - HC).normalized()
    ok, loc, nor, _ = head.ray_cast(HC + d * 1.0, -d)
    if not ok:
        return Vector(target), d
    return loc, nor

def decal(name, head, target, size, mat, thick=0.008, lift=0.0, spin=0.0):
    loc, nor = surf(head, target)
    q = Vector((0, 0, 1)).rotation_difference(nor)
    q = q @ Quaternion((0, 0, 1), math.radians(spin))
    return sphere(name, loc + nor * lift, (size[0], size[1], thick), mat, "head", quat=q, seg=20, ring=10)

def part(src, name, mat, bone):
    o = bpy.data.objects[src]
    n = o.copy()
    n.data = o.data.copy()
    n.name = name
    GEN.objects.link(n)
    n.hide_render = False
    n.hide_viewport = False
    n.modifiers.clear()
    n.parent = None
    n.matrix_world = o.matrix_world.copy()
    n.data.materials.clear()
    n.data.materials.append(mat)
    for p in n.data.polygons:
        p.material_index = 0
    n.vertex_groups.clear()
    n["bone"] = bone
    return n

def tweak(ob, scale=(1, 1, 1), offset=(0, 0, 0), rot=(0, 0, 0), pivot=None):
    me = ob.data
    if pivot is None:
        vs = [v.co for v in me.vertices]
        pivot = Vector([(min(v[i] for v in vs) + max(v[i] for v in vs)) * 0.5 for i in range(3)])
    Mx = Matrix.Translation(Vector(pivot) + Vector(offset)) @ \
        Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4() @ \
        Matrix.Diagonal((*scale, 1.0)) @ Matrix.Translation(-Vector(pivot))
    me.transform(Mx)
    me.update()

def deselect_all():
    for o in bpy.context.view_layer.objects:
        o.select_set(False)

def join(objs, name, skinned=True):
    for o in objs:
        if skinned:
            o.vertex_groups.clear()
            vg = o.vertex_groups.new(name=o["bone"])
            vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    deselect_all()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    if "bone" in ob:
        del ob["bone"]
    return ob

# --------------------------------------------------------------------------
# Animation (world-axis poses converted to bone-local quaternions)
# --------------------------------------------------------------------------
AX = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}

def _keys(t, pts):
    """Smoothstep-interpolated piecewise curve through (t, value) points."""
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if t <= t1:
            u = 0 if t1 == t0 else (t - t0) / (t1 - t0)
            u = u * u * (3 - 2 * u)
            return v0 + (v1 - v0) * u
    return pts[-1][1]

def a_idle(f, N):
    p = 2 * math.pi * f / N
    s = math.sin(p)
    return ({'spine': [('X', 1.5 * s)],
             'head': [('Z', 3.0 * math.sin(p + 0.8)), ('Y', 2.0 * math.sin(p + 1.6)), ('X', -1.0 * s)],
             'upperarm.L': [('Y', -5 - 2.5 * s)], 'upperarm.R': [('Y', 5 + 2.5 * s)]},
            {'hips': (0, 0, -0.006 + 0.006 * math.cos(2 * p))})

def a_walk(f, N):
    p = 2 * math.pi * f / N
    s = math.sin(p)
    return ({'thigh.L': [('X', 32 * s)], 'thigh.R': [('X', -32 * s)],
             'foot.L': [('X', -10 * max(0.0, s))], 'foot.R': [('X', -10 * max(0.0, -s))],
             'upperarm.L': [('X', -28 * s), ('Y', -7)], 'upperarm.R': [('X', 28 * s), ('Y', 7)],
             'spine': [('X', 4), ('Z', 6 * s)], 'head': [('X', -3), ('Z', -4 * s)]},
            {'root': (0, 0, 0.025 * abs(math.sin(p)))})

def a_eat(f, N):
    p = 2 * math.pi * f / N
    u = 0.5 - 0.5 * math.cos(p)
    chew = math.sin(6 * p) * (1 - u)
    return ({'upperarm.R': [('X', -(30 + 80 * u)), ('Z', 28 * u)], 'hand.R': [('X', -35 * u)],
             'upperarm.L': [('X', -45), ('Z', -22)], 'hand.L': [('X', -25)],
             'spine': [('X', 4 + 3 * u)], 'head': [('X', 4 + 7 * u + 3 * chew)]},
            {'hips': (0, 0, -0.004 * u)})

def a_cheer(f, N):
    p = 2 * math.pi * f / N
    h = abs(math.sin(p))
    w = math.sin(2 * p)
    return ({'upperarm.L': [('Y', -145 + 14 * w)], 'upperarm.R': [('Y', 145 + 14 * w)],
             'hand.L': [('Y', -15 * w)], 'hand.R': [('Y', -15 * w)],
             'thigh.L': [('X', -16 * h)], 'thigh.R': [('X', -16 * h)],
             'foot.L': [('X', 16 * h)], 'foot.R': [('X', 16 * h)],
             'spine': [('X', -5)], 'head': [('X', -8), ('Z', 6 * w)]},
            {'root': (0, 0, 0.07 * h)})

def a_throw(f, N):
    t = f / N
    arm = _keys(t, [(0, 0), (0.35, 75), (0.55, -120), (0.75, -70), (1, 0)])
    tw = _keys(t, [(0, 0), (0.35, -18), (0.55, 20), (1, 0)])
    lean = _keys(t, [(0, 0), (0.35, -6), (0.55, 10), (1, 0)])
    return ({'upperarm.R': [('X', arm), ('Y', 10)], 'hand.R': [('X', arm * 0.25)],
             'upperarm.L': [('X', -arm * 0.3), ('Y', -12)],
             'spine': [('X', lean), ('Z', tw)], 'head': [('Z', -tw * 0.5)],
             'thigh.L': [('X', -lean)], 'thigh.R': [('X', lean * 0.5)]}, {})

def a_sad(f, N):
    p = 2 * math.pi * f / N
    return ({'head': [('X', 16), ('Z', 14 * math.sin(2 * p))], 'spine': [('X', 9)],
             'upperarm.L': [('Y', 4), ('X', 6)], 'upperarm.R': [('Y', -4), ('X', 6)],
             'hand.L': [('Y', 10)], 'hand.R': [('Y', -10)]},
            {'root': (0, 0, -0.012)})

ANIMS = {'Idle': (a_idle, 60), 'Walk': (a_walk, 24), 'Eat': (a_eat, 36),
         'Cheer': (a_cheer, 30), 'Throw': (a_throw, 18), 'Sad': (a_sad, 40)}

def reset_pose(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)

def pose(rig, rots, locs):
    reset_pose(rig)
    for bn, lst in rots.items():
        R = rig.data.bones[bn].matrix_local.to_quaternion()
        qw = Quaternion()
        for ax, deg in lst:
            qw = Quaternion(AX[ax], math.radians(deg)) @ qw
        rig.pose.bones[bn].rotation_quaternion = R.inverted() @ qw @ R
    for bn, v in locs.items():
        R = rig.data.bones[bn].matrix_local.to_quaternion()
        rig.pose.bones[bn].location = R.inverted() @ Vector(v)

def push_track(rig, name, act):
    tr = rig.animation_data.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, int(act.frame_range[0]), act)
    if hasattr(st, "action_slot") and hasattr(act, "slots") and len(act.slots) and st.action_slot is None:
        st.action_slot = act.slots[0]
    return tr

def bake_actions(rig, prefix, names):
    rig.animation_data_create()
    for name in names:
        fn, N = ANIMS[name]
        act = bpy.data.actions.new("%s_%s" % (prefix, name))
        rig.animation_data.action = act
        for f in range(N + 1):
            rots, locs = fn(f, N)
            pose(rig, rots, locs)
            for pb in rig.pose.bones:
                pb.keyframe_insert("rotation_quaternion", frame=f + 1, group=pb.name)
                pb.keyframe_insert("location", frame=f + 1, group=pb.name)
        rig.animation_data.action = None
        push_track(rig, name, act)
    reset_pose(rig)

def export(objs, filename, anim=True):
    deselect_all()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT, filename)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=False,
              export_yup=True, export_animations=anim, export_skins=anim, export_morph=False,
              export_materials='EXPORT')
    if anim:
        kw['export_animation_mode'] = 'NLA_TRACKS'
    bpy.ops.export_scene.gltf(**kw)
    print("EXPORTED", path)

# --------------------------------------------------------------------------
# Characters
# --------------------------------------------------------------------------
SRC_RIG = bpy.data.objects["Aang_Rig"]

def new_rig(name):
    r = SRC_RIG.copy()
    r.data = SRC_RIG.data.copy()
    r.name = name + "_Rig"
    r.animation_data_clear()
    GEN.objects.link(r)
    r.hide_viewport = False
    r.hide_render = False
    r.location = (0, 0, 0)
    return r

def body(P, c, ears=True, brows=True, barefoot=False):
    skin = M(c['skin'], 0.62)
    parts = {}
    def add(src, key, mat, bone):
        parts[key] = part(src, P + "_" + key, mat, bone)
    add("Head", "Head", M(c.get('face', c['skin']), 0.62), "head")
    if ears:
        add("Ear.L", "EarL", skin, "head")
        add("Ear.R", "EarR", skin, "head")
    eye = M(c.get('eye', '#1E1410'), 0.25)
    add("Eye.L", "EyeL", eye, "head")
    add("Eye.R", "EyeR", eye, "head")
    if brows:
        add("Brow.L", "BrowL", M(c['brow'], 0.8), "head")
        add("Brow.R", "BrowR", M(c['brow'], 0.8), "head")
    hand = M(c.get('hand', c['skin']), 0.62)
    add("Hand.L", "HandL", hand, "hand.L")
    add("Hand.R", "HandR", hand, "hand.R")
    add("Neck", "Neck", skin, "neck")
    add("Pants_Hip", "Hip", M(c['pants']), "hips")
    add("Pants_Leg.L", "LegL", M(c['pants']), "thigh.L")
    add("Pants_Leg.R", "LegR", M(c['pants']), "thigh.R")
    add("Shirt", "Shirt", M(c['shirt']), "spine")
    add("Sleeve.L", "SleeveL", M(c['sleeve']), "upperarm.L")
    add("Sleeve.R", "SleeveR", M(c['sleeve']), "upperarm.R")
    add("Cuff.L", "CuffL", M(c['cuff']), "upperarm.L")
    add("Cuff.R", "CuffR", M(c['cuff']), "upperarm.R")
    add("Collar", "Collar", M(c['collar']), "spine")
    add("Belt", "Belt", M(c['belt']), "hips")
    foot = skin if barefoot else M(c['boot'], 0.8)
    add("Boot.L", "BootL", foot, "foot.L")
    add("Boot.R", "BootR", foot, "foot.R")
    if barefoot:
        tweak(parts["BootL"], (0.85, 0.85, 0.7), pivot=(0.088, -0.03, 0.0))
        tweak(parts["BootR"], (0.85, 0.85, 0.7), pivot=(-0.088, -0.03, 0.0))
    return parts

def skirt(P, mat, bottom_z, top_z=0.345, r_bot=0.215, r_top=0.172, hem=None, ysq=0.78):
    out = [cyl(P + "_Skirt", (0, 0, (bottom_z + top_z) / 2), r_bot, r_top, top_z - bottom_z, mat,
               "hips", scale=(1, ysq, 1), seg=28, bevel=0.01)]
    if hem:
        out.append(torus(P + "_Hem", (0, 0, bottom_z + 0.008), r_bot - 0.004, 0.011, hem, "hips",
                         scale=(1, ysq, 1), seg=36, rseg=8))
    return out

def finalize(P, parts, rig_name=None, extra_actions=None):
    objs = list(parts.values()) if isinstance(parts, dict) else parts
    mesh = join(objs, P)
    rig = new_rig(P)
    mesh.parent = rig
    mod = mesh.modifiers.new("Armature", 'ARMATURE')
    mod.object = rig
    bake_actions(rig, P, list(ANIMS.keys()))
    export([rig, mesh], P.lower() + ".glb")
    return rig, mesh

def apron(name, mat):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, cap_tris=False, segments=40, radius1=0.215, radius2=0.158, depth=0.3)
    bmesh.ops.transform(bm, matrix=_mat4((0, 0, 0.32), (1, 0.8, 1)), verts=bm.verts)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, -0.035, 0),
                           plane_no=(0, -1, 0), clear_inner=True)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(name, bm, mat, "spine")

def build_sokka():
    P = "Sokka"
    c = dict(skin='#B47A4E', shirt='#2F4E8C', sleeve='#2F4E8C', cuff='#E2E8EE', pants='#25365C',
             belt='#6B4A2E', collar='#E2E8EE', boot='#4A3222', brow='#2A1A10')
    b = body(P, c)
    hair = M('#3A2618', 0.85)
    extra = [
        cap(P + "_Stubble", M('#9C6A46', 0.9), [hairline(0.865, 0.62)], scale=1.012, thick=0.0),
        cap(P + "_HairTop", hair, [hairline(0.95, 0.86)], scale=1.075, thick=0.022),
        sphere(P + "_Tail", (0, 0.085, 1.035), (0.058, 0.05, 0.075), hair, rot=(-25, 0, 0)),
        sphere(P + "_TailTip", (0, 0.13, 1.09), (0.04, 0.035, 0.05), hair, rot=(-55, 0, 0)),
        cyl(P + "_TailTie", (0, 0.07, 1.0), 0.038, 0.036, 0.026, M('#5A3A22'), "head", rot=(-25, 0, 0)),
        # chef apron + towel
        apron(P + "_Apron", M('#F2EEE2', 0.85)),
        cyl(P + "_ApronTie", (0, 0, 0.395), 0.148, 0.148, 0.02, M('#F2EEE2', 0.85), "spine", scale=(1, 0.8, 1)),
        # boomerang on the back
        rbox(P + "_BoomA", (-0.045, 0.118, 0.43), (0.034, 0.018, 0.17), M('#C9A06A', 0.6), "spine", rot=(0, 38, 0), bev=0.008),
        rbox(P + "_BoomB", (0.045, 0.118, 0.43), (0.034, 0.018, 0.17), M('#C9A06A', 0.6), "spine", rot=(0, -38, 0), bev=0.008),
    ]
    return finalize(P, list(b.values()) + extra)

def build_katara():
    P = "Katara"
    c = dict(skin='#A86F48', shirt='#4677BE', sleeve='#4677BE', cuff='#2C4A80', pants='#2A3E66',
             belt='#2C4A80', collar='#8FB4E0', boot='#4A3222', brow='#2A1A10')
    b = body(P, c, ears=False)
    hair = M('#3B2416', 0.8)
    bead = M('#8FC3EA', 0.4)
    extra = [
        cap(P + "_Hair", hair, [hairline(0.875, 0.56)], scale=1.075, thick=0.02),
        sphere(P + "_HairBack", (0, 0.15, 0.665), (0.205, 0.12, 0.2), hair),
        sphere(P + "_Braid1", (0, 0.215, 0.535), (0.048, 0.04, 0.05), hair),
        sphere(P + "_Braid2", (0, 0.228, 0.47), (0.043, 0.037, 0.045), hair),
        sphere(P + "_Braid3", (0, 0.236, 0.41), (0.038, 0.033, 0.04), hair),
        sphere(P + "_Braid4", (0, 0.238, 0.355), (0.03, 0.027, 0.034), hair),
        cyl(P + "_BraidTie", (0, 0.238, 0.325), 0.018, 0.018, 0.018, bead, "head"),
        torus(P + "_LoopL", (0.212, -0.115, 0.7), 0.045, 0.016, hair, rot=(0, 90, -20)),
        torus(P + "_LoopR", (-0.212, -0.115, 0.7), 0.045, 0.016, hair, rot=(0, 90, 20)),
        sphere(P + "_BeadL", (0.216, -0.12, 0.648), (0.017, 0.017, 0.017), bead),
        sphere(P + "_BeadR", (-0.216, -0.12, 0.648), (0.017, 0.017, 0.017), bead),
        cyl(P + "_Pendant", (0, -0.118, 0.505), 0.022, 0.022, 0.012, M('#4AA0DA', 0.3), "spine", rot=(90, 0, 0)),
    ] + skirt(P, M('#4677BE'), 0.16, hem=M('#2C4A80'))
    return finalize(P, list(b.values()) + extra)

def build_zuko():
    P = "Zuko"
    c = dict(skin='#F3CBA5', shirt='#7E1F1B', sleeve='#7E1F1B', cuff='#C99A2E', pants='#3A1C1A',
             belt='#C99A2E', collar='#C99A2E', boot='#1E1614', brow='#1B1516')
    b = body(P, c)
    # angry brows
    tweak(b["BrowL"], rot=(0, -16, 0), offset=(0, 0, -0.006))
    tweak(b["BrowR"], rot=(0, 16, 0), offset=(0, 0, -0.006))
    hair = M('#1B1516', 0.85)
    extra = [cap(P + "_Hair", hair, [hairline(0.85, 0.58)], scale=1.085, thick=0.022)]
    # shaggy spikes all around the hairline
    for i, az in enumerate(range(-150, 181, 30)):
        a = math.radians(az)
        d = Vector((math.sin(a), -math.cos(a), 0.0))
        front = abs(az) <= 45
        z = 0.84 if front else 0.74 - 0.04 * (abs(az) / 180.0)
        base = HC + Vector((d.x * HR.x * 1.0, d.y * HR.y * 1.0, z - HC.z))
        axis = (d * (0.45 if front else 0.8) + Vector((0, 0, -1))).normalized()
        extra.append(cone_along(P + "_Spike%d" % i, base, axis, 0.13 if front else 0.12,
                                0.055 if front else 0.06, hair))
    head = b["Head"]
    extra.append(decal(P + "_Scar", head, (0.118, -0.2, 0.7), (0.07, 0.068), M('#B4473A', 0.7), thick=0.004, spin=20))
    return finalize(P, list(b.values()) + extra)

def build_toph():
    P = "Toph"
    c = dict(skin='#F5D2AC', shirt='#C2CB7A', sleeve='#C2CB7A', cuff='#6C8E3A', pants='#5E8B3A',
             belt='#4C6C28', collar='#6C8E3A', boot='#000000', brow='#141418', eye='#56604F')
    b = body(P, c, ears=False, brows=False, barefoot=True)
    hair = M('#141418', 0.8)
    band = M('#6C8E3A', 0.7)
    extra = [
        cap(P + "_Hair", hair, [hairline(0.8, 0.56)], scale=1.085, thick=0.022),
        sphere(P + "_Bun", (0, 0.1, 0.995), (0.08, 0.075, 0.07), hair),
        torus(P + "_Band", (0, 0.02, 0.835), 0.248, 0.021, band, rot=(-6, 0, 0), scale=(1, 0.95, 1), seg=40),
        sphere(P + "_PomL", (0.245, 0.03, 0.83), (0.048, 0.048, 0.048), M('#F3EEDF', 0.9)),
        sphere(P + "_PomR", (-0.245, 0.03, 0.83), (0.048, 0.048, 0.048), M('#F3EEDF', 0.9)),
    ]
    head = b["Head"]
    for i, x in enumerate([-0.16, -0.105, -0.05, 0.0, 0.05, 0.105, 0.16]):
        loc, nor = surf(head, (x, -0.22, 0.8 - abs(x) * 0.15))
        extra.append(sphere(P + "_Bang%d" % i, loc + nor * 0.012,
                            (0.052, 0.028, 0.07 + (i % 2) * 0.012), hair, rot=(12, -x * 140, 0)))
    return finalize(P, list(b.values()) + extra)

def build_iroh():
    P = "Iroh"
    c = dict(skin='#DCA878', shirt='#6C281C', sleeve='#6C281C', cuff='#B98A30', pants='#4A2418',
             belt='#B98A30', collar='#B98A30', boot='#2A1A12', brow='#C4C4BE')
    b = body(P, c)
    tweak(b["BrowL"], scale=(1.15, 1.2, 1.9), rot=(0, 10, 0))
    tweak(b["BrowR"], scale=(1.15, 1.2, 1.9), rot=(0, -10, 0))
    tweak(b["Shirt"], scale=(1.17, 1.32, 1.0))
    tweak(b["Belt"], scale=(1.16, 1.3, 1.0))
    tweak(b["Collar"], scale=(1.1, 1.18, 1.0))
    grey = M('#A6A6A2', 0.9)
    beard = M('#B9B9B3', 0.95)
    gold = M('#C99A3A', 0.45, metal=0.3)
    head = b["Head"]
    ml, mn = surf(head, (0.0, -0.22, 0.6))
    extra = [
        cap(P + "_SideHair", grey, [((0, 0, 0.79), (0, 0, -1)), ((0, 0, 0.6), (0, 0, 1)), ((0, -0.03, 0), (0, 1, 0))],
            scale=1.07, thick=0.035),
        sphere(P + "_Knot", (0, 0.0, 1.015), (0.058, 0.058, 0.048), grey),
        cyl(P + "_KnotCap", (0, 0.0, 1.06), 0.032, 0.026, 0.026, gold, "head"),
        sphere(P + "_Beard", (0, -0.125, 0.56), (0.16, 0.1, 0.11), beard),
        sphere(P + "_BeardTip", (0, -0.14, 0.49), (0.1, 0.08, 0.08), beard),
        sphere(P + "_BurnL", (0.175, -0.06, 0.62), (0.06, 0.07, 0.085), beard),
        sphere(P + "_BurnR", (-0.175, -0.06, 0.62), (0.06, 0.07, 0.085), beard),
        sphere(P + "_StacheL", ml + mn * 0.012 + Vector((0.045, 0, 0.0)), (0.06, 0.028, 0.026), M('#CFCFC9', 0.95), rot=(0, 18, 0)),
        sphere(P + "_StacheR", ml + mn * 0.012 + Vector((-0.045, 0, 0.0)), (0.06, 0.028, 0.026), M('#CFCFC9', 0.95), rot=(0, -18, 0)),
        decal(P + "_Nose", head, (0.0, -0.2, 0.655), (0.03, 0.025), M('#D09A6A', 0.6), thick=0.02),
    ] + skirt(P, M('#6C281C'), 0.1, hem=gold, r_bot=0.23, r_top=0.19)
    return finalize(P, list(b.values()) + extra)

def build_suki():
    P = "Suki"
    c = dict(skin='#F0CFAE', face='#F6F2EA', shirt='#3F6B3A', sleeve='#3F6B3A', cuff='#C9A13A',
             pants='#2E4C2B', belt='#2B2622', collar='#C9A13A', boot='#2A1F18', brow='#3A2014')
    b = body(P, c, ears=False)
    hair = M('#4A2A1A', 0.8)
    gold = M('#D4A53A', 0.35, metal=0.55)
    red = M('#C0302A', 0.6)
    head = b["Head"]
    extra = [
        cap(P + "_Hair", hair, [hairline(0.86, 0.56)], scale=1.075, thick=0.02),
        sphere(P + "_HairBack", (0, 0.15, 0.64), (0.2, 0.11, 0.19), hair),
        decal(P + "_ShadowL", head, (0.108, -0.2, 0.705), (0.056, 0.058), red, thick=0.004, spin=-15),
        decal(P + "_ShadowR", head, (-0.108, -0.2, 0.705), (0.056, 0.058), red, thick=0.004, spin=15),
        decal(P + "_Lips", head, (0.0, -0.2, 0.6), (0.026, 0.012), red, thick=0.008),
        torus(P + "_Band", (0, 0.015, 0.87), 0.245, 0.022, gold, rot=(-6, 0, 0), scale=(1, 0.95, 1), seg=40),
        rbox(P + "_Crest", (0, -0.17, 0.985), (0.2, 0.025, 0.14), gold, "head", rot=(-18, 0, 0), bev=0.01),
        rbox(P + "_FlapL", (0.215, -0.05, 0.86), (0.035, 0.15, 0.16), gold, "head", rot=(0, 0, 8), bev=0.01),
        rbox(P + "_FlapR", (-0.215, -0.05, 0.86), (0.035, 0.15, 0.16), gold, "head", rot=(0, 0, -8), bev=0.01),
        cone_along(P + "_Spike0", (0, -0.165, 1.03), (0, -0.25, 1), 0.09, 0.03, gold),
        cone_along(P + "_Spike1", (0.07, -0.16, 1.02), (0.35, -0.25, 1), 0.07, 0.026, gold),
        cone_along(P + "_Spike2", (-0.07, -0.16, 1.02), (-0.35, -0.25, 1), 0.07, 0.026, gold),
        sphere(P + "_Gem", (0, -0.192, 0.95), (0.02, 0.012, 0.026), M('#3F8F4A', 0.3)),
    ] + skirt(P, M('#2F5530'), 0.15, hem=gold)
    return finalize(P, list(b.values()) + extra)

def build_mai():
    P = "Mai"
    c = dict(skin='#F5DFCB', shirt='#3B1219', sleeve='#2A0E12', cuff='#7C1F26', pants='#1E0E10',
             belt='#7C1F26', collar='#7C1F26', boot='#140A0A', brow='#141016')
    b = body(P, c, ears=False, brows=False)
    for k in ("EyeL", "EyeR"):
        tweak(b[k], scale=(1.0, 1.0, 0.62), offset=(0, 0, -0.008))
    hair = M('#141016', 0.75)
    tie = M('#9A2430', 0.6)
    extra = [
        cap(P + "_Hair", hair, [hairline(0.775, 0.56)], scale=1.08, thick=0.022),
        rbox(P + "_SideL", (0.205, -0.03, 0.66), (0.06, 0.2, 0.3), hair, "head", bev=0.025),
        rbox(P + "_SideR", (-0.205, -0.03, 0.66), (0.06, 0.2, 0.3), hair, "head", bev=0.025),
        rbox(P + "_Back", (0, 0.12, 0.62), (0.42, 0.17, 0.44), hair, "head", bev=0.07),
        sphere(P + "_BunL", (0.09, 0.05, 1.0), (0.068, 0.068, 0.068), hair),
        sphere(P + "_BunR", (-0.09, 0.05, 1.0), (0.068, 0.068, 0.068), hair),
        torus(P + "_TieL", (0.08, 0.05, 0.955), 0.04, 0.012, tie, rot=(0, 15, 0)),
        torus(P + "_TieR", (-0.08, 0.05, 0.955), 0.04, 0.012, tie, rot=(0, -15, 0)),
    ] + skirt(P, M('#2A0E12'), 0.14, hem=M('#7C1F26'))
    return finalize(P, list(b.values()) + extra)

def build_aang():
    rig = bpy.data.objects["Aang_Rig"]
    mesh = bpy.data.objects["Aang"]
    for o in (rig, mesh):
        o.hide_viewport = False
        o.hide_render = False
        o.hide_set(False)
    rig.animation_data_create()
    for tr in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(tr)
    rig.animation_data.action = None
    # keep the hand-authored idle/walk, generate the rest
    push_track(rig, "Idle", bpy.data.actions["Aang_Idle"])
    push_track(rig, "Walk", bpy.data.actions["Aang_Walk"])
    bake_actions(rig, "Aang", ['Eat', 'Cheer', 'Throw', 'Sad'])
    export([rig, mesh], "aang.glb")
    return rig, mesh

# --------------------------------------------------------------------------
# Dishes & props (static meshes, origin at base centre)
# --------------------------------------------------------------------------
def plate(P):
    return [cyl(P + "_Plate", (0, 0, 0.016), 0.12, 0.175, 0.032, M('#F1E8D6', 0.35), bevel=0.008, seg=32),
            torus(P + "_Rim", (0, 0, 0.031), 0.158, 0.007, M('#3D6DB3', 0.35), seg=40, rseg=8)]

def dish_skewers():
    P = "dish_skewers"
    o = plate(P)
    meat, pep, onion = M('#8E3A1C', 0.35), M('#D2502A', 0.4), M('#6E9E3A', 0.5)
    for k, y in enumerate((-0.045, 0.045)):
        o.append(cyl(P + "_Stick%d" % k, (0, y, 0.07), 0.007, 0.007, 0.31, M('#D8B07A', 0.7), rot=(0, 90, (k * 2 - 1) * 8), bevel=0))
        for i in range(4):
            x = -0.095 + i * 0.063
            mat = [meat, pep, meat, onion][(i + k) % 4]
            o.append(rbox(P + "_Chunk%d%d" % (k, i), (x, y + x * (k * 2 - 1) * 0.14, 0.07), (0.052, 0.052, 0.048), mat,
                          rot=(12 * i, 20 * k, 10 * i), bev=0.014))
    return join(o, P, skinned=False)

def dish_dumplings():
    P = "dish_dumplings"
    o = [cyl(P + "_Steamer", (0, 0, 0.04), 0.16, 0.165, 0.08, M('#C8975A', 0.7), bevel=0.01, seg=32),
         torus(P + "_Band", (0, 0, 0.05), 0.164, 0.008, M('#9A6A34', 0.7), seg=40, rseg=8),
         cyl(P + "_Paper", (0, 0, 0.081), 0.14, 0.14, 0.004, M('#EADBB0', 0.8), bevel=0)]
    dough = M('#F6EDDB', 0.75)
    for i, (x, y) in enumerate([(-0.06, -0.055), (0.06, -0.055), (-0.06, 0.055), (0.06, 0.055)]):
        o.append(sphere(P + "_Dump%d" % i, (x, y, 0.11), (0.058, 0.058, 0.044), dough))
        o.append(sphere(P + "_Knot%d" % i, (x, y, 0.153), (0.02, 0.02, 0.016), dough))
    return join(o, P, skinned=False)

def dish_noodles():
    P = "dish_noodles"
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=18, radius=1.0)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0.05),
                           plane_no=(0, 0, -1), clear_inner=True)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.06)
    bmesh.ops.transform(bm, matrix=_mat4((0, 0, 0.13), (0.17, 0.17, 0.125)), verts=bm.verts)
    o = [_finish(P + "_Bowl", bm, M('#3A62AE', 0.3), "spine"),
         cyl(P + "_Foot", (0, 0, 0.012), 0.07, 0.075, 0.024, M('#2E4E8E', 0.4)),
         cyl(P + "_Broth", (0, 0, 0.115), 0.155, 0.155, 0.01, M('#D99A48', 0.25), bevel=0)]
    nood = M('#F2D58A', 0.55)
    for i in range(7):
        a = i * 0.9
        o.append(torus(P + "_N%d" % i, (math.cos(a) * 0.06, math.sin(a) * 0.06, 0.122), 0.04, 0.009, nood,
                       rot=(0, 0, i * 25), seg=20, rseg=6))
    o += [sphere(P + "_Egg", (0.06, 0.04, 0.125), (0.045, 0.045, 0.022), M('#FBF8EE', 0.5)),
          sphere(P + "_Yolk", (0.06, 0.04, 0.138), (0.024, 0.024, 0.012), M('#F2A61C', 0.35)),
          cyl(P + "_Naruto", (-0.06, 0.05, 0.126), 0.028, 0.028, 0.012, M('#FFFFFF', 0.5), bevel=0.003),
          torus(P + "_Swirl", (-0.06, 0.05, 0.133), 0.014, 0.004, M('#F08AA8', 0.5), seg=16, rseg=6),
          rbox(P + "_Green1", (-0.02, -0.07, 0.124), (0.05, 0.02, 0.008), M('#5DA040'), rot=(0, 0, 30), bev=0.003),
          rbox(P + "_Green2", (0.02, -0.06, 0.124), (0.045, 0.02, 0.008), M('#5DA040'), rot=(0, 0, -20), bev=0.003)]
    return join(o, P, skinned=False)

def dish_duck():
    P = "dish_duck"
    glaze = M('#9A421C', 0.25)
    o = plate(P) + [
        sphere(P + "_Body", (0, 0, 0.08), (0.11, 0.078, 0.062), glaze, seg=28),
        sphere(P + "_Breast", (-0.045, 0, 0.1), (0.06, 0.06, 0.04), M('#B55426', 0.25)),
        cyl(P + "_LegL", (0.085, 0.055, 0.07), 0.024, 0.016, 0.07, glaze, rot=(0, 70, 25)),
        cyl(P + "_LegR", (0.085, -0.055, 0.07), 0.024, 0.016, 0.07, glaze, rot=(0, 70, -25)),
        sphere(P + "_BoneL", (0.118, 0.07, 0.085), (0.014, 0.014, 0.014), M('#F4EEDC', 0.6)),
        sphere(P + "_BoneR", (0.118, -0.07, 0.085), (0.014, 0.014, 0.014), M('#F4EEDC', 0.6)),
        rbox(P + "_Leaf1", (-0.12, 0.06, 0.04), (0.06, 0.03, 0.01), M('#6FA545'), rot=(0, 0, 30), bev=0.004),
        rbox(P + "_Leaf2", (-0.12, -0.06, 0.04), (0.06, 0.03, 0.01), M('#6FA545'), rot=(0, 0, -30), bev=0.004),
    ]
    return join(o, P, skinned=False)

def dish_teacake():
    P = "dish_teacake"
    o = plate(P) + [
        cyl(P + "_Base", (0, 0, 0.06), 0.1, 0.1, 0.05, M('#9CC77A', 0.7), bevel=0.01, seg=32),
        cyl(P + "_Cream", (0, 0, 0.09), 0.103, 0.103, 0.014, M('#F6EEDA', 0.6), bevel=0.004, seg=32),
        cyl(P + "_Top", (0, 0, 0.108), 0.098, 0.096, 0.024, M('#F4A8C0', 0.55), bevel=0.008, seg=32),
        sphere(P + "_Center", (0, 0, 0.128), (0.016, 0.016, 0.012), M('#F7D24A', 0.5)),
    ]
    for i in range(5):
        a = i * 2 * math.pi / 5
        o.append(sphere(P + "_Petal%d" % i, (math.cos(a) * 0.026, math.sin(a) * 0.026, 0.124),
                        (0.026, 0.016, 0.008), M('#FFFFFF', 0.5), rot=(0, 0, math.degrees(a))))
    return join(o, P, skinned=False)

def dish_cactusjuice():
    P = "dish_cactusjuice"
    o = [cyl(P + "_Coaster", (0, 0, 0.008), 0.1, 0.1, 0.016, M('#8A5A30', 0.7), bevel=0.004, seg=28),
         cyl(P + "_Liquid", (0, 0, 0.1), 0.062, 0.07, 0.16, M('#7DC24A', 0.3), bevel=0.004, seg=28),
         cyl(P + "_Glass", (0, 0, 0.12), 0.07, 0.08, 0.21, M('#DDF2F4', 0.1, alpha=0.32), bevel=0.006, seg=28),
         cyl(P + "_Straw", (0.025, 0, 0.21), 0.008, 0.008, 0.2, M('#F2E6C8', 0.6), rot=(0, 15, 0), bevel=0),
         rbox(P + "_Slice", (-0.075, 0, 0.215), (0.05, 0.016, 0.06), M('#3E8A3A', 0.5), rot=(0, 20, 0), bev=0.01),
         sphere(P + "_Flower", (-0.08, 0, 0.25), (0.016, 0.016, 0.012), M('#F06A9A', 0.5))]
    return join(o, P, skinned=False)

def prop_lantern():
    P = "prop_lantern"
    red = M('#D23A2A', 0.6, emit=1.6)
    gold = M('#D4A53A', 0.4, metal=0.4)
    o = [sphere(P + "_Body", (0, 0, 0), (0.17, 0.17, 0.2), red, seg=24, ring=12),
         cyl(P + "_Top", (0, 0, 0.195), 0.09, 0.07, 0.04, gold),
         cyl(P + "_Bot", (0, 0, -0.195), 0.07, 0.09, 0.04, gold),
         cyl(P + "_Tassel", (0, 0, -0.29), 0.022, 0.012, 0.15, M('#E8B84A', 0.7)),
         cyl(P + "_String", (0, 0, 0.5), 0.005, 0.005, 0.6, M('#2A1A10', 0.8), bevel=0)]
    for i in range(6):
        o.append(torus(P + "_Rib%d" % i, (0, 0, 0), 0.2, 0.004, M('#8A1E14', 0.6), rot=(90, 0, i * 30),
                       scale=(0.86, 1.0, 1.0), seg=32, rseg=5))
    return join(o, P, skinned=False)

def prop_plant():
    P = "prop_plant"
    o = [cyl(P + "_Pot", (0, 0, 0.14), 0.14, 0.19, 0.28, M('#6B3A24', 0.6), seg=24),
         torus(P + "_PotRim", (0, 0, 0.28), 0.185, 0.02, M('#8A4E2E', 0.6), seg=32, rseg=8),
         cyl(P + "_Soil", (0, 0, 0.27), 0.17, 0.17, 0.01, M('#3A2A1A', 0.9), bevel=0)]
    greens = [M('#4E8A3A', 0.6), M('#3F7A30', 0.6), M('#6AA04A', 0.6)]
    for i in range(11):
        a = i * 2.4
        tilt = 25 + (i % 3) * 12
        h = 0.22 + (i % 4) * 0.04
        o.append(sphere(P + "_Leaf%d" % i, (math.cos(a) * 0.06, math.sin(a) * 0.06, 0.28 + h * 0.8),
                        (0.05, 0.018, h), greens[i % 3], rot=(0, tilt, math.degrees(a)), seg=12, ring=8))
    return join(o, P, skinned=False)

def prop_teapot():
    P = "prop_teapot"
    jade = M('#5E8E6A', 0.3)
    o = [sphere(P + "_Body", (0, 0, 0.085), (0.11, 0.11, 0.085), jade, seg=28),
         cyl(P + "_Foot", (0, 0, 0.01), 0.06, 0.065, 0.02, jade),
         cyl(P + "_Lid", (0, 0, 0.17), 0.06, 0.045, 0.02, jade),
         sphere(P + "_Knob", (0, 0, 0.19), (0.018, 0.018, 0.016), M('#D4A53A', 0.4, metal=0.4)),
         cyl(P + "_Spout", (0.12, 0, 0.1), 0.022, 0.012, 0.1, jade, rot=(0, 55, 0)),
         torus(P + "_Handle", (-0.11, 0, 0.1), 0.05, 0.012, jade, rot=(90, 0, 0), arc=200, seg=16, rseg=8)]
    return join(o, P, skinned=False)

def prop_cup():
    P = "prop_cup"
    o = [cyl(P + "_Cup", (0, 0, 0.025), 0.03, 0.04, 0.05, M('#EDE6D6', 0.35)),
         cyl(P + "_Tea", (0, 0, 0.046), 0.036, 0.036, 0.004, M('#B9822E', 0.2), bevel=0)]
    return join(o, P, skinned=False)

def prop_barrel():
    P = "prop_barrel"
    wood = M('#8A5A32', 0.7)
    o = [cyl(P + "_Low", (0, 0, 0.085), 0.18, 0.212, 0.17, wood, seg=24, bevel=0.0),
         cyl(P + "_Mid", (0, 0, 0.25), 0.212, 0.212, 0.16, wood, seg=24, bevel=0.0),
         cyl(P + "_Up", (0, 0, 0.415), 0.212, 0.18, 0.17, wood, seg=24, bevel=0.0),
         torus(P + "_Band1", (0, 0, 0.1), 0.212, 0.012, M('#3A2A1E', 0.5), seg=32, rseg=6),
         torus(P + "_Band2", (0, 0, 0.4), 0.212, 0.012, M('#3A2A1E', 0.5), seg=32, rseg=6)]
    return join(o, P, skinned=False)

def prop_cushion():
    P = "prop_cushion"
    o = [cyl(P + "_Pad", (0, 0, 0.045), 0.22, 0.2, 0.09, M('#8A2E22', 0.8), bevel=0.035, seg=28),
         sphere(P + "_Button", (0, 0, 0.092), (0.025, 0.025, 0.012), M('#D4A53A', 0.4, metal=0.3))]
    return join(o, P, skinned=False)

# --------------------------------------------------------------------------
# Build everything
# --------------------------------------------------------------------------
chars = [("Aang",) + build_aang()]
for fn in (build_sokka, build_katara, build_zuko, build_toph, build_iroh, build_suki, build_mai):
    rig, mesh = fn()
    chars.append((mesh.name, rig, mesh))

dishes = [dish_skewers(), dish_dumplings(), dish_noodles(), dish_duck(), dish_teacake(), dish_cactusjuice()]
export(dishes, "dishes.glb", anim=False)
props = [prop_lantern(), prop_plant(), prop_teapot(), prop_cup(), prop_barrel(), prop_cushion()]
export(props, "props.glb", anim=False)

# --------------------------------------------------------------------------
# Optional preview renders (for checking the look)
# --------------------------------------------------------------------------
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    for o in scene.objects:
        if o.type in ('MESH', 'ARMATURE') and o not in [c[1] for c in chars] + [c[2] for c in chars] + dishes + props:
            o.hide_render = True
    ground = bpy.data.objects.get("AangGround")
    if ground:
        ground.hide_render = False
        ground.scale = (20, 20, 1)
    for i, (n, rig, mesh) in enumerate(chars):
        rig.animation_data.action = None
        for tr in rig.animation_data.nla_tracks:
            tr.mute = True
        rig.location = ((i - 3.5) * 0.62, 0, 0)
    for i, d in enumerate(dishes):
        d.location = ((i - 2.5) * 0.42, -1.2, 0)
    for i, p in enumerate(props):
        p.location = ((i - 2.5) * 0.55, 1.2, 0.3 if p.name == "prop_lantern" else 0)
    sun = bpy.data.lights.new("PrevSun", 'SUN')
    sun.energy = 3.0
    so = bpy.data.objects.new("PrevSun", sun)
    GEN.objects.link(so)
    so.rotation_euler = (math.radians(50), 0, math.radians(-30))
    if scene.world is None:
        scene.world = bpy.data.worlds.new("W")
    scene.world.color = (0.25, 0.25, 0.25)
    try:
        bg = scene.world.node_tree.nodes.get("Background")
        bg.inputs[0].default_value = (0.3, 0.32, 0.3, 1)
        bg.inputs[1].default_value = 1.0
    except Exception:
        pass
    camd = bpy.data.cameras.new("PrevCam")
    cam = bpy.data.objects.new("PrevCam", camd)
    GEN.objects.link(cam)
    scene.camera = cam
    for e in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            scene.render.engine = e
            break
        except Exception:
            pass
    scene.render.film_transparent = False
    scene.frame_set(1)

    def shot(path, loc, target, lens, res):
        cam.location = loc
        d = Vector(target) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        camd.lens = lens
        scene.render.resolution_x, scene.render.resolution_y = res
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)

    shot(os.path.join(PREVIEW, "chars_front.png"), (0, -6.5, 1.0), (0, 0, 0.5), 50, (1800, 560))
    shot(os.path.join(PREVIEW, "chars_34.png"), (3.2, -5.6, 2.2), (0, 0, 0.5), 50, (1800, 700))
    shot(os.path.join(PREVIEW, "chars_back.png"), (0, 6.5, 1.0), (0, 0, 0.5), 50, (1800, 560))
    shot(os.path.join(PREVIEW, "dishes.png"), (0, -2.9, 1.3), (0, -1.2, 0.05), 50, (1600, 600))
    shot(os.path.join(PREVIEW, "props.png"), (0, -0.6, 1.4), (0, 1.2, 0.25), 45, (1600, 600))
print("BUILD_DONE")
