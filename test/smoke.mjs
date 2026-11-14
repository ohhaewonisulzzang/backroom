// 게임 서버(socket.io + GameRoom)를 띄우고 클라이언트 2개로 핵심 프로토콜을 검증한다.
// Next.js 빌드 없이 server/socket.js 만 일반 HTTP 서버에 붙여서 테스트한다.
//   npm test
import http from 'node:http';
import { Server } from 'socket.io';
import { attachGameServer } from '../server/socket.js';
import { GameRoom } from '../server/GameRoom.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { io } from 'socket.io-client';
import { generateLevel } from '../shared/map.js';
import { TS, LEVELS, MISSION, CONFIG } from '../shared/config.js';
const LV = name => LEVELS.findIndex(L => L.name === name);
const RUN = LV('RUN FOR YOUR LIFE'), END = LV('THE END'), FINAL = LV('THE TRUE END');
import { solve } from './puzzles.mjs';

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
let failed = 0;
const check = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failed++; };

let game;
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(game.health())); return; }
  res.statusCode = 404; res.end();
});
const ioServer = new Server(server);
game = attachGameServer(ioServer, { testMode: true });
await new Promise(res => server.listen(PORT, res));

function client(name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const log = [];
  s.onAny((ev, data) => log.push({ ev, data }));
  const waitFor = (ev, pred = () => true, ms = 4000) => new Promise((res, rej) => {
    const found = log.find(e => e.ev === ev && pred(e.data));
    if (found) return res(found.data);
    const t = setTimeout(() => rej(new Error(`timeout waiting ${ev} (${name})`)), ms);
    const h = (e, data) => { if (e === ev && pred(data)) { clearTimeout(t); s.offAny(h); res(data); } };
    s.onAny(h);
  });
  s.on('connect', () => s.emit('join', { name, room: 'smoke' }));
  return { s, log, waitFor };
}

try {
  // 1) 접속 / 같은 seed
  const a = client('Alice');
  const ia = await a.waitFor('init');           // Alice 가 먼저 방을 만든 뒤
  const b = client('Bob');
  const ib = await b.waitFor('init');           // Bob 이 합류
  check(ia.seed === ib.seed && ia.round === ib.round, `두 클라이언트가 같은 seed/round 수신 (seed=${ia.seed})`);
  check(ib.players.length === 2, 'Bob 의 init 에 플레이어 2명 포함');
  const joined = await a.waitFor('playerJoined');
  check(joined.name === 'Bob', 'Alice 가 playerJoined(Bob) 수신');

  // 2) 서버 레벨과 클라이언트 재생성 레벨이 일치하는지 (열쇠 수 / 스폰)
  const level = generateLevel(ia.seed, ia.level);
  check(level.keys.length === ia.keys.length, `seed 로 재생성한 열쇠 수 일치 (${level.keys.length})`);

  // 3) 위치 동기화
  const me = ia.players.find(p => p.id === ia.id);
  a.s.emit('state', { x: me.x + 5, y: me.y + 3, angle: 1.234, flashlight: false, sprinting: false });
  const snap = await b.waitFor('snapshot', s => s.players.some(p => p.id === ia.id && p.angle === 1.234));
  const seen = snap.players.find(p => p.id === ia.id);
  check(Math.abs(seen.x - (me.x + 5)) < 0.2 && seen.flashlight === false, 'Bob 이 스냅샷으로 Alice 의 위치/손전등 상태 수신');
  const types = [...new Set(snap.monsters.map(m => m.type))].sort().join(',');
  check(ia.level === 0 && types === 'howler,wanderer', `Level 0 엔티티는 방랑자+하울러만 (${types}, ${snap.monsters.length}마리)`);

  // 4) 순간이동 / 벽 안 이동 거부
  a.s.emit('state', { x: me.x + 2000, y: me.y, angle: 0, flashlight: true, sprinting: false });
  const corr = await a.waitFor('correct');
  check(Math.abs(corr.x - (me.x + 5)) < 0.2, '순간이동 시도 → correct 로 원위치');
  a.s.emit('state', { x: 2, y: 2, angle: 0, flashlight: true, sprinting: false }); // (0,0) 은 외벽
  await sleep(60);
  check(a.log.filter(e => e.ev === 'correct').length >= 2, '벽 안 좌표 → correct');

  // 5) 정상 속도로 몇 걸음 걷기 → 거부되지 않음
  const key = level.keys[0];
  const path = level.map.findPath(1, 1, key.tx, key.ty).slice(0, 4).map(t => ({ x: t.x * TS + TS / 2, y: t.y * TS + TS / 2 }));
  let pos = { x: me.x + 5, y: me.y + 3 };
  for (const wp of path) {
    while (Math.hypot(wp.x - pos.x, wp.y - pos.y) > 0.5) {
      const d = Math.hypot(wp.x - pos.x, wp.y - pos.y), s = Math.min(6, d);
      pos = { x: pos.x + (wp.x - pos.x) / d * s, y: pos.y + (wp.y - pos.y) / d * s };
      a.s.emit('state', { x: pos.x, y: pos.y, angle: 0, flashlight: false, sprinting: false });
      await sleep(50);
    }
  }
  await sleep(150);
  check(a.log.filter(e => e.ev === 'correct').length === 2, `정상 속도 이동(${path.length}칸)은 거부되지 않음`);

  // 5-2) Bob: 가장 가까운 사물함까지 걸어가서 숨기 → 이동 무시 → 나오기
  const bMe = ib.players.find(p => p.id === ib.id);
  const dist0 = level.map.bfs(1, 1);
  const li = level.lockers.map((lk, i) => ({ i, d: dist0[lk.ty * level.map.w + lk.tx] })).sort((p, q) => p.d - q.d)[0].i;
  const lk = level.lockers[li];
  const lpath = [...level.map.findPath(1, 1, lk.tx, lk.ty).map(t => ({ x: t.x * TS + TS / 2, y: t.y * TS + TS / 2 })), { x: lk.x, y: lk.y }];
  let bp = { x: bMe.x, y: bMe.y };
  const bobDied = () => b.log.some(e => e.ev === 'playerDied' && e.data.id === ib.id);
  walk: for (const wp of lpath) {
    while (Math.hypot(wp.x - bp.x, wp.y - bp.y) > 0.5) {
      const d = Math.hypot(wp.x - bp.x, wp.y - bp.y), s = Math.min(6, d);
      bp = { x: bp.x + (wp.x - bp.x) / d * s, y: bp.y + (wp.y - bp.y) / d * s };
      b.s.emit('state', { x: bp.x, y: bp.y, angle: 0, flashlight: true, sprinting: false });
      await sleep(50);
      if (bobDied()) break walk;
    }
  }
  if (bobDied()) check(true, '사물함으로 가는 도중 Bob 이 잡힘 (정상 동작, 숨기 테스트 생략)');
  else {
    b.s.emit('hide', { index: li });
    const hs = await b.waitFor('hideState', d => d.id === ib.id && d.hidden);
    check(hs.locker === li, `사물함 ${li}번에 숨기 → hideState(hidden) 수신`);
    b.s.emit('state', { x: bp.x + 20, y: bp.y, angle: 0, flashlight: true, sprinting: false });
    const sn = await a.waitFor('snapshot', s => s.t !== 0 && s.players.some(p => p.id === ib.id && p.hidden));
    const bs = sn.players.find(p => p.id === ib.id);
    check(bs.hidden && Math.abs(bs.x - lk.x) < 0.2, '숨어 있는 동안 이동 요청 무시 + 스냅샷에 hidden 반영');
    await sleep(900);
    b.s.emit('hide', { index: null });
    const out = await b.waitFor('hideState', d => d.id === ib.id && !d.hidden);
    check(out.locker === li, '다시 E → 사물함에서 나오기');
  }

  // 6) 테스트 모드 명령
  const testCmd = async (cmd, arg) => { a.s.emit('test', { cmd, arg }); return a.waitFor('testResult', d => d.cmd === cmd && !a.__seen?.has(d)); };
  const god = await testCmd('god');
  check(god.god === true, '[TEST] 무적 ON');
  a.s.emit('test', { cmd: 'tpKey' });
  const kc = await b.waitFor('keyCollected', d => d.by === ia.id);
  check(kc.count >= 1, `[TEST] 열쇠로 순간이동 → 바로 획득 (${kc.count}/${level.keys.length})`);
  a.s.emit('test', { cmd: 'spawnItem', arg: 'almondWater' });
  const it = await b.waitFor('itemSpawned', d => d.type === 'almondWater');
  check(!!it.id, '[TEST] 아몬드 워터 소환 → itemSpawned 브로드캐스트');
  const lastPos = [...a.log].reverse().find(e => e.ev === 'correct').data;
  await sleep(120);
  a.s.emit('state', { x: it.x, y: it.y, angle: 0, flashlight: false, sprinting: false });
  const picked = await b.waitFor('itemPicked', d => d.id === it.id);
  check(picked.by === ia.id && Math.hypot(it.x - lastPos.x, it.y - lastPos.y) <= 40, '아이템 위로 걸어가면 itemPicked');
  a.s.emit('test', { cmd: 'spawnEntity', arg: 'hound' });
  const withHound = await b.waitFor('snapshot', s => s.monsters.some(m => m.id.startsWith('hound-t')));
  check(!!withHound, '[TEST] 하운드 소환 → 스냅샷에 새 엔티티 등장');
  await sleep(2500);
  check(!a.log.some(e => e.ev === 'playerDied' && e.data.id === ia.id), '[TEST] 무적이면 하운드 옆에서도 죽지 않음');
  a.s.emit('test', { cmd: 'clearEntities' });
  await b.waitFor('snapshot', s => s.monsters.length === 0);
  check(true, '[TEST] 엔티티 전부 제거');
  a.s.emit('test', { cmd: 'nextLevel' });
  const r1 = await b.waitFor('round', d => d.level === 1);
  const t1 = [...new Set(r1.monsters.map(m => m.type))].sort().join(',');
  check(t1 === 'skinStealer,smiler,wanderer', `[TEST] 다음 레벨 → LEVEL 1 시작, 엔티티 ${t1}`);

  // 테스트 모드가 꺼진 방에서는 명령 무시
  const sent = [];
  const off = new GameRoom('off', { to: () => ({ emit: (e, d) => sent.push(e) }) }, () => {}, { testMode: false });
  clearInterval(off.timer);
  off.addPlayer({ id: 'x', join() {}, emit() {}, to: () => ({ emit() {} }) }, 'X');
  sent.length = 0;
  off.onTest('x', { cmd: 'nextLevel' }); off.onTest('x', { cmd: 'god' });
  check(sent.length === 0 && off.levelIndex === 0, '테스트 모드 OFF 서버는 테스트 명령을 무시');
  // 탈출구 둘레 5칸 안에는 엔티티가 생기지 않는다 (모든 레벨, 엔티티 증가 모드 포함)
  let nearExitSpawn = [];
  off.modes.moreEntities = true;
  for (let lv = 0; lv < LEVELS.length; lv++) {
    off.levelIndex = lv; off.startRound(false);
    const L = off.level, ex = L.exitIdx % L.map.w, ey = (L.exitIdx / L.map.w) | 0;
    if (L.mission.type === 'noclip' || L.info.layout === 'run') continue;
    for (const m of off.monsters) if (Math.max(Math.abs(Math.floor(m.x / TS) - ex), Math.abs(Math.floor(m.y / TS) - ey)) <= 5) nearExitSpawn.push(`${LEVELS[lv].label ?? LEVELS[lv].id}:${m.type}`);
  }
  check(!nearExitSpawn.length, `탈출구 5칸 안에 엔티티 스폰 없음${nearExitSpawn.length ? ' — ' + nearExitSpawn.join(', ') : ''}`);

  // 7) 퇴장
  b.s.disconnect();
  const left = await a.waitFor('playerLeft');
  check(left.id === ib.id, 'Bob 퇴장 → playerLeft');

  // 9) 방 코드 / 대기방 / 색 / 방장 시작
  const raw = name => {
    const sock = io(URL, { transports: ['websocket'], forceNew: true });
    const log = [];
    sock.onAny((ev, data) => log.push({ ev, data }));
    const waitFor = (ev, pred = () => true, ms = 4000) => new Promise((res, rej) => {
      const f = log.find(e => e.ev === ev && pred(e.data)); if (f) return res(f.data);
      const t = setTimeout(() => rej(new Error(`timeout ${ev} (${name})`)), ms);
      const h = (e, d) => { if (e === ev && pred(d)) { clearTimeout(t); sock.offAny(h); res(d); } };
      sock.onAny(h);
    });
    return { s: sock, log, waitFor, ready: new Promise(r => sock.on('connect', r)) };
  };
  const host = raw('Host'); await host.ready;
  host.s.emit('createRoom', { name: 'Host' });
  const lb1 = await host.waitFor('lobby');
  check(/^[A-Z2-9]{4}$/.test(lb1.code) && lb1.hostId === host.s.id && lb1.players[0].color === 'default', `방 만들기 → 코드 ${lb1.code}, 방장=본인, 기본색`);
  const guests = [];
  for (const n of ['G1', 'G2', 'G3']) {
    const g = raw(n); await g.ready; g.s.emit('joinRoom', { name: n, code: lb1.code.toLowerCase() }); guests.push(g);
    await g.waitFor('lobby', d => d.players.some(p => p.name === n));
  }
  const full = await host.waitFor('lobby', d => d.players.length === 4);
  check(new Set(full.players.map(p => p.color)).size === 4, '코드로 3명 참가 (소문자 코드도 OK) → 4명, 색이 서로 다름');
  const fifth = raw('G4'); await fifth.ready; fifth.s.emit('joinRoom', { name: 'G4', code: lb1.code });
  const err = await fifth.waitFor('joinError');
  check(/가득/.test(err.message), `5번째 참가 거부: "${err.message}"`);
  const bad = raw('X'); await bad.ready; bad.s.emit('joinRoom', { name: 'X', code: 'ZZZZ' });
  check(/없습니다/.test((await bad.waitFor('joinError')).message), '없는 코드 → 오류');
  const g1 = guests[0], g1Color = full.players.find(p => p.name === 'G1').color;
  g1.s.emit('setColor', { color: 'default' });                 // 방장이 쓰는 색 → 거부
  await sleep(150);
  const hostColorTaken = !host.log.filter(e => e.ev === 'lobby').some(e => e.data.players.find(p => p.name === 'G1')?.color === 'default');
  guests[2].s.disconnect();                                       // 한 명 나가서 색 하나 비움
  const freed = await host.waitFor('lobby', d => d.players.length === 3);
  const freeColor = ['default', 'green', 'blue', 'red'].find(c => !freed.players.some(p => p.color === c));
  g1.s.emit('setColor', { color: freeColor });
  await host.waitFor('lobby', d => d.players.find(p => p.name === 'G1')?.color === freeColor);
  check(hostColorTaken && freeColor !== g1Color, `색 변경: 남이 쓰는 색은 거부, 빈 색(${freeColor})으로 변경됨`);
  // 게임 모드: 기본은 모두 켜짐, 방장만 켜고 끌 수 있다
  const modesOn = freed.modes && ['mimic', 'finger', 'hideNames'].every(k => freed.modes[k] === true) && freed.modes.mapPlayers === false && freed.modes.noFlashlight === false;
  g1.s.emit('setMode', { mode: 'hideNames', on: false });           // 방장 아님 → 무시
  await sleep(150);
  const guestBlocked = !host.log.filter(e => e.ev === 'lobby').some(e => e.data.modes?.hideNames === false);
  host.s.emit('setMode', { mode: 'finger', on: false });
  await g1.waitFor('lobby', d => d.modes?.finger === false);
  check(modesOn && guestBlocked, '게임 모드: 기본값(흉내·뻐큐·이름 숨김 켜짐, 새 모드 꺼짐), 방장만 바꿀 수 있음');
  g1.s.emit('startMatch');                                        // 방장 아님 → 무시
  await sleep(200);
  check(!g1.log.some(e => e.ev === 'init'), '방장이 아니면 시작 불가');
  host.s.emit('startMatch');
  const [hi, gi] = await Promise.all([host.waitFor('init'), g1.waitFor('init')]);
  check(hi.seed === gi.seed && hi.players.length === 3 && gi.id === g1.s.id, '방장 시작 → 3명 모두 같은 게임 init');
  check(gi.modes?.finger === false && gi.modes?.hideNames === true, '게임 시작 시 방장이 정한 모드가 전달됨');
  const wcol = hi.monsters.filter(m => m.type === 'wanderer').map(m => m.color);
  check(wcol.length > 0 && wcol.every(c => ['default', 'green', 'blue', 'red'].includes(c)), `방랑자 방호복 색 랜덤: ${wcol.join(',')}`);
  host.s.disconnect();
  const newHost = await g1.waitFor('playerLeft', d => d.id === hi.id);
  check(!!newHost, '방장이 나가도 게임은 계속 (방장 위임)');
  for (const x of [fifth, bad, ...guests]) x.s.disconnect();

  // 10) 혼자 하기: 바로 시작, 코드로 참가 불가
  const solo = raw('Solo'); await solo.ready;
  solo.s.emit('solo', { name: 'Solo', color: 'red' });
  const si = await solo.waitFor('init');
  check(si.players.length === 1 && si.players[0].color === 'red' && si.room.startsWith('SOLO-'), '혼자 하기 → 바로 시작, 고른 색 적용');
  // ESC 일시정지: 혼자 하기는 서버도 멈춤
  solo.s.emit('pause', { paused: true });
  await solo.waitFor('paused', d => d.paused === true);
  await sleep(100);
  const before = solo.log.filter(e => e.ev === 'snapshot').length;
  await sleep(500);
  const during = solo.log.filter(e => e.ev === 'snapshot').length - before;
  solo.s.emit('pause', { paused: false });
  await solo.waitFor('paused', d => d.paused === false);
  const resumeMark = solo.log.length;
  await sleep(300);
  const after = solo.log.slice(resumeMark).filter(e => e.ev === 'snapshot').length;
  check(during === 0 && after > 0, `혼자 하기 ESC → 서버 일시정지 (정지 중 스냅샷 ${during}개, 재개 후 ${after}개)`);
  // 멀티 방에서는 pause 무시
  const markA = a.log.length;
  a.s.emit('pause', { paused: true });
  await sleep(400);
  const aNew = a.log.slice(markA);
  check(!aNew.some(e => e.ev === 'paused') && aNew.some(e => e.ev === 'snapshot'), '멀티 방은 ESC 해도 서버가 계속 돌아감');
  const peek = raw('Peek'); await peek.ready; peek.s.emit('joinRoom', { name: 'P', code: si.room.replace('SOLO-', '') });
  check(!!(await peek.waitFor('joinError')), '혼자 하기 방은 코드로 참가 불가');
  // 11) Level Fun: 파티고어만 등장 (테스트 명령으로 이동)
  solo.s.emit('test', { cmd: 'setLevel', arg: LV('THE PARTY') });
  const fun = await solo.waitFor('round', d => d.level === LV('THE PARTY'));
  const ft = [...new Set(fun.monsters.map(m => m.type))].join(',');
  check(ft === 'partygoer' && fun.monsters.length === 6 && fun.monsters.every(m => m.state === 'guard'), `LEVEL FUN =) → 파티고어 ${fun.monsters.length}마리, 모두 제자리 감시`);
  // 12) 인벤토리 / 아이템 사용 / 감정 표현
  solo.s.emit('test', { cmd: 'spawnItem', arg: 'camera' });
  const cam = await solo.waitFor('itemSpawned', d => d.type === 'camera');
  const soloPos = [...solo.log].reverse().find(e => e.ev === 'round').data.players[0];
  await sleep(100);
  solo.s.emit('state', { x: cam.x, y: cam.y, angle: 0, flashlight: true, sprinting: false, crouching: false });
  const inv1 = await solo.waitFor('inventory', d => d.inv.some(it => it?.type === 'camera'));
  check(inv1.inv[0].type === 'camera' && inv1.inv[0].uses === 3 && Math.hypot(cam.x - soloPos.x, cam.y - soloPos.y) < 40, '아이템 줍기 → 인벤토리 1번 칸 (카메라, 3회)');
  solo.s.emit('useItem', { slot: 0 });
  const used = await solo.waitFor('itemUsed', d => d.type === 'camera');
  const inv2 = await solo.waitFor('inventory', d => d.inv[0]?.uses === 2);
  check(!!used && inv2.inv[0].uses === 2, '카메라 사용 → itemUsed 브로드캐스트, 남은 횟수 2');
  // 12-1) 아이템 버리기: 발밑에 남은 횟수 그대로 떨어지고, 버린 사람은 제자리에서 바로 다시 줍지 않는다
  solo.s.emit('dropItem', { slot: 0 });
  const dropped = await solo.waitFor('itemSpawned', d => d.type === 'camera' && d.uses === 2);
  const inv3 = await solo.waitFor('inventory', d => d.inv.every(x => !x));
  await sleep(100);
  solo.s.emit('state', { x: cam.x + 1, y: cam.y, angle: 0, flashlight: true, sprinting: false, crouching: false });
  await sleep(250);
  const last = [...solo.log].reverse().find(e => e.ev === 'inventory').data;
  check(!!dropped && inv3.inv.every(x => !x) && last.inv.every(x => !x) && Math.hypot(dropped.x - cam.x, dropped.y - cam.y) < 20,
    '아이템 버리기 → 발밑에 남은 횟수(2) 그대로, 버린 자리에서 바로 다시 줍지 않음');
  solo.s.emit('dropItem', null);                                    // 잘못된 데이터도 서버가 버틴다
  // 12-2) 칸 번호 고정: 1번 칸을 다 써도 2번 칸 아이템은 2번 칸에 그대로
  const soloRoom = game.rooms.get([...solo.log].reverse().find(e => e.ev === 'init').data.room);
  const sp = soloRoom.players.get(solo.s.id);
  sp.inv = [{ type: 'flare', uses: 1 }, { type: 'compass', uses: 1 }, null, null];
  solo.s.emit('useItem', { slot: 0 });
  const fixed = await solo.waitFor('inventory', d => !d.inv[0] && d.inv[1]?.type === 'compass');
  check(fixed.inv.length === 4 && fixed.inv[1].type === 'compass', '아이템을 다 써도 뒤 칸이 앞으로 당겨지지 않음 (칸 고정)');
  sp.inv = [null, null, null, null];
  // 12-3) 라운드가 다시 시작되면(레벨 0 = 빈손) 화면의 가방도 같이 비워진다
  sp.inv = [{ type: 'flare', uses: 1 }, null, null, null];
  const markInv = solo.log.length;
  soloRoom.levelIndex = 0; soloRoom.startRound();
  await sleep(150);
  const invAfter = solo.log.slice(markInv).filter(e => e.ev === 'inventory').pop()?.data;
  check(!!invAfter && invAfter.inv.every(x => !x), '라운드 재시작(레벨 0) 때 비워진 가방이 화면에도 전달됨');
  solo.s.emit('emote', { i: 1 });
  const em = await solo.waitFor('emote', d => d.i === 1);
  solo.s.emit('emote', { i: 2 });                                  // 쿨다운 안이라 무시
  await sleep(250);
  check(em.id === solo.s.id && !solo.log.some(e => e.ev === 'emote' && e.data.i === 2), '감정 표현 → 모두에게 emote, 연속 사용은 쿨다운');
  // 13) LEVEL END(도서관) 탈출 → 다음은 LEVEL 3999, 3999 탈출 → 엔딩
  solo.s.emit('test', { cmd: 'setLevel', arg: END });
  const endRound = await solo.waitFor('round', d => d.level === END);
  const et = [...new Set(endRound.monsters.map(m => m.type))].join(',');
  solo.s.emit('test', { cmd: 'unlockExit' });
  await solo.waitFor('keyCollected', d => d.unlocked);
  solo.s.emit('test', { cmd: 'tpExit' });
  const endEnd = await solo.waitFor('roundEnd', () => true, 6000);
  check(et === 'scratcher' && endEnd.nextLevel === FINAL, `LEVEL END(스크래처) 탈출 → 다음은 LEVEL 3999 (${endEnd.nextLevel})`);
  await solo.waitFor('round', d => d.level === FINAL, 12000);
  solo.s.emit('test', { cmd: 'unlockExit' });
  await solo.waitFor('keyCollected', d => d.unlocked);
  solo.s.emit('test', { cmd: 'tpExit' });
  const done = await solo.waitFor('gameComplete', () => true, 6000);
  check(done.escaped.includes('Solo'), `LEVEL 3999 탈출 → gameComplete 엔딩 (생존자 ${done.escaped.join(',')})`);
  for (const [lv, want] of [[LV('ABANDONED OFFICE'), 'wanderer,windows'], [LV('TERROR HOTEL'), 'deathmoth,hound'], [LV('LIGHTS OUT'), 'wretch'],
    [LV('THE SUBURBS'), 'wanderer,watch,wretch'], [LV('FIELD OF WHEAT'), 'faceling'], [LV('THE POOLROOMS'), 'clump'], [LV('SCHOOL HALLS'), 'partyPooper,partygoer,smiler'],
    [LV('MOTION'), 'animatedKing,animation'], [LV('COURTYARD OF WINDOWS'), 'aranea,windows'], [LV("KITTY'S HOUSE"), 'kitty'],
    [LV('BOILER ROOM'), 'beast'], [LV('THALASSOPHOBIA'), 'seaThing'], [LV('CAVE SYSTEM'), 'crawler,deathrat'], [LV('HARVEST NIGHT'), 'jackLantern'],
    [LV('THE ENDLESS CITY'), 'watch'], [LV('THE PARKING GARAGE'), 'smiler'], [LV('INFINITE APARTMENTS'), 'duller,sheet'], [FINAL, 'duller,smiler']]) {
    const g = raw('L' + lv); await g.ready; g.s.emit('solo', { name: 'L' + lv });
    await g.waitFor('init');
    g.s.emit('test', { cmd: 'setLevel', arg: lv });
    const r = await g.waitFor('round', d => d.level === lv);
    const ty = [...new Set(r.monsters.map(m => m.type))].sort().join(',');
    check(ty === want, `${LEVELS[lv].name} 엔티티 = ${ty}`);
    g.s.disconnect();
  }
  solo.s.disconnect(); peek.s.disconnect();

  // 14) 오프닝: 처음 Level 0 은 story=true, 다음 라운드부터는 없음
  const pz = raw('Pz'); await pz.ready;
  pz.s.emit('solo', { name: 'Pz' });
  const pzInit = await pz.waitFor('init');
  check(pzInit.story === true && pzInit.level === 0, '혼자 하기 첫 Level 0 → 오프닝(story) 표시');
  check(si.story === true && hi.story === true, '멀티(방장 시작)도 첫 Level 0 에 오프닝');
  // 15) 퍼즐 단말기: 걸어 들어가도 안 주워지고, 오답 → 경보, 정답 → 열쇠
  pz.s.emit('test', { cmd: 'god' }); await pz.waitFor('testResult', d => d.cmd === 'god');
  pz.s.emit('test', { cmd: 'setLevel', arg: 1 });
  const r3 = await pz.waitFor('round', d => d.level === 1);
  check(!r3.story, '레벨 이동 후 라운드엔 오프닝 없음');
  const lv3 = generateLevel(r3.seed, 1);
  let pzIdx = -1;
  for (let n = 0; n < 8 && pzIdx < 0; n++) {           // 가장 가까운 열쇠로 순간이동 → 퍼즐 단말기에 도착할 때까지
    const mark = pz.log.length;
    pz.s.emit('test', { cmd: 'tpKey' });
    await pz.waitFor('testResult', d => d.cmd === 'tpKey' && pz.log.indexOf(pz.log.find(e => e.data === d)) >= mark);
    const at = [...pz.log].reverse().find(e => e.ev === 'correct').data;
    pzIdx = lv3.keys.findIndex(k => k.puzzle && Math.hypot(k.x - at.x, k.y - at.y) < 1);
  }
  check(pzIdx >= 0 && !pz.log.some(e => e.ev === 'keyCollected' && e.data.index === pzIdx), `퍼즐 단말기(${lv3.keys[pzIdx]?.puzzle?.type}) 위에 서도 열쇠가 그냥 주워지지 않음`);
  const pzz = lv3.keys[pzIdx].puzzle, right = solve(pzz);
  pz.s.emit('solvePuzzle', { index: pzIdx, answer: pzz.type === 'memory' ? [...right.slice(0, -1), (right.at(-1) + 1) % pzz.pads] : [99] });
  const alarm = await pz.waitFor('puzzleAlarm', d => d.index === pzIdx);
  check(alarm.by === pz.s.id && !pz.log.some(e => e.ev === 'keyCollected' && e.data.index === pzIdx), '오답 제출 → puzzleAlarm (열쇠 없음)');
  pz.s.emit('solvePuzzle', { index: pzIdx, answer: right });
  const solved = await pz.waitFor('keyCollected', d => d.index === pzIdx);
  check(solved.by === pz.s.id, '정답 제출 → 그 단말기의 열쇠 획득');
  pz.s.disconnect();

  // 16) 정신력: 아몬드 워터로 회복, 바닥나면 터져서 사망 (entityType 'sanity')
  const sn = raw('San'); await sn.ready;
  sn.s.emit('solo', { name: 'San' });
  await sn.waitFor('init');
  sn.s.emit('test', { cmd: 'setLevel', arg: 1 });              // 오프닝 대기시간 없이 시작
  await sn.waitFor('round', d => d.level === 1);
  await sleep(5000);                                            // 엔티티 대기(SPAWN_GRACE) 끝날 때까지
  for (let i = 0; i < 4; i++) sn.s.emit('test', { cmd: 'drainSanity' });
  const low = await sn.waitFor('snapshot', d => d.players[0].sanity <= 1);
  sn.s.emit('test', { cmd: 'spawnItem', arg: 'almondWater' });
  const aw = await sn.waitFor('itemSpawned', d => d.type === 'almondWater');
  await sleep(100);
  sn.s.emit('state', { x: aw.x, y: aw.y, angle: 0, flashlight: true, sprinting: false });
  await sn.waitFor('inventory', d => d.inv.some(it => it?.type === 'almondWater'));
  const slot = [...sn.log].reverse().find(e => e.ev === 'inventory').data.inv.findIndex(it => it?.type === 'almondWater');
  const afterMark = async (mark, ev, pred, ms = 4000) => {      // mark 이후에 온 이벤트만
    for (let w = 0; w < ms; w += 50) { const e = sn.log.slice(mark).find(e => e.ev === ev && pred(e.data)); if (e) return e.data; await sleep(50); }
    throw new Error('timeout ' + ev);
  };
  const sanBefore = (await afterMark(sn.log.length, 'snapshot', () => true)).players[0].sanity;
  const mark = sn.log.length;
  sn.s.emit('useItem', { slot });
  const healed = await afterMark(mark, 'snapshot', d => d.players[0].sanity >= sanBefore + 50);
  check(!!low && sanBefore <= 2 && healed.players[0].sanity >= sanBefore + 50, `아몬드 워터 → 정신력 회복 (${sanBefore} → ${healed.players[0].sanity})`);
  for (let i = 0; i < 3; i++) sn.s.emit('test', { cmd: 'drainSanity' });
  const burst = await sn.waitFor('playerDied', d => d.entityType === 'sanity', 12000);
  check(burst.id === sn.s.id, '정신력이 바닥나면 터져서 사망 (entityType=sanity)');
  sn.s.disconnect();

  // 17) LEVEL ! (질주): 열쇠 없이 출구 열림, 괴물 떼가 밀려와 가만히 있으면 죽음, 출구로 나가면 END 로
  const rn = raw('Run'); await rn.ready;
  rn.s.emit('solo', { name: 'Run' });
  await rn.waitFor('init');
  rn.s.emit('test', { cmd: 'setLevel', arg: RUN });
  const r7 = await rn.waitFor('round', d => d.level === RUN);
  const lv7 = generateLevel(r7.seed, RUN);
  check(r7.exitUnlocked && r7.keys.length === 0 && r7.horde && r7.monsters.length === 0 && lv7.map.w === 241,
    `LEVEL ! → 출구 열림, 열쇠 0, 괴물 떼 시작 x=${r7.horde?.x}, 복도 ${lv7.map.w}칸`);
  const caught = await rn.waitFor('playerDied', d => d.entityType === 'horde', 15000);
  check(caught.id === rn.s.id, '가만히 있으면 괴물 떼에게 잡힘 (entityType=horde)');
  await rn.waitFor('roundEnd');
  rn.s.emit('test', { cmd: 'setLevel', arg: RUN });
  await rn.waitFor('round', d => d.level === RUN && d.round !== r7.round);
  rn.s.emit('test', { cmd: 'tpExit' });
  const runEnd = await rn.waitFor('roundEnd', d => d.escaped.includes('Run'), 8000);
  check(runEnd.nextLevel === END, `LEVEL ! 출구 탈출 → 다음은 END (${runEnd.nextLevel})`);
  rn.s.disconnect();

  // 18) 미션: 배달 (Level 3 퓨즈) — 줍기(최대 2개) → 배전반에 넣기 → 다 넣으면 출구 열림
  const dv = raw('Dv'); await dv.ready;
  dv.s.emit('solo', { name: 'Dv' }); await dv.waitFor('init');
  dv.s.emit('test', { cmd: 'god' }); await dv.waitFor('testResult', d => d.cmd === 'god');
  dv.s.emit('test', { cmd: 'setLevel', arg: 3 });
  const r3d = await dv.waitFor('round', d => d.level === 3);
  check(r3d.keys.length === 0 && r3d.obj?.type === 'deliver' && r3d.obj.parts.length === 4 && !r3d.exitUnlocked, 'LEVEL 3 → 퓨즈 배달 미션 (열쇠 없음, 퓨즈 4개)');
  let maxHeld = 0;
  for (let n = 0; n < 14 && !dv.log.some(e => e.ev === 'objective' && e.data.unlocked); n++) {
    const mark = dv.log.length;
    dv.s.emit('test', { cmd: 'tpKey' });
    await dv.waitFor('testResult', d => d.cmd === 'tpKey' && dv.log.indexOf(dv.log.find(e => e.data === d)) >= mark);
    const o = [...dv.log].reverse().find(e => e.ev === 'objective')?.data.obj;
    if (o) maxHeld = Math.max(maxHeld, o.parts.filter(pt => pt.s === 1).length);
  }
  const dvDone = dv.log.find(e => e.ev === 'objective' && e.data.unlocked)?.data;
  check(dv.log.some(e => e.ev === 'objective' && e.data.kind === 'pick') && maxHeld === MISSION.CARRY && dvDone?.obj.done === 4,
    `퓨즈 줍기 (한 번에 최대 ${maxHeld}개) → 배전반에 4개 → 출구 열림`);
  // 배달: 부품을 든 채 죽으면 그 자리에 떨어진다
  dv.s.emit('test', { cmd: 'setLevel', arg: 3 });
  await dv.waitFor('round', d => d.level === 3 && d.round !== r3d.round);
  dv.s.emit('test', { cmd: 'god' });
  dv.s.emit('test', { cmd: 'tpKey' });
  await dv.waitFor('objective', d => d.kind === 'pick' && d.obj.parts.some(pt => pt.s === 1));
  await sleep(5000);
  for (let i = 0; i < 4; i++) dv.s.emit('test', { cmd: 'drainSanity' });
  const drop = await dv.waitFor('objective', d => d.kind === 'drop', 12000);
  check(drop.obj.parts.every(pt => pt.s !== 1), '부품을 든 채 죽으면 그 자리에 떨어뜨림');
  dv.s.disconnect();

  // 19) 미션: 작동 (Level 2 밸브) — 옆에 서 있기만 해선 안 되고, turnValve 로 돌려야 한다 / 생존 (Level 5) — 남은 시간이 줄어든다
  const ac = raw('Ac'); await ac.ready;
  ac.s.emit('solo', { name: 'Ac' }); await ac.waitFor('init');
  ac.s.emit('test', { cmd: 'god' }); await ac.waitFor('testResult', d => d.cmd === 'god');
  ac.s.emit('test', { cmd: 'setLevel', arg: 2 });
  const r2 = await ac.waitFor('round', d => d.level === 2);
  const lv2 = generateLevel(r2.seed, 2);
  check(lv2.stations.every(st => lv2.map.isSolid(st.tx, st.ty - 1)), '증기 밸브는 모두 벽에 붙어 있음');
  ac.s.emit('test', { cmd: 'tpKey' });
  await ac.waitFor('testResult', d => d.cmd === 'tpKey');
  const at2 = [...ac.log].reverse().find(e => e.ev === 'correct').data;
  const vi = lv2.stations.findIndex(st => Math.hypot(st.x - at2.x, st.y - at2.y) < 1);
  await sleep(5500);                                               // 엔티티 대기 끝 + 가만히 서 있기
  const idle = [...ac.log].reverse().find(e => e.ev === 'snapshot' && e.data.obj)?.data.obj;
  check(vi >= 0 && idle.prog.every(v => v === 0), '밸브 옆에 서 있기만 해선 안 돌아감');
  ac.s.emit('turnValve', { index: vi, delta: 1000 });               // 한 번에 너무 많이 돌리면 서버가 잘라낸다
  await sleep(200);
  const clip = [...ac.log].reverse().find(e => e.ev === 'snapshot' && e.data.obj)?.data.obj;
  check(clip.prog[vi] > 0 && clip.prog[vi] < 0.5, `한 번에 크게 돌려도 조금만 인정 (${clip.prog[vi]})`);
  for (let n = 0; n < 300; n++) ac.s.emit('turnValve', { index: vi, delta: 1.0 });   // 한꺼번에 쏟아부어도
  await sleep(250);
  const flood = [...ac.log].reverse().find(e => e.ev === 'snapshot' && e.data.obj)?.data.obj;
  check(flood.prog[vi] < 0.75 && !ac.log.some(e => e.ev === 'objective' && e.data.kind === 'activate'), `메시지를 연타해도 돌리는 속도 제한은 그대로 (${flood.prog[vi]})`);
  for (let n = 0; n < 40 && !ac.log.some(e => e.ev === 'objective' && e.data.kind === 'activate'); n++) { ac.s.emit('turnValve', { index: vi, delta: 1.0 }); await sleep(70); }
  const turned = ac.log.find(e => e.ev === 'objective' && e.data.kind === 'activate')?.data;
  check(turned?.obj.prog[vi] === 1 && turned.obj.done === 1, `시계 방향으로 계속 돌리면 밸브 잠김 (${turned?.obj.done}/4)`);
  ac.s.emit('test', { cmd: 'unlockExit' });
  const acDone = await ac.waitFor('objective', d => d.unlocked);
  check(acDone.obj.done === 4, '밸브 4개 다 잠그면 출구 열림');
  ac.s.emit('test', { cmd: 'setLevel', arg: LV('TERROR HOTEL') });
  const r5 = await ac.waitFor('round', d => d.level === LV('TERROR HOTEL'));
  await sleep(5500);
  const sv = [...ac.log].reverse().find(e => e.ev === 'snapshot' && e.data.obj)?.data.obj;
  check(r5.obj?.type === 'survive' && sv && sv.left < r5.obj.left && !r5.exitUnlocked, `LEVEL 5 생존 미션: 남은 시간 ${r5.obj?.left} → ${sv?.left}`);
  ac.s.emit('test', { cmd: 'unlockExit' });
  const svDone = await ac.waitFor('objective', d => d.unlocked && d.kind === 'survive');
  check(!!svDone, '생존 시간이 끝나면 출구 열림');
  ac.s.disconnect();

  // 21) Level Fun 풍선: E 로 터뜨리면 소리(10칸)를 근처 파티고어가 듣고 온다, 아주 드물게 아이템
  const bl = raw('Bl'); await bl.ready;
  bl.s.emit('solo', { name: 'Bl' }); await bl.waitFor('init');
  bl.s.emit('test', { cmd: 'god' }); await bl.waitFor('testResult', d => d.cmd === 'god');
  bl.s.emit('test', { cmd: 'setLevel', arg: LV('THE PARTY') });
  const rf = await bl.waitFor('round', d => d.level === LV('THE PARTY'));
  check(generateLevel(rf.seed, LV('THE PARTY')).keys.every(k => k.puzzle?.type === 'arcade'), 'Level Fun 게임기 = 전부 파티 팝(아케이드)');
  await sleep(5000);                                                // 엔티티 대기 끝
  bl.s.emit('test', { cmd: 'clearEntities' });
  bl.s.emit('test', { cmd: 'tpBalloon' });
  const tb = await bl.waitFor('testResult', d => d.cmd === 'tpBalloon');
  bl.s.emit('test', { cmd: 'spawnEntity', arg: 'partygoer' });       // 3~5칸 거리
  await bl.waitFor('testResult', d => d.cmd === 'spawnEntity');
  CONFIG.BALLOON.ITEM_CHANCE = 1;                                    // 같은 프로세스의 서버 — 아이템 확률을 잠깐 100% 로
  bl.s.emit('popBalloon', { index: tb.index });
  const pop = await bl.waitFor('balloonPopped', d => d.index === tb.index);
  CONFIG.BALLOON.ITEM_CHANCE = 0.0001;
  const heard = await bl.waitFor('snapshot', d => d.monsters.some(m => m.type === 'partygoer' && (m.state === 'investigate' || m.state === 'chase')), 3000).catch(() => null);
  check(!!pop && !!pop.item && bl.log.some(e => e.ev === 'itemSpawned' && e.data.type === pop.item), `풍선 터뜨리기 → balloonPopped + (확률) 아이템 ${pop.item}`);
  check(!!heard, '터지는 소리를 근처 파티고어가 듣고 확인하러 옴');
  const bmark = bl.log.length;
  bl.s.emit('popBalloon', { index: tb.index });                     // 이미 터진 풍선
  await sleep(200);
  check(!bl.log.slice(bmark).some(e => e.ev === 'balloonPopped'), '이미 터진 풍선은 다시 안 터짐');
  bl.s.disconnect();

  // 22) Level 52 파티 푸퍼: 말 걸면 남은 단말기까지 안내, 그 열쇠를 먹으면 사라진다
  const pp = raw('Pp'); await pp.ready;
  pp.s.emit('solo', { name: 'Pp' }); await pp.waitFor('init');
  pp.s.emit('test', { cmd: 'god' }); await pp.waitFor('testResult', d => d.cmd === 'god');
  pp.s.emit('test', { cmd: 'setLevel', arg: LV('SCHOOL HALLS') });
  await pp.waitFor('round', d => d.level === LV('SCHOOL HALLS'));
  await sleep(5000);
  pp.s.emit('test', { cmd: 'tpPooper' });
  const tp = await pp.waitFor('testResult', d => d.cmd === 'tpPooper');
  pp.s.emit('interact', { mid: tp.mid });
  const talk = await pp.waitFor('entityEvent', d => d.id === tp.mid && d.kind === 'voice');
  const guiding = await pp.waitFor('snapshot', d => d.monsters.some(m => m.id === tp.mid && m.state === 'guide'));
  check(talk.text === '따라와...' && !!guiding, '파티 푸퍼에게 말 걸기 → "따라와..." 하고 안내 시작');
  pp.s.emit('test', { cmd: 'unlockExit' });                         // 열쇠를 전부 먹으면
  const poof = await pp.waitFor('entityEvent', d => d.id === tp.mid && d.kind === 'poof', 3000).catch(() => null);
  await sleep(200);
  const ppAfter = [...pp.log].reverse().find(e => e.ev === 'snapshot').data;
  check(!!poof && !ppAfter.monsters.some(m => m.id === tp.mid), '안내하던 열쇠를 먹으면 파티 푸퍼가 사라짐');
  pp.s.disconnect();

  // 23) 채팅 / 보이스 챗 중계 / 말하는 소리
  const c1 = raw('C1'); await c1.ready;
  c1.s.emit('createRoom', { name: 'Chatter' });
  const lob = await c1.waitFor('lobby');
  const c2 = raw('C2'); await c2.ready;
  c2.s.emit('joinRoom', { name: 'Talker', code: lob.code });
  await c2.waitFor('lobby', d => d.players.length === 2);
  c1.s.emit('chat', { text: '  안녕하세요  ' + 'x'.repeat(200) });
  const got = await c2.waitFor('chat');
  check(got.name === 'Chatter' && got.text.startsWith('안녕하세요') && got.text.length === 120, `채팅: 같은 방에 전달, 제어문자 제거, 120자 제한 ("${got.text.slice(0, 8)}…")`);
  c1.s.emit('chat', { text: '도배' });
  await sleep(200);
  check(!c2.log.some(e => e.ev === 'chat' && e.data.text === '도배'), '채팅: 0.6초 안에 연달아 보내면 무시');
  c1.s.emit('rtc', { to: '*', d: { t: 'hello' } });
  const hello = await c2.waitFor('rtc', d => d.d?.t === 'hello');
  c2.s.emit('rtc', { to: c1.s.id, d: { t: 'sdp', type: 'offer', sdp: 'v=0' } });
  const sdp = await c1.waitFor('rtc', d => d.d?.t === 'sdp');
  c2.s.emit('rtc', { to: c1.s.id, d: { t: 'sdp', sdp: 'x'.repeat(20000) } });   // 너무 큰 데이터는 버림
  await sleep(200);
  check(hello.from === c1.s.id && sdp.from === c2.s.id && c1.log.filter(e => e.ev === 'rtc').length === 1, '보이스 챗 연결 정보: 같은 방에만 중계, 너무 크면 버림');
  c1.s.emit('startMatch');
  await c1.waitFor('init'); await c2.waitFor('init');
  const room = game.rooms.get(lob.code), talker = room.players.get(c2.s.id);
  c2.s.emit('speaking', { on: true });
  await sleep(150);
  check(!(talker.voiceUntil > Date.now()), '보이스 챗으로 말해도 엔티티를 부르는 소리로 치지 않음');
  c2.s.emit('voiceState', { vc: 2 });
  const muted = await c1.waitFor('snapshot', d => d.players.some(p => p.id === c2.s.id && p.vc === 2));
  c2.s.emit('voiceState', { vc: 'hack' });                             // 이상한 값은 무시
  await sleep(150);
  check(!!muted && talker.vc === 2, '보이스 상태(음소거)가 스냅샷으로 다른 사람에게 전달 (이름표 옆 아이콘)');
  c2.s.emit('gesture', { g: 'finger' });
  const gst = await c1.waitFor('gesture', d => d.id === c2.s.id);
  c2.s.emit('gesture', { g: 'dance1' });                             // 1초 쿨다운
  c2.s.emit('gesture', { g: 'nope' });
  await sleep(200);
  check(gst.g === 'finger' && c1.log.filter(e => e.ev === 'gesture').length === 1, '이모트 동작(뻐큐) → 모두에게 전달, 연타·이상한 값은 무시');
  await sleep(1000);
  c2.s.emit('gesture', { g: 'twerk' });
  const tw = await c1.waitFor('gesture', d => d.g === 'twerk');
  check(tw.id === c2.s.id, '트월킹 이모트 → 모두에게 전달');
  // 멀티플레이 시체: 죽은 자리에 시체 + 가방 아이템이 시체 위에 떨어진다
  talker.inv = [{ type: 'almondWater', uses: 1 }, { type: 'flare', uses: 1 }, null, null];
  talker.status = 'dead';
  room.emit('playerDied', { id: talker.id, entityType: 'howler', x: Math.round(talker.x), y: Math.round(talker.y) });
  const corpse = await c1.waitFor('corpse', d => d.pid === talker.id);
  await sleep(100);
  const corpseDrops = c1.log.filter(e => e.ev === 'itemSpawned' && e.data.corpseOf === talker.id).map(e => e.data);
  check(Math.abs(corpse.x - talker.x) < 1 && talker.inv.every(x => !x) && corpseDrops.length === 2 && corpseDrops.every(d => Math.hypot(d.x - corpse.x, d.y - corpse.y) < 16),
    '멀티에서 죽으면 시체가 남고, 가방 아이템 2개가 시체 위에 떨어짐');
  // 전멸 → 시체 위에 남은 아이템은 주인 가방으로 돌아간다
  const chatter = room.players.get(c1.s.id);
  chatter.status = 'dead';
  room.emit('playerDied', { id: chatter.id, entityType: 'howler', x: Math.round(chatter.x), y: Math.round(chatter.y) });
  room.checkRoundEnd();
  check(room.phase === 'ended' && talker.inv.filter(Boolean).length === 2 && room.corpses.length === 2, '전멸하면 시체 위에 남은 아이템은 주인에게 돌아감');
  c1.s.disconnect(); c2.s.disconnect();

  // 20) Level 94: 밤 주기 — 예고(warn) → 밤(night) 이벤트, 라운드 상태에 night 포함
  const nt = raw('Nt'); await nt.ready;
  nt.s.emit('solo', { name: 'Nt' }); await nt.waitFor('init');
  nt.s.emit('test', { cmd: 'god' }); await nt.waitFor('testResult', d => d.cmd === 'god');
  nt.s.emit('test', { cmd: 'setLevel', arg: LV('MOTION') });
  const r94 = await nt.waitFor('round', d => d.level === LV('MOTION'));
  check(r94.night === 'day' && r94.obj?.type === 'survive', 'LEVEL 94 → 낮에서 시작, 생존 미션');
  nt.s.disconnect();

  // 8) 혼자 남은 Alice 가 죽거나 남은 상태 → health 확인
  const health = await (await fetch(`${URL}/health`)).json();
  check(health.ok && health.rooms >= 1 && health.players >= 1 && !JSON.stringify(health).includes('smoke'), '/health 는 방 수/인원만 (방 코드 비공개)');

  a.s.disconnect();
} catch (e) {
  console.error(e);
  failed++;
} finally {
  ioServer.close();
  for (const r of game.rooms.values()) clearInterval(r.timer);
  server.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exitCode = failed ? 1 : 0;
