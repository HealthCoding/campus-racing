// 경주 — 컴퓨터 상대, 출발 자리, 순위, 카트끼리 밀어내기, 결승. THREE 를 쓰지 않는 순수 계산(Node 시험이 같이 쓴다).
//   const race = createRace({ course, parts, world, ground, params });      params = 등급을 곱한 카트 값(내 카트와 같은 것)
//   race.place();                          상대를 출발 자리에 세운다. 내 자리는 race.grid(race.playerSlot)
//   매 틱(내 카트의 주행 계산 뒤):  race.step(time, me)      me = { state: sim.state, clock }  — 상대를 한 틱 움직이고, 카트끼리 겹치면 밀어낸다(내 카트 포함)
//   race.standings(me)                     → [{ id, name, colour, me, rank, lap, progress, finished(초 | null) }] 순위 순
// 상대는 자동 운전(중심선에서 옆으로 비킨 제 주행선)으로 달린다. 드리프트는 못 하지만, 사람이 드리프트로 모으는 만큼 코너에서 게이지가 차고 곧은 길에서 부스터를 쓴다.
// 같은 입력이면 같은 결과다(무작위 없음) — 상대마다 실력 값이 정해져 있다.
import { createKartSim } from '../kart/physics.js';
import { createAutoDriver } from '../kart/autodrive.js';
import { createLapClock } from '../track/track.js';
import { createRescue } from '../track/rescue.js';
import { sin, cos, hypot } from '../shared/dmath.js';   // 결정적 수학(몸싸움 · 출발 자리)

export const RACE = {
  laps: 3,
  // 출발 자리: 출발선 뒤 first m 부터 두 줄로, 줄 사이 row m, 오른쪽 줄은 stagger m 더 뒤. 옆으로 ±side m (값은 길이 kart m 인 카트 기준 — 예전 자리)
  // 차마다 길이가 다르면(2026-11-23 실제 크기) 범퍼로 세운다: 맨 앞 차의 앞 범퍼가 출발선 뒤 first − kart/2, 다음 자리의 앞 범퍼는 바로 앞 자리보다 stagger 뒤이면서
  //   같은 줄 앞 차의 뒤 범퍼보다 gap(= row − kart) 뒤. 맨 뒤 범퍼가 출발선 뒤 room m 를 넘으면(헤어핀이 끝나는 곳) 앞 여유 · 엇갈림 · 간격을 tight 쪽으로 줄여 맞춘다.
  //   side 2.8(2026-11-24 길 폭 14 m — 그 전 2.6): 넓어진 길에서 두 줄 사이를 0.4 m 벌린다(옆 차와 가장 좁은 틈 3.14 → 3.54 m). 3.0 은 코스 B 의 출발 자리에서 가장 긴 차의
  //   귀퉁이가 길 가장자리 0.4 m 안으로 들어가 안 됐다(중심선이 길 한가운데보다 왼쪽 — 왼쪽 반폭 약 6.3 m). 잰 것: node 시안/길폭14_src/grid-room.mjs
  grid: { first: 5, row: 5, stagger: 2.4, side: 2.8, kart: 1.82, room: 24, tight: { front: 1.2, stagger: 0, gap: 1.0 } },
  // 카트끼리(몸싸움 — 사용자 2026-11-21 "부딪히면 튕겨 나가는 느낌 · 차별로 몸싸움 스펙"): 반지름 radius 의 원으로 보고 겹친 만큼 밀어낸다(한 틱에 push 비율만큼, 카트마다 most m 까지만 — 벽을 넘지 않게).
  //   부딪힘 모양(bodies — 차마다 길이 방향 원 여럿, karts.js 의 footprintOf)을 주면 그 원들끼리 가장 깊이 겹친 짝으로 본다. 그때 한 틱의 한도는 min(most, mostShare × 그 차의 원 반지름).
  //   다가오던 빠르기는 bounce 만큼 되튕긴다(떨어지는 빠르기가 적어도 pop m/s — 살짝 닿아도 튕긴다). 튕기는 몫은 무게에 반비례한다: 가벼운 차가 더 멀리 간다. 한 번에 top m/s 까지. 높이 차 level 넘으면 다른 층.
  bump: { radius: 0.78, push: 0.5, level: 1.2, most: 0.3, mostShare: 0.4, bounce: 0.6, pop: 2.4, top: 8 },
  // 고무줄: 나와의 거리 reach m 마다 속도 ±gain(최대 ±max). 출발 after 초 뒤부터.
  band: { reach: 100, gain: 0.035, max: 0.05, after: 8 },
  cornerRadius: 40,      // 이보다 급하게 도는 동안만 게이지가 찬다(사람이 드리프트할 만한 코너)
  lineClear: 1.2,        // 부딪힘 모양을 주면: 상대의 주행선을 벽에서 (그 차 폭의 반 + lineClear) m 안쪽으로만 둔다(폭이 좁아지는 하늘길 내리막에서 큰 차가 벽을 스쳤다 — 2026-11-23)
};
// 상대 일곱: pace = 최고 속도 배율, corner = 코너 속도 배율, line = 주행선(통로 반폭의 몇 배만큼 오른쪽 +), react = 출발 신호 뒤 밟기까지(초),
// charge = 코너에서 1 rad 돌 때 차는 게이지(사람이 직각 코너를 드리프트하면 약 80)
export const RIVALS = [
  { id: 'r1', name: '연두', colour: '#2f9e5b', pace: 1.000, corner: 1.00, line: -0.30, react: 0.10, charge: 46 },
  { id: 'r2', name: '감자', colour: '#e6b422', pace: 0.985, corner: 0.99, line: 0.34, react: 0.16, charge: 42 },
  { id: 'r3', name: '모과', colour: '#e07a2f', pace: 0.970, corner: 0.98, line: -0.08, react: 0.22, charge: 38 },
  { id: 'r4', name: '호떡', colour: '#c8362b', pace: 0.955, corner: 0.97, line: 0.14, react: 0.20, charge: 34 },
  { id: 'r5', name: '두부', colour: '#e9edf2', pace: 0.940, corner: 0.96, line: -0.44, react: 0.28, charge: 30 },
  { id: 'r6', name: '단풍', colour: '#d95a9a', pace: 0.925, corner: 0.95, line: 0.46, react: 0.34, charge: 26 },
  { id: 'r7', name: '은행', colour: '#7a4fc0', pace: 0.910, corner: 0.94, line: 0.00, react: 0.40, charge: 22 },
];

// 난이도: 상대의 실력 값에 곱하는 묶음(사용자 2026-11-21 "지금 AI 너무 못해서 난이도 조절을"). easy 는 아무것도 바꾸지 않는다 — 그 전의 상대 그대로.
// 상대는 드리프트를 못 하므로, 사람이 드리프트로 얻는 몫(코너를 더 빨리 돈다 · 게이지가 더 찬다 · 코너를 나오며 빨리 붙는다)을 값으로 준다.
//   spread = 상대끼리의 실력 차를 줄이는 비율(1 = 그대로, 0.5 = 절반 — 무리가 촘촘해진다) · grip = 고속 회전 반경 배율(작을수록 코너를 빨리 돈다)
//   corner = 코너 속도 계획의 여유(1 보다 작게 — grip 을 올린 만큼 빨라지되 출구에서 밖으로 밀리지 않게) · charge = 코너에서 차는 게이지 배율 · accel = 가속 배율
//   pace = 최고 속도 배율(1 로 둔다 — 코스 B 는 32 m/s 가 한계라 사람의 카트보다 빠르게 하면 벽에 닿는다)
//   react = 출발 반응 시간 배율 · brake = 감속 계획에 쓰는 브레이크 비율(클수록 늦게 밟는다) · ease = 내가 뒤처졌을 때 상대가 늦춰 주는 정도(고무줄의 느려지는 쪽 배율)
export const LEVELS = [
  { id: 'easy', name: '쉬움', spread: 1, grip: 1, corner: 1, charge: 1, accel: 1, pace: 1, react: 1, brake: 0.6, ease: 1 },
  { id: 'normal', name: '보통', spread: 0.7, grip: 0.88, corner: 0.98, charge: 1.25, accel: 1.05, pace: 1, react: 0.7, brake: 0.64, ease: 0.6 },
  { id: 'hard', name: '어려움', spread: 0.5, grip: 0.72, corner: 0.95, charge: 1.6, accel: 1.1, pace: 1, react: 0.45, brake: 0.66, ease: 0.25 },
  { id: 'expert', name: '전문가', spread: 0.35, grip: 0.64, corner: 0.95, charge: 2, accel: 1.15, pace: 1, react: 0.25, brake: 0.68, ease: 0 },
];
export const DEFAULT_LEVEL = 'normal';
export const levelOf = id => LEVELS.find(l => l.id === id) || LEVELS[0];

// 중심선에서 옆으로 비킨 주행선(통로 반폭의 frac 배, 오른쪽 +). 점 수는 중심선과 같다.
// clear(m)를 주면 그 쪽 벽에서 clear 보다 가까이 가지 않게 줄인다(차 폭의 반 + 여유 — 큰 차). 0 이면 예전 그대로.
export function lineSamples(course, frac, clear = 0) {
  const C = course.centre, n = C.length;
  return C.map((c, i) => {
    const a = C[(i - 1 + n) % n], b = C[(i + 1) % n], fx = b[0] - a[0], fz = b[1] - a[1], l = hypot(fx, fz) || 1;
    let off = frac * (frac >= 0 ? c[3] : c[2]) - Math.sign(frac) * Math.min(1.2, Math.abs(frac) * 1.2);   // 벽에서 조금 떨어져서
    if (clear > 0) { const room = Math.max(0, (off >= 0 ? c[3] : c[2]) - clear); if (Math.abs(off) > room) off = Math.sign(off) * room; }
    return [c[0] - fz / l * off, c[1] + fx / l * off, c[2], c[3]];
  });
}

// 카트끼리 부딪힘(몸싸움). list = [주행 상태(state), ...] — 자리(x, z)를 바로 고치고, 튕겨 난 속도를 state.shoveX · shoveZ 에 더한다(주행 계산이 잠깐 동안 그만큼 더 움직인다 — physics.js 8)).
// weights[i] = i 번 카트의 무게(없으면 1). 겹친 만큼 미는 것도, 튕기는 것도 무게에 반비례해 나눈다(충격량): 무거운 차는 덜 밀리고 가벼운 차는 멀리 간다.
// bodies[i] = i 번 카트의 부딪힘 모양({ radius, offsets } — 없으면 반지름 tuning.radius 의 원 하나). 두 차의 원끼리 가장 깊이 겹친 짝의 방향 · 깊이로 민다.
// 짝마다 밀 양을 먼저 다 더한 뒤(넣은 순서와 무관), 카트마다 한 틱에 most m 까지만 옮긴다: 주행 계산은 차의 원 가운데를 벽에서 반지름 넘게 떼어 두므로
// 그보다 적게 옮기면 가운데가 벽을 넘지 못한다(넘으면 다음 틱의 주행 계산이 바깥쪽으로 꺼내 버린다). 벽 쪽으로 밀린 만큼은 다음 틱에 주행 계산이 되돌린다.
const moveX = [], moveZ = [], kickX = [], kickZ = [], ONE = [0];
export function bump(list, tuning = RACE.bump, weights = null, bodies = null) {
  const R = tuning.radius, n = list.length; let touched = 0;
  for (let i = 0; i < n; i++) { moveX[i] = 0; moveZ[i] = 0; kickX[i] = 0; kickZ[i] = 0; }
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const p = list[a], q = list[b];
    if (Math.abs(p.y - q.y) > tuning.level) continue;                                    // 다른 층(다리 위와 다리 밑)
    const A = bodies ? bodies[a] : null, B = bodies ? bodies[b] : null;
    let nx, nz, overlap;
    if (!A && !B) {                                                                        // 원 하나끼리(예전 그대로)
      nx = q.x - p.x; nz = q.z - p.z; const d = hypot(nx, nz); if (d >= 2 * R) continue;
      if (d > 1e-6) { nx /= d; nz /= d; } else { nx = sin(p.heading + Math.PI / 2); nz = cos(p.heading + Math.PI / 2); }   // 정확히 겹쳤으면 옆으로
      overlap = 2 * R - d;
    } else {
      const ra = A ? A.radius : R, rb = B ? B.radius : R, oa = A ? A.offsets : ONE, ob = B ? B.offsets : ONE;
      const pfx = sin(p.heading), pfz = cos(p.heading), qfx = sin(q.heading), qfz = cos(q.heading);
      const reachA = Math.max(Math.abs(oa[0]), Math.abs(oa[oa.length - 1])) + ra, reachB = Math.max(Math.abs(ob[0]), Math.abs(ob[ob.length - 1])) + rb;
      if (hypot(q.x - p.x, q.z - p.z) >= reachA + reachB) continue;                  // 멀다
      let best = Infinity, bx = 0, bz = 0;
      for (const u of oa) for (const v of ob) {
        const dx = q.x + qfx * v - (p.x + pfx * u), dz = q.z + qfz * v - (p.z + pfz * u), d = hypot(dx, dz) - ra - rb;
        if (d < best) { best = d; bx = dx; bz = dz; }
      }
      if (best >= 0) continue;
      const d = hypot(bx, bz);
      if (d > 1e-6) { nx = bx / d; nz = bz / d; } else { nx = q.x - p.x; nz = q.z - p.z; const c = hypot(nx, nz); if (c > 1e-6) { nx /= c; nz /= c; } else { nx = sin(p.heading + Math.PI / 2); nz = cos(p.heading + Math.PI / 2); } }
      overlap = -best;
    }
    const ia = 1 / Math.max(0.2, weights ? weights[a] ?? 1 : 1), ib = 1 / Math.max(0.2, weights ? weights[b] ?? 1 : 1), share = ia + ib;
    const push = overlap * tuning.push;                                                   // 둘이 합쳐 벌어질 거리 — 무게에 반비례해 나눈다(같은 무게면 반씩)
    moveX[a] -= nx * push * ia / share; moveZ[a] -= nz * push * ia / share; moveX[b] += nx * push * ib / share; moveZ[b] += nz * push * ib / share;
    // 다가오던 빠르기(p → q 방향, 튕겨 나던 속도까지 넣어서). 다가오는 중일 때만 튕긴다 — 이미 떨어지는 중이면 겹친 것만 편다.
    const pvx = p.speed * sin(p.course) + (p.shoveX || 0), pvz = p.speed * cos(p.course) + (p.shoveZ || 0), qvx = q.speed * sin(q.course) + (q.shoveX || 0), qvz = q.speed * cos(q.course) + (q.shoveZ || 0);
    const closing = (pvx - qvx) * nx + (pvz - qvz) * nz;
    if (closing > 0) {
      const impulse = (closing + Math.max(closing * (tuning.bounce ?? 0), tuning.pop ?? 0)) / share;   // 둘 사이의 빠르기를 '다가옴 → 떨어짐'으로 바꾸는 충격량
      kickX[a] -= nx * impulse * ia; kickZ[a] -= nz * impulse * ia; kickX[b] += nx * impulse * ib; kickZ[b] += nz * impulse * ib;
    }
    touched++;
  }
  const most = tuning.most ?? Infinity, top = tuning.top ?? Infinity, mostShare = tuning.mostShare ?? Infinity;
  for (let i = 0; i < n; i++) {
    const m = hypot(moveX[i], moveZ[i]), cap = bodies && bodies[i] ? Math.min(most, mostShare * bodies[i].radius) : most;
    if (m > 0) { const k = m > cap ? cap / m : 1; list[i].x += moveX[i] * k; list[i].z += moveZ[i] * k; }
    if (kickX[i] !== 0 || kickZ[i] !== 0) {
      const st = list[i]; let sx = (st.shoveX || 0) + kickX[i], sz = (st.shoveZ || 0) + kickZ[i]; const v = hypot(sx, sz); if (v > top) { sx *= top / v; sz *= top / v; }
      st.shoveX = sx; st.shoveZ = sz;
    }
  }
  return touched;
}

// 출발 자리의 앞 범퍼(출발선 뒤 m)를 범퍼로 세운다. sizes[k] = k 번 자리 차의 { front, back }(원점에서 앞 · 뒤 범퍼까지 — 없으면 길이 G.kart 의 카트).
// → { at: [k 번 자리 원점의 출발선 뒤 거리], back: 맨 뒤 범퍼, squeeze: 0(넉넉함) ~ 1(가장 좁게도 room 을 넘음) }
export function gridLayout(sizes, G = RACE.grid) {
  const kart = G.kart ?? 1.82, base = { front: G.first - kart / 2, stagger: G.stagger, gap: G.row - kart }, tight = { ...base, ...(G.tight || {}) };
  const size = k => sizes[k] || { front: kart / 2, back: kart / 2 };
  const lay = w => {
    const fr = base.front + (tight.front - base.front) * w, st = base.stagger + (tight.stagger - base.stagger) * w, gap = base.gap + (tight.gap - base.gap) * w;
    const front = [], at = []; let back = 0;
    for (let k = 0; k < sizes.length; k++) {
      let f = k === 0 ? fr : front[k - 1] + st;
      if (k >= 2) f = Math.max(f, front[k - 2] + size(k - 2).front + size(k - 2).back + gap);   // 같은 줄 앞 차의 뒤 범퍼 + 간격
      front[k] = f; at[k] = f + size(k).front; back = Math.max(back, f + size(k).front + size(k).back);
    }
    return { at, back };
  };
  let w = 0, out = lay(0);
  if (G.room && out.back > G.room) {
    const tightest = lay(1);
    if (tightest.back > G.room) { w = 1; out = tightest; }
    else { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (lay(mid).back > G.room) lo = mid; else hi = mid; } w = hi; out = lay(hi); }
  }
  return { at: out.at, back: out.back, squeeze: w };
}

// level: 난이도(LEVELS 의 id 또는 묶음). 안 주면 easy — 상대의 값을 바꾸지 않는다.
export function createRace({ course, parts, world, ground = () => 0, params, laps = RACE.laps, rivals = RIVALS, tuning = RACE, level = 'easy' }) {
  const LV = typeof level === 'object' && level ? { ...LEVELS[0], ...level } : levelOf(level);
  const n = course.centre.length, length = course.length, dt = params.dt ?? 1 / 120;
  const rescue = createRescue({ course, parts, ground });
  // 출발 자리(0 = 맨 앞). 내 카트는 맨 뒤 자리.
  const G = tuning.grid, slots = rivals.length + 1, playerSlot = slots - 1;
  // 부딪힘 모양(차마다 — setBodies). bodies[k] = k 번 자리(0 ~ 상대 수 − 1 = 상대, playerSlot = 나)의 footprintOf 값 | null. 하나도 없으면 예전 그대로(카트 간격 · 원 하나)
  const bodies = Array.from({ length: slots }, () => null); let layout = null;
  function grid(slot) {
    const row = Math.floor(slot / 2), right = slot % 2 === 1;
    const behind = layout ? layout.at[slot] : G.first + row * G.row + (right ? G.stagger : 0), s = length - behind, at = parts.pointAt(s, right ? G.side : -G.side);
    return { x: at.x, z: at.z, heading: at.heading, y: ground(at.x, at.z) + parts.deckLift(s) + parts.rampLift(s), index: at.index, s: ((s % length) + length) % length };
  }
  const karts = rivals.map((def, slot) => {
    // 난이도: 상대끼리의 차를 줄이고(spread), 코너 · 가속 · 최고 속도 · 게이지를 올린다
    const pace = (1 - (1 - def.pace) * LV.spread) * LV.pace, corner = (1 - (1 - def.corner) * LV.spread) * (LV.corner ?? 1);
    const base = { maxSpeed: params.maxSpeed * pace, boostMaxSpeed: params.boostMaxSpeed * pace, accel: params.accel * LV.accel, boostAccel: params.boostAccel * LV.accel };
    const P = { ...params, ...base, turnRadiusPerSpeed2: params.turnRadiusPerSpeed2 * LV.grip }, sim = createKartSim({ params: P, world });
    const drive = (clear = 0) => createAutoDriver({ samples: lineSamples(course, def.line * (LV.line ?? 1), clear), params: P, speedScale: corner, brakeUse: LV.brake });
    return { id: def.id, def, slot, base, sim, react: def.react * LV.react, charge: def.charge * LV.charge, drive, clear: 0, driver: drive(), clock: createLapClock(course), watch: rescue.watcher(),
      finished: null, rescues: 0, prev: { x: 0, y: 0, z: 0, heading: 0, course: 0, pitch: 0, roll: 0, speed: 0 }, cur: { x: 0, y: 0, z: 0, heading: 0, course: 0, pitch: 0, roll: 0, speed: 0 } };
  });
  const copy = (to, s) => { to.x = s.x; to.y = s.y; to.z = s.z; to.heading = s.heading; to.course = s.course; to.pitch = s.pitch || 0; to.roll = s.roll || 0; to.speed = s.speed; return to; };
  // 순위를 가르는 값: 달린 거리(m). 출발선을 넘기 전에는 음수.
  const startS = k => grid(k.slot).s;
  // 랩 시계는 출발선을 거꾸로 되넘으면 '아직 출발 전'으로 돌아간다(끝낸 바퀴 수는 그대로) → 그때는 선 뒤쪽의 s 를 한 바퀴 앞의 것으로 읽는다.
  const progressOf = (clock, fallbackS) => { const s = clock.s ?? fallbackS; return clock.lap * length + (clock.started ? s : s - length); };
  const states = [], weightList = [], bodyList = [];   // 밀어내기에 넘기는 재사용 배열
  const weights = rivals.map(() => 1);  // 상대마다의 무게(몸싸움) — 입은 차가 바뀌면 밖에서 고친다(race.weights[i] = …). 내 무게는 me.weight

  // 차마다의 부딪힘 모양을 준다(입은 차가 바뀔 때 — main.js 의 weigh). list[i] = i 번 상대의 것, mine = 내 차의 것(없으면 null). 출발 자리도 이것으로 다시 센다.
  // ref(선택 — 2026-11-24 경주 랭킹): 출발 자리를 셀 때 내 자리에 이 차를 세운 것으로 센다 → 상대 일곱의 자리가 내 차의 크기와 무관하다(같은 규칙). 내 자리는 그 앞 범퍼 자리에 내 차의 앞 범퍼를 맞춘다.
  function setBodies(list = [], mine = null, ref = null) {
    karts.forEach((k, i) => {
      bodies[k.slot] = list[i] || null; k.sim.setBody(bodies[k.slot]);
      const clear = bodies[k.slot] ? (bodies[k.slot].width ?? 2 * bodies[k.slot].radius) / 2 + (tuning.lineClear ?? 0) : 0;   // 주행선도 그 차의 폭에 맞춘다
      if (clear !== k.clear) { k.clear = clear; k.driver = k.drive(clear); }
    });
    bodies[playerSlot] = mine || null;
    if (ref && mine) {
      layout = gridLayout([...bodies.slice(0, playerSlot), ref], G);
      layout.at[playerSlot] += (mine.front ?? G.kart / 2) - (ref.front ?? G.kart / 2);   // 앞 범퍼 자리는 그대로, 원점만 내 차의 앞 길이로
    } else layout = bodies.some(Boolean) ? gridLayout(bodies, G) : null;
    return layout;
  }
  function place() {
    for (const k of karts) { const at = grid(k.slot); k.sim.reset(at); k.driver.reset(at.index); k.clock.reset(); k.clock.locate(at.index); k.watch.reset(at.index); k.finished = null; k.rescues = 0; copy(k.prev, k.sim.state); copy(k.cur, k.sim.state); Object.assign(k.sim.params, k.base); }
  }
  // time = 출발 신호부터 흐른 시간(이번 틱이 끝난 때). me = { state, clock, finished } — 내 카트(없으면 상대끼리만)
  function step(time, me = null) {
    const mine = me ? progressOf(me.clock, grid(playerSlot).s) : null;
    for (const k of karts) {
      const st = k.sim.state; copy(k.prev, st);
      // 고무줄: 나보다 멀리 뒤면 조금 빠르게, 멀리 앞이면 조금 느리게
      let band = 1;
      if (mine !== null && time > tuning.band.after && !me.finished) band = 1 + Math.max(-tuning.band.max * LV.ease, Math.min(tuning.band.max, (mine - progressOf(k.clock, startS(k))) / tuning.band.reach * tuning.band.gain));   // 느려지는 쪽은 난이도가 높을수록 덜
      k.sim.params.maxSpeed = k.base.maxSpeed * band; k.sim.params.boostMaxSpeed = k.base.boostMaxSpeed * band;
      let input;
      if (k.finished !== null) input = { steer: k.driver.input(st).steer, throttle: st.speed < 9 ? 0.6 : 0, brake: st.speed > 12 ? 0.4 : 0, drift: false, boost: false };   // 결승 뒤: 길을 따라 천천히 계속 달린다(서 버리면 뒤에 들어오는 카트의 길을 막는다)
      else if (time < k.react) input = { steer: 0, throttle: 0, brake: 0, drift: false, boost: false };
      else {
        input = k.driver.input(st);
        // 코너에서 게이지가 찬다(드리프트 대신): 급하게 도는 동안, 돈 각에 비례해서
        const kappa = Math.abs(k.driver.curvature());
        if (kappa > 1 / tuning.cornerRadius && st.grounded && st.speed > 6 && st.boost <= 0) st.gauge = Math.min(100, st.gauge + k.charge * kappa * st.speed * dt);
      }
      k.sim.step(input);
      const back = k.watch.update(st, dt);
      if (back) { k.sim.reset(back); st.speed = back.speed; k.driver.reset(back.index); k.clock.locate(back.index); k.rescues++; copy(k.prev, st); }
    }
    // 카트끼리(내 카트 포함) 밀어내기
    states.length = 0; if (me) states.push(me.state); for (const k of karts) states.push(k.sim.state);
    weightList.length = 0; if (me) weightList.push(me.weight ?? 1); for (let i = 0; i < karts.length; i++) weightList.push(weights[i] ?? 1);
    bodyList.length = 0; if (me) bodyList.push(me.body !== undefined ? me.body : bodies[playerSlot]); for (const k of karts) bodyList.push(bodies[k.slot]);
    const touched = bump(states, tuning.bump, weightList, bodyList.some(Boolean) ? bodyList : null);
    for (const k of karts) {
      const st = k.sim.state; copy(k.cur, st);
      for (const event of k.clock.update(k.prev, k.cur, time)) if (event.type === 'lap' && k.finished === null && k.clock.lap >= laps) k.finished = event.at;
    }
    return touched;
  }
  function standings(me = null) {
    const rows = karts.map(k => ({ id: k.id, name: k.def.name, colour: k.def.colour, me: false, lap: Math.min(laps, k.clock.lap + 1), progress: progressOf(k.clock, startS(k)), finished: k.finished }));
    if (me) rows.push({ id: 'me', name: me.name ?? '나', colour: me.colour ?? '#1f4fb4', me: true, lap: Math.min(laps, me.clock.lap + 1), progress: progressOf(me.clock, grid(playerSlot).s), finished: me.finished ?? null });
    // 끝낸 카트가 먼저(기록 순), 그다음 달린 거리 순. 같으면 출발 자리 순(정해진 순서 — 같은 입력이면 같은 결과)
    rows.sort((a, b) => (a.finished !== null && b.finished !== null ? a.finished - b.finished : a.finished !== null ? -1 : b.finished !== null ? 1 : b.progress - a.progress));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }
  return { karts, laps, level: LV, weights, bodies, setBodies, get layout() { return layout; }, grid, playerSlot, place, step, standings, rescue, get count() { return karts.length + 1; } };
}
