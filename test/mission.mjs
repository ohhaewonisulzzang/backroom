// 서버 미션 처리 회귀 테스트 (소켓 없이 GameRoom 을 직접 돌린다)
//   node test/mission.mjs
import { GameRoom } from '../server/GameRoom.js';
import { LEVELS } from '../shared/config.js';

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

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exitCode = failed ? 1 : 0;
