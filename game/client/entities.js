import { CONFIG, TS } from '../../shared/config.js';
import { PlayerState } from '../../shared/player.js';
import { lerpAngle } from '../../shared/utils.js';

/** 클라이언트 플레이어: 공유 PlayerState + 로컬 전용(스태미나, 애니메이션, 보간) */
export class ClientPlayer extends PlayerState {
  constructor(state, isLocal = false) {
    super(state);
    if (state.flashlight !== undefined) this.flashlight = state.flashlight;
    this.hidden = !!state.hidden; this.lockerId = state.lockerId ?? -1;
    this.isLocal = isLocal;
    this.stamina = CONFIG.PLAYER.STAMINA;
    this.exhausted = false;
    this.stepAcc = 0; this.walkPhase = 0; this.moving = false;
    this.target = null;
  }

  /** 원격 스냅샷 수신 → 보간 목표 */
  setTarget(s) {
    if (!this.target) { this.x = s.x; this.y = s.y; this.angle = s.angle; }
    this.target = { x: s.x, y: s.y, angle: s.angle };
    this.flashlight = s.flashlight; this.sprinting = s.sprinting; this.crouching = !!s.crouching; this.status = s.status;
    this.hidden = !!s.hidden; this.lockerId = s.lockerId ?? -1;
    if (s.vc !== undefined) this.vc = s.vc;
    this.hold = s.hold || null; this.nv = !!s.nv;   // 손에 든 아이템, 야간 투시경 착용
  }

  interpolate(dt) {
    const t = this.target;
    if (!t) return;
    const k = 1 - Math.exp(-dt * 12);
    const px = this.x, py = this.y;
    this.x += (t.x - this.x) * k; this.y += (t.y - this.y) * k;
    this.angle = lerpAngle(this.angle, t.angle, k);
    const moved = Math.hypot(this.x - px, this.y - py);
    this.moving = moved > 0.1; this.walkPhase += moved * 0.15;
  }
}

/** 서버 엔티티 상태의 클라이언트 표현 (보간 + 말풍선) */
export class ClientMonster {
  constructor() { this.reset(null); }

  reset(s) {
    this.x = s ? s.x : -1e4; this.y = s ? s.y : -1e4;
    this.angle = s ? s.angle : Math.PI / 2;
    this.type = s?.type || 'howler'; this.id = s?.id || this.type;
    this.state = s ? s.state : 'patrol';
    this.active = s ? s.active !== false : true;
    this.revealed = !!s?.revealed;
    this.color = s?.color || 'default';
    this.px = s?.px; this.py = s?.py;            // 창문들: 창문 위치
    this.target = null; this.anim = 0; this.moving = false; this.bubble = null;
  }

  /** 플레이어에게 위협이 되는 상태인가 (연출용) */
  get dangerous() {
    if (!this.active || this.type === 'wanderer' || this.type === 'partyPooper') return false;
    if (this.type === 'skinStealer' && !this.revealed) return false;
    if (this.type === 'windows' && this.state === 'idle') return false;          // 창문 속에 가만히 있으면 연출 없음
    if (this.type === 'animation' && this.state === 'doll') return false;        // 낮의 나무 인형
    return this.state !== 'vanished' && this.state !== 'stunned';
  }

  setTarget(s) {
    // 순간이동(하울러/스마일러)은 보간하지 않고 바로 옮긴다
    if (!this.target || Math.hypot(s.x - this.x, s.y - this.y) > TS * 4) { this.x = s.x; this.y = s.y; }
    this.target = s;
    this.state = s.state; this.active = s.active !== false; this.revealed = !!s.revealed;
    if (s.px !== undefined) { this.px = s.px; this.py = s.py; }
  }

  interpolate(dt) {
    if (this.bubble) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }
    const t = this.target;
    if (!t) return;
    const k = 1 - Math.exp(-dt * 14);
    const px = this.x, py = this.y;
    this.x += (t.x - this.x) * k; this.y += (t.y - this.y) * k;
    this.angle = lerpAngle(this.angle, t.angle, k);
    const moved = Math.hypot(this.x - px, this.y - py);
    this.moving = moved > 0.05;
    this.anim += moved * 0.09;
  }
}
