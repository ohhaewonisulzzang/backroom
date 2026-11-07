import { CONFIG, TS, MISSION, levelLabel, levelInfo, missionGoal, missionKind } from '../../shared/config.js';
import { clamp } from '../../shared/utils.js';
import { castRay } from '../../shared/physics.js';
import { LightSystem } from './lighting.js';
import { buildMapTexture, TILE_PX } from './texture.js';
import {
  ART, drawPlayer, drawMonster, drawMonsterGlow, drawMonsterEyes, drawJumpscareSprite,
  drawKey, drawTerminal, drawItem, drawLocker, drawExitSign, drawNameTag, drawBubble, drawPrompt, drawBalloonDecor, drawMothSwarm, humanPreview,
  drawPart, drawDepot, drawStation, drawArcade, partIcon, drawPlayerGesture,
} from './sprites.js';
import { Hud } from './hud.js';
import { drawStory } from './story.js';
import { drawDeathOverlay, drawGore } from './deaths.js';

/**
 * 그리기 순서
 *  1) 바닥/벽 텍스처 → 형광등 빛 웅덩이 → 열쇠 → 사물함/사람/엔티티 (y 정렬, 가시성만큼 서서히 나타남)
 *  2) 어둠 레이어 (형광등 라이트맵 + 깜빡임 − 손전등)
 *  3) 시야 안개 (벽 뒤, 타일 가시성을 부드럽게 보간)
 *  4) 어둠 위 요소 (스마일러 미소, 눈, EXIT, 이름표, 말풍선, 안내) → 후처리 → HUD
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lightCanvas = document.createElement('canvas');
    this.lctx = this.lightCanvas.getContext('2d');
    this.fogCanvas = document.createElement('canvas');
    this.fctx = this.fogCanvas.getContext('2d');
    this.lights = new LightSystem();
    this.hud = new Hud();
    this.mapTex = null;
    this.freshLevel = false;
    this.W = 0; this.H = 0; this.scale = 1;
    this.makePatterns();
    this.resize();
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
  }

  dispose() { removeEventListener('resize', this.onResize); }

  makePatterns() {
    const grain = document.createElement('canvas');
    grain.width = grain.height = 128;
    const g = grain.getContext('2d'), img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v; img.data[i + 1] = v * 0.92; img.data[i + 2] = v * 0.7; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.grainPattern = this.ctx.createPattern(grain, 'repeat');
    const scan = document.createElement('canvas');
    scan.width = 4; scan.height = 3;
    const sg = scan.getContext('2d');
    sg.fillStyle = 'rgba(0,0,0,0.5)'; sg.fillRect(0, 0, 4, 1);
    this.scanPattern = this.ctx.createPattern(scan, 'repeat');
  }

  resize() {
    const W = this.W = this.canvas.width = innerWidth;
    const H = this.H = this.canvas.height = innerHeight;
    this.lightCanvas.width = this.fogCanvas.width = W;
    this.lightCanvas.height = this.fogCanvas.height = H;
    // 픽셀아트가 뭉개지지 않도록 "아트 1픽셀 = 화면 정수 픽셀"이 되게 배율을 맞춘다
    const pixel = clamp(Math.round((Math.min(W, H) / 640) * 2), 2, 4);
    this.scale = pixel / ART;
    const v = this.ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(10,6,0,0.45)');
    this.vignette = v;
  }

  setLevel(level) {
    this.mapTex = buildMapTexture(level);
    this.lights.setLevel(level);
    this.hud.setMap(level.map);
    this.freshLevel = true;
  }

  /** 엔진이 매 프레임 호출: 깜빡임 진행 (켜지거나 꺼진 등 목록 [{ l, off }] 반환) */
  updateLights(dt) { return this.mapTex ? this.lights.updateFlicker(dt) : []; }

  render(game, dt) {
    const { ctx, W, H, scale } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (!game.map || !this.mapTex) return;
    ctx.imageSmoothingEnabled = false;

    const view = game.viewTarget(), cam = game.cam, map = game.map, level = game.level;
    const shx = (Math.random() - 0.5) * game.shake, shy = (Math.random() - 0.5) * game.shake;
    const world = [scale, 0, 0, scale, Math.round(-cam.x * scale + shx), Math.round(-cam.y * scale + shy)];
    const vw = W / scale, vh = H / scale;

    // ---- 시야 (타일 가시성, 부드럽게) / 손전등 ----
    this.lights.updateVisibility(view, dt, game.explored, this.freshLevel);
    this.freshLevel = false;
    const bright = !!game.test?.fullbright;
    const seen = e => {
      if (bright) return 1;
      const v = this.lights.visibilityAt(e.x, e.y);
      return v < 0.05 ? 0 : Math.min(1, (v - 0.05) / 0.7);
    };
    const flashlights = [];
    for (const p of game.allPlayers()) {
      if (p.alive && !p.hidden) flashlights.push(this.lights.flashlight(p, p === view ? game.flicker.intensity : 1));
    }

    // ---- 월드 ----
    ctx.setTransform(...world);
    // 넓은 맵: 화면에 보이는 부분의 텍스처만 잘라서 그린다
    const k = TILE_PX / TS;
    const wx0 = Math.max(0, Math.floor(cam.x / TS) - 2) * TS, wy0 = Math.max(0, Math.floor(cam.y / TS) - 2) * TS;
    const wx1 = Math.min(map.w * TS, wx0 + vw + TS * 5), wy1 = Math.min(map.h * TS, wy0 + vh + TS * 5);
    if (wx1 > wx0 && wy1 > wy0) ctx.drawImage(this.mapTex, wx0 * k, wy0 * k, (wx1 - wx0) * k, (wy1 - wy0) * k, wx0, wy0, wx1 - wx0, wy1 - wy0);
    this.lights.drawLightPools(ctx, cam, vw, vh, game.time);
    drawGore(ctx, game);
    for (const key of game.keys) if (!key.collected && !key.puzzle) drawKey(ctx, key, game.time);
    const obj = game.obj, mkind = missionKind(level.mission);
    if (obj?.type === 'deliver') for (const pt of obj.parts) if (pt.s === 0) drawPart(ctx, pt, mkind, game.time);
    for (const it of game.items) drawItem(ctx, it, game.time);

    const inView = (o, m = TS) => o.x > cam.x - m && o.x < cam.x + vw + m && o.y > cam.y - m * 2 && o.y < cam.y + vh + m;
    // 파티고어 시야 (부채꼴) — 바닥에 옅게 표시해서 사각지대로 숨어 다닐 수 있게
    for (const m of game.monsters) {
      if (m.type !== 'partygoer' || !inView(m, TS * 7) || m.state === 'chase') continue;
      const a = seen(m);
      if (a > 0) this.drawVisionCone(ctx, map, m, a);
    }
    const prop = level.info?.hideProp || 'locker';
    const actors = [];
    level.lockers.forEach((lk, i) => {
      if (!inView(lk)) return;
      actors.push({ y: lk.y - 6, draw: () => drawLocker(ctx, lk, game.time, game.lockerShake[i] || 0, 1, prop) });
    });
    for (const [di, d] of (level.decor || []).entries()) {
      if (!inView(d) || (d.kind === 'balloon' && game.popped.has(di))) continue;
      if (d.kind === 'moths') actors.push({ y: d.y + 40, draw: () => drawMothSwarm(ctx, d, game.time) });
      else actors.push({ y: d.y - 2, draw: () => drawBalloonDecor(ctx, d, game.time) });
    }
    // 퍼즐 단말기 (열쇠가 안에 잠겨 있다)
    const arcade = mkind === 'games';    // Level Fun: 퍼즐 단말기 대신 스탠딩 아케이드 기계
    for (const k of game.keys) if (k.puzzle && !k.collected && inView(k)) actors.push({ y: k.y + 4, draw: () => (arcade ? drawArcade : drawTerminal)(ctx, k, game.time, game.puzzleOpen === game.keys.indexOf(k)) });
    for (const f of game.flares) if (inView(f)) actors.push({ y: f.y, draw: () => this.drawFlareStick(ctx, f, game.time) });
    // 미션 장치: 배달 장치(배전반/무전기), 작동 장치(밸브/발전기/펌프)
    if (level.depot && obj?.type === 'deliver' && inView(level.depot)) {
      actors.push({ y: level.depot.y + 4, draw: () => drawDepot(ctx, level.depot, mkind, obj.done, obj.total, game.time, game.exitUnlocked) });
    }
    if (obj?.type === 'activate') level.stations.forEach((st, i) => {
      if (inView(st)) actors.push({ y: st.y + 4, draw: () => drawStation(ctx, st, mkind, obj.prog[i] || 0, game.time) });
    });
    for (const p of game.allPlayers()) {
      if (!p.alive || p.hidden) continue;
      const a = p === view || p === game.local ? 1 : seen(p);
      if (a > 0) actors.push({ y: p.y, draw: () => {
        if (p.gesture) drawPlayerGesture(ctx, p, game.time, a); else drawPlayer(ctx, p, a);
        // 들고 있는 부품은 머리 위에 표시
        if (obj?.type === 'deliver') {
          const held = obj.parts.filter(pt => pt.s === 1 && pt.c === p.id);
          held.forEach((pt, n) => {
            const ic = partIcon(mkind);
            ctx.globalAlpha = a; ctx.drawImage(ic, Math.round(p.x - (held.length * 9) + n * 18 - 3), Math.round(p.y - 86), ic.width * 1.5, ic.height * 1.5); ctx.globalAlpha = 1;
          });
        }
      } });
    }
    const shownMonsters = [];
    for (const m of game.monsters) {
      if (m.active === false) continue;
      const a = seen(m);
      if (a <= 0) continue;
      shownMonsters.push({ m, a });
      actors.push({ y: m.y, draw: () => drawMonster(ctx, m, game.time, a) });
    }
    actors.sort((p, q) => p.y - q.y).forEach(o => o.draw());
    if (game.horde) this.drawHorde(ctx, game, cam, vw, vh, false);

    // ---- 어둠 + 안개 ----
    if (!bright) {
      this.lights.drawDarkness(this.lctx, W, H, world, flashlights, game.flares, game.time);
      this.lights.drawFog(this.fctx, W, H, world);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.lightCanvas, 0, 0);
      ctx.drawImage(this.fogCanvas, 0, 0);
    }

    // ---- 어둠 위 요소 ----
    ctx.setTransform(...world);
    for (const { m, a } of shownMonsters) {
      drawMonsterGlow(ctx, m, game.time, a);
      if (m.state === 'chase' && view.alive) drawMonsterEyes(ctx, m, a);
    }
    if (game.horde) this.drawHorde(ctx, game, cam, vw, vh, true);
    // 정신력 환각: 어둠도 무시하고 보이는 가짜 스마일러
    for (const h of game.hallu) {
      const a = Math.min(1, h.t / 0.4, (h.dur - h.t) / 0.4) * (Math.random() < 0.15 ? 0.3 : 1);
      drawMonster(ctx, h, game.time, a * 0.85);
      drawMonsterGlow(ctx, h, game.time, a);
      drawMonsterEyes(ctx, h, a);
    }
    if (game.explored[level.exitIdx]) drawExitSign(ctx, map, level.exitIdx, game.exitUnlocked, game.time);
    for (const p of game.remotes.values()) {
      if (!p.alive || p.hidden || p === view) continue;
      const a = seen(p);
      if (a > 0) drawNameTag(ctx, p, a * clamp(1.4 - Math.hypot(p.x - view.x, p.y - view.y) / CONFIG.VIEW_RANGE, 0.3, 1));
      if (a > 0 && p.vc) { ctx.font = '14px VT323, monospace'; this.drawSpeaker(ctx, p.x + ctx.measureText(p.name).width / 2 + 11, p.y - 54, p.vc === 2, game.voice?.levelOf(p.id) || 0, a); }
    }
    for (const { m, a } of shownMonsters) if (m.bubble && m.bubble.t > 0) drawBubble(ctx, m.x, m.y, m.bubble.text, Math.min(1, m.bubble.t) * a, m.revealed ? 120 : 64);
    for (const p of game.allPlayers()) {   // 플레이어 감정 표현 말풍선
      if (!p.bubble || !p.alive) continue;
      const a = p === game.local || p === view ? 1 : seen(p);
      if (a > 0) drawBubble(ctx, p.x, p.y, p.bubble.text, Math.min(1, p.bubble.t) * a, 64);
    }
    this.drawFx(ctx, map, game);
    // 밸브/크랭크 옆: E 안내 / 배달 장치 옆: 개수
    if (game.nearStation >= 0 && game.valveOpen < 0 && game.local.alive) {
      const st = level.stations[game.nearStation], pr = Math.round((obj.prog[game.nearStation] || 0) * 100);
      drawPrompt(ctx, st.x, st.y - 70, `E  ${mkind === 'generator' ? '크랭크' : '밸브'}${pr ? ` ${pr}%` : ''}`);
    }
    if (obj?.type === 'deliver' && level.depot && game.local.alive && Math.hypot(level.depot.x - game.local.x, level.depot.y - game.local.y) < TS * 2.5 && !game.exitUnlocked) {
      drawPrompt(ctx, level.depot.x, level.depot.y - 46, `${obj.done}/${obj.total}`);
    }
    if (game.nearNpc && game.local.alive) drawPrompt(ctx, game.nearNpc.x, game.nearNpc.y - 84, 'E  말 걸기');
    if (game.nearBalloon >= 0 && game.local.alive) { const b = level.decor[game.nearBalloon]; drawPrompt(ctx, b.x, b.y - 46, 'E  터뜨리기'); }
    if (game.nearPuzzle >= 0 && game.puzzleOpen < 0 && game.local.alive) {
      const k = game.keys[game.nearPuzzle];
      drawPrompt(ctx, k.x, k.y - (mkind === 'games' ? 92 : 58), mkind === 'games' ? 'E  게임' : 'E  퍼즐');
    }
    const near = game.nearLocker;
    if (near >= 0 && game.local.alive && !game.local.hidden) {
      const lk = level.lockers[near];
      drawPrompt(ctx, lk.x, lk.y - (prop === 'locker' ? 92 : 40), 'E');
    }

    if (game.horde && game.deathT <= 0) this.drawHordeEdge(game);
    this.drawNightFx(game);
    if (game.deathT > 0) drawDeathOverlay(this, game);
    else if (game.sanityLevel > 0 && game.local.alive) this.drawSanityFx(game);
    if (game.local.hidden && game.deathT <= 0) {
      const hp = level.info?.hideProp;
      if (hp === 'table' || hp === 'desk') this.drawTableView(game, hp === 'desk'); else this.drawLockerView(game);
    }
    if (game.flashT > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(255,255,248,${(game.flashT / 0.35) * 0.75})`; ctx.fillRect(0, 0, W, H); }
    this.drawPostFx(game);
    if (game.deathT <= 0) this.hud.draw(ctx, game, W, H, dt);
    if (game.cine) { this.drawCinematic(game); this.drawSkipHint(game); }
    if (game.paused) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H); }
  }

  /** 메인 메뉴 배경: 형광등 켜진 빈 레벨 0 을 천천히 떠도는 카메라 + 가끔 괴물 얼굴 */
  renderMenu(game, dt) {
    const { ctx, W, H, scale } = this, M = game.menu;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (!M || !this.mapTex) return;
    ctx.imageSmoothingEnabled = false;
    const map = M.level.map, cam = M.cam, vw = W / scale, vh = H / scale;
    const shx = (Math.random() - 0.5) * game.shake, shy = (Math.random() - 0.5) * game.shake;
    const world = [scale, 0, 0, scale, Math.round(-cam.x * scale + shx), Math.round(-cam.y * scale + shy)];
    ctx.setTransform(...world);
    const k = TILE_PX / TS;
    const wx0 = Math.max(0, Math.floor(cam.x / TS) - 2) * TS, wy0 = Math.max(0, Math.floor(cam.y / TS) - 2) * TS;
    const wx1 = Math.min(map.w * TS, wx0 + vw + TS * 5), wy1 = Math.min(map.h * TS, wy0 + vh + TS * 5);
    if (wx1 > wx0 && wy1 > wy0) ctx.drawImage(this.mapTex, wx0 * k, wy0 * k, (wx1 - wx0) * k, (wy1 - wy0) * k, wx0, wy0, wx1 - wx0, wy1 - wy0);
    this.lights.drawLightPools(ctx, cam, vw, vh, game.time);
    this.lights.drawDarkness(this.lctx, W, H, world, []);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.lightCanvas, 0, 0);
    // 메뉴 가독성을 위해 왼쪽을 어둡게
    const gr = ctx.createLinearGradient(0, 0, W * 0.6, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.78)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    if (M.scareT > 0) {
      const a = Math.min(1, M.scareT / 0.15);
      ctx.fillStyle = `rgba(${40 + Math.random() * 50},0,0,${0.85 * a})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a;
      drawJumpscareSprite(ctx, M.scareType, game.time, W / 2 + (Math.random() - 0.5) * 50, H / 2 + (Math.random() - 0.5) * 50, Math.min(W, H) * (1.1 - M.scareT * 0.6));
      ctx.globalAlpha = 1;
    }
    this.drawPostFx({ danger: M.scareT > 0 ? 1 : 0.1, deathT: 0, level: M.level });
  }

  /** 파티고어 시야 부채꼴 (벽에 막힘) */
  drawVisionCone(ctx, map, m, alpha) {
    const C = CONFIG.ENTITY.partygoer, n = 28, pts = [];
    for (let i = 0; i <= n; i++) {
      const a = m.angle - C.fov / 2 + (C.fov * i) / n;
      const d = castRay(map, m.x, m.y, a, C.sight, null);
      pts.push(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d);
    }
    const gr = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, C.sight);
    const hot = m.state === 'investigate' || m.state === 'look';
    gr.addColorStop(0, `rgba(255,${hot ? 60 : 200},60,${0.22 * alpha})`); gr.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(m.x, m.y);
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fill();
  }

  /** 사물함 안: 환기구 틈새로만 밖이 보인다 */
  drawLockerView(game) {
    const { ctx, W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const slitH = Math.round(H * 0.045), gap = Math.round(H * 0.075), sw = Math.round(W * 0.42);
    const sx = Math.round(W / 2 - sw / 2), sy = Math.round(H / 2 - gap * 1.5);
    ctx.fillStyle = 'rgba(6,7,5,0.94)';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    for (let i = 0; i < 4; i++) ctx.rect(sx, sy + i * gap, sw, slitH);
    ctx.fill('evenodd');
    ctx.fillStyle = 'rgba(80,90,78,0.35)';
    for (let i = 0; i < 4; i++) ctx.fillRect(sx, sy + i * gap + slitH, sw, 3);
    const breath = 0.5 + Math.sin(game.time * 2.2) * 0.5;
    ctx.fillStyle = `rgba(0,0,0,${0.12 + breath * 0.1})`;
    ctx.fillRect(0, 0, W, H);
  }

  /** 탁자 밑: 늘어진 체크무늬 식탁보 아래 틈으로 바닥 쪽만 보인다 */
  drawTableView(game, desk = false) {
    const { ctx, W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (desk) {
      // 책상 밑: 나무 상판 아래면 + 서랍, 다리 사이로 바닥이 보인다
      const top = Math.round(H * 0.5), bottom = Math.round(H * 0.9);
      ctx.fillStyle = 'rgba(40,24,12,0.98)'; ctx.fillRect(0, 0, W, top);
      ctx.fillStyle = 'rgba(62,38,20,0.95)';
      for (let y = 0; y < top; y += 28) ctx.fillRect(0, y, W, 3);
      ctx.fillStyle = 'rgba(30,18,9,1)'; ctx.fillRect(W * 0.3, top - 40, W * 0.4, 40);
      ctx.fillStyle = 'rgba(160,120,70,0.6)'; ctx.fillRect(W * 0.48, top - 24, W * 0.04, 5);
      ctx.fillStyle = 'rgba(5,3,2,0.96)'; ctx.fillRect(0, bottom, W, H - bottom);
      ctx.fillStyle = 'rgba(28,16,8,1)';
      ctx.fillRect(W * 0.1, top, W * 0.045, bottom - top); ctx.fillRect(W * 0.855, top, W * 0.045, bottom - top);
      const b = 0.5 + Math.sin(game.time * 2.2) * 0.5;
      ctx.fillStyle = `rgba(0,0,0,${0.15 + b * 0.1})`; ctx.fillRect(0, 0, W, H);
      return;
    }
    const sway = Math.sin(game.time * 1.3) * 4;
    const hem = Math.round(H * 0.58 + sway), gapBottom = Math.round(H * 0.9);
    // 식탁보 (위쪽 전부)
    ctx.fillStyle = 'rgba(70,12,10,0.97)';
    ctx.fillRect(0, 0, W, hem);
    const cell = Math.max(16, Math.round(W / 40));
    ctx.fillStyle = 'rgba(120,30,26,0.9)';
    for (let y = 0; y < hem; y += cell) for (let x = ((y / cell) % 2) * cell; x < W; x += cell * 2) ctx.fillRect(x, y, cell, cell);
    // 식탁보 끝단 (물결)
    ctx.fillStyle = 'rgba(40,6,5,1)';
    for (let x = 0; x < W; x += cell) ctx.fillRect(x, hem, cell * 0.8, Math.round(6 + Math.sin(x * 0.05 + game.time * 2) * 4));
    // 아래쪽 바닥 (어둡게)
    ctx.fillStyle = 'rgba(5,3,2,0.96)';
    ctx.fillRect(0, gapBottom, W, H - gapBottom);
    // 탁자 다리 실루엣
    ctx.fillStyle = 'rgba(10,6,4,1)';
    ctx.fillRect(W * 0.12, hem, W * 0.035, gapBottom - hem); ctx.fillRect(W * 0.845, hem, W * 0.035, gapBottom - hem);
    const breath = 0.5 + Math.sin(game.time * 2.2) * 0.5;
    ctx.fillStyle = `rgba(0,0,0,${0.15 + breath * 0.1})`;
    ctx.fillRect(0, 0, W, H);
  }

  /** 조명탄 막대 + 불꽃 */
  drawFlareStick(ctx, f, time) {
    const k = Math.min(1, (f.until - time) / 3);
    ctx.globalCompositeOperation = 'lighter';
    const r = 34 + Math.random() * 6;
    const gr = ctx.createRadialGradient(f.x, f.y - 4, 0, f.x, f.y - 4, r);
    gr.addColorStop(0, `rgba(255,120,80,${0.55 * k})`); gr.addColorStop(1, 'rgba(255,60,30,0)');
    ctx.fillStyle = gr; ctx.fillRect(f.x - r, f.y - 4 - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#b82a22'; ctx.fillRect(Math.round(f.x - 6), Math.round(f.y - 2), 12, 4);
    ctx.fillStyle = '#ffe9b0'; ctx.fillRect(Math.round(f.x + 4), Math.round(f.y - 3), 4, 4);
    ctx.fillStyle = `rgba(255,${180 + Math.random() * 60},120,${k})`;
    for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(f.x + 6 + (Math.random() - 0.3) * 12), Math.round(f.y - 4 - Math.random() * 14), 2, 2);
  }

  /** 아이템 사용 효과: 카메라 플래시 부채꼴, 살충제 분사 */
  drawFx(ctx, map, game) {
    for (const f of game.fx) {
      const u = f.t / f.dur;
      if (f.kind === 'pop' || f.kind === 'poof') {     // 풍선 조각 / 파티 푸퍼가 사라지는 연기
        const n = f.kind === 'pop' ? 10 : 14;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + f.x * 0.01, r = 6 + u * (f.kind === 'pop' ? 34 : 26);
          ctx.fillStyle = f.kind === 'pop' ? `rgba(${i % 2 ? '216,49,43' : '232,197,58'},${1 - u})` : `rgba(140,170,220,${0.6 * (1 - u)})`;
          const sz = f.kind === 'pop' ? 3 : 6 + u * 6;
          ctx.fillRect(f.x + Math.cos(a) * r - sz / 2, f.y - 20 + Math.sin(a) * r - sz / 2 - (f.kind === 'poof' ? u * 20 : 0), sz, sz);
        }
        continue;
      }
      if (f.kind === 'flash') {
        const range = 6 * 48, fov = Math.PI / 2.2, pts = [];
        for (let i = 0; i <= 20; i++) {
          const a = f.angle - fov / 2 + (fov * i) / 20;
          const d = castRay(map, f.x, f.y, a, range, null);
          pts.push(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d);
        }
        ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, range);
        gr.addColorStop(0, `rgba(255,255,250,${0.9 * (1 - u)})`); gr.addColorStop(1, 'rgba(255,255,250,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(f.x, f.y);
        for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (f.kind === 'alarm') {
        // 퍼즐 오답 경보: 붉은 빛이 번쩍이며 퍼진다
        const on = Math.floor(f.t * 6) % 2 === 0, r = 30 + u * 7 * 48;
        ctx.strokeStyle = `rgba(230,40,30,${0.6 * (1 - u)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y - 20, r, 0, Math.PI * 2); ctx.stroke();
        if (on) {
          const gr = ctx.createRadialGradient(f.x, f.y - 20, 0, f.x, f.y - 20, 70);
          gr.addColorStop(0, `rgba(255,40,30,${0.5 * (1 - u)})`); gr.addColorStop(1, 'rgba(255,40,30,0)');
          ctx.fillStyle = gr; ctx.fillRect(f.x - 70, f.y - 90, 140, 140);
        }
      } else if (f.kind === 'spray') {
        ctx.fillStyle = `rgba(200,220,170,${0.55 * (1 - u)})`;
        for (let i = 0; i < 26; i++) {
          const a = f.angle + (((i * 37) % 17) / 17 - 0.5) * 1.2, d = 18 + u * 150 * (0.4 + ((i * 53) % 11) / 11);
          ctx.fillRect(Math.round(f.x + Math.cos(a) * d), Math.round(f.y - 10 + Math.sin(a) * d), 3, 3);
        }
      }
    }
  }

  /**
   * 이름표 옆 보이스 아이콘 (보이스 챗을 켠 사람에게 항상 표시):
   *  켜짐 = 스피커 + 게이지 3칸 (목소리 크기만큼 차오름) / 음소거 = 빨간 X 가 그어진 스피커
   */
  drawSpeaker(ctx, x, y, muted, level, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 6, y - 7, muted ? 16 : 22, 14);
    ctx.fillStyle = muted ? '#8a5a50' : '#cfc6a6';
    ctx.fillRect(x - 4, y - 2, 3, 5);
    ctx.beginPath(); ctx.moveTo(x - 1, y - 2); ctx.lineTo(x + 3, y - 5); ctx.lineTo(x + 3, y + 6); ctx.lineTo(x - 1, y + 3); ctx.fill();
    if (muted) {
      ctx.strokeStyle = '#e0503a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x + 5, y - 3); ctx.lineTo(x + 9, y + 3); ctx.moveTo(x + 9, y - 3); ctx.lineTo(x + 5, y + 3); ctx.stroke();
    } else {
      for (let i = 0; i < 3; i++) {                 // 게이지: 아래에서 위로 차오르는 막대 3개
        const on = level > 0.08 + i * 0.22, h = 4 + i * 2;
        ctx.fillStyle = on ? '#6edc78' : 'rgba(207,198,166,0.25)';
        ctx.fillRect(x + 5 + i * 3.5, y + 3 - h, 2.5, h);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** 오프닝/엔딩: "SPACE 길게 눌러 건너뛰기" + 누르고 있는 만큼 차오르는 원 */
  drawSkipHint(game) {
    const c = game.cine;
    if (!c || !((c.type === 'story' && c.t > 1) || (c.type === 'ending' && c.t > 3))) return;
    const { ctx, W, H } = this, k = Math.min(1, game.skipHold);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = '20px VT323, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(220,210,170,${0.5 + k * 0.5})`;
    ctx.fillText(`${game.skipKey || 'SPACE'} 길게 눌러 건너뛰기`, W - 46, H - 24);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(220,210,170,0.25)'; ctx.beginPath(); ctx.arc(W - 26, H - 24, 10, 0, Math.PI * 2); ctx.stroke();
    if (k > 0) { ctx.strokeStyle = '#f0dc8c'; ctx.beginPath(); ctx.arc(W - 26, H - 24, 10, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke(); }
  }

  /** 시네마틱 오버레이: 레터박스 + 레벨 제목 / 하울러 각성 / 노클립 탈출 */
  drawCinematic(game) {
    const { ctx, W, H } = this, c = game.cine, t = c.t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bars = (h, a) => { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h); };
    if (c.type === 'story') { drawStory(this, game); return; }
    if (c.type === 'intro') {
      const inK = Math.min(1, t / 0.4), outK = Math.min(1, Math.max(0, (c.dur - t) / 0.8));
      bars(H * 0.12 * Math.min(inK, outK), 1);
      if (t < 0.5) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.5})`; ctx.fillRect(0, 0, W, H); }
      const ta = Math.min(1, Math.max(0, (t - 0.6) / 0.5)) * Math.min(1, Math.max(0, (3.6 - t) / 0.6));
      if (ta > 0) {
        const label = levelLabel(game.levelIndex), name = levelInfo(game.levelIndex).name;
        const shown = Math.min(label.length, Math.floor((t - 0.6) * 18));
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(Math.min(W, H) * 0.09)}px VT323, monospace`;
        ctx.fillStyle = `rgba(216,196,106,${ta})`;
        ctx.fillText(label.slice(0, shown), W / 2 + (Math.random() < 0.05 ? 3 : 0), H * 0.44);
        ctx.font = `${Math.round(Math.min(W, H) * 0.035)}px VT323, monospace`;
        ctx.fillStyle = `rgba(160,146,80,${ta * Math.min(1, Math.max(0, (t - 1.4) / 0.5))})`;
        ctx.fillText(name, W / 2, H * 0.52);
        // 미션
        ctx.font = `${Math.round(Math.min(W, H) * 0.03)}px VT323, monospace`;
        ctx.fillStyle = `rgba(240,220,140,${ta * Math.min(1, Math.max(0, (t - 1.9) / 0.5))})`;
        ctx.fillText(missionGoal(levelInfo(game.levelIndex).mission || { type: 'keys', count: 5 }), W / 2, H * 0.59);
      }
    } else if (c.type === 'awake') {
      const k = Math.sin(Math.min(1, t / c.dur) * Math.PI);
      bars(H * 0.08 * k, 1);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(120,0,0,0)'); v.addColorStop(1, `rgba(140,0,0,${0.6 * k * (0.7 + Math.sin(t * 18) * 0.3)})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      game.shake = Math.max(game.shake, 6 * k);
    } else if (c.type === 'escape') {
      const u = t / c.dur;
      // 노클립: 화면이 찢어지듯 어긋나다 하얗게 빛난다
      for (let i = 0; i < 8; i++) {
        const y = Math.floor(Math.random() * H), h = 4 + Math.random() * 30, dx = (Math.random() - 0.5) * 80 * u;
        ctx.drawImage(this.canvas, 0, y, W, h, dx, y, W, h);
      }
      const r = Math.max(W, H) * u * 1.2;
      const gr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(1, r));
      gr.addColorStop(0, `rgba(255,255,240,${Math.min(1, u * 1.6) * (1 - Math.max(0, (u - 0.75) / 0.25))})`); gr.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
  }

  /** 엔딩: 노클립 섬광 → 현실로 돌아온 듯한 밤거리 (노란 벽지가 잠깐 비침) → 게임 이름만 떠오르고 끝 (내레이션 없음) */
  renderEnding(game, dt) {
    const { ctx, W, H } = this, c = game.cine;
    if (!c) return;
    const t = c.t, d = c.data;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (t < 11) {
      // 밤거리: 하늘, 별, 가로등, 길, 플레이어 뒷모습
      const k = Math.min(1, t / 0.8) * Math.min(1, (11 - t) / 0.4);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#05070f'); sky.addColorStop(0.7, '#14182a'); sky.addColorStop(1, '#1d1f24');
      ctx.globalAlpha = k;
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(230,230,255,${0.3 + ((i * 7) % 10) / 14})`; ctx.fillRect((i * 137) % W, (i * 89) % Math.round(H * 0.55), 2, 2); }
      ctx.fillStyle = '#101114'; ctx.fillRect(0, H * 0.72, W, H * 0.28);
      ctx.fillStyle = '#c9c49a'; for (let x = 0; x < W; x += 80) ctx.fillRect(x + ((t * 6) % 80) * 0, H * 0.84, 40, 4);
      const lx = W * 0.68;
      ctx.fillStyle = '#2a2b30'; ctx.fillRect(lx, H * 0.3, 8, H * 0.44); ctx.fillRect(lx - 40, H * 0.3, 48, 6);
      const lg = ctx.createRadialGradient(lx - 36, H * 0.33, 0, lx - 36, H * 0.33, H * 0.5);
      lg.addColorStop(0, 'rgba(255,220,150,0.35)'); lg.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
      const spr = humanPreview(d.color || 'default', 'up');
      const s = Math.round(H / 160);
      ctx.drawImage(spr, Math.round(W * 0.45), Math.round(H * 0.76 - spr.height * s), spr.width * s, spr.height * s);
      // 반전: 아주 잠깐 노란 벽지가 비친다
      if (t > 10.45 && t < 10.75) { ctx.fillStyle = 'rgba(214,194,106,0.85)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = 'rgba(186,164,84,0.9)'; for (let x = 0; x < W; x += 24) ctx.fillRect(x, 0, 6, H); }
      ctx.globalAlpha = 1;
      if (t < 1.5) { ctx.fillStyle = `rgba(255,255,245,${1 - t / 1.5})`; ctx.fillRect(0, 0, W, H); }   // 노클립 섬광
    } else {
      // 게임 이름만 아래에서 천천히 올라와 멈추고, 그대로 끝난다
      const u = Math.min(1, (t - 11.5) / 4), e = 1 - (1 - u) ** 3;
      if (t > 11.5) {
        const a = Math.min(1, (t - 11.5) / 1.5) * Math.min(1, (c.dur - t) / 1.2);
        const y = H * 1.1 - (H * 1.1 - H * 0.5) * e;
        const size = Math.round(Math.min(W, H) * 0.16);
        ctx.font = `${size}px VT323, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(216,196,106,0.6)'; ctx.shadowBlur = 24;
        ctx.fillStyle = `rgba(216,196,106,${a})`;
        ctx.fillText('BACKROOMS', W / 2 + (Math.random() < 0.04 ? 4 : 0), y);
        ctx.shadowBlur = 0;
      }
    }
    this.drawPostFx({ danger: 0, deathT: 0, level: null });
    this.drawSkipHint(game);
  }

  /**
   * Level ! 괴물 떼: 왼쪽에서 밀려오는 검붉은 덩어리 + 앞줄의 하울러들. glow=true 면 어둠 위에 붉은 눈/빛만.
   * 가장자리는 픽셀 격자(ART*2)에 맞춰 들쭉날쭉하게
   */
  drawHorde(ctx, game, cam, vw, vh, glow) {
    const H = game.horde, map = game.map, t = game.time, c = 3;
    if (H.x < cam.x - TS * 2) return;
    const top = TS, bot = (map.h - 1) * TS;
    if (!glow) {
      ctx.fillStyle = '#140303';
      for (let y = top; y < bot; y += c * 2) {
        const e = Math.round((H.x + Math.sin(y * 0.09 + t * 9) * 12 + Math.sin(y * 0.23 - t * 5) * 8) / (c * 2)) * c * 2;
        ctx.fillRect(cam.x - TS, y, e - cam.x + TS, c * 2);
      }
      // 앞줄: 몸을 비틀며 달려오는 하울러들
      const rows = map.h - 2;
      for (let i = 0; i < rows * 2; i++) {
        const y = top + ((i * 0.5) % rows) * TS + TS * 0.6 + Math.sin(t * 3 + i) * 6;
        const x = H.x - 8 - (i % 3) * 22 + Math.sin(t * 7 + i * 1.7) * 6;
        drawMonster(ctx, { type: 'howler', active: true, state: 'chase', x, y, angle: 0, anim: t * 6 + i, moving: true }, t, 1);
      }
    } else {
      const gr = ctx.createLinearGradient(H.x - TS * 3, 0, H.x + TS * 2.5, 0);
      gr.addColorStop(0, 'rgba(160,10,10,0.35)'); gr.addColorStop(1, 'rgba(160,10,10,0)');
      ctx.fillStyle = gr; ctx.fillRect(H.x - TS * 3, top, TS * 5.5, bot - top);
      for (let i = 0; i < 26; i++) {           // 어둠 속에서 번뜩이는 붉은 눈
        const y = top + ((i * 37) % ((map.h - 2) * TS)), x = H.x - 6 - ((i * 53) % 60);
        if (Math.sin(t * 4 + i * 2.3) < -0.3) continue;
        ctx.fillStyle = `rgba(255,60,40,${0.6 + Math.random() * 0.4})`;
        ctx.fillRect(Math.round(x / c) * c, Math.round(y / c) * c, c, c);
        ctx.fillRect(Math.round(x / c) * c + c * 2, Math.round(y / c) * c, c, c);
      }
    }
  }

  /** 괴물 떼가 화면 왼쪽 밖에 있으면: 왼쪽 가장자리가 붉게 맥박친다 (가까울수록 진하게) */
  drawHordeEdge(game) {
    const { ctx, W, H, scale } = this, sx = (game.horde.x - game.cam.x) * scale;
    if (sx > 0) return;
    const k = Math.max(0, Math.min(1, 1 + sx / (W * 0.6))), pulse = 0.6 + Math.sin(game.time * 9) * 0.4;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const gr = ctx.createLinearGradient(0, 0, W * 0.25, 0);
    gr.addColorStop(0, `rgba(180,10,10,${(0.25 + 0.5 * k) * pulse})`); gr.addColorStop(1, 'rgba(180,10,10,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W * 0.25, H);
    ctx.font = '28px VT323, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255,90,70,${0.5 + 0.5 * pulse})`; ctx.fillText('◀◀', 14, H / 2);
  }

  /**
   * Level 94 밤: 예고(warn)엔 화면이 깜빡이고, 밤(night)엔 어둡고 붉은 테두리.
   * Level 37 초록 물: 오래 서 있을수록 초록빛으로 어두워진다.
   */
  drawNightFx(game) {
    const { ctx, W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (game.night === 'warn' && Math.floor(game.time * 4) % 2) { ctx.fillStyle = 'rgba(0,0,30,0.35)'; ctx.fillRect(0, 0, W, H); }
    if (game.night === 'night') {
      ctx.fillStyle = 'rgba(0,0,20,0.5)'; ctx.fillRect(0, 0, W, H);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(80,0,0,0)'); v.addColorStop(1, `rgba(90,0,0,${0.5 + Math.sin(game.time * 3) * 0.15})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
    const tx = Math.min(1, game.toxicT / CONFIG.HAZARD.TOXIC_KILL);
    if (tx > 0.02 && game.local.alive) {
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.5 - tx * 0.45), W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, `rgba(30,70,10,${tx * 0.25})`); v.addColorStop(1, `rgba(5,15,0,${0.3 + tx * 0.7})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
  }

  /** 정신력이 낮을 때: 보랏빛 가장자리가 맥박치고, 화면이 살짝 어긋난다 */
  drawSanityFx(game) {
    const { ctx, W, H } = this, lv = game.sanityLevel;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const pulse = 0.6 + Math.sin(game.time * (2 + lv * 5)) * 0.4;
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.45 - lv * 0.25), W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(60,0,70,0)'); v.addColorStop(1, `rgba(70,0,60,${0.75 * lv * pulse})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (lv > 0.5 && Math.random() < lv * 0.25) {
      for (let i = 0; i < 3; i++) {
        const y = Math.random() * H, h = 6 + Math.random() * 30;
        ctx.drawImage(this.canvas, 0, y, W, h, (Math.random() - 0.5) * 30 * lv, y, W, h);
      }
    }
  }

  drawJumpscare(game) {
    const { ctx, W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = `rgb(${30 + Math.random() * 40},0,0)`;
    ctx.fillRect(0, 0, W, H);
    const k = 1 - game.deathT / game.deathDuration;
    const size = Math.min(W, H) * (0.7 + k * 0.5);
    drawJumpscareSprite(ctx, game.killerType || 'howler', game.time, W / 2 + (Math.random() - 0.5) * 40, H / 2 + (Math.random() - 0.5) * 40, size);
  }

  drawPostFx(game) {
    const { ctx, W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = { lobby: '#ffd25a', concrete: '#d8d0b0', pipes: '#d8904a', electrical: '#8aa0d8', fun: '#ff9a6a', run: '#ff3a2a', suburbs: '#5a7ad0', wheat: '#ffc860', pool: '#9ae0ff', school: '#c8e0b0', office: '#c8d0e0', motion: '#ffe0a0', courtyard: '#e0d0a0', kitty: '#ffb0d0' }[game.level?.info?.theme] || '#ffd25a';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.vignette; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.06; ctx.fillStyle = this.scanPattern; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.035 + game.danger * 0.12 + (game.deathT > 0 ? 0.25 : 0);
    const gx = Math.random() * 128, gy = Math.random() * 128;
    ctx.setTransform(1, 0, 0, 1, gx, gy);
    ctx.fillStyle = this.grainPattern; ctx.fillRect(-gx, -gy, W, H);
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
