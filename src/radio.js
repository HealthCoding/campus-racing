// 무전 — 경주 중 순위 · 앞뒤 차와의 초 차이를 미리 만든 음성 조각(assets/radio/<음성>/<조각>.mp3)을 이어 붙여 무전처럼 튼다.
// 무전 효과(삑 · 좁은 대역 · 살짝 찌그러뜨림 · 엔진 줄이기)는 듣기 시안 시안/무전_듣기.html 의 값 그대로다(작업자 W12 가 정함).
//   const radio = createRadio({ audio, base: 'assets/radio/', voice: 'yuna' });   // audio = src/audio.js 의 createAudio() — null 이면(소리 끈 실행) 아무것도 안 한다
//   radio.voices                → [{ id: 'off', name: '끔' }, { id: 'yuna', name: '여 1' }, …]  설정 줄에 그대로 쓴다
//   radio.setVoice(id) · radio.voice
//   radio.say(['rank-3', 'ahead-r2', 'gap-12'], { priority: 1, ttl: 3 })    // 말하는 중이면 기다린다(높은 priority 먼저), ttl 초(게임 소리 시간 — 멈춘 동안은 안 센다) 안에 못 틀면 버린다
//   radio.preload() · radio.stop() · radio.busy · radio.queued
// 소리는 audio.output(마스터)으로 간다 — '소리 끔' 이 무전에도 듣고, audio.pause(true)(context suspend)면 같이 멈춘다.
// AudioContext 가 아직 없으면(unlock 전) say 는 조용히 버린다. 못 받은 조각은 건너뛴다(오류를 던지지 않는다).
export const RADIO_FX = { hp: 300, lp: 3200, q: 0.707, presence: { f: 1700, gain: 4, q: 1 }, drive: 2.2, post: 0.31, noise: 0.006, open: { f: 1250, s: 0.07, level: 0.08 }, close: { f: 880, s: 0.09, level: 0.07 }, lead: 0.12, tail: 0.07 };
export const RADIO_DUCK = { level: 0.45, down: 0.04, up: 0.18, hold: 0.25 };   // 엔진을 -7 dB 로: 시간 상수 40 ms 로 내리고, 끝난 0.25초 뒤 180 ms 로 되돌린다
// 듣기 시안에서 무전은 마스터(0.6배)를 거치지 않았다 — 게임에서는 마스터를 거치므로 1/0.6 을 곱해 엔진과의 크기 차를 시안과 같게 맞춘다.
const LEVEL = 1 / 0.6, GAP_BETWEEN = 0.4;   // 무전과 무전 사이(초)
const NAMES = { yuna: '여 1', shelley: '여 2', eddy: '남 1', rocko: '남 2' };
const FALLBACK = ['yuna', 'shelley', 'eddy', 'rocko'];

export function createRadio({ audio = null, base = 'assets/radio/', voice = 'yuna', level = LEVEL } = {}) {
  if (!base.endsWith('/')) base += '/';
  let manifest = null, manifestP = null, current = voice, ctx = null, P = null, playing = null, loadingItem = null, lastEnd = 0, gen = 0;
  const queue = [], decoded = {}, loading = {}, voiceList = () => (manifest ? manifest.voices.map(v => v.id) : FALLBACK);
  const live = () => { const c = audio && audio.context; return c && audio.output ? c : null; };
  function getManifest() {
    if (manifest) return Promise.resolve(manifest);
    return manifestP ||= fetch(base + 'manifest.json').then(r => r.ok ? r.json() : null).then(m => (manifest = m)).catch(() => null).finally(() => { if (!manifest) manifestP = null; });
  }
  // 무전 소리판: 목소리 → 300 Hz 아래 · 3200 Hz 위를 두 번씩 깎음 → 1.7 kHz +4 dB → 2.2배 → tanh(1.6x) → 0.31배 → (1/0.6) → audio.output
  function board(c) {
    if (P && P.ctx === c) return P;
    const g = v => { const n = c.createGain(); n.gain.value = v; return n; }, biq = (type, f, q = RADIO_FX.q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const voiceIn = g(1), hp1 = biq('highpass', RADIO_FX.hp), hp2 = biq('highpass', RADIO_FX.hp), lp1 = biq('lowpass', RADIO_FX.lp), lp2 = biq('lowpass', RADIO_FX.lp), pres = biq('peaking', RADIO_FX.presence.f, RADIO_FX.presence.q);
    const drive = g(RADIO_FX.drive), shape = c.createWaveShaper(), post = g(RADIO_FX.post), bus = g(level);
    pres.gain.value = RADIO_FX.presence.gain;
    const n = 2048, curve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); } shape.curve = curve; shape.oversample = '2x';
    voiceIn.connect(hp1).connect(hp2).connect(lp1).connect(lp2).connect(pres).connect(drive).connect(shape).connect(post).connect(bus).connect(audio.output);
    // 아주 작은 잡음(무전이 열려 있는 동안만): 흰 잡음 → 같은 거르개 길로
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0); let s = 7; for (let i = 0; i < nd.length; i++) { s = (s * 16807) % 2147483647; nd[i] = s / 1073741823.5 - 1; }
    const noise = c.createBufferSource(), noiseG = g(0); noise.buffer = nb; noise.loop = true; noise.connect(noiseG).connect(hp1); noise.start();
    return (P = { ctx: c, voiceIn, noiseG, bus });
  }
  // mp3 앞뒤의 빈 표본(부호기 지연)을 잘라 낸다: 가장 센 곳보다 40 dB 아래를 빈 것으로, 앞에 5 ms · 뒤에 20 ms 남김(듣기 시안과 같게)
  function tidy(c, buf) {
    const d = buf.getChannelData(0); let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
    const thr = peak * 0.01; let a = 0, b = d.length - 1; while (a < b && Math.abs(d[a]) < thr) a++; while (b > a && Math.abs(d[b]) < thr) b--;
    a = Math.max(0, a - Math.round(0.005 * buf.sampleRate)); b = Math.min(d.length, b + Math.round(0.02 * buf.sampleRate));
    if (b <= a) return buf;
    const out = c.createBuffer(1, b - a, buf.sampleRate); out.getChannelData(0).set(d.subarray(a, b)); return out;
  }
  const decode = (c, ab) => new Promise((resolve, reject) => { const p = c.decodeAudioData(ab, resolve, reject); if (p && p.then) p.then(resolve, reject); });
  function clip(c, v, id) {   // → AudioBuffer | null (못 받으면 null — 다음에 다시 시도한다)
    const key = v + '/' + id; if (decoded[key]) return Promise.resolve(decoded[key]);
    return loading[key] ||= fetch(`${base}${v}/${id}.mp3`).then(r => r.ok ? r.arrayBuffer() : null).then(ab => ab && decode(c, ab)).then(b => (b ? (decoded[key] = tidy(c, b)) : null))
      .catch(() => null).finally(() => { delete loading[key]; });
  }
  function gapAfter(v, id) {   // 조각 사이 쉼: 그 음성이 문장 안에서 스스로 쉬는 길이(잰 값)를 범위 안으로
    const info = manifest?.voices.find(x => x.id === v), end = manifest?.clips[id]?.end ?? (/^(ahead|behind)-/.test(id) ? ',' : '.');
    const pauses = info?.pauses || { comma: 0.12, period: 0.25 };
    return end === ',' ? Math.min(0.2, Math.max(0.08, pauses.comma)) : Math.min(0.32, Math.max(0.18, pauses.period));
  }
  function beep(c, t, { f, s, level: lv }) {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv, t + 0.004); g.gain.setValueAtTime(lv, t + s - 0.012); g.gain.linearRampToValueAtTime(0, t + s);
    o.connect(g).connect(P.voiceIn); o.start(t); o.stop(t + s + 0.02); return o;
  }
  function pick(now) {   // 묵은 것을 버리고, priority 가 높은 것(같으면 먼저 온 것)을 꺼낸다
    for (let i = queue.length - 1; i >= 0; i--) if (now - queue[i].born > queue[i].ttl) queue.splice(i, 1);
    if (!queue.length) return null;
    let best = 0; for (let i = 1; i < queue.length; i++) if (queue[i].priority > queue[best].priority) best = i;
    return queue.splice(best, 1)[0];
  }
  async function pump() {
    if (playing || loadingItem) return;
    const c = live(); if (!c || current === 'off') { queue.length = 0; return; }
    const item = pick(c.currentTime); if (!item) return;
    const my = gen, v = current; loadingItem = item;
    await getManifest();
    const bufs = await Promise.all(item.clips.map(id => clip(c, v, id)));
    loadingItem = null;
    if (my !== gen || v !== current || live() !== c) { pump(); return; }
    if (c.currentTime - item.born > item.ttl) { pump(); return; }   // 받는 사이에 묵었다
    const parts = item.clips.map((id, i) => [id, bufs[i]]).filter(p => p[1]);
    if (!parts.length) { pump(); return; }
    play(c, v, parts);
  }
  function play(c, v, parts) {
    board(c);
    let t = Math.max(c.currentTime + 0.05, lastEnd + GAP_BETWEEN); const open = t, nodes = [];
    nodes.push(beep(c, t, RADIO_FX.open)); t += RADIO_FX.lead;
    audio.duck?.(RADIO_DUCK.level, RADIO_DUCK.down, t - 0.03);
    P.noiseG.gain.setTargetAtTime(RADIO_FX.noise, open, 0.01);
    parts.forEach(([id, b], i) => { const src = c.createBufferSource(); src.buffer = b; src.connect(P.voiceIn); src.start(t); nodes.push(src); t += b.duration + (i < parts.length - 1 ? gapAfter(v, id) : 0); });
    t += RADIO_FX.tail; const last = beep(c, t, RADIO_FX.close); nodes.push(last);
    P.noiseG.gain.setTargetAtTime(0, t + RADIO_FX.close.s, 0.01); t += RADIO_FX.close.s;
    audio.duck?.(1, RADIO_DUCK.up, t + RADIO_DUCK.hold);
    const me = { nodes, end: t, clips: parts.map(p => p[0]) }; playing = me; lastEnd = t;
    last.onended = () => { if (playing !== me) return; playing = null; pump(); };   // 소리 시간으로 끝난다(멈춘 동안은 안 끝난다)
  }
  function stop() {
    gen++; queue.length = 0; loadingItem = null;
    const p = playing; playing = null; lastEnd = 0;
    if (p) for (const n of p.nodes) { try { n.onended = null; n.stop(); } catch {} }
    const c = live(); if (c && P && P.ctx === c) { P.noiseG.gain.cancelScheduledValues(c.currentTime); P.noiseG.gain.setTargetAtTime(0, c.currentTime, 0.01); }
    if (c) audio.duck?.(1, RADIO_DUCK.up, c.currentTime);
  }
  return {
    get voices() { return [{ id: 'off', name: '끔' }, ...voiceList().map(id => ({ id, name: NAMES[id] || id }))]; },
    get voice() { return current; },
    get busy() { return !!(playing || loadingItem); },
    get queued() { return queue.length; },
    get bus() { return P?.bus || null; },   // 재기용(점검이 AnalyserNode 를 붙인다)
    get playing() { return playing ? playing.clips.slice() : null; },
    setVoice(id) { const next = id === 'off' || voiceList().includes(id) ? id : current; if (next === current) return; stop(); current = next; },
    say(clips, { priority = 1, ttl = 3 } = {}) {
      const c = live(); if (!c || current === 'off' || !Array.isArray(clips) || !clips.length) return false;
      queue.push({ clips: clips.filter(x => typeof x === 'string'), priority: +priority || 0, ttl: Math.max(0, +ttl || 0), born: c.currentTime }); pump(); return true;
    },
    async preload() {   // 고른 음성의 조각을 다 받아 풀어 둔다 — unlock() 뒤(출발을 누른 뒤)에 부른다. → 받은 수
      const c = live(); if (!c || current === 'off') return 0; const v = current, m = await getManifest(); if (!m) return 0;
      const got = await Promise.all(Object.keys(m.clips).map(id => clip(c, v, id))); return got.filter(Boolean).length;
    },
    stop,
  };
}
