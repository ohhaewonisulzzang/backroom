import * as THREE from 'three';
import { toM, yawFromAngle, EYE_H, EYE_CROUCH } from './units.js';

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
    this.eye = EYE_H;
    this.level = null;
    this.levelGroup = null;               // 레벨마다 새로 짓는 것 (setLevel 에서 dispose)
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
    // 임시 바닥 (Task 4 에서 진짜 월드로 바뀐다)
    const { w, h } = level.map;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(toM(w * 48), toM(h * 48)), new THREE.MeshBasicMaterial({ color: 0x5a5030 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(toM(w * 48) / 2, 0, toM(h * 48) / 2);
    g.add(floor);
    this.scene.fog = new THREE.FogExp2(0x1a1608, 0.11);
    this.scene.add(g);
  }

  disposeLevel() {
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
    this.camera.rotation.y = yawFromAngle(v.angle);
    this.camera.rotation.x = v === game.local ? (v.pitch || 0) : 0;
  }

  render(game, dt) {
    if (this.lost) return;
    this.setQuality(game.settings?.quality);
    this.placeCamera(game, dt);
    this.gl.render(this.scene, this.camera);
    this.overlay.prepareView(game, dt);
    this.overlay.renderOverlay(game, dt, { three: true });
  }

  dispose() {
    this.disposeLevel();
    removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.gl.dispose();
  }
}
