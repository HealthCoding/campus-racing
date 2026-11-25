// 기록 유령 — 한 판(타임어택: 서서 출발한 3바퀴 전체 — 2026-11-24)의 자세를 일정 간격으로 적어 두었다가, 다음 주행에서 같은 시각의 자세를 돌려준다. 정차 구간은 시작과 끝만 남긴다.
// 저장은 코스별 최고 기록 한 건만(localStorage). 쓰기에 실패해도 이번 세션의 유령은 메모리에 남는다.
// 저장 크기: 자세 하나 = 시각 + 여섯 칸 Float32 = 28바이트(base64 로 37자). 저장하는 자세는 GHOST_MAX_ROWS 개까지 — 넘는 판(느린 판)은 고르게 솎아 저장한다(메모리의 이번 판은 그대로).
const FIELDS = 6;   // x, y, z, heading, pitch, roll
export const GHOST_RATE = 30;   // 초당 기록 수
export const GHOST_MAX_ROWS = 6000;   // 저장하는 자세 수 상한 — 30/초로 200초(3바퀴 보통 145 ~ 170초는 그대로). 한 판 약 22만 자, 저장소 여덟 개(코스 둘 × 감각 넷)면 약 180만 자(브라우저 한도 약 500만 자)
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function createGhostRecorder(rate = GHOST_RATE) {
  let rows = [], next = 0, stopped = false;
  function record(time, s) {
    const i = rows.length - 7, pitch = s.pitch || 0, roll = s.roll || 0;
    const same = i >= 0 && rows[i + 1] === s.x && rows[i + 2] === s.y && rows[i + 3] === s.z
      && rows[i + 4] === s.heading && rows[i + 5] === pitch && rows[i + 6] === roll;
    // 같은 자세가 셋째부터는 정차 끝 시각만 연장한다. 첫 시각도 남겨야 앞뒤 주행을 보간할 때 밀리지 않는다.
    if (same && stopped) rows[i] = time;
    else rows.push(time, s.x, s.y, s.z, s.heading, pitch, roll);
    stopped = same;
    next = Math.floor(time * rate + 1e-6) / rate + 1 / rate;
  }
  return {
    start() { rows = []; next = 0; stopped = false; },
    // time: 이 바퀴가 시작된 뒤 흐른 시간(초). 틱마다 불러도 rate 에 맞는 것만 적는다.
    sample(time, s) { if (time + 1e-9 >= next) record(time, s); },
    // 간격과 상관없이 꼭 적는다 — 출발선을 넘은 순간(0)과 결승선을 넘은 순간(랩 시간). 없으면 유령이 선 앞에서 멈춘다.
    mark(time, s) { if (rows.length && rows[rows.length - 7] >= time) return; record(time, s); },
    finish(lapTime) { const count = rows.length / 7, times = new Float32Array(count), data = new Float32Array(count * FIELDS);
      for (let i = 0; i < count; i++) { times[i] = rows[i * 7]; for (let k = 0; k < FIELDS; k++) data[i * FIELDS + k] = rows[i * 7 + 1 + k]; }
      return { lapTime, times, data }; },
  };
}

// run: { lapTime, times, data } → 시각 t 의 자세(없으면 null). out 을 주면 거기에 채운다.
export function createGhostPlayer(run) {
  let cursor = 0; const { times, data } = run, count = times.length;
  return {
    lapTime: run.lapTime,
    restart() { cursor = 0; },
    poseAt(t, out = {}) {
      if (!count || t < times[0] || t > times[count - 1] + 0.2) return null;
      if (t < times[cursor]) cursor = 0;
      while (cursor < count - 2 && times[cursor + 1] <= t) cursor++;
      const a = cursor, b = Math.min(count - 1, a + 1), span = times[b] - times[a], u = span > 0 ? Math.min(1, Math.max(0, (t - times[a]) / span)) : 0, A = a * FIELDS, B = b * FIELDS;
      out.x = data[A] + (data[B] - data[A]) * u; out.y = data[A + 1] + (data[B + 1] - data[A + 1]) * u; out.z = data[A + 2] + (data[B + 2] - data[A + 2]) * u;
      out.heading = data[A + 3] + wrap(data[B + 3] - data[A + 3]) * u; out.pitch = data[A + 4] + (data[B + 4] - data[A + 4]) * u; out.roll = data[A + 5] + (data[B + 5] - data[A + 5]) * u;
      return out;
    },
  };
}

// 고르게 솎기: 첫 자세와 끝 자세(결승선)는 늘 남기고 그 사이를 같은 간격으로 고른다. 재생은 보간하므로 길만 조금 덜 매끄럽다.
export function thinGhost(run, max = GHOST_MAX_ROWS) {
  const n = run.times.length; if (n <= max) return run;
  const times = new Float32Array(max), data = new Float32Array(max * FIELDS);
  for (let i = 0; i < max; i++) { const j = Math.round(i * (n - 1) / (max - 1)); times[i] = run.times[j]; data.set(run.data.subarray(j * FIELDS, j * FIELDS + FIELDS), i * FIELDS); }
  return { lapTime: run.lapTime, times, data };
}
const encode = array => { const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength); let text = ''; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(text); };
const decode = text => { const raw = atob(text), bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return new Float32Array(bytes.buffer); };

// version: 코스 · 주행 규칙이 바뀌어 예전 기록과 견줄 수 없게 되면 올린다.
// storage 를 안 주면 localStorage 를 쓴다. 저장소 접근이 막힌 환경(읽기만 해도 예외)에서는 메모리에만 남긴다.
export function createGhostStore(courseId, version = 1, storage) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  const key = `campus-kart:ghost:${courseId}:v${version}`; let memory = null;
  return {
    load() {
      if (memory) return memory;
      try { const saved = JSON.parse(storage?.getItem(key) || 'null'); if (saved && saved.lapTime > 0) memory = { lapTime: saved.lapTime, times: decode(saved.times), data: decode(saved.data) }; } catch { memory = null; }
      return memory;
    },
    // 더 빠를 때만 바꾼다. 바꿨으면 true.
    offer(run) {
      const best = this.load(); if (best && best.lapTime <= run.lapTime) return false;
      memory = run;
      try { const saved = thinGhost(run); storage?.setItem(key, JSON.stringify({ lapTime: saved.lapTime, times: encode(saved.times), data: encode(saved.data) })); } catch { /* 저장 공간이 없어도 이번 세션에는 남는다 */ }
      return true;
    },
    clear() { memory = null; try { storage?.removeItem(key); } catch {} },
  };
}

// 이름(속도 등급 등)마다 저장소 하나를 세션 동안 다시 쓴다. 저장에 실패해 메모리에만 있는 기록이 등급을 오가도 남는다.
export function createGhostStores(courseId, version = 1, storage) {
  const made = new Map();
  return { for(name) { if (!made.has(name)) made.set(name, createGhostStore(courseId + ':' + name, version, storage)); return made.get(name); } };
}

// 판 번호가 다른(옛 규칙의) 유령을 지운다 — 1바퀴 유령(v5)이 3바퀴(v5x3)로 바뀐 뒤 저장 공간만 차지하지 않게. 지운 개수.
export function pruneGhosts(version, storage) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { return 0; } }
  let removed = 0;
  try {
    const keys = []; for (let i = 0; i < (storage?.length ?? 0); i++) keys.push(storage.key(i));
    for (const k of keys) { const m = /^campus-kart:ghost:.+:v([^:]+)$/.exec(k || ''); if (m && m[1] !== String(version)) { storage.removeItem(k); removed++; } }
  } catch { /* 저장소를 못 읽어도 게임은 돈다 */ }
  return removed;
}
