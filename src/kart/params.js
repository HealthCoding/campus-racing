// 카트 주행 조정값 — 시승하면서 고치는 표. 단위: m, s, m/s, m/s², 도(Deg 라고 적힌 것만), 점(게이지).
// 첫 판의 출발점은 reports/2026-11-20_Astra_카트조작감_설계조사.md, 둘째 판(부스터 체계 · 미끄럼형 드리프트)의 까닭은
// reports/2026-11-20_부스터_조작감_참고조사.txt. 속도 등급이 곱하는 값은 classes.js 에 있다.
export const KART = {
  dt: 1 / 120,               // 물리 한 틱(초). 바꾸지 않는다(기록 · 유령이 이 틱을 쓴다)

  // ── 앞뒤 속도 ──
  maxSpeed: 18,              // 일반 최고속(65 km/h). 가속은 이 속도에서 0 이 된다
  accel: 5.8,                // 정지 가속. 실제 가속 = accel × (1 − (v/maxSpeed)²)
  coastDecel: 0.65,          // 가속을 뗐을 때 기본 감속
  coastDecelPerSpeed: 0.025, // 가속을 뗐을 때 속도에 비례해 더하는 감속(1/s)
  brakeDecel: 10,            // 브레이크 감속(후진 중 전진을 누를 때도 이 값으로 먼저 선다)
  reverseDelay: 0.25,        // 멈춘 뒤 브레이크를 이만큼 더 누르고 있어야 후진
  reverseAccel: 2,           // 후진 가속
  reverseMax: 3,             // 후진 최고속
  overSpeedDecay: 3,         // 상한을 넘은 속도를 줄이는 감속(부스트가 끝난 뒤 · 내리막)
  slopeFactor: 0.65,         // 경사 가속 = −slopeFactor × 9.81 × sin(경사각)

  // ── 조향(일반) ──
  steerRiseTime: 0.09,       // 조향 입력을 따라가는 시정수(누를 때)
  steerFallTime: 0.07,       // 조향 입력을 따라가는 시정수(놓을 때)
  turnRadiusBase: 3.0,       // 일반 최소 회전반경 = base + perSpeed² × v²
  turnRadiusPerSpeed2: 0.03, //   〃 (12 m/s → 7.3 m, 24 m/s → 20.3 m. 첫 판은 0.05 라 24 m/s 에서 31.8 m 였다)
  gripTime: 0.085,           // 진행 방향이 차체 방향을 따라가는 시정수(작을수록 접지가 단단)
  airSteer: 0.3,             // 공중에서 차체를 돌리는 비율(진행 방향은 그대로)

  // ── 드리프트: 시작 · 끝 ──
  driftMinSpeed: 5.5,        // 드리프트 시작 최저 속도
  driftExitSpeed: 4.5,       // 이 속도 아래로 떨어지면 드리프트가 풀린다
  driftMinSteer: 0.35,       // 시작할 때 필요한 조향 크기
  driftHoldRestart: 0.25,    // 앞 드리프트가 끝난 뒤 이 시간 안에는, Shift · 방향키를 누르고만 있어서는 다시 걸리지 않는다(새로 누르면 바로 걸린다)
  driftBrakeDecel: 6,        // 드리프트 중 브레이크

  // ── 드리프트(미끄럼형): 차체를 먼저 돌리고, 낮아진 접지력으로 진행 방향이 차체를 뒤따른다 ──
  slideKickDeg: 24,          // 진입하는 순간 차체를 더 돌려 주는 각(도). 클수록 '확' 돌아간다
  slideKickTime: 0.12,       // 그 각을 주는 데 걸리는 시간
  slideYawIn: 2.5,           // 드리프트 방향으로 끝까지 꺾었을 때 차체가 도는 빠르기(rad/s). 오래 꺾고 있으면 이 빠르기로 돈다
  slideYawOut: 3.2,          // 반대로 끝까지 꺾었을 때 차체가 되돌아가는 빠르기(rad/s). 클수록 빨리 끊긴다
  slideYawTime: 0.06,        // 차체 회전이 조향을 따라가는 시정수(클수록 묵직하고 늦게 멎는다)
  slideYawSpeedRef: 15,      // 이 속도를 넘으면 차체 회전이 줄어든다: × (ref / v)^pow (등급에 따라 같이 커진다)
  slideYawSpeedPow: 0.5,     //   〃 (0 이면 속도와 무관)
  slideGrip: 3.4,            // 미끄러지는 동안 진행 방향이 차체 방향을 따라붙는 세기(1/s). 클수록 덜 미끄러지고 얕게 돈다
  slideMaxSlipDeg: 62,       // 차체가 진행 방향에서 벌어질 수 있는 최대 각(도)
  slideEndDeg: 4,            // 이 각보다 펴졌고 안쪽으로 꺾고 있지 않으면 드리프트가 끝난다
  slideDragBase: 0.4,        // 미끄러지는 동안 기본 저항(m/s²)
  slideDrag: 5.5,            // 벌어진 각에 비례하는 저항(m/s²) × sin(각). 깊게 미끄러질수록 속도를 잃는다
  slideExitGripTime: 0.2,    // 드리프트를 놓은 직후의 접지 시정수. slideRecoverTime 에 걸쳐 gripTime 으로 돌아온다
  slideRecoverTime: 0.3,     //   〃 (그동안 진행 방향이 차체가 보는 쪽으로 붙는다)

  // ── 게이지 ──
  gaugeRate: 150,            // 미끄럼각이 충분할 때 초당 게이지(0~100). 직각 코너 하나를 드리프트로 돌면 0.8칸, 헤어핀은 두 칸 가까이
  gaugeSlipMinDeg: 5,        // 이 미끄럼각부터 게이지가 차기 시작
  gaugeSlipFullDeg: 22,      // 이 미끄럼각에서 최대 비율
  gaugeMinSpeed: 5,          // 이 속도 아래에서는 게이지가 안 찬다
  gaugeFullSpeed: 10.8,      // 이 속도 이상이면 속도 비율 1(최고속의 0.6배 — 느린 제자리 돌기로는 덜 찬다. 등급에 따라 같이 커진다)

  // ── 부스터 ──
  boostSlots: 2,             // 모아 둘 수 있는 칸 수. 게이지가 100 이 되면 한 칸이 되고 0 부터 다시 찬다
  boostTime: 3,              // 모아 둔 부스터 한 칸의 길이(초)
  boostAccel: 6,             // 부스트 중 더하는 가속
  boostMaxSpeed: 22,         // 부스트 중 최고속(일반의 1.22배)
  boostBufferTime: 0.25,     // 칸이 생기기 조금 전에 눌러도 듣는 시간
  kickWindow: 0.5,           // 드리프트가 끝난 뒤 '다시 밟기'를 받아 주는 시간
  kickBufferTime: 0.1,       // 드리프트를 놓기 조금 전에 밟은 것도 받는다(놓으면서 같이 밟아도 듣게)
  kickBoostTime: 0.5,        // 그때 붙는 짧은 가속의 길이
  kickMinDriftTime: 0.25,    // 이보다 짧은 드리프트에는 주지 않는다
  startBoostWindow: 0.15,    // 출발 신호 앞뒤로 이 시간 안에 밟으면 출발 가속
  startBoostTime: 1,         // 출발 가속의 길이
  padBoostTime: 1,           // 부스트 발판(코스 부품)을 밟았을 때의 가속 길이

  // ── 벽 ──
  wallRadius: 0.8,           // 카트 충돌 원 반지름(차체 1.8×1.1 m: 0.55 면 옆이 딱 맞고, 1.06 이면 차체 전체를 덮음)
  bodyHeight: 0.9,           // 카트의 키(m) — 머리 위 판(다리 밑면)에 닿는지, 다른 층의 벽인지 볼 때 쓴다
  wallSkin: 0.005,           // 벽에서 띄우는 틈
  wallImpactLoss: 0.4,       // 부딪힌 순간 접선 속도를 줄이는 비율 × sin(부딪힌 각). 15° → 약 10% 줄어듦
  wallImpactMin: 1,          // 벽 안쪽으로 이 속도 이상일 때만 위의 손실을 준다
  wallRubDecel: 1.5,         // 벽에 비비는 동안 감속
  wallRubPerSpeed: 0.1,      //   〃 속도 비례(1/s)
  wallAlignTime: 0.12,       // 벽에 닿으면 차체 방향을 벽을 따라 돌리는 시정수(붙어 멈춤 방지)
  wallPivotRate: 2,          // 멈춘 채 앞이 벽에 박혀 가속하면 차체를 벽 따라 돌리는 빠르기(rad/s)
  wallBounce: 0.15,          // 세게 부딪히면 벽에서 튕겨 나오는 비율
  shoveTime: 0.3,            // 몸싸움으로 튕겨 난 속도(state.shoveX · shoveZ)가 사그라드는 시간(초) — 그동안 주행 속도에 더해 움직인다
  wallBoostCancel: 9,        // 벽 안쪽으로 이 속도 이상 부딪히면 부스트가 끝난다(첫 판은 4 — 살짝 스쳐도 꺼졌다)
  wallDriftBlock: 0.15,      // 벽에 닿은 뒤 이 시간 동안 드리프트를 다시 시작하지 못한다

  // ── 지형 ──
  gravity: 9.81,
  wheelBase: 1.3,            // 앞뒤 바퀴 간격(기울기 계산)
  track: 0.84,               // 좌우 바퀴 간격(기울기 계산)
  slopeProbe: 0.5,           // 경사를 읽을 때 앞뒤로 보는 거리
  airGap: 0.04,              // 지면보다 이만큼 위면 공중(조향 · 가속 · 게이지가 멈춘다)
  groundHold: 7,             // 접지 유지: 땅이 이 빠르기(m/s)보다 느리게 꺼지면 뜨지 않고 따라 내려간다. 지형의 잔 꺾임 · 완만한 마루에서는 안 뜨고,
                             //   점프대 끝 · 다리 가장자리처럼 뚝 끊기는 곳에서만 뜬다(141 km/h 로 10° 꺾임까지 붙어 간다). 0 이면 끈다(그 전의 움직임)
  climbSlopeMax: 0.8,        // 바퀴 밑 지면이 이보다 가파르게(높이 ÷ 움직인 거리) 솟으면 비탈이 아니라 턱이다 → 벽처럼 막는다(0.8 = 39°, 점프대는 0.6 까지)
  stepMin: 0.05,             // 이 높이보다 낮은 턱은 그냥 넘는다
  stepBounce: 0.15,          // 턱에 부딪혔을 때 되튀는 속도 비율
  tiltTime: 0.08,            // 화면용 pitch · roll 평활 시정수
  airPitch: 0.7,             // 떠 있을 때 코끝이 날아가는 방향을 따르는 비율(0 이면 수평 유지)
};
