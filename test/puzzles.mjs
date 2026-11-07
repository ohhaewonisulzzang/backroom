// 퍼즐 생성기가 항상 "풀 수 있는" 퍼즐을 만드는지, 판정기가 정답/오답을 제대로 가르는지 검사한다.
//   node test/puzzles.mjs
import { generatePuzzle, checkPuzzle, lightsToggle, slideMove, arcadePos, PUZZLE_TYPES } from '../shared/puzzles.js';
import { generateLevel } from '../shared/map.js';
import { LEVELS, missionOf } from '../shared/config.js';

let failed = 0;
const check = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failed++; };

/** 각 퍼즐의 정답을 직접 찾아낸다 (작은 퍼즐이라 완전 탐색으로 충분) */
export function solve(p) {
  switch (p.type) {
    case 'oneStroke': {
      const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
      const nodes = [...new Set(p.edges.flat())];
      const dfs = (path, used) => {
        if (used.size === p.edges.length) return path;
        const last = path[path.length - 1];
        for (const [a, b] of p.edges) {
          const n = a === last ? b : b === last ? a : -1;
          if (n < 0 || used.has(key(a, b))) continue;
          used.add(key(a, b));
          const r = dfs([...path, n], used);
          if (r) return r;
          used.delete(key(a, b));
        }
        return null;
      };
      for (const s of nodes) { const r = dfs([s], new Set()); if (r) return r; }
      return null;
    }
    case 'lightsOut': {
      const N = p.n * p.n;
      for (let m = 0; m < 1 << N; m++) {
        const c = [...p.cells], presses = [];
        for (let i = 0; i < N; i++) if (m & (1 << i)) { lightsToggle(c, p.n, i); presses.push(i); }
        if (c.every(v => !v)) return presses;
      }
      return null;
    }
    case 'sequence':
      for (let n = -1000; n < 100000; n++) if (checkPuzzle(p, n)) return n;
      return null;
    case 'memory': return p.seq;
    case 'arcade':   // 단계마다 풍선이 구역 한가운데 근처에 오는 첫 순간
      return p.stages.map(st => { for (let t = 0; t < 30; t += 0.001) if (Math.abs(arcadePos(st, t) - st.c) < st.hw * 0.5) return t; return -1; });
    case 'slide': {
      // BFS (타일 배열 → 빈칸 옆 타일 위치를 누르는 이동)
      const start = p.tiles.join(''), goal = '123456780', prev = new Map([[start, null]]), q = [start];
      while (q.length) {
        const s = q.shift();
        if (s === goal) break;
        const t = s.split('').map(Number), e = t.indexOf(0);
        for (const i of [e - 3, e + 3, e % 3 ? e - 1 : -1, e % 3 < 2 ? e + 1 : -1]) {
          if (i < 0 || i > 8) continue;
          const u = [...t]; slideMove(u, i); const k = u.join('');
          if (!prev.has(k)) { prev.set(k, [s, i]); q.push(k); }
        }
      }
      if (!prev.has(goal)) return null;
      const moves = [];
      for (let k = goal; prev.get(k); k = prev.get(k)[0]) moves.unshift(prev.get(k)[1]);
      return moves;
    }
  }
  return null;
}

const wrongOf = (p, ans) => {
  if (p.type === 'sequence') return Number(ans) + 1;
  if (p.type === 'memory') return [...ans.slice(0, -1), (ans[ans.length - 1] + 1) % 9];
  if (p.type === 'oneStroke') return ans.slice(0, -1);
  return ans.slice(0, -1).length ? ans.slice(0, -1) : [0];
};

for (const type of PUZZLE_TYPES) {
  let ok = 0, rejected = 0, total = 0, sizes = [];
  for (let diff = 0; diff <= 3; diff++) {
    for (let seed = 1; seed <= (type === 'slide' ? 8 : 40); seed++) {
      const p = generatePuzzle(type, seed * 7919 + diff, diff);
      const ans = solve(p);
      total++;
      if (ans && checkPuzzle(p, ans)) ok++;
      if (ans && !checkPuzzle(p, wrongOf(p, ans))) rejected++;
      if (type === 'oneStroke' && seed === 1) sizes.push(p.edges.length);
    }
  }
  check(ok === total, `${type}: ${ok}/${total} 개 모두 풀 수 있음`);
  check(rejected === total, `${type}: 오답 ${rejected}/${total} 개 모두 거부`);
  if (sizes.length) console.log(`      한붓 그리기 선 개수 (난이도 0~3): ${sizes.join(', ')}`);
}
check(!checkPuzzle(generatePuzzle('sequence', 5, 0), '') && !checkPuzzle({ type: 'nope' }, 1), '빈 답 / 알 수 없는 퍼즐 → 거부');

// 레벨별 단말기 수 = LEVELS[].puzzles 길이, 서버/클라이언트 재생성 일치
for (let lv = 0; lv < LEVELS.length; lv++) {
  const a = generateLevel(424242, lv), b = generateLevel(424242, lv);
  const n = a.keys.filter(k => k.puzzle).length;
  const same = JSON.stringify(a.keys.map(k => k.puzzle)) === JSON.stringify(b.keys.map(k => k.puzzle));
  const M = missionOf(lv), got = { keys: a.keys.length, deliver: a.parts.length, activate: a.stations.length }[M.type];
  const reach = [...a.keys, ...a.parts, ...a.stations, ...(a.depot ? [a.depot] : [])].every(o => a.dist[o.ty * a.map.w + o.tx] >= 0);
  if (got !== undefined) check(got === M.count && reach && (M.type !== 'deliver' || !!a.depot), `LEVEL ${LEVELS[lv].label ?? lv}: 미션 ${M.kind || M.type} ${got}/${M.count} 배치, 모두 걸어서 갈 수 있음`);
  check(n === (LEVELS[lv].puzzles?.length ?? 0) && same, `LEVEL ${LEVELS[lv].label ?? lv}: 퍼즐 단말기 ${n}개 (${a.keys.filter(k => k.puzzle).map(k => k.puzzle.type).join(', ') || '없음'})`);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exitCode = failed ? 1 : 0;
