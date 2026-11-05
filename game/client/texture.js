import { T } from '../../shared/config.js';
import { mulberry32 } from '../../shared/utils.js';

export const TILE_PX = 32; // 타일 하나 = 32x32 픽셀 (월드 48단위 → 1픽셀 = 1.5단위, 스프라이트와 같은 밀도)

const LOBBY = {
  carpet: [188, 164, 96], carpetDark: [166, 143, 82], carpetLight: [204, 180, 110], stain: [128, 106, 56], stainDark: [104, 84, 42],
  cap: [64, 54, 29], capLine: [74, 63, 34], capEdge: [32, 26, 11],
  paper: [226, 206, 116], stripe: [200, 178, 92], motif: [210, 190, 102], drip: [176, 152, 74], dripDark: [150, 126, 60],
  molding: [96, 78, 38], moldingHi: [150, 126, 66], base: [124, 99, 54], baseDark: [86, 66, 34],
  doorFrame: [56, 56, 54], door: [132, 132, 124], doorHi: [160, 160, 150], doorDark: [92, 92, 86], doorLine: [62, 62, 58],
};
const DOOR = { doorFrame: LOBBY.doorFrame, door: LOBBY.door, doorHi: LOBBY.doorHi, doorDark: LOBBY.doorDark, doorLine: LOBBY.doorLine };

const CONFETTI = [[255, 214, 74], [96, 196, 255], [120, 230, 120], [255, 255, 255], [230, 110, 200]];

/** 레벨별 벽/바닥 색 (LEVELS[].theme) */
export const THEMES = {
  lobby: LOBBY,
  // Level 1: 회색 콘크리트 창고
  concrete: { ...DOOR,
    carpet: [128, 128, 122], carpetDark: [112, 112, 106], carpetLight: [142, 142, 134], stain: [92, 90, 82], stainDark: [70, 68, 62],
    cap: [44, 44, 42], capLine: [52, 52, 50], capEdge: [22, 22, 20],
    paper: [150, 150, 144], stripe: [134, 134, 128], motif: [142, 142, 136], drip: [112, 108, 98], dripDark: [90, 86, 78],
    molding: [70, 70, 66], moldingHi: [110, 110, 104], base: [84, 84, 80], baseDark: [60, 60, 56] },
  // Level 2: 녹슨 파이프 통로
  pipes: { ...DOOR,
    carpet: [92, 84, 74], carpetDark: [78, 70, 62], carpetLight: [104, 96, 84], stain: [66, 52, 40], stainDark: [50, 38, 28],
    cap: [36, 32, 28], capLine: [46, 40, 34], capEdge: [18, 16, 14],
    paper: [118, 98, 78], stripe: [96, 74, 54], motif: [132, 108, 84], drip: [124, 72, 40], dripDark: [98, 54, 28],
    molding: [60, 52, 44], moldingHi: [140, 120, 96], base: [72, 60, 50], baseDark: [50, 42, 34] },
  // Level Fun =): 붉은 파티 카펫 + 노랑/분홍 줄무늬 벽지 + 색종이
  fun: { ...DOOR, confetti: true,
    carpet: [178, 52, 62], carpetDark: [156, 42, 54], carpetLight: [196, 72, 80], stain: [128, 34, 44], stainDark: [104, 26, 36],
    cap: [72, 38, 62], capLine: [86, 48, 76], capEdge: [36, 16, 30],
    paper: [238, 204, 92], stripe: [226, 120, 164], motif: [110, 176, 232], drip: [200, 150, 70], dripDark: [170, 120, 50],
    molding: [150, 78, 120], moldingHi: [230, 150, 190], base: [120, 56, 90], baseDark: [86, 36, 64] },
  // Level 5: 테러 호텔 — 짙은 붉은 무늬 카펫, 아래는 나무 판자 / 위는 낡은 크림색 벽지
  hotel: { ...DOOR, wallStyle: 'wood',
    carpet: [112, 30, 34], carpetDark: [92, 22, 28], carpetLight: [140, 92, 50], stain: [70, 18, 20], stainDark: [52, 12, 14],
    cap: [40, 26, 20], capLine: [50, 33, 25], capEdge: [20, 12, 9],
    paper: [200, 180, 140], stripe: [176, 154, 116], motif: [150, 96, 70], drip: [140, 110, 80], dripDark: [110, 84, 60],
    molding: [90, 56, 34], moldingHi: [150, 104, 64], base: [96, 60, 36], baseDark: [64, 38, 22],
    wood: [104, 64, 38], woodDark: [78, 46, 26], woodHi: [134, 88, 54] },
  // Level 6: 라이츠 아웃 — 아무것도 보이지 않는 검은 콘크리트
  dark: { ...DOOR,
    carpet: [62, 62, 60], carpetDark: [54, 54, 52], carpetLight: [72, 72, 70], stain: [44, 44, 42], stainDark: [34, 34, 32],
    cap: [24, 24, 24], capLine: [30, 30, 30], capEdge: [10, 10, 10],
    paper: [84, 84, 80], stripe: [74, 74, 70], motif: [80, 80, 76], drip: [60, 60, 56], dripDark: [48, 48, 44],
    molding: [44, 44, 42], moldingHi: [70, 70, 66], base: [50, 50, 48], baseDark: [36, 36, 34] },
  // Level END: 끝없는 도서관 — 나무 바닥, 벽은 책장
  library: { ...DOOR, wallStyle: 'books', parquet: true,
    carpet: [128, 86, 50], carpetDark: [110, 72, 40], carpetLight: [146, 102, 62], stain: [90, 58, 32], stainDark: [72, 44, 24],
    cap: [46, 30, 20], capLine: [56, 37, 25], capEdge: [22, 14, 9],
    paper: [92, 58, 34], stripe: [78, 48, 28], motif: [92, 58, 34], drip: [80, 50, 30], dripDark: [66, 40, 24],
    molding: [70, 44, 26], moldingHi: [124, 84, 50], base: [74, 46, 28], baseDark: [52, 32, 18] },
  // Level !: 붉은 비상등 아래의 공업용 복도 — 회색 콘크리트, 복도 안 벽은 나무 상자
  run: { ...DOOR, crates: true,
    carpet: [84, 80, 78], carpetDark: [74, 70, 68], carpetLight: [98, 92, 88], stain: [60, 54, 52], stainDark: [46, 40, 38],
    cap: [34, 30, 30], capLine: [42, 38, 38], capEdge: [16, 14, 14],
    paper: [104, 96, 92], stripe: [88, 80, 76], motif: [150, 40, 34], drip: [90, 60, 54], dripDark: [70, 44, 40],
    molding: [56, 50, 48], moldingHi: [120, 110, 104], base: [64, 58, 56], baseDark: [44, 40, 38],
    crate: [128, 92, 52], crateDark: [92, 62, 32], crateHi: [160, 122, 74], crateTop: [146, 108, 64],
    puddle: [40, 44, 50], puddleHi: [120, 70, 66] },
  // Level 3: 어두운 전기실
  electrical: { ...DOOR,
    carpet: [70, 74, 78], carpetDark: [60, 64, 68], carpetLight: [84, 88, 92], stain: [48, 50, 54], stainDark: [36, 38, 42],
    cap: [28, 30, 34], capLine: [36, 38, 44], capEdge: [14, 15, 18],
    paper: [96, 104, 110], stripe: [80, 88, 94], motif: [150, 140, 70], drip: [74, 80, 86], dripDark: [58, 62, 68],
    molding: [52, 56, 60], moldingHi: [120, 126, 132], base: [60, 64, 68], baseDark: [42, 44, 48] },
};

/**
 * 레벨 전체를 한 장의 텍스처에 픽셀 단위로 그린다.
 * 3/4 탑뷰: 벽 아래쪽이 바닥이면 노란 벽지 "앞면"이 보이고, 나머지는 어두운 벽 윗면.
 */
export function buildMapTexture(level) {
  const { map, seed } = level;
  const C = THEMES[level.info?.theme] || LOBBY;
  const P = TILE_PX, W = map.w * P, H = map.h * P;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const rng = mulberry32(seed + 1337);

  const put = (x, y, col, n = 0) => {
    const i = (y * W + x) * 4;
    d[i] = col[0] + n; d[i + 1] = col[1] + n; d[i + 2] = col[2] + n * 0.7; d[i + 3] = 255;
  };
  const shade = (x, y, k) => { const i = (y * W + x) * 4; d[i] += k; d[i + 1] += k; d[i + 2] += k * 0.8; };

  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    const t = map.get(tx, ty), ox = tx * P, oy = ty * P;
    const wall = (x, y) => map.get(x, y) === T.WALL;

    // 질주 레벨: 복도 안에 놓인 벽 = 나무 상자 (위는 뚜껑, 아래가 바닥이면 앞면 판자 + X 보강)
    if (t === T.WALL && C.crates && tx > 0 && ty > 0 && tx < map.w - 1 && ty < map.h - 1) {
      const face = !wall(tx, ty + 1), capH = face ? 12 : P;
      for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
        const n = Math.floor((rng() - 0.5) * 8);
        let col;
        if (y < capH) col = (x < 2 || x > P - 3 || y < 2 || (!face && y > P - 3)) ? C.crateDark : (y % 6 === 0 ? C.crateDark : C.crateTop);
        else {
          const fy = y - capH, fh = P - capH;
          col = (fy % 5 === 0) ? C.crateDark : C.crate;
          if (x < 2 || x > P - 3 || fy < 1 || fy > fh - 2) col = C.crateDark;
          const dx = Math.round((x / P) * fh);
          if (Math.abs(dx - fy) < 2 || Math.abs(fh - dx - fy) < 2) col = C.crateHi;     // X 보강대
        }
        put(ox + x, oy + y, col, n);
      }
      continue;
    }
    if (t === T.WALL) {
      const face = !wall(tx, ty + 1);            // 아래가 바닥 → 벽지 면이 보임
      const capH = face ? 12 : P;
      const drips = [];
      if (face && rng() < 0.35) drips.push({ x: 2 + Math.floor(rng() * 26), len: 4 + Math.floor(rng() * 12) });
      if (face && rng() < 0.15) drips.push({ x: 2 + Math.floor(rng() * 26), len: 3 + Math.floor(rng() * 8) });
      const peel = face && rng() < 0.12 ? { x: 4 + Math.floor(rng() * 20), y: 15 + Math.floor(rng() * 8) } : null;
      for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
        const n = Math.floor((rng() - 0.5) * 6);
        if (y < capH) {
          let col = (x + y) % 6 === 0 ? C.capLine : C.cap;
          const edge = (y < 2 && !wall(tx, ty - 1)) || (x < 2 && !wall(tx - 1, ty)) || (x >= P - 2 && !wall(tx + 1, ty));
          if (edge) col = C.capEdge;
          put(ox + x, oy + y, col, n);
        } else if (y === capH) put(ox + x, oy + y, C.molding, n);
        else if (y === capH + 1) put(ox + x, oy + y, C.moldingHi, n);
        else if (y >= P - 4) put(ox + x, oy + y, y >= P - 2 ? C.baseDark : C.base, n);
        else if (C.wallStyle === 'books') {
          // 책장: 선반 2단, 책등 색이 제각각
          const fy = y - capH - 2, shelfH = Math.floor((P - capH - 6) / 2);
          const row = Math.floor(fy / shelfH), ry = fy % shelfH;
          let col = C.paper;
          if (ry === shelfH - 1 || ry === shelfH - 2 || x < 1 || x > P - 2) col = C.molding;
          else {
            const bk = (x + row * 7 + tx * 13 + ty * 5) >> 1 & 7;
            const BOOK = [[120, 30, 28], [36, 62, 98], [46, 84, 50], [150, 120, 60], [90, 40, 70], [160, 140, 110], [60, 40, 30], [130, 70, 40]];
            const top = (bk * 3 + row) % 4;
            col = ry < top ? C.stripe : BOOK[bk];
            if (x % 2 === 0 && ry >= top) col = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8];
            if (ry === top + 2 && x % 2) col = [200, 180, 120];
          }
          put(ox + x, oy + y, col.map(Math.round), n);
        }
        else if (C.wallStyle === 'wood' && y > capH + (P - capH) * 0.5) {
          // 호텔 벽 아래쪽 절반: 나무 판자
          let col = x % 8 === 0 ? C.woodDark : (y % 6 === 0 ? C.woodHi : C.wood);
          put(ox + x, oy + y, col, n);
        }
        else {
          // 레벨 0 벽지: 세로 줄무늬 + 작은 반복 무늬
          let col = C.paper;
          const lx = x % 8, ly = (y - capH) % 6;
          if (lx === 0 || lx === 1) col = C.stripe;
          else if ((lx === 4 && ly === 1) || ((lx === 3 || lx === 5) && ly === 2) || (lx === 4 && ly === 3)) col = C.motif;
          for (const dr of drips) if (x >= dr.x && x <= dr.x + 1 && y - capH < dr.len + (x - dr.x) * 2) col = x === dr.x ? C.dripDark : C.drip;
          if (peel && x >= peel.x && x < peel.x + 4 && y >= peel.y && y < peel.y + 3) col = [182, 160, 92];
          put(ox + x, oy + y, col, n);
        }
      }
      continue;
    }

    // 바닥: 축축한 카펫 (짜임 무늬 + 얼룩)
    const stains = [];
    if (rng() < 0.14) stains.push({ x: 6 + rng() * 20, y: 6 + rng() * 20, r: 3 + rng() * 7 });
    if (rng() < 0.05) stains.push({ x: 6 + rng() * 20, y: 6 + rng() * 20, r: 2 + rng() * 3 });
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      let col = (x + y) % 2 === 0 ? C.carpet : C.carpetDark;
      if (C.parquet) col = ((y >> 2) + (tx % 2)) % 2 === 0 ? ((x + (y >> 3) * 5) % 16 === 0 ? C.stainDark : C.carpet) : C.carpetDark;
      if ((x + y) % 2 === 1 && rng() < 0.55) col = C.carpet;
      if ((x % 4 === 0 && y % 4 === 2) && rng() < 0.5) col = C.carpetLight;
      for (const st of stains) {
        const dd = Math.hypot(x - st.x, y - st.y);
        if (dd < st.r * 0.6 + rng()) col = C.stainDark;
        else if (dd < st.r + rng() * 1.5) col = C.stain;
      }
      put(ox + x, oy + y, col, Math.floor((rng() - 0.5) * 8));
      if (C.confetti && rng() < 0.012) put(ox + x, oy + y, CONFETTI[Math.floor(rng() * CONFETTI.length)]);
    }
    // 웅덩이 / 잔해 (밟으면 느려짐): 검푸른 물 + 붉은 비상등 반사
    if (t === T.SLOW && C.puddle) {
      for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
        const edge = (map.get(tx - 1, ty) !== T.SLOW && x < 3) || (map.get(tx + 1, ty) !== T.SLOW && x > P - 4) ||
          (map.get(tx, ty - 1) !== T.SLOW && y < 3) || (map.get(tx, ty + 1) !== T.SLOW && y > P - 4);
        if (edge && rng() < 0.6) continue;
        put(ox + x, oy + y, rng() < 0.04 ? C.puddleHi : C.puddle, Math.floor((rng() - 0.5) * 6));
      }
      for (let k = 0; k < 3; k++) {        // 떠다니는 잔해
        const jx = Math.floor(rng() * (P - 6)), jy = Math.floor(rng() * (P - 4));
        for (let y = 0; y < 2; y++) for (let x = 0; x < 4 + (k & 1) * 2; x++) put(ox + jx + x, oy + jy + y, [70, 62, 54]);
      }
    }
    // 벽 아래 접촉 그림자
    if (wall(tx, ty - 1)) for (let x = 0; x < P; x++) for (let k = 0; k < 6; k++) shade(ox + x, oy + k, -40 + k * 7);
    if (wall(tx - 1, ty)) for (let y = 0; y < P; y++) for (let k = 0; k < 3; k++) shade(ox + k, oy + y, -24 + k * 8);
    if (wall(tx + 1, ty)) for (let y = 0; y < P; y++) shade(ox + P - 1, oy + y, -14);

    if (t === T.EXIT) {
      // 회색 철문 (양문)
      for (let y = 2; y < 28; y++) for (let x = 5; x < 27; x++) {
        let col = C.door;
        if (y < 4 || x < 7 || x > 24) col = C.doorFrame;
        else if (x === 15 || x === 16) col = C.doorLine;
        else if (y > 21) col = C.doorDark;
        else if (x === 8 || x === 17) col = C.doorHi;
        put(ox + x, oy + y, col, Math.floor((rng() - 0.5) * 4));
      }
      for (const hx of [13, 18]) { put(ox + hx, oy + 14, C.doorFrame); put(ox + hx, oy + 15, C.doorFrame); }
      for (let x = 4; x < 28; x++) { shade(ox + x, oy + 28, -45); shade(ox + x, oy + 29, -25); }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
