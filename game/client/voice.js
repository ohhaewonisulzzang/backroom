/**
 * 보이스 챗 (WebRTC, 같은 방 사람끼리 1:1 연결 — 최대 4명이라 서로 다 잇는다).
 * 서버는 연결 정보(SDP / ICE)만 중계하고, 목소리는 브라우저끼리 직접 오간다.
 *
 * 내 마이크:  mic → inGain(마이크 볼륨) → analyser(레벨) → gate(감도 이상일 때만 열림, 마이크 OFF 면 닫힘) → dest(상대에게 보냄)
 *                                                                                      └→ loop(루프백 테스트: 내 목소리를 내가 듣기)
 * 상대 목소리: track → gain(거리 볼륨) → pan(좌우) → out(음성 볼륨) → 스피커
 *
 * 설정은 localStorage('backrooms.voice') 에 저장된다.
 *
 * 출력 장치: 블루투스 이어폰(갤럭시 버즈 등)의 마이크를 열면 Windows 가 이어폰을 "헤드폰(스테레오)" 에서
 * "헤드셋(핸즈프리)" 이라는 다른 출력 장치로 바꾼다. 게임 소리가 예전 장치로 계속 나가면 아무것도 안 들리므로,
 * 기본(자동)으로는 마이크와 같은 기기(groupId)의 출력 장치로 효과음·목소리를 모두 옮긴다 (AudioContext.setSinkId).
 */
import { Sound } from './sound.js';

const STORE = 'backrooms.voice';
export const VOICE_DEFAULTS = { enabled: false, deviceId: '', inputGain: 1, threshold: 0.05, outputVolume: 1, micOn: true,
  echo: true, noise: false, agc: false,   // 에코 제거 / 노이즈 억제 / 자동 음량 보정 (기본: 에코 제거만 — 목소리 크기는 그대로)
  v: 2,
  outputId: '', manualOutput: false };   // 출력 장치 ('' = 시스템 기본) / 직접 고름(false 면 마이크와 같은 기기로 자동)
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const HOLD = 0.7;        // 말을 멈춘 뒤 게이트가 닫히기까지 (초) — 단어 사이·말끝이 잘리지 않게
const BOOST = 2.2;      // 받는 목소리 고정 증폭 (크기 비율은 그대로, 전체만 키움). 뒤의 안전장치는 찢어질 만큼 클 때만 눌러 준다

function loadVoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    // 예전 기본 감도(0.12)는 말이 자주 끊겨서 새 기본값으로 바꾼다
    if (!saved.v && (saved.threshold === undefined || saved.threshold >= 0.12)) saved.threshold = VOICE_DEFAULTS.threshold;
    return { ...VOICE_DEFAULTS, ...saved, v: 2 };
  } catch { return { ...VOICE_DEFAULTS }; }
}

/**
 * 장치 이름만 뽑는다 (윈도우 이름 형식이 제각각이라 군더더기를 걷어낸다)
 *  "커뮤니케이션 - 머리에 거는 수화기(영진의 Buds2 Hands-Free AG Audio) (Bluetooth)" → "영진의 buds2"
 *  "헤드폰(영진의 Buds2 Stereo) (Bluetooth)"                                         → "영진의 buds2"
 */
function deviceName(label = '') {
  let l = label.replace(/^\s*(기본값|커뮤니케이션|default|communications)\s*-\s*/i, '');
  // 끝에 붙는 "(Bluetooth)", "(1234:abcd)" 같은 꼬리를 모두 뗀다
  for (let k = 0; k < 3; k++) l = l.replace(/\s*\((bluetooth|[0-9a-f]{4}:[0-9a-f]{4})\)\s*$/i, '');
  const m = l.match(/\(([^()]*)\)\s*$/);
  const inner = (m ? m[1] : l).toLowerCase();
  return inner.replace(/hands-?free|stereo|ag audio|audio|headset|headphones?|수화기|헤드셋|헤드폰|스테레오|머리에 거는/g, '').replace(/[^a-z0-9가-힣]+/g, ' ').trim();
}
const isHandsFree = (label = '') => /hands-?free|수화기|헤드셋|headset/i.test(label);

export const Voice = {
  s: null,                 // 설정
  ctx: null, stream: null, src: null, inGain: null, analyser: null, gate: null, dest: null, loop: null, out: null,
  buf: null, level: 0, speaking: false, holdT: 0, loopback: false, error: '', duck: 0,
  peers: new Map(),        // id → { pc, gain, pan, an, buf, level, speaking, el, ice }
  myId: null, inRoom: false,
  signal: null,            // (to, data) => 서버로 중계 요청 (engine 이 넣는다)
  onSpeaking: null,        // (bool) => 서버에 "말하는 중" 알림 (엔티티가 목소리를 듣는다)
  onState: null,           // (vc) => 서버에 보이스 상태 알림 (0 안 씀 / 1 켜짐 / 2 음소거)
  get vc() { return !this.settings().enabled ? 0 : this.settings().micOn ? 1 : 2; },
  sendState() { if (this.inRoom) this.onState?.(this.vc); },
  speakSentAt: 0,

  settings() { if (!this.s) this.s = loadVoice(); return this.s; },
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.s)); } catch { /* 저장 불가 */ } },

  /** 오디오 그래프 준비 (사용자 클릭 이후에 불러야 소리가 난다) */
  ensureCtx() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.inGain = ctx.createGain();
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.gate = ctx.createGain(); this.gate.gain.value = 0;
    this.dest = ctx.createMediaStreamDestination();
    this.loop = ctx.createGain(); this.loop.gain.value = 0;
    this.out = ctx.createGain();
    // 리미터: 크게 키운 목소리가 찢어지지 않게 (큰 소리만 눌러 준다)
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -3; this.comp.knee.value = 0; this.comp.ratio.value = 20; this.comp.attack.value = 0.002; this.comp.release.value = 0.1;   // 찢어지기 직전에만
    this.inGain.connect(this.analyser);
    this.inGain.connect(this.gate);
    this.gate.connect(this.dest);
    this.gate.connect(this.loop).connect(ctx.destination);
    this.out.connect(this.comp).connect(ctx.destination);
    this.watchBackground();
    this.apply();
    this.applySink();
  },

  /** 설정값을 오디오 노드에 반영 */
  apply() {
    const s = this.settings();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.inGain.gain.setTargetAtTime(s.inputGain, t, 0.02);
    this.out.gain.setTargetAtTime(s.outputVolume * BOOST, t, 0.05);
    this.loop.gain.setTargetAtTime(this.loopback ? 1 : 0, t, 0.02);
  },

  /** 마이크 켜기 (권한 요청). 실패해도 듣기는 된다 */
  async openMic() {
    this.ensureCtx();
    this.closeMic();
    const s = this.settings();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: s.deviceId ? { exact: s.deviceId } : undefined, echoCancellation: !!s.echo, noiseSuppression: !!s.noise, autoGainControl: !!s.agc },
      });
      this.src = this.ctx.createMediaStreamSource(this.stream);
      this.src.connect(this.inGain);
      this.error = '';
      await this.autoOutput();
      return true;
    } catch (e) {
      this.error = e?.name === 'NotAllowedError' ? '마이크 권한이 거부됐다. 브라우저 주소창의 권한 설정에서 허용해 줘.' : '마이크를 열 수 없다.';
      return false;
    }
  },
  closeMic() {
    const had = !!this.stream;
    try { this.src?.disconnect(); } catch { /* 없음 */ }
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null; this.src = null;
    // 마이크를 놓으면 이어폰이 다시 스테레오 장치로 돌아가므로, 자동 모드면 시스템 기본으로 되돌린다
    if (had && !this.settings().manualOutput) { this.settings().outputId = ''; this.save(); this.applySink(); }
  },

  // ------------------------------------------------------------ 출력 장치
  get sinkSupported() { return typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype; },
  /** 효과음(Sound) + 목소리(Voice) 의 출력 장치를 설정값으로 */
  applySink() {
    if (!this.sinkSupported) return;
    const id = this.settings().outputId || '';
    for (const ctx of [this.ctx, Sound.ctx]) {
      if (!ctx || ctx.sinkId === id) continue;
      ctx.setSinkId(id).catch(() => { /* 사라진 장치 등 — 기본 장치로 둔다 */ });
    }
  },
  /** 지금 열린 마이크 이름 */
  get micLabel() { return this.stream?.getAudioTracks()[0]?.label || ''; },
  /**
   * 자동 모드: 지금 열린 마이크와 같은 기기의 출력 장치를 고른다 (없으면 시스템 기본).
   *  1) 같은 groupId  2) 이름으로 — 블루투스 이어폰은 "수화기/헤드셋(… Hands-Free)" 과 "헤드폰(… Stereo)" 이
   *  서로 다른 기기로 잡혀 groupId 가 다를 수 있어서, 마이크가 통화용이면 같은 이름의 통화용 출력을 찾는다.
   */
  async autoOutput() {
    const s = this.settings();
    if (s.manualOutput) { this.applySink(); return; }
    s.outputId = await this.matchOutput(); this.save();
    this.applySink();
  },
  async matchOutput() {
    const track = this.stream?.getAudioTracks()[0];
    if (!track) return '';
    const outs = (await this.devices('audiooutput')).filter(d => d.deviceId !== 'default' && d.deviceId !== 'communications');
    const group = track.getSettings?.().groupId;
    const byGroup = outs.find(d => group && d.groupId === group);
    if (byGroup) return byGroup.deviceId;
    const name = deviceName(track.label);
    if (!name) return '';
    const same = outs.filter(d => deviceName(d.label) === name);
    if (!same.length) return '';
    // 마이크가 통화용(Hands-Free)이면 출력도 통화용이어야 소리가 난다
    return (isHandsFree(track.label) ? same.find(d => isHandsFree(d.label)) : null)?.deviceId ?? same[0].deviceId;
  },
  /** 마이크는 블루투스 통화용(수화기)인데 출력이 같은 기기의 스테레오 / 시스템 기본이면 소리가 안 난다 → 경고 */
  async sinkWarning() {
    const lbl = this.micLabel;
    if (!this.stream || !isHandsFree(lbl)) return '';
    const outs = await this.devices('audiooutput');
    const cur = outs.find(d => d.deviceId === (this.settings().outputId || 'default'));
    if (cur && isHandsFree(cur.label) && deviceName(cur.label) === deviceName(lbl)) return '';
    return '지금 마이크가 블루투스 통화용(수화기/Hands-Free)이다. 출력 장치도 같은 이어폰의 수화기(Hands-Free)로 골라야 소리가 들린다 — 스테레오는 마이크를 쓰는 동안 꺼진다.';
  },
  /** 고른 출력 장치로 "삐" 소리 (출력 테스트) */
  testOutput() {
    this.ensureCtx();
    this.applySink();
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.frequency.value = 660; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.55);
  },
  /** 설정 화면: '__auto' = 자동, '' = 시스템 기본, 그 밖 = 특정 장치 */
  async setOutput(v) {
    const s = this.settings();
    if (v === '__auto') { s.manualOutput = false; this.save(); await this.autoOutput(); return; }
    s.manualOutput = true; s.outputId = v; this.save();
    this.applySink();
  },

  /** 설정 바꾸기 (설정 화면에서 호출). 장치가 바뀌면 마이크를 다시 연다 */
  async set(patch) {
    const s = this.settings(), prevDevice = s.deviceId, wasOn = s.enabled;
    Object.assign(s, patch);
    this.save();
    if (patch.enabled === true && !wasOn) await this.enable();
    else if (patch.enabled === false && wasOn) this.disable();
    else if (s.enabled && (patch.echo !== undefined || patch.noise !== undefined || patch.agc !== undefined)) await this.openMic();   // 음성 처리 옵션은 마이크를 다시 열어야 적용
    else if (s.enabled && patch.deviceId !== undefined && patch.deviceId !== prevDevice) {
      s.manualOutput = false; this.save();       // 마이크를 바꾸면 출력은 다시 자동 (그 마이크와 짝인 출력)
      await this.openMic();
    }
    this.apply();
  },
  async enable() {
    this.settings().enabled = true; this.save();
    await this.openMic();
    if (this.inRoom) this.hello();
    this.sendState();
  },
  disable() {
    this.settings().enabled = false; this.save();
    this.setLoopback(false);
    this.closeAll(true);
    this.closeMic();
    this.sendState();
  },
  /** 저장된 설정이 켜져 있으면 (첫 클릭 이후) 자동으로 켠다 */
  async autoStart() { if (this.settings().enabled && !this.stream) await this.enable(); },

  setLoopback(on) { this.loopback = !!on; if (on) this.ensureCtx(); this.apply(); },
  toggleMic() { const s = this.settings(); s.micOn = !s.micOn; this.save(); this.sendState(); return s.micOn; },
  get micOn() { return this.settings().micOn; },
  get enabled() { return this.settings().enabled; },

  async devices(kind = 'audioinput') {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === kind); } catch { return []; }
  },

  // ------------------------------------------------------------ 방 / 연결
  /** 방에 들어감 (대기방 or 게임). 보이스가 켜져 있으면 모두에게 인사 → 연결 시작 */
  joinRoom(myId) {
    if (this.inRoom && this.myId === myId) return;
    this.closeAll(false);
    this.myId = myId; this.inRoom = true;
    if (this.enabled) this.hello();
    this.sendState();
  },
  leaveRoom() { this.closeAll(true); this.inRoom = false; },
  hello() { this.ensureCtx(); this.signal?.('*', { t: 'hello' }); },

  /** 서버가 중계해 준 연결 정보 */
  async onSignal(from, d) {
    if (!this.enabled || !this.inRoom || !d || from === this.myId) return;
    try {
      if (d.t === 'hello') {
        if (this.peers.has(from)) return;
        if (this.myId < from) this.makePeer(from, true);       // id 가 작은 쪽이 연결을 건다
        else this.signal?.(from, { t: 'hello' });               // 상대가 걸도록 인사만
        return;
      }
      if (d.t === 'bye') { this.drop(from); return; }
      let P = this.peers.get(from);
      if (d.t === 'sdp') {
        if (!P) P = this.makePeer(from, false);
        await P.pc.setRemoteDescription({ type: d.type, sdp: d.sdp });
        if (d.type === 'offer') {
          await P.pc.setLocalDescription(await P.pc.createAnswer());
          this.signal?.(from, { t: 'sdp', type: P.pc.localDescription.type, sdp: P.pc.localDescription.sdp });
        }
        for (const c of P.ice) await P.pc.addIceCandidate(c).catch(() => {});
        P.ice = [];
      } else if (d.t === 'ice' && P) {
        if (P.pc.remoteDescription) await P.pc.addIceCandidate(d.c).catch(() => {});
        else P.ice.push(d.c);
      }
    } catch { /* 연결 실패는 조용히 무시 (다음 인사 때 다시) */ }
  },

  makePeer(id, initiator) {
    this.ensureCtx();
    const ctx = this.ctx, pc = new RTCPeerConnection({ iceServers: ICE });
    const P = { pc, gain: ctx.createGain(), lp: ctx.createBiquadFilter(), pan: ctx.createStereoPanner(), an: ctx.createAnalyser(), level: 0, speaking: false, el: null, ice: [] };
    P.an.fftSize = 512; P.buf = new Float32Array(P.an.fftSize);
    P.gain.gain.value = 0;
    P.lp.type = 'lowpass'; P.lp.frequency.value = 16000; P.lp.Q.value = 0.5;   // 멀거나 벽 너머면 먹먹하게
    P.gain.connect(P.lp).connect(P.pan).connect(this.out);
    for (const tr of this.dest.stream.getAudioTracks()) pc.addTrack(tr, this.dest.stream);
    pc.onicecandidate = e => { if (e.candidate) this.signal?.(id, { t: 'ice', c: e.candidate.toJSON() }); };
    pc.ontrack = e => {
      const st = e.streams[0] || new MediaStream([e.track]);
      // 크롬: 원격 스트림은 <audio> 에 붙여 둬야 WebAudio 로 소리가 흐른다 (그 자체는 음소거)
      const el = new Audio(); el.srcObject = st; el.muted = true; el.play().catch(() => {});
      P.el = el;
      const src = ctx.createMediaStreamSource(st);
      src.connect(P.an); src.connect(P.gain);
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(id); };
    if (initiator) {
      (async () => {
        await pc.setLocalDescription(await pc.createOffer());
        this.signal?.(id, { t: 'sdp', type: pc.localDescription.type, sdp: pc.localDescription.sdp });
      })().catch(() => {});
    }
    this.peers.set(id, P);
    return P;
  },

  drop(id) {
    const P = this.peers.get(id);
    if (!P) return;
    this.peers.delete(id);
    try { P.pc.close(); } catch { /* 이미 닫힘 */ }
    try { P.gain.disconnect(); P.pan.disconnect(); } catch { /* 없음 */ }
    if (P.el) { P.el.srcObject = null; }
  },
  closeAll(sayBye) {
    for (const id of [...this.peers.keys()]) { if (sayBye) this.signal?.(id, { t: 'bye' }); this.drop(id); }
  },

  // ------------------------------------------------------------ 매 프레임
  /**
   * 내 마이크 레벨 → 게이트 열고 닫기, 상대별 볼륨/좌우 갱신.
   * mix(id) → { gain 0~1, pan -1~1 } : 거리·벽·생존 여부로 엔진이 계산한다
   */
  update(dt, mix) {
    if (!this.ctx) return;
    const s = this.settings(), t = this.ctx.currentTime;
    if (this.src) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0; for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      this.level = Math.min(1, Math.sqrt(sum / this.buf.length) * 5);
    } else this.level = 0;
    // 부드러운 레벨: 올라갈 땐 바로, 내려갈 땐 천천히 (단어 사이에서 출렁이지 않게)
    this.env = this.level > (this.env || 0) ? this.level : (this.env || 0) * Math.exp(-dt / 0.25);
    // 히스테리시스: 감도 선을 넘으면 열리고, 그 절반 아래로 내려가야 닫히기 시작한다 (+ HOLD 초 유지)
    const wasOpen = this.holdT > 0;
    const over = s.threshold <= 0 || this.env > s.threshold || (wasOpen && this.env > s.threshold * 0.5);
    this.holdT = over ? HOLD : Math.max(0, this.holdT - dt);
    const open = s.enabled && s.micOn && !!this.src && this.holdT > 0;
    // 루프백 테스트 중엔 마이크 OFF 여도 감도만 보고 들려준다
    const gateOpen = open || (this.loopback && !!this.src && this.holdT > 0);
    this.gate.gain.setTargetAtTime(gateOpen ? 1 : 0, t, 0.015);
    if (open !== this.speaking || (open && performance.now() - this.speakSentAt > 400)) {
      this.speaking = open; this.speakSentAt = performance.now();
      this.onSpeaking?.(open);
    }
    let duck = 0;
    for (const [id, P] of this.peers) {
      const m = mix ? mix(id) : { gain: 1, pan: 0 };
      P.gain.gain.setTargetAtTime(m.gain, t, 0.08);
      P.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, m.pan)), t, 0.08);
      P.lp.frequency.setTargetAtTime(m.cutoff ?? 16000, t, 0.1);
      P.an.getFloatTimeDomainData(P.buf);
      let sum = 0; for (let i = 0; i < P.buf.length; i++) sum += P.buf[i] * P.buf[i];
      P.level = Math.min(1, Math.sqrt(sum / P.buf.length) * 5);
      P.speaking = P.level > 0.05 && m.gain > 0.02;
      P.heard = m.gain;
      if (P.speaking) duck = Math.max(duck, Math.min(1, m.gain * 1.5));
    }
    // 누가 말하는 동안 게임 소리를 살짝 줄여 목소리가 잘 들리게 (덕킹)
    this.duck += (duck - this.duck) * Math.min(1, dt * (duck > this.duck ? 12 : 3));
    Sound.voiceDuck?.(this.duck);
  },

  /**
   * 탭이 뒤로 가면 브라우저가 화면 갱신(requestAnimationFrame)을 멈춰 update() 가 안 불린다 → 게이트가 그대로 굳는다.
   * 그래서 뒤에 있는 동안은 감도 판정 없이 게이트를 열어 둔다 (마이크 OFF 면 닫음).
   */
  watchBackground() {
    if (this.bgTimer || typeof document === 'undefined') return;
    const tick = () => {
      if (!document.hidden || !this.ctx) return;
      const s = this.settings(), open = s.enabled && s.micOn && !!this.src;
      this.gate.gain.setTargetAtTime(open ? 1 : 0, this.ctx.currentTime, 0.05);
      this.holdT = open ? HOLD : 0;
    };
    document.addEventListener('visibilitychange', tick);
    this.bgTimer = setInterval(tick, 500);
  },

  /** 이 사람이 지금 말하고 있나 (말풍선 아이콘용) */
  isSpeaking(id) { return id === this.myId ? this.speaking : !!this.peers.get(id)?.speaking; },
  /** 이 사람 목소리 크기 0~1 (이름표 옆 게이지). 나에게 들리는 만큼만 */
  levelOf(id) { const P = this.peers.get(id); return P ? Math.min(1, P.level * 1.6) * Math.min(1, (P.heard ?? 0) * 3) : 0; },
};
