import * as THREE from 'three';
import { CONFIG, TS } from '../../../shared/config.js';
import { hasLOS } from '../../../shared/physics.js';
import { toM, CEIL_H } from './units.js';
import { theme3D } from './materials.js';

const QN = {
  low: { lamps: 3, remote: 1, shadows: false }, medium: { lamps: 5, remote: 2, shadows: false }, high: { lamps: 8, remote: 2, shadows: true },
  ultra: { lamps: 96, remote: 2, shadows: false, rt: true },   // 레이 트레이싱: 가까운 형광등 96개가 진짜 빛 (그림자·간접광은 rt.js)
};
// 레이 트레이싱 조명 세기 (거리 제곱에 반비례: 밝기 = 세기 / d²). 천장 등 바로 아래 바닥(약 2.6m)이 구워 둔 밝기와 비슷하도록
const RT = { LAMP: 3.2, RANGE2: 15 * 15, FLASH: 9, REMOTE: 9 };

/**
 * Level 0 조명:
 *  - 천장 형광등 패널 (InstancedMesh). 깜빡이는 등은 2D LightSystem 의 flickers 상태를 그대로 따른다
 *  - 깜빡임 밝기: 꺼진 등의 기여만큼 구워 둔 밝기 텍스처(lightTex)를 깎는다 (shared/map.js buildLighting 3단계와 같은 식)
 *  - 카메라에서 가까운 켜진 등 몇 개만 실시간 PointLight (괴물·사람·사물에 빛이 떨어지게)
 *  - 손전등: 내 것은 카메라에 붙인 SpotLight, 다른 사람 것은 가까운 몇 명만 SpotLight + 옅은 빛줄기
 *  - 울트라(레이 트레이싱): 패널은 화면에만 빛나고(InstancedMesh 는 못 쓰므로 합친 메시 + 깜빡이는 등은 따로),
 *    빛은 가까운 등 96개에 붙인 PointLight 가 낸다. 등-조명 짝은 범위를 벗어날 때만 바꾼다 (자주 바꾸면 노이즈가 남는다)
 */
/** 같은 모양(BoxGeometry 복제본)의 상자들을 한 BufferGeometry 로 */
function mergeBoxes(geos) {
  const n = geos.reduce((a, g) => a + g.attributes.position.count, 0), ic = geos.reduce((a, g) => a + g.index.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ic);
  let v = 0, k = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3); uv.set(g.attributes.uv.array, v * 2);
    for (const i of g.index.array) idx[k++] = i + v;
    v += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export class LightRig {
  constructor(scene, camera, level, lightTex, quality, flickers) {
    this.scene = scene; this.camera = camera; this.level = level; this.lightTex = lightTex;
    this.q = QN[quality] || QN.medium;
    this.flickers = flickers || [];
    const th = theme3D(level);
    this.panelHex = th.panel;              // 테마 색: Level 0 은 따뜻한 흰색, Level 1 콘크리트는 차가운 흰색
    const LAMP = th.lamp;
    this.group = new THREE.Group(); this.group.name = 'lights';
    scene.add(this.group);
    const lights = level.lights || [];
    this.lights = lights;

    // ---- 천장 패널 ----
    this.panelGeo = new THREE.BoxGeometry(0.6, 0.03, 1.2);
    if (this.q.rt) this.buildRTPanels(lights);
    else {
      this.panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this.panels = new THREE.InstancedMesh(this.panelGeo, this.panelMat, Math.max(1, lights.length));
      const m = new THREE.Matrix4(), on = new THREE.Color(this.panelHex);
      lights.forEach((l, i) => {
        m.makeTranslation(toM(l.x), CEIL_H - 0.016, toM(l.y));
        this.panels.setMatrixAt(i, m); this.panels.setColorAt(i, on);
      });
      this.panels.count = lights.length;
      this.group.add(this.panels);
    }

    // ---- 깜빡임용: 등마다 칸별 기여 (꺼지면 빼고 켜지면 더한다) ----
    const L = { ...CONFIG.LIGHTS, ...(level.info?.lights || {}) }, map = level.map, w = map.w;
    this.R = L.RADIUS;
    this.sum = new Float32Array(map.w * map.h).fill(L.AMBIENT);   // 클램프 전 밝기 합
    this.contrib = new Map();                                       // light → [[칸, 양], ...]
    for (const lt of lights) {
      const list = [], Ri = Math.ceil(L.RADIUS);
      for (let y = lt.ty - Ri; y <= lt.ty + Ri; y++) for (let x = lt.tx - Ri; x <= lt.tx + Ri; x++) {
        if (!map.inBounds(x, y) || map.isSolid(x, y)) continue;
        const d = Math.hypot(x - lt.tx, y - lt.ty);
        if (d >= L.RADIUS) continue;
        if (d > 0 && !hasLOS(map, lt.x, lt.y, x * TS + TS / 2, y * TS + TS / 2)) continue;
        const v = Math.pow(1 - d / L.RADIUS, 0.8);
        list.push([y * w + x, v]); this.sum[y * w + x] += v;
      }
      if (lt.flicker) this.contrib.set(lt, list);
    }
    this.offState = new Map();             // flicker light → 지금 꺼져 있는가 (3D 쪽에 반영된 상태)

    // ---- 가까운 실시간 형광등 ----
    this.lampPool = [];
    this.lampOf = new Map();               // (울트라) 조명 → 맡은 등
    for (let i = 0; i < this.q.lamps; i++) {
      const p = this.q.rt ? new THREE.PointLight(LAMP, 0, 0, 2) : new THREE.PointLight(LAMP, 0, 6, 2);
      if (this.q.rt) p.userData.rtRadius = 0.28;   // 패널 크기만 한 광원 → 부드러운 그림자
      this.lampPool.push(p); this.group.add(p);
    }

    // ---- 내 손전등 ----
    this.flash = new THREE.SpotLight(0xfff8e8, 0, 14, 0.42, 0.65, 1.6);
    this.flash.position.set(0.18, -0.25, 0);
    this.flash.target.position.set(0, -0.2, -1);
    this.flash.userData.rtRadius = 0.04;
    if (this.q.shadows) { this.flash.castShadow = true; this.flash.shadow.mapSize.set(512, 512); this.flash.shadow.camera.near = 0.1; }
    camera.add(this.flash, this.flash.target);

    // ---- 다른 사람 손전등 ----
    this.remote = [];
    const beamGeo = new THREE.ConeGeometry(1.6, 7, 16, 1, true);
    beamGeo.translate(0, -3.5, 0); beamGeo.rotateX(-Math.PI / 2);   // 꼭짓점이 원점, -z 로 뻗는다
    this.beamGeo = beamGeo;
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < this.q.remote; i++) {
      const s = new THREE.SpotLight(0xfff8e8, 0, 12, 0.42, 0.5, 1.4);
      const beam = new THREE.Mesh(beamGeo, this.beamMat);
      this.group.add(s, s.target, beam);
      this.remote.push({ s, beam });
    }
    this.ambientBoost = 0;
  }

  /** 울트라: 켜진 등은 한 메시로 합치고, 깜빡이는 등만 따로 (재질을 켜짐/꺼짐으로 바꿔 끼운다) */
  buildRTPanels(lights) {
    const mk = (emissive, k) => {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive, emissiveIntensity: k, roughness: 0.6 });
      m.userData.rtNoAreaLight = true;     // 빛은 PointLight 가 낸다 (발광 면 표본은 256개 한도라 1000개 넘는 패널엔 못 쓴다)
      return m;
    };
    this.rtOn = mk(this.panelHex, 2.4); this.rtOff = mk(0x000000, 0); this.rtOff.color.set(0x2a2820);
    const steady = [], flick = new Map();
    for (const l of lights) {
      const g = this.panelGeo.clone().translate(toM(l.x), CEIL_H - 0.016, toM(l.y));
      if (l.flicker) {
        const mesh = new THREE.Mesh(g, this.rtOn);
        mesh.userData.rtExclude = true;
        flick.set(l, mesh); this.group.add(mesh);
      } else steady.push(g);
    }
    if (steady.length) {
      const merged = mergeBoxes(steady);
      for (const g of steady) g.dispose();
      const mesh = new THREE.Mesh(merged, this.rtOn);
      mesh.userData.rtExclude = true;      // 천장에 붙은 얇은 판: 그림자를 드리우면 등 바로 아래가 어두워진다
      this.group.add(mesh);
      this.rtSteady = mesh;
    }
    this.rtFlick = flick;
  }

  /** 꺼지고 켜진 등의 기여를 밝기 텍스처에 반영 */
  syncFlicker() {
    const data = this.lightTex.image.data, map = this.level.map, w = map.w;
    let dirty = false;
    const touched = new Set();
    for (const f of this.flickers) {
      const was = !!this.offState.get(f.l);
      if (was === !!f.off) continue;
      this.offState.set(f.l, !!f.off);
      const list = this.contrib.get(f.l) || [];
      for (const [i, v] of list) { this.sum[i] += f.off ? -v : v; touched.add(i); }
      if (this.panels) {
        const k = this.lights.indexOf(f.l);
        if (k >= 0) { this.panels.setColorAt(k, new THREE.Color(f.off ? 0x2a2820 : this.panelHex)); this.panels.instanceColor.needsUpdate = true; }
      } else { const mesh = this.rtFlick?.get(f.l); if (mesh) mesh.material = f.off ? this.rtOff : this.rtOn; }
      dirty = true;
    }
    if (!dirty) return;
    const put = i => { data[i * 4] = Math.round(Math.min(1, Math.max(0, this.sum[i])) * 255); };
    for (const i of touched) {
      put(i);
      const x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {   // 이웃 벽 칸 = 이웃 바닥 중 가장 밝은 값
        const nx = x + dx, ny = y + dy;
        if (!map.inBounds(nx, ny) || !map.isSolid(nx, ny)) continue;
        let b = 0;
        for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map.inBounds(nx + ex, ny + ey) && !map.isSolid(nx + ex, ny + ey)) b = Math.max(b, Math.min(1, this.sum[(ny + ey) * w + nx + ex]));
        data[(ny * w + nx) * 4] = Math.round(b * 255);
      }
    }
    this.lightTex.needsUpdate = true;
  }

  isOn(l) { return !(l.flicker && this.offState.get(l)); }

  /** 매 프레임: 깜빡임, 가까운 등, 손전등. 반환: 가까운 켜진 등 수 (형광등 소리 크기용) */
  update(game, dt) {
    this.syncFlicker();
    const cx = this.camera.position.x, cz = this.camera.position.z;
    // 가까운 켜진 등 N 개
    const near = [];
    for (const l of this.lights) {
      if (!this.isOn(l)) continue;
      const d = (toM(l.x) - cx) ** 2 + (toM(l.y) - cz) ** 2;
      if (d > 144) continue;
      near.push([d, l]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const flick = game.flicker?.intensity ?? 1;
    if (this.q.rt) this.assignRTLamps(near, flick);
    else this.lampPool.forEach((p, i) => {
      const e = near[i];
      if (!e) { p.intensity = 0; return; }
      p.position.set(toM(e[1].x), CEIL_H - 0.25, toM(e[1].y));
      p.intensity = 2.2 * flick;
    });
    // 내 손전등 (보고 있는 사람)
    const v = game.viewTarget();
    this.flash.intensity = v?.alive && v.flashlight && !v.hidden ? (this.q.rt ? RT.FLASH : 7) * flick : 0;
    // 다른 사람 손전등: 가까운 순
    const others = [];
    for (const p of game.allPlayers()) {
      if (p === v || !p.alive || p.hidden || !p.flashlight || p.status === 'escaped') continue;
      others.push([(toM(p.x) - cx) ** 2 + (toM(p.y) - cz) ** 2, p]);
    }
    others.sort((a, b) => a[0] - b[0]);
    this.remote.forEach(({ s, beam }, i) => {
      const e = others[i];
      if (!e || e[0] > 400) { s.intensity = 0; beam.visible = false; return; }
      const p = e[1], eye = p.crouching ? 0.9 : 1.4;
      s.position.set(toM(p.x), eye, toM(p.y));
      s.target.position.set(toM(p.x) + Math.cos(p.angle), eye - 0.15, toM(p.y) + Math.sin(p.angle));
      s.intensity = this.q.rt ? RT.REMOTE : 7;
      beam.visible = !this.q.rt;             // 울트라는 안개 속 진짜 빛줄기(볼류메트릭)가 대신한다
      beam.position.copy(s.position);
      beam.lookAt(s.target.position);
      beam.rotateY(Math.PI);                 // 원뿔은 -z 로 뻗으므로 lookAt(+z) 을 뒤집는다
    });
    // 반경 4m 안 켜진 등 수
    let n = 0; for (const [d] of near) if (d < 16) n++;
    return n;
  }

  /**
   * 울트라: 가까운 켜진 등(최대 96개)에 조명을 붙인다. 이미 붙어 있는 짝은 그대로 두고,
   * 범위를 벗어났거나 꺼진 등의 조명만 새로 들어온 등으로 옮긴다 (레이 트레이서가 조명 번호별로 쌓은 기록이 덜 깨진다)
   */
  assignRTLamps(near, flick) {
    const want = new Set();
    for (let i = 0; i < near.length && i < this.lampPool.length; i++) if (near[i][0] <= RT.RANGE2) want.add(near[i][1]);
    const taken = new Set(), free = [];
    for (const p of this.lampPool) {
      const l = this.lampOf.get(p);
      if (l && want.has(l)) taken.add(l);
      else { this.lampOf.delete(p); free.push(p); }
    }
    for (const l of want) {
      if (taken.has(l) || !free.length) continue;
      const p = free.pop();
      this.lampOf.set(p, l);
      p.position.set(toM(l.x), CEIL_H - 0.32, toM(l.y));   // 광원 구(반지름 0.28m)가 천장 위로 삐져나가지 않게
    }
    for (const p of this.lampPool) p.intensity = this.lampOf.has(p) ? RT.LAMP * flick : 0;
  }

  dispose() {
    this.scene.remove(this.group);
    this.camera.remove(this.flash, this.flash.target);
    this.flash.dispose?.();
    for (const p of this.lampPool) p.dispose?.();
    for (const { s } of this.remote) s.dispose?.();
    this.panelGeo.dispose(); this.panelMat?.dispose(); this.panels?.dispose();
    this.rtSteady?.geometry.dispose();
    for (const m of this.rtFlick?.values() || []) m.geometry.dispose();
    this.rtOn?.dispose(); this.rtOff?.dispose();
    this.beamGeo.dispose(); this.beamMat.dispose();
  }
}
