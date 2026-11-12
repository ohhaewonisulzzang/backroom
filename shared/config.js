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
    CATCH_HOLD: 2.8,       // 사람을 잡으면 사망 연출 동안 그 자리에 멈춰 있는 시간(초)
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
    // 창문들: 창문 속에서 노크한다. 가까이 가면 유리를 깨고 끌고 간다 (창문에서 멀리 나오지 못한다)
    windows:     { grab: 1.5 * 48, knock: 5 * 48, lunge: 300 },
    // 동네 감시자: 다리 달린 눈알. 넓은 도로만 다닌다(좁은 골목·집 안엔 못 들어온다). 멀리서도 보고, 쫓을 땐 아주 빠르다
    watch:       { patrol: 40, chase: 250, sight: 13 * 48 },
    // 페이슬링: 얼굴 없는 사람 + 전기톱. 시끄럽고 느리게 쫓아온다
    faceling:    { patrol: 46, chase: 118, sight: 7 * 48 },
    // 클럼프: 손발이 잔뜩 달린 덩어리. 소리 없이 쫓아오지만 물에는 못 들어온다
    clump:       { patrol: 48, chase: 182, sight: 8 * 48 },
    // 애니메이션: 낮엔 나무 인형처럼 서 있다가, 밤이 되면 숨지 않은 사람을 찾아 달려든다
    animation:   { chase: 205 },
    // 애니메이션 킹: 보고 있으면 멈춘다. 눈을 떼면 소리 없이 다가온다. 손전등을 비추면 사라졌다 근처에 다시 나타난다
    animatedKing: { chase: 150, watchFov: Math.PI * 0.6, watchRange: 11 * 48, vanish: 3 },
    // 아라네아 멤브리: 해골 머리 거미. 넓은 곳만 다닌다(좁은 복도엔 몸이 안 들어간다). 하울러보다 빠르다
    aranea:      { patrol: 70, chase: 255, sight: 9 * 48 },
    // 키티: 막대 인간. 보고 있으면 멈추고, 안 보면 천천히 다가온다. 가끔 이상한 소리와 함께 순간이동한다
    //   순간이동은 등 뒤 먼 곳으로만(teleportMin~Max 칸), 나타난 뒤 appearFreeze 초는 얼어 있다.
    //   벽에 가려 서로 안 보이면 lurkDist 안으로는 다가오지 않는다 (모퉁이 갑툭튀 방지)
    kitty:       { chase: 96, watchFov: Math.PI * 0.6, watchRange: 11 * 48, teleportEvery: 18,
                   teleportMin: 9, teleportMax: 14, appearFreeze: 2.2, lurkDist: 4 * 48 },
    // 레벨 5의 야수 (Level 5.1 보일러실): 보이면 포효(windup) 뒤 일직선으로 돌진. 벽에 부딪히면 잠깐 기절한다
    beast:       { patrol: 55, sight: 9 * 48, windup: 0.9, charge: 340, chargeTime: 1.5, wallStun: 2.2 },
    // 레벨 7의 무언가 (Level 7): 물속에서만 움직인다. 물을 휘젓는 소리를 듣고 온다 (웅크리면 작게, 멈추면 무음)
    seaThing:    { patrol: 60, chase: 205, hearWalk: 7 * 48, hearCrouch: 2.5 * 48 },
    // 크롤러 (Level 8): 천장에 붙어 있다가 바로 밑을 지나가면 떨어져 쫓아온다 (웅크리면 더 가까이 지나가도 된다)
    crawler:     { trigger: 1.7 * 48, triggerCrouch: 0.8 * 48, drop: 0.8, chase: 196, chaseTime: 6, sight: 7 * 48 },
    // 죽음쥐 (Level 8): 작고 빠른 쥐 떼. 오래 못 달리고 지치면 쉰다. 손전등을 비추면 흩어진다
    deathrat:    { patrol: 70, chase: 210, sight: 5 * 48, burst: 2.6, rest: 2.2, stunTime: 2.5 },
    // 잭-오-랜턴 (Level 10.1): 불빛에 끌린다. 손전등을 켠 사람은 멀리서도 보고, 끈 사람은 아주 가까이서만 본다
    jackLantern: { patrol: 50, chase: 190, sightLit: 13 * 48, sightDark: 2.5 * 48 },
    // 위장 크롤러 (Level 11): 벽에 붙어 벽인 척한다. 아무도 안 볼 때 슬금슬금, 가까이 오면 튀어나와 쫓는다
    camoCrawler: { patrol: 50, creep: 34, chase: 192, sight: 7 * 48, trigger: 2 * 48, watchFov: Math.PI * 0.6, watchRange: 9 * 48 },
    // 덜러 (Level 13): 색이 바랜 회색 사람. 보이면 아주 느리게 따라온다. 가까이 있으면 정신력이 빨리 준다
    //   닿아도 죽지 않는다: 지금 정신력의 touchDrain(30%)을 빼앗고 touchRest 초 동안 멈춘다
    //   눈으로 찾는다: 보이면(sight) 따라오고, 놓치면 마지막 위치를 둘러보다 다시 배회한다
    duller:      { patrol: 40, chase: 66, sight: 8 * 48, aura: 4 * 48, sanityMul: 4, touchDrain: 0.3, touchRest: 2.5 },
    // 시츠 (Level 13): 하얀 천을 뒤집어쓴 유령. 벽을 통과해 천천히 떠온다. 손전등을 비추면 물러난다
    sheet:       { chase: 58, sense: 11 * 48, flee: 120, scared: 2.5 },
    // 파티 푸퍼: 해치지 않는다. E 로 말을 걸면 남은 열쇠/단말기 하나까지 앞장서 데려가고, 그 열쇠를 누가 먹으면 사라진다
    partyPooper: { speed: 128, wait: 3.2 * 48, talk: 58 },
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

  // Level Fun 풍선: E 로 터뜨린다. 소리(반경 10칸)를 파티고어가 듣고 온다. 아주 드물게 아이템이 나온다
  BALLOON: { USE_DIST: 44, NOISE: 10 * 48, NOISE_TIME: 1.5, ITEM_CHANCE: 0.0001 },

  // 하이드로리티스 플레그 (Level 37): 탁한 초록 물에 서 있으면 시야가 어두워지고, 오래 있으면 죽는다
  HAZARD: { TOXIC_KILL: 6, TOXIC_RECOVER: 0.7 },
  // 밤 (Level 94): every 초마다 warn 초 예고 → dur 초 동안 밤. 밤엔 숨어야 한다
  NIGHT: { every: 34, warn: 4, dur: 11 },
  // 정전 (Level P-1): every 초 동안 불이 켜져 있다가 → warn 초 깜빡임 → dur 초 정전. 정전엔 비상등 아래만 밝다
  //   smilerSpeed: 정전 중 스마일러 추격 속도 (달리기 222 보다 훨씬 빠름), sight: 정전 중 시야
  BLACKOUT: { every: 16, warn: 3, dur: 9, smilerSpeed: 330, sight: 12 * 48 },
  // 끝없는 도시 (Level 11): 세로로 긴 맵 크기(타일). 노클립 존에서 E 를 누를 수 있는 거리
  CITY: { W: 33, H: 161, NOCLIP_DIST: 1.4 * 48 },

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
 *  mission  : 출구를 여는 조건 (MISSIONS 참고). 없으면 열쇠 5개
 *  puzzles  : 퍼즐 단말기 종류 목록 (shared/puzzles.js). 열쇠 미션에서 열쇠 중 이 개수만큼이 퍼즐 안에 잠긴다
 *  puddles  : 바닥 곳곳에 물웅덩이(느려짐)를 까는 비율 / toxic: 그중 탁한 초록 물(하이드로리티스) 비율
 *  roads    : 이 간격(타일)마다 3칸 너비 도로를 뚫는다 (넓은 곳만 다니는 엔티티용)
 *  night    : 주기적으로 밤이 온다 (CONFIG.NIGHT)
 *  hazards  : 엔티티는 아니지만 도감에 오르는 위험 요소
 */
export const LEVELS = [
  { id: 0, name: 'THE LOBBY', theme: 'lobby',
    mission: { type: 'keys', count: 5 },
    entities: { wanderer: 4, howler: 2 },
    lights: {} },
  { id: 1, name: 'HABITABLE ZONE', theme: 'concrete',
    mission: { type: 'keys', count: 5 }, puzzles: ['memory', 'oneStroke'],
    entities: { wanderer: 2, skinStealer: 2, smiler: 4 },
    lights: { DARK_ZONES: 6, DARK_ZONE_RADIUS: [4.5, 7], BROKEN_CHANCE: 0.12, FLICKER_CHANCE: 0.22 } },
  // 증기 밸브: 벽에 붙은 밸브에서 E → 핸들을 오른쪽으로 돌려 잠근다. 돌리는 소리가 난다
  //   위장 크롤러: 녹슨 파이프 벽인 척 붙어 있다
  { id: 2, name: 'PIPE DREAMS', theme: 'pipes',
    mission: { type: 'activate', count: 4, kind: 'valve', turns: 3 },
    entities: { smiler: 6, camoCrawler: 3 },
    lights: { DARK_ZONES: 8, DARK_ZONE_RADIUS: [5, 8], BROKEN_CHANCE: 0.2, FLICKER_CHANCE: 0.3 } },
  // 퓨즈 배달: 흩어진 퓨즈를 주워(한 번에 2개까지) 시작 지점 배전반에 꽂는다. 죽으면 들고 있던 퓨즈를 떨어뜨린다
  { id: 3, name: 'ELECTRICAL STATION', theme: 'electrical',
    mission: { type: 'deliver', count: 4, kind: 'fuse' },
    entities: { hound: 3, skinStealer: 2, wanderer: 2 },
    lights: { DARK_ZONES: 5, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.1, FLICKER_CHANCE: 0.4 } },
  // Level 4: 버려진 사무실. 창문 속의 "창문들"이 노크한다 — 창문 가까이 가지 마라
  { id: 4, name: 'ABANDONED OFFICE', theme: 'office',
    mission: { type: 'deliver', count: 4, kind: 'files' },
    entities: { windows: 9, wanderer: 1 },
    lights: { DARK_ZONES: 3, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.06, FLICKER_CHANCE: 0.12 } },
  // Level Fun =) : 파티장. 파티고어가 제자리에서 감시하고, 숨을 곳은 사물함 대신 파티 탁자. 열쇠는 전부 파티 게임기 안에
  //   bgm: 배경 음악 (public/ 아래 경로). 중간중간 지지직거리며 무한 반복된다
  { id: 5, label: 'FUN =)', name: 'THE PARTY', theme: 'fun', hideProp: 'table', decor: 'balloons', bgm: '/audio/daisy.m4a',
    mission: { type: 'keys', count: 4, kind: 'games' }, puzzles: ['arcade', 'arcade', 'arcade', 'arcade'],
    entities: { partygoer: 6 },
    lights: { DARK_ZONES: 0, BROKEN_CHANCE: 0.02, FLICKER_CHANCE: 0.06 } },
  // Level 5: 테러 호텔. 체크아웃 시간까지 버티면 출구가 열린다. 벽에 붙은 데스모스는 소리와 빛에 날아온다
  { id: 6, label: '5', name: 'TERROR HOTEL', theme: 'hotel', decor: 'moths',
    mission: { type: 'survive', time: 150, kind: 'checkout' },
    entities: { deathmoth: 7, hound: 1 }, items: { bugSpray: 8 },
    lights: { DARK_ZONES: 6, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.15, FLICKER_CHANCE: 0.25 } },
  // Level 5.1: 보일러실. 레벨 5의 야수가 포효한 뒤 일직선으로 돌진한다 — 옆 통로로 피하라. 압력 밸브를 잠가라
  { id: 7, label: '5.1', name: 'BOILER ROOM', theme: 'boiler', lightTint: '255,150,80',
    mission: { type: 'activate', count: 4, kind: 'boiler', turns: 3 },
    entities: { beast: 2 },
    lights: { DARK_ZONES: 5, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.12, FLICKER_CHANCE: 0.3 } },
  // Level 6: 라이츠 아웃. 불이 하나도 없다. 발전기를 돌려라 — 시끄러워서 광인이 몰려온다
  { id: 8, label: '6', name: 'LIGHTS OUT', theme: 'dark',
    mission: { type: 'activate', count: 3, kind: 'generator', turns: 4 },
    entities: { wretch: 6 }, items: { flare: 8, almondWater: 10 },
    lights: { NO_LIGHTS: true, DARK_ZONES: 0 } },
  // Level 7: 탈라소포비아. 물에 잠긴 사무실. 물속의 "무언가"가 물 휘젓는 소리를 듣고 온다 — 물에선 웅크리거나 빨리 빠져나가라
  { id: 9, label: '7', name: 'THALASSOPHOBIA', theme: 'flooded', puddles: 0.2, lightTint: '170,210,255',
    mission: { type: 'activate', count: 3, kind: 'pump', turns: 3 },
    entities: { seaThing: 3 }, items: { almondWater: 8 },
    lights: { DARK_ZONES: 4, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.12, FLICKER_CHANCE: 0.2 } },
  // Level 8: 동굴. 거의 깜깜하다. 천장엔 크롤러, 바닥엔 죽음쥐 떼
  { id: 10, label: '8', name: 'CAVE SYSTEM', theme: 'cave', lightTint: '255,190,120',
    mission: { type: 'keys', count: 5 }, puzzles: ['memory', 'oneStroke'],
    entities: { crawler: 6, deathrat: 6 }, items: { flare: 5 },
    lights: { SPACING: 4, DARK_ZONES: 9, DARK_ZONE_RADIUS: [4, 7], BROKEN_CHANCE: 0.2, FLICKER_CHANCE: 0.35 } },
  // Level 9: 밤의 주택가. 넓은 도로엔 동네 감시자, 집(좁은 골목) 안엔 광인. 무전기 부품을 모아 고친다
  { id: 11, label: '9', name: 'THE SUBURBS', theme: 'suburbs', roads: 14,
    mission: { type: 'deliver', count: 4, kind: 'radio' },
    entities: { watch: 2, wretch: 3, wanderer: 1 }, items: { flare: 4 },
    lights: { SPACING: 3, DARK_ZONES: 9, DARK_ZONE_RADIUS: [4, 7], BROKEN_CHANCE: 0.25, FLICKER_CHANCE: 0.2 } },
  // Level 10: 끝없는 밀밭. 해가 뜰 때까지 버텨라. 얼굴 없는 페이슬링이 전기톱을 들고 다닌다
  { id: 12, label: '10', name: 'FIELD OF WHEAT', theme: 'wheat',
    mission: { type: 'survive', time: 160, kind: 'dawn' },
    entities: { faceling: 5 },
    lights: { SPACING: 3, DARK_ZONES: 7, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.1, FLICKER_CHANCE: 0.05 } },
  // Level 10.1: 수확의 밤. 호박밭. 잭-오-랜턴은 불빛에 끌린다 — 손전등을 끄면 숨을 수 있지만 앞이 안 보인다
  { id: 13, label: '10.1', name: 'HARVEST NIGHT', theme: 'harvest', lightTint: '255,160,70',
    mission: { type: 'deliver', count: 4, kind: 'gas' },
    entities: { jackLantern: 5 },
    lights: { SPACING: 3, DARK_ZONES: 10, DARK_ZONE_RADIUS: [4, 7], BROKEN_CHANCE: 0.15, FLICKER_CHANCE: 0.1 } },
  // Level 11: 끝없는 도시. 세로로 아주 긴 도시 (아래에서 시작 → 맨 위 끝). 열쇠 없이 도시 끝의 노클립 존에서 E 를 누르면 다음 레벨로.
  //   넓은 도로엔 동네 감시자(다리 달린 눈알)가 다닌다 — 좁은 골목으로 다니고 도로는 재빨리 건너라
  { id: 14, label: '11', name: 'THE ENDLESS CITY', theme: 'city', layout: 'city',
    mission: { type: 'noclip' },
    entities: { watch: 4 }, items: { almondWater: 7, staminaDrink: 8, flare: 4 },
    lights: { SPACING: 3, DARK_ZONES: 5, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.15, FLICKER_CHANCE: 0.15 } },
  // Level P-1: 지하 주차장. 불이 주기적으로 나간다(정전). 깜빡이면 빨간 비상등 아래로 뛰어라 —
  //   정전 동안 어둠 속에 있는 사람에게 스마일러가 엄청 빠르게 달려든다 (손전등도 소용없다)
  //   tips: 시작 지점 쪽지에 적히는 괴물 대처법을 이 레벨에서만 바꿈 (기본은 괴물 도감의 대처법)
  { id: 15, label: 'P-1', name: 'THE PARKING GARAGE', theme: 'parking', layout: 'garage', blackout: true, lightTint: '220,235,255',
    tips: { smiler: '불이 깜빡이면 바로 빨간 비상등 아래로 뛰어라. 정전 중엔 손전등도 소용없다. 비상등 빛 안으로는 들어오지 못한다.' },
    mission: { type: 'keys', count: 5 }, puzzles: ['memory', 'oneStroke'],
    entities: { smiler: 5 }, items: { almondWater: 8, flare: 0 },
    lights: { SPACING: 3, DARK_ZONES: 0, BROKEN_CHANCE: 0.04, FLICKER_CHANCE: 0.05, EMERGENCY: 0.16 } },
  // Level 13: 끝없는 아파트. 엘리베이터가 올 때까지 버텨라. 덜러는 보이면 느리게 따라오고, 시츠는 벽을 통과한다
  { id: 16, label: '13', name: 'INFINITE APARTMENTS', theme: 'apartment',
    mission: { type: 'survive', time: 150, kind: 'elevator' },
    entities: { duller: 4, sheet: 4 }, items: { almondWater: 9 },
    lights: { DARK_ZONES: 5, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.1, FLICKER_CHANCE: 0.25 } },
  // Level 37: 풀룸. 하얀 타일 수영장. 탁한 초록 물엔 하이드로리티스 플레그, 클럼프는 물에 못 들어온다
  { id: 17, label: '37', name: 'THE POOLROOMS', theme: 'pool', puddles: 0.08, toxic: 0.4, hazards: ['hydrolitis'],
    mission: { type: 'activate', count: 4, kind: 'drain', turns: 3 },
    entities: { clump: 2 }, items: { almondWater: 8 },
    lights: { DARK_ZONES: 3, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.05, FLICKER_CHANCE: 0.1 } },
  // Level 52: 학교 복도. 파티고어가 복도를 지키고 어둠 속엔 스마일러. 교실 단말기 4대의 시험을 통과해야 한다
  //   파티 푸퍼(유일하게 도와주는 엔티티)에게 E 를 누르면 남은 단말기 하나까지 데려다준다
  { id: 18, label: '52', name: 'SCHOOL HALLS', theme: 'school',
    mission: { type: 'keys', count: 4, kind: 'exams' }, puzzles: ['oneStroke', 'memory', 'oneStroke', 'memory'],
    entities: { partygoer: 4, smiler: 2, partyPooper: 3 },
    lights: { DARK_ZONES: 4, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.12, FLICKER_CHANCE: 0.3 } },
  // Level 94: 모션. 만화 같은 마을. 밤이 오면 애니메이션이 깨어난다 — 사물함(옷장)에 숨어라. 애니메이션 킹은 눈을 떼면 다가온다
  { id: 19, label: '94', name: 'MOTION', theme: 'motion', night: true,
    mission: { type: 'survive', time: 140, kind: 'motion' },
    entities: { animation: 6, animatedKing: 1 },
    lights: { DARK_ZONES: 2, DARK_ZONE_RADIUS: [4, 5], BROKEN_CHANCE: 0.03, FLICKER_CHANCE: 0.04 } },
  // Level 188: 창문의 안뜰. 넓은 안뜰엔 아라네아 멤브리, 벽의 창문엔 창문들. 좁은 복도로 다녀라
  { id: 20, label: '188', name: 'COURTYARD OF WINDOWS', theme: 'courtyard', roads: 12,
    mission: { type: 'keys', count: 5 }, puzzles: ['memory', 'oneStroke'],
    entities: { aranea: 2, windows: 8 },
    lights: { DARK_ZONES: 4, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.1, FLICKER_CHANCE: 0.15 } },
  // Level 974: 키티의 집. 흩어진 장난감을 모아 장난감 상자에 넣어라. 키티에게서 눈을 떼지 마라
  { id: 21, label: '974', name: "KITTY'S HOUSE", theme: 'kitty',
    mission: { type: 'deliver', count: 6, kind: 'toys' },
    entities: { kitty: 1 },
    lights: { DARK_ZONES: 3, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.05, FLICKER_CHANCE: 0.1 } },
  // Level !: 런 포 유어 라이프. 붉은 비상등이 깜빡이는 끝없는 복도. 괴물 떼에게서 도망쳐 장애물을 피하며 끝까지 달린다
  //   열쇠·퍼즐·사물함 없음, 출구는 처음부터 열려 있음, 스태미나 무한, 정신력 감소 없음
  { id: 22, label: '!', name: 'RUN FOR YOUR LIFE', theme: 'run', layout: 'run', lightTint: '255,70,50',
    mission: { type: 'run' },
    entities: {},
    lights: { SPACING: 3, DARK_ZONES: 0, BROKEN_CHANCE: 0.1, FLICKER_CHANCE: 0.5 } },
  // Level END: 끝없는 도서관. 스크래처가 기어다닌다
  { id: 23, label: 'END', name: 'THE END', theme: 'library', hideProp: 'desk',
    mission: { type: 'keys', count: 5 }, puzzles: ['oneStroke', 'memory', 'oneStroke', 'memory'],
    entities: { scratcher: 3 }, items: { compass: 5 },
    lights: { DARK_ZONES: 5, DARK_ZONE_RADIUS: [5, 7], BROKEN_CHANCE: 0.2, FLICKER_CHANCE: 0.15 } },
  // Level 3999: 진짜 끝. 네온이 깜빡이는 끝없는 오락실.
  //   오락기 3대의 "퀵 드로우"(초록불이 켜지면 바로 누르기)를 클리어하면 현실(프론트룸)로 가는 문이 열린다. 여기서 탈출하면 엔딩.
  //   덜러(가까우면 정신력이 빨리 줄고, 닿으면 정신력 30%를 빼앗는다)와 스마일러만 나온다
  { id: 24, label: '3999', name: 'THE TRUE END', theme: 'arcade', final: true, lightTint: '255,130,230',
    mission: { type: 'keys', count: 3, kind: 'cabinets' }, puzzles: ['quick', 'quick', 'quick'],
    entities: { duller: 3, smiler: 4 }, items: { almondWater: 10, camera: 4 },
    lights: { DARK_ZONES: 3, DARK_ZONE_RADIUS: [4, 6], BROKEN_CHANCE: 0.04, FLICKER_CHANCE: 0.08 } },
];

/**
 * 미션 (출구 여는 조건)
 *  keys     : 열쇠 count 개 (일부/전부 퍼즐 단말기 안)
 *  deliver  : 흩어진 부품 count 개를 시작 지점 근처 장치(depot)에 가져다 놓는다. 한 사람이 CARRY 개까지 든다
 *  activate : 장치 count 개를 E 로 열고 핸들을 시계 방향으로 turns 바퀴 돌린다 (여럿이 같이 돌릴 수 있다). 작동 소리가 난다
 *  survive  : time 초 동안 살아남으면 출구가 열린다
 *  run      : 질주 레벨 (출구가 처음부터 열림)
 *  noclip   : 열쇠 없음. 맵 끝의 노클립 존(출구 칸)에 가서 E 를 누르면 탈출 (끝없는 도시)
 */
export const MISSION = {
  CARRY: 2,                 // 배달 부품 최대 소지 수
  DEPOT_DIST: 44,           // 이 거리 안이면 부품을 넣는다
  STATION_DIST: 54,         // 이 거리 안에서 E 로 장치(밸브/크랭크)를 연다
  TURN_RATE: 2.5,           // 초당 최대 몇 바퀴까지 인정하는지 (빠른 매크로 방지)
  WORK_NOISE: 4.5 * 48,     // 장치 작동 소리 반경 (소리 듣는 엔티티가 온다)
  SPEED_BONUS: 0.25,        // 미션 진행도 100% 일 때 엔티티 추격 속도 증가율
};
/** 미션 화면 문구. kind 별 이름 / 인트로 설명 */
export const MISSION_TEXT = {
  keys:      { unit: '열쇠', goal: n => `열쇠 ${n}개를 모아 출구를 열어라` },
  games:     { unit: '게임', goal: n => `파티 게임기 ${n}대를 모두 클리어하라` },
  exams:     { unit: '시험', goal: n => `교실 단말기 ${n}대의 시험을 통과하라` },
  valve:     { unit: '밸브', goal: n => `벽의 증기 밸브 ${n}개를 잠가라 — E 를 누르고 오른쪽으로 돌려라` },
  generator: { unit: '발전기', goal: n => `발전기 ${n}대의 크랭크를 돌려 시동을 걸어라 — 시끄럽다` },
  drain:     { unit: '배수 밸브', goal: n => `벽의 배수 밸브 ${n}개를 열어라 — E 를 누르고 오른쪽으로 돌려라` },
  fuse:      { unit: '퓨즈', depot: '배전반', goal: n => `퓨즈 ${n}개를 찾아 시작 지점 배전반에 꽂아라` },
  radio:     { unit: '부품', depot: '무전기', goal: n => `무전기 부품 ${n}개를 모아 시작 지점 무전기를 고쳐라` },
  files:     { unit: '서류', depot: '팩스', goal: n => `서류 ${n}장을 찾아 시작 지점 팩스로 보내라 — 창문 가까이 가지 마라` },
  toys:      { unit: '장난감', depot: '장난감 상자', goal: n => `장난감 ${n}개를 모아 장난감 상자에 넣어라 — 키티에게서 눈을 떼지 마라` },
  gas:       { unit: '기름통', depot: '트럭', goal: n => `기름통 ${n}개를 찾아 시작 지점 트럭에 넣어라 — 잭-오-랜턴은 불빛을 쫓는다` },
  boiler:    { unit: '압력 밸브', goal: n => `보일러 압력 밸브 ${n}개를 잠가라 — 야수가 돌진하면 옆으로 피하라` },
  pump:      { unit: '배수 펌프', goal: n => `벽의 배수 펌프 ${n}개를 돌려라 — 물속에선 조용히 움직여라` },
  cabinets:  { unit: '오락기', goal: n => `오락기 ${n}대를 클리어해 집으로 가는 문을 열어라` },
  elevator:  { unit: '엘리베이터', goal: t => `엘리베이터가 올 때까지 ${t}초 버텨라 — 숨어만 있으면 시간이 멈춘다` },
  motion:    { unit: '탈출', goal: t => `${t}초 버텨라 — 밤이 오면 옷장(사물함)에 숨어라` },
  checkout:  { unit: '체크아웃', goal: t => `체크아웃 시간까지 ${t}초 버텨라 — 숨어만 있으면 시간이 멈춘다` },
  dawn:      { unit: '새벽', goal: t => `해가 뜰 때까지 ${t}초 버텨라 — 숨어만 있으면 시간이 멈춘다` },
  run:       { unit: '', goal: () => '오른쪽 끝까지 달려라' },
  noclip:    { unit: '', goal: () => '도시 맨 위 끝의 노클립 존을 찾아 E 를 눌러라 — 넓은 도로엔 눈알이 걸어 다닌다' },
};
export const missionOf = i => { const L = levelInfo(i); return { type: 'keys', count: CONFIG.KEY_COUNT, ...L.mission }; };
export const missionKind = m => m.kind || m.type;
export const missionGoal = m => { const T = MISSION_TEXT[missionKind(m)] || MISSION_TEXT.keys; return T.goal(m.type === 'survive' ? m.time : m.count); };
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
  firecracker: { name: '폭죽', perLevel: 2, uses: 1, throw: 5 * 48, noise: 10 * 48, dur: 4 },        // 앞쪽으로 던져 터뜨림: 소리 듣는 엔티티를 그쪽으로 유인
  nightVision: { name: '야간 투시경', perLevel: 1, uses: 1, dur: 20 },                                 // 20초 동안 어둠·벽 너머까지 초록빛으로 보인다
  adrenaline:  { name: '아드레날린', perLevel: 2, uses: 1, dur: 6, speed: 1.3 },                      // 6초 동안 더 빠르게, 지치지 않음
};

export const levelInfo = i => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i | 0))];

export const TS = CONFIG.TILE;
export const T = Object.freeze({ FLOOR: 0, WALL: 1, EXIT: 2, SLOW: 3 });   // SLOW = 웅덩이/잔해 (지나갈 수 있지만 느려짐)
export const ENTITY_TYPES = ['wanderer', 'howler', 'smiler', 'skinStealer', 'hound', 'partygoer', 'deathmoth', 'wretch', 'scratcher',
  'windows', 'watch', 'faceling', 'clump', 'animation', 'animatedKing', 'aranea', 'kitty', 'partyPooper',
  'beast', 'seaThing', 'crawler', 'deathrat', 'jackLantern', 'camoCrawler', 'duller', 'sheet'];
/** 화면 표시용 레벨 이름 ("LEVEL 0", "LEVEL FUN =)") */
export const levelLabel = i => { const L = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i | 0))]; return L.label ? `LEVEL ${L.label}` : `LEVEL ${L.id}`; };
/** 방호복 색 (대기방에서 고름). 방랑자/스킨 스틸러도 이 중 하나를 랜덤으로 입는다 */
export const PLAYER_COLORS = ['default', 'green', 'blue', 'red'];
export const SUIT_HEX = { default: '#e7b92e', green: '#5fae4e', blue: '#3f7fd0', red: '#c8423a' };
export const SUIT_NAMES = { default: '기본', green: '초록', blue: '파랑', red: '빨강' };
export const randomSuit = () => PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
