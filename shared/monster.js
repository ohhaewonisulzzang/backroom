import { MISSION, CONFIG, TS, T } from './config.js';
import { angleDiff, lerpAngle } from './utils.js';
import { hasLOS, moveEntity } from './physics.js';

/**
 * 엔티티 AI (서버에서 실행 — 서버 권위).
 * 모든 엔티티는 청각이 없고 "시야"로만 플레이어를 감지한다.
 *
 *  wanderer    방랑자     방호복 차림의 길 잃은 사람. 무해하게 배회만 한다.
 *  howler      하울러     철사 같은 몸. 라운드 시작 후 일정 시간 뒤 깨어나 비명과 함께 추격. 걷기보다 빠름.
 *                         멀리 떨어지면 플레이어 근처로 순간이동한다.
 *  smiler      스마일러   어둠 속에서만 움직이고 어둠 속 플레이어만 노린다. 손전등 빛을 받으면 사라진다.
 *  skinStealer 스킨스틸러 방랑자로 위장 → 다가와 "hello?" → 정체를 드러내고 추격. 정체를 드러내야만 공격.
 *  hound       하운드     사람 머리의 개. 시야로 추격. 손전등을 비추면 겁먹고 물러난다 (너무 가까우면 소용없음).
 *  (그 밖의 엔티티는 아래 각 update 함수 설명 참고)
 *
 * game 인터페이스: { map, level, allPlayers(), onMonsterAlert(target, m), onEntityEvent(m, kind, data) }
 */
const ITEM_FLARE_NOISE = 7 * 48;   // 조명탄 소리 반경 (ITEM_TYPES.flare.noise 와 같은 값)
const VOICE_LINES = ['hello?', 'excuse me?', 'hey!', '거기 누구 있어요?', '나 좀 도와줘...'];

export class Monster {
  constructor(x, y, type = 'howler', id = type) {
    this.type = type; this.id = id;
    this.cfg = CONFIG.ENTITY[type];
    this.x = x; this.y = y; this.angle = Math.PI / 2;
    this.state = { howler: 'dormant', skinStealer: 'disguised', wanderer: 'wander', smiler: 'lurk', hound: 'patrol', partygoer: 'guard',
      deathmoth: 'cling', wretch: 'wander', scratcher: 'wander', windows: 'idle', animation: 'doll', animatedKing: 'frozen', kitty: 'frozen', partyPooper: 'idle' }[type] ?? 'patrol';
    this.stunT = 0;              // 카메라 플래시 등으로 기절한 남은 시간
    this.immuneT = 0;            // 데스모스: 살충제 맞은 뒤 무시 시간
    this.post = null;            // 파티고어: 지키는 자리
    this.active = type !== 'howler';
    this.revealed = false;
    this.path = []; this.repathT = 0;
    this.lostT = 0; this.searchT = 0; this.timer = 0; this.idleT = 0;
    this.lastSeen = null; this.target = null; this.targetDist = Infinity;
    this.fleeFrom = null;
    this.speedMul = 1;
    this.color = 'default';      // 방랑자/스킨 스틸러 방호복 색
  }
  get tileX() { return Math.floor(this.x / TS); }
  get tileY() { return Math.floor(this.y / TS); }

  serialize() {
    return {
      id: this.id, type: this.type,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      angle: Math.round(this.angle * 1000) / 1000,
      state: this.state, active: this.active, revealed: this.revealed, color: this.color, stunned: this.stunT > 0,
      ...(this.type === 'windows' && this.post ? { px: Math.round(this.post.x), py: Math.round(this.post.y) } : {}),   // 창문 위치
    };
  }

  /**
   * 사물함에 숨은 플레이어를 찾아낼 수 있는가:
   * 추격 중에 숨는 장면을 봤고(시야 상실 직후), 마지막으로 본 위치가 그 사물함 근처일 때만.
   */
  canFindHidden(p) {
    return this.state === 'chase' && this.lostT < CONFIG.LOCKER.FOUND_WINDOW &&
      !!this.lastSeen && Math.hypot(this.lastSeen.x - p.x, this.lastSeen.y - p.y) < TS * 1.5;
  }

  /** 지금 닿으면 플레이어가 죽는가 */
  canKill() {
    if (this.stunT > 0) return false;
    if (!this.active || this.type === 'wanderer' || this.type === 'partyPooper') return false;
    if (this.type === 'skinStealer' && !this.revealed) return false;
    if (this.state === 'stunned' || this.state === 'vanished') return false;
    if (this.type === 'windows' && this.state !== 'grab') return false;            // 창문에서 손을 뻗을 때만
    if (this.type === 'animation' && this.state !== 'hunt') return false;          // 낮엔 그냥 인형
    if ((this.type === 'animatedKing' || this.type === 'kitty') && this.state === 'frozen') return false;   // 쳐다보는 동안은 손대지 못한다
    return true;
  }

  // ------------------------------------------------------------ 감지
  canSee(p, d, game) {
    if (d > this.cfg.sight) return false;
    if (this.type === 'smiler' && !game.level.isDark(Math.floor(p.x / TS), Math.floor(p.y / TS))) return false;
    return hasLOS(game.map, this.x, this.y, p.x, p.y);
  }

  /** 이 엔티티를 손전등으로 비추고 있는 플레이어 */
  litBy(game) {
    for (const p of game.allPlayers()) {
      if (!p.alive || !p.flashlight || p.hidden) continue;
      const d = Math.hypot(this.x - p.x, this.y - p.y);
      if (d > CONFIG.LIGHT_RANGE) continue;
      if (Math.abs(angleDiff(Math.atan2(this.y - p.y, this.x - p.x), p.angle)) > CONFIG.FOV / 2) continue;
      if (hasLOS(game.map, p.x, p.y, this.x, this.y)) return { p, d };
    }
    return null;
  }

  nearestPlayer(game) {
    let target = null, best = Infinity;
    for (const p of game.allPlayers()) {
      if (!p.alive || p.hidden) continue;   // 사물함 속 플레이어는 보이지 않는다
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < best) { best = d; target = p; }
    }
    return { target, best };
  }

  // ------------------------------------------------------------ update
  update(dt, game) {
    this.repathT -= dt;
    if (this.stunT > 0) { this.stunT -= dt; return; }     // 기절 중엔 아무것도 안 함
    if (this.immuneT > 0) this.immuneT -= dt;
    if (this.type === 'deathmoth') return this.updateDeathmoth(dt, game);
    if (this.type === 'wretch' || this.type === 'scratcher') return this.updateListener(dt, game);
    if (this.type === 'windows') return this.updateWindows(dt, game);
    if (this.type === 'animation') return this.updateAnimation(dt, game);
    if (this.type === 'partyPooper') return this.updatePooper(dt, game);
    if (!this.active) {
      this.timer += dt;
      if (this.type === 'howler' && this.timer >= this.cfg.delay) this.awaken(game);
      return;
    }
    const { target, best } = this.nearestPlayer(game);
    this.target = target; this.targetDist = best;
    if (this.type === 'partygoer') return this.updatePartygoer(dt, game, target, best);
    const sees = !!target && this.canSee(target, best, game);
    if (sees) this.lastSeen = { x: target.x, y: target.y };

    switch (this.type) {
      case 'wanderer': return this.updateWanderer(dt, game);
      case 'howler': return this.updateHowler(dt, game, target, best, sees);
      case 'smiler': return this.updateSmiler(dt, game, target, best, sees);
      case 'skinStealer': return this.updateSkinStealer(dt, game, target, best, sees);
      case 'hound': return this.updateHound(dt, game, target, best, sees);
      case 'watch': return this.updateRestricted(dt, game, target, best, sees, (x, y) => game.level.isWide(x, y));
      case 'aranea': return this.updateRestricted(dt, game, target, best, sees, (x, y) => game.level.isWide(x, y));
      case 'clump': return this.updateRestricted(dt, game, target, best, sees, (x, y) => game.map.get(x, y) !== T.SLOW);
      case 'faceling': return this.updateFaceling(dt, game, target, best, sees);
      case 'animatedKing': return this.updateWatched(dt, game, target, best);
      case 'kitty': return this.updateWatched(dt, game, target, best);
    }
  }

  updateWanderer(dt, game) {
    if (this.idleT > 0) { this.idleT -= dt; return; }
    if (!this.path.length) {
      if (Math.random() < 0.35) { this.idleT = 1 + Math.random() * 3; this.state = 'idle'; return; }
      this.state = 'wander';
      this.path = this.randomGoal(game.map, this.tileX, this.tileY, 4, 18, 10);
    }
    this.followPath(this.cfg.patrol, dt, game.map);
  }

  updateHowler(dt, game, target, best, sees) {
    if (sees && this.state !== 'chase') {
      game.onMonsterAlert(target, this);
      this.state = 'chase';
    }
    if (this.state === 'chase' || this.state === 'search') {
      this.timer = 0;
      return this.chaseOrSearch(dt, game, target, best, sees, this.cfg.chase * this.speedMul);
    }
    // 순찰 중 플레이어와 너무 멀면 근처로 순간이동 (레벨 0 하울러 특성)
    this.timer = best > this.cfg.teleportDist ? this.timer + dt : 0;
    if (this.timer > this.cfg.teleportAfter && target) { this.teleportNear(game, target); this.timer = 0; }
    this.patrol(dt, game.map, this.cfg.patrol);
  }

  updateSmiler(dt, game, target, best, sees) {
    const pass = (x, y) => game.level.isDark(x, y);
    if (this.state === 'vanished') {
      this.timer -= dt;
      if (this.timer <= 0) this.state = 'lurk';
      return;
    }
    const lit = this.litBy(game);
    if (lit) {
      // 빛을 받으면 사라졌다가 다른 어둠 속에서 다시 나타난다
      game.onEntityEvent(this, 'vanish');
      this.relocate(game, game.level.darkCells, lit.p, 10);
      this.state = 'vanished'; this.timer = 4 + Math.random() * 4; this.path = [];
      return;
    }
    if (sees) {
      if (this.state !== 'chase') game.onMonsterAlert(target, this);
      this.state = 'chase';
      this.lostT = 0;
      if (best < TS * 1.3) { this.moveToward(target.x, target.y, this.cfg.chase * this.speedMul, dt, game.map); return; }
      if (this.repathT <= 0) {
        this.path = game.map.findPath(this.tileX, this.tileY, Math.floor(target.x / TS), Math.floor(target.y / TS), pass);
        this.repathT = 0.3;
      }
      this.followPath(this.cfg.chase * this.speedMul, dt, game.map);
      return;
    }
    // 플레이어가 밝은 곳으로 나가면 어둠 가장자리에서 노려본다
    if (this.state === 'chase') {
      this.lostT += dt;
      if (target) this.angle = lerpAngle(this.angle, Math.atan2(target.y - this.y, target.x - this.x), Math.min(1, dt * 4));
      if (this.lostT < 2.5) return;
      this.state = 'lurk'; this.path = [];
    }
    if (!this.path.length) this.path = this.randomGoal(game.map, this.tileX, this.tileY, 2, 10, 6, pass);
    this.followPath(this.cfg.patrol, dt, game.map);
  }

  updateSkinStealer(dt, game, target, best, sees) {
    const C = this.cfg;
    switch (this.state) {
      case 'disguised':
        if (sees) { this.state = 'approach'; this.lostT = 0; this.path = []; break; }
        this.patrol(dt, game.map, C.patrol);
        break;
      case 'approach':
        if (!sees) {
          this.lostT += dt;
          if (this.lostT > 3) { this.state = 'disguised'; this.path = []; }
        } else this.lostT = 0;
        if (sees && best < C.speakDist) {
          this.state = 'speak'; this.timer = C.revealTime; this.path = [];
          game.onEntityEvent(this, 'voice', { text: VOICE_LINES[Math.floor(Math.random() * VOICE_LINES.length)] });
          break;
        }
        this.pursue(dt, game, this.lastSeen || target, C.approach);
        break;
      case 'speak':
        if (target) this.angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.revealed = true; this.state = 'chase'; this.lostT = 0;
          game.onEntityEvent(this, 'reveal');
          if (target) game.onMonsterAlert(target, this);
        }
        break;
      default: // chase / search
        this.chaseOrSearch(dt, game, target, best, sees, C.chase * this.speedMul);
        if (this.state === 'patrol') { this.state = 'disguised'; this.revealed = false; } // 놓치면 다시 위장
    }
  }

  updateHound(dt, game, target, best, sees) {
    const C = this.cfg;
    if (this.state === 'stunned') {
      this.timer -= dt;
      if (this.fleeFrom) {
        const dx = this.x - this.fleeFrom.x, dy = this.y - this.fleeFrom.y, d = Math.hypot(dx, dy) || 1;
        moveEntity(this, (dx / d) * C.patrol * dt, (dy / d) * C.patrol * dt, CONFIG.ENTITY.RADIUS, game.map);
        this.angle = Math.atan2(dy, dx);
      }
      if (this.timer <= 0) { this.state = 'search'; this.searchT = CONFIG.ENTITY.SEARCH_TIME; this.path = []; }
      return;
    }
    const lit = this.litBy(game);
    if (lit && lit.d > C.safeDist) {
      this.state = 'stunned'; this.timer = C.stunTime; this.fleeFrom = { x: lit.p.x, y: lit.p.y }; this.path = [];
      game.onEntityEvent(this, 'yelp');
      return;
    }
    if (sees && this.state !== 'chase') { game.onMonsterAlert(target, this); this.state = 'chase'; }
    if (this.state === 'chase' || this.state === 'search') return this.chaseOrSearch(dt, game, target, best, sees, C.chase * this.speedMul);
    this.patrol(dt, game.map, C.patrol);
  }

  // ------------------------------------------------------------ 위키 엔티티들 (Level 4 / 9 / 10 / 37 / 94 / 188 / 974)
  /**
   * 정해진 곳(pass)만 다니며 시야로 추격: 동네 감시자·아라네아(넓은 곳만), 클럼프(물 밖만).
   * 플레이어가 못 들어오는 곳으로 피하면 경로가 없어서 그 앞에서 멈췄다가 놓친다.
   */
  updateRestricted(dt, game, target, best, sees, pass) {
    const C = this.cfg, map = game.map;
    if (sees && this.state !== 'chase') { game.onMonsterAlert(target, this); this.state = 'chase'; this.lostT = 0; }
    if (this.state === 'chase') {
      const tx = sees ? target.x : this.lastSeen.x, ty = sees ? target.y : this.lastSeen.y;
      const reachable = pass(Math.floor(tx / TS), Math.floor(ty / TS));
      if (sees && reachable) this.lostT = 0; else this.lostT += dt;
      if (this.lostT > CONFIG.ENTITY.LOSE_TIME) { this.state = 'patrol'; this.path = []; return; }
      if (sees && best < TS * 1.4 && reachable) { this.moveToward(tx, ty, C.chase * this.speedMul, dt, map); return; }
      if (this.repathT <= 0) { this.path = reachable ? map.findPath(this.tileX, this.tileY, Math.floor(tx / TS), Math.floor(ty / TS), pass) : []; this.repathT = 0.3; }
      if (this.path.length) this.followPath(C.chase * this.speedMul, dt, map);
      else this.angle = lerpAngle(this.angle, Math.atan2(ty - this.y, tx - this.x), Math.min(1, dt * 4));   // 들어갈 수 없는 곳 앞에서 노려본다
      return;
    }
    if (!this.path.length) this.path = this.randomGoal(map, this.tileX, this.tileY, 5, 24, 14, pass);
    this.followPath(C.patrol, dt, map);
  }

  /** 페이슬링 (Level 10): 시야로 추격, 느리다. 전기톱 소리는 클라이언트가 거리로 낸다 */
  updateFaceling(dt, game, target, best, sees) {
    if (sees && this.state !== 'chase') { game.onMonsterAlert(target, this); this.state = 'chase'; }
    if (this.state === 'chase' || this.state === 'search') return this.chaseOrSearch(dt, game, target, best, sees, this.cfg.chase * this.speedMul);
    this.patrol(dt, game.map, this.cfg.patrol);
  }

  /** 누군가 이 엔티티를 쳐다보고 있나 (시야 부채꼴 + 벽 없음). 어두운 곳이면 손전등으로 비춰야 보인다 */
  watchedBy(game) {
    const C = this.cfg;
    if (game.level.isDark(this.tileX, this.tileY)) return this.litBy(game);
    for (const p of game.allPlayers()) {
      if (!p.alive || p.hidden) continue;
      const d = Math.hypot(this.x - p.x, this.y - p.y);
      if (d > C.watchRange) continue;
      if (Math.abs(angleDiff(Math.atan2(this.y - p.y, this.x - p.x), p.angle)) > C.watchFov / 2) continue;
      if (hasLOS(game.map, p.x, p.y, this.x, this.y)) return { p, d };
    }
    return null;
  }

  /**
   * 애니메이션 킹 (Level 94) / 키티 (Level 974): 보고 있으면 멈추고(frozen), 눈을 떼면 다가온다(stalk).
   *  킹: 손전등을 정면으로 비추면 사라졌다가(vanished) 근처 안 보이는 곳에 다시 나타난다.
   *  키티: 가끔 이상한 소리와 함께 플레이어 근처로 순간이동한다.
   */
  updateWatched(dt, game, target, best) {
    const C = this.cfg, king = this.type === 'animatedKing';
    if (this.state === 'vanished') {
      this.timer -= dt;
      if (this.timer <= 0) { if (target) this.teleportNear(game, target); this.state = 'frozen'; }
      return;
    }
    if (king) {
      const lit = this.litBy(game);
      if (lit) { this.state = 'vanished'; this.timer = C.vanish; this.path = []; game.onEntityEvent(this, 'vanish'); return; }
    }
    this.timer += dt;
    if (!king && this.timer > C.teleportEvery && target && best > TS * 6) {
      this.timer = 0; this.teleportNear(game, target, 6, 10); game.onEntityEvent(this, 'teleport');
    }
    if (this.watchedBy(game)) { if (this.state !== 'frozen') this.path = []; this.state = 'frozen'; return; }
    if (!target) return;
    if (this.state !== 'stalk' && best < TS * 6) game.onMonsterAlert(target, this);
    this.state = 'stalk';
    this.pursue(dt, game, target, C.chase * this.speedMul, best < TS * 1.5 && hasLOS(game.map, this.x, this.y, target.x, target.y));
  }

  /** 창문들 (Level 4 / 188): 창문(post) 속에서 노크. 가까이 오면 유리를 깨고 손을 뻗어 끌고 간다 */
  updateWindows(dt, game) {
    const C = this.cfg, map = game.map;
    if (!this.post) this.post = { x: this.x, y: this.y };
    const { target, best } = this.nearestPlayer(game);
    const d = target ? Math.hypot(target.x - this.post.x, target.y - this.post.y) : Infinity;
    const los = target && hasLOS(map, this.post.x, this.post.y, target.x, target.y);
    this.timer -= dt;
    if (target && los && d < C.grab) {
      if (this.state !== 'grab') { game.onEntityEvent(this, 'shatter'); game.onMonsterAlert(target, this); }
      this.state = 'grab';
      this.moveToward(target.x, target.y, C.lunge, dt, map);
      const ox = this.x - this.post.x, oy = this.y - this.post.y, od = Math.hypot(ox, oy);
      if (od > C.grab) { this.x = this.post.x + (ox / od) * C.grab; this.y = this.post.y + (oy / od) * C.grab; }   // 창문에서 멀리 못 나온다
      return;
    }
    if (this.state === 'grab') this.state = 'watch';
    if (Math.hypot(this.x - this.post.x, this.y - this.post.y) > 2) this.moveToward(this.post.x, this.post.y, C.lunge * 0.5, dt, map);
    this.state = target && los && d < C.knock ? 'watch' : 'idle';
    if (this.state === 'watch') {
      this.angle = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.timer <= 0) { game.onEntityEvent(this, 'knock'); this.timer = 2.2 + Math.random() * 1.5; }
    }
  }

  /**
   * 애니메이션 (Level 94): 낮(doll)엔 제자리에 서 있는 나무 인형. 밤(game.nightPhase === 'night')이 되면 hunt —
   * 숨지 않은 가장 가까운 사람에게 달려든다. 숨은 사람은 찾지 못한다. 밤이 끝나면 그 자리에서 다시 인형이 된다.
   */
  updateAnimation(dt, game) {
    const night = game.nightPhase === 'night';
    if (!night) { if (this.state === 'hunt') { this.state = 'doll'; this.path = []; } return; }
    const { target, best } = this.nearestPlayer(game);
    if (this.state !== 'hunt') { this.state = 'hunt'; if (target) game.onMonsterAlert(target, this); }
    if (!target) { if (!this.path.length) this.path = this.randomGoal(game.map, this.tileX, this.tileY, 3, 12, 8); this.followPath(this.cfg.chase * 0.5, dt, game.map); return; }
    this.pursue(dt, game, target, this.cfg.chase * this.speedMul, best < TS * 1.5 && hasLOS(game.map, this.x, this.y, target.x, target.y));
  }

  /**
   * 파티 푸퍼 (Level 52): 유일하게 도와주는 엔티티.
   *  idle   제자리에 서서 가장 가까운 사람을 바라본다 (E 로 말을 걸 수 있다 → GameRoom.onInteract)
   *  guide  안내받는 사람(follower)을 남은 열쇠(guideKey)까지 데려간다. 너무 멀어지면 기다린다
   *  arrive 도착해서 열쇠 옆에 서 있는다
   *  그 열쇠를 누가 먹으면 gone = true (GameRoom 이 지운다)
   */
  updatePooper(dt, game) {
    const C = this.cfg, map = game.map;
    if (this.state === 'idle') {
      const { target, best } = this.nearestPlayer(game);
      if (target && best < TS * 5) this.angle = lerpAngle(this.angle, Math.atan2(target.y - this.y, target.x - this.x), Math.min(1, dt * 4));
      return;
    }
    const k = game.level.keys[this.guideKey];
    if (!k || game.keysCollected?.[this.guideKey]) { this.gone = true; return; }
    if (this.state === 'arrive') return;
    const f = game.players?.get?.(this.follower);
    if (f && f.alive && Math.hypot(f.x - this.x, f.y - this.y) > C.wait) {      // 따라오는 사람을 기다린다
      this.angle = lerpAngle(this.angle, Math.atan2(f.y - this.y, f.x - this.x), Math.min(1, dt * 5));
      this.waiting = true;
      return;
    }
    this.waiting = false;
    // 열쇠 바로 옆 칸까지 (단말기를 가리지 않게)
    if (!this.path.length || this.repathT <= 0) {
      this.path = map.findPath(this.tileX, this.tileY, k.tx, k.ty);
      if (this.path.length) this.path.pop();
      this.repathT = 2;
    }
    if (this.followPath(C.speed, dt, map) || Math.hypot(k.x - this.x, k.y - this.y) < TS * 1.2) {
      this.state = 'arrive'; this.path = [];
      this.angle = Math.atan2(k.y - this.y, k.x - this.x);
      game.onEntityEvent(this, 'voice', { text: '여기...' });
    }
  }

  // ------------------------------------------------------------ 소리로 찾는 엔티티들
  /**
   * 들리는 소리 중 가장 가까운 것: 플레이어 발소리(p.noise), 목소리(감정 표현), 퍼즐 경보, 조명탄.
   * mult = 귀 밝기, voice = 목소리에도 반응하는지
   */
  hear(game, mult = 1, voice = true) {
    let best = null, bd = Infinity;
    const now = Date.now();
    for (const p of game.allPlayers()) {
      if (!p.alive || p.hidden) continue;
      let r = (p.noise || 0) * mult;
      if (voice && p.voiceUntil > now) r = Math.max(r, CONFIG.EMOTE.NOISE * mult);
      if (p.alarmUntil > now) r = Math.max(r, CONFIG.PUZZLE.ALARM * mult);   // 퍼즐 오답 경보 (기계음이라 모두 듣는다)
      if (p.workUntil > now) r = Math.max(r, MISSION.WORK_NOISE * mult);     // 밸브/발전기/펌프 작동 소리
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < r && d < bd) { bd = d; best = { x: p.x, y: p.y, p }; }
    }
    for (const n of game.noises || []) {          // 터진 풍선 등 바닥에서 난 소리
      const d = Math.hypot(n.x - this.x, n.y - this.y);
      if (d < n.r * mult && d < bd) { bd = d; best = { x: n.x, y: n.y, noise: true }; }
    }
    for (const f of game.flares || []) {
      const d = Math.hypot(f.x - this.x, f.y - this.y);
      if (d < ITEM_FLARE_NOISE * mult && d < bd) { bd = d; best = { x: f.x, y: f.y, flare: true }; }
    }
    return best;
  }

  /** 카메라 플래시 / 살충제 등 외부 효과 */
  stun(sec) { this.stunT = Math.max(this.stunT, sec); this.path = []; }
  repel() {
    if (this.type !== 'deathmoth') return false;
    this.state = 'return'; this.immuneT = this.cfg.repelTime; this.path = []; this.lostT = 0;
    return true;
  }

  /** 벽에 붙을 자리: 지금 타일에서 벽이 있는 쪽을 등지고 */
  clingToWall(map) {
    for (const [dx, dy, a] of [[0, -1, Math.PI / 2], [-1, 0, 0], [1, 0, Math.PI], [0, 1, -Math.PI / 2]]) {
      if (map.isSolid(this.tileX + dx, this.tileY + dy)) {
        this.angle = a;
        this.post = { x: this.tileX * TS + TS / 2 + dx * 12, y: this.tileY * TS + TS / 2 + dy * 12, angle: a };
        this.x = this.post.x; this.y = this.post.y;
        return;
      }
    }
    this.post = { x: this.x, y: this.y, angle: this.angle };
  }

  /**
   * 데스모스 암컷: cling(벽에 붙어 대기) → 발소리/손전등에 반응해 chase → 놓치면 return.
   * 목소리에는 반응하지 않는다. 조명탄 빛에는 끌려간다. 살충제를 맞으면 벽으로 돌아간다.
   */
  updateDeathmoth(dt, game) {
    const C = this.cfg, map = game.map;
    if (!this.post) this.clingToWall(map);
    const { target, best } = this.nearestPlayer(game);
    this.target = target; this.targetDist = best;
    const lit = this.immuneT > 0 ? null : this.litBy(game);
    const heard = this.immuneT > 0 ? null : this.hear(game, C.hear, false);
    const cue = lit ? { x: lit.p.x, y: lit.p.y, p: lit.p } : heard;
    this.anim += dt * 6;
    switch (this.state) {
      case 'cling':
        if (cue) {
          this.state = 'chase'; this.lastSeen = { x: cue.x, y: cue.y }; this.lostT = 0;
          if (cue.p) game.onMonsterAlert(cue.p, this);
        }
        break;
      case 'chase': {
        if (cue) { this.lastSeen = { x: cue.x, y: cue.y }; this.lostT = 0; }
        else this.lostT += dt;
        if (this.lostT > C.loseTime) { this.state = 'return'; this.path = []; break; }
        const direct = target && best < TS * 1.4 && !cue?.flare;
        this.pursue(dt, game, direct ? target : this.lastSeen, C.chase * this.speedMul, direct);
        break;
      }
      default: { // return
        if (cue && this.immuneT <= 0) { this.state = 'chase'; break; }
        if (Math.hypot(this.post.x - this.x, this.post.y - this.y) < 4) { this.state = 'cling'; this.angle = this.post.angle; break; }
        if (!this.path.length) this.path = map.findPath(this.tileX, this.tileY, Math.floor(this.post.x / TS), Math.floor(this.post.y / TS));
        if (!this.path.length) this.moveToward(this.post.x, this.post.y, C.chase * 0.7, dt, map);
        else this.followPath(C.chase * 0.7, dt, map);
      }
    }
  }

  /**
   * 광인 / 스크래처: 앞을 못 본다. 소리(발소리·목소리·조명탄)가 나면 그곳으로 다가가고,
   * 아무 소리도 없으면 천천히 배회한다. 바로 옆에 닿으면 공격.
   */
  updateListener(dt, game) {
    const C = this.cfg, map = game.map;
    const { target, best } = this.nearestPlayer(game);
    this.target = target; this.targetDist = best;
    const heard = this.hear(game, C.hear, true);
    if (heard) {
      if (this.state !== 'investigate' && heard.p) game.onMonsterAlert(heard.p, this);
      this.state = 'investigate'; this.lastSeen = { x: heard.x, y: heard.y }; this.timer = 0;
    }
    if (target && best < C.touch) { this.moveToward(target.x, target.y, C.investigate * this.speedMul, dt, map); return; }
    if (this.state === 'investigate') {
      if (Math.hypot(this.lastSeen.x - this.x, this.lastSeen.y - this.y) < TS * 0.6) {
        this.timer += dt;
        this.angle += dt * 1.5;
        if (this.timer > 3) { this.state = 'wander'; this.path = []; }
        return;
      }
      this.pursue(dt, game, this.lastSeen, C.investigate * this.speedMul);
      return;
    }
    this.patrol(dt, map, C.patrol);
  }

  /** 파티고어: 가장 길게 트인 방향을 바라보고 그 자리를 지킨다 */
  faceOpen(map) {
    let best = 0, ang = Math.PI / 2;
    for (const [dx, dy, a] of [[1, 0, 0], [-1, 0, Math.PI], [0, 1, Math.PI / 2], [0, -1, -Math.PI / 2]]) {
      let n = 0; while (n < 12 && !map.isSolid(this.tileX + dx * (n + 1), this.tileY + dy * (n + 1))) n++;
      if (n > best) { best = n; ang = a; }
    }
    this.angle = ang;
    this.post = { x: this.x, y: this.y, angle: ang };
  }

  /**
   * 파티고어 (Level Fun):
   *  guard       제자리에서 시선을 좌우로 천천히 돌린다 (부채꼴 시야)
   *  investigate 발소리를 들으면 그쪽으로 가 본다 → look 잠깐 두리번 → return 자리로 복귀
   *  chase       시야에 들어오면 추격 (걷기보다 빠름) → 놓치면 search → return
   */
  updatePartygoer(dt, game, target, best) {
    const C = this.cfg, map = game.map;
    if (!this.post) this.faceOpen(map);
    const inCone = (p, d) => d < C.sight && hasLOS(map, this.x, this.y, p.x, p.y) &&
      (this.state === 'chase' || Math.abs(angleDiff(Math.atan2(p.y - this.y, p.x - this.x), this.angle)) < C.fov / 2);
    const sees = !!target && inCone(target, best);
    if (sees) this.lastSeen = { x: target.x, y: target.y };
    const heard = this.hear(game, 1, true);
    const startChase = () => { if (this.state !== 'chase') game.onMonsterAlert(target, this); this.state = 'chase'; this.lostT = 0; this.path = []; };
    const investigate = p => { this.state = 'investigate'; this.lastSeen = { x: p.x, y: p.y }; this.path = []; this.repathT = 0; };

    switch (this.state) {
      case 'guard':
        this.timer += dt;
        this.angle = this.post.angle + Math.sin(this.timer * C.sweepSpeed) * C.sweep;
        if (sees) startChase();
        else if (heard) investigate(heard);
        break;
      case 'investigate':
        if (sees) { startChase(); break; }
        if (heard) this.lastSeen = { x: heard.x, y: heard.y };
        if (Math.hypot(this.lastSeen.x - this.x, this.lastSeen.y - this.y) < TS * 0.6) { this.state = 'look'; this.timer = 2.5; break; }
        this.pursue(dt, game, this.lastSeen, C.patrol * 1.5);
        break;
      case 'look':
        this.angle += dt * 2.2;
        this.timer -= dt;
        if (sees) startChase();
        else if (heard) investigate(heard);
        else if (this.timer <= 0) { this.state = 'return'; this.path = []; }
        break;
      case 'return': {
        if (sees) { startChase(); break; }
        if (heard) { investigate(heard); break; }
        if (Math.hypot(this.post.x - this.x, this.post.y - this.y) < 4) { this.state = 'guard'; this.timer = 0; this.angle = this.post.angle; break; }
        if (!this.path.length) this.path = map.findPath(this.tileX, this.tileY, Math.floor(this.post.x / TS), Math.floor(this.post.y / TS));
        if (!this.path.length) this.moveToward(this.post.x, this.post.y, C.patrol, dt, map);
        else this.followPath(C.patrol, dt, map);
        break;
      }
      default: // chase / search
        this.chaseOrSearch(dt, game, target, best, sees, C.chase * this.speedMul);
        if (this.state === 'patrol') { this.state = 'return'; this.path = []; }
    }
  }

  // ------------------------------------------------------------ 공통 행동
  /** 추격 → (시야 상실) 수색 → 순찰 */
  chaseOrSearch(dt, game, target, best, sees, speed) {
    const E = CONFIG.ENTITY;
    if (this.state === 'chase') {
      if (sees) this.lostT = 0;
      else {
        this.lostT += dt;
        if (this.lostT > E.LOSE_TIME) { this.state = 'search'; this.searchT = E.SEARCH_TIME; this.path = []; return; }
      }
      this.pursue(dt, game, sees ? target : this.lastSeen, speed, sees && best < TS * 1.6);
      return;
    }
    // search
    this.searchT -= dt;
    if (this.searchT <= 0) { this.state = 'patrol'; this.path = []; return; }
    if (!this.path.length) {
      const c = this.lastSeen || this;
      this.path = this.randomGoal(game.map, Math.floor(c.x / TS), Math.floor(c.y / TS), 1, 6, 4);
    }
    this.followPath(this.cfg.patrol * 1.4, dt, game.map);
  }

  pursue(dt, game, goal, speed, direct = false) {
    if (!goal) return;
    const map = game.map, gtx = Math.floor(goal.x / TS), gty = Math.floor(goal.y / TS);
    if (direct || (this.tileX === gtx && this.tileY === gty)) {
      if (this.moveToward(goal.x, goal.y, speed, dt, map) && this.state === 'chase') this.lostT += dt * 2;
      return;
    }
    if (this.repathT <= 0) { this.path = map.findPath(this.tileX, this.tileY, gtx, gty); this.repathT = 0.25; }
    this.followPath(speed, dt, map);
  }

  patrol(dt, map, speed) {
    if (!this.path.length) this.path = this.randomGoal(map, this.tileX, this.tileY, 6, 26, 14);
    this.followPath(speed, dt, map);
  }

  awaken(game) {
    this.active = true; this.state = 'patrol'; this.timer = 0;
    const { target } = this.nearestPlayer(game);
    if (target) this.teleportNear(game, target);
    game.onEntityEvent(this, 'awake');
  }

  /** 플레이어 근처(경로 lo~hi 칸)의 보이지 않는 곳으로 이동 */
  teleportNear(game, p, lo = 10, hi = 16) {
    const map = game.map, dist = map.bfs(Math.floor(p.x / TS), Math.floor(p.y / TS));
    const cand = map.floorCells.filter(i => dist[i] >= lo && dist[i] <= hi);
    for (let k = 0; k < 20 && cand.length; k++) {
      const i = cand[Math.floor(Math.random() * cand.length)];
      const x = (i % map.w) * TS + TS / 2, y = ((i / map.w) | 0) * TS + TS / 2;
      if (hasLOS(map, x, y, p.x, p.y)) continue;
      this.x = x; this.y = y; this.path = [];
      return;
    }
  }

  relocate(game, cells, awayFrom, minTiles) {
    const map = game.map;
    const far = cells.filter(i => Math.hypot((i % map.w) * TS - awayFrom.x, ((i / map.w) | 0) * TS - awayFrom.y) > minTiles * TS);
    const pool = far.length ? far : cells;
    if (!pool.length) return;
    const i = pool[Math.floor(Math.random() * pool.length)];
    this.x = (i % map.w) * TS + TS / 2; this.y = ((i / map.w) | 0) * TS + TS / 2;
  }

  randomGoal(map, cx, cy, minLen, maxLen, radius, pass) {
    for (let i = 0; i < 16; i++) {
      const idx = map.floorCells[Math.floor(Math.random() * map.floorCells.length)];
      const x = idx % map.w, y = (idx / map.w) | 0;
      if (Math.abs(x - cx) > radius || Math.abs(y - cy) > radius) continue;
      const p = map.findPath(this.tileX, this.tileY, x, y, pass);
      if (p.length >= minLen && p.length <= maxLen) return p;
    }
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .filter(([dx, dy]) => !map.isSolid(this.tileX + dx, this.tileY + dy) && (!pass || pass(this.tileX + dx, this.tileY + dy)));
    if (!nb.length) return [];
    const [dx, dy] = nb[Math.floor(Math.random() * nb.length)];
    return [{ x: this.tileX + dx, y: this.tileY + dy }];
  }

  followPath(speed, dt, map) {
    if (!this.path.length) return true;
    const n = this.path[0];
    if (this.moveToward(n.x * TS + TS / 2, n.y * TS + TS / 2, speed, dt, map)) this.path.shift();
    return this.path.length === 0;
  }

  moveToward(tx, ty, speed, dt, map) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    if (d < 2) return true;
    const s = Math.min(d, speed * dt);
    moveEntity(this, (dx / d) * s, (dy / d) * s, CONFIG.ENTITY.RADIUS, map);
    this.angle = lerpAngle(this.angle, Math.atan2(dy, dx), Math.min(1, dt * 9));
    return d - s < 2;
  }
}
