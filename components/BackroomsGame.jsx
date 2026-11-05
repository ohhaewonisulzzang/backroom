'use client';

import { useEffect, useRef, useState } from 'react';
import PuzzlePanel from './PuzzlePanel.jsx';

const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 무시 */ } },
};
const loadSettings = () => {
  const def = { volume: 0.7, shake: true, menuScares: true, deathScares: true, gore: true };
  try { return { ...def, ...JSON.parse(store.get('backrooms.settings') || '{}') }; }
  catch { return def; }
};

const COLORS = [['default', '기본', '#e7b92e'], ['green', '초록', '#5fae4e'], ['blue', '파랑', '#3f7fd0'], ['red', '빨강', '#c8423a']];
const colorHex = c => (COLORS.find(x => x[0] === c) || COLORS[0])[2];

/**
 * 캔버스 게임 엔진(game/client/engine.js)을 마운트하고, 메뉴/대기방/오버레이 UI 는 React 로 그린다.
 * 엔진은 ui 어댑터(showMenu / showLobby / showInfo / showRoundEnd / hide / toggleTest)로만 화면 상태를 바꾼다.
 */
export default function BackroomsGame() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const audioUnlocked = useRef(false);
  const [overlay, setOverlay] = useState({ kind: 'menu', screen: 'main', error: '' });
  const [testOpen, setTestOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [puzzle, setPuzzle] = useState(null);       // 열린 퍼즐 단말기 { index, puzzle, wrongAt }
  const [toast, setToast] = useState(null);         // 퍼즐 결과 한 줄 알림

  useEffect(() => {
    let disposed = false;
    const ui = {
      showMenu: ({ error = '', screen = 'main' } = {}) => { setTestOpen(false); setPauseOpen(false); setPuzzle(null); setOverlay({ kind: 'menu', screen, error }); },
      showLobby: state => setOverlay({ kind: 'lobby', ...state }),
      showInfo: info => setOverlay({ kind: 'info', ...info }),
      showRoundEnd: d => setOverlay({ kind: 'roundEnd', ...d, endAt: performance.now() + (d.restartIn || 0) * 1000 }),
      hide: () => setOverlay({ kind: 'hidden' }),
      closePanels: () => { setTestOpen(false); setPauseOpen(false); },
      toggleTest: () => setTestOpen(v => !v),
      togglePause: () => { setTestOpen(false); setPauseOpen(v => !v); },
      showPuzzle: ({ index, puzzle }) => setPuzzle({ index, puzzle, wrongAt: 0 }),
      closePuzzle: result => {
        setPuzzle(null);
        if (result) {
          setToast(result.solved ? '잠금 해제 — 열쇠를 얻었다' : `${result.by} 이(가) 먼저 풀었다`);
          setTimeout(() => setToast(null), 2200);
        }
      },
      notify: text => { setToast(text); setTimeout(() => setToast(null), 3200); },
      puzzleWrong: () => setPuzzle(p => (p ? { ...p, wrongAt: performance.now() } : p)),
    };
    // 엔진은 브라우저 전용(canvas, WebAudio) → 클라이언트에서만 동적 import
    import('../game/client/engine.js').then(({ startGame }) => {
      if (disposed) return;
      engineRef.current = startGame({ canvas: canvasRef.current, ui });
      engineRef.current.applySettings(loadSettings());
    });
    return () => {
      disposed = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  const engine = () => engineRef.current;
  const unlock = () => {
    if (audioUnlocked.current || !engine()) return;
    audioUnlocked.current = true;
    engine().unlockAudio();
  };
  const changeSettings = s => {
    const next = { ...settings, ...s };
    setSettings(next);
    store.set('backrooms.settings', JSON.stringify(next));
    engine()?.applySettings(next);
  };
  const nav = screen => setOverlay({ kind: 'menu', screen, error: '' });
  // ESC 메뉴가 열리고 닫힐 때 엔진에 알림 (혼자 하기면 서버도 일시정지)
  useEffect(() => { engine()?.setPaused(pauseOpen); }, [pauseOpen]);

  return (
    <div onPointerDown={unlock} onKeyDown={unlock}>
      <canvas id="game" ref={canvasRef} />
      {overlay.kind === 'menu' && (
        <MainMenu screen={overlay.screen} error={overlay.error} nav={nav} engine={engine}
          settings={settings} onSettings={changeSettings} />
      )}
      {overlay.kind === 'lobby' && <LobbyPanel state={overlay} engine={engine} />}
      {(overlay.kind === 'info' || overlay.kind === 'roundEnd') && (
        <div id="overlay">
          {overlay.kind === 'info' && <InfoPanel {...overlay} />}
          {overlay.kind === 'roundEnd' && <RoundEndPanel {...overlay} onMenu={() => engine()?.leaveRoom()} />}
        </div>
      )}
      {pauseOpen && (
        <PauseMenu solo={!!engine()?.isSolo} settings={settings} onSettings={changeSettings}
          onResume={() => setPauseOpen(false)}
          onLeave={() => { setPauseOpen(false); engine()?.leaveRoom(); }} />
      )}
      {puzzle && (
        <PuzzlePanel key={puzzle.index} puzzle={puzzle.puzzle} wrongAt={puzzle.wrongAt}
          onSubmit={a => engine()?.solvePuzzle(puzzle.index, a)}
          onClose={() => engine()?.closePuzzle()}
          sfx={(k, a) => engine()?.sfx(k, a)} />
      )}
      {toast && <div className="pz-toast">{toast}</div>}
      {testOpen && <TestPanel onCmd={(c, a) => engine()?.test(c, a)} onClose={() => setTestOpen(false)} />}
    </div>
  );
}

// ================================================================ 메인 메뉴 (왼쪽 가운데)
function useName() {
  const [name, setName] = useState('');
  useEffect(() => { setName(store.get('backrooms.name')); }, []);
  const save = () => { const n = name.trim() || 'Wanderer'; store.set('backrooms.name', n); return n; };
  return [name, setName, save];
}

function MainMenu({ screen, error, nav, engine, settings, onSettings }) {
  const [name, setName, saveName] = useName();
  const [code, setCode] = useState('');
  useEffect(() => {
    const c = new URLSearchParams(location.search).get('code');
    if (c) setCode(c.toUpperCase());
  }, []);
  const Btn = ({ onClick, children, big, disabled }) => (
    <button className={`menu-btn${big ? ' big' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>
  );

  return (
    <div className="menu-col">
      <div className="logo">
        <h1>BACKROOMS</h1>
        <h2>LEVEL 0 - THE LOBBY</h2>
      </div>

      {screen === 'main' && (
        <nav className="menu-list">
          <Btn onClick={() => nav('settings')}>설정</Btn>
          <Btn big onClick={() => nav('play')}>▶ 플레이</Btn>
          <Btn onClick={() => nav('controls')}>조작법</Btn>
          <Btn onClick={() => nav('bestiary')}>괴물 도감</Btn>
          <Btn onClick={() => nav('credits')}>크레딧</Btn>
        </nav>
      )}

      {screen === 'play' && (
        <nav className="menu-list">
          <Btn big onClick={() => engine()?.solo(saveName(), 'default')}>혼자 플레이</Btn>
          <Btn big onClick={() => nav('multi')}>멀티 플레이</Btn>
          <Btn onClick={() => nav('main')}>← 뒤로</Btn>
        </nav>
      )}

      {screen === 'multi' && (
        <form className="menu-form" autoComplete="off" onSubmit={e => { e.preventDefault(); if (code.trim()) engine()?.joinRoom(saveName(), code.trim().toUpperCase()); }}>
          <label>이름<input value={name} onChange={e => setName(e.target.value)} maxLength={12} placeholder="Wanderer" autoFocus /></label>
          <label>방 코드<input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="예: K7QX" className="code-input" /></label>
          <button type="submit" className="menu-btn big" disabled={!code.trim()}>참가하기</button>
          <button type="button" className="menu-btn" onClick={() => nav('create')}>+ 방 만들기</button>
          <button type="button" className="menu-btn" onClick={() => nav('play')}>← 뒤로</button>
        </form>
      )}

      {screen === 'create' && (
        <form className="menu-form" autoComplete="off" onSubmit={e => { e.preventDefault(); engine()?.createRoom(saveName()); }}>
          <label>이름<input value={name} onChange={e => setName(e.target.value)} maxLength={12} placeholder="Wanderer" autoFocus /></label>
          <button type="submit" className="menu-btn big">만들기</button>
          <button type="button" className="menu-btn" onClick={() => nav('multi')}>← 뒤로</button>
        </form>
      )}

      {screen === 'settings' && <SettingsForm settings={settings} onSettings={onSettings} onBack={() => nav('main')} />}

      {screen === 'controls' && <ControlsText onBack={() => nav('main')} />}

      {screen === 'bestiary' && <Bestiary onBack={() => nav('main')} />}

      {screen === 'credits' && (
        <div className="menu-text">
          <p>기획 · 디렉션 <b>박영진</b><br />개발 <b>Claude Code</b> (Anthropic)</p>
          <p className="dim">세계관: The Backrooms — 2019년 인터넷 커뮤니티에서 시작된 창작 괴담<br />
            영감: Escape the Backrooms (Fancy Games)<br />
            폰트: VT323 (Google Fonts, SIL OFL)<br />
            모든 그래픽과 사운드는 코드로 직접 생성했다.</p>
          <button className="menu-btn" onClick={() => nav('main')}>← 뒤로</button>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}

function SettingsForm({ settings, onSettings, onBack }) {
  return (
    <div className="menu-form">
      <label>볼륨 {Math.round(settings.volume * 100)}%
        <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={e => onSettings({ volume: Number(e.target.value) })} />
      </label>
      <label className="check"><input type="checkbox" checked={settings.shake !== false} onChange={e => onSettings({ shake: e.target.checked })} /> 화면 흔들림</label>
      <label className="check"><input type="checkbox" checked={settings.menuScares !== false} onChange={e => onSettings({ menuScares: e.target.checked })} /> 메인 화면 점프스케어</label>
      <label className="check"><input type="checkbox" checked={settings.deathScares !== false} onChange={e => onSettings({ deathScares: e.target.checked })} /> 사망 점프스케어 (괴물이 덮쳐 오는 화면)</label>
      <label className="check"><input type="checkbox" checked={settings.gore !== false} onChange={e => onSettings({ gore: e.target.checked })} /> 잔인한 연출 (피 · 살점 · 핏자국)</label>
      <button className="menu-btn" onClick={onBack}>← 뒤로</button>
    </div>
  );
}

function ControlsText({ onBack }) {
  return (
    <div className="menu-text">
      <p><b>WASD</b> / <b>방향키</b> 이동 · <b>마우스</b> 조준<br /><b>SHIFT</b> 달리기 · <b>C</b> 웅크리기(조용히 걷기)<br />
        <b>F</b> 손전등 · <b>E</b> 사물함/탁자에 숨기, 퍼즐 단말기 열기 · <b>1~4</b> 아이템 사용<br /><b>,</b> 감정 표현(말하기) · <b>SPACE</b> 관전 전환 · <b>ESC</b> 메뉴</p>
      <p className="dim">카메라: 플래시로 엔티티 기절 · 살충제: 나방 퇴치<br />조명탄: 빛 + 소리 미끼 · 나침반: 열쇠/출구 방향<br />스테미너 드링크: 지치지 않음 · 아몬드 워터: 정신력 회복</p>
      <p className="dim">LEVEL ! — 괴물 떼가 밀려온다. 장애물과 웅덩이를 피해 오른쪽 끝 출구까지 달려라.</p>
      <p className="dim">정신력은 시간이 지나면, 특히 어둠 속에서 줄어든다. 낮아지면 환각이 보이고, 바닥나면... 터진다.</p>
      <p className="dim">열쇠 5개를 모아 출구를 열고 탈출하라.<br />Level 1 부터는 열쇠 몇 개가 퍼즐 단말기 안에 잠겨 있다 (한붓 그리기, 기억력).<br />기억력을 틀리면 경보가 울려 엔티티가 몰려온다. 엔티티에게 닿으면 즉사. 쫓기기 전에 숨어라.</p>
      <button className="menu-btn" onClick={onBack}>← 뒤로</button>
    </div>
  );
}

// ================================================================ 괴물 도감
function MonsterPreview({ type }) {
  const ref = useRef(null);
  useEffect(() => {
    let alive = true, raf = 0, draw = null;
    const loop = t => {
      if (!alive) return;
      if (draw && ref.current) draw(ref.current.getContext('2d'), type, t / 1000, ref.current.width, ref.current.height);
      raf = requestAnimationFrame(loop);
    };
    import('../game/client/sprites.js').then(m => { draw = m.drawBestiaryPreview; });
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [type]);
  return <canvas ref={ref} width={140} height={140} className="bestiary-preview" />;
}

function Bestiary({ onBack }) {
  const [mod, setMod] = useState(null);
  const [seen, setSeen] = useState(() => new Set());
  const [sel, setSel] = useState(null);
  useEffect(() => {
    import('../game/client/bestiary.js').then(m => {
      setMod(m);
      const s = m.loadDiscovered();
      setSeen(s);
      setSel(m.BESTIARY.find(b => s.has(b.type))?.type ?? null);
    });
  }, []);
  if (!mod) return null;
  const entry = mod.BESTIARY.find(b => b.type === sel);
  return (
    <div className="bestiary">
      <p className="dim">발견 {mod.BESTIARY.filter(b => seen.has(b.type)).length} / {mod.BESTIARY.length} — 괴물이 사는 레벨에 들어가면 채워진다</p>
      <div className="bestiary-grid">
        {mod.BESTIARY.map(b => (
          <button key={b.type} className={`bestiary-slot${sel === b.type ? ' on' : ''}`} disabled={!seen.has(b.type)} onClick={() => setSel(b.type)}>
            {seen.has(b.type) ? b.name : '???'}
          </button>
        ))}
      </div>
      {entry ? (
        <div className="bestiary-card">
          <MonsterPreview type={entry.type} />
          <div>
            <h3>{entry.name}</h3>
            <p className="dim">{mod.levelsOf(entry.type).join(' · ')}</p>
            <p><b>생김새</b> {entry.look}</p>
            <p><b>행동</b> {entry.behavior}</p>
            <p><b>대처법</b> {entry.counter}</p>
          </div>
        </div>
      ) : <p className="dim">아직 아무것도 만나지 않았다.</p>}
      <button className="menu-btn" onClick={onBack}>← 뒤로</button>
    </div>
  );
}

// ================================================================ ESC 메뉴 (게임 중)
function PauseMenu({ solo, settings, onSettings, onResume, onLeave }) {
  const [screen, setScreen] = useState('main');
  return (
    <div className="menu-col pause">
      <div className="logo">
        <h1 className="small">{solo ? 'PAUSED' : 'MENU'}</h1>
        <h2>{solo ? '시간이 멈췄다' : '멀티플레이 중에는 게임이 멈추지 않는다'}</h2>
      </div>
      {screen === 'main' && (
        <nav className="menu-list">
          <button className="menu-btn big" onClick={onResume}>▶ 계속하기</button>
          <button className="menu-btn" onClick={() => setScreen('settings')}>설정</button>
          <button className="menu-btn" onClick={() => setScreen('controls')}>조작법</button>
          <button className="menu-btn" onClick={() => setScreen('confirm')}>메인 메뉴로 나가기</button>
          <p className="dim">ESC 로 닫기</p>
        </nav>
      )}
      {screen === 'settings' && <SettingsForm settings={settings} onSettings={onSettings} onBack={() => setScreen('main')} />}
      {screen === 'controls' && <ControlsText onBack={() => setScreen('main')} />}
      {screen === 'confirm' && (
        <nav className="menu-list">
          <p>정말 나갈까? {solo ? '지금까지의 진행이 사라진다.' : '동료들은 남아서 계속 플레이한다.'}</p>
          <button className="menu-btn big danger-btn" onClick={onLeave}>나가기</button>
          <button className="menu-btn" onClick={() => setScreen('main')}>← 취소</button>
        </nav>
      )}
    </div>
  );
}

// ================================================================ 대기방
function PlayerPreview({ color }) {
  const ref = useRef(null);
  useEffect(() => {
    let alive = true;
    import('../game/client/sprites.js').then(({ humanPreview }) => {
      if (!alive || !ref.current) return;
      const spr = humanPreview(color), c = ref.current, g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(spr, 0, 0, spr.width * 2, spr.height * 2);
    });
    return () => { alive = false; };
  }, [color]);
  return <canvas ref={ref} width={36} height={68} className="preview" />;
}

function LobbyPanel({ state, engine }) {
  const { code, hostId, max = 4, players = [], myId } = state;
  const me = players.find(p => p.id === myId);
  const isHost = myId === hostId;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 복사 불가 */ }
  };
  const slots = Array.from({ length: max }, (_, i) => players[i] || null);

  return (
    <div className="menu-col lobby">
      <div className="logo"><h2>대기방</h2></div>
      <div className="room-code">
        <span className="dim">방 코드</span>
        <strong>{code}</strong>
        <button className="menu-btn small" onClick={copy}>{copied ? '복사됨' : '복사'}</button>
      </div>
      <ul className="player-slots">
        {slots.map((p, i) => (
          <li key={i} className={p ? '' : 'empty'}>
            {p ? (
              <>
                <PlayerPreview color={p.color} />
                <span className="pname">{p.name}{p.id === myId ? ' (나)' : ''}</span>
                {p.id === hostId && <span className="badge">방장</span>}
                <span className="swatch" style={{ background: colorHex(p.color) }} />
              </>
            ) : <span className="dim">빈 자리</span>}
          </li>
        ))}
      </ul>
      <div className="color-pick">
        <span className="dim">방호복 색</span>
        <div>
          {COLORS.map(([key, label, hex]) => {
            const taken = players.some(p => p.id !== myId && p.color === key);
            return (
              <button key={key} className={`color-btn${me?.color === key ? ' on' : ''}`} disabled={taken}
                onClick={() => engine()?.setColor(key)} title={taken ? '다른 사람이 사용 중' : label}>
                <span style={{ background: hex }} />{label}
              </button>
            );
          })}
        </div>
      </div>
      {isHost
        ? <button className="menu-btn big" onClick={() => engine()?.startMatch()}>▶ 게임 시작 ({players.length}/{max})</button>
        : <p className="dim">방장이 시작하기를 기다리는 중... ({players.length}/{max})</p>}
      <button className="menu-btn" onClick={() => engine()?.leaveRoom()}>나가기</button>
    </div>
  );
}

// ================================================================ 오버레이
function InfoPanel({ title, sub = '', lines = [], danger = false, button = null }) {
  return (
    <div className="panel">
      <h1 className={danger ? 'danger' : undefined}>{title}</h1>
      <h2>{sub}</h2>
      {lines.length > 0 && <p>{lines.join('\n')}</p>}
      {button && <button onClick={button.onClick}>{button.label}</button>}
    </div>
  );
}

function RoundEndPanel({ escaped = [], dead = [], endAt, nextLevelName = null, onMenu }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((endAt - performance.now()) / 1000)));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((endAt - performance.now()) / 1000))), 250);
    return () => clearInterval(id);
  }, [endAt]);
  const won = escaped.length > 0;
  const lines = [];
  if (escaped.length) lines.push(`탈출: ${escaped.join(', ')}`);
  if (dead.length) lines.push(`실종: ${dead.join(', ')}`);
  return (
    <div className="panel">
      <h1 className={won ? undefined : 'danger'}>{won ? 'NOCLIP' : 'CAUGHT'}</h1>
      <h2>{left > 0 ? `${left}초 후 ${nextLevelName ?? 'LEVEL 0'} 으로 떨어진다` : '떨어지는 중...'}</h2>
      {lines.length > 0 && <p>{lines.join('\n')}</p>}
      <button onClick={onMenu}>메인 메뉴로</button>
    </div>
  );
}

/** 테스트 모드 패널 (` 키). 버튼은 포커스를 가져가지 않게 해서 Space/E 등 게임 키와 충돌하지 않도록 한다 */
const ENTITY_BUTTONS = [['wanderer', '방랑자'], ['howler', '하울러'], ['smiler', '스마일러'], ['skinStealer', '스킨 스틸러'], ['hound', '하운드'],
  ['partygoer', '파티고어'], ['deathmoth', '데스모스'], ['wretch', '광인'], ['scratcher', '스크래처']];
const LEVEL_NAMES = ['0 Lobby', '1 Habitable', '2 Pipes', '3 Electrical', 'Fun =)', '5 Hotel', '6 Lights Out', '! Run', 'END'];
const ITEM_BUTTONS = [['almondWater', '아몬드 워터'], ['staminaDrink', '스테미너 드링크'], ['camera', '카메라'], ['bugSpray', '살충제'], ['flare', '조명탄'], ['compass', '나침반']];

function TestPanel({ onCmd, onClose }) {
  const B = ({ cmd, arg, children }) => (
    <button onMouseDown={e => e.preventDefault()} onClick={() => onCmd(cmd, arg)}>{children}</button>
  );
  return (
    <div id="testPanel">
      <div className="tp-head">
        <span>TEST MODE</span>
        <button onMouseDown={e => e.preventDefault()} onClick={onClose}>닫기 [`]</button>
      </div>
      <h3>레벨</h3>
      <div className="tp-row">
        <B cmd="nextLevel">다음 레벨 ▶</B>
        {LEVEL_NAMES.map((n, i) => <B key={i} cmd="setLevel" arg={i}>{n}</B>)}
      </div>
      <h3>진행</h3>
      <div className="tp-row">
        <B cmd="giveKey">열쇠 +1</B>
        <B cmd="unlockExit">출구 열기</B>
        <B cmd="tpKey">열쇠로 이동</B>
        <B cmd="tpPuzzle">퍼즐로 이동</B>
        <B cmd="tpExit">출구로 이동</B>
      </div>
      <h3>아이템 소환</h3>
      <div className="tp-row">
        {ITEM_BUTTONS.map(([t, n]) => <B key={t} cmd="spawnItem" arg={t}>{n}</B>)}
      </div>
      <h3>엔티티 소환 (3~5칸 거리)</h3>
      <div className="tp-row">
        {ENTITY_BUTTONS.map(([t, n]) => <B key={t} cmd="spawnEntity" arg={t}>{n}</B>)}
        <B cmd="clearEntities">전부 제거</B>
      </div>
      <h3>플레이어 / 화면</h3>
      <div className="tp-row">
        <B cmd="god">무적 ON/OFF</B>
        <B cmd="revive">부활</B>
        <B cmd="drainSanity">정신력 -30</B>
        <B cmd="fullbright">밝게 ON/OFF</B>
        <B cmd="revealMap">미니맵 공개</B>
      </div>
    </div>
  );
}
