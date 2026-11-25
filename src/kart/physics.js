// 카트 주행 계산 — THREE 를 쓰지 않는 순수 계산(약속 3.4). 고정 간격 1/120 초.
// 축: x 동쪽, z 남쪽, 앞 = (sin h, cos h), heading 이 커지면 왼쪽으로 돈다. steer +1 = 오른쪽.
// course = 실제로 나아가는 방향, heading = 차체가 보는 방향. slip = wrap(heading − course) (+ = 차체가 진행 방향보다 왼쪽).
// 같은 입력 순서면 같은 결과: Math.random · 시계를 쓰지 않고, 모든 내부 값을 state 에 둔다(save/load 로 그대로 복사).
// 드리프트(미끄럼형): 드리프트하면 차체가 먼저 돌고(조향이 차체의 도는 빠르기를 정한다), 낮아진 접지력으로 진행 방향이 차체를 뒤따른다.
//   놓으면 접지가 돌아와 차체가 보는 쪽으로 간다. 깊게 미끄러질수록 속도를 잃는다.
// 부스터: 게이지가 100 이 되면 한 칸으로 모이고(boostSlots 까지) 단추로 한 칸씩 쓴다. 드리프트 직후 '다시 밟기'와 출발 신호에는 짧은 가속.
import { KART } from './params.js';
import { sin, cos, atan2, exp, pow, hypot } from '../shared/dmath.js';   // 결정적 수학 — 엔진과 무관하게 같은 값(서버의 다시 계산과 비트까지)

const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
export const wrapAngle = a => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const follow = (dt, tau) => 1 - exp(-dt / tau);   // smooth 의 비율

// 부딪힘 모양(2026-11-23 — 차마다 실제 크기): body = { radius, offsets, length?, width? } (karts.js 의 footprintOf). 차를 길이 방향으로 늘어선 같은 반지름의 원들로 본다
// (offsets = 원 가운데가 원점에서 앞으로 몇 m). 안 주면 예전처럼 원점의 원 하나(반지름 P.wallRadius) — 시험 · 조정판 · 예전 카트가 그대로 돈다. sim.setBody(body) 로 바꾼다.
// 벽에 겹친 원은 차를 밀어내고, 원이 원점에서 떨어져 있으면 일부를 차체 회전으로 푼다(막대의 관성: 길이 · 폭으로 잰 I = (길이² + 폭²) / 12).
const ONE = [0];
export function createKartSim({ params = KART, world = {}, body: bodyIn = null } = {}) {
  const P = { ...KART, ...params };
  const dt = P.dt;
  const heightAt = typeof world.heightAt === 'function' ? world.heightAt : () => 0;
  const walls = world.walls && typeof world.walls.near === 'function' ? world.walls : null;
  const boostAt = typeof world.boostAt === 'function' ? world.boostAt : null;   // 부스트 발판(코스 부품): (x, z, y) → 발판 위면 참인 값
  const ceilingAt = typeof world.ceilingAt === 'function' ? world.ceilingAt : null;   // 머리 위 판의 밑면(다리 밑): (x, z, y) → 높이, 없으면 Infinity
  // 기운 코너의 받침 힘(2026-11-25 — 코스 D 노천극장 반원): (x, z, y) → + = 왼쪽으로 도는 것을 받친다 · − = 오른쪽 · 0 = 없음(parts.js 의 supportAt).
  //   땅에 붙어 그 안쪽으로 돌 때만 듣는다: 받친 몫 k 만큼 속도에 따른 회전반경이 1 / (1 + k) 로 줄고 · 접지가 (1 + k) 배 단단해지고(덜 미끄러진다) · 드리프트의 따라붙는 세기가 (1 + k) 배.
  //   세계에 이 칸이 없으면(코스 B 등) 이 틱의 계산은 그 전과 한 글자도 같다.
  const bankAt = typeof world.bankAt === 'function' ? world.bankAt : null;
  // 길이 위아래로 겹칠 수 있다: 세계에 높이를 물을 때는 늘 카트의 높이(y)를 같이 준다 — 세계가 그 높이의 층을 골라 답한다(약속 3.13).
  // 벽은 y0 · y1(있으면)로 높이 범위를 가진다: 카트가 그 범위 밖이면 그 벽은 없는 것이다.
  const near = [];               // 벽 조회 결과를 담는 재사용 배열(상태 아님)
  let body = null;               // 부딪힘 모양(위 설명). null = 원점의 원 하나
  function setBody(b) {
    if (!b || !(b.radius > 0) || !Array.isArray(b.offsets) || !b.offsets.length) { body = null; return null; }
    const offsets = b.offsets.map(Number), radius = +b.radius, span = offsets[offsets.length - 1] - offsets[0];
    const length = b.length > 0 ? +b.length : span + 2 * radius, width = b.width > 0 ? +b.width : 2 * radius;
    body = { radius, offsets, mid: (offsets[0] + offsets[offsets.length - 1]) / 2, half: span / 2, inertia: (length * length + width * width) / 12 };
    return body;
  }
  setBody(bodyIn);
  const normals = [];            // 이번 틱에 닿은 벽 법선들(재사용, 상태 아님)

  const state = {};
  function reset({ x = 0, z = 0, heading = 0, y } = {}) {   // y: 길이 겹치는 자리에서 어느 층에 놓을지(안 주면 가장 위)
    const g = groundAt(x, z, heading, y);
    Object.assign(state, {
      x, z, y: g.h, heading, course: heading, speed: 0, steer: 0,
      drifting: false, driftDir: 0, slip: 0, gauge: 0, boost: 0,
      grounded: true, vy: 0, pitch: g.pitch, roll: g.roll, wallHit: false, tick: 0,
      // ── 약속 밖에 더한 값(읽기만 하면 된다) ──
      mode: 'normal',            // 'normal' | 'drift' | 'recover'
      vx: 0, vz: 0,              // 평면 속도(m/s)
      wallImpact: 0,             // 이번 틱에 벽 안쪽으로 부딪힌 속도(m/s)
      wallNx: 0, wallNz: 0,      // 벽에 닿은 틱에 그 벽에서 나오는 쪽(단위 벡터). 효과가 쓴다
      wallPx: 0, wallPz: 0,      // 벽에 닿은 틱에 닿은 곳(세계 좌표 — 부딪힘 모양의 원 가운데 − 법선 × 반지름). 효과(불티 · 파편)가 쓴다
      shoveX: 0, shoveZ: 0,      // 몸싸움으로 튕겨 난 속도(m/s, 세계 좌표) — 카트끼리 부딪히면 race.js 가 넣고 여기서 사그라든다
      wallContacts: 0,           // 벽에 새로 닿은 횟수(누적)
      boostReady: false,         // 쓸 수 있는 칸이 있음(boostStock > 0)
      boostStarted: false,       // 이번 틱에 부스트가 시작됨(효과음 · 효과용)
      groundY: g.h,              // 지금 자리 지면 높이
      // ── 부스터 체계(약속 3.11) ──
      boostStock: 0,             // 모아 둔 칸 수(0 ~ boostSlots)
      boostKind: '',             // boost > 0 인 동안의 종류: 'item' 모아 둔 것 | 'kick' 드리프트 직후 | 'start' 출발
      boostEarned: false,        // 이번 틱에 한 칸을 얻음
      kickReady: false,          // 드리프트를 막 끝내 '다시 밟기'를 받아 주는 중
      // ── 공중 · 착지 ──
      air: 0,                    // 땅에서 떠 있는 동안 흐른 시간(초). 붙어 있으면 0
      landed: 0,                 // 이번 틱에 내려앉았으면 부딪힌 수직 속도(m/s), 아니면 0
      // ── 내부 값(save/load 에 같이 실려야 결정적) ──
      _driftArm: 0, _driftEntry: 0, _driftKappa: 0, _recover: 0, _reverseHold: 0,
      _prevDrift: false, _prevBoost: false, _prevSteerDir: 0, _driftRest: 9, _driftSpent: false, _wallBlock: 0, _touching: false,
      _prevKick: false, _boostBuffer: 0, _kickBuffer: 0, _kickWindow: 0, _kick: 0, _yaw: 0, _driftTime: 0, _onPad: false,
      _w0: g.fl, _w1: g.fr, _w2: g.bl, _w3: g.br,   // 직전 틱에 네 바퀴 밑의 지면 높이(턱 판정용)
    });
    return state;
  }

  // 네 바퀴 높이 → 평균 높이 · 앞뒤 · 좌우 기울기. pitch + = 앞이 들림, roll + = 오른쪽이 들림.
  function groundAt(x, z, h, y) {
    const fx = sin(h), fz = cos(h), rx = -fz, rz = fx;
    const a = P.wheelBase / 2, b = P.track / 2;
    const fl = heightAt(x + fx * a - rx * b, z + fz * a - rz * b, y), fr = heightAt(x + fx * a + rx * b, z + fz * a + rz * b, y);
    const bl = heightAt(x - fx * a - rx * b, z - fz * a - rz * b, y), br = heightAt(x - fx * a + rx * b, z - fz * a + rz * b, y);
    return { h: (fl + fr + bl + br) / 4, pitch: atan2((fl + fr) - (bl + br), 2 * P.wheelBase), roll: atan2((fr + br) - (fl + bl), 2 * P.track), fl, fr, bl, br };
  }

  // ── 벽: 움직이는 원(반지름 r)과 두께 0 선분의 첫 접촉. 원이 여럿이면(부딪힘 모양) 가장 먼저 닿는 원 ──
  const hit = { t: 1, nx: 0, nz: 0, found: false, px: 0, pz: 0 };   // px · pz: 닿은 원의 가운데(움직이기 전)
  function sweep(dx, dz) {
    hit.t = 1; hit.found = false;
    const r = body ? body.radius : P.wallRadius, O = body ? body.offsets : ONE, fx = sin(state.heading), fz = cos(state.heading);
    const len = hypot(dx, dz), mid = body ? body.mid : 0, half = body ? body.half : 0;
    walls.near(state.x + fx * mid + dx / 2, state.z + fz * mid + dz / 2, half + len / 2 + r + 0.05, near);
    for (let k = 0; k < O.length; k++) sweepOne(state.x + fx * O[k], state.z + fz * O[k], dx, dz, r);
    return hit;
  }
  function sweepOne(px, pz, dx, dz, r) {
    for (let i = 0; i < near.length; i++) {
      const s = near[i];
      if (state.y >= s.y1 || state.y + P.bodyHeight <= s.y0) continue;   // 다른 층의 벽(이 벽은 카트보다 아래에서 끝나거나 위에서 시작한다)
      const ex = s.bx - s.ax, ez = s.bz - s.az, el = hypot(ex, ez);
      if (el > 1e-9) {
        const ux = ex / el, uz = ez / el, nx = -uz, nz = ux;
        const sp = (px - s.ax) * nx + (pz - s.az) * nz;          // 선분 직선까지의 부호 거리
        const dd = dx * nx + dz * nz;
        let side = sp > 1e-9 ? 1 : sp < -1e-9 ? -1 : (dd > 0 ? -1 : 1);
        if (side * dd < 0) {                                        // 선분 쪽으로 다가가는 중
          let t = (side * r - sp) / dd; if (t < 0) t = 0;            // 이미 겹쳐 있으면 0
          if (t < hit.t) {
            const q = (px + dx * t - s.ax) * ux + (pz + dz * t - s.az) * uz;
            if (q >= 0 && q <= el) { hit.t = t; hit.nx = side * nx; hit.nz = side * nz; hit.found = true; hit.px = px; hit.pz = pz; }
          }
        }
      }
      // 양 끝점(원)
      for (let k = 0; k < 2; k++) {
        const cx = k ? s.bx : s.ax, cz = k ? s.bz : s.az;
        const mx = px - cx, mz = pz - cz, b = mx * dx + mz * dz;
        if (b >= 0) continue;                                       // 멀어지는 중
        const c = mx * mx + mz * mz - r * r, a = dx * dx + dz * dz;
        let t;
        if (c <= 0) t = 0; else { const disc = b * b - a * c; if (disc < 0) continue; t = (-b - Math.sqrt(disc)) / a; }
        if (t < hit.t) {
          const qx = px + dx * t - cx, qz = pz + dz * t - cz, ql = hypot(qx, qz) || 1;
          hit.t = t; hit.nx = qx / ql; hit.nz = qz / ql; hit.found = true; hit.px = px; hit.pz = pz;
        }
      }
    }
  }

  // 겹쳐 있으면 밖으로 밀어낸다(시작 자세가 벽에 걸쳤을 때 · 오목 모서리 숫자 오차 · 차체가 돌며 앞뒤 끝이 벽에 들어갔을 때). 밀어낸 법선과 닿은 곳을 돌려준다.
  // 원이 원점에서 o 만큼 떨어져 있으면 미는 양을 옮김과 회전으로 나눈다: 그 원이 깊이 d 만큼 빠지도록 k = d / (1 + τ² / I), 옮김 k · n, 회전 k · τ / I
  // (τ = o × (n · 왼쪽), I = 차체의 관성). 원 하나(o = 0)면 예전과 똑같이 옮기기만 한다. 한 번에 도는 각은 MAX_YAW 까지.
  const MAX_YAW = 0.05;
  function depenetrate(onPush) {
    const r = body ? body.radius : P.wallRadius, O = body ? body.offsets : ONE, mid = body ? body.mid : 0, half = body ? body.half : 0, I = body ? body.inertia : 0;
    for (let iter = 0, top = O.length > 1 ? 6 : 4; iter < top; iter++) {
      let fx = sin(state.heading), fz = cos(state.heading);
      walls.near(state.x + fx * mid, state.z + fz * mid, half + r + 0.05, near);
      let moved = false;
      for (let k = 0; k < O.length; k++) {
        const o = O[k];
        for (let i = 0; i < near.length; i++) {
          const s = near[i];
          if (state.y >= s.y1 || state.y + P.bodyHeight <= s.y0) continue;
          const px = state.x + fx * o, pz = state.z + fz * o;
          const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez;
          let t = l2 > 1e-12 ? ((px - s.ax) * ex + (pz - s.az) * ez) / l2 : 0; t = clamp(t, 0, 1);
          const cx = s.ax + ex * t, cz = s.az + ez * t;
          let nx = px - cx, nz = pz - cz; const d = hypot(nx, nz);
          if (d >= r) continue;
          if (d > 1e-9) { nx /= d; nz /= d; }
          else {                                                      // 정확히 선 위: 진행 반대쪽 법선
            const el = Math.sqrt(l2) || 1; nx = -ez / el; nz = ex / el;
            if (nx * state.vx + nz * state.vz > 0) { nx = -nx; nz = -nz; }
          }
          const push = r + P.wallSkin - d;
          if (o === 0 || !(I > 0)) { state.x += nx * push; state.z += nz * push; }
          else {
            const tau = o * (nx * fz - nz * fx), share = push / (1 + tau * tau / I), turn = clamp(share * tau / I, -MAX_YAW, MAX_YAW);
            state.x += nx * share; state.z += nz * share; state.heading = wrapAngle(state.heading + turn);
            fx = sin(state.heading); fz = cos(state.heading);
          }
          moved = true; onPush(nx, nz, cx, cz);
        }
      }
      if (!moved) break;
    }
  }

  // 드리프트를 끝낸다. 벽에 닿아 끝난 것이 아니고 충분히 길었으면 '다시 밟기' 창을 연다.
  let endedNow = false;          // 이번 틱에 드리프트가 끝났는가(상태 아님 — 틱 안에서만 쓴다)
  function endDrift(byWall) {
    endedNow = true;
    state.mode = 'recover'; state._recover = 0; state._kick = 0; state._driftRest = 0;
    if (!byWall && P.kickBoostTime > 0 && state._driftTime >= P.kickMinDriftTime) state._kickWindow = P.kickWindow;
  }

  function step(input = {}) {
    const st = state;
    const x0 = st.x, z0 = st.z, h0 = st.heading, c0 = st.course, slip0 = st.slip;   // 이번 틱에 움직이기 전 자세(10) 에서 턱을 만나면 물린다)
    const steerIn = clamp(+input.steer || 0, -1, 1);
    const throttle = clamp(+input.throttle || 0, 0, 1);
    const brake = clamp(+input.brake || 0, 0, 1);
    const driftIn = !!input.drift, boostIn = !!input.boost;
    const kickIn = input.kick === undefined ? throttle > 0 : !!input.kick;      // '다시 밟기' 신호(안 주면 가속)
    st.tick++; st.wallHit = false; st.wallImpact = 0; st.boostStarted = false; st.boostEarned = false; st.landed = 0; endedNow = false;
    const lean = bankAt && st.grounded ? bankAt(st.x, st.z, st.y) : 0;   // 기운 코너의 받침 힘(+ = 왼쪽으로 도는 것을) — 움직이기 전 자리

    // 1) 조향 입력 평활
    const target = steerIn;
    const tau = Math.abs(target) > Math.abs(st.steer) ? P.steerRiseTime : P.steerFallTime;
    st.steer += (target - st.steer) * follow(dt, tau);
    const u = st.steer;

    // 2) 단추 가장자리
    // 새로 누름: 눌린 상태가 꺼짐 → 켜짐으로 바뀐 틱. 입력기가 '톡'(boostTap · kickTap — 읽기 사이에 눌렀다 뗀 것까지 센 새 누름)을 주면 그것도 본다.
    // 다시 밟기는 kickTap 을 받으면 그것만 믿는다(키보드와 터치를 오가며 눌린 상태만 바뀐 것을 새 누름으로 세지 않게).
    const driftPressed = driftIn && !st._prevDrift, boostPressed = (boostIn && !st._prevBoost) || !!input.boostTap;
    const kickPressed = input.kickTap !== undefined ? !!input.kickTap : kickIn && !st._prevKick;
    st._prevDrift = driftIn; st._prevBoost = boostIn; st._prevKick = kickIn;
    // 드리프트는 'Shift 와 방향키를 둘 다 누르고 있으면' 걸린다 — 어느 것을 먼저 눌렀든, 얼마나 일찍 눌러 두었든. 시작할 수 없는 동안(떠 있음 · 벽에 막 닿음 ·
    // 너무 느림)에는 기다렸다가 조건이 되는 틱에 시작한다. 다만 앞 드리프트가 끝난 직후(driftHoldRestart 초)에는 누르고만 있어서는 다시 걸리지 않는다:
    // 드리프트 중의 반대 방향키는 그 드리프트를 끊는 조작이라, 끝나자마자 반대쪽으로 넘어가면 안 된다. 그 사이에도 둘 중 하나를 '새로 누르면'(장전) 바로 걸린다.
    // 장전: 드리프트 중이 아닐 때 Shift 나 방향키를 새로 누른 틱(방향을 반대로 넘긴 것 포함). 둘 중 하나라도 떼면 풀린다.
    const steerDir = Math.abs(steerIn) >= P.driftMinSteer ? (steerIn > 0 ? 1 : -1) : 0, steerPressed = steerDir !== 0 && steerDir !== st._prevSteerDir;
    st._prevSteerDir = steerDir;
    if (!driftIn) st._driftSpent = false;
    if (!driftIn || steerDir === 0) st._driftArm = 0;
    else if (st.mode !== 'drift' && (driftPressed || steerPressed)) st._driftArm = 1;
    if (st._wallBlock > 0) st._wallBlock = Math.max(0, st._wallBlock - dt);

    // 3) 부스트
    // 모아 둔 칸 쓰기: 단추를 새로 누른 순간. 조금 일찍 눌러도(boostBufferTime) 칸이 생기는 순간 듣는다. 모아 둔 부스트가 도는 중에는 겹쳐 쓰지 않는다.
    if (boostPressed) st._boostBuffer = P.boostBufferTime;
    if (st._boostBuffer > 0) {
      // 브레이크를 밟고 있으면 쓰지 않는다(브레이크는 부스트를 끝내므로 칸만 사라진다)
      if (st.boostStock > 0 && brake <= 0 && !(st.boost > 0 && st.boostKind === 'item')) { st.boostStock--; st.boost = P.boostTime; st.boostKind = 'item'; st.boostStarted = true; st._boostBuffer = 0; }
      else st._boostBuffer = Math.max(0, st._boostBuffer - dt);
    }
    if (kickPressed) st._kickBuffer = P.kickBufferTime;      // 다시 밟기도 조금 일찍 누른 것까지 받는다(판정은 5) 에서 드리프트가 끝난 뒤에)
    if (st.boost > 0 && brake > 0) st.boost = 0;

    // 4) 경사(진행 방향 앞뒤)
    const cfx = sin(st.course), cfz = cos(st.course);
    let slopeA = 0;
    if (st.grounded) {
      const hf = heightAt(st.x + cfx * P.slopeProbe, st.z + cfz * P.slopeProbe, st.y), hb = heightAt(st.x - cfx * P.slopeProbe, st.z - cfz * P.slopeProbe, st.y);
      slopeA = -P.slopeFactor * P.gravity * sin(atan2(hf - hb, 2 * P.slopeProbe));
    }

    // 5) 드리프트 시작 · 끝
    const v0 = st.speed;
    if (st.mode === 'drift' && (!driftIn || v0 < P.driftExitSpeed)) endDrift(false);
    // 드리프트 직후의 짧은 가속: 창이 열려 있는 동안 '다시 밟기'가 들어오면(이 틱에 드리프트를 놓으면서 밟은 것도 받는다)
    if (st._kickWindow > 0) {
      if (st._kickBuffer > 0 && st.boost <= 0 && brake <= 0) {
        st.boost = P.kickBoostTime; st.boostKind = 'kick'; st.boostStarted = true; st._kickWindow = 0; st._kickBuffer = 0;
        if (driftPressed) { st._driftArm = 0; st._driftSpent = true; }   // 터치는 드리프트 단추가 '다시 밟기'다 — 그 누름으로는(뗄 때까지) 새 드리프트를 시작하지 않는다
      } else st._kickWindow = Math.max(0, st._kickWindow - dt);
    }
    if (st._kickBuffer > 0) st._kickBuffer = Math.max(0, st._kickBuffer - dt);
    if (st.mode !== 'drift') {
      if (st._driftRest < 9) st._driftRest += dt;                // 앞 드리프트가 끝난 뒤 흐른 시간(9초에서 멈춘다)
      if ((st._driftArm > 0 || (driftIn && steerDir !== 0 && st._driftRest >= P.driftHoldRestart)) && !st._driftSpent && !endedNow && st.grounded && v0 >= P.driftMinSpeed && st._wallBlock <= 0) {
        st.mode = 'drift'; st.driftDir = steerDir; st._driftEntry = v0; st._driftArm = 0; st._driftTime = 0;
        // 미끄럼형: 진입하는 순간 차체를 더 돌려 준다. 차체의 도는 빠르기는 지금 조향으로 돌던 빠르기에서 이어 간다.
        st._kick = P.slideKickTime;
        st._yaw = Math.max(0, st.driftDir * u * v0 / (P.turnRadiusBase + P.turnRadiusPerSpeed2 * v0 * v0));
      }
    }

    // 6) 속도
    const cap = st.boost > 0 ? P.boostMaxSpeed : P.maxSpeed;
    let v = v0, a = 0;
    if (st.grounded) {
      if (st.mode === 'drift') {
        // 미끄럼형: 벌어진 각만큼 저항이 붙고, 구동은 차체가 보는 쪽으로 밀기 때문에 진행 방향 성분(cos)만 남는다
        const open = Math.abs(st.slip), along = cos(open);
        a -= P.slideDragBase + P.slideDrag * sin(open);
        a += throttle * Math.max(0, P.accel * (1 - (v / P.maxSpeed) * (v / P.maxSpeed))) * along - (1 - throttle) * (P.coastDecel + P.coastDecelPerSpeed * v);
        if (brake > 0) a -= brake * P.driftBrakeDecel;
        if (st.boost > 0) a += P.boostAccel * along;
        a += slopeA;
        v = Math.max(0, v + a * dt);
      } else if (brake > 0) {
        if (v > 0.2) { v = Math.max(0, v - brake * P.brakeDecel * dt) + slopeA * dt; st._reverseHold = 0; }
        else {
          // 거의 멈췄다: 브레이크가 경사를 붙잡는다. (경사에 다시 밀려 '멈춤'이 풀리면 내리막에서 영영 후진을 못 한다.)
          st._reverseHold += dt;
          if (st._reverseHold >= P.reverseDelay) v = Math.max(-P.reverseMax, Math.min(0, Math.min(v, 0) - brake * P.reverseAccel * dt + slopeA * dt));
          else v = v > 0 ? Math.max(0, v - brake * P.brakeDecel * dt) : Math.min(0, v + P.coastDecel * dt);
        }
      } else {
        st._reverseHold = 0;
        if (v < 0 && throttle > 0) v = Math.min(0, v + throttle * P.brakeDecel * dt);
        else {
          if (v >= 0) a += throttle * Math.max(0, P.accel * (1 - (v / P.maxSpeed) * (v / P.maxSpeed)));
          if (st.boost > 0 && v >= 0) a += P.boostAccel;
          if (st.mode === 'recover') a -= P.slideDrag * sin(Math.abs(st.slip));   // 놓은 뒤 붙는 동안에도 벌어진 만큼 잃는다
          const coast = (1 - throttle) * (P.coastDecel + P.coastDecelPerSpeed * Math.abs(v));
          const vNoCoast = v + (a + slopeA) * dt;
          // 굴림 저항은 0 을 넘어 반대로 밀지 않는다. 정지 중 완만한 경사는 붙잡는다.
          if (Math.abs(v) < 0.05 && throttle === 0 && Math.abs(slopeA) <= P.coastDecel) v = 0;
          else v = vNoCoast > 0 ? Math.max(0, vNoCoast - coast * dt) : Math.min(0, vNoCoast + coast * dt);
        }
      }
      // 상한: 구동으로는 못 넘고, 넘어 있으면 천천히 줄인다(한 틱에 꺾이지 않게)
      // 브레이크로 더 많이 줄였으면 그 속도를 지킨다(부스트 직후 급제동이 약해지지 않게).
      if (v > cap) v = v0 > cap ? Math.max(cap, Math.min(v, v0 - P.overSpeedDecay * dt)) : cap;
    }
    if (st.boost > 0) st.boost = Math.max(0, st.boost - dt);
    st.speed = v;

    // 7) 방향
    if (!st.grounded) {
      st.heading = wrapAngle(st.heading - P.airSteer * (v / (P.turnRadiusBase + P.turnRadiusPerSpeed2 * v * v)) * u * dt);
      st.slip = wrapAngle(st.heading - st.course);             // 공중에서 돌린 만큼 벌어진 각도 같이 바뀐다(안 그러면 내려앉는 틱에 드리프트가 차체를 예전 각으로 되돌려 튄다)
    } else if (st.mode === 'drift') {
      // 미끄럼형: 조향은 차체가 도는 빠르기를 정한다(안쪽으로 꺾으면 더 돌고, 반대로 꺾으면 되돌아온다).
      // 진행 방향은 벌어진 각의 sin 에 비례해 차체를 따라붙는다 → 오래 꺾고 있으면 차체가 도는 빠르기로 같이 돈다.
      const d = st.driftDir, q = d * u;                                  // q: +1 = 드리프트 방향으로 끝까지
      const fade = v > P.slideYawSpeedRef ? pow(P.slideYawSpeedRef / v, P.slideYawSpeedPow) : 1;
      let want = (q >= 0 ? P.slideYawIn : P.slideYawOut) * q * fade;     // 차체가 안쪽으로 도는 빠르기(rad/s)
      if (st._kick > 0 && P.slideKickTime > 0) { want += P.slideKickDeg * DEG / P.slideKickTime; st._kick = Math.max(0, st._kick - dt); } else st._kick = 0;
      st._yaw += (want - st._yaw) * follow(dt, P.slideYawTime);
      const widest = P.slideMaxSlipDeg * DEG;
      let open = -d * st.slip + st._yaw * dt;                            // 안쪽으로 벌어진 각
      const inward = lean !== 0 ? (d < 0 ? lean : -lean) : 0;             // 기운 코너가 이 드리프트의 안쪽을 받치는 몫(왼쪽 드리프트 d = −1)
      const chase = (inward > 0 ? P.slideGrip * (1 + inward) : P.slideGrip) * sin(open) * dt;   // 진행 방향이 차체를 따라붙는 각(안쪽 +)
      open -= chase;
      if (open > widest) { open = widest; st._yaw = Math.min(st._yaw, P.slideGrip * sin(widest)); } else if (open < -widest) open = -widest;
      st.course = wrapAngle(st.course - d * chase);
      st.slip = -d * open; st.heading = wrapAngle(st.course + st.slip);
      st._driftKappa = v > 0.5 ? -d * chase / dt / v : 0;                // 왼쪽 + 곡률
      st._driftTime += dt;
      if (open < P.slideEndDeg * DEG && q <= 0.05 && st._kick <= 0) endDrift(false);   // 다 펴졌고 안쪽으로 꺾고 있지 않다 → 끝
    } else {
      const inward = lean !== 0 ? (u < 0 ? lean : -lean) : 0;             // 기운 코너가 지금 도는 쪽(조향 왼쪽 = u < 0)의 안쪽을 받치는 몫
      const kn = inward > 0 ? -u / (P.turnRadiusBase + P.turnRadiusPerSpeed2 * v * v / (1 + inward)) : -u / (P.turnRadiusBase + P.turnRadiusPerSpeed2 * v * v);  // 일반 조향 곡률(왼쪽 +)
      const gripT = inward > 0 ? P.gripTime / (1 + inward) : P.gripTime;
      if (st.mode === 'recover') {
        // 미끄럼형: 놓으면 차체는 일반 조향을 따르고, 접지가 slideRecoverTime 에 걸쳐 돌아오며 진행 방향이 차체가 보는 쪽으로 붙는다
        st._recover += dt;
        const w = clamp(st._recover / P.slideRecoverTime, 0, 1);
        st.heading = wrapAngle(st.heading + v * kn * dt);
        if (Math.abs(v) < 0.2) st.course = st.heading;
        else st.course = wrapAngle(st.course + wrapAngle(st.heading - st.course) * follow(dt, inward > 0 ? (P.slideExitGripTime + (P.gripTime - P.slideExitGripTime) * w) / (1 + inward) : P.slideExitGripTime + (P.gripTime - P.slideExitGripTime) * w));
        st.slip = wrapAngle(st.heading - st.course);
        if (w >= 1) { st.mode = 'normal'; st.driftDir = 0; }
      } else {
        st.heading = wrapAngle(st.heading + v * kn * dt);
        if (Math.abs(v) < 0.2) st.course = st.heading;
        else st.course = wrapAngle(st.course + wrapAngle(st.heading - st.course) * follow(dt, gripT));
      }
    }

    // 8) 이동 + 벽
    let wx = v * sin(st.course), wz = v * cos(st.course);
    // 몸싸움으로 튕겨 난 속도(race.js 의 bump 가 넣는다): 주행 속도에 더해 움직이고 shoveTime 에 걸쳐 사그라든다. 조향 · 가속은 그대로 듣는다.
    if (st.shoveX !== 0 || st.shoveZ !== 0) {
      wx += st.shoveX; wz += st.shoveZ; const keep = exp(-dt / P.shoveTime);
      st.shoveX *= keep; st.shoveZ *= keep; if (st.shoveX * st.shoveX + st.shoveZ * st.shoveZ < 0.0025) st.shoveX = st.shoveZ = 0;
    }
    st.vx = wx; st.vz = wz;
    let dx = wx * dt, dz = wz * dt;
    let touched = false, impact = 0, lastNx = 0, lastNz = 0, lastPx = 0, lastPz = 0, speedBefore = hypot(wx, wz);
    normals.length = 0;
    if (walls) {
      const r = body ? body.radius : P.wallRadius;
      depenetrate((nx, nz, cx, cz) => {
        touched = true; lastNx = nx; lastNz = nz; lastPx = cx; lastPz = cz; if (normals.length < 8) normals.push(nx, nz);
        const vn = wx * nx + wz * nz; if (vn < 0) { impact = Math.max(impact, -vn); wx -= nx * vn; wz -= nz * vn; }
        const dn = dx * nx + dz * nz; if (dn < 0) { dx -= nx * dn; dz -= nz * dn; }
      });
      for (let iter = 0; iter < 4 && (dx !== 0 || dz !== 0); iter++) {
        const h = sweep(dx, dz);
        if (!h.found) { st.x += dx; st.z += dz; dx = dz = 0; break; }
        lastPx = h.px + dx * h.t - h.nx * r; lastPz = h.pz + dz * h.t - h.nz * r;   // 닿은 곳(효과가 쓴다)
        st.x += dx * h.t + h.nx * P.wallSkin; st.z += dz * h.t + h.nz * P.wallSkin;
        dx *= 1 - h.t; dz *= 1 - h.t;
        const dn = dx * h.nx + dz * h.nz; if (dn < 0) { dx -= h.nx * dn; dz -= h.nz * dn; }
        const vn = wx * h.nx + wz * h.nz; if (vn < 0) { impact = Math.max(impact, -vn); wx -= h.nx * vn; wz -= h.nz * vn; }
        touched = true; lastNx = h.nx; lastNz = h.nz; if (normals.length < 8) normals.push(h.nx, h.nz);
      }
    } else { st.x += dx; st.z += dz; }

    if (touched) {
      // 새 접촉 = 직전 wallDriftBlock 초 동안 닿은 적이 없을 때(스치며 한두 틱 떨어졌다 다시 닿는 것은 같은 접촉)
      const fresh = st._wallBlock <= 0 && !st._touching;
      st.wallHit = true; st.wallImpact = impact; st.wallNx = lastNx; st.wallNz = lastNz; st.wallPx = lastPx; st.wallPz = lastPz; st._wallBlock = P.wallDriftBlock;
      if (fresh) st.wallContacts++;
      if ((fresh || impact > 3) && impact >= P.wallImpactMin && speedBefore > 1e-6) {
        const keep = 1 - P.wallImpactLoss * clamp(impact / speedBefore, 0, 1);
        wx *= keep; wz *= keep;
      }
      // 비비는 동안의 감속
      const sp2 = hypot(wx, wz);
      if (sp2 > 1e-6) { const drop = Math.min(sp2, (P.wallRubDecel + P.wallRubPerSpeed * sp2) * dt); wx *= (sp2 - drop) / sp2; wz *= (sp2 - drop) / sp2; }
      // 세게 부딪히면 조금 튕긴다
      if (impact > 3) { wx += lastNx * impact * P.wallBounce; wz += lastNz * impact * P.wallBounce; }
      if (impact >= P.wallBoostCancel) st.boost = 0;
      // 드리프트는 끝나고, 이 틱 게이지는 적립하지 않는다
      if (st.mode === 'drift') endDrift(true); else if (endedNow) st._kickWindow = 0;   // 놓는 틱에 벽에 닿았으면 그 드리프트의 '다시 밟기'는 없다
      st.shoveX = st.shoveZ = 0;   // 벽에 닿았으면 밀려나던 속도는 여기서 끝난다(벽에 깎인 전체 속도가 아래에서 speed · course 가 된다)
      // 속도 벡터 → (speed, course). 차체 앞과 같은 쪽이면 +, 아니면 후진
      const s = hypot(wx, wz);
      if (s > 1e-4) {
        const fwd = wx * sin(st.heading) + wz * cos(st.heading) >= 0;
        st.speed = fwd ? s : -s;
        st.course = fwd ? atan2(wx, wz) : atan2(-wx, -wz);
      } else st.speed = 0;
      // 차체가 벽 쪽을 보고 있으면 벽을 따라 돌린다
      const hfx = sin(st.heading), hfz = cos(st.heading);
      if (st.speed > 0.5 && hfx * lastNx + hfz * lastNz < 0) {
        const diff = wrapAngle(st.course - st.heading) * follow(dt, P.wallAlignTime);
        st.heading = wrapAngle(st.heading + diff);
        if (st.mode === 'recover') st.slip = wrapAngle(st.heading - st.course);
      }
      // 거의 멈춘 채 앞이 벽에 박혀 있고 가속 중이면, 막히지 않은 벽 방향으로 차체를 비벼 돌린다(정면으로 박혀 영영 못 도는 일 방지)
      if (throttle > 0 && Math.abs(st.speed) < 2 && hfx * lastNx + hfz * lastNz < -0.1) {
        const hA = atan2(-lastNz, lastNx), hB = wrapAngle(hA + PI);
        const open = h => { const ox = sin(h), oz = cos(h); for (let k = 0; k < normals.length; k += 2) if (ox * normals[k] + oz * normals[k + 1] < -0.1) return false; return true; };
        const dA = wrapAngle(hA - st.heading), dB = wrapAngle(hB - st.heading), oA = open(hA), oB = open(hB);
        let d;
        if (oA !== oB) d = oA ? dA : dB;
        else if (Math.abs(steerIn) > 0.3) d = (steerIn > 0) === (dA < 0) ? dA : dB;   // 오른쪽 조향 = heading 이 줄어드는 쪽
        else d = Math.abs(dA) <= Math.abs(dB) ? dA : dB;
        const turn = clamp(d, -P.wallPivotRate * dt, P.wallPivotRate * dt);
        st.heading = wrapAngle(st.heading + turn);
        if (Math.abs(st.speed) < 0.2) st.course = st.heading;
      }
      st.vx = wx; st.vz = wz;
      if (s <= 1e-4) { st.vx = 0; st.vz = 0; }
    }
    st._touching = touched;
    if (st.mode === 'normal' || st.mode === 'recover') st.slip = wrapAngle(st.heading - st.course);
    st.drifting = st.mode === 'drift';
    if (!st.drifting && st.mode === 'normal') st.driftDir = 0;

    // 9) 게이지
    if (st.drifting && st.grounded && !touched && st.speed >= P.gaugeMinSpeed) {
      const slipDeg = Math.abs(st.slip) / DEG;
      const rate = P.gaugeRate * clamp((slipDeg - P.gaugeSlipMinDeg) / Math.max(1e-6, P.gaugeSlipFullDeg - P.gaugeSlipMinDeg), 0, 1) * clamp(st.speed / Math.max(1e-6, P.gaugeFullSpeed), 0, 1);
      st.gauge += rate * dt;
    }
    // 100 이 되면 한 칸으로 모으고 남은 만큼부터 다시 찬다. 칸이 꽉 차 있으면 100 에 머문다.
    if (st.gauge >= 100) {
      if (st.boostStock < P.boostSlots) { st.boostStock++; st.gauge = Math.min(99, st.gauge - 100); st.boostEarned = true; }
      else st.gauge = 100;
    }
    st.boostReady = st.boostStock > 0;
    st.kickReady = st._kickWindow > 0 && st.boost <= 0;        // 지금 밟으면 실제로 붙는 동안만

    // 10) 높이 · 기울기. 지면 아래로는 절대 안 내려간다. 딛는 층은 이번 틱에 움직이기 전의 높이로 고른다.
    const yRef = st.y;
    let g = groundAt(st.x, st.z, st.heading, yRef);
    // 턱: 어느 바퀴든 밑의 지면이 그 바퀴가 움직인 거리에 견줘 말이 안 되게 솟았으면(점프대의 끊긴 끝을 낮은 쪽에서 만났을 때) 비탈이 아니라
    // 수직면이다 → 벽처럼 막는다(이번 틱의 움직임을 물린다). 그대로 두면 솟은 높이가 한 틱의 수직 속도로 바뀌어 카트가 하늘로 튕겨 나간다.
    // 네 바퀴 평균으로 보면 한 바퀴만 먼저 걸친 빠른 사선 진입을 놓친다. 카트가 그 면보다 높이 떠 있으면(위로 지나가면) 막지 않는다.
    {
      const reach = hypot(st.x - x0, st.z - z0) + Math.abs(wrapAngle(st.heading - h0)) * 0.78;   // 바퀴 하나가 이번 틱에 움직인 거리(넉넉히)
      const most = P.stepMin + reach * P.climbSlopeMax, over = Math.max(st.y, st.groundY) + P.stepMin;
      if ((g.fl - st._w0 > most && g.fl > over) || (g.fr - st._w1 > most && g.fr > over) || (g.bl - st._w2 > most && g.bl > over) || (g.br - st._w3 > most && g.br > over)) {
        const hit = Math.abs(st.speed);
        st.x = x0; st.z = z0; st.heading = h0; st.course = c0; st.slip = slip0; st.speed = -st.speed * P.stepBounce; st.vx = 0; st.vz = 0;
        if (!st._touching && st._wallBlock <= 0) st.wallContacts++;
        st.wallHit = true; st.wallImpact = Math.max(st.wallImpact, hit); st._wallBlock = P.wallDriftBlock;
        if (hit >= P.wallBoostCancel) st.boost = 0;
        if (st.mode === 'drift') endDrift(true); else if (endedNow) st._kickWindow = 0;
        st.drifting = false;
        g = groundAt(st.x, st.z, st.heading, yRef);
      }
    }
    // 지면이 오르는 빠르기 = 붙어 있을 때의 수직 속도. 비탈이 낼 수 있는 값을 넘지 않게 한 번 더 막는다.
    const groundRate = Math.min((g.h - st.groundY) / dt, Math.abs(st.speed) * P.climbSlopeMax + 2);
    const yBall = st.y + st.vy * dt - 0.5 * P.gravity * dt * dt, wasGrounded = st.grounded, falling = st.vy - P.gravity * dt;
    // 접지 유지: 붙어 달리던 카트는 땅이 조금 꺼져도(한 틱에 groundHold × dt 까지) 뜨지 않고 따라 내려간다.
    // 진짜 지형은 길이 꺾이는 곳마다 잔 마루가 있어서, 그대로 두면 빠를 때 0.2~0.6초씩 떠서 그동안 조향 · 드리프트가 안 듣는다(결승선 앞 U자 입구 — 2026-11-20 사용자).
    const held = wasGrounded && yBall - g.h <= P.groundHold * dt;
    if (yBall > g.h && !held) { st.y = yBall; st.vy -= P.gravity * dt; }
    else { st.y = g.h; st.vy = groundRate; }
    // 머리 위의 판(다리 밑면): 떠서 닿으면 더 오르지 못한다
    if (ceilingAt && st.y > g.h) { const top = ceilingAt(st.x, st.z, yRef) - P.bodyHeight; if (st.y > top) { st.y = Math.max(g.h, top); if (st.vy > 0) st.vy = 0; } }
    st.groundY = g.h;
    const gap = st.y - g.h;
    st.grounded = st.grounded ? gap <= P.airGap : gap <= 0.005;
    if (!wasGrounded && st.grounded) st.landed = Math.max(0, groundRate - falling);   // 내려앉은 틱: 땅에 대한 수직 속도
    st.air = st.grounded ? 0 : st.air + dt;
    st._w0 = g.fl; st._w1 = g.fr; st._w2 = g.bl; st._w3 = g.br;
    // 부스트 발판: 땅에 붙어 밟는 순간 한 번(발판을 벗어났다 다시 밟아야 또 붙는다). 더 긴 부스트가 돌고 있으면 그대로 둔다.
    // 접지를 정한 뒤에 본다 — 발판 위에 내려앉는 틱에도 밟은 것으로 치게.
    const pad = boostAt && st.grounded ? boostAt(st.x, st.z, st.y) : null;
    if (pad && !st._onPad && P.padBoostTime > 0) { if (st.boost < P.padBoostTime) { st.boost = P.padBoostTime; st.boostKind = 'pad'; } st.boostStarted = true; }
    st._onPad = !!pad;
    const tk = follow(dt, P.tiltTime);
    // 화면용 기울기: 땅에 붙어 있으면 지면을 따르고, 떠 있으면 코끝이 날아가는 방향을 따른다(오를 때 들리고 내려올 때 숙인다)
    const pitchWant = st.grounded ? g.pitch : P.airPitch * atan2(st.vy, Math.max(2, Math.abs(st.speed))), rollWant = st.grounded ? g.roll : 0;
    st.pitch += (pitchWant - st.pitch) * tk; st.roll += (rollWant - st.roll) * tk;
    return st;
  }

  const save = () => ({ ...state });
  const load = saved => { Object.assign(state, saved); return state; };
  // 밖에서 주는 가속. 'start' = 출발 신호에 맞춰 밟았을 때(메인이 부른다). 줬으면 true.
  function grant(kind) {
    if (kind !== 'start' || !(P.startBoostTime > 0)) return false;
    if (state.boost >= P.startBoostTime) return false;                 // 더 긴 가속이 이미 돌고 있으면 그대로 둔다
    state.boost = P.startBoostTime; state.boostKind = 'start'; state.boostStarted = true;
    return true;
  }

  reset();
  return { state, reset, step, save, load, grant, params: P, setBody, get body() { return body; } };
}
