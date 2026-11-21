/**
 * 데이터(부품 목록)로 3D 모델을 짓는다. 게임(actors.js)과 모델 편집기(tools/model-editor.html)가 같은 코드를 쓴다.
 *  - three 는 인자로 받는다 (편집기는 CDN 의 three, 게임은 번들의 three)
 *  - 이 파일은 import 가 없어야 한다 (편집기 HTML 에 그대로 끼워 넣는다 — tools/build-model-editor.mjs)
 *
 * 모델 데이터 (game/client/three/models/level0.json):
 *  {
 *    name, height(m), kind,
 *    pivots: { torso: [x,y,z], head: [...], armL, armR, legL, legR }   // 회전축 (서 있는 자세, 모델 기준 좌표). -z 가 앞
 *    materials: { 이름: { color: '#hex', emissive?: '#hex', glow?: true, tint?: true } }
 *       glow: 빛나는 재질 (안개·조명 무시, 눈 등) / tint: 플레이어 옷 색으로 바뀌는 재질
 *    pose?: { torsoLean: 앞으로 숙임(°), headTilt: 고개 숙임(°) }
 *    parts: [{ id, shape, size, pos, rot?, scale?, mat, color?, in?, chance?, note? }]
 *       shape: box [w,h,d] / sphere [r] / capsule [r, 길이] / cylinder [위r, 아래r, 높이] / cone [r, 높이] / torus [R, 굵기]
 *       pos: 서 있는 자세의 모델 기준 좌표(m), rot: 도(°) [x,y,z], scale: [x,y,z]
 *       in: 붙는 부위 (root | torso | head | armL | armR | legL | legR) — 그 부위가 걸을 때 같이 움직인다
 *       chance: 0..1 — 이 확률로만 붙는다 (같은 시드면 같은 모습). 생김새를 다양하게
 *  }
 */

/** 시드 난수 (mulberry32) */
export function seededRandom(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** 문자열 → 시드 */
export function seedOf(s) { let h = 2166136261; for (const c of String(s ?? '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

const GROUP_PARENT = { torso: 'root', legL: 'root', legR: 'root', head: 'torso', armL: 'torso', armR: 'torso' };
export const GROUPS = ['root', 'torso', 'head', 'armL', 'armR', 'legL', 'legR'];

/** 부품 하나의 지오메트리 */
export function partGeometry(THREE, p) {
  const s = p.size || [0.1, 0.1, 0.1];
  switch (p.shape) {
    case 'sphere': return new THREE.SphereGeometry(s[0], 12, 9);
    case 'capsule': return new THREE.CapsuleGeometry(s[0], s[1] ?? 0.1, 4, 10);
    case 'cylinder': return new THREE.CylinderGeometry(s[0], s[1] ?? s[0], s[2] ?? 0.1, 12);
    case 'cone': return new THREE.ConeGeometry(s[0], s[1] ?? 0.1, 10);
    case 'torus': return new THREE.TorusGeometry(s[0], s[1] ?? 0.02, 8, 18);
    default: return new THREE.BoxGeometry(s[0], s[1] ?? s[0], s[2] ?? s[0]);
  }
}

/** 색 문자열을 밝기·채도 조정 (faded: 빛바램) */
function adjustColor(THREE, hex, faded) {
  const c = new THREE.Color(hex);
  if (faded) { const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s * 0.45, hsl.l * 0.75); }
  return c;
}

/**
 * 모델 짓기.
 * opts: {
 *   tint: '#hex'   — tint 재질(옷)의 색 (플레이어 색)
 *   faded: bool    — 모든 색을 빛바래게 (방랑자)
 *   seed: number   — chance 부품 고르기
 *   merge: bool    — 부위·재질별로 메시를 하나로 합친다 (게임용, 그리기 호출 수 줄이기). 편집기는 false (부품을 골라야 하므로)
 *   mergeGeometries: fn — three/examples BufferGeometryUtils.mergeGeometries (merge 일 때 필요)
 *   Material: 재질 클래스 (기본 MeshLambertMaterial)
 * }
 * 반환: THREE.Group. userData = { limbs: { armL, armR, legL, legR }, torso, head, eyes, eyeMat, height, kind, parts: [mesh...] }
 */
export function buildModel(THREE, spec, opts = {}) {
  const rng = seededRandom(opts.seed ?? 1);
  const Mat = opts.Material || THREE.MeshLambertMaterial;
  const root = new THREE.Group();
  root.name = spec.name || 'model';
  const pv = spec.pivots || {};
  const abs = g => (g === 'root' ? [0, 0, 0] : pv[g] || [0, 0, 0]);
  // 부위 그룹: 회전축 위치에 두고, 부모 그룹 기준 상대 좌표로
  const groups = { root };
  for (const g of GROUPS.slice(1)) {
    const grp = new THREE.Group(); grp.name = g;
    groups[g] = grp;
  }
  for (const g of GROUPS.slice(1)) {
    const parent = GROUP_PARENT[g], a = abs(g), pa = abs(parent);
    groups[g].position.set(a[0] - pa[0], a[1] - pa[1], a[2] - pa[2]);
    groups[parent].add(groups[g]);
  }
  // 재질 (모델 하나 안에서 공유)
  const mats = {};
  let eyeMat = null;
  const matFor = (name, override) => {
    const key = `${name}|${override || ''}`;
    if (mats[key]) return mats[key];
    const d = (spec.materials || {})[name] || { color: '#888888' };
    const hex = override || (d.tint && opts.tint ? opts.tint : d.color);
    let m;
    if (d.glow) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex), fog: false }); if (!eyeMat) eyeMat = m; }
    else {
      m = new Mat({ color: adjustColor(THREE, hex, opts.faded) });
      if (d.emissive && m.emissive) m.emissive = new THREE.Color(d.emissive);
    }
    m.userData.matName = name;
    if (d.glow) m.userData.glow = true;
    mats[key] = m;
    return m;
  };
  const meshes = [];
  const eyes = new THREE.Group(); eyes.name = 'eyes';
  for (const p of spec.parts || []) {
    if (p.chance !== undefined && p.chance < 1 && rng() >= p.chance) continue;
    const g = groups[p.in] ? p.in : 'root';
    const geo = partGeometry(THREE, p);
    const mat = matFor(p.mat, p.color);
    const m = new THREE.Mesh(geo, mat);
    const a = abs(g), pos = p.pos || [0, 0, 0];
    m.position.set(pos[0] - a[0], pos[1] - a[1], pos[2] - a[2]);
    if (p.rot) m.rotation.set(p.rot[0] * Math.PI / 180, (p.rot[1] || 0) * Math.PI / 180, (p.rot[2] || 0) * Math.PI / 180);
    if (p.scale) m.scale.set(p.scale[0], p.scale[1] ?? p.scale[0], p.scale[2] ?? p.scale[0]);
    m.userData.part = p;
    m.name = p.id || '';
    groups[g].add(m);
    meshes.push(m);
  }
  if (opts.merge && opts.mergeGeometries) mergeGroups(THREE, groups, opts.mergeGeometries);
  // 기본 자세 (pose: { torsoLean: 앞으로 숙임 °, headTilt: 고개 숙임 ° }) — 방랑자처럼 구부정한 모델
  const pose = spec.pose || {};
  groups.torso.rotation.x = -(pose.torsoLean || 0) * Math.PI / 180;
  groups.head.rotation.x = -(pose.headTilt || 0) * Math.PI / 180;
  groups.torso.userData.baseLean = groups.torso.rotation.x;
  // 빛나는 재질 부품(눈)은 eyes 로 모은다 (게임이 쫓을 때 눈 색을 바꾼다)
  root.userData = {
    limbs: { armL: groups.armL, armR: groups.armR, legL: groups.legL, legR: groups.legR },
    torso: groups.torso, head: groups.head, eyes, eyeMat,
    height: spec.height || 1.75, kind: spec.kind || spec.name, parts: meshes, groups,
  };
  return root;
}

/** 부위마다 같은 재질의 메시를 하나로 합친다 (부품 수백 개 → 그리기 호출 수십 개) */
function mergeGroups(THREE, groups, mergeGeometries) {
  for (const grp of Object.values(groups)) {
    const byMat = new Map();
    for (const c of [...grp.children]) {
      if (!c.isMesh) continue;
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(c);
    }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const geos = list.map(m => {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(m.matrix);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      for (const m of list) { grp.remove(m); m.geometry.dispose(); }
      const mm = new THREE.Mesh(merged, mat);
      mm.name = `${grp.name}:${mat.userData.matName || ''}`;
      grp.add(mm);
    }
  }
}

/** 걷기 자세: 팔다리 흔들기. speed 0..1, crouch 면 낮게 */
export function poseWalk(group, phase, speed, crouch = false) {
  const L = group.userData.limbs; if (!L) return;
  const s = Math.sin(phase) * 0.7 * speed;
  L.legL.rotation.x = s; L.legR.rotation.x = -s;
  L.armL.rotation.x = -s * 0.8; L.armR.rotation.x = s * 0.8;
  group.scale.y = crouch ? 0.65 : 1;
}
