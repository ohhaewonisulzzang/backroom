import { TS } from '../../shared/config.js';
import { mulberry32 } from '../../shared/utils.js';
import { t as tr } from '../../shared/i18n.js';

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
function blit(g, spr, cx, footY, flip = false, alpha = 1, k = ART) {
  const w = spr.width * k, h = spr.height * k, x = snap(cx - w / 2), y = snap(footY - h);
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

/**
 * 손에 든 아이템 (사람 스프라이트 위에 덧그림). 손전등은 오른손이라 아이템은 반대쪽 손에 든다.
 *  앞모습: 화면 왼쪽 손 / 뒷모습: 화면 오른쪽 손 / 옆모습: 앞쪽으로 내민 손. 걸을 때 팔 흔들림만큼 같이 움직인다.
 */
export function drawHeldItem(g, p, type, t, alpha = 1) {
  if (!type || alpha <= 0.01) return;
  const dir = dirOf(p.angle), k = p.crouching ? 0.78 : 1, foot = p.y + 10;
  const f = frameOf((p.walkPhase ?? p.anim * 1.6) * 0.9, p.moving), sw = Math.round(cyc(f)) * ART;
  let hx, hy;
  if (dir === 'down') { hx = p.x - 10.5; hy = foot - 19.5 * k - sw; }
  else if (dir === 'up') { hx = p.x + 10.5; hy = foot - 19.5 * k + sw; }
  else { hx = p.x + (dir === 'left' ? -1 : 1) * 3; hy = foot - 18 * k; }
  const ic = itemIcon(type), sc = 0.8, w = ic.width * sc, h = ic.height * sc;
  const prev = g.globalAlpha; g.globalAlpha = prev * alpha;
  g.imageSmoothingEnabled = false;
  g.drawImage(ic, snap(hx - w / 2), snap(hy - h / 2), w, h);
  g.globalAlpha = prev;
}

/** 야간 투시경을 얼굴에 쓴 모습 (쌍안 통 + 초록 렌즈 + 머리끈). 사람 스프라이트 위에 덧그림 */
export function drawGoggles(g, p, t, alpha = 1) {
  if (alpha <= 0.01) return;
  const dir = dirOf(p.angle), k = p.crouching ? 0.78 : 1, top = p.y + 10 - 34 * ART * k, A = ART;
  const Y = v => snap(top + v * A * k), X = v => snap(p.x - 9 * A + v * A);
  const lens = `rgba(110,255,130,${0.75 + Math.sin(t * 6) * 0.25})`;
  const prev = g.globalAlpha; g.globalAlpha = prev * alpha;
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  if (dir === 'up') {                                            // 뒷모습: 머리끈과 버클만
    R(X(4.5), Y(5), 9 * A, A, '#1a1a16'); R(X(8), Y(4.5), 2 * A, 2 * A, '#2c2c26');
  } else if (dir === 'down') {                                   // 앞모습: 두 개의 통 + 초록 렌즈
    R(X(3.5), Y(4.5), 11 * A, A, '#1a1a16');
    R(X(5), Y(3.5), 3.5 * A, 4 * A, '#2a2a24'); R(X(9.5), Y(3.5), 3.5 * A, 4 * A, '#2a2a24');
    R(X(8.5), Y(4.5), A, A, '#1a1a16');
    R(X(5.5), Y(4.5), 2.5 * A, 2.5 * A, lens); R(X(10), Y(4.5), 2.5 * A, 2.5 * A, lens);
    R(X(5.5), Y(4.5), A, A, '#e8ffe8'); R(X(10), Y(4.5), A, A, '#e8ffe8');
  } else {                                                       // 옆모습: 앞으로 튀어나온 통 (오른쪽 기준, 왼쪽은 좌우 반전)
    g.save();
    if (dir === 'left') { g.translate(snap(p.x) * 2, 0); g.scale(-1, 1); }
    R(X(4), Y(4.5), 7 * A, A, '#1a1a16');
    R(X(10), Y(3.5), 5 * A, 3.5 * A, '#2a2a24');
    R(X(13.5), Y(4), 1.5 * A, 2.5 * A, lens);
    g.restore();
  }
  g.globalAlpha = prev;
}

/**
 * 멀티플레이 시체: 방호복 차림으로 바닥에 반듯이 누워 있다 (앞모습을 눕힘, 머리가 왼쪽).
 * 배가 찢겨 열려 갈비뼈와 내장이 드러나고, 찢긴 배 주변과 바닥에 피가 흥건하다.
 */
const GORE = { cavity: '#2a0303', meat: '#5e0b0b', meatHi: '#8a1a16', bone: '#e8e0cc', boneSh: '#b0a48c',
  gut: '#c4687a', gutHi: '#e89aa6', gutSh: '#8a3046', organ: '#6a1010', organHi: '#9a2a22',
  blood: '#6e0707', bloodHi: '#a8140f', bloodDk: '#3c0202', pool: '#4e0404', poolHi: '#7a0a08' };
const CORPSE_W = 50, CORPSE_H = 34, CB_X = 8, CB_Y = 8;   // 몸(누운 34x18)을 놓는 자리
function corpseBody(color) {
  // 1) 서 있는 앞모습을 그린 뒤 90도 돌려 눕힌다 (머리가 왼쪽)
  const up = humanSprite('down', -1, 'player', color);   // 이미 외곽선이 둘려 있다
  return build(`corpseBody:${color}`, HUMAN_H, HUMAN_W, g => {
    const P = suitPalette(color, 'player'), rng = mulberry32(57);
    g.save(); g.translate(0, HUMAN_W); g.rotate(-Math.PI / 2); g.drawImage(up, 0, 0); g.restore();   // (x,y) → (y, 17-x)
    // 2) 찢긴 배 (눕힌 좌표: 몸통 x 11..21, y 5..14 / 배 한가운데 ≈ (17, 9.5))
    const cx = 17, cy = 9.5;
    // 배 주변에 흥건히 번진 피 (찢긴 곳에서 멀어질수록 듬성듬성)
    ellipse(g, cx, cy, 6.5, 4.6, GORE.blood);
    ellipse(g, cx + 0.5, cy - 0.5, 5.5, 4, GORE.bloodHi);
    for (let i = 0; i < 55; i++) {
      const a = rng() * Math.PI * 2, r = 4.5 + rng() * 3.5;
      px(g, cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 0.9, rng() < 0.6 ? GORE.blood : GORE.bloodDk);
    }
    // 찢어진 방호복 가장자리: 톱니처럼 너덜너덜
    ellipse(g, cx, cy, 5.2, 3.8, GORE.meat);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = i % 2 ? 4.4 : 5.6;
      px(g, cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 0.8, i % 4 === 1 ? P.tape : i % 2 ? P.dk : P.sh);
    }
    ellipse(g, cx + 0.3, cy + 0.2, 4.2, 2.8, GORE.cavity);
    // 갈비뼈 (가슴 쪽 = 왼쪽): 몸을 가로지르는 활 모양 뼈 3개
    for (const [x, h] of [[13, 3], [15, 3], [17, 2]]) {
      for (let y = -h; y <= h; y++) px(g, x - (Math.abs(y) >= h ? 1 : 0), cy + y, y > 0 ? GORE.boneSh : GORE.bone);
    }
    px(g, 12, cy, GORE.bone);                                                  // 흉골 끝
    // 짙은 장기 + 꼬불꼬불한 창자 (배 쪽 = 오른쪽, 찢긴 틈으로 밀려 나온다)
    ellipse(g, 18.5, cy - 1.5, 1.5, 1, GORE.organ); px(g, 18, cy - 2, GORE.organHi);
    for (const [x, y] of [[19.5, 10.5], [21, 9], [21.5, 11], [20, 12.5], [22.5, 12.5], [23, 10]]) {
      ellipse(g, x + 0.4, y + 0.4, 1.5, 1.2, GORE.gutSh); ellipse(g, x, y, 1.1, 0.8, GORE.gut); px(g, x - 0.5, y - 0.5, GORE.gutHi);
    }
    // 찢겨 젖혀진 방호복 조각
    poly(g, [[14, 5], [17, 2], [17, 5]], P.suit); px(g, 16, 4, P.dk);
    poly(g, [[16, 14], [19, 17], [19, 14]], P.sh); px(g, 18, 15, P.dk);
    // 몸 옆으로 흘러내린 핏줄기
    for (const [x, y, dy] of [[12, 13, 3], [15, 14, 3], [21, 14, 2], [14, 5, -3], [20, 5, -2]]) line(g, x, y, x, y + dy, GORE.blood);
  }, null);
}
function corpseSprite(color, flip) {
  return build(`corpse:${color}:${flip}`, CORPSE_W, CORPSE_H, g => {
    if (flip) { g.translate(CORPSE_W, 0); g.scale(-1, 1); }
    const rng = mulberry32(83);
    // 바닥의 피 웅덩이: 배 아래를 중심으로 불규칙하게 퍼짐 (외곽선 없이)
    const px0 = CB_X + 17, py0 = CB_Y + 10;
    ellipse(g, px0, py0, 16, 8, GORE.pool);
    for (const [dx, dy, rx, ry] of [[-11, 3, 6, 4], [8, 5, 9, 5], [13, -3, 6, 4], [-3, 7, 8, 4], [3, -6, 7, 4], [18, 3, 3, 3], [-16, -1, 4, 2]]) ellipse(g, px0 + dx, py0 + dy, rx, ry, GORE.pool);
    for (const [dx, dy] of [[22, 8], [-19, 6], [7, 13], [17, -8], [-9, -9], [-20, -4]]) rect(g, px0 + dx, py0 + dy, 2, 2, GORE.pool);   // 튄 방울
    speckle(g, px0 - 20, py0 - 10, 42, 24, GORE.bloodDk, 0.1, rng);
    ellipse(g, px0 + 2, py0 + 2, 10, 5, GORE.blood);
    for (const [dx, dy] of [[-7, 5], [9, 7], [12, -4], [-2, 9], [14, 5], [-12, 2]]) px(g, px0 + dx, py0 + dy, GORE.poolHi);   // 젖은 반사
    // 몸 (자동 외곽선이 둘린 캔버스)
    g.drawImage(corpseBody(color), CB_X, CB_Y);
    // 몸 바깥으로 흘러내린 창자 한 가닥
    for (const [x, y] of [[21, 16], [22, 17.5], [24, 18], [25.5, 17]]) { ellipse(g, CB_X + x, CB_Y + y, 1.2, 0.9, GORE.gut); px(g, CB_X + x - 0.5, CB_Y + y - 0.5, GORE.gutHi); }
  }, null);
}
export function drawCorpse(g, c, alpha = 1) {
  if (alpha <= 0.01) return;
  const color = SUIT_BASE[c.color] ? c.color : 'default';
  const flip = (typeof c.id === 'number' ? c.id : [...String(c.id ?? '')].reduce((h, ch) => h + ch.charCodeAt(0), 0)) % 2 === 1;   // 머리 방향 (시체마다 고정)
  blit(g, corpseSprite(color, flip), c.x, c.y + (CORPSE_H * ART) / 2, false, alpha);
}

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

// ================================================================ 파티고어 (Level Fun / 52)
// 평범하게 마른 성인 남자의 몸, 병든 노란 가죽. 입이 없는 민얼굴에 움푹 꺼진 눈. 오른손에 붉은 풍선 (줄에 매달려 둥실둥실).
// 다른 엔티티보다 픽셀이 조금 촘촘하다 (44x80 을 PG_K 배율로 → 사람보다 머리 둘쯤 크다)
const PG_W = 44, PG_H = 80, PG_K = ART * 0.8;
const PG = { skin: '#c4aa34', hi: '#e2cc62', sh: '#8c7620', dk: '#584810', wr: '#6c5a16', rib: '#7a6618', eye: '#140e02',
  blood: '#7e0c08', bloodHi: '#c02018', bloodDk: '#360303',
  balloon: '#b8221e', balloonHi: '#ff7a6a', balloonSh: '#6a0e0a', string: '#cfcabc', stringSh: '#3a3420' };
/** 팔 자세: 걸을 땐 다리와 반대로 앞뒤로 흔든다 (앞으로 갈수록 손이 올라온다). 뛸 땐 팔꿈치를 굽혀 크게 흔든다 */
function pgArms(f, chase) {
  const s = cyc(f);
  const arm = (side, v) => {   // side: -1 왼팔(화면 왼쪽) / +1 오른팔, v: +면 앞으로
    const fw = Math.max(0, v), bk = Math.max(0, -v), sx = 22 + side * 9;
    if (chase) return { sh: [sx, 19], el: [sx + side * (1 + bk), 29 - fw * 3], hd: [sx - side * (fw * 2 - 1), 37 - fw * 9 + bk * 2] };
    return { sh: [sx, 19], el: [sx + side * (1 + bk * 0.6), 31 - fw * 1.5], hd: [sx + side * (1 + bk) - side * fw * 1.5, 42 - fw * 7 + bk] };
  };
  // 오른손은 풍선 줄을 쥐고 배 앞쪽으로 들고 있다 (걸을 땐 살짝, 뛸 땐 조금 더 출렁인다)
  const sxR = 31, bob = s * (chase ? 1.5 : 0.7);
  const R = { sh: [sxR, 19], el: [sxR + 2, 29 + bob * 0.5], hd: [sxR + 3, 35 + bob] };
  return { L: arm(-1, -s), R };
}
function drawPartygoerArt(g, f, chase) {
  const s = cyc(f), rng = mulberry32(31 + (chase ? 7 : 0));
  const lift = v => Math.round(Math.max(0, v) * (chase ? 3 : 2));
  const cx = 22, jit = chase ? Math.round(Math.sin(f * 2.3)) : 0;   // 쫓을 땐 머리가 경련하듯 까딱
  const { L, R } = pgArms(f, chase);
  // ---- 다리: 가늘고 곧게
  const lL = lift(s), rL = lift(-s);
  const leg = (hip, knee, foot, c, sh) => {
    limb(g, hip, knee, 5, 4, c, sh); limb(g, knee, foot, 4, 3, c, sh);
    px(g, knee[0], knee[1], sh);
    rect(g, foot[0] - 2, foot[1], 5, 2, PG.dk);
  };
  leg([18, 45], [18, 60 - lL], [18, 74 - lL], PG.skin, PG.sh);
  leg([26, 45], [26, 60 - rL], [26, 74 - rL], PG.sh, PG.dk);
  // ---- 팔 (몸 뒤로 지나가는 쪽은 몸통보다 먼저) — 손가락 끝에 피
  const arm = (a, c, shade) => {
    limb(g, a.sh, a.el, 3, 2, c, shade); limb(g, a.el, a.hd, 2, 2, c, shade);
    const [hx, hy] = a.hd.map(Math.round);
    rect(g, hx - 1, hy, 3, 2, c);
    for (let k = -1; k <= 1; k++) { px(g, hx + k, hy + 2, shade); px(g, hx + k, hy + 3, PG.blood); }
  };
  // ---- 몸통: 어깨에서 엉덩이까지 곧은 몸, 마른 편이지만 살짝 살집이 있어 배가 조금 나왔다
  poly(g, [[14, 18], [30, 18], [30, 26], [31, 33], [30, 40], [29, 46], [15, 46], [14, 40], [13, 33], [14, 26]], PG.skin);
  poly(g, [[27, 18], [30, 18], [30, 26], [31, 33], [30, 40], [29, 46], [27, 46]], PG.sh);          // 오른쪽 그늘
  ellipse(g, 14.5, 19.5, 1.8, 1.8, PG.skin); ellipse(g, 29.5, 19.5, 1.8, 1.8, PG.sh);   // 둥근 어깨
  line(g, 17, 20, 21, 21, PG.sh); line(g, 23, 21, 27, 20, PG.dk);         // 쇄골
  line(g, 16, 39, 21, 41, PG.sh); line(g, 23, 41, 28, 39, PG.dk);         // 아랫배 주름
  ellipse(g, 19, 23, 2, 1, PG.hi);
  for (let k = 0; k < 4; k++) {                                     // 드러난 갈비뼈
    const y = 25 + k * 2, w = 4 - Math.abs(k - 1) * 0.5;
    line(g, cx - 1 - w, y + 1, cx - 1, y, PG.rib); line(g, cx + 1, y, cx + 1 + w, y + 1, PG.dk);
  }
  line(g, cx, 22, cx, 38, PG.sh);                                   // 가운데 골
  poly(g, [[20, 27], [23, 27], [22, 33], [21, 34]], PG.blood);      // 가슴의 찢긴 상처
  px(g, 21, 29, PG.bloodDk); px(g, 22, 28, PG.bloodHi);
  px(g, cx, 39, PG.dk);                                             // 배꼽
  line(g, 16, 44, 21, 46, PG.wr); line(g, 28, 44, 23, 46, PG.dk);    // 골반선
  arm(L, PG.skin, PG.sh); arm(R, PG.sh, PG.dk);
  // ---- 목 + 머리 (입이 없는 민얼굴)
  const hx = cx + jit, hy = 9;
  rect(g, hx - 2, 14, 5, 5, PG.sh); px(g, hx - 2, 16, PG.wr);
  ellipse(g, hx + 0.5, hy, 5, 6.5, PG.sh);
  ellipse(g, hx, hy - 0.5, 4.5, 6, PG.skin);
  ellipse(g, hx - 1.5, hy - 3.5, 1.8, 1.8, PG.hi);
  rect(g, hx - 3, hy - 1, 2, 2, PG.sh); rect(g, hx + 1, hy - 1, 2, 2, PG.dk);   // 움푹 꺼진 눈자리
  px(g, hx - 2, hy, PG.eye); px(g, hx + 2, hy, PG.eye);                       // 까만 점 같은 눈
  px(g, hx, hy + 2, PG.sh);                                                   // 코 그늘 (입은 없다)
  // ---- 가죽 질감 (그려진 픽셀 위에만)
  speckle(g, 4, 2, 36, 76, PG.wr, 0.035, rng);
}
/** 풍선 위치 (스프라이트 픽셀 좌표): 시간에 따라 둥실둥실 흔들리고, 움직이면 뒤로 끌린다 */
function pgBalloon(t, moving, chase, hand) {
  const drag = chase ? 3 : moving ? 1.5 : 0;
  return [hand[0] + 3 + Math.sin(t * 1.7) * 2 + Math.sin(t * 0.83 + 1.3) * 1 + (chase ? Math.sin(t * 9) * 0.8 : 0),
    hand[1] - 25 + Math.sin(t * 2.3 + 0.4) * 1.8 + drag];
}
/** 풍선 + 줄 (스프라이트 픽셀 좌표계에 바로 그림). 줄은 손에서 매듭까지 살짝 휘어진다 */
function drawPGBalloonArt(g, hand, b, t) {
  const [hx, hy] = [Math.round(hand[0]), Math.round(hand[1]) + 1], bx = Math.round(b[0]), by = Math.round(b[1]);
  const kx = bx, ky = by + 7, bend = Math.sin(t * 2.1) * 2 + (hx - kx) * 0.15;
  let px0 = hx, py0 = hy;
  for (let i = 1; i <= 8; i++) {
    const u = i / 8, x = hx + (kx - hx) * u + Math.sin(u * Math.PI) * bend, y = hy + (ky - hy) * u;
    line(g, px0 + 1, py0, x + 1, y, PG.stringSh); line(g, px0, py0, x, y, PG.string);
    px0 = x; py0 = y;
  }
  ellipse(g, bx, by, 5.5, 7, PG.stringSh);                                     // 외곽선
  rect(g, bx - 2, by + 6, 4, 3, PG.stringSh);
  ellipse(g, bx, by, 4.5, 6, PG.balloon); ellipse(g, bx + 1.5, by + 2, 2.5, 3, PG.balloonSh);
  px(g, bx - 2, by - 3, PG.balloonHi); px(g, bx - 2, by - 2, PG.balloonHi); px(g, bx - 1, by - 4, PG.balloonHi);
  rect(g, bx - 1, by + 6, 2, 2, PG.balloonSh);
  // 줄을 꽉 쥔 주먹 (줄 위에 덧그려서 손에 들고 있는 것처럼)
  rect(g, hx - 1, hy - 2, 4, 3, PG.sh); rect(g, hx - 1, hy - 2, 4, 1, PG.skin); px(g, hx + 2, hy, PG.dk); px(g, hx, hy + 1, PG.blood);
}
/** 월드에 파티고어 그리기: 몸은 캐시 스프라이트, 풍선과 줄은 매 프레임 시간에 맞춰 같은 픽셀 격자로 덧그린다 */
function drawPartygoer(g, m, f, time, alpha, left) {
  const chase = m.state === 'chase';
  const spr = build(`pg:${f}:${chase}`, PG_W, PG_H, gg => drawPartygoerArt(gg, f, chase));
  blit(g, spr, m.x, m.y + 12, left, alpha, PG_K);
  const w = PG_W * PG_K, x = snap(m.x - w / 2), y = snap(m.y + 12 - PG_H * PG_K);
  g.save();
  g.globalAlpha *= alpha;
  if (left) { g.translate(x + w, y); g.scale(-PG_K, PG_K); } else { g.translate(x, y); g.scale(PG_K, PG_K); }
  const hand = pgArms(f, chase).R.hd;
  drawPGBalloonArt(g, hand, pgBalloon(time + (typeof m.id === 'number' ? m.id : parseInt(String(m.id || '').replace(/\D/g, ''), 10) || 0) * 1.7, f >= 0, chase, hand), time);
  g.restore();
}
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
  firecracker: g => {   // 빨간 폭죽 묶음 + 심지
    rect(g, 2, 6, 3, 11, '#c8322a'); rect(g, 5, 5, 3, 12, '#d84a32'); rect(g, 8, 7, 3, 10, '#c8322a');
    rect(g, 2, 6, 1, 11, '#f07a5a'); rect(g, 5, 5, 1, 12, '#f8906a'); rect(g, 2, 11, 9, 1, '#e8c53a');
    line(g, 6, 5, 7, 1, '#6a5a3a', 1); px(g, 8, 0, '#ffd070');
  },
  nightVision: g => {   // 쌍안 야간 투시경 (초록 렌즈)
    rect(g, 0, 6, 12, 7, '#2a3028'); rect(g, 0, 6, 12, 1, '#4a5248'); rect(g, 4, 3, 4, 3, '#2a3028');
    ellipse(g, 3, 10, 2.4, 2.4, '#0e140e'); ellipse(g, 9, 10, 2.4, 2.4, '#0e140e');
    px(g, 3, 10, '#6aff7a'); px(g, 9, 10, '#6aff7a'); px(g, 2, 9, '#c8ffd0'); px(g, 8, 9, '#c8ffd0'); rect(g, 1, 13, 10, 2, '#1a1e18');
  },
  adrenaline: g => {    // 주사기
    rect(g, 5, 0, 2, 3, '#d8d8d0'); rect(g, 3, 3, 6, 1, '#9a9a94');
    rect(g, 4, 4, 4, 9, '#e8f0f0'); rect(g, 4, 7, 4, 6, '#e83a6a'); rect(g, 4, 4, 1, 9, '#ffffff');
    rect(g, 5, 13, 2, 1, '#9a9a94'); rect(g, 5, 14, 1, 4, '#c8ccd0');
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
  const glow = { almondWater: '170,220,240', staminaDrink: '120,230,110', camera: '220,220,200', bugSpray: '230,210,90', flare: '240,110,90', compass: '230,200,140', firecracker: '255,120,80', nightVision: '110,255,130', adrenaline: '255,110,150' }[it.type] || '220,220,200';
  const gr = g.createRadialGradient(it.x, it.y, 0, it.x, it.y, 22);
  gr.addColorStop(0, `rgba(${glow},${0.32 * alpha})`); gr.addColorStop(1, `rgba(${glow},0)`);
  g.fillStyle = gr; g.fillRect(it.x - 22, it.y - 22, 44, 44);
  blit(g, itemIcon(it.type), it.x, it.y + 10 + bob, false, alpha);
}

/** 시작 지점 쪽지: 바닥에 떨어진 구겨진 종이. 아직 안 읽었으면 은은하게 빛난다 */
export function drawNote(g, n, t, unread = true) {
  if (unread) {
    const a = 0.25 + Math.sin(t * 3) * 0.1;
    const gr = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, 26);
    gr.addColorStop(0, `rgba(255,245,200,${a})`); gr.addColorStop(1, 'rgba(255,245,200,0)');
    g.fillStyle = gr; g.fillRect(n.x - 26, n.y - 26, 52, 52);
  }
  const spr = build('note', 14, 11, gg => {
    poly(gg, [[1, 2], [12, 0], [13, 9], [2, 10]], '#ece4cc');
    poly(gg, [[8, 0], [12, 0], [13, 4]], '#c8bea2');                               // 접힌 귀퉁이
    for (let y = 3; y < 9; y += 2) line(gg, 3, y + 0.5, 10, y - 0.5, '#6a6250', 1);  // 글씨 줄
    px(gg, 4, 8, '#8a2a20');                                                         // 붉은 얼룩
  }, [40, 34, 22]);
  blit(g, spr, n.x, n.y + 6);
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

// ================================================================ 레벨 5의 야수: 털북숭이 거대한 짐승, 주황 안광, 크게 벌린 아가리 (옆모습)
const BS = { fur: '#3e2c1e', furHi: '#5e4630', furDk: '#1e140c', eye: '#ff8a1a', eyeHi: '#ffd070', mouth: '#2a0606', gum: '#7a1a1a', tooth: '#e8dcc0', claw: '#d0c4a8', star: '#f4e070', streak: '#8a7a64' };
function drawBeastArt(g, f, state) {
  const charge = state === 'charge', wind = state === 'windup', dazed = state === 'dazed';
  const s = wind || dazed ? 0 : cyc(f) * (charge ? 1.5 : 1), lean = charge ? 4 : 0, lift = v => Math.round(Math.max(0, v) * 3);
  if (charge) for (let k = 0; k < 5; k++) { const y = 16 + k * 7, x = (k % 2) * 3; line(g, x, y, x + 6 - (k % 2) * 2, y, BS.streak); }   // 돌진 잔상
  const leg = (hip, ph, far, front) => {
    const c = far ? BS.furDk : BS.fur;
    const kn = [hip[0] + (front ? 3 : -3) + ph * 3, hip[1] + 9], ft = [hip[0] + ph * 5 + (front ? lean : 0), 53 - lift(ph)];
    limb(g, hip, kn, 8, 6, c, far ? null : BS.furDk); limb(g, kn, ft, 6, 5, c, far ? null : BS.furDk);
    for (let k = -1; k <= 1; k++) line(g, ft[0] + k * 2, ft[1] + 1, ft[0] + k * 2 + 1, ft[1] + 2, BS.claw);   // 굵은 발톱
  };
  leg([16, 36], -s, true, false); leg([44, 32 + lean / 2], s, true, true);
  // 구부정하게 솟은 몸통
  ellipse(g, 30, 32, 20, 13, BS.fur);
  ellipse(g, 26, 22 + lean / 2, 15, 11, BS.fur);
  ellipse(g, 32, 38, 15, 6, BS.furDk);
  ellipse(g, 22, 18 + lean / 2, 6, 4, BS.furHi);
  for (let x = 12; x <= 40; x += 3) {                                     // 등의 뻣뻣한 털
    const t = (x - 26) / 15, top = 22 + lean / 2 - 11 * Math.sqrt(Math.max(0, 1 - t * t));
    line(g, x, top + 1, x - 2, top - 2 - (x % 2), BS.furDk);
  }
  for (let y = 26; y < 42; y += 4) for (let x = 14 + (y % 8 ? 0 : 3); x < 44; x += 6) line(g, x, y, x - 1, y + 2, BS.furDk);
  leg([20, 38], s, false, false); leg([47, 34 + lean / 2], -s, false, true);
  // 굵은 목 + 머리 (돌진 땐 낮게 숙임)
  const hx = 50, hy = 26 + lean, open = wind ? 8 + (f % 2) : dazed ? 4 : charge ? 6 : 3 + Math.round(Math.max(0, s));
  limb(g, [40, 26 + lean / 2], [hx - 2, hy], 10, 9, BS.fur);
  ellipse(g, hx, hy, 9, 8, BS.fur); ellipse(g, hx - 3, hy - 4, 4, 2, BS.furHi);
  poly(g, [[hx + 2, hy - 3], [hx + 12, hy - 1], [hx + 12, hy + 3], [hx + 2, hy + 3]], BS.fur);             // 위턱
  poly(g, [[hx - 1, hy + 3], [hx + 11, hy + 3 + open], [hx + 10, hy + 6 + open], [hx - 1, hy + 7]], BS.furDk);   // 아래턱
  poly(g, [[hx + 1, hy + 3], [hx + 12, hy + 3], [hx + 11, hy + 3 + open], [hx + 1, hy + 4]], BS.mouth);   // 아가리 속
  line(g, hx + 2, hy + 3, hx + 11, hy + 3, BS.gum);
  for (let x = hx + 3; x <= hx + 11; x += 2) {                            // 위아래 송곳니
    px(g, x, hy + 4, BS.tooth); if (open > 4) px(g, x, hy + 5, BS.tooth);
    const ly = hy + 3 + (open * (x - hx)) / 11;
    px(g, x - 1, ly - 1, BS.tooth);
  }
  // 주황 안광 (멍할 땐 흐려짐) + 찌푸린 눈썹
  const ec = dazed ? BS.furHi : BS.eye;
  rect(g, hx + 1, hy - 4, 2, 2, ec); rect(g, hx + 5, hy - 3, 2, 2, ec);
  if (!dazed) { px(g, hx + 1, hy - 4, BS.eyeHi); px(g, hx + 5, hy - 3, BS.eyeHi); }
  line(g, hx, hy - 6, hx + 7, hy - 4, BS.furDk);
  if (dazed) for (let k = 0; k < 3; k++) {                                // 머리 위를 도는 별
    const a = (f / FRAMES) * Math.PI * 2 + k * 2.09, x = hx + Math.cos(a) * 7, y = 7 + Math.sin(a) * 2;
    px(g, x, y, BS.star); px(g, x - 1, y, BS.star); px(g, x + 1, y, BS.star); px(g, x, y - 1, BS.star); px(g, x, y + 1, BS.star);
  }
}

// ================================================================ 레벨 7의 무언가: 물속의 거대한 것 (평소엔 지느러미만, 점프스케어는 창백한 심해어 머리)
const SEA = { fin: '#1a2428', finHi: '#3a4a50', finDk: '#0a1014', foam: '#e8f0f0', foamSh: '#a8c0c8', flesh: '#d8d0c4', fleshSh: '#a8a094', fleshDk: '#6a645c',
  gum: '#5a1a22', mouth: '#0a0406', tooth: '#f4f0e4', eye: '#f8f8f4', eyeSh: '#c8ccd0', water: '#1a3a48', waterHi: '#4a7a8a', lure: '#d8ffe8' };
/** 수면을 가르는 등지느러미 (14x12) */
function drawSeaFinArt(g, f) {
  const s = Math.round(cyc(f));
  poly(g, [[2, 10], [8 + s, 0], [10 + s, 2], [12, 10]], SEA.fin);
  poly(g, [[9 + s, 1], [10 + s, 2], [12, 10], [9, 10]], SEA.finDk);
  line(g, 3, 9, 8 + s, 1, SEA.finHi);
  for (let y = 3; y < 10; y += 2) px(g, 9 + s - Math.round((y - 3) * 0.2), y, SEA.finHi);   // 가시 마디
  rect(g, 0, 10, 14, 2, SEA.foam);
  for (let x = (f % 2); x < 14; x += 3) px(g, x, 11, SEA.foamSh);
}
/** 점프스케어: 물을 뚫고 솟구친 창백한 장님 심해어 머리 (56x64) */
function drawSeaThingArt(g, f) {
  const s = cyc(f);
  // 초롱 (머리 위 발광 미끼)
  line(g, 30, 5, 34, 1, SEA.fleshDk); line(g, 34, 1, 38, 1, SEA.fleshDk);
  ellipse(g, 40, 2, 1.6, 1.6, SEA.lure);
  // 머리
  ellipse(g, 28, 30, 20, 26, SEA.flesh); ellipse(g, 34, 34, 12, 22, SEA.fleshSh); ellipse(g, 26, 28, 16, 22, SEA.flesh);
  for (const [a, b, c, d] of [[12, 20, 16, 26], [44, 22, 40, 28], [20, 8, 22, 12]]) line(g, a, b, c, d, SEA.fleshSh);   // 주름
  // 쩍 벌린 입 + 바늘 이빨
  const my = 37, mrx = 15, mry = 13 + s;
  ellipse(g, 28, my, mrx + 1, mry + 1, SEA.gum); ellipse(g, 28, my, mrx, mry, SEA.mouth);
  for (let x = 15; x <= 41; x += 3) {
    const t = (x - 28) / mrx, dy = mry * Math.sqrt(Math.max(0, 1 - t * t));
    line(g, x, my - dy, x + (x < 28 ? 1 : -1), my - dy + 5 + (x % 2) * 2, SEA.tooth);      // 윗니
    line(g, x + 1, my + dy, x + 1, my + dy - 4 - (x % 2) * 2, SEA.tooth);                   // 아랫니
  }
  for (let x = 20; x <= 36; x += 4) px(g, x, my - 2, SEA.tooth);                            // 목구멍 속 이빨
  // 멀어 버린 하얀 눈
  ellipse(g, 28, 12, 5, 4, SEA.eye); ellipse(g, 28, 14, 4, 1.6, SEA.eyeSh); px(g, 26, 10, '#ffffff');
  // 물 + 물보라
  for (let x = 0; x < 56; x++) {
    const y = 54 + Math.round(Math.sin(x * 0.5 + f * 0.8) * 1.5);
    rect(g, x, y, 1, 64 - y, SEA.water); px(g, x, y, (x + f) % 4 ? SEA.waterHi : SEA.foam);
  }
  for (let x = 6; x < 50; x += 2) px(g, x, 53 - ((x * 7 + f) % 3), SEA.foam);
  for (let k = 0; k < 7; k++) {                                                             // 튀는 물방울
    const side = k % 2 ? 1 : -1, x = 28 + side * (22 + (k % 3) * 2), y = 50 - ((k * 5 + f * 2) % 18);
    px(g, x, y, SEA.foam); px(g, x, y + 1, SEA.foamSh);
  }
}

// ================================================================ 크롤러: 천장에 매달린 길쭉한 회색 인간형, 네발로 기어다님 (옆모습)
const CR = { skin: '#b4b0a8', hi: '#d4d0c6', sh: '#84807a', dk: '#56524e', mouth: '#050404', tooth: '#e8e2d2', eye: '#f0ece0' };
const CRS = { skin: '#1a1a1e', hi: '#26262a', sh: '#121214', dk: '#0a0a0c', mouth: '#000000', tooth: '#2a2a2e', eye: '#2a2a2e' };   // 천장의 어두운 실루엣
function drawCrawlerArt(g, f, P, open) {
  const s = cyc(f), lift = v => Math.round(Math.max(0, v) * 3);
  const leg = (hip, ph, far, front) => {
    const kn = [hip[0] + (front ? 5 : -5) + ph * 4, 3 + Math.round(Math.abs(ph))], ft = [hip[0] + (front ? 8 : -3) + ph * 6, 32 - lift(ph)];
    const c = far ? P.sh : P.skin;
    line(g, hip[0], hip[1], kn[0], kn[1], c, 2); line(g, kn[0], kn[1], ft[0], ft[1], c, far ? 1 : 2);
    rect(g, kn[0] - 1, kn[1] - 1, 2, 2, P.dk);                                              // 툭 튀어나온 관절
    for (let k = 0; k < 3; k++) line(g, ft[0], ft[1], ft[0] + (front ? 2 : -2) + k - 1, ft[1] + 1, P.hi);   // 긴 손가락
  };
  leg([12, 17], -s, true, false); leg([36, 16], s, true, true);
  // 가늘고 긴 몸통 (척추가 비침)
  ellipse(g, 25, 17, 14, 3.2, P.skin); ellipse(g, 26, 19, 10, 1.3, P.sh);
  for (let x = 14; x <= 36; x += 3) px(g, x, 14, P.dk);
  for (let x = 20; x <= 32; x += 3) line(g, x, 16, x - 1, 19, P.sh);
  leg([15, 18], s, false, false); leg([38, 17], -s, false, true);
  // 길쭉한 두개골 + 찢어진 듯 넓은 입
  limb(g, [37, 16], [43, 15], 3, 2, P.skin, P.sh);
  ellipse(g, 44, 12, 6, 3.5, P.skin); ellipse(g, 42, 11, 3, 1.5, P.hi);
  ellipse(g, 50, 15, 5, 4, P.skin); ellipse(g, 51, 17, 3, 2, P.sh);
  if (open) { ellipse(g, 51, 18, 4, 3, P.mouth); for (let x = 48; x <= 54; x += 2) { px(g, x, 16, P.tooth); px(g, x + 1, 20, P.tooth); } }
  else { rect(g, 46, 18, 9, 1, P.mouth); px(g, 49, 18, P.tooth); px(g, 52, 18, P.tooth); }
  px(g, 50, 13, P.eye); px(g, 53, 13, P.eye);
}

// ================================================================ 죽음쥐: 털 빠진 작은 쥐, 분홍 맨살 꼬리, 빨간 눈, 드러난 갈비뼈
const DR = { fur: '#5a4e44', furHi: '#7a6c5e', furDk: '#3a3029', skin: '#c88a8a', skinSh: '#9a5e60', rib: '#d8c8b4', eye: '#ff2a1a', tooth: '#efe6cf', mouth: '#2a0808' };
function drawDeathratArt(g, f, rest) {
  if (rest) {
    // 웅크리고 앉아 헐떡임
    line(g, 0, 12, 4, 13, DR.skin); line(g, 4, 13, 7, 12, DR.skin);
    ellipse(g, 9, 8, 5, 4.5, DR.fur); ellipse(g, 10, 10, 3, 2, DR.furDk); px(g, 7, 5, DR.skinSh);
    line(g, 8, 7, 9, 10, DR.rib); line(g, 10, 7, 11, 10, DR.rib);
    rect(g, 6, 12, 2, 1, DR.skin); rect(g, 11, 12, 2, 1, DR.skin);
    ellipse(g, 14, 5, 3.5, 3, DR.fur); poly(g, [[15, 3], [19, 6], [15, 8]], DR.fur); px(g, 19, 6, DR.skin);
    ellipse(g, 12, 2, 1.5, 1.5, DR.skin); px(g, 15, 4, DR.eye);
    if (f % 2) { rect(g, 16, 7, 2, 1, DR.mouth); px(g, 17, 7, DR.tooth); } else px(g, 17, 7, DR.tooth);
    return;
  }
  const s = cyc(f), lift = v => Math.round(Math.max(0, v) * 2);
  const leg = (x, ph, c) => { line(g, x, 10, x + ph * 2, 13 - lift(ph), c); px(g, x + ph * 2 + 1, 13 - lift(ph), DR.skin); };
  line(g, 0, 7 + Math.round(s), 3, 9, DR.skin); line(g, 3, 9, 6, 9, DR.skin);             // 맨살 꼬리
  leg(7, -s, DR.furDk); leg(14, s, DR.furDk);
  ellipse(g, 10, 8, 6, 3.5, DR.fur); ellipse(g, 10, 10, 4, 1.4, DR.furDk);
  px(g, 8, 6, DR.skinSh); px(g, 12, 6, DR.skinSh); px(g, 6, 8, DR.skinSh);                 // 털 빠진 맨살
  line(g, 9, 7, 10, 10, DR.rib); line(g, 11, 7, 12, 10, DR.rib);                           // 갈비뼈
  for (const x of [6, 9, 12]) px(g, x, 4, DR.furDk);                                       // 삐죽한 털
  leg(9, s, DR.fur); leg(15, -s, DR.fur);
  ellipse(g, 16, 7, 3.5, 2.5, DR.fur); poly(g, [[17, 5], [21, 7.5], [17, 9.5]], DR.fur); px(g, 20, 7, DR.skin);
  ellipse(g, 14, 4, 1.5, 1.5, DR.skin); px(g, 17, 6, DR.eye);
  px(g, 18, 9, DR.tooth); px(g, 19, 9, DR.tooth);
}

// ================================================================ 잭-오-랜턴: 누더기 허수아비 몸, 불 켜진 호박 머리
const JL = { pump: '#d86a1a', pumpHi: '#f4922e', pumpSh: '#a04a10', stem: '#4a5a24', carve: '#2a1004', lit: '#ffd84a', litHi: '#fff4b0',
  burlap: '#a88a5a', burlapSh: '#7a6240', coat: '#2a2420', coatHi: '#3e3630', coatDk: '#16120f', straw: '#e0c060', strawSh: '#b8963a', rope: '#5a4228' };
/** 호박에 파낸 눈·코·입. notch(x,y) 로 이빨 자리를 남긴다 */
function drawJackFace(g, c, hi, notch) {
  poly(g, [[8, 11], [13, 11], [10.5, 6]], c); poly(g, [[17, 11], [22, 11], [19.5, 6]], c);
  poly(g, [[13.5, 14], [16.5, 14], [15, 12]], c);
  poly(g, [[7, 15], [23, 15], [21, 19], [9, 19]], c);
  if (hi) { px(g, 10, 9, hi); px(g, 19, 9, hi); rect(g, 11, 16, 8, 1, hi); }
  for (const [x, y] of [[11, 15], [17, 15], [14, 18]]) notch(x, y);
}
function drawJackArt(g, f, lit) {
  const s = cyc(f);
  // 뻣뻣한 다리 (헐렁한 삼베 바지) + 삐져나온 짚
  limb(g, [12, 50], [11 + s * 2, 60], 3, 3, JL.burlapSh); limb(g, [11 + s * 2, 60], [11 + s * 3, 68], 3, 2, JL.burlapSh);
  limb(g, [18, 50], [19 - s * 2, 60], 3, 3, JL.burlap, JL.burlapSh); limb(g, [19 - s * 2, 60], [19 - s * 3, 68], 3, 2, JL.burlap, JL.burlapSh);
  for (const fx of [11 + s * 3, 19 - s * 3]) { line(g, fx, 67, fx - 2, 69, JL.straw); line(g, fx, 67, fx + 2, 69, JL.strawSh); }
  // 누더기 코트 (톱니 밑단)
  const hem = [];
  for (let k = 0, x = 24; x >= 6; k++, x -= 3) hem.push([x, 52 + (k % 2 ? 4 : 0)]);
  poly(g, [[8, 22], [22, 22], [24, 52], ...hem, [6, 52]], JL.coat);
  poly(g, [[17, 22], [22, 22], [24, 52], [17, 52]], JL.coatDk);
  line(g, 9, 26, 8, 48, JL.coatHi); rect(g, 10, 32, 4, 4, JL.burlapSh); px(g, 11, 33, JL.burlap);   // 기운 자국
  for (let y = 28; y < 46; y += 6) px(g, 16, y, JL.coatHi);                                          // 단추
  rect(g, 7, 40, 17, 1, JL.rope);                                                                    // 허리 밧줄
  // 축 늘어져 벌린 팔 + 소매 끝의 짚
  limb(g, [8, 24], [3, 35 + s], 3, 3, JL.coat, JL.coatDk); limb(g, [22, 24], [27, 35 - s], 3, 3, JL.coatDk);
  for (const [hx, hy] of [[3, 35 + s], [27, 35 - s]]) for (let k = -1; k <= 1; k++) line(g, hx, hy + 1, hx + k * 2, hy + 4, k ? JL.strawSh : JL.straw);
  // 목 (짚 + 밧줄)
  rect(g, 12, 19, 6, 4, JL.burlap); rect(g, 12, 21, 6, 1, JL.rope); px(g, 11, 22, JL.straw); px(g, 19, 22, JL.straw);
  // 호박 머리
  ellipse(g, 15, 11, 10, 9, JL.pump); ellipse(g, 20, 13, 4, 6, JL.pumpSh);
  line(g, 10, 4, 9, 18, JL.pumpSh); line(g, 20, 4, 21, 18, JL.pumpSh); line(g, 15, 2, 15, 4, JL.pumpSh);
  px(g, 8, 6, JL.pumpHi); px(g, 9, 5, JL.pumpHi); px(g, 7, 8, JL.pumpHi);
  rect(g, 14, 0, 3, 3, JL.stem);
  drawJackFace(g, lit ? JL.lit : JL.carve, lit ? JL.litHi : null, (x, y) => rect(g, x, y, 2, 1, JL.pump));
}

// ================================================================ 위장 크롤러: 벽·바닥 덩어리인 척하다 드러나는 납작한 도마뱀 인간
const CC = { tones: [['#5e6a4a', '#465236', '#7e8a62', '#2e3622'], ['#6a5a44', '#4e4232', '#8a7a5a', '#30281c'], ['#5a5e62', '#42464a', '#7a7e82', '#2a2c30'], ['#6a5236', '#503c26', '#8e7048', '#32241a']],
  eye: '#f4d020', pupil: '#100c04', claw: '#d8d0b8', mouth: '#1a0a08' };
const CCC = { base: '#a89c84', sh: '#948a74', hi: '#b8ac94' };   // 위장 상태 (벽·바닥과 비슷한 칙칙한 색)
function drawCamoLumpArt(g) {
  ellipse(g, 20, 10, 18, 5.5, CCC.base); ellipse(g, 12, 8, 7, 4, CCC.hi); ellipse(g, 28, 11, 9, 4, CCC.sh); ellipse(g, 33, 8, 5, 3, CCC.base);
}
function drawCamoArt(g, f, pi) {
  const [b, sh, hi, dk] = CC.tones[pi], s = cyc(f), lift = v => Math.round(Math.max(0, v) * 2);
  const leg = (hip, ph, far, front) => {                                   // 옆으로 벌린 다리 (팔꿈치가 몸보다 높이)
    const c = far ? sh : b, el = [hip[0] + (front ? 3 : -3) + ph * 3, hip[1] - 5], ft = [hip[0] + (front ? 6 : -5) + ph * 5, 28 - lift(ph)];
    limb(g, hip, el, 3, 2, c); limb(g, el, ft, 2, 2, c);
    for (let k = -1; k <= 1; k++) px(g, ft[0] + (front ? 2 : -2) + k, ft[1] + 1, CC.claw);
  };
  leg([12, 20], -s, true, false); leg([32, 19], s, true, true);
  ellipse(g, 23, 20, 15, 5, b); ellipse(g, 24, 23, 12, 2, sh);
  const rng = mulberry32(13 + pi);                                          // 얼룩덜룩한 피부
  speckle(g, 8, 15, 32, 10, dk, 0.14, rng); speckle(g, 8, 15, 32, 8, hi, 0.1, rng);
  for (let x = 10; x <= 36; x += 2) px(g, x, 15, dk);                      // 등의 돌기
  leg([14, 21], s, false, false); leg([34, 20], -s, false, true);
  limb(g, [36, 18], [40, 18], 4, 4, b);
  ellipse(g, 44, 18, 7, 4, b); ellipse(g, 45, 20, 5, 1.5, sh);
  line(g, 40, 21, 50, 20, CC.mouth);
  // 툭 튀어나온 큰 노란 눈
  ellipse(g, 42, 14, 2, 2, CC.eye); ellipse(g, 47, 14, 2, 2, CC.eye);
  rect(g, 42, 13, 1, 3, CC.pupil); rect(g, 47, 13, 1, 3, CC.pupil);
}

// ================================================================ 덜러: 색이 다 빠진 회색 사람. 얼굴은 흐릿하고 눈은 얼룩 두 개
const DL = { body: '#7e7e7c', sh: '#5e5e5c', edge: '#b4b4b2', eye: '#4a4a4a' };
function drawDullerArt(g, f) {
  const s = cyc(f) * 0.7;
  limb(g, [8, 26], [7 + s * 2, 33], 3, 3, DL.sh); limb(g, [7 + s * 2, 33], [7 + s * 2.5, 38], 3, 2, DL.sh);
  limb(g, [12, 26], [13 - s * 2, 33], 3, 3, DL.body, DL.sh); limb(g, [13 - s * 2, 33], [13 - s * 2.5, 38], 3, 2, DL.body, DL.sh);
  // 축 처진 어깨
  poly(g, [[4, 16], [7, 13], [13, 13], [16, 16], [15, 27], [5, 27]], DL.body); poly(g, [[11, 13], [13, 13], [16, 16], [15, 27], [11, 27]], DL.sh);
  line(g, 5, 16, 5, 26, DL.edge);                                          // 흐릿하게 밝은 가장자리
  limb(g, [5, 16], [4, 23 + s], 2, 2, DL.body, DL.sh); limb(g, [4, 23 + s], [4, 30 + s], 2, 2, DL.body);
  limb(g, [15, 16], [16, 23 - s], 2, 2, DL.sh); limb(g, [16, 23 - s], [16, 30 - s], 2, 2, DL.sh);
  // 앞으로 숙인 머리, 이목구비 없이 흐릿함
  ellipse(g, 10.5, 8, 4.5, 5, DL.body); ellipse(g, 13, 10, 1.8, 3, DL.sh);
  px(g, 7, 6, DL.edge); px(g, 7, 7, DL.edge); px(g, 8, 4, DL.edge); px(g, 9, 3, DL.edge);
  rect(g, 8, 8, 2, 1, DL.eye); rect(g, 12, 8, 2, 1, DL.eye);
}

// ================================================================ 시츠: 떠다니는 하얀 침대보 유령
const SH = { sheet: '#ecebe4', hi: '#ffffff', sh: '#c4c4c0', hole: '#141414' };
function drawSheetArt(g, f, mode) {
  const scared = mode === 'scared', haunt = mode === 'haunt', top = scared ? 10 : 2, hemY = scared ? 34 : 36;
  const hem = [];
  for (let x = 24; x >= 2; x -= 2) hem.push([x, hemY + Math.round(Math.sin(x * 0.7 + f * 0.785) * 2)]);   // 물결치는 밑단
  ellipse(g, 13, top + 10, 10, 10, SH.sheet);
  poly(g, [[3, top + 10], [23, top + 10], ...hem], SH.sheet);
  for (const x of [8, 14, 19]) for (let y = top + 15; y < hemY - 1; y++) px(g, x + Math.round(Math.sin(y * 0.4 + f * 0.785 + x)), y, SH.sh);   // 주름
  ellipse(g, 19, top + 9, 3, 6, SH.sh); ellipse(g, 9, top + 5, 3, 2, SH.hi);
  if (haunt) { ellipse(g, 9, top + 9, 2, 3, SH.hole); ellipse(g, 16, top + 9, 2, 3, SH.hole); }
  else if (scared) { ellipse(g, 9, top + 8, 1.5, 1.5, SH.hole); ellipse(g, 16, top + 8, 1.5, 1.5, SH.hole); ellipse(g, 12.5, top + 13, 1.2, 1.5, SH.hole); }
  else { ellipse(g, 9, top + 9, 1.4, 2, SH.hole); ellipse(g, 16, top + 9, 1.4, 2, SH.hole); }
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
      if (!m.revealed && m.gesture) { drawPlayerGesture(g, m, time, alpha, 'mimic'); break; }    // 플레이어 흉내 동작 중
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
      shadow(g, m.x, m.y + 10, 16, 6, alpha);
      drawPartygoer(g, m, m.moving ? ff : -1, time, alpha, left);   // 서 있으면 팔은 가만히, 풍선만 시간에 맞춰 흔들림
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
    case 'beast': {
      const st = m.state || 'patrol';
      const bf = st === 'windup' || st === 'dazed' ? Math.floor(time * (st === 'dazed' ? 6 : 12)) % FRAMES : ff;
      shadow(g, m.x, m.y + 9, 34, 8, alpha);
      const jx = st === 'windup' ? (Math.random() - 0.5) * ART * 3 : 0;    // 포효하며 몸을 떪
      blit(g, build(`bs:${bf}:${st}`, 64, 56, gg => drawBeastArt(gg, bf, st)), m.x + jx, m.y + 12, left, alpha);
      break;
    }
    case 'seaThing': {
      if (m.state !== 'hunt') {
        // 물속에 잠겨 있음: 몸은 안 보이고 희미한 그림자 + 가끔 올라오는 기포
        g.save(); g.globalAlpha *= alpha * 0.3;
        g.translate(snap(m.x), snap(m.y)); g.rotate(m.angle);
        g.fillStyle = 'rgb(4,12,16)'; g.beginPath(); g.ellipse(0, 0, 30, 11, 0, 0, Math.PI * 2); g.fill();
        g.restore();
        for (let k = 0; k < 3; k++) {
          const u = (time * 0.5 + k * 0.37) % 1;
          if (u > 0.3) continue;
          g.fillStyle = `rgba(200,230,235,${alpha * 0.5 * (1 - u / 0.3)})`;
          g.fillRect(snap(m.x + Math.sin(k * 2.3) * 14), snap(m.y - u * 12 - k * 3), ART, ART);
        }
        break;
      }
      // 사냥: 수면 아래 길쭉한 검은 몸 + 뒤로 퍼지는 흰 물결 + 수면을 가르는 지느러미
      g.save(); g.globalAlpha *= alpha;
      g.translate(snap(m.x), snap(m.y)); g.rotate(m.angle);
      g.fillStyle = 'rgba(2,8,12,0.55)'; g.beginPath(); g.ellipse(-8, 0, 46, 14, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,4,6,0.45)'; g.beginPath(); g.ellipse(6, 0, 26, 9, 0, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 7; k++) {
        const u = (time * 1.6 + k / 7) % 1, bx = -6 - u * 64, spread = 5 + u * 24;
        g.fillStyle = `rgba(230,240,240,${0.6 * (1 - u)})`;
        g.fillRect(bx, -spread, ART * 3, ART); g.fillRect(bx, spread, ART * 3, ART);
      }
      g.fillStyle = 'rgba(230,240,240,0.45)';                               // 머리가 밀어내는 물
      for (let k = -3; k <= 3; k++) g.fillRect(34 - Math.abs(k) * 2, k * 4, ART, ART * 2);
      g.restore();
      const fr = Math.floor(time * 8) % FRAMES;
      blit(g, build(`sea:fin:${fr}`, 14, 12, gg => drawSeaFinArt(gg, fr)), m.x - Math.cos(m.angle) * 8, m.y - Math.sin(m.angle) * 8 + 6, left, alpha);
      break;
    }
    case 'crawler': {
      const st = m.state;
      if (st === 'ceiling' || st === 'climb') {
        // 천장에 거꾸로 매달린 어두운 실루엣 (빛을 비추면 겨우 보임)
        const cf = Math.floor(time * 1.5) % FRAMES, cy = m.y - 44;
        const spr = build(`cr:sil:${cf}`, 56, 34, gg => drawCrawlerArt(gg, cf, CRS, false), [4, 4, 6]);
        g.save(); g.globalAlpha *= alpha * 0.35;
        g.translate(snap(m.x), snap(cy)); g.scale(left ? -1 : 1, -1);
        g.drawImage(spr, -28 * ART, -17 * ART, 56 * ART, 34 * ART);
        g.restore();
        const u = (time * 0.6 + (m.x + m.y) * 0.003) % 1;                   // 가끔 떨어지는 물방울
        if (u < 0.5) { g.fillStyle = `rgba(150,150,140,${alpha * 0.6})`; g.fillRect(snap(m.x + (left ? -10 : 10)), snap(cy + (u / 0.5) * 50), ART, ART); }
        break;
      }
      const open = st === 'chase' || st === 'drop', dy = st === 'drop' ? -22 : 0;
      shadow(g, m.x, m.y + 8, 24, 6, alpha * (st === 'drop' ? 0.6 : 1));
      blit(g, build(`cr:${ff}:${open}`, 56, 34, gg => drawCrawlerArt(gg, ff, CR, open)), m.x, m.y + 12 + dy, left, alpha);
      break;
    }
    case 'deathrat': {
      const rest = m.state === 'rest';
      const rf = rest ? Math.floor(time * 6) % FRAMES : ff;                 // 쉴 땐 헐떡임
      shadow(g, m.x, m.y + 7, 10, 3, alpha);
      const jx = m.state === 'stunned' ? (Math.random() - 0.5) * ART : 0;
      blit(g, build(`dr:${rf}:${rest}`, 22, 14, gg => drawDeathratArt(gg, rf, rest)), m.x + jx, m.y + 10, left, alpha);
      break;
    }
    case 'jackLantern': {
      shadow(g, m.x, m.y + 9, 12, 4, alpha);
      blit(g, build(`jl:${ff}:false`, 30, 70, gg => drawJackArt(gg, ff, false)), m.x, m.y + 12, left, alpha);
      break;
    }
    case 'camoCrawler': {
      if (m.state === 'camo') {           // 벽·바닥의 일부인 척: 거의 안 보이는 칙칙한 덩어리
        blit(g, build('cc:camo', 40, 16, gg => drawCamoLumpArt(gg), null), m.x, m.y + 10, left, alpha * 0.45);
        break;
      }
      const pi = Math.floor(time * 1.5) % CC.tones.length;                  // 피부색이 계속 바뀜
      shadow(g, m.x, m.y + 8, 24, 6, alpha);
      blit(g, build(`cc:${ff}:${pi}`, 52, 30, gg => drawCamoArt(gg, ff, pi)), m.x, m.y + 12, left, alpha);
      break;
    }
    case 'duller': {
      const df = m.moving !== false ? Math.floor((m.anim || 0) * 0.9) % FRAMES : 0;   // 느릿느릿 걸음
      shadow(g, m.x, m.y + 9, 9, 3, alpha * 0.8);
      blit(g, build(`dl:${df}`, 20, 40, gg => drawDullerArt(gg, df), [150, 150, 148]), m.x, m.y + 12, left, alpha * 0.88);
      break;
    }
    case 'sheet': {
      const st = m.state || 'drift', sf = Math.floor(time * 6) % FRAMES;
      const bob = Math.sin(time * 2.4 + m.x * 0.05) * 2 * ART;                // 바닥에서 떠서 둥실거림
      shadow(g, m.x, m.y + 9, 11, 4, alpha * 0.5);
      const jx = st === 'scared' ? (Math.random() - 0.5) * ART * 2 : 0;
      blit(g, build(`sh:${sf}:${st}`, 26, 40, gg => drawSheetArt(gg, sf, st), [70, 70, 78]), m.x + jx, m.y + 12 - 6 * ART + bob, left, alpha * 0.85);
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
  if (m.type === 'jackLantern') {           // 멀리서도 보이는 호박등 불빛 + 빛나는 얼굴
    const chase = m.state === 'chase', left = Math.cos(m.angle) < -0.2;
    const fl = chase ? 0.8 + Math.random() * 0.4 : 0.85 + Math.sin(time * 7 + m.x) * 0.08 + Math.sin(time * 13) * 0.05;
    const hy = m.y + 12 - 70 * ART + 12 * ART, R = chase ? 72 : 56;
    const gr = g.createRadialGradient(m.x, hy, 0, m.x, hy, R);
    gr.addColorStop(0, `rgba(255,150,40,${0.3 * fl * alpha})`); gr.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = gr; g.fillRect(m.x - R, hy - R, R * 2, R * 2);
    blit(g, build('jl:face', 30, 70, gg => drawJackFace(gg, JL.lit, JL.litHi, (x, y) => gg.clearRect(x, y, 2, 1)), null), m.x, m.y + 12, left, alpha * Math.min(1, fl));
    return;
  }
  if (m.type === 'beast' && m.state !== 'dazed') {   // 어둠 속 주황 안광
    const left = Math.cos(m.angle) < -0.2, lean = m.state === 'charge' ? 4 : 0;
    const ex = m.x + ((left ? 63 - 53 : 53) - 32) * ART, ey = m.y + 12 - 56 * ART + (23 + lean) * ART;
    const k = m.state === 'windup' || m.state === 'charge' ? 0.55 : 0.3;
    const gr = g.createRadialGradient(ex, ey, 0, ex, ey, 16);
    gr.addColorStop(0, `rgba(255,140,30,${k * alpha})`); gr.addColorStop(1, 'rgba(255,140,30,0)');
    g.fillStyle = gr; g.fillRect(ex - 16, ey - 16, 32, 32);
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
  let pts, w, h, foot, col = '240,234,210';
  if (m.type === 'howler') { pts = [[19, 10], [25, 10]]; w = 44; h = 82; foot = 14; }
  else if (m.type === 'hound') { pts = [[47, 8], [52, 8]]; w = 60; h = 38; foot = 12; }
  else if (m.type === 'skinStealer' && m.revealed) { pts = [[15, 7], [21, 7]]; w = 36; h = 78; foot = 14; }
  else if (m.type === 'animation' && m.state === 'hunt') { pts = [[9, 7], [14, 7]]; w = 24; h = 66; foot = 12; }
  else if (m.type === 'beast' && m.state !== 'dazed') { const l = m.state === 'charge' ? 4 : 0; pts = [[51, 22 + l], [55, 23 + l]]; w = 64; h = 56; foot = 12; col = '255,150,40'; }
  else if (m.type === 'crawler' && m.state === 'chase') { pts = [[50, 13], [53, 13]]; w = 56; h = 34; foot = 12; }
  else if (m.type === 'deathrat' && m.state !== 'rest') { pts = [[17, 6]]; w = 22; h = 14; foot = 10; col = '255,50,30'; }
  else if (m.type === 'camoCrawler' && m.state !== 'camo') { pts = [[42, 14], [47, 14]]; w = 52; h = 30; foot = 12; col = '250,215,40'; }
  else return;
  g.fillStyle = `rgba(${col},${(0.5 + Math.random() * 0.3) * alpha})`;
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
  else if (type === 'partygoer') spr = build(`pgj:${f}`, PG_W, PG_H, gg => { drawPartygoerArt(gg, f, true); { const hd = pgArms(f, true).R.hd; drawPGBalloonArt(gg, hd, pgBalloon(f * 0.45, false, false, hd).map((v, i) => i ? Math.max(v, 7) : Math.min(v, 38)), f * 0.45); } });
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
  else if (type === 'beast') spr = build(`bs:${f}:windup`, 64, 56, gg => drawBeastArt(gg, f, 'windup'));
  else if (type === 'seaThing') spr = build(`sea:js:${f}`, 56, 64, gg => drawSeaThingArt(gg, f));
  else if (type === 'crawler') spr = build(`cr:${f}:true`, 56, 34, gg => drawCrawlerArt(gg, f, CR, true));
  else if (type === 'deathrat') spr = build(`dr:${f}:false`, 22, 14, gg => drawDeathratArt(gg, f, false));
  else if (type === 'jackLantern') spr = build(`jl:${f}:true`, 30, 70, gg => drawJackArt(gg, f, true));
  else if (type === 'camoCrawler') spr = build(`cc:${f}:${f % CC.tones.length}`, 52, 30, gg => drawCamoArt(gg, f, f % CC.tones.length));
  else if (type === 'duller') spr = build(`dl:${f}`, 20, 40, gg => drawDullerArt(gg, f), [150, 150, 148]);
  else if (type === 'sheet') spr = build(`sh:${f}:haunt`, 26, 40, gg => drawSheetArt(gg, f, 'haunt'), [70, 70, 78]);
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
  text = tr(text);
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
PART_ART.gas = g => {
  rect(g, 1, 0, 5, 3, '#a8221a'); g.clearRect(2, 1, 3, 1);                                // 손잡이
  rect(g, 7, 1, 2, 2, '#f4d020'); px(g, 7, 1, '#fff08a');                                  // 노란 주둥이 마개
  rect(g, 1, 3, 8, 9, '#c8281e'); rect(g, 1, 3, 8, 1, '#e8584a'); rect(g, 8, 4, 1, 8, '#8a1a14');   // 빨간 기름통
  line(g, 2, 5, 6, 10, '#8a1a14'); line(g, 6, 5, 2, 10, '#8a1a14');                        // X자 눌림 자국
};
const PART_GLOW = { fuse: '255,180,70', radio: '140,230,140', files: '240,230,180', toys: '255,140,200', gas: '255,120,60' };
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
    : kind === 'gas'
    ? build('depot:gas', 26, 22, gg => {
      rect(gg, 5, 4, 16, 18, '#5a6a3a'); rect(gg, 15, 4, 6, 18, '#46542c');                  // 녹슨 연료 드럼
      rect(gg, 5, 8, 16, 1, '#3a4626'); rect(gg, 5, 16, 16, 1, '#3a4626');                    // 테두리 띠
      ellipse(gg, 13, 4, 8, 2, '#6e7e4a'); ellipse(gg, 13, 4, 2, 1, '#2a2a28');                // 뚜껑 + 주입구
      poly(gg, [[9, 0], [17, 0], [14, 4], [12, 4]], '#9a9a90'); rect(gg, 9, 0, 8, 1, '#c8c8c0');   // 깔때기
      rect(gg, 9, 10, 8, 5, '#e8c53a'); px(gg, 13, 11, '#c8322a'); rect(gg, 12, 12, 3, 2, '#c8322a');   // 인화성 표시
      for (const [x, y] of [[7, 18], [19, 12], [6, 6], [18, 19]]) px(gg, x, y, '#7c4c2c');
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
  const slim = kind === 'radio' || kind === 'gas';                         // 작은 표시등 (드럼 몸통 위)
  const w = total * 7, x0 = dp.x - w / 2 + 1, y0 = slim ? dp.y - 12 : dp.y - 22;
  for (let i = 0; i < total; i++) {
    const on = i < done;
    g.fillStyle = on ? (unlocked ? '#6edc78' : '#ffd25a') : (Math.floor(t * 2) % 2 ? '#5a1e18' : '#3a1410');
    g.fillRect(snap(x0 + i * 7), snap(y0), 5, slim ? 3 : 8);
  }
}

/** 작동 장치: 벽에 붙은 증기 밸브(valve) / 배수 밸브(drain), 바닥에 놓인 발전기(generator). prog 0~1 */
export function drawStation(g, st, kind, prog, t) {
  const done = prog >= 1;
  const glow = done ? '110,220,120' : kind === 'drain' || kind === 'pump' ? '120,200,255' : kind === 'generator' ? '255,200,80' : '255,140,90';
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
  const blue = kind === 'drain' || kind === 'pump', boiler = kind === 'boiler';
  const spr = build(`st:wall:${kind}`, 32, 22, gg => {
    if (boiler) {                                                                       // 보일러: 관 위의 둥근 압력계
      rect(gg, 5, 6, 3, 4, '#4a4a48');
      ellipse(gg, 6, 4, 4, 4, '#c8a858'); ellipse(gg, 6, 4, 3, 3, '#f0ecdc');
      px(gg, 4, 2, '#c8322a'); px(gg, 5, 1, '#c8322a'); px(gg, 7, 1, '#c8322a'); px(gg, 8, 2, '#c8322a');   // 눈금 (위쪽이 위험 구간)
    }
    const pipe = blue ? '#8aa8b8' : '#6a5a4a', pipeHi = blue ? '#c8dce4' : '#9a8a6a';
    rect(gg, 0, 9, 32, 5, pipe); rect(gg, 0, 9, 32, 1, pipeHi);                       // 벽을 따라가는 관
    rect(gg, 14, 13, 4, 9, pipe); rect(gg, 14, 13, 1, 9, pipeHi);                     // 아래로 내려가는 관
    rect(gg, 13, 6, 6, 10, '#4a4a48');                                                 // 밸브 몸통
    const W = blue ? '#2f7fb0' : '#b8322a', D = blue ? '#164a6a' : '#6a1410';
    ellipse(gg, 16, 9, 8, 7.5, W); ellipse(gg, 16, 9, 5.5, 5, D);
    rect(gg, 15, 2, 2, 15, W); rect(gg, 9, 8, 15, 2, W); ellipse(gg, 16, 9, 2, 2, '#2a2a28');
  });
  blit(g, spr, cx, cy + 13);
  if (boiler) {                                                                         // 압력계 바늘: 잠그기 전엔 위험 구간에서 떨림
    const gx = snap(cx - 16 * ART) + 6.5 * ART, gy = snap(cy + 13 - 22 * ART) + 4.5 * ART;
    const a = done ? -Math.PI * 0.85 : -Math.PI * 0.3 + Math.sin(t * 23 + st.phase) * 0.15 + (Math.random() - 0.5) * 0.2;
    g.fillStyle = '#1a1a18';
    for (let i = 0; i < 3; i++) g.fillRect(snap(gx + Math.cos(a) * i * ART - ART / 2), snap(gy + Math.sin(a) * i * ART - ART / 2), ART, ART);
  }
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
  twerk:  { name: '트월킹', dur: 4 },
};
/**
 * 동작 중인 플레이어 그리기 (p.gesture = { g, t }). 몸은 기존 스프라이트를 움직이고, 팔·손은 위에 덧그린다.
 */
export function drawPlayerGesture(g, p, t, alpha = 1, variant = 'player') {
  const G = p.gesture, u = G.t;
  if (G.g === 'dance1') {        // 좌우로 들썩이며 깡충깡충, 두 박자마다 방향을 바꾼다
    const beat = u * 4, hop = Math.abs(Math.sin(beat * Math.PI)) * 7, sway = Math.sin(beat * Math.PI / 2) * 6;
    drawHuman(g, { ...p, x: p.x + sway, y: p.y - hop, angle: Math.floor(beat / 2) % 2 ? Math.PI : 0, moving: true, walkPhase: beat * 3 }, variant, alpha);
    drawNotes(g, p, u, alpha);
    return;
  }
  if (G.g === 'dance2') {        // 빙글빙글 돌면서 위아래로
    const bob = Math.abs(Math.sin(u * 9)) * 5;
    drawHuman(g, { ...p, y: p.y - bob, angle: u * 7, moving: true, walkPhase: u * 10 }, variant, alpha);
    drawNotes(g, p, u, alpha);
    return;
  }
  if (G.g === 'twerk') {         // 옆으로 서서 허리를 숙이고 엉덩이를 빠르게 튕긴다 (프레임 4장, 초당 14장)
    const color = SUIT_BASE[p.color] ? p.color : 'default', f = Math.floor(u * 14) % TWERK.length;
    const left = dirOf(p.angle) === 'left';
    shadow(g, p.x, p.y + 8, 15, 4, alpha);
    blit(g, twerkSprite(variant, color, f), p.x, p.y + 10, left, alpha);
    drawNotes(g, p, u, alpha);
    return;
  }
  // 뻐큐 / 가리키기: 그 자세로 그린 캐릭터 스프라이트 (바라보는 방향별로 앞/뒤/옆 모습)
  const color = SUIT_BASE[p.color] ? p.color : 'default', dir = dirOf(p.angle);
  shadow(g, p.x, p.y + 8, 10, 4, alpha);
  blit(g, posedSprite(dir, variant, color, G.g), p.x, p.y + 10, dir === 'left', alpha);
}
/**
 * 트월킹 (옆모습, 오른쪽을 봄 — 왼쪽은 뒤집어 그림): 허리를 앞으로 숙이고 두 손은 굽힌 무릎에,
 * 엉덩이를 뒤로 쭉 뺀 채 위아래로 빠르게 튕긴다. 프레임별 [엉덩이 높이 dy, 납작해짐 sq(0/1)]
 */
const TWERK = [[0, 0], [-2, 0], [-3, 0], [1, 1]];
const TW_W = 34, TW_H = 34;
function twerkSprite(variant, color, f) {
  return build(`tw:${variant}:${color}:${f}`, TW_W, TW_H, g => {
    g.translate(1, 0);
    const P = suitPalette(color, variant), [d, sq] = TWERK[f];
    const hip = [11, 17 + d], kF = [22, 22], aF = [18, 29], kB = [19, 22], aB = [13, 29], sh = [21, 8];
    const boot = a => { rect(g, a[0] - 1, 28, 4, 1, P.tape); rect(g, a[0] - 1, 29, 5, 2, P.boot); rect(g, a[0] - 1, 31, 5, 1, P.sole); };
    // 뒷다리 (그늘색)
    limb(g, hip, kB, 4, 3, P.sh, P.dk); limb(g, kB, aB, 3, 3, P.sh, P.dk); boot(aB);
    // 몸통: 엉덩이 위에서 어깨까지 비스듬히 숙인 등 (등선 / 배선)
    poly(g, [[hip[0] - 2, hip[1] - 4], [sh[0] - 2, sh[1] - 3], [sh[0] + 1, sh[1] - 2], [sh[0] + 2, sh[1] + 2], [hip[0] + 3, hip[1] + 1]], P.suit);
    line(g, hip[0] + 3, hip[1], sh[0] + 1, sh[1] + 2, P.sh);                    // 배 쪽 그늘
    line(g, hip[0] + 1, hip[1] - 3, hip[0] + 4, hip[1] + 1, P.dk);              // 허리띠
    px(g, hip[0] + 2, hip[1] - 2, P.tape);
    // 산소통 (등 위에 비스듬히)
    limb(g, [hip[0] + 3, hip[1] - 5], [sh[0] - 3, sh[1] - 2], 3, 3, P.tank, P.tankSh);
    line(g, hip[0] + 3, hip[1] - 6, sh[0] - 3, sh[1] - 3, P.tankHi);
    // 엉덩이: 뒤로 쭉 빼서 둥글게. 내려앉을 땐 납작하게 퍼진다
    const bx = hip[0] - 4, by = hip[1] - 1 + sq, rx = 5 + sq, ry = 4.5 - sq;
    ellipse(g, bx, by, rx, ry, P.sh);
    ellipse(g, bx - 0.5, by - 0.8, rx - 1, ry - 1.2, P.suit);
    px(g, bx - 2, by - 2 + sq, P.hi); px(g, bx - 1, by - 3 + sq, P.hi); px(g, bx - 3, by - 1 + sq, P.hi); px(g, bx, by - 3 + sq, P.hi);
    // 앞다리: 엉덩이 → 앞으로 굽힌 무릎 → 발목
    limb(g, [hip[0] + 1, hip[1] + 1], kF, 4, 3, P.suit, P.sh); limb(g, kF, aF, 3, 3, P.suit, P.sh); boot(aF);
    line(g, hip[0] + 2, hip[1] + 3, kF[0] - 1, kF[1] + 1, P.sh);                // 허벅지 아래 그늘
    line(g, bx - 1, by + ry, hip[0] + 1, hip[1] + 3, P.dk);                    // 엉덩이와 허벅지 사이 주름
    // 팔: 어깨에서 내려와 무릎을 짚는다
    limb(g, [sh[0], sh[1] + 2], [kF[0], kF[1] - 3], 2, 2, P.hi, P.sh);
    rect(g, kF[0] - 1, kF[1] - 3, 2, 1, P.tape); rect(g, kF[0] - 1, kF[1] - 2, 4, 2, P.glove);
    // 머리 (앞으로 숙여 아래를 봄: 후드 + 방독면)
    const hx = sh[0] + 3, hy = sh[1] - 2;
    ellipse(g, hx, hy, 4, 4.5, P.suit); ellipse(g, hx - 1, hy - 2, 2, 1.6, P.hi); ellipse(g, hx - 2, hy + 2, 2, 2, P.sh);
    ellipse(g, hx + 3, hy + 1.5, 2.4, 3.2, P.mask); px(g, hx + 2, hy - 1, P.maskHi);
    rect(g, hx + 2, hy - 1, 3, 3, P.visor); px(g, hx + 2, hy - 1, P.visorHi); px(g, hx + 3, hy - 1, P.visorHi);
    ellipse(g, hx + 4, hy + 4, 1.6, 1.4, P.filter); px(g, hx + 4, hy + 4, P.filterHi);
    // 튕길 때 흔들림 선
    if (d <= -2) { line(g, bx - rx - 2, by - 3, bx - rx - 2, by - 1, P.tape); line(g, bx - rx - 2, by + 2, bx - rx - 2, by + 3, P.tape); }
  });
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
