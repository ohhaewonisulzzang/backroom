import { CONFIG, TS, T } from '../../shared/config.js';
import { moveEntity } from '../../shared/physics.js';
import { Input } from './input.js';
import { Sound } from './sound.js';

/** 로컬 플레이어 입력 처리 (클라이언트 예측 이동). 서버는 결과 위치를 검증한다. */
/** opts.infinite = 스태미나 무한 (질주 레벨) */
export function updateLocalPlayer(p, dt, map, cam, scale, opts = {}) {
  const C = CONFIG.PLAYER;
  let ix = 0, iy = 0;
  if (Input.down('KeyW', 'ArrowUp')) iy -= 1;
  if (Input.down('KeyS', 'ArrowDown')) iy += 1;
  if (Input.down('KeyA', 'ArrowLeft')) ix -= 1;
  if (Input.down('KeyD', 'ArrowRight')) ix += 1;
  const moving = ix !== 0 || iy !== 0;
  if (moving) { const l = Math.hypot(ix, iy); ix /= l; iy /= l; } // 8방향 정규화

  p.crouching = Input.down('KeyC');                       // 웅크리기: 느리지만 발소리가 나지 않음
  const wantSprint = moving && !p.crouching && Input.down('ShiftLeft', 'ShiftRight');
  if (p.boostT > 0) p.boostT -= dt;
  if (wantSprint && !p.exhausted && p.stamina > 0) {
    p.sprinting = true;
    if (!(p.boostT > 0) && !opts.infinite) p.stamina -= C.DRAIN * dt;   // 스테미너 드링크 효과 중 / 질주 레벨에서는 지치지 않음
    if (p.stamina <= 0) { p.stamina = 0; p.exhausted = true; }
  } else {
    p.sprinting = false;
    p.stamina = Math.min(C.STAMINA, p.stamina + C.REGEN * dt * (moving ? 0.6 : 1));
    if (p.exhausted && p.stamina > 35) p.exhausted = false;
  }

  const slow = map.get(Math.floor(p.x / TS), Math.floor(p.y / TS)) === T.SLOW ? CONFIG.RUN.SLOW : 1;   // 웅덩이/잔해
  const speed = (p.crouching ? C.CROUCH : p.sprinting ? C.SPRINT : C.WALK) * slow;
  const bx = p.x, by = p.y;
  moveEntity(p, ix * speed * dt, iy * speed * dt, C.RADIUS, map);
  const moved = Math.hypot(p.x - bx, p.y - by);
  p.moving = moved > 0.1;
  p.walkPhase += moved * 0.15;
  p.stepAcc += moved;
  if (p.stepAcc > (p.sprinting ? 46 : 36)) { p.stepAcc = 0; if (!p.crouching) Sound.step(p.sprinting); }

  // 마우스 방향 회전
  const sx = (p.x - cam.x) * scale, sy = (p.y - cam.y) * scale;
  p.angle = Math.atan2(Input.mouse.y - sy, Input.mouse.x - sx);
}
