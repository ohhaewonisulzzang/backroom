'use client';

import { useEffect, useRef, useState } from 'react';
import { PUZZLE_NAMES, PUZZLE_HINTS, lightsToggle, slideMove, arcadePos, quickJudge } from '../shared/puzzles.js';

/**
 * 퍼즐 단말기 화면. 게임은 멈추지 않는다 — 푸는 동안 엔티티가 다가올 수 있다.
 * 풀었다고 생각되면 onSubmit(answer) → 서버가 판정 (맞으면 열쇠, 틀리면 경보)
 * props: { index, puzzle, wrongAt(틀린 시각, 바뀌면 흔들림), onSubmit, onClose, sfx }
 */
export default function PuzzlePanel({ puzzle, wrongAt, onSubmit, onClose, sfx }) {
  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (!wrongAt) return;
    setShake(true);
    const id = setTimeout(() => setShake(false), 600);
    return () => clearTimeout(id);
  }, [wrongAt]);
  const Body = { oneStroke: OneStroke, lightsOut: LightsOut, sequence: Sequence, memory: Memory, slide: Slide, arcade: Arcade, quick: Quick }[puzzle.type];
  return (
    <div className={`puzzle-panel${shake ? ' wrong' : ''}`} onPointerDown={e => e.stopPropagation()}>
      <div className="pz-head">
        <span>{puzzle.type === 'arcade' || puzzle.type === 'quick' ? 'ARCADE' : 'TERMINAL'} · {PUZZLE_NAMES[puzzle.type]}</span>
        <button onMouseDown={e => e.preventDefault()} onClick={onClose}>닫기 [E]</button>
      </div>
      <p className="pz-hint">{PUZZLE_HINTS[puzzle.type]}</p>
      <Body puzzle={puzzle} onSubmit={onSubmit} sfx={sfx} wrongAt={wrongAt} onClose={onClose} />
      {shake && <div className="pz-alarm">ERROR — 경보가 울린다!</div>}
      <p className="pz-foot">푸는 동안에도 시간은 흐른다. 주위를 살펴라.</p>
    </div>
  );
}

const Btn = ({ onClick, children, className = '' }) => (
  <button className={`pz-btn ${className}`} onMouseDown={e => e.preventDefault()} onClick={onClick}>{children}</button>
);

// ------------------------------------------------------------------ 한붓 그리기
function OneStroke({ puzzle, onSubmit, sfx }) {
  const { cols, rows, edges } = puzzle;
  const G = 70, pad = 30, Wd = pad * 2 + (cols - 1) * G, Ht = pad * 2 + (rows - 1) * G;
  const pos = n => [pad + (n % cols) * G, pad + Math.floor(n / cols) * G];
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const all = new Set(edges.map(([a, b]) => key(a, b)));
  const [path, setPathState] = useState([]);
  const [stuck, setStuck] = useState(false);
  const drag = useRef(false), svg = useRef(null), done = useRef(false), cur = useRef([]), stuckRef = useRef(false);
  const setPath = p => { cur.current = p; setPathState(p); };
  const used = new Set(path.slice(1).map((n, i) => key(path[i], n)));

  const extend = n => {
    if (stuckRef.current || done.current) return;
    const p = cur.current;
    if (!p.length) { sfx('beep', 520); setPath([n]); return; }
    const last = p[p.length - 1];
    if (n === last) return;
    if (p.length >= 2 && n === p[p.length - 2]) { sfx('click'); setPath(p.slice(0, -1)); return; }   // 되돌리기
    const k = key(last, n);
    const u = new Set(p.slice(1).map((m, i) => key(p[i], m)));
    if (!all.has(k) || u.has(k)) return;
    u.add(k);
    sfx('beep', 520 + u.size * 40);
    const next = [...p, n];
    setPath(next);
    if (u.size === all.size) { done.current = true; onSubmit(next); return; }
    // 더 갈 수 있는 선이 없으면 막힘 → 잠깐 보여주고 처음부터
    const free = edges.some(([a, b]) => (a === n || b === n) && !u.has(key(a, b)));
    if (!free) {
      stuckRef.current = true; setStuck(true); sfx('wrong');
      setTimeout(() => { setPath([]); stuckRef.current = false; setStuck(false); }, 800);
    }
  };
  const nodeAt = e => {
    const r = svg.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * Wd, y = ((e.clientY - r.top) / r.height) * Ht;
    for (let n = 0; n < cols * rows; n++) { const [nx, ny] = pos(n); if (Math.hypot(nx - x, ny - y) < 20) return n; }
    return -1;
  };
  const nodes = new Set(edges.flat());
  const reset = () => { setPath([]); stuckRef.current = false; setStuck(false); done.current = false; };
  return (
    <>
      <svg ref={svg} className="pz-svg" viewBox={`0 0 ${Wd} ${Ht}`} style={{ maxWidth: Wd * 1.1 }}
        onPointerDown={e => { const n = nodeAt(e); if (n >= 0 && nodes.has(n)) { drag.current = true; extend(n); } }}
        onPointerMove={e => { if (!drag.current) return; const n = nodeAt(e); if (n >= 0) extend(n); }}
        onPointerUp={() => { drag.current = false; }} onPointerLeave={() => { drag.current = false; }}>
        {edges.map(([a, b]) => {
          const [x1, y1] = pos(a), [x2, y2] = pos(b), on = used.has(key(a, b));
          return <line key={key(a, b)} x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? (stuck ? '#c8402c' : '#f0dc8c') : '#4f4a33'} strokeWidth={on ? 9 : 6} strokeLinecap="round" />;
        })}
        {[...nodes].map(n => {
          const [x, y] = pos(n), last = path[path.length - 1] === n;
          return <circle key={n} cx={x} cy={y} r={last ? 11 : 8} fill={path.includes(n) ? '#f0dc8c' : '#8a7a3a'} stroke={last ? '#fff' : 'none'} strokeWidth="2" />;
        })}
      </svg>
      <div className="pz-row">
        <span className="pz-dim">{used.size} / {all.size} 선{stuck ? ' — 막혔다!' : ''}</span>
        <Btn onClick={reset}>처음부터</Btn>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ 전등 끄기
function LightsOut({ puzzle, onSubmit, sfx }) {
  const [cells, setCells] = useState(puzzle.cells);
  const [clicks, setClicks] = useState([]);
  const done = useRef(false);
  const press = i => {
    if (done.current) return;
    const next = [...cells]; lightsToggle(next, puzzle.n, i);
    const c = [...clicks, i];
    setCells(next); setClicks(c);
    sfx('beep', next[i] ? 700 : 400);
    if (next.every(v => !v)) { done.current = true; onSubmit(c); }
  };
  const reset = () => { setCells(puzzle.cells); setClicks([]); done.current = false; };
  return (
    <>
      <div className="pz-grid" style={{ gridTemplateColumns: `repeat(${puzzle.n}, 64px)` }}>
        {cells.map((v, i) => <button key={i} className={`pz-cell lamp${v ? ' on' : ''}`} onMouseDown={e => e.preventDefault()} onClick={() => press(i)} />)}
      </div>
      <div className="pz-row"><span className="pz-dim">누른 횟수 {clicks.length}</span><Btn onClick={reset}>처음부터</Btn></div>
    </>
  );
}

// ------------------------------------------------------------------ 숫자 퀴즈
function Sequence({ puzzle, onSubmit, wrongAt, onClose }) {
  const [v, setV] = useState('');
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { if (wrongAt) { setV(''); input.current?.focus(); } }, [wrongAt]);
  return (
    <form className="pz-seq" autoComplete="off" onSubmit={e => { e.preventDefault(); if (v.trim()) onSubmit(v.trim()); }}>
      <div className="pz-numbers">{puzzle.shown.join(',  ')},  <b>?</b></div>
      <div className="pz-row">
        <input ref={input} value={v} inputMode="numeric" maxLength={6} placeholder="?"
          onChange={e => setV(e.target.value.replace(/[^0-9-]/g, ''))}
          onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }} />
        <button type="submit" className="pz-btn">입력</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ 기억력
const PAD_COLORS = ['#d8312b', '#e8c53a', '#3f7fd0', '#5fae4e', '#e06fb0', '#e88a3a', '#9fd4e8', '#b07ad0', '#efe9d6'];
function Memory({ puzzle, onSubmit, sfx, wrongAt }) {
  const { seq } = puzzle;
  const [lit, setLit] = useState(-1);
  const [mode, setMode] = useState('show');      // show | input
  const [input, setInput] = useState([]);
  const timers = useRef([]);
  const play = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setMode('show'); setInput([]); setLit(-1);
    seq.forEach((n, i) => {
      timers.current.push(setTimeout(() => { setLit(n); sfx('beep', 300 + n * 90); }, 800 + i * 1000));
      timers.current.push(setTimeout(() => setLit(-1), 800 + i * 1000 + 700));
    });
    timers.current.push(setTimeout(() => setMode('input'), 800 + seq.length * 1000));
  };
  useEffect(() => { play(); return () => timers.current.forEach(clearTimeout); }, []);           // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (wrongAt) { const id = setTimeout(play, 1200); return () => clearTimeout(id); } }, [wrongAt]);   // eslint-disable-line react-hooks/exhaustive-deps
  const press = n => {
    if (mode !== 'input') return;
    sfx('beep', 300 + n * 90);
    setLit(n); setTimeout(() => setLit(l => (l === n ? -1 : l)), 200);
    const next = [...input, n];
    setInput(next);
    // 틀린 순간 바로 제출 → 서버가 오답 판정 (경보)
    if (next[next.length - 1] !== seq[next.length - 1] || next.length === seq.length) { setMode('wait'); onSubmit(next); }
  };
  return (
    <>
      <div className="pz-grid" style={{ gridTemplateColumns: `repeat(${puzzle.pads === 4 ? 2 : 3}, 84px)` }}>
        {PAD_COLORS.slice(0, puzzle.pads || 9).map((c, i) => (
          // 패드마다 번호를 적어 둬서 순서를 외우기 쉽게
          <button key={i} className={`pz-cell pad${lit === i ? ' on' : ''}`} style={{ '--pad': c, width: 84, height: 84 }}
            onMouseDown={e => e.preventDefault()} onClick={() => press(i)}>{i + 1}</button>
        ))}
      </div>
      <div className="pz-row">
        <span className="pz-dim">{mode === 'show' ? '잘 봐라...' : mode === 'input' ? `입력 ${input.length} / ${seq.length}` : '...'}</span>
        <Btn onClick={play}>다시 보기</Btn>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ 슬라이드
function Slide({ puzzle, onSubmit, sfx }) {
  const [tiles, setTiles] = useState(puzzle.tiles);
  const [moves, setMoves] = useState([]);
  const done = useRef(false);
  const press = i => {
    if (done.current) return;
    const next = [...tiles];
    if (!slideMove(next, i)) return;
    const m = [...moves, i];
    setTiles(next); setMoves(m); sfx('click');
    if (next.every((v, k) => v === (k === 8 ? 0 : k + 1))) { done.current = true; onSubmit(m); }
  };
  const reset = () => { setTiles(puzzle.tiles); setMoves([]); done.current = false; };
  return (
    <>
      <div className="pz-grid" style={{ gridTemplateColumns: 'repeat(3, 64px)' }}>
        {tiles.map((v, i) => (
          <button key={i} className={`pz-cell tile${v ? '' : ' empty'}${v === i + 1 ? ' ok' : ''}`}
            onMouseDown={e => e.preventDefault()} onClick={() => press(i)}>{v || ''}</button>
        ))}
      </div>
      <div className="pz-row"><span className="pz-dim">이동 {moves.length}</span><Btn onClick={reset}>처음부터</Btn></div>
    </>
  );
}

// ------------------------------------------------------------------ 파티 팝 (Level Fun 게임기)
// 풍선이 좌우로 왔다 갔다 한다. 초록 다트 구역에 들어왔을 때 클릭(또는 Space) → 펑! 3번이면 클리어.
// 단계마다 풍선이 빨라지고 구역이 좁아진다. 빗나가면 서버에 오답 제출 → 경보 (그 단계는 다시)
function Arcade({ puzzle, onSubmit, sfx }) {
  const { stages } = puzzle;
  const W = 340, H = 120, X0 = 20, X1 = W - 20;
  const [stage, setStage] = useState(0);
  const [x, setX] = useState(0);
  const [flash, setFlash] = useState(null);      // 'hit' | 'miss'
  const hits = useRef([]), start = useRef(performance.now()), done = useRef(false), stageRef = useRef(0);
  useEffect(() => {
    let raf = 0;
    const loop = now => {
      if (!done.current) setX(arcadePos(stages[stageRef.current], (now - start.current) / 1000));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stages]);
  const fire = () => {
    if (done.current) return;
    const k = stageRef.current, st = stages[k], t = (performance.now() - start.current) / 1000;
    if (Math.abs(arcadePos(st, t) - st.c) <= st.hw) {
      sfx('beep', 900 + k * 200);
      hits.current = [...hits.current, t];
      setFlash('hit'); setTimeout(() => setFlash(null), 250);
      if (hits.current.length === stages.length) { done.current = true; onSubmit(hits.current); return; }
      stageRef.current = k + 1; setStage(k + 1); start.current = performance.now();
    } else {
      sfx('wrong');
      setFlash('miss'); setTimeout(() => setFlash(null), 400);
      onSubmit('miss');                          // 서버가 오답 판정 → 경보
      start.current = performance.now();         // 같은 단계 다시
    }
  };
  useEffect(() => {
    const key = e => { if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); fire(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  const st = stages[Math.min(stage, stages.length - 1)], px = v => X0 + v * (X1 - X0);
  return (
    <>
      <svg className="pz-svg arcade-svg" viewBox={`0 0 ${W} ${H}`} onPointerDown={e => { e.preventDefault(); fire(); }}>
        <rect x="0" y="0" width={W} height={H} fill={flash === 'miss' ? '#3a0a10' : '#120a24'} />
        {[...Array(12)].map((_, i) => <circle key={i} cx={(i * 53) % W} cy={(i * 37) % 50 + 8} r="1.5" fill="#ffd25a" opacity="0.6" />)}
        <rect x={px(st.c - st.hw)} y="20" width={px(st.c + st.hw) - px(st.c - st.hw)} height="70" fill="#6edc78" opacity="0.28" />
        <line x1={px(st.c)} y1="16" x2={px(st.c)} y2="94" stroke="#6edc78" strokeWidth="2" strokeDasharray="4 4" />
        <polygon points={`${px(st.c) - 6},104 ${px(st.c) + 6},104 ${px(st.c)},92`} fill="#e8e8f0" />
        <line x1={X0} y1="96" x2={X1} y2="96" stroke="#5a2a8a" strokeWidth="3" />
        {!done.current && (
          <g transform={`translate(${px(x)} 52)`}>
            <path d="M0 18 Q4 30 -2 40" stroke="#ddd" fill="none" />
            <ellipse cx="0" cy="0" rx="15" ry="19" fill={flash === 'hit' ? '#fff' : '#d8312b'} />
            <ellipse cx="-5" cy="-7" rx="3" ry="5" fill="#ff9a90" />
          </g>
        )}
        {flash === 'hit' && <text x={W / 2} y="62" textAnchor="middle" fill="#ffd25a" fontSize="30" fontFamily="VT323, monospace">POP!</text>}
        {flash === 'miss' && <text x={W / 2} y="62" textAnchor="middle" fill="#ff5a4a" fontSize="30" fontFamily="VT323, monospace">MISS</text>}
      </svg>
      <div className="pz-row">
        <span className="pz-dim">풍선 {Math.min(hits.current.length, stages.length)} / {stages.length}</span>
        <Btn onClick={fire}>쏘기 [Space]</Btn>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ 퀵 드로우 (Level 3999 오락기)
function Quick({ puzzle, onSubmit, sfx }) {
  const W = 300, H = 170;
  const [, tick] = useState(0);
  const start = useRef(performance.now()), done = useRef(false), result = useRef(null), lock = useRef(false), beeped = useRef(false);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = (performance.now() - start.current) / 1000;
      if (!done.current && !lock.current && !beeped.current && t >= puzzle.delay) { beeped.current = true; sfx('beep', 1100); }
      // 너무 늦으면 실패 처리 → 다시
      if (!done.current && !lock.current && quickJudge(puzzle, t) === 'late') failRef.current('late');
      tick(v => v + 1); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [puzzle]);
  const failRef = useRef(null);
  const fail = why => {
    sfx('wrong'); onSubmit(-1);                         // 서버가 오답 판정 → 경보
    result.current = why; lock.current = true;
    setTimeout(() => { result.current = null; lock.current = false; beeped.current = false; start.current = performance.now(); }, 900);
  };
  failRef.current = fail;
  const fire = () => {
    if (done.current || lock.current) return;
    const t = (performance.now() - start.current) / 1000, j = quickJudge(puzzle, t);
    if (j === 'ok') { done.current = true; result.current = 'ok'; sfx('beep', 1500); onSubmit(t); }
    else fail(j);
  };
  useEffect(() => {
    const key = e => { if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); fire(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  const t = (performance.now() - start.current) / 1000, go = t >= puzzle.delay && !lock.current;
  const R = result.current;
  const bg = R === 'ok' ? '#0e3a18' : R ? '#3a0610' : go ? '#0e5a24' : '#3a0a10';
  const label = R === 'ok' ? 'CLEAR!' : R === 'early' ? '너무 빨라!' : R === 'late' ? '너무 늦어!' : go ? 'NOW!' : 'WAIT...';
  return (
    <>
      <svg className="pz-svg arcade-svg" viewBox={`0 0 ${W} ${H}`} onPointerDown={e => { e.preventDefault(); fire(); }}>
        <rect x="0" y="0" width={W} height={H} fill={bg} />
        <circle cx={W / 2} cy={H / 2 - 12} r="34" fill={go || R === 'ok' ? '#6edc78' : '#d8312b'} opacity={go ? 1 : 0.8} />
        <circle cx={W / 2 - 10} cy={H / 2 - 24} r="9" fill="#ffffff" opacity="0.35" />
        <text x={W / 2} y={H - 22} textAnchor="middle" fill="#fff3c4" fontSize="34" fontFamily="VT323, monospace">{label}</text>
      </svg>
      <div className="pz-row">
        <span className="pz-dim">초록불이 켜지면 바로!</span>
        <Btn onClick={fire}>쏘기 [Space]</Btn>
      </div>
    </>
  );
}
