import { CONFIG, TS, T, levelInfo, missionOf } from './config.js';
import { mulberry32 } from './utils.js';
import { hasLOS } from './physics.js';
import { generatePuzzle } from './puzzles.js';

export class GameMap {
  constructor(w, h, seed, layout = 'maze', puddles = 0, roads = 0) {
    this.w = w; this.h = h;
    this.rng = mulberry32(seed);
    this.tiles = new Uint8Array(w * h).fill(T.WALL);
    if (layout === 'run') this.generateRun();
    else if (layout === 'garage') this.generateGarage();
    else if (layout === 'city') this.generateCity();
    else { this.generate(); if (roads > 0) this.addRoads(roads); if (puddles > 0) this.addPuddles(puddles); }
    this.floorCells = [];
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] !== T.WALL) this.floorCells.push(i);
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.tiles[y * this.w + x] : T.WALL; }
  set(x, y, v) { if (this.inBounds(x, y)) this.tiles[y * this.w + x] = v; }
  isSolid(x, y) { return this.get(x, y) === T.WALL; }

  generate() {
    const { w, h, rng } = this;
    // 1) Recursive backtracker 미로
    const stack = [[1, 1]];
    this.set(1, 1, T.FLOOR);
    const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const opts = dirs.filter(([dx, dy]) => {
        const nx = cx + dx, ny = cy + dy;
        return nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && this.get(nx, ny) === T.WALL;
      });
      if (!opts.length) { stack.pop(); continue; }
      const [dx, dy] = opts[Math.floor(rng() * opts.length)];
      this.set(cx + dx / 2, cy + dy / 2, T.FLOOR);
      this.set(cx + dx, cy + dy, T.FLOOR);
      stack.push([cx + dx, cy + dy]);
    }
    // 2) Braid: 일부 벽 제거 → 순환 통로
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (this.get(x, y) !== T.WALL) continue;
      const hz = this.get(x - 1, y) !== T.WALL && this.get(x + 1, y) !== T.WALL;
      const vt = this.get(x, y - 1) !== T.WALL && this.get(x, y + 1) !== T.WALL;
      if ((hz || vt) && rng() < 0.14) this.set(x, y, T.FLOOR);
    }
    // 3) 넓은 빈 방 + 기둥 (맵 넓이에 비례)
    const area = (w * h) / (41 * 41);
    const rooms = Math.round((6 + Math.floor(rng() * 4)) * area);
    for (let i = 0; i < rooms; i++) {
      const rw = 3 + Math.floor(rng() * 5), rh = 3 + Math.floor(rng() * 5);
      const rx = 1 + Math.floor(rng() * (w - rw - 2)), ry = 1 + Math.floor(rng() * (h - rh - 2));
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) this.set(x, y, T.FLOOR);
      if (rw >= 5 && rh >= 5 && rng() < 0.65) {
        for (let y = ry + 1; y < ry + rh - 1; y += 2) for (let x = rx + 1; x < rx + rw - 1; x += 2) this.set(x, y, T.WALL);
      }
    }
  }

  /**
   * 지하 주차장: 넓게 트인 바닥 + 일정 간격 기둥(2x1) + 군데군데 낮은 벽(주차 칸 칸막이) + 큰 벽 몇 개.
   * 바닥이 모두 이어져 있도록 칸막이는 짧게만 세운다.
   */
  generateGarage() {
    const { w, h, rng } = this;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) this.set(x, y, T.FLOOR);
    for (let y = 4; y < h - 3; y += 5) for (let x = 4; x < w - 3; x += 6) {   // 기둥
      this.set(x, y, T.WALL); this.set(x + 1, y, T.WALL);
      if (rng() < 0.35) for (let k = 2; k < 4; k++) this.set(x + k, y, T.WALL);   // 기둥 사이 칸막이
    }
    for (let n = 0; n < 14; n++) {                     // 긴 벽 (경사로 벽 / 기계실)
      const vert = rng() < 0.5, len = 5 + Math.floor(rng() * 8);
      const x0 = 3 + Math.floor(rng() * (w - 6 - (vert ? 0 : len))), y0 = 3 + Math.floor(rng() * (h - 6 - (vert ? len : 0)));
      if (x0 + y0 < 12) continue;
      for (let k = 0; k < len; k++) this.set(vert ? x0 : x0 + k, vert ? y0 + k : y0, T.WALL);
    }
    // 막힌 곳이 있으면 시작점에서 못 가는 바닥을 벽으로 메운다
    const d = this.bfs(1, 1);
    for (let i = 0; i < w * h; i++) if (this.tiles[i] !== T.WALL && d[i] < 0) this.tiles[i] = T.WALL;
  }

  /**
   * 끝없는 도시 (세로로 긴 맵): 가운데 3칸 대로 + 14줄마다 3칸 가로 도로(넓은 길 = 동네 감시자의 길),
   * 양쪽 1칸 골목(군데군데 막혀 있음) + 골목과 대로를 잇는 좁은 샛길과 작은 가게방. 나머지는 건물(벽).
   * 시작은 맨 아래 왼쪽 골목, 노클립 존(출구)은 시작에서 가장 먼 곳(맨 위쪽).
   */
  generateCity() {
    const { w, h, rng } = this, ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const floor = (x, y) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) this.set(x, y, T.FLOOR); };
    const mid = w >> 1, alleys = [4, w - 5], roadRows = [];
    for (let y = 1; y < h - 1; y++) for (let x = mid - 1; x <= mid + 1; x++) floor(x, y);          // 대로
    for (let c = 10; c < h - 6; c += 14) { roadRows.push(c); for (let y = c; y < c + 3; y++) for (let x = 1; x < w - 1; x++) floor(x, y); }   // 가로 도로
    for (const ax of alleys) for (let y = 1; y < h - 1; y++) floor(ax, y);                          // 골목
    const onRoad = y => roadRows.some(c => y >= c - 1 && y <= c + 3);
    // 블록마다: 골목 ↔ 대로 샛길 1~2개, 골목 막힘, 작은 가게방
    const blocks = [1, ...roadRows.map(c => c + 3)];
    for (let b = 0; b < blocks.length; b++) {
      const y0 = blocks[b], y1 = (roadRows[b] ?? h - 1) - 1;
      if (y1 - y0 < 4) continue;
      for (const ax of alleys) {
        const dir = ax < mid ? 1 : -1;
        for (let n = 0; n < ri(1, 2); n++) {                                  // 샛길 (꺾인 1칸 길)
          const y = ri(y0 + 1, y1 - 1), bend = ri(2, 5);
          let x = ax;
          while (x !== mid - dir) { x += dir; floor(x, y); if (Math.abs(x - ax) === bend) { floor(x, y + 1); } }
        }
        if (rng() < 0.6) {                                                    // 가게방 (3x3, 골목 쪽 문 하나)
          const ry = ri(y0 + 1, Math.max(y0 + 1, y1 - 3)), rx = ax + dir * 2;
          for (let yy = ry; yy < ry + 3; yy++) for (let xx = 0; xx < 3; xx++) floor(rx + dir * xx, yy);
          floor(ax + dir, ry + 1);
        }
        if (rng() < 0.55) { const by = ri(y0 + 1, y1 - 1); if (!onRoad(by) && by < h - 18) this.set(ax, by, T.WALL); }   // 골목 막힘 → 돌아가야 한다
        if (rng() < 0.5) {                                                    // 두 번째 골목 조각
          const sx = ax + dir * ri(6, 8), a = ri(y0, y1 - 3), bb = Math.min(y1, a + ri(3, 7));
          for (let y = a; y <= bb; y++) floor(sx, y);
          floor(sx - dir, a); for (let x = Math.min(ax, sx); x <= Math.max(ax, sx); x++) floor(x, bb);
        }
      }
    }
    this.startX = alleys[0];
    for (let y = h - 4; y < h - 1; y++) floor(this.startX, y);   // 시작 골목 입구는 항상 뚫려 있게
    // 시작점에서 못 가는 바닥은 벽으로
    const d = this.bfs(this.startX, h - 2);
    for (let i = 0; i < w * h; i++) if (this.tiles[i] !== T.WALL && d[i] < 0) this.tiles[i] = T.WALL;
  }

  /** spacing 칸마다 가로/세로 3칸 너비 도로 (넓은 곳만 다니는 엔티티의 길) */
  addRoads(spacing) {
    const { w, h } = this;
    for (let c = spacing; c < h - 2; c += spacing) for (let y = c - 1; y <= c + 1; y++) for (let x = 1; x < w - 1; x++) this.set(x, y, T.FLOOR);
    for (let c = spacing; c < w - 2; c += spacing) for (let x = c - 1; x <= c + 1; x++) for (let y = 1; y < h - 1; y++) this.set(x, y, T.FLOOR);
  }

  /** 물웅덩이(느려짐) 덩어리를 흩뿌린다. 시작 지점 주변은 비워 둔다 */
  addPuddles(ratio) {
    const { w, h, rng } = this, blobs = Math.round(w * h * ratio / 9);
    for (let n = 0; n < blobs; n++) {
      const cx = 2 + Math.floor(rng() * (w - 4)), cy = 2 + Math.floor(rng() * (h - 4)), r = 1 + rng() * 2.2;
      if (cx + cy < 10) continue;
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (Math.hypot(x - cx, y - cy) <= r && this.get(x, y) === T.FLOOR) this.set(x, y, T.SLOW);
      }
    }
  }

  /**
   * Level ! : 왼쪽 → 오른쪽으로 긴 복도 + 장애물.
   *  바리케이드(틈 하나), 상자 더미, 지그재그 벽, 기둥 숲, 웅덩이(느려짐). 출구까지 길이 막히면 다시 만든다.
   */
  generateRun() {
    const { w, h, rng } = this, my = h >> 1;
    const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
    for (let attempt = 0; attempt < 30; attempt++) {
      this.tiles.fill(T.WALL);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) this.set(x, y, T.FLOOR);
      const wall = (x, y) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) this.set(x, y, T.WALL); };
      const slow = (x, y) => { if (this.get(x, y) === T.FLOOR) this.set(x, y, T.SLOW); };
      let x = 14;
      while (x < w - 12) {
        const kind = ['barricade', 'crates', 'crates', 'zigzag', 'pillars', 'puddle'][Math.floor(rng() * 6)];
        let width = 1;
        if (kind === 'barricade') {                // 벽 한 줄 + 틈 하나 (2칸)
          const gy = ri(1, h - 3);
          for (let y = 1; y < h - 1; y++) if (y !== gy && y !== gy + 1) wall(x, y);
        } else if (kind === 'crates') {            // 상자 더미
          width = 4;
          const n = ri(3, 6);
          for (let i = 0; i < n; i++) {
            const bx = x + ri(0, 3), by = ri(1, h - 2);
            wall(bx, by);
            if (rng() < 0.4) wall(bx + 1, by);
            if (rng() < 0.4) wall(bx, by + 1);
          }
        } else if (kind === 'zigzag') {            // 위에서 내려온 벽 → 아래에서 올라온 벽 (S자로 피해야 함)
          width = 5;
          const top = rng() < 0.5;
          for (let y = 1; y < h - 1; y++) {
            if (top ? y < h - 3 : y > 2) wall(x, y);
            if (top ? y > 2 : y < h - 3) wall(x + 4, y);
          }
        } else if (kind === 'pillars') {           // 기둥 숲
          width = 6;
          for (let xx = 0; xx < 6; xx += 2) for (let y = 1 + (xx / 2) % 2 * 1; y < h - 1; y += 3) wall(x + xx, y + 1);
        } else {                                   // 웅덩이 / 잔해 (느려짐) + 상자 몇 개
          width = ri(4, 7);
          const y0 = ri(1, 4), y1 = ri(h - 5, h - 2);
          for (let xx = 0; xx < width; xx++) for (let y = y0; y <= y1; y++) if (rng() < 0.85) slow(x + xx, y);
          if (rng() < 0.6) wall(x + ri(0, width - 1), ri(1, h - 2));
        }
        x += width + ri(4, 7);
      }
      // 출구까지 길이 있는지 확인
      const dist = this.bfs(1, my);
      if (dist[my * w + (w - 2)] >= 0) return;
    }
    // 30번 실패하면 장애물 없이 (사실상 일어나지 않음)
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) this.set(x, y, T.FLOOR);
  }

  /** pass(x, y) 가 주어지면 추가 이동 조건 (예: 스마일러는 어둠 속만) */
  neighbors(c, pass) {
    const { w } = this, cx = c % w, cy = (c / w) | 0, out = [];
    const ok = (x, y) => !this.isSolid(x, y) && (!pass || pass(x, y));
    if (ok(cx + 1, cy)) out.push(c + 1);
    if (ok(cx - 1, cy)) out.push(c - 1);
    if (ok(cx, cy + 1)) out.push(c + w);
    if (ok(cx, cy - 1)) out.push(c - w);
    return out;
  }

  bfs(sx, sy) {
    const n = this.w * this.h, dist = new Int32Array(n).fill(-1), q = new Int32Array(n);
    let head = 0, tail = 0;
    const s = sy * this.w + sx; dist[s] = 0; q[tail++] = s;
    while (head < tail) {
      const c = q[head++];
      for (const nb of this.neighbors(c)) {
        if (dist[nb] !== -1) continue;
        dist[nb] = dist[c] + 1; q[tail++] = nb;
      }
    }
    return dist;
  }

  /** 타일 경로 [{x,y}...] (시작 타일 제외). 없으면 [] */
  findPath(sx, sy, tx, ty, pass) {
    if (this.isSolid(tx, ty) || this.isSolid(sx, sy)) return [];
    if (pass && !pass(tx, ty)) return [];
    const { w } = this, n = w * this.h, prev = new Int32Array(n).fill(-1), q = new Int32Array(n);
    const s = sy * w + sx, t = ty * w + tx;
    if (s === t) return [];
    let head = 0, tail = 0; prev[s] = s; q[tail++] = s;
    while (head < tail) {
      const c = q[head++];
      if (c === t) break;
      for (const nb of this.neighbors(c, pass)) {
        if (prev[nb] !== -1) continue;
        prev[nb] = c; q[tail++] = nb;
      }
    }
    if (prev[t] === -1) return [];
    const path = [];
    for (let c = t; c !== s; c = prev[c]) path.push({ x: c % w, y: (c / w) | 0 });
    return path.reverse();
  }
}

/**
 * 시드 하나로 레벨 전체(맵, 출구, 열쇠, 스폰 위치)를 결정적으로 생성한다.
 * 서버는 seed 만 보내고, 클라이언트는 같은 함수로 같은 레벨을 재구성한다.
 */
export function generateLevel(seed, levelIndex = 0) {
  seed >>>= 0;
  const info = levelInfo(levelIndex);
  const run = info.layout === 'run';     // Level ! : 긴 복도
  const mission = missionOf(levelIndex);
  const city = info.layout === 'city';   // Level 11 : 세로로 긴 도시
  const map = run ? new GameMap(CONFIG.RUN.LENGTH, CONFIG.RUN.HEIGHT, seed, 'run')
    : city ? new GameMap(CONFIG.CITY.W, CONFIG.CITY.H, seed, 'city')
    : new GameMap(CONFIG.MAP_W, CONFIG.MAP_H, seed, info.layout === 'garage' ? 'garage' : 'maze', info.puddles || 0, info.roads || 0);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const sx = city ? map.startX : 1, sy = run ? map.h >> 1 : city ? map.h - 2 : 1;      // 시작 타일 (sx, sy)
  const dist = map.bfs(sx, sy);
  const center = i => ({ x: (i % map.w) * TS + TS / 2, y: ((i / map.w) | 0) * TS + TS / 2 });

  // 출구 = 시작점에서 가장 먼 타일 (질주 레벨은 복도 오른쪽 끝 가운데)
  let far = -1, exitIdx = -1;
  if (run) exitIdx = sy * map.w + map.w - 2;
  else for (let i = 0; i < dist.length; i++) if (dist[i] > far) { far = dist[i]; exitIdx = i; }
  map.tiles[exitIdx] = T.EXIT;
  const ex = exitIdx % map.w, ey = (exitIdx / map.w) | 0;

  // 미션 물건(열쇠 / 배달 부품 / 작동 장치): 서로, 그리고 출구와 거리 유지
  const cand = map.floorCells.filter(i => dist[i] >= 12 && i !== exitIdx && map.tiles[i] === T.FLOOR);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const spread = (count, filter) => {
    const out = [];
    const pool = filter ? cand.filter(filter) : cand;
    const keySpacing = Math.round(10 * Math.sqrt((map.w * map.h) / (41 * 41)));
    for (let spacing = keySpacing; spacing >= 0 && out.length < count; spacing -= 2) {
      for (const i of pool) {
        if (out.length >= count) break;
        const x = i % map.w, y = (i / map.w) | 0;
        const ok = Math.abs(x - ex) + Math.abs(y - ey) >= spacing &&
          out.every(k => Math.abs(k.tx - x) + Math.abs(k.ty - y) >= spacing);
        if (ok) out.push({ tx: x, ty: y, ...center(i), phase: rng() * 6 });
      }
    }
    return out;
  };
  const keys = mission.type === 'keys' && !run ? spread(mission.count) : [];
  const parts = mission.type === 'deliver' ? spread(mission.count) : [];
  // 밸브는 벽에 붙어 있다 (북쪽이 벽인 바닥 타일). 발전기는 바닥 아무 데나
  const onWall = i => map.isSolid(i % map.w, ((i / map.w) | 0) - 1);
  const stations = mission.type === 'activate' ? spread(mission.count, mission.kind === 'generator' ? null : onWall) : [];
  // 배달 장치(배전반/무전기): 시작 지점 근처, 북쪽이 벽인 바닥 (벽에 붙어 있게)
  let depot = null;
  if (mission.type === 'deliver') {
    const near = map.floorCells.filter(i => dist[i] >= 3 && dist[i] <= 9 && map.tiles[i] === T.FLOOR);
    const i = near.find(i => map.isSolid(i % map.w, ((i / map.w) | 0) - 1)) ?? near[0] ?? map.floorCells[0];
    depot = { tx: i % map.w, ty: (i / map.w) | 0, ...center(i) };
  }

  // 퍼즐 단말기: 시작점에서 먼 열쇠부터 퍼즐 안에 잠근다 (가까운 열쇠는 그냥 주울 수 있게)
  const prng = mulberry32(seed ^ 0x5bd1e995);
  const diff = Math.min(3, Math.floor(levelIndex / 2));
  const order = keys.map((k, i) => i).sort((p, q) => dist[keys[q].ty * map.w + keys[q].tx] - dist[keys[p].ty * map.w + keys[p].tx]);
  (info.puzzles || []).slice(0, keys.length).forEach((type, n) => {
    const k = keys[order[n]];
    k.puzzle = generatePuzzle(type, (prng() * 2 ** 32) >>> 0, diff);
  });

  // 괴물: 시작점에서 충분히 먼 곳
  const mc = map.floorCells.filter(i => dist[i] >= 18 && i !== exitIdx);
  const mi = mc.length ? mc[Math.floor(rng() * mc.length)] : map.floorCells[map.floorCells.length - 1];

  const lighting = buildLighting(map, rng, dist, { ...CONFIG.LIGHTS, ...info.lights }, sx, sy);
  const lockers = run ? [] : placeLockers(map, rng, dist, exitIdx, [...keys, ...parts, ...stations, ...(depot ? [depot] : [])]);
  // 장식 (Level Fun 의 풍선 등). 화면용이라 충돌 없음
  const decor = [];
  if (info.decor === 'moths') {   // 데스모스 수컷 떼: 형광등 주변을 맴도는 작은 나방 (무해)
    for (let n = 0; n < 60 && lighting.lights.length; n++) {
      const l = lighting.lights[Math.floor(rng() * lighting.lights.length)];
      decor.push({ kind: 'moths', x: l.x, y: l.y, phase: rng() * 6 });
    }
  }
  if (info.decor === 'balloons') {
    const BAL = ['#d8312b', '#d8312b', '#d8312b', '#e8c53a', '#3f7fd0', '#e06fb0'];
    for (let n = 0; n < 90; n++) {
      const i = map.floorCells[Math.floor(rng() * map.floorCells.length)];
      decor.push({ kind: 'balloon', x: (i % map.w) * TS + 8 + rng() * 32, y: ((i / map.w) | 0) * TS + 10 + rng() * 30, color: BAL[Math.floor(rng() * BAL.length)], phase: rng() * 6 });
    }
  }

  // 쪽지 (레벨 시작 지점 옆 바닥): E 로 읽으면 이 레벨에서 할 일이 적혀 있다
  const [nx, ny] = [[1, 0], [0, -1], [0, 1], [-1, 0], [1, 1], [1, -1]].map(([dx, dy]) => [sx + dx, sy + dy])
    .find(([x, y]) => map.get(x, y) === T.FLOOR && !keys.some(k => k.tx === x && k.ty === y)) || [sx, sy];
  const note = { tx: nx, ty: ny, x: nx * TS + TS / 2 + (nx === sx ? 0 : -8), y: ny * TS + TS / 2 + 6 };

  return {
    note,
    waterCells: map.floorCells.filter(i => map.tiles[i] === T.SLOW),
    ...areaMasks(map, info, mulberry32(seed ^ 0x2545f491)),
    seed, level: info.id, info, mission, map, keys, parts, stations, depot, exitIdx, dist, lockers, decor,
    spawn: { x: sx * TS + TS / 2, y: sy * TS + TS / 2 },
    monsterSpawn: center(mi),
    ...lighting,
  };
}

/** 숨을 수 있는 사물함: 북쪽이 벽인 바닥 타일(벽에 붙여 세움), 서로 떨어뜨려 배치 */
function placeLockers(map, rng, dist, exitIdx, keys) {
  const { w } = map;
  const cand = map.floorCells.filter(i => {
    const x = i % w, y = (i / w) | 0;
    return map.isSolid(x, y - 1) && dist[i] >= 3 && i !== exitIdx && !keys.some(k => k.tx === x && k.ty === y);
  });
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const lockers = [];
  for (let spacing = 6; spacing >= 2 && lockers.length < CONFIG.LOCKER.COUNT; spacing -= 2) {
    for (const i of cand) {
      if (lockers.length >= CONFIG.LOCKER.COUNT) break;
      const x = i % w, y = (i / w) | 0;
      if (lockers.some(l => Math.abs(l.tx - x) + Math.abs(l.ty - y) < spacing)) continue;
      lockers.push({ tx: x, ty: y, x: x * TS + TS / 2, y: y * TS + TS * 0.55 });
    }
  }
  return lockers;
}

/**
 * 천장 형광등 배치 + 타일별 밝기(tileLight) 계산.
 * 대부분은 밝고, 형광등이 나간 "어두운 구역"이 몇 군데 생긴다. seed 로 결정되므로 서버/클라이언트 동일.
 */
function buildLighting(map, rng, dist, L, sx = 1, sy = 1) {
  const { w, h } = map;
  const center = (x, y) => ({ x: x * TS + TS / 2, y: y * TS + TS / 2 });

  // 1) 어두운 구역 (시작 지점 근처는 제외)
  const darkZones = [], zoneCount = Math.round(L.DARK_ZONES * (w * h) / (41 * 41));
  for (let tries = 0; tries < 1500 && darkZones.length < zoneCount; tries++) {
    const idx = map.floorCells[Math.floor(rng() * map.floorCells.length)];
    if (dist[idx] < 12) continue;
    const x = idx % w, y = (idx / w) | 0;
    const r = L.DARK_ZONE_RADIUS[0] + rng() * (L.DARK_ZONE_RADIUS[1] - L.DARK_ZONE_RADIUS[0]);
    if (Math.hypot(x - sx, y - sy) < r + 4) continue;                     // 시작 지점은 항상 밝게
    if (darkZones.some(z => Math.hypot(z.x - x, z.y - y) < z.r + r + 3)) continue;
    darkZones.push({ x, y, r });
  }
  const inDarkZone = (x, y) => darkZones.some(z => Math.hypot(z.x - x, z.y - y) < z.r);

  // 2) 형광등: 바닥 타일을 훑으며, 주변(SPACING-1 칸)에 등이 없으면 하나 설치
  const lights = [], has = new Uint8Array(w * h);
  const near = (x, y, r) => {
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (map.inBounds(xx, yy) && has[yy * w + xx]) return true;
    }
    return false;
  };
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (L.NO_LIGHTS || map.isSolid(x, y) || inDarkZone(x, y) || near(x, y, L.SPACING - 1)) continue;
    has[y * w + x] = 1;
    const broken = rng() < L.BROKEN_CHANCE && dist[y * w + x] > 6;
    const flicker = rng() < L.FLICKER_CHANCE;
    // 비상등 (정전 레벨만): 정전에도 켜져 있는 빨간 등. 시작 지점 근처는 항상 비상등
    const emergency = L.EMERGENCY ? (rng() < L.EMERGENCY || (x <= 3 && y <= 3)) : false;
    if (!broken) lights.push({ tx: x, ty: y, ...center(x, y), flicker: flicker && !emergency, ...(emergency ? { emergency: true } : {}) });
  }

  // 3) 타일 밝기 (벽에 가려지면 빛이 닿지 않음)
  const tileLight = new Float32Array(w * h).fill(L.AMBIENT);
  const R = L.RADIUS, Ri = Math.ceil(R);
  for (const lt of lights) {
    for (let y = lt.ty - Ri; y <= lt.ty + Ri; y++) for (let x = lt.tx - Ri; x <= lt.tx + Ri; x++) {
      if (!map.inBounds(x, y) || map.isSolid(x, y)) continue;
      const d = Math.hypot(x - lt.tx, y - lt.ty);
      if (d >= R) continue;
      const c = center(x, y);
      if (d > 0 && !hasLOS(map, lt.x, lt.y, c.x, c.y)) continue;
      tileLight[y * w + x] += Math.pow(1 - d / R, 0.8);
    }
  }
  for (let i = 0; i < tileLight.length; i++) tileLight[i] = Math.min(1, tileLight[i]);
  // 벽 타일은 인접한 바닥 중 가장 밝은 값
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!map.isSolid(x, y)) continue;
    let b = L.AMBIENT;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (map.inBounds(x + dx, y + dy) && !map.isSolid(x + dx, y + dy)) b = Math.max(b, tileLight[(y + dy) * w + x + dx]);
    }
    tileLight[y * w + x] = b;
  }

  const isDark = (x, y) => map.inBounds(x, y) && tileLight[y * w + x] < L.DARK_THRESHOLD;
  const darkCells = map.floorCells.filter(i => tileLight[i] < L.DARK_THRESHOLD);
  // 정전 때 밝기: 비상등만 켜진다 (safeLight). 이 밝기가 어둠 기준 이상이면 정전 중에도 안전한 칸
  let safeLight = null, isSafe = () => false;
  if (L.EMERGENCY) {
    safeLight = new Float32Array(w * h).fill(0.02);
    for (const lt of lights) {
      if (!lt.emergency) continue;
      for (let y = lt.ty - Ri; y <= lt.ty + Ri; y++) for (let x = lt.tx - Ri; x <= lt.tx + Ri; x++) {
        if (!map.inBounds(x, y) || map.isSolid(x, y)) continue;
        const d = Math.hypot(x - lt.tx, y - lt.ty);
        if (d >= R) continue;
        const c = center(x, y);
        if (d > 0 && !hasLOS(map, lt.x, lt.y, c.x, c.y)) continue;
        safeLight[y * w + x] = Math.min(1, safeLight[y * w + x] + Math.pow(1 - d / R, 0.8));
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {   // 벽은 이웃 바닥 중 가장 밝은 값
      if (!map.isSolid(x, y)) continue;
      let b = 0.02;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map.inBounds(x + dx, y + dy) && !map.isSolid(x + dx, y + dy)) b = Math.max(b, safeLight[(y + dy) * w + x + dx]);
      safeLight[y * w + x] = b;
    }
    isSafe = (x, y) => map.inBounds(x, y) && safeLight[y * w + x] >= L.DARK_THRESHOLD;
  }
  return { lights, tileLight, darkZones, darkCells, isDark, safeLight, isSafe };
}

/**
 * wide  : 2x2 로 트인 곳 (도로·방). 큰 엔티티(동네 감시자, 아라네아)는 여기만 다닌다
 * toxic : 탁한 초록 물 (하이드로리티스 플레그). 물웅덩이 덩어리 중 info.toxic 비율
 */
function areaMasks(map, info, rng) {
  const { w, h } = map, wide = new Uint8Array(w * h), toxic = new Uint8Array(w * h);
  const open = (x, y) => !map.isSolid(x, y);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (!open(x, y)) continue;
    for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      if (open(x + dx, y + dy) && open(x + dx + 1, y + dy) && open(x + dx, y + dy + 1) && open(x + dx + 1, y + dy + 1)) { wide[y * w + x] = 1; break; }
    }
  }
  if (info.toxic) {
    const seen = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (seen[i] || map.tiles[i] !== T.SLOW) continue;
      const blob = [i], bad = rng() < info.toxic; seen[i] = 1;
      for (let k = 0; k < blob.length; k++) {
        const c = blob[k];
        for (const n of [c + 1, c - 1, c + w, c - w]) if (!seen[n] && map.tiles[n] === T.SLOW) { seen[n] = 1; blob.push(n); }
      }
      if (bad) for (const c of blob) toxic[c] = 1;
    }
  }
  return { wide, toxic, isWide: (x, y) => map.inBounds(x, y) && wide[y * w + x] === 1, isToxic: (x, y) => map.inBounds(x, y) && toxic[y * w + x] === 1 };
}
