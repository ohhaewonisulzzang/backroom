import * as THREE from 'three';
import { toM, yawFromAngle, EYE_H, EYE_CROUCH } from './units.js';
import { buildWorld } from './world.js';
import { LightRig } from './lights.js';
import { ActorLayer } from './actors.js';

/** WebGL 을 쓸 수 있는가 (못 쓰면 엔진이 2D 로만 그린다) */
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

/** 품질별 숫자 */
export const QUALITY = {
  low:    { pixelRatio: 1,   lights: 3, remoteLights: 1, shadows: false, bloom: false, aberration: false },
  medium: { pixelRatio: 1.5, lights: 5, remoteLights: 2, shadows: false, bloom: true,  aberration: false },
  high:   { pixelRatio: 2,   lights: 8, remoteLights: 2, shadows: true,  bloom: true,  aberration: true },
};

/**
 * Level 0 1인칭 3D 화면. 기존 2D Renderer 와 같은 모양(setLevel / render / resize)이라 엔진이 갈아 끼운다.
 *  - 그리기 순서: 카메라(바라보는 사람의 눈) → three 장면 → overlay.renderOverlay (HUD·사망 연출 등 2D 화면 고정 그림)
 *  - 서버 판정과 좌표(px)는 그대로. 2D (x, y) → 3D (x/32, 높이, y/32)
 */
export class Renderer3D {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;               // 2D Renderer (투명 오버레이 캔버스)
    this.lost = false;
    this.quality = 'medium';
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0904);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 60);
    this.camera.rotation.order = 'YXZ';
    this.ambient = new THREE.AmbientLight(0xfff4dc, 0.05);  // 벽·바닥 밝기는 구워 둔 형광등 밝기(lightTex)가 정한다. 이건 아주 옅은 바탕빛
    this.scene.add(this.ambient, this.camera);
    this.eye = EYE_H;
    this.level = null;
    this.levelGroup = null;               // 레벨마다 새로 짓는 것 (setLevel 에서 dispose)
    this.actors = new ActorLayer(this.scene, (x, y) => this.lightAt(x, y));
    this.deathYaw = null;                 // 잡혔을 때 괴물 쪽으로 홱 돌아가는 카메라
    canvas.addEventListener('webglcontextlost', this.onLost = e => { e.preventDefault(); this.lost = true; });
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    this.resize();
  }

  setQuality(q) {
    if (!QUALITY[q]) q = 'medium';
    if (q === this.quality && this.qSet) return;
    this.quality = q; this.qSet = true;
    this.resize();
  }

  resize() {
    const W = innerWidth, H = innerHeight;
    this.gl.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY[this.quality].pixelRatio));
    this.gl.setSize(W, H, false);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
  }

  /** 레벨 짓기. 이전 레벨의 지오메트리·재질·텍스처는 모두 해제한다 */
  setLevel(level) {
    this.disposeLevel();
    this.level = level;
    const g = this.levelGroup = new THREE.Group();
    this.world = buildWorld(level, this.quality);
    g.add(this.world.group);
    this.rig = new LightRig(this.scene, this.camera, level, this.world.lightTex, this.quality, this.overlay.lights.flickers);
    this.actors.setLevel(level);
    this.scene.fog = new THREE.FogExp2(0x1a1608, 0.11);
    this.scene.add(g);
  }

  /** 그 자리(px)의 형광등 밝기 0..1 (구워 둔 밝기 텍스처, 깜빡임 반영) */
  lightAt(x, y) {
    const t = this.world?.lightTex, map = this.level?.map;
    if (!t || !map) return 0;
    const tx = Math.floor(x / 48), ty = Math.floor(y / 48);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return 0;
    return t.image.data[(ty * map.w + tx) * 4] / 255;
  }

  disposeLevel() {
    this.actors?.clear();
    this.rig?.dispose(); this.rig = null;
    this.world?.dispose(); this.world = null;
    if (!this.levelGroup) return;
    this.scene.remove(this.levelGroup);
    this.levelGroup.traverse(o => {
      o.geometry?.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }
    });
    this.levelGroup = null;
  }

  /** 카메라: 바라보는 사람(나 / 관전 대상)의 눈 위치·방향 */
  placeCamera(game, dt) {
    const v = game.viewTarget();
    const want = v.crouching ? EYE_CROUCH : EYE_H;
    this.eye += (want - this.eye) * Math.min(1, dt * 10);
    this.camera.position.set(toM(v.x), this.eye, toM(v.y));
    let yaw = yawFromAngle(v.angle), pitch = v === game.local ? (v.pitch || 0) : 0;
    // 잡혔을 때: 0.15초 동안 나를 잡은 괴물 쪽으로 홱 돈다 (그 뒤는 2D 사망 연출 오버레이)
    if (game.deathT > 0 && v === game.local && !v.alive) {
      if (this.deathYaw === null) {
        let best = null, bd = Infinity;
        for (const m of game.monsters) { const d = Math.hypot(m.x - v.x, m.y - v.y); if (m.type === game.killerType && d < bd) { bd = d; best = m; } }
        this.deathYaw = best ? yawFromAngle(Math.atan2(best.y - v.y, best.x - v.x)) : yaw;
        this.deathFrom = yaw; this.deathT0 = 0;
      }
      this.deathT0 += dt;
      const k = Math.min(1, this.deathT0 / 0.15);
      let dy = this.deathYaw - this.deathFrom; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw = this.deathFrom + dy * k; pitch = 0.08 * k;
    } else this.deathYaw = null;
    this.camera.rotation.y = yaw;
    this.camera.rotation.x = pitch;
  }

  render(game, dt) {
    if (this.lost) return;
    this.setQuality(game.settings?.quality);
    this.placeCamera(game, dt);
    this.scene.fog.density = game.modes?.thickFog ? 0.2 : 0.11;   // '짙은 안개' 모드
    const nearLamps = this.rig ? this.rig.update(game, dt) : 0;
    this.actors.update(game, dt, this.camera);
    game.hum3D = Math.min(1, 0.35 + nearLamps * 0.25);              // 형광등 아래일수록 웅웅 소리가 크다 (엔진이 setHum 에 곱한다)
    const nv = game.nightVisionT > 0;                                 // 야간 투시경: 어둠 속도 보이게 바탕빛을 크게
    this.ambient.intensity = game.test?.fullbright ? 3 : nv ? 2.2 : 0.05;
    if (nv) this.scene.fog.density *= 0.35;
    this.gl.render(this.scene, this.camera);
    this.overlay.prepareView(game, dt);
    this.overlay.renderOverlay(game, dt, { three: true });
  }

  dispose() {
    this.disposeLevel();
    this.actors.dispose();
    removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.gl.dispose();
  }
}
