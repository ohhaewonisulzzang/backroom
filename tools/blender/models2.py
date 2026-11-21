# Blender 안에서 실행 (tools/blender/bsend.py 로 보내거나 Blender 스크립트 창에서):
#   Level 0 캐릭터 3종 + 아이템 9종 + 1인칭 손·손전등을 짓고 public/models/ 에 .glb 로 내보낸다.
#
# 방식: 같은 부위·같은 재질의 살 조각(타원체·테이퍼 캡슐·스킨 사슬)을 하나로 합쳐 복셀 리메시로 녹여 붙인다
#       → 갈비뼈·옷 주름이 표면에 자연스럽게 도드라진 조각 같은 형태. 눈구멍·입은 불리언으로 파낸다. 마지막에 면 수를 줄인다.
# 좌표: 게임 기준 (x, y=위, z, 앞 = -z) 으로 적고 P() 가 Blender(z=위, 앞=+y) 로 바꾼다. glTF(+Y 위) 로 내보내면 다시 게임 기준.
# 부위(torso/head/armL/armR/legL/legR)는 빈 오브젝트(원점 = 게임의 회전축)로 나눠서, 게임이 걷기 애니메이션으로 돌린다.
import bpy, bmesh, math, random
from mathutils import Vector

ROOT = r'C:/Users/PYJ/orca/backroom/'
OUT_MODELS = ROOT + 'public/models/'
import os
os.makedirs(OUT_MODELS + 'level0', exist_ok=True); os.makedirs(OUT_MODELS + 'items', exist_ok=True)

def P(x, y, z): return Vector((x, -z, y))

# ------------------------------------------------------------------ 장면 비우기
def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.textures, bpy.data.curves):
        for b in list(blk): blk.remove(b)
clear()

# ------------------------------------------------------------------ 재질
def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

def mat(name, hexc, rough=0.7, metal=0.0, emit=None, emit_k=4.0, alpha=1.0, trans=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb(hexc), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*srgb(emit), 1); b.inputs['Emission Strength'].default_value = emit_k
    if trans: b.inputs['Transmission Weight'].default_value = trans
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    return m

# ------------------------------------------------------------------ 조각 만들기 (모두 게임 좌표)
TMP = []          # 합치기 전 조각들 (부위별로 모아 녹인다)

def _new(ob):
    TMP.append(ob); return ob

def sph(pos, rad, segs=20):
    """타원체. rad = (x반지름, y반지름(위), z반지름(깊이))"""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=max(8, segs // 2), radius=1, location=P(*pos))
    ob = bpy.context.active_object
    ob.scale = (rad[0], rad[2], rad[1])
    return _new(ob)

def skin(points, radii, edges=None, subd=2):
    """점 사슬에 두께를 입힌다. radii: 점마다 r 또는 (r가로, r세로)"""
    me = bpy.data.meshes.new('sk')
    me.from_pydata([P(*v) for v in points], edges or [(i, i + 1) for i in range(len(points) - 1)], [])
    ob = bpy.data.objects.new('sk', me); bpy.context.scene.collection.objects.link(ob)
    ob.modifiers.new('skin', 'SKIN')
    for i, r in enumerate(radii):
        me.skin_vertices[0].data[i].radius = r if isinstance(r, (tuple, list)) else (r, r)
    me.skin_vertices[0].data[0].use_root = True
    s = ob.modifiers.new('subd', 'SUBSURF'); s.levels = subd
    apply_all(ob)
    return _new(ob)

def cap(a, b, r0, r1=None, subd=2):
    """a→b 테이퍼 캡슐"""
    return skin([a, b], [r0, r1 if r1 is not None else r0], subd=subd)

def ring(center, rx, rz, thick, n=24, tilt=0.0):
    """수평 고리 (주름·띠). center 높이에서 타원 (rx, rz), tilt: 앞뒤 기울기(°)"""
    pts = []
    for i in range(n):
        a = i / n * math.tau
        y = center[1] + math.sin(a) * math.tan(math.radians(tilt)) * rz
        pts.append((center[0] + math.cos(a) * rx, y, center[2] + math.sin(a) * rz))
    edges = [(i, (i + 1) % n) for i in range(n)]
    return skin(pts, [thick] * n, edges=edges, subd=1)

def prim(kind, pos, size, rot=(0, 0, 0), segs=24, bevel=0.0):
    """단단한 부품. size = 게임 기준 (x, y위, z) 반 크기"""
    loc = P(*pos)
    if kind == 'cyl': bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=1, depth=2, location=loc)
    elif kind == 'cone': bpy.ops.mesh.primitive_cone_add(vertices=segs, radius1=1, depth=2, location=loc)
    elif kind == 'torus': bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=size[1] / size[0], major_segments=segs, minor_segments=10, location=loc)
    elif kind == 'sphere': bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=1, location=loc)
    else: bpy.ops.mesh.primitive_cube_add(size=2, location=loc)
    ob = bpy.context.active_object
    if kind == 'torus': ob.scale = (size[0], size[0], size[0])
    else: ob.scale = (size[0], size[2], size[1])
    ob.rotation_euler = (math.radians(rot[0]), math.radians(rot[2]), math.radians(rot[1]))
    if bevel:
        bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 3; bv.limit_method = 'ANGLE'
    apply_all(ob)
    return _new(ob)

def apply_all(ob):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

def join(objs):
    objs = [o for o in objs if o and o.name in bpy.data.objects]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    ob = bpy.context.active_object
    for o in objs:
        if o in TMP: TMP.remove(o)
    return ob

def melt(objs, voxel, faces, cutters=(), smooth=6, name='part'):
    """조각들을 녹여 붙인다: 합치기 → 복셀 리메시 → (불리언으로 파내기 → 다시 리메시) → 매끈하게 → 면 줄이기"""
    ob = join(objs); ob.name = name
    r = ob.modifiers.new('rm', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = voxel; r.adaptivity = 0
    apply_all(ob)
    for c in cutters:
        b = ob.modifiers.new('cut', 'BOOLEAN'); b.operation = 'DIFFERENCE'; b.object = c; b.solver = 'EXACT'
        apply_all(ob)
    for c in cutters:
        if c in TMP: TMP.remove(c)
        bpy.data.objects.remove(c, do_unlink=True)
    if cutters:
        r = ob.modifiers.new('rm2', 'REMESH'); r.mode = 'VOXEL'; r.voxel_size = voxel * 0.8
        apply_all(ob)
    if smooth:
        s = ob.modifiers.new('sm', 'SMOOTH'); s.factor = 0.6; s.iterations = smooth
        apply_all(ob)
    n = len(ob.data.polygons)
    if n > faces:
        d = ob.modifiers.new('dc', 'DECIMATE'); d.ratio = faces / n
        apply_all(ob)
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def solid(objs, name='part'):
    """단단한 부품은 녹이지 않고 그냥 합친다"""
    ob = join(objs); ob.name = name
    for p in ob.data.polygons: p.use_smooth = True
    try: ob.data.set_sharp_from_angle(angle=math.radians(40))
    except Exception: pass
    return ob

def put(ob, material, parent, col):
    ob.data.materials.clear(); ob.data.materials.append(material)
    for c in ob.users_collection: c.objects.unlink(ob)
    col.objects.link(ob)
    if parent:
        mw = ob.matrix_world.copy(); ob.parent = parent; ob.matrix_world = mw
    return ob

def empty(name, pos, parent, col):
    e = bpy.data.objects.new(name, None); col.objects.link(e); e.location = P(*pos); e.empty_display_size = 0.04
    if parent:
        mw = e.matrix_world.copy(); e.parent = parent; e.matrix_world = mw
    return e

def collection(name):
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c

def surface_point(target, origin, direction):
    """target 메시 표면에서 origin→direction 광선이 처음 닿는 곳 (게임 좌표 → 게임 좌표, 법선)"""
    o = P(*origin); d = P(*direction).normalized()
    inv = target.matrix_world.inverted()
    ok, loc, nor, _ = target.ray_cast(inv @ o, (inv.to_3x3() @ d).normalized())
    if not ok: return None
    w = target.matrix_world @ loc; n = (target.matrix_world.to_3x3() @ nor).normalized()
    return (w.x, w.z, -w.y), (n.x, n.z, -n.y)

# ================================================================== 하울러
def howler():
    col = collection('howler')
    SK = mat('howler_skin', '#1a1511', rough=0.55)
    BONE = mat('howler_bone', '#2a221a', rough=0.5)
    TEETH = mat('howler_teeth', '#cfc3a2', rough=0.35)
    GUM = mat('howler_mouth', '#2a0806', rough=0.4)
    EYE = mat('howler_eye', '#ffe6a0', emit='#ffe6a0', emit_k=8)
    pv = {'torso': (0, 1.05, 0), 'head': (0, 1.98, -0.04), 'armL': (-0.24, 1.86, 0), 'armR': (0.24, 1.86, 0), 'legL': (-0.105, 1.02, 0), 'legR': (0.105, 1.02, 0)}
    root = empty('howler', (0, 0, 0), None, col)
    E = {'torso': empty('torso', pv['torso'], root, col)}
    E['head'] = empty('head', pv['head'], E['torso'], col)
    for g in ('armL', 'armR'): E[g] = empty(g, pv[g], E['torso'], col)
    for g in ('legL', 'legR'): E[g] = empty(g, pv[g], root, col)
    # --- 몸통: 갈비뼈가 드러난 홀쭉한 가슴, 꺼진 배, 튀어나온 척추·어깨뼈 ---
    T = []
    T.append(sph((0, 1.63, 0.0), (0.125, 0.2, 0.095), 28))                 # 흉곽
    T.append(skin([(0, 1.08, 0.015), (0, 1.2, 0.02), (0, 1.33, 0.015), (0, 1.46, 0.0), (0, 1.55, 0.0)], [0.075, 0.062, 0.058, 0.07, 0.09]))   # 꺼진 배 (골반~흉곽을 잇는다)
    T.append(sph((0, 1.07, 0.01), (0.115, 0.075, 0.075)))                   # 골반
    for s in (-1, 1):
        T.append(sph((s * 0.095, 1.0, 0.0), (0.06, 0.06, 0.06)))            # 엉덩이 관절 (다리와 겹친다)
        T.append(sph((s * 0.215, 1.86, 0.0), (0.058, 0.05, 0.055)))          # 어깨
        T.append(cap((s * 0.03, 1.855, -0.07), (s * 0.2, 1.875, -0.02), 0.017))   # 쇄골
        T.append(sph((s * 0.085, 1.72, 0.085), (0.055, 0.075, 0.018)))       # 어깨뼈
        for k in range(7):                                                    # 갈비뼈 7쌍: 등 → 옆 → 가슴, 아래로 처지며 감싼다
            y0 = 1.76 - k * 0.055; rx = 0.128 - abs(k - 2.5) * 0.004; rz = 0.1
            pts = []
            for j in range(8):
                phi = j / 7 * math.pi * 0.86
                pts.append((s * rx * math.sin(phi), y0 - math.sin(phi) * 0.035 - j * 0.004, 0.012 + rz * math.cos(phi)))
            T.append(skin(pts, [0.0125] * len(pts), subd=1))
    T.append(cap((0, 1.47, -0.095), (0, 1.8, -0.098), 0.014))               # 가슴뼈
    T.append(cap((0, 1.8, 0.02), (0, 1.93, 0.0), 0.06, 0.045))               # 승모근
    for i in range(14):                                                       # 척추뼈 (등)
        t = i / 13; y = 1.1 + t * 0.78; z = 0.07 + math.sin(t * math.pi) * 0.035
        T.append(sph((0, y, z), (0.02, 0.016, 0.022), 10))
    torso = melt(T, 0.0065, 6000, name='howler_torso_mesh')
    put(torso, SK, E['torso'], col)
    # --- 머리: 길쭉한 두개골, 튀어나온 주둥이, 움푹 파인 눈, 귀까지 찢어진 입 ---
    Hd = []
    Hd.append(cap((0, 1.88, 0.0), (0, 2.02, -0.03), 0.04, 0.034))            # 목
    for s in (-1, 1): Hd.append(cap((s * 0.025, 1.9, -0.035), (s * 0.02, 2.0, -0.06), 0.009))   # 목 힘줄
    Hd.append(sph((0, 2.2, 0.025), (0.1, 0.16, 0.125), 32))                  # 길쭉한 두개골
    Hd.append(sph((0, 2.07, -0.065), (0.072, 0.085, 0.07), 24))              # 얼굴 앞쪽
    Hd.append(sph((0, 1.995, -0.06), (0.066, 0.038, 0.072)))                 # 턱
    for s in (-1, 1):
        Hd.append(sph((s * 0.068, 2.1, -0.075), (0.028, 0.02, 0.03)))       # 광대
        Hd.append(sph((s * 0.04, 2.168, -0.105), (0.035, 0.016, 0.02)))     # 눈썹뼈
    cutters = []
    for s in (-1, 1): cutters.append(sph((s * 0.043, 2.13, -0.13), (0.03, 0.025, 0.04)))   # 눈구멍
    cutters.append(sph((0, 2.028, -0.125), (0.068, 0.011, 0.05)))            # 찢어진 입
    for c in cutters: TMP.remove(c)
    head = melt(Hd, 0.004, 5000, cutters=cutters, smooth=4, name='howler_head_mesh')
    put(head, SK, E['head'], col)
    put(solid([sph((0, 2.028, -0.105), (0.06, 0.009, 0.03))], 'howler_gum'), GUM, E['head'], col)
    put(solid([sph((s * 0.043, 2.128, -0.112), (0.011, 0.011, 0.011), 12) for s in (-1, 1)], 'howler_eyes'), EYE, E['head'], col)
    teeth = []
    for i in range(16):                                                       # 바늘 이빨 (입 둘레를 따라)
        a = (i / 15 - 0.5) * 2.1; x = math.sin(a) * 0.062; z = -0.125 + (1 - math.cos(a)) * 0.04
        teeth.append(prim('cone', (x, 2.034, z), (0.0045, 0.011, 0.0045), rot=(180, 0, 0), segs=8))
        teeth.append(prim('cone', (x * 0.97, 2.021, z + 0.002), (0.004, 0.01, 0.004), segs=8))
    put(solid(teeth, 'howler_teeth'), TEETH, E['head'], col)
    # --- 팔: 아주 길고 마디가 튀어나왔다. 손가락은 세 마디로 길게 늘어진다 ---
    for s, g in ((-1, 'armL'), (1, 'armR')):
        A = []
        sh, el, wr = (s * 0.245, 1.85, 0), (s * 0.29, 1.4, 0.035), (s * 0.3, 0.93, -0.01)
        A.append(cap(sh, el, 0.045, 0.032))
        A.append(sph(el, (0.04, 0.042, 0.04)))
        A.append(cap(el, wr, 0.033, 0.023))
        A.append(cap((el[0] + s * 0.015, el[1] - 0.05, 0.05), (wr[0] + s * 0.01, wr[1] + 0.06, 0.012), 0.011))   # 팔뚝 뼈
        A.append(sph(wr, (0.026, 0.024, 0.024)))
        A.append(sph((wr[0], wr[1] - 0.075, wr[2] - 0.005), (0.02, 0.06, 0.04)))   # 손바닥
        arm = melt(A, 0.0045, 3500, name=f'howler_{g}_mesh')
        put(arm, SK, E[g], col)
        F = []
        for f in range(4):
            fz = wr[2] - 0.04 + f * 0.024; y = wr[1] - 0.13; pts = [(wr[0], y + 0.03, fz)]
            for k, ln in enumerate((0.08, 0.07, 0.06)):
                y -= ln * (1.1 if f in (1, 2) else 0.92)
                pts.append((wr[0] + s * 0.004 * (k + 1), y, fz - 0.01 * (k + 1)))
            F.append(skin(pts, [0.011, 0.0095, 0.008, 0.005], subd=2))
            for p in pts[1:-1]: F.append(sph(p, (0.011, 0.011, 0.011), 10))     # 마디
        F.append(skin([(wr[0], wr[1] - 0.05, wr[2] - 0.04), (wr[0] + s * 0.01, wr[1] - 0.13, wr[2] - 0.075), (wr[0] + s * 0.012, wr[1] - 0.19, wr[2] - 0.085)], [0.011, 0.009, 0.006]))
        put(solid(F, f'howler_{g}_fingers'), SK, E[g], col)
    # --- 다리 ---
    for s, g in ((-1, 'legL'), (1, 'legR')):
        L = []
        hp, kn, an = (s * 0.105, 1.0, 0), (s * 0.115, 0.56, -0.03), (s * 0.12, 0.09, 0.02)
        L.append(cap(hp, kn, 0.058, 0.04))
        L.append(sph((kn[0], kn[1], kn[2] - 0.022), (0.036, 0.04, 0.03)))       # 무릎
        L.append(cap(kn, an, 0.037, 0.024))
        L.append(sph((kn[0], kn[1] - 0.17, kn[2] + 0.03), (0.033, 0.09, 0.033)))   # 종아리
        L.append(sph(an, (0.028, 0.028, 0.028)))
        L.append(cap((an[0], 0.035, an[2] + 0.04), (an[0], 0.02, an[2] - 0.12), 0.03, 0.022))   # 발
        for t in range(4): L.append(cap((an[0] - 0.02 + t * 0.013, 0.018, an[2] - 0.12), (an[0] - 0.024 + t * 0.016, 0.009, an[2] - 0.2), 0.008, 0.005))
        leg = melt(L, 0.005, 2800, name=f'howler_{g}_mesh')
        put(leg, SK, E[g], col)
    return col

# ================================================================== 방호복 사람 (플레이어 / 방랑자)
def hazmat(name, suit_hex, wanderer=False):
    col = collection(name)
    rnd = random.Random(11 if wanderer else 5)
    SUIT = mat(f'{name}_suit', suit_hex, rough=0.55 if not wanderer else 0.8)
    RUB = mat(f'{name}_rubber', '#1c1c1a', rough=0.65)
    VIS = mat(f'{name}_visor', '#101a1e', rough=0.05, metal=0.3)
    MET = mat(f'{name}_metal', '#7c7c76', rough=0.35, metal=0.8)
    FIL = mat(f'{name}_filter', '#2b2b28', rough=0.55)
    TAPE = mat(f'{name}_stripe', '#d6d6c6', rough=0.3)
    GRIME = mat(f'{name}_grime', '#3a3020', rough=0.95)
    TEAR = mat(f'{name}_tear', '#14100a', rough=0.95)
    pv = {'torso': (0, 0.86, 0), 'head': (0, 1.46, 0), 'armL': (-0.25, 1.37, 0), 'armR': (0.25, 1.37, 0), 'legL': (-0.1, 0.86, 0), 'legR': (0.1, 0.86, 0)}
    root = empty(name, (0, 0, 0), None, col)
    E = {'torso': empty('torso', pv['torso'], root, col)}
    E['head'] = empty('head', pv['head'], E['torso'], col)
    for g in ('armL', 'armR'): E[g] = empty(g, pv[g], E['torso'], col)
    for g in ('legL', 'legR'): E[g] = empty(g, pv[g], root, col)
    # --- 몸통: 헐렁한 방호복. 주름 고리를 녹여 붙여 천 주름을 만든다 ---
    S = []
    S.append(skin([(0, 0.84, 0.0), (0, 0.98, 0.0), (0, 1.12, -0.005), (0, 1.26, -0.01), (0, 1.36, 0.0)], [(0.19, 0.15), (0.2, 0.155), (0.205, 0.16), (0.21, 0.165), (0.17, 0.13)]))
    for s in (-1, 1):
        S.append(sph((s * 0.19, 1.34, 0.0), (0.095, 0.08, 0.09)))             # 어깨
        S.append(sph((s * 0.095, 0.85, 0.0), (0.095, 0.08, 0.09)))             # 엉덩이
    for k in range(5):                                                         # 허리·배 주름
        y = 0.95 + k * 0.045 + rnd.uniform(-0.01, 0.01)
        S.append(ring((0, y, 0.0), 0.2 + rnd.uniform(0, 0.01), 0.155, 0.009, tilt=rnd.uniform(-6, 6)))
    S.append(ring((0, 1.41, 0.0), 0.12, 0.11, 0.022))                          # 목깃
    torso = melt(S, 0.008, 5000, smooth=5, name=f'{name}_body')
    put(torso, SUIT, E['torso'], col)
    # 띠·벨트·멜빵·배낭 (단단한 부품)
    put(solid([ring((0, y, 0.0), 0.212, 0.167, 0.008) for y in (1.0, 1.26)], f'{name}_stripes'), TAPE, E['torso'], col)
    R = [prim('cyl', (0, 0.9, 0), (0.212, 0.026, 0.168), segs=32)]               # 벨트
    R.append(prim('cube', (0, 0.9, -0.17), (0.034, 0.022, 0.012), bevel=0.004))
    for s in (-1, 1):
        if not wanderer or rnd.random() < 0.65: R.append(prim('cube', (s * 0.16, 0.89, -0.13), (0.042, 0.048, 0.026), rot=(0, s * 28, 0), bevel=0.012))
        strap = [(s * 0.11, 0.96, -0.168), (s * 0.115, 1.2, -0.172), (s * 0.13, 1.36, -0.12), (s * 0.135, 1.42, 0.0), (s * 0.13, 1.36, 0.13), (s * 0.115, 1.2, 0.175)]
        R.append(skin(strap, [(0.022, 0.006)] * len(strap), subd=1))              # 어깨를 넘어가는 멜빵
    R.append(prim('cube', (0, 1.15, 0.185), (0.15, 0.2, 0.025), bevel=0.012))   # 배낭 판 (등에 붙는다)
    put(solid(R, f'{name}_gear'), RUB, E['torso'], col)
    M = []
    for s in (-1, 1):
        if wanderer and rnd.random() < 0.35: continue
        M.append(prim('cyl', (s * 0.075, 1.15, 0.255), (0.06, 0.18, 0.06), segs=24, bevel=0.02))   # 산소통
    M.append(prim('cyl', (0, 1.38, 0.255), (0.018, 0.035, 0.018), segs=12))
    M.append(prim('cube', (0, 1.08, -0.176), (0.004, 0.25, 0.004)))              # 지퍼
    put(solid(M, f'{name}_metal'), MET, E['torso'], col)
    hose = skin([(0.0, 1.47, -0.205), (0.06, 1.4, -0.205), (0.13, 1.31, -0.19), (0.2, 1.21, -0.14), (0.235, 1.12, -0.05), (0.225, 1.08, 0.07), (0.17, 1.1, 0.18), (0.11, 1.15, 0.24), (0.08, 1.22, 0.255)], [0.019] * 9, subd=2)
    put(solid([hose], f'{name}_hose'), RUB, E['torso'], col)
    # --- 머리: 후드 + 얼굴을 덮는 굽은 바이저(구의 앞쪽 조각) + 테두리 + 턱 호흡기 ---
    Hh = [sph((0, 1.6, 0.012), (0.152, 0.172, 0.16), 32), cap((0, 1.44, 0), (0, 1.5, 0), 0.13, 0.135)]
    hood = melt(Hh, 0.007, 2500, smooth=3, name=f'{name}_hood')
    put(hood, SUIT, E['head'], col)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=0.158, location=P(0, 1.615, 0.0))
    vis = bpy.context.active_object
    bm = bmesh.new(); bm.from_mesh(vis.data)
    kill = [v for v in bm.verts if not (v.co.y > 0 and abs(math.degrees(math.atan2(v.co.x, v.co.y))) < 62 and -32 < math.degrees(math.asin(max(-1, min(1, v.co.z / 0.158)))) < 34)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(vis.data); bm.free()
    so = vis.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.005; apply_all(vis)
    vis.name = f'{name}_visor'; put(vis, VIS, E['head'], col)
    rim = []
    for i in range(41):                                                         # 바이저 테두리 (가장자리를 따라)
        t = i / 40 * math.tau; az = math.radians(63) * math.cos(t); el = math.radians(1 + 34 * math.sin(t) if math.sin(t) > 0 else 1 + 33 * math.sin(t))
        r = 0.161
        rim.append((r * math.cos(el) * math.sin(az), 1.615 + r * math.sin(el), -r * math.cos(el) * math.cos(az)))
    rim_ob = skin(rim, [0.009] * len(rim), edges=[(i, (i + 1) % len(rim)) for i in range(len(rim) - 1)], subd=1)
    G = [rim_ob, prim('cyl', (0, 1.49, -0.165), (0.052, 0.035, 0.052), rot=(70, 0, 0), segs=24, bevel=0.01)]   # 호흡기
    for s in (-1, 1):
        if wanderer and rnd.random() < 0.35: continue
        G.append(prim('cyl', (s * 0.085, 1.47, -0.15), (0.04, 0.024, 0.04), rot=(80, 0, s * -32), segs=20, bevel=0.008))   # 필터
    put(solid(G, f'{name}_mask'), RUB, E['head'], col)
    put(solid([prim('cyl', (0, 1.49, -0.205), (0.034, 0.004, 0.034), rot=(70, 0, 0), segs=20)], f'{name}_grill'), MET, E['head'], col)
    # --- 팔 (살짝 벌리고 팔꿈치를 굽힌 자세) + 주름 + 장갑 ---
    for s, g in ((-1, 'armL'), (1, 'armR')):
        sh, el, wr = (s * 0.255, 1.36, 0.0), (s * 0.295, 1.11, 0.03), (s * 0.3, 0.88, -0.02)
        A = [cap(sh, el, 0.072, 0.062), sph(el, (0.06, 0.06, 0.06)), cap(el, wr, 0.06, 0.054)]
        for k in range(3):
            y = el[1] - 0.02 + k * 0.03
            A.append(ring((el[0] + s * 0.004 * k, y, el[2]), 0.062, 0.062, 0.0075, tilt=rnd.uniform(-15, 15)))
        for k in range(2):
            A.append(ring((wr[0], wr[1] + 0.07 + k * 0.035, wr[2] + 0.005), 0.057, 0.057, 0.0065, tilt=rnd.uniform(-12, 12)))
        arm = melt(A, 0.006, 2200, smooth=4, name=f'{name}_{g}_sleeve')
        put(arm, SUIT, E[g], col)
        put(solid([ring((s * 0.293, 1.0, 0.012), 0.063, 0.063, 0.007)], f'{name}_{g}_stripe'), TAPE, E[g], col)
        Gl = [prim('cyl', (wr[0], wr[1] + 0.005, wr[2]), (0.058, 0.03, 0.058), segs=20)]   # 장갑 목
        Gl.append(sph((wr[0], wr[1] - 0.06, wr[2] - 0.005), (0.032, 0.05, 0.045)))   # 손등·손바닥
        for f in range(4):
            fz = wr[2] - 0.032 + f * 0.021
            Gl.append(skin([(wr[0], wr[1] - 0.09, fz), (wr[0] - s * 0.004, wr[1] - 0.135, fz - 0.006), (wr[0] - s * 0.012, wr[1] - 0.17, fz - 0.016)], [0.011, 0.01, 0.009]))
        Gl.append(skin([(wr[0] - s * 0.01, wr[1] - 0.05, wr[2] - 0.04), (wr[0] - s * 0.02, wr[1] - 0.1, wr[2] - 0.065)], [0.012, 0.01]))
        put(solid(Gl, f'{name}_{g}_glove'), RUB, E[g], col)
    # --- 다리 + 주름 + 부츠 ---
    for s, g in ((-1, 'legL'), (1, 'legR')):
        hp, kn, an = (s * 0.1, 0.86, 0.0), (s * 0.105, 0.47, -0.012), (s * 0.105, 0.17, 0.0)
        L = [cap(hp, kn, 0.09, 0.078), sph(kn, (0.075, 0.07, 0.075)), cap(kn, an, 0.075, 0.07)]
        for k in range(3): L.append(ring((kn[0], kn[1] + 0.03 - k * 0.035, kn[2]), 0.077, 0.077, 0.008, tilt=rnd.uniform(-12, 12)))
        for k in range(2): L.append(ring((an[0], an[1] + 0.06 + k * 0.04, an[2]), 0.072, 0.072, 0.007, tilt=rnd.uniform(-10, 10)))
        leg = melt(L, 0.007, 2400, smooth=4, name=f'{name}_{g}_leg')
        put(leg, SUIT, E[g], col)
        put(solid([ring((s * 0.105, 0.33, 0.0), 0.077, 0.077, 0.008)], f'{name}_{g}_stripe'), TAPE, E[g], col)
        B = [skin([(an[0], 0.24, 0.0), (an[0], 0.1, 0.0), (an[0], 0.055, -0.07), (an[0], 0.05, -0.15)], [0.075, 0.072, (0.056, 0.05), (0.05, 0.042)])]
        B.append(prim('cube', (an[0], 0.011, -0.065), (0.05, 0.011, 0.1), bevel=0.008))   # 밑창
        B.append(prim('cube', (kn[0], kn[1], kn[2] - 0.078), (0.05, 0.05, 0.014), rot=(-6, 0, 0), bevel=0.012))   # 무릎 보호대
        put(solid(B, f'{name}_{g}_boot'), RUB, E[g], col)
    # --- 방랑자: 표면에 붙인 얼룩·찢어진 곳, 구부정한 자세 ---
    if wanderer:
        body = [o for o in col.objects if o.name == f'{name}_body'][0]
        spots = []
        for i in range(18):
            y = rnd.uniform(0.9, 1.32); a = rnd.uniform(-2.4, 2.4)
            hit = surface_point(body, (math.sin(a) * 0.6, y, -math.cos(a) * 0.6), (-math.sin(a), 0, math.cos(a)))
            if not hit: continue
            (x, yy, z), n = hit
            sp = sph((x, yy, z), (rnd.uniform(0.018, 0.04), rnd.uniform(0.014, 0.03), 0.006), 12)
            # 표면 법선 쪽으로 납작하게 눕힌다
            sp.rotation_mode = 'QUATERNION'; sp.rotation_quaternion = Vector((n[0], -n[2], n[1])).to_track_quat('Y', 'Z')
            spots.append((sp, i % 3 == 0))
        put(solid([s for s, tear in spots if not tear], f'{name}_grime'), GRIME, E['torso'], col)
        tears = [s for s, tear in spots if tear]
        if tears: put(solid(tears, f'{name}_tears'), TEAR, E['torso'], col)
        E['torso'].rotation_euler.x = math.radians(-7)       # 앞으로 숙임 (Blender: -x 회전 = 앞(+y)으로)
        E['head'].rotation_euler.x = math.radians(-9)
    return col

# ================================================================== 아이템 (실제 크기, 원점 = 손으로 쥐는 곳, 앞 = -z)
def item(name):
    return collection(f'item_{name}')

def items():
    out = {}
    # 아몬드 워터: 반투명 플라스틱 병, 흰 뚜껑, 크림색 라벨
    c = item('almondWater')
    put(solid([skin([(0, -0.07, 0), (0, 0.04, 0), (0, 0.075, 0), (0, 0.095, 0)], [0.032, 0.032, 0.02, 0.013], subd=2)], 'bottle'), mat('aw_plastic', '#e8f0f4', rough=0.1, trans=0.6), None, c)
    put(solid([prim('cyl', (0, 0.104, 0), (0.014, 0.011, 0.014), segs=20, bevel=0.002)], 'cap'), mat('aw_cap', '#f4f4f0', rough=0.4), None, c)
    put(solid([prim('cyl', (0, -0.02, 0), (0.0335, 0.03, 0.0335), segs=32)], 'label'), mat('aw_label', '#e8dcb4', rough=0.6), None, c)
    put(solid([prim('cube', (0, -0.02, -0.0337), (0.014, 0.012, 0.001))], 'logo'), mat('aw_logo', '#8a6a3a', rough=0.5), None, c)
    out['almondWater'] = c
    # 스테미너 드링크: 초록 캔
    c = item('staminaDrink')
    put(solid([prim('cyl', (0, 0, 0), (0.032, 0.06, 0.032), segs=32, bevel=0.003)], 'can'), mat('sd_can', '#3faa3a', rough=0.3, metal=0.6), None, c)
    put(solid([prim('cyl', (0, 0.062, 0), (0.027, 0.003, 0.027), segs=32), prim('cube', (0, 0.066, -0.01), (0.008, 0.001, 0.012))], 'lid'), mat('sd_lid', '#b8b8b4', rough=0.25, metal=0.9), None, c)
    put(solid([prim('cyl', (0, 0.01, 0), (0.0325, 0.018, 0.0325), segs=32)], 'band'), mat('sd_band', '#e8e050', rough=0.3, metal=0.4), None, c)
    out['staminaDrink'] = c
    # 카메라: 낡은 즉석 카메라
    c = item('camera')
    put(solid([prim('cube', (0, 0.02, 0.0), (0.065, 0.04, 0.03), bevel=0.008)], 'body'), mat('cam_body', '#2a2a28', rough=0.6), None, c)
    put(solid([prim('cyl', (0.015, 0.015, -0.035), (0.022, 0.012, 0.022), rot=(90, 0, 0), segs=28, bevel=0.003), prim('cube', (-0.045, 0.045, -0.031), (0.014, 0.008, 0.002))], 'lens'), mat('cam_metal', '#9a9a94', rough=0.25, metal=0.9), None, c)
    put(solid([prim('cyl', (0.015, 0.015, -0.048), (0.016, 0.002, 0.016), rot=(90, 0, 0), segs=24)], 'glass'), mat('cam_glass', '#101820', rough=0.05, metal=0.2), None, c)
    put(solid([prim('cube', (-0.045, 0.045, -0.034), (0.012, 0.006, 0.001))], 'flash'), mat('cam_flash', '#f0f0e8', rough=0.2, emit='#ffffff', emit_k=0.6), None, c)
    put(solid([prim('cyl', (0.04, 0.064, 0), (0.007, 0.004, 0.007), segs=12)], 'button'), mat('cam_red', '#c03028', rough=0.4), None, c)
    out['camera'] = c
    # 살충제: 노란 스프레이 캔
    c = item('bugSpray')
    put(solid([prim('cyl', (0, 0, 0), (0.03, 0.075, 0.03), segs=32, bevel=0.004), skin([(0, 0.075, 0), (0, 0.088, 0)], [0.028, 0.012])], 'can'), mat('bs_can', '#e8c83a', rough=0.35, metal=0.5), None, c)
    put(solid([prim('cyl', (0, 0.1, 0), (0.012, 0.01, 0.012), segs=16), prim('cube', (0, 0.104, -0.01), (0.004, 0.004, 0.008))], 'nozzle'), mat('bs_nozzle', '#f0f0ea', rough=0.4), None, c)
    put(solid([prim('cyl', (0, -0.01, 0), (0.0305, 0.03, 0.0305), segs=32)], 'label'), mat('bs_label', '#3a6a2a', rough=0.5), None, c)
    out['bugSpray'] = c
    # 조명탄: 빨간 도로 조명탄
    c = item('flare')
    put(solid([prim('cyl', (0, 0, 0), (0.016, 0.1, 0.016), segs=20, bevel=0.002)], 'tube'), mat('fl_red', '#c8281e', rough=0.5), None, c)
    put(solid([prim('cyl', (0, 0.105, 0), (0.017, 0.012, 0.017), segs=20, bevel=0.003)], 'cap'), mat('fl_cap', '#1c1c1a', rough=0.6), None, c)
    put(solid([prim('cyl', (0, 0.04, 0), (0.0165, 0.012, 0.0165), segs=20)], 'band'), mat('fl_band', '#f0e8d0', rough=0.5), None, c)
    put(solid([prim('cyl', (0, -0.104, 0), (0.012, 0.006, 0.012), segs=16)], 'tip'), mat('fl_tip', '#ff5030', rough=0.5, emit='#ff4020', emit_k=0.8), None, c)
    out['flare'] = c
    # 나침반: 황동 케이스 + 열린 뚜껑 + 바늘 (바늘은 따로: 게임이 돌린다)
    c = item('compass')
    put(solid([prim('cyl', (0, 0, 0), (0.036, 0.008, 0.036), segs=40, bevel=0.003), prim('torus', (0, 0.0, 0.039), (0.008, 0.002), rot=(0, 0, 90), segs=16)], 'case'), mat('cp_brass', '#b8903a', rough=0.3, metal=0.9), None, c)
    put(solid([prim('cyl', (0, 0.0085, 0), (0.031, 0.001, 0.031), segs=40)], 'face'), mat('cp_face', '#efe6cc', rough=0.6), None, c)
    lid = solid([prim('cyl', (0, 0.0, 0), (0.036, 0.004, 0.036), segs=40, bevel=0.002)], 'lid'); put(lid, mat('cp_brass', '#b8903a'), None, c)
    lid.location = P(0, 0.036, 0.042); lid.rotation_euler.x = math.radians(-100)
    nd = solid([prim('cube', (0, 0.0, -0.012), (0.003, 0.0012, 0.013)), prim('cube', (0, 0.0, 0.012), (0.003, 0.0012, 0.013))], 'needle')
    nd.data.materials.append(mat('cp_needle', '#c02a1e'))
    for c2 in nd.users_collection: c2.objects.unlink(nd)
    c.objects.link(nd); nd.location = P(0, 0.0105, 0)
    out['compass'] = c
    # 폭죽: 빨간 다발 + 심지
    c = item('firecracker')
    tubes = [prim('cyl', (math.cos(a) * 0.016, 0, math.sin(a) * 0.016), (0.0095, 0.045, 0.0095), segs=14) for a in [i / 6 * math.tau for i in range(6)]] + [prim('cyl', (0, 0, 0), (0.0095, 0.045, 0.0095), segs=14)]
    put(solid(tubes, 'tubes'), mat('fc_red', '#d02a20', rough=0.55), None, c)
    put(solid([prim('cyl', (0, 0.0, 0), (0.03, 0.008, 0.03), segs=24)], 'wrap'), mat('fc_gold', '#e0b040', rough=0.4, metal=0.5), None, c)
    put(solid([skin([(0, 0.045, 0), (0.004, 0.06, -0.004), (0.012, 0.075, -0.01)], [0.0025, 0.002, 0.0015])], 'fuse'), mat('fc_fuse', '#5a4a30', rough=0.8), None, c)
    out['firecracker'] = c
    # 야간 투시경: 쌍안 튜브 + 다리 + 머리끈
    c = item('nightVision')
    NV = [prim('cyl', (s * 0.032, 0, -0.02), (0.022, 0.035, 0.022), rot=(90, 0, 0), segs=24, bevel=0.003) for s in (-1, 1)]
    NV.append(prim('cube', (0, 0.0, 0.01), (0.05, 0.022, 0.02), bevel=0.008))
    NV.append(skin([(-0.07, 0.0, 0.015), (-0.08, 0.0, 0.07), (0, 0.0, 0.1), (0.08, 0.0, 0.07), (0.07, 0.0, 0.015)], [(0.012, 0.003)] * 5, subd=2))
    put(solid(NV, 'body'), mat('nv_body', '#2c3028', rough=0.6), None, c)
    put(solid([prim('cyl', (s * 0.032, 0, -0.056), (0.018, 0.002, 0.018), rot=(90, 0, 0), segs=24) for s in (-1, 1)], 'lens'), mat('nv_lens', '#40ff70', rough=0.05, emit='#30ff60', emit_k=0.8), None, c)
    out['nightVision'] = c
    # 아드레날린: 자동 주사기
    c = item('adrenaline')
    put(solid([prim('cyl', (0, 0, 0), (0.012, 0.06, 0.012), segs=20, bevel=0.002)], 'body'), mat('ad_body', '#e8e4dc', rough=0.4), None, c)
    put(solid([prim('cyl', (0, -0.07, 0), (0.0125, 0.014, 0.0125), segs=20, bevel=0.003)], 'tip'), mat('ad_orange', '#f07020', rough=0.4), None, c)
    put(solid([prim('cyl', (0, 0.068, 0), (0.0125, 0.012, 0.0125), segs=20, bevel=0.003)], 'cap'), mat('ad_blue', '#2a5ad0', rough=0.4), None, c)
    put(solid([prim('cube', (0, 0.0, -0.0122), (0.006, 0.03, 0.0008))], 'window'), mat('ad_window', '#e0c040', rough=0.2, emit='#e0c040', emit_k=0.3), None, c)
    out['adrenaline'] = c
    # 손전등 (1인칭 왼손)
    c = item('flashlight')
    put(solid([prim('cyl', (0, 0, 0.02), (0.017, 0.07, 0.017), rot=(90, 0, 0), segs=24, bevel=0.002), skin([(0, 0, -0.05), (0, 0, -0.075)], [0.018, 0.026], subd=2)], 'body'), mat('fl_body', '#3a3a38', rough=0.4, metal=0.7), None, c)
    put(solid([prim('cyl', (0, 0, -0.082), (0.024, 0.002, 0.024), rot=(90, 0, 0), segs=24)], 'lens'), mat('fl_lens', '#fff4c8', rough=0.1, emit='#fff4c8', emit_k=3), None, c)
    put(solid([prim('cube', (0, 0.018, 0.0), (0.005, 0.003, 0.008), bevel=0.002)], 'switch'), mat('fl_switch', '#8a2a20', rough=0.5), None, c)
    out['flashlight'] = c
    return out

# ================================================================== 1인칭 손 (장갑 + 소매). 원점 = 손에 쥔 물건의 중심 (반지름 ~0.03 원통을 쥔 모양)
def hand(side):
    s = 1 if side == 'R' else -1
    c = collection(f'hand_{side}')
    RUB = mat('hand_rubber', '#1c1c1a', rough=0.6)
    SUIT = mat('hand_suit', '#e7b92e', rough=0.55)
    G = [sph((s * 0.035, -0.005, 0.0), (0.03, 0.05, 0.045))]                   # 손바닥 (물건 옆)
    for f in range(4):                                                         # 네 손가락: 물건을 감싸 쥔다
        y = 0.03 - f * 0.022
        pts = [(s * 0.04, y, -0.02), (s * 0.02, y, -0.045), (-s * 0.01, y, -0.045), (-s * 0.03, y, -0.025)]
        G.append(skin(pts, [0.0115, 0.011, 0.0105, 0.0095], subd=2))
    G.append(skin([(s * 0.03, 0.04, 0.025), (s * 0.0, 0.055, 0.02), (-s * 0.02, 0.05, 0.0)], [0.013, 0.012, 0.011]))   # 엄지
    G.append(cap((s * 0.04, -0.02, 0.03), (s * 0.05, -0.06, 0.1), 0.042, 0.045))   # 손목
    put(solid([melt(G, 0.004, 3000, smooth=3, name='glove')], 'glove'), RUB, None, c)
    Sl = [cap((s * 0.05, -0.06, 0.1), (s * 0.07, -0.13, 0.32), 0.056, 0.064)]
    put(solid(Sl, 'sleeve'), SUIT, None, c)
    put(solid([prim('cyl', (s * 0.05, -0.065, 0.11), (0.052, 0.018, 0.052), rot=(62, 0, 0), segs=24)], 'cuff'), RUB, None, c)
    return c

def hand_torch():
    """왼손: 손전등을 앞으로 겨누어 쥔 주먹 (쥐는 축 = 앞 -z). 손목·소매는 뒤아래로 빠진다"""
    s = -1
    c = collection('hand_T')
    RUB = mat('hand_rubber', '#1c1c1a', rough=0.6)
    SUIT = mat('hand_suit', '#e7b92e', rough=0.55)
    G = [sph((s * 0.035, -0.005, 0.0), (0.03, 0.05, 0.045))]
    for f in range(4):
        y = 0.03 - f * 0.022
        G.append(skin([(s * 0.04, y, -0.02), (s * 0.02, y, -0.045), (-s * 0.01, y, -0.045), (-s * 0.03, y, -0.025)], [0.0115, 0.011, 0.0105, 0.0095], subd=2))
    G.append(skin([(s * 0.03, 0.04, 0.025), (s * 0.0, 0.055, 0.02), (-s * 0.02, 0.05, 0.0)], [0.013, 0.012, 0.011]))
    fist = melt(G, 0.004, 2500, smooth=3, name='glove')
    fist.rotation_euler.x = math.radians(-90); apply_all(fist)       # 쥐는 축(위) → 앞
    W = [fist, cap((s * 0.03, -0.02, 0.03), (s * 0.05, -0.09, 0.13), 0.04, 0.044)]
    put(solid(W, 'glove'), RUB, None, c)
    put(solid([cap((s * 0.05, -0.09, 0.13), (s * 0.08, -0.2, 0.34), 0.056, 0.064)], 'sleeve'), SUIT, None, c)
    put(solid([prim('cyl', (s * 0.052, -0.1, 0.145), (0.052, 0.018, 0.052), rot=(62, 0, 0), segs=24)], 'cuff'), RUB, None, c)
    return c

# ------------------------------------------------------------------ 짓기
H = howler()
PL = hazmat('player', '#e7b92e')
W = hazmat('wanderer', '#a59a72', wanderer=True)
IT = items()
HR, HL, HT = hand('R'), hand('L'), hand_torch()
for o in list(TMP):
    if o.name in bpy.data.objects: bpy.data.objects.remove(o, do_unlink=True)
TMP.clear()

def tris(col): return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in col.all_objects if o.type == 'MESH')

# ------------------------------------------------------------------ 내보내기 (.glb)
def export(col, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in col.all_objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_apply=True, export_yup=True)

def budget(col, target):
    """게임용 면 수 예산: 무거운 메시(600 삼각형 넘는 것)만 비율대로 줄인다"""
    meshes = [o for o in col.all_objects if o.type == 'MESH']
    total = tris(col)
    if total <= target: return
    heavy = [o for o in meshes if sum(len(p.vertices) - 2 for p in o.data.polygons) > 600]
    light = total - sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in heavy)
    ratio = max(0.08, (target - light) / max(1, total - light))
    for o in heavy:
        d = o.modifiers.new('budget', 'DECIMATE'); d.ratio = ratio
        apply_all(o)
        for p in o.data.polygons: p.use_smooth = True

budget(H, 14000); budget(PL, 12000); budget(W, 12000); budget(HR, 3000); budget(HL, 3000); budget(HT, 3000)
res = {}
for c in (H, PL, W): export(c, OUT_MODELS + f'level0/{c.name}.glb'); res[c.name] = tris(c)
for k, c in IT.items(): export(c, OUT_MODELS + f'items/{k}.glb'); res[k] = tris(c)
for c in (HR, HL, HT): export(c, OUT_MODELS + f'items/{c.name}.glb'); res[c.name] = tris(c)
bpy.ops.wm.save_as_mainfile(filepath=ROOT + 'tools/blender/out/level0-v2.blend', copy=True)
print('DONE', res)
