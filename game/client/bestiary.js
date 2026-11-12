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
  { type: 'partygoer', name: '파티고어', look: '구부정하고 비쩍 마른 몸, 주름진 노란 가죽, 움푹 꺼진 갈비뼈, 눈 없는 머리에 세로로 찢어져 피를 흘리는 입, 붉은 풍선', behavior: '제자리에서 시선을 좌우로 돌리며 감시한다. 보이면 추격하고, 발소리가 들리면 확인하러 온다.', counter: '시야 사각지대로 이동하고, 가까이선 웅크려 소리를 죽인다. 탁자 밑에 숨어라.' },
  { type: 'deathmoth', name: '데스모스', look: '붉은 겹눈, 눈알 무늬 날개의 거대한 나방', behavior: '벽에 붙어 있다가 발소리나 손전등 빛에 날아온다. 목소리엔 반응하지 않는다.', counter: '웅크려 걷고 손전등을 끈다. 살충제로 쫓아낸다.' },
  { type: 'wretch', name: '광인', look: '붉은 살점으로 뒤덮인 인간형', behavior: '앞을 못 본다. 발소리·목소리 쪽으로 다가온다. 플레이어보다 느리다.', counter: '소리를 내지 않는다. 조명탄으로 유인하라.' },
  { type: 'horde', name: '괴물 떼', look: '끝없이 밀려오는 하울러 무리', behavior: '왼쪽에서 점점 빨라지며 밀려온다. 닿으면 즉사.', counter: '장애물과 웅덩이를 피해 오른쪽 끝 출구까지 멈추지 말고 달려라.' },
  { type: 'windows', name: '창문들', look: '창문 속 붉은 눈의 사람 그림자', behavior: '사무실·안뜰 벽의 창문 속에서 노크한다. 가까이 다가가면 유리를 깨고 손을 뻗어 끌고 간다. 창문에서 멀리 나오지는 못한다.', counter: '창문 가까이 가지 마라. 노크 소리가 들리면 반대쪽 벽으로.' },
  { type: 'watch', name: '동네 감시자', look: '가늘고 긴 다리 넷 위의 거대한 눈알', behavior: '쿵쿵 발소리를 내며 넓은 도로를 천천히 걷는다. 멀리서도 보고, 쫓을 땐 사람보다 훨씬 빠르다. 좁은 골목(집 안)에는 들어오지 못한다.', counter: '쿵쿵 소리가 들리면 도로를 피하고 좁은 골목으로 다녀라.' },
  { type: 'faceling', name: '페이슬링', look: '이목구비가 없는 사람, 전기톱', behavior: '밀밭을 돌아다니다 보이면 쫓아온다. 전기톱 소리가 시끄럽고, 걸음은 느리다.', counter: '소리가 들리는 쪽을 피하고, 쫓기면 걸어서도 따돌릴 수 있다.' },
  { type: 'clump', name: '클럼프', look: '손발이 잔뜩 달린 거대한 살덩어리, 큰 입', behavior: '소리 없이 쫓아오고 무거운 발소리만 난다. 물에는 들어오지 못한다.', counter: '깨끗한 물웅덩이로 피하라. 초록 물은 안 된다.' },
  { type: 'hydrolitis', name: '하이드로리티스 플레그', look: '탁한 초록 물속을 떠다니는 세균', behavior: '움직이지 않는다. 초록 물에 서 있으면 시야가 어두워지고 심장 소리가 커지다가, 오래 있으면 죽는다.', counter: '시야가 어두워지기 전에 물에서 나와라.' },
  { type: 'animation', name: '애니메이션', look: '나무 인형', behavior: '낮엔 제자리에 서 있다. 종이 울리고 밤이 되면 깨어나 숨지 않은 사람에게 달려든다.', counter: '종소리가 들리면 옷장(사물함)에 숨어라. 숨은 사람은 찾지 못한다.' },
  { type: 'animatedKing', name: '애니메이션 킹', look: '왕관을 쓴 광대, 큰 망치', behavior: '쳐다보는 동안엔 멈춘다. 눈을 떼면 소리 없이 다가온다. 손전등을 비추면 사라졌다가 근처에 다시 나타난다.', counter: '눈을 떼지 말고 손전등을 비춰라. 벽을 등지면 사각지대가 준다.' },
  { type: 'aranea', name: '아라네아 멤브리', look: '사람 해골 머리의 거대한 거미', behavior: '보이면 다다닥 소리를 내며 하울러보다 빠르게 달려온다. 몸이 커서 좁은 복도엔 들어오지 못한다.', counter: '넓은 안뜰을 피하고 좁은 복도로 숨어라.' },
  { type: 'kitty', name: '키티', look: '고양이 귀가 달린 하얀 막대 인간', behavior: '보고 있으면 멈추고, 안 보면 천천히 다가온다. 가끔 이상한 소리와 함께 가까이 순간이동한다.', counter: '눈을 떼지 말고 거리를 유지하라.' },
  { type: 'partyPooper', name: '파티 푸퍼', look: '후드 망토, 슬픈 파란 가면', behavior: '유일하게 도와주는 엔티티. 학교 복도 곳곳에 서 있다. 말을 걸면(E) 남은 단말기 하나까지 앞장서 데려가고, 멀어지면 기다려 준다. 그 열쇠를 누가 먹으면 사라진다.', counter: '해치지 않는다. 뒤에서 잘 따라가라.' },
  { type: 'beast', name: '레벨 5의 야수', look: '털로 뒤덮인 거대한 짐승, 주황색 눈', behavior: '보일러실을 어슬렁거린다. 보이면 포효한 뒤 일직선으로 돌진하고, 벽에 부딪히면 잠깐 비틀거린다.', counter: '포효가 들리면 옆 통로로 비켜라. 돌진 방향은 바뀌지 않는다.' },
  { type: 'seaThing', name: '레벨 7의 무언가', look: '물 밑의 거대한 그림자, 바늘 같은 이빨', behavior: '물속에서만 움직인다. 물을 휘젓는 소리를 듣고 다가온다. 물웅덩이가 끊겨 있어도 물 밑으로 옮겨 온다.', counter: '물에선 웅크려 걷거나 멈춰라. 물 밖으로 나가면 쫓지 못한다.' },
  { type: 'crawler', name: '크롤러', look: '천장에 거꾸로 붙은 긴 팔다리의 창백한 것', behavior: '어둠 속 천장에 붙어 있다가 바로 밑을 지나가면 비명과 함께 떨어져 잠깐 쫓아온다.', counter: '천장의 그림자를 살펴라. 웅크리면 더 가까이 지나가도 들키지 않는다.' },
  { type: 'deathrat', name: '죽음쥐', look: '털 빠진 붉은 눈의 쥐', behavior: '보이면 아주 빠르게 달려들지만 금방 지쳐서 쉰다.', counter: '손전등을 비추면 흩어진다. 몇 초만 버티면 지친다.' },
  { type: 'jackLantern', name: '잭-오-랜턴', look: '호박 머리 허수아비, 타오르는 눈', behavior: '불빛에 끌린다. 손전등을 켠 사람은 멀리서도 보고, 끈 사람은 코앞에서만 본다. 조명탄에도 끌려간다.', counter: '주황 불빛이 보이면 손전등을 꺼라. 조명탄으로 유인하라.' },
  { type: 'camoCrawler', name: '위장 크롤러', look: '벽과 같은 색의 납작한 도마뱀 인간', behavior: '벽인 척 붙어 있다가 아무도 안 볼 때 슬금슬금 다가온다. 가까이 가면 튀어나와 쫓는다.', counter: '벽에 붙은 이상한 덩어리를 피해서 다녀라. 쳐다보는 동안은 움직이지 않는다.' },
  { type: 'duller', name: '덜러', look: '색이 다 빠진 회색 사람', behavior: '눈에 보이면 아주 느리게 따라온다. 벽 너머로 숨으면 놓친다. 가까이 있으면 세상의 색이 바래고 정신력이 빨리 준다. 닿으면 죽지는 않지만 정신력의 30%를 빼앗긴다.', counter: '벽 뒤로 숨어 시야를 끊어라. 아주 느려서 웅크려 걸어도 따돌릴 수 있다. 아몬드 워터를 아껴라.' },
  { type: 'sheet', name: '시츠', look: '하얀 천을 뒤집어쓴 유령', behavior: '벽을 통과해 떠다니며 가까운 사람에게 곧장 다가온다.', counter: '손전등을 비추면 물러난다. 벽 너머에서 희미하게 비치는 모습을 살펴라.' },
  { type: 'scratcher', name: '스크래처', look: '심하게 마른 긴 팔다리, 붉은 안광', behavior: '네발로 기어다니며 소리로만 찾는다. 귀가 아주 밝다.', counter: '책상 밑에 숨는다. 웅크려 이동하라.' },
];

/** 레벨 i 에서 만나는 괴물 종류 */
export const typesInLevel = i => {
  const L = LEVELS[i];
  if (!L) return [];
  const t = Object.keys(L.entities || {}).filter(k => L.entities[k] > 0);
  if (L.layout === 'run') t.push('horde');
  t.push(...(L.hazards || []));
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
