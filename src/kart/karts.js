// 카트 종류 — 이름과 주행 감각. 모양은 model.js 가 같은 id(type)로 그린다.
// tune 은 등급(classes.js)을 곱한 뒤의 값에 다시 곱하는 배율이다(없는 값은 1). 기본 카트는 아무것도 곱하지 않는다 — 그 전의 게임과 같다.
//   accel · boostAccel        가속
//   maxSpeed · boostMaxSpeed  최고 속도
//   turnRadiusPerSpeed2       속도가 붙었을 때의 회전반경(작을수록 날카롭게 돈다)
//   steerRiseTime             방향키를 눌렀을 때 조향이 따라오는 시간(작을수록 민감하다)
//   slideYawIn                드리프트 중 차체가 도는 빠르기 · slideDrag · slideDragBase 미끄러지며 잃는 속도 · gaugeRate 게이지가 차는 빠르기
export const KARTS = [
  { id: 'balance', name: '기본', tune: {} },
  { id: 'sprint', name: '가속', tune: { accel: 1.22, boostAccel: 1.15, maxSpeed: 0.97, boostMaxSpeed: 0.97, turnRadiusPerSpeed2: 0.9, steerRiseTime: 0.8 } },
  { id: 'cruise', name: '고속', tune: { maxSpeed: 1.04, boostMaxSpeed: 1.04, accel: 0.85, boostAccel: 0.92, turnRadiusPerSpeed2: 1.08, steerRiseTime: 1.15 } },
  { id: 'drift', name: '드리프트', tune: { slideYawIn: 1.15, slideDrag: 0.8, slideDragBase: 0.8, gaugeRate: 1.2, maxSpeed: 0.985, boostMaxSpeed: 0.985, accel: 0.97 } },
];
export const DEFAULT_KART = 'balance';
export const kartOf = id => KARTS.find(k => k.id === id) || KARTS.find(k => k.id === DEFAULT_KART);
// params(등급을 곱한 값)에 카트의 배율을 곱한 새 묶음
export function applyKart(params, id) {
  const tune = kartOf(id).tune, out = { ...params };
  for (const key of Object.keys(tune)) if (Number.isFinite(out[key])) out[key] = +(out[key] * tune[key]).toFixed(4);
  return out;
}

// 차 — 고르는 순서, 기준 감각, 몸 크기와 무게. classes.js 의 carParams 가 기준 감각에 차별 배율을 곱한다.
//   kart: 배율을 곱하기 전의 감각(KARTS 의 id). 타임어택의 개인 기록 · 유령은 차 id별로 저장한다.
//   vehicle: 모양이 차량 모델(assets/vehicles/<id>.glb)이면 그 id. 없으면 그 종류의 카트 모양(model.js).
//   weight: 무게(몸싸움) — 카트끼리 부딪혔을 때 덜 밀리는 정도(1 = 기본 카트. race.js 의 bump). 주행 값 · 기록과는 무관하다(차마다 따로다 — 사용자 2026-11-21 "차별로 몸싸움 스펙도 구분").
//     값은 메인이 차의 생김새로 정했다(사용자 확인 전): 장보기 카트가 가장 가볍고 청소차가 가장 무겁다.
// 기존 차의 기준 감각·몸 크기·차별 배율이 바뀌면 TRIAL_VER와 검증/car-bodies.test.mjs의 표도 갱신한다.
// 2026-11-23 사용자: 실사 차로 바꾸고, "기본 가속 고속 드리프트는 기본 말고는 없애도" · "장난감차는 일단 게임에서는 없애고 모양 자체는 남겨놓자"
//   → 카트는 실사 레이싱 카트 하나(기본 감각). 장난감 차량 일곱(formula · supercar · shoppingcart · golfcart · forklift · truck · garbagetruck)과
//     코드로 지은 카트 넷(model.js)은 목록에서 뺐다(장난감 일곱의 glb · 스크립트는 2026-11-25 정리에서 지웠다 — model.js 는 남았다). 주행 감각 넷(KARTS)은 차들이 계속 나눠 쓴다.
//   size: 바닥 크기 [길이, 폭](m, 운전자 · 거울 포함 — assets/vehicles/manifest.json 의 size 와 같다). shift: 그 네모의 가운데가 원점(네 바퀴 가운데)보다 앞으로 몇 m(지게차는 앞의 포크, 트럭 · 청소차는 뒤가 길다 — glb 의 앞뒤 끝에서 잼).
//     주행 계산의 벽 · 몸싸움 · 출발 자리가 이 크기를 쓴다(footprintOf). 2026-11-23 사용자 "차 크기는 지금보다 큰게 좀 나은 것 같아" → 실제 크기.
export const CARS = [
  { id: 'racekart', name: '레이싱 카트', kart: 'balance', vehicle: 'racekart', weight: 1, size: [1.82, 1.40] },
  { id: 'formula_real', name: '포뮬러', kart: 'cruise', vehicle: 'formula_real', weight: 0.85, size: [4.90, 1.85], shift: 0.03 },
  { id: 'sedan', name: '스포츠 세단', kart: 'balance', vehicle: 'sedan', weight: 1.25, size: [4.87, 1.99] },
  { id: 'gt', name: 'GT', kart: 'cruise', vehicle: 'gt', weight: 1.2, size: [4.60, 2.02] },
  { id: 'supercar_real', name: '슈퍼카', kart: 'balance', vehicle: 'supercar_real', weight: 1.15, size: [4.55, 2.00] },
  { id: 'golfcart_real', name: '골프 카트', kart: 'sprint', vehicle: 'golfcart_real', weight: 0.85, size: [2.40, 1.20] },
  { id: 'forklift_real', name: '지게차', kart: 'sprint', vehicle: 'forklift_real', weight: 1.4, size: [3.42, 1.15], shift: 0.47 },
  { id: 'shoppingcart_real', name: '장보기 카트', kart: 'drift', vehicle: 'shoppingcart_real', weight: 0.7, size: [1.06, 0.60], shift: -0.02 },
  // 자전거(2026-11-24 밤 사용자 "자전거: 넣기" — 시안 때의 값 그대로: 감각 · 무게는 작업자가 생김새로 붙였다). 코너에서 온몸이 눕는 것은 vehicles.js 의 TWO_WHEEL(보이는 모양만).
  //   부딪힘 폭은 차체(장보기 카트처럼 좁게) — 핸들(span 0.65)은 부딪힘에서 뺀다.
  { id: 'bicycle_real', name: '자전거', kart: 'sprint', vehicle: 'bicycle_real', weight: 0.75, size: [1.83, 0.60], span: 0.65 },   // 무게: 시안 0.6 → 0.75(장보기 카트 0.7 이 가장 가볍다는 정한 것을 지킨다 — race.test)
  // 레이싱 오토바이(2026-11-24 밤 사용자 "오토바이: 레이싱 오토바이면 좋겠어" → "레이싱 오토바이: 넣기"): 풀 페어링 레이스 바이크 · 엎드린 운전자 · 코너에서 깊이 눕고 행오프(vehicles.js 의 TWO_WHEEL — 보이는 모양만).
  //   감각(고속형) · 무게(0.9)는 작업자의 제안값(사용자 확인 전). 부딪힘 폭은 차체 — 클립온 핸들(span 0.70)은 뺀다.
  { id: 'racebike_real', name: '오토바이', kart: 'cruise', vehicle: 'racebike_real', weight: 0.9, size: [2.05, 0.56], span: 0.70, shift: -0.01 },
  { id: 'truck_real', name: '트럭', kart: 'cruise', vehicle: 'truck_real', weight: 1.5, size: [5.10, 1.96], shift: -0.21 },
  { id: 'garbagetruck_real', name: '청소차', kart: 'balance', vehicle: 'garbagetruck_real', weight: 1.6, size: [6.19, 2.05], shift: -0.30 },
  // 마을버스(2026-11-24 사용자 "버스는 작은게 나은 것 같아. 큰거는 너무 크다" — 11 m 시내버스는 출발 줄 · 피트 통로에 안 들어가 뺐다). 7.1 m 는 출발 줄(26 m 안에 여덟 대)에 아슬하게 든다:
  //   **이 자리(청소차 바로 뒤)여야 한다** — 트럭 뒤 · 택시 뒤 · 맨 끝에 두면 긴 차가 한 줄에 몰려 0.1 ~ 1.3 m 넘는다(footprint.test 의 출발 자리 시험). 차를 더 넣을 때 그 시험부터 본다.
  { id: 'minibus_real', name: '마을버스', kart: 'balance', vehicle: 'minibus_real', weight: 1.55, size: [7.10, 2.02] },
  // 2026-11-24 사용자: "차종중에 시내버스, 택시, 독수리도 넣으면 재밌지 않을까 ㅋㅋ 독수리는 좀 재미요소 병맛 느낌으로 아무래도 연세대다보니까."
  //   → 택시 · 독수리상(돌 받침대에 바퀴를 단 청동상 — 날개 폭이 몸길이보다 넓어 부딪힘 모양은 원 하나다: 앞뒤로 (폭 − 길이) / 2 만큼 더 나간다).
  //   이름 · 감각 · 무게는 메인이 생김새로 붙였다(사용자 확인 전 — 바꾸려면 name · kart · weight 만 고치면 된다).
  //   시내버스(11 m × 2.82 m)는 경주의 출발 줄(출발선 뒤 26 m 안에 여덟 대)과 피트 통로에 안 들어가 마을버스로 갔다. 시내버스 · 나는 독수리 모델은 2026-11-25 정리에서 지웠다.
  { id: 'taxi_real', name: '택시', kart: 'sprint', vehicle: 'taxi_real', weight: 1.22, size: [4.76, 2.07] },
  // 독수리상(2026-11-24 다시 지음 — 연세대 독수리상의 자세): 부딪힘은 수레 · 기둥 · 몸의 폭(1.40 m 아래에 있는 것은 모두 ±0.70 m 안). 활짝 편 날개(span 2.41 m)는 1.75 m 위에 있어 부딪힘에서 뺀다 — 옆 차의 지붕 위로 지나간다.
  { id: 'eagle_statue', name: '독수리상', kart: 'balance', vehicle: 'eagle_statue', weight: 1.50, size: [1.33, 1.40], span: 2.41 },
];
export const DEFAULT_CAR = 'gt';   // 2026-11-23 사용자가 로비 시안에서 '첫 화면 차 GT'를 고름(처음 온 사람의 차). 그 전에는 racekart
export const carOf = id => CARS.find(c => c.id === id) || CARS.find(c => c.id === DEFAULT_CAR);
// 차 고르기 화면의 항목. 칸 수는 classes.js 의 carStats 가 현재 등급·세기에서 계산한다.
export const STAT_NAMES = ['가속', '최고 속도', '핸들', '드리프트'];
// 몸싸움 능력치(막대 다섯 칸): 무게를 칸 수로 — 0.75 아래 1 · 0.9 까지 2 · 1.05 까지 3 · 1.25 까지 4 · 그 위 5
export const BODY_NAME = '몸싸움';
export const bodyStat = car => { const w = car?.weight ?? 1; return w < 0.75 ? 1 : w <= 0.9 ? 2 : w <= 1.05 ? 3 : w <= 1.25 ? 4 : 5; };

// 바닥 크기 → 부딪힘 모양(약속 3.4 · 3.20). 차를 길이 방향으로 늘어선 원 몇 개로 본다(캡슐 꼴): 반지름 = 폭의 반, 양 끝 원의 가운데는 끝에서 반지름의 cover 배 안쪽,
// 원 사이 간격은 반지름 이하(옆면이 원 사이로 덜 패이게). cover 0.75 = 앞뒤 끝을 넘는 몫(0.25 r)과 모서리가 원 밖으로 나가는 몫(√(1 + 0.75²) − 1 = 0.25 r)이 같은 값.
//   → { length, width, shift, radius, offsets(원 가운데의 앞쪽 거리 · 원점 기준), reach(원점에서 가장 먼 원의 바깥까지), front · back(원점에서 앞 · 뒤 범퍼까지) }
export const FOOTPRINT = { cover: 0.75, spacing: 1 };
export function footprintOf(car) {
  const [length, width] = car?.size ?? [1.82, 1.40], shift = car?.shift ?? 0, radius = width / 2;
  const e = Math.max(0, length / 2 - FOOTPRINT.cover * radius), count = e > 1e-9 ? 1 + Math.ceil(2 * e / (FOOTPRINT.spacing * radius) - 1e-9) : 1;
  const offsets = count === 1 ? [shift] : Array.from({ length: count }, (_, i) => +(shift - e + 2 * e * i / (count - 1)).toFixed(4));
  return { length, width, shift, radius, offsets, reach: Math.max(...offsets.map(o => Math.abs(o))) + radius, front: shift + length / 2, back: length / 2 - shift };
}
