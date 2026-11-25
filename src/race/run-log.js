// 주행 기록기 — 타임어택 한 판(서서 출발한 3바퀴 — time-trial.js 의 TRIAL_LAPS)을 서버가 다시 계산할 수 있게 적는다(브라우저 · Node 공용 순수 모듈, 의존성 없음).
//   const log = createRunLog();
//   출발(place):        log.start(T)                         틱 0 의 기록점(T.tick 이 0 이 아니면 그 판은 올릴 수 없다)
//   출발 가속을 줬을 때: log.grant(T.tick)                    다음에 돌 틱 앞에서 받았다
//   매 틱 계산 앞:      log.input(command, sim.state)         car.before 가 고치기 전의 입력(9비트)
//   매 틱 계산 뒤:      log.after(T, events)                  600틱마다 기록점, TRIAL_LAPS 바퀴째 결승선을 넘으면 판 전체를 묶는다
//   판이 끝난 뒤:       log.lastRun() → run | null            출발 신호(틱 0)부터 마지막 바퀴의 결승선을 넘은 틱까지
// run = { v: TRIAL_VER, fromTick: 0, ticks, lapIndex(= TRIAL_LAPS), lapMs(3바퀴 합계 — 출발 신호부터), inputs: [code, 이어진 틱 수, …], cps: [기록점 배열, …], grants: [틱, …] }
//   자주 눌러 본문 한도에 가까운 판만 inputs를 'b:' + 9비트 입력의 base64, cps를 Float64 기록점들의 base64 배열로 적는다. unpackDenseRun이 원래 칸으로 돌린다.
//   lapMs · lapIndex 는 손님이 센 값(보기용 — 서버는 다시 센다). 이름은 1바퀴 때 그대로다(값은 합계).
//   2026-11-24 까지는 바퀴마다 '그 바퀴 앞 기록점부터 바퀴 끝까지'를 적었다(중간 출발 — 손님이 적은 시작 상태를 서버가 범위로만 보던 길). 그 길은 없앴다.
import { TRIAL_VER, CHECK_EVERY, SNAP_FIELDS, SNAP_LEN, TRIAL_LAPS, snapshotTrial } from './time-trial.js';
import { RUN_MAX_BYTES } from '../shared/rank-rules.js';

// 입력 한 틱 = 9비트: 0 왼쪽 · 1 오른쪽 · 2 가속 · 3 브레이크 · 4 드리프트 · 5 부스트 · 6 다시 밟기 · 7 부스트 톡 · 8 다시 밟기 톡. 왼쪽 · 오른쪽이 같이 켜진 값은 없다.
export const BIT = { left: 1, right: 2, throttle: 4, brake: 8, drift: 16, boost: 32, kick: 64, boostTap: 128, kickTap: 256 };
export const INPUT_MAX = 511;
export const MAX_LAP_TICKS = 21600;                 // 한 바퀴 3분 — 판 전체의 상한을 세는 단위(바퀴마다 따로 재지는 않는다)
export const MAX_RUN_TICKS = TRIAL_LAPS * MAX_LAP_TICKS;   // 한 판 9분(64,800틱): 틱 0 부터 마지막 결승선을 넘은 틱까지
export const MAX_RUN_MS = MAX_RUN_TICKS * 1000 / 120;      // 540,000 ms

// 코스판·열쇠·최대 여덟 글자 한글 이름 등 rank.js가 run 바깥에 싣는 몫. run 자체는 ASCII다.
const ENVELOPE_BYTES = 512;
const enums = { mode: ['normal', 'drift', 'recover'], boostKind: ['', 'item', 'kick', 'start', 'pad'] };
const base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const base64Length = bytes => 4 * Math.ceil(bytes / 3);
// 인자를 한꺼번에 많이 넘기면 엔진에 따라 스택이 넘친다(특히 휴대폰) — 끊어서 잇는다
function toBase64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); }
const fromBase64 = text => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));

// 1틱의 9비트는 연달아 두 바이트에 걸친다(첫 바이트의 낮은 쪽부터). 기록점은 칸마다 8바이트 little-endian, 선택 값의 null은 NaN.
function packDenseRun(run) {
  const bytes = new Uint8Array(Math.ceil(run.ticks * 9 / 8));
  let bit = 0;
  for (let i = 0; i < run.inputs.length; i += 2) {
    const code = run.inputs[i], count = run.inputs[i + 1];
    for (let j = 0; j < count; j++, bit += 9) {
      const at = bit >> 3, shift = bit & 7;
      bytes[at] |= code << shift; bytes[at + 1] |= code >> (8 - shift);
    }
  }
  const cps = run.cps.map(cp => {
    const row = new Uint8Array(8 * SNAP_LEN), view = new DataView(row.buffer);
    for (let i = 0; i < SNAP_LEN; i++) {
      const [name, kind] = SNAP_FIELDS[i], value = cp[i];
      view.setFloat64(i * 8, kind === 'enum' ? enums[name].indexOf(value) : value ?? NaN, true);
    }
    return toBase64(row);
  });
  return { ...run, inputs: 'b:' + toBase64(bytes), cps };
}

// atob은 공백이나 생략된 '='도 받는다. 바이트 수와 끝의 채움 비트까지 정해진 표기인지 먼저 본다.
function validBase64(text, bytes) {
  if (typeof text !== 'string' || text.length !== base64Length(bytes) || /[^A-Za-z0-9+/=]/.test(text)) return false;
  const pad = (3 - bytes % 3) % 3, end = text.length - pad;
  if (text.indexOf('=') !== (pad ? end : -1) || !text.endsWith('='.repeat(pad))) return false;
  const last = base64.indexOf(text[end - 1]);
  return (last & ((1 << (2 * pad)) - 1)) === 0;
}

// 조밀한 제출만 풀어 원래의 틱 수 짝과 기록점(틱 + 상태 69칸)으로 넘긴다. 잘못된 표기는 null. 모든 버퍼의 길이는 틱 상한과 기록점 간격에서 나온다.
export function unpackDenseRun(run) {
  const ticks = run?.ticks;
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > MAX_RUN_TICKS) return null;
  const n = Math.ceil(ticks * 9 / 8), count = Math.ceil(ticks / CHECK_EVERY);
  if (typeof run.inputs !== 'string' || run.inputs.length !== 2 + base64Length(n) || !run.inputs.startsWith('b:')) return null;
  const encoded = run.inputs.slice(2);
  if (!validBase64(encoded, n) || !Array.isArray(run.cps) || run.cps.length !== count) return null;
  for (const row of run.cps) if (!validBase64(row, SNAP_LEN * 8)) return null;

  const used = ticks * 9 % 8, tail = atob(encoded.slice(-4));
  if (used && (tail.charCodeAt(tail.length - 1) >> used) !== 0) return null;
  const bytes = fromBase64(encoded), inputs = [];
  for (let bit = 0; bit < ticks * 9; bit += 9) {
    const at = bit >> 3, word = bytes[at] | (bytes[at + 1] << 8);
    const code = (word >> (bit & 7)) & INPUT_MAX, len = inputs.length;
    if (len && inputs[len - 2] === code) inputs[len - 1]++;
    else inputs.push(code, 1);
  }
  const cps = [];
  for (const row of run.cps) {
    const view = new DataView(fromBase64(row).buffer), cp = [];
    for (let i = 0; i < SNAP_LEN; i++) {
      const [name, kind] = SNAP_FIELDS[i], value = view.getFloat64(i * 8, true);
      if (kind === 'enum') {
        if (!Number.isInteger(value) || value < 0 || value >= enums[name].length) return null;
        cp.push(enums[name][value]);
      } else if (Number.isFinite(value)) cp.push(value);
      else if (Number.isNaN(value) && kind.endsWith('?')) cp.push(null);
      else return null;
    }
    cps.push(cp);
  }
  return { ...run, inputs, cps };
}

// 주행 계산이 보는 그대로의 명령으로 바꾼다. kick 을 안 주면 가속, kickTap 을 안 주면 '다시 밟기가 꺼짐 → 켜짐'(st._prevKick 을 본다 — physics.js 2) 와 같은 뜻).
export function encodeInput(c, st = null) {
  const throttle = +c.throttle || 0, kick = c.kick === undefined ? throttle > 0 : !!c.kick;
  const kickTap = c.kickTap !== undefined ? !!c.kickTap : kick && !(st && st._prevKick);
  const steer = +c.steer || 0;
  return (steer < 0 ? BIT.left : 0) | (steer > 0 ? BIT.right : 0) | (throttle > 0 ? BIT.throttle : 0) | ((+c.brake || 0) > 0 ? BIT.brake : 0) | (c.drift ? BIT.drift : 0)
    | (c.boost ? BIT.boost : 0) | (kick ? BIT.kick : 0) | (c.boostTap ? BIT.boostTap : 0) | (kickTap ? BIT.kickTap : 0);
}
export function decodeInput(code) {
  return { steer: (code & BIT.right ? 1 : 0) - (code & BIT.left ? 1 : 0), throttle: code & BIT.throttle ? 1 : 0, brake: code & BIT.brake ? 1 : 0, drift: !!(code & BIT.drift),
    boost: !!(code & BIT.boost), kick: !!(code & BIT.kick), boostTap: !!(code & BIT.boostTap), kickTap: !!(code & BIT.kickTap) };
}
// 9비트로 손실 없이 적히는 명령인가(키보드 · 터치는 늘 그렇다. 이어지는 값을 내는 자동 운전은 아니다)
const level = v => v === undefined || v === 0 || v === 1 || v === -1 || v === true || v === false;
export const inputExact = c => [-1, 0, 1].includes(+c.steer || 0) && [0, 1].includes(+c.throttle || 0) && [0, 1].includes(+c.brake || 0) && level(c.drift) && level(c.boost) && level(c.kick) && level(c.boostTap) && level(c.kickTap);

// 자동 운전의 이어지는 명령 → 키보드 같은 이산값(검증용 ?auto=1&runlog=1). hold 틱마다 한 번 정하고(시그마-델타 — 쌓인 몫을 반올림) 그동안 그대로 누른다.
export function createDiscretizer({ hold = 6 } = {}) {
  let n = 0, prevKick = false; const acc = { steer: 0, throttle: 0, brake: 0 }, out = { steer: 0, throttle: 0, brake: 0 };
  return {
    reset() { n = 0; prevKick = false; acc.steer = acc.throttle = acc.brake = 0; out.steer = out.throttle = out.brake = 0; },
    apply(c) {
      if (n++ % hold === 0) {
        acc.steer += Math.max(-1, Math.min(1, +c.steer || 0)); out.steer = Math.max(-1, Math.min(1, Math.round(acc.steer))); acc.steer -= out.steer;
        for (const k of ['throttle', 'brake']) { acc[k] += Math.max(0, Math.min(1, +c[k] || 0)); out[k] = acc[k] >= 0.5 ? 1 : 0; acc[k] -= out[k]; }
        if (out.brake) out.throttle = 0;
      }
      const kick = out.throttle > 0, kickTap = kick && !prevKick; prevKick = kick;
      return { steer: out.steer, throttle: out.throttle, brake: out.brake, drift: !!c.drift, boost: !!c.boost, kick, boostTap: false, kickTap };
    },
  };
}

// 경주(스피드전 · 그랑프리 — race-run.js, 2026-11-24)도 같은 기록기를 쓴다: createRunLog({ laps: R.laps, version: RACE_VER, snapshot: snapshotRace }) — 기록점은 내 차의 것만(상대는 서버가 다시 만든다).
export function createRunLog({ every = CHECK_EVERY, laps = TRIAL_LAPS, version = TRIAL_VER, snapshot = snapshotTrial } = {}) {
  // segs: 기록점 하나와 그 뒤 every 틱의 입력 · 출발 가속(틱 0 부터 빠짐없이). last: 다 묶은 판. over: 9분을 넘었거나 틱 0 에서 시작하지 않아 올릴 수 없는 판
  let segs = [], last = null, over = false;
  const seg = (T) => ({ tick: T.tick, snap: snapshot(T), runs: [], grants: [], dirty: false });
  function finalize(t, event) {
    const ms = Math.round(event.at * 1000);
    if (t + 1 > MAX_RUN_TICKS || !(ms > 0 && ms <= MAX_RUN_MS) || segs[0]?.tick !== 0 || segs.some(s => s.dirty)) return;
    const inputs = [];
    for (const s of segs) for (let i = 0; i < s.runs.length; i += 2) { const n = inputs.length; if (n && inputs[n - 2] === s.runs[i]) inputs[n - 1] += s.runs[i + 1]; else inputs.push(s.runs[i], s.runs[i + 1]); }
    last = { v: version, fromTick: 0, ticks: t + 1, lapIndex: event.lap, lapMs: ms, inputs, cps: segs.map(s => s.snap.slice()), grants: segs.flatMap(s => s.grants) };
    if (JSON.stringify(last).length > RUN_MAX_BYTES - ENVELOPE_BYTES) { try { last = packDenseRun(last); } catch { last = null; } }   // 못 줄이면 그 판은 올리지 않는다(달리는 중의 계산을 멈추게 하지 않는다)
  }
  const open = () => segs.length && !over && !last;
  return {
    get tick() { return segs.length ? segs[segs.length - 1].tick : 0; },
    start(T) { segs = [seg(T)]; last = null; over = T.tick !== 0; },
    input(command, st = null) {
      if (!open()) return;
      const s = segs[segs.length - 1];
      if (!inputExact(command)) s.dirty = true;
      const code = encodeInput(command, st), r = s.runs, n = r.length;
      if (n && r[n - 2] === code) r[n - 1]++; else r.push(code, 1);
    },
    grant(tick) { if (open()) segs[segs.length - 1].grants.push(tick); },
    after(T, events) {
      if (!open()) return;
      const t = T.tick - 1;
      // 마지막 바퀴의 결승선: 그 틱까지가 판 전체다(그 뒤로 굴러가는 것은 적지 않는다)
      for (const e of events) if (e.type === 'lap' && e.lap >= laps) { finalize(t, e); if (!last) over = true; segs = last ? segs : []; return; }
      if (T.tick % every === 0) {
        if (T.tick >= MAX_RUN_TICKS) { over = true; segs = []; return; }   // 9분 안에 끝나지 않은 판은 버린다(오래 달려도 커지지 않는다)
        segs.push(seg(T));
      }
    },
    lastRun() { return last; },
    // 보기 · 시험용: 지금 들고 있는 기록점 수
    get size() { return segs.length; },
  };
}
