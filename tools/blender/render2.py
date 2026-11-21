# models2.py 로 지은 것들을 하나씩 렌더링 (tools/blender/out/v2_*.png)
import bpy, math
from mathutils import Vector
OUT = r'C:/Users/PYJ/orca/backroom/tools/blender/out/'
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
w = sc.world or bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.035, 0.03, 0.02, 1)
for o in [o for o in bpy.data.objects if o.type in ('LIGHT', 'CAMERA') or o.name.startswith('rfloor')]: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.mesh.primitive_plane_add(size=20); f = bpy.context.active_object; f.name = 'rfloor'
fm = bpy.data.materials.get('rfloor_m') or bpy.data.materials.new('rfloor_m'); fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.3, 0.24, 0.1, 1); fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
f.data.materials.append(fm)
def light(name, energy, color, size):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.color = color; d.size = size
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); return o
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
L = [light('key', 1, (1, 0.95, 0.85), 1.5), light('fill', 1, (1, 0.9, 0.7), 2), light('rim', 1, (1, 0.85, 0.6), 1), light('top', 1, (1, 0.96, 0.82), 1.2)]
def look(o, t): o.rotation_euler = (Vector(t) - o.location).to_track_quat('-Z', 'Y').to_euler()
cols = [c for c in bpy.data.collections]
def bbox(col):
    pts = [o.matrix_world @ Vector(c) for o in col.all_objects if o.type == 'MESH' for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi
out = []
for col in cols:
    for c in cols: c.hide_render = c is not col
    lo, hi = bbox(col); ctr = (lo + hi) / 2; size = max((hi - lo).length, 0.05)
    small = size < 0.6
    f.location.z = lo.z - (0.0005 if small else 0.0)
    f.hide_render = small
    sc.render.resolution_x, sc.render.resolution_y = (640, 640) if small else (700, 960)
    k = 1.0 if small else 1.0
    s = 1.0 if small else 0.02
    for d, name in ((Vector((0.6, 1.0, 0.45)), 'front'), (Vector((1.0, -0.05, 0.25)), 'side')):
        cam_d.lens = 70 if small else 50
        dist = size * (1.9 if small else 1.75)
        cam.location = ctr + d.normalized() * dist; look(cam, ctr)
        e = 60 * size ** 2 * 4 if small else 140
        L[0].location = ctr + Vector((size * 1.2, size * 1.8, size * 1.2)); look(L[0], ctr); L[0].data.energy = e
        L[1].location = ctr + Vector((-size * 1.8, size * 1.2, size * 0.4)); look(L[1], ctr); L[1].data.energy = e * 0.3
        L[2].location = ctr + Vector((-size * 0.6, -size * 1.6, size * 0.9)); look(L[2], ctr); L[2].data.energy = e * 0.7
        L[3].location = ctr + Vector((0, size * 0.2, size * 1.4)); look(L[3], ctr); L[3].data.energy = e * 0.4
        for l in L: l.data.size = size * 0.8
        sc.render.filepath = OUT + f'v2_{col.name}_{name}.png'
        bpy.ops.render.render(write_still=True); out.append(col.name + '_' + name)
        if small: break
for c in cols: c.hide_render = False
print('RENDERED', out)
