// 배경음악 — 음표 자료를 합성 악기로 Web Audio 에 직접 연주한다(음원 · 샘플 · 루프 파일 없음).
// 2026-11-24 사용자가 고른 곡: E '네온 질주'(src/music/neon.js) — "배경음악이 허전한 느낌" → 1차 셋 → "신나는 거" → 2차 셋 → "E 네온 질주". 경위는 docs/구조와_계약.md '배경음악'.
//   게임은 기본으로 이 곡을 튼다(main.js 의 한 줄 → followGame). 끄는 길: 주소 ?music=off · ?sound=0 · 자동 운전(소리가 없다) · 소리 끔(M · 설정의 '소리').
//   후보를 고르던 시안(듣기 화면 · 다른 곡 · 재는 글)은 다른 사본에 남아 있다 — 이 파일은 그때의 연주기 그대로다(악기 · 값이 같다).
//
//   createMusic({ context, output, tracks, timer, quiet, lite }) → { play(id, { fade, section, bar }), stop({ fade }), section(name), setVolume(v), duck(level, tc), pause(on), pump(until), state, dispose() }
//     context · output: 게임 소리(createAudio)의 것 — output 은 마스터라 '소리 끔' · 멈춤(context 를 세움)이 음악에도 같이 듣는다.
//     section: 'lobby'(시작 화면 — 느리고 거른 판) · 'race'(경주 — 처음부터) · 'final'(마지막 바퀴 — 다음 마디부터 조를 올리고 빠르게 · 촘촘하게) · 'result'(결과 — 다음 마디부터 짧은 맺음 뒤 끝)
//     quiet(): 참이면 음을 만들지 않고 박자만 센다(소리를 끈 동안 값을 안 쓰게)
//     lite: 터치 기기용 가벼운 판(LITE — 잔향 끔 · 동시 음 상한 24). 무엇을 왜 줄였는지는 LITE 의 주석.
//     setVolume(v): 음악 크기(1 = 기본). 설정에 '음악' 줄을 넣게 되면 여기에 잇는다(지금은 줄이 없다 — 사용자가 정할 일).
//   박자 예약: 25 ms 마다 앞으로 0.15초 안에 올 음을 미리 예약한다 — 화면이 버벅여도 박자가 흔들리지 않는다.
//     0.05초 넘게 늦은 칸은 버린다(탭이 가려졌다 돌아오거나 화면이 오래 멈춘 뒤에 밀린 음을 한꺼번에 쏟지 않는다). pause(true) 는 자리를 간직하고, pause(false) 는 그 자리에서 이어 간다.
//   값: 동시에 울리는 음(목소리) 수에 상한(MUSIC.maxVoices — 넘으면 여린 음부터 버림). 음마다 만든 마디는 그 음이 끝나면(onended) 끊는다. 공용 마디(버스 · 잔향 · 메아리)는 곡마다 한 벌.
//   소리 길: 악기 버스 → 섞기 → 구간 거르개(시작 화면은 어둡게) → 음악 크기 → 줄이기(duck) → 멈춤(hold) → output
import NEON from './music/neon.js';
export const MUSIC = { level: 0.19, lookahead: 0.15, every: 25, late: 0.05, maxVoices: 40 };
// 터치 기기용 가벼운 판(2026-11-24 재 봄 — 검증/music-cost.mjs): 잔향(직접 만든 충격 응답을 굴리는 컨볼버 — 곡 내내 도는 가장 큰 공용 값)을 끈다 → 소리 스레드 −14%, 크기는 그대로(RMS 차 0.0 dB).
//   공간감은 메아리(점8분 딜레이)가 남아 맡는다. 동시 음 상한 24 는 안전판이다(E 는 PC 에서 많아야 24 — 넘을 때만 여린 음부터 버린다).
//   재 보고 뺀 것: 넓은 톱니 리드를 셋 → 둘(−1% 인데 음악이 0.6 dB 작아져 귀에 띌 수 있다) · 잔향을 0.4초로 짧게(−4.5% 뿐). supersaw · room 으로 다시 켤 수 있다.
export const LITE = { reverb: false, maxVoices: 24 };
export const TRACKS = { neon: NEON };
export const STEPS = 16;   // 한 마디 = 16분음표 16칸(4/4)

// ── 음 이름 · 화음 · 음계 ──
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function pcOf(name) { const m = /^([A-G])([#b]?)$/.exec(name); if (!m) throw new Error('모르는 음 이름: ' + name); return (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12; }
export function midiOf(name) { const m = /^([A-G][#b]?)(-?\d)$/.exec(name); if (!m) throw new Error('모르는 음: ' + name); const b = PC[m[1][0]] + (m[1][1] === '#' ? 1 : m[1][1] === 'b' ? -1 : 0); return 12 * (+m[2] + 1) + b; }
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7, 12], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7], '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], dim: [0, 3, 6] };
export function chordOf(sym) { const m = /^([A-G][#b]?)(.*)$/.exec(sym); if (!m || !(m[2] in QUAL)) throw new Error('모르는 화음: ' + sym); return { sym, root: pcOf(m[1]), iv: QUAL[m[2]], power: m[2] === '5' }; }
export const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
export const scaleOf = track => SCALES[track.mode].map(i => (pcOf(track.key) + i) % 12);
export const chordPcs = c => c.iv.map(i => (c.root + i) % 12);

// ── 자료 읽기 ──
// 가락 줄: 'A5/2 F#5/2! r/4 _/2 |' — / 뒤는 16분음표 칸 수. ! 세게 · . 여리게 · r 쉼 · _ 앞 음을 늘임 · | 마디 줄(마디 끝에 있는지 확인)
// 베이스 줄은 음 자리에 화음 기준 자리를 쓴다: R(바탕음) 3 5 7 8(한 옥타브 위) L5(아래 5도) — 또는 음 이름
export function parseLine(text, what = '줄') {
  const notes = []; let pos = 0;
  for (const tk of text.split(/\s+/).filter(Boolean)) {
    if (tk === '|') { if (pos % STEPS) throw new Error(`${what}: 마디 줄이 마디 끝에 있지 않음(${pos}칸) — ${text}`); continue; }
    const m = /^([^/]+)\/(\d+)([!.]?)$/.exec(tk); if (!m || +m[2] < 1) throw new Error(`${what}: 읽을 수 없는 음 '${tk}'`);
    const len = +m[2], vel = m[3] === '!' ? 1 : m[3] === '.' ? 0.6 : 0.8;
    if (m[1] === '_') { const last = notes[notes.length - 1]; if (!last || last.pos + last.len !== pos) throw new Error(`${what}: 늘일 음이 없음`); last.len += len; }
    else if (m[1] !== 'r') notes.push({ pos, len, vel, note: m[1] });
    pos += len;
  }
  return { notes, length: pos };
}
// 치는 무늬: 16글자 — x 보통 · X 세게 · o 여리게 · p 뮤트(짧게 죽인 소리) · 1 2 3 북(높은 · 가운데 ·낮은) · - 앞 음을 늘임 · . 쉼
const HIT_VEL = { x: 0.8, X: 1, o: 0.45, p: 0.75, 1: 0.8, 2: 0.8, 3: 0.8 };
export function parseHits(text, what = '무늬') {
  const s = text.replace(/\s+/g, ''); if (s.length !== STEPS) throw new Error(`${what}: 16칸이 아님(${s.length}) — ${text}`);
  const hits = []; let open = false;
  for (let i = 0; i < STEPS; i++) {
    const c = s[i];
    if (c === '.') { open = false; continue; }
    if (c === '-') { if (!open) throw new Error(`${what}: 늘일 음이 없음 — ${text}`); hits[hits.length - 1].len++; continue; }
    if (!(c in HIT_VEL)) throw new Error(`${what}: 모르는 글자 '${c}'`);
    hits.push({ pos: i, len: 1, ch: c, vel: HIT_VEL[c] }); open = true;
  }
  return hits;
}

// 사람 손 같은 세기: 자리마다 정해진(난수 아님 — 늘 같은 소리) ±8% 흔들림
const hash = (...xs) => { let h = 2166136261; for (const x of xs) { h ^= (x * 2654435761) >>> 0; h = Math.imul(h, 16777619) >>> 0; } return (h >>> 0) / 4294967296; };
const human = (amount, ...xs) => 1 + amount * (hash(...xs) * 2 - 1);
const INST_ID = { lead: 1, lead2: 2, bass: 3, chord: 4, k: 5, s: 6, h: 7, oh: 8, c: 9, r: 10, t: 11, counter: 12, arp: 13, cp: 14 };

// 화음의 자리 잡기: 앞 화음에서 가장 적게 움직이는 자리바꿈(음마다 ±12 안)
function voice(chord, low, prev) {
  if (chord.power) { const r = low + ((chord.root - low) % 12 + 12) % 12; return chord.iv.map(i => r + i); }
  const pcs = chordPcs(chord).filter((p, i, a) => a.indexOf(p) === i), cands = [];
  for (let rot = 0; rot < pcs.length; rot++) {
    const order = [...pcs.slice(rot), ...pcs.slice(0, rot)], notes = []; let n = low + ((order[0] - low) % 12 + 12) % 12;
    for (const p of order) { while ((n % 12 + 12) % 12 !== p) n++; notes.push(n); n++; }
    cands.push(notes);
  }
  if (!prev) return cands.reduce((a, b) => Math.abs(a[0] - low - 4) <= Math.abs(b[0] - low - 4) ? a : b);
  const cost = v => { let c = 0; for (const x of v) c += Math.min(...prev.map(y => Math.abs(x - y))); return c + Math.abs(v.length - prev.length) * 2; };
  return cands.reduce((a, b) => cost(a) <= cost(b) ? a : b);
}
// 음계 안에서 steps 칸 아래(셋째 아래 = 2) — 겹소리(두 대가 3도로 같이 부르는 것)
function diatonicBelow(midi, steps, scale) {
  let n = midi, k = 0; if (!scale.includes(((n % 12) + 12) % 12)) return midi - 3;
  while (k < steps) { n--; if (scale.includes(((n % 12) + 12) % 12)) k++; }
  return n;
}
function bassNote(tok, chord, low) {
  const root = low + ((chord.root - low) % 12 + 12) % 12, third = chord.power ? 7 : chord.iv[1], fifth = chord.iv.includes(6) && !chord.iv.includes(7) ? 6 : 7, sev = chord.iv.find(i => i >= 9 && i <= 11) ?? 10;
  const deg = { R: 0, 3: third, 5: fifth, 7: sev, 8: 12, L5: fifth - 12 }[tok];
  return deg === undefined ? midiOf(tok) : root + deg;
}
const cyc = (v, i) => Array.isArray(v) ? v[i % v.length] : v;

// ── 곡 자료 → 연주할 판(program) ──
// 판: { name, bpm, swing, lp, loopFrom(되돌아갈 마디 — null 이면 끝나면 멈춤), bars: [{ section, chords, steps: [16칸마다 [음 …]] }] }
// 음: { inst: lead · lead2 · counter · arp · bass · chord · k s h oh c r t cp, midi | midis, len(칸), vel, flavor, mute, tom, glide(앞 음 — 미끄러져 들어옴) }
// 2차(2026-11-24)에 더한 것: double(리드를 옥타브로 겹침, ±12) · counter(대선율 줄) · arp(화음 음을 16분으로 굴림 — patterns.arp) · cp(손뼉) · final.add(마지막 바퀴에 더하는 타악기 줄)
function compileSections(track, sections, { transpose = 0, dense = false, keepVoicing = null, extra = null } = {}) {
  const sound = track.sound, scale = scaleOf(track), bars = []; let prevVoicing = keepVoicing, prevLead = null;
  for (const sec of sections) {
    const chordsText = sec.chords.replace(/\|/g, ' ').split(/\s+/).filter(Boolean), leadText = sec.lead ? (Array.isArray(sec.lead) ? sec.lead.join(' | ') : sec.lead) : null;
    const lead = leadText ? parseLine(leadText, `${track.id}.${sec.name} 가락`) : null;
    if (lead && lead.length !== sec.bars * STEPS) throw new Error(`${track.id}.${sec.name}: 가락 길이 ${lead.length / STEPS}마디 ≠ ${sec.bars}마디`);
    const counterText = sec.counter ? (Array.isArray(sec.counter) ? sec.counter.join(' | ') : sec.counter) : null, counter = counterText ? parseLine(counterText, `${track.id}.${sec.name} 대선율`) : null;
    if (counter && counter.length !== sec.bars * STEPS) throw new Error(`${track.id}.${sec.name}: 대선율 길이 ${counter.length / STEPS}마디 ≠ ${sec.bars}마디`);
    const secStart = bars.length;
    for (let i = 0; i < sec.bars; i++) {
      const parts = cyc(chordsText, i).split(','), chords = parts.map(chordOf), chordAt = step => chords[Math.min(chords.length - 1, Math.floor(step / (STEPS / chords.length)))];
      const steps = Array.from({ length: STEPS }, () => []), b = bars.length, add = (pos, ev) => steps[pos].push(ev);
      const vel = (inst, base, pos, amt = 0.08) => base * human(amt, b, pos, INST_ID[inst] || 0) * (sec.vel?.[inst] ?? 1);
      if (lead) for (const n of lead.notes) if (n.pos >= i * STEPS && n.pos < (i + 1) * STEPS) {
        const pos = n.pos - i * STEPS, midi = midiOf(n.note) + transpose, flavor = sec.leadFlavor || sound.lead;
        const abs = (secStart + i) * STEPS + pos, glide = sound.glide && prevLead && prevLead.end === abs && Math.abs(prevLead.midi - midi) <= 7 ? prevLead.midi : undefined; prevLead = { end: abs + n.len, midi };
        add(pos, { inst: 'lead', midi, len: n.len, vel: vel('lead', n.vel, pos), flavor, ...(glide !== undefined ? { glide } : {}) });
        if (sec.harm) add(pos, { inst: 'lead2', midi: diatonicBelow(midiOf(n.note), sec.harm, scale) + transpose, len: n.len, vel: vel('lead2', n.vel * 0.6, pos), flavor });
        if (sec.double) add(pos, { inst: 'lead2', midi: midi + sec.double, len: n.len, vel: vel('lead2', n.vel * 0.55, pos), flavor });
      }
      if (counter) for (const n of counter.notes) if (n.pos >= i * STEPS && n.pos < (i + 1) * STEPS) add(n.pos - i * STEPS, { inst: 'counter', midi: midiOf(n.note) + transpose, len: n.len, vel: vel('counter', n.vel, n.pos - i * STEPS), flavor: sec.counterFlavor || sound.counter || 'bell' });
      const arpName = cyc(sec.arp, i);
      if (arpName) {   // 아르페지오: 그 자리의 화음 음을 low 부터 span 칸(반음) 안에서 골라 무늬의 x 마다 하나씩(오르기 · 오르내리기)
        const A = track.patterns.arp?.[arpName]; if (!A) throw new Error('없는 아르페지오: ' + arpName);
        parseHits(A.hits, `${track.id} 아르페지오 ${arpName}`).forEach((h, k) => {
          const c = chordAt(h.pos), pcs = chordPcs(c), notes = []; for (let m = A.low; m < A.low + (A.span || 24); m++) if (pcs.includes(((m % 12) + 12) % 12)) notes.push(m);
          const seq = A.order === 'updown' ? [...notes, ...notes.slice(1, -1).reverse()] : A.order === 'down' ? [...notes].reverse() : notes;
          add(h.pos, { inst: 'arp', midi: seq[k % seq.length] + transpose, len: h.len, vel: vel('arp', h.vel * (h.pos % 4 ? 0.85 : 1), h.pos, 0.1), flavor: sec.arpFlavor || sound.arp });
        });
      }
      const bassName = cyc(sec.bass, i);
      if (bassName) {
        const line = parseLine(track.patterns.bass[bassName] ?? (() => { throw new Error('없는 베이스 무늬: ' + bassName); })(), `${track.id} 베이스 ${bassName}`);
        if (line.length !== STEPS) throw new Error(`${track.id} 베이스 ${bassName}: 16칸이 아님`);
        for (const n of line.notes) add(n.pos, { inst: 'bass', midi: bassNote(n.note, chordAt(n.pos), sound.bassLow) + transpose, len: n.len, vel: vel('bass', n.vel, n.pos), flavor: sec.bassFlavor || sound.bass });
      }
      const chordName = cyc(sec.chord, i);
      if (chordName) {
        const hits = parseHits(track.patterns.chord[chordName] ?? (() => { throw new Error('없는 화음 무늬: ' + chordName); })(), `${track.id} 화음 ${chordName}`), flavor = sec.chordFlavor || sound.chord;
        for (const h of hits) { const c = chordAt(h.pos), v = voice(c, flavor === 'power' ? sound.powerLow : sound.chordLow, prevVoicing); prevVoicing = v; add(h.pos, { inst: 'chord', midis: v.map(m => m + transpose), len: h.len, vel: vel('chord', h.vel, h.pos), flavor, mute: h.ch === 'p' }); }
      }
      const d = sec.drums, drumName = !d ? null : typeof d === 'string' || Array.isArray(d) ? cyc(d, i) : d.bars?.[i] ?? (d.fill8 && (i + 1) % 8 === 0 ? d.fill8 : d.fill4 && (i + 1) % 4 === 0 ? d.fill4 : d.main);
      if (drumName) {
        const pat = track.patterns.drums[drumName]; if (!pat) throw new Error('없는 북 무늬: ' + drumName);
        for (const [lane, text] of Object.entries(pat)) for (const h of parseHits(text, `${track.id} 북 ${drumName}.${lane}`)) add(h.pos, { inst: lane, vel: vel(lane, h.vel, h.pos, lane === 'h' || lane === 'oh' ? 0.15 : 0.06), tom: lane === 't' ? +h.ch || 2 : 0 });
        // 마지막 바퀴의 촘촘한 하이햇: 빈 16분 칸을 여린 닫힌 하이햇으로 채운다(dense: 'open' 이면 엇박 8분에 여린 열린 하이햇을 얹는다)
        if (dense === 'open' && /x|o|X/.test(pat.h || '')) { for (const s of [2, 6, 10, 14]) if (!steps[s].some(e => e.inst === 'oh')) add(s, { inst: 'oh', vel: vel('oh', 0.3, s, 0.2) }); }
        else if (dense && /x|o|X/.test(pat.h || '')) for (let s = 0; s < STEPS; s++) if (!steps[s].some(e => e.inst === 'h' || e.inst === 'oh')) add(s, { inst: 'h', vel: vel('h', 0.32, s, 0.2) });
        // 마지막 바퀴에 더하는 타악기 줄(그 악기가 이미 친 칸은 건너뛴다) — 북이 도는 마디에만
        if (extra && (pat.k || pat.s)) for (const [lane, text] of Object.entries(extra)) for (const h of parseHits(text, `${track.id} final.add.${lane}`)) if (!steps[h.pos].some(e => e.inst === lane)) add(h.pos, { inst: lane, vel: vel(lane, h.vel, h.pos, 0.12) });
      }
      if ((sec.crash || []).includes(i)) add(0, { inst: 'c', vel: vel('c', 0.9, 0) });
      bars.push({ section: sec.name, chords: chords.map(c => c.sym), steps });
    }
  }
  return { bars, voicing: prevVoicing };
}
export function compileTrack(track) {
  const race = compileSections(track, track.sections), loopFrom = track.sections.slice(0, track.sections.findIndex(s => s.name === track.loopFrom)).reduce((a, s) => a + s.bars, 0);
  if (!track.sections.some(s => s.name === track.loopFrom)) throw new Error(`${track.id}: 되돌아갈 구간 ${track.loopFrom} 이 없음`);
  const F = track.final || {}, L = track.lobby;
  const final = compileSections(track, track.sections, { transpose: F.transpose || 0, dense: F.dense ?? true, extra: F.add || null });
  const from = track.sections.find(s => s.name === L.from);
  const lobby = compileSections(track, [{ ...from, crash: [], harm: 0, ...L, name: 'lobby', bars: L.bars || from.bars }]);
  const outro = compileSections(track, track.outro, { keepVoicing: null });
  const base = { swing: track.swing || 0, id: track.id };
  return {
    id: track.id, name: track.name, key: track.key, mode: track.mode, sound: track.sound,
    sectionsAt: track.sections.reduce((a, s) => { a.push({ name: s.name, bar: a.length ? a[a.length - 1].bar + a[a.length - 1].bars : 0, bars: s.bars }); return a; }, []),
    programs: {
      race: { ...base, name: 'race', bpm: track.bpm, lp: 18000, loopFrom, bars: race.bars },
      final: { ...base, name: 'final', bpm: track.bpm * (F.bpm || 1.05), lp: 18000, loopFrom, bars: final.bars },
      lobby: { ...base, name: 'lobby', bpm: L.bpm, lp: L.lp || 1600, loopFrom: 0, bars: lobby.bars, swing: L.swing ?? base.swing },
      result: { ...base, name: 'result', bpm: track.bpm, lp: 18000, loopFrom: null, bars: outro.bars },
    },
  };
}

// ── 합성 악기 ──
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function rng(seed) { let s = seed | 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
// 직접 만든 잔향 충격 응답: 두 귀에 서로 다른 잡음, 잦아드는 꼬리가 갈수록 어두워진다
function makeIR(ctx, seconds) {
  const sr = ctx.sampleRate, n = Math.round(seconds * sr), buf = ctx.createBuffer(2, n, sr), pre = Math.round(0.012 * sr);
  for (let ch = 0; ch < 2; ch++) {
    const x = buf.getChannelData(ch), r = rng(91 + ch * 17); let lp = 0;
    for (let i = pre; i < n; i++) { const t = (i - pre) / sr, a = Math.exp(-6.9 * t / seconds), k = 0.85 - 0.6 * Math.min(1, t / seconds); lp += k * ((r() * 2 - 1) - lp); x[i] = lp * a; }
  }
  return buf;
}
// 북의 잡음은 미리 걸러 둔 버퍼(1초)로 — 치는 음마다 거르개 마디를 만들지 않아 값이 싸다(같은 거르개를 잡음에 건 것이라 소리는 같다). 거르개: [종류, Hz, Q, 덧 dB]
function biquadCoef([type, f, q, gainDb = 0], sr) {
  const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q), A = Math.pow(10, gainDb / 40); let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'bandpass') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }   // peaking
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function makeNoise(ctx, filters = []) {
  const sr = ctx.sampleRate, n = sr, pre = Math.round(0.05 * sr), buf = ctx.createBuffer(1, n, sr), x = buf.getChannelData(0), r = rng(7), raw = new Float32Array(n + pre);
  for (let i = 0; i < raw.length; i++) raw[i] = r() * 2 - 1;
  for (const spec of filters) { const [b0, b1, b2, a1, a2] = biquadCoef(spec, sr); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < raw.length; i++) { const v = raw[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; raw[i] = y; } }
  x.set(raw.subarray(pre, pre + n)); return buf;   // 앞 50ms(거르개가 자리 잡는 동안)는 버린다
}
const curveOf = (fn, n = 1024) => { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1); return c; };

// 북: 소리 결(kit)마다의 값
const KITS = {
  arcade: { kick: [175, 46, 0.085, 0.3], snare: ['highpass', 1600, 0.7, 0.17, 190, 0.07, 0.45], hat: [7800, 0.035, 0.2], ride: 0 },
  soft: { kick: [125, 44, 0.07, 0.34], snare: ['bandpass', 2300, 0.9, 0.11, 240, 0.04, 0.3], hat: [8200, 0.03, 0.16], ride: 0 },
  rock: { kick: [150, 55, 0.055, 0.24, true], snare: ['highpass', 1100, 0.6, 0.21, 180, 0.09, 0.55], hat: [7000, 0.05, 0.25], ride: 1 },
  // 2차: 팝 록 · 유로 · 칩 — clap: [손뼉 띠 Hz, Q, 잦아드는 초]
  pop: { kick: [185, 48, 0.07, 0.28, true], snare: ['highpass', 1500, 0.7, 0.17, 200, 0.08, 0.55], hat: [8500, 0.04, 0.24], ride: 0, clap: [1150, 1.1, 0.14] },
  euro: { kick: [210, 46, 0.055, 0.28, true], snare: ['highpass', 1800, 0.7, 0.15, 210, 0.06, 0.4], hat: [9000, 0.03, 0.2], ride: 0, clap: [1300, 1.2, 0.12] },
  chip: { kick: [170, 55, 0.035, 0.13], snare: ['highpass', 2200, 0.6, 0.08, 230, 0.035, 0.35], hat: [9500, 0.018, 0.1], ride: 0, clap: [1500, 1, 0.08] },
};
const NEW_LEADS = new Set(['supersaw', 'pop', 'pulse']);   // 2차 리드: 떨림은 긴 음(6칸 이상)에만, 붙은 음은 미끄러져 들어간다(glide)

export function createMusic({ context: ctx, output, tracks = TRACKS, timer = null, quiet = null, mute = null, lite = false } = {}) {
  const L = lite ? (lite === true ? LITE : { ...LITE, ...lite }) : null, cap = L?.maxVoices ?? MUSIC.maxVoices;
  const clock = timer || { every: (fn, ms) => setInterval(fn, ms), cancel: id => clearInterval(id), later: (fn, ms) => setTimeout(fn, ms) };
  const perf = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
  const compiled = {}, programOf = id => (compiled[id] ||= compileTrack(tracks[id] || (() => { throw new Error('없는 곡: ' + id); })()));
  let S = null, handle = null, volume = 1, noise = null, irCache = {};
  const stats = { notes: 0, voices: 0, maxVoices: 0, dropped: 0, skipped: 0, ticks: 0, tickMs: 0, tickMax: 0, sessions: 0 };
  const trace = [];   // 재기용(tracing = true 일 때만): { inst, t(울릴 시각), now(예약한 시각), bar, step, prog } — 길이를 100,000 에서 자른다
  let tracing = false;

  // 곡 하나의 소리 길(버스 · 잔향 · 메아리) — 곡을 바꾸거나 멈추면 끊는다
  function buildBuses(sound) {
    const own = [], g = v => { const n = ctx.createGain(); n.gain.value = v; own.push(n); return n; }, bq = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; own.push(n); return n; };
    const hold = g(1), duck = g(1), vol = g(MUSIC.level * (sound.gain ?? 1) * volume), lp = bq('lowpass', 18000, 0.5), mix = g(1);
    mix.connect(lp).connect(vol).connect(duck).connect(hold).connect(output);
    const revIn = g(1); if (sound.reverb !== 0 && !(L && L.reverb === false)) { const rev = ctx.createConvolver(); own.push(rev); const room = L?.room ?? sound.room; rev.buffer = irCache[room] ||= makeIR(ctx, room || 1.4); revIn.connect(rev).connect(g(sound.reverb ?? 0.3)).connect(mix); }
    const dly = ctx.createDelay(2); own.push(dly); const fb = g(sound.delay?.fb ?? 0.28), dIn = g(1), dlp = bq('lowpass', 2600), dOut = g(sound.delay?.level ?? 0.5); dIn.connect(dly); dly.connect(dlp); dlp.connect(fb).connect(dly); dlp.connect(dOut).connect(mix);
    // 킥에 맞춰 숨기(사이드체인 흉내): sound.pump 가 있으면 베이스 · 화음 · 깔린 소리 · 아르페지오가 이 마디를 지나고, 킥마다 이득을 잠깐 내렸다 올린다
    const pump = sound.pump ? g(1) : null; if (pump) pump.connect(mix);
    const M = sound.mix, bus = (level, pan = 0, rv = 0, dl = 0, to = mix) => { const b = g(level), p = ctx.createStereoPanner(); own.push(p); p.pan.value = pan; b.connect(p).connect(to); if (rv) p.connect(g(rv)).connect(revIn); if (dl) p.connect(g(dl)).connect(dIn); return { in: b, pan: p }; };
    // 넓게(하스 효과): 왼쪽은 그대로, 오른쪽은 13ms 늦게 — 목소리마다 팬을 만들지 않고 버스 하나로 넓힌다
    const wide = (level, rv = 0, dl = 0, to = mix) => { const b = g(level), mg = ctx.createChannelMerger(2), d = ctx.createDelay(0.05); own.push(mg, d); d.delayTime.value = 0.013; b.connect(mg, 0, 0); b.connect(d).connect(mg, 0, 1); mg.connect(to); if (rv) b.connect(g(rv)).connect(revIn); if (dl) b.connect(g(dl)).connect(dIn); return { in: b }; };
    const lfos = [], under = pump || mix;
    const B = {
      kick: bus(M.kick), snare: bus(M.snare, 0, 0.18), hat: bus(M.hat, 0.28), crash: bus(M.crash, -0.25, 0.2), tom: bus(M.tom ?? 0.5, 0.1, 0.15), clap: bus(M.clap ?? M.snare, -0.12, 0.25),
      bass: bus(M.bass, 0, 0, 0, under), lead: sound.wide ? wide(M.lead, sound.leadRev ?? 0.25, sound.leadDelay ?? 0.15) : bus(M.lead, 0, sound.leadRev ?? 0.25, sound.leadDelay ?? 0.15), lead2: bus(M.lead * 0.9, sound.wide ? -0.3 : 0.22, 0.3, 0.1), chord: bus(M.chord, -0.12, 0.3, 0, under), pad: bus(M.pad ?? M.chord, 0, 0.45, 0, under),
      bell: bus(M.bell ?? 0.2, 0.38, 0.4, 0.12), brass: wide(M.brass ?? M.chord, 0.22, 0, under),
    };
    if (sound.leadLp) for (const k of ['lead', 'lead2']) { const f = bq('lowpass', sound.leadLp, 0.7), into = B[k].in; f.connect(into); B[k] = { ...B[k], in: f }; }   // 2차 리드: 거르개를 버스에 하나
    { const a = g(M.arp ?? 0.1), f = bq('lowpass', sound.arpLp || 5000, 0.7), p = ctx.createStereoPanner(); own.push(p); p.pan.value = -0.3; a.connect(f).connect(p).connect(under); p.connect(g(0.35)).connect(dIn); B.arp = { in: a }; }
    // 전기 피아노: 좌우로 천천히 흔들림(트레몰로)
    const ep = bus(M.chord, 0, 0.32); { const o = ctx.createOscillator(), d = g(0.35); o.frequency.value = 4.2; o.connect(d).connect(ep.pan.pan); o.start(); lfos.push(o); own.push(o); } B.epiano = ep;
    // 일그러뜨림(합성 기타): 화음 · 리드 따로 한 벌씩 — 앰프처럼 밀어 넣고 스피커처럼 위아래를 깎는다
    const amp = (drive, level, pan, rv) => { const sh = ctx.createWaveShaper(); own.push(sh); sh.curve = curveOf(x => Math.tanh(drive * x) / Math.tanh(drive)); sh.oversample = 'none'; const hp = bq('highpass', 90), cab = bq('lowpass', 3600, 0.9), mid = bq('peaking', 1400, 0.9); mid.gain.value = 3; const b = bus(level, pan, rv); sh.connect(hp).connect(mid).connect(cab).connect(b.in); return { in: sh }; };
    B.power = amp(5, M.chord, -0.15, 0.18); B.guitar = amp(4, M.lead, 0.12, 0.25); B.guitar2 = amp(4, M.lead * 0.85, -0.3, 0.25);   // 겹소리는 다른 앰프 · 다른 쪽(두 대 기타)
    // 리드의 떨림(비브라토) — 하나를 모든 리드 음의 detune 에 잇는다
    const vib = ctx.createOscillator(), vibG = g(sound.vibrato ?? 10); vib.frequency.value = 5.3; vib.connect(vibG); vib.start(); lfos.push(vib); own.push(vib);
    return { hold, duck, vol, lp, dly, vibG, B, own, lfos, sound, pump };
  }

  // 목소리 하나: nodes 를 만들고, 마지막 소스가 끝나면 전부 끊는다. 상한을 넘으면 만들지 않는다(여린 음부터)
  function claim(t, prio) {
    const live = S.live; let n = 0; for (const v of live) { if (v.end > t) n++; else if (v.end < t - 1) live.delete(v); }
    stats.voices = n; if (n > stats.maxVoices) stats.maxVoices = n;
    if (n >= cap + (prio ? 8 : 0)) { stats.dropped++; return false; }
    return true;
  }
  function voiceOf(nodes, srcs, amp, t, end) {
    const v = { nodes, srcs, amp, start: t, end }, live = S.live; live.add(v); stats.notes++;
    const last = srcs[srcs.length - 1]; last.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch {} } live.delete(v); };
    return v;
  }
  const osc = (type, f, t, nodes) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); nodes.push(o); return o; };
  const gain = (v, nodes) => { const n = ctx.createGain(); n.gain.value = v; nodes.push(n); return n; };
  const filt = (type, f, q, nodes) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; nodes.push(n); return n; };
  // 펄스파(칩튠의 네모 · 좁은 네모): 듀티 d 의 푸리에 계수 40개로 만든 파형(곡마다 한 번)
  const waves = {}, pulseWave = d => waves[d] ||= (() => { const n = 40, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) { re[k] = Math.sin(2 * Math.PI * k * d) / (k * Math.PI); im[k] = (1 - Math.cos(2 * Math.PI * k * d)) / (k * Math.PI); } return ctx.createPeriodicWave(re, im); })();
  const pulse = (d, f, t, nodes) => { const o = ctx.createOscillator(); o.setPeriodicWave(pulseWave(d)); o.frequency.setValueAtTime(f, t); nodes.push(o); return o; };
  const noiseOf = filters => { const key = JSON.stringify(filters); return (noise ||= {})[key] ||= makeNoise(ctx, filters); };
  const noiseSrc = (t, nodes, seed, filters = []) => { const s = ctx.createBufferSource(); s.buffer = noiseOf(filters); nodes.push(s); s.start(t, hash(seed, t * 1000) * 0.8); return s; };
  // 소리 모양: 0 에서 시작해 a 초에 peak, 그 뒤 decay(시간 상수)로 sustain 까지, off 에서 release 로 0 — 끝 시각을 돌려준다
  function shape(p, t, peak, a, sustain, decay, off, release) {
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
    if (sustain < peak) p.setTargetAtTime(sustain, t + a, decay);
    const o = Math.max(off, t + a); p.setTargetAtTime(0, o, release); const end = o + release * 6; p.linearRampToValueAtTime(0, end); return end;
  }

  function drum(ev, t) {
    const kit = KITS[S.buses.sound.drums], B = S.buses.B, v = ev.vel, nodes = [], prio = v >= 0.6 && ev.inst !== 'h';
    if (!claim(t, prio)) return;
    if (ev.inst === 'k') {
      const [f0, f1, sweep, decay, click] = kit.kick, o = osc('sine', f0, t, nodes), a = gain(0, nodes); o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(v, t + 0.002); a.gain.exponentialRampToValueAtTime(0.001, t + decay); a.gain.linearRampToValueAtTime(0, t + decay + 0.01);
      o.connect(a).connect(B.kick.in); o.start(t); o.stop(t + decay + 0.02); const srcs = [o];
      if (click) { const n = noiseSrc(t, nodes, 3, [['highpass', 2500, 0.7]]), c = gain(0, nodes); c.gain.setValueAtTime(0, t); c.gain.linearRampToValueAtTime(v * 0.35, t + 0.001); c.gain.linearRampToValueAtTime(0, t + 0.012); n.connect(c).connect(B.kick.in); n.stop(t + decay + 0.02); srcs.unshift(n); }   // 소스들이 함께 끝나야 끝날 때 한꺼번에 끊긴다
      voiceOf(nodes, srcs, a, t, t + decay + 0.02);
      const P = S.buses.pump; if (P) { P.gain.setValueAtTime(1 - S.buses.sound.pump, t); P.gain.setTargetAtTime(1, t + 0.012, 0.07); }
    } else if (ev.inst === 'cp') {   // 손뼉: 걸러 둔 잡음을 10ms 간격으로 세 번 튀기고 잦아든다
      const [f, q, decay] = kit.clap || [1200, 1.1, 0.13], n = noiseSrc(t, nodes, 13, [['bandpass', f, q]]), a = gain(0, nodes), p = a.gain;
      p.setValueAtTime(0, t); for (const k of [0, 0.01, 0.02]) { p.linearRampToValueAtTime(v * 1.6, t + k + 0.001); p.linearRampToValueAtTime(v * 0.25, t + k + 0.009); }
      p.linearRampToValueAtTime(v * 1.4, t + 0.031); p.exponentialRampToValueAtTime(0.001, t + 0.03 + decay); p.linearRampToValueAtTime(0, t + 0.04 + decay);
      n.connect(a).connect(B.clap.in); n.stop(t + 0.05 + decay); voiceOf(nodes, [n], a, t, t + 0.05 + decay);
    } else if (ev.inst === 's') {
      const [type, f, q, decay, tone, toneDecay, toneLevel] = kit.snare, n = noiseSrc(t, nodes, 5, [[type, f, q]]), na = gain(0, nodes), o = osc('triangle', tone, t, nodes), oa = gain(0, nodes);
      na.gain.setValueAtTime(0, t); na.gain.linearRampToValueAtTime(v, t + 0.001); na.gain.exponentialRampToValueAtTime(0.001, t + decay); na.gain.linearRampToValueAtTime(0, t + decay + 0.01);
      o.frequency.exponentialRampToValueAtTime(tone * 0.8, t + toneDecay); oa.gain.setValueAtTime(0, t); oa.gain.linearRampToValueAtTime(v * toneLevel, t + 0.001); oa.gain.exponentialRampToValueAtTime(0.001, t + toneDecay); oa.gain.linearRampToValueAtTime(0, t + toneDecay + 0.01);
      n.connect(na).connect(B.snare.in); o.connect(oa).connect(B.snare.in); const end = t + Math.max(decay, toneDecay) + 0.02; o.start(t); o.stop(end); n.stop(end); voiceOf(nodes, [o, n], na, t, end);
    } else if (ev.inst === 'h' || ev.inst === 'oh' || ev.inst === 'r') {
      const [f, closed, open] = kit.hat, decay = ev.inst === 'h' ? closed : ev.inst === 'oh' ? open : 0.4, n = noiseSrc(t, nodes, 7, [ev.inst === 'r' ? ['bandpass', 5200, 1.4] : ['highpass', f, 0.7]]), a = gain(0, nodes);
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(v, t + 0.001); a.gain.exponentialRampToValueAtTime(0.001, t + decay); a.gain.linearRampToValueAtTime(0, t + decay + 0.005);
      n.connect(a).connect(B.hat.in); n.stop(t + decay + 0.01); voiceOf(nodes, [n], a, t, t + decay + 0.01);
    } else if (ev.inst === 'c') {
      const decay = kit.ride ? 1.8 : 1.4, n = noiseSrc(t, nodes, 11, [['highpass', 4300, 0.6], ['peaking', 6500, 1.2, 5]]), a = gain(0, nodes);
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(v, t + 0.002); a.gain.setTargetAtTime(0, t + 0.002, decay / 5); a.gain.linearRampToValueAtTime(0, t + decay);
      n.connect(a).connect(B.crash.in); n.loop = true; n.stop(t + decay + 0.01); voiceOf(nodes, [n], a, t, t + decay + 0.01);
    } else if (ev.inst === 't') {
      const f = [0, 210, 160, 118][ev.tom] || 160, o = osc('sine', f, t, nodes), a = gain(0, nodes); o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.2);
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(v, t + 0.003); a.gain.exponentialRampToValueAtTime(0.001, t + 0.32); a.gain.linearRampToValueAtTime(0, t + 0.33);
      o.connect(a).connect(B.tom.in); o.start(t); o.stop(t + 0.34); voiceOf(nodes, [o], a, t, t + 0.34);
    }
  }
  function bass(ev, t, dur) {
    if (!claim(t, true)) return;
    const B = S.buses.B, f = hz(ev.midi), v = ev.vel, nodes = [], a = gain(0, nodes), lp = filt('lowpass', 800, 1, nodes), off = t + Math.max(0.05, dur * 0.92); let srcs;
    if (ev.flavor === 'pluck') {   // 통통 튀는: 네모파를 좁게 닫히는 거르개로 + 밑에 사인
      const o = osc('square', f, t, nodes), sub = osc('sine', f, t, nodes), sg = gain(0.5, nodes); lp.Q.value = 6; lp.frequency.setValueAtTime(Math.min(4000, f * 22), t); lp.frequency.setTargetAtTime(f * 3, t, 0.05);
      o.connect(lp).connect(a); sub.connect(sg).connect(a); srcs = [o, sub];
      var end = shape(a.gain, t, v, 0.003, v * 0.45, 0.12, off, 0.02);
    } else if (ev.flavor === 'pick') {   // 피크로 친 베이스: 톱니 둘
      const o = osc('sawtooth', f, t, nodes), o2 = osc('square', f, t, nodes); o2.detune.value = 6; lp.Q.value = 1.4; lp.frequency.setValueAtTime(Math.min(3000, f * 30), t); lp.frequency.setTargetAtTime(f * 9, t, 0.07);
      const m = gain(0.5, nodes); o.connect(lp); o2.connect(m).connect(lp); lp.connect(a); srcs = [o, o2];
      var end = shape(a.gain, t, v, 0.002, v * 0.8, 0.1, off, 0.025);
    } else if (ev.flavor === 'chip') {   // 칩 베이스: 세모파 그대로
      const o = osc('triangle', f, t, nodes); o.connect(a); srcs = [o];
      var end = shape(a.gain, t, v * 1.3, 0.002, v * 1.15, 0.2, off, 0.015);
    } else if (ev.flavor === 'euro' || ev.flavor === 'pop') {   // 유로: 엇박 옥타브 톱니(거르개가 세게 열렸다 닫힘) · 팝: 톱니 + 밑 사인
      const o = osc('sawtooth', f, t, nodes); lp.Q.value = ev.flavor === 'euro' ? 4 : 1.5; lp.frequency.setValueAtTime(Math.min(4500, f * 34), t); lp.frequency.setTargetAtTime(f * (ev.flavor === 'euro' ? 6 : 9), t, 0.045); o.connect(lp).connect(a); srcs = [o];
      if (ev.flavor === 'pop') { const sub = osc('sine', f, t, nodes), sg = gain(0.6, nodes); sub.connect(sg).connect(a); srcs.push(sub); }
      var end = shape(a.gain, t, v, 0.002, v * (ev.flavor === 'euro' ? 0.5 : 0.75), 0.07, off, 0.02);
    } else {   // 옥타브 톱니(아케이드)
      const o = osc('sawtooth', f, t, nodes); lp.Q.value = 3; lp.frequency.setValueAtTime(Math.min(3200, f * 28), t); lp.frequency.setTargetAtTime(f * 6, t, 0.05);
      o.connect(lp).connect(a); srcs = [o];
      var end = shape(a.gain, t, v, 0.003, v * 0.7, 0.08, off, 0.02);
    }
    a.connect(B.bass.in); for (const s of srcs) { s.start(t); s.stop(end); } voiceOf(nodes, srcs, a, t, end);
  }
  // 종 · 글로켄슈필(FM): 사인을 3.5배 높이의 사인으로 세게 흔들었다가 빨리 맑아지고, 1초쯤 울리다 잦아든다
  function bell(ev, t, dest) {
    if (!claim(t, false)) return;
    const f = hz(ev.midi), v = ev.vel * 0.7, nodes = [], c = osc('sine', f, t, nodes), m = osc('sine', f * 3.5, t, nodes), mg = gain(0, nodes), a = gain(0, nodes), end = t + 1.1;
    mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.12, t, 0.05); m.connect(mg).connect(c.frequency); c.connect(a).connect(dest);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(v, t + 0.002); a.gain.setTargetAtTime(0, t + 0.002, 0.2); a.gain.linearRampToValueAtTime(0, end);
    c.start(t); m.start(t); c.stop(end); m.stop(end); voiceOf(nodes, [m, c], a, t, end);
  }
  // 아르페지오 한 음: 거르개 없이 짧게(버스에 거르개 하나) — chip 은 좁은 펄스(12.5%), pluck 은 톱니
  function arp(ev, t, dur) {
    if (!claim(t, false)) return;
    const f = hz(ev.midi), nodes = [], a = gain(0, nodes), o = ev.flavor === 'chip' ? pulse(0.125, f, t, nodes) : osc(ev.flavor === 'pluck' ? 'sawtooth' : 'square', f, t, nodes), end = t + Math.min(0.2, Math.max(0.07, dur * 0.9)) + 0.04;
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(ev.vel, t + 0.002); a.gain.setTargetAtTime(0, t + 0.004, ev.flavor === 'chip' ? 0.05 : 0.04); a.gain.linearRampToValueAtTime(0, end);
    o.connect(a).connect(S.buses.B.arp.in); o.start(t); o.stop(end); voiceOf(nodes, [o], a, t, end);
  }
  function lead(ev, t, dur) {
    const B = S.buses.B, side = ev.inst !== 'lead';
    if (ev.flavor === 'bell') return bell(ev, t, side ? B.bell.in : B.lead.in);
    if (!claim(t, ev.inst === 'lead')) return;
    const f = hz(ev.midi), v = ev.vel, nodes = [], a = gain(0, nodes), off = t + Math.max(0.05, dur * 0.94), dest = ev.flavor === 'guitar' ? (side ? B.guitar2 : B.guitar) : side ? B.lead2 : B.lead;
    const vibG = S.buses.vibG, os = [];
    if (ev.flavor === 'supersaw' || ev.flavor === 'pop') {   // 두꺼운 톱니(조금씩 어긋난 여럿) — pop 은 둘 + 가운데 네모
      const det = ev.flavor === 'supersaw' ? (L?.supersaw || [-17, 0, 17]) : [7], lp = gain(1, nodes);   // 값: 톱니 셋(넓이는 버스의 하스 효과가, 거르개는 리드 버스 하나가 맡는다 — sound.leadLp)
      for (const d of det) { const o = osc('sawtooth', f, t, nodes); o.detune.setValueAtTime(d, t); o.connect(lp); os.push(o); }
      if (ev.flavor === 'pop') { const sq = osc('square', f, t, nodes), m = gain(0.7, nodes); sq.connect(m).connect(lp); os.push(sq); }
      lp.connect(a); var end = shape(a.gain, t, v * (ev.flavor === 'supersaw' ? 0.58 : 0.8), 0.004, v * (ev.flavor === 'supersaw' ? 0.48 : 0.65), 0.12, off, 0.05);
    } else if (ev.flavor === 'pulse') {   // 칩 리드: 25% 펄스 + 한 옥타브 아래 50% 네모를 조금
      const o = pulse(0.25, f, t, nodes), o2 = pulse(0.5, f / 2, t, nodes), m = gain(0.25, nodes); o2.k = 0.5; o.connect(a); o2.connect(m).connect(a); os.push(o, o2);
      var end = shape(a.gain, t, v * 0.55, 0.002, v * 0.48, 0.15, off, 0.03);
    } else if (ev.flavor === 'soft') {   // 부드러운 리드: 세모파 + 한 옥타브 위 사인 조금, 천천히 피어남
      const o = osc('triangle', f, t, nodes), o2 = osc('sine', f * 2, t, nodes), m = gain(0.22, nodes), lp = filt('lowpass', 3200, 0.5, nodes); o.connect(lp); o2.connect(m).connect(lp); lp.connect(a); os.push(o, o2);
      var end = shape(a.gain, t, v, 0.025, v * 0.85, 0.2, off, 0.09);
    } else if (ev.flavor === 'guitar') {   // 합성 기타 리드: 톱니 둘이 살짝 어긋나고, 처음에 조금 낮게 들어와 제 음으로 올라간다(밀어 올림)
      const o = osc('sawtooth', f, t, nodes), o2 = osc('sawtooth', f, t, nodes), lp = filt('lowpass', Math.min(6000, f * 9), 0.8, nodes); o2.detune.setValueAtTime(-9, t);
      o.detune.setValueAtTime(-35, t); o.detune.setTargetAtTime(0, t, 0.018); o.connect(lp); o2.connect(lp); lp.connect(a); os.push(o, o2);
      var end = shape(a.gain, t, v, 0.003, v * 0.9, 0.15, off, 0.05);
    } else {   // 밝은 리드(아케이드): 네모 + 톱니, 거르개가 열렸다 조금 닫힘
      const o = osc('square', f, t, nodes), o2 = osc('sawtooth', f, t, nodes), lp = filt('lowpass', Math.min(9000, f * 9), 1.2, nodes), m = gain(0.6, nodes); o2.detune.setValueAtTime(7, t);
      lp.frequency.setTargetAtTime(Math.min(6000, f * 4.5), t + 0.01, 0.1); o.connect(lp); o2.connect(m).connect(lp); lp.connect(a); os.push(o, o2);
      var end = shape(a.gain, t, v, 0.005, v * 0.75, 0.12, off, 0.045);
    }
    if (ev.glide !== undefined && NEW_LEADS.has(ev.flavor)) for (const o of os) { const k = o.k || 1; o.frequency.setValueAtTime(hz(ev.glide) * k, t); o.frequency.exponentialRampToValueAtTime(f * k, t + 0.04); }   // 짧은 미끄러짐
    const wobble = !NEW_LEADS.has(ev.flavor) || ev.len >= 6;
    for (const o of os) { if (wobble) vibG.connect(o.detune); o.start(t); o.stop(end); }
    a.connect(dest.in);
    const vce = voiceOf(nodes, os, a, t, end), done = os[os.length - 1].onended; os[os.length - 1].onended = () => { for (const o of os) { try { vibG.disconnect(o.detune); } catch {} } done(); };
    return vce;
  }
  function chord(ev, t, dur) {
    if (!claim(t, true)) return;
    const B = S.buses.B, v = ev.vel / Math.sqrt(ev.midis.length), nodes = [], a = gain(0, nodes), srcs = [], fl = ev.flavor; let end;
    if (fl === 'epiano') {   // 전기 피아노(FM): 사인을 같은 높이의 사인으로 흔들고, 흔드는 폭이 줄어 맑아진다 — 치는 순간 '띵'
      const off = t + Math.max(0.08, dur * 0.95);
      for (const m of ev.midis) { const f = hz(m), c = osc('sine', f, t, nodes), md = osc('sine', f, t, nodes), mg = gain(0, nodes); mg.gain.setValueAtTime(f * 1.6, t); mg.gain.setTargetAtTime(f * 0.18, t, 0.22); md.connect(mg).connect(c.frequency); c.connect(a); srcs.push(md, c); }
      end = shape(a.gain, t, v, 0.004, v * 0.3, 0.7, off, 0.12); a.connect(B.epiano.in);
    } else if (fl === 'brass') {   // 브라스 찌르기: 거르개가 닫힌 채 들어와 25ms 만에 열리고 조금 닫힌다(금관의 '빠-')
      const lp = filt('lowpass', 450, 1.4, nodes); lp.frequency.setTargetAtTime(4200, t, 0.022); lp.frequency.setTargetAtTime(2200, t + 0.07, 0.12);
      ev.midis.forEach((m, i) => { const o = osc('sawtooth', hz(m), t, nodes); o.detune.setValueAtTime(i % 2 ? 9 : -9, t); o.connect(lp); srcs.push(o); });   // 음마다 톱니 하나(값) — 어긋남은 음끼리 번갈아
      lp.connect(a); end = shape(a.gain, t, v * 1.1, 0.012, v * 0.55, 0.1, t + dur * 0.9, 0.05); a.connect(B.brass.in);
    } else if (fl === 'pad') {   // 잔잔한 판: 톱니를 낮게 거르고 천천히 피고 진다
      const lp = filt('lowpass', 1100, 0.5, nodes); for (const m of ev.midis) { const o = osc('sawtooth', hz(m), t, nodes); o.detune.setValueAtTime(hash(m, 3) * 14 - 7, t); o.connect(lp); srcs.push(o); }
      lp.connect(a); end = shape(a.gain, t, v * 0.8, 0.35, v * 0.8, 0.1, t + dur, 0.35); a.connect(B.pad.in);
    } else if (fl === 'power') {   // 합성 기타 파워 코드: 일그러뜨리기 전에 거른다(뮤트면 어둡고 짧게)
      const lp = filt('lowpass', ev.mute ? 650 : 3200, 0.7, nodes); ev.midis.forEach((m, i) => { const o = osc('sawtooth', hz(m), t, nodes); o.connect(lp); srcs.push(o); if (i === 0) { const o2 = osc('square', hz(m), t, nodes), m2 = gain(0.6, nodes); o2.detune.setValueAtTime(5, t); o2.connect(m2).connect(lp); srcs.push(o2); } });   // 네모파 겹은 바탕음에만(값을 아낀다)
      lp.connect(a); end = ev.mute ? shape(a.gain, t, v * 1.1, 0.002, 0.0001, 0.05, t + Math.min(dur, 0.12), 0.02) : shape(a.gain, t, v, 0.002, v * 0.85, 0.4, t + dur * 0.96, 0.04); a.connect(B.power.in);
    } else if (fl === 'stab1') {   // 2차 끊어 치는 화음: 음마다 톱니 하나(값), 거르개가 빨리 닫힘
      const lp = filt('lowpass', 6000, 1.1, nodes); lp.frequency.setTargetAtTime(2400, t + 0.005, 0.07);
      ev.midis.forEach((m, i) => { const o = osc('sawtooth', hz(m), t, nodes); o.detune.setValueAtTime(i % 2 ? 8 : -8, t); o.connect(lp); srcs.push(o); });
      lp.connect(a); end = shape(a.gain, t, v, 0.003, v * 0.55, 0.09, t + dur * 0.9, 0.04); a.connect(B.chord.in);
    } else {   // 끊어 치는 화음(아케이드 스탭): 톱니 둘씩, 거르개가 빨리 닫힘
      const lp = filt('lowpass', 5200, 1.1, nodes); lp.frequency.setTargetAtTime(1900, t + 0.005, 0.07);
      ev.midis.forEach((m, i) => { const o = osc('sawtooth', hz(m), t, nodes), o2 = osc('sawtooth', hz(m), t, nodes); o.detune.setValueAtTime(i % 2 ? 8 : -8, t); o2.detune.setValueAtTime(i % 2 ? -4 : 4, t); o.connect(lp); o2.connect(lp); srcs.push(o, o2); });
      lp.connect(a); end = shape(a.gain, t, v * 0.7, 0.003, v * 0.4, 0.09, t + dur * 0.9, 0.04); a.connect(B.chord.in);
    }
    for (const s of srcs) { s.start(t); s.stop(end); } voiceOf(nodes, srcs, a, t, end);
  }

  function playStep(prog, bar, step, t) {
    const evs = prog.bars[bar].steps[step]; if (!evs.length) return;
    const sd = 60 / prog.bpm / 4, at = t + (step % 2 ? prog.swing * sd : 0);
    if (quiet?.()) return;
    for (const ev of evs) {
      if (mute?.has(ev.inst)) continue;
      if (tracing && trace.length < 100000) trace.push({ inst: ev.inst, t: at, now: ctx.currentTime, bar, step, prog: prog.name });
      const dur = ev.len ? ev.len * sd : 0;
      if (ev.inst === 'lead' || ev.inst === 'lead2' || ev.inst === 'counter') lead(ev, at, dur); else if (ev.inst === 'arp') arp(ev, at, dur); else if (ev.inst === 'bass') bass(ev, at, dur); else if (ev.inst === 'chord') chord(ev, at, dur); else drum(ev, at);
    }
  }
  function setProgram(prog, t, glide = true) {
    S.prog = prog; const f = S.buses.lp.frequency; if (glide) f.setTargetAtTime(prog.lp, t, prog.name === 'lobby' ? 0.4 : 0.15); else f.setValueAtTime(prog.lp, t);
    const d = S.buses.sound.delay?.beats ?? 0.75; S.buses.dly.delayTime.setValueAtTime(d * 60 / prog.bpm, t);
  }
  // 한 칸 앞으로. 마디 끝에서: 끝이면 되돌아가거나 멈추고, 기다리던 구간 바꾸기가 있으면 여기서(박자에 맞게) 바꾼다
  function advance() {
    S.next += 60 / S.prog.bpm / 4; S.step++;
    if (S.step < STEPS) return;
    S.step = 0; S.bar++;
    if (S.bar >= S.prog.bars.length) { if (S.prog.loopFrom == null) { S.ended = true; return; } S.bar = S.prog.loopFrom; S.loops++; }
    if (S.pending) { const p = S.pending; S.pending = null; S.section = p.name; setProgram(p.prog, S.next); if (!p.keepBar) S.bar = p.bar || 0; if (S.bar >= S.prog.bars.length) S.bar = 0; }
  }
  function pump(until) {
    if (!S || S.paused || S.ended) return 0;
    const now = ctx.currentTime; let n = 0;
    while (S.next < until && !S.ended && n < 100000) {
      if (S.next < now - MUSIC.late) stats.skipped++; else playStep(S.prog, S.bar, S.step, S.next);
      advance(); n++;
    }
    return n;
  }
  function tick() {
    if (!S) return;
    const t0 = perf(); pump(ctx.currentTime + MUSIC.lookahead); const ms = perf() - t0;
    stats.ticks++; stats.tickMs += ms; if (ms > stats.tickMax) stats.tickMax = ms;
  }
  const run = () => { if (handle == null && !timer?.manual) handle = clock.every(tick, MUSIC.every); };
  const halt = () => { if (handle != null) { clock.cancel(handle); handle = null; } };

  // 울리는(또는 예약된) 음을 빨리 줄여 끊는다
  function silence(sess, t, tc = 0.015) {
    for (const v of sess.live) {
      try { v.amp.gain.cancelScheduledValues(t); v.amp.gain.setValueAtTime(v.amp.gain.value, t); v.amp.gain.setTargetAtTime(0, t, tc); } catch {}
      for (const s of v.srcs) { try { s.stop(Math.max(t + tc * 6, v.start)); } catch {} }
    }
  }
  function teardown(sess) {
    if (sess.gone) return; sess.gone = true;
    for (const v of sess.live) { for (const s of v.srcs) { try { s.onended = null; s.stop(); } catch {} } for (const n of v.nodes) { try { n.disconnect(); } catch {} } }
    sess.live.clear();
    for (const o of sess.buses.lfos) { try { o.stop(); } catch {} }
    for (const n of sess.buses.own) { try { n.disconnect(); } catch {} }
  }
  function endSession(sess, fade) {
    const t = ctx.currentTime, h = sess.buses.hold.gain;
    sess.paused = true;
    try { h.cancelScheduledValues(t); h.setValueAtTime(h.value, t); h.linearRampToValueAtTime(0, t + Math.max(0.02, fade)); } catch {}
    clock.later(() => teardown(sess), (Math.max(0.02, fade) + 0.1) * 1000);
  }
  function start(id, section, { fade = 0, bar = null } = {}) {
    const c = programOf(id), progName = section === 'result' ? 'result' : section in c.programs ? section : 'race', prog = c.programs[progName];
    if (S) endSession(S, Math.min(0.25, fade || 0.12));
    const t = ctx.currentTime + 0.05;
    S = { id, section: progName, prog, bar: bar ?? 0, step: 0, next: t, loops: 0, pending: null, paused: false, ended: false, live: new Set(), buses: buildBuses(c.sound), compiled: c };
    stats.sessions++;
    setProgram(prog, ctx.currentTime, false);
    const h = S.buses.hold.gain; if (fade > 0) { h.setValueAtTime(0, ctx.currentTime); h.linearRampToValueAtTime(1, t + fade); }
    run(); return true;
  }
  // 같은 곡 안에서 판을 처음부터 다시(로비 ↔ 경주): 울리던 음을 빨리 끊고 이어 간다(소리 길은 그대로)
  function restart(progName, fade) {
    const t = ctx.currentTime; silence(S, t, 0.03);
    S.prog = S.compiled.programs[progName]; S.section = progName; S.bar = 0; S.step = 0; S.next = t + 0.12; S.pending = null; S.ended = false; S.paused = false; setProgram(S.prog, S.next);
    const h = S.buses.hold.gain; h.cancelScheduledValues(t); h.setValueAtTime(fade ? 0 : 1, t + 0.1); if (fade) h.linearRampToValueAtTime(1, t + 0.1 + fade);
  }

  const api = {
    get state() {
      const now = ctx.currentTime; let voices = 0; if (S) for (const v of S.live) if (v.end > now) voices++;
      return { lite: !!L, id: S?.id ?? null, section: S?.section ?? null, bar: S ? S.bar : -1, step: S ? S.step : -1, bars: S ? S.prog.bars.length : 0, bpm: S ? +S.prog.bpm.toFixed(2) : 0, playing: !!S && !S.ended && !S.paused, paused: !!S?.paused, ended: !!S?.ended, pending: S?.pending?.name ?? null, loops: S?.loops ?? 0, voices, volume, ducked: S ? +S.buses.duck.gain.value.toFixed(3) : 1, hold: S ? +S.buses.hold.gain.value.toFixed(3) : 0, ...stats, tickMs: +stats.tickMs.toFixed(3), tickMax: +stats.tickMax.toFixed(3) };
    },
    get trace() { return trace; },
    set tracing(on) { tracing = !!on; },
    compiled: id => programOf(id),
    play(id, { fade = 0, section = 'race', bar = null } = {}) { return start(id, section, { fade, bar }); },
    section(name) {
      if (!S) return false;
      const cur = S.section;
      if (name === 'lobby' || name === 'race') { if (cur === name || (name === 'race' && cur === 'final' && !S.ended)) return false; if (S.paused) return false; restart(name, name === 'lobby' ? 1.2 : 0); return true; }
      if (name === 'final') { if (cur !== 'race' || S.pending) return false; S.pending = { name: 'final', prog: S.compiled.programs.final, keepBar: true }; return true; }
      if (name === 'result') { if ((cur !== 'race' && cur !== 'final') || S.pending?.name === 'result') return false; S.pending = { name: 'result', prog: S.compiled.programs.result, bar: 0 }; return true; }
      return false;
    },
    stop({ fade = 0.5 } = {}) { if (!S) return; const sess = S; S = null; endSession(sess, fade); halt(); },
    setVolume(v) { volume = Math.max(0, Math.min(2, +v || 0)); if (S) S.buses.vol.gain.setTargetAtTime(MUSIC.level * (S.buses.sound.gain ?? 1) * volume, ctx.currentTime, 0.05); },
    duck(level = 1, tc = 0.1) { if (!S) return; const g = S.buses.duck.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(level, t, tc); },
    // 탭 가림 · 직접 멈춤: 자리를 간직하고 조용해진다. 다시 켜면 그 자리에서 이어 간다(그동안의 박자를 몰아서 치지 않는다)
    pause(on) {
      if (!S || S.ended || !!on === S.paused) return;
      const t = ctx.currentTime, h = S.buses.hold.gain; h.cancelScheduledValues(t); h.setValueAtTime(h.value, t);
      if (on) { S.paused = true; h.setTargetAtTime(0, t, 0.04); }
      else { S.paused = false; S.next = t + 0.06; h.setTargetAtTime(1, t + 0.05, 0.1); }
    },
    pump(until) { return pump(until); },   // 미리 그리기(OfflineAudioContext) · 시험용: until 초 앞까지 예약
    tick,
    dispose() { api.stop({ fade: 0.05 }); halt(); },
  };
  return api;
}

// ── 게임에 잇기(main.js 가 소리가 있을 때 부른다 — ?music=off 면 부르지 않는다) ──
// game.phase 를 0.05초마다 보고 구간을 고른다: 시작 화면 · 차고(배경 주행 포함) → lobby, 초읽기 → 줄임(출발 신호가 묻히지 않게), 출발 → race(처음부터), 마지막 바퀴 → final, 결승 → result.
//   스피드전 · 그랑프리는 game.race.laps 로 마지막 바퀴를 안다. 타임어택은 마지막 바퀴가 없어 경주 판이 되풀이되고, 랭킹 화면(finished)에서 맺는다.
// 멈춤은 audio.pause 가 context 를 세워 같이 멈추고, '소리 끔' 은 마스터가 0 이라 같이 꺼진다(그동안은 음을 만들지도 않는다). 탭이 가려지면 pause(true).
// lobby: true 면 시작 화면 어디든 처음 누를 때 소리를 열고 로비 음악을 튼다(브라우저는 누르기 전에는 소리를 못 낸다). false 면 출발한 뒤에만(주소 &musicLobby=0).
// enabled(): 설정의 '음악' 줄(2026-11-24 사용자 "넣어") — 거짓이면 흐르던 곡을 잦아들게 멈추고 새로 틀지 않는다. 다시 참이 되면 그때의 장면(시작 화면 · 경주)에 맞는 판을 처음부터.
export function followGame({ game, audio, id = 'neon', lite = false, lobby = true, enabled = () => true, doc = document, every = 50 }) {
  let music = null, last = '';
  const ensure = () => { if (!music && audio.context && audio.output) { music = createMusic({ context: audio.context, output: audio.output, quiet: () => audio.muted, lite }); game.music = music; } return music; };
  if (lobby) { const first = () => { doc.removeEventListener('pointerdown', first, true); doc.removeEventListener('keydown', first, true); audio.unlock(); watch(); }; doc.addEventListener('pointerdown', first, true); doc.addEventListener('keydown', first, true); }
  doc.addEventListener('visibilitychange', () => music?.pause(doc.hidden));
  function watch() {
    if (!enabled()) { if (music && (music.state.playing || music.state.pending)) music.stop({ fade: 0.6 }); last = game.phase; return; }
    const m = ensure(); if (!m) return;
    const phase = game.phase, st = m.state, sec = st.playing || st.pending ? st.section : null;
    if (phase === 'ready' || phase === 'garage') {
      if (lobby) { if (!st.id || st.ended) m.play(id, { section: 'lobby', fade: 1.5 }); else if (sec !== 'lobby' && !(st.section === 'lobby' && st.paused)) m.section('lobby'); m.duck(1, 0.3); }
      else if (st.playing) m.stop({ fade: 1 });
    } else if (phase === 'countdown') { if (last !== 'countdown') m.duck(0.15, 0.12); }
    else if (phase === 'racing') {
      if (last === 'countdown' || !st.id || st.ended || st.section === 'lobby') { m.duck(1, 0.01); m.play(id, { section: 'race' }); }
      const race = game.race; if (race && game.laps.length + 1 >= race.laps && m.state.section === 'race') m.section('final');
    } else if (phase === 'finished') { if (sec === 'race' || sec === 'final') m.section('result'); }
    last = phase;
  }
  setInterval(watch, every);
  return { get music() { return music; } };
}
