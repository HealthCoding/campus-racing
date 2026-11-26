// 타임어택 한 틱의 계산 — 게임(src/main.js)과 랭킹 서버(다시 계산 · src/race/verify-run.js)가 같이 쓰는 순수 모듈이다(DOM · three 없음, 브라우저 · Node 공용).
//   const built = buildCourse({ picked: courseOf('B'), heightAt });     코스 · 부품 · 피트 · 세계 · 되돌려 놓기(바뀌지 않는 것 — 여러 판이 같이 쓴다)
//   const T = createTrial(built, { params, body });                     한 판(주행 계산 · 차 상태 · 되돌려 놓기 감시 · 랩 시계 · 시각)
//   placeTrial(T);  매 틱: const { events, back } = stepTrial(T, command);
//   snapshotTrial(T) → 기록점(배열) · restoreTrial(T, snap) 그 값을 받아 이어 간다.
// 게임은 sim · car · watch · clock 을 경주 · 그랑프리와 같이 쓰므로 trialContext 로 제 것을 묶어 넘긴다(main.js 의 tick 타임어택 가지).
// 계산이 달라지는 변경(주행 값 · 코스 자료 · 이 파일의 차례)마다 TRIAL_VER 를 올린다 — trialVersion 이 바뀌어 랭킹이 새 판이 된다.
import { createLapClock, LIFT } from '../track/track.js';
import { createParts, createCourseWorld, structuralParts } from '../track/parts.js';
import { createPit } from '../track/pit.js';
import { createRescue, RESCUE } from '../track/rescue.js';
import { createKartSim, wrapAngle } from '../kart/physics.js';
import { createCarState, DAMAGE } from './carstate.js';
import { classParams } from '../kart/classes.js';
import { KARTS } from '../kart/karts.js';
import { courseOf } from '../track/courses.js';
import { RANK_CLASS } from '../shared/rank-rules.js';

export const TRIAL_VER = 4;           // 2: 3바퀴 합계 · 3: 결정적 수학과 지형 · 4(2026-11-26): 차마다 다른 조향과 드리프트
export const RULES = 6;               // 기록 규칙 번호(유령 · 최고 기록 저장 이름 — main.js 가 쓴다. 올리면 옛 기록과 섞이지 않는다)
// 타임어택 한 판 = 출발 신호(틱 0 · 출발선 6 m 뒤에 서서)부터 TRIAL_LAPS 바퀴째 결승선까지(사용자 2026-11-24 "랭킹이 한바퀴 기준인데, 3바퀴로 하면 좋을듯").
//   기록(ms) = 그 바퀴 사건의 at(출발 신호부터의 시각) — 바퀴별 시간은 앞 바퀴 끝(첫 바퀴는 출발 신호)부터. 서버는 틱 0 의 고정 출발 자리에서 전부 다시 달린다.
export const TRIAL_LAPS = 3;
export const TICK = 1 / 120;
export const CHECK_EVERY = 600;       // 기록점 간격(틱 — 5초)
// 출발 가속을 받을 수 있는 틱: 신호 뒤 startBoostWindow 초 + 화면이 늦게 그려지는 여유(신호가 난 화면에 그 화면의 틱이 다 돌고, 누름은 다음 화면에서 본다 — 화면 한 장은 0.1초까지)
export const GRANT_SLACK = 0.2;
export const grantLimit = params => Math.ceil(((params.startBoostWindow ?? 0) + GRANT_SLACK) / TICK);

// ---- 코스(바뀌지 않는 것). main.js 가 하던 그대로: 부품 → 피트 → 바닥(지형 + 노면 띄움) → 세계(내 카트 — 피트레인 있음) → 되돌려 놓기
export function buildCourse({ picked, heightAt, partsOn = true }) {
  const { course, partsData, pitData } = picked;
  const parts = createParts(course, partsOn ? partsData : structuralParts(partsData));
  const pit = createPit(course, parts, pitData);
  const ground = (x, z) => heightAt(x, z) + LIFT.road;
  const world = createCourseWorld(parts, ground, { pit });
  const rescue = createRescue({ course, parts, ground, also: pit ? (x, z) => (pit.beyond(x, z, 0.6) ? pit.locate(x, z) : null) : null });   // 피트레인도 길 위다
  // 출발 자세: 트랙의 startPose 와 같은 값(노면 높이 = 지형 + 그 s 의 띄움 — 출발선 6 m 뒤 가운데)
  const st = course.start, startPose = { x: st.x, z: st.z, heading: st.heading, y: heightAt(st.x, st.z) + parts.deckLift(st.s), s: st.s };
  // 출발선(과 레인 옆의 다른 문)은 피트레인까지 늘려 둔다 — 피트로 지나가도 바퀴가 세어진다
  const widen = pit ? k => { const u = pit.uOf(course.gates[k].s); return u !== null && u >= pit.from && u <= pit.to ? pit.wallAt(u) - pit.edge(u) + 1 : 0; } : null;
  return { id: picked.id, picked, course, parts, pit, ground, world, rescue, startPose, heightAt, makeClock: () => createLapClock(course, { widen }) };
}

const copy = (to, s) => { to.x = s.x; to.y = s.y; to.z = s.z; to.heading = s.heading; to.course = s.course; to.pitch = s.pitch || 0; to.roll = s.roll || 0; to.speed = s.speed; return to; };

// 한 판의 묶음. sim · car · watch · clock 을 주면 그것을 쓴다(게임), 안 주면 새로 만든다(서버 · 시험).
export function trialContext({ built, sim, car, watch, clock, prev = {}, cur = {} }) {
  return { built, sim, car, watch, clock, prev, cur, top: { maxSpeed: 0, boostMaxSpeed: 0 }, capped: false, cappedSim: null, time: 0, tick: 0, finished: false };
}
export function createTrial(built, { params, body = null }) {
  const sim = createKartSim({ params, world: built.world, body });
  return trialContext({ built, sim, car: createCarState({ pit: built.pit }), watch: built.rescue.watcher(), clock: built.makeClock() });
}

// 출발 자리에 세운다(main.js 의 place 가 타임어택에서 하던 것)
export function placeTrial(T) {
  // 피트레인의 제한 속도로 묶인 채 다시 출발하면 다음 틱이 풀어 주던 것을 여기서 푼다(같은 계산 — 주행 값이 바뀐 새 sim 이면 묶였던 값을 쓰지 않는다)
  if (T.capped && T.cappedSim === T.sim) { T.sim.params.maxSpeed = T.top.maxSpeed; T.sim.params.boostMaxSpeed = T.top.boostMaxSpeed; }
  T.capped = false; T.cappedSim = null; T.top.maxSpeed = 0; T.top.boostMaxSpeed = 0;
  T.sim.reset(T.built.startPose); T.car.reset(); T.watch.reset(-1); T.clock.reset();
  T.time = 0; T.tick = 0; T.finished = false;
  copy(T.prev, T.sim.state); copy(T.cur, T.sim.state);
}

// 한 틱: 피트레인 제한 → 주행 계산 → 길 밖이면 되돌려 놓기 → 시각 → 랩 시계. command 는 그 자리에서 고쳐진다(car.before — 피트 제한 속도 · 조향 유도).
//   → { events(랩 시계의 사건), back(되돌려 놓았으면 그 자세 | null) }
export function stepTrial(T, command) {
  const { sim, car, watch, clock, prev, cur } = T, pit = T.built.pit;
  copy(prev, sim.state);
  if (pit && !T.finished) {
    car.before(sim.state, command, TICK, sim.params.brakeDecel);
    if (!T.capped) { T.top.maxSpeed = sim.params.maxSpeed; T.top.boostMaxSpeed = sim.params.boostMaxSpeed; }   // 묶여 있지 않을 때의 값이 제 속도다
    const want = car.cap < Infinity;   // 타임어택에는 차 상태(데미지)가 없다 — 배율 1
    if (want || T.capped) { sim.params.maxSpeed = Math.min(T.top.maxSpeed * 1, car.cap); sim.params.boostMaxSpeed = Math.min(T.top.boostMaxSpeed * 1, car.cap); T.capped = want; T.cappedSim = sim; }
  }
  sim.step(command);
  // 길 밖으로 떨어졌으면(난간 없는 구간) 잠시 뒤 길 위로 되돌려 놓는다. 모아 둔 부스터는 그대로, 돌던 부스트는 꺼진다.
  const back = watch.update(sim.state, TICK);
  if (back) {
    const keep = { gauge: sim.state.gauge, boostStock: sim.state.boostStock, wallContacts: sim.state.wallContacts }; sim.reset(back); Object.assign(sim.state, keep, { speed: back.speed });
    clock.locate(back.index); copy(prev, sim.state);
  }
  T.time += TICK; T.tick++;
  copy(cur, sim.state);
  return { events: clock.update(prev, cur, T.time), back };
}

// 출발선을 앞으로 넘은 사건(바퀴의 시작 · 끝): 첫 출발 · 문을 빠뜨린 채 넘음(무효 — 새로 잰다) · 한 바퀴
export const isLineEvent = e => e.type === 'lap' || (e.type === 'gate' && e.index === 0 && (e.start || e.invalid));

// ---- 기록점: 다시 계산에 필요한 상태 전부를 정해진 차례의 배열로(JSON 으로 작게). 첫 칸은 틱.
//   모든 칸을 견준다(오차는 verify-run.js). 중간에서 맞추는 것은 차의 위치·자세·속도뿐이다. 시계와 구조 감시에 든 거리도 서버 계산에 남긴다.
//   한 틱 안에서만 쓰는 값(wallHit · wallImpact · wallN* · wallP* · vx · vz · boostStarted · boostEarned · landed · boostReady · kickReady)은 다음 틱이 읽기 전에 새로 쓰므로 싣지 않는다.
export const SIM_FIELDS = [
  ['x', 'pos'], ['z', 'pos'], ['y', 'pos'], ['heading', 'ang'], ['course', 'ang'], ['slip', 'ang'], ['pitch', 'ang'], ['roll', 'ang'],
  ['speed', 'vel'], ['steer', 'unit'], ['vy', 'vel'], ['gauge', 'gauge'], ['boost', 'time'], ['air', 'time'], ['groundY', 'pos'],
  ['_w0', 'pos'], ['_w1', 'pos'], ['_w2', 'pos'], ['_w3', 'pos'], ['shoveX', 'vel'], ['shoveZ', 'vel'],
  ['drifting', 'bool'], ['grounded', 'bool'], ['mode', 'enum'], ['boostKind', 'enum'], ['driftDir', 'int'], ['boostStock', 'int'], ['wallContacts', 'int'], ['tick', 'int'],
  ['_driftArm', 'int'], ['_prevSteerDir', 'int'], ['_prevDrift', 'bool'], ['_prevBoost', 'bool'], ['_prevKick', 'bool'], ['_driftSpent', 'bool'], ['_touching', 'bool'], ['_onPad', 'bool'],
  ['_recover', 'time'], ['_reverseHold', 'time'], ['_driftRest', 'time'], ['_wallBlock', 'time'], ['_boostBuffer', 'time'], ['_kickBuffer', 'time'], ['_kickWindow', 'time'], ['_kick', 'time'], ['_driftTime', 'time'],
  ['_yaw', 'yaw'], ['_driftEntry', 'vel'], ['_driftKappa', 'yaw'],
];
// 차 상태(타임어택에서는 늘 같다 — 데미지 없음, 정차 없음) · 되돌려 놓기 감시 · 랩 시계 · 묶인 최고 속도
export const CAR_FIELDS = [['value', 'exact'], ['holding', 'bool']];
export const WATCH_FIELDS = [['index', 'int'], ['safe', 'pos?'], ['off', 'time']];
export const CLOCK_FIELDS = [['lap', 'int'], ['started', 'bool'], ['next', 'int'], ['lapStart', 'time'], ['lastTime', 'time?'], ['hint', 'int'], ['s', 'pos?'], ['back', 'pos'], ['ahead', 'pos'], ['wrongWay', 'bool']];
export const CAP_FIELDS = [['capped', 'bool'], ['topMax', 'exact'], ['topBoost', 'exact'], ['maxSpeed', 'exact'], ['boostMaxSpeed', 'exact']];
// 배열의 차례: [틱, ...SIM, ...CAR, ...WATCH, ...CLOCK, ...CAP]
export const SNAP_FIELDS = [['tick', 'int', 'trial'], ...SIM_FIELDS.map(f => [...f, 'sim']), ...CAR_FIELDS.map(f => [...f, 'car']), ...WATCH_FIELDS.map(f => [...f, 'watch']), ...CLOCK_FIELDS.map(f => [...f, 'clock']), ...CAP_FIELDS.map(f => [...f, 'cap'])];
export const SNAP_LEN = SNAP_FIELDS.length;

const enc = (v, kind) => kind === 'bool' ? (v ? 1 : 0) : v === undefined ? null : v;
// 지금 상태 → 기록점(JSON 으로 바로 보낼 수 있는 배열)
export function snapshotTrial(T) {
  const st = T.sim.state, w = T.watch, c = T.clock.save(), P = T.sim.params, cap = { capped: T.capped, topMax: T.top.maxSpeed, topBoost: T.top.boostMaxSpeed, maxSpeed: P.maxSpeed, boostMaxSpeed: P.boostMaxSpeed };
  const car = { value: T.car.value, holding: T.car.holding }, watch = { index: w.index, safe: w.safe, off: w.off };
  const out = [T.tick];
  for (const [k, kind] of SIM_FIELDS) out.push(enc(st[k], kind));
  for (const [k, kind] of CAR_FIELDS) out.push(enc(car[k], kind));
  for (const [k, kind] of WATCH_FIELDS) out.push(enc(watch[k], kind));
  for (const [k, kind] of CLOCK_FIELDS) out.push(enc(c[k], kind));
  for (const [k, kind] of CAP_FIELDS) out.push(enc(cap[k], kind));
  return out;
}
// 배열 → 이름 붙은 묶음 { sim, car, watch, clock, cap, tick }
export function readSnap(snap) {
  const out = { tick: snap[0], sim: {}, car: {}, watch: {}, clock: {}, cap: {} };
  for (let i = 1; i < SNAP_LEN; i++) { const [k, kind, part] = SNAP_FIELDS[i], v = snap[i]; out[part][k] = kind === 'bool' ? v === 1 : v; }
  return out;
}
// 시작 기록점은 모두 복원한다. 중간 기록점에서는 엔진마다 마지막 자리가 다른 차체 기하만 맞춘다.
const geometryKinds = new Set(['pos', 'pos?', 'ang', 'vel', 'unit', 'yaw']);
const geometryFields = SNAP_FIELDS.flatMap(([name, kind, part], i) => part === 'sim' && geometryKinds.has(kind) ? [[name, kind, i]] : []);
export function restoreTrial(T, snap, { tick = true, geometryOnly = false } = {}) {
  if (geometryOnly) {
    const st = T.sim.state;
    for (const [name, kind, i] of geometryFields) {
      const value = snap[i];
      // 한 바퀴 더해 적은 각도도 비교는 같은 각이다. 물리에는 비교한 작은 차이만 반영한다.
      st[name] = kind === 'ang' && Math.abs(value) > Math.PI ? wrapAngle(st[name] + wrapAngle(value - st[name])) : value;
    }
    copy(T.prev, T.sim.state); copy(T.cur, T.sim.state);
    return;
  }
  const r = readSnap(snap), st = T.sim.state;
  for (const [k] of SIM_FIELDS) st[k] = r.sim[k];
  T.watch.load({ index: r.watch.index, safe: r.watch.safe, off: r.watch.off });
  const c = T.clock.save(); T.clock.load({ ...c, ...r.clock, lapTime: r.clock.started ? (r.clock.lastTime ?? 0) - r.clock.lapStart : 0 });
  T.capped = r.cap.capped; T.cappedSim = r.cap.capped ? T.sim : null; T.top.maxSpeed = r.cap.topMax; T.top.boostMaxSpeed = r.cap.topBoost; T.sim.params.maxSpeed = r.cap.maxSpeed; T.sim.params.boostMaxSpeed = r.cap.boostMaxSpeed;
  if (tick) T.tick = r.tick;
  copy(T.prev, st); copy(T.cur, st);
  return r;
}
export { wrapAngle };

// ---- 코스판: 코스 · 부품 · 피트 자료 + RULES + TRIAL_VER + TRIAL_LAPS + 순위에 쓰는 등급의 주행 값(카트 감각 넷) · 계산이 쓰는 규칙 값을 묶은 해시(16진 8자).
//   차 목록(부딪힘 모양)은 넣지 않는다(2026-11-24): 넣어 두면 새 차를 더할 때마다 순위가 새 판이 된다. 이미 있는 차의 부딪힘 모양 · 기본 감각 · 차별 배율을 고치면 TRIAL_VER 를 올린다 — 검증/car-bodies.test.mjs 가 알려 준다.
//   동기 함수이고 브라우저 · Node 에서 같은 값이다(JSON 글자 → FNV-1a 32비트). 코스마다 한 번만 센다.
const versions = new Map();
const fnv = text => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
export function trialVersion(courseId) {
  const picked = courseOf(courseId), key = picked.id;
  if (versions.has(key)) return versions.get(key);
  const c = picked.course;
  const data = {
    ver: TRIAL_VER, rules: RULES, laps: TRIAL_LAPS, tick: TICK, every: CHECK_EVERY, slack: GRANT_SLACK, klass: RANK_CLASS,
    course: c,   // 트랙 생성물 전부(이름 · 설명 글까지 — 고치면 새 판이 된다. 아무도 이 객체를 고쳐 쓰지 않는다는 것을 시험이 본다)
    parts: picked.partsData ?? null, pit: picked.pitData ?? null, lift: LIFT, rescue: RESCUE, damage: DAMAGE,
    params: KARTS.map(k => [k.id, classParams(RANK_CLASS, { kart: k.id })]),
  };
  const v = fnv(JSON.stringify(data)); versions.set(key, v); return v;
}
