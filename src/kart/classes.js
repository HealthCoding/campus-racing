// 속도 등급 — 같은 카트 조정값(params.js)에서 최고속과 가속만 올린 묶음. 시승하면서 어느 쪽이 맞는지 고르려고 둔다.
// 회전반경은 속도의 제곱으로 커지므로, 등급이 높을수록 코너에서 감속하거나 드리프트해야 한다.
import { KART } from './params.js';
import { createKartSim } from './physics.js';
import { applyKart, carOf, DEFAULT_KART } from './karts.js';
import { CAR_FEEL, FEEL_STRENGTH } from './car-feel.js';
export { FEEL_STRENGTH } from './car-feel.js';
export const SPEED_CLASSES = [
  { id: 'normal', name: '보통', maxSpeed: 24 },       // 86 km/h (부스트 106)
  { id: 'fast', name: '빠름', maxSpeed: 28 },         // 101 km/h (부스트 123)
  { id: 'faster', name: '아주 빠름', maxSpeed: 32 },  // 115 km/h (부스트 141)
];
// 2026-11-20 사용자: "지금 좀 너무 느린 느낌이라, 최고 속도로 진행해 보니까 제일 재밌더라" → 한 칸씩 올렸다(그 전 18 · 24 · 28). 그 전의 '아주 빠름'이 지금의 '빠름'(기본)이다.
// 코스 B 가 받는 한계(경주 한 판을 계산으로 돌려 잰 것): 32 m/s 까지는 상대 일곱이 벽에 안 닿는다. 34 는 하늘길 내리막(935 m)과 점프 중(280~300 m)에 닿고, 36 은 여러 곳에서 닿는다.
export const DEFAULT_CLASS = 'faster';   // 2026-11-21 사용자: "속도 자체도 지금 기본을 아주빠름으로" — 그 전의 기본은 'fast'(빠름). 브라우저에 고른 등급이 남아 있으면 그것이 먼저다(main.js 의 CLASS_KEY)
// 등급을 곱하기 전의 기준값(일반 최고속 18 m/s 기준). tuned: 조정판이 고친 값.
export function baseParams(tuned = null) { return { ...KART, ...tuned }; }
// 등급이 곱하는 것: 최고속에 맞춰 가속 · 부스트 · 브레이크 · 미끄럼 저항 · 속도 기준값을 같은 비율로 올린다(잃는 속도의 비율과 손맛이 등급마다 같게).
// kart: 카트 종류(karts.js) — 등급을 곱한 값에 그 카트의 배율을 다시 곱한다. 기본 카트는 그대로다.
export function classParams(id, { base = null, kart = DEFAULT_KART } = {}) {
  const klass = SPEED_CLASSES.find(c => c.id === id) || SPEED_CLASSES.find(c => c.id === DEFAULT_CLASS), B = baseParams(base), k = klass.maxSpeed / B.maxSpeed, up = v => +(v * k).toFixed(3);
  const scaled = { ...B, maxSpeed: klass.maxSpeed, boostMaxSpeed: up(B.boostMaxSpeed), accel: up(B.accel), boostAccel: up(B.boostAccel), brakeDecel: +(B.brakeDecel * Math.max(1, k)).toFixed(3), slideDrag: up(B.slideDrag), slideDragBase: up(B.slideDragBase), slideYawSpeedRef: up(B.slideYawSpeedRef), gaugeFullSpeed: up(B.gaugeFullSpeed) };
  return kart === DEFAULT_KART ? scaled : applyKart(scaled, kart);
}

// 플레이어 차의 주행 값. 몸 크기·무게는 설계의 근거이고, 판에 고정하는 실제 값은 CAR_FEEL이다.
export function carParams(carId, klass, { base = null, strength = FEEL_STRENGTH } = {}) {
  const car = carOf(carId), params = classParams(klass, { base, kart: car.kart });
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1.5, strength)) : FEEL_STRENGTH;
  if (amount === 0) return params;
  for (const [key, scale] of Object.entries(CAR_FEEL[car.id])) {
    if (scale !== 1 && Number.isFinite(params[key])) params[key] = +(params[key] * (1 + (scale - 1) * amount)).toFixed(4);
  }
  return params;
}

// 차고를 열 때만 평지에서 같은 디지털 입력을 준다. 핸들은 최고속에서 진행 방향이 10° 도는 시간,
// 드리프트는 차체가 90° 돌 때까지의 최대 미끄럼각. 차를 추가해도 기존 차의 눈금은 움직이지 않는다.
export function carStats(carId, klass, options = {}) {
  const params = carParams(carId, klass, options), stock = classParams(klass, { base: options.base });
  const sim = createKartSim({ params }), st = sim.state;
  const measure = drift => {
    sim.reset({});
    st.speed = params.maxSpeed;
    let peak = 0;
    for (let tick = 1; tick <= 240; tick++) {
      sim.step({ throttle: 1, steer: 1, drift });
      if (!drift && Math.abs(st.course) >= Math.PI / 18) return tick * params.dt;
      peak = Math.max(peak, Math.abs(st.slip));
      if (drift && Math.abs(st.heading) >= Math.PI / 2) break;
    }
    return drift ? peak * 180 / Math.PI : 240 * params.dt;
  };
  const bars = (value, cuts) => 1 + cuts.filter(cut => value >= cut).length;
  // 같은 등급의 기본형 대비 배율. faster에서 잰 0→100과 최고속의 가운데 무리를 각각 세 칸에 둔다.
  return [
    bars(params.accel / stock.accel, [0.85, 0.92, 1.035, 1.09]),
    bars(params.maxSpeed / stock.maxSpeed, [0.975, 0.985, 1.02, 1.035]),
    bars(-measure(false), [-0.39, -0.35, -0.31, -0.28]),
    bars(measure(true), [28, 36, 43, 50]),
  ];
}

// 차 고르기 화면에서 차 이름 옆에 붙는 성격 한 낱말 — 막대 넷 [가속, 최고 속도, 핸들, 드리프트](carStats)에서 고른 기본 감각 id(KARTS).
//   2026-11-26: 그 전에는 차의 기본 감각(kart)을 그대로 썼다 — 차마다 값이 달라진 뒤로는 막대와 어긋났다(슈퍼카 4 · 5 · 3 · 4 에 '기본형', 지게차 가속 2 에 '가속형').
//   드리프트가 4칸 이상이고 가속 · 최고 속도보다 낮지 않으면 drift · 가속이 4칸 이상이고 최고 속도보다 높으면 sprint · 최고 속도가 4칸 이상이면 cruise · 그 밖은 balance.
export function carKind([accel, top, , drift]) {
  if (drift >= 4 && drift >= accel && drift >= top) return 'drift';
  if (accel >= 4 && accel > top) return 'sprint';
  if (top >= 4) return 'cruise';
  return 'balance';
}
