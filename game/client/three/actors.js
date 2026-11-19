import * as THREE from 'three';
import { SUIT_HEX, MODE_RULES, CONFIG, TS } from '../../../shared/config.js';
import { hasLOS } from '../../../shared/physics.js';
import { toM, yawFromAngle, CEIL_H } from './units.js';

/**
 * 3D 배우와 사물: 하울러, 방호복 사람(다른 플레이어·방랑자), 열쇠·아이템·사물함·출구·쪽지·시체·조명탄·마닐라 룸 문.
 * 모두 three 기본 도형으로 만든다 (외부 모델 파일 없음). 위치는 지금 Game 상태(스냅샷 보간)를 그대로 따른다.
 */

const TM = 1.5;
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

/** 팔다리 회전축(어깨·엉덩이)을 가진 팔다리 하나 */
function limb(len, r, mat, x, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
  m.position.y = -len / 2 - r;
  pivot.add(m);
  return pivot;
}

/** 하울러: 키 2.3m, 깡마른 검은 몸, 긴 팔, 어둠 속에서 빛나는 눈 */
export function makeHowler() {
  const g = new THREE.Group();
  const skin = lambert(0x14110d), dark = lambert(0x070605);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.75, 4, 10), skin);
  body.position.y = 1.55; body.scale.set(1, 1, 0.75);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), dark);
  head.position.set(0, 2.12, -0.04); head.scale.set(0.9, 1.25, 1);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.1), dark);
  jaw.position.set(0, 1.98, -0.13);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0, fog: false });
  const eyes = new THREE.Group();
  for (const x of [-0.06, 0.06]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eyeMat); e.position.set(x, 2.16, -0.17); eyes.add(e); }
  const armL = limb(0.95, 0.05, skin, -0.24, 1.88), armR = limb(0.95, 0.05, skin, 0.24, 1.88);
  const legL = limb(0.85, 0.065, skin, -0.1, 1.05), legR = limb(0.85, 0.065, skin, 0.1, 1.05);
  const torso = new THREE.Group();     // 숙일 때 위쪽만 기울인다
  torso.position.y = 1.05;
  for (const o of [body, head, jaw, eyes, armL, armR]) { o.position.y -= 1.05; torso.add(o); }
  g.add(torso, legL, legR);
  g.userData = { eyes, eyeMat, torso, limbs: { armL, armR, legL, legR }, height: 2.3, kind: 'howler' };
  return g;
}

/** 방호복 사람: 키 1.75m. faded = 빛바랜 색 (방랑자) */
export function makeHazmat(colorHex, faded = false) {
  const g = new THREE.Group();
  const c = new THREE.Color(colorHex || SUIT_HEX.default);
  if (faded) { const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s * 0.45, hsl.l * 0.75); }
  const suit = lambert(c), dark = lambert(0x1a1a18), visorMat = lambert(0x0d1518, { emissive: 0x0a1418 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 10), suit);
  body.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), suit);
  head.position.y = 1.58;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.06), visorMat);
  visor.position.set(0, 1.6, -0.13);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.14), dark);
  pack.position.set(0, 1.15, 0.22);
  const armL = limb(0.5, 0.06, suit, -0.27, 1.38), armR = limb(0.5, 0.06, suit, 0.27, 1.38);
  const legL = limb(0.6, 0.075, suit, -0.1, 0.78), legR = limb(0.6, 0.075, suit, 0.1, 0.78);
  g.add(body, head, visor, pack, armL, armR, legL, legR);
  g.userData = { limbs: { armL, armR, legL, legR }, height: 1.75, kind: 'hazmat' };
  return g;
}

/** 걷기 자세: 팔다리 흔들기. speed 0..1, crouch 면 낮게 */
export function poseWalk(group, phase, speed, crouch = false) {
  const L = group.userData.limbs; if (!L) return;
  const s = Math.sin(phase) * 0.7 * speed;
  L.legL.rotation.x = s; L.legR.rotation.x = -s;
  L.armL.rotation.x = -s * 0.8; L.armR.rotation.x = s * 0.8;
  group.scale.y = crouch ? 0.65 : 1;
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
 * 배우·사물 층. setLevel 에서 고정 사물을 짓고, update 에서 움직이는 것들을 맞춘다.
 * lightAt(xPx, yPx) → 0..1: 그 자리의 형광등 밝기 (구워 둔 밝기). 배우가 형광등 아래에서 밝게 보이게 쓴다
 */
export class ActorLayer {
  constructor(scene, lightAt) {
    this.scene = scene; this.lightAt = lightAt;
    this.group = new THREE.Group(); this.group.name = 'actors';
    scene.add(this.group);
    this.monsters = new Map(); this.players = new Map();
    this.items = new Map(); this.keys = []; this.corpses = new Map(); this.flareMeshes = new Map();
    this.time = 0;
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
      const L = this.lightAt(x, y) * 0.35;
      obj.traverse(o => { if (o.isMesh && o.material.emissive && !o.userData.keepEmissive) o.material.emissive.setRGB(o.material.color.r * L, o.material.color.g * L, o.material.color.b * L); });
    };
    // ---- 몬스터 ----
    const seenM = new Set();
    for (const m of game.monsters) {
      if (m.active === false) continue;
      seenM.add(m.id);
      let a = this.monsters.get(m.id);
      if (!a) {
        a = m.type === 'howler' ? makeHowler() : makeHazmat(SUIT_HEX[m.color] || SUIT_HEX.default, true);
        a.userData.phase = 0; a.userData.last = { x: m.x, y: m.y };
        this.addXray(a);
        a.traverse(o => { if (o.isMesh && o !== a.userData.xray) o.castShadow = true; });
        this.group.add(a); this.monsters.set(m.id, a);
      }
      const d = Math.hypot(m.x - view.x, m.y - view.y);
      let vis = bright || hasLOS(map, view.x, view.y, m.x, m.y);
      if (nv) vis = d < range;
      if (ghost && d > MODE_RULES.GHOST) vis = false;   // '보이지 않는 공포' 모드
      a.visible = vis;
      a.userData.xray.visible = nv && d < range;
      if (!vis && !a.userData.xray.visible) continue;
      this.placeActor(a, m, dt);
      const chase = m.state === 'chase';
      if (a.userData.torso) a.userData.torso.rotation.x = chase ? -0.26 : -0.05;   // 쫓을 땐 앞으로 숙인다
      if (a.userData.eyeMat) a.userData.eyeMat.color.setHex(chase ? 0xfff2c0 : 0xb89a50);
      tint(a, m.x, m.y);
    }
    for (const [id, a] of this.monsters) if (!seenM.has(id)) { this.disposeObj(a); this.monsters.delete(id); }
    // ---- 다른 플레이어 ----
    const seenP = new Set();
    for (const p of game.remotes.values()) {
      seenP.add(p.id);
      let a = this.players.get(p.id);
      if (!a || a.userData.color !== p.color) {
        if (a) this.disposeObj(a);
        a = makeHazmat(SUIT_HEX[p.color] || SUIT_HEX.default, false);
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
    game.keys.forEach((k, i) => { const g = this.keys[i]; if (!g) return; g.visible = !k.collected && !k.puzzle; g.rotation.y = this.time * 1.5 + i; g.position.y = 0.9 + Math.sin(this.time * 2 + i) * 0.04; });
    // ---- 바닥 아이템 ----
    const seenI = new Set();
    for (const it of game.items) {
      const key = it.id ?? `${it.x},${it.y},${it.type}`; seenI.add(key);
      let o = this.items.get(key);
      if (!o) {
        const col = ITEM_COLOR[it.type] || 0xdcdcc8;
        o = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.1), new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.35) }));
        o.userData.keepEmissive = true;
        o.position.set(toM(it.x), 0.12, toM(it.y));
        this.group.add(o); this.items.set(key, o);
      }
      o.rotation.y = this.time * 0.8;
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
      if (c.geometry && c.geometry !== this.xrayGeo) c.geometry.dispose();
      if (c.material && c.material !== this.xrayMat && c.material !== this.keyMat) { c.material.map?.dispose?.(); c.material.dispose(); }
      c.dispose?.();
    });
  }

  clear() {
    for (const m of [this.monsters, this.players, this.items, this.corpses, this.flareMeshes]) { for (const o of m.values()) this.disposeObj(o); m.clear(); }
    for (const k of this.keys) this.disposeObj(k);
    this.keys = [];
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
