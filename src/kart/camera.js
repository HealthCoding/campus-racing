// 추격 카메라 — 카트 뒤에서 따라가며, 속도가 붙을수록 시야가 넓어진다. 단위는 미터.
// 약속: docs/구조와_계약.md (방향각: 앞 = (sin h, 0, cos h)).
// 속도감(2026-11-26 사용자 "속도감이 잘 안 느껴진다 … 오토바이는 잘 느껴지긴 해"): 잰 것 — 큰 차는 카메라가 멀고(GT 10.4 m) 좁아서(54°) 차 옆 노면이 오토바이의 3분의 1 빠르기로 흘렀고,
//   모든 차의 카메라가 72 km/h 에서 다 벌어져 그 위(최고속 115 km/h)로는 더 움직이지 않았다(speedForMax 20 m/s 는 최고속이 65 km/h 이던 때의 값).
//   → ① '빠를 때' 끝을 그 차의 최고속에 맞춘다(createChaseCamera 의 topSpeed) ② 큰 차는 빠를수록 가까이 · 낮게 · 넓게(차는 화면에서 그 크기 그대로, 둘레만 벌어진다)
//     ③ 부스트 시야각을 큰 차에도 ④ 부스트 동안 카메라가 조금 처진다(차가 튀어 나간다) ⑤ 최고속을 넘어선 동안(부스트)만 잔떨림(땅에 붙어 있을 때 · 움직임 줄이기면 없음).
//   아스트라의 따로 한 조사(reports/2026-11-26_아스트라_속도감_조사_보고.md)도 같은 원인 · 같은 방향이었다(큰 차 10.4 → 7.6 m · 54 → 63°).
export const CAMERA = {
  distance: [3.3, 4.3],   // 뒤로 떨어진 거리: 서 있을 때 → 최고속 (m)
  height: [1.55, 1.9],    // 카트 위 높이 (m)
  ahead: [2.0, 4.6],      // 바라보는 지점: 카트 앞쪽 거리 (m)
  aimHeight: 0.5,         // 바라보는 지점의 높이 (m). 낮출수록 카트가 화면 위쪽으로 올라온다
  fov: [56, 72],          // 세로 시야각: 서 있을 때 → 최고속 (도). 2026-11-26: [56, 68] 이 72 km/h 에서 끝났다 → 최고속까지 고르게 벌어진다(100 km/h 에서 약 70°)
  boostFov: 14,           // 모아 둔 부스터('item')를 쓰는 동안 더 넓히는 시야각 (도). 최고속 + 부스트 = 86°(그 전의 68 + 18 과 같다)
  boostFovSmall: 0.45,    // 짧은 가속('kick') · 출발 가속('start') 은 boostFov 의 이만큼
  boostFovIn: 0.18,       // 부스트 시야각이 넓어질 때 따라붙는 시간 (초) — 빠르게
  boostFovOut: 0.55,      // 부스트가 끝나 돌아올 때 따라붙는 시간 (초) — 천천히
  portraitFov: 8,         // 세로 화면에서 더 넓히는 시야각 (도)
  portraitBack: 1.5,      // 세로 화면에서 거리 · 높이를 이만큼 곱한다(좌우가 좁아 카트가 너무 커 보이므로)
  portraitAim: 0.35,      // 세로 화면에서 바라보는 지점 높이 (m)
  portraitAhead: 0.35,    // 세로 화면에서 바라보는 지점의 앞쪽 거리 배율. 작을수록 카트가 화면 가운데로(아래 터치 단추 위로) 올라온다
  headingMix: 0.5,        // 드리프트 때 차체가 보는 쪽으로 카메라를 얼마나 돌릴지 (0 = 진행 방향만)
  angleTime: 0.2,         // 카메라 방향이 따라붙는 시간 (초)
  heightTime: 0.12,       // 높이가 따라붙는 시간 (초)
  airHeightTime: 0.28,    // 떠 있는 동안 높이가 따라붙는 시간 (초) — 늦게 따라가야 카트가 화면에서 솟았다 내려앉는 것이 보인다
  fovTime: 0.22,          // 시야각이 따라붙는 시간 (초)
  speedForMax: 20,        // 최고속을 모를 때(topSpeed 를 안 준 호출 — 시험 · 옛 쓰임)만: 이 속도(m/s)에서 '빠를 때' 값에 닿는다
  speedTime: 0.3,         // 거리 · 높이 · 조준이 속도를 따라붙는 시간 (초). 벽에 박아 속도가 한 화면에 뚝 떨어져도 카메라가 튀지 않게(2026-11-26 — 그 전에는 72 km/h 위에서 카메라가 안 움직여 드러나지 않았다)
  minClearance: 0.7,      // 카메라가 땅 위로 최소 이만큼 (m)
  boostBack: 0.3,         // 모아 둔 부스터를 쓰는 동안 카메라가 뒤로 처지는 거리 (m) — 시야각과 같이 따라붙는다(짧은 가속은 boostFovSmall 만큼)
  rush: 0.005,            // 잔떨림 크기 (m): 일반 최고속을 넘어선 속도(부스트 · 내리막)에서만 생긴다 — 최고속의 rushFrom 배에서 0, rushFull 배에서 이 값
  rushFrom: 1,            //   〃 평소 주행에는 없다(늘 최고속 가까이 달리므로 계속 떨리면 피곤하다 — 아스트라 조사의 권고). 떠 있는 동안 · 움직임 줄이기에서는 그 화면부터 0
  rushFull: 1.2,          //   〃
};
// ?cam=cine — 수평선 가까이를 보며 차를 조금 더 멀리서 따라간다.
export const CINE_CAMERA = {
  ...CAMERA, distance: [5.6, 7.4], height: [1.35, 1.72], fov: [46, 52],
  ahead: [8, 14], aimHeight: 1.25, boostFov: 7,
};
// 실제 크기 차(길이 4.6 ~ 4.9 m) 시안용: 카트(1.8 m)에 맞춘 거리로는 카메라가 차에 붙는다 → 차 크기에 맞춰 뒤 · 위로.
// 2026-11-26 속도감: 서 있을 때의 구도(8.6 m · 48° — 밤 화면의 크기감)는 그대로 두고, 빠를 때를 뒤로 물러나던 것([8.6, 10.4] m · 54°)에서 다가서는 것으로 바꿨다.
//   7.4 m · 64° 면 GT 의 뒷모습이 화면 폭의 약 18%(원근으로 센 값) — 서 있을 때 20% 에서 조금만 줄고(그 전에는 14% 까지 줄었다), 그동안 둘레가 벌어진다.
//   (처음에는 각의 비로 세어 '23.7 → 23% 로 그대로'라고 적었으나 틀린 셈이었다 — 아스트라의 합친 판 검토가 원근 투영으로 다시 세어 잡았다. 값은 화면을 직접 보고 정한 그대로 둔다.)
export const ROAD_CAMERA = {
  ...CINE_CAMERA, distance: [8.6, 7.4], height: [2.05, 1.95], ahead: [10, 14], aimHeight: 1.1, fov: [48, 64], boostFov: 11, boostBack: 0.6, rush: 0.008,
};

// 차 크기를 따르는 카메라(2026-11-24 큰 차): 키 큰 차는 지붕이 앞길을 가렸다(청소차는 범퍼 앞 54 m 까지 노면이 안 보였다 — 검증/car-view.mjs).
//   1) 거리: 길이 4 m 이상은 ROAD_CAMERA(GT 기준), 작은 차는 CAMERA(레이싱 카트 기준)를 길이 배율만큼 뒤로 — 차가 화면에서 작아지지 않게.
//   2) 높이: 차의 윗선을 스치는 시선이 앞 범퍼에서 VIEW_NEAR m 안의 노면에 닿을 만큼만 올린다(이미 닿으면 그대로).
//      VIEW_NEAR 는 그대로 두는 다섯 대(GT · 세단 · 슈퍼카 · 포뮬러 · 레이싱 카트) 가운데 앞이 가장 덜 보이는 세단(14.9 · 11.5 m)을 올려 잡은 값 — 그래서 다섯 대는 안 바뀐다.
//   3) 올렸으면 윗선이 기준 차(GT · 레이싱 카트)와 같은 화면 높이에 오게 더 내려다본다(바라보는 지점을 당긴다) — 올라간 만큼 그림 위쪽에 앞길이 더 들어온다.
//   속도에 따른 물러남 · 시야각 · 부스트 · 드리프트 움직임은 기준 카메라 그대로다(느릴 때 · 빠를 때 두 끝을 각각 맞추고 그 사이는 지금처럼 섞는다).
export const VIEW_NEAR = [16, 12];   // 느릴 때 · 빠를 때 (m)
export const MID_FROM = 2.1;         // 이 길이(m)를 넘는 작은 차부터 빠를 때 물러나는 몫을 줄인다(4 m 에서 큰 차와 같아진다). 오토바이(2.05 m)까지는 그 전 값 그대로
// 속도 → 두 끝을 섞는 비율(0 = 서 있을 때, 1 = 빠를 때). topSpeed(그 차의 일반 최고속 m/s)를 알면 그 속도에서, 모르면 tuning.speedForMax 에서 1 이 된다.
//   속도가 수가 아니면(NaN) 0 — 따라붙는 값(blend)에 한 번 들어가면 계속 남으므로 여기서 막는다.
export const cameraBlend = (tuning, speed, topSpeed = 0) => { const v = Math.abs(speed); return v >= 0 ? Math.min(1, v / (topSpeed > 0 ? topSpeed : tuning.speedForMax)) : 0; };
// 차의 윗선: 가운데 띠(폭 0.5 m) 세로 단면의 위쪽 볼록 껍질 중 꼭대기부터 앞쪽 [앞 m, 높이 m](원점 = 네 바퀴 가운데의 지면). front = 앞 끝, length = 길이.
//   glb 에서 잰 값 — `node 검증/car-view.mjs --tops` 가 만들고 검증/car-view.test.mjs 가 glb 와 맞춰 본다(차량을 다시 지으면 다시 만든다).
export const CAR_TOPS = {
  gt: { length: 4.6, front: 2.3, top: [[-0.3, 1.18], [0.3, 1.14], [1.7, 0.68], [2.2, 0.49], [2.25, 0.4], [2.3, 0.13]] },
  sedan: { length: 4.87, front: 2.44, top: [[-0.05, 1.38], [0.35, 1.33], [2.4, 0.58], [2.45, 0.25]] },
  supercar_real: { length: 4.55, front: 2.278, top: [[0.05, 1.19], [0.35, 1.18], [2.2, 0.39], [2.3, 0.13]] },
  formula_real: { length: 4.9, front: 2.48, top: [[-0.4, 1.01], [-0.2, 1], [1.8, 0.44], [2.5, 0.1]] },
  racekart: { length: 1.82, front: 0.91, top: [[-0.3, 1.17], [-0.2, 1.14], [0.9, 0.17]] },
  garbagetruck_real: { length: 6.19, front: 2.8, top: [[-2.1, 2.61], [0.6, 2.61], [1.85, 2.33], [2.25, 2.11], [2.35, 2], [2.7, 1.43], [2.75, 1.32], [2.8, 0.54]] },
  truck_real: { length: 5.1, front: 2.34, top: [[1, 1.98], [1.8, 1.96], [1.85, 1.94], [1.95, 1.84], [2.25, 1.32], [2.3, 1.19], [2.35, 0.48]] },
  forklift_real: { length: 3.42, front: 2.178, top: [[0.9, 2.01], [0.95, 2.01], [2.2, 0.22]] },
  shoppingcart_real: { length: 1.08, front: 0.51, top: [[-0.35, 1.93], [-0.25, 1.92], [-0.2, 1.88], [0.5, 0.94]] },
  golfcart_real: { length: 2.4, front: 1.2, top: [[-0.45, 1.81], [0.7, 1.79], [1.2, 0.54]] },
  taxi_real: { length: 4.76, front: 2.375, top: [[-0.2, 1.77], [0, 1.77], [2.25, 0.8], [2.35, 0.73]] },
  minibus_real: { length: 7.1, front: 3.55, top: [[-1.6, 2.74], [-0.25, 2.74], [3.3, 2.48], [3.35, 2.47], [3.45, 2.38], [3.5, 1.54], [3.55, 0.52]] },
  bicycle_real: { length: 1.83, front: 0.917, top: [[0.05, 1.7], [0.15, 1.69], [0.2, 1.65], [0.7, 0.99], [0.9, 0.51]] },   // 2026-11-24 페달 굴리기: 안장(10 cm 낮춤)에 앉은 운전자(서서 숙였을 때 1.80 → 1.70)
  racebike_real: { length: 2.05, front: 1.017, top: [[0.3, 1.45], [0.4, 1.42], [1, 0.82]] },
  eagle_statue: { length: 1.33, front: 0.674, top: [[0.1, 1.59], [0.5, 1.53], [0.55, 1.5], [0.65, 1.39]] },
};
// 끝 i(0 = 느릴 때, 1 = 빠를 때)에서 윗선을 스치는 시선의 각(phi)과 화면 높이(ndc, −1 = 맨 아래 … 1 = 맨 위). 곧은 평지 · 다 따라붙은 때 · 가로 화면.
function sightline(tuning, car, i) {
  const D = tuning.distance[i], h = tuning.height[i], pitch = Math.atan2(tuning.aimHeight - h, tuning.ahead[i] + D), half = Math.tan(tuning.fov[i] * Math.PI / 360);
  const phi = Math.max(...car.top.map(([x, y]) => Math.atan2(y - h, x + D)));
  return { phi, ndc: Math.tan(phi - pitch) / half, half };
}
// length: 게임이 쓰는 차 길이(main.js 의 REAL_SIZES). 윗선을 모르는 차는 예전처럼 거리만 맞춘다.
export function cameraForCar(id, length = CAR_TOPS[id]?.length) {
  if (!(length > 0)) return null;
  const big = length >= 4, base = big ? ROAD_CAMERA : CAMERA, refId = big ? 'gt' : 'racekart';
  // 작은 차의 카메라는 빠를수록 물러나고(×1.30) 큰 차는 다가선다(×0.86). 그 사이 크기(골프 카트 2.4 m · 지게차 3.42 m)는 길이에 따라 그 사이로 —
  //   그대로 두면 3.4 m 지게차의 카메라(8.2 m)가 4.6 m GT(7.4 m)보다 멀어진다. 레이싱 카트(1.82 m)까지는 그 전 값 그대로다.
  const between = len => (big ? 0 : Math.min(1, Math.max(0, (len - MID_FROM) / (4 - MID_FROM))));   // 기준 차(레이싱 카트)는 0 — 제 길이로 센다
  const fastRatio = (r, len) => r + (ROAD_CAMERA.distance[1] / ROAD_CAMERA.distance[0] - r) * between(len);
  const scaled = len => { const k = Math.max(1, len / (big ? 4.85 : 1.8)), slow = base.distance[0] * k; return { ...base, distance: [slow, slow * fastRatio(base.distance[1] / base.distance[0], len)], height: [...base.height], ahead: [...base.ahead] }; };
  const out = scaled(length), car = CAR_TOPS[id], ref = CAR_TOPS[refId]; if (!car) return out;
  const refCam = scaled(ref.length);
  for (const i of [0, 1]) {
    const D = out.distance[i], G = car.front + VIEW_NEAR[i];
    const need = Math.max(...car.top.map(([x, y]) => y * (G + D) / (G - x)));   // 시선 (−D, h) → (G, 0) 이 윗선의 모든 점 위로 지나갈 높이
    if (need <= out.height[i]) continue;
    out.height[i] = need;
    // 기준 차의 윗선이 기준 카메라에서 놓이는 화면 높이에 이 차의 윗선을 놓는 내려다보는 각 → 그 각이 되게 바라보는 지점의 앞쪽 거리를 정한다(조준 높이는 그대로)
    const want = sightline(refCam, ref, i).ndc, { phi, half } = sightline(out, car, i), pitch = phi - Math.atan(want * half);
    out.ahead[i] = (out.aimHeight - need) / Math.tan(pitch) - D;
  }
  return out;
}

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const mix = (range, t) => range[0] + (range[1] - range[0]) * t;
const ease = (dt, time) => 1 - Math.exp(-dt / time);

// pose: { x, y, z, heading, course, speed, boost(남은 초), boostKind('item' | 'kick' | 'start', 없으면 'item'), wallHit } — 화면에 그릴(보간된) 자세
//   있으면 landed: 땅에 닿은 화면에서만 > 0(부딪힌 수직 속도 m/s). 2 를 넘으면 짧게 흔들리고 살짝 내려앉는다. 없으면 예전과 같다.
//   있으면 air: 떠 있는 동안 흐른 시간(초, 붙어 있으면 0). 떠 있는 동안에는 높이를 늦게 따라간다.
// tuning(CAMERA)은 실행 중에 바뀔 수 있으므로(조정판) 매 update 에서 읽는다. 함수를 주면 매 update 에서 불러 그 값을 쓴다(차를 바꾸면 그 차의 카메라로).
// blocked(x, z): 그 지점이 건물 안이면 true (없어도 됨)
// ceilingAt(x, z, y): y 높이 층의 머리 위 판(다리) 밑면, 없으면 Infinity (없어도 됨) — 카메라 · 차 사이의 시선이 판 밑으로 지나가게 높이를 누른다.
export const CEILING_GAP = 0.3;   // 판 밑면에서 이만큼 아래까지 (m)
const LAYER_REACH = 0.9, LAYER_STEP = 1.5;   // 카메라 바닥의 층을 걸어가며 고를 때 앞 걸음 바닥에 더하는 값 · 걸음(m) — update 의 floor
// topSpeed: 그 차의 일반 최고속(m/s — 숫자나 함수). 주면 '빠를 때' 값이 그 속도에서 닿는다(안 주면 tuning.speedForMax). calm(): 움직임 줄이기면 true — 잔떨림을 뺀다.
export function createChaseCamera(THREE, camera, { heightAt, ceilingAt = null, blocked = null, tuning: tune = CAMERA, topSpeed = null, calm = null } = {}) {
  const read = () => (typeof tune === 'function' ? tune() : tune);
  // boostLevel: 부스터의 세기 0 ~ 1(짧은 가속은 boostFovSmall 까지) — 시야각 boostFov 와 처짐 boostBack 에 각각 곱한다(조정판에서 boostFov 를 고쳐도 거리가 튀지 않게, 2026-11-26 검토)
  let tuning = read(), angle = 0, y = 0, fov = tuning.fov[0], boostLevel = 0, started = false, shake = 0, dip = 0, rush = 0, clock = 0, blend = 0;
  const aim = new THREE.Vector3();
  function wanted(pose) {
    const reversing = pose.speed < -0.2, slow = Math.abs(pose.speed) < 1.5;
    const base = reversing || slow ? pose.heading : pose.course;
    return base + tuning.headingMix * wrap(pose.heading - base);
  }
  function update(pose, dt) {
    tuning = read();
    const target = wanted(pose);
    const first = !started;
    if (!started) { boostLevel = 0; rush = 0; angle = target; y = pose.y + tuning.height[0] * (camera.aspect < 1 ? tuning.portraitBack : 1); started = true; }
    angle += wrap(target - angle) * ease(dt, tuning.angleTime);
    const speed = Number.isFinite(pose.speed) ? pose.speed : 0;   // 수가 아닌 속도는 0 — 아래의 따라붙는 값들(blend · rush)이 같이 쓴다(한 번 NaN 이 들어가면 남는다)
    const top = typeof topSpeed === 'function' ? topSpeed() : topSpeed, full = top > 0 ? top : tuning.speedForMax, ratio = Math.abs(speed) / full;
    // 섞는 비율: 시야각은 지금 속도의 것(fovTime 으로 따로 따라붙는다), 거리 · 높이 · 조준은 speedTime 으로 따라붙은 것(blend)
    const now = cameraBlend(tuning, speed, top); if (first || !(blend >= 0)) blend = now; else blend += (now - blend) * ease(dt, tuning.speedTime ?? 0.3);
    const t = blend, fx = Math.sin(angle), fz = Math.cos(angle), tall = camera.aspect < 1, back = tall ? tuning.portraitBack : 1;
    // 부스트: 세기(boostLevel)가 넓어질 때 빠르게 · 돌아올 때 천천히 따라붙고, 시야각과 처짐에 같이 곱한다
    const kind = pose.boostKind || 'item', levelWant = pose.boost > 0 ? (kind === 'item' ? 1 : tuning.boostFovSmall ?? 0.45) : 0;
    boostLevel += (levelWant - boostLevel) * ease(dt, levelWant > boostLevel ? tuning.boostFovIn ?? 0.18 : tuning.boostFovOut ?? 0.55);
    let distance = (mix(tuning.distance, t) + (tuning.boostBack || 0) * boostLevel) * back;
    // 건물 안으로 들어가면 당겨 온다
    if (blocked) for (let i = 0; i < 5 && blocked(pose.x - fx * distance, pose.z - fz * distance); i++) distance *= 0.72;
    const cx = pose.x - fx * distance, cz = pose.z - fz * distance;
    y += (pose.y + mix(tuning.height, t) * back - y) * ease(dt, (+pose.air || 0) > 0 ? tuning.airHeightTime ?? tuning.heightTime : tuning.heightTime);
    // 카트가 있는 층의 바닥(다리 밑을 지날 때 다리 위로 끌려 올라가지 않게). 층은 차에서 카메라 쪽으로 LAYER_STEP m 씩 걸어가며 고른다(2026-11-25 코스 D):
    //   가파른 내리막(32%)에서는 카메라 자리(차 뒤 · 오르막 쪽)의 상판이 차보다 3 ~ 4 m 높아, 차 높이로 고르면 땅을 골라 카메라가 상판 속 · 밑으로 들어갔다.
    //   한 걸음마다 앞 걸음의 바닥 + LAYER_REACH 로 고르므로 오르막 상판은 따라 오르고, 건너는 곳의 아래 길에서는 위 판(밑면이 아래 길 + 3.5 m 넘게)을 고르지 않는다.
    let floorY = pose.y;
    if (heightAt) { const steps = Math.max(1, Math.ceil(distance / LAYER_STEP)); for (let k = 1; k <= steps; k++) { const u = k / steps; floorY = heightAt(pose.x - fx * distance * u, pose.z - fz * distance * u, floorY + LAYER_REACH); } }
    const floor = heightAt ? floorY + tuning.minClearance : -Infinity; if (y < floor) y = floor;
    // 머리 위 판: 카메라에서 차(바닥 + 1.2 m)까지의 시선을 여섯 점에서 보고, 판 밑면 − CEILING_GAP 보다 낮게 지나갈 높이로 누른다(다리 밑의 아래 길 — 큰 차는 카메라가 높다).
    let cap = Infinity;   // 머리 위 판이 누르는 높이(없으면 Infinity) — 아래에서 흔들림을 더한 마지막 높이에도 쓴다
    if (ceilingAt) {
      const top = pose.y + 1.2;
      for (let k = 0; k < 6; k++) { const u = k / 6, c = ceilingAt(cx + (pose.x - cx) * u, cz + (pose.z - cz) * u, pose.y); if (c < Infinity) cap = Math.min(cap, (c - CEILING_GAP - u * top) / (1 - u)); }
      if (y > cap) y = Math.max(floor, cap);
    }
    if (pose.wallHit) shake = Math.min(0.12, shake + 0.06);
    if (pose.crash > 0) shake = Math.min(0.34, shake + 0.05 + pose.crash * 0.008);   // 차가 상할 만큼 박았다(pose.crash = 깎인 차 상태 %): 더 크게 흔든다
    // 착지: 벽과 같은 흔들림(세기는 부딪힌 속도에 비례, 상한 낮게) + 아주 짧게 내려앉기
    const landed = +pose.landed || 0;
    if (landed > 2) { shake = Math.min(0.13, shake + Math.min(0.07, (landed - 2) * 0.017)); dip = Math.min(0.12, dip + (landed - 2) * 0.03); }
    shake *= Math.exp(-dt / 0.12); dip *= Math.exp(-dt / 0.13); if (dip < 1e-3) dip = 0;
    // 잔떨림: 일반 최고속을 넘어선 동안 노면을 타는 떨림(11 ~ 21 Hz 의 사인 넷 — 난수가 아니라 찍을 때마다 같다).
    //   최고속을 모르거나(topSpeed 없음) 움직임 줄이기 · 떠 있는 화면에서는 그 화면부터 0(천천히 잦아들지 않는다), 땅에서는 0.12초로 따라붙는다.
    const from = tuning.rushFrom ?? 1, over = Math.min(1, Math.max(0, (ratio - from) / Math.max(1e-6, (tuning.rushFull ?? 1.2) - from)));
    const quiet = !(top > 0) || (calm && calm()) || (+pose.air || 0) > 0 || !(tuning.rush > 0);
    if (quiet) rush = 0; else rush += (tuning.rush * over * over - rush) * ease(dt, 0.12);
    if (!(rush >= 0)) rush = 0;
    clock += dt;
    const hx = rush > 1e-5 ? rush * (0.6 * Math.sin(clock * 71) + 0.4 * Math.sin(clock * 113 + 1.3)) : 0, hy = rush > 1e-5 ? rush * (0.6 * Math.sin(clock * 89 + 0.7) + 0.4 * Math.sin(clock * 131)) : 0;
    const jx = (shake ? (Math.random() - 0.5) * shake : 0) + hx, jy = (shake ? (Math.random() - 0.5) * shake : 0) + hy;
    camera.position.set(cx + jx, Math.max(floor, Math.min(cap, Math.max(floor, y - dip) + jy)), cz);   // 흔들림을 더한 마지막 높이도 바닥 · 머리 위 판 안에(2026-11-26 검토 — 그 전에는 흔들린 만큼 판 여유를 넘었다)
    const ahead = mix(tuning.ahead, t) * (tall ? tuning.portraitAhead : 1); aim.set(pose.x + fx * ahead, pose.y + (tall ? tuning.portraitAim : tuning.aimHeight), pose.z + fz * ahead); camera.lookAt(aim);
    // 속도에 따른 시야각은 fovTime 으로, 부스트로 더 넓히는 몫은 따로(넓어질 때 빠르게, 돌아올 때 천천히) 따라붙는다.
    fov += (mix(tuning.fov, now) + (tall ? tuning.portraitFov : 0) - fov) * ease(dt, tuning.fovTime);
    const next = fov + (tuning.boostFov || 0) * boostLevel;
    if (Math.abs(next - camera.fov) > 0.02) { camera.fov = next; camera.updateProjectionMatrix(); }
  }
  return { update, snap(pose) { started = false; update(pose, 1 / 60); }, get angle() { return angle; } };
}
