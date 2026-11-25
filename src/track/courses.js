// 코스 목록 — 게임이 고를 수 있는 코스는 여기 한 곳에 적는다(주소 ?course=<id>, 없으면 DEFAULT_COURSE).
//   course = 트랙 생성물(도구/build-track.mjs, 약속 3.7) · partsData = 부품 · pitData = 피트(null 이면 없음) · sections = 이름 붙은 구간
//   laps = 모드별 바퀴 수(그랑프리 gp — 2026-11-25 스피드전을 뺐다. 한 판이 3 ~ 4분 안쪽: 상대 '어려움' 1등 시간으로 정함 — 검증/gp-laps-measure.mjs)
//   label = 시작 화면 '코스' 칸의 짧은 이름
//   cameraIgnore = 추격 카메라가 무시할 건물 상자 id(main.js 의 blocked) · lampIgnore · lampOver = 언제나 · 공중 구간 위에서 가로등이 무시해도 되는 건물 상자 id(src/world/lamps.js) · 배경 주행의 처음 자리(s, m — 없으면 B 의 965 · 905. 코스가 그보다 짧으면 꼭 적는다)
//   show = 시작 화면에 내 차를 세우는 자리 · 배경 주행이 시작하는 자리(s, m — 없으면 965 · 905. 2026-11-25 다듬은 B 2단계로 B 의 언더우드관 앞이 +37 m 옮겨 코스마다 둠)
//   props = 부딪히면 날아가는 소품의 자리(화면만 — src/track/fly-props.js. trialVersion 에 안 든다)
//   damageScale = 그랑프리에서 벽에 부딪혀 잃는 차 상태의 배수(없으면 1 — carstate.js 가 잃는 양에 곱한다. 경주판 raceVersion 에 담긴다 — 1 이면 안 담아 B 의 판이 그대로)
//   moves = 넓힌 길(2026-11-24 14 m)에 먹힌 캠퍼스 물건을 새 길가로 옮기는 표(생성물 course-<id>.moves.js — 도구/build-campus-moves.mjs, 쓰는 곳 main.js → campus.moveGroundInstances)
// 코스가 두셋인 동안은 JS 모듈 그대로 둔다(2026-11-24 — 공개 직전이라 B 를 흔들지 않으려고. 설계안의 courses/ JSON 묶음은 미룸).
import courseB from './course-b.js';
import partsB from './course-b.parts.js';
import pitB from './course-b.pit.js';
import sectionsB from './course-b.sections.js';
import movesB from './course-b.moves.js';

// 코스 D(2026-11-25 묶은 코스 — 2.3 km 라 자료가 크다): 브라우저에서는 그 코스를 고른 주소(?course=D)일 때만 자료를 받는다(첫 방문 양).
//   Node(서버의 다시 계산 · 시험 · 도구)는 늘 받는다. 브라우저에서 고르지 않은 채 D 의 자료가 필요하면(검증) 먼저 await loadCourse('D').
const loadD = async () => {
  const [course, parts, pit, sections, moves, branch] = await Promise.all([import('./course-d.js'), import('./course-d.parts.js'), import('./course-d.pit.js'), import('./course-d.sections.js'), import('./course-d.moves.js'), import('./course-d.branch.js')]);
  return { course: course.default, partsData: parts.default, pitData: pit.default, sections: sections.default, moves: moves.default.moves, branch: branch.default };
};
const LAZY_D = typeof location !== 'undefined' && !/[?&]course=d(?:&|$)/i.test(location.search || '');
const dataD = LAZY_D ? { course: null, partsData: null, pitData: null, sections: [], moves: [], branch: null } : await loadD();

export const COURSES = [
  { id: 'B', name: '언더우드 · 청송대', label: '언더우드', course: courseB, partsData: partsB, pitData: pitB, sections: sectionsB, moves: movesB.moves, laps: { gp: 4 }, show: { at: 1002, attract: 942 } },
  // 코스 D(2026-11-25 묶은 코스 — 노천극장 롤러코스터 + 공대 골목 + 백양로 일부, 경로 안 B '8 자 · 과학관 앞 고가'): 2,345 m.
  //   그랑프리 3바퀴 = 상대 '어려움' 1등 3분 50초 안팎(사용자 기준 3 ~ 4분). branch = 체육관 지름길(막아 둔 갈래 — src/track/branch.js 가 그리기만).
  //   cameraIgnore: 모델 상자가 길까지 덮는 건물(길과 실제 모델은 게임 3D 발자국으로 재서 떨어져 있다 — 시안/묶은코스_src/clash.mjs). lampIgnore 도 같은 까닭. lampOver: 상판이 그 위를 지나는 노천극장.
  //   pit = '가 출발선 뒤 오른쪽'(course-d.pit.js) · damageScale 1.5(2026-11-25 사용자가 시안에서 고름 — 3바퀴라 B 보다 피트에 들를 까닭이 적어서: 바퀴마다 한 번 박는 사람은 들를지 반반, 두 번이면 들르는 게 8초 빠르다)
  { id: 'D', name: '캠퍼스 롤러코스터', label: '롤러코스터', ...dataD, laps: { gp: 3 }, damageScale: 1.5,
    show: { at: 1421, attract: 2260 }, lampOver: ['amphitheater'],
    // props = 부딪히면 날아가는 소품(2026-11-25 재미 손질 — src/track/fly-props.js, 보이기만 한다: 코스판에 안 든다). 굽이를 나와 바깥으로 흐르는 자리의 길 가장자리.
    props: [
      { s: 138, side: 'left', kind: 'cone', count: 4 }, { s: 254, side: 'right', kind: 'cone', count: 3 }, { s: 358, side: 'right', kind: 'box', count: 3 },
      { s: 458, side: 'left', kind: 'cone', count: 4 }, { s: 812, side: 'right', kind: 'box', count: 5 }, { s: 1588, side: 'right', kind: 'box', count: 3 },
      { s: 1650, side: 'left', kind: 'cone', count: 4 }, { s: 2066, side: 'left', kind: 'cone', count: 4 }, { s: 2112, side: 'left', kind: 'box', count: 3 },
    ],
    lampIgnore: ['science', 'appenzeller', 'baekyang', 'samsungHall', 'gym', 'eng4', 'business', 'scienceCenter', 'music'],
    cameraIgnore: ['amphitheater', 'science', 'appenzeller', 'baekyang', 'samsungHall', 'gym', 'eng4', 'business', 'scienceCenter', 'music'] },
];
export const DEFAULT_COURSE = 'B';

// 모르는 id · 빈 값이면 기본 코스(던지지 않는다 — 주소를 잘못 쳐도 게임은 뜬다). 대소문자는 가리지 않는다.
export function courseOf(id) {
  const key = String(id ?? '').trim().toUpperCase();
  return COURSES.find(c => c.id === key) || COURSES.find(c => c.id === DEFAULT_COURSE);
}

// 브라우저에서 늦게 받는 코스의 자료를 채운다(이미 있으면 그대로) — 검증 · 개발용.
export async function loadCourse(id) {
  const c = courseOf(id);
  if (c.id === 'D' && !c.course) Object.assign(c, await loadD());
  return c;
}
