import { mulberry32 } from './utils.js';

/**
 * 퍼즐 단말기 (Level 1 부터). 열쇠 몇 개가 퍼즐 단말기 안에 잠겨 있고, 풀어야 열쇠를 얻는다.
 * 서버와 클라이언트가 같은 seed 로 같은 퍼즐을 만들고, 정답 판정(checkPuzzle)은 서버가 한다.
 *
 *  oneStroke : 한붓 그리기 — 모든 선을 한 번씩만 지나도록 점을 이어 그린다     answer = [점 번호...]
 *  lightsOut : 전등 끄기   — 누르면 자기와 상하좌우가 뒤집힌다. 전부 끄기       answer = [누른 칸...]
 *  sequence  : 숫자 퀴즈   — 규칙을 찾아 ? 에 들어갈 수를 맞힌다                answer = 숫자
 *  memory    : 기억력      — 깜빡인 순서대로 패드를 누른다                     answer = [패드 번호...]
 *  slide     : 슬라이드    — 숫자 타일을 1~8 순서로 맞춘다                     answer = [움직인 타일 칸...]
 *  arcade    : 파티 팝     — (Level Fun 게임기) 좌우로 오가는 풍선이 다트 구역에 왔을 때 눌러 3번 터뜨린다
 *                            answer = [단계별로 누른 시각(초, 그 단계 시작부터)...]
 */
export const PUZZLE_TYPES = ['oneStroke', 'lightsOut', 'sequence', 'memory', 'slide', 'arcade'];
export const PUZZLE_NAMES = {
  oneStroke: '한붓 그리기', lightsOut: '전등 끄기', sequence: '숫자 퀴즈', memory: '기억력', slide: '슬라이드 퍼즐', arcade: '파티 팝',
};
export const PUZZLE_HINTS = {
  oneStroke: '모든 선을 딱 한 번씩만 지나가도록 한 번에 이어라. 점을 누르고 이웃 점으로 끌거나 차례로 눌러라.',
  lightsOut: '칸을 누르면 그 칸과 상하좌우가 뒤집힌다. 불을 전부 꺼라.',
  sequence: '규칙을 찾아 ? 에 들어갈 수를 입력하라. 틀리면 경보가 울린다.',
  memory: '불이 켜지는 순서를 기억했다가 그대로 눌러라. 틀려도 다시 보여 준다 (대신 경보가 울린다).',
  slide: '빈칸 옆 타일을 눌러 밀어서 1~8 순서로 맞춰라.',
  arcade: '풍선이 다트 구역(초록)에 들어왔을 때 클릭(또는 Space)! 3번 터뜨리면 클리어. 빗나가면 경보가 울린다.',
};

const edgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// ------------------------------------------------------------------ 한붓 그리기
function genOneStroke(rng, diff) {
  const cols = diff >= 2 ? 5 : 4, rows = diff >= 1 ? 4 : 3;
  const diag = diff >= 1;
  const target = [7, 10, 13, 16][diff];
  const id = (x, y) => y * cols + x;
  const nbrs = n => {
    const x = n % cols, y = (n / cols) | 0, out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (dx && dy && !diag) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push(id(nx, ny));
    }
    return out;
  };
  // 대각선 두 개가 한 칸 안에서 엇갈리면(X자) 점이 없는 교차가 생겨 헷갈리므로 막는다
  const crosses = (a, b, used) => {
    const ax = a % cols, ay = (a / cols) | 0, bx = b % cols, by = (b / cols) | 0;
    if (ax === bx || ay === by) return false;
    return used.has(edgeKey(id(ax, by), id(bx, ay)));
  };
  let best = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    let cur = Math.floor(rng() * cols * rows);
    const used = new Set(), path = [cur];
    while (used.size < target) {
      const opts = nbrs(cur).filter(n => !used.has(edgeKey(cur, n)) && !crosses(cur, n, used));
      if (!opts.length) break;
      const n = opts[Math.floor(rng() * opts.length)];
      used.add(edgeKey(cur, n)); path.push(n); cur = n;
    }
    if (!best || used.size > best.used.size) best = { used, path };
    if (used.size >= target) break;
  }
  const edges = [...best.used].map(k => k.split('-').map(Number));
  return { type: 'oneStroke', cols, rows, edges };
}
function checkOneStroke(p, ans) {
  if (!Array.isArray(ans) || ans.length !== p.edges.length + 1) return false;
  const all = new Set(p.edges.map(([a, b]) => edgeKey(a, b))), used = new Set();
  for (let i = 1; i < ans.length; i++) {
    const k = edgeKey(ans[i - 1] | 0, ans[i] | 0);
    if (!all.has(k) || used.has(k)) return false;
    used.add(k);
  }
  return used.size === all.size;
}

// ------------------------------------------------------------------ 전등 끄기
export function lightsToggle(cells, n, i) {
  const x = i % n, y = (i / n) | 0;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < n && ny < n) cells[ny * n + nx] ^= 1;
  }
}
function genLightsOut(rng, diff) {
  const n = diff >= 2 ? 4 : 3, presses = [3, 4, 5, 6][diff];
  for (;;) {
    const cells = new Array(n * n).fill(0), picked = new Set();
    while (picked.size < presses) picked.add(Math.floor(rng() * n * n));
    for (const i of picked) lightsToggle(cells, n, i);
    if (cells.some(Boolean)) return { type: 'lightsOut', n, cells };
  }
}
function checkLightsOut(p, ans) {
  if (!Array.isArray(ans) || ans.length > 400) return false;
  const cells = [...p.cells];
  for (const i of ans) { if (!Number.isInteger(i) || i < 0 || i >= cells.length) return false; lightsToggle(cells, p.n, i); }
  return cells.every(c => !c);
}

// ------------------------------------------------------------------ 숫자 퀴즈
const SEQ_RULES = [
  // [최소 난이도, 만들기(rng) → 수열 6개]
  [0, r => { const a = 1 + Math.floor(r() * 9), d = 2 + Math.floor(r() * 8); return [0, 1, 2, 3, 4, 5].map(i => a + d * i); }],          // 등차
  [0, r => { const a = 1 + Math.floor(r() * 4), q = 2 + Math.floor(r() * 2); return [0, 1, 2, 3, 4, 5].map(i => a * q ** i); }],       // 등비
  [0, r => { const a = 1 + Math.floor(r() * 4); return [0, 1, 2, 3, 4, 5].map(i => (a + i) ** 2); }],                                 // 제곱수
  [1, r => { const s = [1 + Math.floor(r() * 3), 2 + Math.floor(r() * 3)]; while (s.length < 6) s.push(s.at(-1) + s.at(-2)); return s; }],  // 피보나치
  [1, r => { const a = 2 + Math.floor(r() * 9), s = [a]; for (let i = 1; i < 6; i++) s.push(s.at(-1) + i * (1 + Math.floor(a % 2))); return s; }],  // 차이가 커짐
  [1, r => { const a = 10 + Math.floor(r() * 20), u = 3 + Math.floor(r() * 5), d = 1 + Math.floor(r() * 2); const s = [a]; for (let i = 1; i < 6; i++) s.push(s.at(-1) + (i % 2 ? u : -d)); return s; }],  // 올라갔다 내려갔다
  [2, r => { const k = Math.floor(r() * 3); const P = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]; return P.slice(k, k + 6); }],                // 소수
  [2, r => { const a = 1 + Math.floor(r() * 3); const s = [a]; for (let i = 1; i < 6; i++) s.push(s.at(-1) * 2 + 1); return s; }],        // ×2 +1
  [3, r => { const a = 1 + Math.floor(r() * 2); return [0, 1, 2, 3, 4, 5].map(i => (a + i) ** 3); }],                                // 세제곱
  [3, r => { const a = 2 + Math.floor(r() * 3); const s = [a]; for (let i = 1; i < 6; i++) s.push(s.at(-1) * (i % 2 ? 2 : 1) + (i % 2 ? 0 : 3)); return s; }],  // ×2, +3 번갈아
];
function genSequence(rng, diff) {
  const pool = SEQ_RULES.filter(([d]) => d <= diff && d >= diff - 2);
  const seq = pool[Math.floor(rng() * pool.length)][1](rng);
  const shown = 5;
  return { type: 'sequence', shown: seq.slice(0, shown), answerHash: hash(seq[shown]) };
}
// 정답을 그대로 담지 않는다 (클라이언트가 단말기를 열어 보는 것만으로는 답이 노출되지 않게)
function hash(n) { let h = 2166136261; for (const c of String(n)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function checkSequence(p, ans) {
  const n = Number(String(ans ?? '').trim());
  return String(ans ?? '').trim() !== '' && Number.isInteger(n) && hash(n) === p.answerHash;
}

// ------------------------------------------------------------------ 기억력
function genMemory(rng, diff) {
  // 쉽게: 순서는 3~5개, 낮은 레벨은 패드 4개(2x2), 높은 레벨도 6개까지만
  const len = [3, 3, 4, 5][diff], pads = diff >= 2 ? 6 : 4, seq = [];
  while (seq.length < len) {
    const n = Math.floor(rng() * pads);
    if (n !== seq.at(-1)) seq.push(n);
  }
  return { type: 'memory', pads, seq };
}
function checkMemory(p, ans) {
  return Array.isArray(ans) && ans.length === p.seq.length && ans.every((v, i) => v === p.seq[i]);
}

// ------------------------------------------------------------------ 슬라이드 퍼즐 (3x3)
export function slideMove(tiles, i) {
  const n = 3, e = tiles.indexOf(0);
  const adj = Math.abs((i % n) - (e % n)) + Math.abs(((i / n) | 0) - ((e / n) | 0)) === 1;
  if (!adj) return false;
  tiles[e] = tiles[i]; tiles[i] = 0;
  return true;
}
const SOLVED = [1, 2, 3, 4, 5, 6, 7, 8, 0];
function genSlide(rng, diff) {
  const moves = [14, 20, 28, 36][diff];
  for (;;) {
    const tiles = [...SOLVED];
    let prev = -1;
    for (let k = 0; k < moves; k++) {
      const e = tiles.indexOf(0);
      const opts = [e - 3, e + 3, e % 3 ? e - 1 : -1, e % 3 < 2 ? e + 1 : -1].filter(i => i >= 0 && i < 9 && i !== prev);
      const i = opts[Math.floor(rng() * opts.length)];
      slideMove(tiles, i); prev = e;
    }
    if (tiles.some((t, i) => t !== SOLVED[i])) return { type: 'slide', tiles };
  }
}
function checkSlide(p, ans) {
  if (!Array.isArray(ans) || ans.length > 600) return false;
  const t = [...p.tiles];
  for (const i of ans) { if (!Number.isInteger(i) || i < 0 || i > 8 || !slideMove(t, i)) return false; }
  return t.every((v, i) => v === SOLVED[i]);
}

// ------------------------------------------------------------------ 파티 팝 (아케이드)
/** 풍선 위치 (0~1 왕복). 단계 st 를 시작하고 t 초 뒤 */
export function arcadePos(st, t) {
  const u = (((st.phase + t * st.speed) % 2) + 2) % 2;
  return 1 - Math.abs(u - 1);
}
function genArcade(rng, diff) {
  const stages = [];
  for (let k = 0; k < 3; k++) {
    stages.push({
      c: 0.2 + rng() * 0.6,                               // 다트 구역 가운데
      hw: Math.max(0.05, 0.11 - diff * 0.012 - k * 0.012), // 구역 반폭 (단계마다 좁아짐)
      speed: (0.55 + diff * 0.1) * (1 + k * 0.35),         // 초당 왕복 거리 (단계마다 빨라짐)
      phase: rng() * 2,
    });
  }
  return { type: 'arcade', stages };
}
function checkArcade(p, ans) {
  if (!Array.isArray(ans) || ans.length !== p.stages.length) return false;
  return ans.every((t, k) => Number.isFinite(t) && t >= 0 && t < 60 && Math.abs(arcadePos(p.stages[k], t) - p.stages[k].c) <= p.stages[k].hw + 0.02);
}

// ------------------------------------------------------------------
const GEN = { oneStroke: genOneStroke, lightsOut: genLightsOut, sequence: genSequence, memory: genMemory, slide: genSlide, arcade: genArcade };
const CHECK = { oneStroke: checkOneStroke, lightsOut: checkLightsOut, sequence: checkSequence, memory: checkMemory, slide: checkSlide, arcade: checkArcade };

/** 같은 (type, seed, diff) → 같은 퍼즐. diff 0~3 */
export function generatePuzzle(type, seed, diff = 0) {
  const d = Math.max(0, Math.min(3, diff | 0));
  return GEN[type](mulberry32(seed >>> 0), d);
}

export function checkPuzzle(puzzle, answer) {
  try { return !!CHECK[puzzle.type]?.(puzzle, answer); } catch { return false; }
}
