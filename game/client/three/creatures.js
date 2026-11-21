import * as THREE from 'three';
import { mulberry32 } from '../../../shared/utils.js';

/**
 * Level 1 (HABITABLE ZONE) 의 3D 배우와 사물 — three 기본 도형 + 캔버스 텍스처 (외부 파일 없음)
 *  - 스마일러: 공중에 뜬 새까만 덩어리, 어둠 속에서 빛나는 눈과 이빨 (얼굴은 늘 카메라를 본다)
 *  - 스킨 스틸러(정체): 창백하고 깡마른 몸, 몸통을 세로로 가르는 이빨 입, 긴 팔과 갈고리 손톱, 훔친 방호복 넝마
 *    (위장 중에는 actors.js 가 플레이어와 같은 방호복으로 그린다 — 방독면 유리만 살짝 붉다)
 *  - 퍼즐 단말기: 회색 철제 키오스크, 양쪽 화면이 초록으로 빛난다
 * 모양은 2D 픽셀 아트(sprites.js drawSmilerBody / drawSmilerFace / drawStealerArt / drawTerminal)를 따른다.
 * userData.final = true: Blender 모델로 바꿔 끼울 대상이 아니다 (actors.js 가 계속 다시 만들지 않게)
 */

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

// ---------------------------------------------------------------- 스마일러
/** 얼굴 텍스처: 2D drawSmilerFace 를 크게 다시 그린다 (투명 바탕). chase 면 눈을 부릅뜨고 입을 더 벌린다 */
function smilerFaceTex(chase) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), k = S / 48;
  for (const ex of [15, 33]) {                                         // 눈
    g.fillStyle = '#f5f2e6'; g.beginPath(); g.ellipse(ex * k, 15 * k, 4.5 * k, (chase ? 3 : 2.4) * k, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(ex * k, 15 * k, 0.9 * k, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#a62b2b'; g.lineWidth = 0.35 * k;
    g.beginPath(); g.moveTo((ex - 4) * k, 15 * k); g.lineTo((ex - 2) * k, 15.3 * k); g.moveTo((ex + 4) * k, 14.5 * k); g.lineTo((ex + 2.4) * k, 14.8 * k); g.stroke();
  }
  // 입: 귀까지 찢어진 웃음, 위아래 이빨
  const top = x => { const u = (x - 24) / 20; return 21 + 4 * (1 - u * u); };
  const bot = x => { const u = (x - 24) / 20; return top(x) + 1 + (chase ? 9 : 7) * Math.pow(Math.max(0, 1 - u * u), 0.8); };
  g.fillStyle = '#1c0303'; g.beginPath();
  for (let x = 4; x <= 44; x += 0.5) g.lineTo(x * k, top(x) * k);
  for (let x = 44; x >= 4; x -= 0.5) g.lineTo(x * k, bot(x) * k);
  g.closePath(); g.fill();
  g.strokeStyle = '#6a1212'; g.lineWidth = 0.6 * k; g.stroke();
  g.fillStyle = '#f3edda';
  for (let x = 6; x <= 42; x += 2) {
    const L = (x % 4 === 0 ? 3 : 2) * k * 0.8, w = 1.4 * k, t = top(x) * k, b = bot(x) * k;
    if (b - t < 2.5 * k) continue;
    g.beginPath(); g.moveTo(x * k - w / 2, t); g.lineTo(x * k + w / 2, t); g.lineTo(x * k, t + L); g.fill();
    g.beginPath(); g.moveTo(x * k - w / 2, b); g.lineTo(x * k + w / 2, b); g.lineTo(x * k, b - L); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 은은한 빛무리 (얼굴 뒤, 더하기 합성) */
function glowTex() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,240,0.55)'); gr.addColorStop(1, 'rgba(255,255,240,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/** 스마일러: 눈높이쯤(1.7m)에 떠 있다. 몸은 빛을 거의 받지 않는 검정, 얼굴은 스스로 빛난다 */
export function makeSmiler(seed = 1) {
  const rng = mulberry32(seed >>> 0 || 1);
  const g = new THREE.Group(), float = new THREE.Group();
  float.position.y = 1.7;
  // 몸: 울퉁불퉁한 덩어리
  const bodyGeo = new THREE.IcosahedronGeometry(0.42, 3), pos = bodyGeo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1 + Math.sin(v.x * 9 + seed) * 0.06 + Math.cos(v.y * 11) * 0.06 + (rng() - 0.5) * 0.05;
    v.multiplyScalar(n); v.y *= 0.85; pos.setXYZ(i, v.x, v.y, v.z);
  }
  bodyGeo.computeVertexNormals();
  const bodyMat = lambert(0x050505);
  float.add(new THREE.Mesh(bodyGeo, bodyMat));
  // 흘러내리는 촉수 8가닥
  const tGeo = new THREE.ConeGeometry(0.035, 0.6, 5); tGeo.translate(0, -0.3, 0); tGeo.rotateX(Math.PI);
  const tendrils = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rng() * 0.4, t = new THREE.Mesh(tGeo, bodyMat);
    t.position.set(Math.cos(a) * 0.24, -0.22, Math.sin(a) * 0.24);
    t.scale.y = 0.6 + rng() * 0.9; t.rotation.z = Math.PI;
    t.userData.ph = rng() * 6;
    float.add(t); tendrils.push(t);
  }
  // 얼굴 (늘 카메라를 본다): 빛을 받지 않고 안개도 덜 먹어서 어둠 너머로 보인다
  const faces = { calm: smilerFaceTex(false), chase: smilerFaceTex(true) };
  const faceMat = new THREE.MeshBasicMaterial({ map: faces.calm, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), faceMat);
  face.renderOrder = 2; face.userData.keepEmissive = true;
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.5 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), glowMat);
  glow.renderOrder = 1; glow.userData.keepEmissive = true;
  const faceRig = new THREE.Group(); faceRig.add(glow, face); face.position.z = 0.02;
  float.add(faceRig);
  g.add(float);
  g.userData = { kind: 'smiler', final: true, height: 2.0, float, faceRig, faceMat, faces, glowMat, tendrils, ownTex: [faces.calm, faces.chase, glowMat.map] };
  return g;
}

// ---------------------------------------------------------------- 스킨 스틸러 (정체)
/** 팔다리 하나: 회전축(어깨·엉덩이) 아래로 늘어진 캡슐 */
function limb(len, r, mat, x, y) {
  const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
  m.position.y = -len / 2 - r; pivot.add(m);
  pivot.userData.rest = 0;
  return { pivot, end: -len - r * 2 };
}

/** 정체를 드러낸 스킨 스틸러: 키 2.0m. 앞은 -z (다른 배우와 같다) */
export function makeStealer(seed = 1) {
  const rng = mulberry32((seed ^ 0x55) >>> 0 || 1);
  const g = new THREE.Group();
  const skin = lambert(0xd8bca9), shade = lambert(0xa8877a), mouth = lambert(0x2a0404), flesh = lambert(0x9b2b2b),
    teeth = lambert(0xefe5cf), rag = lambert(0xc3a443), claw = lambert(0x3a2a22);
  const torso = new THREE.Group(); torso.position.y = 1.05;
  // 몸통: 깡마르고 길다. 갈비뼈 자국
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.62, 4, 10), skin);
  chest.position.y = 0.42; chest.scale.set(1.05, 1, 0.7); torso.add(chest);
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.02), shade);
    rib.position.set(sx * 0.11, 0.58 - i * 0.06, -0.115); rib.rotation.z = sx * 0.25; torso.add(rib);
  }
  // 몸통을 가르는 세로 입 + 이빨
  const mouthMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.03), mouth);
  mouthMesh.position.set(0, 0.42, -0.12); torso.add(mouthMesh);
  for (const sx of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.64, 0.035), flesh);
    lip.position.set(sx * 0.062, 0.42, -0.12); torso.add(lip);
    for (let i = 0; i < 11; i++) {
      const y = 0.15 + i * 0.054, w = Math.sin(Math.PI * (i + 0.5) / 11);
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.035 + w * 0.025, 4), teeth);
      tooth.rotation.z = sx * Math.PI / 2; tooth.position.set(sx * (0.035 + w * 0.012), y, -0.135); torso.add(tooth);
    }
  }
  // 머리: 작고 길쭉, 눈만 빛난다
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
  head.position.set(0, 0.98, -0.02); head.scale.set(0.85, 1.25, 0.95); torso.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xb89a50, fog: false });
  for (const sx of [-0.045, 0.045]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), eyeMat); e.position.set(sx, 1.0, -0.13); torso.add(e); }
  // 훔친 방호복 넝마 (어깨·허리에 걸친 노란 조각)
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.12 + rng() * 0.12, 0.14 + rng() * 0.2, 0.02), rag);
    const a = rng() * Math.PI * 2, y = i < 3 ? 0.75 + rng() * 0.08 : 0.08 + rng() * 0.1;
    r.position.set(Math.cos(a) * 0.17, y, Math.sin(a) * 0.12); r.rotation.set(rng() - 0.5, a, rng() - 0.5); torso.add(r);
  }
  // 팔: 무릎까지 늘어지는 긴 팔 + 손톱 4개
  const armL = limb(0.78, 0.04, skin, -0.24, 0.78), armR = limb(0.78, 0.04, skin, 0.24, 0.78);
  for (const a of [armL, armR]) for (let k = 0; k < 4; k++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.11, 4), claw);
    c.position.set((k - 1.5) * 0.022, a.end - 0.05, -0.02); c.rotation.x = Math.PI + 0.3; a.pivot.add(c);
  }
  torso.add(armL.pivot, armR.pivot);
  const legL = limb(0.85, 0.055, skin, -0.09, 1.05), legR = limb(0.85, 0.055, shade, 0.09, 1.05);
  g.add(torso, legL.pivot, legR.pivot);
  torso.userData.baseLean = -0.12;                                     // 살짝 앞으로 숙인 자세
  torso.rotation.x = torso.userData.baseLean;
  g.userData = { kind: 'stealer', final: true, height: 2.0, torso, head, eyeMat, limbs: { armL: armL.pivot, armR: armR.pivot, legL: legL.pivot, legR: legR.pivot } };
  return g;
}

/** 위장한 스킨 스틸러: 방호복의 방독면 유리를 살짝 붉게 (2D 의 'mimic' 과 같은 단서) */
export function tintMimicVisor(obj) {
  obj.traverse(o => {
    if (!o.isMesh || !o.material?.name || !/visor|glass|lens/i.test(o.material.name)) return;
    if (!o.userData.ownMaterial) { o.material = o.material.clone(); o.userData.ownMaterial = true; }
    o.material.color.lerp(new THREE.Color(0x9a5048), 0.55);
  });
}

// ---------------------------------------------------------------- 스마일러 매 프레임
/** 떠다니기, 촉수 흔들기, 얼굴은 카메라 쪽으로, 쫓을 땐 입을 더 벌린다 */
export function animateSmiler(a, m, time, camera) {
  const U = a.userData, chase = m.state === 'chase';
  U.float.position.y = 1.7 + Math.sin(time * 3 + (m.x || 0) * 0.01) * 0.06;
  for (const t of U.tendrils) t.rotation.x = Math.sin(time * 2.2 + t.userData.ph) * 0.25;
  const want = chase ? U.faces.chase : U.faces.calm;
  if (U.faceMat.map !== want) { U.faceMat.map = want; U.faceMat.needsUpdate = true; }
  U.faceMat.opacity = chase ? 1 : 0.8 + Math.sin(time * 2) * 0.15;
  U.glowMat.opacity = chase ? 0.65 : 0.4;
  // 얼굴은 카메라를 본다 (부모의 yaw 를 되돌린 뒤 lookAt)
  const p = U.faceRig.getWorldPosition(new THREE.Vector3());
  U.faceRig.rotation.set(0, Math.atan2(camera.position.x - p.x, camera.position.z - p.z) - a.rotation.y, 0);
}

// ---------------------------------------------------------------- 퍼즐 단말기
function screenTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#041208'; g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#5aff8a'; g.font = 'bold 16px monospace'; g.textAlign = 'center';
  g.fillText('PUZZLE', 64, 24);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#2a8a4a' : '#5aff8a'; g.fillRect(22 + x * 22, 38 + y * 16, 16, 11); }
  for (let y = 0; y < 96; y += 3) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, 128, 1); }   // 주사선
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 퍼즐 단말기 키오스크: 높이 1.3m, 앞뒤 양쪽에 화면 */
export function makeTerminal() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.15, 0.4), lambert(0x55585a));
  body.position.y = 0.575;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.46), lambert(0x3a3c3e));
  top.position.y = 1.18;
  const tex = screenTex();
  const scrMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  g.add(body, top);
  for (const side of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), scrMat);
    s.position.set(0, 0.92, side * 0.201); if (side < 0) s.rotation.y = Math.PI;
    s.userData.keepEmissive = true; g.add(s);
  }
  g.userData = { final: true, ownTex: [tex] };
  return g;
}
