import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * 캠코더 느낌 후처리:
 *  low    : 그레인 + 비네트 (+ 정신력·야간 투시경·덜러 색)
 *  medium : + 형광등 블룸
 *  high   : + 색수차
 * 그레인 세기 = 0.06 + danger * 0.12. 정신력이 낮을수록 채도가 빠지고 가장자리가 어두워진다.
 * 야간 투시경은 초록 단색, 덜러 근처는 회색 (2D 오버레이 캔버스의 합성 모드로는 WebGL 화면을 물들일 수 없어서 여기서 한다)
 */
const CamShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.06 }, uVig: { value: 0.55 },
    uCA: { value: 0 }, uSat: { value: 1 }, uNV: { value: 0 }, uDull: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVig, uCA, uSat, uNV, uDull; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 37.0) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      vec3 c;
      if (uCA > 0.0) {
        vec2 o = d * uCA;
        c = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
      } else c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);                                   // 정신력: 채도 빠짐
      c = mix(c, vec3(l), uDull);                                   // 덜러: 회색
      if (uNV > 0.5) c = vec3(0.25, 1.0, 0.35) * (l * 1.6 + 0.03);  // 야간 투시경
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.0, 0.85)) * (1.0 + (1.0 - uSat) * 0.6));
      c *= mix(1.0, v, uVig);                                        // 비네트
      c += (hash(vUv * uRes) - 0.5) * uGrain;                        // 그레인
      c += sin(vUv.y * uRes.y * 1.6) * 0.008;                        // 아주 옅은 주사선
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class PostFx {
  constructor(gl, scene, camera, quality) {
    this.gl = gl; this.scene = scene; this.camera = camera; this.quality = quality;
    const size = gl.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(gl);
    this.composer.addPass(new RenderPass(scene, camera));
    if (quality !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.6, 0.5, 0.85);
      this.composer.addPass(this.bloom);
    }
    this.cam = new ShaderPass(CamShader);
    this.composer.addPass(this.cam);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y);
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.gl.getPixelRatio());
    this.composer.setSize(w, h);
    this.cam.uniforms.uRes.value.set(w * this.gl.getPixelRatio(), h * this.gl.getPixelRatio());
  }

  render(game, dt) {
    const u = this.cam.uniforms;
    u.uTime.value = (u.uTime.value + dt) % 100;
    u.uGrain.value = 0.06 + (game.danger || 0) * 0.12 + (game.deathT > 0 ? 0.2 : 0);
    u.uCA.value = this.quality === 'high' ? 0.006 + (game.sanityLevel || 0) * 0.01 : 0;
    u.uSat.value = 1 - (game.sanityLevel || 0) * 0.8;
    u.uNV.value = game.nightVisionT > 0 ? 1 : 0;
    u.uDull.value = Math.min(0.95, Math.max(game.dull || 0, game.dullFlash || 0));
    this.composer.render(dt);
  }

  dispose() {
    for (const p of this.composer.passes) p.dispose?.();
    this.composer.dispose?.();
  }
}
