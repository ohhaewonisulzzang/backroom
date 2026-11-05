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
import { TS } from '../shared/config.js';
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
  g1.s.emit('startMatch');                                        // 방장 아님 → 무시
  await sleep(200);
  check(!g1.log.some(e => e.ev === 'init'), '방장이 아니면 시작 불가');
  host.s.emit('startMatch');
  const [hi, gi] = await Promise.all([host.waitFor('init'), g1.waitFor('init')]);
  check(hi.seed === gi.seed && hi.players.length === 3 && gi.id === g1.s.id, '방장 시작 → 3명 모두 같은 게임 init');
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
  solo.s.emit('test', { cmd: 'setLevel', arg: 4 });
  const fun = await solo.waitFor('round', d => d.level === 4);
  const ft = [...new Set(fun.monsters.map(m => m.type))].join(',');
  check(ft === 'partygoer' && fun.monsters.every(m => m.state === 'guard'), `LEVEL FUN =) → 파티고어 ${fun.monsters.length}마리, 모두 제자리 감시`);
  // 12) 인벤토리 / 아이템 사용 / 감정 표현
  solo.s.emit('test', { cmd: 'spawnItem', arg: 'camera' });
  const cam = await solo.waitFor('itemSpawned', d => d.type === 'camera');
  const soloPos = [...solo.log].reverse().find(e => e.ev === 'round').data.players[0];
  await sleep(100);
  solo.s.emit('state', { x: cam.x, y: cam.y, angle: 0, flashlight: true, sprinting: false, crouching: false });
  const inv1 = await solo.waitFor('inventory', d => d.inv.some(it => it.type === 'camera'));
  check(inv1.inv[0].type === 'camera' && inv1.inv[0].uses === 3 && Math.hypot(cam.x - soloPos.x, cam.y - soloPos.y) < 40, '아이템 줍기 → 인벤토리 1번 칸 (카메라, 3회)');
  solo.s.emit('useItem', { slot: 0 });
  const used = await solo.waitFor('itemUsed', d => d.type === 'camera');
  const inv2 = await solo.waitFor('inventory', d => d.inv[0]?.uses === 2);
  check(!!used && inv2.inv[0].uses === 2, '카메라 사용 → itemUsed 브로드캐스트, 남은 횟수 2');
  solo.s.emit('emote', { i: 1 });
  const em = await solo.waitFor('emote', d => d.i === 1);
  solo.s.emit('emote', { i: 2 });                                  // 쿨다운 안이라 무시
  await sleep(250);
  check(em.id === solo.s.id && !solo.log.some(e => e.ev === 'emote' && e.data.i === 2), '감정 표현 → 모두에게 emote, 연속 사용은 쿨다운');
  // 13) 마지막 레벨(END) 탈출 → 엔딩
  solo.s.emit('test', { cmd: 'setLevel', arg: 8 });
  const endRound = await solo.waitFor('round', d => d.level === 8);
  const et = [...new Set(endRound.monsters.map(m => m.type))].join(',');
  solo.s.emit('test', { cmd: 'unlockExit' });
  await solo.waitFor('keyCollected', d => d.unlocked);
  solo.s.emit('test', { cmd: 'tpExit' });
  const done = await solo.waitFor('gameComplete', () => true, 6000);
  check(et === 'scratcher' && done.escaped.includes('Solo'), `LEVEL END(스크래처) 탈출 → gameComplete 엔딩 (생존자 ${done.escaped.join(',')})`);
  for (const [lv, want] of [[5, 'deathmoth,hound'], [6, 'wretch']]) {
    const g = raw('L' + lv); await g.ready; g.s.emit('solo', { name: 'L' + lv });
    await g.waitFor('init');
    g.s.emit('test', { cmd: 'setLevel', arg: lv });
    const r = await g.waitFor('round', d => d.level === lv);
    const ty = [...new Set(r.monsters.map(m => m.type))].sort().join(',');
    check(ty === want, `LEVEL ${lv} 엔티티 = ${ty}`);
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
  pz.s.emit('test', { cmd: 'setLevel', arg: 3 });
  const r3 = await pz.waitFor('round', d => d.level === 3);
  check(!r3.story, '레벨 이동 후 라운드엔 오프닝 없음');
  const lv3 = generateLevel(r3.seed, 3);
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
  await sn.waitFor('inventory', d => d.inv.some(it => it.type === 'almondWater'));
  const slot = [...sn.log].reverse().find(e => e.ev === 'inventory').data.inv.findIndex(it => it.type === 'almondWater');
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
  rn.s.emit('test', { cmd: 'setLevel', arg: 7 });
  const r7 = await rn.waitFor('round', d => d.level === 7);
  const lv7 = generateLevel(r7.seed, 7);
  check(r7.exitUnlocked && r7.keys.length === 0 && r7.horde && r7.monsters.length === 0 && lv7.map.w === 241,
    `LEVEL ! → 출구 열림, 열쇠 0, 괴물 떼 시작 x=${r7.horde?.x}, 복도 ${lv7.map.w}칸`);
  const caught = await rn.waitFor('playerDied', d => d.entityType === 'horde', 15000);
  check(caught.id === rn.s.id, '가만히 있으면 괴물 떼에게 잡힘 (entityType=horde)');
  await rn.waitFor('roundEnd');
  rn.s.emit('test', { cmd: 'setLevel', arg: 7 });
  await rn.waitFor('round', d => d.level === 7 && d.round !== r7.round);
  rn.s.emit('test', { cmd: 'tpExit' });
  const runEnd = await rn.waitFor('roundEnd', d => d.escaped.includes('Run'), 8000);
  check(runEnd.nextLevel === 8, `LEVEL ! 출구 탈출 → 다음은 END (${runEnd.nextLevel})`);
  rn.s.disconnect();

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
