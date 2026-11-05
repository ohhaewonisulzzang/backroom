// 서버와 클라이언트가 함께 사용하는 상수. 값을 바꾸면 양쪽에 동시에 반영된다.
export const CONFIG = {
  TILE: 48,
  PIX: 3,                  // 픽셀아트 1픽셀 = 월드 3단위 (타일 = 16x16 픽셀)
  MAP_W: 81,               // 홀수여야 함 (81x81 = 예전 41x41 의 약 4배 넓이)
  MAP_H: 81,
  KEY_COUNT: 5,
  PICKUP_RADIUS: 24,

  // 시야: 벽 뒤쪽은 어둡게(안개) 처리, 시야 안의 개체만 보인다
  VIEW_RANGE: 12 * 48,
  VIEW_RAYS: 240,
  FOG_ALPHA: 0.58,

  // 손전등 (어두운 구역용 + 스마일러/하운드 퇴치)
  FOV: Math.PI / 2.8,
  LIGHT_RANGE: 300,
  AMBIENT_RANGE: 56,
  CONE_RAYS: 120,
  AMBIENT_RAYS: 48,

  // 천장 형광등
  LIGHTS: {
    SPACING: 2,            // 형광등 간격(타일)
    RADIUS: 3.4,           // 한 개가 밝히는 반경(타일)
    AMBIENT: 0.06,         // 형광등이 없는 곳의 최소 밝기
    DARK_ZONES: 4,         // 형광등이 나간 어두운 구역 수
    DARK_ZONE_RADIUS: [4.5,6.5],
    BROKEN_CHANCE: 0.07,   // 군데군데 꺼진 형광등
    FLICKER_CHANCE: 0.14,  // 깜빡이는 형광등
    DARK_THRESHOLD: 0.38,  // 이 밝기 미만 타일 = 어둠 (스마일러 영역)
  },

  // 숨을 수 있는 사물함
  LOCKER: {
    COUNT: 48,
    USE_DIST: 42,          // 이 거리 안에서 E 로 숨기
    COOLDOWN: 0.8,         // 들어가기/나오기 사이 최소 시간(초)
    FOUND_WINDOW: 1.5,     // 엔티티가 숨는 장면을 본 뒤 이 시간 안에 도착하면 들킨다
  },

  // 정신력: 시간이 지나면 줄고, 어두운 곳에서는 더 빨리 준다. 아몬드 워터로 회복.
  // 낮아지면 스마일러 환각이 보이고, 0 이 되면 플레이어가 터진다.
  SANITY: {
    MAX: 100,
    DRAIN: 0.28,           // 초당 감소 (밝은 곳) → 약 6분
    DARK_MUL: 2.2,         // 어둠 속 + 손전등 꺼짐
    DARK_LIGHT_MUL: 1.5,   // 어둠 속 + 손전등 켜짐
    HIDDEN_MUL: 0.6,       // 사물함 안 (조금 안정된다)
    HALLUCINATE: 45,       // 이 값 아래면 환각 시작
    SEVERE: 18,            // 이 값 아래면 환각이 심해진다
  },

  PLAYER: { RADIUS: 10, WALK: 138, SPRINT: 222, CROUCH: 72, STAMINA: 100, DRAIN: 30, REGEN: 17 },

  // 엔티티 (기본은 시야로만 감지. 파티고어/데스모스/광인/스크래처는 소리도 듣는다)
  ENTITY: {
    RADIUS: 15,
    LOSE_TIME: 4,          // 시야 상실 후 추격 유지 시간
    SEARCH_TIME: 6,
    SPEED_PER_KEY: 0.05,   // 열쇠 하나당 추격 속도 증가율
    SPAWN_GRACE: 4.5,      // 라운드 시작 후 엔티티가 움직이기까지 대기(초) — 레벨 인트로 연출 동안
    wanderer:    { patrol: 45 },
    howler:      { patrol: 70, chase: 198, sight: 8 * 48, delay: 40, extraDelay: 90, teleportDist: 20 * 48, teleportAfter: 10 },
    smiler:      { patrol: 55, chase: 150, sight: 6 * 48 },
    skinStealer: { patrol: 50, approach: 95, chase: 188, sight: 7 * 48, speakDist: 3.5 * 48, revealTime: 1.4 },
    hound:       { patrol: 85, chase: 178, sight: 7 * 48, stunTime: 3, safeDist: 1.6 * 48 },
    // 파티고어: 제자리에서 시선을 좌우로 돌리며 감시. 시야(부채꼴) + 청각(걷기/달리기 소리, 웅크리면 무음)
    partygoer:   { patrol: 62, chase: 168, sight: 6 * 48, fov: Math.PI / 2.4, sweep: 0.95, sweepSpeed: 0.55,
                   hearWalk: 2.6 * 48, hearSprint: 6.5 * 48 },
    // 데스모스 암컷: 벽에 붙어 있다가 발소리나 손전등 빛에 반응해 날아온다. 살충제로 쫓아낸다
    deathmoth:   { chase: 176, hear: 1.0, loseTime: 3, repelTime: 6 },
    // 광인: 앞을 못 보고 소리에만 반응. 플레이어보다 느리다
    wretch:      { patrol: 40, investigate: 118, hear: 1.0, touch: 1.1 * 48 },
    // 스크래처: 눈이 나빠 소리로만 찾는다. 네발로 기어 느리게 다가온다. 귀가 아주 밝다
    scratcher:   { patrol: 46, investigate: 92, hear: 1.6, touch: 1.0 * 48 },
  },

  // 감정 표현 (, 키) — 목소리도 소리라서 귀가 밝은 엔티티는 듣는다
  EMOTE: { NOISE: 5 * 48, COOLDOWN: 1.5, LINES: ['hello?', '여기야!', '도망쳐!', '열쇠 찾았어', '쉿... 조용히', '도와줘!'] },
  INVENTORY_SIZE: 4,

  // 퍼즐 단말기 (Level 1 부터 열쇠 일부가 퍼즐 안에 잠겨 있다)
  PUZZLE: {
    USE_DIST: 46,          // 이 거리 안에서 E 로 단말기 열기
    ALARM: 7 * 48,         // 틀리면 울리는 경보 소리 반경 (소리에 민감한 엔티티가 듣는다)
    ALARM_TIME: 1.6,       // 경보가 들리는 시간(초)
  },

  // Level ! (질주 레벨): 긴 복도, 왼쪽에서 괴물 떼가 밀려온다. 장애물을 피해 오른쪽 끝 출구까지 달린다
  RUN: {
    LENGTH: 241, HEIGHT: 13,   // 맵 크기 (타일). 복도 높이 = HEIGHT - 2
    START_X: -3 * 48,          // 괴물 떼 시작 위치 (월드 x, 화면 왼쪽 밖)
    SPEED: 115,                // 처음 속도 (걷기 138 보다 조금 느림)
    ACCEL: 0.8,                // 초당 빨라지는 정도 (약 75초 뒤 최고 속도)
    MAX_SPEED: 175,            // 달리기(222)보다 확실히 느림 — 장애물에 걸리면 따라잡힌다
    CATCHUP: 8 * 48,           // 가장 뒤처진 사람보다 이만큼 이상 뒤에 있으면 바로 따라붙는다 (항상 화면 안에 보이게)
    SLOW: 0.5,                 // 웅덩이/잔해 위 이동 속도 배율
  },

  // 처음 Level 0 에 들어갈 때 나오는 오프닝 (친구들과 촬영하다 노클립)
  STORY: { DURATION: 19.6 },

  NET: {
    CLIENT_SEND_RATE: 20,  // 클라이언트 → 서버 위치 전송 Hz
    SNAPSHOT_RATE: 20,     // 서버 → 클라이언트 스냅샷 Hz
    SIM_RATE: 30,          // 서버 시뮬레이션 Hz
    MAX_PLAYERS: 4,
    ROUND_RESTART_DELAY: 6,
  },
};

/**
 * 레벨별 구성. 탈출하면 다음 레벨, 전원 사망하면 그 레벨을 다시 시작한다.
 *  entities : 등장 엔티티와 마리 수 (여기만 바꾸면 레벨 구성이 바뀜)
 *  lights   : CONFIG.LIGHTS 를 덮어쓰는 조명 설정 (어두운 구역 수/크기 등)
 *  theme    : 벽/바닥 색 테마 (game/client/texture.js)
 *  puzzles  : 퍼즐 단말기 종류 목록 (shared/puzzles.js — 지금은 memory, oneStroke 만 사용). 열쇠 중 이 개수만큼이 퍼즐 안에 잠긴다
 */
export const LEVELS = [
  { id: 0, name: 'THE LOBBY', theme: 'lobby',
    entities: { wanderer: 4, howler: 2 },
    lights: {} },
  { id: 1, name: 'HABITABLE ZONE', theme: 'concrete',
    entities: { wanderer: 2, skinStealer: 2, smiler: 4 }, puzzles: ['memory', 'oneStroke'],
    lights: { DARK_ZONES: 6, DARK_ZONE_RADIUS: [4.5, 7], BROKEN_CHANCE: 0.12, FLICKER_CHANCE: 0.22 } },
  { id: 2, name: 'PIPE DREAMS', theme: 'pipes',
    entities: { smiler: 6 }, puzzles: ['oneStroke', 'memory'],
    lights: { DARK_ZONES: 8, DARK_ZONE_RADIUS: [5, 8], BROKEN_CHANCE: 0.2, FLICKER_CHANCE: 0.3 } },
  { id: 3, name: 'ELECTRICAL STATION', theme: 'electrical',
    entities: { hound: 3, skinStealer: 2, wanderer: 2 }, puzzles: ['memory', 'oneStroke', 'memory'],
    lights: { DARK_ZONES: 5, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.1, FLICKER_CHANCE: 0.4 } },
  // Level Fun =) : 파티장. 파티고어가 제자리에서 감시하고, 숨을 곳은 사물함 대신 파티 탁자
  { id: 4, label: 'FUN =)', name: 'THE PARTY', theme: 'fun', hideProp: 'table', decor: 'balloons',
    entities: { partygoer: 12 }, puzzles: ['memory', 'oneStroke', 'memory'],
    lights: { DARK_ZONES: 0, BROKEN_CHANCE: 0.02, FLICKER_CHANCE: 0.06 } },
  // Level 5: 테러 호텔. 보일러실처럼 어두운 복도 벽에 거대한 데스모스가 붙어 있다
  { id: 5, name: 'TERROR HOTEL', theme: 'hotel', decor: 'moths',
    entities: { deathmoth: 7, hound: 1 }, items: { bugSpray: 8 }, puzzles: ['oneStroke', 'memory', 'oneStroke'],
    lights: { DARK_ZONES: 6, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.15, FLICKER_CHANCE: 0.25 } },
  // Level 6: 라이츠 아웃. 불이 하나도 없다. 손전등과 조명탄만이 빛이다
  { id: 6, name: 'LIGHTS OUT', theme: 'dark',
    entities: { wretch: 6 }, items: { flare: 8, almondWater: 10 }, puzzles: ['memory', 'oneStroke', 'memory'],
    lights: { NO_LIGHTS: true, DARK_ZONES: 0 } },
  // Level !: 런 포 유어 라이프. 붉은 비상등이 깜빡이는 끝없는 복도. 괴물 떼에게서 도망쳐 장애물을 피하며 끝까지 달린다
  //   열쇠·퍼즐·사물함 없음, 출구는 처음부터 열려 있음, 스태미나 무한, 정신력 감소 없음
  { id: 7, label: '!', name: 'RUN FOR YOUR LIFE', theme: 'run', layout: 'run', lightTint: '255,70,50',
    entities: {},
    lights: { SPACING: 3, DARK_ZONES: 0, BROKEN_CHANCE: 0.1, FLICKER_CHANCE: 0.5 } },
  // Level END: 끝없는 도서관. 스크래처가 기어다닌다. 여기서 탈출하면 엔딩
  { id: 8, label: 'END', name: 'THE END', theme: 'library', hideProp: 'desk', final: true,
    entities: { scratcher: 3 }, items: { compass: 5 }, puzzles: ['oneStroke', 'memory', 'oneStroke', 'memory'],
    lights: { DARK_ZONES: 5, DARK_ZONE_RADIUS: [5, 7], BROKEN_CHANCE: 0.2, FLICKER_CHANCE: 0.15 } },
];
/**
 * 아이템 (주우면 인벤토리 1~4번 칸, 숫자키로 사용). perLevel = 레벨마다 자연 배치 개수 (LEVELS[].items 로 덮어씀)
 */
export const ITEM_TYPES = {
  almondWater: { name: '아몬드 워터', perLevel: 6, uses: 1, sanity: 60 },               // 정신력 +60
  staminaDrink: { name: '스테미너 드링크', perLevel: 6, uses: 1, boost: 8 },             // 스태미나 가득 + 8초 무한 질주
  camera:      { name: '카메라', perLevel: 3, uses: 3, range: 6 * 48, fov: Math.PI / 2.2, stun: 3 },   // 플래시: 엔티티 기절, 스마일러 소멸
  bugSpray:    { name: '살충제', perLevel: 2, uses: 3, range: 3.5 * 48, fov: Math.PI / 2 },            // 데스모스를 벽으로 쫓아냄
  flare:       { name: '조명탄', perLevel: 3, uses: 1, dur: 30, radius: 4 * 48, noise: 7 * 48 },       // 빛 + 소리 미끼
  compass:     { name: '나침반', perLevel: 3, uses: 1, dur: 25 },                                       // 가장 가까운 열쇠/출구 방향
};

export const levelInfo = i => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i | 0))];

export const TS = CONFIG.TILE;
export const T = Object.freeze({ FLOOR: 0, WALL: 1, EXIT: 2, SLOW: 3 });   // SLOW = 웅덩이/잔해 (지나갈 수 있지만 느려짐)
export const ENTITY_TYPES = ['wanderer', 'howler', 'smiler', 'skinStealer', 'hound', 'partygoer', 'deathmoth', 'wretch', 'scratcher'];
/** 화면 표시용 레벨 이름 ("LEVEL 0", "LEVEL FUN =)") */
export const levelLabel = i => { const L = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i | 0))]; return L.label ? `LEVEL ${L.label}` : `LEVEL ${L.id}`; };
/** 방호복 색 (대기방에서 고름). 방랑자/스킨 스틸러도 이 중 하나를 랜덤으로 입는다 */
export const PLAYER_COLORS = ['default', 'green', 'blue', 'red'];
export const SUIT_HEX = { default: '#e7b92e', green: '#5fae4e', blue: '#3f7fd0', red: '#c8423a' };
export const SUIT_NAMES = { default: '기본', green: '초록', blue: '파랑', red: '빨강' };
export const randomSuit = () => PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
