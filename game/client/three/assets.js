import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Blender 로 만든 모델(.glb, tools/blender/models2.py → public/models/)을 불러온다.
 *  - 캐릭터: howler / player / wanderer — 부위 노드(torso, head, armL, armR, legL, legR)가 게임의 회전축이다
 *  - 아이템 9종 + 손전등 + 1인칭 손 (hand_R 아이템 쥔 오른손, hand_L 왼손, hand_T 손전등 겨눈 왼손)
 * 불러오기 전에는 actors.js 가 데이터 모델(models/level0.json)로 대신 그린다.
 */
export const ASSET_LIST = {
  chars: ['howler', 'player', 'wanderer'],
  items: ['almondWater', 'staminaDrink', 'camera', 'bugSpray', 'flare', 'compass', 'firecracker', 'nightVision', 'adrenaline', 'flashlight', 'hand_R', 'hand_L', 'hand_T'],
};
export const ASSETS = { ready: false, chars: {}, items: {} };
let loading = null;

/** 한 번만 불러온다 (실패한 파일은 빼고 계속) */
export function loadAssets() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const one = (url, put) => loader.loadAsync(url).then(g => { prepare(g.scene); put(g.scene); }).catch(e => console.warn('모델을 못 불러왔다:', url, e?.message || e));
  loading = Promise.all([
    ...ASSET_LIST.chars.map(n => one(`/models/level0/${n}.glb`, s => { ASSETS.chars[n] = s; })),
    ...ASSET_LIST.items.map(n => one(`/models/items/${n}.glb`, s => { ASSETS.items[n] = s; })),
  ]).then(() => { ASSETS.ready = true; return ASSETS; });
  return loading;
}

/** 불러온 장면 손질: 부위·재질별로 메시 합치기, 그림자, 빛나는 재질 표시, 공유 표시 (복제본이 지울 때 원본 지오메트리를 지우지 않게) */
function prepare(scene) {
  mergeByGroup(scene);
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    o.userData.sharedAsset = true;
    const m = o.material;
    if (m?.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01) o.userData.keepEmissive = true;
  });
}

const GROUP_RE = /^(torso|head|armL|armR|legL|legR)\d*$/;

/**
 * Blender 에서 부품마다 따로 나온 메시를 부위(torso, head, armL…, 없으면 맨 위)·재질별로 하나로 합친다.
 * 캐릭터 하나 그리기 호출 30여 개 → 10여 개. 부위 노드는 그대로 남아 걷기 애니메이션이 돈다.
 */
function mergeByGroup(scene) {
  scene.updateMatrixWorld(true);
  const owners = new Set([scene]);
  scene.traverse(o => { if (GROUP_RE.test(o.name)) owners.add(o); });
  const buckets = new Map();     // owner → Map(material → [mesh])
  scene.traverse(o => {
    if (!o.isMesh) return;
    let a = o.parent; while (a && !owners.has(a)) a = a.parent;
    const owner = a || scene;
    if (!buckets.has(owner)) buckets.set(owner, new Map());
    const byMat = buckets.get(owner);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(o);
  });
  const inv = new THREE.Matrix4(), m = new THREE.Matrix4();
  for (const [owner, byMat] of buckets) {
    inv.copy(owner.matrixWorld).invert();
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const geos = list.map(mesh => {
        let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
        g.morphAttributes = {};
        return g.applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld));
      });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      for (const mesh of list) { mesh.parent.remove(mesh); mesh.geometry.dispose(); }
      const mm = new THREE.Mesh(merged, mat);
      mm.name = `${owner.name || 'root'}:${mat.name}`;
      owner.add(mm);
    }
  }
  // 메시가 빠져 비어 버린 노드 정리 (부위 노드는 남긴다)
  const empty = [];
  scene.traverse(o => { if (o !== scene && !o.isMesh && !owners.has(o) && !o.children.length) empty.push(o); });
  for (const o of empty) o.parent?.remove(o);
}

/**
 * 캐릭터 복제. opts.tint = 옷 색 (플레이어). 재질은 복제해서 바꾼다 (지오메트리는 공유).
 * 반환: Group, userData = { limbs, torso, head, eyeMat, height, kind, glb: true } — 데이터 모델과 같은 모양
 */
export function cloneCharacter(kind, opts = {}) {
  const tpl = ASSETS.chars[kind];
  if (!tpl) return null;
  const g = tpl.clone(true);
  const groups = {};
  let eyeMat = null;
  const matCache = new Map();
  g.traverse(o => {
    const base = o.name.replace(/[._]?\d+$/, '');
    if (GROUP_RE.test(o.name) || GROUP_RE.test(base)) groups[GROUP_RE.exec(o.name)?.[1] || base] = o;
    if (!o.isMesh) return;
    // 재질 복제 (액터마다 색·자체 발광을 따로 바꾸므로)
    let m = matCache.get(o.material);
    if (!m) {
      m = o.material.clone();
      if (/_suit$/.test(m.name) && opts.tint) m.color.set(opts.tint);
      matCache.set(o.material, m);
    }
    o.material = m; o.userData.ownMaterial = true;
    if (/_eye$/.test(m.name)) eyeMat = m;
  });
  // 서 있는 자세의 기본 기울기 (방랑자는 Blender 에서 숙인 채로 나온다)
  if (groups.torso) groups.torso.userData.baseLean = groups.torso.rotation.x;
  const height = { howler: 2.3, player: 1.75, wanderer: 1.75 }[kind] || 1.75;
  g.userData = { limbs: { armL: groups.armL, armR: groups.armR, legL: groups.legL, legR: groups.legR }, torso: groups.torso, head: groups.head, eyeMat, height, kind, glb: true };
  // 걷기 자세가 기본 회전 위에 더해지도록 기준값을 기억
  for (const k of ['armL', 'armR', 'legL', 'legR']) if (groups[k]) groups[k].userData.rest = groups[k].rotation.x;
  return g;
}

/** 아이템·손 복제 (재질 공유 — 바꾸지 않는다) */
export function cloneItem(name) {
  const tpl = ASSETS.items[name];
  return tpl ? tpl.clone(true) : null;
}
