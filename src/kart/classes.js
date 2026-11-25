// 속도 등급 — 같은 카트 조정값(params.js)에서 최고속과 가속만 올린 묶음. 시승하면서 어느 쪽이 맞는지 고르려고 둔다.
// 회전반경은 속도의 제곱으로 커지므로, 등급이 높을수록 코너에서 감속하거나 드리프트해야 한다.
import { KART } from './params.js';
import { applyKart, DEFAULT_KART } from './karts.js';
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
