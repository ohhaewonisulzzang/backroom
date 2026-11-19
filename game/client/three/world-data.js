/**
 * 3D 월드 짓기에 쓰는 순수 데이터 함수 (three 없음 — node 테스트 가능)
 */

/** 바닥 칸 (x, y) 의 N/S/E/W 쪽 이웃 */
const SIDES = [['N', 0, -1], ['S', 0, 1], ['E', 1, 0], ['W', -1, 0]];

/**
 * 벽 면 목록: 바닥 칸과 닿은 벽 면만 (바닥 칸 (tx, ty) 의 side 쪽 이웃이 벽이면 그 면 하나).
 * 바닥끼리 붙은 곳, 벽 속에 묻힌 면은 만들지 않는다.
 */
export function wallFaces(map) {
  const out = [];
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    if (map.isSolid(tx, ty)) continue;
    for (const [side, dx, dy] of SIDES) if (map.isSolid(tx + dx, ty + dy)) out.push({ tx, ty, side });
  }
  return out;
}
