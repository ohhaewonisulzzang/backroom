import * as THREE from 'three';
import { SUIT_HEX, MODE_RULES, CONFIG, TS } from '../../../shared/config.js';
import { hasLOS } from '../../../shared/physics.js';
import { toM, yawFromAngle, CEIL_H } from './units.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildModel, poseWalk, seedOf } from './models/build.js';
import level0Models from './models/level0.json';
import { ASSETS, loadAssets, cloneCharacter, cloneItem } from './assets.js';
import { makeSmiler, makeStealer, tintMimicVisor, animateSmiler, makeTerminal } from './creatures.js';

/**
 * 3D 배우와 사물: 하울러, 방호복 사람(다른 플레이어·방랑자), 열쇠·아이템·사물함·출구·쪽지·시체·조명탄·마닐라 룸 문.
 * 모두 three 기본 도형으로 만든다 (외부 모델 파일 없음). 위치는 지금 Game 상태(스냅샷 보간)를 그대로 따른다.
 */

const TM = 1.5;
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

/*
 * 사람·괴물 모델은 데이터(models/level0.json)로 짓는다: 작은 기본 도형을 촘촘히 겹친 부품 수백 개를
 * 부위·재질별로 하나로 합쳐 그린다 (그리기 호출 수십 개). 생김새는 tools/model-editor.html 에서 고친다.
 */
const MODELS = level0Models.models;
const build = (spec, opts) => buildModel(THREE, spec, { merge: true, mergeGeometries, ...opts });

/*
 * Blender 모델(public/models/*.glb)을 다 불러오면 그걸 쓰고, 그 전에는 데이터 모델로 대신 그린다.
 * (불러오면 ActorLayer 가 이미 만든 배우를 Blender 모델로 바꿔 끼운다)
 */
/** 하울러: 키 2.3m, 깡마른 검은 몸, 긴 팔, 어둠 속에서 빛나는 눈. seed 로 생김새가 조금씩 다르다 */
export function makeHowler(seed = 1) { return (ASSETS.ready && cloneCharacter('howler')) || build(MODELS.howler, { seed }); }

/** 방호복 사람: 키 1.75m. faded = 방랑자 (빛바랜 색, 찢어지고 장비가 빠진 모습) */
export function makeHazmat(colorHex, faded = false, seed = 1) {
  const hex = typeof colorHex === 'number' ? `#${colorHex.toString(16).padStart(6, '0')}` : (colorHex || SUIT_HEX.default);
  return (ASSETS.ready && cloneCharacter(faded ? 'wanderer' : 'player', { tint: faded ? null : hex })) || build(faded ? MODELS.wanderer : MODELS.player, { tint: hex, faded, seed });
}

export { poseWalk };

/** 움직이지 않는 사물들을 재질별로 하나로 합친다 (자식 메시까지, 월드 좌표로 굽는다) */
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse(o => { if (o.isMesh) { if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(o); } });
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), m = new THREE.Matrix4();
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map(o => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); return g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)); });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    for (const o of list) { o.geometry.dispose(); o.removeFromParent(); }
    group.add(new THREE.Mesh(merged, mat));
  }
  const empty = []; group.traverse(o => { if (o !== group && !o.isMesh && !o.isLight && !o.children.length) empty.push(o); });
  for (const o of empty) o.removeFromParent();
}

/** 벽에 붙일 방향: 칸 (tx, ty) 둘레에서 벽이 있는 쪽 (N 우선). 반환: { x, z, yaw } — 벽 앞면 위치와 벽을 등지는 yaw */
function wallSpot(map, tx, ty, inset = 0) {
  for (const [dx, dy, yaw] of [[0, -1, Math.PI], [-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2], [0, 1, 0]]) {
    if (!map.isSolid(tx + dx, ty + dy)) continue;
    const cx = (tx + 0.5) * TM, cz = (ty + 0.5) * TM;
    return { x: cx + dx * (TM / 2 - inset), z: cz + dy * (TM / 2 - inset), yaw };
  }
  return { x: (tx + 0.5) * TM, z: (ty + 0.5) * TM, yaw: 0 };
}

/** 글자 텍스처 (EXIT 표지) */
function textTex(text, color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0c0a'; g.fillRect(0, 0, 128, 48);
  g.fillStyle = color; g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 26);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ITEM_COLOR = { almondWater: 0xaadcf0, staminaDrink: 0x78e66e, camera: 0xdcdcc8, bugSpray: 0xe6d25a, flare: 0xf06e5a, compass: 0xe6c88c, firecracker: 0xff7850, nightVision: 0x6eff82, adrenaline: 0xff6e96 };

/**
 * 몬스터 모습 키: 바뀌면 모델을 다시 짓는다.
 * 스킨 스틸러는 정체를 드러내기 전엔 플레이어와 같은 방호복(그 색), 드러내면 정체 모델
 */
function monsterLook(m) {
  if (m.type === 'skinStealer') return m.revealed ? 'stealer' : `mimic:${m.color || 'default'}`;
  return m.type === 'howler' || m.type === 'smiler' ? m.type : 'wanderer';
}

function makeMonster(m, look) {
  const seed = seedOf(m.id);
  if (look === 'howler') return makeHowler(seed);
  if (look === 'smiler') return makeSmiler(seed);
  if (look === 'stealer') return makeStealer(seed);
  if (look.startsWith('mimic:')) { const a = makeHazmat(SUIT_HEX[m.color] || SUIT_HEX.default, false, seed); tintMimicVisor(a); return a; }
  return makeHazmat(SUIT_HEX[m.color] || SUIT_HEX.default, true, seed);   // 방랑자 (그 밖의 아직 3D 모델이 없는 엔티티도)
}

/** 바닥 칸 (tx, ty) 에서 가장 트인 쪽을 보는 yaw (단말기 화면이 벽을 보지 않게) */
function openYaw(map, tx, ty) {
  let best = 0, bestN = -1;
  for (const [dx, dy, yaw] of [[0, 1, 0], [1, 0, Math.PI / 2], [0, -1, Math.PI], [-1, 0, -Math.PI / 2]]) {
    let n = 0; while (n < 4 && !map.isSolid(tx + dx * (n + 1), ty + dy * (n + 1))) n++;
    if (n > bestN) { bestN = n; best = yaw; }
  }
  return best;
}

/**
 * 배우·사물 층. setLevel 에서 고정 사물을 짓고, update 에서 움직이는 것들을 맞춘다.
 * lightAt(xPx, yPx) → 0..1: 그 자리의 형광등 밝기 (구워 둔 밝기). 배우가 형광등 아래에서 밝게 보이게 쓴다
 */
export class ActorLayer {
  constructor(scene, lightAt) {
    loadAssets();                          // Blender 모델 불러오기 (끝나면 배우를 바꿔 끼운다)
    this.scene = scene; this.lightAt = lightAt;
    this.group = new THREE.Group(); this.group.name = 'actors';
    scene.add(this.group);
    this.monsters = new Map(); this.players = new Map();
    this.items = new Map(); this.keys = []; this.corpses = new Map(); this.flareMeshes = new Map();
    this.time = 0;
    this.rtLit = false;                    // 울트라: 형광등 빛을 레이 트레이서가 직접 준다
    this.xrayMat = new THREE.MeshBasicMaterial({ color: 0x58ff70, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, fog: false });
    this.xrayGeo = new THREE.CapsuleGeometry(0.28, 1, 4, 8);
  }

  setLevel(level) {
    this.clear();
    this.level = level;
    const map = level.map;
    const fixed = this.fixed = new THREE.Group();
    // 사물함: 북쪽 벽에 붙은 철제 캐비닛
    const lockMat = lambert(0x6c6e66), lockDark = lambert(0x3a3c36);
    for (const lk of level.lockers || []) {
      const s = wallSpot(map, lk.tx, lk.ty, 0.27);
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.5), lockMat);
      box.position.set(s.x, 1.0, s.z); box.rotation.y = s.yaw;
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.8, 0.01), lockDark);
      slit.position.set(0, 0, -0.255); box.add(slit);
      for (let k = 0; k < 4; k++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.01), lockDark); v.position.set(-0.25, 0.7 - k * 0.06, -0.255); box.add(v); }
      fixed.add(box);
    }
    mergeStatic(fixed);   // 사물함 수십 개 × 부품 6개 → 재질별로 메시 하나씩 (그리기 호출 수 줄이기)
    // 출구 문 + EXIT 표지
    const ex = level.exitIdx % map.w, ey = (level.exitIdx / map.w) | 0;
    const es = wallSpot(map, ex, ey, 0.02);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.06), lambert(0x84847c));
    door.position.set(es.x, 1.05, es.z); door.rotation.y = es.yaw;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: textTex('EXIT', '#dc3c28'), fog: false }));
    sign.position.set(0, 1.25, -0.04); sign.rotation.y = Math.PI; door.add(sign);
    this.exitSign = sign; this.exitLight = new THREE.PointLight(0xdc3c28, 0.6, 4, 2);
    this.exitLight.position.set(es.x, 2.3, es.z); fixed.add(door, this.exitLight);
    this.exitTex = { locked: sign.material.map, open: textTex('EXIT', '#6edc78') };
    // 쪽지
    if (level.note) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshLambertMaterial({ color: 0xf0ead2, emissive: 0x222018 }));
      n.rotation.x = -Math.PI / 2; n.rotation.z = 0.4; n.position.set(toM(level.note.x), 0.005, toM(level.note.y));
      fixed.add(n);
    }
    // 마닐라 룸 문 (0.06% 판에만)
    if (level.secret) {
      const s = wallSpot(map, level.secret.tx, level.secret.ty, 0.02);
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.05, 0.05), lambert(0xc8a868, { emissive: 0x2a1e08 }));
      d.position.set(s.x, 1.03, s.z); d.rotation.y = s.yaw; fixed.add(d);
      const glow = new THREE.PointLight(0xffc880, 0.8, 2.5, 2); glow.position.set(s.x, 0.3, s.z); fixed.add(glow);
    }
    this.group.add(fixed);
    // 퍼즐 단말기 (열쇠가 그 안에 잠겨 있다. 풀면 사라진다)
    this.terminals = (level.keys || []).map(k => {
      if (!k.puzzle) return null;
      const t = makeTerminal();
      t.position.set(toM(k.x), 0, toM(k.y));
      t.rotation.y = openYaw(map, Math.floor(k.x / TS), Math.floor(k.y / TS));
      this.group.add(t);
      return t;
    });
    // 열쇠
    const keyMat = new THREE.MeshLambertMaterial({ color: 0xe8c040, emissive: 0x6a5010 });
    this.keyMat = keyMat;
    this.keys = (level.keys || []).map(k => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), keyMat);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), keyMat);
      shaft.position.x = 0.1; g.add(ring, shaft);
      g.position.set(toM(k.x), 0.9, toM(k.y));
      this.group.add(g);
      return g;
    });
  }

  /** 몬스터·사람·사물 갱신 */
  update(game, dt, camera) {
    this.time += dt;
    const view = game.viewTarget(), nv = game.nightVisionT > 0, bright = !!game.test?.fullbright;
    const ghost = !!game.modes?.ghostEntities, map = game.map;
    const range = CONFIG.VIEW_RANGE;
    const tint = (obj, x, y) => {                       // 형광등 아래면 자체 발광을 조금 (Lambert 는 실시간 조명만 받으므로)
      const L = this.rtLit ? 0 : this.lightAt(x, y) * 0.35;   // 울트라(레이 트레이싱)는 진짜 빛을 받으므로 흉내 내지 않는다
      obj.traverse(o => { if (o.isMesh && o.material.emissive && !o.userData.keepEmissive) o.material.emissive.setRGB(o.material.color.r * L, o.material.color.g * L, o.material.color.b * L); });
    };
    // ---- 몬스터 ----
    const seenM = new Set();
    for (const m of game.monsters) {
      if (m.active === false) continue;
      seenM.add(m.id);
      let a = this.monsters.get(m.id);
      const want = monsterLook(m);                       // 스킨 스틸러는 정체를 드러내면 모델이 바뀐다
      if (a && ((ASSETS.ready && !a.userData.glb && !a.userData.final) || a.userData.want !== want)) { this.disposeObj(a); this.monsters.delete(m.id); a = null; }   // Blender 모델로 바꿔 끼우기 / 모습이 바뀜
      if (!a) {
        a = makeMonster(m, want);
        a.userData.want = want;
        a.userData.phase = 0; a.userData.last = { x: m.x, y: m.y };
        this.addXray(a);
        a.traverse(o => { if (o.isMesh && o !== a.userData.xray) o.castShadow = true; });
        this.group.add(a); this.monsters.set(m.id, a);
      }
      const d = Math.hypot(m.x - view.x, m.y - view.y);
      let vis = (bright || hasLOS(map, view.x, view.y, m.x, m.y)) && !(m.type === 'smiler' && m.state === 'vanished');
      if (nv) vis = d < range;
      if (ghost && d > MODE_RULES.GHOST) vis = false;   // '보이지 않는 공포' 모드
      a.visible = vis;
      a.userData.xray.visible = nv && d < range;
      if (!vis && !a.userData.xray.visible) continue;
      this.placeActor(a, m, dt);
      const chase = m.state === 'chase';
      if (m.type === 'howler' && a.userData.torso) a.userData.torso.rotation.x = (a.userData.torso.userData.baseLean || 0) + (chase ? -0.26 : -0.05);   // 쫓을 땐 앞으로 숙인다
      if (a.userData.eyeMat) { a.userData.eyeMat.color.setHex(chase ? 0xfff2c0 : 0xb89a50); a.userData.eyeMat.emissive?.setHex(chase ? 0xfff2c0 : 0x8a7038); }
      if (m.type === 'smiler') animateSmiler(a, m, this.time, camera);
      else tint(a, m.x, m.y);
    }
    for (const [id, a] of this.monsters) if (!seenM.has(id)) { this.disposeObj(a); this.monsters.delete(id); }
    // ---- 다른 플레이어 ----
    const seenP = new Set();
    for (const p of game.remotes.values()) {
      seenP.add(p.id);
      let a = this.players.get(p.id);
      if (!a || a.userData.color !== p.color || (ASSETS.ready && !a.userData.glb)) {
        if (a) this.disposeObj(a);
        a = makeHazmat(SUIT_HEX[p.color] || SUIT_HEX.default, false, seedOf(p.id));
        a.userData.color = p.color; a.userData.phase = 0; a.userData.last = { x: p.x, y: p.y };
        this.addXray(a);
        a.traverse(o => { if (o.isMesh && o !== a.userData.xray) o.castShadow = true; });
        this.group.add(a); this.players.set(p.id, a);
      }
      const show = !p.hidden && p.status !== 'escaped' && p !== view;   // 관전 중이면 그 사람의 몸은 카메라 자리라 그리지 않는다
      a.visible = show;
      a.userData.xray.visible = show && nv && Math.hypot(p.x - view.x, p.y - view.y) < range;
      if (!show) continue;
      if (!p.alive) {                                    // 죽은 사람: 바닥에 눕는다
        a.position.set(toM(p.x), 0.2, toM(p.y)); a.rotation.set(0, yawFromAngle(p.angle), Math.PI / 2); a.scale.y = 1;
        continue;
      }
      a.rotation.z = 0;
      this.placeActor(a, p, dt, p.crouching);
      tint(a, p.x, p.y);
    }
    for (const [id, a] of this.players) if (!seenP.has(id)) { this.disposeObj(a); this.players.delete(id); }
    // ---- 열쇠 ----
    game.keys.forEach((k, i) => { const t = this.terminals?.[i]; if (t) t.visible = !k.collected; });
    game.keys.forEach((k, i) => { const g = this.keys[i]; if (!g) return; g.visible = !k.collected && !k.puzzle; g.rotation.y = this.time * 1.5 + i; g.position.y = 0.9 + Math.sin(this.time * 2 + i) * 0.04; });
    // ---- 바닥 아이템 ----
    const seenI = new Set();
    for (const it of game.items) {
      const key = it.id ?? `${it.x},${it.y},${it.type}`; seenI.add(key);
      let o = this.items.get(key);
      if (!o) {
        const model = ASSETS.ready && cloneItem(it.type);
        if (model) {                                     // Blender 아이템 모델 (실제 크기보다 조금 크게, 바닥에서 살짝 떠서 돈다)
          // 점 조명은 달지 않는다 (아이템 수만큼 조명이 늘면 모든 재질이 무거워지고, 줍거나 떨어질 때마다 셰이더를 다시 만든다)
          o = new THREE.Group(); model.scale.setScalar(1.6); o.add(model);
          o.userData.glb = true;
        } else {
          const col = ITEM_COLOR[it.type] || 0xdcdcc8;
          o = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.1), new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.35) }));
          o.userData.keepEmissive = true;
        }
        o.position.set(toM(it.x), 0.18, toM(it.y));
        this.group.add(o); this.items.set(key, o);
      }
      o.rotation.y = this.time * 0.8;
      if (o.userData.glb) o.position.y = 0.16 + Math.sin(this.time * 2 + (o.id % 7)) * 0.025;
      if (ASSETS.ready && !o.userData.glb) { this.disposeObj(o); this.items.delete(key); }   // 다음 프레임에 Blender 모델로
    }
    for (const [k, o] of this.items) if (!seenI.has(k)) { this.disposeObj(o); this.items.delete(k); }
    // ---- 시체 ----
    const seenC = new Set();
    for (const c of game.corpses || []) {
      const key = c.id ?? `${c.x},${c.y}`; seenC.add(key);
      if (this.corpses.has(key)) continue;
      const o = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), lambert(0x4a4a44));
      o.rotation.z = Math.PI / 2; o.rotation.y = (key.length || 1) * 0.7; o.position.set(toM(c.x), 0.2, toM(c.y));
      this.group.add(o); this.corpses.set(key, o);
    }
    for (const [k, o] of this.corpses) if (!seenC.has(k)) { this.disposeObj(o); this.corpses.delete(k); }
    // ---- 조명탄 (빨간 막대 + 빨간 빛, 가까운 3개만 빛) ----
    const seenF = new Set();
    (game.flares || []).forEach((f, i) => {
      const key = `${Math.round(f.x)},${Math.round(f.y)}`; seenF.add(key);
      let o = this.flareMeshes.get(key);
      if (!o) {
        o = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6), new THREE.MeshBasicMaterial({ color: 0xff3020, fog: false }));
        o.rotation.z = Math.PI / 2; o.position.set(toM(f.x), 0.03, toM(f.y));
        const l = new THREE.PointLight(0xff3020, 0, 7, 2); l.position.y = 0.3; o.add(l); o.userData.light = l;
        this.group.add(o); this.flareMeshes.set(key, o);
      }
      o.userData.light.intensity = i < 3 ? 2.5 + Math.random() * 0.8 : 0;
    });
    for (const [k, o] of this.flareMeshes) if (!seenF.has(k)) { this.disposeObj(o); this.flareMeshes.delete(k); }
    // ---- 출구 표지 ----
    const open = game.exitUnlocked && (!game.photo?.need || game.photo.taken);
    if (this.exitSign) {
      this.exitSign.material.map = open ? this.exitTex.open : this.exitTex.locked;
      this.exitLight.color.setHex(open ? 0x6edc78 : 0xdc3c28);
      this.exitLight.intensity = 0.5 + Math.sin(this.time * (open ? 4 : 2)) * 0.15;
    }
  }

  /** 위치·방향·걷기 자세 맞추기 (s: 2D 상태 x, y, angle) */
  placeActor(a, s, dt, crouch = false) {
    const last = a.userData.last, mv = Math.hypot(s.x - last.x, s.y - last.y);
    last.x = s.x; last.y = s.y;
    const speed = Math.min(1, mv / Math.max(1e-3, dt) / CONFIG.PLAYER.SPRINT);
    a.userData.phase += mv * 0.09;
    a.position.set(toM(s.x), 0, toM(s.y));
    a.rotation.set(0, yawFromAngle(s.angle), 0);
    poseWalk(a, a.userData.phase, speed > 0.02 ? Math.max(0.35, speed) : 0, crouch);
  }

  /** 야간 투시경 실루엣 (벽 너머로도 보이는 초록 캡슐) */
  addXray(a) {
    const h = a.userData.height || 1.75;
    const x = new THREE.Mesh(this.xrayGeo, this.xrayMat);
    x.scale.set(1, h / 1.56, 1); x.position.y = h / 2; x.renderOrder = 999; x.visible = false;
    x.userData.keepEmissive = true;
    a.add(x); a.userData.xray = x;
  }

  disposeObj(o) {
    this.group.remove(o);
    o.traverse(c => {
      if (c.geometry && c.geometry !== this.xrayGeo && !c.userData.sharedAsset) c.geometry.dispose();   // Blender 모델 지오메트리는 원본과 공유
      const shared = c.userData.sharedAsset && !c.userData.ownMaterial;   // 아이템 모델 재질은 원본과 공유
      if (c.material && c.material !== this.xrayMat && c.material !== this.keyMat && !shared) { c.material.map?.dispose?.(); c.material.dispose(); }
      c.dispose?.();
    });
    for (const t of o.userData.ownTex || []) t.dispose();   // creatures.js 가 만든 캔버스 텍스처 (재질에 안 붙어 있는 것까지)
  }

  clear() {
    for (const m of [this.monsters, this.players, this.items, this.corpses, this.flareMeshes]) { for (const o of m.values()) this.disposeObj(o); m.clear(); }
    for (const k of this.keys) this.disposeObj(k);
    this.keys = [];
    for (const t of this.terminals || []) if (t) this.disposeObj(t);
    this.terminals = [];
    if (this.fixed) { this.disposeObj(this.fixed); this.fixed = null; }
    this.exitTex?.open.dispose(); this.exitTex = null; this.exitSign = null;
    this.keyMat?.dispose(); this.keyMat = null;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
    this.xrayMat.dispose(); this.xrayGeo.dispose();
  }
}
