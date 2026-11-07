'use client';

import { useEffect, useRef, useState } from 'react';
import { ACTIONS, DEFAULT_BINDS, RESERVED, keyLabel } from '../game/client/input.js';

/**
 * 설정 화면의 "보이스 챗" / "키 설정" 탭.
 * engine() 은 게임 엔진 핸들 (voice, input 을 쓴다). 엔진이 아직 없으면 아무것도 하지 않는다.
 */

// ================================================================ 보이스 챗
export function VoiceSettings({ engine }) {
  const V = engine()?.voice;
  const [, rerender] = useState(0);
  const refresh = () => rerender(n => n + 1);
  const [devices, setDevices] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [busy, setBusy] = useState(false);
  const meter = useRef(null), mark = useRef(null);

  // 마이크 레벨 막대 (매 프레임)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = engine()?.voice;
      if (v && meter.current) {
        const lv = v.level || 0;
        meter.current.style.width = `${Math.round(lv * 100)}%`;
        meter.current.style.background = lv > v.settings().threshold ? '#6edc78' : '#8a7a3a';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); engine()?.voice?.setLoopback(false); };
  }, [engine]);
  const loadDevices = async () => { if (!V?.enabled) return; setDevices(await V.devices()); setOutputs(await V.devices('audiooutput')); };
  useEffect(() => { loadDevices(); }, [V, V?.enabled]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!V) return <p className="dim">불러오는 중...</p>;
  const s = V.settings();
  const set = async patch => { setBusy(true); await V.set(patch); setBusy(false); await loadDevices(); refresh(); };
  const [warn, setWarn] = useState('');
  const [rec, setRec] = useState('');           // 지금 마이크와 짝인 출력 장치 (★ 추천)
  const setOut = async v => { await V.setOutput(v); setWarn(await V.sinkWarning()); refresh(); };
  useEffect(() => { if (V?.enabled) { V.sinkWarning().then(setWarn); V.matchOutput().then(setRec); } });
  const micKey = keyLabel(engine()?.input?.binds?.mic);

  return (
    <div className="voice-settings">
      <label className="check">
        <input type="checkbox" checked={s.enabled} disabled={busy} onChange={e => set({ enabled: e.target.checked })} /> 보이스 챗
      </label>
      {V.error && <div className="error">{V.error}</div>}
      {s.enabled && (
        <>
          <label>마이크 장치
            <select value={s.deviceId} onChange={e => set({ deviceId: e.target.value })}>
              <option value="">기본 마이크</option>
              {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `마이크 ${d.deviceId.slice(0, 6)}`}</option>)}
            </select>
          </label>
          <label>출력 장치
            <select value={s.manualOutput ? s.outputId : '__auto'} disabled={!V.sinkSupported} onChange={e => setOut(e.target.value)}>
              <option value="__auto">자동{!s.manualOutput && s.outputId ? ` (${outputs.find(o => o.deviceId === s.outputId)?.label || ''})` : ''}</option>
              <option value="">시스템 기본</option>
              {outputs.filter(d => d.deviceId !== 'default' && d.deviceId !== 'communications').map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.deviceId === rec ? '★ ' : ''}{d.label || `스피커 ${d.deviceId.slice(0, 6)}`}</option>
              ))}
            </select>
          </label>
          <div className="pz-row">
            <button type="button" className="pz-btn" onClick={() => V.testOutput()}>출력 테스트</button>
          </div>
          {warn && <div className="error">{warn}</div>}
          {!V.sinkSupported && <p className="dim">출력 장치 선택은 크롬/엣지만 된다.</p>}
          <label>마이크 볼륨 {Math.round(s.inputGain * 100)}%
            <input type="range" min="0" max="3" step="0.05" value={s.inputGain} onChange={e => set({ inputGain: Number(e.target.value) })} />
          </label>
          <label>마이크 감도 (0 = 항상 보냄)
            <div className="mic-meter">
              <div className="mic-level" ref={meter} />
              <div className="mic-mark" ref={mark} style={{ left: `${Math.round(s.threshold * 100)}%` }} />
            </div>
            <input type="range" min="0" max="0.5" step="0.01" value={s.threshold} onChange={e => set({ threshold: Number(e.target.value) })} />
          </label>
          <label>목소리 볼륨 {Math.round(s.outputVolume * 100)}%
            <input type="range" min="0" max="3" step="0.05" value={s.outputVolume} onChange={e => set({ outputVolume: Number(e.target.value) })} />
          </label>
          <div className="pz-row">
            <button type="button" className={`pz-btn loop-btn${V.loopback ? ' on' : ''}`} onClick={() => { V.setLoopback(!V.loopback); refresh(); }}>
              {V.loopback ? '■ 루프백 끄기' : '▶ 루프백 테스트'}
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={s.micOn} onChange={() => { V.toggleMic(); refresh(); }} /> 마이크 켜짐 (<b>{micKey}</b>)
          </label>
          <label className="check"><input type="checkbox" checked={!!s.echo} onChange={e => set({ echo: e.target.checked })} /> 에코 제거</label>
          <label className="check"><input type="checkbox" checked={!!s.noise} onChange={e => set({ noise: e.target.checked })} /> 노이즈 억제</label>
          <label className="check"><input type="checkbox" checked={!!s.agc} onChange={e => set({ agc: e.target.checked })} /> 자동 음량 보정</label>
        </>
      )}
    </div>
  );
}

// ================================================================ 키 설정
export function KeySettings({ engine }) {
  const I = engine()?.input;
  const [binds, setBinds] = useState(() => ({ ...(I?.binds || DEFAULT_BINDS) }));
  const [wait, setWait] = useState(null);       // 키를 기다리는 동작
  useEffect(() => {
    if (!wait) return;
    if (I) I.capturing = true;
    const onKey = e => {
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape') { setWait(null); return; }
      if (RESERVED.includes(e.code)) return;
      const next = { ...binds };
      // 이미 다른 동작이 쓰는 키면 서로 바꾼다
      const other = Object.keys(next).find(a => a !== wait && next[a] === e.code);
      if (other) next[other] = binds[wait];
      next[wait] = e.code;
      setBinds(next); I?.setBinds(next); setWait(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); if (I) I.capturing = false; };
  }, [wait, binds, I]);
  if (!I) return <p className="dim">불러오는 중...</p>;
  return (
    <div className="key-settings">
      <div className="key-list">
        {ACTIONS.map(([a, label]) => (
          <div key={a} className="key-row">
            <span>{label}</span>
            <button type="button" className={`key-btn${wait === a ? ' wait' : ''}`} onClick={() => setWait(a)}>
              {wait === a ? '키를 누르세요… (ESC 취소)' : keyLabel(binds[a])}
            </button>
          </div>
        ))}
      </div>
      <p className="dim">이미 쓰는 키를 고르면 서로 바뀐다.</p>
      <button type="button" className="menu-btn" onClick={() => { setBinds({ ...DEFAULT_BINDS }); I.setBinds({ ...DEFAULT_BINDS }); }}>기본값으로</button>
    </div>
  );
}
