/** 키보드/마우스 상태. onPress 로 단발 입력 핸들러를 등록한다. */
export const Input = {
  keys: new Set(),
  mouse: { x: 0, y: 0 },
  handlers: new Map(),

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
    on('blur', () => this.keys.clear());
    on('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
  },

  dispose() {
    for (const [type, fn] of this.listeners) removeEventListener(type, fn);
    this.listeners = [];
    this.handlers.clear();
    this.keys.clear();
  },

  onPress(code, fn) {
    if (!this.handlers.has(code)) this.handlers.set(code, []);
    this.handlers.get(code).push(fn);
  },

  down(...codes) { return codes.some(c => this.keys.has(c)); },
};
