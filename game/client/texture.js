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
  // Level 9: 밤의 주택가 — 어두운 잔디 바닥, 벽은 흰 비닐 사이딩 집 외벽
  suburbs: { ...DOOR, wallStyle: 'siding',
    carpet: [46, 62, 40], carpetDark: [38, 52, 34], carpetLight: [58, 76, 48], stain: [34, 40, 30], stainDark: [26, 30, 22],
    cap: [40, 38, 44], capLine: [50, 46, 54], capEdge: [18, 16, 20],
    paper: [176, 180, 184], stripe: [140, 144, 150], motif: [176, 180, 184], drip: [120, 124, 120], dripDark: [96, 100, 96],
    molding: [90, 92, 96], moldingHi: [200, 204, 208], base: [70, 66, 60], baseDark: [50, 46, 42] },
  // Level 10: 밀밭 — 흙바닥, 벽은 사람 키보다 큰 밀
  wheat: { ...DOOR, wallStyle: 'wheat',
    carpet: [150, 118, 70], carpetDark: [136, 104, 60], carpetLight: [166, 132, 82], stain: [118, 90, 52], stainDark: [98, 74, 42],
    cap: [196, 160, 70], capLine: [214, 178, 84], capEdge: [120, 94, 40],
    paper: [214, 178, 84], stripe: [176, 140, 58], motif: [236, 204, 110], drip: [150, 118, 50], dripDark: [120, 92, 38],
    molding: [176, 140, 58], moldingHi: [236, 204, 110], base: [120, 92, 40], baseDark: [90, 68, 30] },
  // Level 37: 풀룸 — 하얀 타일 바닥과 벽, 하늘색 물웅덩이
  pool: { ...DOOR, floorTiles: 8, wallStyle: 'tiles', clearWater: true,
    carpet: [214, 222, 222], carpetDark: [176, 190, 192], carpetLight: [232, 238, 238], stain: [186, 200, 200], stainDark: [160, 176, 178],
    cap: [150, 166, 170], capLine: [160, 176, 180], capEdge: [90, 104, 110],
    paper: [222, 230, 230], stripe: [178, 192, 194], motif: [222, 230, 230], drip: [170, 190, 196], dripDark: [140, 164, 172],
    molding: [120, 160, 176], moldingHi: [200, 224, 232], base: [100, 150, 170], baseDark: [70, 116, 136],
    puddle: [96, 176, 206], puddleHi: [196, 236, 250] },
  // Level 52: 학교 복도 — 체크무늬 리놀륨, 벽 아래는 초록 페인트
  school: { ...DOOR, floorTiles: 16, checker: true, wallStyle: 'wood',
    carpet: [176, 172, 156], carpetDark: [110, 120, 104], carpetLight: [196, 192, 176], stain: [140, 136, 120], stainDark: [118, 114, 100],
    cap: [52, 56, 50], capLine: [62, 66, 60], capEdge: [24, 26, 22],
    paper: [206, 200, 170], stripe: [190, 184, 154], motif: [206, 200, 170], drip: [160, 156, 130], dripDark: [130, 126, 104],
    molding: [70, 86, 66], moldingHi: [130, 150, 120], base: [60, 76, 56], baseDark: [40, 52, 38],
    wood: [74, 112, 82], woodDark: [56, 88, 62], woodHi: [96, 134, 102] },
  // Level 4: 버려진 사무실 — 회청색 타일 카펫, 베이지 벽
  office: { ...DOOR, floorTiles: 16,
    carpet: [104, 112, 120], carpetDark: [92, 100, 108], carpetLight: [118, 126, 134], stain: [80, 84, 88], stainDark: [64, 68, 72],
    cap: [58, 56, 52], capLine: [66, 64, 60], capEdge: [28, 26, 24],
    paper: [196, 186, 160], stripe: [180, 170, 146], motif: [196, 186, 160], drip: [150, 140, 116], dripDark: [124, 116, 96],
    molding: [110, 104, 92], moldingHi: [170, 162, 144], base: [80, 76, 70], baseDark: [56, 52, 48] },
  // Level 94: 모션 — 만화 같은 마을. 밝은 잔디, 크림색 벽에 굵은 테두리
  motion: { ...DOOR, wallStyle: 'siding',
    carpet: [112, 176, 84], carpetDark: [100, 160, 74], carpetLight: [130, 196, 98], stain: [90, 140, 64], stainDark: [70, 118, 50],
    cap: [200, 90, 70], capLine: [214, 104, 82], capEdge: [40, 20, 16],
    paper: [244, 228, 176], stripe: [40, 30, 24], motif: [244, 228, 176], drip: [210, 190, 140], dripDark: [180, 160, 110],
    molding: [40, 30, 24], moldingHi: [250, 240, 200], base: [60, 44, 34], baseDark: [30, 22, 16] },
  // Level 188: 창문의 안뜰 — 회색 돌바닥, 연노랑 벽에 창문
  courtyard: { ...DOOR, floorTiles: 12, checker: true, wallStyle: 'siding',
    carpet: [138, 134, 126], carpetDark: [118, 114, 108], carpetLight: [152, 148, 140], stain: [100, 98, 92], stainDark: [84, 82, 78],
    cap: [70, 64, 56], capLine: [80, 74, 66], capEdge: [34, 30, 26],
    paper: [214, 198, 150], stripe: [190, 174, 128], motif: [214, 198, 150], drip: [170, 156, 112], dripDark: [140, 128, 90],
    molding: [120, 106, 80], moldingHi: [230, 216, 170], base: [96, 86, 66], baseDark: [66, 58, 44] },
  // Level 974: 키티의 집 — 나무 바닥, 분홍 하트 벽지
  kitty: { ...DOOR, parquet: true, wallStyle: 'hearts',
    carpet: [150, 104, 70], carpetDark: [128, 86, 56], carpetLight: [168, 120, 84], stain: [110, 74, 48], stainDark: [90, 60, 38],
    cap: [96, 56, 70], capLine: [110, 66, 82], capEdge: [44, 24, 32],
    paper: [236, 176, 196], stripe: [222, 150, 176], motif: [200, 60, 100], drip: [200, 140, 160], dripDark: [170, 110, 130],
    molding: [160, 90, 116], moldingHi: [250, 210, 224], base: [130, 70, 94], baseDark: [90, 46, 64] },
  // Level 5.1: 보일러실 — 녹슨 철판 바닥, 붉은 벽돌 벽
  boiler: { ...DOOR, floorTiles: 16, wallStyle: 'brick',
    carpet: [86, 70, 58], carpetDark: [70, 56, 46], carpetLight: [104, 84, 66], stain: [100, 54, 30], stainDark: [72, 36, 20],
    cap: [40, 28, 22], capLine: [50, 36, 28], capEdge: [18, 12, 9],
    paper: [130, 62, 44], stripe: [86, 40, 30], motif: [150, 76, 52], drip: [110, 70, 40], dripDark: [80, 50, 28],
    molding: [70, 48, 36], moldingHi: [150, 110, 80], base: [64, 44, 34], baseDark: [44, 30, 22] },
  // Level 7: 탈라소포비아 — 물에 잠긴 사무실. 푸르스름한 카펫, 깊은 남색 물
  flooded: { ...DOOR, floorTiles: 16, clearWater: true,
    carpet: [72, 88, 100], carpetDark: [62, 76, 88], carpetLight: [86, 102, 114], stain: [52, 64, 74], stainDark: [40, 50, 60],
    cap: [36, 44, 52], capLine: [44, 52, 60], capEdge: [16, 20, 24],
    paper: [130, 146, 150], stripe: [110, 126, 132], motif: [130, 146, 150], drip: [90, 110, 120], dripDark: [70, 90, 100],
    molding: [74, 86, 94], moldingHi: [140, 156, 162], base: [56, 66, 74], baseDark: [38, 46, 52],
    puddle: [22, 44, 72], puddleHi: [80, 130, 170] },
  // Level 8: 동굴 — 울퉁불퉁한 흙바닥, 거친 바위 벽
  cave: { ...DOOR, wallStyle: 'rock',
    carpet: [74, 64, 54], carpetDark: [64, 55, 46], carpetLight: [88, 76, 64], stain: [54, 46, 38], stainDark: [42, 36, 30],
    cap: [34, 30, 28], capLine: [42, 37, 34], capEdge: [14, 12, 11],
    paper: [84, 76, 70], stripe: [64, 58, 52], motif: [104, 94, 84], drip: [70, 80, 74], dripDark: [54, 62, 58],
    molding: [60, 54, 48], moldingHi: [96, 88, 80], base: [52, 46, 40], baseDark: [36, 32, 28] },
  // Level 10.1: 수확의 밤 — 검은 흙, 벽은 시든 옥수수대
  harvest: { ...DOOR, wallStyle: 'wheat', pumpkins: true,
    carpet: [62, 46, 34], carpetDark: [52, 38, 28], carpetLight: [74, 56, 40], stain: [44, 32, 24], stainDark: [34, 24, 18],
    cap: [96, 86, 50], capLine: [110, 98, 58], capEdge: [50, 42, 22],
    paper: [118, 100, 56], stripe: [80, 68, 36], motif: [150, 128, 70], drip: [90, 74, 40], dripDark: [70, 56, 30],
    molding: [80, 68, 36], moldingHi: [150, 128, 70], base: [60, 48, 26], baseDark: [42, 34, 18] },
  // Level 11: 끝없는 도시 — 아스팔트 바닥, 벽돌 건물 외벽
  city: { ...DOOR, wallStyle: 'brick',
    carpet: [70, 70, 74], carpetDark: [60, 60, 64], carpetLight: [84, 84, 88], stain: [50, 50, 54], stainDark: [40, 40, 44],
    cap: [44, 42, 46], capLine: [52, 50, 54], capEdge: [20, 18, 22],
    paper: [150, 92, 70], stripe: [110, 66, 50], motif: [170, 110, 84], drip: [120, 90, 70], dripDark: [96, 70, 54],
    molding: [90, 86, 84], moldingHi: [170, 166, 160], base: [76, 72, 70], baseDark: [52, 50, 48] },
  // Level 13: 끝없는 아파트 — 낡은 초록 카펫, 누런 꽃무늬 벽지
  apartment: { ...DOOR, wallStyle: 'wood',
    carpet: [74, 96, 70], carpetDark: [64, 84, 60], carpetLight: [88, 110, 82], stain: [56, 70, 50], stainDark: [44, 56, 40],
    cap: [52, 44, 38], capLine: [62, 52, 46], capEdge: [24, 20, 16],
    paper: [206, 190, 146], stripe: [186, 168, 124], motif: [160, 110, 100], drip: [160, 140, 100], dripDark: [130, 112, 80],
    molding: [100, 76, 54], moldingHi: [160, 130, 96], base: [90, 66, 46], baseDark: [64, 46, 30],
    wood: [120, 88, 60], woodDark: [90, 64, 42], woodHi: [146, 112, 80] },
  // Level 3999: 진짜 끝 — 새하얀 바닥과 벽. 너무 깨끗해서 불안하다
  white: { ...DOOR, floorTiles: 16, wallStyle: 'tiles',
    carpet: [226, 228, 230], carpetDark: [208, 212, 216], carpetLight: [240, 242, 244], stain: [214, 216, 220], stainDark: [196, 200, 204],
    cap: [176, 180, 186], capLine: [184, 188, 194], capEdge: [120, 124, 130],
    paper: [236, 238, 240], stripe: [214, 218, 222], motif: [236, 238, 240], drip: [210, 214, 218], dripDark: [190, 194, 200],
    molding: [190, 194, 200], moldingHi: [250, 250, 252], base: [180, 184, 190], baseDark: [150, 154, 160],
    doorFrame: [200, 170, 90], door: [250, 240, 200], doorHi: [255, 252, 230], doorDark: [220, 200, 150], doorLine: [180, 150, 80] },
  // Level 3999: 끝없는 오락실 — 남색 바닥에 네온 무늬 카펫, 벽엔 오락기가 줄지어 서 있다
  arcade: { ...DOOR, wallStyle: 'arcade', confetti: true, neonCarpet: true,
    carpet: [30, 22, 58], carpetDark: [22, 16, 44], carpetLight: [44, 34, 80], stain: [26, 18, 50], stainDark: [18, 12, 36],
    cap: [20, 14, 34], capLine: [28, 20, 46], capEdge: [8, 6, 14],
    paper: [36, 26, 62], stripe: [24, 18, 44], motif: [220, 90, 200], drip: [60, 40, 90], dripDark: [40, 28, 64],
    molding: [60, 40, 110], moldingHi: [140, 90, 230], base: [40, 28, 70], baseDark: [24, 16, 44],
    doorFrame: [230, 180, 60], door: [255, 220, 110], doorHi: [255, 245, 190], doorDark: [200, 150, 50], doorLine: [150, 100, 30] },
  // Level P-1: 지하 주차장 — 회색 콘크리트 바닥에 흰 주차선, 기둥은 노랑·검정 경고 띠
  parking: { ...DOOR, wallStyle: 'pillar', parkingLines: true,
    carpet: [92, 94, 96], carpetDark: [82, 84, 86], carpetLight: [104, 106, 108], stain: [70, 72, 74], stainDark: [58, 60, 62],
    cap: [120, 122, 124], capLine: [130, 132, 134], capEdge: [60, 62, 64],
    paper: [150, 152, 150], stripe: [130, 132, 130], motif: [230, 190, 40], drip: [110, 112, 110], dripDark: [90, 92, 90],
    molding: [100, 102, 100], moldingHi: [170, 172, 170], base: [36, 36, 36], baseDark: [24, 24, 24] },
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
        else if (C.wallStyle === 'siding') {
          // 비닐 사이딩: 가로 판자 + 가끔 창문 (불 꺼짐 / 노란 불빛)
          const fy = y - capH;
          let col = fy % 4 === 0 ? C.stripe : C.paper;
          if ((tx * 7 + ty * 3) % 5 === 0 && x > 8 && x < 24 && fy > 3 && fy < 13) col = (x === 16 || fy === 8) ? C.molding : ((tx + ty) % 3 ? [26, 30, 40] : [220, 190, 110]);
          put(ox + x, oy + y, col, n);
        }
        else if (C.wallStyle === 'hearts') {
          const fy = y - capH, lx = (x + (Math.floor(fy / 7) % 2) * 4) % 8, ly = fy % 7;
          const heart = (ly === 2 && (lx === 2 || lx === 4)) || (ly === 3 && lx >= 2 && lx <= 4) || (ly === 4 && lx === 3);
          put(ox + x, oy + y, heart ? C.motif : (x % 8 === 0 ? C.stripe : C.paper), n);
        }
        else if (C.wallStyle === 'wheat') {
          // 밀 줄기: 세로 줄 + 위쪽 이삭
          const fy = y - capH, stalk = (x * 7 + tx * 3) % 5;
          let col = stalk === 0 ? C.stripe : stalk === 2 ? C.motif : C.paper;
          if (fy < 5 && (x + fy) % 3 === 0) col = C.motif;
          put(ox + x, oy + y, col, n);
        }
        else if (C.wallStyle === 'pillar') {
          // 콘크리트 기둥: 아래쪽은 노랑·검정 사선 경고 띠, 가끔 층 표시 "P1"
          const fy = y - capH, fh = P - capH - 6;
          let col = (x * 3 + fy) % 11 === 0 ? C.stripe : C.paper;
          if (fy > fh - 7) col = ((x + fy) >> 2) % 2 ? C.motif : [30, 30, 30];
          if ((tx * 7 + ty * 5) % 9 === 0 && fy > 2 && fy < 9 && x > 9 && x < 23) {
            const P1 = ['1110.010', '1010.110', '1110.010', '1000.010', '1000.111'];
            const r = P1[Math.floor((fy - 3) * 5 / 6)] || '', ch = r[Math.floor((x - 10) * 8 / 13)];
            if (ch === '1') col = [40, 60, 120];
          }
          put(ox + x, oy + y, col, n);
        }
        else if (C.wallStyle === 'brick') {
          // 벽돌: 엇갈린 줄눈
          const fy = y - capH, row = Math.floor(fy / 4), bx = (x + (row % 2) * 4 + tx * 3) % 8;
          let col = fy % 4 === 0 || bx === 0 ? C.stripe : ((row * 3 + Math.floor((x + tx * 32) / 8)) % 5 === 0 ? C.motif : C.paper);
          for (const dr of drips) if (x === dr.x && fy < dr.len) col = C.dripDark;
          put(ox + x, oy + y, col, n);
        }
        else if (C.wallStyle === 'rock') {
          // 거친 바위: 얼룩덜룩 + 금
          const fy = y - capH, v = Math.sin(x * 0.7 + tx * 2.1) + Math.cos(fy * 0.9 + ty * 1.3) + (rng() - 0.5) * 0.8;
          let col = v > 0.9 ? C.motif : v < -0.9 ? C.stripe : C.paper;
          if ((x * 3 + fy * 5 + tx) % 23 === 0) col = C.capEdge;
          for (const dr of drips) if (x === dr.x && fy < dr.len) col = C.drip;
          put(ox + x, oy + y, col, n);
        }
        else if (C.wallStyle === 'arcade') {
          // 오락기 한 대: 위는 색 간판, 가운데 빛나는 화면, 아래 조작판
          const fy = y - capH, fh = P - capH - 6, k = (tx * 5 + ty * 3) % 4;
          const NEON = [[255, 70, 160], [70, 220, 255], [255, 220, 70], [130, 255, 110]], SCR = [[120, 40, 140], [30, 110, 150], [150, 110, 30], [40, 130, 60]];
          let col = C.paper;
          if (x < 3 || x > P - 4) col = C.stripe;                                              // 기계 사이 틈
          else if (fy < 4) col = NEON[k];                                                      // 간판
          else if (fy >= 6 && fy < fh - 6 && x > 6 && x < P - 7) col = (fy + x) % 3 === 0 ? NEON[k] : SCR[k];   // 화면
          else if (fy >= fh - 4) col = (x === 10 || x === 20) ? NEON[(k + 1) % 4] : C.molding;  // 조작판 + 버튼
          put(ox + x, oy + y, col, Math.floor(n / 2));
        }
        else if (C.wallStyle === 'tiles') {
          const fy = y - capH;
          put(ox + x, oy + y, x % 8 === 0 || fy % 8 === 0 ? C.stripe : C.paper, Math.floor(n / 2));
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
      if (C.floorTiles) {
        const F = C.floorTiles, cell = ((Math.floor((tx * P + x) / F) + Math.floor((ty * P + y) / F)) & 1);
        col = C.checker ? (cell ? C.carpetDark : C.carpet) : ((x % F === 0 || y % F === 0) ? C.carpetDark : C.carpet);
      }
      if (C.parquet) col = ((y >> 2) + (tx % 2)) % 2 === 0 ? ((x + (y >> 3) * 5) % 16 === 0 ? C.stainDark : C.carpet) : C.carpetDark;
      if ((x + y) % 2 === 1 && rng() < 0.55 && !C.floorTiles) col = C.carpet;
      if ((x % 4 === 0 && y % 4 === 2) && rng() < 0.5) col = C.carpetLight;
      for (const st of stains) {
        const dd = Math.hypot(x - st.x, y - st.y);
        if (dd < st.r * 0.6 + rng()) col = C.stainDark;
        else if (dd < st.r + rng() * 1.5) col = C.stain;
      }
      put(ox + x, oy + y, col, Math.floor((rng() - 0.5) * 8));
      if (C.confetti && rng() < 0.012) put(ox + x, oy + y, CONFETTI[Math.floor(rng() * CONFETTI.length)]);
      // 주차장: 흰 주차선 (6칸마다 세로선 + 칸 끝 가로선)
      if (C.parkingLines) {
        const gx = tx * P + x, gy = ty * P + y;
        if ((gx % (P * 3) < 2 && (gy % (P * 5)) < P * 2) || ((gy % (P * 5)) === P * 2 && gx % (P * 3) < P * 2)) put(ox + x, oy + y, [196, 196, 186], Math.floor((rng() - 0.5) * 10));
      }
      // 오락실 카펫: 네온 물결 무늬
      if (C.neonCarpet) {
        const gx = tx * P + x, gy = ty * P + y, w = Math.round(Math.sin(gx * 0.35) * 2);
        if ((gy + w) % 12 === 0) put(ox + x, oy + y, (Math.floor(gx / 24) % 2) ? [70, 200, 240] : [230, 80, 190]);
        else if ((gx + gy * 3) % 41 === 0) put(ox + x, oy + y, [240, 220, 90]);
      }
    }
    // 수확의 밤: 바닥에 굴러다니는 호박 (장식)
    if (C.pumpkins && t === T.FLOOR && rng() < 0.07) {
      const jx = 4 + Math.floor(rng() * 18), jy = 6 + Math.floor(rng() * 16);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 9; x++) {
        if ((x === 0 || x === 8) && (y === 0 || y === 5)) continue;
        put(ox + jx + x, oy + jy + y, x % 3 === 1 ? [170, 74, 18] : y < 2 ? [236, 132, 40] : [206, 104, 28]);
      }
      put(ox + jx + 4, oy + jy - 1, [70, 90, 30]); put(ox + jx + 4, oy + jy - 2, [70, 90, 30]);
    }
    // 웅덩이 / 잔해 (밟으면 느려짐): 검푸른 물 + 붉은 비상등 반사
    if (t === T.SLOW && C.puddle) {
      for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
        const edge = (map.get(tx - 1, ty) !== T.SLOW && x < 3) || (map.get(tx + 1, ty) !== T.SLOW && x > P - 4) ||
          (map.get(tx, ty - 1) !== T.SLOW && y < 3) || (map.get(tx, ty + 1) !== T.SLOW && y > P - 4);
        if (edge && rng() < 0.6) continue;
        const tox = level.toxic?.[ty * map.w + tx];
        put(ox + x, oy + y, tox ? (rng() < 0.08 ? [140, 200, 70] : [62, 104, 40]) : rng() < 0.04 ? C.puddleHi : C.puddle, Math.floor((rng() - 0.5) * 6));
      }
      for (let k = 0; k < (C.clearWater ? 0 : 3); k++) {        // 떠다니는 잔해
        const jx = Math.floor(rng() * (P - 6)), jy = Math.floor(rng() * (P - 4));
        for (let y = 0; y < 2; y++) for (let x = 0; x < 4 + (k & 1) * 2; x++) put(ox + jx + x, oy + jy + y, [70, 62, 54]);
      }
    }
    // 벽 아래 접촉 그림자
    if (wall(tx, ty - 1)) for (let x = 0; x < P; x++) for (let k = 0; k < 6; k++) shade(ox + x, oy + k, -40 + k * 7);
    if (wall(tx - 1, ty)) for (let y = 0; y < P; y++) for (let k = 0; k < 3; k++) shade(ox + k, oy + y, -24 + k * 8);
    if (wall(tx + 1, ty)) for (let y = 0; y < P; y++) shade(ox + P - 1, oy + y, -14);

    if (t === T.EXIT && level.mission?.type === 'noclip') {
      // 노클립 존: 텍스처가 깨진 듯한 칸 (지직거림은 renderer 가 위에 그린다)
      for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) put(ox + x, oy + y, rng() < 0.5 ? [20, 20, 30] : [200, 230, 240], 0);
    } else if (t === T.EXIT) {
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
