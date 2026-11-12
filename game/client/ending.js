import { humanPreview } from './sprites.js';
import { Sound } from './sound.js';
import { SUIT_HEX } from '../../shared/config.js';
import { drawScene, makeStoryCast } from './story.js';

/**
 * 엔딩 시네마틱 (Level 3999 탈출). 약 38초, 4 장면:
 *  A  0  ~ 9.5  Level 3999 오락실 안 — 모두가 금빛 출구 문까지 걸어가 빛 속으로 사라진다
 *  B  9.5~ 19.5 하얀 섬광 → 캠코더 화면. 처음 노클립했던 그 폐건물 복도로 돌아왔다
 *  C  19.5~ 31  생존 보고서 — 플레이 시간, 총 사망 횟수, 사람마다 한 줄 평 (리썰 컴퍼니 성적표처럼)
 *  D  31 ~ 38   게임 이름 BACKROOMS 가 떠오르고 끝
 * 서버가 gameComplete 로 보내는 stats = { playTime, players: [{ id, name, color, deaths, escapes, keys, puzzles, delivered, activated }] }
 */
export const ENDING = { DUR: 38, A: 9.5, B: 19.5, C: 31 };

/** 사람마다 한 줄 평. "가장 ~" 칭호는 한 사람에게만 준다 */
export function playerTitles(players) {
  const multi = players.length > 1, taken = new Set();
  const work = s => s.keys + s.puzzles + s.delivered + s.activated;
  const top = f => Math.max(0, ...players.map(f));
  const maxD = top(s => s.deaths), maxP = top(s => s.puzzles), maxW = top(work), maxE = top(s => s.escapes);
  const once = (key, ok) => { if (!ok || taken.has(key)) return false; taken.add(key); return true; };
  return players.map(s => {
    let line;
    if (s.deaths >= 10 && once('die', s.deaths === maxD)) line = '너무 많이 죽음';
    else if (s.deaths >= 3 && once('die', s.deaths === maxD)) line = '많이 죽음';
    else if (multi && once('puzzle', s.puzzles > 0 && s.puzzles === maxP)) line = '퍼즐 해결사';
    else if (once('work', work(s) > 0 && work(s) === maxW)) line = '성과가 좋음';
    else if (s.deaths === 0) line = '한 번도 죽지 않음';
    else if (multi && once('escape', s.escapes > 0 && s.escapes === maxE)) line = '탈출 일등공신';
    else if (work(s) === 0) line = '구경만 함';
    else line = '그럭저럭 살아남음';
    return { ...s, line, work: work(s) };
  });
}

const fmtTime = sec => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60; return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`; };
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = u => 1 - (1 - u) ** 3;

/** 엔딩 데이터 (onGameComplete 에서 한 번 만든다) */
export function makeEndingData(stats, myId, fallbackColor, players) {
  const list = playerTitles((stats?.players?.length ? stats.players : [{ id: myId, name: '나', color: fallbackColor, deaths: 0, escapes: 0, keys: 0, puzzles: 0, delivered: 0, activated: 0 }]));
  const me = list.find(s => s.id === myId) || list[0];
  const cast = makeStoryCast(players?.length ? players : list.map(s => ({ id: s.id, name: s.name, color: s.color })), myId);
  const now = new Date(), M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  // B 장면 대사 (drawScene 의 시간 기준: 0 부터)
  const holder = cast.holder, buddy = cast.buddy, solo = cast.solo;
  const script = [
    { t: 0.4, sfx: 'camBeep' },
    { t: 1.2, who: cast.me, pitch: 1.05, text: '...여기, 그 폐건물이잖아?' },
    { t: 3.6, who: solo ? null : buddy, pitch: 1.25, text: solo ? '' : '돌아왔어... 진짜로 돌아왔어!' },
    { t: 6.0, who: holder, pitch: 0.9, text: solo ? `${cast.me.name}?! 너 어디 있었던 거야?` : '...카메라, 아직 녹화 중이었네.' },
  ].filter(e => e.sfx || e.text);
  return {
    me, players: list, cast, script, date: `${M[now.getMonth()]} ${String(now.getDate()).padStart(2, '0')} ${now.getFullYear()}`,
    playTime: stats?.playTime || 0, deaths: list.reduce((t, s) => t + s.deaths, 0),
  };
}

/** 장면별 효과음/대사 (엔진이 매 프레임 호출) */
export function playEndingEvents(cine, prevT) {
  const t = cine.t, d = cine.data, at = x => prevT < x && t >= x;
  if (at(0.05)) Sound.ending();
  if (at(5.2)) { Sound.tone(220, 880, 1.2, 0.06, 'sine'); Sound.tone(330, 990, 1.4, 0.04, 'triangle', 0.2); }   // 문이 열리는 빛
  if (at(8.2)) Sound.noclip();
  for (const e of d.script) {                                         // B 장면 대사
    const x = ENDING.A + e.t;
    if (!at(x)) continue;
    if (e.text) Sound.say(e.text, e.pitch, 0.75);
    if (e.sfx === 'camBeep') Sound.camBeep();
  }
  if (at(ENDING.B - 0.9)) { Sound.flickerTick(1); Sound.tone(60, 60, 0.5, 0.1, 'sawtooth'); }   // ...형광등?
  if (at(ENDING.B - 0.3)) { Sound.hushVoice(); Sound.staticBurst(0.4, 0.7); }
  // C: 줄마다 타자 소리, 마지막에 도장
  const rowT = k => ENDING.B + 2.4 + k * 1.1;
  for (let k = 0; k < d.players.length + 2; k++) if (at(rowT(k))) { Sound.click(); Sound.tone(900, 900, 0.04, 0.05, 'square'); }
  if (at(rowT(d.players.length + 2) + 0.4)) { Sound.thud(1.2); Sound.tone(110, 90, 0.5, 0.12, 'square'); }
  if (at(ENDING.C + 0.5)) Sound.tone(220, 220, 5, 0.05, 'triangle');
}

/** 엔딩 그리기 */
export function drawEnding(r, game) {
  const { ctx, W, H } = r, c = game.cine, t = c.t, d = c.data;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (t < ENDING.A) drawExitWalk(r, t, d);
  else if (t < ENDING.B) drawReturn(r, game, t - ENDING.A, d);
  else if (t < ENDING.C) drawReport(r, t - ENDING.B, d);
  else drawTitle(r, t - ENDING.C, c.dur - ENDING.C);
}

// ---------------------------------------------------------------- A: 3999 오락실 → 출구
function drawExitWalk(r, t, d) {
  const { ctx, W, H } = r;
  const floorY = H * 0.74, doorX = W * 0.8, doorW = W * 0.08, doorH = H * 0.36;
  // 벽: 짙은 남보라 + 위쪽 네온 띠
  const g = ctx.createLinearGradient(0, 0, 0, floorY);
  g.addColorStop(0, '#0a0618'); g.addColorStop(1, '#1e1238');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, floorY);
  const neon = (y, col, k) => { ctx.fillStyle = col; ctx.globalAlpha = 0.6 + Math.sin(t * 7 + k) * 0.25; ctx.fillRect(0, y, W, 3); ctx.globalAlpha = 1; };
  neon(H * 0.12, '#ff4aa0', 0); neon(H * 0.135, '#4ae0ff', 2);
  // 오락기들 (뒤쪽 벽에 줄지어)
  const cabW = W * 0.07, NEON = ['#ff4aa0', '#4ae0ff', '#ffd84a', '#7aff6a'];
  for (let i = 0; i < 12; i++) {
    const x = i * cabW * 1.25 - ((t * 6) % (cabW * 1.25)) * 0, cx = x + cabW * 0.1;
    if (cx > doorX - doorW * 1.2 && cx < doorX + doorW * 1.2) continue;
    const y = floorY - H * 0.3;
    ctx.fillStyle = '#120a24'; ctx.fillRect(cx, y, cabW, H * 0.3);
    ctx.fillStyle = NEON[i % 4]; ctx.fillRect(cx, y, cabW, H * 0.025);
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 5 + i * 1.7);
    ctx.fillStyle = NEON[(i + 1) % 4]; ctx.fillRect(cx + cabW * 0.15, y + H * 0.05, cabW * 0.7, H * 0.09);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#2a1a4a'; ctx.fillRect(cx - 2, y + H * 0.16, cabW + 4, H * 0.03);
  }
  // 바닥: 네온 무늬 카펫
  ctx.fillStyle = '#140c2c'; ctx.fillRect(0, floorY, W, H - floorY);
  for (let i = 0; i < 90; i++) { ctx.fillStyle = NEON[i % 4]; ctx.globalAlpha = 0.35; ctx.fillRect((i * 97) % W, floorY + 6 + ((i * 53) % Math.round(H - floorY - 10)), 4, 4); }
  ctx.globalAlpha = 1;
  // 출구 문: 5초쯤 열리며 빛이 쏟아진다
  const open = ease(clamp01((t - 5) / 1.5));
  ctx.fillStyle = '#d8a83a'; ctx.fillRect(doorX - doorW / 2 - 8, floorY - doorH - 8, doorW + 16, doorH + 8);
  ctx.fillStyle = '#fff8d8'; ctx.fillRect(doorX - doorW / 2, floorY - doorH, doorW, doorH);
  ctx.fillStyle = '#f0c860'; ctx.fillRect(doorX - doorW / 2, floorY - doorH, doorW * (1 - open), doorH);   // 문짝
  ctx.font = `${Math.round(H * 0.035)}px VT323, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(110,255,140,${0.7 + Math.sin(t * 6) * 0.3})`; ctx.fillText('EXIT', doorX, floorY - doorH - H * 0.04);
  if (open > 0) {
    const lg = ctx.createRadialGradient(doorX, floorY - doorH / 2, 0, doorX, floorY - doorH / 2, W * 0.5 * (0.4 + open));
    lg.addColorStop(0, `rgba(255,250,220,${0.7 * open})`); lg.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(255,250,220,${0.25 * open})`;                           // 바닥에 비친 빛
    ctx.beginPath(); ctx.moveTo(doorX - doorW / 2, floorY); ctx.lineTo(doorX + doorW / 2, floorY); ctx.lineTo(doorX - W * 0.2, H); ctx.lineTo(doorX - W * 0.5, H); ctx.closePath(); ctx.fill();
  }
  // 사람들: 왼쪽에서 걸어와 문 안으로 들어간다
  const s = Math.max(4, Math.round(H / 120));
  d.players.forEach((p, i) => {
    const start = 0.6 + i * 0.5, u = clamp01((t - start) / 6.4);
    const x = W * (0.08 - i * 0.05) + (doorX - W * (0.08 - i * 0.05)) * u;
    const inDoor = clamp01((x - (doorX - doorW * 0.3)) / (doorW * 0.6));
    if (inDoor >= 1) return;
    const spr = humanPreview(p.color, 'right', u < 1 ? Math.floor(t * 8 + i * 3) % 8 : -1);
    const sw = spr.width * s, sh = spr.height * s, y = floorY - sh + H * 0.02 + i * 4;
    ctx.globalAlpha = 1 - inDoor;
    ctx.drawImage(spr, Math.round(x - sw / 2), Math.round(y), sw, sh);
    ctx.globalAlpha = 1;
  });
  // 페이드 인 / 하얀 섬광으로 넘어간다
  if (t < 0.8) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.8})`; ctx.fillRect(0, 0, W, H); }
  const flash = clamp01((t - 7.6) / 1.6);
  if (flash > 0) { ctx.fillStyle = `rgba(255,253,240,${flash})`; ctx.fillRect(0, 0, W, H); }
}

// ---------------------------------------------------------------- B: 폐건물로 돌아옴 (캠코더 화면)
function drawReturn(r, game, lt, d) {
  const { ctx, W, H } = r;
  const st = Math.min(9.4, lt * 0.95);                    // drawScene 시간 (9.6 전: 벽은 회색, 사람들이 복도를 걷는다)
  drawScene(r, game, st, { cast: d.cast, script: d.script, date: d.date });
  // 처음엔 하얀 빛이 걷힌다
  if (lt < 1.2) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(255,253,240,${1 - lt / 1.2})`; ctx.fillRect(0, 0, W, H); }
  // 끝에: 아주 잠깐 노란 형광등빛이 번쩍 — 정말 나온 걸까?
  const end = ENDING.B - ENDING.A;
  if (lt > end - 0.9 && lt < end - 0.75) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(214,194,106,0.7)'; ctx.fillRect(0, 0, W, H); }
  if (lt > end - 0.35) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 30; i++) { const v = Math.floor(Math.random() * 120); ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(0, Math.random() * H, W, 2 + Math.random() * 12); }
  }
}

// ---------------------------------------------------------------- C: 생존 보고서
function drawReport(r, lt, d) {
  const { ctx, W, H } = r;
  const a = clamp01(lt / 0.6) * clamp01((ENDING.C - ENDING.B - lt) / 0.6);
  ctx.globalAlpha = a;
  ctx.fillStyle = '#0c0a04'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(216,196,106,0.05)'; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  const pw = Math.min(W - 40, 760), x0 = (W - pw) / 2, fs = Math.max(18, Math.min(30, Math.round(H * 0.036)));
  const rowH = fs * 2.3, nRows = d.players.length;
  const ph = fs * 9 + rowH * nRows, y0 = Math.max(20, (H - ph) / 2);
  ctx.strokeStyle = '#8a7a3a'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, pw, ph);
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const type = (text, x, y, start, col, font) => {        // 타자 치듯 한 글자씩
    const n = Math.floor((lt - start) * 40);
    if (n <= 0) return;
    ctx.font = font; ctx.fillStyle = col; ctx.fillText(text.slice(0, n), x, y);
  };
  const big = `${Math.round(fs * 1.5)}px VT323, monospace`, mid = `${fs}px VT323, monospace`, small = `${Math.round(fs * 0.75)}px VT323, monospace`;
  type('생존 보고서  —  SURVIVAL REPORT', x0 + 24, y0 + 18, 0.3, '#e6c24e', big);
  type(`플레이 시간   ${fmtTime(d.playTime)}`, x0 + 24, y0 + 18 + fs * 2.4, 1.2, '#cfc6a6', mid);
  type(`총 사망 횟수  ${d.deaths}번`, x0 + 24, y0 + 18 + fs * 3.6, 1.7, d.deaths ? '#e0604a' : '#cfc6a6', mid);
  ctx.fillStyle = 'rgba(138,122,58,0.5)'; if (lt > 2.1) ctx.fillRect(x0 + 24, y0 + fs * 5.6, pw - 48, 1);
  d.players.forEach((p, k) => {
    const start = 2.4 + k * 1.1, y = y0 + fs * 6.2 + k * rowH;
    if (lt < start) return;
    ctx.fillStyle = SUIT_HEX[p.color] || '#e7b92e'; ctx.fillRect(x0 + 24, y + fs * 0.25, fs * 0.6, fs * 0.6);
    type(`${p.name}: ${p.line}.`, x0 + 24 + fs, y, start, p.id === d.me.id ? '#fff3c4' : '#e6dcb0', mid);
    type(`사망 ${p.deaths}  ·  열쇠 ${p.keys}  ·  퍼즐 ${p.puzzles}  ·  배달 ${p.delivered}  ·  장치 ${p.activated}  ·  탈출 ${p.escapes}`, x0 + 24 + fs, y + fs * 1.15, start + 0.3, '#8a7f5a', small);
  });
  // 결과 도장
  const stampT = 2.4 + (nRows + 2) * 1.1 + 0.4;
  if (lt > stampT) {
    const u = ease(clamp01((lt - stampT) / 0.25)), sc = 1.6 - u * 0.6;
    ctx.save();
    ctx.translate(x0 + pw - fs * 6, y0 + fs * 3.2); ctx.rotate(-0.18); ctx.scale(sc, sc);
    ctx.globalAlpha = a * u;
    ctx.strokeStyle = '#d23a2a'; ctx.lineWidth = 4; ctx.strokeRect(-fs * 4.6, -fs * 1.1, fs * 9.2, fs * 2.2);
    ctx.font = `${Math.round(fs * 1.6)}px VT323, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#d23a2a';
    ctx.fillText('탈출 성공', 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- D: 제목
function drawTitle(r, lt, dur) {
  const { ctx, W, H } = r;
  const u = clamp01(lt / 4), e = ease(u);
  const a = clamp01(lt / 1.5) * clamp01((dur - lt) / 1.2);
  const y = H * 1.1 - (H * 1.1 - H * 0.5) * e;
  const size = Math.round(Math.min(W, H) * 0.16);
  ctx.font = `${size}px VT323, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(216,196,106,0.6)'; ctx.shadowBlur = 24;
  ctx.fillStyle = `rgba(216,196,106,${a})`;
  ctx.fillText('BACKROOMS', W / 2 + (Math.random() < 0.04 ? 4 : 0), y);
  ctx.shadowBlur = 0;
}
