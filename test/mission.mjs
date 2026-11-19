// 서버 미션 처리 회귀 테스트 (소켓 없이 GameRoom 을 직접 돌린다)
//   node test/mission.mjs
import { GameRoom } from '../server/GameRoom.js';
import { LEVELS } from '../shared/config.js';
import { generateLevel, MANILA_CHANCE } from '../shared/map.js';
import { mulberry32 } from '../shared/utils.js';

let failed = 0;
const check = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failed++; };
const LV = name => LEVELS.findIndex(L => L.name === name);

function makeRoom(level) {
  const evs = [];
  const io = { to: () => ({ emit: (e, d) => evs.push([e, d]) }) };
  const sock = { id: 'p1', join() {}, emit() {}, to: () => ({ emit() {} }) };
  const room = new GameRoom('T', io, () => {}, { solo: true });
  room.log = () => {};
  room.levelIndex = level;
  room.addPlayer(sock, 'A', 'default');
  return { room, evs, p: room.players.get('p1') };
}

// 1) 작동 미션(풀룸 배수 밸브): 99.5% 를 화면에 100% 로 보내면 안 된다 / 다 돌리면 완료 수가 올라간다
{
  const { room, p } = makeRoom(LV('THE POOLROOMS'));
  const st = room.level.stations[0];
  p.x = st.x; p.y = st.y;
  room.obj.prog[0] = 0.996;
  check(room.objPayload().prog[0] < 1 && room.objPayload().done === 0, `미완료 밸브(99.6%)는 화면에 100% 로 보이지 않음 (${room.objPayload().prog[0]})`);
  p.turnAt = Date.now() - 1000;
  room.onTurnValve('p1', { index: 0, delta: 0.2 });
  check(room.obj.prog[0] === 1 && room.objPayload().done === 1, `끝까지 돌리면 완료 1/${room.obj.total}`);
  // 소수 오차로 99.99..% 에서 멈추는 경우
  room.obj.prog[1] = 0.9993; const st1 = room.level.stations[1]; p.x = st1.x; p.y = st1.y; p.turnAt = Date.now() - 1000;
  room.onTurnValve('p1', { index: 1, delta: 0.00001 });
  check(room.obj.prog[1] === 1 && room.objPayload().done === 2, `99.9% 이상이면 완료로 친다 (${room.objPayload().done}/${room.obj.total})`);
  clearInterval(room.timer);
}

// 2) 웰본 병원: 미믹 사물함에 숨으려 하면 죽고, 진짜 사물함엔 숨어진다
{
  const { room, evs, p } = makeRoom(LV('WELLBORN HOSPITAL'));
  room.monsterGrace = 0;
  const mimics = room.monsters.filter(m => m.type === 'mimic');
  check(mimics.length >= 5 && mimics.every(m => room.level.lockers[m.lockerIdx]), `미믹 ${mimics.length}마리가 사물함 자리를 차지한다`);
  const real = room.level.lockers.findIndex((lk, i) => !mimics.some(m => m.lockerIdx === i));
  const lk = room.level.lockers[real];
  p.x = lk.x; p.y = lk.y; p.hideToggleAt = 0;
  room.onHide('p1', { index: real });
  check(p.hidden, '진짜 사물함에는 숨을 수 있다');
  p.hideToggleAt = 0; room.onHide('p1', {}); p.hideToggleAt = 0;   // 나오기 (재사용 대기시간 무시)
  const mm = mimics[0], ml = room.level.lockers[mm.lockerIdx];
  p.x = ml.x; p.y = ml.y;
  room.onHide('p1', { index: mm.lockerIdx });
  const died = evs.find(([e, d]) => e === 'playerDied' && d.entityType === 'mimic');
  check(!p.hidden && p.status === 'dead' && !!died, '미믹 사물함에 숨으려 하면 삼켜진다');
  clearInterval(room.timer);
}

// 3) 게임 모드: 숨기 금지 / 아이템 없음 / 엔티티 감속 / 레벨 셔플
{
  const { room, p } = makeRoom(0);
  room.modes.noHide = true; room.modes.noItems = true; room.modes.slowEntities = true;
  room.startRound(false);
  check(room.items.length === 0, '아이템 없음 모드: 바닥에 아이템이 없다');
  const lk = room.level.lockers[0]; p.x = lk.x; p.y = lk.y; p.hideToggleAt = 0;
  room.onHide('p1', { index: 0 });
  check(!p.hidden, '숨기 금지 모드: 사물함에 숨을 수 없다');
  room.monsterGrace = 0; room.lastTick = Date.now() - 30; room.tick();
  check(room.monsters.every(m => Math.abs(m.modeMul - 0.75) < 1e-9), '엔티티 감속 모드: 엔티티 속도 배율 0.75');
  room.modes.shuffleLevels = true; room.cleared = new Set();
  const final = LEVELS.findIndex(L => L.final), seen = new Set();
  room.levelIndex = 0;
  for (let k = 0; k < LEVELS.length - 1; k++) { room.levelIndex = room.nextLevelIndex(); seen.add(room.levelIndex); if (room.levelIndex === final) break; }
  check(room.levelIndex === final && seen.size === LEVELS.length - 1, `레벨 셔플: 모든 레벨을 한 번씩 거친 뒤 마지막 레벨 (${seen.size}곳)`);
  clearInterval(room.timer);
}

// 4) 아르고스: 눈이 떠 있을 때 움직이면 서버가 그 사람을 죽인다
{
  const { room, evs, p } = makeRoom(LV('SUBJECTIVE ART GALLERY'));
  room.monsterGrace = 0;
  const gz = room.monsters.find(m => m.type === 'gazer');
  gz.zap = p;
  room.lastTick = Date.now() - 30; room.tick();
  check(p.status === 'dead' && evs.some(([e, d]) => e === 'playerDied' && d.entityType === 'gazer'), '아르고스에게 걸리면 죽는다 (entityType=gazer)');
  clearInterval(room.timer);
}

// 5) 무한한 쇼핑몰: 망령 둘레는 어둠 취급 (스마일러가 들어오고 정신력이 빨리 준다)
{
  const { room } = makeRoom(LV('THE INFINITE MALL'));
  const so = room.monsters.find(m => m.type === 'soot');
  const bright = room.level.map.floorCells.find(i => !room.level.isDark(i % room.level.map.w, (i / room.level.map.w) | 0));
  const bx = bright % room.level.map.w, by = (bright / room.level.map.w) | 0;
  so.x = bx * 48 + 24; so.y = by * 48 + 24;
  check(room.level.isDark(bx, by), '망령이 있는 자리는 형광등이 켜져 있어도 어둠이 된다');
  so.x = -9999; so.y = -9999;
  check(!room.level.isDark(bx, by), '망령이 떠나면 다시 밝다');
  clearInterval(room.timer);
}

// 6) 흐릿한 강: 강가에서 보트를 타고, 보트로는 땅에 못 올라가고, 맞은편에서 내린다. 걸어서는 물에 못 들어간다
{
  const { room, evs, p } = makeRoom(LV('THE HAZED RIVER'));
  const map = room.map, TS = 48, my = map.h >> 1, c = t => t * TS + TS / 2;
  check(room.exitUnlocked, '흐릿한 강: 출구가 처음부터 열려 있다');
  p.x = c(9); p.y = c(my); p.lastUpdate = Date.now() - 200;   // 선착장 끝
  room.onState('p1', { x: c(11), y: c(my), angle: 0 });
  check(p.x === c(9), '걸어서는 깊은 물로 들어갈 수 없다 (correct)');
  room.onBoat('p1');
  check(p.boat && map.get(Math.floor(p.x / TS), Math.floor(p.y / TS)) === 4 && evs.some(([e, d]) => e === 'boatState' && d.boat), '강가에서 E → 보트를 탄다 (물 위로)');
  const bx = p.x; p.lastUpdate = Date.now() - 200;
  room.onState('p1', { x: c(8), y: c(my), angle: 0 });
  check(p.x === bx, '보트로는 땅 위로 못 올라간다');
  p.lastUpdate = Date.now() - 200;
  room.onState('p1', { x: bx + 30, y: p.y, angle: 0 });
  check(p.x === bx + 30, '보트는 물 위로 움직인다');
  // 맞은편 선착장 옆 물 → 내리기
  p.x = c(map.w - 11); p.y = c(my);
  room.onBoat('p1');
  check(!p.boat && map.get(Math.floor(p.x / TS), Math.floor(p.y / TS)) === 0, '맞은편 강가에서 E → 보트에서 내린다');
  clearInterval(room.timer);
}

// 7) 엔딩: 3999 탈출은 늘 노멀 (배드·광기 엔딩은 없앴다). Level 0 숨겨진 문(0.06% 확률) → 히든
{
  const { room, p } = makeRoom(LEVELS.findIndex(L => L.final));
  p.status = 'escaped'; p.sanity = 10; room.statOf('p1').deaths = 20;
  room.players.set('p2', { id: 'p2', name: 'B', status: 'dead', sanity: 100, inv: [] });
  check(room.pickEnding() === 'good', '엔딩: 정신력이 바닥이든, 많이 죽었든, 동료가 남겨졌든 → 노멀');
  room.players.delete('p2');
  clearInterval(room.timer);
  // 마닐라 룸 문은 시드의 0.06% 에서만 생긴다
  let hits = 0, seedWith = -1;
  for (let seed = 0; seed < 200000; seed++) if (mulberry32(seed ^ 0x4d4e4c41)() < MANILA_CHANCE) { hits++; if (seedWith < 0) seedWith = seed; }
  check(MANILA_CHANCE === 0.0006 && hits > 60 && hits < 190, `마닐라 룸 문이 생기는 시드 비율 ≈ 0.06% (${(hits / 2000).toFixed(3)}%)`);
  let none = 0;
  for (let seed = 1; seed <= 40; seed++) if (!generateLevel(seed, 0).secret || mulberry32(seed ^ 0x4d4e4c41)() < MANILA_CHANCE) none++;
  check(none === 40, '보통 시드의 Level 0 에는 숨겨진 문이 없다');
  const r0 = makeRoom(0);
  const s = generateLevel(seedWith, 0).secret;
  check(!!s, `문이 생기는 시드(${seedWith})의 Level 0 에는 숨겨진 마닐라 룸 문이 있다`);
  r0.room.level.secret = s;
  r0.p.x = s.x; r0.p.y = s.y;
  r0.room.onManila('p1');
  const done = r0.evs.find(([e]) => e === 'gameComplete');
  check(done && done[1].ending === 'manila', '숨겨진 문에서 E → 히든 엔딩 (마닐라 룸)');
  clearInterval(r0.room.timer);
}

// 7.5) 익사자: 보트 위에서 가만히 있으면 발밑에서 솟아난다 (손전등도 안 통한다)
{
  const { room, evs, p } = makeRoom(LV('THE HAZED RIVER'));
  const map = room.map, TS = 48, my = map.h >> 1, c = t => t * TS + TS / 2;
  room.monsterGrace = 0;
  p.x = c(9); p.y = c(my); room.onBoat('p1');
  p.x += 3 * TS; p.lastMoveAt = Date.now() - 5000; p.flashlight = true;
  const m = room.monsters.find(x => x.type === 'drowned');
  for (const x of room.monsters) if (x !== m) { x.state = 'sink'; x.timer = 99; }
  m.state = 'lurk';
  for (let k = 0; k < 30; k++) room.updateBoatIdle(0.1, Date.now());
  check(m.state === 'surface' && m.prey === p && Math.hypot(m.x - p.x, m.y - p.y) < 1 && evs.some(([e, d]) => e === 'entityEvent' && d.kind === 'emerge' && d.target === 'p1'),
    '익사자: 보트에서 2.5초 가만히 있으면 바로 발밑에서 솟아난다');
  p.angle = Math.atan2(m.y - p.y, m.x - p.x);
  m.update(0.05, room);
  check(m.state === 'surface', '익사자: 발밑에서 솟아난 것은 손전등으로 못 쫓는다');
  const { room: r2, p: p2 } = makeRoom(LV('THE HAZED RIVER'));
  p2.x = c(9); p2.y = c(my); r2.onBoat('p1');
  for (let k = 0; k < 30; k++) { p2.lastMoveAt = Date.now(); r2.updateBoatIdle(0.1, Date.now()); }
  check(!r2.monsters.some(x => x.state === 'surface'), '익사자: 계속 저으면 발밑에서 솟아나지 않는다');
  clearInterval(room.timer); clearInterval(r2.timer);
}

// 8) 모드: 사진작가 / 단 하나 / 제한 시간 / 영구 사망 / 평온 / 달리기 금지
{
  const { room, evs, p } = makeRoom(0);
  room.modes.photographer = true; room.startRound(false);
  const cam = p.inv.findIndex(it => it?.type === 'camera' && it.inf);
  check(cam >= 0 && room.photo.need && !room.photo.taken, '사진작가: 무한 카메라를 들고 시작, 사진이 필요하다');
  room.exitUnlocked = true;
  check(!room.exitOpen(), '사진작가: 미션을 끝내도 사진이 없으면 출구가 안 열린다');
  const m = room.monsters.find(x => x.type === 'howler'); m.active = true; m.state = 'patrol';
  p.x = m.x - 60; p.y = m.y; p.angle = 0; m.stunT = 0;
  room.map.tiles[Math.floor(p.y / 48) * room.map.w + Math.floor(p.x / 48)] = 0;   // 테스트용: 서 있는 칸이 벽이 아니게
  room.onUseItem('p1', { slot: cam });
  check(room.photo.taken && room.exitOpen() && evs.some(([e]) => e === 'photo'), '사진작가: 괴물을 찍으면 출구가 열린다');
  check(p.inv[cam]?.type === 'camera', '사진작가: 카메라는 줄지 않는다');
  room.modes.photographer = false;
  clearInterval(room.timer);
}
{
  const { room, p } = makeRoom(0);
  room.modes.oneItem = true; room.startRound(false);
  const it = room.items[0]; p.x = it.x; p.y = it.y; room.checkPickups(p);
  const it2 = room.items[0]; p.x = it2.x; p.y = it2.y; room.checkPickups(p);
  check(p.inv[0]?.inf && p.inv.filter(Boolean).length === 1 && p.slots === 1, '단 하나: 한 칸만, 처음 주운 아이템은 무한');
  room.onDropItem('p1', { slot: 0 });
  check(!!p.inv[0], '단 하나: 버릴 수 없다');
  clearInterval(room.timer);
}
{
  const { room, evs, p } = makeRoom(0);
  room.modes.timeLimit = true; room.modes.calm = true; room.startRound(false);
  room.monsterGrace = 0; room.monsters = []; room.timeLeft = 0.01; const s0 = p.sanity;
  room.lastTick = Date.now() - 50; room.tick();
  check(p.status === 'dead' && evs.some(([e, d]) => e === 'playerDied' && d.entityType === 'timeout'), '제한 시간: 시간이 다 되면 죽는다');
  check(p.sanity === s0, '평온: 정신력이 줄지 않는다');
  clearInterval(room.timer);
}
{
  const evs = [], io = { to: () => ({ emit: (e, d) => evs.push([e, d]) }) };
  const room = new GameRoom('PD', io, () => {}, { solo: false }); room.log = () => {};
  for (const id of ['a', 'b']) room.addPlayer({ id, join() {}, emit() {}, to: () => ({ emit() {} }) }, id, 'default');
  room.modes.permaDeath = true; room.startRound(false);
  const A = room.players.get('a'), Bp = room.players.get('b');
  Bp.status = 'dead'; A.status = 'escaped'; room.checkRoundEnd(); room.startRound(false);
  check(A.alive && Bp.status === 'dead', '영구 사망: 죽은 사람은 다음 레벨에서도 관전');
  A.status = 'dead'; room.checkRoundEnd();
  check(room.levelIndex === 0 && !A.perma && !Bp.perma, '영구 사망: 모두 죽으면 Level 0 부터');
  room.modes.noSprint = true; room.startRound(false);
  A.lastUpdate = Date.now() - 100; room.onState('a', { x: A.x, y: A.y, angle: 0, sprinting: true });
  check(!A.sprinting, '달리기 금지: 서버가 달리기를 끈다');
  clearInterval(room.timer);
}

// 9) 새 모드: 불안한 시작 / 생존 키트 / 시끄러운 발걸음
{
  const { room, p } = makeRoom(1);
  room.startRound(false);
  p.lastUpdate = Date.now() - 200; room.onState('p1', { x: p.x + 4, y: p.y, angle: 0 });
  const quiet = p.noise;
  room.modes.anxious = true; room.modes.starterKit = true; room.modes.loudSteps = true; room.startRound(false);
  check(p.sanity === 50, '불안한 시작: 정신력 50 으로 시작');
  check(p.inv.some(it => it?.type === 'almondWater') && p.inv.some(it => it?.type === 'flare'), '생존 키트: 아몬드 워터와 조명탄을 받는다');
  p.lastUpdate = Date.now() - 200; room.onState('p1', { x: p.x + 4, y: p.y, angle: 0 });
  check(quiet > 0 && Math.abs(p.noise - quiet * 1.5) < 0.01, `시끄러운 발걸음: 발소리 반경 1.5배 (${quiet} → ${p.noise})`);
  clearInterval(room.timer);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exitCode = failed ? 1 : 0;
