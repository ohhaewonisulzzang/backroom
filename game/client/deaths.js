import { mulberry32 } from '../../shared/utils.js';
import { drawJumpscareSprite, ART } from './sprites.js';

/**
 * 사망 연출 — 엔티티마다 다르다 (조금 잔인함).
 *  화면 위 오버레이: drawDeathOverlay(r, game)      (game.deathT 동안, k = 0 → 1)
 *  월드 위 흔적:     drawGore(ctx, game)             (핏자국, 터진 살점 — 모두에게 보인다)
 */
export const DEATH_DURATION = { horde: 2.8, howler: 2.4, hound: 2.4, smiler: 2.6, skinStealer: 2.6, partygoer: 2.6, deathmoth: 2.6, wretch: 2.6, scratcher: 2.4, sanity: 3.0 };

const ease = u => u * u * (3 - 2 * u);
/** 설정 (매 프레임 drawDeathOverlay 에서 갱신): 잔인한 연출 / 사망 점프스케어 */
let GORE = true, SCARE = true;
const seg = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));

/** 핏방울 무리 (seed 고정 → 흔들리지 않음) */
function splat(ctx, x, y, r, seed, col = '120,0,0', alpha = 1) {
  if (!GORE) return;
  const rng = mulberry32(seed);
  ctx.fillStyle = `rgba(${col},${alpha})`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, d = r * (0.8 + rng() * 1.6), rr = r * (0.12 + rng() * 0.3);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, Math.PI * 2); ctx.fill();
  }
}
/** 위에서 흘러내리는 피 */
function drips(ctx, W, H, k, seed, n = 18) {
  if (!GORE) return;
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = rng() * W, w = 6 + rng() * 22, len = H * (0.1 + rng() * 0.7) * ease(k);
    ctx.fillStyle = `rgba(${110 + rng() * 40},0,0,0.92)`;
    ctx.fillRect(x, 0, w, len);
    ctx.beginPath(); ctx.arc(x + w / 2, len, w / 2, 0, Math.PI * 2); ctx.fill();
  }
}
/** 할퀸 자국 (굵은 사선, 가장자리는 어둡게) */
function gash(ctx, x0, y0, x1, y1, w, u) {
  if (!GORE) return;
  const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(40,0,0,0.95)'; ctx.lineWidth = w * 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
  ctx.strokeStyle = 'rgba(170,10,10,0.95)'; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,120,110,0.6)'; ctx.lineWidth = w * 0.18;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
}
/** 이빨 줄 (위/아래 턱) */
function teethRow(ctx, W, y, dir, h, n, col = '#e9e2cc') {
  const tw = W / n;
  ctx.fillStyle = dir > 0 ? '#2a0303' : '#2a0303';
  ctx.fillRect(0, dir > 0 ? y - H_BIG : y, W, H_BIG);
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * tw, y); ctx.lineTo(i * tw + tw, y); ctx.lineTo(i * tw + tw / 2, y + dir * h * (0.7 + ((i * 37) % 10) / 30));
    ctx.closePath(); ctx.fill();
  }
}
const H_BIG = 4000;

/** 4x4 Bayer 행렬 (반투명을 점무늬 디더링으로) */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

/**
 * 픽셀 느낌: 화면의 1/P 크기 캔버스에 그린 뒤
 *  - 알파는 4단계로 줄이고 (단계 사이는 Bayer 디더링)
 *  - 색은 채널당 8단계로 줄여서
 *  - 부드럽게 하지 않고 P 배로 확대한다
 */
export function drawDeathOverlay(r, game) {
  GORE = game.settings?.gore !== false; SCARE = game.settings?.deathScares !== false;
  const { W, H } = r, P = Math.max(5, Math.round(Math.min(W, H) / 100));   // 720p 기준 7배 픽셀
  const lw = Math.ceil(W / P), lh = Math.ceil(H / P);
  if (!r.deathCanvas) r.deathCanvas = document.createElement('canvas');
  const low = r.deathCanvas;
  if (low.width !== lw || low.height !== lh) { low.width = lw; low.height = lh; }
  const lctx = low.getContext('2d', { willReadFrequently: true });
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.clearRect(0, 0, lw, lh);
  lctx.setTransform(1 / P, 0, 0, 1 / P, 0, 0);
  lctx.imageSmoothingEnabled = false;
  drawDeathScene({ ctx: lctx, W, H, base: [1 / P, 0, 0, 1 / P, 0, 0] }, game);
  // 색 줄이기 + 디더링
  const img = lctx.getImageData(0, 0, lw, lh), d = img.data;
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
    const i = (y * lw + x) * 4, a = d[i + 3] / 255;
    if (a <= 0) continue;
    // 반투명은 4단계로만 (단계 사이만 살짝 디더링) → 화면 전체가 지글거리지 않게
    d[i + 3] = Math.round(Math.max(0, Math.min(3, Math.round(a * 3 + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.8))) * 85);
    d[i] = Math.min(255, Math.round(d[i] / 36) * 36);
    d[i + 1] = Math.min(255, Math.round(d[i + 1] / 36) * 36);
    d[i + 2] = Math.min(255, Math.round(d[i + 2] / 36) * 36);
  }
  lctx.putImageData(img, 0, 0);
  const ctx = r.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(low, 0, 0, lw * P, lh * P);
}

function drawDeathScene(r, game) {
  const { ctx, W, H } = r, type = game.killerType || 'howler';
  const dur = game.deathDuration, k = 1 - Math.max(0, game.deathT) / dur, t = game.time, seed = game.deathSeed || 1;
  const M = Math.min(W, H), cx = W / 2, cy = H / 2;
  ctx.setTransform(...r.base);
  const shake = (1 - k) * 30;
  const step = 1 / r.base[0], snapP = v => Math.round(v / step) * step;
  const jx = snapP((Math.random() - 0.5) * shake), jy = snapP((Math.random() - 0.5) * shake);
  const lunge = (size0, size1, a, b) => {           // 엔티티가 화면으로 덮쳐온다 (설정에서 끌 수 있음)
    if (!SCARE) return;
    const u = ease(seg(k, a, b));
    drawJumpscareSprite(ctx, type, t, cx + jx, cy + jy, M * (size0 + (size1 - size0) * u));
  };
  const redWash = a => { ctx.fillStyle = `rgba(${90 + Math.random() * 50},0,0,${a})`; ctx.fillRect(0, 0, W, H); };
  const fadeBlack = a => { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H); };

  switch (type) {
    case 'howler': {    // 덮쳐서 세 번 할퀸다 → 쓰러진다
      redWash(0.35 + k * 0.3);
      if (k < 0.45) lunge(0.6, 1.3, 0, 0.3);
      const marks = [[-0.1, 0.05, 0.9, 0.95], [0.05, -0.05, 1.1, 0.75], [-0.05, 0.3, 0.75, 1.1]];
      marks.forEach(([a, b, c, d], i) => {
        const u = seg(k, 0.3 + i * 0.1, 0.42 + i * 0.1);
        if (u > 0) gash(ctx, W * a, H * b, W * c, H * d, M * 0.05, ease(u));
      });
      if (k > 0.35) splat(ctx, cx + M * 0.1, cy, M * 0.08, seed, '140,0,0', 0.9);
      if (k > 0.5) drips(ctx, W, H, seg(k, 0.5, 1), seed);
      fadeBlack(seg(k, 0.75, 1));
      break;
    }
    case 'hound': {     // 달려들어 문다 — 위아래 턱이 닫히고 흔든다
      redWash(0.3);
      lunge(0.5, 1.1, 0, 0.35);
      const u = ease(seg(k, 0.3, 0.5)), gap = H * 0.5 * (1 - u);
      const sx = Math.sin(t * 60) * 18 * seg(k, 0.5, 0.85);
      ctx.save(); ctx.translate(sx, 0);
      teethRow(ctx, W, cy - gap, 1, M * 0.12, 14);
      teethRow(ctx, W, cy + gap, -1, M * 0.12, 14);
      ctx.restore();
      if (k > 0.5) { splat(ctx, cx - M * 0.2, cy, M * 0.1, seed); splat(ctx, cx + M * 0.25, cy - 30, M * 0.07, seed + 3); drips(ctx, W, H, seg(k, 0.5, 1), seed); }
      fadeBlack(seg(k, 0.8, 1));
      break;
    }
    case 'smiler': {    // 어둠이 조여 오고, 미소가 커지다 꽉 문다
      fadeBlack(1);
      if (!SCARE) { fadeBlack(seg(k, 0.6, 1)); break; }
      const u = ease(seg(k, 0, 0.55));
      const w = M * (0.3 + u * 1.6), h = w * 0.32, close = ease(seg(k, 0.55, 0.7));
      ctx.save(); ctx.translate(cx + jx, cy + jy);
      // 눈
      ctx.fillStyle = '#f6f3e6';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * w * 0.22, -h * 1.3, w * 0.05, w * 0.03 * (1 - close * 0.9), 0, 0, Math.PI * 2); ctx.fill(); }
      // 웃는 입 (이빨) → 닫힘
      const open = h * (1 - close);
      ctx.beginPath(); ctx.moveTo(-w / 2, -open * 0.2);
      ctx.quadraticCurveTo(0, h + open, w / 2, -open * 0.2); ctx.quadraticCurveTo(0, h * 0.6, -w / 2, -open * 0.2); ctx.fill();
      ctx.fillStyle = '#000';
      for (let i = 1; i < 16; i++) { const x = -w / 2 + (w * i) / 16; ctx.fillRect(x - 1.5, -open, 3, h * 1.5); }
      ctx.restore();
      if (k > 0.68) { splat(ctx, cx, cy + h * 0.4, M * 0.14, seed, '150,0,0'); splat(ctx, cx - M * 0.3, cy + 20, M * 0.06, seed + 9, '150,0,0'); drips(ctx, W, H, seg(k, 0.7, 1), seed, 10); }
      fadeBlack(seg(k, 0.85, 1));
      break;
    }
    case 'skinStealer': {   // 얼굴이 세로로 찢어지며 화면을 삼킨다
      redWash(0.25);
      if (k < 0.5) lunge(0.7, 1.2, 0, 0.4);
      const u = ease(seg(k, 0.35, 0.8)), mw = W * 0.08 + W * 0.7 * u, mh = H * 0.15 + H * 1.1 * u;
      if (u > 0 && SCARE) {
        ctx.fillStyle = '#4a0606';
        ctx.beginPath(); ctx.ellipse(cx, cy, mw * 0.62, mh * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e9e2cc';
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2, ex = cx + Math.cos(a) * mw * 0.55, ey = cy + Math.sin(a) * mh * 0.53;
          const ix = cx + Math.cos(a) * mw * 0.42, iy = cy + Math.sin(a) * mh * 0.42;
          ctx.beginPath(); ctx.moveTo(ex + Math.sin(a) * 9, ey - Math.cos(a) * 9); ctx.lineTo(ex - Math.sin(a) * 9, ey + Math.cos(a) * 9); ctx.lineTo(ix, iy); ctx.fill();
        }
        ctx.fillStyle = '#050000';
        ctx.beginPath(); ctx.ellipse(cx, cy, mw * 0.4, mh * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      }
      fadeBlack(seg(k, 0.82, 1));
      break;
    }
    case 'partygoer': {     // 풍선이 터지고, 피로 된 색종이와 낙서
      redWash(0.2);
      if (k < 0.55) lunge(0.6, 1.1, 0, 0.4);
      const rng = mulberry32(seed);
      const u = seg(k, 0.35, 1);
      const cols = ['216,49,43', '232,197,58', '63,127,208', '224,111,176', '130,0,0', '130,0,0', '130,0,0'];
      for (let i = 0; i < 140; i++) {
        const x = rng() * W, y0 = -rng() * H, sp = 0.6 + rng() * 1.4;
        ctx.fillStyle = `rgba(${cols[Math.floor(rng() * cols.length)]},0.95)`;
        ctx.save(); ctx.translate(x + Math.sin(t * 3 + i) * 10, y0 + u * H * 1.6 * sp); ctx.rotate(t * 4 + i);
        ctx.fillRect(-6, -3, 12, 6); ctx.restore();
      }
      if (k > 0.4) { splat(ctx, cx, cy, M * 0.12, seed, '150,0,0'); }
      if (k > 0.5) {
        ctx.font = `${Math.round(M * 0.11)}px VT323, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(200,10,10,${seg(k, 0.5, 0.6)})`;
        ctx.save(); ctx.translate(cx, cy - M * 0.25); ctx.rotate(-0.12); ctx.fillText('HAPPY BIRTHDAY =)', 0, 0); ctx.restore();
      }
      fadeBlack(seg(k, 0.85, 1));
      break;
    }
    case 'deathmoth': {     // 날개가 화면을 덮고 나방 떼가 파먹는다
      fadeBlack(0.5);
      lunge(0.8, 1.6, 0, 0.45);
      const rng = mulberry32(seed), n = Math.floor(260 * seg(k, 0.3, 0.9));
      for (let i = 0; i < n; i++) {
        const x = rng() * W, y = rng() * H, s = 6 + rng() * 14, fl = Math.sin(t * 40 + i) * 0.5 + 0.5;
        ctx.fillStyle = 'rgba(70,56,40,0.95)';
        ctx.beginPath(); ctx.ellipse(x - s * 0.5, y, s * 0.6, s * (0.25 + fl * 0.3), -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + s * 0.5, y, s * 0.6, s * (0.25 + fl * 0.3), 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(200,30,20,0.9)'; ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      if (k > 0.55) splat(ctx, cx, cy, M * 0.09, seed, '110,0,0', 0.8);
      fadeBlack(seg(k, 0.85, 1));
      break;
    }
    case 'wretch': {        // 붉은 살점 촉수가 사방에서 기어와 감싼다
      redWash(0.3);
      if (k < 0.4) lunge(0.6, 1.0, 0, 0.35);
      const rng = mulberry32(seed), u = ease(seg(k, 0.2, 0.85));
      for (let i = 0; i < 22; i++) {
        const side = i % 4, p = rng();
        const sx = side === 0 ? 0 : side === 1 ? W : p * W, sy = side === 2 ? 0 : side === 3 ? H : p * H;
        const ex = sx + (cx - sx) * u * (0.8 + rng() * 0.3), ey = sy + (cy - sy) * u * (0.8 + rng() * 0.3);
        const wob = Math.sin(t * 6 + i) * 40;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#3a0505'; ctx.lineWidth = 34 + rng() * 20;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + ex) / 2 + wob, (sy + ey) / 2 - wob, ex, ey); ctx.stroke();
        ctx.strokeStyle = '#8a1a14'; ctx.lineWidth = 18 + rng() * 10;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + ex) / 2 + wob, (sy + ey) / 2 - wob, ex, ey); ctx.stroke();
      }
      if (k > 0.6) drips(ctx, W, H, seg(k, 0.6, 1), seed, 12);
      fadeBlack(seg(k, 0.85, 1));
      break;
    }
    case 'scratcher': {     // 미친 듯이 할퀸다 — 자국이 계속 쌓인다
      redWash(0.3);
      if (k < 0.3) lunge(0.6, 1.0, 0, 0.25);
      const rng = mulberry32(seed), n = Math.floor(34 * seg(k, 0.2, 0.85));
      for (let i = 0; i < n; i++) {
        const x = rng() * W, y = rng() * H, a = -0.8 + rng() * 0.5, L = M * (0.2 + rng() * 0.35);
        for (let c = 0; c < 3; c++) {
          const ox = c * 18;
          gash(ctx, x + ox, y, x + ox + Math.cos(a) * L, y - Math.sin(a) * L, 7, 1);
        }
      }
      if (k > 0.5) drips(ctx, W, H, seg(k, 0.5, 1), seed, 14);
      fadeBlack(seg(k, 0.82, 1));
      break;
    }
    case 'horde': {         // 괴물 떼: 왼쪽에서 수십 마리가 덮쳐 와 찢어발긴다
      redWash(0.3 + k * 0.3);
      if (SCARE) {
        const rng = mulberry32(seed), n = 14;
        for (let i = 0; i < n; i++) {
          const delay = rng() * 0.35, u = ease(seg(k, delay, delay + 0.4));
          const x = -M * 0.4 + (cx + (rng() - 0.3) * W * 0.6 + M * 0.4) * u, y = rng() * H;
          drawJumpscareSprite(ctx, 'howler', t + i, x + jx, y + jy, M * (0.5 + rng() * 0.7));
        }
      }
      for (let i = 0; i < 6; i++) {
        const u = seg(k, 0.35 + i * 0.07, 0.45 + i * 0.07);
        if (u > 0) gash(ctx, W * (0.1 + i * 0.13), H * -0.05, W * (0.0 + i * 0.16), H * 1.05, M * 0.035, ease(u));
      }
      if (k > 0.4) { splat(ctx, cx, cy, M * 0.12, seed, '140,0,0'); splat(ctx, cx - M * 0.35, cy + 40, M * 0.08, seed + 5); }
      if (k > 0.5) drips(ctx, W, H, seg(k, 0.5, 1), seed, 22);
      fadeBlack(seg(k, 0.8, 1));
      break;
    }
    case 'sanity': {        // 환각: 수많은 미소 → 머리가 터진다
      const pre = seg(k, 0, 0.45);
      ctx.fillStyle = `rgba(20,0,30,${0.4 + pre * 0.4})`; ctx.fillRect(0, 0, W, H);
      if (k < 0.5) {
        const rng = mulberry32(seed);
        for (let i = 0; i < (SCARE ? 10 + pre * 30 : 0); i++) {
          if (Math.random() < 0.3) continue;
          drawJumpscareSprite(ctx, 'smiler', t + i, rng() * W, rng() * H, M * (0.12 + rng() * 0.3));
        }
        // 화면이 부풀어 오른다
        const pulse = 1 + Math.sin(t * 30) * 0.03 * pre;
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * pre})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, M * 0.2 * pulse * (1 + pre), 0, Math.PI * 2); ctx.stroke();
      } else {
        // 펑 — 하얀 섬광 → 붉은 폭발 → 살점이 화면에 들러붙는다
        const u = seg(k, 0.45, 0.55);
        if (u < 1) { ctx.fillStyle = `rgba(255,250,240,${1 - u})`; ctx.fillRect(0, 0, W, H); }
        redWash(0.65);
        const rng = mulberry32(seed + 1), b = ease(seg(k, 0.45, 0.75));
        for (let i = 0; i < 40; i++) {
          const a = rng() * Math.PI * 2, d = M * (0.1 + rng() * 0.9) * b;
          splat(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, M * (0.02 + rng() * 0.05), seed + i, rng() < 0.3 ? '190,60,60' : '110,0,0');
        }
        drips(ctx, W, H, seg(k, 0.55, 1), seed, 24);
      }
      fadeBlack(seg(k, 0.85, 1));
      break;
    }
    default: {
      redWash(0.6);
      lunge(0.7, 1.2, 0, 1);
    }
  }
}

/** 월드용 핏자국: 원 대신 픽셀 격자 칸을 채운다 (가장자리는 들쭉날쭉) */
function splatPx(ctx, x, y, r, seed, col, alpha = 1) {
  const rng = mulberry32(seed), c = ART * 2, R = Math.ceil((r * 1.8) / c);
  const blobs = [[x, y, r]];
  for (let i = 0; i < 6; i++) { const a = rng() * Math.PI * 2, d = r * (0.9 + rng() * 0.9); blobs.push([x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.2 + rng() * 0.3)]); }
  const gx = Math.round(x / c) * c, gy = Math.round(y / c) * c;
  ctx.fillStyle = `rgba(${col},${alpha})`;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const px = gx + i * c, py = gy + j * c;
    const inside = blobs.some(([bx, by, br]) => Math.hypot(px - bx, py - by) < br * (0.85 + ((i * 7 + j * 13 + seed) & 3) * 0.08));
    if (inside) ctx.fillRect(px, py, c, c);
  }
}

/** 월드 위 피 웅덩이 / 터진 살점 (game.gore) */
export function drawGore(ctx, game) {
  if (game.settings?.gore === false) return;
  for (const g of game.gore) {
    const age = game.time - g.t0;
    if (g.kind === 'pool') {
      const r = Math.min(1, age / 1.5) * g.r;
      if (r > 2) splatPx(ctx, g.x, g.y + 6, r, g.seed, '96,4,4', 0.9);
    } else if (g.kind === 'chunk') {
      // 터진 살점: 날아가다 멈춘다
      const u = Math.min(1, age / 0.7), e = 1 - (1 - u) * (1 - u);
      const c = ART * 2, x = Math.round((g.x + g.vx * e) / c) * c, y = Math.round((g.y + g.vy * e) / c) * c;
      if (u >= 1) splatPx(ctx, x, y, g.s * 0.9, g.seed, '96,4,4', 0.8);
      ctx.fillStyle = g.col;
      const sz = Math.max(1, Math.round(g.s / c)) * c;
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
  }
}

/** 사망 위치에 흔적 추가. sanity 면 살점이 사방으로 터진다 */
export function addGore(game, x, y, type, suitHex) {
  const seed = (Math.random() * 1e9) | 0, t0 = game.time;
  game.gore.push({ kind: 'pool', x, y, r: type === 'sanity' ? 30 : 20, seed, t0 });
  if (type === 'sanity') {
    const rng = mulberry32(seed);
    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2, d = 20 + rng() * 90;
      game.gore.push({
        kind: 'chunk', x, y: y - 10, vx: Math.cos(a) * d, vy: Math.sin(a) * d, s: 3 + rng() * 6, seed: seed + i, t0,
        col: rng() < 0.25 ? suitHex : rng() < 0.5 ? '#7a0c0c' : '#b03028',
      });
    }
  }
  if (game.gore.length > 400) game.gore.splice(0, game.gore.length - 400);
}
