// 자동 운전(약속 3.6) — 중심선을 따라 스스로 달린다. 시험 · 자동 주행 검증용이고 나중에 컴퓨터 상대의 바탕.
//   const driver = createAutoDriver({ samples: course.centre });  →  sim.step(driver.input(sim.state))
// samples: 닫힌 고리 [[x, z, halfLeft, halfRight], ...] (약속 3.7 의 centre). 간격은 고르다고 가정(2 m 안팎).
// 하는 일: 앞을 보고 조향(진행 방향 기준 pure pursuit) · 곡률로 코너 속도를 미리 계산해 감속 · 직선에서 모아 둔 부스터 쓰기.
// 드리프트는 하지 않는다. 미끄럼형 드리프트를 모는 법은 아직 안 만들었다(일반 조향으로 완주한다).
// 결정적: 상태는 진행 위치 하나(index)뿐이고 같은 state 순서면 같은 입력을 낸다.
import { KART } from './params.js';
import { sin, atan2, hypot } from '../shared/dmath.js';   // 결정적 수학(상대의 운전도 서버가 다시 만든다)

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const wrap = a => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

export function createAutoDriver({
  samples, lookAhead = null, params = KART,
  speedScale = 1,          // 코너 속도 배율(<1 이면 조심스럽게)
  brakeUse = 0.6,          // 감속 계획에 쓰는 브레이크 비율(여유)
  boost = true,            // 직선에서 순간 가속
} = {}) {
  const P = { ...KART, ...params };
  const n = samples.length;
  const X = new Float64Array(n), Z = new Float64Array(n), S = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = samples[i][0]; Z[i] = samples[i][1]; }
  let total = 0;
  for (let i = 0; i < n; i++) { S[i] = total; const j = (i + 1) % n; total += hypot(X[j] - X[i], Z[j] - Z[i]); }
  const step = total / n;
  const at = i => ((i % n) + n) % n;

  // 곡률(왼쪽 +): 약 3 m 앞뒤 점으로 외접원
  const K = new Float64Array(n), k3 = Math.max(1, Math.round(3 / step));
  for (let i = 0; i < n; i++) {
    const a = at(i - k3), c = at(i + k3);
    const ax = X[i] - X[a], az = Z[i] - Z[a], bx = X[c] - X[i], bz = Z[c] - Z[i];
    const h1 = atan2(ax, az), h2 = atan2(bx, bz);
    K[i] = wrap(h2 - h1) / (hypot(ax, az) / 2 + hypot(bx, bz) / 2);
  }
  // 코너 속도: 일반 회전반경 base + k v² ≤ R 를 만족하는 최고속(조금 여유). 곧은 곳은 부스트 최고속까지 허용한다
  // (부스트가 3초라 달리는 중에 코너를 만난다 — 그때 아래 브레이크 계획대로 줄인다. 브레이크를 밟으면 부스트는 끝난다).
  const V = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let kmax = 0; for (let d = -1; d <= 1; d++) kmax = Math.max(kmax, Math.abs(K[at(i + d)]));
    const R = kmax > 1e-6 ? 1 / kmax : 1e6;
    V[i] = clamp(Math.sqrt(Math.max(0, R * 0.98 - P.turnRadiusBase) / P.turnRadiusPerSpeed2) * speedScale, P.driftMinSpeed + 0.6, Math.max(P.maxSpeed, P.boostMaxSpeed));
  }
  // 브레이크 계획: 뒤로 두 바퀴 돌며 v_i ≤ √(v_{i+1}² + 2 a ds)
  const decel = P.brakeDecel * brakeUse;
  for (let pass = 0; pass < 2; pass++) for (let i = n - 1; i >= 0; i--) {
    const j = at(i + 1); V[i] = Math.min(V[i], Math.sqrt(V[j] * V[j] + 2 * decel * step));
  }
  // 앞쪽 누적 회전각(부스터 판단)
  const turnAhead = (i, dist) => { let sum = 0; const m = Math.round(dist / step); for (let d = 0; d < m; d++) sum += K[at(i + d)] * step; return sum; };

  let index = -1, boostHeld = false;

  function locate(x, z) {
    let best = -1, bd = Infinity;
    if (index < 0) { for (let i = 0; i < n; i++) { const ex = X[i] - x, ez = Z[i] - z, d = ex * ex + ez * ez; if (d < bd) { bd = d; best = i; } } }
    else for (let d = -6; d <= 20; d++) { const i = at(index + d), ex = X[i] - x, ez = Z[i] - z, e = ex * ex + ez * ez; if (e < bd) { bd = e; best = i; } }
    index = best;
    return best;
  }

  // i 번 점에서 거리 dist 만큼 앞의 점(보간)
  function ahead(i, frac, dist) {
    let k = i, rem = dist + frac * step;
    while (rem > step) { rem -= step; k = at(k + 1); }
    const j = at(k + 1), t = rem / step;
    return [X[k] + (X[j] - X[k]) * t, Z[k] + (Z[j] - Z[k]) * t];
  }

  function input(st) {
    const i = locate(st.x, st.z);
    const j = at(i + 1), sx = X[j] - X[i], sz = Z[j] - Z[i];
    const frac = clamp(((st.x - X[i]) * sx + (st.z - Z[i]) * sz) / (sx * sx + sz * sz), 0, 1);
    const v = Math.max(0, st.speed);
    // 주행선에서 1 m 넘게 벗어나 있으면(점프에서 내린 직후 · 밀려난 뒤) 그만큼 더 멀리 보고 천천히 돌아온다.
    // 가까이만 보면 끝까지 꺾었다가 반대로 넘어간다(최고 등급 131 km/h 로 내려 3 m 벗어났을 때 차체가 17° 까지 돌아가 벽을 스쳤다).
    const off = Math.abs((st.x - X[i]) * sz - (st.z - Z[i]) * sx) / hypot(sx, sz);
    // 아주 빠를 때(22 m/s 위)는 그만큼 더 멀리 본다: 8 m 는 141 km/h 로 0.2초 앞이라 곧은 길에서 좌우로 흔들렸고(±4°), 그 각으로 점프대를 떠나면 60 m 를 날아 벽에 닿았다(2026-11-21, 난이도를 올린 상대).
    const L = lookAhead ?? clamp(2 + 0.35 * v, 3, 8) + Math.max(0, v - 22) * 0.3 + clamp(2.5 * (off - 1), 0, 8);
    const [tx, tz] = ahead(i, frac, L);
    const dir = st.speed < -0.5 ? st.heading : st.course;
    const alpha = wrap(atan2(tx - st.x, tz - st.z) - dir);
    const kappa = 2 * sin(alpha) / L;              // 왼쪽 +

    // 속도 목표: 지금 · 반 초 앞 중 작은 값
    const lead = at(i + Math.round(Math.max(1, v * 0.3) / step));
    const vt = Math.min(V[i], V[lead]);
    let throttle = 1, brake = 0;
    if (v > vt + 0.4) { throttle = 0; brake = clamp((v - vt) / 2, 0.2, 1); }
    else if (v > vt) throttle = 0.3;

    let steer = clamp(-kappa * (P.turnRadiusBase + P.turnRadiusPerSpeed2 * v * v), -1, 1);
    // 떠 있는 동안에는 길을 쫓지 않고 차체를 날아가는 방향에 맞춘다. 공중에서는 차체만 돌고 가는 방향은 안 바뀐다 —
    // 길을 쫓아 끝까지 꺾고 있으면 긴 점프(최고 등급 63 m) 동안 차체가 18° 돌아가서, 내리자마자 그쪽 벽으로 간다(2026-11-20, 상대 카트).
    if (st.grounded === false) steer = clamp(-wrap(st.course - st.heading) * 4, -1, 1);
    if (st.drifting) throttle = brake > 0 ? 0 : 1;

    // 부스터: 모아 둔 칸이 있고 앞 40 m 가 곧고 넉넉하면(한 틱만 눌렀다 뗀다)
    let boostOn = false;
    if (boost && (st.boostStock ?? (st.gauge >= 100 ? 1 : 0)) > 0 && st.boost <= 0 && !boostHeld) {
      const reach = Math.max(40, P.boostMaxSpeed * P.boostTime * 0.5), mid = at(i + Math.round(reach / 2 / step)), far = at(i + Math.round(reach / step));
      if (Math.min(V[i], V[mid], V[far]) >= P.maxSpeed * 0.95 && Math.abs(turnAhead(i, reach)) < 0.3) boostOn = true;
    }
    boostHeld = boostOn;
    if (boostOn) { throttle = 1; brake = 0; }
    return { steer, throttle, brake, drift: false, boost: boostOn };
  }

  return {
    input,
    // at: 카트를 옮겨 놓은 자리의 중심선 번호(안 주면 다음 입력 때 전체에서 가장 가까운 점 — 길이 위아래로 겹치는 곳에서는 다른 층이 잡힐 수 있다)
    reset(at = -1) { index = Number.isInteger(at) && at >= 0 && at < n ? at : -1; boostHeld = false; },
    get index() { return index; },
    progress: () => index < 0 ? 0 : S[index],
    length: total,
    targetSpeed: i => V[at(i)],
    curvature: (i = index) => i < 0 ? 0 : K[at(i)],   // 그 점의 곡률(왼쪽 +, 1/m)
  };
}
