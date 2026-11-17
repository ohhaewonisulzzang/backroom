import { TS, T } from './config.js';
import { clamp } from './utils.js';

/** 원(엔티티) vs 벽 타일 충돌 해소. 모서리에서는 미끄러지듯 밀려난다. */
export function collideCircle(e, r, map) {
  const x0 = Math.floor((e.x - r) / TS), x1 = Math.floor((e.x + r) / TS);
  const y0 = Math.floor((e.y - r) / TS), y1 = Math.floor((e.y + r) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!map.isSolid(tx, ty)) continue;
    const nx = clamp(e.x, tx * TS, tx * TS + TS), ny = clamp(e.y, ty * TS, ty * TS + TS);
    const dx = e.x - nx, dy = e.y - ny, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2), push = r - d;
      e.x += (dx / d) * push; e.y += (dy / d) * push;
    } else {
      const cx = tx * TS + TS / 2, cy = ty * TS + TS / 2;
      if (Math.abs(e.x - cx) > Math.abs(e.y - cy)) e.x = e.x < cx ? tx * TS - r : tx * TS + TS + r;
      else e.y = e.y < cy ? ty * TS - r : ty * TS + TS + r;
    }
  }
}

/**
 * 사람이 지나갈 수 있는 곳으로 본 맵: 걸어 다니면 깊은 물(DEEP)이 벽, 보트를 타고 있으면 땅이 벽.
 * (시야/엔티티는 원래 map 을 쓴다 — 물은 시야를 막지 않는다)
 */
export function passMap(map, boat = false) {
  return {
    w: map.w, h: map.h, tiles: map.tiles,
    inBounds: (x, y) => map.inBounds(x, y), get: (x, y) => map.get(x, y),
    isSolid: (x, y) => map.isSolid(x, y) || (map.inBounds(x, y) && (map.get(x, y) === T.DEEP) !== !!boat),
  };
}

export function moveEntity(e, dx, dy, r, map) {
  e.x += dx; collideCircle(e, r, map);
  e.y += dy; collideCircle(e, r, map);
}

/** 마지막 castRay 가 맞춘 벽 타일 인덱스 (-1 = 없음). ES 모듈 live binding 으로 읽힌다. */
export let rayHit = -1;

/** DDA 그리드 레이캐스트. 벽까지 거리(최대 maxDist). explored 가 있으면 지나간 타일을 기록. */
export function castRay(map, ox, oy, ang, maxDist, explored) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let mx = Math.floor(ox / TS), my = Math.floor(oy / TS);
  const stepX = dx < 0 ? -1 : 1, stepY = dy < 0 ? -1 : 1;
  const ddx = dx === 0 ? 1e30 : Math.abs(TS / dx), ddy = dy === 0 ? 1e30 : Math.abs(TS / dy);
  let sx = dx === 0 ? 1e30 : dx < 0 ? (ox - mx * TS) / -dx : ((mx + 1) * TS - ox) / dx;
  let sy = dy === 0 ? 1e30 : dy < 0 ? (oy - my * TS) / -dy : ((my + 1) * TS - oy) / dy;
  rayHit = -1;
  if (explored && map.inBounds(mx, my)) explored[my * map.w + mx] = 1;
  for (let guard = 0; guard < 256; guard++) {
    let dist;
    if (sx < sy) { dist = sx; sx += ddx; mx += stepX; }
    else { dist = sy; sy += ddy; my += stepY; }
    if (dist >= maxDist) return maxDist;
    const inb = map.inBounds(mx, my);
    if (explored && inb) explored[my * map.w + mx] = 1;
    if (!inb || map.tiles[my * map.w + mx] === T.WALL) {
      rayHit = inb ? my * map.w + mx : -1;
      return dist;
    }
  }
  return maxDist;
}

export function hasLOS(map, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1) return true;
  return castRay(map, ax, ay, Math.atan2(by - ay, bx - ax), d, null) >= d - 0.5;
}
