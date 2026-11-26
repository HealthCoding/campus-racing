// 한 판 다시 계산(검증) — 손님이 보낸 입력으로 서버가 같은 계산(src/race/time-trial.js)을 돌려 조작 기록을 거른다. 순수 · 동기 · 던지지 않는다.
//   verifyRun({ course, klass, car, run }, { heightAt }) → { ok: true, lapMs, lapIndex, splits, ticks, worst } | { ok: false, reason, detail }
//   course = 코스 id('B') · klass = 등급 id · car = 차 id(karts.js 의 CARS) · run = run-log.js 의 lastRun() 그대로 · heightAt(x, z) = 지형 높이(m)
// 한 판 = 출발 신호(틱 0)부터 TRIAL_LAPS(3) 바퀴째 결승선까지(2026-11-24 사용자 "랭킹이 한바퀴 기준인데, 3바퀴로 하면 좋을듯").
//   서버가 **고정된 출발 자리 · 서 있는 상태(placeTrial)** 에서 전부 다시 달린다 — 손님이 시작 상태를 적지 않는다(cps[0] 은 그 상태와 같아야 할 뿐 쓰지 않는다).
//   lapMs = 서버의 랩 시계가 센 마지막 바퀴 사건의 at(출발 신호부터) · splits = 바퀴별(앞 바퀴 끝부터, 첫 바퀴는 출발 신호부터). 손님이 적은 lapMs · lapIndex 는 안 믿는다.
// 기록점 방식(reports/2026-11-24_랭킹_서버설계.md ② 1): 600틱마다 다시 계산한 상태와 손님의 상태를 견줘 허용 오차 안이면 차체의 기하만 맞춰 이어 간다(엔진마다의 마지막 자리 차이가 쌓이지 않게).
//   기록점의 칸은 모두 견준다(시계와 타이머 · 게이지 · 재고는 서버 계산에 남긴다).
// 거절 까닭(reason): shape(모양) · version(계산 판이 다름) · course · class · car(모르는 id) · length(너무 김) · input(입력 값) · ticks(틱 수가 안 맞음 — 마지막 바퀴 뒤로 더 있음)
//   · checkpoint(기록점 자리 · 수 · 값) · start(시작 상태 · 틱 0 이 아님) · grant(출발 가속) · lap(바퀴를 다 돌지 않음 — detail.laps 가 서버가 센 바퀴 수) · error(예상 못 한 오류)
import { TRIAL_VER, TRIAL_LAPS, CHECK_EVERY, SNAP_FIELDS, SNAP_LEN, buildCourse, createTrial, placeTrial, stepTrial, snapshotTrial, restoreTrial, grantLimit, wrapAngle } from './time-trial.js';
import { unpackDenseRun, decodeInput, INPUT_MAX, BIT, MAX_RUN_TICKS, MAX_RUN_MS } from './run-log.js';
import { COURSES } from '../track/courses.js';
import { SPEED_CLASSES, carParams } from '../kart/classes.js';
import { CARS, footprintOf } from '../kart/karts.js';

export const TOLERANCE = { pos: 1e-4, 'pos?': 1e-4, ang: 1e-5, vel: 1e-4, unit: 1e-5, yaw: 1e-5, gauge: 1e-4, time: 1e-9, 'time?': 1e-9 };
const fail = (reason, detail = null) => ({ ok: false, reason, detail });
const isInt = v => Number.isInteger(v);
const num = v => typeof v === 'number' && Number.isFinite(v);

// 코스는 지형 함수마다 한 번 짓는다(바뀌지 않는 것 — 판마다 새로 만드는 것은 createTrial)
const built = new WeakMap();
function courseFor(id, heightAt) {
  let m = built.get(heightAt); if (!m) built.set(heightAt, m = new Map());
  if (!m.has(id)) {
    m.set(id, buildCourse({ picked: COURSES.find(c => c.id === id), heightAt }));
  }
  return m.get(id);
}

// 기록점 하나의 모양(종류만 — 값의 범위는 따로 본다)
export function snapShapeOk(cp) {
  if (!Array.isArray(cp) || cp.length !== SNAP_LEN) return false;
  for (let i = 0; i < SNAP_LEN; i++) {
    const kind = SNAP_FIELDS[i][1], v = cp[i];
    if (kind === 'bool') { if (v !== 0 && v !== 1) return false; }
    else if (kind === 'enum') { if (typeof v !== 'string' || v.length > 12) return false; }
    else if (kind === 'int') { if (!isInt(v)) return false; }
    else if (kind.endsWith('?')) { if (v !== null && !num(v)) return false; }
    else if (!num(v)) return false;
  }
  return true;
}
// 견주기: 손님 cp 와 다시 계산한 mine. 넘은 칸이 있으면 { field, client, server }, 다 맞으면 null. worst 에 종류별 가장 큰 차이를 남긴다.
export function compare(cp, mine, worst) {
  for (let i = 0; i < SNAP_LEN; i++) {
    const [name, kind, part] = SNAP_FIELDS[i], a = cp[i], b = mine[i], tol = TOLERANCE[kind];
    if (tol === undefined) { if (a !== b) return { field: part + '.' + name, client: a, server: b }; continue; }
    if (a === null || b === null) { if (a !== b) return { field: part + '.' + name, client: a, server: b }; continue; }
    const d = kind === 'ang' ? Math.abs(wrapAngle(a - b)) : Math.abs(a - b);
    if (!(d <= tol)) return { field: part + '.' + name, client: a, server: b, diff: d };
    const key = kind.replace('?', ''); if (!(worst[key] >= d)) worst[key] = d;
  }
  return null;
}

export function unexpected(error) {
  try { return fail('error', String(error?.message || error).slice(0, 200)); }
  catch { return fail('error'); }   // 문자열로도 바꿀 수 없는 예외
}

// 지형과 코스가 없어도 할 수 있는 검사. 서버가 다시 계산 예산을 쓰기 전에도 같은 판정을 부른다.
export function runShapeError(sub) {
  try { return shapeError(expandInputs(sub)); } catch (error) { return unexpected(error); }
}

// 본문 한도(RUN_MAX_BYTES)에 가까운 기록만 짧은 표기를 쓴다. 길이나 패딩이 틀리면 원래 입력 검사에서 거절한다.
export function expandInputs(sub) {
  if (typeof sub?.run?.inputs !== 'string' || !sub.run.inputs.startsWith('b:')) return sub;
  const run = unpackDenseRun(sub.run) ?? { ...sub.run, inputs: null };
  return { ...sub, run };   // 경주(verify-race.js)는 mode · level 도 싣는다
}

function shapeError(sub) {
  if (!sub || typeof sub !== 'object') return fail('shape', 'submission');
  const { course, klass, car, run } = sub;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return fail('shape', 'run');
  if (run.v !== TRIAL_VER) return fail('version', run.v);
  if (!COURSES.some(c => c.id === course)) return fail('course', course);
  if (!SPEED_CLASSES.some(c => c.id === klass)) return fail('class', klass);
  const carDef = CARS.find(c => c.id === car); if (!carDef) return fail('car', car);
  const { fromTick, ticks, inputs, cps, grants } = run;
  if (!isInt(fromTick)) return fail('shape', 'fromTick');
  if (fromTick !== 0) return fail('start', { fromTick });   // 판은 늘 틱 0(출발 신호)부터 — 중간에서 시작하는 제출은 없다
  if (!isInt(ticks) || ticks < 1) return fail('shape', 'ticks');
  if (ticks > MAX_RUN_TICKS) return fail('length', ticks);
  if (!Array.isArray(inputs) || inputs.length % 2 || inputs.length > 2 * ticks) return fail('shape', 'inputs');
  if (!Array.isArray(cps) || !Array.isArray(grants) || grants.length > 4) return fail('shape', 'cps/grants');
  // 입력: (값, 이어진 틱 수) 짝. 값은 9비트 안 · 왼쪽 오른쪽이 같이 켜지지 않음, 틱 수는 1 이상의 정수, 다 더하면 ticks
  let total = 0;
  for (let i = 0; i < inputs.length; i += 2) {
    const code = inputs[i], count = inputs[i + 1];
    if (!isInt(code) || code < 0 || code > INPUT_MAX || (code & (BIT.left | BIT.right)) === (BIT.left | BIT.right)) return fail('input', { at: i, code });
    if (!isInt(count) || count < 1) return fail('input', { at: i + 1, count });
    total += count;
  }
  if (total !== ticks) return fail('ticks', { inputs: total, ticks });
  // 기록점: fromTick 부터 정확히 600틱마다 하나씩, 빠짐 · 더함 · 뒤바뀜 없이
  const want = Math.ceil(ticks / CHECK_EVERY);
  if (cps.length !== want) return fail('checkpoint', { count: cps.length, want });
  for (let i = 0; i < want; i++) { if (!snapShapeOk(cps[i])) return fail('shape', { checkpoint: i }); if (cps[i][0] !== fromTick + i * CHECK_EVERY) return fail('checkpoint', { at: i, tick: cps[i][0], want: fromTick + i * CHECK_EVERY }); }
  // 출발 가속: 출발 뒤 정해진 틱 안에서 한 번
  const P0 = carParams(carDef.id, klass), limit = grantLimit(P0);
  if (grants.length > 1) return fail('grant', { count: grants.length });
  if (grants.length && (!isInt(grants[0]) || grants[0] < 0 || grants[0] > limit)) return fail('grant', { tick: grants[0], limit });

  return null;
}

export function verifyRun(sub, options = {}) {
  try {
    if (typeof options?.heightAt !== 'function') return fail('shape', 'submission');
    const expanded = expandInputs(sub);
    const bad = runShapeError(expanded);
    return bad || replay(expanded, options.heightAt);
  } catch (error) { return unexpected(error); }
}

function replay({ course, klass, car, run }, heightAt) {
  const carDef = CARS.find(c => c.id === car), P0 = carParams(carDef.id, klass);
  const { ticks, inputs, cps, grants } = run;
  const B = courseFor(course, heightAt), T = createTrial(B, { params: P0, body: footprintOf(carDef) }), worst = {};
  // 고정 출발 자리 · 서 있는 상태(게임의 place 와 같은 값). 손님의 cps[0] 은 이것과 같아야 하고, 계산은 서버의 이 상태에서 시작한다.
  placeTrial(T);
  { const bad = compare(cps[0], snapshotTrial(T), worst); if (bad) return fail('start', bad); }
  const last = ticks - 1, cmd = {}, at = [];
  let ri = 0, left = inputs[1], code = inputs[0], done = null;
  for (let k = 0; k <= last; k++) {
    if (k > 0 && k % CHECK_EVERY === 0) {
      const cp = cps[k / CHECK_EVERY], bad = compare(cp, snapshotTrial(T), worst); if (bad) return fail('checkpoint', { tick: k, ...bad });
      restoreTrial(T, cp, { geometryOnly: true });
    }
    if (grants.length && grants[0] === k) { if (!T.sim.grant('start')) return fail('grant', { tick: k }); }
    if (left === 0) { ri += 2; code = inputs[ri]; left = inputs[ri + 1]; }
    left--;
    const c = decodeInput(code); for (const key in c) cmd[key] = c[key];
    const { events } = stepTrial(T, cmd);
    // 바퀴는 서버의 랩 시계가 센다(문을 빠뜨린 바퀴는 세지 않는다 — 경주와 같은 규칙). 마지막 바퀴는 마지막 틱에 끝나야 한다.
    for (const e of events) {
      if (e.type !== 'lap') continue;
      at.push(e.at);
      if (e.lap >= TRIAL_LAPS) { if (k !== last) return fail('ticks', { lapAt: k, last }); done = e; }
    }
  }
  if (!done) return fail('lap', { laps: at.length, want: TRIAL_LAPS });
  const lapMs = Math.round(done.at * 1000);
  if (!(lapMs > 0 && lapMs <= MAX_RUN_MS)) return fail('length', lapMs);
  const ms = at.map(t => Math.round(t * 1000)), splits = ms.map((t, i) => t - (i ? ms[i - 1] : 0));
  return { ok: true, lapMs, lapIndex: done.lap, splits, ticks, worst };
}
