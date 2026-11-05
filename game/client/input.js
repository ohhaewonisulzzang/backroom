/** 키보드/마우스 상태. onPress 로 단발 입력 핸들러를 등록한다. */
export const Input = {
  keys: new Set(),
  mouse: { x: 0, y: 0 },
  handlers: new Map(),
  /**
   * 터치(휴대폰/태블릿) 조작 상태. React 의 TouchControls 가 채운다.
   *  move  : 왼쪽 스틱 방향 (-1~1)       sprint : 스틱을 끝까지 밀면 달리기
   *  aim   : 오른쪽 스틱으로 비추는 방향(라디안), 손을 떼면 null → 이동 방향을 따라간다
   *  crouch: 웅크리기 토글
   */
  touch: { active: false, move: { x: 0, y: 0 }, aim: null, sprint: false, crouch: false },

  listeners: [],

  init() {
    const on = (type, fn) => { addEventListener(type, fn); this.listeners.push([type, fn]); };
    on('keydown', e => {
      if (e.target instanceof HTMLInputElement) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.handlers.get(e.code)?.forEach(fn => fn());
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
    this.keys.clear();
  },

  /** 화면 버튼이 키를 누른 것처럼 단발 입력을 보낸다 */
  press(code) { this.handlers.get(code)?.forEach(fn => fn()); },

  resetTouch() {
    const t = this.touch;
    t.move.x = t.move.y = 0; t.aim = null; t.sprint = false;
  },

  onPress(code, fn) {
    if (!this.handlers.has(code)) this.handlers.set(code, []);
    this.handlers.get(code).push(fn);
  },

  down(...codes) { return codes.some(c => this.keys.has(c)); },
};
