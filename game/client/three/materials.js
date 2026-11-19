import * as THREE from 'three';
import { mulberry32 } from '../../../shared/utils.js';

/**
 * Level 0 재질: 캔버스로 만든 절차적 텍스처 (외부 파일 없음)
 *  - 벽지: 누런 바탕, 세로 줄무늬·잔무늬, 얼룩, 아래쪽 습기 자국
 *  - 카펫: 축축한 갈색 잔털 노이즈, 짙은 얼룩
 *  - 천장: 석고 천장 타일 격자·구멍
 * 모든 재질은 구워 둔 형광등 밝기(lightTex: 타일당 1텍셀)를 월드 xz 로 샘플해 자체 발광으로 더한다.
 */
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

function canvasTex(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** 벽지 (512px = 벽 한 칸 1.5m × 2.7m 를 감싼다: u 0..1 = 1.5m, v 0..1 = 2.7m) */
function wallpaper(rng) {
  return canvasTex(512, (g, S) => {
    g.fillStyle = rgb(214, 194, 112); g.fillRect(0, 0, S, S);
    // 세로 줄무늬 (넓은 띠 + 가는 선)
    for (let x = 0; x < S; x += 32) {
      g.fillStyle = rgb(198, 176, 92, 0.55); g.fillRect(x, 0, 12, S);
      g.fillStyle = rgb(180, 158, 80, 0.5); g.fillRect(x + 20, 0, 2, S);
    }
    // 잔무늬 (작은 마름모)
    g.fillStyle = rgb(190, 168, 88, 0.45);
    for (let y = 8; y < S; y += 24) for (let x = 26; x < S; x += 32) {
      g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 3, y); g.lineTo(x, y + 4); g.lineTo(x - 3, y); g.fill();
    }
    // 종이 결 노이즈
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rng() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.7; }
    g.putImageData(img, 0, 0);
    // 얼룩
    for (let k = 0; k < 7; k++) {
      const x = rng() * S, y = rng() * S, r = 12 + rng() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgb(140, 116, 56, 0.28)); gr.addColorStop(1, rgb(140, 116, 56, 0));
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 아래쪽 습기 자국 (v 가 아래 → 캔버스 아래쪽)
    const wet = g.createLinearGradient(0, S * 0.78, 0, S);
    wet.addColorStop(0, rgb(120, 98, 44, 0)); wet.addColorStop(1, rgb(110, 88, 40, 0.5));
    g.fillStyle = wet; g.fillRect(0, S * 0.78, S, S * 0.22);
    for (let k = 0; k < 14; k++) {             // 흘러내린 자국
      const x = rng() * S, len = 20 + rng() * 120;
      g.fillStyle = rgb(150, 126, 60, 0.25); g.fillRect(x, S - len, 2 + rng() * 3, len);
    }
  });
}

/** 카펫 (256px = 1.5m 한 칸) */
function carpet(rng) {
  return canvasTex(256, (g, S) => {
    g.fillStyle = rgb(170, 146, 84); g.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng() - 0.5) * 46;
      d[i] += n; d[i + 1] += n * 0.92; d[i + 2] += n * 0.6;
    }
    g.putImageData(img, 0, 0);
    for (let k = 0; k < 5; k++) {              // 축축한 얼룩
      const x = rng() * S, y = rng() * S, r = 10 + rng() * 34;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgb(96, 76, 36, 0.45)); gr.addColorStop(1, rgb(96, 76, 36, 0));
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

/** 석고 천장 타일 (256px = 1.5m: 0.75m 타일 2×2) */
function ceiling(rng) {
  return canvasTex(256, (g, S) => {
    g.fillStyle = rgb(196, 186, 150); g.fillRect(0, 0, S, S);
    g.fillStyle = rgb(160, 150, 118, 0.5);
    for (let k = 0; k < 900; k++) g.fillRect(rng() * S, rng() * S, 1.4, 1.4);   // 구멍 무늬
    g.fillStyle = rgb(120, 112, 86);
    for (const p of [0, S / 2]) { g.fillRect(p, 0, 3, S); g.fillRect(0, p, S, 3); }   // 격자 틀
    const gr = g.createRadialGradient(S * 0.7, S * 0.3, 0, S * 0.7, S * 0.3, 40);   // 물 얼룩
    gr.addColorStop(0, rgb(150, 126, 70, 0.35)); gr.addColorStop(1, rgb(150, 126, 70, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  });
}

/**
 * 구워 둔 밝기 곱하기: 월드 좌표(m) → 타일 → lightTex 샘플 → 확산색에 곱한다.
 * lightTex 는 타일당 1텍셀, R = 밝기(0..1). uMap = (1/(w*1.5), 1/(h*1.5))
 */
function bakeLight(mat, lightTex, map) {
  const uLight = { value: lightTex }, uMap = { value: new THREE.Vector2(1 / (map.w * 1.5), 1 / (map.h * 1.5)) };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uLight = uLight; sh.uniforms.uMap = uMap;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldL;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldL = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uLight;\nuniform vec2 uMap;\nvarying vec3 vWorldL;')
      // 형광등 밝기는 자체 발광으로 더한다 → 손전등·실시간 조명은 그 위에 그대로 더해진다 (어두운 구역에서도 손전등이 먹힌다)
      .replace('#include <emissive_fragment>', '#include <emissive_fragment>\n{ float L = texture2D(uLight, vWorldL.xz * uMap).r; totalEmissiveRadiance += diffuseColor.rgb * max(0.0, L * 1.05); }');
  };
  mat.customProgramCacheKey = () => 'bakeLight';
  return mat;
}

/** Level 0 재질 묶음 */
export function makeMaterials(quality, lightTex, level) {
  const rng = mulberry32((level.seed ^ 0x3d3d3d) >>> 0);
  const tex = { wall: wallpaper(rng), carpet: carpet(rng), ceiling: ceiling(rng) };
  const std = (map, rough) => bakeLight(new THREE.MeshLambertMaterial({ map }), lightTex, level.map);
  const m = {
    wall: std(tex.wall),
    carpet: std(tex.carpet),
    ceiling: std(tex.ceiling),
    baseboard: bakeLight(new THREE.MeshLambertMaterial({ color: 0x5a4422 }), lightTex, level.map),
    panel: new THREE.MeshBasicMaterial({ color: 0xfff6d8 }),        // 형광등 패널 (빛난다, 안개 영향 받음)
  };
  m.dispose = () => { for (const k of ['wall', 'carpet', 'ceiling', 'baseboard', 'panel']) m[k].dispose(); for (const t of Object.values(tex)) t.dispose(); };
  return m;
}

/** 구워 둔 형광등 밝기 텍스처 (타일당 1텍셀, 선형 보간). data 를 고치면 깜빡임이 된다 (lights.js) */
export function makeLightTexture(level) {
  const { w, h } = level.map, data = new Uint8Array(w * h * 4);
  const map = level.map, L = level.tileLight;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // 벽 칸은 이웃한 바닥 칸 중 가장 밝은 값 (벽 면은 칸 경계에서 샘플하므로, 안 그러면 벽이 반쯤 어두워진다)
    let v = L[y * w + x];
    if (map.isSolid(x, y)) { v = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!map.isSolid(x + dx, y + dy)) v = Math.max(v, L[(y + dy) * w + x + dx]); }
    const i = y * w + x;
    data[i * 4] = Math.round(Math.min(1, v) * 255); data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
