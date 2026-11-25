// 출발 가속 판정 — 출발 신호가 난 시각(goAt)의 앞뒤 windowMs 안에 '다시 밟기' 신호가 새로 켜졌는가(시각은 전부 performance.now() ms).
//   'grant' 준다 · 'wait' 아직 받을 수 있다 · 'closed' 끝났다
// 누른 시각이 구간 안이면, 화면이 늦게 그려져 지금이 구간을 지났어도 준다(누른 것을 먼저 본다).
export function startBoostDue({ goAt, windowMs, kickAt, now }) {
  if (!(windowMs > 0)) return 'closed';
  if (kickAt >= goAt - windowMs && kickAt <= goAt + windowMs) return 'grant';
  return now > goAt + windowMs ? 'closed' : 'wait';
}
