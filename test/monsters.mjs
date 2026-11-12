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

// 7) 키티: 순간이동은 등 뒤 안 보이는 먼 곳 + 잠깐 얼어 있음. 벽 너머 가까이엔 붙지 않음. 막 마주친 순간엔 못 죽인다
{
  const g = fakeGame(LV("KITTY'S HOUSE")), { map } = g, s = straight(g, 6, (x, y) => x > 25 && y > 25);   // 맵 가운데쯤 (등 뒤에도 공간이 있게)
  const p = player(center(s.x), center(s.y), 0); g.players.push(p);
  let behindOk = 0, hiddenOk = 0;
  for (let n = 0; n < 20; n++) {
    const m = new Monster(center(s.x), center(s.y), 'kitty', 'kt');
    m.teleportBehind(g, p, m.cfg.teleportMin, m.cfg.teleportMax);
    const ang = Math.atan2(m.y - p.y, m.x - p.x);
    if (Math.abs(Math.atan2(Math.sin(ang - p.angle), Math.cos(ang - p.angle))) > Math.PI * 0.5) behindOk++;
    if (Math.hypot(m.x - p.x, m.y - p.y) > TS * 3) hiddenOk++;
  }
  check(behindOk >= 18 && hiddenOk === 20, `키티: 순간이동은 등 뒤 먼 곳 (${behindOk}/20 뒤, ${hiddenOk}/20 3칸 밖)`);
  const m = new Monster(center(s.x + 12), center(s.y), 'kitty', 'kt');
  m.timer = m.cfg.teleportEvery + 1; p.angle = 0;
  run(m, g, 0.1);
  check(g.events.includes('teleport') && m.state === 'frozen' && !m.canKill(), '키티: 순간이동 직후 얼어 있음');
  const at = { x: m.x, y: m.y };
  run(m, g, m.cfg.appearFreeze - 0.3);
  check(Math.hypot(m.x - at.x, m.y - at.y) < 1, '키티: 나타난 뒤 appearFreeze 동안 움직이지 않음');
  // 벽 너머(서로 안 보임) 3칸 거리 → 다가오지 않는다
  const cell = map.floorCells.find(i => {
    const x = i % map.w, y = (i / map.w) | 0;
    return map.tiles[i] === T.FLOOR && [[3, 0], [0, 3], [-3, 0], [0, -3]].some(([dx, dy]) => map.get(x + dx, y + dy) === T.FLOOR &&
      !map.isSolid(x + dx, y + dy) && map.findPath(x, y, x + dx, y + dy).length > 3 && !hasLOSc(map, x, y, x + dx, y + dy));
  });
  if (cell !== undefined) {
    const x = cell % map.w, y = (cell / map.w) | 0;
    const [dx, dy] = [[3, 0], [0, 3], [-3, 0], [0, -3]].find(([dx, dy]) => map.get(x + dx, y + dy) === T.FLOOR && !hasLOSc(map, x, y, x + dx, y + dy));
    const g2 = fakeGame(LV("KITTY'S HOUSE")), q = player(center(x), center(y), Math.PI * 2 * Math.random()); g2.players.push(q);
    const k = new Monster(center(x + dx), center(y + dy), 'kitty', 'k2'); k.timer = -999;
    const d0 = Math.hypot(k.x - q.x, k.y - q.y);
    run(k, g2, 2);
    check(Math.hypot(k.x - q.x, k.y - q.y) >= d0 - 2, '키티: 벽 너머 가까이에선 다가오지 않고 기다린다');
  }
  // 바로 옆에서 막 보이게 된 순간엔 죽이지 못한다
  const k3 = new Monster(center(s.x + 1), center(s.y), 'kitty', 'k3'); k3.timer = -999;
  p.angle = Math.PI; p.x = center(s.x); p.y = center(s.y);
  k3.update(1 / 30, g);
  check(!k3.canKill(), '키티: 막 마주친 순간엔 즉사하지 않음 (돌아볼 틈)');
  run(k3, g, 0.6);
  check(k3.canKill(), '키티: 계속 등을 보이면 결국 잡힌다');
}
import { hasLOS as hasLOSc } from '../shared/physics.js';

// 8) 레벨 5의 야수: 보이면 포효 → 일직선 돌진 → 벽에 박으면 기절(무해)
{
  const g = fakeGame(LV('BOILER ROOM')), s = straight(g, 6);
  const p = player(center(s.x), center(s.y), 0); g.players.push(p);
  const m = new Monster(center(s.x + 6), center(s.y), 'beast', 'bs');
  m.update(1 / 30, g);
  check(m.state === 'windup' && g.events.includes('roar'), `야수: 보이면 포효 (state=${m.state})`);
  run(m, g, m.cfg.windup + 0.05);
  check(m.state === 'charge', '야수: 포효 뒤 돌진');
  p.y += TS * 30;   // 옆으로 피함 (안 보이게)
  run(m, g, 3);
  check(g.events.includes('slam') || m.state !== 'charge', `야수: 돌진은 일직선, 벽에 박거나 멈춘다 (state=${m.state})`);
  const m2 = new Monster(center(s.x + 3), center(s.y), 'beast', 'b2'); m2.state = 'dazed'; m2.timer = 1;
  check(!m2.canKill(), '야수: 기절 중엔 무해');
}

// 9) 레벨 7의 무언가: 물속에서 움직이는 소리만 듣는다. 가만히 있거나 물 밖이면 못 찾는다
{
  const g = fakeGame(LV('THALASSOPHOBIA')), { map, level } = g;
  check(level.waterCells.length > 200, `Level 7: 물이 많다 (${level.waterCells.length}칸)`);
  // 물 칸이 3칸 이상 이어진 가로줄
  const w = level.waterCells.find(i => [1, 2, 3].every(k => map.tiles[i + k] === T.SLOW));
  const x = w % map.w, y = (w / map.w) | 0;
  const p = player(center(x), center(y), 0, { lastMoveAt: 0 }); g.players.push(p);
  const m = new Monster(center(x + 3), center(y), 'seaThing', 'st');
  run(m, g, 0.5);
  check(m.state === 'lurk' && !m.canKill(), '무언가: 물속에 가만히 있으면 못 듣는다');
  p.lastMoveAt = Date.now() + 1e6;
  run(m, g, 0.3);
  check(m.state === 'hunt' && m.canKill(), '무언가: 물을 휘저으면 다가온다');
  const dry = map.floorCells.find(i => map.tiles[i] === T.FLOOR && Math.hypot((i % map.w) - x, ((i / map.w) | 0) - y) > 10);
  p.x = center(dry % map.w); p.y = center((dry / map.w) | 0);
  run(m, g, 3);
  check(m.state === 'lurk' && map.get(m.tileX, m.tileY) === T.SLOW, '무언가: 물 밖으로 나가면 놓치고, 물 밖으로 나오지 않는다');
}

// 10) 크롤러: 천장에서 무해 → 바로 밑을 지나가면 떨어져 쫓는다. 웅크리면 조금 떨어져 지나갈 수 있다
{
  const g = fakeGame(LV('CAVE SYSTEM')), s = straight(g, 4);
  const p = player(center(s.x), center(s.y), 0, { crouching: true }); g.players.push(p);
  const m = new Monster(center(s.x + 1) + 10, center(s.y), 'crawler', 'cr');
  run(m, g, 0.3);
  check(m.state === 'ceiling' && !m.canKill(), '크롤러: 웅크려 지나가면 눈치채지 못함');
  p.crouching = false;
  run(m, g, 0.1);
  check(m.state === 'drop' && !m.canKill() && g.events.includes('screech'), '크롤러: 걸어 지나가면 비명과 함께 떨어진다');
  run(m, g, m.cfg.drop + 0.1);
  check(m.state === 'chase' && m.canKill(), '크롤러: 떨어진 뒤 쫓아온다');
}

// 11) 죽음쥐: 보이면 짧게 질주하다 지친다. 손전등에 흩어진다
{
  const g = fakeGame(LV('CAVE SYSTEM')), s = straight(g, 5);
  const p = player(center(s.x), center(s.y), Math.PI); g.players.push(p);
  const m = new Monster(center(s.x + 5), center(s.y), 'deathrat', 'dr');
  m.update(1 / 30, g);
  check(m.state === 'chase', '죽음쥐: 보이면 질주');
  m.timer = 0.01; run(m, g, 0.1);
  check(m.state === 'rest', '죽음쥐: 금방 지쳐서 쉰다');
  p.flashlight = true; p.angle = 0; m.x = center(s.x + 4); m.state = 'patrol';
  m.update(1 / 30, g);
  check(m.state === 'stunned' && !m.canKill() && g.events.includes('squeak'), '죽음쥐: 손전등을 비추면 흩어진다');
}

// 12) 잭-오-랜턴: 손전등 켠 사람은 멀리서도, 끈 사람은 코앞에서만 본다
{
  const g = fakeGame(LV('HARVEST NIGHT')), s = straight(g, 7);
  const p = player(center(s.x), center(s.y), Math.PI, { flashlight: false }); g.players.push(p);
  const m = new Monster(center(s.x + 6), center(s.y), 'jackLantern', 'jl');
  m.update(1 / 30, g);
  check(m.state !== 'chase', '잭-오-랜턴: 손전등을 끄면 6칸 거리에서 못 본다');
  p.flashlight = true; m.update(1 / 30, g);
  check(m.state === 'chase', '잭-오-랜턴: 손전등을 켜면 바로 쫓아온다');
}

// 13) 위장 크롤러: 멀리선 벽인 척(무해), 가까이 가면 튀어나온다
{
  const g = fakeGame(LV('THE ENDLESS CITY')), s = straight(g, 6);
  const p = player(center(s.x), center(s.y), 0); g.players.push(p);
  const m = new Monster(center(s.x + 6), center(s.y), 'camoCrawler', 'cc');
  run(m, g, 0.5);
  check(m.state === 'camo' && !m.canKill() && Math.abs(m.x - center(s.x + 6)) < 1, '위장 크롤러: 쳐다보면 벽인 척 가만히');
  p.x = m.x - TS * 1.5;
  m.update(1 / 30, g);
  check(m.state === 'chase' && m.canKill() && g.events.includes('reveal'), '위장 크롤러: 가까이 가면 튀어나와 쫓는다');
}

// 14) 덜러: 보이면 아주 느리게 따라오고, 벽 너머에선 모른다 / 시츠: 벽을 통과하고 손전등에 물러난다
{
  const g = fakeGame(LV('INFINITE APARTMENTS')), { map } = g;
  const p = player(center(1), center(1), 0); g.players.push(p);
  const far = map.floorCells.find(i => Math.hypot((i % map.w) - 1, ((i / map.w) | 0) - 1) > 14);
  const d = new Monster(center(far % map.w), center((far / map.w) | 0), 'duller', 'du');
  run(d, g, 2);
  check(d.state === 'patrol', `덜러: 벽 너머 먼 곳의 사람은 모른다 (state=${d.state})`);
  const s3 = straight(g, 5), d2 = new Monster(center(s3.x + 5), center(s3.y), 'duller', 'du2');
  g.players.length = 0; g.players.push(player(center(s3.x), center(s3.y), 0));
  run(d2, g, 0.5);
  check(d2.state === 'chase' && d2.cfg.chase < 72, `덜러: 보이면 따라온다, 웅크리기보다 느림 (${d2.cfg.chase})`);
  g.players.length = 0; g.players.push(p);
  const sh = new Monster(center(6), center(1), 'sheet', 'sh');
  let inWall = false;
  for (let t = 0; t < 4; t += 1 / 30) { sh.update(1 / 30, g); if (map.isSolid(sh.tileX, sh.tileY)) inWall = true; }
  const s2 = straight(g, 5);
  const p2 = player(center(s2.x), center(s2.y), 0, { flashlight: true }); g.players.length = 0; g.players.push(p2);
  const sh2 = new Monster(center(s2.x + 4), center(s2.y), 'sheet', 'sh2');
  sh2.update(1 / 30, g);
  check(sh2.state === 'scared' && !sh2.canKill() && g.events.includes('wail'), '시츠: 손전등을 비추면 물러난다');
  check(inWall || map.findPath(6, 1, 1, 1).length <= 5, '시츠: 벽을 통과해 떠다닌다');
}

// 15) 잡는 중엔 멈춘다 / 스킨 스틸러가 감정 표현을 흉내 낸다
{
  const g = fakeGame(LV('THE LOBBY')), s = straight(g, 6);
  const p = player(center(s.x), center(s.y), Math.PI); g.players.push(p);
  const h = new Monster(center(s.x + 4), center(s.y), 'hound', 'hd'); h.holdT = 1;
  const at = h.x; run(h, g, 0.5);
  check(Math.abs(h.x - at) < 1 && !h.canKill(), '잡는 연출 중엔 엔티티가 멈춰 있고 또 죽이지 못한다');
  let emoted = 0;
  for (let n = 0; n < 30; n++) {
    const g2 = fakeGame(LV('HABITABLE ZONE')), s2 = straight(g2, 3);
    const q = player(center(s2.x), center(s2.y), 0); g2.players.push(q);
    const ss = new Monster(center(s2.x + 2), center(s2.y), 'skinStealer', 'ss'); ss.state = 'approach';
    run(ss, g2, 0.1);
    if (g2.events.includes('emote')) emoted++;
  }
  check(emoted > 5 && emoted < 30, `스킨 스틸러: 가끔 감정 표현을 흉내 낸 뒤 정체를 드러낸다 (${emoted}/30)`);
}


// 16) Level P-1 정전: 불이 켜져 있으면 스마일러는 숨어 있고, 정전이면 어둠 속 사람에게 아주 빠르게 달려든다. 비상등 아래는 안전
{
  const g = fakeGame(LV('THE PARKING GARAGE')), { map, level } = g;
  const em = level.lights.filter(l => l.emergency).length;
  check(em > 30 && level.isSafe(1, 1), `P-1: 비상등 ${em}개, 시작 지점은 비상등 아래`);
  const base = level.isDark;
  g.blackoutPhase = 'lit';
  level.isDark = (x, y) => (g.blackoutPhase === 'dark' ? !level.isSafe(x, y) : base(x, y));
  // 어두운(비상등 밖) 칸이 6칸 이어진 직선
  let s = null;
  for (const i of map.floorCells) {
    const x = i % map.w, y = (i / map.w) | 0;
    if ([0, 1, 2, 3, 4, 5, 6].every(k => map.get(x + k, y) === T.FLOOR && !level.isSafe(x + k, y))) { s = { x, y }; break; }
  }
  const p = player(center(s.x), center(s.y), Math.PI, { flashlight: true }); g.players.push(p);
  const m = new Monster(center(s.x + 6), center(s.y), 'smiler', 'sm');
  run(m, g, 0.3);
  check(m.state === 'vanished' && !m.canKill(), 'P-1: 불이 켜져 있으면 스마일러는 숨어 있다');
  g.blackoutPhase = 'dark'; p.angle = 0;     // 손전등으로 비춰도 소용없다
  const d0 = Math.hypot(m.x - p.x, m.y - p.y);
  run(m, g, 0.5);
  const d1 = Math.hypot(m.x - p.x, m.y - p.y);
  check(m.state === 'chase' && m.canKill() && d0 - d1 > 222 * 0.5, `P-1: 정전엔 손전등도 무시하고 달리기보다 빠르게 달려든다 (${Math.round(d0)} → ${Math.round(d1)})`);
  // 비상등 아래로 피하면 쫓지 못한다
  const safe = map.floorCells.find(i => level.isSafe(i % map.w, (i / map.w) | 0) && Math.hypot((i % map.w) - m.tileX, ((i / map.w) | 0) - m.tileY) < 8);
  p.x = center(safe % map.w); p.y = center((safe / map.w) | 0);
  run(m, g, 1.5);
  check(m.state !== 'chase' && !level.isSafe(m.tileX, m.tileY), 'P-1: 비상등 아래로 피하면 빛 밖에서 노려보기만 한다');
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exitCode = failed ? 1 : 0;
