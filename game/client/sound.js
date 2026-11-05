/** WebAudio 절차적 사운드. 외부 오디오 파일 없음. 사용자 입력 이후 init() 호출 필요. */
export const Sound = {
  ctx: null,

  volume: 0.7,
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(0.8 * this.volume, this.ctx.currentTime, 0.05);
  },
  menuScare() { this.noise(1600, 0.6, 0.5); this.tone(420, 60, 0.6, 0.3, 'sawtooth'); this.tone(90, 40, 0.8, 0.35, 'square'); },

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.8 * this.volume; this.master.connect(c.destination);

    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // 형광등 계열(험, 버즈, 백색소음)은 duck 노드를 거친다 → 가까운 등이 꺼지면 순간 작아진다
    this.duckGain = c.createGain(); this.duckGain.gain.value = 1; this.duckGain.connect(this.master);

    // 형광등 험 (60Hz + 배음)
    this.humGain = c.createGain(); this.humGain.gain.value = 0.045; this.humGain.connect(this.duckGain);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(this.humGain);
    [[60, 'sawtooth', 0.55], [120, 'sine', 0.4], [180, 'sine', 0.15]].forEach(([f, type, g]) => {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = type; o.frequency.value = f; gn.gain.value = g;
      o.connect(gn); gn.connect(lp); o.start();
    });
    // 고주파 버즈
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 10;
    this.buzzGain = c.createGain(); this.buzzGain.gain.value = 0.01;
    n.connect(bp); bp.connect(this.buzzGain); this.buzzGain.connect(this.duckGain); n.start();

    // Level 0 형광등 백색소음: 안정기에서 나는 "치이이—" 하는 넓은 잡음, 120Hz 로 미세하게 떨린다
    const wn = c.createBufferSource(); wn.buffer = this.noiseBuf; wn.loop = true; wn.playbackRate.value = 0.93;
    const whp = c.createBiquadFilter(); whp.type = 'highpass'; whp.frequency.value = 1400;
    const wlp = c.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 8500;
    const wpk = c.createBiquadFilter(); wpk.type = 'peaking'; wpk.frequency.value = 3600; wpk.Q.value = 1.4; wpk.gain.value = 6;
    this.hissGain = c.createGain(); this.hissGain.gain.value = 0;
    wn.connect(whp); whp.connect(wlp); wlp.connect(wpk); wpk.connect(this.hissGain); this.hissGain.connect(this.duckGain); wn.start();
    this.hissMod = c.createGain(); this.hissMod.gain.value = 0;      // 120Hz 떨림 깊이 (백색소음 크기에 비례)
    const lfo = c.createOscillator(); lfo.frequency.value = 120; lfo.connect(this.hissMod); this.hissMod.connect(this.hissGain.gain); lfo.start();

    // 괴물 드론
    this.droneGain = c.createGain(); this.droneGain.gain.value = 0;
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 240;
    dlp.connect(this.droneGain); this.droneGain.connect(this.master);
    [41, 43.7, 82.9].forEach(f => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(dlp); o.start();
    });
  },

  setHum(intensity) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(0.012 + 0.035 * intensity, t, 0.015);
    this.buzzGain.gain.setTargetAtTime(0.004 + 0.008 * intensity, t, 0.015);
  },
  /** Level 0 형광등 백색소음 크기 (0~1) */
  setHiss(v) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.hissGain.gain.setTargetAtTime(0.022 * v, t, 0.08);
    this.hissMod.gain.setTargetAtTime(0.006 * v, t, 0.08);
  },
  /** 가까운 형광등이 꺼졌다/켜졌다 → 형광등 소리 전체가 같이 줄었다 돌아온다 */
  duck(level) { if (this.ctx) this.duckGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.008); },
  /** 깜빡임: 꺼질 때 — 딸깍 + 험이 뚝 끊기는 소리 */
  lampOff(v) {
    this.noise(2600, 0.035, 0.14 * v);
    this.tone(120, 70, 0.07, 0.06 * v, 'square');
  },
  /** 깜빡임: 켜질 때 — 스타터 "틱" + 순간적으로 치솟는 지지직 버즈 */
  lampOn(v) {
    this.noise(5200, 0.02, 0.16 * v);
    this.tone(240, 120, 0.1, 0.05 * v, 'sawtooth');
    this.noise(4200, 0.14, 0.06 * v, 0.01);
  },
  setDrone(v) { if (this.ctx) this.droneGain.gain.setTargetAtTime(v * 0.25, this.ctx.currentTime, 0.25); },

  noise(freq, dur, vol, when = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  },
  tone(f1, f2, dur, vol, type = 'sine', when = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },

  step(sprint) { this.noise(sprint ? 520 : 340, 0.07, sprint ? 0.13 : 0.06); },
  heartbeat(v) { this.tone(62, 40, 0.13, v); this.tone(56, 36, 0.13, v * 0.75, 'sine', 0.2); },
  pickup(v = 1) { this.tone(660, 990, 0.25, 0.14 * v, 'triangle'); this.tone(990, 1480, 0.35, 0.08 * v, 'sine', 0.1); },
  unlock() { [220, 277, 330].forEach((f, i) => this.tone(f, f * 0.98, 1.4, 0.07, 'triangle', i * 0.08)); },
  growl() { this.tone(90, 45, 0.9, 0.22, 'sawtooth'); this.noise(180, 0.8, 0.2); },
  click() { this.noise(2500, 0.03, 0.15); },
  scream(v = 1) {
    this.noise(1400, 1.3, 0.55 * v);
    this.tone(340, 70, 1.3, 0.35 * v, 'sawtooth');
    this.tone(523, 90, 1.1, 0.2 * v, 'square');
  },

  // ---------------- 엔티티별 사운드
  cameraFlash(v) { this.noise(5200, 0.06, 0.35 * v); this.tone(2400, 900, 0.12, 0.12 * v, 'square'); this.noise(800, 0.25, 0.08 * v, 0.06); },
  spray(v) { this.noise(6500, 0.7, 0.18 * v); this.noise(3000, 0.5, 0.08 * v, 0.1); },
  flare(v) { this.noise(1800, 0.3, 0.3 * v); for (let i = 0; i < 8; i++) this.noise(2600 + Math.random() * 1500, 0.04, 0.08 * v, 0.2 + i * 0.09); },
  /** 플레이어 감정 표현: 보통 목소리 (스킨 스틸러보다 높고 자연스럽게) */
  speak(text, v) {
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = /[가-힣]/.test(text) ? 'ko-KR' : 'en-US';
      u.pitch = 1; u.rate = 1.05; u.volume = Math.min(1, 0.2 + v * 0.8) * this.volume;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* 음성합성 미지원 */ }
  },
  introSting() { this.tone(55, 50, 2.5, 0.25, 'sawtooth'); this.tone(110, 104, 2.5, 0.08, 'sine'); this.noise(300, 2, 0.05); },
  noclip() { this.tone(200, 1600, 1.2, 0.12, 'sine'); this.noise(4000, 1.5, 0.15); this.tone(80, 40, 1.8, 0.2, 'sawtooth', 0.5); },
  /** 엔딩: 형광등 험이 멎고 잔잔한 화음 → 마지막에 험이 잠깐 돌아온다 */
  ending() {
    if (!this.ctx) return;
    this.humGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4);
    const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [165, 208, 247]];
    chords.forEach((c, k) => c.forEach(f => this.tone(f, f * 0.995, 4.5, 0.05, 'triangle', 1 + k * 3)));
    this.tone(60, 60, 0.6, 0.12, 'sawtooth', 10.5);   // ...형광등 소리? (노란 벽지가 비칠 때)
  },
  // ---- 퍼즐 단말기 ----
  beep(f = 880, v = 1) { this.tone(f, f, 0.08, 0.07 * v, 'square'); },
  puzzleWrong() { this.tone(220, 200, 0.35, 0.12, 'square'); this.tone(180, 170, 0.35, 0.12, 'square', 0.4); },
  puzzleOk() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.14, 0.07, 'square', i * 0.09)); },
  /** 오답 경보: 근처 엔티티가 듣는다 */
  alarm(v = 1) { for (let i = 0; i < 4; i++) { this.tone(880, 660, 0.18, 0.13 * v, 'square', i * 0.4); this.tone(660, 880, 0.18, 0.1 * v, 'square', i * 0.4 + 0.2); } },
  // ---- 정신력 / 사망 ----
  whisper(v) { this.noise(900 + Math.random() * 1200, 0.5 + Math.random() * 0.6, 0.05 * v); if (Math.random() < 0.4) this.giggle(v * 0.4); },
  burst(v = 1) { this.noise(160, 0.5, 0.5 * v); this.noise(900, 0.25, 0.4 * v); this.tone(70, 30, 0.6, 0.35 * v, 'sawtooth'); for (let i = 0; i < 6; i++) this.noise(400 + Math.random() * 600, 0.05, 0.15 * v, 0.15 + i * 0.07); },
  crunch(v = 1, when = 0) { this.noise(260, 0.18, 0.45 * v, when); this.noise(1400, 0.08, 0.25 * v, when + 0.03); },
  slash(v = 1, when = 0) { this.noise(3800, 0.12, 0.3 * v, when); this.tone(900, 300, 0.12, 0.08 * v, 'sawtooth', when); },
  /** 엔티티별 사망 효과음 */
  death(type) {
    if (type === 'sanity') { this.giggle(1); this.tone(200, 2400, 1.2, 0.08, 'sine'); this.burst(1.2); return; }
    this.scream();
    if (type === 'howler' || type === 'scratcher') { for (let i = 0; i < (type === 'scratcher' ? 7 : 3); i++) this.slash(1, 0.6 + i * (type === 'scratcher' ? 0.12 : 0.24)); }
    else if (type === 'hound' || type === 'smiler' || type === 'skinStealer') { this.crunch(1, 0.8); this.crunch(0.8, 1.05); this.crunch(0.6, 1.3); }
    else if (type === 'partygoer') { for (let i = 0; i < 5; i++) this.noise(2200, 0.06, 0.4, 0.7 + i * 0.1); this.giggle(0.8); this.crunch(0.8, 1.2); }
    else if (type === 'deathmoth') { this.noise(220, 1.6, 0.25, 0.6); this.noise(4800, 1.4, 0.08, 0.6); }
    else if (type === 'horde') { for (let i = 0; i < 4; i++) { this.slash(1, 0.4 + i * 0.18); this.crunch(0.9, 0.5 + i * 0.2); } this.howl(0.8); }
    else if (type === 'wretch') { this.tone(80, 40, 1.4, 0.3, 'sawtooth', 0.5); this.crunch(0.8, 1.3); }
  },
  // ---- Level ! 괴물 떼 ----
  hordeRoar(v) { this.tone(140 + Math.random() * 80, 60, 0.9, 0.12 * v, 'sawtooth'); this.noise(500, 0.8, 0.12 * v); if (Math.random() < 0.4) this.howl(v * 0.4); },
  hordeStomp(v) { this.noise(120 + Math.random() * 80, 0.12, 0.25 * v); },
  // ---- 오프닝 ----
  camBeep() { this.tone(1760, 1760, 0.09, 0.06, 'sine'); this.tone(1760, 1760, 0.09, 0.06, 'sine', 0.15); },
  staticBurst(dur = 0.6, v = 1) { this.noise(3000, dur, 0.22 * v); this.noise(700, dur, 0.1 * v); },
  /** 오프닝 대사: 사람마다 목소리 높이가 다르게 */
  say(text, pitch = 1, v = 0.8) {
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR'; u.pitch = pitch; u.rate = 1.1; u.volume = v * this.volume;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* 음성합성 미지원 */ }
  },
  hushVoice() { try { speechSynthesis.cancel(); } catch { /* 없음 */ } },
  drink() { for (let i = 0; i < 3; i++) this.noise(900 + i * 200, 0.08, 0.1, i * 0.12); this.tone(520, 880, 0.3, 0.08, 'sine', 0.35); },
  locker(v) { this.noise(700, 0.12, 0.22 * v); this.tone(190, 110, 0.18, 0.12 * v, 'square'); this.noise(2400, 0.05, 0.08 * v, 0.1); },
  flickerTick(v) { this.noise(3200, 0.05, 0.05 * v); this.tone(120, 60, 0.06, 0.03 * v, 'square'); },
  alert(type) {
    if (type === 'howler') this.howl(1);
    else if (type === 'hound') { this.tone(140, 70, 0.5, 0.22, 'sawtooth'); this.noise(300, 0.5, 0.2); }
    else if (type === 'smiler') this.giggle(1);
    else if (type === 'partygoer') { this.tone(300, 620, 0.35, 0.2, 'square'); this.tone(620, 280, 0.5, 0.12, 'sawtooth', 0.3); this.giggle(0.8); }
    else this.growl();
  },
  howl(v) {
    this.tone(680, 220, 1.4, 0.18 * v, 'sawtooth');
    this.tone(910, 300, 1.2, 0.1 * v, 'square', 0.05);
    this.noise(1800, 1.1, 0.22 * v);
  },
  giggle(v) { for (let i = 0; i < 4; i++) this.tone(900 - i * 60, 700 - i * 60, 0.09, 0.08 * v, 'triangle', i * 0.11); },
  yelp(v) { this.tone(700, 1100, 0.15, 0.15 * v, 'sawtooth'); this.tone(900, 500, 0.3, 0.12 * v, 'sawtooth', 0.15); },
  reveal(v) { this.scream(v * 0.8); this.tone(60, 30, 0.8, 0.3 * v, 'sawtooth'); },
  /** 스킨 스틸러 목소리: 브라우저 음성합성을 낮고 느리게 */
  voice(text, v) {
    this.noise(220, 0.4, 0.05 * v);
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = /[가-힣]/.test(text) ? 'ko-KR' : 'en-US';
      u.pitch = 0.2; u.rate = 0.75; u.volume = Math.min(1, 0.25 + v);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* 음성합성 미지원 */ }
  },
};
