// 코스 B 의 이름 붙은 구간(자료만 — 계산 없음). 길가 표지판(signs.js)이 쓰고, 나중에 화면 · 무전도 같이 쓴다.
// 코스 묶음 구조(reports/2026-11-23_코스구조_설계.md §2)의 sections 칸으로 옮겨 갈 자리.
//   from · to = 출발선부터 거리(m, 코너는 course-b.js corners 의 시작 · 끝 점), kind = corner | straight | bridge | pit
//   sign.s = 표지판을 세우려는 거리(m) — 자리가 막혀 있으면 signs.js 가 조금 앞뒤로 옮긴다, sign.side = 진행 방향 'right' | 'left'
// 2026-11-25 다듬은 B 2단계: 길이 바뀌어(로터리 +37 m · 언더우드 정원 +52 m) 자리를 새 코스에 맞췄고, '언더우드 정원'(새 길)을 더했다.
// 이름은 사용자가 고른 것(2026-11-23, 시안/연세표시_고르기) — 가장 가까운 실제 장소(지도 윤곽까지 잰 거리, 시안/연세표시_src/measure.mjs).
export default [
  { id: 'baekyang-junction', name: '백양로삼거리', from: 68, to: 82, kind: 'corner', sign: { s: 30, side: 'right' } },              // 백양로삼거리 정류장 4 m
  { id: 'cheongsong-junction', name: '청송대삼거리', from: 372, to: 446, kind: 'corner', sign: { s: 336, side: 'right' } },       // 청송대삼거리 정류장 11 m — 2단계: 로터리(반 바퀴 + 나가는 오른쪽 꺾임)
  { id: 'daewoo-spiral', name: '대우관 회오리', from: 603, to: 697, kind: 'bridge', sign: { s: 549, side: 'right' } },            // 대우관 별관 78 m · 본관 89 m
  { id: 'billingsley-corner', name: '빌링슬리 코너', from: 799, to: 827, kind: 'corner', sign: { s: 759, side: 'right' } },       // 빌링슬리관 78 m
  { id: 'underwood-front', name: '언더우드관 앞', from: 1002, to: 1084, kind: 'straight', sign: { s: 977, side: 'right' } },      // 언더우드관 7 m — 2단계: 내리막 점프 + 왼쪽 급커브
  { id: 'underwood-garden', name: '언더우드 정원', from: 1134, to: 1240, kind: 'corner', sign: { s: 1102, side: 'right' } },     // 2단계 새 길: 정원 가운데 원 둘레 반 바퀴 + 나와서 왼쪽으로 꺾어 옛 길
  { id: 'library-hairpin', name: '중앙도서관 헤어핀', from: 1389, to: 1423, kind: 'corner', sign: { s: 1351, side: 'right' } },   // 중앙도서관 55 m
];
