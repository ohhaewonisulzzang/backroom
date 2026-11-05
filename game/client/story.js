import { humanPreview } from './sprites.js';
import { Sound } from './sound.js';

/**
 * 오프닝: 처음 Level 0 에 들어갈 때.
 * 친구들과 폐건물 탐험 영상을 찍다가, 현실의 틈새로 "노클립" 되어 백룸으로 떨어진다.
 * 화면은 캠코더 녹화 화면(REC, 타임코드, 노이즈)처럼 보이고, 마지막엔 신호가 끊긴다. 내레이션은 없다.
 *
 * 멀티: 실제 동료들이 같이 촬영하던 친구들이고, 모두 함께 떨어진다.
 * 혼자: NPC 친구 둘이 촬영하고, 나만 떨어진다.
 */

const NPC = [{ name: 'Jake', color: 'green' }, { name: 'Emily', color: 'blue' }];

/** 등장인물 구성. holder = 카메라를 든 사람(화면에 안 나옴), shown = 화면에 보이는 사람들 */
export function makeStoryCast(players, myId) {
  const me = players.find(p => p.id === myId) || { name: '나', color: 'default' };
  const others = players.filter(p => p.id !== myId).map(p => ({ name: p.name, color: p.color }));
  const solo = others.length === 0;
  const friends = solo ? NPC : others;
  const holder = friends[friends.length - 1];
  const buddy = friends.length > 1 ? friends[0] : null;            // 화면에 같이 나오는 친구
  const shown = [...(buddy ? [buddy] : []), { ...me, me: true }, ...friends.slice(1, -1)];
  return { solo, me: { name: me.name, color: me.color, me: true }, holder, buddy: buddy || holder, shown };
}

/** 대사/연출 타임라인 (초). who: holder | buddy | me | null(자막만) */
export function storyScript(cast) {
  const { me, holder, buddy, solo } = cast;
  return [
    { t: 0.6, sfx: 'camBeep' },
    { t: 1.2, who: holder, pitch: 0.9, text: '자, 녹화 시작했다. 폐건물 탐험 3편!' },
    { t: 4.1, who: buddy, pitch: 1.25, text: '야... 여기 진짜 들어와도 되는 거 맞아?' },
    { t: 7.0, who: me, pitch: 1.05, text: '괜찮아. 저 복도 끝까지만 찍고 나가자.' },
    { t: 9.8, who: holder, pitch: 0.9, text: '잠깐... 저 벽, 원래 노란색이었나?' },
    { t: 12.4, who: me, pitch: 1.05, text: '이 소리 뭐야? 형광등...?' },
    { t: 14.6, who: me, pitch: 1.15, text: '어? 바닥이—', sfx: 'glitch' },
    { t: 16.0, sfx: 'noclip' },
    { t: 16.3, who: holder, pitch: 0.95, text: solo ? `${me.name}?! 야, 어디 갔어?!` : '어? 다들 어디— 으악!' },
    { t: 17.6, sfx: 'static' },
  ];
}


/** 엔진이 매 프레임 호출: 이번 프레임에 지나간 이벤트의 소리/목소리를 낸다 */
export function playStoryEvents(cine, prevT) {
  const t = cine.t;
  for (const e of cine.data.script) {
    if (e.t <= prevT || e.t > t) continue;
    if (e.text) Sound.say(e.text, e.pitch, 0.75);
    if (e.sfx === 'camBeep') Sound.camBeep();
    else if (e.sfx === 'glitch') Sound.staticBurst(0.4, 0.6);
    else if (e.sfx === 'noclip') Sound.noclip();
    else if (e.sfx === 'static') { Sound.hushVoice(); Sound.staticBurst(1.8, 1); }
  }
}

const clamp01 = v => Math.max(0, Math.min(1, v));
const fmt2 = n => String(n).padStart(2, '0');

/** 캠코더 화면 그리기 */
export function drawStory(r, game) {
  const { ctx, W, H } = r, c = game.cine, t = c.t, d = c.data;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const fs = Math.round(Math.min(W, H) * 0.036);

  if (t < 17.6) drawScene(r, game, t, d);
  else {
    // 신호 끊김 (그 다음 바로 Level 0)
    for (let i = 0; i < 40; i++) {
      const v = Math.floor(Math.random() * 120);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, Math.random() * H, W, 2 + Math.random() * 14);
    }
    ctx.globalAlpha = 0.7; ctx.fillStyle = r.grainPattern; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    ctx.fillStyle = '#000'; ctx.fillRect(W / 2 - fs * 5, H / 2 - fs, fs * 10, fs * 2);
    ctx.font = `${fs * 1.4}px VT323, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = Math.floor(t * 3) % 2 ? '#e8e8e8' : '#9a9a9a';
    ctx.fillText('NO SIGNAL', W / 2, H / 2);
  }

  if (t > 2) {
    ctx.font = `${Math.round(fs * 0.6)}px VT323, monospace`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(200,190,150,0.45)';
    ctx.fillText('ENTER 건너뛰기', W - 16, H - 12);
  }
}

function drawScene(r, game, t, d) {
  const { ctx, W, H } = r;
  const fs = Math.round(Math.min(W, H) * 0.036);
  const glitch = clamp01((t - 14.4) / 1.6);                    // 14.4~16s: 화면이 일그러진다
  const yellow = t > 9.6 ? clamp01((t - 9.6) / 2.5) : 0;      // 벽이 점점 노래진다
  const fall = clamp01((t - 16) / 1.6);                        // 16s~: 카메라가 떨어진다
  // 손에 든 카메라의 흔들림
  const sway = Math.sin(t * 1.3) * W * 0.012 + Math.sin(t * 3.1) * W * 0.004 + (Math.random() - 0.5) * glitch * 30;
  const bob = Math.sin(t * 5.2) * H * 0.006 * (t < 9.6 ? 1 : 0.3);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.sin(t * 0.9) * 0.012 + fall * fall * 1.2);
  ctx.translate(-W / 2 + sway, -H / 2 + bob + fall * fall * H * 0.5);

  // ---- 복도 (1점 투시) ----
  const vx = W / 2, vy = H * 0.44, hw = W * 0.07, hh = H * 0.09;   // 소실점 쪽 끝 벽
  const flick = yellow > 0 && Math.random() < 0.12 + glitch * 0.5 ? 0.55 : 1;
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const rgb = (a, m = 1) => `rgb(${a.map(v => Math.round(v * m)).join(',')})`;
  const wall = mix([38, 40, 46], [150, 132, 62], yellow), floor = mix([26, 26, 28], [96, 82, 44], yellow), ceil = mix([20, 21, 24], [120, 112, 80], yellow);
  const poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
  poly([[-W, -H], [W * 2, -H], [vx + hw, vy - hh], [vx - hw, vy - hh]], rgb(ceil, flick));
  poly([[-W, H * 2], [W * 2, H * 2], [vx + hw, vy + hh], [vx - hw, vy + hh]], rgb(floor, flick));
  poly([[-W, -H], [vx - hw, vy - hh], [vx - hw, vy + hh], [-W, H * 2]], rgb(wall, 0.85 * flick));
  poly([[W * 2, -H], [vx + hw, vy - hh], [vx + hw, vy + hh], [W * 2, H * 2]], rgb(wall, 0.7 * flick));
  poly([[vx - hw, vy - hh], [vx + hw, vy - hh], [vx + hw, vy + hh], [vx - hw, vy + hh]], rgb(wall, 0.55 * flick));
  // 끝의 문
  ctx.fillStyle = rgb(mix([14, 14, 16], [60, 50, 24], yellow)); ctx.fillRect(vx - hw * 0.3, vy - hh * 0.55, hw * 0.6, hh * 1.55);
  // 벽지 세로 줄무늬 (노래질수록 보인다)
  if (yellow > 0) {
    ctx.strokeStyle = `rgba(90,74,30,${0.35 * yellow})`; ctx.lineWidth = 2;
    for (let k = 1; k < 9; k++) {
      const u = k / 9;
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -W : W * 2, xe = vx + side * hw;
        const x = x0 + (xe - x0) * (1 - (1 - u) ** 2);
        const y0 = -H + (vy - hh + H) * (1 - (1 - u) ** 2), y1 = H * 2 - (H * 2 - vy - hh) * (1 - (1 - u) ** 2);
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      }
    }
  }
  // 천장 형광등 (벽이 노래지면서 켜진다)
  if (yellow > 0.3) {
    for (let k = 0; k < 4; k++) {
      const u = 1 - k / 4, y = vy - hh - (vy - hh + H * 0.2) * u * u * 0.9, w = hw * (1 + u * 6);
      ctx.fillStyle = `rgba(255,250,210,${(0.5 + 0.5 * flick) * yellow})`;
      ctx.fillRect(vx - w / 2, y, w, Math.max(2, 6 * u));
    }
  }
  // 카메라 조명
  const lg = ctx.createRadialGradient(vx, H * 0.62, 0, vx, H * 0.62, Math.max(W, H) * 0.6);
  lg.addColorStop(0, `rgba(255,245,210,${0.18 * (1 - yellow * 0.5)})`); lg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = lg; ctx.fillRect(-W, -H, W * 3, H * 3);

  // ---- 사람들 (복도 앞쪽으로 걸어간다) ----
  const shown = d.cast.shown, n = shown.length;
  const s = Math.max(4, Math.round(H / 115));
  const floorY = H * 0.86 - Math.min(9.6, t) * H * 0.012;      // 앞으로 걸어가며 조금 멀어진다
  shown.forEach((p, i) => {
    const x = W / 2 + (i - (n - 1) / 2) * W * 0.15;
    const walking = t < 9.6;
    const facing = (p.me && t > 7 && t < 9.6) || (t > 12.4 && t < 14.6 && p.me) ? 'down' : 'up';
    const f = walking ? Math.floor(t * 6 + i * 3) % 8 : -1;
    const spr = humanPreview(p.color, facing, f);
    const sw = spr.width * s, sh = spr.height * s;
    // 노클립: 바닥 아래로 빨려 들어간다 (혼자면 나만, 멀티면 모두)
    const falls = p.me || !d.cast.solo;
    const sink = falls ? clamp01((t - 15.4 - (p.me ? 0 : i * 0.15)) / 0.9) : 0;
    const jitter = falls && glitch > 0 ? (Math.random() - 0.5) * glitch * 26 : 0;
    if (sink >= 1) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(-W, -H, W * 3, floorY + H); ctx.clip();     // 바닥선 아래는 잘라낸다
    ctx.globalAlpha = 1 - sink * 0.3;
    ctx.drawImage(spr, x - sw / 2 + jitter, floorY - sh + sink * sh, sw, sh);
    if (falls && glitch > 0.2) {                                     // 잔상
      ctx.globalAlpha = 0.35 * glitch;
      ctx.drawImage(spr, x - sw / 2 + jitter + 14, floorY - sh + sink * sh, sw, sh);
    }
    ctx.restore();
  });
  ctx.restore();

  // ---- 글리치 (화면이 찢어지듯 어긋남) ----
  if (glitch > 0 || fall > 0) {
    const k = Math.max(glitch, fall);
    for (let i = 0; i < 4 + k * 14; i++) {
      const y = Math.floor(Math.random() * H), h = 4 + Math.random() * 40, dx = (Math.random() - 0.5) * 120 * k;
      ctx.drawImage(r.canvas, 0, y, W, h, dx, y, W, h);
    }
    if (Math.random() < k * 0.5) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,120' : '255,255,255'},${0.15 * k})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---- 캠코더 오버레이 ----
  ctx.globalAlpha = 0.12 + Math.max(glitch, fall) * 0.4; ctx.fillStyle = r.grainPattern; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.5; ctx.fillStyle = r.scanPattern; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  const m = Math.round(Math.min(W, H) * 0.05), L = m * 0.9;
  ctx.strokeStyle = 'rgba(235,235,235,0.75)'; ctx.lineWidth = 3;
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y); ctx.stroke();
  }
  ctx.font = `${Math.round(fs * 1.1)}px VT323, monospace`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  if (Math.floor(t * 1.6) % 2 === 0) { ctx.fillStyle = '#e0261c'; ctx.beginPath(); ctx.arc(m + fs * 0.9, m + fs * 1.2, fs * 0.36, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#f0f0f0'; ctx.fillText('REC', m + fs * 1.5, m + fs * 1.2);
  ctx.textAlign = 'right'; ctx.fillText('SP ▶', W - m - fs * 0.5, m + fs * 1.2);
  // 배터리
  const bx = W - m - fs * 4.6, by = m + fs * 0.85;
  ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, fs * 1.4, fs * 0.7);
  ctx.fillStyle = '#f0f0f0'; ctx.fillRect(bx + fs * 1.4, by + fs * 0.2, 3, fs * 0.3);
  if (Math.floor(t * 2) % 2) ctx.fillRect(bx + 3, by + 3, fs * 0.35, fs * 0.7 - 6);
  // 타임코드
  const sec = 47 * 60 + 12 + Math.floor(t);
  ctx.textAlign = 'right';
  ctx.fillText(`${d.date}  23:${fmt2(Math.floor(sec / 60) % 60)}:${fmt2(sec % 60)}`, W - m - fs * 0.5, H - m - fs * 1.1);
  ctx.textAlign = 'left';
  ctx.fillText(`00:${fmt2(Math.floor(t / 60))}:${fmt2(Math.floor(t) % 60)}`, m + fs * 0.5, H - m - fs * 1.1);

  // ---- 자막 ----
  const line = [...d.script].reverse().find(e => e.text && t >= e.t && t < e.t + 2.8);
  if (line) {
    const shown = line.text.slice(0, Math.floor((t - line.t) * 24));
    const label = line.who ? `${line.who.name}: ` : '';
    ctx.font = `${fs}px VT323, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label + line.text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W / 2 - tw / 2 - 12, H * 0.8 - fs * 0.75, tw + 24, fs * 1.5);
    ctx.textAlign = 'left';
    const x0 = W / 2 - tw / 2;
    ctx.fillStyle = line.who?.me ? '#f0dc8c' : '#9fd4e8';
    ctx.fillText(label, x0, H * 0.8);
    ctx.fillStyle = '#f2f0e6';
    ctx.fillText(shown, x0 + ctx.measureText(label).width, H * 0.8);
  }
  // 시작 페이드인
  if (t < 0.8) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.8})`; ctx.fillRect(0, 0, W, H); }
}
