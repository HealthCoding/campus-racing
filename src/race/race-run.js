// 경주(그랑프리 — 2026-11-25 스피드전을 뺐다) 한 판의 계산 — 게임(src/main.js)과 랭킹 서버(다시 계산 · src/race/verify-race.js)가 같이 쓰는 순수 모듈이다(DOM · three 없음, 브라우저 · Node 공용).
//   (2026-11-24 사용자 "경주 랭킹은 공개 전에 넣어야지" — 그 전에는 경주의 한 틱이 main.js 안에만 있어 서버가 같은 계산을 할 수 없었다.)
//   const built = buildCourse(...)(time-trial.js) → withRivalWorld(built)                   상대의 세계(피트레인이 없다 — 벽이 닫혀 있다)
//   const race = newRace(built, { mode, level, klass, car, tuned })                          상대 일곱(고정된 차 · 주행 값 — 아래 RIVAL_CARS)과 출발 자리
//   const R = raceContext({ built, sim, car: carState, watch, clock, race, mode, weight })     내 차를 묶는다(게임은 타임어택과 같은 sim · car · watch · clock 을 쓴다)
//   placeRace(R);  매 틱: const { events, back, carEvent, bumps } = stepRace(R, command);   R.finished(결승 시각 초 | null) · R.place(그때의 등수) · R.lapAt(바퀴마다 결승선 시각)
// 한 틱의 차례(그 전 main.js 의 tick 경주 가지 그대로): 피트레인 제한(car.before — command 를 고친다) → 상한(데미지 · 제한 속도) → 내 주행 → 데미지(car.after, 그랑프리) →
//   되돌려 놓기 → 시각 → **상대 일곱 + 몸싸움(내 차 포함 — race.step)** → 랩 시계. 마지막 바퀴의 결승선을 넘는 틱에 R.finished · R.place 가 정해진다.
// 공정 · 결정(2026-11-24 정한 것):
//   - 상대가 입는 차 · 상대의 주행 값은 **내 차와 무관하게 고정**: 기본 차(GT)로 달릴 때의 상대 그대로(RIVAL_CARS · RIVAL_KART). 그 전에는 내 차 다음 차부터 CARS 차례로 입고
//     주행 값도 내 차의 감각을 따라, 차를 고르면 상대도 바뀌었다(차를 더하면 상대 줄도 바뀌었다).
//   - 출발 자리 · 출발 칸은 같은 규칙(race.js 의 gridLayout — 상대 일곱은 고정, 내 자리는 맨 뒤). 달리는 중에는 부딪힘 모양을 다시 주지 않는다(main.js 의 dress 가 부르던 것을 뺐다).
//   - 출발 가속은 화면 시각으로 판정하되(사람의 손) 받은 틱을 기록에 적고, 서버는 정해진 틱 안인지만 본다(타임어택과 같다 — run-log.js 의 grant).
//   - 계산 경로의 초월 함수는 결정적 수학(src/shared/dmath.js) — 크롬 · Node 가 비트까지 같다(검증/race-run.test.mjs · 검증/race-browser.mjs).
// 계산이 달라지는 변경(상대 값 · 난이도 · 몸싸움 · 데미지 · 이 파일의 차례 · RIVAL_CARS)을 하면 RACE_VER 를 올린다 — raceVersion 이 바뀌어 경주 랭킹이 새 판이 된다.
import { TICK, trialVersion, trialContext, snapshotTrial } from './time-trial.js';
import { createRace, RIVALS, RACE, LEVELS, levelOf, lineSamples } from './race.js';
import { createCourseWorld } from '../track/parts.js';
import { DAMAGE, GP_RULES } from './carstate.js';
import { classParams } from '../kart/classes.js';
import { CARS, DEFAULT_CAR, carOf, footprintOf } from '../kart/karts.js';
import { courseOf } from '../track/courses.js';
import { RANK_CLASS, RACE_LEVEL } from '../shared/rank-rules.js';

export const RACE_VER = 1;
export const RACE_MODES = ['gp'];   // 경주 모드 — 2026-11-25 스피드전(race)을 뺐다. 경주 계산은 그대로(그랑프리가 쓰는 길)
// 상대 일곱이 입는 차(자리 0 ~ 6) — 기본 차(GT)를 고른 사람이 그 전에 보던 상대 그대로(CARS 에서 GT 다음 일곱). 차 목록에 차를 더해도 안 바뀐다.
export const RIVAL_CARS = ['supercar_real', 'golfcart_real', 'forklift_real', 'shoppingcart_real', 'bicycle_real', 'racebike_real', 'truck_real'];
export const RIVAL_KART = carOf(DEFAULT_CAR).kart;   // 상대의 주행 감각(고속형 — GT 의 것). 난이도가 그 위에 곱해진다
export const rivalCarOf = i => carOf(RIVAL_CARS[i % RIVAL_CARS.length]);
// 모드의 바퀴 수 · 데미지(그랑프리 — 피트가 없는 코스는 데미지도 없다)
export const raceLaps = (picked, mode) => picked.laps[mode];
export const raceDamage = (built, mode) => mode === 'gp' && !!built.pit;
// 벽 데미지의 배수(코스마다 — courses.js 의 damageScale, 없으면 1). 게임(main.js) · 다시 계산(verify-race.js)이 같은 값으로 createCarState({ damageScale }) 를 짓는다.
export const damageScaleOf = picked => picked?.damageScale ?? 1;

const copy = (to, s) => { to.x = s.x; to.y = s.y; to.z = s.z; to.heading = s.heading; to.course = s.course; to.pitch = s.pitch || 0; to.roll = s.roll || 0; to.speed = s.speed; return to; };

// 상대의 세계(피트레인 없음). 코스 묶음에 한 번만 붙인다.
export function withRivalWorld(built) {
  built.rivalWorld ||= built.pit ? createCourseWorld(built.parts, built.ground) : built.world;
  return built;
}

// 상대 일곱 · 출발 자리. mine = 내 차(부딪힘 모양 — 출발 자리 간격에 든다). tuned = 조정판(개발용 — 상대도 같이 바뀐다, 랭킹에는 안 오른다)
export function newRace(built, { mode = 'gp', level = RACE_LEVEL, klass = RANK_CLASS, car = DEFAULT_CAR, tuned = null, bodyOff = false } = {}) {
  withRivalWorld(built);
  const params = classParams(klass, { base: tuned, kart: RIVAL_KART });
  const race = createRace({ course: built.course, parts: built.parts, world: built.rivalWorld, ground: built.ground, params, level, laps: raceLaps(built.picked, mode) ?? RACE.laps });
  RIVALS.forEach((_, i) => { race.weights[i] = rivalCarOf(i).weight ?? 1; });
  // 출발 자리: 상대 일곱의 자리는 내 자리에 기본 차(GT)를 세운 것으로 센다 — 어느 차를 골라도 상대의 자리가 같다. 나는 맨 뒤, 같은 앞 범퍼 자리에서
  if (!bodyOff) race.setBodies(RIVALS.map((_, i) => footprintOf(rivalCarOf(i))), footprintOf(carOf(car)), footprintOf(carOf(DEFAULT_CAR)));
  race.mode = mode;
  return race;
}

// 내 차 한 대(경주) — 타임어택의 trialContext 와 같은 칸(snapshotTrial 이 그대로 읽는다) + 경주 것
export function raceContext({ built, sim, car, watch, clock, race, mode = 'gp', weight = 1, prev = {}, cur = {} }) {
  const R = trialContext({ built, sim, car, watch, clock, prev, cur });
  Object.assign(R, { race, mode, damage: raceDamage(built, mode), laps: race.laps, weight, finished: null, place: null, lapAt: [], cappedSim: null });
  R.me = { get state() { return R.sim.state; }, clock, get finished() { return R.finished; }, get weight() { return R.weight; }, get body() { return R.sim.body; } };
  return R;
}

// 속도를 묶은 차에서만 그때의 최고 속도를 되돌린다(main.js 의 applyRaceCap 그대로 — 그 전에는 main.js 에만 있었다)
// accel: 가속 배율(그랑프리의 데미지 — 2026-11-25). 안 주면 1(그 전과 같다)
export function applyRaceCap(sim, top, factor, cap, accel = 1) {
  if (top.cappedSim !== sim) { top.maxSpeed = sim.params.maxSpeed; top.boostMaxSpeed = sim.params.boostMaxSpeed; top.accel = sim.params.accel; }
  const limited = factor < 1 || cap < Infinity || accel < 1;
  if (limited || top.cappedSim === sim) {
    sim.params.maxSpeed = Math.min(top.maxSpeed * factor, cap);
    sim.params.boostMaxSpeed = Math.min(top.boostMaxSpeed * factor, cap);
    sim.params.accel = top.accel * accel;
  }
  top.cappedSim = limited ? sim : null;
}

// 출발 자리에 세운다(내 자리는 맨 뒤 — race.grid(race.playerSlot))
export function placeRace(R) {
  const { sim, car, watch, clock, race } = R, at = race.grid(race.playerSlot);
  applyRaceCap(sim, R.top, 1, Infinity); sim.reset(at); car.reset(); race.place(); watch.reset(at.index);
  copy(R.prev, sim.state); copy(R.cur, sim.state); clock.reset(); clock.locate(at.index);
  R.time = 0; R.tick = 0; R.finished = null; R.place = null; R.lapAt.length = 0;
  return at;
}

// 한 틱. command 는 그 자리에서 고쳐진다(car.before — 피트 제한 속도 · 조향 유도). 결승 뒤에도 부른다(상대가 마저 들어오고 내 차는 천천히 굴러간다 — 그때는 피트 · 데미지를 안 본다).
//   → { events(랩 시계의 사건), back(되돌려 놓았으면 그 자세 | null), carEvent(데미지 사건 | null), bumps(몸싸움 수), finish(이번 틱에 결승했으면 그 사건 | null) }
export function stepRace(R, command) {
  const { sim, car, watch, clock, race, prev, cur } = R, pit = R.built.pit, live = R.finished === null;
  copy(prev, sim.state);
  if (pit && live) { car.before(sim.state, command, TICK, sim.params.brakeDecel, R.damage ? GP_RULES : null, sim.params.boostSlots); applyRaceCap(sim, R.top, R.damage ? car.factor() : 1, car.cap, R.damage ? car.accelFactor() : 1); }   // 그랑프리(데미지)는 GP_RULES — 정차 칸을 지나면 부스터도 채운다(2026-11-25)
  sim.step(command);
  const carEvent = pit && R.damage && live ? car.after(sim.state, TICK) : null;
  // 길 밖으로 떨어졌으면(난간 없는 구간) 잠시 뒤 길 위로 되돌려 놓는다. 모아 둔 부스터는 그대로, 돌던 부스트는 꺼진다.
  const back = watch.update(sim.state, TICK);
  if (back) {
    const keep = { gauge: sim.state.gauge, boostStock: sim.state.boostStock, wallContacts: sim.state.wallContacts }; sim.reset(back); Object.assign(sim.state, keep, { speed: back.speed });
    clock.locate(back.index); copy(prev, sim.state);
  }
  R.time += TICK; R.tick++;
  const bumps = race.step(R.time, R.me);   // 상대를 한 틱 움직이고, 카트끼리 겹치면 밀어낸다(내 카트 포함)
  copy(cur, sim.state);
  const events = clock.update(prev, cur, R.time);
  let finish = null;
  if (live) for (const e of events) {
    if (e.type !== 'lap' || R.finished !== null) continue;
    R.lapAt.push(e.at);
    if (clock.lap >= R.laps) { R.finished = +e.at.toFixed(3); R.place = race.standings(R.me).find(r => r.me).rank; finish = e; }
  }
  return { events, back, carEvent, bumps, finish };
}

// 내 차의 기록점(타임어택과 같은 69칸 — snapshotTrial). 상대는 적지 않는다(서버가 다시 만든다).
export function snapshotRace(R) {
  R.capped = R.top.cappedSim === R.sim;
  return snapshotTrial(R);
}

// ---- 경주 판: 코스판(trialVersion — 코스 · 부품 · 피트 · 주행 값 · TRIAL_VER) + 모드(바퀴 · 데미지) + 상대(RIVALS · 난이도 '어려움' · RIVAL_CARS 의 감각 · 무게 · 크기 · 경주 값 RACE) + RACE_VER.
//   상대 AI 의 값을 고치면 바뀐다(경주 랭킹이 새 판). 동기 · 브라우저 · Node 같은 값(FNV-1a 32비트 16진 8자).
const versions = new Map();
const fnv = text => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
export function raceVersion(courseId, mode) {
  const picked = courseOf(courseId), key = picked.id + ':' + mode;
  if (versions.has(key)) return versions.get(key);
  if (!RACE_MODES.includes(mode)) throw new Error('raceVersion: 모드 ' + mode);
  const data = {
    ver: RACE_VER, trial: trialVersion(picked.id), mode, laps: picked.laps[mode], damage: mode === 'gp' && !!picked.pitData, damageValues: DAMAGE, ...(mode === 'gp' && picked.pitData ? { gpRules: GP_RULES } : {}),   // gpRules: 2026-11-25 피트를 쓸모 있게 — 데미지가 있는 코스만 담아 C 의 판은 그대로
    ...(damageScaleOf(picked) !== 1 ? { damageScale: damageScaleOf(picked) } : {}),   // 벽 데미지 배수(2026-11-25 코스 D ×1.5) — 1 이면 안 담는다(B 의 판이 그대로)
    level: levelOf(RACE_LEVEL), levelId: RACE_LEVEL, rivals: RIVALS, race: RACE, rivalKart: RIVAL_KART, rivalParams: classParams(RANK_CLASS, { kart: RIVAL_KART }),
    rivalCars: RIVAL_CARS.map(id => { const c = carOf(id); return [c.id, c.weight ?? 1, c.size ?? null, c.shift ?? 0]; }),
  };
  const v = fnv(JSON.stringify(data)); versions.set(key, v); return v;
}
export { LEVELS, lineSamples };
