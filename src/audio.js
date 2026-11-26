// 소리 — 파일 없이 Web Audio 로 합성한다: 레이싱 엔진(고회전 + 변속), 드리프트 타이어, 부스터, 벽 · 착지, 출발 신호 · 기록 알림.
// 2026-11-21 사용자가 듣기 시안(시안/소리_듣기.html)에서 고른 것을 옮겼다: 전부 후보 B(레이싱 엔진), 드리프트 타이어만 다시 골라 b3(걸리는 순간의 짧은 끼익 뒤 쓸림).
//   원본은 시안/소리_src/audio-b.js — 여기는 드리프트의 기본값만 'b3' 로 바꾼 사본이다. 타이어의 다른 후보('old' · 'b1' · 'b2')는 견줘 보려고 남아 있다(createAudio({ tyre })).
//   그 전의 맨 오실레이터 소리는 사용자가 "너무 기계 합성음 같다"고 했다.
// 브라우저는 사용자가 한 번 누르기 전에는 소리를 못 내므로 unlock() 을 '출발' 누를 때 부른다. M 키로 끄고 켠다.
//   createAudio({ car }) → { muted, state, unlock(), pause(on), setMuted(v), update(view), count(final), lap(best), setCar(id), car, engine, horn(on), honking }
//   horn(on): 지금 차(setCar 에 준 차 id)의 경적(src/horn.js 의 CAR_HORN)을 누르는 동안 울리고 떼면 멈춘다 — out(마스터)에 낸다. 소리 끔 · 멈춤(suspend) 중에는 안 난다.
//     자전거 '땡' · 독수리 울음처럼 한 번 치는 소리는 누를 때 한 번. 경적은 제 난수(seed)만 써서 다른 소리의 Math.random 차례를 건드리지 않는다.
//   car 를 주지 않으면 지금 소리 그대로다. 차마다의 목소리는 아래 ENGINES(2026-11-24 시안 — 사용자 승인 전이라 게임은 아직 car 를 넘기지 않는다).
//   무전(src/radio.js)이 붙는 자리: context · output(마스터 — 소리 끔이 듣는다) · duck(level, tc, at)(엔진 · 바람 · 타이어만 줄임) · ducked(지금 줄인 배율)
// 엔진은 한 바퀴에 네 번 터지는 점화(세기 · 자리가 조금씩 고르지 않게)를 그린 버퍼를 playbackRate 로 돌리고, 낮은 회전 · 높은 회전, 밟을 때 · 뗄 때 버퍼 넷을 섞는다.
// 변속: 속도가 오르면 회전이 치솟다가 변속 때 뚝 떨어지고 다시 오른다. 가속을 떼면 잦아들며 '타닥' 터지는 소리(역화)가 난다.
import { createHorn, hornOf } from './horn.js';

export const SOUND = {
  master: 0.6,
  engine: 0.09,          // 엔진 크기(밟았을 때)
  engineOff: 0.8,        // 뗐을 때 버퍼의 상대 크기
  idleRpm: 4200,         // 서 있을 때 회전수
  redline: 13000,        // 기어마다 이 회전에서 아래 최고 속도가 된다
  gears: [6.5, 11, 15.5, 20, 25, 30.5, 36],   // 기어별 최고 속도(m/s)
  shiftUp: 12600, shiftDown: 6800,             // 올리고 내리는 회전수
  launchRpm: 5200,       // 서서 밟을 때 1단에서 더 오르는 폭
  boostRpm: 500,
  screech: 0.1, boost: 0.2,
};
const KEY = 'campus-kart:muted';
const LAYERS = { low: 90, high: 175 };   // 버퍼마다 그려 둔 초당 회전(이 값에서 playbackRate 1). 점화는 그 네 배.

// ── 차마다의 엔진 목소리(2026-11-24 듣기 시안 시안/차소리_듣기.html — 사용자가 고르기 전) ──
// 합성 방식은 그대로다(점화 줄 버퍼 넷을 playbackRate 로 돌려 섞기). 차마다 바뀌는 것: 점화 무늬(기통 수 · 고르기) · 울림 · 회전 범위 · 변속 · 거르개 · 역화 · 덧소리.
// 차를 주지 않으면 'race'(지금 소리)이고, 그때는 회전 값을 SOUND(tuning)에서 읽는다 — 그 전과 표본 단위로 같다(시안/차소리_src/check.mjs ⑤).
//   createAudio({ car }) · audio.setCar(id): id 는 차 id(CARS) 또는 목소리 id(ENGINES). 모르는 id 면 'race'.
// 값의 뜻(없는 값은 ENGINE_BASE = 지금 소리의 값):
//   revs 버퍼 한 주기가 몇 바퀴인지(점화 무늬 한 벌) · fires 한 바퀴의 점화 수(재기용) · layers 버퍼의 초당 주기(이 값에서 playbackRate 1)
//   idle · redline · gears(기어별 최고 속도 m/s) · up · down(변속 회전) · launch(서서 밟을 때 더 오르는 폭) · launchFade(0 이면 속도와 상관없이 밟은 만큼 — 토크 컨버터)
//   cut(변속 때 힘이 끊기는 초) · cutLoad(그동안의 부하) · upGap · downGap(변속 사이 최소 간격) · settle · tau([변속 직후, 오를 때, 내릴 때] 회전이 따라가는 시간)
//   blend([낮은 버퍼 → 높은 버퍼로 넘어가기 시작하는 회전, 넘어가는 폭]) · drive · hp · lp([기본, 부하 몫, 회전 몫]) · scream([Hz, Q, 기본, 부하 × 회전 몫]) · intake([Hz, Q, 크기])
//   gain(엔진 크기 배율 — 차끼리 체감 크기를 맞춘 값) · load([기본, 부하 몫]) · off(뗐을 때 버퍼의 크기) · still([서 있을 때의 크기, 다 커지는 속도] — 전기 · 굴러가는 소리)
//   pops(뗐을 때 '타닥' — null 이면 없음) · popBand · click(올림 변속 소리) · hiss(올림 변속 때 공기 '칙') · turbo · rumble(구동계 · 바퀴 · 차체 잡음 — speed 를 주면 그 속도에서 다 커짐) · pump(회전에 묶인 윙) · clunk(밟는 순간 '턱')
const V8 = [[0, 1], [0.26, 0.82], [0.49, 0.95], [0.76, 0.78]];
const ON_RES = [[380, 0.0022, 0.45], [900, 0.0016, 0.5], [2400, 0.0009, 0.55], [4300, 0.0005, 0.25]];
const ENGINE_BASE = {
  name: '지금 소리', revs: 1, fires: 4, layers: LAYERS,
  idle: 4200, redline: 13000, gears: [6.5, 11, 15.5, 20, 25, 30.5, 36], up: 12600, down: 6800, launch: 5200, launchFade: 1, boostRpm: 500, over: 300,
  cut: 0.06, cutLoad: 0.08, upGap: 0.12, downGap: 0.25, settle: 0.1, tau: [0.03, 0.05, 0.09], loadTau: [0.012, 0.05], wob: 0.004,
  blend: [6500, 3500], drive: [1.1, 2.2], hp: 90, lp: [1000, 3800, 0.3], lpQ: 1.1, scream: [2100, 1.3, 0.08, 0.45], intake: [2800, 0.6, 0.045],
  gain: 1, load: [0.6, 0.4], off: 0.8, still: null,
  pops: { min: 7000, span: 4000, rate: 9 }, popBand: [700, 1300], click: { from: 1400, q: 1, seconds: 0.05, level: 0.09 }, hiss: null, turbo: null, rumble: null, clunk: null,
  buffers: {
    lowOn: { seconds: 1.4, pattern: V8, jitterT: 0.02, jitterA: 0.12, weak: 0.02, len: 0.008, bump: 0.0004, res: ON_RES, noise: 0.3, noiseDecay: 0.0008, seed: 31 },
    lowOff: { seconds: 1.4, pattern: V8, jitterT: 0.04, jitterA: 0.35, weak: 0.35, len: 0.008, bump: 0.0003, res: [[800, 0.0014, 0.4], [2000, 0.0007, 0.2]], noise: 0.55, noiseDecay: 0.0007, seed: 32 },
    highOn: { seconds: 1.2, pattern: V8, jitterT: 0.015, jitterA: 0.1, weak: 0.01, len: 0.006, bump: 0.0003, res: ON_RES, noise: 0.25, noiseDecay: 0.0006, seed: 33 },
    highOff: { seconds: 1.2, pattern: V8, jitterT: 0.035, jitterA: 0.3, weak: 0.3, len: 0.006, bump: 0.00025, res: [[800, 0.0012, 0.4], [2100, 0.0006, 0.2]], noise: 0.5, noiseDecay: 0.0005, seed: 34 },
  },
};
// 점화 무늬 — [한 주기 안의 자리 0~1, 세기]
const EVEN = n => Array.from({ length: n }, (_, i) => [i / n, [1, 0.9, 0.97, 0.88, 0.95, 0.93][i % 6]]);
const CROSS = [[0, 1], [0.127, 0.62], [0.248, 0.92], [0.377, 1.05], [0.5, 0.6], [0.623, 0.98], [0.752, 0.7], [0.874, 1.0]];   // 두 바퀴에 여덟 번, 두 뱅크가 엇갈려 세기가 고르지 않다 → 두 바퀴마다 '두둥' 하는 낮은 울렁임
const ROUGH8 = [[0, 1], [0.13, 0.55], [0.245, 0.95], [0.385, 1.1], [0.5, 0.5], [0.6, 1.0], [0.76, 0.62], [0.87, 1.05]];
// 점화 버퍼 넷을 한 묶음으로: on · off 의 울림 · 잡음을 받아 낮은 · 높은 주기에 같은 무늬로 그린다
function pulses(pattern, { on, off, len, bump, noise, offNoise, decay = 0.0008, jit = [0.02, 0.04], amp = [0.1, 0.32], weak = [0.02, 0.3], seconds = [1.4, 1.2], seed }) {
  const one = (k, isOn, s) => ({ seconds: seconds[k], pattern, jitterT: jit[isOn ? 0 : 1], jitterA: amp[isOn ? 0 : 1], weak: weak[isOn ? 0 : 1], len: len * (k ? 0.8 : 1), bump: bump * (isOn ? 1 : 0.75), res: isOn ? on : off, noise: isOn ? noise : offNoise, noiseDecay: decay * (isOn ? 1 : 0.85), seed: seed + s });
  return { lowOn: one(0, true, 0), lowOff: one(0, false, 1), highOn: one(1, true, 2), highOff: one(1, false, 3) };
}
// 전기 모터 버퍼 넷: hum 으로 그린다(partials 는 한 바퀴의 배수 — 주기 수와 곱해 정수가 되게 고른다)
function hums({ partials, offPartials, ripple, noise, band, seed }) {
  const one = (isOn, s, bright) => ({ kind: 'hum', seconds: 1.2, partials: (isOn ? partials : offPartials).map(([k, a, w]) => [k, a * (k >= 8 ? bright : 1), w]), ripple, noise: noise * (isOn ? 1 : 0.6), band, seed: seed + s });
  return { lowOn: one(true, 0, 0.8), lowOff: one(false, 1, 0.8), highOn: one(true, 2, 1.25), highOff: one(false, 3, 1.25) };
}
const DIESEL_CLICK = { type: 'lowpass', from: 420, q: 0.8, seconds: 0.09, level: 0.06 };
export const ENGINES = {
  race: { name: '지금 소리' },
  // 포뮬러: 가장 높고 날카롭게 — 고른 열 번 점화(V10 꼴) · 한계 18,000 · 8단 · 아주 빠른 변속(끊김 25ms)
  formula: { name: '포뮬러 — 고회전 V10', fires: 5, layers: { low: 120, high: 250 }, idle: 5000, redline: 18000, gears: [6, 9.5, 13, 16.5, 20.5, 25, 30, 36], up: 17500, down: 11500, launch: 6500, boostRpm: 700,
    cut: 0.025, upGap: 0.08, settle: 0.06, tau: [0.02, 0.035, 0.07], blend: [9000, 5000], drive: [1.2, 2.4], hp: 150, lp: [1400, 4200, 0.3], scream: [3300, 1.8, 0.1, 0.6], intake: [3600, 0.7, 0.05],
    gain: 0.83, pops: { min: 10000, span: 6000, rate: 10 }, popBand: [1200, 1800], click: { from: 2400, q: 1.2, seconds: 0.03, level: 0.08 },
    buffers: pulses(EVEN(5), { on: [[650, 0.0012, 0.3], [1600, 0.001, 0.5], [3400, 0.0007, 0.65], [5600, 0.0004, 0.35]], off: [[1000, 0.001, 0.4], [2600, 0.0006, 0.3]], len: 0.005, bump: 0.00025, noise: 0.18, offNoise: 0.45, decay: 0.0005, jit: [0.01, 0.03], amp: [0.07, 0.3], weak: [0.005, 0.25], seconds: [1.2, 1.0], seed: 110 }) },
  // 포뮬러 B: 터보 V6 — 회전은 덜 높고(12,500) 굵으며, 위에 터보 휘파람
  formula_v6: { name: '포뮬러 — 터보 V6', fires: 3, layers: { low: 85, high: 180 }, idle: 4000, redline: 12500, gears: [6, 9.5, 13, 16.5, 20.5, 25, 30, 36], up: 12100, down: 8000, launch: 5000,
    cut: 0.03, upGap: 0.08, settle: 0.06, tau: [0.02, 0.04, 0.08], blend: [6500, 3500], drive: [1.2, 2.3], hp: 110, lp: [1200, 3600, 0.3], scream: [2500, 1.4, 0.08, 0.4], intake: [3000, 0.6, 0.03],
    gain: 1, pops: { min: 8000, span: 4000, rate: 6 }, popBand: [900, 1500], click: { from: 2000, q: 1.2, seconds: 0.035, level: 0.07 }, turbo: { f: [3500, 9000], q: 22, level: 0.3, bov: 0 },
    buffers: pulses(EVEN(3), { on: [[480, 0.0018, 0.45], [1200, 0.0013, 0.55], [2700, 0.0008, 0.5], [4400, 0.0005, 0.25]], off: [[850, 0.0013, 0.4], [2100, 0.0007, 0.25]], len: 0.008, bump: 0.0004, noise: 0.3, offNoise: 0.55, decay: 0.0007, seed: 120 }) },
  // GT: 낮고 두꺼운 V8 — 두 바퀴에 여덟 번 고르지 않게(두둥 두둥) · 900 ~ 7,000 · 6단 · 굵은 '퍽' 역화
  gt: { name: 'GT — 낮고 굵은 V8', revs: 2, fires: 4, layers: { low: 16, high: 45 }, idle: 900, redline: 7000, gears: [8, 13, 18, 23.5, 29.5, 36], up: 6700, down: 3800, launch: 2400, boostRpm: 300,
    cut: 0.08, upGap: 0.15, settle: 0.12, tau: [0.04, 0.08, 0.14], wob: 0.006, blend: [2600, 2400], drive: [1.3, 2.4], hp: 45, lp: [700, 2600, 0.35], scream: [1100, 0.9, 0.05, 0.25], intake: [1600, 0.6, 0.03],
    gain: 1.13, load: [0.65, 0.35], pops: { min: 3500, span: 3000, rate: 7 }, popBand: [400, 900], click: { from: 900, q: 0.9, seconds: 0.06, level: 0.07 },
    buffers: pulses(CROSS, { on: [[160, 0.006, 0.8], [420, 0.0035, 0.6], [1100, 0.0018, 0.35], [2400, 0.0008, 0.2]], off: [[220, 0.005, 0.6], [700, 0.0025, 0.45], [1800, 0.001, 0.25]], len: 0.022, bump: 0.0012, noise: 0.35, offNoise: 0.6, decay: 0.0015, jit: [0.025, 0.045], amp: [0.1, 0.35], seed: 131 }) },
  // 슈퍼카: GT 보다 높고 매끈하게 — 고른 열두 기통(한 바퀴 여섯 번) · 1,100 ~ 8,500 · 긴 6단 · 잡음 · 흔들림 적게(지금 소리의 거친 '으르렁' 과 갈리게)
  supercar: { name: '슈퍼카 — 매끈한 V12', fires: 6, layers: { low: 36, high: 110 }, idle: 1100, redline: 8500, gears: [8.5, 13.5, 18.5, 24, 30, 36], up: 8200, down: 4800, launch: 2800, boostRpm: 400,
    cut: 0.05, settle: 0.08, tau: [0.03, 0.06, 0.11], wob: 0.0015, blend: [3200, 3300], drive: [0.9, 1.5], hp: 60, lp: [800, 3000, 0.4], scream: [1900, 1.2, 0.06, 0.3], intake: [2600, 0.6, 0.04],
    gain: 1.05, pops: { min: 5000, span: 3500, rate: 6 }, popBand: [600, 1200], click: { from: 1500, q: 1, seconds: 0.045, level: 0.07 },
    buffers: pulses(EVEN(6), { on: [[420, 0.0024, 0.5], [1050, 0.0017, 0.55], [2300, 0.001, 0.4], [4200, 0.0004, 0.15]], off: [[800, 0.0014, 0.4], [1900, 0.0008, 0.25]], len: 0.01, bump: 0.0005, noise: 0.07, offNoise: 0.25, decay: 0.0006, jit: [0.004, 0.015], amp: [0.03, 0.18], weak: [0, 0.12], seed: 140 }) },
  // 스포츠 세단: 차분한 4기통 터보 — 850 ~ 6,500 · 6단 · 역화 없음 · 터보 휘파람과 뗄 때 '피시'
  sedan: { name: '스포츠 세단 — 4기통 터보', fires: 2, layers: { low: 28, high: 80 }, idle: 850, redline: 6500, gears: [8.5, 14, 19.5, 25, 30.5, 36], up: 6200, down: 3200, launch: 1800, boostRpm: 250,
    cut: 0.1, upGap: 0.2, settle: 0.15, tau: [0.06, 0.1, 0.16], wob: 0.002, blend: [2500, 2500], drive: [0.9, 1.2], hp: 50, lp: [600, 1800, 0.35], scream: [1300, 1.0, 0.03, 0.12], intake: [2000, 0.6, 0.02],
    gain: 1.62, pops: null, click: { from: 1100, q: 1, seconds: 0.04, level: 0.03 }, turbo: { f: [1800, 5200], q: 14, level: 0.22, bov: 0.08 },
    buffers: pulses(EVEN(2), { on: [[220, 0.004, 0.6], [620, 0.0025, 0.45], [1500, 0.0012, 0.25]], off: [[260, 0.004, 0.5], [800, 0.002, 0.3]], len: 0.02, bump: 0.0012, noise: 0.18, offNoise: 0.25, decay: 0.001, jit: [0.012, 0.02], amp: [0.05, 0.15], weak: [0, 0.05], seed: 150 }) },
  // 레이싱 카트: 작은 단기통(한 바퀴 한 번) 2행정의 앵앵 — 기어 없이 바퀴에 바로(원심 클러치) · 2,600 ~ 15,000 · 가볍게 빨리 오르내림
  kart: { name: '카트 — 단기통 직결', fires: 1, layers: { low: 85, high: 200 }, idle: 2600, redline: 15000, gears: [33], up: 99999, down: 0, launch: 5400, boostRpm: 600,
    tau: [0.02, 0.03, 0.05], wob: 0.006, blend: [6000, 5000], drive: [1.3, 2.4], hp: 110, lp: [1200, 3600, 0.3], scream: [1700, 2.2, 0.1, 0.55], intake: [2200, 0.7, 0.04],
    gain: 1.6, pops: { min: 7000, span: 6000, rate: 5 }, popBand: [900, 1500], click: null,
    buffers: pulses([[0, 1]], { on: [[700, 0.003, 0.7], [1500, 0.0018, 0.55], [2900, 0.001, 0.45], [4600, 0.0005, 0.25]], off: [[900, 0.002, 0.5], [2400, 0.001, 0.3]], len: 0.012, bump: 0.0005, noise: 0.5, offNoise: 0.7, decay: 0.0012, amp: [0.15, 0.4], weak: [0.03, 0.45], seed: 160 }) },
  // 카트 B: 6단 변속 카트 — 같은 단기통에 변속이 있다(톱니처럼 오르내림)
  kart_shift: { name: '카트 — 단기통 6단', fires: 1, layers: { low: 85, high: 200 }, idle: 2600, redline: 14500, gears: [7, 11.5, 16, 21, 27, 34], up: 14000, down: 9000, launch: 5400, boostRpm: 600,
    cut: 0.03, upGap: 0.1, settle: 0.06, tau: [0.02, 0.03, 0.05], wob: 0.006, blend: [6000, 5000], drive: [1.3, 2.4], hp: 110, lp: [1200, 3600, 0.3], scream: [1700, 2.2, 0.1, 0.55], intake: [2200, 0.7, 0.04],
    gain: 1.4, pops: { min: 7000, span: 6000, rate: 5 }, popBand: [900, 1500], click: { from: 1800, q: 1, seconds: 0.04, level: 0.07 },
    buffers: pulses([[0, 1]], { on: [[700, 0.003, 0.7], [1500, 0.0018, 0.55], [2900, 0.001, 0.45], [4600, 0.0005, 0.25]], off: [[900, 0.002, 0.5], [2400, 0.001, 0.3]], len: 0.012, bump: 0.0005, noise: 0.5, offNoise: 0.7, decay: 0.0012, amp: [0.15, 0.4], weak: [0.03, 0.45], seed: 160 }) },
  // 트럭: 직렬 6기통 디젤 — 덜덜거리는 점화(짧고 마른 '틱' + 낮은 배기) · 650 ~ 2,500 · 7단 · 느린 변속(0.35초 끊김) · 낮은 터보
  truck: { name: '트럭 — 직렬 6 디젤', fires: 3, layers: { low: 16, high: 32 }, idle: 650, redline: 2500, gears: [4.5, 7, 10.5, 15, 20.5, 27.5, 36], up: 2300, down: 1350, launch: 700, boostRpm: 100, over: 80,
    cut: 0.35, cutLoad: 0.15, upGap: 0.6, downGap: 0.8, settle: 0.4, tau: [0.12, 0.18, 0.3], loadTau: [0.08, 0.12], wob: 0.006, blend: [1000, 900], drive: [1.0, 1.6], hp: 35, lp: [600, 2200, 0.9], scream: [900, 0.8, 0.04, 0.15], intake: [1200, 0.6, 0.02],
    gain: 1.62, load: [0.7, 0.3], pops: null, click: DIESEL_CLICK, turbo: { f: [1200, 3000], q: 10, level: 0.12, bov: 0 },
    buffers: pulses(EVEN(3), { on: [[95, 0.012, 0.9], [230, 0.007, 0.6], [1700, 0.0007, 0.7], [3100, 0.0004, 0.45]], off: [[120, 0.01, 0.6], [1900, 0.0006, 0.55], [3300, 0.0004, 0.4]], len: 0.035, bump: 0.0015, noise: 0.45, offNoise: 0.55, decay: 0.0006, jit: [0.03, 0.04], amp: [0.12, 0.25], weak: [0.03, 0.12], seed: 170 }) },
  // 트럭 B: 거친 V8 디젤 + 엔진 브레이크 — 뗐을 때 '다다다' 하고 거칠게 운다
  truck_v8: { name: '트럭 — V8 디젤 · 엔진 브레이크', revs: 2, fires: 4, layers: { low: 9, high: 18 }, idle: 600, redline: 2400, gears: [4.5, 7, 10.5, 15, 20.5, 27.5, 36], up: 2200, down: 1300, launch: 700, boostRpm: 100, over: 80,
    cut: 0.35, cutLoad: 0.15, upGap: 0.6, downGap: 0.8, settle: 0.4, tau: [0.12, 0.18, 0.3], loadTau: [0.08, 0.12], wob: 0.008, blend: [1000, 900], drive: [1.1, 1.8], hp: 35, lp: [900, 2000, 0.9], scream: [1100, 0.8, 0.06, 0.15], intake: [1200, 0.6, 0.02],
    gain: 1.8, load: [0.7, 0.3], off: 1.3, pops: null, click: DIESEL_CLICK,
    buffers: pulses(ROUGH8, { on: [[85, 0.012, 0.9], [260, 0.006, 0.6], [1500, 0.0008, 0.75], [2800, 0.0005, 0.5]], off: [[300, 0.003, 0.6], [1200, 0.0015, 0.6], [2600, 0.0007, 0.5]], len: 0.035, bump: 0.0015, noise: 0.55, offNoise: 0.8, decay: 0.0006, jit: [0.03, 0.03], amp: [0.2, 0.15], weak: [0.03, 0.05], seed: 180 }) },
  // 청소차: 더 크고 무거운 직렬 6 디젤 — 500 ~ 1,800 · 자동 6단(뭉개지는 느린 변속) · 차체 쇳소리(속도만큼 덜그럭) · 올릴 때 공기 '칙'
  garbage: { name: '청소차 — 무거운 디젤', fires: 3, layers: { low: 12, high: 25 }, idle: 500, redline: 1800, gears: [5, 8.5, 13, 19, 27, 36], up: 1700, down: 1000, launch: 550, boostRpm: 70, over: 60,
    cut: 0.45, cutLoad: 0.45, upGap: 0.7, downGap: 0.9, settle: 0.5, tau: [0.18, 0.22, 0.35], loadTau: [0.1, 0.14], wob: 0.008, blend: [800, 750], drive: [1.1, 1.7], hp: 30, lp: [500, 1700, 1.0], scream: [650, 0.8, 0.05, 0.15], intake: [900, 0.6, 0.015],
    gain: 1.75, load: [0.72, 0.28], pops: null, click: DIESEL_CLICK, hiss: { type: 'highpass', from: 4200, q: 0.7, seconds: 0.14, level: 0.025, delay: 0.08 }, rumble: { f: [2300, 12], q: 3, level: 0.03, speed: 22 },
    buffers: pulses(EVEN(3), { on: [[62, 0.016, 1.0], [160, 0.009, 0.6], [1150, 0.001, 0.55], [2900, 0.004, 0.2], [4100, 0.003, 0.15]], off: [[85, 0.014, 0.7], [1300, 0.0009, 0.5], [2900, 0.004, 0.2], [4100, 0.003, 0.18]], len: 0.045, bump: 0.002, noise: 0.45, offNoise: 0.55, decay: 0.0008, jit: [0.035, 0.045], amp: [0.14, 0.28], weak: [0.04, 0.14], seed: 190 }) },
  // 지게차: 작은 3기통 디젤(두 바퀴에 세 번 — 통통통) + 토크 컨버터 — 회전이 속도보다 페달을 따른다(밟으면 바로 오르고 변속이 없다) · 엔진에 물린 유압 펌프의 윙
  forklift: { name: '지게차 — 작은 3기통 디젤', revs: 2, fires: 1.5, layers: { low: 10, high: 21 }, idle: 850, redline: 2900, gears: [30], up: 99999, down: 0, launch: 1700, launchFade: 0, boostRpm: 150, over: 100,
    tau: [0.1, 0.15, 0.25], loadTau: [0.05, 0.08], wob: 0.006, blend: [1400, 900], drive: [1.0, 1.5], hp: 45, lp: [800, 2400, 0.8], scream: [1800, 1.0, 0.05, 0.2], intake: [1600, 0.6, 0.015],
    gain: 2.1, load: [0.7, 0.3], pops: null, click: null, pump: { k: 0.55, q: 18, level: 0.05 },
    buffers: pulses(EVEN(3), { on: [[150, 0.007, 0.7], [420, 0.004, 0.5], [2400, 0.0006, 0.8], [3900, 0.0004, 0.45]], off: [[180, 0.006, 0.6], [2500, 0.0005, 0.55]], len: 0.03, bump: 0.001, noise: 0.55, offNoise: 0.6, decay: 0.0005, jit: [0.03, 0.04], amp: [0.12, 0.22], weak: [0.03, 0.1], seed: 200 }) },
  // 지게차 B: 전동 — 골프 카트보다 낮고 굵은 모터 윙 + 밟는 순간 접촉기 '턱'
  forklift_ev: { name: '지게차 — 전동', fires: 0, layers: { low: 30, high: 60 }, idle: 0, redline: 3600, gears: [36], up: 99999, down: 0, launch: 0, boostRpm: 150, over: 200,
    tau: [0.05, 0.08, 0.1], loadTau: [0.03, 0.06], wob: 0.0008, blend: [900, 1800], drive: [0.5, 0.3], hp: 50, lp: [1200, 1500, 0.4], scream: [1200, 2, 0.03, 0.1], intake: [1000, 0.6, 0],
    gain: 2.4, load: [0.55, 0.45], off: 0.5, still: [0, 4], pops: null, click: null, rumble: { f: [250, 15], q: 0.7, level: 0.03 }, clunk: { type: 'lowpass', from: 520, to: 200, q: 0.8, seconds: 0.07, level: 0.07 },
    buffers: hums({ partials: [[1, 0.35], [3, 1], [6, 0.4], [7.5, 0.4], [12, 0.15]], offPartials: [[1, 0.3], [3, 0.7], [6, 0.2], [7.5, 0.25]], ripple: 0.2, noise: 0.2, band: [400, 2000], seed: 210 }) },
  // 골프 카트: 전기 모터의 윙 — 점화 없이 속도에 따라 오르는 배음 + 기어 물림 + 바퀴 · 구동계 잡음. 서 있으면 조용하다
  golf: { name: '골프 카트 — 교류 모터', fires: 0, layers: { low: 30, high: 60 }, idle: 0, redline: 4800, gears: [36], up: 99999, down: 0, launch: 0, boostRpm: 200, over: 300,
    tau: [0.05, 0.06, 0.08], loadTau: [0.03, 0.05], wob: 0.0005, blend: [1200, 2400], drive: [0.5, 0.3], hp: 60, lp: [1500, 1500, 0.3], scream: [1800, 3, 0.03, 0.1], intake: [1000, 0.6, 0],
    gain: 1.9, load: [0.55, 0.45], off: 0.5, still: [0, 4], pops: null, click: null, rumble: { f: [300, 25], q: 0.7, level: 0.03 },
    buffers: hums({ partials: [[1, 0.25], [2, 0.2], [6, 1], [12, 0.35], [13.5, 0.3], [18, 0.15], [36, 0.05]], offPartials: [[1, 0.2], [2, 0.15], [6, 0.7], [12, 0.2], [13.5, 0.15]], ripple: 0.15, noise: 0.12, band: [600, 3500], seed: 220 }) },
  // 골프 카트 B: 직류 모터 — 더 낮은 윙에 브러시의 '쉬' 잡음과 덜그럭거림이 섞인다
  golf_dc: { name: '골프 카트 — 직류 모터', fires: 0, layers: { low: 30, high: 60 }, idle: 0, redline: 4800, gears: [36], up: 99999, down: 0, launch: 0, boostRpm: 200, over: 300,
    tau: [0.05, 0.06, 0.08], loadTau: [0.03, 0.05], wob: 0.0015, blend: [1200, 2400], drive: [0.7, 0.5], hp: 60, lp: [1800, 2000, 0.4], scream: [1400, 2, 0.04, 0.12], intake: [1000, 0.6, 0],
    gain: 1.78, load: [0.5, 0.5], off: 0.45, still: [0, 4], pops: null, click: null, rumble: { f: [260, 22], q: 0.6, level: 0.045 },
    buffers: hums({ partials: [[1, 0.3], [2, 0.25], [4, 1], [8, 0.4], [9.5, 0.35], [16, 0.15]], offPartials: [[1, 0.25], [2, 0.2], [4, 0.6], [8, 0.2]], ripple: 0.3, noise: 0.45, band: [2000, 6000], seed: 230 }) },
  // 장보기 카트: 엔진 없음 — 바퀴가 덜컹이며 철망을 떨게 한다(쇳소리 울림 + 바퀴 쿵). 속도만큼 촘촘하고 커진다(게임 속도에 맞게 과장)
  cart: { name: '장보기 카트 — 굴러가는 소리', fires: 0, layers: { low: 7, high: 7 }, idle: 0, redline: 630, gears: [30], up: 99999, down: 0, launch: 0, boostRpm: 40, over: 200,
    tau: [0.05, 0.06, 0.06], loadTau: [0.05, 0.05], wob: 0.02, blend: [250, 300], drive: [0.6, 0], hp: 80, lp: [3000, 0, 2], scream: [2400, 2, 0.1, 0], intake: [1000, 0.6, 0],
    gain: 5.5, load: [1, 0], off: 1, still: [0, 8], pops: null, click: null, rumble: { f: [400, 30], q: 0.6, level: 0.05 },
    buffers: {
      lowOn: { seconds: 2, pattern: [[0, 1], [0.23, 0.5], [0.41, 0.75], [0.67, 0.4], [0.82, 0.6]], jitterT: 0.15, jitterA: 0.4, weak: 0.35, len: 0.06, bump: 0.0015, res: [[240, 0.006, 0.7], [1150, 0.02, 0.35], [1720, 0.016, 0.3], [2630, 0.012, 0.28], [3870, 0.008, 0.2]], noise: 0.6, noiseDecay: 0.004, seed: 241 },
      lowOff: { seconds: 2, pattern: [[0, 1], [0.19, 0.45], [0.44, 0.8], [0.63, 0.35], [0.86, 0.55]], jitterT: 0.15, jitterA: 0.4, weak: 0.35, len: 0.06, bump: 0.0015, res: [[250, 0.006, 0.7], [1180, 0.02, 0.35], [1690, 0.016, 0.3], [2600, 0.012, 0.28], [3900, 0.008, 0.2]], noise: 0.6, noiseDecay: 0.004, seed: 242 },
      highOn: { seconds: 2, pattern: [[0, 1], [0.11, 0.4], [0.22, 0.6], [0.35, 0.35], [0.47, 0.7], [0.58, 0.4], [0.71, 0.55], [0.83, 0.3], [0.92, 0.5]], jitterT: 0.12, jitterA: 0.45, weak: 0.3, len: 0.05, bump: 0.0012, res: [[260, 0.005, 0.6], [1150, 0.018, 0.4], [1720, 0.014, 0.35], [2630, 0.01, 0.3], [3870, 0.007, 0.22]], noise: 0.7, noiseDecay: 0.003, seed: 243 },
      highOff: { seconds: 2, pattern: [[0, 1], [0.13, 0.45], [0.25, 0.55], [0.37, 0.3], [0.5, 0.75], [0.61, 0.35], [0.73, 0.5], [0.85, 0.35], [0.94, 0.45]], jitterT: 0.12, jitterA: 0.45, weak: 0.3, len: 0.05, bump: 0.0012, res: [[255, 0.005, 0.6], [1180, 0.018, 0.4], [1690, 0.014, 0.35], [2600, 0.01, 0.3], [3900, 0.007, 0.22]], noise: 0.7, noiseDecay: 0.003, seed: 244 },
    } },
  // 자전거(2026-11-24 — 메인이 장보기 카트의 구르는 소리에서 지었다, 사용자가 듣기 전): 엔진 없이 — 체인 · 프리휠의 촘촘하고 가벼운 톡톡 + 타이어가 길을 쓰는 쉭 소리.
  //   카트보다 덜 덜컹이고(바퀴가 크고 공기 타이어) 높고 가볍게. 다듬기는 오토바이를 다시 짓는 작업자가 재는 틀(시안/차소리_src/check.mjs)로.
  //   2026-11-24 밤 다듬음(레이싱 오토바이 작업자 — 재는 틀로만, 귀로는 안 들음): 톡톡을 고르게(흔들림 · 약한 점화를 줄임) · 400 Hz 의 둔한 울림을 빼고 거르개를 올려
  //   덜컹임(100 ~ 500 Hz)을 줄였다 · 덧소리(rumble)를 낮은 '웅'(600 Hz)에서 속도와 함께 오르는 타이어 '쉭'(2.6 → 4.3 kHz 띠 잡음)으로 · 체감 크기를 다른 차에 가깝게(−29.7 → 약 −26).
  //   2026-11-24 페달 굴리기: 밟을 때(On 버퍼)는 촘촘하고 고른 체인 '사르르'(한 주기 24 · 36번의 약한 톡을 길게 번지게 — 낱낱이 안 들린다), 뗄 때(Off)는 지금의 또렷한 프리휠 '틱틱'.
  bicycle: { name: '자전거 — 체인 · 타이어 소리', fires: 0, layers: { low: 9, high: 9 }, idle: 0, redline: 720, gears: [30], up: 99999, down: 0, launch: 0, boostRpm: 50, over: 220,
    tau: [0.05, 0.06, 0.06], loadTau: [0.05, 0.05], wob: 0.008, blend: [260, 320], drive: [0.6, 0], hp: 320, lp: [7000, 0, 2], scream: [3600, 2, 0.05, 0], intake: [1500, 0.6, 0],
    gain: 2.9, load: [1, 0], off: 1, still: [0, 8], pops: null, click: null, rumble: { f: [2600, 60], q: 0.8, level: 0.022, speed: 16 },
    buffers: {
      lowOn: { seconds: 2, pattern: [[0.0, 1], [0.0417, 0.82], [0.0833, 1], [0.125, 0.82], [0.1667, 1], [0.2083, 0.82], [0.25, 1], [0.2917, 0.82], [0.3333, 1], [0.375, 0.82], [0.4167, 1], [0.4583, 0.82], [0.5, 1], [0.5417, 0.82], [0.5833, 1], [0.625, 0.82], [0.6667, 1], [0.7083, 0.82], [0.75, 1], [0.7917, 0.82], [0.8333, 1], [0.875, 0.82], [0.9167, 1], [0.9583, 0.82]], jitterT: 0.006, jitterA: 0.05, weak: 0.02, len: 0.028, bump: 0.0001, res: [[1900, 0.004, 0.45], [3100, 0.003, 0.4], [4700, 0.002, 0.25]], noise: 1.1, noiseDecay: 0.004, seed: 281 },
      lowOff: { seconds: 2, pattern: [[0, 1], [0.12, 0.5], [0.26, 0.85], [0.37, 0.45], [0.5, 0.8], [0.63, 0.55], [0.74, 0.7], [0.88, 0.5]], jitterT: 0.02, jitterA: 0.14, weak: 0.08, len: 0.018, bump: 0.0002, res: [[2900, 0.0022, 0.5], [4300, 0.0018, 0.45], [6100, 0.0014, 0.3]], noise: 0.8, noiseDecay: 0.0015, seed: 282 },
      highOn: { seconds: 2, pattern: [[0.0, 1], [0.0278, 0.82], [0.0556, 1], [0.0833, 0.82], [0.1111, 1], [0.1389, 0.82], [0.1667, 1], [0.1944, 0.82], [0.2222, 1], [0.25, 0.82], [0.2778, 1], [0.3056, 0.82], [0.3333, 1], [0.3611, 0.82], [0.3889, 1], [0.4167, 0.82], [0.4444, 1], [0.4722, 0.82], [0.5, 1], [0.5278, 0.82], [0.5556, 1], [0.5833, 0.82], [0.6111, 1], [0.6389, 0.82], [0.6667, 1], [0.6944, 0.82], [0.7222, 1], [0.75, 0.82], [0.7778, 1], [0.8056, 0.82], [0.8333, 1], [0.8611, 0.82], [0.8889, 1], [0.9167, 0.82], [0.9444, 1], [0.9722, 0.82]], jitterT: 0.005, jitterA: 0.05, weak: 0.02, len: 0.022, bump: 0.0001, res: [[2100, 0.0035, 0.45], [3400, 0.0026, 0.4], [5000, 0.0018, 0.25]], noise: 1.2, noiseDecay: 0.0035, seed: 283 },
      highOff: { seconds: 2, pattern: [[0, 1], [0.08, 0.45], [0.17, 0.75], [0.26, 0.5], [0.33, 0.7], [0.42, 0.55], [0.5, 0.85], [0.59, 0.5], [0.66, 0.65], [0.76, 0.45], [0.83, 0.8], [0.92, 0.5]], jitterT: 0.018, jitterA: 0.14, weak: 0.08, len: 0.015, bump: 0.0002, res: [[3100, 0.0018, 0.5], [4600, 0.0015, 0.45], [6400, 0.0011, 0.3]], noise: 0.9, noiseDecay: 0.0012, seed: 284 },
    } },
  // 레이싱 오토바이(2026-11-24 — 타 보기 ?try=bike, 사용자가 듣기 전): 고회전 직렬 4기통. 한 바퀴에 두 번 고르게 터지고(EVEN(2) — 포뮬러 V10 의 다섯 번 · 카트 단기통의 한 번과 다르다)
  //   빨간 줄 14,000 · 짧은 6단 · 빠른 변속(퀵시프터 — 힘이 0.02초만 끊김) · 날카로운 흡기 울림(2.4 kHz) · 뗄 때 잦은 '타닥'.
  racebike: { name: '레이싱 오토바이 — 고회전 직렬 4기통', fires: 2, layers: { low: 70, high: 190 }, idle: 2000, redline: 14000, gears: [8.5, 13, 17.5, 22.5, 28.5, 36], up: 13600, down: 8800, launch: 6500, boostRpm: 650,
    cut: 0.02, cutLoad: 0.15, upGap: 0.07, settle: 0.05, tau: [0.015, 0.03, 0.06], wob: 0.003, blend: [7000, 5000], drive: [1.25, 2.5], hp: 120, lp: [1300, 4600, 0.3], scream: [3000, 1.7, 0.1, 0.6], intake: [2400, 0.9, 0.07],
    gain: 1.1, pops: { min: 8000, span: 5500, rate: 14 }, popBand: [1100, 2000], click: { from: 2600, q: 1.4, seconds: 0.02, level: 0.06 },
    buffers: pulses(EVEN(2), { on: [[520, 0.0016, 0.4], [1250, 0.0012, 0.55], [2700, 0.0008, 0.6], [4800, 0.0004, 0.35]], off: [[900, 0.0011, 0.4], [2300, 0.0006, 0.3]], len: 0.006, bump: 0.0003, noise: 0.22, offNoise: 0.5, decay: 0.0006, jit: [0.008, 0.03], amp: [0.06, 0.3], weak: [0.004, 0.25], seconds: [1.2, 1.0], seed: 290 }) },
  // 레이싱 오토바이(2026-11-24 — 타 보기 ?try=bike, 사용자가 듣기 전): 고회전 직렬 4기통. 한 바퀴에 두 번 고르게 터지고(EVEN(2) — 포뮬러 V10 의 다섯 번 · 카트 단기통의 한 번과 다르다)
  //   빨간 줄 14,000 · 짧은 6단 · 빠른 변속(퀵시프터 — 힘이 0.02초만 끊김) · 날카로운 흡기 울림(2.4 kHz) · 뗄 때 잦은 '타닥'.
  racebike: { name: '레이싱 오토바이 — 고회전 직렬 4기통', fires: 2, layers: { low: 70, high: 190 }, idle: 2000, redline: 14000, gears: [8.5, 13, 17.5, 22.5, 28.5, 36], up: 13600, down: 8800, launch: 6500, boostRpm: 650,
    cut: 0.02, cutLoad: 0.15, upGap: 0.07, settle: 0.05, tau: [0.015, 0.03, 0.06], wob: 0.003, blend: [7000, 5000], drive: [1.25, 2.5], hp: 120, lp: [1300, 4600, 0.3], scream: [3000, 1.7, 0.1, 0.6], intake: [2400, 0.9, 0.07],
    gain: 1.1, pops: { min: 8000, span: 5500, rate: 14 }, popBand: [1100, 2000], click: { from: 2600, q: 1.4, seconds: 0.02, level: 0.06 },
    buffers: pulses(EVEN(2), { on: [[520, 0.0016, 0.4], [1250, 0.0012, 0.55], [2700, 0.0008, 0.6], [4800, 0.0004, 0.35]], off: [[900, 0.0011, 0.4], [2300, 0.0006, 0.3]], len: 0.006, bump: 0.0003, noise: 0.22, offNoise: 0.5, decay: 0.0006, jit: [0.008, 0.03], amp: [0.06, 0.3], weak: [0.004, 0.25], seconds: [1.2, 1.0], seed: 290 }) },
  // 택시(2026-11-24 — 사용자가 듣고 고르기 전의 첫 안): 자연흡기 4기통 LPG 에 자동 변속 — 세단(터보)보다 낮고 부드럽게, 터보 소리 없이, 변속이 느긋하다
  // 마을버스(2026-11-24 — 메인이 트럭과 청소차 사이에서 지었다, 사용자가 듣기 전): 4기통 디젤 · 자동 — 트럭보다 가볍고 회전이 조금 높다(한 바퀴에 두 번 터진다), 터보 휘파람은 약하게
  minibus: { name: '마을버스 — 직렬 4 디젤 · 자동', fires: 2, layers: { low: 19, high: 40 }, idle: 720, redline: 3000, gears: [5, 8, 12, 17, 23, 29.5, 36], up: 2750, down: 1550, launch: 800, boostRpm: 110, over: 90,
    cut: 0.3, cutLoad: 0.2, upGap: 0.5, downGap: 0.7, settle: 0.35, tau: [0.11, 0.16, 0.26], loadTau: [0.08, 0.11], wob: 0.005, blend: [1200, 1050], drive: [1.0, 1.5], hp: 38, lp: [650, 2400, 0.85], scream: [1000, 0.8, 0.035, 0.13], intake: [1350, 0.6, 0.02],
    gain: 1.5, load: [0.7, 0.3], pops: null, click: DIESEL_CLICK, turbo: { f: [1400, 3300], q: 10, level: 0.1, bov: 0 },
    buffers: pulses(EVEN(2), { on: [[110, 0.011, 0.9], [260, 0.0065, 0.6], [1850, 0.00065, 0.65], [3300, 0.0004, 0.42]], off: [[135, 0.0095, 0.6], [2050, 0.00058, 0.52], [3500, 0.0004, 0.38]], len: 0.032, bump: 0.0014, noise: 0.42, offNoise: 0.52, decay: 0.0006, jit: [0.03, 0.04], amp: [0.12, 0.24], weak: [0.03, 0.11], seed: 271 }) },
  taxi: { name: '택시 — 4기통 LPG · 자동', fires: 2, layers: { low: 25, high: 72 }, idle: 750, redline: 6000, gears: [8.5, 14, 19.5, 25, 30.5, 36], up: 5400, down: 2600, launch: 1500, boostRpm: 220,
    cut: 0.14, upGap: 0.28, settle: 0.2, tau: [0.08, 0.12, 0.18], wob: 0.002, blend: [2300, 2300], drive: [0.8, 1.0], hp: 50, lp: [520, 1500, 0.4], scream: [1100, 0.9, 0.02, 0.08], intake: [1700, 0.6, 0.02],
    gain: 1.5, pops: null, click: { from: 1000, q: 1, seconds: 0.05, level: 0.025 },
    buffers: pulses(EVEN(2), { on: [[190, 0.0045, 0.6], [540, 0.003, 0.45], [1300, 0.0014, 0.22]], off: [[230, 0.0045, 0.5], [700, 0.0022, 0.28]], len: 0.022, bump: 0.0012, noise: 0.16, offNoise: 0.22, decay: 0.001, jit: [0.012, 0.02], amp: [0.05, 0.15], weak: [0, 0.05], seed: 250 }) },
  // 독수리상(2026-11-24 — 첫 안): 돌 받침대를 실은 손수레가 구르는 소리 — 장보기 카트보다 낮고 묵직하게(통고무 바퀴 · 무거운 짐), 덜 달그락거리게
  statue: { name: '독수리상 — 돌 수레가 구르는 소리', fires: 0, layers: { low: 5, high: 5 }, idle: 0, redline: 450, gears: [30], up: 99999, down: 0, launch: 0, boostRpm: 30, over: 150,
    tau: [0.07, 0.08, 0.08], loadTau: [0.06, 0.06], wob: 0.012, blend: [180, 220], drive: [0.6, 0], hp: 45, lp: [1800, 0, 2], scream: [1500, 2, 0.06, 0], intake: [700, 0.6, 0],
    gain: 5.2, load: [1, 0], off: 1, still: [0, 8], pops: null, click: null, rumble: { f: [240, 22], q: 0.7, level: 0.09 },
    buffers: {
      lowOn: { seconds: 2, pattern: [[0, 1], [0.27, 0.45], [0.52, 0.7], [0.78, 0.4]], jitterT: 0.12, jitterA: 0.3, weak: 0.3, len: 0.08, bump: 0.002, res: [[120, 0.009, 0.9], [310, 0.012, 0.5], [760, 0.014, 0.3], [1500, 0.01, 0.16]], noise: 0.5, noiseDecay: 0.006, seed: 261 },
      lowOff: { seconds: 2, pattern: [[0, 1], [0.24, 0.5], [0.55, 0.65], [0.81, 0.35]], jitterT: 0.12, jitterA: 0.3, weak: 0.3, len: 0.08, bump: 0.002, res: [[125, 0.009, 0.9], [320, 0.012, 0.5], [740, 0.014, 0.3], [1480, 0.01, 0.16]], noise: 0.5, noiseDecay: 0.006, seed: 262 },
      highOn: { seconds: 2, pattern: [[0, 1], [0.14, 0.4], [0.29, 0.6], [0.43, 0.35], [0.57, 0.7], [0.72, 0.4], [0.86, 0.5]], jitterT: 0.1, jitterA: 0.35, weak: 0.28, len: 0.07, bump: 0.0016, res: [[130, 0.008, 0.8], [310, 0.011, 0.5], [760, 0.012, 0.32], [1500, 0.009, 0.18]], noise: 0.6, noiseDecay: 0.005, seed: 263 },
      highOff: { seconds: 2, pattern: [[0, 1], [0.16, 0.45], [0.31, 0.55], [0.45, 0.3], [0.6, 0.7], [0.74, 0.35], [0.88, 0.45]], jitterT: 0.1, jitterA: 0.35, weak: 0.28, len: 0.07, bump: 0.0016, res: [[128, 0.008, 0.8], [320, 0.011, 0.5], [740, 0.012, 0.32], [1480, 0.009, 0.18]], noise: 0.6, noiseDecay: 0.005, seed: 264 },
    } },
};
for (const [id, v] of Object.entries(ENGINES)) ENGINES[id] = { ...ENGINE_BASE, ...v, id };
// 차 → 목소리. 2026-11-24 사용자가 듣기 시안(시안/차소리_듣기.html)에서 고른 것: 포뮬러는 터보 V6 · 지게차는 전동, 나머지 여덟 대는 첫 안.
//   고르지 않은 쪽은 견줘 보려고 ENGINE_ALT 에 남겨 둔다(듣기 시안의 '새 A' = 여기 CAR_ENGINE, '새 B' = ENGINE_ALT — 고른 뒤로 포뮬러 · 지게차는 A · B 가 바뀌어 보인다).
export const CAR_ENGINE = { racekart: 'kart', formula_real: 'formula_v6', sedan: 'sedan', gt: 'gt', supercar_real: 'supercar', golfcart_real: 'golf', forklift_real: 'forklift_ev', shoppingcart_real: 'cart', truck_real: 'truck', garbagetruck_real: 'garbage',
  taxi_real: 'taxi', eagle_statue: 'statue', minibus_real: 'minibus', bicycle_real: 'bicycle',
  racebike_real: 'racebike' };   // 새 차 다섯(2026-11-24)의 목소리는 메인 · 작업자가 지었다 — 레이싱 오토바이는 사용자가 듣기 화면에서 '새 A'(이 목소리)를 고름   // 새 차 둘(2026-11-24)의 목소리는 메인이 가까운 차의 것에서 지었다(사용자가 듣고 고르기 전)
export const ENGINE_ALT = { racekart: 'kart_shift', formula_real: 'formula', golfcart_real: 'golf_dc', forklift_real: 'forklift', truck_real: 'truck_v8' };
export const engineOf = id => (id && ENGINES[id] ? id : CAR_ENGINE[id]) || 'race';
// 목소리 하나의 버퍼 넷(lowOn · lowOff · highOn · highOff)
export function engineBuffers(sr, id = 'race') {
  const v = ENGINES[engineOf(id)], out = {};
  for (const [name, b] of Object.entries(v.buffers)) { const f0 = name.startsWith('low') ? v.layers.low : v.layers.high; out[name] = b.kind === 'hum' ? hum(sr, { f0, ...b }) : pulseTrain(sr, { f0, ...b }); }
  return out;
}

function random(seed) { let s = seed | 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

// 점화 줄: 한 주기 안의 점화 자리(pattern: [자리 0~1, 세기])마다 짧은 압력 파동(솟음 + 배기관 울림 + 잡음)을 그린다.
// 버퍼 끝에서 넘치는 꼬리는 처음으로 감아 써서(원형) 되풀이 이음매가 이어진다. 주기 길이는 흔들되 합이 버퍼 길이와 같게 맞춘다.
export function pulseTrain(sr, { f0, seconds, pattern = [[0, 1]], jitterT = 0.03, jitterA = 0.12, weak = 0, len = 0.02, bump = 0.002, res = [], noise = 0, noiseDecay = 0.003, seed = 1 }) {
  const rnd = random(seed), cycles = Math.max(1, Math.round(seconds * f0)), N = Math.round(cycles * sr / f0), out = new Float32Array(N), L = Math.round(len * sr), shape = new Float32Array(L);
  const periods = []; let walk = 0, sum = 0;
  for (let i = 0; i < cycles; i++) { walk = walk * 0.85 + (rnd() * 2 - 1) * 0.5; const p = Math.max(0.5, 1 + jitterT * (0.6 * (rnd() * 2 - 1) + 0.6 * walk)); periods.push(p); sum += p; }
  const scale = N / sum; let pos = 0.37 * sr / f0;   // 첫 점화를 버퍼 처음에서 비켜 둔다(이음매가 파동 한가운데가 아니게)
  for (let i = 0; i < cycles; i++) {
    const P = periods[i] * scale;
    for (const [phase, amp] of pattern) {
      let a = amp * (1 + jitterA * (rnd() * 2 - 1)); if (rnd() < weak) a *= 0.2 + 0.3 * rnd();
      const detune = 1 + 0.05 * (rnd() * 2 - 1), tilt = 0.8 + 0.4 * rnd();
      for (let j = 0; j < L; j++) {
        const t = j / sr; let v = t < bump ? Math.sin(Math.PI * t / bump) : 0;
        for (const [hz, decay, ra] of res) v += ra * tilt * Math.exp(-t / decay) * Math.sin(2 * Math.PI * hz * detune * t);
        if (noise) v += noise * (1 - Math.exp(-t / 0.0002)) * Math.exp(-t / noiseDecay) * (rnd() * 2 - 1);
        shape[j] = v * (1 - j / L);
      }
      const s0 = Math.floor(pos + phase * P);
      for (let j = 0; j < L; j++) out[(s0 + j) % N] += a * shape[j];
    }
    pos += P;
  }
  return normalize(out);
}
// 전기 모터: 한 바퀴(주기)의 배수로 도는 배음 + 회전에 묶인 맥동 + 거른 잡음. 배음은 버퍼 안에서 정수 번 돌아(k × 주기 수를 반올림) 되풀이 이음매가 이어진다.
// 배음마다 세기를 느리게 흔들어(버퍼 안에서 정수 번 도는 사인 둘) 맨 사인의 '삐' 를 덜고, 잡음은 loopable 처럼 끝을 처음에 겹쳐 잇는다.
export function hum(sr, { f0, seconds, partials, ripple = 0, noise = 0, band = [400, 3000], seed = 1 }) {
  const rnd = random(seed), C = Math.max(1, Math.round(seconds * f0)), N = Math.round(C * sr / f0), out = new Float32Array(N), TAU = 2 * Math.PI;
  for (const [k, amp, wob = 0.15] of partials) {
    const kc = Math.round(k * C), ph = rnd() * TAU, m1 = 1 + Math.floor(rnd() * 3), m2 = 4 + Math.floor(rnd() * 4), p1 = rnd() * TAU, p2 = rnd() * TAU;
    for (let i = 0; i < N; i++) { const x = i / N; out[i] += amp * (1 + wob * (0.6 * Math.sin(TAU * m1 * x + p1) + 0.4 * Math.sin(TAU * m2 * x + p2))) * Math.sin(TAU * kc * x + ph); }
  }
  if (ripple) for (let i = 0; i < N; i++) out[i] *= 1 + ripple * Math.sin(TAU * C * i / N);
  if (noise) {
    const F = Math.round(0.05 * sr), raw = new Float32Array(N + F), hp = biquad(), lp = biquad(); hp.set('hp', band[0], 0.7, sr); lp.set('lp', band[1], 0.7, sr);
    let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
    for (let i = 0; i < raw.length; i++) raw[i] = lp.run(hp.run(rnd() * 2 - 1));
    let s = 0; for (let i = 0; i < N; i++) s += raw[i] * raw[i]; const k = noise * peak * 0.35 / Math.sqrt(s / N || 1);
    for (let i = 0; i < N; i++) { const v = i < F ? raw[i] * Math.sqrt(i / F) + raw[N + i] * Math.sqrt(1 - i / F) : raw[i]; out[i] += k * v; }
  }
  return normalize(out);
}
function normalize(out) { let mean = 0; for (const v of out) mean += v; mean /= out.length; let peak = 0; for (let i = 0; i < out.length; i++) { out[i] -= mean; peak = Math.max(peak, Math.abs(out[i])); } if (peak) for (let i = 0; i < out.length; i++) out[i] /= peak; return out; }
function loopable(sr, seconds, fade, fill) {
  const N = Math.round(seconds * sr), F = Math.round(fade * sr), raw = new Float32Array(N + F); fill(raw);
  const out = raw.slice(0, N); for (let i = 0; i < F; i++) { const w = i / F; out[i] = raw[i] * Math.sqrt(w) + raw[N + i] * Math.sqrt(1 - w); } return normalize(out);
}
function squeal(sr, { base, partials, wobble, chatter, breath, seed }) {
  return loopable(sr, 2.6, 0.08, raw => {
    const rnd = random(seed); let ph = 0, slow = 0, fast = 0, am = 0.6, amTo = 0.6, next = 0, nz = 0;
    for (let i = 0; i < raw.length; i++) {
      slow = slow * 0.99993 + (rnd() * 2 - 1) * 0.0006; fast = fast * 0.995 + (rnd() * 2 - 1) * 0.004;
      if (i >= next) { amTo = 0.2 + 0.8 * rnd(); next = i + sr / (chatter * (0.6 + 0.8 * rnd())); } am += (amTo - am) * 0.006;
      ph += 2 * Math.PI * base * (1 + wobble * (slow * 18 + fast * 2)) / sr;
      let v = 0; for (const [k, a] of partials) v += a * Math.sin(ph * k);
      nz = nz * 0.6 + (rnd() * 2 - 1) * 0.4; raw[i] = am * v + breath * nz;
    }
  });
}
// ── 드리프트 타이어 후보 b1 · b2 · b3 ──
// 사인 대신 잡음을 걸러 만든다: 음높이가 분명하지 않고, 결이 불규칙하다(주기적인 떨림 없음). 엔진(무게중심 2kHz 근처)보다 아래 대역.
//   b1 '쓸림': 넓은 대역(400~2500Hz) 잡음에 거친 결(3~20ms 마다 세기가 제멋대로) — 아스팔트에 쓸리는 소리
//   b2 '낮은 끼익': 잡음을 좁은 울림 거르개(700~1000Hz, 높이가 느리게 떠돎)로 걸러 붙었다 떨어졌다(stick-slip) + 밑에 쓸림
//   b3 '짧은 끼익 뒤 쓸림': 드리프트가 걸리는 순간 · 미끄럼각이 다시 커질 때만 0.3초 끼익, 나머지는 쓸림
export const TYRE = { scrub: 1.3, squeal: 1.0, under: 0.7, tail: 1.1, chirp: 1.6, lp: 1800 };   // tuning.screech 에 곱하는 배율, 마지막 거르개 높이(Hz)
function coef(type, f, q, sr) {
  const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al; let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
  return [b0 / a0, b1 / a0, b2 / a0, -2 * cs / a0, (1 - al) / a0];
}
function biquad() { let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = [1, 0, 0, 0, 0]; return { set(type, f, q, sr) { c = coef(type, f, q, sr); }, run(x) { const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; } }; }
function toRms(out, target = 0.25) { let s = 0; for (const v of out) s += v * v; const k = target / Math.sqrt(s / out.length || 1); for (let i = 0; i < out.length; i++) out[i] *= k; return out; }
// 붙었다(stick) 미끄러졌다(slip) 하는 세기: 길이 · 깊이가 매번 달라서 되풀이 무늬가 없다
function stickSlip(rnd, sr, deep = 1) { let lvl = 0.7, to = 0.7, next = 0; return i => { if (i >= next) { const stick = rnd() < 0.7; to = stick ? 0.6 + 0.4 * rnd() : 1 - deep * (0.65 + 0.3 * rnd()); next = i + sr * (stick ? 0.04 + 0.18 * rnd() : 0.012 + 0.06 * rnd()); } lvl += (to - lvl) * 0.003; return lvl; }; }   // 7ms 쯤에 걸쳐 바뀐다(딱 소리 없이)
function tyreScrub(sr, seed) {
  return toRms(loopable(sr, 4, 0.1, raw => {
    const rnd = random(seed), hp = biquad(), lp = biquad(), body = biquad(); hp.set('hp', 400, 0.7, sr); lp.set('lp', 2500, 0.7, sr); body.set('bp', 900, 0.8, sr);
    let lvl = 0.6, to = 0.6, next = 0, slow = 0;
    for (let i = 0; i < raw.length; i++) {
      if (i >= next) { to = Math.pow(rnd(), 0.6) * (rnd() < 0.12 ? 0.3 : 1); next = i + sr * (0.003 + 0.017 * rnd()); }
      lvl += (to - lvl) * 0.015; slow = slow * 0.99995 + (rnd() * 2 - 1) * 0.0015;
      const n = (rnd() * 2 - 1) * lvl * (0.8 + Math.max(-0.3, Math.min(0.3, slow * 6))), v = lp.run(hp.run(n));
      raw[i] = v + 0.6 * body.run(v);
    }
  }));
}
function tyreSqueal(sr, { lo = 700, hi = 1000, q = 14, seconds = 4.5, seed }) {
  return toRms(loopable(sr, seconds, 0.12, raw => {
    const rnd = random(seed), a = biquad(), b = biquad(), env = stickSlip(rnd, sr); let w = rnd() * 2 - 1, fast = 0;
    for (let i = 0; i < raw.length; i++) {
      w = Math.max(-1, Math.min(1, w + (rnd() * 2 - 1) * 0.002 - w * 0.00001)); fast = fast * 0.998 + (rnd() * 2 - 1) * 0.01;
      if (i % 32 === 0) { const f = lo * Math.pow(hi / lo, (w + 1) / 2) * (1 + 0.012 * fast); a.set('bp', f, q, sr); b.set('bp', f, q, sr); }
      raw[i] = b.run(a.run(rnd() * 2 - 1)) * env(i);
    }
  }));
}
// 짧은 끼익 한 번(0.32초): 높이가 살짝 내려앉고, 들어올 때 25ms · 나갈 때 0.2초에 걸쳐 0 에서 0 으로
function tyreChirp(sr, seed) {
  const rnd = random(seed), N = Math.round(0.32 * sr), out = new Float32Array(N), a = biquad(), b = biquad(), env = stickSlip(rnd, sr, 0.5), f0 = 900 + 120 * rnd(), f1 = 760 + 60 * rnd();
  for (let i = 0; i < N; i++) {
    const t = i / sr; if (i % 32 === 0) { const f = f0 * Math.pow(f1 / f0, Math.min(1, t / 0.25)); a.set('bp', f, 10, sr); b.set('bp', f, 10, sr); }
    const shape = t < 0.025 ? Math.sin(Math.PI / 2 * t / 0.025) ** 2 : t > 0.12 ? Math.cos(Math.PI / 2 * Math.min(1, (t - 0.12) / 0.2)) ** 2 : 1;
    out[i] = b.run(a.run(rnd() * 2 - 1)) * env(i) * shape;
  }
  let s = 0, n = 0; for (let i = Math.round(0.025 * sr); i < Math.round(0.12 * sr); i++) { s += out[i] * out[i]; n++; } const k = 0.3 / Math.sqrt(s / n); for (let i = 0; i < N; i++) out[i] *= k; return out;
}
// 엔진 버퍼 넷은 고른 목소리(engine — 차 id 도 된다)의 것. 지금 소리('race')는 한 바퀴에 네 번(V8): 자리와 세기를 조금 어긋나게 해서 매끈한 '윙' 이 아니라 거친 '으르렁' 이 섞이게 한다
export function makeBuffers(sr, tyreMode = 'old', engine = 'race') {
  const rnd = random(77), noise = new Float32Array(sr * 2); for (let i = 0; i < noise.length; i++) noise[i] = rnd() * 2 - 1;
  const extra = tyreMode === 'old' ? {} : { tyreScrub: tyreScrub(sr, 51), ...(tyreMode === 'b2' ? { tyreSqueal: tyreSqueal(sr, { seed: 52 }) } : {}), ...(tyreMode === 'b3' ? { tyreChirp0: tyreChirp(sr, 53), tyreChirp1: tyreChirp(sr, 54), tyreChirp2: tyreChirp(sr, 55) } : {}) };
  return {
    ...extra,
    ...engineBuffers(sr, engine),
    squeal: squeal(sr, { base: 1350, partials: [[1, 1], [2.01, 0.3], [2.98, 0.15]], wobble: 0.035, chatter: 26, breath: 0.4, seed: 41 }),
    noise,
  };
}

// 탭이 뒤로 가면(document.hidden) 소리 전체를 세우고(audio.pause(true)) 돌아오면 켠다(2026-11-26 — 그리기가 멈추면 엔진이 마지막 값을 붙든 채 계속 울렸다).
//   blocked(): 참이면 아무것도 안 한다(게임의 멈춤 판 — 이미 세워 두었고, 판을 닫을 때 켠다). 소리를 연 적이 없으면 audio.pause 가 그냥 돌아온다.
//   세우기는 delay 초 늦춘다: music.js 가 같은 때 음악을 잦아들게 하고, 미리 넣어 둔 음(MUSIC.lookahead 0.15초 앞까지)을 마저 흘려보낸 뒤에 세워야 돌아올 때 그 음이 새 음과 겹치지 않는다.
//   돌아와서 켰는데도 소리 판이 안 도는 경우(사용자 동작 없이는 resume 을 안 받아 주는 브라우저 · 휴대폰에서 다른 앱에 갔다 온 뒤)에 대비해, 돌아온 뒤 첫 누름에 한 번 더 켠다(돌고 있으면 안 건드린다).
export function pauseWhenHidden({ audio, doc = document, blocked = () => false, delay = 0.25, later = setTimeout, cancel = clearTimeout }) {
  let timer = 0, armed = false;
  function retry() { disarm(); const state = audio.state; if (!doc.hidden && !blocked() && state && state !== 'running' && state !== 'off') audio.pause(false); }
  function arm() { if (armed) return; armed = true; doc.addEventListener('pointerdown', retry, true); doc.addEventListener('keydown', retry, true); }
  function disarm() { if (!armed) return; armed = false; doc.removeEventListener('pointerdown', retry, true); doc.removeEventListener('keydown', retry, true); }
  const onChange = () => {
    if (timer) { cancel(timer); timer = 0; }
    if (blocked()) return;
    if (doc.hidden) { disarm(); timer = later(() => { timer = 0; if (doc.hidden && !blocked()) audio.pause(true); }, delay * 1000); }
    else { audio.pause(false); arm(); }
  };
  doc.addEventListener('visibilitychange', onChange);
  return () => { doc.removeEventListener('visibilitychange', onChange); disarm(); if (timer) cancel(timer); timer = 0; };
}

export function createAudio({ tuning = SOUND, tyre: tyreMode = 'b3', car = null } = {}) {   // tyre: 'old'(지금 B) | 'b1' | 'b2' | 'b3' — 드리프트 소리만 바뀐다. car: 차 id 또는 목소리 id(없으면 지금 소리)
  // 목소리: 'race'(지금 소리)는 회전 값을 tuning(SOUND)에서 읽는다 — 시안 · 검증이 tuning 을 덮어써도 그 전과 똑같이 돈다
  const voiceOf = id => { const v = { ...ENGINES[engineOf(id)] }; if (v.id === 'race') Object.assign(v, { idle: tuning.idleRpm, redline: tuning.redline, gears: tuning.gears, up: tuning.shiftUp, down: tuning.shiftDown, launch: tuning.launchRpm, boostRpm: tuning.boostRpm, off: tuning.engineOff }); return v; };
  let V = voiceOf(car), carKey = car;   // carKey: 경적을 고르는 차 id(setCar 에 준 그대로)
  let hornKit = null, hornHeld = null;   // 경적: 처음 누를 때 만든다(unlock 전에는 없다) · 지금 누르고 있는 것
  let ctx = null, out = null, bed = null, buf = null, eng = null, tyre = null, wind = null, muted = false;
  let lastT = 0, rpm = V.idle, gear = 0, load = 0, wob = 0, cutUntil = 0, wasBoost = false, wasKind = '', wasStock = null, wasFull = false, lastHit = 0, lastCrash = 0, nextWrench = 0, lastLand = 0, windHold = 0, lastShift = -9, rnd = Math.random;
  let alt = null, tw = 0, armed = true, peakSlip = 0, minSlip = 9, lastChirp = -9;   // 드리프트 후보(b1~b3)용
  let lastSpeed = 0, lastThr = 0, spool = 0, bovArmed = false;   // 목소리 덧소리(터보 · 접촉기)용
  // 메뉴 화면(view.menu — 시작 · 차 고르기 · 코스 고르기 · 결과 화면)에서는 엔진(엔진 · 흡기 · 덧소리)을 끈다: awake 가 0 ↔ 1 을 MENU_FADE 초 시간 상수로 오간다(0.25초쯤이면 다 바뀐다).
  //   처음 update 는 그 화면의 값에서 바로 시작한다(소리를 연 직후 시작 화면에서 엔진이 잠깐 새지 않게). 1 일 때는 곱해도 예전과 같은 값이다.
  let awake = null;
  const MENU_FADE = 0.07;
  const engineCache = {}, buildMs = {};   // 목소리마다 처음 쓸 때 만든 AudioBuffer 넷을 간직한다(차를 다시 바꿀 때 안 만든다)
  try { muted = localStorage.getItem(KEY) === '1'; } catch {}
  const makeBuf = data => { const b = ctx.createBuffer(1, data.length, ctx.sampleRate); b.getChannelData(0).set(data); return b; };
  const curve = fn => { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1); return c; };
  const LAYER_NAMES = ['lowOn', 'lowOff', 'highOn', 'highOff'];
  function build() {
    const t0 = performance.now(), data = makeBuffers(ctx.sampleRate, tyreMode, V.id); buf = {}; for (const k in data) buf[k] = makeBuf(data[k]);
    engineCache[V.id] = Object.fromEntries(LAYER_NAMES.map(k => [k, buf[k]])); buildMs[V.id] = Math.round(performance.now() - t0);
    out = ctx.createGain(); out.gain.value = muted ? 0 : tuning.master;
    const squash = ctx.createDynamicsCompressor(); squash.threshold.value = -12; squash.ratio.value = 6; squash.attack.value = 0.003; squash.release.value = 0.15;
    const clip = ctx.createWaveShaper(); clip.curve = curve(x => { const a = Math.abs(x); return Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28)); });
    out.connect(squash).connect(clip).connect(ctx.destination);
    bed = ctx.createGain(); bed.connect(out);   // 엔진 · 바람 · 타이어가 모이는 곳(평소 1배) — duck() 이 이것만 줄인다. 효과음 · 무전은 out 으로 바로 간다
    // 엔진: 버퍼 넷 → 합 → 세기 → 찌그러뜨림(더 세게) → 낮은 소리 덜기 → 높은 대역 거르개 + '비명' 울림 → 엔진 크기
    const sum = ctx.createGain(), drive = ctx.createGain(), shape = ctx.createWaveShaper(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), scream = ctx.createBiquadFilter(), screamG = ctx.createGain(), gain = ctx.createGain();
    shape.curve = curve(x => Math.tanh(x * 3) / Math.tanh(3)); hp.type = 'highpass'; hp.frequency.value = V.hp; hp.Q.value = 0.7; lp.type = 'lowpass'; lp.Q.value = V.lpQ;
    scream.type = 'bandpass'; scream.frequency.value = V.scream[0]; scream.Q.value = V.scream[1]; gain.gain.value = 0;
    sum.connect(drive).connect(shape).connect(hp); hp.connect(lp).connect(gain); hp.connect(scream).connect(screamG).connect(gain); gain.connect(bed);
    eng = { sum, hp, scream, drive, lp, screamG, gain };
    eng.layers = layersFor(engineCache[V.id]);
    eng.intake = loop('bandpass', V.intake[0], V.intake[1]);
    if (tyreMode === 'old') {
    const sq = ctx.createBufferSource(), sqG = ctx.createGain(), sqF = ctx.createBiquadFilter(); sq.buffer = buf.squeal; sq.loop = true; sqF.type = 'highpass'; sqF.frequency.value = 700; sqG.gain.value = 0; sq.connect(sqF).connect(sqG).connect(bed); sq.start(ctx.currentTime, rnd() * 2);
    tyre = { src: sq, gain: sqG, scrub: loop('bandpass', 700, 0.6) };
    } else buildTyre();
    wind = loop('bandpass', 1000, 1.1);
    eng.extras = extrasFor(V);   // 지금 소리에는 없다(난수를 더 쓰지 않게 맨 뒤에 짓는다)
  }
  function loop(type, frequency, q) { const src = ctx.createBufferSource(); src.buffer = buf.noise; src.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(bed); src.start(ctx.currentTime, rnd() * 1.5); return { filter: f, gain: g, src }; }
  function layersFor(b) { return LAYER_NAMES.map(name => { const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = b[name]; src.loop = true; g.gain.value = 0; src.connect(g).connect(eng.sum); src.start(ctx.currentTime, rnd() * b[name].duration); return { name, src, g, f0: name.startsWith('low') ? V.layers.low : V.layers.high }; }); }
  // 목소리의 덧소리: 터보(좁은 띠 잡음 — 높이가 차오름을 따른다) · 바퀴와 구동계 잡음
  function extrasFor(v) { return { turbo: v.turbo ? loop('bandpass', v.turbo.f[0], v.turbo.q) : null, rumble: v.rumble ? loop('bandpass', v.rumble.f[0], v.rumble.q) : null, pump: v.pump ? loop('bandpass', v.pump.k * v.idle, v.pump.q) : null }; }
  // 달리는 중에 차를 바꾼다: 새 버퍼 넷(처음이면 만들고 간직)으로 갈아 끼우고, 옛 것은 30ms 에 걸쳐 줄인 뒤 멈춘다. 회전 · 기어는 지금 속도에 맞춰 새로 잡는다.
  function setCar(id) {
    if (id !== carKey) { carKey = id; releaseHorn(); }   // 차를 바꾸면 누르던 경적은 뗀다(다음 누름은 새 차의 경적)
    const next = voiceOf(id); if (next.id === V.id) return false;
    V = next; rpm = V.idle; gear = 0; lastShift = -9; spool = 0; bovArmed = false; cutUntil = 0;
    while (gear < V.gears.length - 1 && V.redline * lastSpeed / V.gears[gear] > V.up) gear++;
    if (!ctx || !eng) return true;
    const t = ctx.currentTime;
    if (!engineCache[V.id]) { const t0 = performance.now(), data = engineBuffers(ctx.sampleRate, V.id); engineCache[V.id] = Object.fromEntries(LAYER_NAMES.map(k => [k, makeBuf(data[k])])); buildMs[V.id] = Math.round(performance.now() - t0); }
    const fade = g => { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.03); };
    for (const l of eng.layers) { fade(l.g); l.src.stop(t + 0.25); }
    for (const x of Object.values(eng.extras)) if (x) { fade(x.gain); x.src.stop(t + 0.25); }
    eng.hp.frequency.setValueAtTime(V.hp, t); eng.lp.Q.setValueAtTime(V.lpQ, t); eng.scream.frequency.setValueAtTime(V.scream[0], t); eng.scream.Q.setValueAtTime(V.scream[1], t);
    eng.intake.filter.frequency.setValueAtTime(V.intake[0], t); eng.intake.filter.Q.setValueAtTime(V.intake[1], t);
    eng.layers = layersFor(engineCache[V.id]); eng.extras = extrasFor(V);
    return true;
  }
  // 드리프트 후보(b1~b3): 되풀이 버퍼 → 크기 → 마지막 낮은 대역 거르개(엔진보다 아래로) → out
  function buildTyre() {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = TYRE.lp; lp.Q.value = 0.5; lp.connect(bed);
    const play = b => { const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = b; src.loop = true; g.gain.value = 0; src.connect(g).connect(lp); src.start(ctx.currentTime, rnd() * b.duration); return { src, g }; };
    alt = { lp, scrub: play(buf.tyreScrub), squeal: buf.tyreSqueal ? play(buf.tyreSqueal) : null, chirps: buf.tyreChirp0 ? [buf.tyreChirp0, buf.tyreChirp1, buf.tyreChirp2] : null };
  }
  function chirp(level, t) {
    if (!live() || !alt.chirps) return; const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = alt.chirps[Math.floor(rnd() * 3)]; src.playbackRate.value = 0.96 + 0.08 * rnd();
    g.gain.value = level; src.connect(g).connect(alt.lp); src.start(t); src.stop(t + 0.4); lastChirp = t;
  }
  function tyreUpdate(t, slide, speed, slipAbs) {
    const S = tuning.screech, sp = Math.min(1, speed / 25), tc = slide > 0 ? 0.04 : 0.12;   // 켤 때 40ms, 끌 때 120ms 로 스며들고 빠진다
    tw = Math.max(-0.04, Math.min(0.04, tw * 0.97 + (rnd() - 0.5) * 0.01));   // 재생 속도를 조금씩 흔들어 되풀이 티를 지운다(음높이 변화는 ±4% 안)
    alt.lp.frequency.setTargetAtTime(TYRE.lp * (0.85 + 0.25 * sp), t, 0.1);
    alt.scrub.src.playbackRate.setTargetAtTime(0.9 + 0.12 * sp + tw, t, 0.08);
    if (tyreMode === 'b1') alt.scrub.g.gain.setTargetAtTime(Math.pow(slide, 0.8) * S * TYRE.scrub * (0.65 + 0.35 * sp), t, tc);
    else if (tyreMode === 'b2') {
      alt.scrub.g.gain.setTargetAtTime(slide * S * TYRE.under * (0.65 + 0.35 * sp), t, tc);
      alt.squeal.g.gain.setTargetAtTime(Math.pow(slide, 1.2) * S * TYRE.squeal * (0.7 + 0.3 * sp), t, tc);
      alt.squeal.src.playbackRate.setTargetAtTime(1 + 0.05 * (Math.min(0.7, slipAbs) - 0.4) + tw * 0.5, t, 0.15);
    } else {
      alt.scrub.g.gain.setTargetAtTime(Math.pow(slide, 0.9) * S * TYRE.tail * (0.65 + 0.35 * sp), t, tc);
      // 걸리는 순간(미끄럼이 0 근처에서 올라옴) 한 번, 드리프트 중 미끄럼각이 0.1 넘게 줄었다가 바닥에서 0.15 이상 다시 커지면 한 번 더(0.5초 간격)
      const level = Math.max(0.75, Math.min(1, slide)) * S * TYRE.chirp * (0.7 + 0.3 * sp);   // 걸리는 순간의 slide 는 아직 작으므로 바닥을 둔다
      if (slide < 0.1) { armed = true; minSlip = 9; }
      else if (armed && slide >= 0.5) { armed = false; chirp(level, t); peakSlip = slipAbs; minSlip = 9; }
      else if (!armed) {
        if (minSlip === 9) { if (slipAbs > peakSlip) peakSlip = slipAbs; else if (slipAbs < peakSlip - 0.1) minSlip = slipAbs; }
        else { minSlip = Math.min(minSlip, slipAbs); if (slipAbs - minSlip > 0.15 && t - lastChirp > 0.5) { chirp(level, t); peakSlip = slipAbs; minSlip = 9; } }
      }
    }
  }
  const live = () => ctx && !muted && out;
  function releaseHorn() { if (!hornHeld) return; try { hornHeld.release(); } catch {} hornHeld = null; }
  function horn(on) {
    if (!on) { releaseHorn(); return false; }
    if (hornHeld || !live() || ctx.state !== 'running') return false;   // 누르고 있는 중(키 되풀이) · 소리 끔 · 멈춤이면 안 낸다
    hornKit ??= createHorn(ctx, out, { seed: 3 });
    hornHeld = hornKit.press(hornOf(carKey)); return true;
  }
  function env(param, t, peak, attack, seconds) { param.setValueAtTime(0.0001, t); param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack); param.exponentialRampToValueAtTime(0.0001, t + seconds); }
  function burst({ type = 'bandpass', from = 1000, to = null, q = 1, seconds = 0.2, level = 0.1, delay = 0, attack = 0.004 }) {
    if (!live()) return; const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf.noise; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(from, t); if (to) f.frequency.exponentialRampToValueAtTime(to, t + seconds);
    env(g.gain, t, level, attack, seconds); src.connect(f).connect(g).connect(out); src.start(t, rnd() * 1.5); src.stop(t + seconds + 0.05);
  }
  function sweep(from, to, seconds, level, delay = 0, attack = 0.004) {
    if (!live()) return; const t = ctx.currentTime + delay, osc = ctx.createOscillator(), g = ctx.createGain(); osc.frequency.setValueAtTime(from, t); osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
    env(g.gain, t, level, attack, seconds); osc.connect(g).connect(out); osc.start(t); osc.stop(t + seconds + 0.05);
  }
  // 유리처럼 맑은 '딩'(FM): 바탕음을 다른 비율의 사인으로 흔들고, 흔드는 폭이 빨리 줄어 끝은 맑아진다. 너무 쨍하지 않게 위를 깎는다.
  function ding(freq, seconds, level, delay = 0, ratio = 2, index = 0.8) {
    if (!live()) return; const t = ctx.currentTime + delay, car = ctx.createOscillator(), mod = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    car.frequency.value = freq; mod.frequency.value = freq * ratio; depth.gain.setValueAtTime(freq * index, t); depth.gain.exponentialRampToValueAtTime(freq * index * 0.05, t + seconds * 0.6);
    lp.type = 'lowpass'; lp.frequency.value = 3800; mod.connect(depth).connect(car.frequency); env(g.gain, t, level, 0.004, seconds);
    car.connect(lp).connect(g).connect(out); car.start(t); mod.start(t); car.stop(t + seconds + 0.05); mod.stop(t + seconds + 0.05);
  }
  // 역화 '탁': 짧고 마른 잡음 + 가끔 낮은 '퍽'
  function pop(level = 1) { burst({ from: V.popBand[0] + rnd() * V.popBand[1], q: 0.9, seconds: 0.025 + rnd() * 0.035, level: (0.05 + rnd() * 0.06) * level, attack: 0.001 }); if (rnd() < 0.35) sweep(150, 80, 0.05, 0.05 * level, 0, 0.001); }
  function boostStart(kind, t) {
    const f = wind.filter.frequency, g = wind.gain.gain, hold = kind === 'kick' ? 0.15 : kind === 'start' ? 1.0 : 0.6;
    f.cancelScheduledValues(t); g.cancelScheduledValues(t); f.setValueAtTime(Math.max(200, f.value), t); g.setValueAtTime(Math.max(0.0002, g.value), t);
    if (kind === 'kick') {   // 짧은 가속: 날카롭게 '팟' 밀어 주는 압축 공기
      burst({ from: 1200, to: 4200, q: 2, seconds: 0.14, level: 0.2, attack: 0.002 }); burst({ type: 'highpass', from: 3000, q: 0.7, seconds: 0.03, level: 0.06, attack: 0.001 }); sweep(160, 80, 0.1, 0.1, 0, 0.002);
      f.exponentialRampToValueAtTime(2600, t + hold); g.linearRampToValueAtTime(tuning.boost * 0.8, t + hold);
    } else if (kind === 'start') {   // 출발 가속: 터빈이 길게 감기며 차오른다
      sweep(1800, 6800, 1.0, 0.03, 0, 0.12); burst({ from: 300, to: 3000, q: 1.2, seconds: 0.9, level: 0.18, attack: 0.08 }); sweep(60, 45, 0.7, 0.14);
      f.exponentialRampToValueAtTime(2800, t + hold); g.linearRampToValueAtTime(tuning.boost, t + hold);
    } else {   // 모아 둔 부스터: 터빈 휘파람 + 휙 차오르는 공기
      sweep(2600, 6200, 0.7, 0.028, 0, 0.06); burst({ from: 500, to: 3200, q: 1.6, seconds: 0.5, level: 0.16, attack: 0.02 }); sweep(120, 65, 0.2, 0.1);
      f.exponentialRampToValueAtTime(2700, t + hold); g.linearRampToValueAtTime(tuning.boost, t + hold);
    }
    windHold = t + hold;
  }
  function impact(k) { sweep(70, 36, 0.22, 0.34 * k, 0, 0.002); burst({ type: 'lowpass', from: 1400, to: 180, q: 0.7, seconds: 0.16, level: 0.3 * k, attack: 0.002 }); burst({ from: 3200, q: 1.8, seconds: 0.035, level: 0.1 * k, attack: 0.001 }); burst({ from: 900, q: 1.2, seconds: 0.25, level: 0.05 * k, delay: 0.02, attack: 0.02 }); }
  // 차가 상할 만큼 박았다(k 0~1 = 깎인 만큼): 벽 소리 위에 찌그러지는 소리 — 낮은 쿵 + 거친 쇳소리 + 뒤따라 떨어지는 조각 소리 둘
  function crunch(k) { sweep(96, 42, 0.3, 0.3 + 0.25 * k, 0, 0.002); burst({ type: 'lowpass', from: 2400, to: 260, q: 0.9, seconds: 0.26, level: 0.26 + 0.22 * k, attack: 0.002 }); burst({ from: 4300, q: 2.6, seconds: 0.07, level: 0.09 + 0.1 * k, attack: 0.001 });
    burst({ from: 2700, q: 5, seconds: 0.05, level: 0.05 + 0.06 * k, delay: 0.11 + 0.05 * rnd(), attack: 0.001 }); burst({ from: 3600, q: 6, seconds: 0.045, level: 0.04 + 0.05 * k, delay: 0.21 + 0.08 * rnd(), attack: 0.001 }); }
  // 피트 크루의 임팩트 렌치: '위잉' — 좁은 띠의 소음이 850 → 2500 Hz 로 올라가는 모터 소리 + 바람 새는 소리, 끝에 '다다닥' 조이는 소리
  function wrench(k = 1) { const d = 0.02 * rnd(); burst({ from: 850, to: 2500 + 500 * rnd(), q: 9, seconds: 0.26, level: 0.085 * k, delay: d, attack: 0.03 }); burst({ type: 'highpass', from: 3800, q: 0.7, seconds: 0.2, level: 0.018 * k, delay: d + 0.04, attack: 0.05 });
    for (let i = 0; i < 5; i++) burst({ from: 1900, q: 3, seconds: 0.018, level: 0.07 * k, delay: d + 0.23 + i * 0.03, attack: 0.001 }); }
  // 잭: 올릴 때 짧게 오르는 소리, 내릴 때 '쿵'
  function jack(up) { if (up) { sweep(170, 430, 0.16, 0.1, 0, 0.01); burst({ from: 1200, to: 2600, q: 2, seconds: 0.14, level: 0.04, attack: 0.01 }); } else { sweep(95, 44, 0.16, 0.22, 0, 0.002); burst({ type: 'lowpass', from: 900, to: 180, q: 0.8, seconds: 0.11, level: 0.16, attack: 0.002 }); } }
  function land(k) { sweep(58, 30, 0.16, 0.12 + 0.25 * k, 0, 0.003); burst({ type: 'lowpass', from: 420, to: 90, q: 0.8, seconds: 0.12, level: 0.08 + 0.2 * k, attack: 0.003 }); if (k > 0.4) burst({ from: 1300, q: 1.5, seconds: 0.14, level: 0.07 * k, delay: 0.01, attack: 0.005 }); }
  // 목소리의 덧소리(지금 소리에는 없다 — 아무것도 하지 않고 난수도 안 쓴다)
  function voiceExtras(t, dt, speed, thr, r, moving) {
    const x = eng.extras;
    if (x.turbo) {   // 부하 × 회전만큼 0.4초에 걸쳐 차오르고, 높이도 따라 오른다. 많이 차 있다 떼면 '피시'(bov)
      const T = V.turbo; spool += (load * r - spool) * (1 - Math.exp(-dt / (load * r > spool ? 0.4 : 0.25)));
      x.turbo.filter.frequency.setTargetAtTime(T.f[0] + (T.f[1] - T.f[0]) * spool, t, 0.05);
      x.turbo.gain.gain.setTargetAtTime(T.level * V.gain * spool * spool * (0.3 + 0.7 * load) * awake, t, 0.05);
      if (spool > 0.45 && load > 0.6) bovArmed = true;
      if (T.bov && bovArmed && thr < 0.2) { bovArmed = false; burst({ type: 'highpass', from: 2600, to: 1000, q: 0.7, seconds: 0.4, level: T.bov * Math.min(1, spool * 1.5), attack: 0.01 }); }
    }
    if (x.rumble) { const R = V.rumble; x.rumble.filter.frequency.setTargetAtTime(R.f[0] + R.f[1] * speed, t, 0.1); x.rumble.gain.gain.setTargetAtTime(R.level * V.gain * moving * (R.speed ? clamp01(speed / R.speed) : 1) * awake, t, 0.08); }
    if (x.pump) { const P = V.pump; x.pump.filter.frequency.setTargetAtTime(P.k * rpm, t, 0.03); x.pump.gain.gain.setTargetAtTime(P.level * V.gain * (0.4 + 0.6 * load) * awake, t, 0.05); }   // 지게차: 엔진에 물린 유압 펌프 — 회전을 따라 오르는 윙
    if (V.clunk && thr > 0.3 && lastThr <= 0.3 && speed < 8) burst(V.clunk);   // 전동 지게차: 밟는 순간 접촉기 '턱'
  }
  const chime = () => { ding(1568, 0.18, 0.08, 0, 3.5, 0.5); ding(2093, 0.3, 0.08, 0.06, 3.5, 0.5); };
  const api = {
    get muted() { return muted; },
    get state() { return ctx ? ctx.state : 'off'; },
    get context() { return ctx; },   // unlock() 전에는 null
    get output() { return out; },
    get ducked() { return bed ? bed.gain.value : 1; },
    get car() { return V.id; },   // 지금 목소리 id('race' = 지금 소리)
    get engine() { return { id: V.id, rpm, gear, load, buildMs: { ...buildMs } }; },   // 재기 · 시안용(회전 · 기어 · 버퍼 만든 시간 ms)
    setCar,   // 차 id 또는 목소리 id. 같은 목소리면 아무것도 안 한다(false)
    duck(level = 1, tc = 0.05, at = 0) { if (!bed) return; const t = Math.max(ctx.currentTime, at); bed.gain.cancelScheduledValues(t); bed.gain.setTargetAtTime(level, t, tc); },   // at 초부터 시간 상수 tc 로 level 배. 되돌리기는 duck(1, …)
    unlock() { try { if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); build(); lastT = ctx.currentTime; } if (ctx.state === 'suspended') ctx.resume(); } catch { ctx = null; } },
    pause(on) { try { if (!ctx) return; if (on) { releaseHorn(); ctx.suspend(); } else ctx.resume(); } catch {} },
    horn,   // horn(true) 누름 · horn(false) 뗌. 울리기 시작했으면 true
    get honking() { return !!hornHeld; },
    get hornId() { return hornOf(carKey); },
    setMuted(value) { muted = !!value; if (muted) releaseHorn(); try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch {} if (out) out.gain.setTargetAtTime(muted ? 0 : tuning.master, ctx.currentTime, 0.03); },
    update(view) {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime, dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      const speed = Math.abs(view.speed || 0), boosting = view.boost > 0, thr = boosting ? 1 : clamp01(view.throttle || 0), G = V.gears;
      // 변속: 이 기어에서의 회전이 높으면 올리고(밟는 중), 낮으면 내린다. 올릴 때 잠깐 힘이 끊기고 '탁', 내릴 때 회전이 튀어 오른다.
      // 값은 목소리(V)의 것 — 지금 소리는 tuning 과 같은 값이라 그 전과 똑같다. 기어가 하나인 목소리(카트 직결 · 전기 · 굴러가는 소리)는 변속이 없다.
      const rpmIn = g => V.redline * speed / G[g];
      if (rpmIn(gear) > V.up && gear < G.length - 1 && t - lastShift > V.upGap) { gear++; lastShift = t; cutUntil = t + V.cut; if (V.click) burst({ ...V.click, attack: 0.001 }); if (V.hiss) burst(V.hiss); if (V.pops && thr > 0.5) pop(0.7); }
      else if (gear > 0 && rpmIn(gear) < V.down && t - lastShift > V.downGap) { gear--; lastShift = t; if (V.pops) pop(1); }
      const launch = gear === 0 ? V.idle + thr * V.launch * clamp01(1 - speed / G[0] * V.launchFade) : 0;
      const target = Math.min(V.redline + V.over, Math.max(V.idle, rpmIn(gear), launch) + (boosting ? V.boostRpm : 0));
      const tau = t - lastShift < V.settle ? V.tau[0] : target > rpm ? V.tau[1] : V.tau[2];
      rpm += (target - rpm) * (1 - Math.exp(-dt / tau));
      load += ((t < cutUntil ? V.cutLoad : thr) - load) * (1 - Math.exp(-dt / (t < cutUntil ? V.loadTau[0] : V.loadTau[1])));
      wob = wob * 0.88 + (rnd() - 0.5) * V.wob * (1.4 - load);
      const hz = rpm / 60 / V.revs, w = clamp01((rpm - V.blend[0]) / V.blend[1]), lowW = Math.cos(w * Math.PI / 2), highW = Math.sin(w * Math.PI / 2), on = Math.sqrt(load), off = Math.sqrt(1 - load) * V.off, r = rpm / V.redline;
      // 전기 · 굴러가는 소리는 서 있으면 조용하고 속도만큼 커진다(엔진은 1 — 곱해도 그대로)
      const moving = V.still ? V.still[0] + (1 - V.still[0]) * Math.pow(clamp01(speed / V.still[1]), 0.7) : 1;
      const want = view.menu ? 0 : 1;
      if (awake === null) awake = want;
      else { awake += (want - awake) * (1 - Math.exp(-dt / MENU_FADE)); if (Math.abs(want - awake) < 1e-3) awake = want; }
      for (const layer of eng.layers) {
        layer.src.playbackRate.setTargetAtTime(hz / layer.f0 * (1 + wob), t, 0.012);
        layer.g.gain.setTargetAtTime((layer.name.startsWith('low') ? lowW : highW) * (layer.name.endsWith('On') ? on : off), t, 0.02);
      }
      eng.drive.gain.setTargetAtTime(V.drive[0] + V.drive[1] * load, t, 0.03);
      eng.lp.frequency.setTargetAtTime(V.lp[0] + load * V.lp[1] + rpm * V.lp[2], t, 0.04);
      eng.screamG.gain.setTargetAtTime(V.scream[2] + V.scream[3] * load * r, t, 0.04);
      eng.gain.gain.setTargetAtTime(tuning.engine * V.gain * (V.load[0] + V.load[1] * load) * (0.75 + 0.25 * r) * (boosting ? 1.15 : 1) * moving * awake, t, 0.03);
      eng.intake.gain.gain.setTargetAtTime(load * r * V.intake[2] * awake, t, 0.05);
      // 떼고 높은 회전에서 내려올 때 '타닥타닥'
      if (V.pops && load < 0.25 && rpm > V.pops.min && rnd() < dt * V.pops.rate * clamp01((rpm - V.pops.min) / V.pops.span + 0.3)) pop(0.8);
      voiceExtras(t, dt, speed, thr, r, moving);
      lastSpeed = speed; lastThr = thr;
      const slide = view.drifting && view.grounded !== false ? Math.min(1, Math.abs(view.slip || 0) / 0.35) * Math.min(1, speed / 7) : 0;
      if (tyreMode === 'old') {
      tyre.src.playbackRate.setTargetAtTime(0.9 + speed * 0.005 + Math.abs(view.slip || 0) * 0.3, t, 0.06);
      tyre.gain.gain.setTargetAtTime(Math.pow(slide, 1.4) * tuning.screech, t, slide > 0 ? 0.03 : 0.07);
      tyre.scrub.gain.gain.setTargetAtTime(slide * 0.09, t, 0.04); tyre.scrub.filter.frequency.setTargetAtTime(500 + speed * 18, t, 0.1);
      } else tyreUpdate(t, slide, speed, Math.abs(view.slip || 0));
      const kind = boosting ? view.boostKind || 'item' : '';
      if (boosting && (!wasBoost || kind !== wasKind)) boostStart(kind, t);
      if (!boosting && wasBoost && wasKind !== 'kick') { burst({ type: 'highpass', from: 2800, to: 1200, q: 0.7, seconds: 0.4, level: 0.09, attack: 0.008 }); sweep(5000, 2500, 0.3, 0.012); }
      wasBoost = boosting; wasKind = kind;
      if (t > windHold) {
        wind.gain.gain.setTargetAtTime(boosting ? tuning.boost * (0.85 + 0.3 * rnd()) : Math.max(0, speed - 12) * 0.0025, t, boosting ? 0.05 : 0.25);
        wind.filter.frequency.setTargetAtTime(boosting ? 2500 + rnd() * 400 : 800 + speed * 35, t, 0.15);
      }
      if (Number.isFinite(view.stock)) { if (wasStock !== null && view.stock > wasStock) chime(); wasStock = view.stock; }
      else { const full = view.gauge >= 100; if (full && !wasFull) chime(); wasFull = full; }
      if (view.wallHit && t - lastHit > 0.22) { lastHit = t; impact(0.35 + 0.65 * Math.min(1, speed / 26)); }
      if (view.crash > 0 && t - lastCrash > 0.3) { lastCrash = t; crunch(Math.min(1, view.crash / 30)); }   // view.crash: 이 화면에서 깎인 차 상태(%)
      // 피트 크루: view.wrench = 돌고 있는 렌치의 수(많을수록 촘촘히 겹친다), view.jack = 'up' | 'down'(그 화면에만)
      if (view.wrench > 0 && t >= nextWrench) { wrench(0.8 + 0.25 * rnd()); nextWrench = t + (0.42 + 0.3 * rnd()) / Math.min(2.2, 0.6 + 0.4 * view.wrench); }
      if (view.jack === 'up') jack(true); else if (view.jack === 'down') jack(false);
      const landed = +view.landed || 0;
      if (landed >= 1.5 && t - lastLand > 0.15) { lastLand = t; land(Math.min(1, (landed - 1) / 6)); }
    },
    // 초읽기: 짧고 맑은 '딧' 하나 — 3번이든 신호등 5번이든 같은 결로 이어진다. 출발은 한 옥타브 위 두 음.
    count(final) { if (final) { ding(1480, 0.7, 0.17); ding(740, 0.7, 0.11); } else ding(740, 0.2, 0.15, 0, 2, 0.6); },
    lap(best) { ding(988, 0.25, 0.13); ding(1319, 0.45, 0.13, 0.1); if (best) ding(1760, 0.8, 0.12, 0.22); },
  };
  return api;
}
