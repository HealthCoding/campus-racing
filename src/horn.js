// 경적 — 파일 없이 Web Audio 로 합성한다(src/audio.js 와 같은 방식). X 키를 누르는 동안 지금 차의 경적이 울린다(audio.horn(on)).
// 2026-11-25 사용자가 듣기 시안(시안/경적_듣기.html, 원본 시안/경적_src/horn.js)에서 고른 것을 옮겼다 — 고른 일곱 가지만 남기고 시안 전용 목록(후보 · 추천 이유)은 뺐다.
//   const horn = createHorn(ctx, dest)          dest: createAudio() 의 output(마스터 — '소리 끔' · 무전 줄임(duck)이 듣는 곳. 경적은 duck 이 줄이는 bed 가 아니라 out 에 바로 간다)
//   horn.play(id, count = 1, at) → 끝나는 시각    한 번 '빵'(count 1) · 두 번 '빵빵'(count 2)
//   const h = horn.press(id, at); h.release(at)  누르는 동안 울린다. 독수리 울음 · 한 번 치는 벨('땡')은 누를 때 한 번 울고 끝난다
//   HORNS(경적마다의 값) · CAR_HORN(차 → 경적) · hornOf(차 id)
// 크기(level)는 시안에서 엔진 위 +1 ~ +7 dB, 터짐 없게 잰 값 그대로다.
// '기계 합성음 같다'(사용자 — 예전 엔진 소리)를 피하려고 넣은 것:
//   두 음 화음(진짜 승용차 경적은 낮은 · 높은 원판 경적 둘) · 음마다 따로 떠도는 높이 · 누를 때 낮게 시작해 올라붙는 높이(떨판이 자리 잡는 동안) · 뗄 때 처지는 높이
//   접점의 지글거림(띠 잡음) · 배음이 많은 파형을 찌그러뜨린 뒤 울림 거르개(경적 몸통 · 나팔) · 짧은 바깥 되울림(벽 · 길에 튀는 소리) · 벨은 배음이 어긋난 맑은 울림 + 둘로 갈라진 모드의 맥놀이
// 난수는 제 것(seed)만 쓴다 — 게임 소리(Math.random)의 차례를 흐트러뜨리지 않는다.
const TAU = Math.PI * 2;
function random(seed) { let s = seed | 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

// ── 경적마다의 값 ──
// kind 'tone'(원판 · 나팔 · 공기 · 고무 나팔): tones [[Hz, 세기]] · wave [배음이 줄어드는 빠르기, 짝수 배음을 덜어 내는 몫] · drive(찌그러뜨림)
//   pitch [[누른 뒤 초, 높이 배율]] 누를 때의 높이 흐름 · drop(뗄 때 처지는 배율) · vib [Hz, 깊이] · drift(높이가 떠도는 몫) · flutter(세기가 떨리는 몫)
//   body [[Hz, Q, 세기]] 울림 거르개 · dry [저역 통과 Hz, 세기] · hp · attack · release(초) · buzz(접점 지글거림) · breath [Hz, Q, 세기](공기 새는 소리)
//   room(되울림 몫) · level · taps [[한 번의 [시작, 길이]], [두 번의 …]]
// kind 'bell': domes [[Hz, 세기]](종 둘 — 따르릉은 번갈아 친다) · modes [[배율, 세기, 줄어드는 시간 상수]] · split(갈라진 모드의 어긋남) · rate(초당 치는 수, 0 = 한 번) · click
// kind 'call'(독수리): segs [{ at, f: [[초, Hz]], a: [[초, 세기]] }] · rasp [세기 떨림, 높이 떨림 몫] · breath
const TONE = { wave: [0.6, 0.3], drive: 2.4, pitch: [[0, 0.93], [0.03, 1]], drop: 0.96, vib: null, drift: 0.004, flutter: 0.06, body: [], dry: [5000, 0.35], hp: 250,
  attack: 0.012, release: 0.05, buzz: 0.05, breath: null, room: 0.15, level: 0.4 };
const TAPS = [[[0, 0.34]], [[0, 0.14], [0.23, 0.24]]];   // 한 번: 0.34초 · 두 번: 짧게 한 번 쉬고 조금 길게(사람이 '빵빵' 누르는 꼴)
export const HORNS = {
  // ── 승용차 ──
  car_dual: { name: '두 음 원판', sub: '낮은 · 높은 원판 경적 둘이 같이 운다 — 흔한 승용차', kind: 'tone', tones: [[410, 1], [505, 0.82]], wave: [0.55, 0.35], drive: 2.6,
    body: [[2400, 2.5, 1], [3600, 3.5, 0.55], [1150, 1.4, 0.5]], hp: 300, level: 0.33 },
  // ── 큰 차 ──
  big_bus: { name: '낮은 두 음', sub: '버스의 큰 원판 경적 — 한참 낮다', kind: 'tone', tones: [[300, 1], [357, 0.85]], wave: [0.5, 0.3], drive: 2.3,
    body: [[1700, 2.2, 1], [2600, 3, 0.5], [800, 1.3, 0.6]], hp: 160, attack: 0.016, release: 0.06, level: 0.305, taps: [[[0, 0.4]], [[0, 0.16], [0.26, 0.28]]] },
  // ── 작은 차 ──
  small_twin: { name: '작은 두 음', sub: '작은 원판 둘 — 높고 가벼운 \'빽빽\'', kind: 'tone', tones: [[720, 1], [860, 0.75]], wave: [0.7, 0.45], drive: 2.8,
    pitch: [[0, 0.92], [0.02, 1]], body: [[2300, 3.5, 1], [3700, 4.5, 0.4]], dry: [4000, 0.3], hp: 500, attack: 0.008, release: 0.035, room: 0.1, level: 0.45, taps: [[[0, 0.26]], [[0, 0.11], [0.19, 0.16]]] },
  // ── 자전거 ──
  bell_ding: { name: '땡', sub: '종을 한 번 \'땡\' — 맑고 길게 남는다', kind: 'bell', domes: [[1850, 1]],
    modes: [[1, 1, 0.7], [2.31, 0.5, 0.38], [3.6, 0.35, 0.22], [4.9, 0.2, 0.12], [6.4, 0.12, 0.07]], split: 0.0022, rate: 0, click: 0.07, hp: 700, room: 0.16, level: 0.123 },
  // ── 오토바이 ──
  moto_twin: { name: '높은 두 음', sub: '두 음 원판을 높게 — 스포츠 오토바이', kind: 'tone', tones: [[560, 1], [665, 0.8]], wave: [0.6, 0.4], drive: 2.7,
    pitch: [[0, 0.92], [0.02, 1]], body: [[2900, 3, 1], [4100, 4, 0.45], [1600, 2, 0.35]], dry: [6000, 0.3], hp: 450, attack: 0.012, release: 0.035, level: 0.375, taps: [[[0, 0.28]], [[0, 0.12], [0.2, 0.2]]] },
  // ── 레이싱 카트 · 포뮬러 ──
  race_beep: { name: '작은 \'빽\'', sub: '경주차에 단 조그만 경적 — 짧고 날카롭게', kind: 'tone', tones: [[590, 1]], wave: [0.55, 0.45], drive: 3.2,
    pitch: [[0, 0.9], [0.018, 1]], body: [[2600, 3, 1], [4200, 4, 0.4]], dry: [5000, 0.25], hp: 500, attack: 0.01, release: 0.03, level: 0.466, taps: [[[0, 0.22]], [[0, 0.1], [0.17, 0.16]]] },
  // ── 독수리상 ──
  eagle_scream: { name: '독수리 울음', sub: '\'끼이야아\' — 높이 솟았다 쉰 목소리로 떨어진다', kind: 'call', wave: [1.3, 0.3], drive: 1.8, rasp: [0.6, 0.012],
    segs: [{ at: 0, f: [[0, 2100], [0.06, 3000], [0.2, 2750], [0.55, 2250], [0.9, 1650]], a: [[0, 0], [0.03, 1], [0.45, 0.85], [0.75, 0.5], [0.9, 0]] }],
    body: [[2600, 1.2, 1], [5200, 2, 0.35]], dry: [6000, 0.3], hp: 900, breath: [3200, 1.2, 0.18], room: 0.28, level: 0.255 },
};
for (const [id, h] of Object.entries(HORNS)) {
  HORNS[id] = h.kind === 'tone' ? { ...TONE, ...h, id } : { ...h, id };
  if (h.kind === 'call') HORNS[id].span = Math.max(...h.segs.map(s => s.at + s.f[s.f.length - 1][0]));
}

// 차 → 경적(2026-11-25 사용자가 고름). 차를 모르면 승용차의 두 음 원판.
export const CAR_HORN = {
  gt: 'car_dual', supercar_real: 'car_dual', sedan: 'car_dual', taxi_real: 'car_dual',              // 승용차: 두 음 원판
  minibus_real: 'big_bus', truck_real: 'big_bus', garbagetruck_real: 'big_bus',                     // 큰 차: 낮은 두 음
  golfcart_real: 'small_twin', shoppingcart_real: 'small_twin', forklift_real: 'small_twin',        // 작은 차: 작은 두 음
  bicycle_real: 'bell_ding',                                                                         // 자전거: 땡
  racebike_real: 'moto_twin',                                                                        // 오토바이: 높은 두 음
  racekart: 'race_beep', formula_real: 'race_beep',                                                  // 레이싱 카트 · 포뮬러: 작은 '빽'
  eagle_statue: 'eagle_scream',                                                                      // 독수리상: 독수리 울음
};
export const hornOf = carId => CAR_HORN[carId] || 'car_dual';

// ── 판마다 한 번 만드는 것: 잡음 · 떠도는 값 · 되울림 · 파형 ──
const banks = new WeakMap();
function smooth(sr, seconds, fc, seed) {   // fc 아래로 거른 잡음(되풀이 이음매를 겹쳐 잇고, 최댓값 1)
  const rnd = random(seed), N = Math.round(seconds * sr), F = Math.round(0.1 * sr), raw = new Float32Array(N + F), a = Math.exp(-TAU * fc / sr);
  let y1 = 0, y2 = 0; for (let i = -2000; i < N + F; i++) { y1 = a * y1 + (1 - a) * (rnd() * 2 - 1); y2 = a * y2 + (1 - a) * y1; if (i >= 0) raw[i] = y2; }
  const out = raw.slice(0, N); for (let i = 0; i < F; i++) { const w = i / F; out[i] = raw[i] * Math.sqrt(w) + raw[N + i] * Math.sqrt(1 - w); }
  let m = 0; for (const v of out) m += v; m /= N; let p = 0; for (let i = 0; i < N; i++) { out[i] -= m; p = Math.max(p, Math.abs(out[i])); } for (let i = 0; i < N; i++) out[i] /= p || 1; return out;
}
function bank(ctx) {
  let b = banks.get(ctx); if (b) return b;
  const sr = ctx.sampleRate, mono = data => { const x = ctx.createBuffer(1, data.length, sr); x.getChannelData(0).set(data); return x; };
  const rnd = random(7), noise = new Float32Array(sr * 2); for (let i = 0; i < noise.length; i++) noise[i] = rnd() * 2 - 1;
  // 되울림: 짧은 이른 반사 일곱(왼쪽 · 오른쪽이 조금 다르게) + 0.14초로 잦아드는 꼬리. 에너지를 1 로 맞춘다
  const N = Math.round(0.7 * sr), room = ctx.createBuffer(2, N, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = room.getChannelData(ch), r = random(21 + ch), stretch = ch ? 1.06 : 0.95;
    for (const [t, a] of [[0.011, 0.5], [0.019, 0.42], [0.029, 0.35], [0.043, 0.3], [0.061, 0.24], [0.083, 0.17], [0.112, 0.12]]) { const i = Math.round(t * stretch * sr); d[i] += a; d[i + 1] += a * 0.6; d[i + 2] += a * 0.25; }
    let lp = 0; const k = Math.exp(-TAU * 4000 / sr);
    for (let i = Math.round(0.008 * sr); i < N; i++) { const t = i / sr; lp = k * lp + (1 - k) * (r() * 2 - 1); d[i] += 0.9 * lp * Math.exp(-t / 0.14) * Math.min(1, (t - 0.008) / 0.012) * (1 - i / N); }
    let s = 0; for (const v of d) s += v * v; const g = 1 / Math.sqrt(s || 1); for (let i = 0; i < N; i++) d[i] *= g;
  }
  b = { noise: mono(noise), wobble: mono(smooth(sr, 4, 6, 11)), rasp: mono(smooth(sr, 2, 160, 12)), room, waves: new Map(), curves: new Map() };
  banks.set(ctx, b); return b;
}
// 배음이 많은 파형: k 번째 배음의 세기 k^-bright, 짝수 배음은 (1 − odd) 배. 위상은 흩어 둔다(꼭대기가 뾰족하지 않게)
function wave(ctx, B, [bright, odd]) {
  const key = bright + '|' + odd; if (B.waves.has(key)) return B.waves.get(key);
  const n = 48, re = new Float32Array(n + 1), im = new Float32Array(n + 1), r = random(5);
  for (let k = 1; k <= n; k++) { const a = Math.pow(k, -bright) * (k % 2 ? 1 : 1 - odd), ph = r() * TAU; re[k] = a * Math.cos(ph); im[k] = a * Math.sin(ph); }
  const w = ctx.createPeriodicWave(re, im); B.waves.set(key, w); return w;
}
function curve(B, drive) {
  if (B.curves.has(drive)) return B.curves.get(drive);
  const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
  B.curves.set(drive, c); return c;
}
const holdAt = (p, t) => { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); };

export function createHorn(ctx, dest, { seed = 1 } = {}) {
  const B = bank(ctx), rnd = random(seed), bus = ctx.createGain(), wet = ctx.createConvolver();
  wet.normalize = false; wet.buffer = B.room; bus.connect(dest); wet.connect(bus);
  const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const biq = (type, f, q) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = Math.min(f, ctx.sampleRate * 0.45); x.Q.value = q; return x; };
  const loopSrc = (buffer, t) => { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.start(t, rnd() * buffer.duration * 0.9); return s; };
  // 찌그러뜨림 → [저역 통과 + 울림 거르개들] → 낮은 소리 덜기 → 세기 떨림 → 크기(level) → 버스 + 되울림
  function chain(S, t0) {
    const mix = ctx.createGain(), shaper = ctx.createWaveShaper(), sum = ctx.createGain(), am = gain(1), env = gain(0), srcs = [];
    shaper.curve = curve(B, S.drive); shaper.oversample = '2x'; mix.connect(shaper);
    shaper.connect(biq('lowpass', S.dry[0], 0.7)).connect(gain(S.dry[1])).connect(sum);
    for (const [f, q, g] of S.body) shaper.connect(biq('bandpass', f, q)).connect(gain(g)).connect(sum);
    // 떨판 · 나팔은 8 kHz 위를 거의 안 낸다 — 찌그러뜨림의 '지지직'을 덜어 낸다(top)
    sum.connect(biq('highpass', S.hp, 0.7)).connect(biq('lowpass', S.top ?? 7500, 0.6)).connect(am).connect(env);
    env.connect(bus); env.connect(gain(S.room)).connect(wet);
    if (S.flutter || S.rasp) { const depth = S.rasp ? S.rasp[0] : S.flutter; am.gain.value = 1 - depth / 2; const s = loopSrc(B.rasp, t0); s.connect(gain(depth / 2)).connect(am.gain); srcs.push(s); }
    return { mix, sum, env, srcs };
  }
  function tone(S, t0) {
    const { mix, sum, env, srcs } = chain(S, t0), oscs = [];
    mix.gain.setValueAtTime(0.55, t0); mix.gain.linearRampToValueAtTime(1, t0 + S.attack * 2.5);   // 차오르는 동안은 덜 찌그러졌다가 다 차면 거칠어진다
    env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(S.level, t0 + S.attack);
    for (const [f, a] of S.tones) {
      const o = ctx.createOscillator(), k0 = f * (1 + (rnd() * 2 - 1) * 0.002), fq = o.frequency;   // 누를 때마다 높이가 아주 조금 다르다
      o.setPeriodicWave(wave(ctx, B, S.wave)); fq.setValueAtTime(k0 * S.pitch[0][1], t0);
      for (const [dt, r] of S.pitch.slice(1)) fq.exponentialRampToValueAtTime(k0 * r, t0 + dt);
      if (S.drift) { const s = loopSrc(B.wobble, t0); s.connect(gain(k0 * S.drift)).connect(fq); srcs.push(s); }
      if (S.vib) { const l = ctx.createOscillator(); l.frequency.value = S.vib[0] * (0.9 + 0.2 * rnd()); l.connect(gain(k0 * S.vib[1])).connect(fq); l.start(t0); srcs.push(l); }
      o.connect(gain(a)).connect(mix); o.start(t0); srcs.push(o); oscs.push([o, k0]);
    }
    if (S.buzz) { const s = loopSrc(B.noise, t0); s.connect(biq('bandpass', 3800, 0.9)).connect(gain(S.buzz)).connect(mix); srcs.push(s); }
    if (S.breath) { const [f, q, l] = S.breath, s = loopSrc(B.noise, t0), g = gain(0); s.connect(biq('bandpass', f, q)).connect(g).connect(sum); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(l, t0 + S.attack); g.gain.setTargetAtTime(l * 0.4, t0 + S.attack, 0.06); srcs.push(s); }
    return { min: Math.max(0.06, S.attack * 1.5), release(t) {
      holdAt(env.gain, t); env.gain.setTargetAtTime(0, t, S.release / 4);
      for (const [o, k0] of oscs) { holdAt(o.frequency, t); o.frequency.setTargetAtTime(k0 * S.drop, t, S.release / 2); }
      const end = t + S.release * 2.2 + 0.05; for (const s of srcs) s.stop(end); return end + 0.7;   // + 되울림 꼬리
    } };
  }
  function bell(S, t0, len) {
    const out = gain(S.level), hp = biq('highpass', S.hp, 0.7), modes = [], clicks = [];
    hp.connect(out); out.connect(bus); out.connect(gain(S.room)).connect(wet);
    S.domes.forEach(([f0, da], dome) => { for (const [r, a, d] of S.modes) for (const side of [-1, 1]) {
      const o = ctx.createOscillator(), g = gain(0); o.frequency.value = f0 * r * (1 + side * S.split); o.connect(g).connect(hp); o.start(t0);
      modes.push({ o, g, a: a * da * (side > 0 ? 0.7 : 1), d, dome });
    } });
    const strike = (t, dome, k) => {
      for (const m of modes) if (m.dome === dome) { m.g.gain.setTargetAtTime(k * m.a, t, 0.0012); m.g.gain.setTargetAtTime(0, t + 0.003, m.d); }
      const s = ctx.createBufferSource(), g = gain(0); s.buffer = B.noise; s.connect(biq('highpass', 4500, 0.7)).connect(g).connect(out);
      g.gain.setValueAtTime(S.click * k, t); g.gain.setTargetAtTime(0, t, 0.0012); s.start(t, rnd() * 1.5, 0.012); clicks.push([s, t]);
    };
    let last = t0;
    if (!S.rate) strike(t0, 0, 1);
    else for (let t = t0, i = 0; t < t0 + Math.min(len ?? 4, 4); i++, t += (1 + (rnd() * 2 - 1) * 0.08) / S.rate) { strike(t, i % S.domes.length, 0.7 + 0.3 * rnd()); last = t; }
    const ring = Math.max(...S.modes.map(m => m[2])) * 6;
    return { min: 0.05, release(t) {
      if (S.rate) { for (const m of modes) { holdAt(m.g.gain, t); m.g.gain.setTargetAtTime(0, t, m.d); } for (const [s, at] of clicks) if (at > t) s.stop(at); }   // 뗀 뒤로 잡혀 있던 치기는 길이 0 으로(시작 = 멈춤)
      const end = (S.rate ? Math.min(t, last + 0.01) : Math.max(t, t0)) + ring; for (const m of modes) m.o.stop(end); return end + 0.7;
    } };
  }
  function call(S, t0) {
    const { mix, sum, env, srcs } = chain(S, t0); env.gain.value = S.level;
    for (const seg of S.segs) {
      const o = ctx.createOscillator(), g = gain(0), t1 = t0 + seg.at, fq = o.frequency, mid = seg.f.reduce((s, p) => s + p[1], 0) / seg.f.length;
      o.setPeriodicWave(wave(ctx, B, S.wave)); fq.setValueAtTime(seg.f[0][1], t1); for (const [dt, f] of seg.f.slice(1)) fq.exponentialRampToValueAtTime(f, t1 + dt);
      g.gain.setValueAtTime(0, t1); for (const [dt, a] of seg.a.slice(1)) g.gain.linearRampToValueAtTime(a, t1 + dt);
      const s = loopSrc(B.rasp, t1); s.connect(gain(mid * S.rasp[1])).connect(fq); srcs.push(s);   // 쉰 목소리: 높이도 빠르게 떤다
      o.connect(g).connect(mix); o.start(t1); srcs.push(o);
      if (S.breath) { const [f, q, l] = S.breath, n = loopSrc(B.noise, t1), ng = gain(0); n.connect(biq('bandpass', f, q)).connect(ng).connect(sum); ng.gain.setValueAtTime(0, t1); for (const [dt, a] of seg.a.slice(1)) ng.gain.linearRampToValueAtTime(a * l, t1 + dt); srcs.push(n); }
    }
    const end = t0 + S.span + 0.05; for (const s of srcs) s.stop(end);
    return { min: 0, release: () => end + 0.7 };
  }
  const voice = (S, t, len) => S.kind === 'bell' ? bell(S, t, len) : S.kind === 'call' ? call(S, t) : tone(S, t);
  const now = () => ctx.currentTime + 0.01;
  return {
    bus,
    play(id, count = 1, at = now()) {
      const S = HORNS[id] || HORNS.car_dual; let end = at;
      if (S.kind === 'call' || (S.kind === 'bell' && !S.rate)) { const gap = S.kind === 'call' ? S.span + 0.12 : 0.24; for (let i = 0; i < count; i++) end = Math.max(end, voice(S, at + i * gap).release(at + i * gap)); return end; }
      for (const [dt, len] of (S.taps || TAPS)[Math.min(count, 2) - 1]) end = Math.max(end, voice(S, at + dt, len).release(at + dt + len));
      return end;
    },
    press(id, at = now()) {
      const S = HORNS[id] || HORNS.car_dual, v = voice(S, at); let done = null;
      return { release: (t = ctx.currentTime) => done ?? (done = v.release(Math.max(t, at + v.min))) };
    },
  };
}
