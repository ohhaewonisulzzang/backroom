# Blender 안에서 실행: Level 0 캐릭터 3종(하울러·플레이어·방랑자)을 유기적인 메시로 짓는다.
#  - 좌표는 게임 기준(x, y=위, z, 앞 = -z) 으로 적고 P() 가 Blender(z=위, 앞=+y) 로 바꾼다. glTF 로 내보내면 다시 게임 기준이 된다
#  - 부위마다 따로 (torso / head / armL / armR / legL / legR) — 원점 = 게임의 회전축(pivots)
import bpy, bmesh, math, random
from mathutils import Vector

OUT = r'__OUT__'
random.seed(7)

def P(x, y, z):            # 게임 좌표 → Blender 좌표
    return Vector((x, -z, y))

# ------------------------------------------------------------------ 장면 비우기
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)

# ------------------------------------------------------------------ 재질
def mat(name, color, rough=0.7, metal=0.0, emit=None, sss=0.0, bump=0.0, bumpScale=18.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if sss: b.inputs['Subsurface Weight'].default_value = sss
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = 6.0
    if bump:   # 잔주름·울퉁불퉁 (렌더용. glTF 에는 색만 간다)
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = bumpScale; n.inputs['Detail'].default_value = 8
        bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = bump
        nt.links.new(n.outputs['Fac'], bm.inputs['Height']); nt.links.new(bm.outputs['Normal'], b.inputs['Normal'])
    return m

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

# ------------------------------------------------------------------ 만들기 도구
def collection(name):
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c

def link(obj, col):
    for c in obj.users_collection: c.objects.unlink(obj)
    col.objects.link(obj)

def skin(name, col, verts, edges, radii, material, pivot, subd=2, displace=0.0, smooth=True):
    """뼈대(점·선)에 두께(radii)를 입혀 매끈한 살덩이를 만든다. pivot = 이 부위의 회전축(게임 좌표)"""
    me = bpy.data.meshes.new(name)
    piv = P(*pivot)
    me.from_pydata([P(*v) - piv for v in verts], edges, [])
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    ob.location = piv
    ob.modifiers.new('skin', 'SKIN')
    for i, r in enumerate(radii):
        rr = r if isinstance(r, (tuple, list)) else (r, r)
        me.skin_vertices[0].data[i].radius = rr
    me.skin_vertices[0].data[0].use_root = True
    s = ob.modifiers.new('subd', 'SUBSURF'); s.levels = subd; s.render_levels = subd
    if displace:
        tex = bpy.data.textures.new(name + '_n', 'CLOUDS'); tex.noise_scale = 0.05
        d = ob.modifiers.new('lumps', 'DISPLACE'); d.texture = tex; d.strength = displace; d.mid_level = 0.5
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    me.materials.append(material)
    return ob

def prim(kind, name, col, pos, size, material, rot=(0, 0, 0), parent=None, segs=24, bevel=0.0):
    """세부 부품 (구·원기둥·상자·원뿔·고리). size: 게임 기준 (x, y, z) 크기"""
    loc = P(*pos)
    if kind == 'sphere': bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=1, location=loc)
    elif kind == 'cyl': bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=1, depth=2, location=loc)
    elif kind == 'cone': bpy.ops.mesh.primitive_cone_add(vertices=segs, radius1=1, depth=2, location=loc)
    elif kind == 'torus': bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=size[1] / size[0], major_segments=segs, minor_segments=12, location=loc)
    else: bpy.ops.mesh.primitive_cube_add(size=2, location=loc)
    ob = bpy.context.active_object; ob.name = name
    sx, sy, sz = size if kind != 'torus' else (size[0], size[0], size[0])
    ob.scale = (sx, sz, sy) if kind != 'torus' else (sx, sx, sx)       # 게임 (x, y위, z) → Blender (x, z깊이, y위)
    ob.rotation_euler = (math.radians(rot[0]), math.radians(rot[2]), math.radians(rot[1]))
    if bevel:
        b = ob.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 3
    bpy.ops.object.shade_smooth()
    ob.data.materials.append(material)
    link(ob, col)
    if parent:
        mw = ob.matrix_world.copy(); ob.parent = parent; ob.matrix_world = mw
    return ob

def chain(points):
    """점 목록 → 이어진 선(edge) 목록"""
    return [(i, i + 1) for i in range(len(points) - 1)]

def group_root(col, name, pivot):
    e = bpy.data.objects.new(name, None); col.objects.link(e); e.location = P(*pivot); e.empty_display_size = 0.05
    return e

def parent_to(child, parent):
    mw = child.matrix_world.copy(); child.parent = parent; child.matrix_world = mw

# ================================================================== 하울러
def howler(x0):
    col = collection('howler')
    skin_m = mat('howler_skin', srgb('#17130f'), rough=0.55, sss=0.05, bump=0.6, bumpScale=40)
    ridge_m = mat('howler_ridge', srgb('#2a231b'), rough=0.5, bump=0.4)
    mouth_m = mat('howler_mouth', srgb('#2c0905'), rough=0.3)
    teeth_m = mat('howler_teeth', srgb('#c4b99c'), rough=0.35)
    eye_m = mat('howler_eye', srgb('#ffe6a0'), emit=srgb('#ffe6a0'))
    X = lambda v: (v[0] + x0, v[1], v[2])
    pv = {'torso': (0, 1.05, 0), 'head': (0, 1.98, -0.05), 'armL': (-0.25, 1.86, 0), 'armR': (0.25, 1.86, 0), 'legL': (-0.11, 1.05, 0), 'legR': (0.11, 1.05, 0)}
    root = group_root(col, 'howler', X((0, 0, 0)))
    torso_e = group_root(col, 'howler_torso', X(pv['torso'])); parent_to(torso_e, root)
    # --- 몸통: 척추 + 갈비뼈 가지 + 어깨 ---
    V, E, R = [], [], []
    def add(v, r, link_to=None):
        V.append(X(v)); R.append(r)
        if link_to is not None: E.append((link_to, len(V) - 1))
        return len(V) - 1
    spine = []
    prev = None
    for i in range(13):
        t = i / 12; y = 1.03 + t * 0.87; z = 0.03 + math.sin(t * math.pi) * 0.05 - t * 0.07
        w = 0.085 if t < 0.25 else 0.06 + math.sin((t - 0.25) / 0.75 * math.pi) * 0.05
        prev = add((0, y, z), (w * 1.25, w * 0.85), prev); spine.append(prev)
    for k, si in enumerate(spine[5:11]):                      # 갈비뼈: 가슴 둘레 타원을 따라 뒤→옆→앞으로 감싼다
        sy = V[si][1]; cz = V[si][2]
        t = (k + 5) / 12; w = 0.06 + math.sin((t - 0.25) / 0.75 * math.pi) * 0.05
        rx, rz = w * 1.25 + 0.012, w * 0.85 + 0.01
        for s in (-1, 1):
            prev_i = si
            for j in range(1, 7):
                phi = j / 6 * math.pi * 0.9                     # 0 = 등(+z) → π/2 = 옆 → π = 가슴(-z)
                prev_i = add((s * rx * math.sin(phi), sy - j * 0.006, cz + rz * math.cos(phi)), 0.011, prev_i)
    for s in (-1, 1):                                          # 엉덩이 (다리 위쪽과 겹치게)
        h1 = add((s * 0.07, 1.02, 0.02), 0.07, spine[0])
        add((s * 0.11, 0.96, 0.0), 0.062, h1)
    top = spine[-2]
    for s in (-1, 1):                                          # 어깨
        a = add((s * 0.12, 1.88, 0.0), 0.05, top)
        add((s * 0.23, 1.86, 0.0), 0.055, a)
    torso = skin('howler_torso_mesh', col, V, E, R, skin_m, X(pv['torso']), displace=0.006)
    parent_to(torso, torso_e)
    for i in range(10):                                        # 등에 튀어나온 척추뼈
        t = i / 9; y = 1.15 + t * 0.72; z = 0.1 + math.sin(t * math.pi) * 0.05 - t * 0.07
        parent_to(prim('sphere', f'vertebra{i}', col, X((0, y, z)), (0.022, 0.016, 0.02), ridge_m, segs=10), torso_e)
    # --- 머리: 목 + 길쭉한 두개골 + 턱 + 꺼진 눈 + 이빨 ---
    head_e = group_root(col, 'howler_head', X(pv['head'])); parent_to(head_e, torso_e)
    nv = [(0, 1.88, -0.01), (0, 1.97, -0.03), (0, 2.04, -0.03)]
    neck = skin('howler_neck', col, [X(v) for v in nv], chain(nv), [0.045, 0.04, 0.05], skin_m, X(pv['head']), displace=0.004)
    parent_to(neck, head_e)
    skull = prim('sphere', 'skull', col, X((0, 2.15, 0.0)), (0.125, 0.19, 0.15), skin_m, segs=32); parent_to(skull, head_e)
    cran = prim('sphere', 'cranium', col, X((0, 2.25, 0.04)), (0.11, 0.12, 0.13), skin_m, segs=24); parent_to(cran, head_e)
    jaw = prim('sphere', 'jaw', col, X((0, 1.99, -0.07)), (0.075, 0.05, 0.075), skin_m, segs=20); parent_to(jaw, head_e)
    parent_to(prim('cube', 'brow', col, X((0, 2.17, -0.12)), (0.09, 0.014, 0.025), ridge_m, rot=(-8, 0, 0), bevel=0.01), head_e)
    parent_to(prim('cube', 'mouth', col, X((0, 2.02, -0.125)), (0.06, 0.016, 0.02), mouth_m, bevel=0.008), head_e)
    for s in (-1, 1):
        parent_to(prim('sphere', f'socket{s}', col, X((s * 0.052, 2.14, -0.115)), (0.035, 0.028, 0.02), mouth_m, segs=16), head_e)
        parent_to(prim('sphere', f'eye{s}', col, X((s * 0.052, 2.14, -0.128)), (0.014, 0.014, 0.014), eye_m, segs=12), head_e)
        parent_to(prim('sphere', f'cheek{s}', col, X((s * 0.075, 2.06, -0.085)), (0.04, 0.055, 0.04), skin_m, segs=16), head_e)
    for i in range(10):
        x = -0.048 + i * 0.0107
        parent_to(prim('cone', f'toothT{i}', col, X((x, 2.023, -0.138)), (0.0055, 0.012, 0.0055), teeth_m, rot=(180, 0, 0), segs=8), head_e)
        parent_to(prim('cone', f'toothB{i}', col, X((x + 0.005, 2.004, -0.136)), (0.005, 0.01, 0.005), teeth_m, segs=8), head_e)
    # --- 팔: 아주 길고, 마디진 긴 손가락 ---
    for s, g in ((-1, 'armL'), (1, 'armR')):
        e = group_root(col, f'howler_{g}', X(pv[g])); parent_to(e, torso_e)
        V, E, R = [], [], []
        def addA(v, r, to=None):
            V.append(X(v)); R.append(r)
            if to is not None: E.append((to, len(V) - 1))
            return len(V) - 1
        sh = addA((s * 0.25, 1.85, 0), 0.05)
        mid = addA((s * 0.275, 1.62, 0.02), 0.038, sh)
        el = addA((s * 0.29, 1.4, 0.03), 0.042, mid)
        fm = addA((s * 0.295, 1.16, 0.005), 0.03, el)
        wr = addA((s * 0.3, 0.93, -0.02), 0.028, fm)
        palm = addA((s * 0.302, 0.85, -0.02), (0.022, 0.04), wr)
        for f in range(4):
            fz = -0.05 + f * 0.022; y = 0.82; to = palm
            for k, ln in enumerate((0.075, 0.065, 0.055)):
                y -= ln * (1.1 if f in (1, 2) else 0.95)
                to = addA((s * (0.304 + 0.004 * k), y, fz - 0.006 * k), 0.011 - k * 0.002, to)
        t1 = addA((s * 0.295, 0.86, -0.06), 0.011, wr); addA((s * 0.29, 0.77, -0.08), 0.009, t1)
        arm = skin(f'howler_{g}_mesh', col, V, E, R, skin_m, X(pv[g]), displace=0.004)
        parent_to(arm, e)
    # --- 다리 ---
    for s, g in ((-1, 'legL'), (1, 'legR')):
        e = group_root(col, f'howler_{g}', X(pv[g])); parent_to(e, root)
        pts = [(s * 0.11, 1.0, 0), (s * 0.115, 0.8, -0.01), (s * 0.12, 0.56, -0.03), (s * 0.12, 0.33, 0.0), (s * 0.12, 0.09, 0.02), (s * 0.12, 0.03, -0.08), (s * 0.12, 0.015, -0.19)]
        leg = skin(f'howler_{g}_mesh', col, [X(v) for v in pts], chain(pts), [0.06, 0.05, 0.042, 0.038, 0.032, 0.03, 0.02], skin_m, X(pv[g]), displace=0.004)
        parent_to(leg, e)
        parent_to(prim('sphere', f'knee{g}', col, X((s * 0.12, 0.56, -0.065)), (0.035, 0.04, 0.025), ridge_m, segs=14), e)
    return col

# ================================================================== 방호복 (플레이어 / 방랑자)
def hazmat(x0, name, suit_hex, wanderer=False):
    col = collection(name)
    rnd = random.Random(3 if wanderer else 1)
    suit_m = mat(f'{name}_suit', srgb(suit_hex), rough=0.45 if not wanderer else 0.75, bump=0.15 if not wanderer else 0.5, bumpScale=25)
    rub_m = mat(f'{name}_rubber', srgb('#1c1c1a'), rough=0.6)
    visor_m = mat(f'{name}_visor', srgb('#0d1518'), rough=0.08, metal=0.2)
    metal_m = mat(f'{name}_metal', srgb('#7a7a74'), rough=0.3, metal=0.8)
    filt_m = mat(f'{name}_filter', srgb('#2b2b28'), rough=0.5)
    stripe_m = mat(f'{name}_stripe', srgb('#d8d8c8'), rough=0.3)
    tape_m = mat(f'{name}_tape', srgb('#9a9a90'), rough=0.8)
    grime_m = mat(f'{name}_grime', srgb('#3a3020'), rough=0.9)
    lamp_m = mat(f'{name}_lamp', srgb('#fff4c8'), emit=srgb('#fff4c8'))
    X = lambda v: (v[0] + x0, v[1], v[2])
    pv = {'torso': (0, 0.86, 0), 'head': (0, 1.48, 0), 'armL': (-0.26, 1.38, 0), 'armR': (0.26, 1.38, 0), 'legL': (-0.1, 0.86, 0), 'legR': (0.1, 0.86, 0)}
    lean = 8 if wanderer else 0
    root = group_root(col, name, X((0, 0, 0)))
    torso_e = group_root(col, f'{name}_torso', X(pv['torso'])); parent_to(torso_e, root)
    # --- 몸통: 헐렁한 방호복 (주름이 진 듯 울퉁불퉁) ---
    pts = [(0, 0.84, 0), (0, 0.98, 0.0), (0, 1.12, 0.0), (0, 1.26, -0.005), (0, 1.38, 0.0)]
    rad = [(0.2, 0.15), (0.205, 0.16), (0.215, 0.17), (0.22, 0.17), (0.17, 0.13)]
    V = list(pts); E = chain(pts); R = list(rad)
    for s in (-1, 1): V.append((s * 0.2, 1.37, 0)); E.append((4, len(V) - 1)); R.append(0.09)
    body = skin(f'{name}_body', col, [X(v) for v in V], E, R, suit_m, X(pv['torso']), displace=0.012 if wanderer else 0.007)
    parent_to(body, torso_e)
    parent_to(prim('cube', 'zipper', col, X((0, 1.1, -0.178)), (0.006, 0.24, 0.006), metal_m), torso_e)
    for y in (0.98, 1.25): parent_to(prim('torus', f'stripe{y}', col, X((0, y, 0)), (0.215, 0.011), stripe_m, rot=(0, 0, 0)), torso_e)
    parent_to(prim('cyl', 'belt', col, X((0, 0.9, 0)), (0.215, 0.025, 0.17), rub_m), torso_e)
    parent_to(prim('cube', 'buckle', col, X((0, 0.9, -0.178)), (0.035, 0.022, 0.01), metal_m, bevel=0.004), torso_e)
    for s in (-1, 1):
        if not wanderer or rnd.random() < 0.6: parent_to(prim('cube', f'pouch{s}', col, X((s * 0.16, 0.89, -0.13)), (0.04, 0.045, 0.025), rub_m, rot=(0, s * 25, 0), bevel=0.01), torso_e)
        parent_to(prim('cube', f'strap{s}', col, X((s * 0.11, 1.17, -0.165)), (0.022, 0.2, 0.01), rub_m, rot=(-8, 0, s * 4)), torso_e)
    # 배낭: 산소통 2개
    parent_to(prim('cube', 'packFrame', col, X((0, 1.15, 0.2)), (0.15, 0.21, 0.03), rub_m, bevel=0.015), torso_e)
    for s in (-1, 1):
        if wanderer and rnd.random() < 0.4: continue
        parent_to(prim('cyl', f'tank{s}', col, X((s * 0.075, 1.16, 0.27)), (0.062, 0.19, 0.062), metal_m, bevel=0.02), torso_e)
    # 호스 (배낭 → 호흡기)
    hp = [(0.0, 1.5, -0.2), (0.05, 1.42, -0.2), (0.12, 1.33, -0.19), (0.19, 1.22, -0.15), (0.23, 1.12, -0.06), (0.22, 1.08, 0.06), (0.17, 1.1, 0.17), (0.1, 1.14, 0.24), (0.075, 1.2, 0.27)]
    hose = skin(f'{name}_hose', col, [X(v) for v in hp], chain(hp), [0.02] * 9, rub_m, X(pv['torso']), subd=1)
    parent_to(hose, torso_e)
    # --- 머리: 후드, 굽은 바이저, 호흡기, 필터 ---
    head_e = group_root(col, f'{name}_head', X(pv['head'])); parent_to(head_e, torso_e)
    hood = prim('sphere', 'hood', col, X((0, 1.6, 0.01)), (0.16, 0.18, 0.165), suit_m, segs=32); parent_to(hood, head_e)
    parent_to(prim('cyl', 'hoodNeck', col, X((0, 1.47, 0)), (0.14, 0.05, 0.14), suit_m), head_e)
    visor = prim('sphere', 'visor', col, X((0, 1.63, -0.03)), (0.145, 0.105, 0.14), visor_m, segs=40); parent_to(visor, head_e)
    rim = prim('torus', 'visorRim', col, X((0, 1.63, -0.03)), (0.146, 0.012), rub_m, rot=(0, 0, 0)); rim.scale = (0.146, 0.142, 0.106); parent_to(rim, head_e)
    parent_to(prim('cyl', 'respirator', col, X((0, 1.53, -0.15)), (0.055, 0.035, 0.055), rub_m, rot=(90, 0, 0), bevel=0.01), head_e)
    for s in (-1, 1):
        if wanderer and rnd.random() < 0.35: continue
        parent_to(prim('cyl', f'filter{s}', col, X((s * 0.085, 1.51, -0.145)), (0.042, 0.025, 0.042), filt_m, rot=(90, 0, s * -30), bevel=0.008), head_e)
    # --- 팔 ---
    for s, g in ((-1, 'armL'), (1, 'armR')):
        e = group_root(col, f'{name}_{g}', X(pv[g])); parent_to(e, torso_e)
        ap = [(s * 0.26, 1.37, 0), (s * 0.28, 1.24, 0.01), (s * 0.29, 1.12, 0.02), (s * 0.292, 1.0, 0.0), (s * 0.29, 0.9, -0.02), (s * 0.29, 0.8, -0.02)]
        arm = skin(f'{name}_{g}_mesh', col, [X(v) for v in ap], chain(ap), [0.07, 0.066, 0.06, 0.058, 0.055, (0.04, 0.05)], suit_m, X(pv[g]), displace=0.008 if wanderer else 0.004)
        parent_to(arm, e)
        parent_to(prim('cyl', f'cuff{g}', col, X((s * 0.29, 0.89, -0.02)), (0.06, 0.03, 0.06), rub_m), e)
        gl = [(s * 0.29, 0.86, -0.02), (s * 0.29, 0.78, -0.025), (s * 0.288, 0.72, -0.03)]
        glove = skin(f'{name}_{g}_glove', col, [X(v) for v in gl], chain(gl), [(0.03, 0.045), (0.028, 0.045), 0.02], rub_m, X(pv[g]))
        parent_to(glove, e)
        parent_to(prim('torus', f'stripeArm{g}', col, X((s * 0.29, 1.0, 0)), (0.062, 0.008), stripe_m), e)
        if g == 'armR' and not wanderer:
            parent_to(prim('cyl', 'flashlight', col, X((0.29, 0.79, -0.09)), (0.018, 0.08, 0.018), metal_m, rot=(90, 0, 0)), e)
            parent_to(prim('cyl', 'lens', col, X((0.29, 0.79, -0.175)), (0.025, 0.004, 0.025), lamp_m, rot=(90, 0, 0)), e)
    # --- 다리 + 부츠 ---
    for s, g in ((-1, 'legL'), (1, 'legR')):
        e = group_root(col, f'{name}_{g}', X(pv[g])); parent_to(e, root)
        lp = [(s * 0.1, 0.86, 0), (s * 0.104, 0.66, -0.005), (s * 0.105, 0.47, -0.01), (s * 0.105, 0.3, 0.0), (s * 0.105, 0.2, 0.0)]
        leg = skin(f'{name}_{g}_mesh', col, [X(v) for v in lp], chain(lp), [0.09, 0.085, 0.078, 0.074, 0.074], suit_m, X(pv[g]), displace=0.008 if wanderer else 0.004)
        parent_to(leg, e)
        parent_to(prim('cube', f'knee{g}', col, X((s * 0.105, 0.47, -0.085)), (0.05, 0.05, 0.015), rub_m, bevel=0.01), e)
        bp = [(s * 0.105, 0.22, 0.0), (s * 0.105, 0.08, 0.0), (s * 0.105, 0.04, -0.06), (s * 0.105, 0.04, -0.15)]
        boot = skin(f'{name}_{g}_boot', col, [X(v) for v in bp], chain(bp), [0.078, 0.074, (0.055, 0.045), (0.05, 0.04)], rub_m, X(pv[g]))
        parent_to(boot, e)
        parent_to(prim('torus', f'stripeLeg{g}', col, X((s * 0.105, 0.32, 0)), (0.079, 0.009), stripe_m), e)
    if wanderer:   # 찢어지고 더러운 곳
        for i in range(9):
            g = rnd.choice(['torso', 'torso', 'legL', 'legR', 'armL', 'armR'])
            par = torso_e if g == 'torso' else [o for o in col.objects if o.name == f'{name}_{g}'][0]
            y = rnd.uniform(0.95, 1.3) if g == 'torso' else rnd.uniform(0.95, 1.3) if g.startswith('arm') else rnd.uniform(0.35, 0.8)
            x = rnd.uniform(-0.12, 0.12) if g == 'torso' else (-1 if g.endswith('L') else 1) * (0.105 if g.startswith('leg') else 0.29)
            zf = -0.175 if g == 'torso' else (-0.055 if g.startswith('arm') else -0.075)
            parent_to(prim('sphere', f'grime{i}', col, X((x, y, zf)), (0.035, 0.028, 0.01), grime_m, segs=12), par)
        torso_e.rotation_euler.x = math.radians(lean)       # 구부정
        head_e.rotation_euler.x = math.radians(12)
    return col

# ------------------------------------------------------------------ 짓기
H = howler(0.0)
PL = hazmat(1.0, 'player', '#e7b92e')
W = hazmat(2.0, 'wanderer', '#a59a72', wanderer=True)
counts = {c.name: (len(c.objects), sum(len(o.data.polygons) for o in c.objects if o.type == 'MESH')) for c in (H, PL, W)}
print('BUILT', counts)
