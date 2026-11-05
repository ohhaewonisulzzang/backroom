import { LEVELS, levelLabel } from '../../shared/config.js';

/**
 * 괴물 도감. 그 괴물이 나오는 레벨에 들어가면 도감에 채워진다 (이 브라우저의 localStorage 에 저장).
 * horde 는 Level ! 의 괴물 떼 (엔티티가 아니라 레벨 장치라 따로 둔다).
 */
export const BESTIARY = [
  { type: 'wanderer', name: '방랑자', look: '바랜 방호복을 입은 사람', behavior: '길을 잃고 천천히 배회한다. 무해하다.', counter: '무시해도 된다. 단, 스킨 스틸러일 수도 있다.' },
  { type: 'howler', name: '하울러', look: '철사 뭉치 같은 몸', behavior: '라운드 시작 40초 뒤 깨어난다. 보이면 비명을 지르며 추격하고, 걷기보다 빠르다. 멀리 떨어지면 근처로 순간이동한다.', counter: '달려서 시야를 끊는다. 모퉁이를 활용하라.' },
  { type: 'smiler', name: '스마일러', look: '어둠 속의 하얀 미소', behavior: '어두운 구역 안에서만 움직이고, 어둠 속에 있는 플레이어만 노린다.', counter: '손전등을 비추면 사라진다. 밝은 곳으로 나가도 된다.' },
  { type: 'skinStealer', name: '스킨 스틸러', look: '방랑자로 위장 → 몸까지 찢어진 입', behavior: '다가와서 "hello?" 하고 말을 건 뒤 정체를 드러내고 추격한다.', counter: '말을 걸면 즉시 도망. 방독면 유리가 살짝 붉으면 가짜다.' },
  { type: 'hound', name: '하운드', look: '사람 머리를 한 개', behavior: '보이면 네 발로 추격한다.', counter: '손전등을 비추면 겁먹고 물러난다 (너무 가까우면 소용없다).' },
  { type: 'partygoer', name: '파티고어', look: '노란 몸, 빨판 손, 붉은 풍선, 삐뚤게 그린 웃는 얼굴', behavior: '제자리에서 시선을 좌우로 돌리며 감시한다. 보이면 추격하고, 발소리가 들리면 확인하러 온다.', counter: '시야 사각지대로 이동하고, 가까이선 웅크려 소리를 죽인다. 탁자 밑에 숨어라.' },
  { type: 'deathmoth', name: '데스모스', look: '붉은 겹눈, 눈알 무늬 날개의 거대한 나방', behavior: '벽에 붙어 있다가 발소리나 손전등 빛에 날아온다. 목소리엔 반응하지 않는다.', counter: '웅크려 걷고 손전등을 끈다. 살충제로 쫓아낸다.' },
  { type: 'wretch', name: '광인', look: '붉은 살점으로 뒤덮인 인간형', behavior: '앞을 못 본다. 발소리·목소리 쪽으로 다가온다. 플레이어보다 느리다.', counter: '소리를 내지 않는다. 조명탄으로 유인하라.' },
  { type: 'horde', name: '괴물 떼', look: '끝없이 밀려오는 하울러 무리', behavior: '왼쪽에서 점점 빨라지며 밀려온다. 닿으면 즉사.', counter: '장애물과 웅덩이를 피해 오른쪽 끝 출구까지 멈추지 말고 달려라.' },
  { type: 'scratcher', name: '스크래처', look: '심하게 마른 긴 팔다리, 붉은 안광', behavior: '네발로 기어다니며 소리로만 찾는다. 귀가 아주 밝다.', counter: '책상 밑에 숨는다. 웅크려 이동하라.' },
];

/** 레벨 i 에서 만나는 괴물 종류 */
export const typesInLevel = i => {
  const L = LEVELS[i];
  if (!L) return [];
  const t = Object.keys(L.entities || {}).filter(k => L.entities[k] > 0);
  if (L.layout === 'run') t.push('horde');
  return t;
};

/** 괴물이 나오는 레벨 이름들 */
export const levelsOf = type => LEVELS.map((_, i) => i).filter(i => typesInLevel(i).includes(type)).map(levelLabel);

const KEY = 'backrooms.bestiary';
export function loadDiscovered() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
}
/** 레벨에 들어갔을 때 호출. 새로 채워진 괴물 이름 목록을 돌려준다 */
export function discoverLevel(i) {
  const seen = loadDiscovered(), fresh = [];
  for (const t of typesInLevel(i)) if (!seen.has(t)) { seen.add(t); fresh.push(t); }
  if (fresh.length) { try { localStorage.setItem(KEY, JSON.stringify([...seen])); } catch { /* 저장 불가 환경 무시 */ } }
  return fresh.map(t => BESTIARY.find(b => b.type === t)?.name || t);
}
