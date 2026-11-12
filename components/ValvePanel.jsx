'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 밸브 / 크랭크 돌리기 창. 핸들을 마우스(손가락)로 잡고 시계 방향으로 빙빙 돌린다.
 * 반대로 돌리면 걸쇠에 걸려 헛돈다. 돌린 각도는 onTurn(라디안) 으로 서버에 보내고, 진행도는 progress() 로 읽는다.
 * 게임은 멈추지 않는다 — 돌리는 소리를 듣고 엔티티가 올 수 있다.
 * props: { kind: valve|drain|generator, turns, onTurn, progress, onClose }
 */
const LOOK = {
  valve:     { title: '증기 밸브', wheel: '#b8322a', dark: '#6a1410', hint: '핸들을 잡고 오른쪽(시계 방향)으로 돌려 잠가라.' },
  drain:     { title: '배수 밸브', wheel: '#2f7fb0', dark: '#164a6a', hint: '핸들을 잡고 오른쪽(시계 방향)으로 돌려 열어라.' },
  boiler:    { title: '보일러 압력 밸브', wheel: '#c8502a', dark: '#6a2410', hint: '핸들을 잡고 오른쪽(시계 방향)으로 돌려 압력을 잠가라.' },
  pump:      { title: '배수 펌프', wheel: '#2f8fa0', dark: '#145a66', hint: '핸들을 잡고 오른쪽(시계 방향)으로 돌려 물을 빼라.' },
  generator: { title: '발전기 크랭크', wheel: '#8a7a3a', dark: '#4a4020', hint: '손잡이를 잡고 오른쪽(시계 방향)으로 계속 돌려 시동을 걸어라.' },
};
const SIZE = 260, C = SIZE / 2;

export default function ValvePanel({ kind = 'valve', turns = 3, onTurn, progress, onClose }) {
  const L = LOOK[kind] || LOOK.valve, crank = kind === 'generator';
  const [rot, setRot] = useState(0);            // 화면에 보이는 핸들 각도 (누적)
  const [prog, setProg] = useState(progress());
  const svg = useRef(null), drag = useRef(null), pending = useRef(0), rotRef = useRef(0);

  // 진행도 갱신 + 모아 둔 회전량을 주기적으로 전송
  const cb = useRef({ onTurn, progress });
  cb.current = { onTurn, progress };
  useEffect(() => {
    let raf = 0, last = 0;
    const loop = now => {
      setProg(cb.current.progress());
      if (now - last > 70 && pending.current > 0) { cb.current.onTurn(pending.current); pending.current = 0; last = now; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const angleAt = e => {
    const r = svg.current.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  const down = e => { e.preventDefault(); svg.current.setPointerCapture?.(e.pointerId); drag.current = angleAt(e); };
  const move = e => {
    if (drag.current === null) return;
    const a = angleAt(e);
    let d = a - drag.current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    drag.current = a;
    if (d <= 0) return;                         // 반시계 방향은 걸쇠에 걸려 헛돈다
    pending.current += d;
    rotRef.current += d;
    setRot(rotRef.current);
  };
  const up = () => { drag.current = null; };

  const deg = (rot * 180) / Math.PI, pct = Math.round(prog * 100);
  const ring = 2 * Math.PI * (C - 10);
  return (
    <div className="puzzle-panel valve-panel" onPointerDown={e => e.stopPropagation()}>
      <div className="pz-head">
        <span>{L.title}</span>
        <button onMouseDown={e => e.preventDefault()} onClick={onClose}>닫기 [E]</button>
      </div>
      <p className="pz-hint">{L.hint} ({turns}바퀴)</p>
      <svg ref={svg} className="pz-svg valve-svg" viewBox={`0 0 ${SIZE} ${SIZE}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
        {/* 진행 링 */}
        <circle cx={C} cy={C} r={C - 10} fill="none" stroke="#2a2818" strokeWidth="10" />
        <circle cx={C} cy={C} r={C - 10} fill="none" stroke={pct >= 100 ? '#6edc78' : '#e6c24e'} strokeWidth="10"
          strokeDasharray={`${ring * prog} ${ring}`} transform={`rotate(-90 ${C} ${C})`} />
        {/* 벽에 붙은 배관 */}
        {!crank && <rect x={C - 16} y={C} width="32" height={C - 20} fill="#5a5048" />}
        <g transform={`rotate(${deg} ${C} ${C})`}>
          {crank ? (
            <>
              <circle cx={C} cy={C} r="62" fill="#3a3420" stroke={L.dark} strokeWidth="6" />
              <rect x={C - 8} y={C - 92} width="16" height="92" rx="6" fill={L.wheel} stroke={L.dark} strokeWidth="3" />
              <circle cx={C} cy={C - 92} r="18" fill="#2a2a28" stroke="#5a5a52" strokeWidth="4" />
            </>
          ) : (
            <>
              <circle cx={C} cy={C} r="86" fill="none" stroke={L.wheel} strokeWidth="18" />
              <circle cx={C} cy={C} r="86" fill="none" stroke={L.dark} strokeWidth="3" strokeDasharray="10 14" />
              {[0, 60, 120].map(a => (
                <rect key={a} x={C - 6} y={C - 86} width="12" height="172" fill={L.dark} transform={`rotate(${a} ${C} ${C})`} />
              ))}
              <circle cx={C + 86} cy={C} r="12" fill="#2a2a28" stroke="#5a5a52" strokeWidth="3" />
            </>
          )}
          <circle cx={C} cy={C} r="20" fill="#4a4a48" stroke="#2a2a28" strokeWidth="4" />
        </g>
        <text x={C} y={SIZE - 4} textAnchor="middle" fill="#9fe0a0" fontSize="20" fontFamily="VT323, monospace">↻ {pct}%</text>
      </svg>
      <p className="pz-foot">돌리는 소리가 난다. 주위를 살펴라.</p>
    </div>
  );
}
