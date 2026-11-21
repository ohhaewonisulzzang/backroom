import * as THREE from 'three';
import { TS } from '../../../shared/config.js';
import { ASSETS, loadAssets, cloneItem } from './assets.js';
import { compassGoal, relativeBearing } from '../compass.js';

/**
 * 1인칭 손 (뷰모델): 화면 오른쪽 아래 장갑 낀 오른손이 든 아이템을 쥐고, 손전등을 켜면 왼손이 손전등을 든다.
 *  - 게임 장면을 다 그린 뒤 깊이만 지우고 따로 그린다 → 벽에 붙어도 손이 벽에 파묻히지 않는다
 *  - 움직임: 숨쉬기, 걸을 때 출렁임(달리면 크게), 시점을 돌릴 때 늦게 따라오는 흔들림, 웅크리면 낮게
 *  - 아이템 바꾸기: 내렸다가 새 아이템으로 올린다
 *  - 쓰는 동작: 마시기(아몬드 워터·드링크), 찍기(카메라 플래시), 뿌리기(살충제), 던지기(조명탄·폭죽),
 *    나침반 펼쳐 보기(바늘이 목표를 가리킨다), 투시경 쓰기, 주사기 찌르기
 */

// 아이템별 쥐는 모습 (rig 기준 위치·회전): item = 아이템, hand = 손. 오른손 손바닥은 원점의 세로축(y)을 감싸 쥔다
const HOLD = {
  almondWater:  { item: { pos: [0, 0.02, 0], rot: [0, 0.4, 0] } },
  staminaDrink: { item: { pos: [0, 0.015, 0], rot: [0, -0.6, 0] } },
  bugSpray:     { item: { pos: [0, 0.03, 0], rot: [0, 0, 0] } },
  flare:        { item: { pos: [0, 0.03, 0], rot: [0.15, 0, 0] } },
  adrenaline:   { item: { pos: [0, 0.0, 0], rot: [0.1, 0, 0] } },
  firecracker:  { item: { pos: [0, 0.03, 0], rot: [0, 0.3, 0] } },
  camera:       { item: { pos: [-0.045, 0.045, -0.005], rot: [0, 0.15, 0] } },
  compass:      { item: { pos: [-0.01, 0.06, -0.03], rot: [0.55, Math.PI, 0] } },   // 뚜껑이 먼 쪽으로 (바늘이 보이게)
  nightVision:  { item: { pos: [-0.01, 0.05, -0.01], rot: [0.1, 0, 0] } },
};
const ANCHOR_R = new THREE.Vector3(0.2, -0.21, -0.42);    // 오른손 자리 (카메라 기준, 앞 = -z)
const ANCHOR_L = new THREE.Vector3(-0.21, -0.22, -0.44);  // 왼손(손전등) 자리
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = u => u * u * (3 - 2 * u);

export class ViewModel {
  constructor() {
    loadAssets();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 5);
    this.hemi = new THREE.HemisphereLight(0xfff2d8, 0x2a2214, 0.6);
    this.key = new THREE.DirectionalLight(0xfff0d0, 0.8); this.key.position.set(-0.4, 1, 0.3);
    this.torch = new THREE.PointLight(0xfff4d8, 0, 1.2, 2); this.torch.position.set(-0.15, -0.1, -0.5);
    this.scene.add(this.hemi, this.key, this.torch);
    // 오른손 묶음 (rig → 손 + 아이템), 왼손 묶음 (손 + 손전등)
    this.rigR = new THREE.Group(); this.rigL = new THREE.Group();
    this.scene.add(this.rigR, this.rigL);
    this.cur = null;            // 지금 쥔 아이템 종류
    this.want = null;           // 쥐고 싶은 아이템 (바꾸는 중이면 다르다)
    this.raise = 0;             // 0 = 화면 밖으로 내림, 1 = 들고 있음
    this.lraise = 0;            // 왼손(손전등)
    this.sway = new THREE.Vector2(); this.lastYaw = null; this.lastPitch = 0;
    this.bobAmp = 0; this.time = 0;
    this.thrown = null;         // 던진 아이템 (잠깐 날아가는 모습)
    this.built = false;
  }

  /** 모델이 다 오면 손을 만든다 */
  build() {
    if (this.built || !ASSETS.ready) return;
    this.handR = cloneItem('hand_R'); this.handL = cloneItem('hand_T');   // 왼손: 손전등을 앞으로 겨누어 쥔 주먹 (Blender hand_T)
    this.torchItem = cloneItem('flashlight');
    if (!this.handR || !this.handL) return;
    this.rigR.add(this.handR);
    this.rigL.add(this.handL);
    if (this.torchItem) this.rigL.add(this.torchItem);
    this.suitMats = [];
    for (const h of [this.handR, this.handL]) h.traverse(o => { if (o.isMesh && /suit/.test(o.material.name)) { o.material = o.material.clone(); o.userData.ownMaterial = true; this.suitMats.push(o.material); } });
    this.built = true;
  }

  setSuitColor(hex) {
    if (!this.suitMats || this.suitHex === hex) return;
    this.suitHex = hex;
    for (const m of this.suitMats) m.color.set(hex);
  }

  /** 쥔 아이템 바꾸기 (모델 교체) */
  swapItem(type) {
    if (this.itemObj) { this.rigR.remove(this.itemObj); this.itemObj = null; }
    this.cur = type;
    if (!type) return;
    const o = cloneItem(type);
    if (!o) return;
    const h = HOLD[type]?.item || { pos: [0, 0, 0], rot: [0, 0, 0] };
    o.position.set(...h.pos); o.rotation.set(...h.rot);
    this.itemObj = o;
    this.rigR.add(o);
    this.needle = null;
    o.traverse(c => { if (/needle/i.test(c.name)) this.needle = c; });
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  /**
   * 매 프레임. ctx = { lightLevel(0..1), flashlightOn, suitHex, compassTarget: {x,y}|null }
   * 반환: 보여 줄 게 있는가
   */
  update(game, dt, ctx) {
    this.build();
    this.time += dt;
    const p = game.local, view = game.viewTarget();
    const active = this.built && p && view === p && p.alive && !p.hidden && game.deathT <= 0 && game.roundPhase === 'playing' && !(game.cine && game.cine.type === 'story');
    // 쥘 아이템: 손에 든 칸의 아이템 / 쓰는 동작 중이면 그 아이템 (써서 가방에서 사라져도 동작이 끝날 때까지)
    const use = game.vmUse;
    if (use) { use.t += dt; if (use.t > useDur(use.type)) game.vmUse = null; }
    const heldType = game.held >= 0 ? game.inv[game.held]?.type || null : null;
    this.want = active ? (game.vmUse?.type || heldType) : null;
    // 내렸다 올리기: 바꿀 땐 내린 뒤 교체
    if (this.want !== this.cur) {
      this.raise = Math.max(0, this.raise - dt * 7);
      if (this.raise <= 0) this.swapItem(this.want);
    } else this.raise = Math.min(1, this.raise + dt * (this.cur ? 5 : 7));
    this.lraise += ((active && ctx.flashlightOn ? 1 : 0) - this.lraise) * Math.min(1, dt * 8);
    this.setSuitColor(ctx.suitHex);
    if (!active && this.raise <= 0.01 && this.lraise <= 0.01) { this.rigR.visible = this.rigL.visible = false; return false; }

    // ---- 공통 움직임 ----
    const moving = !!p?.moving, sprint = !!p?.sprinting, crouch = !!p?.crouching;
    this.bobAmp += ((moving ? (sprint ? 1.8 : 1) : 0) - this.bobAmp) * Math.min(1, dt * 6);
    const ph = (p?.walkPhase || 0) * 0.42;
    const bobX = Math.sin(ph) * 0.012 * this.bobAmp, bobY = -Math.abs(Math.cos(ph)) * 0.014 * this.bobAmp;
    const breath = Math.sin(this.time * 1.6) * 0.004;
    // 시점을 돌리면 손이 늦게 따라온다
    const yaw = p?.angle || 0, pitch = p?.pitch || 0;
    if (this.lastYaw === null) this.lastYaw = yaw;
    let dy = yaw - this.lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dp = pitch - this.lastPitch; this.lastYaw = yaw; this.lastPitch = pitch;
    this.sway.x += (-dy * 0.6 - this.sway.x) * Math.min(1, dt * 8) + -dy * 0.25;
    this.sway.y += (dp * 0.6 - this.sway.y) * Math.min(1, dt * 8) + dp * 0.25;
    this.sway.x = Math.max(-0.06, Math.min(0.06, this.sway.x)); this.sway.y = Math.max(-0.05, Math.min(0.05, this.sway.y));
    const lower = crouch ? -0.015 : 0;
    const sprintDrop = sprint && moving ? 1 : 0;

    // ---- 오른손 + 아이템 ----
    const R = this.rigR;
    R.visible = this.raise > 0.01 && !!this.cur;   // 오른손은 아이템을 들었을 때만
    const k = ease(this.raise);
    R.position.copy(ANCHOR_R).add(new THREE.Vector3(bobX + this.sway.x, bobY + breath + lower - (1 - k) * 0.35 - sprintDrop * 0.05, 0));
    R.rotation.set(0.08 + (1 - k) * 0.6 + sprintDrop * 0.35 + this.sway.y * 2, -0.18 + this.sway.x * 2, -0.05 - sprintDrop * 0.4 + bobX * 4);
    if (this.itemObj) this.itemObj.visible = true;
    this.animateUse(game, dt, ctx);
    // ---- 왼손 + 손전등 ----
    const L = this.rigL, lk = ease(this.lraise);
    L.visible = this.lraise > 0.01;
    L.position.copy(ANCHOR_L).add(new THREE.Vector3(-bobX * 0.8 + this.sway.x, bobY * 0.9 + breath + lower - (1 - lk) * 0.35, 0));
    L.rotation.set(0.05 + this.sway.y * 2 + (1 - lk) * 0.5, 0.12 + this.sway.x * 2, 0.06 - bobX * 3);
    // ---- 빛: 그 자리 형광등 밝기 + 손전등 ----
    const lv = ctx.lightLevel;
    this.hemi.intensity = 0.12 + lv * 1.1; this.key.intensity = 0.15 + lv * 0.9;
    this.torch.intensity = ctx.flashlightOn ? 0.9 : 0;
    const nv = game.nightVisionT > 0;
    this.hemi.color.setHex(nv ? 0x80ff90 : 0xfff2d8);
    return true;
  }

  /** 쓰는 동작: 꾹 눌러 쓰는 아이템은 진행도(useHold), 한 번 쓰는 아이템은 vmUse 시간 */
  animateUse(game, dt, ctx) {
    const R = this.rigR, it = this.itemObj, type = this.cur;
    const hold = game.useHold && game.useHold.type === type ? clamp01(game.useHold.t / game.useHold.dur) : 0;
    const use = game.vmUse && game.vmUse.type === type ? game.vmUse : null;
    const u = use ? clamp01(use.t / useDur(type)) : 0;
    const bump = x => Math.sin(Math.PI * clamp01(x));            // 0 → 1 → 0
    switch (type) {
      case 'almondWater': case 'staminaDrink': {               // 입으로 가져가 기울여 마신다
        const d = Math.max(hold, use ? 1 - u : 0);
        R.position.x -= 0.15 * ease(d); R.position.y += 0.13 * ease(d); R.position.z += 0.12 * ease(d);
        R.rotation.x += 1.1 * ease(clamp01(d * 1.3 - 0.2)); R.rotation.y += 0.5 * ease(d);
        break;
      }
      case 'adrenaline': {                                        // 들어 올렸다가 허벅지로 찌른다
        const d = hold, s = use ? bump(u * 1.4) : 0;
        R.position.y += 0.06 * ease(d) - 0.12 * s; R.position.x -= 0.06 * ease(d); R.position.z += 0.03 * s;
        R.rotation.x -= 0.6 * ease(d) - 1.0 * s;
        break;
      }
      case 'nightVision': {                                       // 두 손으로 눈앞에 들어 올려 쓴다 → 화면 밖으로
        const d = Math.max(hold, use ? 1 : 0);
        R.position.x -= 0.2 * ease(d); R.position.y += 0.2 * ease(d) + (use ? u * 0.3 : 0); R.position.z += 0.2 * ease(d);
        R.rotation.x -= 0.3 * ease(d);
        break;
      }
      case 'camera': {                                            // 눈높이로 들어 찍는다 (플래시)
        const d = use ? bump(u) : 0;
        R.position.x -= 0.17 * d; R.position.y += 0.15 * d; R.position.z += 0.08 * d;
        R.rotation.x -= 0.1 * d; R.rotation.y += 0.18 * d;
        if (use && u > 0.35 && u < 0.5) R.position.z += 0.012;   // 셔터 반동
        break;
      }
      case 'bugSpray': {                                          // 앞으로 뻗어 칙칙 뿌린다
        const d = use ? bump(u) : 0;
        R.position.x -= 0.08 * d; R.position.z -= 0.06 * d; R.position.y += 0.04 * d;
        R.position.x += Math.sin(this.time * 60) * 0.003 * d;
        break;
      }
      case 'flare': case 'firecracker': {                         // 뒤로 젖혔다가 던진다 (던진 뒤엔 손에서 사라진다)
        if (use) {
          const back = clamp01(u / 0.35), fwd = clamp01((u - 0.35) / 0.3);
          R.position.y += 0.1 * ease(back) - 0.05 * fwd; R.position.z += 0.1 * ease(back) - 0.25 * fwd;
          R.rotation.x -= 0.9 * ease(back) - 1.6 * fwd;
          if (it) it.visible = u < 0.5;
        }
        break;
      }
      case 'compass': {                                           // 손바닥 위에 펼쳐 들고, 바늘이 목표를 가리킨다
        const d = Math.max(game.compassT > 0 ? 1 : 0, use ? ease(clamp01(u * 3)) : 0);
        R.position.x -= 0.1 * d; R.position.y += 0.06 * d; R.position.z += 0.06 * d;
        R.rotation.x -= 0.35 * d;
        if (this.needle) {
          const tgt = ctx.compassTarget, p = game.local;
          const want = tgt && game.compassT > 0 ? relativeBearing(p, tgt) : this.time * 3;   // 0 = 정면, + = 오른쪽. 목표가 없으면 빙빙 돈다
          this.needleAng = (this.needleAng ?? 0) + Math.atan2(Math.sin(want - (this.needleAng ?? 0)), Math.cos(want - (this.needleAng ?? 0))) * Math.min(1, dt * 6);
          // compass.glb 의 바늘 끝은 +z(플레이어 쪽)를 향한다. y 로 φ 돌리면 끝이 (sin φ, cos φ) 가 되므로
          // 정면(-z)에서 오른쪽으로 θ 돈 방향 (sin θ, -cos θ) 은 φ = π - θ. 손이 살짝 비튼 만큼(R.rotation.y)은 되돌린다
          this.needle.rotation.y = Math.PI - this.needleAng - R.rotation.y;
        }
        break;
      }
    }
  }

  /** 게임 장면 위에 덧그린다 (깊이만 지우고) */
  render(gl) {
    if (!this.rigR.visible && !this.rigL.visible) return;
    const size = gl.getSize(this._size || (this._size = new THREE.Vector2()));   // 화면 비율을 게임 화면과 맞춘다
    if (size.y > 0 && Math.abs(this.camera.aspect - size.x / size.y) > 1e-3) this.resize(size.x, size.y);
    const auto = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    gl.clearDepth();
    gl.render(this.scene, this.camera);
    gl.autoClear = auto;
  }

  dispose() {
    this.scene.clear();
    for (const m of this.suitMats || []) m.dispose();
  }
}

/** 쓰는 동작 길이 (초) */
export function useDur(type) {
  return { camera: 0.55, bugSpray: 0.9, flare: 0.7, firecracker: 0.7, compass: 0.6, almondWater: 0.35, staminaDrink: 0.35, nightVision: 0.4, adrenaline: 0.45 }[type] || 0.5;
}

/** 나침반 목표 (2D 화살표와 같은 규칙: 미션 → 열쇠 → 출구). compass.js 참고 */
export const compassTarget = compassGoal;
