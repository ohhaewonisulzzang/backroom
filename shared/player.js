/**
 * 네트워크로 동기화되는 플레이어 상태.
 * 서버는 이 클래스를 그대로 쓰고, 클라이언트는 상속해서 보간/스태미나 등 로컬 전용 필드를 붙인다.
 *
 * status: 'alive' | 'dead' | 'escaped' | 'waiting'(라운드 종료 중 접속, 다음 라운드 대기)
 */
export class PlayerState {
  constructor({ id, name = '', x = 0, y = 0, angle = 0, color = '#cfc6a6', status = 'alive' } = {}) {
    this.id = id; this.name = name; this.color = color;
    this.x = x; this.y = y; this.angle = angle;
    this.flashlight = true; this.sprinting = false; this.crouching = false;
    this.noise = 0;            // 서버 전용: 발소리가 들리는 반경
    this.voiceUntil = 0;       // 서버 전용: 감정 표현(목소리)이 들리는 시각까지
    this.alarmUntil = 0;       // 서버 전용: 퍼즐 오답 경보가 울리는 시각까지
    this.sanity = 100;         // 정신력 (서버가 계산, 스냅샷으로 전달)
    this.inv = [null, null, null, null];   // 서버 전용: 인벤토리 (칸 번호 고정, 빈칸 null) [{ type, uses } | null]
    this.status = status;
    this.hidden = false;       // 사물함 안에 숨어 있음
    this.lockerId = -1;
    this.vc = 0;               // 보이스 챗: 0 = 안 씀, 1 = 마이크 켜짐, 2 = 마이크 꺼짐 (이름표 옆 아이콘)
    this.held = -1;            // 손에 든 가방 칸 (클라이언트가 보냄). 다른 사람에겐 그 칸의 아이템 종류(hold)로 보인다
    this.nvUntil = 0;          // 서버 전용: 야간 투시경을 쓰고 있는 시각까지 (얼굴에 투시경이 보인다)
  }

  get alive() { return this.status === 'alive'; }

  /** 전체 정보 (접속/라운드 시작 시) */
  serialize() {
    return { ...this.serializeSnapshot(), name: this.name, color: this.color };
  }

  /** 주기적 스냅샷용 최소 정보 */
  serializeSnapshot() {
    return {
      id: this.id,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      angle: Math.round(this.angle * 1000) / 1000,
      flashlight: this.flashlight,
      sprinting: this.sprinting,
      crouching: this.crouching,
      status: this.status,
      hidden: this.hidden,
      lockerId: this.lockerId,
      sanity: Math.round(this.sanity),
      vc: this.vc,
      hold: (this.held >= 0 && this.inv?.[this.held]?.type) || null,   // 손에 든 아이템 종류
      nv: this.nvUntil > Date.now() ? 1 : 0,                            // 야간 투시경 착용 중
    };
  }

  /** 클라이언트 → 서버 입력 (status 는 서버 권한이라 보내지 않음) */
  serializeInput() {
    return {
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      angle: Math.round(this.angle * 1000) / 1000,
      flashlight: this.flashlight,
      sprinting: this.sprinting,
      crouching: this.crouching,
      held: this.held,
    };
  }

  /** 서버에서 검증된 입력 적용 */
  applyInput(s) {
    this.x = s.x; this.y = s.y; this.angle = s.angle;
    this.flashlight = !!s.flashlight; this.sprinting = !!s.sprinting && !s.crouching; this.crouching = !!s.crouching;
    this.held = Number.isInteger(s.held) && s.held >= 0 && s.held < 4 ? s.held : -1;
  }
}
