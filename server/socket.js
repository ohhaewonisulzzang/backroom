import { GameRoom } from './GameRoom.js';
import { CONFIG } from '../shared/config.js';

const sanitizeName = v => String(v ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 12) || 'Wanderer';
const sanitizeRoom = v => String(v ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24).toLowerCase() || 'lobby';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';     // 헷갈리는 0/O, 1/I/L 제외
const sanitizeCode = v => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

/**
 * socket.io 서버에 게임 로직을 붙인다. HTTP 서버(Next.js 커스텀 서버, 테스트용 서버)와 무관하게 재사용 가능.
 *
 *  createRoom {name}          → 새 방(코드 4자리) + 대기방 입장 → 'lobby'
 *  joinRoom   {name, code}    → 코드로 대기방(또는 진행 중인 게임) 입장 → 'lobby' | 'init'
 *  solo       {name, color}   → 혼자 하기 방을 만들고 바로 시작 → 'init'
 *  setColor   {color}         → 대기방에서 방호복 색 변경 (default | green | blue | red)
 *  startMatch                 → 방장만: 게임 시작 → 모두 'init'
 *  leaveRoom                  → 방 나가기
 *  pause      {paused}        → ESC 메뉴 (혼자 하기에서만 실제 일시정지)
 *  dropItem   {slot}          → 인벤토리 아이템을 발밑에 버리기
 *  join       {name, room}    → (예전 방식) 이름으로 방에 바로 입장
 */
export function attachGameServer(io, { testMode = false } = {}) {
  const rooms = new Map();
  const newCode = () => {
    for (let n = 0; n < 1000; n++) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
    return 'R' + Date.now().toString(36).toUpperCase();
  };
  const makeRoom = (code, opts) => {
    const r = new GameRoom(code, io, () => rooms.delete(code), { testMode, ...opts });
    rooms.set(code, r);
    return r;
  };

  io.on('connection', socket => {
    let room = null;
    const fail = message => socket.emit('joinError', { message });
    // 클라이언트가 보낸 값은 믿지 않는다: 객체가 아니면 {} 로 바꾸고, 핸들러 예외가 서버 전체를 죽이지 않게 막는다
    const on = (event, fn) => socket.on(event, data => {
      try { fn(data && typeof data === 'object' ? data : {}); }
      catch (e) { console.error(`[socket ${event}]`, e); }
    });

    on('createRoom', data => {
      if (room) return;
      room = makeRoom(newCode(), { lobby: true });
      room.addToLobby(socket, sanitizeName(data.name));
    });

    on('joinRoom', data => {
      if (room) return;
      const r = rooms.get(sanitizeCode(data.code));
      if (!r || r.solo) return fail('그런 코드의 방이 없습니다.');
      if (r.isFull) return fail(`방이 가득 찼습니다 (최대 ${CONFIG.NET.MAX_PLAYERS}명).`);
      room = r;
      if (r.phase === 'lobby') r.addToLobby(socket, sanitizeName(data.name));
      else r.addPlayer(socket, sanitizeName(data.name));
    });

    on('solo', data => {
      if (room) return;
      room = makeRoom('SOLO-' + newCode(), { solo: true });
      room.addPlayer(socket, sanitizeName(data.name), data.color);
    });

    on('join', data => {      // 예전 방식 (이름으로 방 지정)
      if (room) return;
      const roomName = sanitizeRoom(data.room);
      const r = rooms.get(roomName) ?? makeRoom(roomName, {});
      if (r.isFull) return fail(`방 "${roomName}" 이 가득 찼습니다.`);
      room = r;
      r.addPlayer(socket, sanitizeName(data.name));
    });

    on('setColor', data => room?.setColor(socket.id, data?.color));
    on('startMatch', () => room?.startMatch(socket.id));
    on('pause', data => room?.setPaused(socket.id, data?.paused));
    on('leaveRoom', () => {
      if (!room) return;
      socket.leave(room.name);
      room.removePlayer(socket.id);
      room = null;
    });
    on('state', s => room?.onState(socket.id, s));
    on('hide', data => room?.onHide(socket.id, data));
    on('test', data => room?.onTest(socket.id, data));
    on('useItem', data => room?.onUseItem(socket.id, data));
    on('dropItem', data => room?.onDropItem(socket.id, data));
    on('emote', data => room?.onEmote(socket.id, data));
    on('solvePuzzle', data => room?.onSolvePuzzle(socket.id, data));
    socket.on('disconnect', () => room?.removePlayer(socket.id));
  });

  return {
    rooms,
    health() {
      return {
        ok: true,
        testMode,
        // 방 코드는 공개하지 않는다 (알면 누구나 들어올 수 있으므로). 개수만 보여준다
        rooms: rooms.size,
        players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0),
      };
    },
  };
}
