/**
 * 키보드/마우스 상태.
 *  - 동작(action) 단위로 키를 묶는다. 키 설정에서 바꾼 값은 localStorage('backrooms.keys') 에 저장된다.
 *  - onAction(name, fn): 그 동작의 키를 눌렀을 때 / held(name): 누르고 있는가
 *  - onPress(code, fn): 바꿀 수 없는 고정 키 (ESC, ` 테스트 패널, 감정 표현 숫자)
 */
export const ACTIONS = [
  ['up', '위로 이동', 'KeyW'], ['down', '아래로 이동', 'KeyS'], ['left', '왼쪽으로 이동', 'KeyA'], ['right', '오른쪽으로 이동', 'KeyD'],
  ['sprint', '달리기', 'ShiftLeft'], ['crouch', '웅크리기', 'KeyC'], ['flashlight', '손전등', 'KeyF'], ['interact', '상호작용', 'KeyE'],
  ['slot1', '아이템 1', 'Digit1'], ['slot2', '아이템 2', 'Digit2'], ['slot3', '아이템 3', 'Digit3'], ['slot4', '아이템 4', 'Digit4'],
  ['drop', '버리기 (+아이템 키)', 'KeyG'], ['emote', '감정 표현', 'Comma'], ['chat', '채팅', 'Enter'], ['mic', '마이크', 'KeyM'],
  ['skip', '관전 / 건너뛰기(길게)', 'Space'],
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
  if (!code) return '없음';
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
  touch: { active: false, move: { x: 0, y: 0 }, aim: null, sprint: false, crouch: false },

  listeners: [],

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
    on('blur', () => { this.keys.clear(); this.resetTouch(); });
    // 마우스를 실제로 움직이면 마우스 조준으로 돌아온다 (터치가 흉내 내는 mousemove 는 무시)
    on('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.touch.active = false;
    });
  },

  dispose() {
    for (const [type, fn] of this.listeners) removeEventListener(type, fn);
    this.listeners = [];
    this.handlers.clear();
    this.actionHandlers.clear();
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
    t.move.x = t.move.y = 0; t.aim = null; t.sprint = false;
  },

  onPress(code, fn) {
    if (!this.handlers.has(code)) this.handlers.set(code, []);
    this.handlers.get(code).push(fn);
  },
  onAction(a, fn) {
    if (!this.actionHandlers.has(a)) this.actionHandlers.set(a, []);
    this.actionHandlers.get(a).push(fn);
  },

  down(...codes) { return codes.some(c => this.keys.has(c)); },
  /** 동작 키를 누르고 있는가 */
  held(a) { return this.keys.has(this.binds[a]) || (EXTRA[a] || []).some(c => this.keys.has(c)); },
};
