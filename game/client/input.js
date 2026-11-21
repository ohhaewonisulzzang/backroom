/**
 * 키보드/마우스 상태.
 *  - 동작(action) 단위로 키를 묶는다. 키 설정에서 바꾼 값은 localStorage('backrooms.keys') 에 저장된다.
 *  - onAction(name, fn): 그 동작의 키를 눌렀을 때 / held(name): 누르고 있는가
 *  - onPress(code, fn): 바꿀 수 없는 고정 키 (ESC, ` 테스트 패널, 감정 표현 숫자)
 */
import { t as tr } from '../../shared/i18n.js';

export const ACTIONS = [
  ['up', '위로 이동', 'KeyW'], ['down', '아래로 이동', 'KeyS'], ['left', '왼쪽으로 이동', 'KeyA'], ['right', '오른쪽으로 이동', 'KeyD'],
  ['sprint', '달리기', 'ShiftLeft'], ['crouch', '웅크리기', 'KeyC'], ['flashlight', '손전등', 'KeyF'], ['interact', '상호작용', 'KeyE'],
  ['slot1', '아이템 1', 'Digit1'], ['slot2', '아이템 2', 'Digit2'], ['slot3', '아이템 3', 'Digit3'], ['slot4', '아이템 4', 'Digit4'],
  ['drop', '버리기 (손에 든 아이템)', 'KeyG'], ['emote', '감정 표현', 'Comma'], ['chat', '채팅', 'Enter'], ['mic', '마이크', 'KeyM'],
  ['skip', '관전 / 건너뛰기(길게)', 'Space'],
  ['cursor', '마우스 커서 풀기 / 잠그기 (3D)', 'KeyN'],
];
export const DEFAULT_BINDS = Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k]));
/** 바꿀 수 없는 보조 키 (방향키 이동, 오른쪽 Shift) */
const EXTRA = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], sprint: ['ShiftRight'] };
/** 키 설정에서 쓸 수 없는 키 */
export const RESERVED = ['Escape', 'Backquote', 'Tab', 'MetaLeft', 'MetaRight'];

const KEY_STORE = 'backrooms.keys';
export function loadBinds() {
  try { return { ...DEFAULT_BINDS, ...JSON.parse(localStorage.getItem(KEY_STORE) || '{}') }; } catch { return { ...DEFAULT_BINDS }; }
}
export function saveBinds(b) { try { localStorage.setItem(KEY_STORE, JSON.stringify(b)); } catch { /* 저장 불가 */ } }

/** 'KeyW' → 'W', 'ShiftLeft' → 'SHIFT' ... */
export function keyLabel(code) {
  if (!code) return tr('없음');
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  const M = { ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'CTRL', ControlRight: 'R-CTRL', AltLeft: 'ALT', AltRight: 'R-ALT',
    Space: 'SPACE', Enter: 'ENTER', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Minus: '-', Equal: '=', CapsLock: 'CAPS', Backspace: 'BACKSPACE', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return M[code] || code;
}

export const Input = {
  keys: new Set(),
  mouse: { x: 0, y: 0 },
  handlers: new Map(),          // 고정 키 code → [fn]
  actionHandlers: new Map(),    // 동작 → [fn]
  binds: { ...DEFAULT_BINDS },
  /** 키 설정 화면이 키를 기다리는 중이면 게임 입력을 막는다 */
  capturing: false,
  /**
   * 터치(휴대폰/태블릿) 조작 상태. React 의 TouchControls 가 채운다.
   *  move  : 왼쪽 스틱 방향 (-1~1)       sprint : 스틱을 끝까지 밀면 달리기
   *  aim   : 오른쪽 스틱으로 비추는 방향(라디안), 손을 떼면 null → 이동 방향을 따라간다
   *  crouch: 웅크리기 토글
   */
  touch: { active: false, move: { x: 0, y: 0 }, aim: null, look: { x: 0, y: 0 }, sprint: false, crouch: false },
  /** 1인칭(3D): 포인터 잠금 중 마우스 이동량 누적 (엔진이 프레임마다 읽고 비운다) */
  look: { dx: 0, dy: 0 },
  locked: false, lockEl: null, lockLostHandlers: [], unlocking: false,

  listeners: [],
  mouseDown: false, mouseDownHandlers: [], mouseUpHandlers: [],

  init() {
    this.binds = loadBinds();
    const on = (type, fn) => { addEventListener(type, fn); this.listeners.push([type, fn]); };
    on('keydown', e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (this.capturing) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.handlers.get(e.code)?.forEach(fn => fn());
        for (const a of this.actionsOf(e.code)) this.actionHandlers.get(a)?.forEach(fn => fn());
      }
      this.keys.add(e.code);
    });
    on('keyup', e => this.keys.delete(e.code));
    // 우클릭 메뉴(브라우저의 뒤로/새로고침/검사 등)를 띄우지 않는다. 글 입력칸에서는 그대로 둔다 (붙여넣기 등)
    on('contextmenu', e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
    });
    on('blur', () => { this.keys.clear(); this.resetTouch(); if (this.mouseDown) { this.mouseDown = false; this.mouseUpHandlers.forEach(fn => fn()); } });
    // 마우스 왼쪽 버튼 = 손에 든 아이템 사용 (게임 화면(캔버스)을 눌렀을 때만, 메뉴·패널 클릭은 무시)
    on('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return;
      this.mouseDown = true;
      this.mouseDownHandlers.forEach(fn => fn());
    });
    on('pointerup', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !this.mouseDown) return;
      this.mouseDown = false;
      this.mouseUpHandlers.forEach(fn => fn());
    });
    // 마우스를 실제로 움직이면 마우스 조준으로 돌아온다 (터치가 흉내 내는 mousemove 는 무시)
    on('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      if (this.locked) { this.addLook(e.movementX || 0, e.movementY || 0); this.touch.active = false; return; }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.touch.active = false;
    });
  },

  /**
   * 포인터 잠금 중 마우스 이동량 더하기. 크롬(특히 윈도우)은 가끔 이벤트 하나에 수백 px 짜리 엉뚱한 값을 준다
   * (잠금 직후, 창 가장자리, 일부 마우스 드라이버) → 시점이 휙 "순간이동" 한다.
   * 최근 평균 이동량보다 터무니없이 크고 절대값도 큰 이벤트 하나는 버린다. 진짜 빠른 휙 돌리기는 여러 이벤트로 나뉘어 오므로 평균이 같이 커져서 통과한다
   */
  addLook(dx, dy) {
    const m = Math.hypot(dx, dy), avg = this.lookAvg || 0;
    if (m > 120 && m > avg * 8 + 40) { this.lookSpikes = (this.lookSpikes || 0) + 1; this.lookAvg = avg * 0.9 + m * 0.02; return; }
    this.lookAvg = avg * 0.85 + m * 0.15;
    this.look.dx += dx; this.look.dy += dy;
  },

  /**
   * 포인터 잠금 (1인칭 시점). 브라우저는 잠금을 푸는 첫 ESC 를 keydown 으로 주지 않으므로,
   * 사용자 동작(ESC·포커스 잃음)으로 풀리면 onLockLost 핸들러를 부른다 (엔진이 일시정지 메뉴를 연다).
   */
  lockPointer(el) {
    if (this.locked || !el?.requestPointerLock) return;
    if (!this.lockEl) {
      document.addEventListener('pointerlockchange', this.onLockChange = () => {
        const now = document.pointerLockElement === this.lockEl;
        if (this.locked && !now && !this.unlocking) { this.lockLostAt = performance.now(); this.lockLostHandlers.forEach(fn => fn()); }
        this.locked = now; this.unlocking = false;
        this.look.dx = this.look.dy = 0; this.lookAvg = 0;
      });
    }
    this.lockEl = el;
    // unadjustedMovement: OS 마우스 가속을 거치지 않은 원시 이동량 (크롬·엣지). 지원 안 하면 보통 잠금으로 다시
    const plain = () => { try { const r = el.requestPointerLock(); r?.catch?.(() => {}); } catch { /* 잠금 불가 (iframe 등) */ } };
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r?.catch) r.catch(e => { if (e?.name === 'NotSupportedError') plain(); });
    } catch { plain(); }
  },
  unlockPointer() {
    if (!this.locked) return;
    this.unlocking = true;
    document.exitPointerLock?.();
  },
  onLockLost(fn) { this.lockLostHandlers.push(fn); },

  dispose() {
    if (this.onLockChange) document.removeEventListener('pointerlockchange', this.onLockChange);
    this.lockEl = null; this.lockLostHandlers = [];
    for (const [type, fn] of this.listeners) removeEventListener(type, fn);
    this.listeners = [];
    this.handlers.clear();
    this.actionHandlers.clear();
    this.mouseDownHandlers = []; this.mouseUpHandlers = []; this.mouseDown = false;
    this.keys.clear();
  },

  /** 이 키에 묶인 동작들 */
  actionsOf(code) {
    const out = [];
    for (const [a, k] of Object.entries(this.binds)) if (k === code || EXTRA[a]?.includes(code)) out.push(a);
    return out;
  },
  /** 키 설정 적용 (저장까지) */
  setBinds(b) { this.binds = { ...DEFAULT_BINDS, ...b }; saveBinds(this.binds); this.keys.clear(); },

  /** 화면 버튼이 키를 누른 것처럼 단발 입력을 보낸다 */
  press(code) { this.handlers.get(code)?.forEach(fn => fn()); },
  pressAction(a) { this.actionHandlers.get(a)?.forEach(fn => fn()); },

  resetTouch() {
    const t = this.touch;
    t.move.x = t.move.y = 0; t.aim = null; t.look.x = t.look.y = 0; t.sprint = false;
  },

  onPress(code, fn) {
    if (!this.handlers.has(code)) this.handlers.set(code, []);
    this.handlers.get(code).push(fn);
  },
  onMouseDown(fn) { this.mouseDownHandlers.push(fn); },
  onMouseUp(fn) { this.mouseUpHandlers.push(fn); },
  onAction(a, fn) {
    if (!this.actionHandlers.has(a)) this.actionHandlers.set(a, []);
    this.actionHandlers.get(a).push(fn);
  },

  down(...codes) { return codes.some(c => this.keys.has(c)); },
  /** 동작 키를 누르고 있는가 */
  held(a) { return this.keys.has(this.binds[a]) || (EXTRA[a] || []).some(c => this.keys.has(c)); },
};
