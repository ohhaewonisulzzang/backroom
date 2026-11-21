import bpy, math
from mathutils import Vector
OUT = r'C:/Users/PYJ/AppData/Local/Temp/claude/72c7c22dbf6f2fd2/2777b4f3-4db3-4d27-aebf-ef65ddb25859/scratchpad/bmcp/'
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 760, 1000
sc.render.film_transparent = False
w = sc.world or bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.03, 0.026, 0.018, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
for o in [o for o in bpy.data.objects if o.type in ('LIGHT', 'CAMERA') or o.name == 'floor']: bpy.data.objects.remove(o, do_unlink=True)
# 바닥 (누런 카펫 색)
bpy.ops.mesh.primitive_plane_add(size=12, location=(1, 0, 0)); f = bpy.context.active_object; f.name = 'floor'
fm = bpy.data.materials.new('floor_m'); fm.use_nodes = True; fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.32, 0.25, 0.1, 1); fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
f.data.materials.append(fm)
def light(name, kind, loc, energy, color, size=1.0, rot=None):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
    if kind == 'AREA': d.size = size
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.location = loc
    if rot: o.rotation_euler = rot
    return o
cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 50
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
def look(o, target):
    d = Vector(target) - o.location; o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
key = light('key', 'AREA', (0, 0, 0), 120, (1.0, 0.95, 0.85), 1.5)
fill = light('fill', 'AREA', (0, 0, 0), 35, (1.0, 0.9, 0.7), 2.0)
rim = light('rim', 'AREA', (0, 0, 0), 90, (1.0, 0.85, 0.6), 1.0)
top = light('fluoro', 'AREA', (0, 0, 0), 60, (1.0, 0.96, 0.82), 1.2)
models = {'howler': (0.0, 2.3), 'player': (1.0, 1.75), 'wanderer': (2.0, 1.75)}
cols = {c.name: c for c in bpy.data.collections}
out = []
for name, (x, h) in models.items():
    for n, c in cols.items(): c.hide_render = n != name
    # 3/4 앞 (게임의 앞 = Blender +y)
    cam.location = (x + h * 0.75, h * 1.55, h * 0.62); look(cam, (x, 0, h * 0.5))
    key.location = (x + 1.2, 1.8, h + 0.6); look(key, (x, 0, h * 0.6))
    fill.location = (x - 1.8, 1.2, h * 0.6); look(fill, (x, 0, h * 0.5))
    rim.location = (x - 0.6, -1.6, h + 0.4); look(rim, (x, 0, h * 0.7))
    top.location = (x, 0.2, h + 0.9); look(top, (x, 0, 0))
    sc.render.filepath = OUT + f'r_{name}.png'
    bpy.ops.render.render(write_still=True)
    out.append(sc.render.filepath)
    # 옆모습
    cam.location = (x + h * 1.9, -0.05, h * 0.55); look(cam, (x, 0, h * 0.5))
    sc.render.filepath = OUT + f'r_{name}_side.png'
    bpy.ops.render.render(write_still=True)
    out.append(sc.render.filepath)
for c in cols.values(): c.hide_render = False
print('RENDERED', out)
