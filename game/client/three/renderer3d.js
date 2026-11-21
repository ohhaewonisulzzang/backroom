import * as THREE from 'three';
import { toM, yawFromAngle, EYE_H, EYE_CROUCH } from './units.js';
import { buildWorld } from './world.js';
import { theme3D } from './materials.js';
import { LightRig } from './lights.js';
import { ActorLayer, makeHowler, makeHazmat } from './actors.js';
import { PostFx } from './post.js';
import { ViewModel, compassTarget } from './viewmodel.js';
import { SUIT_HEX } from '../../../shared/config.js';
import { Input } from '../input.js';
import { t } from '../../../shared/i18n.js';

/** 자동 성능 조절 단계: 0 = 설정 그대로 … 끝 = 해상도 50% + 블룸·그림자 끔 */
const PERF_LEVELS = [
  { scale: 1, fx: true }, { scale: 0.9, fx: true }, { scale: 0.8, fx: true }, { scale: 0.7, fx: true },
  { scale: 0.6, fx: true }, { scale: 0.5, fx: true }, { scale: 0.5, fx: false },
];

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
  // 레이 트레이싱 (rt.js). 픽셀마다 광선을 쏘므로 픽셀 비율은 1, 조명 해상도는 프레임 목표에 맞춰 라이브러리가 조절
  ultra:  { pixelRatio: 1,   lights: 96, remoteLights: 2, shadows: false, bloom: true,  aberration: true, rt: true },
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
    this.bobAmp = 0;                      // 머리 흔들림 크기 (부드럽게 바뀐다)
    this.level = null;
    this.levelGroup = null;               // 레벨마다 새로 짓는 것 (setLevel 에서 dispose)
    this.actors = new ActorLayer(this.scene, (x, y) => this.lightAt(x, y));
    this.vm = new ViewModel();            // 1인칭 손과 든 아이템 (장면 위에 덧그린다)
    this.deathYaw = null;                 // 잡혔을 때 괴물 쪽으로 홱 돌아가는 카메라
    this.nudge = { x: 0, y: 0 };          // 서버가 위치를 되돌렸을 때 카메라를 그 거리만큼 남겨 두고 0.15초에 걸쳐 따라간다 (px)
    this.rtMod = null; this.rtLoading = false; this.rtFailed = false;   // 울트라: rt.js 는 처음 고를 때 불러온다
    this.rtPath = null;
    // 자동 성능 조절 (adaptPerf): 프레임이 목표(모니터 주사율 또는 프레임 한도)에 못 미치면 해상도를 낮추고, 그래도 모자라면 블룸·그림자를 끈다
    this.perfLevel = 0;
    this.perf = { t: 0, n: 0, good: 0, hold: 1.5, failedAt: -1, failWait: 10, hinted: false };
    this.gpuName = '';
    try {
      const ctx = this.gl.getContext(), ext = ctx.getExtension('WEBGL_debug_renderer_info');
      this.gpuName = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
    } catch { /* 이름을 못 읽어도 그린다 */ }
    // 노트북 내장 그래픽: 브라우저가 외장 GPU(RTX 등)를 두고 이걸로 그리는 경우가 많다 (Windows 그래픽 설정에서 바꿔야 한다)
    this.integratedGpu = /Intel|Microsoft Basic|SwiftShader|llvmpipe/i.test(this.gpuName);
    console.info(`[3D] GPU: ${this.gpuName}`);
    canvas.addEventListener('webglcontextlost', this.onLost = e => { e.preventDefault(); this.lost = true; });
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    this.resize();
  }

  /**
   * 설정의 품질 → 실제로 쓸 품질. '울트라'는 rt.js 를 불러와 이 GPU 가 레이 트레이싱을 할 수 있을 때만이고,
   * 불러오는 동안·못 쓰는 GPU 에서는 '높음'으로 그린다
   */
  effectiveQuality(q) {
    if (!QUALITY[q]) return 'medium';
    if (!QUALITY[q].rt) return q;
    if (this.rtFailed) return 'high';
    if (!this.rtMod) {
      if (!this.rtLoading) {
        this.rtLoading = true;
        import('./rt.js').then(m => {
          const why = m.RTPath.unavailable(this.gl);
          if (why) {
            this.rtFailed = why;
            console.info(why === 'd3d'
              ? '울트라(레이 트레이싱): 브라우저가 Direct3D 로 그리고 있어 셰이더 컴파일이 끝나지 않는다 — 높음으로 그린다. chrome://flags 의 "Choose ANGLE graphics backend" 를 OpenGL 로 바꾸면 쓸 수 있다.'
              : '이 GPU 는 레이 트레이싱(울트라)을 못 쓴다 — 높음으로 그린다');
          } else this.rtMod = m;
        }).catch(e => { this.rtFailed = true; console.warn('레이 트레이싱을 불러오지 못했다:', e); });
      }
      return 'high';
    }
    return q;
  }

  /** 품질이 바뀌면 픽셀 비율·후처리·그림자를 다시 맞춘다 (조명 개수는 다음 레벨부터, 레이 트레이싱을 켜고 끌 때는 바로 다시 짓는다) */
  setQuality(want) {
    const q = this.effectiveQuality(want);
    if (q === this.quality && this.post) return;
    const rtChanged = !!QUALITY[q].rt !== !!QUALITY[this.quality]?.rt;
    this.quality = q;
    this.gl.shadowMap.enabled = QUALITY[q].shadows;
    if (QUALITY[q].rt && !this.rtPath) this.rtPath = new this.rtMod.RTPath(this.gl, 60);
    if (!QUALITY[q].rt && this.rtPath) { this.rtPath.dispose(); this.rtPath = null; }
    this.actors.rtLit = !!this.rtPath;
    this.resize();
    this.post?.dispose();
    this.post = new PostFx(this.gl, this.scene, this.camera, q, this.rtPath?.texture || null);
    this.applyPerfFx();
    if (rtChanged && this.level && !this.building) this.setLevel(this.level);   // 형광등 조명 구성이 다르다
  }

  resize() {
    const W = innerWidth, H = innerHeight;
    const scale = this.rtPath ? 1 : PERF_LEVELS[this.perfLevel].scale;   // 울트라는 레이 트레이서가 스스로 조명 해상도를 조절한다
    this.gl.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY[this.quality].pixelRatio) * scale);
    this.gl.setSize(W, H, false);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.rtPath?.setSize();
    this.post?.setSize(W, H);
    this.vm?.resize(W, H);
    this.W = W; this.H = H;
  }

  /** 레벨 짓기. 이전 레벨의 지오메트리·재질·텍스처는 모두 해제한다 */
  setLevel(level, quality) {
    if (quality) { this.building = true; this.setQuality(quality); this.building = false; }   // 실시간 조명 개수·그림자는 레벨을 지을 때 정해지므로 품질을 먼저 맞춘다
    this.disposeLevel();
    this.level = level;
    const g = this.levelGroup = new THREE.Group();
    this.world = buildWorld(level, this.quality);
    g.add(this.world.group);
    this.rig = new LightRig(this.scene, this.camera, level, this.world.lightTex, this.quality, this.overlay.lights.flickers);
    this.actors.setLevel(level);
    const th = theme3D(level);
    this.scene.fog = new THREE.FogExp2(th.fog, 0.11);   // 테마 색 (Level 1 콘크리트는 차가운 회색)
    this.scene.background.setHex(th.bg);
    this.scene.add(g);
    this.prewarm();
    if (this.rtPath) this.rtPath.compile(this.scene, this.world.group);   // 벽·바닥·천장만 BVH 로
    this.perf.hold = 1.5; this.perf.t = this.perf.n = 0;                // 레벨을 지은 직후의 긴 프레임은 재지 않는다
  }

  /**
   * 자동 성능 조절. 0.5초마다 평균 FPS 를 목표(game.fpsTarget = 프레임 한도, 없으면 모니터 주사율 — 144Hz 면 144)와 비교한다.
   *  - 목표의 90% 미만: 한 단계 내린다 (60% 미만이면 두 단계)
   *  - 목표에 닿은 채 3초: 한 단계 올려 본다. 올렸다가 바로 떨어진 단계는 20초(실패할 때마다 두 배, 최대 2분) 뒤에야 다시 시도한다
   * 수직 동기화 때문에 목표에 닿으면 남는 여유를 잴 수 없어서, 이렇게 "올려 보고 안 되면 내리는" 식으로 맞춘다
   */
  adaptPerf(game, dt) {
    if (this.rtPath) return;
    const P = this.perf, target = game.fpsTarget || 60;
    if (P.hold > 0) { P.hold -= dt; P.t = P.n = 0; return; }
    P.t += dt; P.n++;
    if (P.t < 0.5) return;
    const fps = P.n / P.t; P.t = P.n = 0;
    const max = PERF_LEVELS.length - 1;
    if (fps < target * 0.9) {
      P.good = 0;
      if (this.perfLevel >= max) return;
      if (P.justRaised) { P.failedAt = this.perfLevel; P.failWait = Math.min(120, P.failWait * 2); }
      this.setPerfLevel(Math.min(max, this.perfLevel + (fps < target * 0.6 ? 2 : 1)));
      if (this.integratedGpu && !P.hinted && this.perfLevel >= 3 && game.msg) {
        P.hinted = true;
        game.msg(t('내장 그래픽으로 그리는 중이라 화질을 낮췄다 — Windows 설정 > 그래픽에서 브라우저를 \'고성능\'(외장 GPU)으로 바꾸면 훨씬 빠르다'), 8);
      }
    } else if (fps >= target * 0.97 && this.perfLevel > 0) {
      P.good += 0.5;
      P.justRaised = false;
      const next = this.perfLevel - 1;
      if (P.good >= (next <= P.failedAt ? P.failWait : 3)) { P.good = 0; this.setPerfLevel(next); P.justRaised = true; }
    } else { P.good = 0; P.justRaised = false; }
  }

  setPerfLevel(lv) {
    if (lv === this.perfLevel) return;
    console.info(`[3D] 자동 성능 조절: ${this.perfLevel} → ${lv} (해상도 ${Math.round(PERF_LEVELS[lv].scale * 100)}%${PERF_LEVELS[lv].fx ? '' : ', 블룸·그림자 끔'})`);
    this.perfLevel = lv;
    this.perf.hold = 0.4;                 // 바꾼 직후 프레임은 재지 않는다
    this.resize();
    this.applyPerfFx();
  }

  /** 마지막 단계: 블룸·손전등 그림자 끄기 */
  applyPerfFx() {
    const fx = PERF_LEVELS[this.perfLevel].fx;
    this.gl.shadowMap.enabled = QUALITY[this.quality].shadows && fx;
    if (this.post?.bloom) this.post.bloom.enabled = fx;
  }

  /**
   * 셰이더 미리 만들기: 하울러·사람·투시 윤곽을 처음 볼 때 셰이더를 만드느라 화면이 멈추면,
   * 그동안 쌓인 마우스 이동이 한꺼번에 들어가 시점이 "순간이동" 한다. 레벨을 지을 때 한 번 다 만들어 둔다
   */
  prewarm() {
    const tmp = new THREE.Group();
    const xray = new THREE.Mesh(this.actors.xrayGeo, this.actors.xrayMat);
    tmp.add(makeHowler(), makeHazmat(0xd8c040, false), makeHazmat(0xd8c040, true), xray);
    tmp.position.copy(this.camera.position);
    this.scene.add(tmp);
    try { this.gl.compile(this.scene, this.camera); } catch { /* 미리 못 만들어도 그릴 때 만든다 */ }
    this.scene.remove(tmp);   // 모델 재질·도형은 다른 배우와 함께 쓸 수 있으니 해제하지 않는다 (레벨마다 몇 개뿐)
  }

  /** 서버가 내 위치를 되돌렸다: 가까우면 카메라를 부드럽게 끌어오고, 멀면(순간이동) 레이 트레이싱 기록을 버린다 */
  onCorrect(dx, dy) {
    if (Math.hypot(dx, dy) < 96) { this.nudge.x += dx; this.nudge.y += dy; }
    else { this.nudge.x = this.nudge.y = 0; this.rtPath?.reset(); }
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
    const k = Math.exp(-dt / 0.05);                      // 위치 보정: 0.15초면 거의 다 따라간다
    this.nudge.x *= k; this.nudge.y *= k;
    const nx = v === game.local ? this.nudge.x : 0, ny = v === game.local ? this.nudge.y : 0;
    this.camera.position.set(toM(v.x + nx), this.eye, toM(v.y + ny));
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
    // 머리 흔들림 (걷기 ±3cm, 달리기 ±6cm) + 화면 흔들림. 설정 '화면 흔들림'을 끄면 둘 다 없다
    if (game.settings?.shake !== false && v.alive) {
      const amp = v.moving ? (v.sprinting ? 0.06 : 0.03) : 0;
      this.bobAmp += (amp - (this.bobAmp || 0)) * Math.min(1, dt * 8);
      const ph = (v.walkPhase || 0) * 0.42;
      this.camera.position.y += Math.sin(ph * 2) * this.bobAmp;
      this.camera.position.x += Math.cos(yaw) * Math.sin(ph) * this.bobAmp * 0.5;
      this.camera.position.z -= Math.sin(yaw) * Math.sin(ph) * this.bobAmp * 0.5;
      const sh = (game.shake || 0) * 0.004;
      if (sh > 0) { this.camera.position.x += (Math.random() - 0.5) * sh; this.camera.position.y += (Math.random() - 0.5) * sh; }
    }
  }

  render(game, dt) {
    if (this.lost) return;
    this.setQuality(game.settings?.quality);
    this.adaptPerf(game, dt);
    this.placeCamera(game, dt);
    this.scene.fog.density = game.modes?.thickFog ? 0.2 : 0.11;   // '짙은 안개' 모드
    const nearLamps = this.rig ? this.rig.update(game, dt) : 0;
    this.actors.update(game, dt, this.camera);
    game.hum3D = Math.min(1, 0.35 + nearLamps * 0.25);              // 형광등 아래일수록 웅웅 소리가 크다 (엔진이 setHum 에 곱한다)
    const nv = game.nightVisionT > 0;                                 // 야간 투시경: 어둠 속도 보이게 바탕빛을 크게
    this.ambient.intensity = game.test?.fullbright ? 3 : nv ? 2.2 : 0.05;
    if (nv) this.scene.fog.density *= 0.35;
    if (this.rtPath) {
      this.rtPath.setTargetFps(game.fpsTarget || 60);              // 프레임 한도 (없으면 모니터 주사율) 에 맞춰 조명 해상도를 조절
      this.rtPath.render(this.scene, this.camera, this.scene.fog.density);
    }
    this.post.render(game, dt);
    // 1인칭 손: 그 자리 밝기·손전등·옷 색을 받아 덧그린다
    const me = game.local;
    if (this.vm.update(game, dt, { lightLevel: me ? this.lightAt(me.x, me.y) : 0, flashlightOn: !!(me?.alive && me.flashlight && !me.hidden), suitHex: SUIT_HEX[me?.color] || SUIT_HEX.default, compassTarget: compassTarget(game) })) this.vm.render(this.gl);
    this.overlay.prepareView(game, dt);
    this.overlay.renderOverlay(game, dt, { three: true, world3d: { project: (x, y, h) => this.project(x, y, h), locked: Input.locked, touch: !!Input.touch.active } });
  }

  /** 2D 좌표(px)와 높이(m) → 화면 좌표. 카메라 뒤면 visible = false */
  project(x, y, h) {
    const v = this._v || (this._v = new THREE.Vector3());
    v.set(toM(x), h, toM(y)).applyMatrix4(this.camera.matrixWorldInverse);
    if (v.z > -0.1) return { sx: 0, sy: 0, visible: false, dist: -v.z };
    const dist = -v.z;
    v.applyMatrix4(this.camera.projectionMatrix);
    const sx = (v.x * 0.5 + 0.5) * this.W, sy = (-v.y * 0.5 + 0.5) * this.H;
    return { sx, sy, visible: sx > -50 && sx < this.W + 50 && sy > -50 && sy < this.H + 50, dist };
  }

  dispose() {
    this.disposeLevel();
    this.rtPath?.dispose(); this.rtPath = null;
    this.post?.dispose();
    this.actors.dispose();
    this.vm.dispose();
    removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.gl.dispose();
  }
}
