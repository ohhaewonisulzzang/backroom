import { CONFIG, TS, T, levelInfo } from './config.js';
import { mulberry32 } from './utils.js';
import { hasLOS } from './physics.js';
import { generatePuzzle } from './puzzles.js';

export class GameMap {
  constructor(w, h, seed, layout = 'maze') {
    this.w = w; this.h = h;
    this.rng = mulberry32(seed);
    this.tiles = new Uint8Array(w * h).fill(T.WALL);
    if (layout === 'run') this.generateRun(); else this.generate();
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
  const map = run ? new GameMap(CONFIG.RUN.LENGTH, CONFIG.RUN.HEIGHT, seed, 'run') : new GameMap(CONFIG.MAP_W, CONFIG.MAP_H, seed);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const sy = run ? map.h >> 1 : 1;      // 시작 타일 (1, sy)
  const dist = map.bfs(1, sy);
  const center = i => ({ x: (i % map.w) * TS + TS / 2, y: ((i / map.w) | 0) * TS + TS / 2 });

  // 출구 = 시작점에서 가장 먼 타일 (질주 레벨은 복도 오른쪽 끝 가운데)
  let far = -1, exitIdx = -1;
  if (run) exitIdx = sy * map.w + map.w - 2;
  else for (let i = 0; i < dist.length; i++) if (dist[i] > far) { far = dist[i]; exitIdx = i; }
  map.tiles[exitIdx] = T.EXIT;
  const ex = exitIdx % map.w, ey = (exitIdx / map.w) | 0;

  // 열쇠: 서로, 그리고 출구와 거리 유지
  const cand = map.floorCells.filter(i => dist[i] >= 12 && i !== exitIdx);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const keys = [];
  const keySpacing = Math.round(10 * Math.sqrt((map.w * map.h) / (41 * 41)));
  const keyCount = run ? 0 : CONFIG.KEY_COUNT;   // 질주 레벨은 열쇠 없음
  for (let spacing = keySpacing; spacing >= 0 && keys.length < keyCount; spacing -= 2) {
    for (const i of cand) {
      if (keys.length >= keyCount) break;
      const x = i % map.w, y = (i / map.w) | 0;
      const ok = Math.abs(x - ex) + Math.abs(y - ey) >= spacing &&
        keys.every(k => Math.abs(k.tx - x) + Math.abs(k.ty - y) >= spacing);
      if (ok) keys.push({ tx: x, ty: y, ...center(i), phase: rng() * 6 });
    }
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

  const lighting = buildLighting(map, rng, dist, { ...CONFIG.LIGHTS, ...info.lights });
  const lockers = run ? [] : placeLockers(map, rng, dist, exitIdx, keys);
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

  return {
    seed, level: info.id, info, map, keys, exitIdx, dist, lockers, decor,
    spawn: { x: TS * 1.5, y: sy * TS + TS / 2 },
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
function buildLighting(map, rng, dist, L) {
  const { w, h } = map;
  const center = (x, y) => ({ x: x * TS + TS / 2, y: y * TS + TS / 2 });

  // 1) 어두운 구역 (시작 지점 근처는 제외)
  const darkZones = [], zoneCount = Math.round(L.DARK_ZONES * (w * h) / (41 * 41));
  for (let tries = 0; tries < 1500 && darkZones.length < zoneCount; tries++) {
    const idx = map.floorCells[Math.floor(rng() * map.floorCells.length)];
    if (dist[idx] < 12) continue;
    const x = idx % w, y = (idx / w) | 0;
    const r = L.DARK_ZONE_RADIUS[0] + rng() * (L.DARK_ZONE_RADIUS[1] - L.DARK_ZONE_RADIUS[0]);
    if (Math.hypot(x - 1, y - 1) < r + 4) continue;                       // 시작 지점은 항상 밝게
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
    if (!broken) lights.push({ tx: x, ty: y, ...center(x, y), flicker });
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
  return { lights, tileLight, darkZones, darkCells, isDark };
}
