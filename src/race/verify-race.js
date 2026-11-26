// 경주(스피드전 · 그랑프리) 한 판 다시 계산(검증) — 손님이 보낸 내 입력으로 서버가 같은 계산(src/race/race-run.js)을 상대 일곱과 함께 처음부터 끝까지 돌린다. 순수 · 동기 · 던지지 않는다.
//   verifyRace({ course, klass, car, mode, level, run }, { heightAt, stopMs }) → { ok: true, lapMs, lapIndex, place, splits, ticks, worst } | { ok: false, reason, detail }
//   run = run-log.js 의 lastRun() 그대로(경주판: v = RACE_VER · 기록점은 내 차의 것만 · 상대 상태는 없다 — 서버가 고정 출발에서 다시 만든다).
//   lapMs = 서버가 센 결승 시각(출발 신호부터 마지막 바퀴 결승선, ms) · place = 그때의 등수(1 ~ 8) · splits = 바퀴별. 손님이 적은 lapMs · lapIndex 는 안 믿는다.
//   stopMs(선택): 다시 계산한 시간이 이것을 넘도록 결승하지 못하면 거기서 멈춘다(reason 'slower' — 서버는 손님이 주장한 시간 + 1 ms 를 준다. 정직한 판은 주장 = 계산이라 걸리지 않는다).
// 기록점(600틱마다 — 내 차의 69칸)은 **일찍 멈추기에만** 쓴다: 허용 오차(verify-run.js 의 TOLERANCE)를 넘으면 그 자리에서 거절하고, 맞춰 이어 가지는 않는다
//   (결정적 수학으로 엔진마다 비트까지 같으므로 맞출 것이 없다 — 손님 값이 계산에 들어가는 길을 아예 없앤다).
// 거절 까닭(reason): verify-run.js 의 것 + mode(모르는 모드) · level(어려움이 아님) · slower(주장한 시간 안에 결승 못 함)
import { CHECK_EVERY, SNAP_LEN, buildCourse, grantLimit } from './time-trial.js';
import { RACE_VER, RACE_MODES, newRace, raceContext, placeRace, stepRace, snapshotRace, damageScaleOf } from './race-run.js';
import { snapShapeOk, compare, unexpected, expandInputs } from './verify-run.js';
import { decodeInput, INPUT_MAX, BIT, MAX_RUN_TICKS, MAX_RUN_MS } from './run-log.js';
import { COURSES } from '../track/courses.js';
import { SPEED_CLASSES, carParams } from '../kart/classes.js';
import { CARS, footprintOf } from '../kart/karts.js';
import { createKartSim } from '../kart/physics.js';
import { createCarState } from './carstate.js';
import { RACE_LEVEL } from '../shared/rank-rules.js';

const fail = (reason, detail = null) => ({ ok: false, reason, detail });
const isInt = v => Number.isInteger(v);

const built = new WeakMap();
function courseFor(id, heightAt) {
  let m = built.get(heightAt); if (!m) built.set(heightAt, m = new Map());
  if (!m.has(id)) m.set(id, buildCourse({ picked: COURSES.find(c => c.id === id), heightAt }));
  return m.get(id);
}

// 지형 · 코스 없이 하는 값싼 검사(서버가 예산을 깎기 전에 부른다)
export function raceShapeError(sub) {
  try { return shapeError(expandInputs(sub)); } catch (error) { return unexpected(error); }
}

function shapeError(sub) {
  if (!sub || typeof sub !== 'object') return fail('shape', 'submission');
  const { course, klass, car, mode, level, run } = sub;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return fail('shape', 'run');
  if (run.v !== RACE_VER) return fail('version', run.v);
  if (!RACE_MODES.includes(mode)) return fail('mode', mode);
  if (level !== RACE_LEVEL) return fail('level', level);
  if (!COURSES.some(c => c.id === course)) return fail('course', course);
  if (!SPEED_CLASSES.some(c => c.id === klass)) return fail('class', klass);
  const carDef = CARS.find(c => c.id === car); if (!carDef) return fail('car', car);
  const { fromTick, ticks, inputs, cps, grants } = run;
  if (!isInt(fromTick)) return fail('shape', 'fromTick');
  if (fromTick !== 0) return fail('start', { fromTick });
  if (!isInt(ticks) || ticks < 1) return fail('shape', 'ticks');
  if (ticks > MAX_RUN_TICKS) return fail('length', ticks);
  if (!Array.isArray(inputs) || inputs.length % 2 || inputs.length > 2 * ticks) return fail('shape', 'inputs');
  if (!Array.isArray(cps) || !Array.isArray(grants) || grants.length > 4) return fail('shape', 'cps/grants');
  let total = 0;
  for (let i = 0; i < inputs.length; i += 2) {
    const code = inputs[i], count = inputs[i + 1];
    if (!isInt(code) || code < 0 || code > INPUT_MAX || (code & (BIT.left | BIT.right)) === (BIT.left | BIT.right)) return fail('input', { at: i, code });
    if (!isInt(count) || count < 1) return fail('input', { at: i + 1, count });
    total += count;
  }
  if (total !== ticks) return fail('ticks', { inputs: total, ticks });
  const want = Math.ceil(ticks / CHECK_EVERY);
  if (cps.length !== want) return fail('checkpoint', { count: cps.length, want });
  for (let i = 0; i < want; i++) { if (!snapShapeOk(cps[i])) return fail('shape', { checkpoint: i }); if (cps[i][0] !== i * CHECK_EVERY) return fail('checkpoint', { at: i, tick: cps[i][0], want: i * CHECK_EVERY }); }
  const limit = grantLimit(carParams(carDef.id, klass));
  if (grants.length > 1) return fail('grant', { count: grants.length });
  if (grants.length && (!isInt(grants[0]) || grants[0] < 0 || grants[0] > limit)) return fail('grant', { tick: grants[0], limit });
  return null;
}

export function verifyRace(sub, options = {}) {
  try {
    if (typeof options?.heightAt !== 'function') return fail('shape', 'submission');
    const expanded = expandInputs(sub);
    const bad = shapeError(expanded);
    return bad || replay(expanded, options.heightAt, Number.isFinite(options.stopMs) ? options.stopMs : Infinity);
  } catch (error) { return unexpected(error); }
}

// 한 판을 지어 출발 자리에 세운다(시험 · 재는 글도 쓴다 — level 은 시험이 '다른 난이도로 달린 손님'을 지을 때만)
export function buildRaceRun({ course, klass, car, mode, heightAt, level = RACE_LEVEL }) {
  const carDef = CARS.find(c => c.id === car), P0 = carParams(carDef.id, klass), B = courseFor(course, heightAt);
  const sim = createKartSim({ params: P0, world: B.world, body: footprintOf(carDef) });
  const race = newRace(B, { mode, level, klass, car });
  const R = raceContext({ built: B, sim, car: createCarState({ pit: B.pit, damageScale: damageScaleOf(B.picked) }), watch: B.rescue.watcher(), clock: B.makeClock(), race, mode, weight: carDef.weight ?? 1 });
  placeRace(R);
  return R;
}

function replay({ course, klass, car, mode, run }, heightAt, stopMs) {
  const { ticks, inputs, cps, grants } = run, worst = {};
  const R = buildRaceRun({ course, klass, car, mode, heightAt });
  { const bad = compare(cps[0], snapshotRace(R), worst); if (bad) return fail('start', bad); }
  const last = ticks - 1, cmd = {};
  let ri = 0, left = inputs[1], code = inputs[0], done = null;
  for (let k = 0; k <= last; k++) {
    if (k > 0 && k % CHECK_EVERY === 0) { const bad = compare(cps[k / CHECK_EVERY], snapshotRace(R), worst); if (bad) return fail('checkpoint', { tick: k, ...bad }); }
    if (grants.length && grants[0] === k) { if (!R.sim.grant('start')) return fail('grant', { tick: k }); }
    if (left === 0) { ri += 2; code = inputs[ri]; left = inputs[ri + 1]; }
    left--;
    const c = decodeInput(code); for (const key in c) cmd[key] = c[key];
    const { finish } = stepRace(R, cmd);
    if (finish) { if (k !== last) return fail('ticks', { lapAt: k, last }); done = finish; }
    else if (R.time * 1000 > stopMs) return fail('slower', { ms: Math.round(R.time * 1000), stopMs });
  }
  if (!done) return fail('lap', { laps: R.lapAt.length, want: R.laps });
  const lapMs = Math.round(done.at * 1000);
  if (!(lapMs > 0 && lapMs <= MAX_RUN_MS)) return fail('length', lapMs);
  if (lapMs > stopMs) return fail('slower', { ms: lapMs, stopMs });   // 멈출 시각을 넘긴 그 틱 안에서 결승한 판
  const ms = R.lapAt.map(t => Math.round(t * 1000)), splits = ms.map((t, i) => t - (i ? ms[i - 1] : 0));
  return { ok: true, lapMs, lapIndex: R.lapAt.length, place: R.place, splits, ticks, worst };
}
export { SNAP_LEN };
