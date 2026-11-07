import { TS } from '../../shared/config.js';
import { mulberry32 } from '../../shared/utils.js';

/**
 * 고해상도 픽셀아트 스프라이트 (실제 비율, 1픽셀 = 월드 1.5단위).
 * 이미지 파일 없이 코드로 픽셀을 찍는다: 직접 만든 래스터 함수(안티앨리어싱 없음)로 작은 캔버스에 그린 뒤
 * 1픽셀 외곽선을 자동으로 두르고, 프레임별로 캐시해서 확대 출력한다.
 */
export const ART = 1.5;
const FRAMES = 8;

// ================================================================ 래스터 도구 (픽셀 단위, AA 없음)
function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function px(g, x, y, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
function ellipse(g, cx, cy, rx, ry, c) {
  g.fillStyle = c;
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
    const t = (y - cy) / ry, hw = rx * Math.sqrt(Math.max(0, 1 - t * t));
    const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
    if (x1 >= x0) g.fillRect(x0, y, x1 - x0 + 1, 1);
  }
}
function line(g, x0, y0, x1, y1, c, w = 1) {
  g.fillStyle = c;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  const o = Math.floor(w / 2);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    g.fillRect(x - o, y - o, w, w);
  }
}
/** 굵기가 변하는 팔다리 (a→b, 시작 굵기 w0 → 끝 굵기 w1), 한쪽 면 음영 */
function limb(g, a, b, w0, w1, c, shade) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, w = w0 + (w1 - w0) * t;
    rect(g, x - w / 2, y - w / 2, w, w, c);
    if (shade) px(g, x + w / 2 - 1, y, shade);
  }
}
function poly(g, pts, c) {
  g.fillStyle = c;
  const ys = pts.map(p => p[1]), minY = Math.floor(Math.min(...ys)), maxY = Math.ceil(Math.max(...ys));
  for (let y = minY; y <= maxY; y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.round(xs[i]), x1 = Math.round(xs[i + 1]);
      if (x1 > x0) g.fillRect(x0, y, x1 - x0, 1);
    }
  }
}
/** 이미 그려진 픽셀 위에만 확률적으로 점을 찍어 때/녹/얼룩 질감 */
function speckle(g, x, y, w, h, c, density, rng) {
  const img = g.getImageData(0, 0, g.canvas.width, g.canvas.height).data, W = g.canvas.width;
  g.fillStyle = c;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    if (rng() > density) continue;
    const X = Math.round(x + xx), Y = Math.round(y + yy);
    if (img[(Y * W + X) * 4 + 3] === 0) continue;
    g.fillRect(X, Y, 1, 1);
  }
}

/** 투명 픽셀 중 불투명 픽셀과 맞닿은 곳에 외곽선 */
function outline(c, col = [14, 10, 6]) {
  const g = c.getContext('2d'), { width: w, height: h } = c;
  const img = g.getImageData(0, 0, w, h), d = img.data, src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (src[i]) { d[i * 4 + 3] = 255; continue; }
    if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (y > 0 && src[i - w]) || (y < h - 1 && src[i + w])) {
      d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const cache = new Map();
function build(key, w, h, draw, outlineCol) {
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d', { willReadFrequently: true }));
  if (outlineCol !== null) outline(c, outlineCol);
  cache.set(key, c);
  return c;
}

const snap = v => Math.round(v / ART) * ART;
/** 발밑(cx, footY) 기준 출력 */
function blit(g, spr, cx, footY, flip = false, alpha = 1) {
  const w = spr.width * ART, h = spr.height * ART, x = snap(cx - w / 2), y = snap(footY - h);
  const prev = g.globalAlpha;
  g.globalAlpha = prev * alpha;
  if (flip) { g.save(); g.translate(x + w, y); g.scale(-1, 1); g.drawImage(spr, 0, 0, w, h); g.restore(); }
  else g.drawImage(spr, x, y, w, h);
  g.globalAlpha = prev;
}
function shadow(g, x, y, rx, ry, alpha = 1) {
  g.fillStyle = `rgba(30,20,0,${0.32 * alpha})`;
  g.beginPath(); g.ellipse(snap(x), snap(y), rx, ry, 0, 0, Math.PI * 2); g.fill();
}

export function dirOf(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  if (Math.abs(c) > Math.abs(s) * 1.1) return c > 0 ? 'right' : 'left';
  return s > 0 ? 'down' : 'up';
}
const frameOf = (phase, moving) => (moving ? Math.floor(phase) % FRAMES : -1);
const cyc = f => (f < 0 ? 0 : Math.sin((f / FRAMES) * Math.PI * 2));

// ================================================================ 방랑자 / 플레이어 (방호복 + 방독면)
// 18x34 픽셀 (월드 27x51). 실제 사람 비율, 방호복 색 4종(기본/초록/파랑/빨강)
const SUIT_BASE = {
  default: { suit: '#e7b92e', hi: '#fbd965', sh: '#b48a1b', dk: '#7a5c10' },
  green:   { suit: '#5fae4e', hi: '#8fd27a', sh: '#3f7f33', dk: '#29531f' },
  blue:    { suit: '#3f7fd0', hi: '#7aaaee', sh: '#2c5a99', dk: '#1c3b66' },
  red:     { suit: '#c8423a', hi: '#e8796e', sh: '#8f2c26', dk: '#5c1b17' },
};
const GEAR = {
  tape: '#d2ccb2', glove: '#2b2824', boot: '#231f1b', sole: '#141210',
  mask: '#25241f', maskHi: '#4a473f', visor: '#6b9da2', visorHi: '#d6f1ea', filter: '#3b3a35', filterHi: '#67645b',
  tank: '#8c908a', tankHi: '#b9bdb6', tankSh: '#5e625c', light: '#f4ecc0',
};
/** 색을 회갈색 쪽으로 바래게 (방랑자: 오래 헤맨 사람) */
function fade(hex, k = 0.45) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = [120, 108, 84];
  const m = (v, i) => Math.round(v + (t[i] - v) * k);
  return `rgb(${m(r, 0)},${m(g, 1)},${m(b, 2)})`;
}
function suitPalette(color, variant) {
  const base = SUIT_BASE[color] || SUIT_BASE.default;
  if (variant === 'wanderer') {
    return { ...GEAR, suit: fade(base.suit), hi: fade(base.hi), sh: fade(base.sh), dk: fade(base.dk, 0.3),
      tape: '#9e9884', visor: '#3c4c4d', visorHi: '#788a86' };
  }
  if (variant === 'mimic') return { ...GEAR, ...base, visor: '#9a7a74', visorHi: '#ead1ca' };   // 미세하게 붉은 방독면 유리
  return { ...GEAR, ...base };
}

function drawHumanArt(g, view, f, P, variant, pose = null) {
  const s = cyc(f), lift = v => Math.round(Math.max(0, v) * 2);
  const hy = variant === 'wanderer' ? 1 : 0;   // 방랑자는 고개를 떨군 자세

  if (view === 'side') {
    const fx = 8 + Math.round(s * 2), bx = 8 - Math.round(s * 2);
    // 뒷다리
    rect(g, bx, 21, 3, 9 - lift(-s), P.sh); rect(g, bx, 28 - lift(-s), 3, 1, P.tape);
    rect(g, bx, 30 - lift(-s), 4, 2, P.boot); rect(g, bx, 32 - lift(-s), 4, 1, P.sole);
    // 산소통
    rect(g, 3, 12, 3, 8, P.tank); rect(g, 3, 12, 1, 8, P.tankHi); rect(g, 5, 12, 1, 8, P.tankSh); rect(g, 4, 11, 1, 1, P.tankSh);
    // 몸통
    rect(g, 6, 11, 7, 11, P.suit); rect(g, 11, 11, 2, 11, P.sh); rect(g, 6, 11, 1, 11, P.hi);
    rect(g, 6, 16, 7, 1, P.tape); rect(g, 6, 20, 7, 1, P.dk);
    px(g, 8, 13, P.sh); px(g, 9, 18, P.sh);
    // 앞다리
    rect(g, fx, 21, 3, 9 - lift(s), P.suit); rect(g, fx + 2, 21, 1, 9 - lift(s), P.sh);
    rect(g, fx, 28 - lift(s), 3, 1, P.tape);
    rect(g, fx, 30 - lift(s), 4, 2, P.boot); rect(g, fx, 32 - lift(s), 4, 1, P.sole);
    // 팔 + 손전등 (이모트 동작이면 그 자세)
    if (pose) { sidePoseArm(g, P, pose); }
    else {
      const hx = 10 + Math.round(-s * 2);
      limb(g, [9, 12], [hx, 19], 2, 2, P.suit, P.sh);
      rect(g, hx - 1, 19, 2, 1, P.tape); rect(g, hx - 1, 20, 2, 2, P.glove);
      rect(g, hx + 1, 19, 3, 2, '#1d1c1a'); px(g, hx + 4, 19, P.light);
    }
    // 머리 (후드 + 방독면)
    ellipse(g, 8, 5.5 + hy, 4, 5, P.suit); ellipse(g, 7, 3.5 + hy, 2, 2, P.hi); ellipse(g, 6, 8 + hy, 2, 2, P.sh);
    rect(g, 5, 10 + hy, 6, 1, P.dk);
    ellipse(g, 11, 6.5 + hy, 2.4, 3.4, P.mask); px(g, 10, 3 + hy, P.maskHi);
    rect(g, 10, 4 + hy, 3, 3, P.visor); px(g, 10, 4 + hy, P.visorHi); px(g, 11, 4 + hy, P.visorHi);
    if (variant === 'wanderer') px(g, 12, 6 + hy, P.visorHi);
    ellipse(g, 13, 8.5 + hy, 1.6, 1.4, P.filter); px(g, 13, 8 + hy, P.filterHi);
    return;
  }

  // ----- 다리
  const lL = lift(s), rL = lift(-s);
  rect(g, 6, 21, 3, 9 - lL, P.suit); rect(g, 6, 21, 1, 9 - lL, P.hi);
  rect(g, 10, 21, 3, 9 - rL, P.suit); rect(g, 12, 21, 1, 9 - rL, P.sh);
  rect(g, 6, 28 - lL, 3, 1, P.tape); rect(g, 10, 28 - rL, 3, 1, P.tape);
  rect(g, 5, 30 - lL, 4, 2, P.boot); rect(g, 10, 30 - rL, 4, 2, P.boot);
  rect(g, 5, 32 - lL, 4, 1, P.sole); rect(g, 10, 32 - rL, 4, 1, P.sole);
  // ----- 몸통
  rect(g, 4, 11, 10, 11, P.suit); rect(g, 5, 10, 8, 1, P.suit);
  rect(g, 12, 11, 2, 11, P.sh); rect(g, 4, 11, 1, 11, P.hi);
  px(g, 6, 13, P.sh); px(g, 11, 15, P.sh); px(g, 7, 18, P.sh);
  rect(g, 4, 20, 10, 2, P.dk); px(g, 9, 20, P.tape);
  if (view === 'up') {
    rect(g, 6, 11, 6, 8, P.tank); rect(g, 6, 11, 1, 8, P.tankHi); rect(g, 11, 11, 1, 8, P.tankSh);
    rect(g, 7, 10, 4, 1, P.tankSh); rect(g, 5, 11, 1, 9, P.dk); rect(g, 12, 11, 1, 9, P.dk);
    rect(g, 6, 15, 6, 1, P.tankSh);
  } else {
    rect(g, 9, 11, 1, 9, P.dk);          // 지퍼
    rect(g, 4, 16, 10, 1, P.tape);       // 반사 테이프
  }
  // ----- 팔
  const aL = Math.round(-s), aR = Math.round(s);
  rect(g, 2, 11, 2, 9, P.suit); rect(g, 2, 11, 1, 9, P.hi);
  rect(g, 2, 19 + aL, 2, 1, P.tape); rect(g, 2, 20 + aL, 2, 2, P.glove);
  if (pose && view === 'down') frontPoseArm(g, P, pose);
  else if (pose && view === 'up') backPoseArm(g, P, pose);
  else {
    rect(g, 14, 11, 2, 9, P.sh);
    rect(g, 14, 19 + aR, 2, 1, P.tape); rect(g, 14, 20 + aR, 2, 2, P.glove);
    if (view === 'down') { rect(g, 14, 22 + aR, 2, 3, '#1d1c1a'); px(g, 14, 25 + aR, P.light); }
  }
  // ----- 머리 (후드 + 방독면)
  ellipse(g, 9, 5.5 + hy, 4.5, 5, P.sh);
  ellipse(g, 8.6, 5.2 + hy, 4.1, 4.7, P.suit);
  ellipse(g, 7, 3 + hy, 2, 1.6, P.hi);
  rect(g, 5, 10 + hy, 8, 1, P.dk);
  if (view === 'up') { rect(g, 9, 1 + hy, 1, 8, P.sh); return; }   // 후드 봉제선
  ellipse(g, 9, 6.6 + hy, 3.4, 3.4, P.mask);
  rect(g, 6, 4 + hy, 6, 3, P.visor);
  px(g, 6, 4 + hy, P.visorHi); px(g, 7, 4 + hy, P.visorHi); px(g, 11, 6 + hy, P.visorHi);
  if (variant === 'wanderer') line(g, 7, 4 + hy, 10, 6 + hy, P.visorHi);     // 깨진 유리
  px(g, 4, 7 + hy, P.filter); px(g, 4, 8 + hy, P.filter); px(g, 14, 7 + hy, P.filter); px(g, 14, 8 + hy, P.filter);
  ellipse(g, 9, 9.3 + hy, 1.7, 1.2, P.filter); px(g, 8, 9 + hy, P.filterHi);
}

// ---------------------------------------------------------------- 이모트 자세 (오른팔)
/** 앞모습: finger = 팔을 머리 옆으로 번쩍 들고 손등을 보이며 가운뎃손가락 / point = 팔을 아래 앞으로 뻗어 검지로 가리킴 */
function frontPoseArm(g, P, pose) {
  if (pose === 'finger') {
    rect(g, 14, 10, 2, 3, P.sh);                                  // 어깨
    limb(g, [15, 11], [17, 4], 2, 2, P.suit, P.sh);               // 위로 든 팔
    rect(g, 16, 4, 3, 1, P.tape);                                 // 소매 테이프
    rect(g, 15, 0, 5, 4, P.glove); rect(g, 15, 0, 5, 1, '#57524a'); // 주먹 (손등)
    px(g, 16, 1, '#57524a'); px(g, 18, 1, '#57524a');            // 접은 손가락 마디
    rect(g, 17, -5, 1, 5, P.glove); px(g, 17, -5, '#6a655c');      // 가운뎃손가락
    return;
  }
  rect(g, 14, 11, 2, 3, P.sh);                                    // point: 아래 앞으로 곧게 뻗은 팔
  limb(g, [15, 12], [20, 18], 2, 2, P.suit, P.sh);
  rect(g, 19, 18, 2, 1, P.tape);
  rect(g, 19, 19, 3, 3, P.glove); px(g, 21, 19, '#57524a');       // 주먹
  px(g, 18, 20, P.glove);                                         // 엄지
  for (let k = 0; k < 4; k++) px(g, 22 + k, 22 + k, P.glove);     // 대각선으로 길게 뻗은 검지
  px(g, 25, 25, '#6a655c');
}
/** 뒷모습: finger = 팔을 들어 올린 뒷모습 (손바닥 쪽, 가운뎃손가락) / point = 팔을 위(앞)로 쭉 뻗어 가리킴 */
function backPoseArm(g, P, pose) {
  rect(g, 14, 10, 2, 3, P.sh);
  if (pose === 'finger') {
    limb(g, [15, 11], [17, 3], 2, 2, P.suit, P.sh);
    rect(g, 16, 3, 3, 1, P.tape);
    rect(g, 15, -1, 5, 4, P.glove);
    rect(g, 17, -6, 1, 5, P.glove); px(g, 17, -6, '#6a655c');
  } else {                                                         // 대각선 위(앞)로 쭉 뻗은 팔 + 엄지 + 검지
    limb(g, [15, 11], [20, 4], 2, 2, P.suit, P.sh);
    rect(g, 19, 4, 2, 1, P.tape);
    rect(g, 19, 1, 3, 3, P.glove); px(g, 18, 2, P.glove);           // 주먹 + 엄지
    for (let k = 0; k < 4; k++) px(g, 22 + k, 0 - k, P.glove);      // 대각선 위를 가리키는 검지
    px(g, 25, -3, '#6a655c');
  }
}
/** 옆모습 (오른쪽을 봄): finger = 팔을 앞으로 들어 손등 + 가운뎃손가락 / point = 팔을 앞으로 쭉 뻗어 검지 */
function sidePoseArm(g, P, pose) {
  if (pose === 'finger') {                                       // 팔을 앞으로 내밀어 들고 가운뎃손가락
    limb(g, [9, 12], [16, 7], 2, 2, P.suit, P.sh);
    rect(g, 15, 7, 2, 1, P.tape);
    rect(g, 15, 3, 4, 4, P.glove); px(g, 18, 4, '#57524a'); px(g, 18, 6, '#57524a');
    rect(g, 17, -2, 1, 5, P.glove); px(g, 17, -2, '#6a655c');
    return;
  }
  limb(g, [9, 12], [17, 12], 2, 2, P.suit, P.sh);                 // 수평으로 쭉 뻗은 팔
  rect(g, 16, 11, 1, 3, P.tape);
  rect(g, 17, 11, 3, 3, P.glove); px(g, 18, 10, P.glove);         // 주먹 + 엄지
  rect(g, 20, 11, 4, 1, P.glove); px(g, 23, 11, '#6a655c');       // 쭉 뻗은 검지
}

const HUMAN_W = 18, HUMAN_H = 34;
const POSE_X = 8, POSE_Y = 6, POSE_W = HUMAN_W + POSE_X * 2, POSE_H = HUMAN_H + POSE_Y;   // 자세 스프라이트는 팔이 나갈 여백이 있다
function posedSprite(dir, variant, color, pose) {
  const view = dir === 'left' || dir === 'right' ? 'side' : dir;
  return build(`hp:${variant}:${color}:${view}:${pose}`, POSE_W, POSE_H, g => {
    g.translate(POSE_X, POSE_Y);
    drawHumanArt(g, view, -1, suitPalette(color, variant), variant, pose);
  });
}
function humanSprite(dir, f, variant, color) {
  const view = dir === 'left' || dir === 'right' ? 'side' : dir;
  return build(`h:${variant}:${color}:${view}:${f}`, HUMAN_W, HUMAN_H, g => {
    drawHumanArt(g, view, f, suitPalette(color, variant), variant);
    if (variant === 'wanderer') speckle(g, 2, 9, 14, 24, 'rgba(70,52,20,0.9)', 0.07, mulberry32(91 + f));   // 때, 얼룩
  });
}

/** 사람 그리기. variant: player | wanderer | mimic(스킨 스틸러 위장), 색은 p.color */
export function drawHuman(g, p, variant = 'player', alpha = 1) {
  if (alpha <= 0.01) return;
  const color = SUIT_BASE[p.color] ? p.color : 'default';
  const dir = dirOf(p.angle);
  const f = frameOf((p.walkPhase ?? p.anim * 1.6) * 0.9, p.moving);
  shadow(g, p.x, p.y + 8, 10, 4, alpha);
  const spr = humanSprite(dir, f, variant, color);
  if (p.crouching) {   // 웅크리기: 키를 줄여서 낮게
    const w = spr.width * ART, h = Math.round(spr.height * 0.78) * ART, x = snap(p.x - w / 2), y = snap(p.y + 10 - h);
    const prev = g.globalAlpha; g.globalAlpha = prev * alpha;
    if (dir === 'left') { g.save(); g.translate(x + w, y); g.scale(-1, 1); g.drawImage(spr, 0, 0, w, h); g.restore(); }
    else g.drawImage(spr, x, y, w, h);
    g.globalAlpha = prev;
    return;
  }
  blit(g, spr, p.x, p.y + 10, dir === 'left', alpha);
}
export function drawPlayer(g, p, alpha = 1) { drawHuman(g, p, 'player', alpha); }

/** 메뉴/대기방 미리보기용: 지정 색의 방호복 스프라이트 캔버스 */
export function humanPreview(color, dir = 'down', f = -1) { return humanSprite(dir, f, 'player', color); }

// ================================================================ 하울러: 철사로 엮인 길쭉한 몸
const HW = { wire: '#2d2d2a', hi: '#78756c', dk: '#121210', eye: '#efe7cc', mouth: '#300505', teeth: '#e3d8bf', blood: '#5c0c0c', tip: '#b8b2a2' };
function drawHowlerArt(g, f, chase) {
  const s = cyc(f), rng = mulberry32(777);
  const J = {
    head: [22, 13], neck: [22, 23], pelvis: [22, 47],
    lSh: [12, 26], rSh: [32, 26],
    lEl: chase ? [6, 30] : [7, 41 + s * 2], rEl: chase ? [38, 30] : [37, 41 - s * 2],
    lHa: chase ? [3, 20] : [5 + s, 57 + s * 2], rHa: chase ? [41, 20] : [39 - s, 57 - s * 2],
    lHip: [18, 48], rHip: [26, 48],
    lKn: [14 + s * 3, 62], rKn: [30 - s * 3, 62],
    lFt: [12 + s * 5, 79 - Math.max(0, s) * 3], rFt: [32 - s * 5, 79 - Math.max(0, -s) * 3],
  };
  const strands = (a, b, n, spread) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    for (let k = 0; k < n; k++) {
      const o1 = (rng() - 0.5) * spread, o2 = (rng() - 0.5) * spread * 1.8, o3 = (rng() - 0.5) * spread;
      const m = [(a[0] + b[0]) / 2 + nx * o2, (a[1] + b[1]) / 2 + ny * o2];
      const c = k === 0 ? HW.hi : k === n - 1 ? HW.dk : HW.wire;
      line(g, a[0] + nx * o1, a[1] + ny * o1, m[0], m[1], c);
      line(g, m[0], m[1], b[0] + nx * o3, b[1] + ny * o3, c);
    }
  };
  const coil = (p, r) => { for (let t = 0; t < 12; t++) { const a = (t / 12) * Math.PI * 2; px(g, p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r * 0.8, t % 3 ? HW.wire : HW.hi); } };
  const claws = (h, dir) => { for (let k = -1; k <= 1; k++) { const ex = h[0] + k * 2 + dir, ey = h[1] + (chase ? -6 : 9); line(g, h[0], h[1], ex, ey, HW.wire); px(g, ex, ey, HW.tip); } };

  strands(J.lHip, J.lKn, 3, 2.5); strands(J.lKn, J.lFt, 3, 2);
  strands(J.rHip, J.rKn, 3, 2.5); strands(J.rKn, J.rFt, 3, 2);
  for (const ft of [J.lFt, J.rFt]) for (let k = -1; k <= 1; k++) line(g, ft[0], ft[1], ft[0] + k * 3, ft[1] + 1, HW.wire);
  strands(J.pelvis, J.neck, 5, 4);
  for (let i = 0; i < 7; i++) {                          // 갈비뼈처럼 휜 철사
    const y = 28 + i * 2.6, hw = 9 - i * 0.9;
    line(g, 22, y, 22 - hw, y + 1.5, HW.wire); line(g, 22 - hw, y + 1.5, 22 - hw + 1.5, y + 3.5, HW.dk);
    line(g, 22, y, 22 + hw, y + 1.5, i % 2 ? HW.wire : HW.hi); line(g, 22 + hw, y + 1.5, 22 + hw - 1.5, y + 3.5, HW.dk);
  }
  strands(J.lSh, J.rSh, 3, 2); strands(J.lHip, J.rHip, 2, 2);
  strands(J.lSh, J.lEl, 3, 2.5); strands(J.lEl, J.lHa, 3, 2);
  strands(J.rSh, J.rEl, 3, 2.5); strands(J.rEl, J.rHa, 3, 2);
  claws(J.lHa, -1); claws(J.rHa, 1);
  for (const p of [J.lEl, J.rEl, J.lKn, J.rKn, J.lSh, J.rSh]) coil(p, 2);
  for (let k = 0; k < 14; k++) {                        // 삐져나온 철사 가닥
    const t = rng(), b = [J.pelvis[0] + (J.neck[0] - J.pelvis[0]) * t, J.pelvis[1] + (J.neck[1] - J.pelvis[1]) * t];
    const a = rng() * Math.PI * 2, L = 2 + rng() * 4;
    line(g, b[0], b[1], b[0] + Math.cos(a) * L, b[1] + Math.sin(a) * L, rng() < 0.3 ? HW.hi : HW.wire);
  }
  // 머리: 철사로 감긴 해골
  ellipse(g, 22, 13, 7, 9, HW.dk);
  for (let t = 0; t < 26; t++) { const a = (t / 26) * Math.PI * 2; px(g, 22 + Math.cos(a) * 7, 13 + Math.sin(a) * 9, t % 4 ? HW.wire : HW.hi); }
  for (let k = 0; k < 5; k++) line(g, 16 + rng() * 3, 6 + k * 3, 26 + rng() * 3, 7 + k * 3 + rng() * 2, HW.wire);
  ellipse(g, 19, 10, 1.8, 1.4, '#050505'); ellipse(g, 25, 10, 1.8, 1.4, '#050505');
  px(g, 19, 10, HW.eye); px(g, 25, 10, HW.eye);
  const mh = chase ? 6 : 3;
  ellipse(g, 22, 16 + mh / 2, 3.5, mh, HW.mouth);
  for (let x = 19; x <= 25; x++) {
    if (x % 2 === 0) { px(g, x, 16 - mh / 2 + 1, HW.teeth); if (chase) px(g, x, 16 - mh / 2 + 2, HW.teeth); }
    else px(g, x, 16 + mh * 1.5 - 1, HW.teeth);
  }
  if (chase) { px(g, 22, 25, HW.blood); px(g, 21, 26, HW.blood); px(g, 22, 28, HW.blood); }
}

// ================================================================ 스마일러: 안개 같은 몸 + 찢어진 미소
const SM = { body: '#050505', body2: '#0c0b0a', eye: '#f5f2e6', eyeSh: '#c9c2ad', pupil: '#000000', vein: '#a62b2b', teeth: '#f3edda', teethSh: '#c8bfa7', gum: '#6a1212', mouth: '#1c0303' };
function drawSmilerBody(g, f) {
  const rng = mulberry32(31 + f);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const dx = (x - 24) / 19, dy = (y - 20) / 16, r = Math.hypot(dx, dy);
    const n = Math.sin(x * 0.7 + f * 0.8) * 0.06 + Math.cos(y * 0.9 - f) * 0.06 + (rng() - 0.5) * 0.1;
    if (r < 1 + n) px(g, x, y, (x + y) % 2 ? SM.body : SM.body2);
  }
  for (let k = 0; k < 8; k++) {                          // 흘러내리는 촉수
    let x = 8 + k * 4.5 + rng() * 2, y = 30;
    const L = 6 + rng() * 10;
    for (let i = 0; i < L && y < 48; i++) { px(g, x, y, SM.body); if (i < L * 0.5) px(g, x + 1, y, SM.body2); x += Math.sin(i * 0.8 + k + f) * 0.6; y++; }
  }
}
function drawSmilerFace(g, chase) {
  for (const ex of [15, 33]) {
    ellipse(g, ex, 15, 4.5, chase ? 3 : 2.4, SM.eye);
    rect(g, ex - 3, 16 + (chase ? 1 : 0), 7, 1, SM.eyeSh);
    px(g, ex, 15, SM.pupil);
    px(g, ex - 3, 15, SM.vein); px(g, ex + 3, 14, SM.vein);
  }
  for (let x = 4; x <= 44; x++) {
    const u = (x - 24) / 20, top = Math.round(21 + 4 * (1 - u * u)), bot = Math.round(top + 1 + (chase ? 9 : 7) * Math.pow(1 - u * u, 0.8));
    if (bot > top) rect(g, x, top, 1, bot - top, SM.mouth);
    px(g, x, top, SM.gum); px(g, x, bot, SM.gum);
    if (x % 2 === 0 && bot - top > 2) {
      const L = 2 + (x % 4 === 0 ? 1 : 0);
      rect(g, x, top + 1, 1, Math.min(L, bot - top - 1), SM.teeth); px(g, x, top + L, SM.teethSh);
      rect(g, x, bot - L, 1, L, SM.teeth); px(g, x, bot - L, SM.teethSh);
    }
  }
  px(g, 3, 20, SM.gum); px(g, 45, 20, SM.gum); px(g, 2, 19, SM.gum); px(g, 46, 19, SM.gum);
}

// ================================================================ 스킨 스틸러: 정체 (찢어진 입이 몸통까지)
const SS = { skin: '#d8bca9', hi: '#efd8c6', sh: '#a8877a', dk: '#7a5a50', flesh: '#9b2b2b', mouth: '#2a0404', teeth: '#efe5cf',
  rag: '#c3a443', ragSh: '#8a7228', stitch: '#4a2a22', blood: '#6b0f0f', claw: '#3a2a22', clawTip: '#d8d0c0' };
function drawStealerArt(g, f) {
  const s = cyc(f), lift = v => Math.round(Math.max(0, v) * 3);
  const J = { hipL: [15, 46], hipR: [21, 46],
    knL: [14 + s * 2, 60], knR: [22 - s * 2, 60], ftL: [13 + s * 3, 74 - lift(s)], ftR: [23 - s * 3, 74 - lift(-s)],
    shL: [9, 21], shR: [27, 21], elL: [5, 38 + s], elR: [31, 38 - s], haL: [4, 54 - s], haR: [32, 54 + s] };
  const claws = (h, d) => { for (let k = 0; k < 4; k++) { const ex = h[0] + (k - 1.5) * 1.5 + d, ey = h[1] + 7 + (k % 2); line(g, h[0], h[1], ex, ey, SS.claw); px(g, ex, ey, SS.clawTip); } };
  // 뒤쪽 팔
  limb(g, J.shR, J.elR, 3, 3, SS.sh); limb(g, J.elR, J.haR, 3, 2, SS.sh); claws(J.haR, 1);
  // 다리
  limb(g, J.hipL, J.knL, 4, 3, SS.skin, SS.sh); limb(g, J.knL, J.ftL, 3, 3, SS.skin, SS.sh);
  limb(g, J.hipR, J.knR, 4, 3, SS.sh); limb(g, J.knR, J.ftR, 3, 3, SS.sh);
  ellipse(g, J.knL[0], J.knL[1], 2, 2, SS.hi); ellipse(g, J.knR[0], J.knR[1], 2, 2, SS.skin);
  rect(g, J.ftL[0] - 2, J.ftL[1], 5, 2, SS.dk); rect(g, J.ftR[0] - 2, J.ftR[1], 5, 2, SS.dk);
  // 몸통
  poly(g, [[10, 18], [26, 18], [25, 31], [22, 46], [14, 46], [11, 31]], SS.skin);
  poly(g, [[22, 18], [26, 18], [25, 31], [22, 46], [20, 46]], SS.sh);
  rect(g, 11, 18, 1, 12, SS.hi);
  for (let i = 0; i < 5; i++) { const y = 22 + i * 3; line(g, 11, y, 14, y + 1, SS.dk); line(g, 22, y + 1, 25, y, SS.dk); }
  // 몸통을 가르는 세로 입
  for (let y = 12; y <= 42; y++) {
    const hw = Math.round(1 + 3.5 * Math.sin((Math.PI * (y - 12)) / 30));
    rect(g, 18 - hw, y, hw * 2, 1, SS.mouth);
    px(g, 18 - hw - 1, y, SS.flesh); px(g, 18 + hw, y, SS.flesh);
    if (y % 2 === 0 && hw > 1) { px(g, 18 - hw, y, SS.teeth); px(g, 18 + hw - 1, y, SS.teeth); }
    if (y % 4 === 1 && hw > 2) { px(g, 18 - hw + 1, y, SS.teeth); px(g, 18 + hw - 2, y, SS.teeth); }
  }
  for (let y = 43; y < 50; y++) if (y % 2) px(g, 18 + ((y >> 1) % 2), y, SS.blood);
  for (let x = 11; x <= 25; x += 2) { px(g, x, 33, SS.stitch); px(g, x + 1, 32, SS.stitch); }       // 꿰맨 자국
  // 훔친 방호복 넝마
  poly(g, [[7, 18], [14, 18], [13, 26], [11, 24], [9, 29], [8, 24]], SS.rag);
  poly(g, [[22, 18], [28, 18], [27, 25], [25, 23], [24, 27]], SS.ragSh);
  poly(g, [[12, 43], [24, 43], [23, 50], [21, 47], [19, 52], [16, 47], [13, 51]], SS.rag);
  line(g, 13, 46, 23, 46, SS.ragSh);
  ellipse(g, 25, 45, 2.5, 2.5, '#25241f'); px(g, 25, 44, '#9a7a74');                                 // 허리에 매단 방독면
  // 앞쪽 팔 (무릎까지 늘어짐)
  limb(g, J.shL, J.elL, 3, 3, SS.skin, SS.sh); limb(g, J.elL, J.haL, 3, 2, SS.skin, SS.sh); claws(J.haL, -1);
  ellipse(g, J.elL[0], J.elL[1], 1.5, 1.5, SS.hi);
  // 머리: 길게 늘어난 얼굴
  ellipse(g, 18, 8, 5.5, 7.5, SS.skin); ellipse(g, 16, 5, 2.5, 3, SS.hi); ellipse(g, 21, 10, 2, 4, SS.sh);
  ellipse(g, 15.5, 7, 1.6, 1.3, '#160a08'); ellipse(g, 20.5, 7, 1.6, 1.3, '#160a08');
  px(g, 15, 7, '#f0e8d0'); px(g, 21, 7, '#f0e8d0');
  for (let x = 13; x <= 23; x += 2) px(g, x, 3, SS.stitch);
  line(g, 14, 2, 15, 1, '#2a1d18'); line(g, 19, 1, 21, 1, '#2a1d18');
}

// ================================================================ 하운드: 사람 머리의 개 (옆모습)
const HD = { skin: '#cdb3a1', hi: '#e6cfbd', sh: '#9c7e6e', dk: '#6e5246', hair: '#2a1f18', eye: '#f4efe2', pupil: '#0b0b0b', mouth: '#3a0c0c', teeth: '#eadfc9', drool: '#c8d4d0' };
function drawHoundArt(g, f, stunned) {
  const s = cyc(f), lift = v => Math.round(Math.max(0, v) * 3);
  line(g, 8, 15, 3, 21, HD.sh); line(g, 3, 21, 4, 28, HD.sh);                               // 쥐 같은 꼬리
  const leg = (hip, ph, far) => {
    const kn = [hip[0] + ph * 3, 26], ft = [hip[0] + ph * 5, 35 - lift(ph)];
    const c = far ? HD.sh : HD.skin;
    limb(g, hip, kn, 3, 2, c, far ? null : HD.sh); limb(g, kn, ft, 2, 2, c);
    rect(g, ft[0] - 1, ft[1], 4, 1, HD.dk);
  };
  leg([15, 19], -s, true); leg([38, 19], s, true);
  ellipse(g, 26, 17, 16, 6.5, HD.skin);
  ellipse(g, 27, 21, 11, 2.5, HD.sh);
  for (let x = 12; x <= 38; x += 3) { px(g, x, 10.5 + Math.sin(x) * 0.5, HD.dk); px(g, x + 1, 11, HD.hi); }   // 등뼈
  for (let x = 21; x <= 35; x += 3) line(g, x, 13, x - 1, 19, HD.sh);                                         // 갈비뼈
  px(g, 12, 12, HD.hi); px(g, 13, 11, HD.hi); px(g, 14, 12, HD.hi);
  leg([13, 20], s, false); leg([36, 20], -s, false);
  // 목 + 사람 머리
  limb(g, [38, 15], [46, 11], 5, 4, HD.skin, HD.sh);
  ellipse(g, 50, 10, 7, 8.5, HD.skin); ellipse(g, 48, 6, 3, 3, HD.hi); ellipse(g, 53, 13, 3, 4, HD.sh);
  px(g, 43, 9, HD.sh); px(g, 43, 10, HD.dk);                                                      // 귀
  for (let k = 0; k < 6; k++) line(g, 45 + k * 1.6, 2 + (k % 2), 46 + k * 1.6, 1, HD.hair);       // 듬성듬성한 머리카락
  // 움푹 꺼진 눈두덩 + 너무 크게 뜬 눈
  for (const ex of [46.5, 52.5]) {
    ellipse(g, ex, 8, 2.2, 2, HD.dk);
    ellipse(g, ex, 8, 1.5, stunned ? 0.8 : 1.3, HD.eye);
    px(g, ex + (stunned ? -1 : 0), 8, HD.pupil);
    px(g, ex - 1, 10, HD.dk); px(g, ex + 1, 10, HD.sh);
  }
  px(g, 49.5, 9, HD.sh); px(g, 49.5, 11, HD.sh); px(g, 49, 12, HD.dk); px(g, 50, 12, HD.dk);   // 코
  // 사람 이빨이 드러난 벌어진 입
  ellipse(g, 50, 15, 4, 2.5, HD.mouth);
  for (let x = 46; x <= 54; x++) { px(g, x, 13, HD.teeth); if (x % 2 === 0) px(g, x, 14, HD.teeth); if (x % 2) px(g, x, 17, HD.teeth); }
  px(g, 46, 15, '#5c0c0c'); px(g, 54, 16, '#5c0c0c');
  px(g, 52, 18, HD.drool); px(g, 52, 19, HD.drool); px(g, 48, 18, '#5c0c0c');
}

// ================================================================ 파티고어: 노란 몸, 문어 빨판 손, 붉은 풍선, 삐뚤게 그려진 미소
const PG = { body: '#f2d23c', hi: '#fff27e', sh: '#c9a722', dk: '#8f7414', ink: '#141008', sucker: '#e9a6a0', suckerDk: '#b86a66',
  balloon: '#d8312b', balloonHi: '#ff8a7a', balloonSh: '#8f1712', string: '#d8d4c8' };
function drawPartygoerArt(g, f, chase) {
  const s = cyc(f), lift = v => Math.round(Math.max(0, v) * 2);
  const bob = Math.round(Math.sin((f / FRAMES) * Math.PI * 2) * 1);
  // 풍선 (오른손 줄 끝)
  const bx = 25 + bob, by = 9;
  ellipse(g, bx, by, 6, 8, PG.balloon); ellipse(g, bx + 2, by + 3, 3.5, 4.5, PG.balloonSh); ellipse(g, bx - 1, by - 1, 4.5, 6, PG.balloon);
  px(g, bx - 3, by - 4, PG.balloonHi); px(g, bx - 3, by - 3, PG.balloonHi); px(g, bx - 2, by - 5, PG.balloonHi);
  rect(g, bx - 1, by + 8, 2, 1, PG.balloonSh);
  const hand = chase ? [27, 40] : [26, 47 + Math.round(s)];
  line(g, bx, by + 9, (bx + hand[0]) / 2 + 1, (by + 9 + hand[1]) / 2, PG.string);
  line(g, (bx + hand[0]) / 2 + 1, (by + 9 + hand[1]) / 2, hand[0], hand[1] - 2, PG.string);
  // 다리 (짧고 뭉툭)
  const lL = lift(s), rL = lift(-s);
  rect(g, 10, 58, 4, 15 - lL, PG.sh); rect(g, 10, 58, 1, 15 - lL, PG.body);
  rect(g, 17, 58, 4, 15 - rL, PG.body); rect(g, 20, 58, 1, 15 - rL, PG.sh);
  ellipse(g, 12, 73 - lL, 3, 1.6, PG.dk); ellipse(g, 19, 73 - rL, 3, 1.6, PG.dk);
  // 몸통: 길쭉하고 매끈한 노란 몸
  ellipse(g, 15.5, 42, 9, 17, PG.sh);
  ellipse(g, 15, 41.5, 8.3, 16.5, PG.body);
  ellipse(g, 12, 35, 3.5, 8, PG.hi);
  for (let y = 46; y < 56; y += 3) px(g, 19, y, PG.sh);
  // 팔: 길게 늘어져 끝이 문어 빨판 손
  const tentacleHand = (h, dir) => {
    ellipse(g, h[0], h[1], 2.6, 2.6, PG.body);
    for (let k = 0; k < 4; k++) {
      const a = (dir > 0 ? 0.3 : Math.PI - 0.3) + (k - 1.5) * 0.45 * dir;
      let x = h[0], y = h[1];
      for (let i = 0; i < 5; i++) {
        x += Math.cos(a + i * 0.35 * dir) * 1.1; y += Math.sin(a + i * 0.35 * dir) * 1.1 + 0.6;
        px(g, x, y, i < 4 ? PG.body : PG.sh);
        if (i === 2) px(g, x, y, PG.sucker);
      }
    }
    px(g, h[0] - 1, h[1], PG.sucker); px(g, h[0] + 1, h[1] + 1, PG.sucker); px(g, h[0], h[1] - 1, PG.suckerDk);
  };
  const lHand = chase ? [4, 40] : [5, 49 - Math.round(s)];
  limb(g, [8, 30], [6, 39], 3, 3, PG.body, PG.sh); limb(g, [6, 39], lHand, 3, 2, PG.body, PG.sh);
  limb(g, [23, 30], [25, 39], 3, 3, PG.sh); limb(g, [25, 39], hand, 3, 2, PG.sh);
  for (const p of [[6, 34], [6, 37], [25, 34]]) px(g, p[0], p[1], PG.sucker);   // 팔에도 빨판
  tentacleHand(lHand, -1); tentacleHand(hand, 1);
  // 머리 + 삐뚤게 그린 웃는 얼굴
  ellipse(g, 15.5, 18, 8, 8.5, PG.sh);
  ellipse(g, 15, 17.5, 7.5, 8, PG.body);
  ellipse(g, 12.5, 14, 3, 2.5, PG.hi);
  ellipse(g, 12, 16, 1.2, chase ? 2.2 : 1.8, PG.ink); ellipse(g, 18.5, 15.5, 1.2, chase ? 2.2 : 1.8, PG.ink);
  for (let x = 9; x <= 21; x++) {
    const u = (x - 15) / 6, y = Math.round(20 + 3.2 * (1 - u * u) - (x > 17 ? 0.6 : 0));
    px(g, x, y, PG.ink);
    if (chase && x > 10 && x < 20) px(g, x, y - 1, PG.ink);
  }
  px(g, 8, 19, PG.ink); px(g, 22, 18, PG.ink);
  if (chase) { px(g, 14, 24, PG.ink); px(g, 14, 25, PG.ink); }      // 흘러내린 잉크
}

// ================================================================ 파티 탁자 (Level Fun 의 숨을 곳)
function drawTableArt(g) {
  const red = '#d23a32', white = '#f1ece0', sh = '#8e231d', shW = '#c8c2b2', leg = '#5a4026';
  rect(g, 1, 3, 30, 4, white);                                  // 상판
  for (let x = 1; x < 31; x += 4) rect(g, x, 3, 2, 4, red);
  rect(g, 1, 7, 30, 14, red);                                   // 늘어진 체크무늬 식탁보
  for (let y = 7; y < 21; y += 4) for (let x = 1 + ((y / 4) % 2) * 2; x < 31; x += 4) rect(g, x, y, 2, 2, white);
  rect(g, 27, 7, 4, 14, sh); for (let y = 7; y < 21; y += 4) rect(g, 27, y, 2, 2, shW);
  for (let x = 2; x < 30; x += 3) px(g, x, 21, x % 2 ? sh : red);  // 식탁보 끝단
  rect(g, 3, 21, 2, 3, leg); rect(g, 27, 21, 2, 3, leg);
  // 위에 놓인 케이크 조각과 컵
  ellipse(g, 9, 2, 3, 1.5, '#f6e7c8'); rect(g, 7, 0, 4, 2, '#e06fb0'); px(g, 9, 0, '#ffd54a');
  rect(g, 21, 0, 3, 3, '#7fb8e8'); px(g, 21, 0, '#cfe6fa');
}

/** 도서관 책상 (Level END 의 숨을 곳) */
function drawDeskArt(g) {
  const wood = '#7a4e2c', hi = '#a06a3e', sh = '#4e3018', dk = '#2e1c0e';
  rect(g, 1, 4, 30, 4, hi); rect(g, 1, 8, 30, 2, wood); rect(g, 1, 10, 30, 1, sh);     // 상판
  rect(g, 2, 11, 4, 13, wood); rect(g, 5, 11, 1, 13, sh);                               // 다리
  rect(g, 26, 11, 4, 13, wood); rect(g, 29, 11, 1, 13, sh);
  rect(g, 6, 11, 20, 3, sh); rect(g, 14, 12, 4, 1, '#c8a060');                        // 서랍 + 손잡이
  // 위에 쌓인 책, 스탠드
  rect(g, 6, 0, 8, 2, '#7a2a28'); rect(g, 7, 2, 7, 2, '#2a4a6a'); rect(g, 22, 1, 2, 3, dk); rect(g, 20, 0, 6, 1, '#d8c890');
}

/** Level Fun 장식 풍선 (바닥에 묶여 둥실) */
export function drawBalloonDecor(g, d, t) {
  const bob = Math.sin(t * 1.6 + d.phase) * 2.5;
  const x = d.x, y = d.y - 30 + bob;
  g.strokeStyle = 'rgba(220,214,200,0.7)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(d.x, d.y); g.quadraticCurveTo(d.x + 4, d.y - 14, x, y + 9); g.stroke();
  const spr = build(`balloon:${d.color}`, 12, 16, gg => {
    ellipse(gg, 6, 7, 5, 6.5, d.color);
    ellipse(gg, 7.5, 9, 2.5, 3.5, 'rgba(0,0,0,0.25)');
    px(gg, 3, 3, 'rgba(255,255,255,0.8)'); px(gg, 3, 4, 'rgba(255,255,255,0.6)'); px(gg, 4, 2, 'rgba(255,255,255,0.6)');
    rect(gg, 5, 14, 2, 1, d.color);
  }, [40, 10, 10]);
  blit(g, spr, x, y + 12);
}

// ================================================================ 데스모스 암컷: 거대한 나방
const DM = { wing: '#7c6b52', wing2: '#5e5040', vein: '#3e3428', spot: '#cbb88a', spotDk: '#2a2118', body: '#4e4132', fuzz: '#8f7f62', eye: '#1a0f0a', eyeHi: '#d8502e', ant: '#a89574' };
function drawMothArt(g, f, folded) {
  const flap = folded ? 0 : Math.sin((f / FRAMES) * Math.PI * 2);
  const span = folded ? 14 : 22 + flap * 6, lift = folded ? 0 : flap * 4;
  const cx = 28, cy = 22;
  for (const side of [-1, 1]) {
    // 윗날개
    poly(g, [[cx, cy - 2], [cx + side * span, cy - 10 - lift], [cx + side * (span + 2), cy - 1 - lift], [cx + side * 6, cy + 4]], DM.wing);
    // 아랫날개
    poly(g, [[cx, cy + 2], [cx + side * (span - 6), cy + 6 - lift * 0.5], [cx + side * (span - 9), cy + 14 - lift * 0.3], [cx + side * 4, cy + 9]], DM.wing2);
    // 날개 맥 + 눈알 무늬
    line(g, cx, cy - 1, cx + side * (span - 2), cy - 8 - lift, DM.vein);
    line(g, cx + side * 3, cy + 2, cx + side * (span - 4), cy - 2 - lift, DM.vein);
    const ex = cx + side * span * 0.55, ey = cy - 4 - lift * 0.6;
    ellipse(g, ex, ey, 3.2, 2.6, DM.spotDk); ellipse(g, ex, ey, 2.2, 1.7, DM.spot); px(g, ex, ey, DM.spotDk);
    for (let k = 0; k < 5; k++) px(g, cx + side * (8 + k * 3), cy + 7 + (k % 2) - lift * 0.3, DM.fuzz);
  }
  // 털 많은 몸통
  ellipse(g, cx, cy + 4, 4, 10, DM.body);
  for (let y = cy - 4; y < cy + 13; y += 2) { px(g, cx - 3, y, DM.fuzz); px(g, cx + 3, y + 1, DM.fuzz); px(g, cx, y, DM.vein); }
  // 머리 + 붉게 반사되는 겹눈 + 깃털 더듬이
  ellipse(g, cx, cy - 7, 3.6, 3, DM.body);
  ellipse(g, cx - 2.5, cy - 7, 1.6, 1.8, DM.eye); ellipse(g, cx + 2.5, cy - 7, 1.6, 1.8, DM.eye);
  px(g, cx - 3, cy - 8, DM.eyeHi); px(g, cx + 2, cy - 8, DM.eyeHi);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const x = cx + side * (2 + i * 1.1), y = cy - 10 - i * 1.2;
      px(g, x, y, DM.ant);
      if (i > 1 && i % 2 === 0) { px(g, x + side, y + 1, DM.ant); px(g, x - side, y - 1, DM.ant); }
    }
  }
  // 다리
  for (let k = 0; k < 3; k++) for (const side of [-1, 1]) line(g, cx + side * 2, cy + 1 + k * 3, cx + side * 7, cy + 4 + k * 4, DM.vein);
}

// ================================================================ 광인: 붉은 살점으로 뒤덮인 인간형
const WR = { flesh: '#8e2a26', fleshHi: '#b8483e', fleshDk: '#5a1512', sinew: '#3e0d0b', bone: '#d9c8b0', eye: '#e8e0d0', drip: '#4a0a08' };
function drawWretchArt(g, f) {
  const s = cyc(f), lift = v => Math.round(Math.max(0, v) * 2);
  // 다리
  limb(g, [11, 38], [10 + s * 2, 49], 4, 3, WR.flesh, WR.fleshDk); limb(g, [10 + s * 2, 49], [9 + s * 3, 59 - lift(s)], 3, 3, WR.flesh, WR.fleshDk);
  limb(g, [17, 38], [18 - s * 2, 49], 4, 3, WR.fleshDk); limb(g, [18 - s * 2, 49], [19 - s * 3, 59 - lift(-s)], 3, 3, WR.fleshDk);
  // 구부정한 몸통
  poly(g, [[7, 16], [21, 15], [23, 26], [19, 39], [9, 39], [6, 27]], WR.flesh);
  poly(g, [[17, 15], [21, 15], [23, 26], [19, 39], [16, 39]], WR.fleshDk);
  for (let y = 18; y < 38; y += 3) { line(g, 8, y, 13, y + 2, WR.sinew); line(g, 15, y + 1, 21, y - 1, WR.sinew); }
  for (let y = 20; y < 34; y += 4) px(g, 14, y, WR.bone);       // 드러난 척추뼈
  px(g, 10, 22, WR.fleshHi); px(g, 9, 26, WR.fleshHi); px(g, 11, 30, WR.fleshHi);
  // 팔: 길고 축 늘어짐
  limb(g, [7, 18], [4, 30 - s], 3, 3, WR.flesh, WR.fleshDk); limb(g, [4, 30 - s], [3, 42 - s], 3, 2, WR.flesh, WR.fleshDk);
  limb(g, [21, 18], [24, 30 + s], 3, 3, WR.fleshDk); limb(g, [24, 30 + s], [25, 42 + s], 3, 2, WR.fleshDk);
  for (const h of [[3, 42 - s], [25, 42 + s]]) for (let k = -1; k <= 1; k++) line(g, h[0], h[1], h[0] + k, h[1] + 4, WR.sinew);
  // 앞으로 처진 머리: 눈은 하얗게 멀었고 이빨이 드러남
  ellipse(g, 14, 10, 6, 6.5, WR.flesh); ellipse(g, 12, 8, 2.5, 2, WR.fleshHi); ellipse(g, 17, 12, 2.5, 3, WR.fleshDk);
  ellipse(g, 11.5, 9, 1.4, 1.1, WR.eye); ellipse(g, 16.5, 9, 1.4, 1.1, WR.eye);
  rect(g, 11, 13, 7, 2, WR.sinew);
  for (let x = 11; x < 18; x++) px(g, x, x % 2 ? 13 : 14, WR.bone);
  px(g, 14, 16, WR.drip); px(g, 14, 17, WR.drip); px(g, 9, 40, WR.drip); px(g, 20, 41, WR.drip);
}

// ================================================================ 스크래처: 심하게 마른 긴 팔다리, 네발로 기어다님 (옆모습)
const SC = { skin: '#8d8a84', hi: '#b5b1a8', sh: '#5f5c57', dk: '#3a3835', eye: '#ff3a2a', eyeGlow: '#ff8a6a', mouth: '#1c0f0c', nail: '#d8d2c4' };
function drawScratcherArt(g, f) {
  const s = cyc(f), lift = v => Math.round(Math.max(0, v) * 3);
  const leg = (hip, ph, far) => {
    const kn = [hip[0] + ph * 4, hip[1] - 9], ft = [hip[0] + ph * 7, 33 - lift(ph)];   // 무릎이 등보다 높이 솟는 기괴한 자세
    const c = far ? SC.sh : SC.skin;
    line(g, hip[0], hip[1], kn[0], kn[1], c, 2); line(g, kn[0], kn[1], ft[0], ft[1], c, far ? 1 : 2);
    for (let k = 0; k < 3; k++) line(g, ft[0], ft[1], ft[0] + 2 + k, ft[1] + 1, SC.nail);    // 긴 손톱
  };
  leg([16, 18], -s, true); leg([40, 17], s, true);
  // 가늘고 긴 몸통 (갈비뼈가 비침)
  ellipse(g, 28, 17, 15, 3.6, SC.skin);
  ellipse(g, 29, 19, 11, 1.6, SC.sh);
  for (let x = 20; x <= 36; x += 3) line(g, x, 15, x - 1, 19, SC.sh);
  for (let x = 14; x <= 42; x += 3) px(g, x, 13.6, SC.dk);
  leg([14, 19], s, false); leg([38, 18], -s, false);
  // 앞으로 내민 머리
  limb(g, [42, 16], [48, 15], 3, 2, SC.skin, SC.sh);
  ellipse(g, 52, 15, 5, 4, SC.skin); ellipse(g, 51, 13.5, 2, 1.5, SC.hi);
  ellipse(g, 54, 14, 1.1, 1, SC.eye); ellipse(g, 51, 14.5, 1.1, 1, SC.eye);
  rect(g, 50, 17, 6, 1, SC.mouth); px(g, 51, 18, SC.nail); px(g, 53, 18, SC.nail); px(g, 55, 18, SC.nail);
  for (let k = 0; k < 4; k++) px(g, 48 + k * 2, 11 - (k % 2), SC.dk);    // 듬성한 머리털
}

// ================================================================ 아이템 아이콘 (월드 / 인벤토리 공용)
const ITEM_ART = {
  almondWater: g => {
    rect(g, 4, 0, 4, 2, '#f2f2ee'); rect(g, 4, 2, 4, 1, '#bdbdb6'); rect(g, 3, 3, 6, 2, '#c9e6ef');
    rect(g, 2, 5, 8, 12, '#a9d4e4'); rect(g, 2, 5, 1, 12, '#e4f5fa'); rect(g, 8, 5, 1, 12, '#7fb0c4');
    rect(g, 2, 9, 8, 4, '#efe4c8'); rect(g, 4, 10, 4, 1, '#b08a52'); rect(g, 4, 11, 3, 1, '#b08a52');
  },
  staminaDrink: g => {   // 에너지 드링크 캔
    rect(g, 3, 1, 6, 1, '#b8b8b0'); rect(g, 2, 2, 8, 1, '#d8d8d0');
    rect(g, 2, 3, 8, 14, '#2f8a3a'); rect(g, 2, 3, 1, 14, '#6fd07a'); rect(g, 9, 3, 1, 14, '#1c5a24');
    rect(g, 2, 7, 8, 5, '#111'); line(g, 7, 7, 4, 10, '#f4e23a', 1); line(g, 4, 10, 7, 10, '#f4e23a', 1); line(g, 7, 10, 4, 12, '#f4e23a', 1);
    rect(g, 2, 16, 8, 1, '#b8b8b0');
  },
  camera: g => {
    rect(g, 0, 5, 12, 9, '#2a2a28'); rect(g, 1, 6, 10, 1, '#4a4a46'); rect(g, 2, 3, 4, 2, '#2a2a28');
    ellipse(g, 6, 10, 3, 3, '#121212'); ellipse(g, 6, 10, 1.6, 1.6, '#4a6a8a'); px(g, 5, 9, '#c8e0f0');
    rect(g, 9, 6, 2, 2, '#f4f0d8');
  },
  bugSpray: g => {
    rect(g, 3, 0, 4, 2, '#d23a32'); rect(g, 6, 0, 3, 1, '#2a2a28'); rect(g, 3, 2, 5, 1, '#9a9a94');
    rect(g, 2, 3, 7, 13, '#e8c53a'); rect(g, 2, 3, 1, 13, '#fff07a'); rect(g, 8, 3, 1, 13, '#b8961c');
    rect(g, 2, 7, 7, 5, '#2a6a3a'); px(g, 4, 9, '#e8e0c8'); px(g, 5, 8, '#e8e0c8'); px(g, 6, 9, '#e8e0c8'); px(g, 5, 10, '#e8e0c8');
  },
  flare: g => {
    rect(g, 3, 4, 5, 12, '#c8322a'); rect(g, 3, 4, 1, 12, '#e86a5a'); rect(g, 7, 4, 1, 12, '#8a1e18');
    rect(g, 3, 2, 5, 2, '#f4f0d8'); rect(g, 4, 0, 3, 2, '#2a2a28'); rect(g, 3, 9, 5, 1, '#f4f0d8');
  },
  compass: g => {
    ellipse(g, 6, 8, 6, 6, '#b08a52'); ellipse(g, 6, 8, 4.6, 4.6, '#efe4c8');
    line(g, 6, 4, 6, 8, '#c8322a', 1); line(g, 6, 8, 6, 12, '#2a2a28', 1); px(g, 6, 8, '#2a2a28'); rect(g, 5, 1, 3, 1, '#b08a52');
  },
};
export function itemIcon(type) { return build(`icon:${type}`, 12, 18, g => (ITEM_ART[type] || ITEM_ART.almondWater)(g), [20, 18, 12]); }

/** 월드에 떨어진 아이템 */
export function drawItem(g, it, t, alpha = 1) {
  if (alpha <= 0.01) return;
  const bob = Math.round(Math.sin(t * 2.5 + it.id) * 2) * ART;
  const glow = { almondWater: '170,220,240', staminaDrink: '120,230,110', camera: '220,220,200', bugSpray: '230,210,90', flare: '240,110,90', compass: '230,200,140' }[it.type] || '220,220,200';
  const gr = g.createRadialGradient(it.x, it.y, 0, it.x, it.y, 22);
  gr.addColorStop(0, `rgba(${glow},${0.32 * alpha})`); gr.addColorStop(1, `rgba(${glow},0)`);
  g.fillStyle = gr; g.fillRect(it.x - 22, it.y - 22, 44, 44);
  blit(g, itemIcon(it.type), it.x, it.y + 10 + bob, false, alpha);
}

/** Level 5 장식: 형광등 주위를 맴도는 작은 나방 떼 (데스모스 수컷, 무해) */
export function drawMothSwarm(g, d, t) {
  g.fillStyle = 'rgba(60,50,38,0.9)';
  for (let k = 0; k < 6; k++) {
    const a = t * (1.6 + k * 0.3) + d.phase + k * 1.3, r = 10 + (k % 3) * 7;
    const x = d.x + Math.cos(a) * r, y = d.y + Math.sin(a * 1.3) * r * 0.6 - 6;
    const w = Math.abs(Math.sin(t * 20 + k)) * 2 + 1;
    g.fillRect(snap(x - w), snap(y), w * 2, ART);
  }
}

// ================================================================ 사물함
const LK = { body: '#6f7a6e', hi: '#96a394', sh: '#4c564b', dk: '#262b25', vent: '#1b1f1a', handle: '#c9ccc1', rust: '#7c4c2c' };
function drawLockerArt(g) {
  const rng = mulberry32(5);
  rect(g, 1, 1, 26, 52, LK.body);
  rect(g, 1, 1, 26, 3, LK.dk); rect(g, 2, 4, 2, 48, LK.hi); rect(g, 23, 4, 4, 48, LK.sh);
  rect(g, 4, 6, 18, 44, LK.body); rect(g, 4, 6, 18, 1, LK.sh); rect(g, 4, 49, 18, 1, LK.sh); rect(g, 21, 6, 1, 44, LK.sh);
  for (let i = 0; i < 4; i++) { rect(g, 7, 9 + i * 3, 12, 1, LK.vent); rect(g, 7, 10 + i * 3, 12, 1, LK.hi); }
  rect(g, 18, 26, 2, 6, LK.handle); px(g, 18, 26, '#ffffff');
  rect(g, 9, 40, 6, 3, LK.sh); px(g, 10, 41, LK.hi);                                    // 번호판
  speckle(g, 2, 38, 24, 14, LK.rust, 0.12, rng);
  speckle(g, 4, 6, 18, 30, LK.sh, 0.03, rng);
  rect(g, 2, 52, 3, 1, LK.dk); rect(g, 23, 52, 3, 1, LK.dk);
}

// ================================================================ 공개 그리기 함수
export function drawLocker(g, lk, time, shakeT = 0, alpha = 1, prop = 'locker') {
  if (alpha <= 0.01) return;
  const jx = shakeT > 0 ? Math.sin(time * 80) * 1.5 * Math.min(1, shakeT * 4) : 0;
  if (prop === 'table' || prop === 'desk') {
    shadow(g, lk.x, lk.y + 8, 26, 6, alpha);
    blit(g, build(prop, 32, 25, prop === 'desk' ? drawDeskArt : drawTableArt), lk.x + jx, lk.y + 14, false, alpha);
    return;
  }
  const spr = build('locker', 28, 54, drawLockerArt);
  shadow(g, lk.x, lk.y + 4, 22, 5, alpha);
  blit(g, spr, lk.x + jx, lk.y + 8, false, alpha);
}


// ================================================================ 창문들 (Level 4 / 188): 창틀 속 붉은 눈의 사람 그림자
const WN = { frame: '#9a9a90', frameSh: '#5a5a54', glass: '#1a2028', glassHi: '#4a5a6a', body: '#0a0a0c', eye: '#ff2a1a', shard: '#c8dce8' };
function drawWindowArt(g, broken) {
  rect(g, 0, 0, 30, 30, WN.frame); rect(g, 0, 28, 30, 2, WN.frameSh); rect(g, 2, 2, 26, 25, WN.glass);
  // 사람 그림자 (어깨 + 머리)
  ellipse(g, 15, 11, 5, 6, WN.body); poly(g, [[5, 27], [8, 18], [22, 18], [25, 27]], WN.body);
  px(g, 13, 10, WN.eye); px(g, 17, 10, WN.eye);
  if (broken) {
    for (const [x, y] of [[3, 4], [24, 6], [6, 22], [22, 20], [12, 3], [26, 16]]) poly(g, [[x, y], [x + 3, y + 1], [x + 1, y + 4]], WN.shard);
  } else {
    line(g, 4, 4, 9, 4, WN.glassHi); line(g, 4, 5, 6, 5, WN.glassHi);
    rect(g, 14, 2, 2, 25, WN.frame); rect(g, 2, 14, 26, 2, WN.frame);                 // 창살
  }
}
/** 창밖으로 뻗은 검은 팔 (창문 → 손) */
function drawWindowArms(g, m, alpha) {
  g.strokeStyle = `rgba(10,10,12,${alpha})`; g.lineWidth = 5; g.lineCap = 'round';
  for (const off of [-7, 7]) {
    g.beginPath(); g.moveTo(m.px + off, m.py - 18); g.quadraticCurveTo((m.px + m.x) / 2 + off, m.py - 4, m.x + off * 0.6, m.y - 6); g.stroke();
  }
}

// ================================================================ 동네 감시자 (Level 9): 가늘고 긴 다리 넷 위의 거대한 눈알
const NW = { eye: '#ece6d8', eyeSh: '#b8ae98', vein: '#b83a2a', iris: '#5a7a3a', pupil: '#050505', leg: '#3a3430', legHi: '#5a524a', knee: '#2a2420' };
function drawWatchArt(g, f, chase) {
  const s = cyc(f), lift = v => Math.round(Math.max(0, v) * 4);
  const legs = [[30, 40, 6 + s * 4, 104 - lift(s)], [30, 40, 54 - s * 4, 104 - lift(-s)], [30, 40, 18 - s * 3, 106 - lift(-s)], [30, 40, 42 + s * 3, 106 - lift(s)]];
  for (const [x0, y0, x1, y1] of legs) {
    const kx = (x0 + x1) / 2 + (x1 < x0 ? -10 : 10), ky = y0 + 18;
    limb(g, [x0, y0], [kx, ky], 3, 2, NW.leg, NW.legHi); limb(g, [kx, ky], [x1, y1], 2, 2, NW.leg, NW.legHi);
    rect(g, kx - 1, ky - 1, 3, 3, NW.knee);
  }
  ellipse(g, 30, 24, 18, 18, NW.eye); ellipse(g, 34, 28, 12, 12, NW.eyeSh); ellipse(g, 30, 24, 14, 14, NW.eye);
  for (const [a, b, c, d] of [[13, 20, 20, 22], [46, 18, 40, 22], [16, 32, 22, 28], [44, 34, 38, 30], [30, 7, 30, 12]]) line(g, a, b, c, d, NW.vein);
  const ix = chase ? 30 : 30 + s * 3;
  ellipse(g, ix, 26, 7, 7, NW.iris); ellipse(g, ix, 26, chase ? 2.5 : 3.5, chase ? 2.5 : 3.5, NW.pupil); px(g, ix - 2, 23, '#ffffff');
}

// ================================================================ 페이슬링 (Level 10): 얼굴이 없는 사람 + 전기톱
const FC = { skin: '#c8b8a4', skinSh: '#9a8a74', shirt: '#6a6a5a', shirtSh: '#4a4a3e', pants: '#3a3a40', saw: '#d8a020', sawSh: '#8a6010', blade: '#a8acb0', teeth: '#e8ecf0' };
function drawFacelingArt(g, f) {
  const s = cyc(f);
  limb(g, [12, 46], [11 + s * 3, 62], 4, 3, FC.pants); limb(g, [11 + s * 3, 62], [11 + s * 4, 78], 3, 3, FC.pants);
  limb(g, [19, 46], [20 - s * 3, 62], 4, 3, FC.pants); limb(g, [20 - s * 3, 62], [20 - s * 4, 78], 3, 3, FC.pants);
  poly(g, [[8, 20], [23, 20], [24, 47], [7, 47]], FC.shirt); poly(g, [[18, 20], [23, 20], [24, 47], [19, 47]], FC.shirtSh);
  limb(g, [8, 22], [6, 38], 3, 3, FC.shirt, FC.shirtSh);
  // 전기톱을 앞으로 든 팔
  limb(g, [23, 22], [28, 34], 3, 3, FC.shirtSh); rect(g, 26, 32, 8, 8, FC.saw); rect(g, 26, 38, 8, 2, FC.sawSh);
  rect(g, 33, 33, 14, 5, FC.blade); for (let x = 33; x < 47; x += 2) { px(g, x, 32, FC.teeth); px(g, x + 1, 38, FC.teeth); }
  // 이목구비가 없는 매끈한 얼굴
  ellipse(g, 15.5, 10, 6, 8, FC.skin); ellipse(g, 18.5, 12, 3, 5, FC.skinSh); rect(g, 14, 17, 4, 4, FC.skinSh);
  rect(g, 9, 2, 13, 3, '#2a2420');
}

// ================================================================ 클럼프 (Level 37): 손발이 잔뜩 붙은 살덩어리, 큰 입
const CL = { flesh: '#b89080', fleshSh: '#8a6050', fleshDk: '#5a3a30', mouth: '#1a0606', tooth: '#e8e0c8', nail: '#d8c8b0' };
function drawClumpArt(g, f) {
  const s = cyc(f);
  for (let k = 0; k < 6; k++) {                                       // 아래의 발들
    const x = 6 + k * 9, sw = (k % 2 ? s : -s) * 3;
    limb(g, [x, 38], [x + sw, 52], 4, 3, k % 2 ? CL.fleshSh : CL.flesh, CL.fleshDk);
  }
  ellipse(g, 30, 26, 26, 17, CL.flesh); ellipse(g, 38, 30, 14, 10, CL.fleshSh);
  ellipse(g, 16, 18, 8, 6, CL.flesh); ellipse(g, 44, 16, 9, 7, CL.flesh);                                      // 혹
  for (const [a, b, c, d] of [[8, 14, 0, 4 + s * 2], [20, 10, 16, 0], [40, 9, 46, 0], [52, 18, 60, 10 - s * 2], [54, 28, 60, 34]]) {   // 위로 뻗은 손
    limb(g, [a, b], [c, d], 3, 2, CL.flesh, CL.fleshSh);
    for (let k = -1; k <= 1; k++) px(g, c + k, d - 1, CL.nail);
  }
  // 큰 입
  ellipse(g, 30, 29, 13, 7, CL.mouth);
  for (let x = 19; x < 42; x += 3) { poly(g, [[x, 23], [x + 2, 23], [x + 1, 27]], CL.tooth); poly(g, [[x + 1, 35], [x + 3, 35], [x + 2, 31]], CL.tooth); }
}

// ================================================================ 애니메이션 (Level 94): 나무 인형. 밤엔 눈이 붉게 빛난다
const AN = { wood: '#b88a52', woodSh: '#8a6236', woodDk: '#5a3e20', joint: '#4a3018', eye: '#ff3a1a' };
function drawAnimationArt(g, f, hunt) {
  const s = hunt ? cyc(f) * 1.4 : 0;
  limb(g, [9, 40], [8 + s * 3, 52], 3, 3, AN.woodSh); limb(g, [8 + s * 3, 52], [8 + s * 4, 64], 3, 2, AN.woodSh);
  limb(g, [14, 40], [15 - s * 3, 52], 3, 3, AN.wood, AN.woodSh); limb(g, [15 - s * 3, 52], [15 - s * 4, 64], 3, 2, AN.wood, AN.woodSh);
  rect(g, 7 + s * 3, 51, 3, 3, AN.joint); rect(g, 13 - s * 3, 51, 3, 3, AN.joint);
  poly(g, [[6, 18], [17, 18], [16, 41], [7, 41]], AN.wood); poly(g, [[13, 18], [17, 18], [16, 41], [13, 41]], AN.woodSh);
  rect(g, 7, 28, 9, 2, AN.woodDk);
  limb(g, [6, 20], [3, 31 - s * 2], 2, 2, AN.wood, AN.woodSh); limb(g, [3, 31 - s * 2], [2, 42 - s * 2], 2, 2, AN.wood, AN.woodSh);
  limb(g, [17, 20], [20, 31 + s * 2], 2, 2, AN.woodSh); limb(g, [20, 31 + s * 2], [21, 42 + s * 2], 2, 2, AN.woodSh);
  rect(g, 10, 14, 3, 4, AN.joint);
  ellipse(g, 11.5, 8, 5.5, 6.5, AN.wood); ellipse(g, 13.5, 10, 2.5, 4, AN.woodSh);
  if (hunt) { px(g, 9, 7, AN.eye); px(g, 14, 7, AN.eye); rect(g, 9, 11, 6, 1, AN.woodDk); }
  else { px(g, 9, 7, AN.woodDk); px(g, 14, 7, AN.woodDk); }
}

// ================================================================ 애니메이션 킹 (Level 94): 왕관을 쓴 광대, 큰 망치
const AK = { face: '#f0ece0', faceSh: '#c8c0b0', nose: '#d8241a', suitA: '#c83a8a', suitB: '#3a8ac8', suitSh: '#2a2a50', crown: '#e8c53a', crownSh: '#a88a20', hammer: '#6a4a2a', head: '#8a8a90', eye: '#0a0a0a', grin: '#5a0a0a' };
function drawKingArt(g, f) {
  const s = cyc(f);
  limb(g, [13, 52], [12 + s * 3, 68], 4, 3, AK.suitA); limb(g, [12 + s * 3, 68], [12 + s * 4, 82], 3, 3, AK.suitA);
  limb(g, [21, 52], [22 - s * 3, 68], 4, 3, AK.suitB); limb(g, [22 - s * 3, 68], [22 - s * 4, 82], 3, 3, AK.suitB);
  rect(g, 8 + s * 4, 82, 8, 4, AK.nose); rect(g, 19 - s * 4, 82, 8, 4, AK.nose);
  poly(g, [[8, 24], [17, 24], [17, 54], [6, 54]], AK.suitA); poly(g, [[17, 24], [27, 24], [29, 54], [17, 54]], AK.suitB);
  for (let y = 30; y < 52; y += 8) { ellipse(g, 17, y, 1.5, 1.5, AK.crown); }
  poly(g, [[6, 22], [29, 22], [26, 27], [9, 27]], AK.face);                                 // 주름 칼라
  limb(g, [7, 26], [4, 42], 3, 3, AK.suitA);
  // 망치를 든 팔
  limb(g, [28, 26], [32, 38], 3, 3, AK.suitB); line(g, 32, 14, 32, 46, AK.hammer, 2); rect(g, 27, 8, 11, 7, AK.head); rect(g, 27, 8, 11, 1, '#b8b8c0');
  ellipse(g, 17.5, 13, 7, 8, AK.face); ellipse(g, 21, 15, 3, 5, AK.faceSh);
  ellipse(g, 14.5, 11, 1.6, 2.2, AK.eye); ellipse(g, 20.5, 11, 1.6, 2.2, AK.eye);
  ellipse(g, 17.5, 15, 2, 2, AK.nose);
  for (let x = 12; x < 24; x++) px(g, x, 19 - (x > 13 && x < 22 ? 1 : 0), AK.grin);
  poly(g, [[10, 6], [12, 0], [15, 4], [17.5, 0], [20, 4], [23, 0], [25, 6]], AK.crown); rect(g, 10, 5, 15, 2, AK.crownSh);
}

// ================================================================ 아라네아 멤브리 (Level 188): 사람 해골 머리의 거대한 거미
const AR = { body: '#2a2224', bodyHi: '#4a3e40', leg: '#1a1416', legHi: '#3a2e30', skull: '#e0d8c4', skullSh: '#a8a08c', socket: '#0a0606', eye: '#ff3a1a' };
function drawAraneaArt(g, f) {
  const s = cyc(f);
  for (let k = 0; k < 4; k++) {                                   // 다리 8개 (양쪽 4개씩, 번갈아 움직임)
    const ph = (k % 2 ? s : -s) * 4, y0 = 22 + k * 3;
    for (const side of [-1, 1]) {
      const x0 = 35 + side * 8, kx = 35 + side * (18 + k * 3), ky = 6 + k * 2 + ph * side, ex = 35 + side * (26 + k * 3), ey = 42 - ph * side;
      limb(g, [x0, y0], [kx, ky], 3, 2, AR.leg, AR.legHi); limb(g, [kx, ky], [ex, ey], 2, 1, AR.leg, AR.legHi);
    }
  }
  ellipse(g, 30, 26, 14, 10, AR.body); ellipse(g, 26, 22, 6, 4, AR.bodyHi);                  // 배
  ellipse(g, 44, 26, 9, 8, AR.body);                                                         // 머리가슴
  // 해골 머리
  ellipse(g, 54, 24, 8, 8, AR.skull); ellipse(g, 56, 27, 5, 5, AR.skullSh);
  ellipse(g, 51.5, 23, 2, 2.2, AR.socket); ellipse(g, 57, 23, 2, 2.2, AR.socket); px(g, 51, 23, AR.eye); px(g, 57, 23, AR.eye);
  rect(g, 50, 29, 9, 3, AR.skullSh); for (let x = 50; x < 59; x += 2) px(g, x, 30, AR.socket);
}

// ================================================================ 키티 (Level 974): 하얀 막대 인간, 고양이 귀, 크게 웃는 입
const KT = { line: '#f4f0ec', dark: '#0a0a0a', mouth: '#c8243a', ear: '#f4b0c0' };
function drawKittyArt(g, f, frozen) {
  const s = frozen ? 0 : cyc(f);
  line(g, 11, 26, 11, 44, KT.line, 2);                                                 // 몸
  line(g, 11, 44, 7 + s * 3, 60, KT.line, 2); line(g, 11, 44, 15 - s * 3, 60, KT.line, 2);
  line(g, 11, 30, 3, 40 + s * 2, KT.line, 2); line(g, 11, 30, 19, 40 - s * 2, KT.line, 2);
  ellipse(g, 11, 14, 9, 9, KT.line); ellipse(g, 11, 14, 7.5, 7.5, '#ffffff');
  poly(g, [[3, 9], [4, 0], [9, 6]], KT.line); poly(g, [[13, 6], [18, 0], [19, 9]], KT.line);
  px(g, 5, 4, KT.ear); px(g, 17, 4, KT.ear);
  ellipse(g, 7.5, 12, 1.5, 2.2, KT.dark); ellipse(g, 14.5, 12, 1.5, 2.2, KT.dark);
  for (let x = 5; x <= 17; x++) px(g, x, 17 + Math.round(Math.sin(((x - 5) / 12) * Math.PI) * 2), KT.mouth);
}

// ================================================================ 파티 푸퍼 (Level 52): 후드 망토, 슬픈 파란 가면 — 유일하게 도와주는 엔티티
const PP = { robe: '#2a2e48', robeHi: '#3e4466', robeDk: '#181a2c', mask: '#8ab8e8', maskSh: '#5a88c0', line: '#1a2a4a', tear: '#d8f0ff', boot: '#141414' };
function drawPooperArt(g, f) {
  const s = cyc(f);
  rect(g, 6 + s * 2, 48, 4, 4, PP.boot); rect(g, 13 - s * 2, 48, 4, 4, PP.boot);
  poly(g, [[6, 14], [17, 14], [21, 49], [2, 49]], PP.robe);                          // 긴 망토
  poly(g, [[13, 14], [17, 14], [21, 49], [14, 49]], PP.robeDk);
  line(g, 11, 22, 11, 47, PP.robeDk); line(g, 5, 30, 9, 46, PP.robeHi);
  limb(g, [6, 18], [4, 32 + s], 3, 3, PP.robe, PP.robeDk); limb(g, [17, 18], [19, 32 - s], 3, 3, PP.robeDk);
  poly(g, [[3, 10], [6, 1], [11, 0], [17, 1], [20, 10], [18, 17], [5, 17]], PP.robe);   // 후드
  poly(g, [[14, 1], [17, 1], [20, 10], [18, 17], [15, 17]], PP.robeDk);
  ellipse(g, 11.5, 10, 5, 5.5, PP.mask); ellipse(g, 13.5, 12, 2, 3, PP.maskSh);     // 슬픈 가면
  line(g, 8, 8, 10, 9, PP.line); line(g, 13, 9, 15, 8, PP.line);                    // 처진 눈썹 (눈)
  for (let x = 9; x <= 14; x++) px(g, x, 14 - (x > 9 && x < 14 ? 1 : 0), PP.line);  // 처진 입
  px(g, 9, 11, PP.tear); px(g, 9, 12, PP.tear);
}

// ================================================================ 하이드로리티스 플레그 (도감용): 초록 물속 세균
function drawPlagueArt(g, t) {
  ellipse(g, 24, 24, 22, 22, '#2a4a1a'); ellipse(g, 24, 24, 19, 19, '#3a6a24');
  const rng = mulberry32(7);
  for (let k = 0; k < 14; k++) {
    const x = 8 + rng() * 32, y = 8 + rng() * 32, r = 1.5 + rng() * 2.5;
    ellipse(g, x, y, r, r, k % 3 ? '#8ad050' : '#c8f080');
    for (let j = 0; j < 3; j++) px(g, x + Math.cos(j * 2 + k) * (r + 1), y + Math.sin(j * 2 + k) * (r + 1), '#5a9a30');
  }
}

export function drawMonster(g, m, time = 0, alpha = 1) {
  if (alpha <= 0.01) return;
  const f = frameOf((m.anim || 0) * 1.4, m.moving !== false);
  const ff = f < 0 ? 0 : f;
  const left = Math.cos(m.angle) < -0.2;
  switch (m.type) {
    case 'wanderer':
      drawHuman(g, { ...m, moving: m.state === 'wander' && m.moving }, 'wanderer', alpha);
      break;
    case 'skinStealer': {
      if (!m.revealed) { drawHuman(g, { ...m, moving: m.state !== 'speak' && m.moving }, 'mimic', alpha); break; }
      shadow(g, m.x, m.y + 10, 16, 6, alpha);
      const jx = m.state === 'chase' ? (Math.random() - 0.5) * ART * 2 : 0;
      blit(g, build(`ss:${ff}`, 36, 78, gg => drawStealerArt(gg, ff)), m.x + jx, m.y + 14, left, alpha);
      break;
    }
    case 'howler': {
      if (!m.active) break;
      const chase = m.state === 'chase';
      shadow(g, m.x, m.y + 10, 20, 7, alpha);
      const tw = chase ? (Math.random() - 0.5) * ART * 3 : Math.sin(time * 9) * ART * 0.5;
      blit(g, build(`hw:${ff}:${chase}`, 44, 82, gg => drawHowlerArt(gg, ff, chase)), m.x + tw, m.y + 14, left, alpha);
      break;
    }
    case 'hound': {
      const stunned = m.state === 'stunned';
      shadow(g, m.x, m.y + 8, 26, 7, alpha);
      const sh = stunned ? (Math.random() - 0.5) * ART * 2 : 0;
      blit(g, build(`hd:${ff}:${stunned}`, 60, 38, gg => drawHoundArt(gg, ff, stunned)), m.x + sh, m.y + 12, left, alpha);
      break;
    }
    case 'partygoer': {
      const chase = m.state === 'chase';
      shadow(g, m.x, m.y + 10, 16, 6, alpha);
      const frp = m.moving ? ff : Math.floor(time * 2) % FRAMES;   // 서 있어도 풍선은 흔들림
      blit(g, build(`pg:${frp}:${chase}`, 34, 76, gg => drawPartygoerArt(gg, frp, chase)), m.x, m.y + 13, left, alpha);
      break;
    }
    case 'deathmoth': {
      const folded = m.state === 'cling' || m.stunned;
      const fr = Math.floor(time * (folded ? 1 : 14)) % FRAMES;
      const hover = folded ? 0 : Math.sin(time * 5 + m.x) * ART * 2;
      if (!folded) shadow(g, m.x, m.y + 10, 20, 6, alpha * 0.7);
      g.save(); g.translate(snap(m.x), snap(m.y - (folded ? 6 : 22) + hover));
      if (folded) g.rotate(m.angle - Math.PI / 2);         // 벽에 붙어 날개를 접은 자세
      g.globalAlpha *= alpha;
      const spr = build(`dm:${fr}:${folded}`, 56, 40, gg => drawMothArt(gg, fr, folded));
      g.drawImage(spr, -28 * ART, -22 * ART, 56 * ART, 40 * ART);
      g.restore();
      break;
    }
    case 'wretch': {
      shadow(g, m.x, m.y + 9, 14, 5, alpha);
      const jx = m.state === 'investigate' ? (Math.random() - 0.5) * ART : 0;
      blit(g, build(`wr:${ff}`, 28, 62, gg => drawWretchArt(gg, ff)), m.x + jx, m.y + 12, left, alpha * (m.stunned ? 0.7 : 1));
      break;
    }
    case 'scratcher': {
      shadow(g, m.x, m.y + 8, 26, 6, alpha);
      blit(g, build(`sc:${ff}`, 60, 36, gg => drawScratcherArt(gg, ff)), m.x, m.y + 12, left, alpha);
      break;
    }
    case 'windows': {
      const wx = m.px ?? m.x, wy = (m.py ?? m.y);
      const broken = m.state === 'grab';
      blit(g, build(`wn:${broken}`, 30, 30, gg => drawWindowArt(gg, broken)), wx, wy - 12, false, alpha);
      if (broken) drawWindowArms(g, { ...m, px: wx, py: wy }, alpha);
      break;
    }
    case 'watch': {
      const chase = m.state === 'chase';
      shadow(g, m.x, m.y + 10, 30, 8, alpha);
      blit(g, build(`nw:${ff}:${chase}`, 60, 108, gg => drawWatchArt(gg, ff, chase)), m.x, m.y + 14, false, alpha);
      break;
    }
    case 'faceling': {
      shadow(g, m.x, m.y + 10, 14, 5, alpha);
      const jx = m.state === 'chase' ? (Math.random() - 0.5) * ART * 1.5 : 0;
      blit(g, build(`fc:${ff}`, 48, 80, gg => drawFacelingArt(gg, ff)), m.x + jx + (left ? -12 : 12), m.y + 14, left, alpha);
      break;
    }
    case 'clump': {
      shadow(g, m.x, m.y + 10, 28, 7, alpha);
      blit(g, build(`cl:${ff}`, 62, 54, gg => drawClumpArt(gg, ff)), m.x, m.y + 13, left, alpha);
      break;
    }
    case 'animation': {
      const hunt = m.state === 'hunt';
      shadow(g, m.x, m.y + 9, 11, 4, alpha);
      blit(g, build(`an:${hunt ? ff : 0}:${hunt}`, 24, 66, gg => drawAnimationArt(gg, ff, hunt)), m.x, m.y + 12, left, alpha);
      break;
    }
    case 'animatedKing': {
      if (m.state === 'vanished') break;
      shadow(g, m.x, m.y + 10, 15, 5, alpha);
      const kf = m.state === 'frozen' ? 0 : ff;
      blit(g, build(`ak:${kf}`, 40, 88, gg => drawKingArt(gg, kf)), m.x, m.y + 14, left, alpha);
      break;
    }
    case 'aranea': {
      shadow(g, m.x, m.y + 8, 32, 7, alpha);
      blit(g, build(`ar:${ff}`, 72, 46, gg => drawAraneaArt(gg, ff)), m.x, m.y + 12, left, alpha);
      break;
    }
    case 'partyPooper': {
      shadow(g, m.x, m.y + 9, 12, 4, alpha);
      const pf = m.moving ? ff : 0;
      blit(g, build(`pp:${pf}`, 23, 53, gg => drawPooperArt(gg, pf)), m.x, m.y + 12, left, alpha);
      break;
    }
    case 'kitty': {
      const frozen = m.state === 'frozen';
      shadow(g, m.x, m.y + 8, 10, 4, alpha);
      blit(g, build(`kt:${frozen ? 0 : ff}:${frozen}`, 23, 62, gg => drawKittyArt(gg, ff, frozen)), m.x, m.y + 12, left, alpha);
      break;
    }
    case 'smiler': {
      if (m.state === 'vanished') break;
      const fr = Math.floor(time * 4) % FRAMES, fl = Math.sin(time * 3 + m.x) * ART;
      blit(g, build(`sm:b:${fr}`, 48, 48, gg => drawSmilerBody(gg, fr), null), m.x, m.y + 22 + fl, false, alpha * 0.92);
      break;
    }
  }
}

/** 어둠 레이어 위: 스마일러의 미소, 스크래처의 붉은 안광 */
export function drawMonsterGlow(g, m, time, alpha = 1) {
  if (alpha <= 0.01) return;
  if (m.type === 'scratcher') {
    const left = Math.cos(m.angle) < -0.2, ex = m.x + (left ? -1 : 1) * 23 * ART, ey = m.y + 12 - 36 * ART + 14 * ART;
    const gr = g.createRadialGradient(ex, ey, 0, ex, ey, 14);
    gr.addColorStop(0, `rgba(255,60,40,${0.5 * alpha})`); gr.addColorStop(1, 'rgba(255,60,40,0)');
    g.fillStyle = gr; g.fillRect(ex - 14, ey - 14, 28, 28);
    g.fillStyle = `rgba(255,90,60,${alpha})`; g.fillRect(snap(ex - ART * 2), snap(ey), ART, ART); g.fillRect(snap(ex + ART), snap(ey - ART), ART, ART);
    return;
  }
  if (m.type === 'windows' && m.state !== 'idle') {          // 어둠 속에서도 보이는 붉은 눈
    const wx = m.px ?? m.x, wy = (m.py ?? m.y) - 12 - 30 * ART;
    g.fillStyle = `rgba(255,50,30,${alpha * (0.7 + Math.random() * 0.3)})`;
    g.fillRect(snap(wx - 2 * ART), snap(wy + 10 * ART), ART, ART); g.fillRect(snap(wx + 2 * ART), snap(wy + 10 * ART), ART, ART);
    return;
  }
  if (m.type !== 'smiler' || m.state === 'vanished') return;
  const chase = m.state === 'chase', fl = Math.sin(time * 3 + m.x) * ART;
  const gr = g.createRadialGradient(m.x, m.y - 24, 0, m.x, m.y - 24, 48);
  gr.addColorStop(0, `rgba(255,255,240,${0.16 * alpha})`); gr.addColorStop(1, 'rgba(255,255,240,0)');
  g.fillStyle = gr; g.fillRect(m.x - 48, m.y - 72, 96, 96);
  blit(g, build(`sm:f:${chase}`, 48, 48, gg => drawSmilerFace(gg, chase), null), m.x, m.y + 22 + fl, false,
    alpha * (chase ? 1 : 0.8 + Math.sin(time * 2) * 0.15));
}

/** 추격 중 어둠 속에서 보이는 눈빛 */
export function drawMonsterEyes(g, m, alpha = 1) {
  const left = Math.cos(m.angle) < -0.2;
  let pts, w, h, foot;
  if (m.type === 'howler') { pts = [[19, 10], [25, 10]]; w = 44; h = 82; foot = 14; }
  else if (m.type === 'hound') { pts = [[47, 8], [52, 8]]; w = 60; h = 38; foot = 12; }
  else if (m.type === 'skinStealer' && m.revealed) { pts = [[15, 7], [21, 7]]; w = 36; h = 78; foot = 14; }
  else if (m.type === 'partygoer') { pts = [[12, 16], [18, 15]]; w = 34; h = 76; foot = 13; }
  else if (m.type === 'animation' && m.state === 'hunt') { pts = [[9, 7], [14, 7]]; w = 24; h = 66; foot = 12; }
  else return;
  g.fillStyle = `rgba(240,234,210,${(0.5 + Math.random() * 0.3) * alpha})`;
  for (const [x, y] of pts) {
    const lx = left ? w - 1 - x : x;
    g.fillRect(snap(m.x - (w * ART) / 2) + lx * ART, snap(m.y + foot - h * ART) + y * ART, ART, ART);
  }
}

/** 점프스케어: 화면 중앙에 크게 */
export function drawJumpscareSprite(g, type, time, cx, cy, size) {
  const f = Math.floor(time * 10) % FRAMES;
  let spr;
  if (type === 'howler') spr = build(`hw:${f}:true`, 44, 82, gg => drawHowlerArt(gg, f, true));
  else if (type === 'hound') spr = build(`hd:${f}:false`, 60, 38, gg => drawHoundArt(gg, f, false));
  else if (type === 'skinStealer') spr = build(`ss:${f}`, 36, 78, gg => drawStealerArt(gg, f));
  else if (type === 'partygoer') spr = build(`pg:${f}:true`, 34, 76, gg => drawPartygoerArt(gg, f, true));
  else if (type === 'deathmoth') spr = build(`dm:${f}:false`, 56, 40, gg => drawMothArt(gg, f, false));
  else if (type === 'wretch') spr = build(`wr:${f}`, 28, 62, gg => drawWretchArt(gg, f));
  else if (type === 'scratcher') spr = build(`sc:${f}`, 60, 36, gg => drawScratcherArt(gg, f));
  else if (type === 'windows') spr = build('wn:true', 30, 30, gg => drawWindowArt(gg, true));
  else if (type === 'watch') spr = build(`nw:${f}:true`, 60, 108, gg => drawWatchArt(gg, f, true));
  else if (type === 'faceling') spr = build(`fc:${f}`, 48, 80, gg => drawFacelingArt(gg, f));
  else if (type === 'clump') spr = build(`cl:${f}`, 62, 54, gg => drawClumpArt(gg, f));
  else if (type === 'animation') spr = build(`an:${f}:true`, 24, 66, gg => drawAnimationArt(gg, f, true));
  else if (type === 'animatedKing') spr = build(`ak:${f}`, 40, 88, gg => drawKingArt(gg, f));
  else if (type === 'aranea') spr = build(`ar:${f}`, 72, 46, gg => drawAraneaArt(gg, f));
  else if (type === 'kitty') spr = build(`kt:${f}:false`, 23, 62, gg => drawKittyArt(gg, f, false));
  else if (type === 'partyPooper') spr = build('pp:0', 23, 53, gg => drawPooperArt(gg, 0));
  else if (type === 'hydrolitis') spr = build('hy', 48, 48, gg => drawPlagueArt(gg, 0));
  else {
    const body = build(`sm:b:${f}`, 48, 48, gg => drawSmilerBody(gg, f), null);
    const face = build('sm:f:true', 48, 48, gg => drawSmilerFace(gg, true), null);
    const s = size / 48;
    g.drawImage(body, cx - 24 * s, cy - 24 * s, 48 * s, 48 * s);
    g.drawImage(face, cx - 24 * s, cy - 24 * s, 48 * s, 48 * s);
    return;
  }
  const s = size / spr.height;
  g.drawImage(spr, cx - (spr.width * s) / 2, cy - (spr.height * s) / 2, spr.width * s, spr.height * s);
}

export function drawKey(g, k, t, alpha = 1) {
  if (alpha <= 0.01) return;
  const bob = Math.round(Math.sin(t * 3 + k.phase) * 2) * ART;
  const gr = g.createRadialGradient(k.x, k.y, 0, k.x, k.y, 24);
  gr.addColorStop(0, `rgba(255,220,110,${0.35 * alpha})`); gr.addColorStop(1, 'rgba(255,220,110,0)');
  g.fillStyle = gr; g.fillRect(k.x - 24, k.y - 24, 48, 48);
  const spr = build('key', 22, 12, gg => {
    ellipse(gg, 5, 5, 4, 4, '#d9b84a');
    gg.clearRect(4, 4, 2, 2);
    rect(gg, 8, 4, 12, 2, '#d9b84a'); rect(gg, 16, 6, 2, 3, '#d9b84a'); rect(gg, 13, 6, 2, 2, '#d9b84a');
    px(gg, 3, 2, '#fff2b0'); px(gg, 4, 2, '#fff2b0'); rect(gg, 9, 4, 6, 1, '#fff2b0');
  }, [58, 40, 8]);
  blit(g, spr, k.x, k.y + 9 + bob, false, alpha);
}

/** 퍼즐 단말기: 받침대 위 낡은 CRT 모니터. 화면이 깜빡이고 위에 열쇠가 떠 있다 */
const PUZZLE_GLOW = { oneStroke: '120,230,140', lightsOut: '250,220,90', sequence: '130,200,250', memory: '230,120,220', slide: '250,160,90' };
export function drawTerminal(g, k, t, active = false) {
  const glow = PUZZLE_GLOW[k.puzzle.type] || '120,230,140';
  const pulse = 0.6 + Math.sin(t * 4 + k.phase) * 0.25 + (active ? 0.3 : 0);
  const gr = g.createRadialGradient(k.x, k.y - 14, 0, k.x, k.y - 14, 46);
  gr.addColorStop(0, `rgba(${glow},${0.32 * pulse})`); gr.addColorStop(1, `rgba(${glow},0)`);
  g.fillStyle = gr; g.fillRect(k.x - 46, k.y - 60, 92, 92);
  shadow(g, k.x, k.y + 10, 16, 5);
  const spr = build('terminal', 22, 26, gg => {
    rect(gg, 7, 18, 8, 6, '#3b3a36'); rect(gg, 4, 23, 14, 3, '#2a2926'); rect(gg, 8, 18, 2, 6, '#5a5850');   // 받침대
    rect(gg, 1, 2, 20, 16, '#bdb49a'); rect(gg, 1, 15, 20, 3, '#9a9178'); rect(gg, 2, 3, 18, 1, '#ddd5bb');  // 모니터 몸체
    rect(gg, 3, 4, 16, 10, '#0e1410');                                                                    // 화면
    rect(gg, 16, 16, 2, 1, '#3a6a3a'); rect(gg, 4, 16, 6, 1, '#6f6852');
  }, [20, 16, 10]);
  blit(g, spr, k.x, k.y + 12);
  // 화면 내용 (스캔라인 + 깜빡이는 글자)
  const sx = snap(k.x - 11 * ART + 3 * ART), sy = snap(k.y + 12 - 26 * ART + 4 * ART), sw = 16 * ART, sh = 10 * ART;
  g.fillStyle = `rgba(${glow},${0.25 + 0.2 * pulse})`; g.fillRect(sx, sy, sw, sh);
  g.fillStyle = `rgba(${glow},0.9)`;
  g.font = '13px VT323, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (Math.floor(t * 2 + k.phase) % 3) g.fillText('?', sx + sw / 2, sy + sh / 2 + 1);
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < sh; y += 3) g.fillRect(sx, sy + y, sw, 1);
  // 위에 떠 있는 열쇠
  drawKey(g, { ...k, y: k.y - 46 }, t, 0.85);
}

export function drawExitSign(g, map, exitIdx, unlocked, time) {
  const x = (exitIdx % map.w) * TS + TS / 2, y = ((exitIdx / map.w) | 0) * TS - 2;
  const pulse = 0.75 + Math.sin(time * (unlocked ? 4 : 2)) * 0.25;
  const col = unlocked ? `rgba(110,220,120,${pulse})` : `rgba(220,60,40,${pulse})`;
  const gr = g.createRadialGradient(x, y, 0, x, y, 34);
  gr.addColorStop(0, unlocked ? 'rgba(110,220,120,0.3)' : 'rgba(220,60,40,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(x - 34, y - 34, 68, 68);
  g.fillStyle = '#0c0c0a'; g.fillRect(snap(x - 18), snap(y - 7), 36, 15);
  g.fillStyle = col; g.font = '15px VT323, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('EXIT', x, y + 1);
}

export function drawNameTag(g, p, alpha) {
  g.font = '14px VT323, monospace'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  const w = g.measureText(p.name).width + 6;
  g.fillStyle = `rgba(0,0,0,${alpha * 0.6})`;
  g.fillRect(p.x - w / 2, p.y - 60, w, 14);
  g.fillStyle = `rgba(240,220,140,${alpha})`;
  g.fillText(p.name, p.x, p.y - 47);
}

/** 말풍선 (스킨 스틸러 "hello?") */
export function drawBubble(g, x, y, text, alpha, lift = 80) {
  g.font = '16px VT323, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.ceil(g.measureText(text).width) + 12, h = 18;
  const bx = snap(x - w / 2), by = snap(y - lift);
  g.globalAlpha = alpha;
  g.fillStyle = '#efe9d6'; g.fillRect(bx, by, w, h);
  g.fillStyle = '#1b150b';
  g.fillRect(bx, by - 2, w, 2); g.fillRect(bx, by + h, w, 2); g.fillRect(bx - 2, by, 2, h); g.fillRect(bx + w, by, 2, h);
  g.fillStyle = '#efe9d6'; g.fillRect(snap(x - 3), by + h, 6, 4);
  g.fillStyle = '#1b150b'; g.fillText(text, x, by + h / 2 + 1);
  g.globalAlpha = 1;
}

/** 월드 공간 안내 문구 ("[E] 숨기") */
export function drawPrompt(g, x, y, text) {
  g.font = '15px VT323, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.ceil(g.measureText(text).width) + 10;
  g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(snap(x - w / 2), snap(y - 9), w, 17);
  g.fillStyle = '#f0dc8c'; g.fillText(text, x, y);
}

/** 도감 미리보기: 캔버스(w×h) 가운데에 괴물 하나를 그린다. horde 는 하울러 셋 */
export function drawBestiaryPreview(g, type, time, w, h) {
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, w, h);
  const size = h * 0.82;
  if (type === 'wanderer') {
    const spr = humanSprite('down', -1, 'wanderer', 'default'), s = size / spr.height;
    g.drawImage(spr, (w - spr.width * s) / 2, (h - spr.height * s) / 2, spr.width * s, spr.height * s);
  } else if (type === 'horde') {
    drawJumpscareSprite(g, 'howler', time + 0.3, w * 0.24, h / 2 + 6, size * 0.8);
    drawJumpscareSprite(g, 'howler', time + 0.6, w * 0.76, h / 2 + 6, size * 0.8);
    drawJumpscareSprite(g, 'howler', time, w / 2, h / 2, size);
  } else {
    drawJumpscareSprite(g, type, time, w / 2, h / 2, size);
  }
}

// ================================================================ 미션 물건
/** 배달 부품 (퓨즈 / 무전기 부품) — 10x12 */
const PART_ART = {
  fuse: g => {
    rect(g, 2, 0, 6, 2, '#8a8478'); rect(g, 2, 10, 6, 2, '#8a8478'); rect(g, 3, 2, 4, 8, '#d8d0b8'); rect(g, 3, 2, 1, 8, '#f4eedc');
    rect(g, 4, 4, 2, 4, '#e8a030'); px(g, 4, 5, '#ffd070');
  },
  radio: g => {
    rect(g, 0, 3, 10, 8, '#4a5a44'); rect(g, 0, 3, 10, 1, '#6a7a60'); rect(g, 1, 5, 4, 4, '#1e241c');
    px(g, 7, 5, '#c8322a'); px(g, 7, 7, '#e8c53a'); rect(g, 6, 9, 3, 1, '#9a9a90'); rect(g, 8, 0, 1, 3, '#9a9a90');
  },
};
PART_ART.files = g => {
  rect(g, 0, 2, 10, 10, '#d8b060'); rect(g, 0, 2, 4, 1, '#b8904a');                       // 서류철
  rect(g, 1, 4, 8, 7, '#f4f0e4'); for (let y = 5; y < 10; y += 2) rect(g, 2, y, 6, 1, '#8a8478');
};
PART_ART.toys = g => {
  ellipse(g, 5, 7, 4.5, 4.5, '#e85a8a'); ellipse(g, 3.5, 5.5, 1.5, 1.5, '#ffb0c8');            // 공
  rect(g, 0, 7, 10, 1, '#f4e060'); rect(g, 4, 2, 2, 10, '#f4e060');
};
const PART_GLOW = { fuse: '255,180,70', radio: '140,230,140', files: '240,230,180', toys: '255,140,200' };
export function partIcon(kind) { return build(`part:${kind}`, 10, 12, g => (PART_ART[kind] || PART_ART.fuse)(g), [20, 18, 12]); }
export function drawPart(g, pt, kind, t, alpha = 1) {
  if (alpha <= 0.01) return;
  const bob = Math.round(Math.sin(t * 3 + pt.x * 0.01) * 2) * ART, glow = PART_GLOW[kind] || PART_GLOW.fuse;
  const gr = g.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 26);
  gr.addColorStop(0, `rgba(${glow},${0.4 * alpha})`); gr.addColorStop(1, `rgba(${glow},0)`);
  g.fillStyle = gr; g.fillRect(pt.x - 26, pt.y - 26, 52, 52);
  blit(g, partIcon(kind), pt.x, pt.y + 10 + bob, false, alpha);
}

/** 배달 장치: 배전반(fuse) / 무전기(radio). 꽂힌 개수만큼 칸에 불이 켜진다 */
export function drawDepot(g, dp, kind, done, total, t, unlocked) {
  shadow(g, dp.x, dp.y + 10, 18, 5);
  const spr = kind === 'files'
    ? build('depot:fax', 24, 22, gg => {
      rect(gg, 1, 12, 22, 3, '#5a5a5e'); rect(gg, 3, 15, 2, 7, '#3a3a3e'); rect(gg, 19, 15, 2, 7, '#3a3a3e');     // 책상
      rect(gg, 4, 4, 16, 8, '#c8c4b8'); rect(gg, 4, 4, 16, 1, '#e8e4d8'); rect(gg, 6, 6, 5, 3, '#2a3a2a');     // 팩스
      rect(gg, 7, 1, 10, 3, '#f4f0e4'); for (let x = 13; x < 19; x += 2) rect(gg, x, 7, 1, 1, '#4a4a48');
    })
    : kind === 'toys'
    ? build('depot:toys', 24, 20, gg => {
      rect(gg, 2, 6, 20, 13, '#c8602a'); rect(gg, 2, 6, 20, 2, '#e88a4a'); rect(gg, 2, 12, 20, 1, '#8a3a1a');   // 장난감 상자
      rect(gg, 1, 2, 22, 4, '#d8702a'); rect(gg, 10, 9, 4, 3, '#f4e060');
    })
    : kind === 'radio'
    ? build('depot:radio', 24, 22, gg => {
      rect(gg, 1, 12, 22, 3, '#6a4a2a'); rect(gg, 3, 15, 2, 7, '#4a321c'); rect(gg, 19, 15, 2, 7, '#4a321c');     // 탁자
      rect(gg, 3, 2, 18, 10, '#4a5a44'); rect(gg, 3, 2, 18, 1, '#6a7a60'); rect(gg, 5, 4, 7, 6, '#1e241c');     // 무전기
      rect(gg, 18, 0, 1, 2, '#9a9a90'); rect(gg, 18, 0, 1, 2, '#9a9a90');
    })
    : build('depot:fuse', 22, 26, gg => {
      rect(gg, 1, 0, 20, 24, '#6a7078'); rect(gg, 1, 0, 20, 1, '#9aa0a8'); rect(gg, 2, 2, 18, 20, '#3a3e44');
      rect(gg, 2, 1, 18, 1, '#e8c53a'); for (let x = 2; x < 20; x += 4) rect(gg, x, 1, 2, 1, '#2a2a28');            // 경고 띠
      rect(gg, 9, 24, 4, 2, '#2a2a28');
    });
  blit(g, spr, dp.x, dp.y + 12);
  // 칸 표시등 (꽂은 수만큼 켜짐)
  const w = total * 7, x0 = dp.x - w / 2 + 1, y0 = kind === 'radio' ? dp.y - 12 : dp.y - 22;
  for (let i = 0; i < total; i++) {
    const on = i < done;
    g.fillStyle = on ? (unlocked ? '#6edc78' : '#ffd25a') : (Math.floor(t * 2) % 2 ? '#5a1e18' : '#3a1410');
    g.fillRect(snap(x0 + i * 7), snap(y0), 5, kind === 'radio' ? 3 : 8);
  }
}

/** 작동 장치: 벽에 붙은 증기 밸브(valve) / 배수 밸브(drain), 바닥에 놓인 발전기(generator). prog 0~1 */
export function drawStation(g, st, kind, prog, t) {
  const done = prog >= 1;
  const glow = done ? '110,220,120' : kind === 'drain' ? '120,200,255' : kind === 'generator' ? '255,200,80' : '255,140,90';
  const pulse = done ? 0.3 : 0.22 + Math.sin(t * 3 + st.phase) * 0.1 + (prog > 0 ? 0.12 : 0);
  if (kind === 'generator') {
    shadow(g, st.x, st.y + 10, 18, 5);
    const gr = g.createRadialGradient(st.x, st.y - 8, 0, st.x, st.y - 8, 40);
    gr.addColorStop(0, `rgba(${glow},${pulse})`); gr.addColorStop(1, `rgba(${glow},0)`);
    g.fillStyle = gr; g.fillRect(st.x - 40, st.y - 48, 80, 80);
    const spr = build('st:gen', 26, 22, gg => {
      rect(gg, 1, 6, 24, 14, '#8a7a3a'); rect(gg, 1, 6, 24, 2, '#b8a552'); rect(gg, 3, 10, 12, 8, '#3a3420');
      for (let y = 11; y < 18; y += 2) rect(gg, 4, y, 10, 1, '#5a5030');                                          // 환기구
      ellipse(gg, 20, 13, 3, 3, '#2a2a28'); rect(gg, 20, 2, 1, 11, '#6a6a60'); rect(gg, 18, 1, 5, 2, '#c8322a');    // 크랭크
      rect(gg, 2, 20, 4, 2, '#2a2a28'); rect(gg, 20, 20, 4, 2, '#2a2a28'); rect(gg, 6, 0, 2, 6, '#4a4a48');
    });
    blit(g, spr, st.x + (done ? Math.sin(t * 50) * 0.6 : 0), st.y + 12);
    g.fillStyle = done ? '#6edc78' : '#c8402c'; g.fillRect(snap(st.x - 12), snap(st.y - 18), 4, 4);
    if (done && Math.random() < 0.3) { g.fillStyle = 'rgba(80,80,80,0.4)'; g.beginPath(); g.arc(st.x - 9, st.y - 30 - Math.random() * 10, 4, 0, Math.PI * 2); g.fill(); }
    return;
  }
  // 벽 앞면(타일 위쪽 가장자리 바로 위)에 붙은 배관 + 핸들
  const wy = Math.floor(st.y / TS) * TS, cx = st.x, cy = wy - 16;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 34);
  gr.addColorStop(0, `rgba(${glow},${pulse})`); gr.addColorStop(1, `rgba(${glow},0)`);
  g.fillStyle = gr; g.fillRect(cx - 34, cy - 34, 68, 68);
  const blue = kind === 'drain';
  const spr = build(`st:wall:${kind}`, 32, 22, gg => {
    const pipe = blue ? '#8aa8b8' : '#6a5a4a', pipeHi = blue ? '#c8dce4' : '#9a8a6a';
    rect(gg, 0, 9, 32, 5, pipe); rect(gg, 0, 9, 32, 1, pipeHi);                       // 벽을 따라가는 관
    rect(gg, 14, 13, 4, 9, pipe); rect(gg, 14, 13, 1, 9, pipeHi);                     // 아래로 내려가는 관
    rect(gg, 13, 6, 6, 10, '#4a4a48');                                                 // 밸브 몸통
    const W = blue ? '#2f7fb0' : '#b8322a', D = blue ? '#164a6a' : '#6a1410';
    ellipse(gg, 16, 9, 8, 7.5, W); ellipse(gg, 16, 9, 5.5, 5, D);
    rect(gg, 15, 2, 2, 15, W); rect(gg, 9, 8, 15, 2, W); ellipse(gg, 16, 9, 2, 2, '#2a2a28');
  });
  blit(g, spr, cx, cy + 13);
  // 상태등 + 진행 막대 (벽 위)
  g.fillStyle = done ? '#6edc78' : prog > 0 && Math.floor(t * 6) % 2 ? '#ffd25a' : '#c8402c';
  g.fillRect(snap(cx + 18), snap(cy - 8), 4, 4);
  if (!done && prog > 0) {
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(snap(cx - 20), snap(cy - 26), 40, 6);
    g.fillStyle = '#ffd25a'; g.fillRect(snap(cx - 19), snap(cy - 25), Math.round(38 * prog), 4);
  }
  // 새는 증기 / 물방울 (안 잠긴 동안)
  if (!done) {
    for (let k = 0; k < 4; k++) {
      const u = (t * (blue ? 1.2 : 0.8) + k / 4 + st.phase) % 1;
      if (blue) { g.fillStyle = `rgba(150,210,240,${0.6 * (1 - u)})`; g.fillRect(snap(cx + 2), snap(cy + 8 + u * 20), 2, 3); }
      else { g.fillStyle = `rgba(230,230,220,${0.25 * (1 - u)})`; g.beginPath(); g.arc(cx + 10 + u * 10, cy - 4 - u * 22, 3 + u * 7, 0, Math.PI * 2); g.fill(); }
    }
  }
}

/** Level Fun 파티 게임기: 스탠딩 아케이드 기계. 화면이 번쩍이고 위에 열쇠가 떠 있다 */
export function drawArcade(g, k, t, active = false) {
  const pulse = 0.6 + Math.sin(t * 5 + k.phase) * 0.25 + (active ? 0.3 : 0);
  const gr = g.createRadialGradient(k.x, k.y - 30, 0, k.x, k.y - 30, 52);
  gr.addColorStop(0, `rgba(255,120,200,${0.3 * pulse})`); gr.addColorStop(1, 'rgba(255,120,200,0)');
  g.fillStyle = gr; g.fillRect(k.x - 52, k.y - 82, 104, 104);
  shadow(g, k.x, k.y + 10, 18, 5);
  const spr = build('arcade', 24, 44, gg => {
    poly(gg, [[3, 4], [21, 4], [21, 40], [3, 40]], '#3a1a6a');                       // 몸통
    rect(gg, 3, 4, 2, 36, '#6a3aaa'); rect(gg, 19, 4, 2, 36, '#24104a');
    rect(gg, 2, 0, 20, 6, '#e8c53a'); rect(gg, 4, 1, 16, 4, '#ff5aa0');               // 간판
    rect(gg, 5, 8, 14, 11, '#0a0a12');                                                  // 화면
    poly(gg, [[3, 21], [21, 21], [23, 26], [1, 26]], '#5a2a8a');                       // 조작판
    rect(gg, 6, 22, 2, 3, '#2a2a28'); ellipse(gg, 7, 21, 1.6, 1.6, '#e83a3a');          // 조이스틱
    ellipse(gg, 14, 23.5, 1.4, 1.2, '#3ad0ff'); ellipse(gg, 18, 23.5, 1.4, 1.2, '#7ae83a');
    rect(gg, 9, 30, 6, 4, '#24104a'); rect(gg, 11, 31, 2, 2, '#e8c53a');              // 동전 투입구
    rect(gg, 3, 40, 18, 4, '#1a0a30');
  }, [16, 8, 24]);
  blit(g, spr, k.x, k.y + 12);
  // 화면: 번쩍이는 픽셀 게임
  const sx = snap(k.x - 12 * ART + 5 * ART), sy = snap(k.y + 12 - 44 * ART + 8 * ART), sw = 14 * ART, sh = 11 * ART;
  const hue = Math.floor(t * 2 + k.phase) % 3;
  g.fillStyle = ['rgba(255,90,160,0.55)', 'rgba(90,200,255,0.55)', 'rgba(255,220,90,0.55)'][hue]; g.fillRect(sx, sy, sw, sh);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(snap(sx + ((t * 20) % (sw - 3))), snap(sy + sh / 2), 3, 3);
  g.font = '10px VT323, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (Math.floor(t * 2) % 2) { g.fillStyle = '#fff'; g.fillText('PLAY', sx + sw / 2, sy + 4); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < sh; y += 3) g.fillRect(sx, sy + y, sw, 1);
  drawKey(g, { ...k, y: k.y - 76 }, t, 0.85);
}

// ================================================================ 이모트 (동작): 뻐큐 / 가리키기 / 춤 2종
/** 동작별 길이(초). 움직이면 바로 풀린다 */
export const GESTURES = {
  finger: { name: '뻐큐', dur: 2.2 },
  point:  { name: '가리키기', dur: 2.4 },
  dance1: { name: '춤 1 (들썩)', dur: 5 },
  dance2: { name: '춤 2 (빙글)', dur: 5 },
};
/**
 * 동작 중인 플레이어 그리기 (p.gesture = { g, t }). 몸은 기존 스프라이트를 움직이고, 팔·손은 위에 덧그린다.
 */
export function drawPlayerGesture(g, p, t, alpha = 1) {
  const G = p.gesture, u = G.t;
  if (G.g === 'dance1') {        // 좌우로 들썩이며 깡충깡충, 두 박자마다 방향을 바꾼다
    const beat = u * 4, hop = Math.abs(Math.sin(beat * Math.PI)) * 7, sway = Math.sin(beat * Math.PI / 2) * 6;
    drawHuman(g, { ...p, x: p.x + sway, y: p.y - hop, angle: Math.floor(beat / 2) % 2 ? Math.PI : 0, moving: true, walkPhase: beat * 3 }, 'player', alpha);
    drawNotes(g, p, u, alpha);
    return;
  }
  if (G.g === 'dance2') {        // 빙글빙글 돌면서 위아래로
    const bob = Math.abs(Math.sin(u * 9)) * 5;
    drawHuman(g, { ...p, y: p.y - bob, angle: u * 7, moving: true, walkPhase: u * 10 }, 'player', alpha);
    drawNotes(g, p, u, alpha);
    return;
  }
  // 뻐큐 / 가리키기: 그 자세로 그린 캐릭터 스프라이트 (바라보는 방향별로 앞/뒤/옆 모습)
  const color = SUIT_BASE[p.color] ? p.color : 'default', dir = dirOf(p.angle);
  shadow(g, p.x, p.y + 8, 10, 4, alpha);
  blit(g, posedSprite(dir, 'player', color, G.g), p.x, p.y + 10, dir === 'left', alpha);
}
/** 춤출 때 머리 위로 떠오르는 음표 */
function drawNotes(g, p, u, alpha) {
  g.font = '16px VT323, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = 0; k < 3; k++) {
    const v = (u * 0.8 + k / 3) % 1;
    g.fillStyle = `rgba(${k % 2 ? '255,214,90' : '120,220,255'},${alpha * (1 - v)})`;
    g.fillText(k % 2 ? '♪' : '♫', p.x + Math.sin((v + k) * 5) * 12, p.y - 50 - v * 28);
  }
}
