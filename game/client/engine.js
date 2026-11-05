import { CONFIG, TS, T, levelInfo, levelLabel, ITEM_TYPES, SUIT_HEX } from '../../shared/config.js';
import { generateLevel } from '../../shared/map.js';
import { clamp } from '../../shared/utils.js';
import { ClientPlayer, ClientMonster } from './entities.js';
import { updateLocalPlayer } from './controller.js';
import { Input } from './input.js';
import { Sound } from './sound.js';
import { NetClient } from './net.js';
import { Renderer } from './renderer.js';
import { makeStoryCast, storyScript, playStoryEvents } from './story.js';
import { DEATH_DURATION, addGore } from './deaths.js';
import { discoverLevel } from './bestiary.js';

/** startGame() 에서 채워지는 런타임 의존성. UI 는 React 쪽 어댑터. */
let renderer = null, net = null, UI = null;

/** 클라이언트 게임 상태. 권위 있는 상태(열쇠, 사망, 괴물)는 서버 이벤트로만 바뀐다. */
const Game = {
  phase: 'menu',              // menu | connecting | lobby | game
  menu: null,                 // 메인 메뉴 배경 장면 (천천히 떠도는 카메라)
  lobby: null,
  settings: { volume: 0.7, shake: true, menuScares: true, deathScares: true, gore: true },
  paused: false,              // ESC 메뉴가 열려 있음 (입력 차단)
  cine: null,                 // 시네마틱 { type: intro|awake|escape|ending, t, dur, data }
  pendingLobby: null,         // 엔딩이 끝난 뒤 보여줄 대기방
  inv: [], flares: [], fx: [], compassT: 0, flashT: 0, emoteOpen: false, totalTime: 0,
  solo: false,                // 혼자 하기 → ESC 시 서버도 실제로 멈춤
  serverPaused: false,
  myId: null, roomName: '', round: 0, roundPhase: 'playing',
  level: null, map: null, explored: null,
  keys: [], keysCollected: 0, exitUnlocked: false,
  local: null, remotes: new Map(), monster: null, monsters: [], danger: 0, killerType: null,
  lockerShake: [], nearLocker: -1, levelIndex: 0,
  gore: [], hallu: [], halluT: 0, deathSeed: 1,
  horde: null,                // Level ! 괴물 떼 { x, tx(서버 값), speed }   // 핏자국·살점 / 정신력 환각 (가짜 스마일러)
  nearPuzzle: -1, puzzleOpen: -1,   // 퍼즐 단말기: 가까운 것 / 열려 있는 것 (열쇠 번호)
  items: [], testMode: false, test: { god: false, fullbright: false },
  cam: { x: 0, y: 0 }, shake: 0,
  flicker: { intensity: 1, timer: 1, dropT: 0 },
  messages: [], heartT: 0,
  deathT: 0, deathDuration: 1.4, pendingRoundEnd: null,
  spectateId: null, elapsed: 0, time: 0, lockMsgT: 0, alertMsgT: 0,

  *allPlayers() { if (this.local) yield this.local; yield* this.remotes.values(); },

  playerById(id) { return id === this.myId ? this.local : this.remotes.get(id); },

  /** 카메라/조명이 따라갈 대상: 살아 있으면 나, 아니면 관전 대상 */
  viewTarget() {
    if (this.local.alive) return this.local;
    const alive = [...this.remotes.values()].filter(p => p.alive);
    if (!alive.length) return this.local;
    return alive.find(p => p.id === this.spectateId) ?? alive[0];
  },

  cycleSpectate() {
    if (this.local?.alive) return;
    const alive = [...this.remotes.values()].filter(p => p.alive);
    if (!alive.length) return;
    const i = alive.findIndex(p => p.id === this.spectateId);
    this.spectateId = alive[(i + 1) % alive.length].id;
  },

  /** 화면 하단 문구는 테스트 모드 결과에만 쓴다 */
  msg(text, dur = 3) {
    if (!String(text).startsWith('[TEST]')) return;
    this.messages.push({ text, t: dur, dur });
    if (this.messages.length > 3) this.messages.shift();
  },

  startCine(type, dur, data = {}) { this.cine = { type, t: 0, dur, data }; },

  /** 레벨 인트로 시네마틱: 근처 어딘가에서 카메라가 플레이어에게 내려온다 */
  startIntro() {
    const a = Math.random() * Math.PI * 2;
    this.startCine('intro', 4.2, { fromX: Math.cos(a) * TS * 7, fromY: Math.sin(a) * TS * 7 });
    Sound.introSting();
  },

  // ------------------------------------------------------------ 퍼즐 단말기
  openPuzzle(i) {
    const k = this.keys[i];
    if (!k?.puzzle || k.collected) return;
    this.puzzleOpen = i;
    Input.keys.clear();
    Sound.beep(660);
    UI.showPuzzle?.({ index: i, puzzle: k.puzzle, level: this.levelIndex });
  },
  closePuzzle(result) {
    if (this.puzzleOpen < 0) return;
    this.puzzleOpen = -1;
    UI.closePuzzle?.(result);
  },

  loadRound(d) {
    this.round = d.round;
    this.roundPhase = d.phase;
    this.levelIndex = d.level ?? 0;
    const fresh = discoverLevel(this.levelIndex);         // 괴물 도감: 이 레벨의 괴물을 채운다
    if (fresh.length) UI.notify?.(`괴물 도감에 추가: ${fresh.join(', ')}`);
    this.level = generateLevel(d.seed, this.levelIndex);   // 서버와 같은 seed + 레벨 → 같은 맵/열쇠/출구/조명
    this.map = this.level.map;
    this.explored = new Uint8Array(this.map.w * this.map.h);
    this.keys = this.level.keys.map((k, i) => ({ ...k, collected: !!d.keys[i] }));
    this.keysCollected = this.keys.filter(k => k.collected).length;
    this.exitUnlocked = d.exitUnlocked;

    this.remotes = new Map();
    let me = null;
    for (const s of d.players) {
      if (s.id === this.myId) { me = s; continue; }
      const rp = new ClientPlayer(s);
      rp.setTarget(s);
      this.remotes.set(s.id, rp);
    }
    this.local = new ClientPlayer(me, true);
    this.lockerShake = this.level.lockers.map(() => 0);
    this.nearLocker = -1;
    this.monsters = (d.monsters || []).map(s => { const m = new ClientMonster(); m.reset(s); return m; });
    this.items = (d.items || []).map(it => ({ ...it }));
    this.flares = (d.flares || []).map(f => ({ ...f, until: this.time + Math.max(0, (f.until - Date.now()) / 1000), dur: 30 }));
    this.fx = []; this.compassT = 0; this.flashT = 0; this.emoteOpen = false;
    this.gore = []; this.hallu = []; this.halluT = 0;
    this.horde = d.horde ? { x: d.horde.x, tx: d.horde.x, speed: d.horde.speed, roarT: 2 } : null;
    if (this.levelIndex === 0) this.totalTime = 0;
    this.closePuzzle();
    // 처음 Level 0: 오프닝(친구들과 촬영하다 노클립) → 레벨 인트로
    if (d.phase === 'playing' && d.story && this.levelIndex === 0) {
      const cast = makeStoryCast(d.players, this.myId);
      const now = new Date(), M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      this.startCine('story', CONFIG.STORY.DURATION, { cast, script: storyScript(cast), date: `${M[now.getMonth()]} ${String(now.getDate()).padStart(2, '0')} ${now.getFullYear()}` });
      Sound.setHum(0);
    } else if (d.phase === 'playing') this.startIntro();
    this.monster = null;
    this.duckLight = null; Sound.duck(1);
    renderer.setLevel(this.level);

    this.elapsed = 0; this.deathT = 0; this.pendingRoundEnd = null; this.spectateId = null;
    const v = this.viewTarget();
    this.cam.x = v.x - renderer.W / renderer.scale / 2;
    this.cam.y = v.y - renderer.H / renderer.scale / 2;
  },

  // ------------------------------------------------------------ 메인 메뉴 배경
  initMenu() {
    const level = generateLevel((Math.random() * 2 ** 32) >>> 0, 0);
    renderer.setLevel(level);
    this.duckLight = null; Sound.duck(1);
    const m = level.map;
    const lit = m.floorCells.filter(i => level.tileLight[i] > 0.6);
    const start = lit[Math.floor(Math.random() * lit.length)] ?? m.floorCells[0];
    const pos = { x: (start % m.w) * TS + TS / 2, y: ((start / m.w) | 0) * TS + TS / 2 };
    this.menu = { level, pos, path: [], cam: { x: pos.x, y: pos.y }, scareT: 0, scareType: 'smiler', nextScare: 12 + Math.random() * 14 };
  },

  updateMenu(dt) {
    const M = this.menu;
    if (!M) return;
    const map = M.level.map;
    // 복도를 따라 천천히 떠도는 카메라
    if (!M.path.length) {
      const tx = Math.floor(M.pos.x / TS), ty = Math.floor(M.pos.y / TS);
      for (let k = 0; k < 10 && !M.path.length; k++) {
        const i = map.floorCells[Math.floor(Math.random() * map.floorCells.length)];
        const p = map.findPath(tx, ty, i % map.w, (i / map.w) | 0);
        if (p.length > 8 && p.length < 60) M.path = p;
      }
    }
    if (M.path.length) {
      const n = M.path[0], gx = n.x * TS + TS / 2, gy = n.y * TS + TS / 2;
      const dx = gx - M.pos.x, dy = gy - M.pos.y, d = Math.hypot(dx, dy), step = 34 * dt;
      if (d <= step) { M.pos.x = gx; M.pos.y = gy; M.path.shift(); }
      else { M.pos.x += (dx / d) * step; M.pos.y += (dy / d) * step; }
    }
    const k = 1 - Math.exp(-dt * 1.5);
    const vw = renderer.W / renderer.scale, vh = renderer.H / renderer.scale;
    M.cam.x += (M.pos.x - vw * 0.62 - M.cam.x) * k;
    M.cam.y += (M.pos.y - vh * 0.5 - M.cam.y) * k;
    this.flickerSounds(renderer.updateLights(dt), { x: M.pos.x, y: M.pos.y }, 0.5);
    Sound.setHum(0.7);
    Sound.setHiss(0.7);
    Sound.setDrone(0);
    // 가끔 튀어나오는 괴물 얼굴
    if (M.scareT > 0) M.scareT -= dt;
    else if (this.settings.menuScares && (this.phase === 'menu' || this.phase === 'lobby')) {
      M.nextScare -= dt;
      if (M.nextScare <= 0) {
        const types = ['smiler', 'howler', 'skinStealer', 'hound', 'partygoer'];
        M.scareType = types[Math.floor(Math.random() * types.length)];
        M.scareT = 0.5;
        M.nextScare = 18 + Math.random() * 30;
        this.shake = 14;
        Sound.menuScare();
      }
    }
  },

  // ------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    for (const m of this.messages) m.t -= dt;
    this.messages = this.messages.filter(m => m.t > 0);
    this.shake = Math.max(0, this.shake - dt * 14);
    this.lockMsgT -= dt; this.alertMsgT -= dt;
    if (!this.settings.shake) this.shake = 0;
    if (this.cine) {
      const prevT = this.cine.t;
      this.cine.t += dt;
      if (this.cine.type === 'story') playStoryEvents(this.cine, prevT);
      if (this.cine.t >= this.cine.dur) this.endCine();
    }
    if (this.phase === 'ending') return;
    if (this.phase !== 'game') { this.updateMenu(dt); return; }
    for (const pl of this.allPlayers()) if (pl.bubble && (pl.bubble.t -= dt) <= 0) pl.bubble = null;
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < f.dur);
    this.flares = this.flares.filter(f => f.until > this.time);
    if (this.compassT > 0) this.compassT -= dt;
    if (this.flashT > 0) this.flashT -= dt;

    if (this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0 && this.pendingRoundEnd) { UI.showRoundEnd(this.pendingRoundEnd); this.pendingRoundEnd = null; }
    }
    if (this.roundPhase === 'playing' && !(this.paused && this.solo)) { this.elapsed += dt; this.totalTime += dt; }   // 혼자 하기 일시정지 중엔 시간도 멈춤

    const p = this.local;
    for (let i = 0; i < this.lockerShake.length; i++) if (this.lockerShake[i] > 0) this.lockerShake[i] -= dt;
    this.nearLocker = -1;
    if (p.alive && !p.hidden && this.roundPhase === 'playing') {
      let best = CONFIG.LOCKER.USE_DIST;
      this.level.lockers.forEach((lk, i) => {
        const d = Math.hypot(lk.x - p.x, lk.y - p.y);
        if (d < best) { best = d; this.nearLocker = i; }
      });
    }
    // 가까운 퍼즐 단말기 (사물함보다 우선)
    this.nearPuzzle = -1;
    if (p.alive && !p.hidden && this.roundPhase === 'playing') {
      let best = CONFIG.PUZZLE.USE_DIST;
      this.keys.forEach((k, i) => {
        if (!k.puzzle || k.collected) return;
        const d = Math.hypot(k.x - p.x, k.y - p.y);
        if (d < best) { best = d; this.nearPuzzle = i; }
      });
      if (this.nearPuzzle >= 0) this.nearLocker = -1;
    }
    if (this.puzzleOpen >= 0 && (!p.alive || p.hidden || this.roundPhase !== 'playing')) this.closePuzzle();
    const intro = (this.cine?.type === 'intro' && this.cine.t < 3.4) || this.cine?.type === 'story';
    if (this.paused || intro || this.puzzleOpen >= 0) {
      // ESC 메뉴 / 인트로 연출 / 퍼즐 푸는 중: 이동 입력 무시. (멀티에서는 서버가 계속 돌아가므로 위치 전송만 유지해 끊기지 않게)
      if (p.alive && !this.solo && this.roundPhase === 'playing') { p.sprinting = false; p.crouching = false; net.sendState(p, dt); }
    } else if (p.alive && p.hidden && this.roundPhase === 'playing') {
      net.sendState(p, dt);                        // 숨어 있는 동안은 제자리 (서버도 이동을 무시)
    } else if (p.alive && this.roundPhase === 'playing') {
      updateLocalPlayer(p, dt, this.map, this.cam, renderer.scale, { infinite: !!this.horde });
      net.sendState(p, dt);
    }
    for (const rp of this.remotes.values()) rp.interpolate(dt);
    for (const m of this.monsters) m.interpolate(dt);

    this.updateHallucinations(dt);
    // 괴물 떼: 서버 값 사이를 예측해서 부드럽게 (속도대로 밀고, 서버 값으로 살짝 당김)
    const H = this.horde;
    if (H && this.roundPhase === 'playing' && !(this.paused && this.solo) && this.cine?.type !== 'intro') {
      H.x += H.speed * dt;
      H.x += (H.tx - H.x) * Math.min(1, dt * 4);
      H.x = Math.min(H.x, H.tx + H.speed * 0.12);   // 서버 값(스냅샷 간격 정도)보다 너무 앞서가지 않게
    }

    // 긴장도 연출: 보고 있는 대상과 가장 가까운 "위험한" 엔티티 기준
    // (방랑자, 정체를 숨긴 스킨 스틸러, 잠든 하울러는 제외 → 위장이 들키지 않도록)
    const view = this.viewTarget();
    let mon = null, md = Infinity;
    for (const m of this.monsters) {
      if (!m.dangerous) continue;
      const d = Math.hypot(m.x - view.x, m.y - view.y);
      if (d < md) { md = d; mon = m; }
    }
    this.monster = mon;
    let prox = mon && view.alive ? clamp(1 - md / (TS * 8), 0, 1) : 0;
    if (H && view.alive) {
      const hp = clamp(1 - (view.x - H.x) / (TS * 10), 0, 1);
      prox = Math.max(prox, hp);
      H.roarT -= dt;
      if (H.roarT <= 0) { Sound.hordeRoar(0.3 + hp * 0.7); H.roarT = 1.2 + Math.random() * 2 * (1 - hp); }
      if (hp > 0.1 && Math.random() < dt * 6) Sound.hordeStomp(hp);
    }
    this.danger = prox;
    Sound.setDrone(prox * (mon?.state === 'chase' || H ? 1 : 0.5));
    this.heartT -= dt;
    if (prox > 0.08 && this.heartT <= 0) { Sound.heartbeat(0.12 + prox * 0.4); this.heartT = 1.2 - prox * 0.8; }
    if ((mon?.state === 'chase' || H) && prox > 0.5) this.shake = Math.max(this.shake, prox * 4);

    // 손전등 깜빡임 (위험할수록 자주)
    const F = this.flicker;
    F.timer -= dt;
    if (F.timer <= 0) {
      if (Math.random() < 0.08 + prox * 0.6) F.dropT = 0.05 + Math.random() * (0.1 + prox * 0.35);
      F.timer = 0.4 + Math.random() * 3 * (1 - prox * 0.8);
    }
    if (F.dropT > 0) { F.dropT -= dt; F.intensity = Math.random() < 0.5 ? 0.15 + Math.random() * 0.3 : 0.75; }
    else F.intensity = 0.95 + Math.random() * 0.05;

    // 천장 형광등 깜빡임 + 소리 (꺼질 때 / 켜질 때 따로)
    this.flickerSounds(renderer.updateLights(dt), view, 1);
    // 오프닝 중엔 형광등 소리가 벽이 노래질 때만 들린다
    const st = this.cine?.type === 'story' ? this.cine.t : -1;
    Sound.setHum(st >= 0 ? (st > 12.2 && st < 17.6 ? 0.8 : 0) : view.alive ? 1 : 0.6);
    // Level 0 형광등 백색소음 (오프닝에선 벽이 노래질 때부터)
    const lobby = this.level?.info?.theme === 'lobby';
    Sound.setHiss(st >= 0 ? (st > 12.2 && st < 17.6 ? 0.7 : 0) : lobby ? (view.alive ? 1 : 0.6) : 0);

    // 카메라 (조준 방향으로 약간 앞을 보여줌)
    const vw = renderer.W / renderer.scale, vh = renderer.H / renderer.scale;
    const k = 1 - Math.exp(-dt * 8);
    this.cam.x += (view.x + Math.cos(view.angle) * 50 - vw / 2 - this.cam.x) * k;
    this.cam.y += (view.y + Math.sin(view.angle) * 50 - vh / 2 - this.cam.y) * k;
    if (this.sanityLevel > 0 && view === this.local) {
      const w = this.sanityLevel * this.sanityLevel * 10;
      this.cam.x += Math.sin(this.time * 1.7) * w * dt * 6; this.cam.y += Math.cos(this.time * 1.3) * w * dt * 6;
    }
    if (this.cine?.type === 'intro' || this.cine?.type === 'story') {
      // 인트로: 멀리서 플레이어 쪽으로 천천히 내려오는 카메라
      const u = this.cine.type === 'story' ? 0 : Math.min(1, this.cine.t / 3.2), e = u * u * (3 - 2 * u);
      this.cam.x = view.x - vw / 2 + this.cine.data.fromX * (1 - e);
      this.cam.y = view.y - vh / 2 + this.cine.data.fromY * (1 - e);
    }
  },

  /**
   * 정신력 환각: 정신력이 낮으면 주변에 가짜 스마일러가 잔뜩 나타나 다가온다 (나에게만 보인다, 해는 없음).
   * 0 이 되면 서버가 사망 처리 (entityType 'sanity' → 터지는 연출)
   */
  updateHallucinations(dt) {
    const p = this.local, S = CONFIG.SANITY;
    const s = p?.alive ? (p.sanity ?? S.MAX) : S.MAX;
    const lv = Math.max(0, Math.min(1, (S.HALLUCINATE - s) / S.HALLUCINATE));
    this.sanityLevel = lv;
    for (const h of this.hallu) {
      h.t += dt;
      const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy) || 1;
      const sp = 18 + lv * 70;
      h.x += (dx / d) * sp * dt; h.y += (dy / d) * sp * dt; h.angle = Math.atan2(dy, dx); h.anim = (h.anim || 0) + dt * 3;
      if (d < 36) { h.t = h.dur; Sound.giggle(0.35); this.shake = Math.max(this.shake, 4); }
    }
    this.hallu = this.hallu.filter(h => h.t < h.dur);
    if (lv <= 0 || !p?.alive || this.cine?.type === 'story') { if (lv <= 0) this.hallu = []; return; }
    const want = Math.floor(lv * 14) + (s < S.SEVERE ? 10 : 0);
    this.halluT -= dt;
    if (this.hallu.length < want && this.halluT <= 0) {
      this.halluT = 0.5 - lv * 0.4;
      const m = this.map, tx = Math.floor(p.x / TS), ty = Math.floor(p.y / TS);
      for (let k = 0; k < 20; k++) {
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 6;
        const x = Math.round(tx + Math.cos(a) * r), y = Math.round(ty + Math.sin(a) * r);
        if (m.isSolid(x, y)) continue;
        this.hallu.push({ type: 'smiler', state: 'chase', active: true, moving: true, x: x * TS + TS / 2, y: y * TS + TS / 2, angle: 0, t: 0, dur: 1.5 + Math.random() * 3.5 });
        break;
      }
    }
    if (Math.random() < dt * (0.2 + lv * 0.8)) Sound.whisper(0.2 + lv * 0.5);
  },

  /**
   * 깜빡이는 형광등 소리: 꺼질 때 "딸깍", 켜질 때 "틱—지직". 가까운 등이면 형광등 소리 전체가 같이 끊겼다 돌아온다.
   * toggled = [{ l, off }], ear = 듣는 위치
   */
  flickerSounds(toggled, ear, vol) {
    const R = TS * 6;
    for (const { l, off } of toggled) {
      if (!off && this.duckLight === l) { this.duckLight = null; Sound.duck(1); }   // 멀리 걸어갔어도 다시 켜지면 원래대로
      const d = Math.hypot(l.x - ear.x, l.y - ear.y);
      if (d >= R) continue;
      const v = (1 - d / R) * vol;
      if (off) Sound.lampOff(v); else Sound.lampOn(v);
      // 바로 머리 위(약 2.5칸 안) 등이면 험/백색소음도 같이 줄었다 돌아온다
      if (d < TS * 2.5) {
        if (off) { this.duckLight = l; Sound.duck(0.35 + 0.65 * (d / (TS * 2.5))); }
      }
    }
  },

  endCine() {
    const c = this.cine;
    this.cine = null;
    if (c.type === 'story') { Sound.hushVoice(); Sound.setHum(1); if (this.phase === 'game') this.startIntro(); return; }
    if (c.type !== 'ending') return;
    // 엔딩 끝 → 멀티는 대기방, 혼자 하기는 메인 메뉴
    if (this.pendingLobby) {
      const st = this.pendingLobby;
      this.pendingLobby = null;
      this.phase = 'lobby';
      this.local = null; this.map = null;
      this.initMenu();
      UI.showLobby({ ...st, myId: net.id });
    } else {
      net.leaveRoom();
      toMenu();
    }
  },

  /** 엔딩 건너뛰기 (3초 이후) / 오프닝 건너뛰기 (1초 이후) */
  skipCine() {
    if (this.cine?.type === 'ending' && this.cine.t > 3) this.cine.t = this.cine.dur;
    if (this.cine?.type === 'story' && this.cine.t > 1) this.endCine();
  },
};

// ------------------------------------------------------------ network handlers
const nameOf = id => Game.playerById(id)?.name ?? '누군가';

/** 메인 메뉴로 돌아가기 */
function toMenu(error = '', screen = 'main') {
  Game.phase = 'menu';
  Game.paused = false; Game.serverPaused = false; Game.solo = false;
  Game.cine = null; Game.pendingLobby = null; Game.inv = []; Game.emoteOpen = false;
  Game.local = null; Game.map = null; Game.lobby = null; Game.remotes = new Map(); Game.monsters = [];
  Game.initMenu();
  UI.showMenu({ error, screen });
}

const handlers = {
  onLobby(state) {
    if (Game.phase === 'ending') { Game.pendingLobby = state; return; }
    Game.phase = 'lobby';
    Game.lobby = state;
    UI.showLobby({ ...state, myId: net.id });
  },
  onInit(d) {
    Game.myId = d.id;
    Game.solo = String(d.room || '').startsWith('SOLO-');
    Game.paused = false; Game.serverPaused = false;
    Game.testMode = !!d.testMode;
    Game.roomName = d.room;
    Game.loadRound(d);
    Game.phase = 'game';
    if (d.phase === 'ended') {
      UI.showRoundEnd({ restartIn: d.restartIn });
    } else {
      UI.hide();
    }
  },
  onRound(d) {
    Game.loadRound(d);
    UI.hide();
  },
  onSnapshot(s) {
    for (const ps of s.players) {
      if (ps.id === Game.myId) { Game.local.status = ps.status; Game.local.hidden = ps.hidden; if (ps.sanity !== undefined) Game.local.sanity = ps.sanity; continue; }
      let rp = Game.remotes.get(ps.id);
      if (!rp) { rp = new ClientPlayer({ ...ps, name: '...' }); Game.remotes.set(ps.id, rp); }
      rp.setTarget(ps);
    }
    // 엔티티 목록 동기화: 새로 생긴 엔티티(테스트 소환 등)는 추가, 사라진 엔티티는 제거
    const ids = new Set();
    for (const state of s.monsters || []) {
      ids.add(state.id);
      let m = Game.monsters.find(x => x.id === state.id);
      if (!m) { m = new ClientMonster(); m.reset(state); Game.monsters.push(m); }
      m.setTarget(state);
    }
    if (Game.monsters.length !== ids.size) Game.monsters = Game.monsters.filter(m => ids.has(m.id));
    if (s.horde && Game.horde) { Game.horde.tx = s.horde.x; Game.horde.speed = s.horde.speed; }
  },
  onPlayerJoined(s) {
    const rp = new ClientPlayer(s);
    rp.setTarget(s);
    Game.remotes.set(s.id, rp);
  },
  onPlayerLeft({ id }) {
    const rp = Game.remotes.get(id);
    Game.remotes.delete(id);
  },
  onKeyCollected({ index, by, count, unlocked }) {
    if (Game.keys[index]) Game.keys[index].collected = true;
    if (Game.puzzleOpen === index) { Game.closePuzzle({ solved: by === Game.myId, by: nameOf(by) }); if (by === Game.myId) Sound.puzzleOk(); }
    Game.keysCollected = count;
    Sound.pickup(by === Game.myId ? 1 : 0.5);
    if (unlocked) {
      Game.exitUnlocked = true;
      Sound.unlock();
    }
  },
  onPlayerDied({ id, entityType, x, y }) {
    const who = Game.playerById(id);
    if (who) addGore(Game, x ?? who.x, y ?? who.y, entityType, SUIT_HEX[who.color] || '#e7b92e');
    if (entityType === 'sanity' && id !== Game.myId) Sound.burst(0.4);
    if (id === Game.myId) {
      Game.local.status = 'dead'; Game.killerType = entityType || 'howler';
      Game.deathDuration = DEATH_DURATION[Game.killerType] || 2.4;
      Game.deathT = Game.deathDuration;
      Game.deathSeed = (Math.random() * 1e9) | 0;
      Game.closePuzzle();
      Game.hallu = [];
      Sound.death(Game.killerType);
      Game.shake = 20;
      Sound.setDrone(0);
    } else {
      const rp = Game.remotes.get(id);
      if (rp) rp.status = 'dead';
      Sound.scream(0.25);
    }
  },
  onPlayerEscaped({ id }) {
    const p = Game.playerById(id);
    if (p) p.status = 'escaped';
    if (id === Game.myId) { Sound.noclip(); Game.startCine('escape', 2.8); }
  },
  onMonsterAlert({ targetId, type }) {
    if (targetId !== Game.myId) return;
    Sound.alert(type);
    Game.shake = Math.max(Game.shake, 7);
  },
  onEntityEvent(e) {
    const m = Game.monsters.find(x => x.id === e.id);
    const view = Game.viewTarget();
    const near = view ? clamp(1 - Math.hypot(e.x - view.x, e.y - view.y) / (TS * 12), 0, 1) : 0;
    switch (e.kind) {
      case 'voice':
        if (m) m.bubble = { text: e.text, t: 2.5 };
        if (near > 0) Sound.voice(e.text, near);
        break;
      case 'reveal':
        if (m) m.revealed = true;
        Sound.reveal(Math.max(0.2, near));
        if (near > 0.4) Game.shake = Math.max(Game.shake, 10);
        break;
      case 'awake':
        Sound.howl(0.5);
        Game.startCine('awake', 2.4);
        break;
      case 'vanish':
        if (near > 0) Sound.giggle(near);
        break;
      case 'yelp':
        if (near > 0) Sound.yelp(near);
        break;
    }
  },
  onRoundEnd(d) {
    Game.roundPhase = 'ended';
    d = { ...d, nextLevelName: d.nextLevel !== undefined ? `${levelLabel(d.nextLevel)} — ${levelInfo(d.nextLevel).name}` : null };
    if (Game.deathT > 0) Game.pendingRoundEnd = d;
    else UI.showRoundEnd(d);
  },
  /** 누군가 퍼즐을 틀림 → 단말기 경보 */
  onPuzzleAlarm({ index, by, x, y }) {
    const view = Game.viewTarget();
    const near = view ? clamp(1 - Math.hypot(x - view.x, y - view.y) / (TS * 12), 0, 1) : 0;
    if (by === Game.myId) { Sound.puzzleWrong(); Game.shake = Math.max(Game.shake, 5); UI.puzzleWrong?.(); }
    if (near > 0 || by === Game.myId) Sound.alarm(by === Game.myId ? 1 : near);
    Game.fx.push({ kind: 'alarm', x, y, t: 0, dur: CONFIG.PUZZLE.ALARM_TIME });
  },
  onHideState({ id, hidden, locker, x, y }) {
    const p = Game.playerById(id);
    if (p) {
      p.hidden = hidden; p.lockerId = hidden ? locker : -1;
      if (hidden) { p.x = x; p.y = y; if (p.target) { p.target.x = x; p.target.y = y; } }
    }
    if (Game.lockerShake[locker] !== undefined) Game.lockerShake[locker] = 0.35;
    const view = Game.viewTarget();
    const lk = Game.level.lockers[locker];
    const near = lk && view ? clamp(1 - Math.hypot(lk.x - view.x, lk.y - view.y) / (TS * 8), 0, 1) : 0;
    if (near > 0) Sound.locker(near);
  },
  onItemSpawned(it) { Game.items.push({ ...it }); },
  onItemPicked({ id, type, by }) {
    Game.items = Game.items.filter(it => it.id !== id);
    if (by !== Game.myId) return;
    Sound.pickup(0.6);
  },
  onInventory({ inv }) { Game.inv = inv || []; },
  onItemUsed(fx) {
    const view = Game.viewTarget();
    const near = view ? clamp(1 - Math.hypot(fx.x - view.x, fx.y - view.y) / (TS * 10), 0, 1) : 0;
    const mine = fx.by === Game.myId;
    switch (fx.type) {
      case 'almondWater':      // 정신력 회복 (값은 서버가 계산해 스냅샷으로 온다)
        if (mine) { const p = Game.local; p.sanity = Math.min(CONFIG.SANITY.MAX, (p.sanity ?? 100) + ITEM_TYPES.almondWater.sanity); Game.hallu = []; Sound.drink(); }
        break;
      case 'staminaDrink':     // 스태미나 가득 + 잠시 지치지 않음
        if (mine) { const p = Game.local; p.stamina = CONFIG.PLAYER.STAMINA; p.exhausted = false; p.boostT = ITEM_TYPES.staminaDrink.boost; Sound.drink(); }
        break;
      case 'compass':
        if (mine) { Game.compassT = ITEM_TYPES.compass.dur; Sound.click(); }
        break;
      case 'camera':
        Game.fx.push({ kind: 'flash', x: fx.x, y: fx.y, angle: fx.angle, t: 0, dur: 0.45 });
        if (mine) Game.flashT = 0.35;
        if (near > 0 || mine) Sound.cameraFlash(mine ? 1 : near);
        break;
      case 'bugSpray':
        Game.fx.push({ kind: 'spray', x: fx.x, y: fx.y, angle: fx.angle, t: 0, dur: 0.9 });
        if (near > 0 || mine) Sound.spray(mine ? 1 : near);
        break;
      case 'flare':
        if (fx.flare) Game.flares.push({ id: fx.flare.id, x: fx.flare.x, y: fx.flare.y, until: Game.time + fx.flare.dur, dur: fx.flare.dur });
        if (near > 0 || mine) Sound.flare(mine ? 1 : near);
        break;
    }
  },
  onEmote({ id, i }) {
    const p = Game.playerById(id);
    const text = CONFIG.EMOTE.LINES[i];
    if (!p || !text) return;
    p.bubble = { text, t: 2.6 };
    const view = Game.viewTarget();
    const near = view ? clamp(1 - Math.hypot(p.x - view.x, p.y - view.y) / (TS * 12), 0, 1) : 0;
    if (near > 0) Sound.speak(text, near);
  },
  onGameComplete(d) {
    Game.deathT = 0; Game.pendingRoundEnd = null;
    Game.phase = 'ending';
    Game.startCine('ending', 19, { escaped: d.escaped || [], dead: d.dead || [], time: Game.totalTime, color: Game.local?.color || 'default' });
    UI.hide();
    UI.closePanels?.();
    Sound.setDrone(0);
    Sound.setHiss(0); Sound.duck(1);
    Sound.ending();
  },
  onPaused({ paused }) { Game.serverPaused = paused; },
  onTestResult({ text, god }) {
    if (god !== undefined) Game.test.god = god;
    Game.msg(`[TEST] ${text}`, 2.5);
  },
  onCorrect({ x, y }) {
    Game.local.x = x;
    Game.local.y = y;
  },
  onJoinError({ message }) {
    toMenu(message, 'multi');
  },
  onError(message) {
    net.disconnect();
    toMenu(message, 'main');
  },
  onDisconnect() {
    net.disconnect();
    toMenu('서버와의 연결이 끊어졌다.', 'main');
  },
};

// ------------------------------------------------------------ boot
/**
 * React 컴포넌트에서 호출. 캔버스와 UI 어댑터를 받아 게임 루프를 시작하고 제어 핸들을 돌려준다.
 * ui: { showMenu({error, screen}), showLobby(state), showInfo({...}), showRoundEnd(data), hide(), toggleTest() }
 */
export function startGame({ canvas, ui }) {
  UI = ui;
  renderer = new Renderer(canvas);
  net = new NetClient(handlers);
  Game.phase = 'menu';
  Game.initMenu();

  Input.init();
  Input.onPress('Escape', () => {
    if (Game.phase === 'ending') { Game.skipCine(); return; }
    if (Game.phase !== 'game') return;
    if (Game.cine?.type === 'story') { Game.skipCine(); return; }
    if (Game.emoteOpen) { Game.emoteOpen = false; return; }
    if (Game.puzzleOpen >= 0) { Game.closePuzzle(); return; }
    UI.togglePause?.();
  });
  Input.onPress('Enter', () => Game.skipCine());
  Input.onPress('Comma', () => {
    if (Game.phase === 'game' && !Game.paused && Game.local?.alive) { Game.emoteOpen = !Game.emoteOpen; Sound.click(); }
  });
  for (let n = 1; n <= 6; n++) {
    Input.onPress(`Digit${n}`, () => {
      if (Game.phase !== 'game' || Game.paused || !Game.local?.alive || Game.roundPhase !== 'playing' || Game.puzzleOpen >= 0) return;
      if (Game.emoteOpen) { net.emote(n - 1); Game.emoteOpen = false; return; }      // 감정 표현
      if (n <= CONFIG.INVENTORY_SIZE && Game.inv[n - 1]) net.useItem(n - 1);       // 아이템 사용
    });
  }
  Input.onPress('KeyF', () => {
    if (Game.paused) return;
    if (Game.phase === 'game' && Game.local?.alive && !Game.local.hidden) { Game.local.flashlight = !Game.local.flashlight; Sound.click(); }
  });
  Input.onPress('Backquote', () => { if (Game.phase === 'game' && Game.testMode) UI.toggleTest?.(); });
  Input.onPress('KeyE', () => {
    if (Game.paused) return;
    if (Game.phase !== 'game' || !Game.local?.alive || Game.roundPhase !== 'playing' || Game.cine?.type === 'story') return;
    if (Game.puzzleOpen >= 0) { Game.closePuzzle(); return; }
    if (Game.local.hidden) net.hide(null);
    else if (Game.nearPuzzle >= 0) Game.openPuzzle(Game.nearPuzzle);
    else if (Game.nearLocker >= 0) net.hide(Game.nearLocker);
  });
  Input.onPress('Space', () => {
    if (Game.cine?.type === 'story') { Game.skipCine(); return; }
    if (Game.phase === 'game' && !Game.paused) Game.cycleSpectate();
  });

  let raf = 0, last = performance.now();
  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    Game.update(dt);
    if (Game.phase === 'game') renderer.render(Game, dt);
    else if (Game.phase === 'ending') renderer.renderEnding(Game, dt);
    else if (Game.menu) renderer.renderMenu(Game, dt);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  window.Game = Game; // 디버그용

  return {
    /** 첫 클릭 때 오디오 켜기 (브라우저 정책상 사용자 입력 이후에만 가능) */
    unlockAudio() { Sound.init(); Sound.setVolume(Game.settings.volume); },
    applySettings(s) { Object.assign(Game.settings, s); Sound.setVolume(Game.settings.volume); },
    solo(name, color) {
      if (Game.phase !== 'menu') return;
      Sound.init();
      Game.phase = 'connecting';
      UI.showInfo({ title: 'NOCLIPPING', sub: '현실 밖으로 미끄러지는 중...' });
      net.solo(name, color);
    },
    createRoom(name) {
      if (Game.phase !== 'menu') return;
      Sound.init();
      Game.phase = 'connecting';
      UI.showInfo({ title: 'CONNECTING', sub: '방을 만드는 중...' });
      net.createRoom(name);
    },
    joinRoom(name, code) {
      if (Game.phase !== 'menu') return;
      Sound.init();
      Game.phase = 'connecting';
      UI.showInfo({ title: 'CONNECTING', sub: `방 ${code} 에 들어가는 중...` });
      net.joinRoom(name, code);
    },
    setColor(color) { if (Game.phase === 'lobby') net.setColor(color); },
    /** ESC 메뉴 열림/닫힘. 혼자 하기면 서버도 일시정지 */
    setPaused(on) {
      if (Game.phase !== 'game') return;
      Game.paused = !!on;
      Input.keys.clear();
      if (Game.solo) net.pause(Game.paused);
      Sound.setHum(on ? 0.3 : 1);
    },
    get isSolo() { return Game.solo; },
    /** 퍼즐 패널(React) → 정답 제출 / 닫기 / 효과음 */
    solvePuzzle(index, answer) { if (Game.puzzleOpen === index) net.solvePuzzle(index, answer); },
    closePuzzle() { Game.closePuzzle(); },
    sfx(kind, arg) { if (kind === 'beep') Sound.beep(arg); else if (kind === 'wrong') Sound.puzzleWrong(); else Sound.click(); },
    startMatch() { if (Game.phase === 'lobby') net.startMatch(); },
    leaveRoom() { net.leaveRoom(); toMenu(); },
    /** 테스트 모드 명령. 서버 명령은 서버가 판단하고, 화면 전용 명령은 여기서 처리 */
    test(cmd, arg) {
      if (!Game.testMode || Game.phase !== 'game') return;
      if (cmd === 'fullbright') { Game.test.fullbright = !Game.test.fullbright; Game.msg(`[TEST] 밝게 ${Game.test.fullbright ? 'ON' : 'OFF'}`, 2); return; }
      if (cmd === 'revealMap') { Game.explored.fill(1); Game.msg('[TEST] 미니맵 전체 공개', 2); return; }
      net.test(cmd, arg);
    },
    get testMode() { return Game.testMode; },
    destroy() {
      cancelAnimationFrame(raf);
      net.disconnect();
      Input.dispose();
      renderer.dispose();
      Sound.setDrone(0);
      Game.phase = 'menu';
      Game.local = null;
      Game.map = null;
      Game.menu = null;
    },
  };
}
