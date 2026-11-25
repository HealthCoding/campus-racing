// 묶은 코스 D 의 이름 붙은 구간(첫 판 — 표지판 넷만. 2단계에 다듬는다). 형식은 course-b.sections.js 머리말(from · to · sign.s = 출발선부터 m).
// 이름은 가장 가까운 실제 장소(작업자가 정함 — 사용자가 바꿀 수 있다).
export default [
  { id: 'science-overpass', name: '과학관 앞 고가', from: 538, to: 706, kind: 'bridge', sign: { s: 500, side: 'right' } },
  { id: 'amph-rim', name: '노천극장', from: 1356, to: 1456, kind: 'bridge', sign: { s: 1196, side: 'right' } },
  { id: 'gym-split', name: '체육관 갈림길', from: 1980, to: 2000, kind: 'corner', sign: { s: 1950, side: 'right' } },
  { id: 'eng-alley', name: '공대 골목', from: 2180, to: 2290, kind: 'straight', sign: { s: 2150, side: 'right' } },
];
