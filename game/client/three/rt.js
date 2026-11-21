import * as THREE from 'three';
import { RealtimeRaytracer } from 'three-realtime-rt';

/**
 * 품질 '울트라': three-realtime-rt 로 조명을 레이 트레이싱한다 (부드러운 그림자, 1회 반사 간접광, 손전등 빛줄기).
 *  - 화면에 보이는 모양은 three 가 그대로 그리고(G-buffer), 빛만 GPU BVH 로 추적한다
 *  - 벽·바닥·천장(정적)만 BVH 에 넣는다. 사람·괴물·사물은 빛을 받지만 그림자는 드리우지 않는다 (rtExclude)
 *  - 라이브러리는 마지막 그림을 화면(null 타깃)에 그린다. 그 위에 캠코더 후처리를 얹으려고
 *    render 동안만 setRenderTarget(null) 을 우리 타깃으로 돌린다 (라이브러리 안의 null 은 전부 "바인딩 풀기" 이거나 최종 출력)
 *  - 결과는 ACES 톤매핑 + 감마 2.2 가 끝난 LDR 이다 (post.js 가 다시 선형으로 풀어서 블룸·캠코더 효과를 건다)
 */
export class RTPath {
  /**
   * 쓸 수 있는가: WebGL2 + float 렌더 타깃 + 하드웨어 GPU, 그리고 Direct3D(ANGLE) 가 아닐 때.
   * 윈도우 크롬·엣지의 기본 백엔드(Direct3D 11)는 BVH 추적 셰이더를 HLSL 로 바꿔 컴파일하다가 몇 분이 지나도 끝나지 않는다
   * (RTX 4050 에서 8분 넘게 첫 프레임이 멈춤 — 같은 GPU 의 OpenGL 백엔드는 약 10초). 그래서 Direct3D 면 '높음'으로 그린다.
   * 반환: null = 쓸 수 있음, 아니면 이유 ('d3d' | 'unsupported')
   */
  static unavailable(gl) {
    if (!RealtimeRaytracer.isSupported(gl)) return 'unsupported';
    try {
      const c = gl.getContext(), d = c.getExtension('WEBGL_debug_renderer_info');
      const r = String(d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER));
      if (/Direct3D|D3D1[01]|D3D9/i.test(r)) return 'd3d';
    } catch { /* 모르면 시도한다 */ }
    return null;
  }

  constructor(gl, targetFps) {
    this.gl = gl;
    const db = gl.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new RealtimeRaytracer(gl, {
      preset: 'quality',
      gi: true,                    // 1회 반사 간접광 (누런 벽지 색이 바닥·천장에 번진다)
      restir: true,                // 형광등이 많아도 픽셀당 그림자 광선 1개
      maxLights: 128,
      adaptiveQuality: true,       // 프레임 한도(또는 모니터 주사율)에 맞춰 조명 해상도를 스스로 조절
      targetFps,
      renderScaleMin: 0.35,
      overscan: 0.05,
      fog: { enabled: true, color: new THREE.Color(0x1a1608), density: 0.11 },
      volumetric: { enabled: true, density: 0.02, maxDist: 16 },   // 먼지 낀 공기 속 손전등 빛줄기
    });
    this.target = new THREE.WebGLRenderTarget(db.x, db.y, { depthBuffer: false, type: THREE.UnsignedByteType });
    this.compiled = false;
  }

  get supported() { return this.rt.supported; }
  get texture() { return this.target.texture; }

  setTargetFps(fps) { this.rt.targetFps = fps; }

  /** 레벨을 지은 뒤 한 번. keep 아래의 메시만 BVH 에 들어간다 */
  compile(scene, keep) {
    const inKeep = new Set();
    keep.traverse(o => inKeep.add(o));
    scene.traverse(o => { if (o.isMesh && !inKeep.has(o)) o.userData.rtExclude = true; });
    this.rt.compileScene(scene);
    this.compiled = true;
    this.rt.resetAccumulation();
  }

  setSize() {
    const db = this.gl.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(db.x, db.y);
    this.target.setSize(db.x, db.y);
  }

  /** 안개(밀도·색)를 장면과 맞추고, 바뀐 조명을 올린 뒤 그린다. 결과는 this.texture */
  render(scene, camera, fogDensity) {
    const rt = this.rt, gl = this.gl;
    rt.fog.density = fogDensity;
    if (scene.fog) rt.fog.color.copy(scene.fog.color);
    rt.volumetric.density = Math.min(0.03, fogDensity * 0.18);
    rt.updateLights(scene);       // 바뀐 게 없으면 비교만 하고 끝난다
    const orig = gl.setRenderTarget, target = this.target;
    gl.setRenderTarget = function (t, ...rest) { return orig.call(this, t ?? target, ...rest); };
    try {
      gl.setRenderTarget(target);
      rt.render(scene, camera);   // 첫 프레임은 셰이더를 만드느라 몇 초 걸린다 (엔진이 그동안 쌓인 마우스 이동을 버린다)
    } finally {
      gl.setRenderTarget = orig;
      gl.setRenderTarget(null);
    }
  }

  /** 순간이동·장면 전환 뒤 지난 프레임 기록을 버린다 (잔상 방지) */
  reset() { this.rt.resetAccumulation(); }

  dispose() {
    this.rt.dispose();
    this.target.dispose();
  }
}
