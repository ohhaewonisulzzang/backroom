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
        <input type="checkbox" checked={s.enabled} disabled={busy} onChange={e => set({ enabled: e.target.checked })} /> 보이스 챗 사용 (같은 방 사람과 대화)
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
          <label>출력 장치 (게임 소리 + 목소리)
            <select value={s.manualOutput ? s.outputId : '__auto'} disabled={!V.sinkSupported} onChange={e => setOut(e.target.value)}>
              <option value="__auto">자동 — 마이크와 같은 기기{!s.manualOutput && s.outputId ? ` (${outputs.find(o => o.deviceId === s.outputId)?.label || '선택됨'})` : ' (시스템 기본)'}</option>
              <option value="">시스템 기본</option>
              {outputs.filter(d => d.deviceId !== 'default' && d.deviceId !== 'communications').map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.deviceId === rec ? '★ 추천 — ' : ''}{d.label || `스피커 ${d.deviceId.slice(0, 6)}`}</option>
              ))}
            </select>
          </label>
          <div className="pz-row">
            <span className="dim">마이크: {V.micLabel || '없음'}</span>
            <button type="button" className="pz-btn" onClick={() => V.testOutput()}>출력 테스트 (삐)</button>
          </div>
          {warn && <div className="error">{warn}</div>}
          {!V.sinkSupported && <p className="dim">이 브라우저는 출력 장치 선택을 지원하지 않는다 (크롬/엣지 권장).</p>}
          <p className="dim">블루투스 이어폰(갤럭시 버즈 등)은 <b>스테레오</b>(음악용)와 <b>수화기/헤드셋 (Hands-Free)</b>(통화용) 두 장치로 잡힌다.
            마이크를 <b>수화기</b>로 쓰면 이어폰 전체가 통화 모드가 되어 스테레오 쪽은 소리가 안 난다 → 출력도 <b>수화기</b>로 골라야 한다 (음질은 통화 수준).
            좋은 음질로 들으려면 마이크는 노트북 내장 마이크를, 출력은 스테레오를 쓰자. "출력 테스트"로 바로 확인할 수 있다.</p>
          <label>마이크 볼륨 {Math.round(s.inputGain * 100)}%
            <input type="range" min="0" max="3" step="0.05" value={s.inputGain} onChange={e => set({ inputGain: Number(e.target.value) })} />
          </label>
          <label>마이크 감도 — 이 선을 넘는 소리만 보낸다 (낮을수록 작은 소리도 잡힘, 0 = 항상 보냄)
            <div className="mic-meter">
              <div className="mic-level" ref={meter} />
              <div className="mic-mark" ref={mark} style={{ left: `${Math.round(s.threshold * 100)}%` }} />
            </div>
            <input type="range" min="0" max="0.5" step="0.01" value={s.threshold} onChange={e => set({ threshold: Number(e.target.value) })} />
          </label>
          <label>들리는 목소리 볼륨 {Math.round(s.outputVolume * 100)}%
            <input type="range" min="0" max="3" step="0.05" value={s.outputVolume} onChange={e => set({ outputVolume: Number(e.target.value) })} />
          </label>
          <div className="pz-row">
            <button type="button" className={`pz-btn loop-btn${V.loopback ? ' on' : ''}`} onClick={() => { V.setLoopback(!V.loopback); refresh(); }}>
              {V.loopback ? '■ 루프백 테스트 끄기' : '▶ 루프백 테스트 (내 목소리 듣기)'}
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={s.micOn} onChange={() => { V.toggleMic(); refresh(); }} /> 마이크 켜짐 — 게임 중 <b>{micKey}</b> 키로 켜고 끔
          </label>
          <label className="check"><input type="checkbox" checked={!!s.echo} onChange={e => set({ echo: e.target.checked })} /> 에코 제거 (스피커 소리가 마이크로 다시 들어가는 것 막기)</label>
          <label className="check"><input type="checkbox" checked={!!s.noise} onChange={e => set({ noise: e.target.checked })} /> 노이즈 억제 (잡음 줄이기 — 작은 목소리가 끊길 수 있음)</label>
          <label className="check"><input type="checkbox" checked={!!s.agc} onChange={e => set({ agc: e.target.checked })} /> 자동 음량 보정 (끄면 내 목소리 크기 그대로)</label>
          <p className="dim">가까이(2~3칸)는 또렷하게, 멀어질수록 작고 먹먹하게 들린다 (약 25칸 넘으면 안 들림). 벽 너머는 더 작게.<br />
            죽으면 산 사람에게는 목소리가 들리지 않는다. 목소리도 소리라서 귀 밝은 엔티티가 듣는다.<br />
            루프백 테스트는 헤드폰을 끼고 하자 (스피커면 울린다).</p>
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
      <p className="dim">방향키 이동, 오른쪽 SHIFT 달리기는 항상 쓸 수 있다. ESC(메뉴)와 `(테스트)는 바꿀 수 없다.<br />다른 동작이 쓰던 키를 고르면 두 키가 서로 바뀐다.</p>
      <button type="button" className="menu-btn" onClick={() => { setBinds({ ...DEFAULT_BINDS }); I.setBinds({ ...DEFAULT_BINDS }); }}>기본값으로</button>
    </div>
  );
}
