// 위키 엔티티(창문들 / 동네 감시자 / 클럼프 / 애니메이션 / 애니메이션 킹 / 키티 / 페이슬링) AI 를 서버 없이 가짜 game 객체로 검증한다.
//   node test/monsters.mjs
import { generateLevel } from '../shared/map.js';
import { Monster } from '../shared/monster.js';
import { TS, T, LEVELS } from '../shared/config.js';

let failed = 0;
const check = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failed++; };
const LV = name => LEVELS.findIndex(L => L.name === name);

function fakeGame(levelIndex, seed = 777) {
  const level = generateLevel(seed, levelIndex), events = [];
  const players = [];
  return {
    level, map: level.map, players, events, flares: [], nightPhase: 'day',
    allPlayers: () => players.values(),
    onMonsterAlert() {}, onEntityEvent(m, kind) { events.push(kind); },
  };
}
const player = (x, y, angle, extra = {}) => ({ id: 'p', x, y, angle, alive: true, hidden: false, flashlight: false, sprinting: false, noise: 0, ...extra });
const center = t => t * TS + TS / 2;
const run = (m, g, sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) m.update(dt, g); };

/** 밝은 곳에 있는 가로 n 칸 직선 (조건 ok(x, y) 를 만족하는 칸) */
function straight(g, n, ok = () => true) {
  const { map } = g;
  for (const i of map.floorCells) {
    const x = i % map.w, y = (i / map.w) | 0;
    let good = true;
    for (let k = 0; k <= n; k++) if (map.get(x + k, y) !== T.FLOOR || g.level.isDark(x + k, y) || !ok(x + k, y)) { good = false; break; }
    if (good) return { x, y };
  }
  return null;
}

// 1) 애니메이션 킹 / 키티: 쳐다보면 멈추고, 등을 돌리면 다가온다. 킹은 손전등을 비추면 사라진다
for (const type of ['animatedKing', 'kitty']) {
  const g = fakeGame(LV('MOTION')), s = straight(g, 6);
  const p = player(center(s.x), center(s.y), 0); g.players.push(p);
  const m = new Monster(center(s.x + 6), center(s.y), type, type);
  run(m, g, 1);
  check(m.state === 'frozen' && Math.abs(m.x - center(s.x + 6)) < 1 && !m.canKill(), `${type}: 쳐다보는 동안 멈춤 (state=${m.state})`);
  p.angle = Math.PI;
  const d0 = Math.hypot(m.x - p.x, m.y - p.y);
  run(m, g, 1);
  const d1 = Math.hypot(m.x - p.x, m.y - p.y);
  check(m.state === 'stalk' && d1 < d0 - 50 && m.canKill(), `${type}: 눈을 떼면 다가옴 (${Math.round(d0)} → ${Math.round(d1)})`);
  if (type === 'animatedKing') {
    p.angle = Math.atan2(m.y - p.y, m.x - p.x); p.flashlight = true;
    m.update(1 / 30, g);
    check(m.state === 'vanished' && !m.canKill() && g.events.includes('vanish'), '애니메이션 킹: 손전등을 비추면 사라짐');
  }
}

// 2) 애니메이션: 낮엔 인형, 밤엔 숨지 않은 사람을 쫓는다. 숨은 사람은 못 찾는다
{
  const g = fakeGame(LV('MOTION')), s = straight(g, 6);
  const p = player(center(s.x), center(s.y), 0); g.players.push(p);
  const m = new Monster(center(s.x + 6), center(s.y), 'animation', 'an');
  run(m, g, 1);
  check(m.state === 'doll' && !m.canKill() && Math.abs(m.x - center(s.x + 6)) < 1, '애니메이션: 낮엔 움직이지 않는 인형');
  g.nightPhase = 'night';
  const d0 = Math.hypot(m.x - p.x, m.y - p.y);
  run(m, g, 0.6);
  check(m.state === 'hunt' && m.canKill() && Math.hypot(m.x - p.x, m.y - p.y) < d0 - 60, '애니메이션: 밤이 되면 달려든다');
  p.hidden = true;
  const at = { x: m.x, y: m.y };
  run(m, g, 0.5);
  check(m.nearestPlayer(g).target === null && !m.canFindHidden(p), '애니메이션: 숨은 사람은 찾지 못한다');
  g.nightPhase = 'day'; run(m, g, 0.1);
  check(m.state === 'doll', '애니메이션: 날이 밝으면 다시 인형');
  void at;
}

// 3) 동네 감시자: 넓은 도로만 다닌다 — 좁은 골목으로 피하면 따라오지 못한다
{
  const g = fakeGame(LV('THE SUBURBS')), { map, level } = g;
  const road = straight(g, 6, (x, y) => level.isWide(x, y));
  const p = player(center(road.x), center(road.y), 0); g.players.push(p);
  const m = new Monster(center(road.x + 6), center(road.y), 'watch', 'nw');
  run(m, g, 0.2);
  check(m.state === 'chase', `동네 감시자: 도로 위 사람을 보면 추격 (state=${m.state})`);
  // 좁은 골목(넓지 않은 바닥) 으로 이동
  const alley = map.floorCells.find(i => !level.wide[i] && map.tiles[i] === T.FLOOR);
  p.x = center(alley % map.w); p.y = center((alley / map.w) | 0);
  run(m, g, 6);
  check(level.isWide(m.tileX, m.tileY) && m.state !== 'chase', `동네 감시자: 골목으로 피하면 놓친다 (state=${m.state}), 계속 도로 위`);
}

// 4) 클럼프: 물에는 들어오지 못한다
{
  const g = fakeGame(LV('THE POOLROOMS')), { map } = g;
  for (let t = 0; t < 5; t++) {
    const m = new Monster(0, 0, 'clump', 'cl');
    const dry = map.floorCells.filter(i => map.tiles[i] === T.FLOOR);
    const i = dry[(t * 997) % dry.length]; m.x = center(i % map.w); m.y = center((i / map.w) | 0);
    for (let k = 0; k < 150; k++) { m.path = m.path.length ? m.path : []; m.update(1 / 30, g); }
    if (map.get(m.tileX, m.tileY) === T.SLOW) { check(false, '클럼프: 물에 들어감'); break; }
    if (t === 4) check(true, '클럼프: 돌아다녀도 물에 들어가지 않음');
  }
}

// 5) 창문들: 멀리선 노크, 가까이 오면 손을 뻗어 잡는다. 창문에서 멀리 나오지 못한다
{
  const g = fakeGame(LV('ABANDONED OFFICE')), { map } = g;
  const i = map.floorCells.find(i => map.tiles[i] === T.FLOOR && map.isSolid(i % map.w, ((i / map.w) | 0) - 1) &&
    [1, 2, 3, 4].every(k => map.get(i % map.w, ((i / map.w) | 0) + k) === T.FLOOR));
  const x = i % map.w, y = (i / map.w) | 0;
  const m = new Monster(center(x), y * TS + 10, 'windows', 'wn'); m.post = { x: m.x, y: m.y };
  const p = player(center(x), center(y + 4), -Math.PI / 2); g.players.push(p);
  run(m, g, 3);
  check(m.state === 'watch' && !m.canKill() && g.events.includes('knock'), `창문들: 떨어져 있으면 노크만 (state=${m.state})`);
  p.y = center(y + 1);
  run(m, g, 0.2);
  check(m.state === 'grab' && m.canKill() && g.events.includes('shatter'), '창문들: 가까이 오면 유리를 깨고 잡는다');
  p.y = center(y + 6);
  run(m, g, 1);
  check(Math.hypot(m.x - m.post.x, m.y - m.post.y) <= m.cfg.grab + 1 && m.state !== 'grab', '창문들: 창문에서 멀리 나오지 못함');
}

// 6) 페이슬링: 보이면 쫓아오지만 걷는 사람보다 느리다
{
  const g = fakeGame(LV('FIELD OF WHEAT')), s = straight(g, 5);
  const p = player(center(s.x), center(s.y), 0); g.players.push(p);
  const m = new Monster(center(s.x + 5), center(s.y), 'faceling', 'fc');
  run(m, g, 0.2);
  check(m.state === 'chase' && m.cfg.chase < 138, `페이슬링: 보이면 추격, 걷기(138)보다 느림 (${m.cfg.chase})`);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exitCode = failed ? 1 : 0;
