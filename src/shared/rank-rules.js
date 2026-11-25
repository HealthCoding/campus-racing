// 랭킹의 약속 — 손님(src/rank.js · src/hud/ranking.js)과 서버(server/)가 같이 쓰는 한 곳. 브라우저 · Node 어디서나 도는 순수 모듈이다(DOM · three 없음).
// 정한 것(2026-11-24 사용자 "다 추천대로 진행하자"): 타임어택 기록 · 코스별 · 등급은 '아주 빠름'만 · 차는 자유 · 닉네임 직접 + 단과대는 고르고 싶은 사람만.
//   조작 걸러 내기는 처음부터(서버가 입력으로 다시 계산 — src/race/verify-run.js) · 같은 닉네임 허용(꼬리표로 구별) · 내 기록은 내가 지운다.
//
//   기록은 2026-11-24 사용자 "랭킹이 한바퀴 기준인데, 3바퀴로 하면 좋을듯" 에 따라 '서서 출발한 3바퀴 합계'(출발 신호부터 3바퀴째 결승선까지 — time-trial.js 의 TRIAL_LAPS).
//   자료의 이름 lapMs 는 1바퀴 때 그대로 두었다 — 값은 그 합계(ms)다.
// ---- 주소와 자료의 모양(v1). 시간은 모두 정수 ms(lapMs = 3바퀴 합계), 단과대 · 차는 id(화면이 이름으로 바꾼다).
//   Row = { rank, name, tag, college | null, car, lapMs }      tag = playerId 앞 4자. 답의 줄에서 이름과 4자까지 겹치는 사람은 앞 8자.
//   playerId = sha256(key) 16진 앞 16자. key = 브라우저가 crypto.getRandomValues 로 만든 128비트(16진 32자) — 가진 사람만 그 기록을 바꾸거나 지운다.
//   판(board) = course + ':' + courseVer + ':' + klass.  courseVer = src/race/time-trial.js 의 trialVersion(course) — 코스 · 계산이 바뀌면 달라져 새 판이 된다.
//   경주 랭킹(2026-11-24 사용자 "경주 랭킹은 공개 전에 넣어야지 · 피트가 없는 코스도 순위표 — 모드별로 하나씩 · 차는 자유 · 어려움 고정"): 표는 코스마다 모드 둘(time · gp — 2026-11-25 스피드전 race 를 뺐다).
//     경주의 판 = course + ':' + raceVersion(course, mode) + ':' + mode(gp) — src/race/race-run.js. 경주 기록 = 출발 신호부터 마지막 바퀴 결승선까지(ms) + 그 경주의 등수(place 1 ~ 8).
//     경주 표에는 상대 난이도 '어려움'(RACE_LEVEL)에서 달린 판만 오른다. 본문 · 질의에 mode(없으면 time) · 경주면 level 이 든다.
//
//   POST /api/runs        { v: 1, course, courseVer, klass, car, key, nick, college | null, run, mode?(time | gp — 없으면 time), level?(경주면 RACE_LEVEL) }      run = 주행 기록. 모양 · 길이가 맞으면 예산을 세고 다시 계산한다.
//     → 200 { ok: true, id: playerId, sig?(서버에 비밀이 있으면 16자 hex), lapMs(서버가 센 값, 건너뛰면 null), improved, best(내 판 최고 ms), rank, total, up(전 순위 − 새 순위, 처음이면 0), rows: Row[](위쪽 다섯), near: Row[](내 앞 · 나 · 뒤 — 위쪽 다섯과 이어지면 rows 에 합침) }
//   GET  /api/board?course=B&mode=time|gp&scope=all|college&college=<id>&limit=100      (mode 를 안 주면 time)
//     → 200 { ok: true, course, mode, courseVer, klass, scope, college | null, total(그 범위 사람 수), rows: Row[] }      인스턴스 15초 · 공용 캐시 30초. 경주 표의 Row 에는 place(그 경주의 등수)가 더 붙는다.
//   GET  /api/me?course=B&mode=…&id=<playerId>&sig=<서명>&scope=all|college&college=<id>
//     → 200 { ok: true, me: Row | null }      비밀을 둔 서버는 올바른 서명으로만 읽는다(없거나 틀리면 null). 인스턴스 5초. rank 는 그 범위 안의 순위.
//   POST /api/me          { key, nick, college | null }      → 200 { ok: true }                내 기록 전부의 이름 · 단과대를 바꾼다
//   POST /api/me/delete   { key }                            → 200 { ok: true, removed }       내 기록 전부를 지운다
//   틀렸을 때: HTTP 4xx · 5xx + { ok: false, code, detail? }
//     code: 'shape'(400 모양 · 크기) · 'version'(409 코스판이 다름 — 새로 고침) · 'rejected'(422 다시 계산이 안 맞음) · 'name'(422 쓸 수 없는 닉네임 — detail 에 화면에 쓸 한 줄)
//           · 'rate'(429, detail 없음 = 횟수 제한 · closed = 제출 닫음 · budget = 월/일 예산 · busy = 같은 사람 처리 중) · 'origin'(403 허용되지 않은 출처의 쓰기) · 'server'(500)

export const RANK_API_VERSION = 1;
export const RANK_MODES = ['time', 'gp'];   // 표의 갈래: 타임어택 · 그랑프리(2026-11-25 스피드전 race 를 뺐다 — 서버도 모르는 모드로 400)
export const RACE_LEVEL = 'hard';                   // 경주 표에 오르는 상대 난이도(src/race/race.js 의 LEVELS — 사용자 2026-11-24 "어려움 고정")
export const PLACE_MAX = 8;                         // 경주의 등수(상대 일곱 + 나)
// 손님이 표 하나를 부르는 이름: 타임어택은 코스 id 그대로('B'), 경주는 'B/gp'(저장 키 · 대기 자리에 쓴다 — 서버에는 course 와 mode 로 나눠 보낸다)
export const boardIdOf = (course, mode = 'time') => !mode || mode === 'time' ? String(course) : course + '/' + mode;
export function splitBoardId(id) { const [course, mode = 'time'] = String(id ?? '').split('/'); return { course, mode: RANK_MODES.includes(mode) ? mode : null }; }
export const RANK_CLASS = 'faster';      // 순위에 오르는 속도 등급(classes.js 의 id)
export const NAME_MAX = 8;               // 닉네임 글자 수(시안: 여덟 글자까지)
export const RUN_MAX_BYTES = 192 * 1024; // 제출 하나의 크기 상한(JSON 본문) — 넘으면 다시 계산하기 전에 거절. 3바퀴(2026-11-24): 가장 긴 판(9분)을 매 틱 다른 입력으로 짧은 표기에 담아도 들어가는 값(잰 값은 docs 3.31)

// 단과대: 연세대 공식 홈페이지 '입학 · 교육 > 대학'(https://www.yonsei.ac.kr/sc/186/subview.do — 2026-11-24 확인)의 19개, 순서도 그 페이지 그대로.
//   id = 서버에 남는 값(한 번 정하면 안 바꾼다) · name = 화면에 쓰는 짧은 이름(공식 이름에서 끝의 '학'만 뺀 것) · full = 공식 이름.
//   사용자 확인 전이다(넣을 대학 · 줄임말). 고르지 않는 것이 기본이라 목록에 '기타'는 두지 않았다.
export const COLLEGES = [
  { id: 'liberal', name: '문과대', full: '문과대학' },
  { id: 'commerce', name: '상경대', full: '상경대학' },
  { id: 'business', name: '경영대', full: '경영대학' },
  { id: 'science', name: '이과대', full: '이과대학' },
  { id: 'engineering', name: '공과대', full: '공과대학' },
  { id: 'life', name: '생명시스템대', full: '생명시스템대학' },
  { id: 'ai', name: '인공지능융합대', full: '인공지능융합대학' },
  { id: 'theology', name: '신과대', full: '신과대학' },
  { id: 'social', name: '사회과학대', full: '사회과학대학' },
  { id: 'music', name: '음악대', full: '음악대학' },
  { id: 'human', name: '생활과학대', full: '생활과학대학' },
  { id: 'education', name: '교육과학대', full: '교육과학대학' },
  { id: 'university', name: '학부대', full: '학부대학' },
  { id: 'underwood', name: '언더우드국제대', full: '언더우드국제대학' },
  { id: 'global', name: '글로벌인재대', full: '글로벌인재대학' },
  { id: 'medicine', name: '의과대', full: '의과대학' },
  { id: 'dentistry', name: '치과대', full: '치과대학' },
  { id: 'nursing', name: '간호대', full: '간호대학' },
  { id: 'pharmacy', name: '약학대', full: '약학대학' },
];
export const collegeOf = id => COLLEGES.find(c => c.id === id) || null;

// 닉네임: 앞뒤 빈칸을 떼고 NFC 로 맞춘 뒤 1 ~ NAME_MAX 글자, 한글 완성형 · 영문 · 숫자만(빈칸 · 기호 · 낱자 · 이모지 불가).
//   운영을 사칭하는 낱말이 들어 있으면 안 된다. 욕설 목록은 서버만 갖는다(server/ — 손님에게는 '쓸 수 없는 이름이에요' 한 줄로 돌아온다).
export const RESERVED_NAMES = ['운영자', '운영진', '관리자', '개발자', 'admin', 'administrator', 'operator', 'staff'];
export const cleanName = raw => String(raw ?? '').normalize('NFC').trim();
// 예약어와 금칙어는 같은 글자끼리 견준다(끼워 넣은 숫자 · 기호 · 영문 대소문자를 무시).
const nameLetters = text => text.toLowerCase().replace(/[^가-힣a-z]/g, '');
const count = text => [...text].length;   // 글자 수는 낱자가 아니라 글자로
// 돌려주는 것: ''(괜찮음) 또는 화면에 그대로 쓰는 한 줄.
export function checkName(raw, { max = NAME_MAX, blocked = RESERVED_NAMES } = {}) {
  const text = cleanName(raw);
  if (!text) return '닉네임을 적어 주세요';
  if (count(text) > max) return max + '글자까지예요';
  if (!/^[가-힣A-Za-z0-9]+$/.test(text)) return '한글 · 영문 · 숫자만 돼요';
  const letters = nameLetters(text);
  if (blocked.some(word => {
    const term = nameLetters(String(word ?? ''));
    return term && letters.includes(term);
  })) return '쓸 수 없는 이름이에요';
  return '';
}
// 열쇠 · 사람 id 의 모양(값이 맞는지는 서버가 본다)
export const isKey = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
export const isPlayerId = value => typeof value === 'string' && /^[0-9a-f]{16}$/.test(value);
