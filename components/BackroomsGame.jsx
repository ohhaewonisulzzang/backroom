'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PuzzlePanel from './PuzzlePanel.jsx';
import ValvePanel from './ValvePanel.jsx';
import ChatBox from './ChatBox.jsx';
import { VoiceSettings, KeySettings } from './SettingsPanels.jsx';
import { keyLabel } from '../game/client/input.js';
import { LEVELS, MODES, defaultModes } from '../shared/config.js';
import { t, getLang, setLang, onLangChange, LANGS } from '../shared/i18n.js';

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
  const [, setLangState] = useState(getLang);       // 언어가 바뀌면 화면 전체를 다시 그린다
  useEffect(() => onLangChange(setLangState), []);
  const [puzzle, setPuzzle] = useState(null);       // 열린 퍼즐 단말기 { index, puzzle, wrongAt }
  const [valve, setValve] = useState(null);         // 열린 밸브/크랭크 { index, kind, turns }
  const [toast, setToast] = useState(null);         // 퍼즐 결과 한 줄 알림
  const [chat, setChat] = useState([]);             // 채팅 기록
  const [chatOpen, setChatOpen] = useState(false);  // 채팅 입력창
  const isTouch = useIsTouch();                     // 휴대폰/태블릿이면 화면 조작 버튼을 띄운다
  // 게임을 시작할 때(혼자 플레이 / 멀티 플레이를 누를 때) 한 번 나오는 주의 화면. 닫으면 원래 하려던 걸 이어서 한다
  const [warning, setWarning] = useState(null);     // null | () => void (닫은 뒤 할 일)
  const warnedRef = useRef(false);
  // 게임이 처음 시작될 때 한 번: 전체화면 권장 (이미 전체화면이거나 지원하지 않으면 안 띄운다)
  // 게임 중(대기방·라운드 결과 포함) 전체화면이 아니면 '전체화면을 권장합니다' 를 계속 띄운다
  const [fsOn, setFsOn] = useState(isFullscreen);
  useEffect(() => {
    const on = () => setFsOn(isFullscreen());
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const fsTip = canFullscreen() && !fsOn && ['hidden', 'lobby', 'roundEnd'].includes(overlay.kind) && !pauseOpen;
  const withWarning = fn => { if (warnedRef.current) fn(); else setWarning(() => fn); };

  useEffect(() => {
    let disposed = false;
    const ui = {
      showMenu: ({ error = '', screen = 'main' } = {}) => { setTestOpen(false); setPauseOpen(false); setPuzzle(null); setValve(null); setChatOpen(false); setChat([]); setOverlay({ kind: 'menu', screen, error }); },
      showValve: v => setValve(v),
      chatMessage: m => setChat(c => [...c.slice(-60), { ...m, key: `${performance.now()}-${Math.random()}`, at: performance.now() }]),
      openChat: () => setChatOpen(true),
      closeChat: () => setChatOpen(false),
      closeValve: () => setValve(null),
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
          setToast(result.solved ? t('잠금 해제 — 열쇠를 얻었다') : t('{by} 이(가) 먼저 풀었다', { by: result.by }));
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
      if (process.env.NODE_ENV !== 'production') window.__backrooms = engineRef.current;   // 개발 중 브라우저 자동 확인용
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
        <MainMenu screen={overlay.screen} error={overlay.error} nav={nav} engine={engine} withWarning={withWarning}
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
        <PauseMenu solo={!!engine()?.isSolo} settings={settings} onSettings={changeSettings} engine={engine}
          onResume={() => setPauseOpen(false)}
          onLeave={() => { setPauseOpen(false); engine()?.leaveRoom(); }} />
      )}
      {puzzle && (
        <PuzzlePanel key={puzzle.index} puzzle={puzzle.puzzle} wrongAt={puzzle.wrongAt}
          onSubmit={a => engine()?.solvePuzzle(puzzle.index, a)}
          onClose={() => engine()?.closePuzzle()}
          sfx={(k, a) => engine()?.sfx(k, a)} />
      )}
      {valve && (
        <ValvePanel key={valve.index} {...valve}
          onTurn={d => engine()?.turnValve(valve.index, d)}
          progress={() => engine()?.valveProgress(valve.index) ?? 0}
          onClose={() => engine()?.closeValve()} />
      )}
      {toast && <div className="pz-toast">{t(toast)}</div>}
      {['hidden', 'lobby', 'roundEnd'].includes(overlay.kind) && !pauseOpen && (
        <ChatBox messages={chat} open={chatOpen} colorHex={colorHex}
          onSend={t => engine()?.sendChat(t)} onClose={() => engine()?.closeChat()} />
      )}
      {isTouch && overlay.kind === 'hidden' && !pauseOpen && <TouchControls engine={engine} />}
      {fsTip && <FullscreenTip />}
      {testOpen && <TestPanel onCmd={(c, a) => engine()?.test(c, a)} onClose={() => setTestOpen(false)} />}
      {warning && <WarningScreen onClose={() => { const next = warning; warnedRef.current = true; setWarning(null); unlock(); next(); }} />}
    </div>
  );
}

// ================================================================ 전체화면
const canFullscreen = () => typeof document !== 'undefined' && !!document.fullscreenEnabled;
const isFullscreen = () => typeof document !== 'undefined' && !!document.fullscreenElement;
/** 전체화면 켜기/끄기 (클릭 같은 사용자 동작 안에서 불러야 브라우저가 허락한다) */
async function toggleFullscreen(on = !isFullscreen()) {
  try {
    if (on && !isFullscreen()) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      // ESC 를 눌러도 바로 꺼지지 않게: ESC 키를 게임이 받는다 (크롬·엣지는 ESC 를 꾹 눌러야 전체화면이 꺼진다)
      try { await navigator.keyboard?.lock?.(['Escape']); } catch { /* 지원하지 않는 브라우저 */ }
    } else if (!on && isFullscreen()) {
      navigator.keyboard?.unlock?.();
      await document.exitFullscreen();
    }
  } catch { /* 거부됨 */ }
}

/** 설정 → 일반: 전체화면 켜기/끄기 */
function FullscreenSetting() {
  const [fs, setFs] = useState(isFullscreen);
  useEffect(() => {
    const on = () => setFs(isFullscreen());
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return (
    <div className="lang-pick">
      <span>{t('화면')}</span>
      <button type="button" className={`color-btn${fs ? ' on' : ''}`} onClick={() => toggleFullscreen()}>⛶ {fs ? t('전체화면 끄기') : t('전체화면')}</button>
    </div>
  );
}

/** 게임 중 위쪽 알림: 전체화면이 아닌 동안 계속 떠 있다 */
function FullscreenTip() {
  const go = () => toggleFullscreen(true);
  return (
    <div className="fs-tip" role="status" onPointerDown={e => e.stopPropagation()}>
      <span>{t('전체화면을 권장합니다')}</span>
      <button type="button" onClick={go}>⛶ {t('전체화면')}</button>
    </div>
  );
}

// ================================================================ 시작 주의 화면
/**
 * 게임을 시작할 때(혼자 플레이 / 멀티 플레이, 이 탭에서 처음 한 번) 나오는 경고: 점프스케어, 섬광·깜빡임, 잔인한 표현, 큰 소리.
 * 1.5초 뒤부터 아무 키나 / 클릭으로 넘어간다. 그 키는 게임으로 전달되지 않는다.
 */
function WarningScreen({ onClose }) {
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const id = setTimeout(() => { readyRef.current = true; setReady(true); }, 1500);
    const key = e => { e.preventDefault(); e.stopImmediatePropagation(); if (readyRef.current) closeRef.current(); };
    window.addEventListener('keydown', key, true);
    return () => { clearTimeout(id); window.removeEventListener('keydown', key, true); };
  }, []);
  return (
    <div className="warning-screen" onPointerDown={e => { e.stopPropagation(); if (ready) onClose(); }}>
      <div className="warning-box">
        <h1>⚠ {t('주의')}</h1>
        <p>{t('이 게임에는 다음 요소가 포함되어 있습니다.')}</p>
        <ul>
          <li><b>{t('갑자기 튀어나오는 점프스케어')}</b>{t('와 큰 소리')}</li>
          <li><b>{t('강한 섬광')}</b>{t(', 빠르게 ')}<b>{t('깜빡이는 빛')}</b>{t(', 화면 흔들림')}</li>
          <li>{t('피와 잔인한 표현')}</li>
        </ul>
        <p className="warn-dim">{t('빛에 민감하거나 광과민성 발작을 겪은 적이 있다면 플레이를 삼가세요.')}<br />
          {t('설정에서 사망 점프스케어 · 잔인한 연출 · 화면 흔들림 · 메뉴 깜짝 등장을 끌 수 있습니다.')}</p>
        {canFullscreen() && !isFullscreen() && (
          <div className="warn-fs">
            <span>{t('전체화면을 권장합니다')}</span>
            <button type="button" disabled={!ready}
              onPointerDown={e => e.stopPropagation()}
              onClick={async e => { e.stopPropagation(); await toggleFullscreen(true); onClose(); }}>⛶ {t('전체화면으로 시작')}</button>
          </div>
        )}
        <p className={`warn-go${ready ? ' on' : ''}`}>{ready ? t('아무 키나 누르거나 클릭해서 계속') : '...'}</p>
      </div>
    </div>
  );
}

// ================================================================ 터치 조작 (휴대폰/태블릿)
function useIsTouch() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = matchMedia('(pointer: coarse)');
    const update = () => setTouch(mq.matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches));
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return touch;
}

/**
 * 손가락을 댄 곳에 생기는 가상 스틱. onChange(x, y, len) — x,y 는 -1~1, len 은 0~1. 손을 떼면 onEnd().
 * 왼쪽 절반 = 이동, 오른쪽 절반 = 손전등 방향.
 */
function TouchStick({ side, onChange, onEnd }) {
  const [knob, setKnob] = useState(null);           // { ox, oy, dx, dy } 화면 좌표
  const origin = useRef(null);
  const pid = useRef(null);
  const R = 56;
  const end = e => {
    if (e.pointerId !== pid.current) return;
    pid.current = null; origin.current = null; setKnob(null); onEnd();
  };
  return (
    <div className={`touch-zone ${side}`}
      onPointerDown={e => {
        if (pid.current !== null) return;
        pid.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        origin.current = { x: e.clientX, y: e.clientY };
        setKnob({ ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 });
        onChange(0, 0, 0);
      }}
      onPointerMove={e => {
        if (e.pointerId !== pid.current || !origin.current) return;
        let dx = e.clientX - origin.current.x, dy = e.clientY - origin.current.y;
        const len = Math.hypot(dx, dy);
        if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
        onChange(dx / R, dy / R, Math.min(1, len / R));
        setKnob({ ox: origin.current.x, oy: origin.current.y, dx, dy });
      }}
      onPointerUp={end} onPointerCancel={end}>
      {knob && (
        <div className="stick-base" style={{ left: knob.ox, top: knob.oy }}>
          <div className="stick-knob" style={{ transform: `translate(${knob.dx}px, ${knob.dy}px)` }} />
        </div>
      )}
    </div>
  );
}

function TouchControls({ engine }) {
  const [crouch, setCrouch] = useState(false);
  const [talk, setTalk] = useState(false);
  const hold = useRef(null);
  const T = () => engine()?.touch;
  useEffect(() => {
    const t = T();
    if (t) t.active = true;
    return () => { engine()?.resetTouch(); const t2 = T(); if (t2) t2.crouch = false; };
  }, []);
  const stop = e => e.stopPropagation();
  const Btn = ({ code, action, label, className = '', onTap }) => (
    <button className={`touch-btn ${className}`}
      onPointerDown={e => { stop(e); const t = T(); if (t) t.active = true; if (onTap) onTap(); else if (action) engine()?.pressAction(action); else engine()?.press(code); }}>
      {label}
    </button>
  );
  // 인벤토리 칸: 짧게 누르면 손에 들기, 길게(0.5초) 누르면 버리기. 사용은 '사용' 버튼을 누르고 있는 동안
  const cancelHold = () => { clearTimeout(hold.current?.timer); hold.current = null; };
  const slotDown = (e, i) => {
    stop(e);
    cancelHold();
    hold.current = { i, timer: setTimeout(() => { hold.current = null; navigator.vibrate?.(30); engine()?.dropItem(i); }, 500) };
  };
  const slotUp = i => {
    if (hold.current?.i !== i) return;
    cancelHold();
    engine()?.selectSlot(i);
  };
  return (
    <div className="touch-ui">
      <TouchStick side="left"
        onChange={(x, y, len) => { const t = T(); if (!t) return; t.active = true; t.move.x = x; t.move.y = y; t.sprint = len > 0.92; }}
        onEnd={() => { const t = T(); if (!t) return; t.move.x = 0; t.move.y = 0; t.sprint = false; }} />
      <TouchStick side="right"
        onChange={(x, y, len) => { const t = T(); if (!t) return; t.active = true; if (len > 0.2) t.aim = Math.atan2(y, x); }}
        onEnd={() => { const t = T(); if (t) t.aim = null; }} />
      <div className="touch-top">
        <Btn action="chat" label={t('채팅')} />
        {engine()?.voice?.enabled && <Btn action="mic" label={t('마이크')} />}
        <Btn action="skip" label={t('관전')} />
        <Btn code="Escape" label="Ⅱ" />
      </div>
      <div className="touch-actions">
        <Btn action="interact" label="E" className="big" />
        <Btn action="flashlight" label={t('손전등')} />
        <Btn label={crouch ? t('웅크림') : t('웅크리기')} className={crouch ? 'on' : ''}
          onTap={() => { const v = !crouch; setCrouch(v); const t = T(); if (t) t.crouch = v; }} />
        <Btn label={t('말하기')} className={talk ? 'on' : ''} onTap={() => setTalk(v => !v)} />
      </div>
      {talk && (
        <div className="touch-talk" onPointerDown={stop}>
          {(engine()?.emoteLines || []).map((l, i) => (
            <button key={i} className="touch-btn" onClick={() => { engine()?.emote(i); setTalk(false); }}>{t(l)}</button>
          ))}
          {(engine()?.gestures || []).map(([g, n]) => (
            <button key={g} className="touch-btn on" onClick={() => { engine()?.gesture(g); setTalk(false); }}>{t(n)}</button>
          ))}
        </div>
      )}
      <button className="touch-btn touch-use" aria-label={t('사용')}
        onPointerDown={e => { stop(e); engine()?.useStart(); }} onPointerUp={() => engine()?.useEnd()}
        onPointerCancel={() => engine()?.useEnd()} onPointerLeave={() => engine()?.useEnd()}>{t('사용')}</button>
      <div className="touch-slots">
        {[0, 1, 2, 3].map(i => (
          <button key={i} aria-label={t('아이템 {n}', { n: i + 1 })}
            onPointerDown={e => slotDown(e, i)} onPointerUp={() => slotUp(i)}
            onPointerCancel={cancelHold} onPointerLeave={() => { if (hold.current?.i === i) cancelHold(); }} />
        ))}
      </div>
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

function MainMenu({ screen, error, nav, engine, settings, onSettings, withWarning = fn => fn() }) {
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
          <Btn onClick={() => nav('settings')}>{t('설정')}</Btn>
          <Btn big onClick={() => nav('play')}>{t('▶ 플레이')}</Btn>
          <Btn onClick={() => nav('controls')}>{t('조작법')}</Btn>
          <Btn onClick={() => nav('bestiary')}>{t('괴물 도감')}</Btn>
          <Btn onClick={() => nav('credits')}>{t('크레딧')}</Btn>
        </nav>
      )}

      {screen === 'play' && (
        <nav className="menu-list">
          <Btn big onClick={() => withWarning(() => engine()?.solo(saveName(), 'default'))}>{t('혼자 플레이')}</Btn>
          <Btn big onClick={() => withWarning(() => nav('multi'))}>{t('멀티 플레이')}</Btn>
          <Btn onClick={() => nav('main')}>{t('← 뒤로')}</Btn>
        </nav>
      )}

      {screen === 'multi' && (
        <form className="menu-form" autoComplete="off" onSubmit={e => { e.preventDefault(); if (code.trim()) engine()?.joinRoom(saveName(), code.trim().toUpperCase()); }}>
          <label>{t('이름')}<input value={name} onChange={e => setName(e.target.value)} maxLength={12} placeholder="Wanderer" autoFocus /></label>
          <label>{t('방 코드')}<input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder={t('예: K7QX')} className="code-input" /></label>
          <button type="submit" className="menu-btn big" disabled={!code.trim()}>{t('참가하기')}</button>
          <button type="button" className="menu-btn" onClick={() => nav('create')}>{t('+ 방 만들기')}</button>
          <button type="button" className="menu-btn" onClick={() => nav('play')}>{t('← 뒤로')}</button>
        </form>
      )}

      {screen === 'create' && (
        <form className="menu-form" autoComplete="off" onSubmit={e => { e.preventDefault(); engine()?.createRoom(saveName()); }}>
          <label>{t('이름')}<input value={name} onChange={e => setName(e.target.value)} maxLength={12} placeholder="Wanderer" autoFocus /></label>
          <button type="submit" className="menu-btn big">{t('만들기')}</button>
          <button type="button" className="menu-btn" onClick={() => nav('multi')}>{t('← 뒤로')}</button>
        </form>
      )}

      {screen === 'settings' && <SettingsForm settings={settings} onSettings={onSettings} onBack={() => nav('main')} engine={engine} />}

      {screen === 'controls' && <ControlsText onBack={() => nav('main')} engine={engine} />}

      {screen === 'bestiary' && <Bestiary onBack={() => nav('main')} />}

      {screen === 'credits' && (
        <div className="menu-text">
          <p>{t('기획 · 디렉션')} <b>Eddy</b><br />{t('개발')} <b>Claude Code</b> (Anthropic)</p>
          <p className="dim">{t('세계관: The Backrooms — 2019년 인터넷 커뮤니티에서 시작된 창작 괴담')}<br />
            {t('영감: Escape the Backrooms (Fancy Games)')}<br />
            {t('폰트: VT323 (Google Fonts, SIL OFL)')}<br />
            {t('모든 그래픽과 사운드는 코드로 직접 생성했다.')}</p>
          <button className="menu-btn" onClick={() => nav('main')}>{t('← 뒤로')}</button>
        </div>
      )}

      {error && <div className="error">{t(error)}</div>}
    </div>
  );
}

function SettingsForm({ settings, onSettings, onBack, engine }) {
  const [tab, setTab] = useState('general');
  return (
    <div className="menu-form settings-form">
      <div className="tabs">
        {[['general', '일반'], ['voice', '보이스 챗'], ['keys', '키 설정']].map(([k, n]) => (
          <button key={k} type="button" className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{t(n)}</button>
        ))}
      </div>
      {tab === 'general' && (
        <>
          <div className="lang-pick">
            <span>언어 / Language</span>
            <div>
              {LANGS.map(([k, n]) => (
                <button key={k} type="button" className={`color-btn${getLang() === k ? ' on' : ''}`} onClick={() => setLang(k)}>{n}</button>
              ))}
            </div>
          </div>
          {canFullscreen() && <FullscreenSetting />}
          <label>{t('볼륨')} {Math.round(settings.volume * 100)}%
            <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={e => onSettings({ volume: Number(e.target.value) })} />
          </label>
          <label className="check"><input type="checkbox" checked={settings.shake !== false} onChange={e => onSettings({ shake: e.target.checked })} /> {t('화면 흔들림')}</label>
          <label className="check"><input type="checkbox" checked={settings.menuScares !== false} onChange={e => onSettings({ menuScares: e.target.checked })} /> {t('메인 화면 점프스케어')}</label>
          <label className="check"><input type="checkbox" checked={settings.deathScares !== false} onChange={e => onSettings({ deathScares: e.target.checked })} /> {t('사망 점프스케어')}</label>
          <label className="check"><input type="checkbox" checked={settings.gore !== false} onChange={e => onSettings({ gore: e.target.checked })} /> {t('잔인한 연출')}</label>
        </>
      )}
      {tab === 'voice' && <VoiceSettings engine={engine} />}
      {tab === 'keys' && <KeySettings engine={engine} />}
      <button className="menu-btn" onClick={onBack}>{t('← 뒤로')}</button>
    </div>
  );
}

function ControlsText({ onBack, engine }) {
  const K = a => t(keyLabel(engine?.()?.input?.binds?.[a]));
  return (
    <div className="menu-text">
      <div className="ctrl-grid">
        {[[`${K('up')}${K('left')}${K('down')}${K('right')}`, '이동'], [t('마우스'), '조준'], [K('sprint'), '달리기'], [K('crouch'), '웅크리기'],
          [K('flashlight'), '손전등'], [K('interact'), '상호작용'], [`${K('slot1')}~${K('slot4')}`, '아이템'], [`${K('drop')}+${t('아이템')}`, '버리기'],
          [K('emote'), '감정 표현'], [K('chat'), '채팅'], [K('mic'), '마이크'], [K('skip'), '관전'], ['ESC', '메뉴']].map(([k, a]) => (
          <div key={a} className="ctrl-row"><b>{k}</b><span>{t(a)}</span></div>
        ))}
      </div>
      <p className="dim">{t('미션을 끝내면 출구가 열린다.')}</p>
      <button className="menu-btn" onClick={onBack}>{t('← 뒤로')}</button>
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
      <p className="dim">{t('발견 {n} / {total} — 괴물이 사는 레벨에 들어가면 채워진다', { n: mod.BESTIARY.filter(b => seen.has(b.type)).length, total: mod.BESTIARY.length })}</p>
      <div className="bestiary-grid">
        {mod.BESTIARY.map(b => (
          <button key={b.type} className={`bestiary-slot${sel === b.type ? ' on' : ''}`} disabled={!seen.has(b.type)} onClick={() => setSel(b.type)}>
            {seen.has(b.type) ? t(b.name) : '???'}
          </button>
        ))}
      </div>
      {entry ? (
        <div className="bestiary-card">
          <MonsterPreview type={entry.type} />
          <div>
            <h3>{t(entry.name)}</h3>
            <p className="dim">{mod.levelsOf(entry.type).map(l => t(l)).join(' · ')}</p>
            <p><b>{t('생김새')}</b> {t(entry.look)}</p>
            <p><b>{t('행동')}</b> {t(entry.behavior)}</p>
            <p><b>{t('대처법')}</b> {t(entry.counter)}</p>
          </div>
        </div>
      ) : <p className="dim">{t('아직 아무것도 만나지 않았다.')}</p>}
      <button className="menu-btn" onClick={onBack}>{t('← 뒤로')}</button>
    </div>
  );
}

// ================================================================ ESC 메뉴 (게임 중)
function PauseMenu({ solo, settings, onSettings, onResume, onLeave, engine }) {
  const [screen, setScreen] = useState('main');
  return (
    <div className="menu-col pause">
      <div className="logo">
        <h1 className="small">{solo ? 'PAUSED' : 'MENU'}</h1>
        <h2>{solo ? t('시간이 멈췄다') : t('멀티플레이 중에는 게임이 멈추지 않는다')}</h2>
      </div>
      {screen === 'main' && (
        <nav className="menu-list">
          <button className="menu-btn big" onClick={onResume}>{t('▶ 계속하기')}</button>
          <button className="menu-btn" onClick={() => setScreen('settings')}>{t('설정')}</button>
          <button className="menu-btn" onClick={() => setScreen('controls')}>{t('조작법')}</button>
          <button className="menu-btn" onClick={() => setScreen('bestiary')}>{t('괴물 도감')}</button>
          <button className="menu-btn" onClick={() => setScreen('confirm')}>{t('메인 메뉴로 나가기')}</button>
          <p className="dim">{t('ESC 로 닫기')}</p>
        </nav>
      )}
      {screen === 'settings' && <SettingsForm settings={settings} onSettings={onSettings} onBack={() => setScreen('main')} engine={engine} />}
      {screen === 'controls' && <ControlsText onBack={() => setScreen('main')} engine={engine} />}
      {screen === 'bestiary' && <Bestiary onBack={() => setScreen('main')} />}
      {screen === 'confirm' && (
        <nav className="menu-list">
          <p>{t('정말 나갈까?')} {solo ? t('지금까지의 진행이 사라진다.') : t('동료들은 남아서 계속 플레이한다.')}</p>
          <button className="menu-btn big danger-btn" onClick={onLeave}>{t('나가기')}</button>
          <button className="menu-btn" onClick={() => setScreen('main')}>{t('← 취소')}</button>
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
  const modes = { ...defaultModes(), ...(state.modes || {}) };
  const me = players.find(p => p.id === myId);
  const isHost = myId === hostId;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 복사 불가 */ }
  };
  const slots = Array.from({ length: max }, (_, i) => players[i] || null);

  return (
    <div className="menu-col lobby">
      <div className="logo"><h2>{t('대기방')}</h2></div>
      <div className="room-code">
        <span className="dim">{t('방 코드')}</span>
        <strong>{code}</strong>
        <button className="menu-btn small" onClick={copy}>{copied ? t('복사됨') : t('복사')}</button>
      </div>
      <ul className="player-slots">
        {slots.map((p, i) => (
          <li key={i} className={p ? '' : 'empty'}>
            {p ? (
              <>
                <PlayerPreview color={p.color} />
                <span className="pname">{p.name}{p.id === myId ? ` (${t('나')})` : ''}</span>
                {p.id === hostId && <span className="badge">{t('방장')}</span>}
                <span className="swatch" style={{ background: colorHex(p.color) }} />
              </>
            ) : <span className="dim">{t('빈 자리')}</span>}
          </li>
        ))}
      </ul>
      <div className="color-pick">
        <span className="dim">{t('방호복 색')}</span>
        <div>
          {COLORS.map(([key, label, hex]) => {
            const taken = players.some(p => p.id !== myId && p.color === key);
            return (
              <button key={key} className={`color-btn${me?.color === key ? ' on' : ''}`} disabled={taken}
                onClick={() => engine()?.setColor(key)} title={taken ? t('다른 사람이 사용 중') : t(label)}>
                <span style={{ background: hex }} />{t(label)}
              </button>
            );
          })}
        </div>
      </div>
      {isHost && <ModeSection modes={modes} engine={engine} />}
      {isHost
        ? <button className="menu-btn big" onClick={() => engine()?.startMatch()}>{t('▶ 게임 시작')} ({players.length}/{max})</button>
        : <p className="dim">{t('방장이 시작하기를 기다리는 중...')} ({players.length}/{max})</p>}
      <button className="menu-btn" onClick={() => engine()?.leaveRoom()}>{t('나가기')}</button>
    </div>
  );
}

/** 대기방 게임 모드 (방장에게만 보인다): 추가된 모드 목록 + [모드 추가] 창 (검색) */
function ModeSection({ modes, engine }) {
  const [open, setOpen] = useState(false);
  const added = MODES.filter(m => modes[m.id]);
  const set = (id, on) => engine()?.setMode(id, on);
  return (
    <div className="mode-section">
      <div className="mode-head">
        <span className="dim">{t('게임 모드')}</span>
        <button className="color-btn" onClick={() => setOpen(true)}>{t('+ 모드 추가')}</button>
      </div>
      {added.length
        ? <ul className="mode-list">
            {added.map(m => (
              <li key={m.id} title={t(m.desc)}>
                <span>{t(m.name)}</span>
                <button className="mode-x" onClick={() => set(m.id, false)} aria-label={t('{name} 빼기', { name: t(m.name) })}>×</button>
              </li>
            ))}
          </ul>
        : <p className="dim mode-empty">{t('추가된 모드 없음')}</p>}
      {open && createPortal(<ModeDialog modes={modes} onSet={set} onClose={() => setOpen(false)} />, document.body)}   {/* 대기방 패널의 transform 밖에서 화면 가운데에 뜨게 */}
    </div>
  );
}

function ModeDialog({ modes, onSet, onClose }) {
  const [q, setQ] = useState('');
  const key = q.trim().toLowerCase().replace(/\s+/g, '');
  const list = MODES.filter(m => !key || t(m.name).toLowerCase().replace(/\s+/g, '').includes(key));
  return (
    <div className="mode-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mode-dialog" role="dialog" aria-label={t('모드 추가')}>
        <div className="mode-head">
          <strong>{t('모드 추가')}</strong>
          <button className="mode-x" onClick={onClose} aria-label={t('닫기')}>×</button>
        </div>
        <input className="mode-search" autoFocus placeholder={t('모드 이름 검색')} value={q}
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }} />
        <ul className="mode-options">
          {list.map(m => (
            <li key={m.id}>
              <div>
                <span className="mode-name">{t(m.name)}</span>
                <span className="dim mode-desc">{t(m.desc)}</span>
              </div>
              <button className={`color-btn${modes[m.id] ? ' on' : ''}`} onClick={() => onSet(m.id, !modes[m.id])}>
                {modes[m.id] ? t('추가됨 ✓') : t('추가')}
              </button>
            </li>
          ))}
          {!list.length && <li className="dim">{t('"{q}" 에 맞는 모드가 없음', { q })}</li>}
        </ul>
      </div>
    </div>
  );
}

// ================================================================ 오버레이
function InfoPanel({ title, sub = '', lines = [], danger = false, button = null }) {
  return (
    <div className="panel">
      <h1 className={danger ? 'danger' : undefined}>{t(title)}</h1>
      <h2>{t(sub)}</h2>
      {lines.length > 0 && <p>{lines.map(l => t(l)).join('\n')}</p>}
      {button && <button onClick={button.onClick}>{t(button.label)}</button>}
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
  if (escaped.length) lines.push(t('탈출: {names}', { names: escaped.join(', ') }));
  if (dead.length) lines.push(t('실종: {names}', { names: dead.join(', ') }));
  return (
    <div className="panel">
      <h1 className={won ? undefined : 'danger'}>{won ? 'NOCLIP' : 'CAUGHT'}</h1>
      <h2>{left > 0 ? t('{n}초 후 {level} 으로 떨어진다', { n: left, level: t(nextLevelName ?? 'LEVEL 0') }) : t('떨어지는 중...')}</h2>
      {lines.length > 0 && <p>{lines.join('\n')}</p>}
      <button onClick={onMenu}>{t('메인 메뉴로')}</button>
    </div>
  );
}

/** 테스트 모드 패널 (` 키). 버튼은 포커스를 가져가지 않게 해서 Space/E 등 게임 키와 충돌하지 않도록 한다 */
const ENTITY_BUTTONS = [['wanderer', '방랑자'], ['howler', '하울러'], ['smiler', '스마일러'], ['skinStealer', '스킨 스틸러'], ['hound', '하운드'],
  ['partygoer', '파티고어'], ['deathmoth', '데스모스'], ['wretch', '광인'], ['scratcher', '스크래처'],
  ['windows', '창문들'], ['watch', '동네 감시자'], ['faceling', '페이슬링'], ['clump', '클럼프'], ['animation', '애니메이션'],
  ['animatedKing', '애니메이션 킹'], ['aranea', '아라네아 멤브리'], ['kitty', '키티'], ['partyPooper', '파티 푸퍼'],
  ['beast', '레벨 5의 야수'], ['seaThing', '레벨 7의 무언가'], ['crawler', '크롤러'], ['deathrat', '죽음쥐'], ['jackLantern', '잭-오-랜턴'],
  ['camoCrawler', '위장 크롤러'], ['duller', '덜러'], ['sheet', '시츠']];
const LEVEL_NAMES = LEVELS.map(L => `${L.label ?? L.id} ${L.name}`);   // 테스트 패널 레벨 버튼
const ITEM_BUTTONS = [['almondWater', '아몬드 워터'], ['staminaDrink', '스테미너 드링크'], ['camera', '카메라'], ['bugSpray', '살충제'], ['flare', '조명탄'], ['compass', '나침반'],
  ['firecracker', '폭죽'], ['nightVision', '야간 투시경'], ['adrenaline', '아드레날린']];

const TEST_TABS = [['level', '레벨'], ['entity', '괴물'], ['item', '아이템'], ['player', '플레이어'], ['mission', '진행']];

function TestPanel({ onCmd, onClose }) {
  const [tab, setTab] = useState('level');
  const B = ({ cmd, arg, children }) => (
    <button onMouseDown={e => e.preventDefault()} onClick={() => onCmd(cmd, arg)}>{children}</button>
  );
  return (
    <div id="testPanel">
      <div className="tp-head">
        <span>TEST MODE</span>
        <button onMouseDown={e => e.preventDefault()} onClick={onClose}>{t('닫기')} [`]</button>
      </div>
      <div className="tp-tabs">
        {TEST_TABS.map(([k, n]) => (
          <button key={k} className={tab === k ? 'on' : undefined} onMouseDown={e => e.preventDefault()} onClick={() => setTab(k)}>{t(n)}</button>
        ))}
      </div>
      <div className="tp-body">
        {tab === 'level' && <div className="tp-grid">
          <B cmd="nextLevel">{t('다음 레벨 ▶')}</B>
          {LEVEL_NAMES.map((n, i) => <B key={i} cmd="setLevel" arg={i}>{n}</B>)}
        </div>}
        {tab === 'entity' && <div className="tp-grid">
          {ENTITY_BUTTONS.map(([k, n]) => <B key={k} cmd="spawnEntity" arg={k}>{t(n)}</B>)}
          <B cmd="clearEntities">{t('전부 제거')}</B>
        </div>}
        {tab === 'item' && <div className="tp-grid">
          {ITEM_BUTTONS.map(([k, n]) => <B key={k} cmd="spawnItem" arg={k}>{t(n)}</B>)}
        </div>}
        {tab === 'player' && <div className="tp-grid">
          <B cmd="addSanity" arg={30}>{t('정신력')} +30</B>
          <B cmd="addSanity" arg={-30}>{t('정신력')} -30</B>
          <B cmd="addSanity" arg={100}>{t('정신력 가득')}</B>
          <B cmd="god">{t('무적')} ON/OFF</B>
          <B cmd="revive">{t('부활')}</B>
          <B cmd="fullbright">{t('밝게')} ON/OFF</B>
          <B cmd="revealMap">{t('미니맵 공개')}</B>
        </div>}
        {tab === 'mission' && <div className="tp-grid">
          <B cmd="giveKey">{t('미션')} +1</B>
          <B cmd="unlockExit">{t('출구 열기')}</B>
          <B cmd="tpKey">{t('목표로 이동')}</B>
          <B cmd="tpPuzzle">{t('퍼즐로 이동')}</B>
          <B cmd="tpExit">{t('출구로 이동')}</B>
          <B cmd="ending">{t('엔딩 보기')}</B>
        </div>}
      </div>
    </div>
  );
}
