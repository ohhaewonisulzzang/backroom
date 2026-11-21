import { TS, MISSION } from '../../shared/config.js';

/**
 * 나침반이 가리킬 곳 {x, y} (px) 또는 null. 2D 화살표(hud.js)와 3D 손 나침반 바늘(three/viewmodel.js)이 같이 쓴다.
 *  - 출구가 열렸거나 '버티기' 미션이면 출구
 *  - '운반' 미션: 들 수 있는 만큼 들었으면(또는 바닥에 남은 게 없으면) 반납 장소, 아니면 가장 가까운 부품
 *  - '작동' 미션: 아직 덜 된 장치 중 가장 가까운 것
 *  - 그 밖: 가장 가까운 안 주운 열쇠 (다 주웠으면 출구)
 */
export function compassGoal(game) {
  const p = game.local, L = game.level;
  if (!p || !L) return null;
  const map = L.map, o = game.obj;
  const exit = () => ({ x: (L.exitIdx % map.w) * TS + TS / 2, y: ((L.exitIdx / map.w) | 0) * TS + TS / 2 });
  const nearest = list => {
    let best = null, bd = Infinity;
    for (const k of list) { const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < bd) { bd = d; best = k; } }
    return best ? { x: best.x, y: best.y } : null;
  };
  if (game.exitUnlocked || o?.type === 'survive') return exit();
  if (o?.type === 'deliver') {
    const held = o.parts.filter(pt => pt.s === 1 && pt.c === game.myId).length, ground = o.parts.filter(pt => pt.s === 0);
    return held >= MISSION.CARRY || (held && !ground.length) ? nearest([L.depot]) : nearest(ground);
  }
  if (o?.type === 'activate') return nearest(L.stations.filter((st, i) => (o.prog[i] || 0) < 1));
  return nearest((game.keys || []).filter(k => !k.collected)) || exit();
}

/**
 * 1인칭에서 목표가 바라보는 방향의 어느 쪽인가 (라디안): 0 = 정면, + = 오른쪽, ±π = 뒤.
 * 2D 좌표는 y 가 아래라서 각도가 시계 방향으로 커지고, 그래서 + 가 오른쪽이 된다
 */
export function relativeBearing(p, goal) {
  const d = Math.atan2(goal.y - p.y, goal.x - p.x) - p.angle;
  return Math.atan2(Math.sin(d), Math.cos(d));
}
