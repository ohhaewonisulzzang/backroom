import { CONFIG, TS, T, PLAYER_COLORS, ENTITY_TYPES, LEVELS, ITEM_TYPES, randomSuit } from '../shared/config.js';
import { generateLevel } from '../shared/map.js';
import { angleDiff } from '../shared/utils.js';
import { hasLOS } from '../shared/physics.js';
import { Monster } from '../shared/monster.js';
import { PlayerState } from '../shared/player.js';
import { checkPuzzle } from '../shared/puzzles.js';

const finite = v => typeof v === 'number' && Number.isFinite(v);

/**
 * 하나의 방(=하나의 레벨 인스턴스). 서버 권위로 관리하는 것:
 *  - 레벨 seed, 라운드 진행 (playing → ended → 새 라운드), 레벨 진행
 *  - 엔티티 AI 시뮬레이션과 플레이어 사망 판정
 *  - 열쇠/아이템 획득, 출구 개방, 탈출 판정, 사물함
 *  - 클라이언트 위치 검증 (속도 초과 / 벽 안 → 'correct' 로 되돌림)
 *  - 테스트 모드 명령 (서버가 testMode 로 켜졌을 때만)
 */
export class GameRoom {
  constructor(name, io, onEmpty, { testMode = false, lobby = false, solo = false } = {}) {
    this.name = name;               // = 방 코드
    this.io = io;
    this.onEmpty = onEmpty;
    this.testMode = testMode;
    this.solo = solo;               // 혼자 하기 방 (코드로 참가 불가)
    this.paused = false;            // 혼자 하기에서만 일시정지 가능
    this.hostId = null;
    this.players = new Map();
    this.round = 0;
    this.levelIndex = 0;            // 지금 진행 중인 레벨 (탈출 → +1, 전멸 → 그대로)
    this.phase = lobby ? 'lobby' : 'waiting';   // lobby(대기방) | waiting | playing | ended
    this.restartAt = 0;
    this.level = null; this.map = null; this.monsters = [];
    this.keysCollected = []; this.exitUnlocked = false;
    this.lockerOccupant = [];
    this.items = []; this.itemSeq = 0; this.entitySeq = 0;
    this.flares = []; this.flareSeq = 0;
    this.monsterGrace = 0;
    this.lastTick = Date.now();
    this.snapAcc = 0;
    this.timer = setInterval(() => this.tick(), 1000 / CONFIG.NET.SIM_RATE);
  }

  get isFull() { return this.players.size >= CONFIG.NET.MAX_PLAYERS; }

  emit(event, data) { this.io.to(this.name).emit(event, data); }

  /** Monster AI 가 사용하는 인터페이스 */
  allPlayers() { return this.players.values(); }
  onMonsterAlert(target, m) { this.emit('monsterAlert', { targetId: target ? target.id : null, id: m.id, type: m.type }); }
  onEntityEvent(m, kind, data = {}) {
    this.emit('entityEvent', { id: m.id, type: m.type, kind, x: Math.round(m.x), y: Math.round(m.y), ...data });
  }

  log(...args) { console.log(`[room:${this.name}]`, ...args); }

  // ---------------------------------------------------------------- players
  freeColor(wanted) {
    const used = new Set([...this.players.values()].map(p => p.color));
    if (PLAYER_COLORS.includes(wanted) && !used.has(wanted)) return wanted;
    return PLAYER_COLORS.find(c => !used.has(c)) ?? PLAYER_COLORS[0];
  }

  /** 대기방 입장 */
  addToLobby(socket, name) {
    const p = new PlayerState({ id: socket.id, name, color: this.freeColor('default') });
    this.players.set(p.id, p);
    socket.join(this.name);
    if (!this.hostId) this.hostId = p.id;
    this.emitLobby();
    this.log(`lobby join ${name} (${p.id}) players=${this.players.size}`);
  }

  lobbyPayload() {
    return {
      code: this.name, hostId: this.hostId, max: CONFIG.NET.MAX_PLAYERS,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color })),
    };
  }
  emitLobby() { this.emit('lobby', this.lobbyPayload()); }

  /** 대기방에서 방호복 색 변경 (다른 사람이 쓰는 색은 불가) */
  setColor(id, color) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'lobby' || !PLAYER_COLORS.includes(color)) return;
    if ([...this.players.values()].some(o => o !== p && o.color === color)) return;
    p.color = color;
    this.emitLobby();
  }

  /** 방장이 시작 → 모두에게 init 을 보내고 라운드 시작 */
  startMatch(id) {
    if (this.phase !== 'lobby' || id !== this.hostId) return;
    this.startRound(false, { story: this.levelIndex === 0 });
    for (const p of this.players.values()) {
      this.io.to(p.id).emit('init', { ...this.roundPayload(), id: p.id, room: this.name, testMode: this.testMode, story: this.story });
    }
    this.log(`match start by host, players=${this.players.size}`);
  }

  /** 게임 중(또는 혼자 하기) 바로 입장 */
  addPlayer(socket, name, wantedColor) {
    const p = new PlayerState({ id: socket.id, name, color: this.freeColor(wantedColor) });
    this.players.set(p.id, p);
    socket.join(this.name);
    if (!this.hostId) this.hostId = p.id;

    let story = false;
    if (this.phase === 'waiting') { this.startRound(false, { story: this.levelIndex === 0 }); story = this.story; }
    else if (this.phase === 'playing') this.spawnPlayer(p, this.players.size - 1);
    else p.status = 'waiting';
    p.inv = [];

    socket.emit('init', { ...this.roundPayload(), id: p.id, room: this.name, testMode: this.testMode, story });
    socket.to(this.name).emit('playerJoined', p.serialize());
    this.log(`join ${name} (${p.id}) players=${this.players.size}`);
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.hidden && this.lockerOccupant[p.lockerId] === id) this.lockerOccupant[p.lockerId] = null;
    this.players.delete(id);
    this.emit('playerLeft', { id });
    this.log(`leave ${p.name} players=${this.players.size}`);
    if (this.players.size === 0) { this.destroy(); return; }
    if (this.hostId === id) this.hostId = this.players.keys().next().value;   // 방장 위임
    if (this.phase === 'lobby') this.emitLobby();
    else this.checkRoundEnd();
  }

  spawnPlayer(p, i) {
    const s = this.level.spawn;
    const off = [[0, 0], [-8, -8], [8, 8], [8, -8], [-8, 8]][i % 5];
    p.x = s.x + off[0]; p.y = s.y + off[1];
    p.angle = Math.PI / 4;
    p.status = 'alive'; p.flashlight = true; p.sprinting = false;
    p.hidden = false; p.lockerId = -1; p.hideToggleAt = 0;
    p.noise = 0; p.voiceUntil = 0; p.alarmUntil = 0; p.emoteAt = 0;
    p.sanity = CONFIG.SANITY.MAX;
    p.lastUpdate = Date.now();
  }

  sendInventory(p) { this.io.to(p.id).emit('inventory', { inv: p.inv }); }

  // ---------------------------------------------------------------- rounds
  /** story: 처음 Level 0 에 들어갈 때 오프닝(친구들과 촬영 → 노클립)을 보여주므로 엔티티를 그만큼 더 재운다 */
  startRound(broadcast = true, { story = false } = {}) {
    this.round++;
    const seed = (Math.random() * 2 ** 32) >>> 0;
    this.level = generateLevel(seed, this.levelIndex);
    this.map = this.level.map;
    this.keysCollected = this.level.keys.map(() => false);
    this.lockerOccupant = this.level.lockers.map(() => null);
    this.exitUnlocked = false;
    // Level ! : 열쇠 없이 출구가 처음부터 열려 있고, 왼쪽에서 괴물 떼가 밀려온다
    this.run = this.level.info.layout === 'run';
    this.horde = this.run ? { x: CONFIG.RUN.START_X, speed: CONFIG.RUN.SPEED, t: 0 } : null;
    if (this.run) this.exitUnlocked = true;
    this.monsters = this.spawnEntities();
    this.items = this.spawnItems();
    this.flares = [];
    if (this.levelIndex === 0) for (const p of this.players.values()) p.inv = [];   // 처음부터면 빈손
    this.story = story;
    this.monsterGrace = CONFIG.ENTITY.SPAWN_GRACE + (story ? CONFIG.STORY.DURATION : 0);
    let i = 0;
    for (const p of this.players.values()) this.spawnPlayer(p, i++);
    this.phase = 'playing';
    this.snapAcc = 0;
    if (broadcast) this.emit('round', this.roundPayload());
    this.log(`round ${this.round} start level=${this.levelIndex} seed=${seed}`);
  }

  /** 종류별 엔티티 배치. 스마일러는 어두운 구역, 나머지는 시작 지점에서 먼 곳. */
  spawnEntities() {
    const { map, dist, darkCells, monsterSpawn } = this.level;
    const far = map.floorCells.filter(i => dist[i] >= 18 && i !== this.level.exitIdx);
    const used = [];
    const pick = pool => {
      const free = pool.filter(i => used.every(u => Math.abs((u % map.w) - (i % map.w)) + Math.abs(((u / map.w) | 0) - ((i / map.w) | 0)) > 10));
      const src = free.length ? free : pool;
      if (!src.length) return null;
      const i = src[Math.floor(Math.random() * src.length)];
      used.push(i);
      return { x: (i % map.w) * TS + TS / 2, y: ((i / map.w) | 0) * TS + TS / 2 };
    };
    const list = [];
    const counts = LEVELS[this.levelIndex].entities;
    for (const type of ENTITY_TYPES) {
      for (let n = 0; n < (counts[type] || 0); n++) {
        const pool = type === 'smiler' ? darkCells.filter(i => dist[i] >= 10) : far;
        const pos = type === 'howler' ? (n === 0 ? monsterSpawn : pick(far)) : pick(pool);
        if (!pos) continue;
        const m = new Monster(pos.x, pos.y, type, `${type}-${n}`);
        m.color = randomSuit();
        if (type === 'partygoer') m.faceOpen(map);
        if (type === 'deathmoth') m.clingToWall(map);
        if (type === 'howler') m.timer = -n * CONFIG.ENTITY.howler.extraDelay;   // 하울러는 한 마리씩 차례로 깨어난다
        list.push(m);
      }
    }
    return list;
  }

  /** 아이템(아몬드 워터 등) 자연 배치 */
  spawnItems() {
    if (this.level.info.layout === 'run') return [];     // 질주 레벨은 아이템 없음
    const { map, dist, exitIdx } = this.level;
    const pool = map.floorCells.filter(i => dist[i] >= 6 && i !== exitIdx);
    const list = [];
    const over = LEVELS[this.levelIndex].items || {};
    for (const [type, def] of Object.entries(ITEM_TYPES)) {
      for (let n = 0; n < (over[type] ?? def.perLevel) && pool.length; n++) {
        const i = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        list.push({ id: ++this.itemSeq, type, x: (i % map.w) * TS + TS / 2, y: ((i / map.w) | 0) * TS + TS / 2 });
      }
    }
    return list;
  }

  roundPayload() {
    return {
      round: this.round,
      level: this.levelIndex,
      seed: this.level.seed,
      phase: this.phase,
      players: [...this.players.values()].map(p => p.serialize()),
      keys: [...this.keysCollected],
      exitUnlocked: this.exitUnlocked,
      monsters: this.monsters.map(m => m.serialize()),
      items: this.items,
      flares: this.flares,
      horde: this.horde ? { x: Math.round(this.horde.x), speed: Math.round(this.horde.speed) } : null,
      restartIn: this.phase === 'ended' ? Math.max(0, (this.restartAt - Date.now()) / 1000) : 0,
    };
  }

  checkRoundEnd() {
    if (this.phase !== 'playing') return;
    for (const p of this.players.values()) if (p.alive) return;
    this.phase = 'ended';
    const delay = CONFIG.NET.ROUND_RESTART_DELAY;
    this.restartAt = Date.now() + delay * 1000;
    const list = status => [...this.players.values()].filter(p => p.status === status).map(p => p.name);
    const escaped = list('escaped');
    if (escaped.length && LEVELS[this.levelIndex].final) {
      // 마지막 레벨 탈출 → 엔딩. 멀티는 대기방으로, 혼자 하기는 끝
      this.levelIndex = 0;
      for (const p of this.players.values()) { p.inv = []; p.status = 'alive'; }
      this.phase = this.solo ? 'complete' : 'lobby';
      this.emit('gameComplete', { escaped, dead: list('dead') });
      if (!this.solo) this.emitLobby();
      this.log('GAME COMPLETE');
      return;
    }
    // 한 명이라도 탈출 → 다음 레벨, 전멸 → 죽은 레벨에서 다시
    if (escaped.length) this.levelIndex = (this.levelIndex + 1) % LEVELS.length;
    this.emit('roundEnd', { round: this.round, escaped, dead: list('dead'), restartIn: delay, nextLevel: this.levelIndex });
    this.log(`round ${this.round} end`);
  }

  /** ESC 메뉴: 혼자 하기 방에서만 실제로 멈춘다 (멀티는 다른 사람이 계속 플레이) */
  setPaused(id, paused) {
    if (!this.solo || !this.players.has(id)) return;
    this.paused = !!paused;
    const p = this.players.get(id);
    if (p) p.lastUpdate = Date.now();
    this.io.to(id).emit('paused', { paused: this.paused });
  }

  // ---------------------------------------------------------------- lockers
  /** 사물함 들어가기/나오기 (서버 권위). data.index = 사물함 번호 */
  onHide(id, data = {}) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'playing' || !p.alive) return;
    const now = Date.now();
    if (now - (p.hideToggleAt || 0) < CONFIG.LOCKER.COOLDOWN * 1000) return;

    if (p.hidden) {
      this.lockerOccupant[p.lockerId] = null;
      const locker = p.lockerId;
      p.hidden = false; p.lockerId = -1; p.hideToggleAt = now; p.lastUpdate = now;
      this.emit('hideState', { id, hidden: false, locker, x: p.x, y: p.y });
      return;
    }
    const idx = Number(data && data.index);
    const lk = this.level.lockers[idx];
    if (!lk || this.lockerOccupant[idx]) return;
    if (Math.hypot(lk.x - p.x, lk.y - p.y) > CONFIG.LOCKER.USE_DIST) return;
    this.lockerOccupant[idx] = id;
    p.hidden = true; p.lockerId = idx; p.hideToggleAt = now;
    p.x = lk.x; p.y = lk.y; p.sprinting = false;
    this.emit('hideState', { id, hidden: true, locker: idx, x: p.x, y: p.y });
  }

  // ---------------------------------------------------------------- input
  onState(id, s) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'playing' || !p.alive || !s || this.paused) return;
    if (p.hidden) { if (finite(s.angle)) p.angle = s.angle; return; }   // 숨어 있는 동안 이동 불가
    if (!finite(s.x) || !finite(s.y) || !finite(s.angle)) return;

    const now = Date.now();
    const elapsed = Math.min(1, (now - p.lastUpdate) / 1000);
    const maxStep = CONFIG.PLAYER.SPRINT * elapsed * 1.5 + 32;
    const moved = Math.hypot(s.x - p.x, s.y - p.y);
    // 도착 칸이 벽이거나, 이동 경로가 벽을 뚫고 지나가면 거부 (벽 통과 치트 방지)
    const solid = this.map.isSolid(Math.floor(s.x / TS), Math.floor(s.y / TS)) || !hasLOS(this.map, p.x, p.y, s.x, s.y);
    p.lastUpdate = now;
    if (moved > maxStep || solid) {
      this.io.to(id).emit('correct', { x: p.x, y: p.y });
      return;
    }
    p.applyInput(s);
    // 발소리: 움직이고 있으면 들리는 반경 (웅크리면 0) — 파티고어가 듣는다
    const H = CONFIG.ENTITY.partygoer;
    p.noise = moved < 1 ? 0 : p.crouching ? 0 : p.sprinting ? H.hearSprint : H.hearWalk;
    this.checkPickups(p);
  }

  collectKey(i, p) {
    if (this.keysCollected[i]) return;
    this.keysCollected[i] = true;
    const count = this.keysCollected.filter(Boolean).length;
    for (const m of this.monsters) m.speedMul = 1 + CONFIG.ENTITY.SPEED_PER_KEY * count;
    if (count >= this.level.keys.length) this.exitUnlocked = true;
    this.emit('keyCollected', { index: i, by: p.id, count, unlocked: this.exitUnlocked });
  }

  checkPickups(p) {
    this.level.keys.forEach((k, i) => {
      if (!this.keysCollected[i] && !k.puzzle && Math.hypot(k.x - p.x, k.y - p.y) < CONFIG.PICKUP_RADIUS) this.collectKey(i, p);
    });
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (it.lockedFor === p.id) {                                  // 방금 버린 사람은 한 번 멀어져야 다시 주울 수 있다
        if (d > CONFIG.PICKUP_RADIUS * 2) delete it.lockedFor;
        continue;
      }
      if (d >= CONFIG.PICKUP_RADIUS) continue;
      if (p.inv.length >= CONFIG.INVENTORY_SIZE) continue;          // 가방이 가득 참
      this.items.splice(i, 1);
      p.inv.push({ type: it.type, uses: it.uses ?? ITEM_TYPES[it.type].uses });   // 버려진 아이템은 남은 횟수 그대로
      this.emit('itemPicked', { id: it.id, type: it.type, by: p.id });
      this.sendInventory(p);
    }
    if (this.exitUnlocked && this.map.get(Math.floor(p.x / TS), Math.floor(p.y / TS)) === T.EXIT) {
      p.status = 'escaped';
      this.emit('playerEscaped', { id: p.id });
      this.checkRoundEnd();
    }
  }

  // ---------------------------------------------------------------- puzzles
  /** 퍼즐 단말기 정답 제출. 맞으면 그 단말기의 열쇠 획득, 틀리면 경보(소리)가 울린다 */
  onSolvePuzzle(id, { index, answer } = {}) {
    const p = this.players.get(id);
    if (!p || !p.alive || p.hidden || this.phase !== 'playing' || this.paused) return;
    const k = this.level.keys[index | 0];
    if (!k || !k.puzzle || this.keysCollected[index | 0]) return;
    if (Math.hypot(k.x - p.x, k.y - p.y) > CONFIG.PUZZLE.USE_DIST * 1.6) return;
    if (checkPuzzle(k.puzzle, answer)) {
      this.collectKey(index | 0, p);
      return;
    }
    // 오답 → 단말기 경보. 소리에 민감한 엔티티가 듣고 찾아온다
    p.alarmUntil = Date.now() + CONFIG.PUZZLE.ALARM_TIME * 1000;
    this.emit('puzzleAlarm', { index: index | 0, by: id, x: Math.round(k.x), y: Math.round(k.y) });
  }

  // ---------------------------------------------------------------- items / emotes
  /** 인벤토리 slot 번 아이템 사용 (서버가 효과 판정) */
  onUseItem(id, { slot } = {}) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.phase !== 'playing' || this.paused) return;
    const it = p.inv[slot | 0];
    if (!it) return;
    const def = ITEM_TYPES[it.type];
    const fx = { by: id, type: it.type, x: Math.round(p.x), y: Math.round(p.y), angle: Math.round(p.angle * 1000) / 1000 };
    const inCone = (m, range, fov) => {
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      return d < range && Math.abs(angleDiff(Math.atan2(m.y - p.y, m.x - p.x), p.angle)) < fov / 2 && hasLOS(this.map, p.x, p.y, m.x, m.y);
    };
    switch (it.type) {
      case 'camera': {
        if (p.hidden) return;
        const hit = [];
        for (const m of this.monsters) {
          if (!m.active || !inCone(m, def.range, def.fov)) continue;
          if (m.type === 'smiler') { this.onEntityEvent(m, 'vanish'); m.relocate(this, this.level.darkCells, p, 10); m.state = 'vanished'; m.timer = 6; }
          else m.stun(m.type === 'howler' ? def.stun * 0.6 : def.stun);
          hit.push(m.id);
        }
        fx.hit = hit;
        break;
      }
      case 'bugSpray': {
        if (p.hidden) return;
        const hit = [];
        for (const m of this.monsters) if (m.type === 'deathmoth' && inCone(m, def.range, def.fov) && m.repel()) hit.push(m.id);
        fx.hit = hit;
        break;
      }
      case 'flare': {
        const f = { id: ++this.flareSeq, x: p.x, y: p.y + 6, until: Date.now() + def.dur * 1000 };
        this.flares.push(f);
        fx.flare = { ...f, dur: def.dur };
        break;
      }
      case 'almondWater':
        p.sanity = Math.min(CONFIG.SANITY.MAX, p.sanity + def.sanity);
        break;
      case 'staminaDrink':
      case 'compass':
        break;   // 효과는 본인 화면(스태미나 / 방향 표시)에서 처리
      default: return;
    }
    it.uses -= 1;
    if (it.uses <= 0) p.inv.splice(slot | 0, 1);
    this.sendInventory(p);
    this.emit('itemUsed', fx);
  }

  /** 인벤토리 slot 번 아이템을 발밑에 버린다 (남은 사용 횟수 유지, 다른 사람이 주울 수 있음) */
  onDropItem(id, { slot } = {}) {
    const p = this.players.get(id);
    if (!p || !p.alive || p.hidden || this.phase !== 'playing' || this.paused) return;
    const i = slot | 0, it = p.inv[i];
    if (!it) return;
    p.inv.splice(i, 1);
    const drop = { id: ++this.itemSeq, type: it.type, uses: it.uses, x: Math.round(p.x), y: Math.round(p.y + 6), lockedFor: id };
    this.items.push(drop);
    this.sendInventory(p);
    this.emit('itemSpawned', { ...drop });
  }

  /** 감정 표현: 말풍선 + 목소리. 목소리는 소리라서 귀 밝은 엔티티가 듣는다 */
  onEmote(id, { i } = {}) {
    const p = this.players.get(id);
    const lines = CONFIG.EMOTE.LINES;
    if (!p || !p.alive || this.phase !== 'playing' || !Number.isInteger(i) || i < 0 || i >= lines.length) return;
    const now = Date.now();
    if (now - (p.emoteAt || 0) < CONFIG.EMOTE.COOLDOWN * 1000) return;
    p.emoteAt = now; p.voiceUntil = now + 1200;
    this.emit('emote', { id, i });
  }

  // ---------------------------------------------------------------- test mode
  /**
   * 테스트 명령. 서버가 testMode 로 시작됐을 때만 동작한다 (npm run dev 기본 ON, 배포는 BACKROOMS_TEST=1 일 때만).
   * cmd: nextLevel | setLevel | giveKey | unlockExit | tpKey | tpPuzzle | tpExit | drainSanity | spawnItem | spawnEntity | clearEntities | god | revive
   */
  onTest(id, { cmd, arg } = {}) {
    if (!this.testMode) return;
    const p = this.players.get(id);
    if (!p) return;
    const reply = (text, extra = {}) => this.io.to(id).emit('testResult', { cmd, text, ...extra });
    const tile = o => ({ tx: Math.floor(o.x / TS), ty: Math.floor(o.y / TS) });
    const teleport = (x, y) => {
      if (p.hidden) { this.lockerOccupant[p.lockerId] = null; p.hidden = false; p.lockerId = -1; }
      p.x = x; p.y = y; p.lastUpdate = Date.now();
      this.io.to(id).emit('correct', { x, y });
      this.checkPickups(p);
    };
    this.log(`test ${cmd} ${arg ?? ''} by ${p.name}`);

    switch (cmd) {
      case 'nextLevel':
      case 'setLevel': {
        const n = cmd === 'nextLevel' ? (this.levelIndex + 1) % LEVELS.length : Number(arg);
        if (!Number.isInteger(n) || n < 0 || n >= LEVELS.length) return reply('잘못된 레벨');
        this.levelIndex = n;
        this.startRound(true);
        return reply(`LEVEL ${n} 시작`);
      }
      case 'giveKey': {
        const i = this.keysCollected.findIndex(c => !c);
        if (i < 0) return reply('열쇠를 이미 다 모았다');
        this.collectKey(i, p);
        return reply('열쇠 +1');
      }
      case 'unlockExit':
        this.keysCollected.forEach((c, i) => { if (!c) this.collectKey(i, p); });
        return reply('출구 개방');
      case 'tpKey': {
        const k = this.level.keys.map((k, i) => ({ k, i })).filter(o => !this.keysCollected[o.i])
          .sort((a, b) => Math.hypot(a.k.x - p.x, a.k.y - p.y) - Math.hypot(b.k.x - p.x, b.k.y - p.y))[0];
        if (!k) return reply('남은 열쇠 없음');
        teleport(k.k.x, k.k.y);
        return reply('가장 가까운 열쇠로 이동');
      }
      case 'tpPuzzle': {   // 가장 가까운(arg 가 있으면 그 종류의) 안 푼 퍼즐 단말기 옆으로
        const k = this.level.keys.map((k, i) => ({ k, i })).filter(o => o.k.puzzle && !this.keysCollected[o.i] && (!arg || o.k.puzzle.type === arg))
          .sort((a, b) => Math.hypot(a.k.x - p.x, a.k.y - p.y) - Math.hypot(b.k.x - p.x, b.k.y - p.y))[0];
        if (!k) return reply('남은 퍼즐 단말기 없음');
        teleport(k.k.x, k.k.y + 1);
        return reply(`퍼즐 단말기(${k.k.puzzle.type})로 이동`);
      }
      case 'tpExit': {
        const e = this.level.exitIdx, w = this.map.w;
        teleport((e % w) * TS + TS / 2, ((e / w) | 0) * TS + TS / 2);
        return reply('출구로 이동');
      }
      case 'spawnItem': {
        if (!ITEM_TYPES[arg]) return reply('알 수 없는 아이템');
        // 바라보는 방향 → 좌/우/뒤 순서로, 발밑에서 떨어진(바로 먹히지 않는) 빈 바닥을 찾는다
        const it = { id: ++this.itemSeq, type: arg, x: p.x, y: p.y + 1 };
        for (const da of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4]) {
          const x = p.x + Math.cos(p.angle + da) * 34, y = p.y + Math.sin(p.angle + da) * 34;
          if (!this.map.isSolid(Math.floor(x / TS), Math.floor(y / TS))) { it.x = x; it.y = y; break; }
        }
        this.items.push(it);
        this.emit('itemSpawned', it);
        return reply(`${ITEM_TYPES[arg].name} 소환`);
      }
      case 'spawnEntity': {
        if (!ENTITY_TYPES.includes(arg)) return reply('알 수 없는 엔티티');
        const { tx, ty } = tile(p), dist = this.map.bfs(tx, ty);
        const cand = this.map.floorCells.filter(i => dist[i] >= 3 && dist[i] <= 5);
        if (!cand.length) return reply('소환할 자리가 없다');
        const i = cand[Math.floor(Math.random() * cand.length)];
        const m = new Monster((i % this.map.w) * TS + TS / 2, ((i / this.map.w) | 0) * TS + TS / 2, arg, `${arg}-t${++this.entitySeq}`);
        m.color = randomSuit();
        if (arg === 'howler') { m.active = true; m.state = 'patrol'; }
        if (arg === 'partygoer') m.faceOpen(this.map);
        if (arg === 'deathmoth') m.clingToWall(this.map);
        this.monsters.push(m);
        return reply(`${arg} 소환 (3~5칸 거리)`);
      }
      case 'clearEntities':
        this.monsters = [];
        return reply('엔티티 전부 제거');
      case 'drainSanity':
        p.sanity = Math.max(1, p.sanity - 30);
        return reply(`정신력 ${Math.round(p.sanity)}`);
      case 'god':
        p.god = !p.god;
        return reply(p.god ? '무적 ON' : '무적 OFF', { god: p.god });
      case 'revive':
        if (this.phase !== 'playing') return reply('라운드가 끝난 상태');
        if (p.alive) return reply('이미 살아 있다');
        this.spawnPlayer(p, 0);
        this.io.to(id).emit('correct', { x: p.x, y: p.y });
        return reply('부활');
      default:
        return reply('알 수 없는 명령');
    }
  }

  // ---------------------------------------------------------------- loop
  tick() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    if (this.phase === 'lobby' || this.paused) return;
    if (this.phase === 'playing') {
      if (this.flares.length) this.flares = this.flares.filter(f => f.until > now);
      if (this.monsterGrace > 0) this.monsterGrace -= dt;
      else for (const m of this.monsters) m.update(dt, this);

      const reach = CONFIG.PLAYER.RADIUS + CONFIG.ENTITY.RADIUS - 2;
      let someoneDied = false;
      // Level ! : 괴물 떼가 점점 빨라지며 밀려온다. 닿으면 즉사
      if (this.horde && this.monsterGrace <= 0) {
        const R = CONFIG.RUN, hd = this.horde;
        hd.t += dt;
        hd.speed = Math.min(R.MAX_SPEED, R.SPEED + R.ACCEL * hd.t);
        hd.x += hd.speed * dt;
        let rear = Infinity, mortalRear = Infinity;
        for (const p of this.players.values()) if (p.alive) { rear = Math.min(rear, p.x); if (!p.god) mortalRear = Math.min(mortalRear, p.x); }
        if (rear < Infinity && rear - hd.x > R.CATCHUP) hd.x = rear - R.CATCHUP;    // 너무 멀리 떨어지지 않게
        // 무적(테스트)만 남았으면 지나쳐 가지 않고 바로 뒤에서 멈춘다
        if (rear < Infinity && mortalRear === Infinity) hd.x = Math.min(hd.x, rear - CONFIG.PLAYER.RADIUS - 6);
        for (const p of this.players.values()) {
          if (!p.alive || p.god || p.x - CONFIG.PLAYER.RADIUS > hd.x) continue;
          p.status = 'dead';
          someoneDied = true;
          this.emit('playerDied', { id: p.id, entityType: 'horde', x: Math.round(p.x), y: Math.round(p.y) });
        }
      }
      // 정신력: 어두울수록 빨리 줄고, 0 이 되면 터진다 (질주 레벨은 제외)
      if (this.monsterGrace <= 0 && !this.run) {
        const S = CONFIG.SANITY;
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          const dark = this.level.isDark(Math.floor(p.x / TS), Math.floor(p.y / TS));
          const mul = (dark ? (p.flashlight ? S.DARK_LIGHT_MUL : S.DARK_MUL) : 1) * (p.hidden ? S.HIDDEN_MUL : 1);
          p.sanity = Math.max(0, p.sanity - S.DRAIN * mul * dt);
          if (p.sanity <= 0 && !p.god) {
            if (p.hidden) { this.lockerOccupant[p.lockerId] = null; p.hidden = false; p.lockerId = -1; }
            p.status = 'dead';
            someoneDied = true;
            this.emit('playerDied', { id: p.id, entityType: 'sanity', x: Math.round(p.x), y: Math.round(p.y) });
          } else if (p.god) p.sanity = Math.max(p.sanity, 1);
        }
      }
      for (const p of this.players.values()) {
        if (!p.alive || p.god || this.monsterGrace > 0) continue;
        const killer = this.monsters.find(m => m.canKill() && (!p.hidden || m.canFindHidden(p)) &&
          Math.hypot(p.x - m.x, p.y - m.y) < reach);
        if (killer) {
          if (p.hidden) { this.lockerOccupant[p.lockerId] = null; p.hidden = false; p.lockerId = -1; }
          p.status = 'dead';
          someoneDied = true;
          this.emit('playerDied', { id: p.id, entityType: killer.type, x: Math.round(p.x), y: Math.round(p.y) });
        }
      }

      this.snapAcc += dt;
      if (this.snapAcc >= 1 / CONFIG.NET.SNAPSHOT_RATE) {
        this.snapAcc %= 1 / CONFIG.NET.SNAPSHOT_RATE;
        this.emit('snapshot', {
          players: [...this.players.values()].map(p => p.serializeSnapshot()),
          monsters: this.monsters.map(m => m.serialize()),
          ...(this.horde ? { horde: { x: Math.round(this.horde.x), speed: Math.round(this.horde.speed) } } : {}),
        });
      }
      if (someoneDied) this.checkRoundEnd();
    } else if (this.phase === 'ended' && now >= this.restartAt) {
      this.startRound();
    }
  }

  destroy() {
    clearInterval(this.timer);
    this.onEmpty?.();
    this.log('closed');
  }
}
