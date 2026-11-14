'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LEVELS, ITEM_TYPES, levelLabel, missionGoal, missionOf, T } from '../shared/config.js';
import { BESTIARY, typesInLevel, levelsOf } from '../game/client/bestiary.js';
import { t, getLang, setLang, onLangChange, LANGS } from '../shared/i18n.js';

/**
 * 휴대폰 전용 안내 사이트. 게임은 컴퓨터/태블릿에서만 되므로, 휴대폰에서는 게임 소개를 둘러볼 수 있게 한다.
 *  섹션: 안내(접속 방법) · 이야기 · 게임 방법 · 레벨 탐험(지도 미리보기) · 괴물 도감(움직이는 그림) · 아이템 · 조작법
 */
const ITEM_DESC = {
  almondWater: '정신력을 크게 회복한다. 환각이 사라진다.',
  staminaDrink: '스태미나가 가득 차고 8초 동안 지치지 않는다.',
  camera: '플래시로 앞쪽 엔티티를 기절시킨다. 스마일러는 사라진다. (3회)',
  bugSpray: '데스모스를 벽으로 쫓아낸다. (3회)',
  flare: '30초 동안 주변을 밝히고, 소리로 귀 밝은 엔티티를 끌어들인다.',
  compass: '25초 동안 가장 가까운 목표 방향을 알려 준다.',
  firecracker: '앞으로 던져 터뜨린다. 큰 소리로 엔티티를 다른 곳으로 유인한다.',
  nightVision: '20초 동안 어둠과 벽 너머까지 초록빛으로 보인다.',
  adrenaline: '6초 동안 더 빠르게, 지치지 않고 달린다.',
};
const HOW = [
  ['탈출', '레벨마다 미션(열쇠 모으기, 부품 배달, 밸브 돌리기, 버티기)을 끝내면 출구가 열린다. 한 명이라도 나가면 다음 레벨로.'],
  ['쪽지', '레벨 시작 지점에 떨어진 쪽지를 읽으면 할 일과 괴물 대처법이 적혀 있다.'],
  ['정신력', '시간이 갈수록, 어두울수록 줄어든다. 낮아지면 환각이 보이고 0 이 되면 끝. 아몬드 워터로 회복.'],
  ['숨기', '사물함에 숨으면 엔티티 눈에 안 보인다. 단, 쫓기다 숨는 걸 들키면 끌려 나온다.'],
  ['소리', '달리는 발소리, 목소리, 퍼즐 경보를 듣고 오는 엔티티가 있다. 웅크리면 조용히 걷는다.'],
  ['함께', '최대 4명. 보이스 챗은 거리에 따라 작아지고, 괴물이 들은 목소리를 흉내 내기도 한다.'],
];
const CONTROLS = [['W A S D', '이동'], ['마우스', '조준 / 손전등 방향'], ['Shift', '달리기'], ['C', '웅크리기 (조용히)'], ['F', '손전등'],
  ['E', '숨기 · 퍼즐 · 쪽지 · 상호작용'], ['1 ~ 4', '아이템 사용'], ['G + 숫자', '아이템 버리기'], [',', '감정 표현'], ['Enter', '채팅'], ['M', '마이크'], ['ESC', '메뉴 · 괴물 도감']];
const SECTIONS = [['notice', '접속'], ['story', '이야기'], ['how', '방법'], ['levels', '레벨'], ['monsters', '괴물'], ['items', '아이템'], ['keys', '조작']];

/** 화면에 보일 때만 움직이는 괴물 그림 */
function MonsterCanvas({ type, size = 120 }) {
  const ref = useRef(null);
  useEffect(() => {
    let alive = true, raf = 0, draw = null, visible = false;
    const el = ref.current;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);
    import('../game/client/sprites.js').then(m => { draw = m.drawBestiaryPreview; });
    const loop = t => {
      if (!alive) return;
      if (draw && visible) draw(el.getContext('2d'), type, t / 1000, el.width, el.height);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); io.disconnect(); };
  }, [type]);
  return <canvas ref={ref} width={size} height={size} className="g-monster" />;
}

/** 아이템 아이콘 */
function ItemIcon({ type }) {
  const ref = useRef(null);
  useEffect(() => {
    import('../game/client/sprites.js').then(m => {
      const c = ref.current; if (!c) return;
      const g = c.getContext('2d'), spr = m.itemIcon(type);
      g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
      g.drawImage(spr, (c.width - spr.width * 3) / 2, (c.height - spr.height * 3) / 2, spr.width * 3, spr.height * 3);
    });
  }, [type]);
  return <canvas ref={ref} width={48} height={60} className="g-item-icon" />;
}

/** 레벨 지도 미리보기 (실제 레벨 생성기로 만든 한 판) */
function LevelMap({ index }) {
  const ref = useRef(null);
  useEffect(() => {
    let alive = true;
    Promise.all([import('../shared/map.js'), import('../game/client/texture.js')]).then(([{ generateLevel }, { THEMES }]) => {
      if (!alive || !ref.current) return;
      const L = generateLevel(20251112 + index * 97, index), m = L.map, C = THEMES[L.info.theme] || THEMES.lobby;
      const s = m.h > 100 || m.w > 100 ? 1 : 2, c = ref.current;
      c.width = m.w * s; c.height = m.h * s;
      const g = c.getContext('2d'), rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        const t = m.get(x, y), i = y * m.w + x;
        g.fillStyle = t === T.WALL ? rgb(C.cap) : t === T.SLOW ? (L.toxic?.[i] ? '#3e6828' : rgb(C.puddle || [60, 90, 120])) : rgb(L.tileLight[i] < 0.38 ? C.stainDark : C.carpet);
        g.fillRect(x * s, y * s, s, s);
      }
      const dot = (o, col, r = s + 1) => { g.fillStyle = col; g.fillRect(Math.floor(o.x / 48) * s - 1, Math.floor(o.y / 48) * s - 1, r, r); };
      for (const k of L.keys) dot(k, k.puzzle ? '#7ae88a' : '#ffd84a', s + 2);
      for (const p of L.parts) dot(p, '#ff9a4a', s + 2);
      for (const st of L.stations) dot(st, '#4ab0ff', s + 2);
      dot(L.spawn, '#ffffff', s + 3);
      const e = L.exitIdx; g.fillStyle = '#ff4a3a'; g.fillRect((e % m.w) * s - 1, ((e / m.w) | 0) * s - 1, s + 3, s + 3);
    });
    return () => { alive = false; };
  }, [index]);
  return <canvas ref={ref} className="g-map" />;
}

export default function MobileGuide() {
  const [lv, setLv] = useState(0);
  const [mon, setMon] = useState(null);
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState('notice');
  const [lang, setLangState] = useState(getLang);
  useEffect(() => onLangChange(setLangState), []);   // 언어가 바뀌면 다시 그린다
  const L = LEVELS[lv];
  const levelMonsters = useMemo(() => typesInLevel(lv).map(t => BESTIARY.find(b => b.type === t)).filter(Boolean), [lv]);

  useEffect(() => {   // 지금 보고 있는 섹션을 위쪽 탭에 표시
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) setActive(e.target.id); }, { rootMargin: '-45% 0px -50% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  const share = async () => {
    const url = window.location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title: 'BACKROOMS', text: t('컴퓨터나 태블릿으로 접속해서 같이 하자'), url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* 공유 취소 */ }
  };
  const go = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="guide">
      <nav className="g-tabs">
        {SECTIONS.map(([id, name]) => <button key={id} className={active === id ? 'on' : ''} onClick={() => go(id)}>{t(name)}</button>)}
      </nav>

      <header className="g-hero" id="notice">
        <div className="g-lang" style={{ position: 'absolute', top: 10, right: 12, zIndex: 2, display: 'flex', alignItems: 'center', gap: 4, fontSize: 18 }}>
          {LANGS.map(([id, name], i) => (
            <span key={id} style={{ display: 'contents' }}>
              {i > 0 && <span style={{ color: 'var(--muted)' }}>|</span>}
              <button onClick={() => setLang(id)} aria-pressed={lang === id}
                style={{ background: 'none', border: 'none', padding: '2px 4px', fontSize: 18, cursor: 'pointer', color: lang === id ? 'var(--yellow)' : 'var(--muted)', textDecoration: lang === id ? 'underline' : 'none' }}>{name}</button>
            </span>
          ))}
        </div>
        <div className="g-lamp" />
        <h1>BACKROOMS</h1>
        <p className="g-sub">{t('현실에서 노클립하면, 끝없이 이어지는 노란 방에 떨어진다.')}</p>
        <div className="g-notice">
          <b>{t('휴대폰에서는 플레이할 수 없습니다')}</b>
          <p>{t('컴퓨터나 태블릿으로 접속하세요.')}<br />{t('이 페이지에서는 게임을 미리 둘러볼 수 있어요.')}</p>
          <button className="g-btn" onClick={share}>{copied ? t('링크 복사됨!') : t('링크 보내기 / 복사')}</button>
        </div>
        <button className="g-down" onClick={() => go('story')}>▼ {t('둘러보기')}</button>
      </header>

      <section id="story" className="g-sec">
        <h2>{t('이야기')}</h2>
        <p>{t('친구들과 폐건물 탐험 영상을 찍던 날. 벽이 노랗게 물들고, 바닥이 꺼졌다.')}</p>
        <p>{t('눈을 뜨자 젖은 카펫 냄새와 형광등 윙윙거리는 소리. 끝없이 이어지는 노란 방 —')} <b>{t('백룸')}</b>{t('이다.')}</p>
        <p>{t('레벨을 하나씩 빠져나가 현실로 돌아가야 한다. 이곳엔 우리만 있는 게 아니다.')}</p>
      </section>

      <section id="how" className="g-sec">
        <h2>{t('게임 방법')}</h2>
        <div className="g-cards">
          {HOW.map(([h, d]) => <details key={h} className="g-card"><summary>{t(h)}</summary><p>{t(d)}</p></details>)}
        </div>
      </section>

      <section id="levels" className="g-sec">
        <h2>{t('레벨 탐험')} <span>{t('{n}개', { n: LEVELS.length })}</span></h2>
        <div className="g-chips">
          {LEVELS.map((x, i) => <button key={i} className={i === lv ? 'on' : ''} onClick={() => setLv(i)}>{t(String(x.label ?? x.id))}</button>)}
        </div>
        <div className="g-level">
          <div className="g-level-head">
            <small>{t(levelLabel(lv))}</small>
            <h3>{t(L.name)}</h3>
          </div>
          <p className="g-goal">{t(missionGoal(missionOf(lv)))}</p>
          <LevelMap index={lv} />
          <p className="g-legend"><i style={{ background: '#fff' }} />{t('시작')} <i style={{ background: '#ff4a3a' }} />{t('출구')} <i style={{ background: '#ffd84a' }} />{t('열쇠')} <i style={{ background: '#7ae88a' }} />{t('퍼즐')} <i style={{ background: '#4ab0ff' }} />{t('장치')} <i style={{ background: '#ff9a4a' }} />{t('부품')}</p>
          {levelMonsters.length > 0 && (
            <div className="g-level-mons">
              {levelMonsters.map(b => (
                <button key={b.type} onClick={() => { setMon(b.type); go('monsters'); }}>
                  <MonsterCanvas type={b.type} size={64} /><span>{t(b.name)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="g-nav">
            <button className="g-btn" disabled={lv === 0} onClick={() => setLv(lv - 1)}>◀ {t('이전')}</button>
            <button className="g-btn" disabled={lv === LEVELS.length - 1} onClick={() => setLv(lv + 1)}>{t('다음')} ▶</button>
          </div>
        </div>
      </section>

      <section id="monsters" className="g-sec">
        <h2>{t('괴물 도감')} <span>{t('{n}종', { n: BESTIARY.length })}</span></h2>
        <p className="g-dim">{t('눌러서 자세히 보기')}</p>
        <div className="g-grid">
          {BESTIARY.map(b => (
            <button key={b.type} className={`g-mon${mon === b.type ? ' on' : ''}`} onClick={() => setMon(mon === b.type ? null : b.type)}>
              <MonsterCanvas type={b.type} size={96} />
              <span>{t(b.name)}</span>
              {mon === b.type && (
                <div className="g-mon-info">
                  <p className="g-dim">{levelsOf(b.type).map(x => t(x)).join(' · ')}</p>
                  <p><b>{t('생김새')}</b> {t(b.look)}</p>
                  <p><b>{t('행동')}</b> {t(b.behavior)}</p>
                  <p><b>{t('대처법')}</b> {t(b.counter)}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      <section id="items" className="g-sec">
        <h2>{t('아이템')}</h2>
        <div className="g-items">
          {Object.entries(ITEM_TYPES).map(([type, d]) => (
            <div key={type} className="g-item"><ItemIcon type={type} /><div><b>{t(d.name)}</b><p>{t(ITEM_DESC[type] || '')}</p></div></div>
          ))}
        </div>
      </section>

      <section id="keys" className="g-sec">
        <h2>{t('조작법')} <span>{t('컴퓨터')}</span></h2>
        <table className="g-keys"><tbody>
          {CONTROLS.map(([k, a]) => <tr key={k}><td><kbd>{t(k)}</kbd></td><td>{t(a)}</td></tr>)}
        </tbody></table>
        <p className="g-dim">{t('태블릿은 화면의 이동 스틱 · 조준 스틱 · 버튼으로 조작한다.')}</p>
      </section>

      <footer className="g-foot">
        <p>{t('컴퓨터나 태블릿에서 만나요.')}</p>
        <button className="g-btn" onClick={share}>{copied ? t('링크 복사됨!') : t('링크 보내기 / 복사')}</button>
      </footer>
    </div>
  );
}
