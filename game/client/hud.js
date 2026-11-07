import { CONFIG, TS, T, SUIT_HEX, MISSION, MISSION_TEXT, levelLabel, missionKind } from '../../shared/config.js';
import { itemIcon } from './sprites.js';

const fmtTime = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * 최소한의 HUD (글자는 최대한 줄였다):
 *  왼쪽 위  레벨 이름, 열쇠 아이콘, 스태미나 바
 *  오른쪽 위 시간, (멀티일 때) 동료 색 점
 *  아래 가운데 인벤토리 1~4 칸, 나침반 화살표
 *  오른쪽 아래 미니맵
 */
export class Hud {
  setMap(map) {
    this.map = map;
    this.minimap = document.createElement('canvas');
    this.minimap.width = map.w * 2;
    this.minimap.height = map.h * 2;
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
    if (game.night === 'warn' || game.night === 'night') {
      ctx.textAlign = 'center'; ctx.font = '30px VT323, monospace';
      ctx.fillStyle = game.night === 'night' ? `rgba(255,80,60,${0.7 + Math.sin(game.time * 6) * 0.3})` : 'rgba(255,220,120,0.95)';
      ctx.fillText(game.night === 'night' ? (p.hidden ? '밤 — 숨어 있어라...' : '밤이다! 숨어라!') : '종이 울린다 — 밤이 온다. 옷장에 숨어라', W / 2, 64);
      ctx.textAlign = 'left';
    }
    for (let i = 0; i < (game.horde || game.obj ? 0 : game.keys.length); i++) {
      const x = 26 + i * 30, y = 62, got = i < game.keysCollected;
      ctx.strokeStyle = got ? '#e6c24e' : '#4a4222'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillRect(x + 5, y - 1.5, 13, 3); ctx.fillRect(x + 14, y + 1.5, 2, 4);
    }

    // 스태미나 (아몬드 워터 효과 중엔 하늘색)
    if (p.alive) {
      const sw = 150, sx = 20, sy = 80;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx, sy, sw, 7);
      ctx.fillStyle = p.boostT > 0 ? '#9fd4e8' : p.exhausted ? '#7a2a1c' : '#b9a552';
      ctx.fillRect(sx + 1, sy + 1, (sw - 2) * (p.stamina / CONFIG.PLAYER.STAMINA), 5);
      // 정신력 (보라색). 낮으면 깜빡인다
      const san = Math.max(0, Math.min(1, (p.sanity ?? CONFIG.SANITY.MAX) / CONFIG.SANITY.MAX));
      const low = san * CONFIG.SANITY.MAX < CONFIG.SANITY.HALLUCINATE;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx, sy + 11, sw, 7);
      ctx.fillStyle = low && Math.floor(game.time * 4) % 2 ? '#e0508a' : '#9a6ad0';
      ctx.fillRect(sx + 1, sy + 12, (sw - 2) * san, 5);
      ctx.font = '14px VT323, monospace'; ctx.fillStyle = low ? '#e0508a' : 'rgba(154,106,208,0.8)';
      ctx.fillText('정신력', sx + sw + 6, sy + 8);
    }
    if (game.testMode && (game.test.god || game.test.fullbright)) {
      ctx.font = '16px VT323, monospace'; ctx.fillStyle = '#c87ad0';
      ctx.fillText(`TEST${game.test.god ? ' 무적' : ''}${game.test.fullbright ? ' 밝게' : ''}`, 20, 104);
    }

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

    this.drawInventory(ctx, game, W, H);
    this.drawMic(ctx, game, H);
    if (game.compassT > 0 && p.alive) this.drawCompass(ctx, game, W, H);
    if (game.emoteOpen) this.drawEmoteWheel(ctx, game, W, H);

    // 테스트 결과 (테스트 모드에서만)
    ctx.textAlign = 'center'; ctx.font = '20px VT323, monospace';
    game.messages.forEach((m, i) => {
      ctx.fillStyle = `rgba(200,122,208,${Math.min(1, m.t / 0.5)})`;
      ctx.fillText(m.text, W / 2, H - 150 - i * 22);
    });

    // 미니맵 (탐색한 구역 + 동료 위치). 질주 레벨은 진행 막대로 대신
    if (game.horde) return;
    this.minimapT -= dt;
    if (this.minimapT <= 0) { this.renderMinimap(game); this.minimapT = 0.25; }
    const s = 2, mw = this.minimap.width, mh = this.minimap.height, mx = W - mw - 16, my = H - mh - 16;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.minimap, mx, my);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#4a4222'; ctx.lineWidth = 1;
    ctx.strokeRect(mx - 0.5, my - 0.5, mw + 1, mh + 1);
    for (const pl of game.allPlayers()) {
      if (!pl.alive) continue;
      ctx.fillStyle = pl === p ? '#fff3c4' : (SUIT_HEX[pl.color] || pl.color);
      ctx.fillRect(mx + (pl.x / TS) * s - 1.5, my + (pl.y / TS) * s - 1.5, 3, 3);
    }
  }

  /** 열쇠가 아닌 미션: "퓨즈 2/4  (들고 있음 1)" / "밸브 1/4" / "체크아웃까지 01:42" */
  drawMission(ctx, game) {
    const o = game.obj;
    if (!o) return;
    const M = game.level.mission, TXT = MISSION_TEXT[missionKind(M)] || {};
    let text;
    if (o.type === 'survive') text = game.exitUnlocked ? `${TXT.unit} — 출구가 열렸다` : `${TXT.unit}까지 ${fmtTime(Math.ceil(o.left))}${game.local?.hidden ? '  (숨어만 있으면 시간이 멈춘다)' : ''}`;
    else {
      text = `${TXT.unit} ${o.done}/${o.total}`;
      if (o.type === 'deliver') {
        const held = o.parts.filter(pt => pt.s === 1 && pt.c === game.myId).length;
        if (held) text += `  (들고 있음 ${held}/${MISSION.CARRY})`;
      }
      if (game.exitUnlocked) text += '  — 출구가 열렸다';
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

  /** 인벤토리: 아래 가운데 4칸. 숫자 = 사용 키, 점 = 남은 횟수 */
  drawInventory(ctx, game, W, H) {
    const n = CONFIG.INVENTORY_SIZE, size = 46, gap = 6, x0 = Math.round(W / 2 - (n * size + (n - 1) * gap) / 2), y0 = H - size - 18;
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (size + gap), it = game.inv[i];
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y0, size, size);
      ctx.strokeStyle = it ? '#8a7a3a' : '#3a3420'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y0 + 0.5, size - 1, size - 1);
      ctx.font = '14px VT323, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = it ? '#b9a552' : '#4a4222'; ctx.fillText(String(i + 1), x + 3, y0 + 1);
      if (!it) continue;
      const ic = itemIcon(it.type), k = 2;
      ctx.drawImage(ic, Math.round(x + size / 2 - (ic.width * k) / 2), Math.round(y0 + size / 2 - (ic.height * k) / 2 + 2), ic.width * k, ic.height * k);
      for (let u = 0; u < it.uses && it.uses > 1; u++) { ctx.fillStyle = '#d8c46a'; ctx.fillRect(x + size - 7 - u * 5, y0 + size - 6, 3, 3); }
    }
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
    const lines = CONFIG.EMOTE.LINES, acts = [['7', '뻐큐'], ['8', '가리키기'], ['9', '춤 1 (들썩)'], ['0', '춤 2 (빙글)']];
    const rowH = 26, colW = 210, h = Math.max(lines.length, acts.length) * rowH + 40, w = colW * 2 + 24;
    const x = Math.round(W / 2 - w / 2), y = H - 90 - h;
    ctx.fillStyle = 'rgba(8,6,2,0.88)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#8a7a3a'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '16px VT323, monospace'; ctx.fillStyle = '#8a7a3a';
    ctx.fillText('대사', x + 12, y + 8); ctx.fillText('동작', x + colW + 24, y + 8);
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
