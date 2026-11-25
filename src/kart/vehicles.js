// 차량 모델 — Blender 로 지은 glb(assets/vehicles/, 약속 3.16)를 카트 모델(model.js)과 같은 약속으로 쓴다.
//   await loadVehicles(THREE);                       한 번 불러 둔다(manifest + 게임의 차 목록 CARS 가 쓰는 glb 만). VEHICLES 가 채워진다.
//     모양을 보려면 dev/vehicles.html(manifest 의 차 전부). 장난감 차량 일곱 · 시내버스 · 나는 독수리는 지웠다(2026-11-25 정리).
//   const car = createVehicleModel(THREE, 'formula_real', { colour: '#1f4fb4' });   → { group, update(view, dt), materials, stats, dispose() } (없는 id 면 null)
// 원점 = 네 바퀴 가운데의 지면, 앞 = 로컬 +z, 왼쪽 = 로컬 +x. 메인은 group 의 위치와 rotation.y 만 정한다(지면 기울기 · 쏠림은 안에서).
// 움직임은 model.js 의 것을 줄여 옮겼다: 바퀴 굴림 · 앞바퀴 조향 · 핸들 · 운전자의 기울임 · 차체 쏠림 · 착지 출렁임 · 차별 부스터(배기구·바퀴·날개 끝).
// 야간의 등은 원본 light 재질에 구운 정점 색(앞·뒤·경광등)을 사용한다.
import { JETS, makeTwinFlames, makeStyledBoost } from './model.js';
import { boostOrigins, boostStyleOf, getBoostLook } from './boost-style.js';
import { CARS } from './karts.js';

const BASE = new URL('../../assets/vehicles/', import.meta.url);
const MAX_STEER = 0.59;
const LIFELIKE_DRIVERS = new Set(['racekart', 'formula_real', 'golfcart_real', 'forklift_real', 'shoppingcart_real']);   // 실사 운전자를 태운 차(2026-11-23 시안)
// 두 바퀴(2026-11-24 시안 — 타 보기 ?try=bike): 코너에서 온몸(차 · 운전자)이 눕는다. 보이는 모양뿐이다 — 주행 계산(physics.js)은 그대로.
//   lean · drift: 보통 코너 · 드리프트의 최대 눕기(rad). 옆 가속도로 눕는다(atan(옆 가속 / 중력) — 실제 두 바퀴가 눕는 각).
//   steer: 핸들이 도는 몫(다른 차의 조향 각에 곱한다 — 손은 차체에 붙어 있어 크게 돌리면 손잡이에서 뜬다. 실제로도 빠를 때는 핸들을 조금만 돌리고 몸을 눕힌다).
//   tyre: 타이어 단면의 반지름(m) — 눕힐 때 접지점이 둥근 타이어를 따라 옮겨 가므로 그만큼 든다(땅을 안 뚫게). torso: 운전자 허리가 따로 더 숙이는 몫(다른 차의 기울임에 곱한다).
//   rise · relax: 눕는 데 · 일어서는 데 걸리는 시간(s). 공중에서는 relax 로 천천히 선다.
//   hang(레이싱 오토바이 — 행오프): 누운 만큼(눕기 / lean, −1 ~ 1) 운전자 몸통(torso 마디)을 코너 안쪽으로 shift m 옮기고 drop m 낮추고 roll rad 더 눕힌다.
//     안쪽 다리(마디 legL · legR — 엉덩관절이 축)는 엉덩관절 → 발목 축(legAxis — 왼다리의 방향, 오른다리는 x 를 뒤집는다)으로 knee rad 돌려 무릎을 내민다(발은 발판에 남는다).
export const TWO_WHEEL = {
  // pedal(자전거 페달 굴리기, 2026-11-24 사용자 "자전거 페달 굴리기 진행"): 안장에 앉아 밟는 동안(view.throttle — 없으면 가속 중인지로 어림) 크랭크가 돈다.
  //   rpm 평소 분당 바퀴 수(시속 100 km 에 바퀴에 맞추면 다리가 미친 듯이 돌아서 묶는다 — 느릴 때는 그보다 덜) · boostRpm 부스터 동안 · rise · fall 따라붙는 시간(s)
  //   park 이 빠르기(rad/s) 아래로 떨어진 채 떼고 있으면 가까운 앞쪽 수평 자리(페달 둘이 수평)에서 멈춘다(프리휠) · crawl 그때 마저 도는 빠르기 · calm 움직임 줄이기면 곱하는 몫.
  //   다리는 두 마디 IK(엉덩관절 · 허벅지 · 정강이 길이로 무릎을 풀어 발 앞꿈치를 페달 윗면에) — 마디 crank · pedalL/R(빈 마디) · thighL/R · shinL/R · ballL/R(빈 마디)를 glb 에서 읽는다.
  bicycle_real: { lean: 0.5, drift: 0.62, steer: 0.22, tyre: 0.023, torso: 0.3, rise: 0.16, relax: 0.35,
    pedal: { rpm: 100, boostRpm: 200, rise: 0.45, fall: 0.6, park: 1.6, crawl: 1.1, calm: 0.5 } },
  // 레이싱 오토바이(2026-11-24 — 타 보기 ?try=bike, 그 전의 배달 스쿠터를 바꿈): 더 깊이 눕는다. tyre 는 앞 · 뒤 타이어 단면 반지름(0.06 · 0.09)의 가운데 —
  //   두 바퀴가 한 몸이라 앞은 0.45 cm 뜨고 뒤는 0.45 cm 눌린다(검증/two-wheel.test 가 잰다).
  racebike_real: { lean: 0.72, drift: 0.82, steer: 0.18, tyre: 0.075, torso: 0.25, rise: 0.14, relax: 0.35,
    hang: { shift: 0.06, drop: 0.035, roll: 0.18, knee: 0.45, legAxis: [0.149, -0.985, -0.089] } },
};
const GRAVITY = 9.81;
const store = new Map();   // id → { def, scene }
let loading = null;
export const VEHICLES = [];   // 불러온 차량의 제원(manifest 의 줄) — loadVehicles 가 끝나면 채워진다
export const hasVehicle = id => store.has(id);
export function loadVehicles(THREE) {
  if (!loading) loading = (async () => {
    const [{ GLTFLoader }, manifest] = await Promise.all([
      import('../../bts/vendor/model-assets/GLTFLoader.js'),
      fetch(new URL('manifest.json', BASE)).then(r => { if (!r.ok) throw new Error('차량 목록을 못 읽음 ' + r.status); return r.json(); }),
    ]);
    const loader = new GLTFLoader();
    const used = new Set(CARS.map(c => c.vehicle).filter(Boolean));   // 게임이 쓰는 차량만(manifest 는 그대로 둔다)
    await Promise.all(manifest.vehicles.filter(def => used.has(def.id)).map(async def => { const gltf = await loader.loadAsync(new URL(def.file, BASE).href); store.set(def.id, { def, scene: gltf.scene }); }));
    VEHICLES.length = 0; VEHICLES.push(...manifest.vehicles.filter(def => store.has(def.id)));
    return VEHICLES;
  })();
  return loading;
}

// boostLook=now와 미등록 차는 2차 모델 경로를 그대로 쓴다. 내 차의 2차 보정은 effects.js가 맡는다.
export function makeVehicleBoost(THREE, def, { look = getBoostLook() } = {}) {
  const spec = boostStyleOf(def.id, look), origins = boostOrigins(def, spec);
  if (spec.family !== 'legacy') return { ...makeStyledBoost(THREE, spec, origins, look, (def.size?.width || 0) / 2), origins, shape: spec.shape };
  const jet = makeTwinFlames(THREE, origins.map(p => p[0]));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(jet.geometry, material);
  mesh.name = 'flames'; mesh.position.set(0, origins[0][1], origins[0][2] - .02);
  mesh.visible = false;
  let time = 0, burst = 0, previousKind = '';
  function update(view, dt, calm, ghost) {
    time += dt;
    const wasOn = mesh.visible;
    mesh.visible = view.boost > 0 && !ghost;
    if (!mesh.visible) { mesh.scale.z = 0; return; }
    const kind = Object.hasOwn(JETS, view.boostKind) ? view.boostKind : 'item';
    if (!wasOn || kind !== previousKind) burst = 1;
    if (kind !== previousKind) { jet.setKind(kind); previousKind = kind; }
    burst *= Math.exp(-dt / .16);
    const pulse = .067 * Math.sin(time * 39) + .033 * Math.sin(time * 67);
    mesh.scale.z = JETS[kind].length * (1 + pulse * (calm ? .1 : 1) + (calm ? 0 : .55 * burst));
  }
  return { mesh, update, origins, shape: spec.shape, dispose() { jet.geometry.dispose(); material.dispose(); } };
}

// 자전거 페달 굴리기 — 크랭크 각(rad, rotation.x — 앞으로 밟으면 늘어난다)과 두 마디 IK. state: { angle, speed(rad/s), rpm, pushing }.
//   쉬는 자세(각 0 — 페달 수평, 왼쪽이 앞)에서 허벅지 · 정강이의 방향과 길이, 발 앞꿈치(ball)와 페달 가운데의 차이를 읽고,
//   화면마다 페달 가운데 + 그 차이를 앞꿈치 목표로 무릎을 푼다. 무릎은 쉬는 자세의 굽는 쪽(앞 · 조금 바깥)으로 굽는다.
function pedalRig(THREE, find, P) {
  const crank = find('crank'), sides = ['L', 'R'].map(e => [find('thigh' + e), find('shin' + e), find('ball' + e), find('pedal' + e)]);
  if (!crank || sides.some(n => n.some(x => !x))) return null;
  const V = () => new THREE.Vector3(), legs = sides.map(([thigh, shin, ball, pedalNode]) => {
    const H = thigh.position.clone(), K = H.clone().add(shin.position), B = K.clone().add(ball.position), Pc = crank.position.clone().add(pedalNode.position);
    const t0 = K.clone().sub(H), s0 = B.clone().sub(K), n0 = B.clone().sub(H).normalize();
    return { thigh, shin, H, t0: t0.clone().normalize(), s0: s0.clone().normalize(), L1: t0.length(), L2: s0.length(), local: pedalNode.position.clone(), off: B.clone().sub(Pc),
      hint: t0.clone().sub(n0.clone().multiplyScalar(t0.dot(n0))).normalize() };
  });
  const state = { angle: 0, speed: 0, rpm: 0, pushing: false }, TAU = Math.PI * 2, PI = Math.PI;
  const target = V(), d = V(), n = V(), perp = V(), knee = V(), dir = V(), q = new THREE.Quaternion(), qi = new THREE.Quaternion();
  const ease = (cur, want, tau, dt) => cur + (want - cur) * (1 - Math.exp(-dt / tau));
  function pose() {
    crank.rotation.x = state.angle;
    const c = Math.cos(state.angle), s = Math.sin(state.angle);
    for (const g of legs) {
      // 페달 가운데(크랭크와 같이 x 축으로 돈다) + 앞꿈치와의 차이(페달은 늘 수평이라 차이가 그대로다) = 앞꿈치 목표
      target.set(crank.position.x + g.local.x, crank.position.y + g.local.y * c - g.local.z * s, crank.position.z + g.local.y * s + g.local.z * c).add(g.off);
      d.subVectors(target, g.H); const L = Math.min(Math.max(d.length(), Math.abs(g.L1 - g.L2) + 1e-4), g.L1 + g.L2 - 1e-4); n.copy(d).normalize();
      perp.copy(g.hint).addScaledVector(n, -g.hint.dot(n)).normalize();
      const a = (g.L1 * g.L1 - g.L2 * g.L2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, g.L1 * g.L1 - a * a));
      knee.copy(g.H).addScaledVector(n, a).addScaledVector(perp, h);
      g.thigh.quaternion.setFromUnitVectors(g.t0, dir.subVectors(knee, g.H).normalize());
      qi.copy(g.thigh.quaternion).invert(); dir.subVectors(target, knee).applyQuaternion(qi).normalize();
      g.shin.quaternion.setFromUnitVectors(g.s0, dir);
    }
  }
  function update(view, speed, boost, acc, calm, dt) {
    // 밟고 있는가: 게임이 주는 가속 페달(view.throttle), 없으면(상대 · 배경 주행) 앞으로 달리며 크게 줄지 않는 동안.
    const pushing = speed > 0.2 && (view.throttle !== undefined ? +view.throttle > 0.05 : acc > -1.5);
    let want = 0;
    if (pushing) want = (boost > 0 ? P.boostRpm : P.rpm) * Math.min(1, 0.35 + speed / 8) * (calm ? P.calm : 1);
    state.speed = ease(state.speed, want * TAU / 60, want * TAU / 60 > state.speed ? P.rise : P.fall, dt);
    state.pushing = pushing;
    if (pushing) state.angle += state.speed * dt;
    else {
      // 뗐다: 프리휠 — 느려지면 앞쪽의 가까운 수평 자리(π 의 배수)까지 천천히 마저 돌고 멈춘다.
      const flat = Math.abs(state.angle - Math.round(state.angle / PI) * PI) < 1e-7;
      if (!(flat && state.speed <= P.park)) {
        const next = Math.ceil(state.angle / PI - 1e-7) * PI, v = Math.max(state.speed, P.crawl);
        if (state.speed <= P.park && state.angle + v * dt >= next) { state.angle = next; state.speed = 0; }
        else state.angle += v * dt;
      } else state.speed = 0;
    }
    if (state.angle >= TAU) state.angle -= TAU;
    state.rpm = state.speed * 60 / TAU;
    pose();
  }
  return { update, state, pose };
}

export function createVehicleModel(THREE, id, { colour = '#1f4fb4', night = false } = {}) {
  const entry = store.get(id); if (!entry) return null;
  const { def } = entry, motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const group = new THREE.Group(); group.name = 'kart';
  const tilt = new THREE.Group(), sprung = new THREE.Group(); sprung.name = 'chassis'; group.add(tilt); tilt.add(sprung);
  const model = entry.scene.clone(true); sprung.add(model);   // 기하는 원본과 같이 쓰고, 재질만 차마다 복제한다(색 · 유령의 반투명)
  const mats = {};
  model.traverse(node => { if (!node.isMesh) return; const name = node.material.name || 'fixed'; node.material = mats[name] || (mats[name] = node.material.clone()); node.castShadow = true; node.receiveShadow = false; });
  if (mats.paint) mats.paint.color.set(colour);
  const lenses = night ? mats.light : null;
  if (lenses) {
    lenses.side = THREE.FrontSide;
    lenses.emissive.set(0xffffff);
    lenses.emissiveIntensity = 6.8;
  }
  const find = name => model.getObjectByName(name) || null;
  const steers = [find('steerFL'), find('steerFR')].filter(Boolean), fronts = [find('wheelFL'), find('wheelFR')].filter(Boolean), rears = [find('wheelRL'), find('wheelRR')].filter(Boolean);
  // 조향 바퀴가 차 뒤에 있으면(실사 지게차) 같은 쪽으로 돌려면 바퀴를 반대로 꺾는다.
  const steerSign = steers.map(s => (s.position.z < 0 ? -1 : 1));
  // 실사 운전자는 코너에서 덜 기운다(사람 비율이라 크게 기울면 어색하다 — 0.38 rad → 약 0.13).
  const two = TWO_WHEEL[id] || null;
  const leanScale = two ? two.torso : LIFELIKE_DRIVERS.has(id) ? 0.35 : 1;
  const wheel = find('steeringWheel'), torso = find('torso'), head = find('head');
  const base = { wheel: wheel?.rotation.z || 0, torso: torso?.rotation.z || 0, head: head?.rotation.z || 0, headYaw: head?.rotation.y || 0, torsoX: torso?.rotation.x || 0 };
  // 행오프(두 바퀴 중 hang 이 있는 차만): 몸통의 쉬는 자리 · 다리 마디 둘과 그 돌림 축
  const hang = two?.hang && torso ? two.hang : null, legs = hang ? [find('legL'), find('legR')] : [];
  const legAxes = legs.map((leg, i) => leg && new THREE.Vector3(hang.legAxis[0] * (i ? -1 : 1), hang.legAxis[1], hang.legAxis[2]).normalize());
  if (hang) { base.tx = torso.position.x; base.ty = torso.position.y; }
  // 페달 굴리기(두 바퀴 중 pedal 이 있는 차 · 마디가 다 있을 때만): 쉬는 자세(크랭크 수평)의 자리 · 길이를 한 번 읽어 둔다(차체 기준).
  const pedal = two?.pedal ? pedalRig(THREE, find, two.pedal) : null;
  const rF = def.wheels?.frontRadius || 0.18, rR = def.wheels?.rearRadius || 0.2;
  const booster = makeVehicleBoost(THREE, def);
  group.userData.vehicleId = def.id;
  group.userData.boostShape = booster.shape;
  group.userData.boostOrigins = booster.origins;
  group.userData.boostHalfWidth = (def.size?.width || 0) / 2;   // 내 차의 입자도 차체 폭 안에서 태어난다(effects.js)
  sprung.add(booster.mesh);

  const st = { spinF: 0, spinR: 0, yaw: 0, prevSpeed: 0, acc: 0, lat: 0, roll: 0, pitch: 0, lean: 0, leanVelocity: 0, headYaw: 0, bobY: 0, bobV: 0, wasGrounded: true, air: 0, tiltX: 0, tiltZ: 0, bank: 0, first: true };
  const sm = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau)), clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  function update(view = {}, dt = 1 / 60) {
    dt = clamp(dt || 0, 0, 0.1);
    const speed = +view.speed || 0, steer = clamp(+view.steer || 0, -1, 1), slip = +view.slip || 0, drifting = !!view.drifting, boost = +view.boost || 0, grounded = view.grounded !== false;
    const calm = !!motion?.matches, scale = calm ? 0.42 : 1, v = Math.abs(speed);
    if (st.first) { st.prevSpeed = speed; st.first = false; }
    const accRaw = dt > 0 ? (speed - st.prevSpeed) / dt : 0; st.prevSpeed = speed; st.acc = sm(st.acc, clamp(accRaw, -14, 10), 0.12, dt);
    if (lenses) lenses.emissiveIntensity = (view.braking ?? (st.acc < -3 && v > 0.5)) ? 13 : 6.8;
    let kappa = steer / (3 + 0.05 * v * v);
    if (drifting) { const d = slip !== 0 ? -Math.sign(slip) : Math.sign(steer); kappa = d * (0.75 + 0.25 * d * steer) / (3.3 + 0.04 * v * v); }
    st.lat = sm(st.lat, grounded ? clamp(v * v * kappa * Math.sign(speed || 1), -14, 14) : 0, 0.1, dt);
    // 바퀴: 굴림 · 조향(드리프트 중에는 미끄러지는 쪽으로 맞춘다)
    st.spinF = (st.spinF + speed / rF * dt * (grounded ? 1 : 0.6)) % (2 * Math.PI); st.spinR = (st.spinR + speed * (drifting ? 1.12 : 1) / rR * dt) % (2 * Math.PI);
    const counter = clamp(-slip * 0.9, -0.48, 0.48), assist = drifting ? 1 : clamp((Math.abs(slip) - 0.12) / 0.2, 0, 1);
    st.yaw = sm(st.yaw, (-steer * MAX_STEER + counter * assist * (1 - Math.abs(steer))) * (two ? two.steer : 1), 0.055, dt);
    steers.forEach((s, i) => { s.rotation.y = st.yaw * steerSign[i]; });
    for (const w of fronts) w.rotation.x = st.spinF;
    for (const w of rears) w.rotation.x = st.spinR;
    if (wheel) wheel.rotation.z = base.wheel - st.yaw / MAX_STEER * 1.18;
    // 착지 출렁임(임계 감쇠) · 차체 쏠림 · 지면 기울기
    if (!grounded) st.air += dt; else { if (!st.wasGrounded && st.air > 0.08) st.bobV -= clamp(0.25 + st.air * 0.9, 0, 1.1); st.air = 0; }
    st.wasGrounded = grounded;
    const decay = Math.exp(-16 * dt), bounce = st.bobV + 16 * st.bobY; st.bobY = (st.bobY + bounce * dt) * decay; st.bobV = (st.bobV - 16 * bounce * dt) * decay;
    st.roll = sm(st.roll, clamp(-st.lat * 0.0036, -0.052, 0.052) + (drifting ? -Math.sign(st.lat) * 0.022 : 0), 0.095, dt);
    st.pitch = sm(st.pitch, clamp(-st.acc * 0.0035, -0.035, 0.03) + (boost > 0 ? -0.022 : 0) + (grounded ? 0 : -0.03), 0.1, dt);
    if (two) {
      // 두 바퀴: 차체 쏠림(바깥으로) 대신 온몸이 코너 안쪽으로 눕는다. 오른쪽으로 돌면(lat > 0) +z 회전 = 오른쪽으로 눕는다.
      // 원점(두 접지점을 잇는 선)을 축으로 돌리므로 두 바퀴는 땅에 남는다. 타이어가 둥근 만큼(tyre · (1 − cos)) 들어 땅을 안 뚫게 한다.
      const cap = drifting ? two.drift : two.lean, want = grounded ? clamp(Math.atan2(st.lat * (drifting ? 1.2 : 1), GRAVITY), -cap, cap) : 0;
      st.bank = sm(st.bank, want, grounded ? two.rise : two.relax, dt);
      const bank = st.bank * (calm ? 0.6 : 1);
      sprung.position.y = st.bobY * scale + two.tyre * (1 - Math.cos(bank)); sprung.rotation.set(st.pitch * scale, 0, bank);
    } else { sprung.position.y = st.bobY * scale; sprung.rotation.set(st.pitch * scale, 0, st.roll * scale); }
    st.tiltX = sm(st.tiltX, -(+view.pitch || 0), 0.05, dt); st.tiltZ = sm(st.tiltZ, -(+view.roll || 0), 0.05, dt); tilt.rotation.set(st.tiltX, 0, st.tiltZ);
    // 운전자: 허리와 목이 코너 안쪽으로(드리프트 때 더). 놓으면 스프링처럼 돌아온다
    const slide = drifting ? clamp(-slip / 0.32, -1, 1) : 0, direction = steer + slide * (1 - Math.abs(steer)), leanTarget = direction * (drifting ? 0.38 : 0.24) * scale * leanScale;
    const leanError = st.lean - leanTarget, impulse = st.leanVelocity + 15 * leanError, leanDecay = Math.exp(-15 * dt);
    st.lean = leanTarget + (leanError + impulse * dt) * leanDecay; st.leanVelocity = (st.leanVelocity - 15 * impulse * dt) * leanDecay;
    st.headYaw = sm(st.headYaw, -direction * (drifting ? 0.32 : 0.18) * scale * leanScale, 0.13, dt);
    if (torso) torso.rotation.z = base.torso + st.lean;
    if (pedal) pedal.update(view, speed, boost, st.acc, calm, dt);
    if (hang) {
      const h = clamp(st.bank / two.lean, -1, 1) * (calm ? 0.6 : 1);   // > 0: 오른쪽 코너(오른쪽이 안쪽)
      torso.position.x = base.tx - hang.shift * h; torso.position.y = base.ty - hang.drop * Math.abs(h); torso.rotation.z += hang.roll * h;
      // 안쪽 다리만 무릎을 내민다: 왼다리는 왼쪽 코너(h < 0)에서, 오른다리는 오른쪽 코너에서. 바깥(±x)으로 가는 돌림 방향은 시험이 본다.
      if (legs[0]) legs[0].quaternion.setFromAxisAngle(legAxes[0], -hang.knee * Math.max(0, -h));
      if (legs[1]) legs[1].quaternion.setFromAxisAngle(legAxes[1], hang.knee * Math.max(0, h));
    }
    // 두 바퀴의 운전자는 몸이 누워도 눈을 수평에 가깝게 둔다(머리를 눕는 반대로 조금 세운다).
    if (head) { head.rotation.z = base.head + (two ? -st.bank * 0.35 : st.lean * 0.7); head.rotation.y = base.headYaw + st.headYaw; }
    // 불꽃(유령 — 재질을 반투명으로 바꿔 쓴 것 — 에서는 안 보인다)
    const ghost = !!mats.paint && mats.paint.transparent && mats.paint.opacity < 1;
    booster.update(view, dt, calm, ghost);
  }
  update({ speed: 0 }, 0);
  return {
    group, update, materials: mats, vehicle: def.id, twoWheel: !!two, get bank() { return st.bank; }, pedal: pedal ? pedal.state : null,
    headlightMount: night ? { frame: tilt, bumperZ: def.frontCorners[0][1] } : null,
    stats: { triangles: def.triangles ?? 0, meshes: 0, materials: Object.keys(mats).length, drawCalls: (def.drawCalls ?? 0) + 1 },
    dispose() { for (const material of Object.values(mats)) material.dispose(); booster.dispose(); group.removeFromParent(); },
  };
}
