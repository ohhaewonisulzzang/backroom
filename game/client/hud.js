import { CONFIG, TS, T, SUIT_HEX, MISSION, MISSION_TEXT, levelLabel, levelInfo, missionKind, missionGoal, ITEM_TYPES } from '../../shared/config.js';
import { Input, keyLabel } from './input.js';
import { itemIcon } from './sprites.js';
import { BESTIARY, typesInLevel } from './bestiary.js';
import { t as tr, getLang } from '../../shared/i18n.js';

const fmtTime = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * 최소한의 HUD (글자는 최대한 줄였다):
 *  왼쪽 위  레벨 이름, 열쇠 아이콘, 뇌(정신력) 픽셀 게이지
 *  맨 아래 가운데 스태미나 막대
 *  오른쪽 위 시간, (멀티일 때) 동료 색 점
 *  아래 가운데 인벤토리 1~4 칸, 나침반 화살표
 *  오른쪽 아래 미니맵
 */
/**
 * 픽셀 아이콘 게이지 (정신력 뇌): X 테두리, O 채움, H 반짝임, L 주름. 값만큼 아래에서부터 색이 차고, 나머지는 어둡게.
 */
const BRAIN = [
  '....XXXXXX....',
  '..XXOOHOOOXX..',
  '.XOHOOLOOOLOX.',
  'XOOOOLOOLOOOOX',
  'XOLOOOOLOOOLOX',
  'XOOLLOOOOLOOOX',
  'XOOOOOLLOOOOX.',
  '.XOOLOOOOLOX..',
  '..XXOOOXXXX...',
  '....XOOX......',
  '.....XX.......',
];
function drawPixelGauge(ctx, rows, x, y, s, value, col, pop = 0) {
  const h = rows.length, w = rows[0].length;
  const sc = s * (1 + pop), ox = x - (w * (sc - s)) / 2, oy = y - (h * (sc - s)) / 2;   // pop: 가운데 기준으로 살짝 커진다 (심장 박동)
  // 채울 수 있는 줄 범위 (테두리 제외 맨 위 ~ 맨 아래 내부 칸)
  let top = h, bot = -1;
  rows.forEach((r, j) => { if (/[OHL]/.test(r)) { top = Math.min(top, j); bot = Math.max(bot, j); } });
  const level = bot + 1 - value * (bot - top + 1);   // 이 줄(실수)보다 아래가 차 있다
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (rows[j][i] !== '.') ctx.fillRect(Math.round(ox + i * sc + 2), Math.round(oy + j * sc + 2), Math.ceil(sc), Math.ceil(sc));   // 그림자
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = rows[j][i];
    if (c === '.') continue;
    const filled = j + 1 > level + 0.001 && value > 0;
    ctx.fillStyle = c === 'X' ? col.line : !filled ? col.empty : c === 'H' ? col.hi : c === 'L' ? col.fold : col.fill;
    ctx.fillRect(Math.round(ox + i * sc), Math.round(oy + j * sc), Math.ceil(sc), Math.ceil(sc));
  }
}

export class Hud {
  setMap(map) {
    this.map = map;
    this.minimap = document.createElement('canvas');
    this.mmScale = map.h > 100 || map.w > 100 ? 1 : 2;     // 세로로 긴 도시 맵은 작게
    this.minimap.width = map.w * this.mmScale;
    this.minimap.height = map.h * this.mmScale;
    this.minimapT = 0;
  }

  renderMinimap(game) {
    const m = this.map, g = this.minimap.getContext('2d'), s = 2;
    g.clearRect(0, 0, this.minimap.width, this.minimap.height);
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(0, 0, this.minimap.width, this.minimap.height);
    for (let i = 0; i < m.tiles.length; i++) {
      if (!game.explored[i]) continue;
      const t = m.tiles[i];
      g.fillStyle = t === T.WALL ? '#7a6a30' : t === T.EXIT ? (game.exitUnlocked ? '#6edc78' : '#c8402c') : '#2e2610';
      g.fillRect((i % m.w) * s, ((i / m.w) | 0) * s, s, s);
    }
    g.fillStyle = '#ffe58a';
    for (const k of game.keys) if (!k.collected && game.explored[k.ty * m.w + k.tx]) g.fillRect(k.tx * s, k.ty * s, s, s);
    const o = game.obj;
    if (o?.type === 'deliver') {
      g.fillStyle = '#ffb446';
      for (const pt of o.parts) if (pt.s === 0) { const tx = Math.floor(pt.x / TS), ty = Math.floor(pt.y / TS); if (game.explored[ty * m.w + tx]) g.fillRect(tx * s, ty * s, s, s); }
      const dp = game.level.depot;
      if (dp) { g.fillStyle = game.exitUnlocked ? '#6edc78' : '#ffd25a'; g.fillRect(dp.tx * s - 1, dp.ty * s - 1, s + 2, s + 2); }
    }
    if (o?.type === 'activate') {
      game.level.stations.forEach((st, i) => {
        if (!game.explored[st.ty * m.w + st.tx]) return;
        g.fillStyle = (o.prog[i] || 0) >= 1 ? '#6edc78' : '#ff8a5a';
        g.fillRect(st.tx * s - 1, st.ty * s - 1, s + 2, s + 2);
      });
    }
    g.fillStyle = '#9fd4e8';
    for (const it of game.items) {
      const tx = Math.floor(it.x / TS), ty = Math.floor(it.y / TS);
      if (game.explored[ty * m.w + tx]) g.fillRect(tx * s, ty * s, s, s);
    }
  }

  draw(ctx, game, W, H, dt) {
    const p = game.local;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';

    // 레벨 이름
    ctx.fillStyle = 'rgba(216,196,106,0.85)';
    ctx.font = '28px VT323, monospace';
    ctx.fillText(levelLabel(game.levelIndex ?? 0), 20, 16);

    // 질주 레벨: 열쇠 대신 진행 막대 (나 / 동료 / 괴물 떼 위치)
    if (game.horde) this.drawRunBar(ctx, game, W);
    // 미션 (팀 공유): 열쇠 아이콘 / 부품·장치 개수 / 남은 시간
    if (!game.horde) this.drawMission(ctx, game);
    // Level 94: 밤 경고
    // Level P-1 정전 경고
    if (game.blackout === 'warn' || game.blackout === 'dark') {
      ctx.textAlign = 'center'; ctx.font = '30px VT323, monospace';
      const safe = game.level?.isSafe?.(Math.floor(p.x / TS), Math.floor(p.y / TS));
      ctx.fillStyle = game.blackout === 'dark' ? `rgba(255,70,50,${0.7 + Math.sin(game.time * 8) * 0.3})` : 'rgba(255,230,140,0.95)';
      ctx.fillText(game.blackout === 'dark' ? tr(safe ? '정전 — 비상등 밑에서 버텨라' : '정전! 빛으로 가라!') : tr('불이 깜빡인다 — 빨간 비상등 아래로!'), W / 2, 64);
      ctx.textAlign = 'left';
    }
    if (game.night === 'warn' || game.night === 'night') {
      ctx.textAlign = 'center'; ctx.font = '30px VT323, monospace';
      ctx.fillStyle = game.night === 'night' ? `rgba(255,80,60,${0.7 + Math.sin(game.time * 6) * 0.3})` : 'rgba(255,220,120,0.95)';
      ctx.fillText(game.night === 'night' ? tr(p.hidden ? '밤 — 숨어 있어라...' : '밤이다! 숨어라!') : tr('종이 울린다 — 밤이 온다. 옷장에 숨어라'), W / 2, 64);
      ctx.textAlign = 'left';
    }
    for (let i = 0; i < (game.horde || game.obj ? 0 : game.keys.length); i++) {
      const x = 26 + i * 30, y = 62, got = i < game.keysCollected;
      ctx.strokeStyle = got ? '#e6c24e' : '#4a4222'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillRect(x + 5, y - 1.5, 13, 3); ctx.fillRect(x + 14, y + 1.5, 2, 4);
    }

    // 정신력 = 뇌 (픽셀 아이콘이 아래에서부터 차오른다), 스태미나 = 화면 아래 막대
    if (p.alive) {
      const sta = Math.max(0, Math.min(1, p.stamina / CONFIG.PLAYER.STAMINA));
      const san = Math.max(0, Math.min(1, (p.sanity ?? CONFIG.SANITY.MAX) / CONFIG.SANITY.MAX));
      const low = san * CONFIG.SANITY.MAX < CONFIG.SANITY.HALLUCINATE, blink = Math.floor(game.time * 4) % 2 === 0;
      // 스태미나: 화면 맨 아래 가운데 막대. 줄어들 때 양쪽에서 가운데로 짧아진다
      //   평소 노랑, 스테미너 드링크/아드레날린 중엔 하늘색, 지치면 어두운 빨강이 깜빡
      const bw = Math.min(360, W * 0.5), bh = 6, bx = W / 2 - bw / 2, by = H - 11;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = p.boostT > 0 ? '#9fd4e8' : p.exhausted ? (blink ? '#a03020' : '#5a1810') : sta < 0.25 ? '#e0803a' : '#e6c24e';
      const fw = Math.round(bw * sta);
      ctx.fillRect(Math.round(W / 2 - fw / 2), by, fw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(Math.round(W / 2 - fw / 2), by, fw, 2);
      // 뇌: 정신력이 낮으면 깜빡인다
      const brainCol = low && blink ? ['#e0508a', '#ff9ac0', '#a02860'] : ['#e89ab8', '#ffd0e0', '#b0607e'];
      drawPixelGauge(ctx, BRAIN, 20, 79, 3, san, { fill: brainCol[0], hi: brainCol[1], fold: brainCol[2], line: '#140810', empty: '#2e1a26' },
        low ? Math.sin(game.time * 20) * 0.03 : 0);
      // 지속 효과 (야간 투시경·나침반·아드레날린·스테미너 드링크): 뇌 오른쪽에 아이템 모양 + 남은 초
      let ex = 72;
      for (const e of game.effects || []) {
        const left = Math.max(0, e.until - game.time), ic = itemIcon(e.type), k = 2, ew = ic.width * k, eh = ic.height * k;
        const warn = left < 3 && blink;                                   // 끝나기 직전엔 숫자만 살짝 깜빡
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ex - 3, 80, ew + 44, 30);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ic, ex, Math.round(95 - eh / 2), ew, eh);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(ex - 3, 108, ew + 44, 2);
        ctx.fillStyle = e.type === 'nightVision' ? '#7dff8e' : '#fff3c4'; ctx.fillRect(ex - 3, 108, Math.round((ew + 44) * left / e.dur), 2);
        ctx.font = '20px VT323, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = warn ? '#ff8a6a' : e.type === 'nightVision' ? '#7dff8e' : '#fff3c4';
        ctx.fillText(tr('{n}초', { n: Math.ceil(left) }), ex + ew + 5, 95);
        ex += ew + 54;
      }
      ctx.textBaseline = 'top';
    }
    if (game.testMode && (game.test.god || game.test.fullbright)) {
      ctx.font = '16px VT323, monospace'; ctx.fillStyle = '#c87ad0';
      ctx.fillText(`TEST${game.test.god ? ' 무적' : ''}${game.test.fullbright ? ' 밝게' : ''}`, 20, 118);
    }

    if (game.noteOpen) this.drawNote(ctx, game, W, H);

    // 시간 + (멀티) 동료 색 점
    ctx.textAlign = 'right';
    ctx.font = '24px VT323, monospace';
    ctx.fillStyle = 'rgba(168,152,79,0.8)';
    ctx.fillText(fmtTime(game.elapsed), W - 20, 16);
    if (game.remotes.size) {
      let lx = W - 26;
      for (const pl of game.allPlayers()) {
        ctx.fillStyle = SUIT_HEX[pl.color] || pl.color;
        ctx.globalAlpha = pl.alive ? 1 : pl.status === 'escaped' ? 0.6 : 0.25;
        ctx.fillRect(lx, 46, 10, 10);
        if (pl === p) { ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 1; ctx.strokeRect(lx - 1.5, 44.5, 13, 13); }
        lx -= 18;
      }
      ctx.globalAlpha = 1;
    }

    // 관전 중이면 누구를 보고 있는지만
    if (!p.alive && game.deathT <= 0) {
      const v = game.viewTarget();
      if (v !== p) {
        ctx.textAlign = 'center'; ctx.font = '22px VT323, monospace'; ctx.fillStyle = 'rgba(216,196,106,0.7)';
        ctx.fillText(v.name, W / 2, 20);
      }
    }

    this.drawInventory(ctx, game, W, H, dt);
    this.drawMic(ctx, game, H);
    if (game.compassT > 0 && p.alive) this.drawCompass(ctx, game, W, H);
    if (game.emoteOpen) this.drawEmoteWheel(ctx, game, W, H);

    // 테스트 결과 (테스트 모드에서만)
    ctx.textAlign = 'center'; ctx.font = '20px VT323, monospace';
    game.messages.forEach((m, i) => {
      ctx.fillStyle = `rgba(200,122,208,${Math.min(1, m.t / 0.5)})`;
      ctx.fillText(m.text, W / 2, H - 150 - i * 22);
    });

    // 미니맵 (탐색한 구역 + 내 위치). 질주 레벨은 진행 막대로 대신
    if (game.horde) return;
    this.minimapT -= dt;
    if (this.minimapT <= 0) { this.renderMinimap(game); this.minimapT = 0.25; }
    const s = this.mmScale, mw = this.minimap.width, mh = this.minimap.height, mx = W - mw - 16, my = H - mh - 16;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.minimap, mx, my);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#4a4222'; ctx.lineWidth = 1;
    ctx.strokeRect(mx - 0.5, my - 0.5, mw + 1, mh + 1);
    // 내 위치 (관전 중이면 보고 있는 사람). '미니맵 동료 표시' 모드면 살아 있는 동료도 방호복 색 점으로
    const me = game.viewTarget();
    if (game.modes?.mapPlayers) {
      for (const pl of game.allPlayers()) {
        if (pl === me || !pl.alive) continue;
        ctx.fillStyle = SUIT_HEX[pl.color] || '#e7b92e';
        ctx.fillRect(mx + (pl.x / TS) * s - 1.5, my + (pl.y / TS) * s - 1.5, 3, 3);
      }
    }
    if (me?.alive) {
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(mx + (me.x / TS) * s - 1.5, my + (me.y / TS) * s - 1.5, 3, 3);
    }
  }

  /** 시작 지점 쪽지: 낡은 종이에 손글씨로 이 레벨에서 할 일 */
  drawNote(ctx, game, W, H) {
    const info = levelInfo(game.levelIndex ?? 0), goal = missionGoal(game.level.mission);
    const pw = Math.min(480, W - 40), tw = pw - 56;
    // 글자 단위 줄바꿈 (한글이라 공백이 적다)
    const wrap = (text, font, indent = 0) => {
      ctx.font = font;
      const out = [];
      let cur = '';
      if (getLang() === 'en') {         // 영어: 단어 단위 (한 줄보다 긴 단어만 글자 단위)
        const max = () => tw - (out.length ? indent : 0);
        for (const word of text.split(/\s+/).filter(Boolean)) {
          const next = cur ? cur + ' ' + word : word;
          if (ctx.measureText(next).width <= max()) { cur = next; continue; }
          if (cur) out.push(cur);
          cur = '';
          for (const ch of word) { if (cur && ctx.measureText(cur + ch).width > max()) { out.push(cur); cur = ch; } else cur += ch; }
        }
        if (cur) out.push(cur);
        return out;
      }
      for (const ch of text) { if (ctx.measureText(cur + ch).width > tw - (out.length ? indent : 0)) { out.push(cur); cur = ch.trim() ? ch : ''; } else cur += ch; }
      if (cur) out.push(cur);
      return out;
    };
    // 1) 할 일  2) 이 레벨 괴물별 대처법 (괴물 도감의 대처법)
    const F1 = '22px VT323, monospace', F2 = '19px VT323, monospace';
    const rows = [];
    for (const part of goal.split(' — ')) for (const l of wrap(part, F1)) rows.push({ text: l, font: F1, col: '#2a2016', h: 27 });
    const over = info.tips || {};
    const tips = typesInLevel(game.levelIndex ?? 0).map(t => BESTIARY.find(b => b.type === t)).filter(Boolean)
      .map(b => (over[b.type] ? { ...b, counter: over[b.type] } : b));
    if (tips.length) {
      rows.push({ gap: 10 });
      rows.push({ text: tr('살아남는 법'), font: '22px VT323, monospace', col: '#8a1a10', h: 27 });
      for (const b of tips) {
        const bn = tr(b.name), ls = wrap(`${bn} — ${tr(b.counter)}`, F2, 14);
        ls.forEach((l, i) => rows.push({ text: l, font: F2, col: '#3a2c1a', h: 23, x: i ? 14 : 0, name: i ? null : bn }));
      }
    }
    const bodyH = rows.reduce((t, r) => t + (r.gap ?? r.h), 0);
    const ph = 92 + bodyH, x = Math.round(W / 2 - pw / 2), y = Math.max(12, Math.round(H / 2 - ph / 2 - 30));
    ctx.save();
    ctx.translate(W / 2, y + ph / 2); ctx.rotate(-0.02); ctx.translate(-W / 2, -(y + ph / 2));
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 6, y + 8, pw, ph);
    ctx.fillStyle = '#e8dfc2'; ctx.fillRect(x, y, pw, ph);
    ctx.fillStyle = 'rgba(120,30,20,0.35)'; ctx.beginPath(); ctx.arc(x + pw - 46, y + ph - 30, 12, 0, Math.PI * 2); ctx.fill();               // 얼룩
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '26px VT323, monospace'; ctx.fillStyle = '#4a3a22';
    ctx.fillText(`${tr(levelLabel(game.levelIndex ?? 0))} — ${tr(info.name)}`, x + 24, y + 18);
    let yy = y + 58;
    for (const r of rows) {
      if (r.gap) { ctx.fillStyle = 'rgba(120,100,60,0.35)'; ctx.fillRect(x + 24, yy + r.gap / 2 - 1, pw - 48, 1); yy += r.gap; continue; }
      ctx.font = r.font;
      const tx = x + 28 + (r.x || 0);
      if (r.name && r.text.startsWith(r.name)) {        // 괴물 이름은 붉은 글씨
        ctx.fillStyle = '#8a1a10'; ctx.fillText(r.name, tx, yy);
        ctx.fillStyle = r.col; ctx.fillText(r.text.slice(r.name.length), tx + ctx.measureText(r.name).width, yy);
      } else { ctx.fillStyle = r.col; ctx.fillText(r.text, tx, yy); }
      yy += r.h;
    }
    ctx.font = '16px VT323, monospace'; ctx.fillStyle = '#7a6a4a'; ctx.textAlign = 'right';
    ctx.fillText(tr('E 로 닫기'), x + pw - 18, y + ph - 22);
    ctx.restore();
  }


  /** 열쇠가 아닌 미션: "퓨즈 2/4  (들고 있음 1)" / "밸브 1/4" / "체크아웃까지 01:42" */
  drawMission(ctx, game) {
    const o = game.obj;
    if (!o && game.level?.mission?.type === 'noclip') {          // 끝없는 도시: 목표 = 맨 위 노클립 존
      const e = game.level.exitIdx, ey = (e / game.map.w) | 0, py = Math.floor((game.local?.y ?? 0) / TS);
      ctx.font = '20px VT323, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#9fd8ff';
      ctx.fillText(tr('노클립 존까지 {n}칸 ↑', { n: Math.max(0, py - ey) }), 20, 50);
      return;
    }
    if (!o) return;
    const M = game.level.mission, TXT = MISSION_TEXT[missionKind(M)] || {}, unit = tr(TXT.unit);
    let text;
    if (o.type === 'survive') text = game.exitUnlocked ? tr('{unit} — 출구가 열렸다', { unit }) : tr('{unit}까지 {time}', { unit, time: fmtTime(Math.ceil(o.left)) }) + (game.local?.hidden ? tr('  (숨어만 있으면 시간이 멈춘다)') : '');
    else {
      text = `${unit} ${o.done}/${o.total}`;
      if (o.type === 'deliver') {
        const held = o.parts.filter(pt => pt.s === 1 && pt.c === game.myId).length;
        if (held) text += tr('  (들고 있음 {held}/{max})', { held, max: MISSION.CARRY });
      }
      if (game.exitUnlocked) text += tr('  — 출구가 열렸다');
    }
    ctx.font = '20px VT323, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = game.exitUnlocked ? '#6edc78' : o.type === 'survive' && o.left < 15 && Math.floor(game.time * 4) % 2 ? '#ff6a4a' : '#e6c24e';
    ctx.fillText(text, 20, 50);
  }

  /** 보이스 챗 마이크 상태 (왼쪽 아래): 꺼짐 = 빨간 사선, 켜짐 = 회색, 말하는 중 = 초록 */
  drawMic(ctx, game, H) {
    const V = game.voice;
    if (!V?.enabled) return;
    const x = 26, y = H - 40, on = V.micOn, talk = V.speaking;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 12, y - 16, 24, 32);
    ctx.fillStyle = !on ? '#7a3a30' : talk ? '#6edc78' : '#b9a552';
    ctx.fillRect(x - 4, y - 11, 8, 13); ctx.fillRect(x - 1, y + 5, 2, 5); ctx.fillRect(x - 5, y + 10, 10, 2);
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 7, 0.1, Math.PI - 0.1); ctx.stroke();
    if (!on) { ctx.strokeStyle = '#e0503a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 9, y + 11); ctx.lineTo(x + 9, y - 13); ctx.stroke(); }
    if (on && V.level > 0.01) { ctx.fillStyle = 'rgba(110,220,120,0.8)'; ctx.fillRect(x + 14, y + 12 - 24 * V.level, 3, 24 * V.level); }
  }

  /** 질주 레벨 진행 막대: 위 가운데. 붉은 영역 = 괴물 떼, 점 = 플레이어, 오른쪽 끝 = 출구 */
  drawRunBar(ctx, game, W) {
    const len = game.map.w * TS, bw = Math.min(560, W - 360), bx = Math.round(W / 2 - bw / 2), by = 22;
    const fx = v => bx + Math.max(0, Math.min(1, v / len)) * bw;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
    ctx.fillStyle = '#3a1210'; ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = `rgba(200,30,20,${0.8 + Math.sin(game.time * 8) * 0.2})`; ctx.fillRect(bx, by, fx(game.horde.x) - bx, 10);
    ctx.fillStyle = '#6edc78'; ctx.fillRect(bx + bw - 4, by - 3, 4, 16);
    for (const pl of game.allPlayers()) {
      if (pl.status === 'dead') continue;
      ctx.fillStyle = pl === game.local ? '#fff3c4' : (SUIT_HEX[pl.color] || pl.color);
      ctx.fillRect(Math.round(fx(pl.x)) - 2, by - 3, 4, 16);
    }
    ctx.font = '22px VT323, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = `rgba(255,80,60,${0.6 + Math.sin(game.time * 10) * 0.4})`;
    ctx.fillText('RUN →', W / 2, by + 16);
    ctx.textAlign = 'left';
  }

  /**
   * 인벤토리: 아래 가운데 4칸 (칸 번호 고정). 숫자 = 손에 드는 키, 점 = 남은 횟수.
   * 손에 든 칸은 밝은 테두리로 살짝 올라오고, 그 위에 사용법 안내.
   * 칸 위: 꾹 눌러 쓰는 중이면 흰 원이 차오른다. (지속 효과 남은 초는 정신력 옆에)
   */
  drawInventory(ctx, game, W, H, dt = 0.016) {
    const n = CONFIG.INVENTORY_SIZE, size = 46, gap = 6, x0 = Math.round(W / 2 - (n * size + (n - 1) * gap) / 2), y0 = H - size - 18;
    // 손에 든 칸은 부드럽게 6px 떠오르고, 내려놓으면 부드럽게 내려간다
    if (!this.slotLift) this.slotLift = Array(n).fill(0);
    for (let i = 0; i < n; i++) this.slotLift[i] += ((game.held === i ? 6 : 0) - this.slotLift[i]) * Math.min(1, dt * 16);
    const liftOf = i => Math.round(this.slotLift[i]);
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < n; i++) {
      const it = game.inv[i], held = game.held === i;
      const x = x0 + i * (size + gap), y = y0 - liftOf(i);
      ctx.fillStyle = held ? 'rgba(40,34,14,0.85)' : 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = held ? '#fff3c4' : it ? '#8a7a3a' : '#3a3420'; ctx.lineWidth = held ? 2 : 1;
      if (held) ctx.strokeRect(x + 1, y + 1, size - 2, size - 2); else ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      ctx.lineWidth = 1;
      ctx.font = '14px VT323, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = held ? '#fff3c4' : it ? '#b9a552' : '#4a4222'; ctx.fillText(String(i + 1), x + 3, y + 1);
      if (!it) continue;
      const ic = itemIcon(it.type), k = 2;
      ctx.drawImage(ic, Math.round(x + size / 2 - (ic.width * k) / 2), Math.round(y + size / 2 - (ic.height * k) / 2 + 2), ic.width * k, ic.height * k);
      for (let u = 0; u < it.uses && it.uses > 1; u++) { ctx.fillStyle = '#d8c46a'; ctx.fillRect(x + size - 7 - u * 5, y + size - 6, 3, 3); }
    }
    // 칸 위 표시: 꾹 누르는 진행 원
    const above = i => ({ cx: x0 + i * (size + gap) + size / 2, top: y0 - liftOf(i) - 6 });
    const stack = {};
    const h = game.useHold;
    if (h && h.slot >= 0 && h.slot < n) {
      const { cx, top } = above(h.slot), r = 13, cy = top - (stack[h.slot] || 0) - r - 2, f = Math.min(1, h.t / h.dur);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r - 1, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1;
    }
    // 손에 든 아이템: 이름 + 사용법 (꾹 눌러야 하는 아이템은 그렇다고 알려 준다).
    // 들었을 때 1.5초만 보이고 0.5초 동안 서서히 사라진다 (다시 들거나 다른 아이템을 들면 또 보인다)
    const it = game.held >= 0 ? game.inv[game.held] : null;
    const hintKey = it ? `${game.held}:${it.type}` : '';
    if (hintKey !== this.hintKey) { this.hintKey = hintKey; this.hintAt = game.time; }
    const hintA = it ? Math.max(0, Math.min(1, 1 - (game.time - this.hintAt - 1.5) / 0.5)) : 0;
    if (it && !h && hintA > 0) {
      ctx.globalAlpha = hintA;
      const def = ITEM_TYPES[it.type] || {}, drop = keyLabel(Input.binds.drop);
      const how = def.hold ? tr('좌클릭 꾹 눌러 사용') : tr('좌클릭으로 사용');
      const line = `${tr(def.name ?? '아이템')} · ${how} · ${tr('{key} 버리기', { key: drop })}`;
      ctx.font = '17px VT323, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const w = ctx.measureText(line).width + 16, ly = y0 - 14;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W / 2 - w / 2, ly - 15, w, 20);
      ctx.fillStyle = def.hold ? '#ffffff' : '#e8d890'; ctx.fillText(line, W / 2, ly);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  /** 나침반: 플레이어 위에 가장 가까운 열쇠(다 모았으면 출구) 방향 화살표 */
  drawCompass(ctx, game, W, H) {
    const p = game.local, map = game.map;
    let tx, ty;
    const o = game.obj;
    const nearest = list => { let best = Infinity; for (const k of list) { const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < best) { best = d; tx = k.x; ty = k.y; } } };
    if (game.exitUnlocked || o?.type === 'survive') { const e = game.level.exitIdx; tx = (e % map.w) * TS + TS / 2; ty = ((e / map.w) | 0) * TS + TS / 2; }
    else if (o?.type === 'deliver') {
      const held = o.parts.filter(pt => pt.s === 1 && pt.c === game.myId).length, ground = o.parts.filter(pt => pt.s === 0);
      if (held >= MISSION.CARRY || (held && !ground.length)) nearest([game.level.depot]); else nearest(ground);
    }
    else if (o?.type === 'activate') nearest(game.level.stations.filter((st, i) => (o.prog[i] || 0) < 1));
    else {
      let best = Infinity;
      for (const k of game.keys) { if (k.collected) continue; const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < best) { best = d; tx = k.x; ty = k.y; } }
    }
    if (tx === undefined) return;
    const a = Math.atan2(ty - p.y, tx - p.x), cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.16;
    const alpha = Math.min(1, game.compassT / 2) * (0.75 + Math.sin(game.time * 6) * 0.2);
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(a);
    ctx.fillStyle = game.exitUnlocked ? `rgba(110,220,120,${alpha})` : `rgba(255,214,90,${alpha})`;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-3, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /** 감정 표현 고르기 (, 키 → 숫자 1~6) */
  drawEmoteWheel(ctx, game, W, H) {
    const lines = CONFIG.EMOTE.LINES.map(l => tr(l)), acts = [['7', '뻐큐'], ['8', '가리키기'], ['9', '춤 1 (들썩)'], ['0', '춤 2 (빙글)'], ['-', '트월킹']].filter(([k]) => k !== '7' || game.modes?.finger).map(([k, l]) => [k, tr(l)]);
    ctx.font = '20px VT323, monospace';
    const longest = Math.max(0, ...lines.map(l => ctx.measureText(l).width), ...acts.map(([, l]) => ctx.measureText(l).width));
    const rowH = 26, colW = Math.max(210, Math.ceil(longest) + 52), h = Math.max(lines.length, acts.length) * rowH + 40, w = colW * 2 + 24;
    const x = Math.round(W / 2 - w / 2), y = H - 90 - h;
    ctx.fillStyle = 'rgba(8,6,2,0.88)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#8a7a3a'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '16px VT323, monospace'; ctx.fillStyle = '#8a7a3a';
    ctx.fillText(tr('대사'), x + 12, y + 8); ctx.fillText(tr('동작'), x + colW + 24, y + 8);
    ctx.font = '20px VT323, monospace';
    lines.forEach((l, i) => {
      ctx.fillStyle = '#8a7a3a'; ctx.fillText(String(i + 1), x + 12, y + 30 + i * rowH);
      ctx.fillStyle = '#e8d890'; ctx.fillText(l, x + 36, y + 30 + i * rowH);
    });
    acts.forEach(([k, l], i) => {
      ctx.fillStyle = '#8a7a3a'; ctx.fillText(k, x + colW + 24, y + 30 + i * rowH);
      ctx.fillStyle = '#9fe0a0'; ctx.fillText(l, x + colW + 48, y + 30 + i * rowH);
    });
  }

}
