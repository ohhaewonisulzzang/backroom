/** 한국어 원문 → English (story). 키는 코드의 한국어 문장과 글자 하나까지 같아야 한다 */
export default {
  // ---------------------------------------------------------------- 오프닝 (game/client/story.js)
  '나': 'Me',
  '자, 녹화 시작했다. 폐건물 탐험 3편!': 'Rolling! Abandoned building, part 3!',
  '야... 여기 진짜 들어와도 되는 거 맞아?': 'Dude... are we really allowed in here?',
  '괜찮아. 저 복도 끝까지만 찍고 나가자.': 'It\'s fine. Just film to the end of the hall.',
  '잠깐... 저 벽, 원래 노란색이었나?': 'Wait... was that wall always yellow?',
  '이 소리 뭐야? 형광등...?': 'What\'s that sound? The lights...?',
  '어? 바닥이—': 'Huh? The floor—',
  '{name}?! 야, 어디 갔어?!': '{name}?! Hey, where\'d you go?!',
  '어? 다들 어디— 으악!': 'Huh? Where is every— AAH!',

  // ---------------------------------------------------------------- 엔딩 (game/client/ending.js)
  '...여기, 그 폐건물이잖아?': '...Wait, this is the old building?',
  '돌아왔어... 진짜로 돌아왔어!': 'We\'re back... we\'re actually back!',
  '{name}?! 너 어디 있었던 거야?': '{name}?! Where have you been?',
  '...카메라, 아직 녹화 중이었네.': '...The camera was still recording.',
  '너무 많이 죽음': 'Died way too much',
  '많이 죽음': 'Died a lot',
  '퍼즐 해결사': 'Puzzle solver',
  '성과가 좋음': 'Top performer',
  '한 번도 죽지 않음': 'Never died',
  '탈출 일등공신': 'Escape MVP',
  '구경만 함': 'Just watched',
  '그럭저럭 살아남음': 'Survived, somehow',
  '생존 보고서  —  SURVIVAL REPORT': 'SURVIVAL REPORT',
  '플레이 시간   {time}': 'Play time      {time}',
  '총 사망 횟수  {n}번': 'Total deaths   {n}',
  '사망 {deaths}  ·  열쇠 {keys}  ·  퍼즐 {puzzles}  ·  배달 {delivered}  ·  장치 {activated}  ·  탈출 {escapes}':
    'Deaths {deaths} · Keys {keys} · Puzzles {puzzles} · Parts {delivered} · Devices {activated} · Escapes {escapes}',
  '탈출 성공': 'ESCAPED',

  // ---------------------------------------------------------------- 감정 표현 이름 (game/client/sprites.js GESTURES)
  '뻐큐': 'Middle finger',
  '가리키기': 'Point',
  '춤 1 (들썩)': 'Dance 1 (Bounce)',
  '춤 2 (빙글)': 'Dance 2 (Spin)',
  '트월킹': 'Twerk',

  // ---------------------------------------------------------------- 괴물 도감 (game/client/bestiary.js)
  '방랑자': 'Wanderer',
  '바랜 방호복을 입은 사람': 'A person in a faded hazmat suit',
  '길을 잃고 천천히 배회한다. 무해하다.': 'Lost, it wanders slowly. Harmless.',
  '무시해도 된다. 단, 스킨 스틸러일 수도 있다.': 'Safe to ignore. Unless it\'s a Skin Stealer.',

  '하울러': 'Howler',
  '철사 뭉치 같은 몸': 'A body like a tangle of wire',
  '라운드 시작 40초 뒤 깨어난다. 보이면 비명을 지르며 추격하고, 걷기보다 빠르다. 멀리 떨어지면 근처로 순간이동한다.':
    'Wakes 40 seconds into the round. Screams and chases on sight, faster than walking. Teleports closer if you get too far away.',
  '달려서 시야를 끊는다. 모퉁이를 활용하라.': 'Run to break line of sight. Use the corners.',

  '스마일러': 'Smiler',
  '어둠 속의 하얀 미소': 'A white grin in the dark',
  '어두운 구역 안에서만 움직이고, 어둠 속에 있는 플레이어만 노린다.': 'Moves only within dark zones and hunts only players standing in the dark.',
  '손전등을 비추면 사라진다. 밝은 곳으로 나가도 된다.': 'Shine your flashlight and it vanishes. Or step into the light.',

  '스킨 스틸러': 'Skin Stealer',
  '방랑자로 위장 → 몸까지 찢어진 입': 'Disguised as a Wanderer → a mouth torn down its body',
  '다가와서 "hello?" 하고 말을 건 뒤 정체를 드러내고 추격한다.': 'Walks up, says "hello?", then reveals itself and gives chase.',
  '말을 걸면 즉시 도망. 방독면 유리가 살짝 붉으면 가짜다.': 'If it talks to you, run. A faint red tint on the mask glass means it\'s fake.',

  '하운드': 'Hound',
  '사람 머리를 한 개': 'A dog with a human head',
  '보이면 네 발로 추격한다.': 'Chases on all fours when it sees you.',
  '손전등을 비추면 겁먹고 물러난다 (너무 가까우면 소용없다).': 'Shine your flashlight and it backs off in fear (useless if it\'s too close).',

  '파티고어': 'Partygoer',
  '마른 남자 몸, 주름진 노란 가죽, 드러난 갈비뼈와 가슴의 상처, 입이 없는 텅 빈 얼굴에 작은 검은 눈, 흔들리는 붉은 풍선':
    'Thin male body, wrinkled yellow skin, exposed ribs and a chest wound, a blank mouthless face with tiny black eyes, a bobbing red balloon',
  '제자리에서 시선을 좌우로 돌리며 감시한다. 보이면 추격하고, 발소리가 들리면 확인하러 온다.':
    'Stands in place, sweeping its gaze left and right. Chases on sight and comes to check on footsteps.',
  '시야 사각지대로 이동하고, 가까이선 웅크려 소리를 죽인다. 탁자 밑에 숨어라.':
    'Move through its blind spots and crouch to stay quiet up close. Hide under tables.',

  '데스모스': 'Deathmoth',
  '붉은 겹눈, 눈알 무늬 날개의 거대한 나방': 'A giant moth with red compound eyes and eye-patterned wings',
  '벽에 붙어 있다가 발소리나 손전등 빛에 날아온다. 목소리엔 반응하지 않는다.': 'Clings to walls, then flies at footsteps or flashlight beams. Ignores voices.',
  '웅크려 걷고 손전등을 끈다. 살충제로 쫓아낸다.': 'Crouch-walk and turn off your flashlight. Drive it off with Bug Spray.',

  '광인': 'Wretch',
  '붉은 살점으로 뒤덮인 인간형': 'A humanoid covered in raw red flesh',
  '앞을 못 본다. 발소리·목소리 쪽으로 다가온다. 플레이어보다 느리다.': 'Blind. Moves toward footsteps and voices. Slower than players.',
  '소리를 내지 않는다. 조명탄으로 유인하라.': 'Make no sound. Lure it away with flares.',

  '괴물 떼': 'The Horde',
  '끝없이 밀려오는 하울러 무리': 'An endless swarm of Howlers',
  '왼쪽에서 점점 빨라지며 밀려온다. 닿으면 즉사.': 'Surges in from the left, faster and faster. One touch is instant death.',
  '장애물과 웅덩이를 피해 오른쪽 끝 출구까지 멈추지 말고 달려라.': 'Dodge obstacles and puddles. Don\'t stop running until the exit at the far right.',

  '창문들': 'The Windows',
  '창문 속 붉은 눈의 사람 그림자': 'Red-eyed human shadows behind the glass',
  '사무실·안뜰 벽의 창문 속에서 노크한다. 가까이 다가가면 유리를 깨고 손을 뻗어 끌고 간다. 창문에서 멀리 나오지는 못한다.':
    'They knock from windows in office and courtyard walls. Get close and they smash the glass and drag you in. They can\'t stray far from the windows.',
  '창문 가까이 가지 마라. 노크 소리가 들리면 반대쪽 벽으로.': 'Stay away from windows. Hear knocking? Hug the opposite wall.',

  '동네 감시자': 'Neighborhood Watch',
  '가늘고 긴 다리 넷 위의 거대한 눈알': 'A giant eyeball on four long, thin legs',
  '쿵쿵 발소리를 내며 넓은 도로를 천천히 걷는다. 멀리서도 보고, 쫓을 땐 사람보다 훨씬 빠르다. 좁은 골목(집 안)에는 들어오지 못한다.':
    'Stomps slowly along the wide roads. Sees from far away and is much faster than you in a chase. Can\'t enter narrow alleys (between houses).',
  '쿵쿵 소리가 들리면 도로를 피하고 좁은 골목으로 다녀라.': 'When you hear stomping, leave the road and stick to narrow alleys.',

  '페이슬링': 'Faceling',
  '이목구비가 없는 사람, 전기톱': 'A featureless person with a chainsaw',
  '밀밭을 돌아다니다 보이면 쫓아온다. 전기톱 소리가 시끄럽고, 걸음은 느리다.': 'Roams the wheat field and chases on sight. The chainsaw is loud; its steps are slow.',
  '소리가 들리는 쪽을 피하고, 쫓기면 걸어서도 따돌릴 수 있다.': 'Avoid the noise. If chased, you can lose it even at a walk.',

  '클럼프': 'Clump',
  '손발이 잔뜩 달린 거대한 살덩어리, 큰 입': 'A giant mass of flesh with countless limbs and a huge mouth',
  '소리 없이 쫓아오고 무거운 발소리만 난다. 물에는 들어오지 못한다.': 'Chases silently, betrayed only by heavy footsteps. Can\'t enter water.',
  '깨끗한 물웅덩이로 피하라. 초록 물은 안 된다.': 'Escape into clean puddles. Not the green water.',

  '하이드로리티스 플레그': 'Hydrolitis Plague',
  '탁한 초록 물속을 떠다니는 세균': 'Bacteria drifting in murky green water',
  '움직이지 않는다. 초록 물에 서 있으면 시야가 어두워지고 심장 소리가 커지다가, 오래 있으면 죽는다.':
    'Doesn\'t move. Stand in green water and your vision darkens and your heartbeat pounds. Stay too long and you die.',
  '시야가 어두워지기 전에 물에서 나와라.': 'Get out of the water before your vision goes dark.',

  '애니메이션': 'Animation',
  '나무 인형': 'A wooden mannequin',
  '낮엔 제자리에 서 있다. 종이 울리고 밤이 되면 깨어나 숨지 않은 사람에게 달려든다.': 'Stands still by day. When the bell tolls and night falls, it wakes and lunges at anyone not hiding.',
  '종소리가 들리면 옷장(사물함)에 숨어라. 숨은 사람은 찾지 못한다.': 'When the bell rings, hide in a wardrobe (locker). It can\'t find those who hide.',

  '애니메이션 킹': 'Animated King',
  '왕관을 쓴 광대, 큰 망치': 'A crowned clown with a big mallet',
  '쳐다보는 동안엔 멈춘다. 눈을 떼면 소리 없이 다가온다. 손전등을 비추면 사라졌다가 근처에 다시 나타난다.':
    'Freezes while watched. Look away and it creeps closer, silent. Your flashlight makes it vanish, then reappear nearby.',
  '눈을 떼지 말고 손전등을 비춰라. 벽을 등지면 사각지대가 준다.': 'Keep your eyes on it and shine your light. Put your back to a wall to shrink blind spots.',

  '아라네아 멤브리': 'Aranea Membri',
  '사람 해골 머리의 거대한 거미': 'A giant spider with a human skull for a head',
  '보이면 다다닥 소리를 내며 하울러보다 빠르게 달려온다. 몸이 커서 좁은 복도엔 들어오지 못한다.': 'On sight it skitters at you, faster than a Howler. Too big for narrow corridors.',
  '넓은 안뜰을 피하고 좁은 복도로 숨어라.': 'Avoid the open courtyards. Hide in narrow corridors.',

  '키티': 'Kitty',
  '고양이 귀가 달린 하얀 막대 인간': 'A white stick figure with cat ears',
  '보고 있으면 멈추고, 안 보면 천천히 다가온다. 가끔 이상한 소리와 함께 가까이 순간이동한다.': 'Freezes while watched, creeps closer when you look away. Sometimes teleports nearby with a strange sound.',
  '눈을 떼지 말고 거리를 유지하라.': 'Keep your eyes on it and keep your distance.',

  '파티 푸퍼': 'Party Pooper',
  '후드 망토, 슬픈 파란 가면': 'A hooded cloak and a sad blue mask',
  '유일하게 도와주는 엔티티. 학교 복도 곳곳에 서 있다. 말을 걸면(E) 남은 단말기 하나까지 앞장서 데려가고, 멀어지면 기다려 준다. 그 열쇠를 누가 먹으면 사라진다.':
    'The only entity that helps. Stands around the school halls. Talk to it (E) and it leads you to a remaining terminal, waiting if you fall behind. Vanishes once someone takes that key.',
  '해치지 않는다. 뒤에서 잘 따라가라.': 'Harmless. Just follow closely.',

  '레벨 5의 야수': 'The Beast of Level 5',
  '털로 뒤덮인 거대한 짐승, 주황색 눈': 'A huge fur-covered beast with orange eyes',
  '보일러실을 어슬렁거린다. 보이면 포효한 뒤 일직선으로 돌진하고, 벽에 부딪히면 잠깐 비틀거린다.': 'Prowls the boiler room. On sight it roars, then charges in a straight line, staggering briefly if it hits a wall.',
  '포효가 들리면 옆 통로로 비켜라. 돌진 방향은 바뀌지 않는다.': 'When you hear the roar, dodge into a side passage. It can\'t turn mid-charge.',

  '레벨 7의 무언가': 'The Thing in Level 7',
  '물 밑의 거대한 그림자, 바늘 같은 이빨': 'A giant shadow beneath the water, needle-like teeth',
  '물속에서만 움직인다. 물을 휘젓는 소리를 듣고 다가온다. 물웅덩이가 끊겨 있어도 물 밑으로 옮겨 온다.': 'Moves only in water and homes in on splashing. Travels underneath, even between separate pools.',
  '물에선 웅크려 걷거나 멈춰라. 물 밖으로 나가면 쫓지 못한다.': 'In water, crouch-walk or stand still. Get out of the water and it can\'t follow.',

  '크롤러': 'Crawler',
  '천장에 거꾸로 붙은 긴 팔다리의 창백한 것': 'A pale, long-limbed thing clinging upside down to the ceiling',
  '어둠 속 천장에 붙어 있다가 바로 밑을 지나가면 비명과 함께 떨어져 잠깐 쫓아온다.': 'Lurks on dark ceilings. Pass right beneath it and it drops with a shriek and chases you briefly.',
  '천장의 그림자를 살펴라. 웅크리면 더 가까이 지나가도 들키지 않는다.': 'Watch the ceiling shadows. Crouch and you can pass closer unnoticed.',

  '죽음쥐': 'Deathrat',
  '털 빠진 붉은 눈의 쥐': 'A hairless rat with red eyes',
  '보이면 아주 빠르게 달려들지만 금방 지쳐서 쉰다.': 'Lunges very fast on sight, but tires quickly and rests.',
  '손전등을 비추면 흩어진다. 몇 초만 버티면 지친다.': 'Shine your flashlight to scatter them. Last a few seconds and they tire.',

  '잭-오-랜턴': 'Jack-o\'-Lantern',
  '호박 머리 허수아비, 타오르는 눈': 'A pumpkin-headed scarecrow with burning eyes',
  '불빛에 끌린다. 손전등을 켠 사람은 멀리서도 보고, 끈 사람은 코앞에서만 본다. 조명탄에도 끌려간다.': 'Drawn to light. Spots flashlight users from afar, others only up close. Flares lure it too.',
  '주황 불빛이 보이면 손전등을 꺼라. 조명탄으로 유인하라.': 'See an orange glow? Kill your flashlight. Lure it with flares.',

  '위장 크롤러': 'Camo Crawler',
  '벽과 같은 색의 납작한 도마뱀 인간': 'A flat lizard-man the same color as the walls',
  '벽인 척 붙어 있다가 아무도 안 볼 때 슬금슬금 다가온다. 가까이 가면 튀어나와 쫓는다.': 'Poses as part of the wall and creeps closer when no one\'s looking. Get close and it leaps out to chase.',
  '벽에 붙은 이상한 덩어리를 피해서 다녀라. 쳐다보는 동안은 움직이지 않는다.': 'Steer clear of strange lumps on the walls. It won\'t move while watched.',

  '덜러': 'Duller',
  '색이 다 빠진 회색 사람': 'A gray person drained of all color',
  '눈에 보이면 아주 느리게 따라온다. 벽 너머로 숨으면 놓친다. 가까이 있으면 세상의 색이 바래고 정신력이 빨리 준다. 닿으면 죽지는 않지만 정신력의 30%를 빼앗긴다.':
    'Follows very slowly once it sees you; hide behind a wall and it loses you. Nearby, color fades from the world and Sanity drains fast. Its touch won\'t kill, but it steals 30% of your Sanity.',
  '벽 뒤로 숨어 시야를 끊어라. 아주 느려서 웅크려 걸어도 따돌릴 수 있다. 아몬드 워터를 아껴라.':
    'Break line of sight behind walls. It\'s so slow you can lose it even crouching. Save your Almond Water.',

  '시츠': 'Sheets',
  '하얀 천을 뒤집어쓴 유령': 'A ghost under a white sheet',
  '벽을 통과해 떠다니며 가까운 사람에게 곧장 다가온다.': 'Floats through walls, straight toward the nearest person.',
  '손전등을 비추면 물러난다. 벽 너머에서 희미하게 비치는 모습을 살펴라.': 'Shine your flashlight to drive it back. Watch for its faint glow through walls.',

  '스크래처': 'Scratcher',
  '심하게 마른 긴 팔다리, 붉은 안광': 'Emaciated long limbs, glowing red eyes',
  '네발로 기어다니며 소리로만 찾는다. 귀가 아주 밝다.': 'Crawls on all fours and hunts by sound alone. Its hearing is very sharp.',
  '책상 밑에 숨는다. 웅크려 이동하라.': 'Hide under desks. Move while crouching.',

  // ---------------------------------------------------------------- 휴대폰 안내 사이트 (components/MobileGuide.jsx)
  '정신력을 크게 회복한다. 환각이 사라진다.': 'Restores a lot of Sanity. Clears hallucinations.',
  '스태미나가 가득 차고 8초 동안 지치지 않는다.': 'Fills your stamina and keeps you from tiring for 8 seconds.',
  '플래시로 앞쪽 엔티티를 기절시킨다. 스마일러는 사라진다. (3회)': 'The flash stuns entities in front of you. Smilers vanish. (3 uses)',
  '데스모스를 벽으로 쫓아낸다. (3회)': 'Drives Deathmoths back to the walls. (3 uses)',
  '30초 동안 주변을 밝히고, 소리로 귀 밝은 엔티티를 끌어들인다.': 'Lights up the area for 30 seconds, and its hiss draws sharp-eared entities.',
  '25초 동안 가장 가까운 목표 방향을 알려 준다.': 'Points toward the nearest objective for 25 seconds.',
  '앞으로 던져 터뜨린다. 큰 소리로 엔티티를 다른 곳으로 유인한다.': 'Throw it ahead to explode. The bang lures entities elsewhere.',
  '20초 동안 어둠과 벽 너머까지 초록빛으로 보인다.': 'For 20 seconds, see through darkness and walls in green.',
  '6초 동안 더 빠르게, 지치지 않고 달린다.': 'Run faster, without tiring, for 6 seconds.',

  '탈출': 'Escape',
  '레벨마다 미션(열쇠 모으기, 부품 배달, 밸브 돌리기, 버티기)을 끝내면 출구가 열린다. 한 명이라도 나가면 다음 레벨로.':
    'Each Level has a mission (collect keys, deliver parts, turn valves, survive). Finish it to open the exit. If anyone gets out, everyone moves on.',
  '쪽지': 'Notes',
  '레벨 시작 지점에 떨어진 쪽지를 읽으면 할 일과 괴물 대처법이 적혀 있다.': 'Read the note dropped at the start of each Level. It tells you what to do and how to handle the monsters.',
  '정신력': 'Sanity',
  '시간이 갈수록, 어두울수록 줄어든다. 낮아지면 환각이 보이고 0 이 되면 끝. 아몬드 워터로 회복.':
    'Drains over time, faster in the dark. Run low and you hallucinate; hit 0 and it\'s over. Restore it with Almond Water.',
  '숨기': 'Hiding',
  '사물함에 숨으면 엔티티 눈에 안 보인다. 단, 쫓기다 숨는 걸 들키면 끌려 나온다.': 'Entities can\'t see you inside a locker. But if one sees you hide mid-chase, it drags you out.',
  '소리': 'Sound',
  '달리는 발소리, 목소리, 퍼즐 경보를 듣고 오는 엔티티가 있다. 웅크리면 조용히 걷는다.': 'Some entities come for running footsteps, voices and puzzle alarms. Crouch to walk quietly.',
  '함께': 'Together',
  '최대 4명. 보이스 챗은 거리에 따라 작아지고, 괴물이 들은 목소리를 흉내 내기도 한다.': 'Up to 4 players. Voice chat fades with distance, and monsters may mimic voices they\'ve heard.',

  '이동': 'Move',
  '마우스': 'Mouse',
  '조준 / 손전등 방향': 'Aim / flashlight',
  '달리기': 'Run',
  '웅크리기 (조용히)': 'Crouch (quiet)',
  '손전등': 'Flashlight',
  '숨기 · 퍼즐 · 쪽지 · 상호작용': 'Hide · puzzle · note · interact',
  '아이템 사용': 'Use item',
  'G + 숫자': 'G + number',
  '아이템 버리기': 'Drop item',
  '감정 표현': 'Emote',
  '채팅': 'Chat',
  '마이크': 'Mic',
  '메뉴 · 괴물 도감': 'Menu · Bestiary',

  '접속': 'Join',
  '이야기': 'Story',
  '방법': 'Rules',
  '레벨': 'Levels',
  '괴물': 'Monsters',
  '아이템': 'Items',
  '조작': 'Controls',

  '컴퓨터나 태블릿으로 접속해서 같이 하자': 'Join me on a computer or tablet',
  '현실에서 노클립하면, 끝없이 이어지는 노란 방에 떨어진다.': 'Noclip out of reality, and you fall into endless yellow rooms.',
  '휴대폰에서는 플레이할 수 없습니다': 'This game can\'t be played on a phone',
  '컴퓨터나 태블릿으로 접속하세요.': 'Please visit on a computer or tablet.',
  '이 페이지에서는 게임을 미리 둘러볼 수 있어요.': 'Here you can take a look around the game.',
  '링크 복사됨!': 'Link copied!',
  '링크 보내기 / 복사': 'Share / copy link',
  '둘러보기': 'Look around',
  '친구들과 폐건물 탐험 영상을 찍던 날. 벽이 노랗게 물들고, 바닥이 꺼졌다.': 'We were filming an abandoned building with friends. The walls turned yellow, and the floor gave way.',
  '눈을 뜨자 젖은 카펫 냄새와 형광등 윙윙거리는 소리. 끝없이 이어지는 노란 방 —': 'I opened my eyes to the smell of wet carpet and the hum of fluorescent lights. Endless yellow rooms —',
  '백룸': 'the Backrooms',
  '이다.': '.',
  '레벨을 하나씩 빠져나가 현실로 돌아가야 한다. 이곳엔 우리만 있는 게 아니다.': 'We must escape Level by Level to get back to reality. And we are not alone here.',
  '게임 방법': 'How to play',
  '레벨 탐험': 'Explore the Levels',
  '{n}개': '{n}',
  '시작': 'Start',
  '출구': 'Exit',
  '열쇠': 'Key',
  '퍼즐': 'Puzzle',
  '장치': 'Device',
  '부품': 'Part',
  '이전': 'Prev',
  '다음': 'Next',
  '괴물 도감': 'Bestiary',
  '{n}종': '{n} kinds',
  '눌러서 자세히 보기': 'Tap for details',
  '생김새': 'Looks',
  '행동': 'Behavior',
  '대처법': 'Counter',
  '조작법': 'Controls',
  '컴퓨터': 'Computer',
  '태블릿은 화면의 이동 스틱 · 조준 스틱 · 버튼으로 조작한다.': 'On tablets, use the on-screen move stick, aim stick and buttons.',
  '컴퓨터나 태블릿에서 만나요.': 'See you on a computer or tablet.',
};
