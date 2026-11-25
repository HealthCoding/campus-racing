// 차 상태(데미지)와 피트 수리 — THREE 없는 순수 계산(약속 3.18). 내 카트에만 쓴다(컴퓨터 상대는 데미지를 입지 않는다 — 2026-11-21 메인이 정함, 사용자 확인 전).
//   const car = createCarState({ pit });
//   매 틱:  car.before(sim.state, command, dt, sim.params.brakeDecel);     피트레인의 제한 속도 · 정차 칸에서 세우기 — command 를 그 자리에서 고친다
//           sim.params.maxSpeed = Math.min(top.maxSpeed * car.factor(), car.cap);  boostMaxSpeed 도 같은 식으로
//           sim.step(command);
//           const event = car.after(sim.state, dt); 벽에 부딪힌 만큼 깎고, 정차 중이면 고친다 → null | { type: 'hit', lost, impact } | { type: 'repaired' } | { type: 'call' }
// 규칙(사용자 2026-11-21: "벽에 갖다 박으면 차에 데미지가 누적이 되고, 피트 스탑 해야 하는 걸로"):
//   - 차 상태 value 는 100(멀쩡) → 0. 벽에 부딪힌 세기(벽 쪽으로 들어가던 속도)만큼 깎인다. 스치는 것(hit.min 아래)은 안 깎인다.
//   - 상태가 speed.fine 아래로 내려가면 최고 속도가 줄기 시작해 0 에서 speed.worst 배가 된다. smoke 아래는 연기, call 아래로 내려가는 순간 무전이 피트를 부른다(한 번).
//   - 피트레인의 제한 줄 사이에서는 차가 알아서 제한 속도로 묶인다(더 빠르면 스스로 줄인다 · 부스터는 안 나간다).
//   - 제한 줄을 넘어선 뒤부터 주행로로 합칠 때까지는 **차가 알아서 레인 가운데를 따라간다**(방향키는 안 듣는다). 들어가는 것은 사람이 한다.
//     까닭: 수리가 끝나고 ↑ 만 누르고 있으면 나오는 길(왼쪽으로 굽는다)의 바깥 벽을 긁어, 고치자마자 다시 상했다(2026-11-21 게임에서 확인).
//   - 고칠 것이 있는 차가 제한 줄 안으로 들어오면 **가운데에 설 수 있는 첫 정차 칸**에 서도록 세워서(hold) 고친다: 멈춰 있는 동안 초당 repair.rate 씩 차고, 다 차면 풀어 준다.
//     (칸에 들어온 뒤에 세우기 시작하면 제한 속도 60 km/h 로는 6 m 칸 안에 못 서고 지나친다 → 멈추는 데 드는 거리만큼 앞에서 세우기 시작한다.)
//   - 그랑프리(before 에 GP_RULES 와 부스터 칸 수를 주면 — race-run.js)는 GP_RULES 로 묶고 · 고치고 · 느려지고, 정차 칸을 지나거나 서면 부스터 칸을 가득 채운다(사건 'refilled').
//     타임어택(안 준다)은 그 전과 같다.
//     레인이 짧다(제한 구간 28 m). 제한 속도를 넘는 속도는 리미터가 브레이크에 더해 깎고(pit.scrub), 너무 빨라 어느 칸에도 못 서면 바로 세워 선 자리에서 고친다.
import { sin, cos, atan2 } from '../shared/dmath.js';   // 결정적 수학(피트레인 유도)
export const DAMAGE = {
  hit: { min: 2.5, base: 2, per: 1.6, most: 34, cool: 0.5 },   // 부딪힌 속도(m/s)가 min 을 넘으면 base + (넘은 만큼 × per) % 를 잃는다(한 번에 most 까지). 그 뒤 cool 초는 더 안 깎인다(벽에 붙어 긁히는 동안 틱마다 깎이지 않게)
  speed: { fine: 70, worst: 0.84 },                            // 상태 fine 위는 제 속도, 0 에서 worst 배(그 사이는 곧게)
  smoke: 40, call: 15,
  repair: { rate: 34, stop: 0.6 },                             // 정차 칸에서 stop m/s 아래로 멈춰 있으면 초당 rate % 씩 찬다(0 → 100 이 약 3초)
  pit: { scrub: 22 },                                          // 제한 줄 안에서 제한 속도를 넘는 만큼은 브레이크에 더해 이만큼(m/s²) 더 깎인다 — 레인이 짧아(제한 구간 28 m) 브레이크만으로는 못 선다
};
// 그랑프리(데미지 · 피트가 있는 경주)에만 쓰는 값(2026-11-25 '피트를 쓸모 있게' — 사용자 "들르는게 손해면 아무 이유가 없긴 해" → 메인의 추천에 "추천대로 진행하자").
//   타임어택 · 피트 없는 코스는 안 쓴다 — DAMAGE 는 그대로라 코스판(trialVersion — DAMAGE 를 담는다)이 안 바뀐다. 경주판(raceVersion)은 데미지가 있는 코스에서만 이 값을 담는다.
//   speed: DAMAGE.speed 대신(상태 fine 아래에서 최고 속도가 줄어 0 에서 worst 배, 가속도 0 에서 accel 배) · repair.rate: 정차 칸에서 초당 고치는 %
//   pit.limit: 레인 제한 속도(m/s — 코스 자료 · 바닥 글자 '60' 과 같게 둔다) · pit.stop: 고치려고 세우는 동안 브레이크에 더해 깎는 감속(m/s² — 크루가 받아 세운다)
//   부스터: 정차 칸을 지나거나 서면(제한 줄 안) 부스터 칸(boostSlots)을 가득 채운다 — 멀쩡한 차는 서지 않고 지나가며 받는다.
//   값(검증/pit-value.mjs 로 잼 — 코스 B 그랑프리 4바퀴 · 상대 '어려움' · 자동 운전, 차 셋): 그 전(DAMAGE 그대로 · 부스터 안 채움)은 상태 50 에서 들르면 −2.6 ~ −2.9초, 20 에서도 −0.5 ~ +1.4초.
//   지금: 멀쩡한 차가 들러 부스터만 채우면 −1.4 ~ −2.2초, 상태 50 은 +1.7 ~ +2.5초, 20 은 +10.9 ~ +14.2초.
//   fine 70 → 75 · worst 0.84 → 0.72 · 가속 0.72 배(새로) — 한 번 세게 박아도(가장 크게 깎이는 34 %) 상태 66 이라 최고 속도 3 % 남짓, 보통 박기(10 ~ 20 %)는 그대로다.
//   repair 34 → 60 %/초(50 → 100 이 0.8초 — 100 이면 0.5초라 크루가 잭을 다 못 들었다) · stop 25 m/s²(그 전에는 브레이크만 — 서는 데 1초 남짓).
export const GP_RULES = {
  speed: { fine: 75, worst: 0.72, accel: 0.72 },
  repair: { rate: 60 },
  pit: { limit: 60 / 3.6, stop: 25 },
};

// damageScale: 벽에 부딪혀 잃는 양의 배수(코스마다 — courses.js 의 damageScale, 없으면 1. 2026-11-25 코스 D ×1.5). 한 번에 잃는 한도(hit.most)도 같이 커진다(34 → 51).
export function createCarState({ pit = null, tuning = DAMAGE, damageScale = 1 } = {}) {
  const T = tuning, where = { u: 0, s: 0, lateral: 0, index: 0 };
  const zone = { inPit: false, limited: false, box: -1, guided: false };
  let value = 100, cool = 0, holding = false, released = false, repairing = false, called = false, cap = Infinity, hits = 0, stops = 0, rules = null, refilled = false, refills = 0, gain = 0;
  const api = {
    get value() { return value; }, set value(v) { value = Math.min(100, Math.max(0, +v || 0)); if (value >= T.call) called = false; },
    get cap() { return cap; }, get zone() { return zone; }, get holding() { return holding; }, get repairing() { return repairing; }, get hits() { return hits; }, get stops() { return stops; },
    // 부스터를 채운 횟수 · 마지막에 찬 칸 수(화면이 '+2' 를 띄울 때 본다 — 계산에는 안 쓴다)
    get refills() { return refills; }, get refillGain() { return gain; }, get damageScale() { return damageScale; },
    get smoking() { return value < T.smoke; },
    // 최고 속도 배율
    factor() { const S = rules ? rules.speed : T.speed; return value >= S.fine ? 1 : 1 - (1 - S.worst) * (S.fine - value) / S.fine; },
    // 가속 배율(그랑프리만 — GP_RULES.speed.accel: 상태 fine 아래에서 줄어 0 에서 그 배). 타임어택 · 그 전 규칙은 1
    accelFactor() { const S = rules ? rules.speed : null; return !S || !(S.accel < 1) || value >= S.fine ? 1 : 1 - (1 - S.accel) * (S.fine - value) / S.fine; },
    reset() { value = 100; cool = 0; holding = false; released = false; repairing = false; called = false; cap = Infinity; hits = 0; stops = 0; rules = null; refilled = false; refills = 0; gain = 0; zone.inPit = false; zone.limited = false; zone.box = -1; zone.guided = false; },
    // decel: 브레이크를 다 밟았을 때의 감속(m/s² — sim.params.brakeDecel). 멈추는 데 드는 거리를 어림하는 데 쓴다.
    // race: 그랑프리의 값(GP_RULES) · slots: 정차 칸에서 채울 부스터 칸 수(sim.params.boostSlots). 안 주면(타임어택) DAMAGE 로 그 전과 같다.
    before(st, command, dt, decel = 12, race = null, slots = 0) {
      rules = race;
      const q = pit ? pit.locate(st.x, st.z, where) : null;
      zone.inPit = !!q && q.u >= pit.from && q.u <= pit.to && q.lateral > pit.edge(q.u) + 0.2;      // 주행로 밖의 레인
      zone.limited = zone.inPit && pit.limited(q.u, q.lateral);
      zone.box = zone.inPit ? pit.boxAt(q.u, q.lateral) : -1;
      const limit = rules ? rules.pit.limit : pit.limit.speed;
      cap = zone.limited ? limit : Infinity;
      // 부스터 채우기(그랑프리): 제한 줄 안의 정차 칸을 지나거나 서면 칸을 가득 채운다
      if (rules && slots > 0 && zone.limited && zone.box >= 0 && st.boostStock < slots) { gain = slots - st.boostStock; refills++; st.boostStock = slots; st.boostReady = true; refilled = true; }
      if (zone.limited) {
        command.boost = false; command.kick = false;
        if (st.speed > cap + 0.4) {                                                                 // 너무 빠르게 들어왔으면 차가 알아서 줄인다(브레이크 + 리미터가 깎는 만큼)
          command.throttle = 0; command.brake = Math.max(command.brake || 0, st.speed > cap + 3 ? 1 : 0.5);
          st.speed = Math.max(cap, st.speed - T.pit.scrub * dt);
        }
      }
      // 레인 안(제한 줄 뒤 ~ 합치는 곳): 앞쪽 레인 가운데의 한 점을 보고 조향한다
      zone.guided = zone.inPit && q.u >= pit.limit.from - 1 && q.u <= pit.to;
      if (zone.guided) {
        const ahead = Math.min(pit.to + 4, q.u + 7), aim = pit.pointAt(ahead, ahead > pit.to ? pit.edge(ahead) - 2.5 : (pit.inner(ahead) + pit.outer(ahead)) / 2);
        let turn = atan2(aim.x - st.x, aim.z - st.z) - st.heading; turn = atan2(sin(turn), cos(turn));   // + = 왼쪽으로 돌아야 한다
        command.steer = Math.max(-1, Math.min(1, -turn * 2.5)); command.drift = false;
      }
      if (!zone.inPit) { holding = false; released = false; }                                       // 레인을 나갔다: 다음에 들어오면 다시 설 수 있다
      else if (!holding && !released && value < 99.5 && zone.limited) {
        // 서는 데 드는 거리: 제한 속도 위에서는 리미터가 같이 깎고, 그 아래는 브레이크만
        // aimStop(피트 자료 — 2026-11-25 코스 D): 그랑프리의 세우기 감속(rules.pit.stop)까지 셈에 넣는다. 안 넣으면(B — 그 전 그대로) 실제로는 더 세게 서서 칸 2 m 앞에 선다.
        const v = Math.max(0, st.speed), d = Math.max(1, decel) + (pit.data.aimStop && rules ? rules.pit.stop : 0), c = limit;
        const need = (v > c ? (v * v - c * c) / (2 * (d + T.pit.scrub)) + c * c / (2 * d) : v * v / (2 * d)) + v * dt + 0.3;
        let left = null;
        for (const b of pit.boxes) { const to = (b.from + b.to) / 2 - q.u; if (to >= need - 0.6) { left = to; break; } }   // 가운데에 설 수 있는 첫 칸
        if (left === null || left <= need) { holding = true; stops++; }                             // 지금 밟아야 그 칸에 선다 · 어느 칸에도 못 서면 바로 선다
      }
      // 멈춘 뒤에는 브레이크를 놓는다(계속 밟으면 후진한다). 레인을 따라가는 조향은 그대로 둔다(벌어지는 구간에서 서기 시작할 수 있다).
      if (holding) { command.throttle = 0; if (!zone.guided) command.steer = 0; command.drift = false; command.boost = false; command.kick = false; command.brake = st.speed > 0.4 ? 1 : 0; if (rules && rules.pit.stop > 0 && st.speed > 0) st.speed = Math.max(0, st.speed - rules.pit.stop * dt); }
      return command;
    },
    after(st, dt) {
      let event = null;
      if (cool > 0) cool -= dt;
      const impact = st.wallImpact || 0;
      if (impact >= T.hit.min && cool <= 0) {
        const lost = Math.min(T.hit.most, T.hit.base + (impact - T.hit.min) * T.hit.per) * damageScale; value = Math.max(0, value - lost); cool = T.hit.cool; hits++;
        event = { type: 'hit', lost, impact };
      }
      repairing = holding && Math.abs(st.speed) < T.repair.stop;
      if (repairing) {
        value = Math.min(100, value + (rules ? rules.repair.rate : T.repair.rate) * dt);
        if (value >= 100) { holding = false; released = true; repairing = false; called = false; event = { type: 'repaired' }; }
      }
      if (refilled) { refilled = false; if (!event) event = { type: 'refilled', gained: gain }; }
      if (!called && value < T.call) { called = true; if (!event || event.type === 'hit') event = { type: 'call', lost: event?.lost, impact: event?.impact }; }
      return event;
    },
  };
  return api;
}
