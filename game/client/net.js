import { io } from 'socket.io-client';
import { CONFIG } from '../../shared/config.js';

/**
 * Socket.io 클라이언트 래퍼. 서버 이벤트 'fooBar' 는 handlers.onFooBar(data) 로 전달된다.
 *
 * client → server : createRoom {name} | joinRoom {name, code} | solo {name, color} | setColor {color}
 *                   startMatch | leaveRoom | state {...} | hide {index} | test {cmd, arg} | solvePuzzle {index, answer}
 * server → client : lobby, init, round, snapshot, playerJoined, playerLeft, keyCollected, playerDied,
 *                   playerEscaped, monsterAlert, entityEvent, hideState, itemSpawned, itemPicked,
 *                   testResult, roundEnd, correct, joinError
 */
const EVENTS = [
  'lobby', 'init', 'round', 'snapshot', 'playerJoined', 'playerLeft', 'keyCollected',
  'playerDied', 'playerEscaped', 'monsterAlert', 'entityEvent', 'hideState', 'itemSpawned', 'itemPicked',
  'testResult', 'roundEnd', 'correct', 'joinError', 'paused',
  'inventory', 'itemUsed', 'emote', 'gameComplete', 'puzzleAlarm',
];

export class NetClient {
  constructor(handlers) {
    this.h = handlers;
    this.socket = null;
    this.sendAcc = 0;
  }

  /** 연결이 없으면 연결하고, 연결된 뒤 fn 실행 */
  ensure(fn) {
    if (this.socket?.connected) { fn(this.socket); return; }
    if (!this.socket) {
      const s = this.socket = io({ reconnection: false });
      s.on('connect_error', () => this.h.onError?.('서버에 연결할 수 없습니다.'));
      s.on('disconnect', reason => this.h.onDisconnect?.(reason));
      for (const ev of EVENTS) {
        const fn2 = this.h['on' + ev[0].toUpperCase() + ev.slice(1)];
        if (fn2) s.on(ev, data => fn2(data));
      }
    }
    this.socket.once('connect', () => fn(this.socket));
  }

  get id() { return this.socket?.id; }

  createRoom(name) { this.ensure(s => s.emit('createRoom', { name })); }
  joinRoom(name, code) { this.ensure(s => s.emit('joinRoom', { name, code })); }
  solo(name, color) { this.ensure(s => s.emit('solo', { name, color })); }
  setColor(color) { this.socket?.emit('setColor', { color }); }
  startMatch() { this.socket?.emit('startMatch'); }
  leaveRoom() { this.socket?.emit('leaveRoom'); }
  pause(paused) { this.socket?.emit('pause', { paused }); }
  useItem(slot) { this.socket?.emit('useItem', { slot }); }
  emote(i) { this.socket?.emit('emote', { i }); }
  /** 퍼즐 단말기 정답 제출 — 판정은 서버가 한다 (맞으면 keyCollected, 틀리면 puzzleAlarm) */
  solvePuzzle(index, answer) { this.socket?.emit('solvePuzzle', { index, answer }); }

  /** 사물함 들어가기(index) / 나오기(null) 요청 — 판정은 서버가 한다 */
  hide(index) { this.socket?.emit('hide', { index }); }

  /** 테스트 모드 명령 (서버가 testMode 일 때만 처리됨) */
  test(cmd, arg) { this.socket?.emit('test', { cmd, arg }); }

  disconnect() {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }

  sendState(player, dt) {
    if (!this.socket?.connected) return;
    this.sendAcc += dt;
    if (this.sendAcc < 1 / CONFIG.NET.CLIENT_SEND_RATE) return;
    this.sendAcc = 0;
    this.socket.emit('state', player.serializeInput());
  }
}
