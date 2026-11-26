// 등급 · 기존 감각(KARTS)을 적용한 다음 곱할 차별 배율. 세기 0은 배포 당시 네 감각, 1은 아래 설계값.
export const FEEL_STRENGTH = 1;

// 조향을 놓는 시간은 누를 때의 배율, 부스트 가속·최고속은 일반 주행의 배율을 기본으로 쓴다.
// release · boostAccel · boostTop은 필요한 차에서만 따로 맞춘다.
// 처음 꼬리가 벌어지는 시간과 차체 회전의 반응 시간(yawTime), 놓은 직후 접지가 돌아오는 시간(exitGrip)을 따로 맞춘다.
// 버스는 전타 회전력을 유지하면서 역조향으로 미끄럼을 받아낼 때의 회전력(yawOut)을 따로 쓴다.
// gripTime(일반 접지)과 slideGrip(드리프트 접지)은 단위와 방향이 다르므로 따로 둔다.
function profile({
  steering = 1, release = steering, baseRadius = 1, fastRadius = 1, gripTime = 1,
  kick = 1, inertia = 1, yawTime = inertia, yaw = 1, yawOut = yaw, grip = 1, maxSlip = 1, recovery = 1, exitGrip = recovery,
  loss = 1, gauge = 1, accel = 1, top = 1, boostAccel = accel, boostTop = top, brake = 1,
}) {
  return {
    steerRiseTime: steering, steerFallTime: release, turnRadiusBase: baseRadius, turnRadiusPerSpeed2: fastRadius, gripTime,
    slideKickDeg: kick, slideKickTime: inertia, slideYawTime: yawTime, slideYawIn: yaw, slideYawOut: yawOut,
    slideGrip: grip, slideMaxSlipDeg: maxSlip, slideExitGripTime: exitGrip, slideRecoverTime: recovery,
    slideDrag: loss, slideDragBase: loss, gaugeRate: gauge, accel, boostAccel, maxSpeed: top, boostMaxSpeed: boostTop, brakeDecel: brake,
  };
}

export const CAR_FEEL = {
  // 짧은 축간거리, 단단한 타이어. 탁 꺾고 금방 붙지만 깊게 틀면 힘을 잃는다.
  racekart: profile({
    steering: 0.61, baseRadius: 0.86, fastRadius: 1.13, gripTime: 0.75,
    kick: 0.78, inertia: 0.63, yawTime: 0.55, yaw: 0.93, grip: 0.79, recovery: 1.02,
    loss: 1.14, gauge: 2, accel: 1.172, top: 0.978, boostAccel: 1, boostTop: 0.987,
  }),
  // 길고 낮은 차체와 접지력. 작은 미끄럼각을 유지하고 놓자마자 붙는다.
  formula_real: profile({
    steering: 1.23, release: 0.43, fastRadius: 0.78, gripTime: 0.9,
    kick: 0.97, inertia: 0.73, yaw: 0.92, grip: 1.31, maxSlip: 0.77, recovery: 0.7,
    loss: 1.82, gauge: 0.49, accel: 1.229, top: 0.993, boostAccel: 0.66, boostTop: 0.983,
  }),
  // 보통 승용차의 기준. 키를 잠시 누르면 완만하게 돌고 놓으면 단정하게 붙는다.
  sedan: profile({ kick: 0.95, yaw: 1.01, grip: 1.09, recovery: 0.96 }),
  // 기본 차 GT. 뒤가 조금만 벌어져도 진행 방향이 일찍 따라붙어 코너 입구에서 덜 밀린다.
  gt: profile({
    steering: 0.91, fastRadius: 0.95, gripTime: 0.96,
    kick: 1, inertia: 1.22, yaw: 1.06, grip: 1.31, recovery: 1.05,
    loss: 0.93, accel: 1.131, top: 0.98908, boostAccel: 1.12, boostTop: 0.969737,
  }),
  // 같은 폭의 GT보다 뒤가 먼저 흐른다. 예리하게 시작한 뒤 꼬리를 따라 받아낸다.
  supercar_real: profile({
    steering: 0.9, gripTime: 0.91,
    kick: 0.95, inertia: 0.69, yaw: 1.19, grip: 0.79, maxSlip: 0.88, recovery: 1.1,
    loss: 1.06, gauge: 0.72, accel: 1.046, top: 1.038, boostAccel: 0.82, boostTop: 1.03,
  }),
  // 가볍고 폭이 좁은 골프 카트. 미끄럼이 쉽게 커지고 회복할 때 조금 출렁인다.
  golfcart_real: profile({
    steering: 0.96, baseRadius: 0.82, fastRadius: 1.11, gripTime: 1.14,
    kick: 1.11, inertia: 0.95, yaw: 1.01, grip: 0.99, recovery: 0.89,
    loss: 0.91, gauge: 1.33, accel: 0.838, top: 1.007, boostAccel: 1.45, boostTop: 1.025,
  }),
  // 뒷바퀴 조향으로 저속 회전반경이 가장 작다. 앞 포크를 축으로 꼬리가 크게 돈다.
  forklift_real: profile({
    steering: 1.19, release: 1.55, baseRadius: 0.56, fastRadius: 1.18, gripTime: 0.79,
    kick: 1.43, inertia: 1.22, yawTime: 1.32, yaw: 1.17, grip: 0.72, maxSlip: 0.98, recovery: 1.39, exitGrip: 1.43,
    loss: 0.95, gauge: 1.55, accel: 0.727, top: 1.011, boostAccel: 1.3, boostTop: 1.04,
  }),
  // 차체 1.06 m, 무게 0.70. 조향도 미끄럼도 즉각적이고 깊게 밀면 속도가 크게 깎인다.
  shoppingcart_real: profile({
    steering: 0.52, release: 0.5, baseRadius: 0.87, fastRadius: 0.86, gripTime: 0.58,
    kick: 0.68, inertia: 0.56, yawTime: 0.37, yaw: 0.99, grip: 0.72, recovery: 0.66, exitGrip: 2.32,
    loss: 1.25, gauge: 0.97, accel: 1.045, top: 0.996, boostAccel: 1.06, boostTop: 1.009,
  }),
  // 가볍고 짧은 두 바퀴. 핸들이 가볍고 얕은 미끄럼에서 바로 일어선다.
  bicycle_real: profile({
    steering: 0.61, release: 0.55, baseRadius: 0.75, fastRadius: 0.89, gripTime: 0.66,
    kick: 0.78, inertia: 1.19, yawTime: 0.56, yaw: 0.924, grip: 1.325, maxSlip: 0.54, recovery: 0.67, exitGrip: 1.8,
    loss: 1.515, gauge: 2.33, accel: 0.836, top: 0.992, boostAccel: 1.4, boostTop: 1.003,
  }),
  // 자전거보다 긴 호를 그리는 레이싱 바이크. faster의 기존 부스트 40.6754 m/s에 배율을 곱하면 40.56 m/s가 된다.
  racebike_real: profile({
    steering: 0.62, baseRadius: 0.88, fastRadius: 0.9, gripTime: 0.82,
    kick: 0.99, inertia: 1.42, yaw: 1.24, grip: 1.47, maxSlip: 0.4, recovery: 0.99,
    loss: 1.68, gauge: 0.46, accel: 1.3, top: 1.003, boostAccel: 0.68, boostTop: 0.997162,
  }),
  // 적재함 긴 트럭. 무거운 뒤가 천천히 흐르고 속도를 보존한다.
  truck_real: profile({
    steering: 1.17, baseRadius: 1.09, fastRadius: 0.92, gripTime: 1.09,
    kick: 0.72, inertia: 1.42, yaw: 1.31, grip: 1.01, recovery: 1.14,
    loss: 0.8, gauge: 1.38, accel: 1.014, top: 0.971, boostAccel: 1, boostTop: 0.983,
  }),
  // 높은 청소차의 관성. 한 템포 늦게 크게 벌어지고 놓아도 뒤가 남는다.
  garbagetruck_real: profile({
    steering: 1.28, release: 1.2, baseRadius: 1.09, fastRadius: 1.02, gripTime: 0.94,
    kick: 0.49, inertia: 1.83, yaw: 2.59, grip: 0.91, maxSlip: 0.91, recovery: 1.48,
    loss: 0.8, gauge: 1.68, accel: 0.839, boostAccel: 1.5, boostTop: 1.023, brake: 1.12,
  }),
  // 7.1 m 버스. 차체 회전은 천천히 붙고, 전타를 유지하면 강한 회전과 접지로 U턴 폭이 줄어든다.
  minibus_real: profile({
    steering: 1.535, release: 0.454, baseRadius: 1.165, fastRadius: 1.091, gripTime: 0.417,
    kick: 1.3323, inertia: 0.399, yawTime: 6.8778, yaw: 2.9652, yawOut: 5.66, grip: 1.3003, maxSlip: 0.717, recovery: 0.902, exitGrip: 5.032,
    loss: 0.35, gauge: 0.74, accel: 0.791, boostAccel: 1.7, boostTop: 1.023, brake: 1.16,
  }),
  // 승객을 태운 택시. 세단보다 부드러운 조향과 회복, 조금 더 흐르는 뒷바퀴.
  taxi_real: profile({
    steering: 1.42, baseRadius: 1.02, fastRadius: 1.14, gripTime: 0.95,
    kick: 1.34, inertia: 1.2, yaw: 1.04, grip: 1.14, recovery: 1.19,
    loss: 1.41, gauge: 1.25, accel: 0.821, top: 1.032, boostAccel: 1.12, boostTop: 1.047,
  }),
  // 짧지만 무거운 돌 받침대. 처음에는 버티다가 크게 벌어지고, 놓아도 꼬리가 잠시 남는다.
  eagle_statue: profile({
    steering: 1.24, baseRadius: 0.83, fastRadius: 1.01, gripTime: 1.24,
    kick: 1.63, inertia: 1.47, yaw: 1.18, grip: 0.78, maxSlip: 0.81, recovery: 1.2,
    loss: 1.21, gauge: 1.55, accel: 0.875, boostAccel: 1.35, boostTop: 1.023, brake: 1.08,
  }),
};
