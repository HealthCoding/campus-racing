// 게임 화면 위 표시: 기록 · 순위 탑(LAP · 시간 · 순위 줄) · 속도 · 게이지 · 미니맵 · 출발 신호등 · 알림, 그리고 불러오는 중 · 시작 화면 · 멈춤 판 · 결과 화면.
// 모양은 경주 중계의 결(hud.css). 글자는 꼭 필요한 것만. 숫자는 바뀔 때만 다시 쓴다(매 프레임 DOM 을 건드리지 않게).
// 타임어택 결과의 바퀴별 시간 줄: '1바퀴 0:52.65 · 2바퀴 … · 3바퀴 …'(가장 빠른 바퀴는 data-best) + (못 넘은 판이면) '최고 2:38.12'. 랭킹의 결과 판(ranking.js)도 같은 줄을 쓴다.
import { OFFICIAL_URL } from '../shared/official.js';
export function lapLines(laps, best = null) {
  const list = Array.isArray(laps) ? laps.filter(Number.isFinite) : [], fastest = list.length > 1 ? Math.min(...list) : null;
  const spans = list.map((t, i) => '<span' + (t === fastest ? ' data-best="true"' : '') + '><i>' + (i + 1) + '바퀴</i>' + lapText(t) + '</span>');
  if (Number.isFinite(best)) spans.push('<span><i>최고</i>' + lapText(best) + '</span>');
  return spans.length ? '<div class="hud-result-lines">' + spans.join('') + '</div>' : '';
}
export const lapText = seconds => {
  if (seconds == null || !(seconds >= 0) || !isFinite(seconds)) return '-:--.--';
  const whole = Math.floor(seconds * 100 + 1e-6), m = Math.floor(whole / 6000), s = Math.floor(whole / 100) % 60, c = whole % 100;
  return m + ':' + String(s).padStart(2, '0') + '.' + String(c).padStart(2, '0');
};
// ---- 공유 포토카드(2026-11-24 사용자가 시안에서 정함 — 카드 셋 A 포토카드 · B 레이스 기록지 · C 스토리를 옆으로 넘겨 고른다). 판 · 카드 그리기는 src/hud/share.js(누를 때 불러온다 — 첫 방문에 받는 양을 늘리지 않게).
//   여기는 그 입구다. 결과 화면(아래 result() · ranking.js 의 결과 판)은 순위 줄 오른쪽 끝에 SHARE_BUTTON 을 두고:
//     shareMoment()       결과가 처음 뜰 때 — 그 순간의 장면(B · C 의 사진, 다음 그림에서 뜬다)과 판의 정보(main 의 info())를 묶어 둔다
//     openShare(data)     '공유'를 눌렀을 때 — 공유 판을 연다(data 의 꼴은 share.js 머리)
//     shareUpdate(data)   같은 결과의 내용이 바뀌었을 때(순위가 채워짐) — 판이 열려 있으면 카드를 다시 그린다
//     shareClose()        결과를 치울 때 · shareOpen() 판이 열려 있는가(결과 화면의 키 처리가 비켜 선다)
//   게임 쪽 손잡이는 main.js 가 shareWith({ snap, showroom, info }) 로 준다: snap() → Promise<캔버스> · showroom() → Promise<캔버스> · info() → { mode, course: { id, name }, car, laps, nick }.
let shareCtx = null, shareShot = null, shareInfo = null, shareMod = null, shareLoad = null;
export const SHARE_BUTTON = '<button type="button" class="hud-share"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 12v9h14v-9"/></svg>공유</button>';
export function shareWith(ctx) { shareCtx = ctx || null; }
export function shareMoment() {
  let info = {}; try { info = shareCtx?.info?.() || {}; } catch (e) { console.error('공유 정보를 못 읽음', e); }
  shareInfo = { ...info, at: Date.now() };
  shareShot = null; try { shareShot = shareCtx?.snap?.() || null; shareShot?.catch?.(() => {}); } catch (e) { console.error('장면을 못 뜸', e); }
}
const shareData = data => { if (!shareInfo) shareMoment(); return { ...shareInfo, ...data, scene: shareShot, showroom: shareCtx?.showroom || null }; };
export function openShare(data = {}) {
  const merged = shareData(data);
  shareLoad ||= import('./share.js').then(m => (shareMod = m)).catch(e => { shareLoad = null; throw e; });
  return shareLoad.then(m => m.open(merged)).catch(e => console.error('공유 판을 못 엶', e));
}
export function shareUpdate(data = {}) { if (shareMod?.isOpen()) shareMod.update(shareData(data)); }
export function shareClose() { shareMod?.close(); shareInfo = null; shareShot = null; }
export const shareOpen = () => !!shareMod?.isOpen();

const el = (tag, cls, html = '') => { const node = document.createElement(tag); if (cls) node.className = cls; if (html) node.innerHTML = html; return node; };
const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
// 순위표의 '나와의 차'(초): 앞선 카트는 −, 뒤는 +. 소수 한 자리.
const gapLabel = gap => { const r = Math.round(gap * 10) / 10; return (r < 0 ? '−' : '+') + Math.abs(r).toFixed(1); };
// 차 숫자는 떨리지 않게 이 간격(ms)보다 자주 다시 쓰지 않는다(1초에 4번).
const GAP_EVERY = 250;
// 결과 화면이 뜬 직후의 키 · 누름은 받지 않는다(결승선을 넘으며 누르던 부스트 키나 터치 단추가 바로 '다시' · '처음'이 되지 않게).
const RESULT_INPUT_DELAY = 700;
const modified = event => event.metaKey || event.ctrlKey || event.altKey;
const textField = node => node?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(node?.tagName);
// 이름 'CAMPUS RACING'(2026-11-24 사용자 — "공개 전에 좀 일반적으로", 시안 B. 그 전 이름은 'YONSEI RACING'(11-23)). 굵은 이탤릭 두 줄 + 남색 · 밝은 회색 연석 띠 + 무대 한 줄 'YONSEI · SINCHON'(어느 캠퍼스인지는 이 줄이 말한다), 공식 로고 · 교표 없이 글자만. 불러오는 중 · 시작 화면이 같은 자리에 쓴다.
// 신호등 다섯(불러오는 중 · 출발 신호)
// 지도 출처(2026-11-23 — 캠퍼스의 건물 · 길과 코스는 OpenStreetMap 자료로 만들었다): 시작 화면에 늘 보이는 한 줄. 'OpenStreetMap' 이 저작권 안내(자료가 ODbL 로 열려 있다는 것)로 가는 링크다. 자리는 hud.css 의 .hud-osm.
const OSM = '©&nbsp;<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
// 만든 사람(2026-11-25 사용자가 시안에서 고른 '시작 화면 A'): 지도 출처 줄을 '© 2026 HealthCoding · © OpenStreetMap' 한 줄로.
//   'HealthCoding' 을 누르면 제작 정보 판(아래 credits — 시안 '판 B'). 'OpenStreetMap' 링크는 그대로.
const CREDIT_OSM = '©&nbsp;2026&nbsp;<button type="button" class="hud-credit-open" aria-haspopup="dialog">HealthCoding</button>'
  + '<span class="hud-osm-sep" aria-hidden="true">·</span>' + OSM;
// 제작 정보 판의 글(docs/제작정보_초안.md — LICENSE · NOTICE.md 와 같은 뜻). 연락은 공개용 메일 하나.
//   2026-11-25 이용 조건을 '출처를 밝히면 비상업으로 자유'로 바꿨다(코드 PolyForm Noncommercial 1.0.0 · 3D · 그림 · 소리 · 음악 CC BY-NC 4.0, 지도 좌표 ODbL, 플레이 영상 · 방송은 수익이 나도 자유). 아래 줄의 '전체 이용 조건 · 출처' = 묶음 맨 위의 license.html(LICENSE + NOTICE.md 로 만든다).
//   주소는 './' 없이 — 판의 링크는 문서(index.html) 자리로 풀리지만, 묶음 도구의 참조 검사는 './' 로 시작하는 글을 이 파일(src/hud/) 자리로 풀기 때문.
export const CREDIT_MAIL = 'healthcoding15@gmail.com';
export const CREDIT_FULL = 'license.html';
// 공개 저장소(2026-11-26 사용자 "넣자" — 게임에서 코드로 가는 길이 이용 조건 페이지 안쪽뿐이었다). 가져다 자기 학교 버전을 만들 사람이 여기로 온다.
export const CREDIT_CODE = 'https://github.com/HealthCoding/campus-racing';
const ODBL = 'https://opendatacommons.org/licenses/odbl/1-0/';
// 판의 출처 적는 법에 보이는 원본 주소(공식 주소는 src/shared/official.js 한 곳에만 — 검증/official-url.test.mjs)
const SITE = OFFICIAL_URL.replace(/^https?:\/\//, '');
const CREDITS = '<div class="hud-cr-panel" tabindex="-1"><div class="hud-cr-head"><h2>제작 정보</h2>'
  + '<button type="button" class="hud-cr-close">닫기<kbd>ESC</kbd></button></div><div class="hud-cr-body">'
  + '<section class="hud-cr-who"><small>만든 사람</small><b>HealthCoding</b>'
  + '<span>© 2026 HealthCoding</span><p>학교와 관계없는 개인 프로젝트예요.</p></section>'
  + '<section class="hud-cr-terms"><div class="hud-cr-col"><small>되는 것</small><ul>'
  + '<li>게임하기 · 링크 공유</li><li>플레이 화면 · 영상 · 방송 · 후기 — 수익이 나는 것도</li><li>출처를 밝히고 고쳐 쓰기 · 다시 올리기 — 비상업</li><li>자기 학교 버전 만들기</li></ul></div>'
  + '<div class="hud-cr-col no"><small>안 되는 것</small><ul>'
  + '<li>허락 없이 상업적으로 쓰기 — 판매 · 광고 등</li><li>출처 표시 지우기</li><li>내가 만든 것처럼 올리기</li><li>공식판인 척하기</li></ul></div>'
  + '<p class="hud-cr-scope">출처는 \'Campus Racing © 2026 HealthCoding · ' + SITE + '\' 처럼 적어요.<br>코드는 PolyForm Noncommercial 1.0.0, 3D · 그림 · 소리 · 음악은 CC BY-NC 4.0 이에요.</p></section>'
  + '<section class="hud-cr-src"><small>출처</small><ul>'
  + '<li><span>지도</span><div>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · '
  + '<a href="' + ODBL + '" target="_blank" rel="noopener">ODbL 1.0</a><i class="hud-cr-odbl">지도에서 온 좌표는 ODbL 로 이용할 수 있어요</i></div></li>'
  + '<li><span>캠퍼스 3D</span><div>Beat the School · HealthCoding</div></li>'
  + '<li><span>3D 엔진</span><div>three.js · 모델 디코더 meshoptimizer · MIT</div></li>'
  + '<li><span>글꼴</span><div>Saira · SIL OFL 1.1</div></li>'
  + '<li><span>소리 · 배경음악</span><div>게임이 직접 합성</div></li></ul></section>'
  + '<p class="hud-cr-foot"><a class="hud-cr-full" href="' + CREDIT_FULL + '" target="_blank" rel="noopener">전체 이용 조건 · 출처</a>'
  + '<a class="hud-cr-code" href="' + CREDIT_CODE + '" target="_blank" rel="noopener">코드 (GitHub)</a>'
  + '<span class="hud-cr-mail"><a href="mailto:' + CREDIT_MAIL + '">이용 허락 문의 · 제보</a><em>' + CREDIT_MAIL + '</em></span></p></div></div>';
const TITLE = '<h1 class="hud-mark" aria-label="Campus Racing"><span>CAMPUS</span><span>RACING</span></h1><div class="hud-mark-kerb">' + '<i></i>'.repeat(9) + '</div><p class="hud-mark-stage">YONSEI · SINCHON</p>';
const LAMPS = '<i></i>'.repeat(5);
// 켜진 불의 수를 바꾼다(0~5). 같은 값이면 DOM 을 안 건드린다
function setLamps(box, n) {
  n = String(Math.max(0, Math.min(5, Math.floor(n) || 0))); if (box.dataset.lit === n) return;
  box.dataset.lit = n; for (let i = 0; i < box.children.length; i++) box.children[i].classList.toggle('on', i < +n);
}

export function createHud(root, { course }) {
  root.dataset.phase = 'loading';
  // 타임어택 바퀴 칸(2026-11-25 사용자가 고른 'BEST 밑에 한 줄'): 큰 시간 · BEST 는 그대로, BEST 줄 밑에 같은 결의 'LAP 2 / 3'. 타임어택일 때만(view.trialLap) — 경주는 순위 탑의 LAP 칸(.hud-lap)이 맡는다
  const time = el('div', 'hud-time live', '<b>0:00.00</b><span><i>BEST</i><em style="font-style:normal">-:--.--</em></span><span class="hud-lapline" hidden><i>LAP</i><em style="font-style:normal">1</em><small>/ 3</small></span>');
  const again = el('button', 'hud-again live', '다시'); again.type = 'button'; again.title = '출발선에서 다시 (R)';
  const pauseButton = el('button', 'hud-again hud-pause live', '멈춤'); pauseButton.type = 'button'; pauseButton.title = '멈춤 (Esc)';
  const buttons = el('div', 'hud-btns'); buttons.append(again, pauseButton); time.append(buttons);
  // 경주에서는 기록 묶음이 순위 탑이 된다(hud.css 의 #hud[data-race=on]): 맨 위 줄에 LAP(.hud-lap)과 시간, 그 밑에 순위표(.hud-board), 그 밑에 단추.
  // 순위표는 터치에서 내 줄 앞뒤만 보인다(줄마다 data-n3 · data-n5, hud.css 가 고른다). 큰 순위 숫자(.hud-place)는 설정에서 '숫자'를 골랐을 때.
  const board = el('ol', 'hud-board'); board.hidden = true;
  const place = el('div', 'hud-place', '<strong>-</strong><small>/ -</small>'), lapBox = el('div', 'hud-lap', '<small class="hud-lap-label">LAP</small><strong>1</strong><small class="hud-lap-of">/ -</small>');
  place.hidden = lapBox.hidden = true; time.append(board, place, lapBox);
  const map = el('canvas', 'hud-map live');
  const speed = el('div', 'hud-speed live', '<b>0</b><span>KM/H</span><div class="hud-boost"><div class="hud-gauge"><i></i></div><div class="hud-slots" hidden></div></div>');
  // 차 상태(데미지 모드에서만 보인다): 'CAR' + 칸 막대 + 숫자. 자리는 속도 위(터치 배치는 부스터 줄 밑). b · span 은 .hud-speed 의 규칙을 받으므로 small · em 을 쓴다.
  const car = el('div', 'hud-cond', '<small>CAR</small><div class="hud-condbar"><i></i></div><em>100</em>'); car.hidden = true; speed.prepend(car);   // 이름 주의: .hud-car 는 시작 화면의 '차' 단추다
  const carFill = car.querySelector('i'), carNumber = car.querySelector('em'); let carShown = null, carLevel = '', carTouch = null, carPit = null;
  const note = el('div', 'hud-note live'), count = el('div', 'hud-count hud-lights live', LAMPS), wrong = el('div', 'hud-wrong live', '반대 방향이에요');
  // 불러오는 중: 시작 화면과 같은 자리의 이름 + 가운데 신호등(읽은 만큼 켜진다)
  const cover = el('div', 'hud-cover', '<div class="hud-head">' + TITLE + '</div><div class="hud-lights">' + LAMPS + '</div>'); cover.setAttribute('role', 'status'); cover.setAttribute('aria-label', '불러오는 중');
  const result = el('div', 'hud-result'); result.hidden = true; result.setAttribute('role', 'dialog'); result.setAttribute('aria-label', '결과');
  const pausePanel = el('div', 'hud-pause-panel'); pausePanel.hidden = true; pausePanel.setAttribute('role', 'dialog'); pausePanel.setAttribute('aria-label', '멈춤');
  pausePanel.innerHTML = '<div class="hud-menu"><h2>멈춤</h2><div class="hud-pause-actions"><button type="button" class="hud-pause-resume">계속<kbd>ESC</kbd></button><button type="button" class="hud-pause-again">다시 시작<kbd>R</kbd></button><button type="button" class="hud-pause-back">메인 화면</button></div></div>';
  // 차 고르기 화면의 글자 층(장면은 src/garage.js): 이름 · 번호 / 전체 · 좌우 단추 · 이름표(번호 · 이름 · 성격) · 능력치 · 고르기 · 뒤로
  const garagePanel = el('div', 'hud-garage'); garagePanel.hidden = true; garagePanel.setAttribute('role', 'dialog'); garagePanel.setAttribute('aria-label', '차 고르기');
  garagePanel.innerHTML = '<div class="hud-g-head"><h1 class="hud-title">차 고르기</h1><div class="hud-kerb">' + '<i></i>'.repeat(7) + '</div></div><div class="hud-g-count"></div>'
    + '<button type="button" class="hud-g-arrow l" aria-label="앞 차"></button><button type="button" class="hud-g-arrow r" aria-label="다음 차"></button>'
    + '<div class="hud-g-plate"><div class="hud-g-name"></div><div class="hud-g-stats"></div></div>'
    + '<div class="hud-g-acts"><button type="button" class="hud-g-pick">이 차로<kbd>ENTER</kbd></button><button type="button" class="hud-g-back">뒤로<kbd>ESC</kbd></button></div>';
  root.append(time, map, speed, note, wrong, count, cover, garagePanel, result, pausePanel);
  // 제작 정보 판(시작 화면의 'HealthCoding' 이 연다): 화면을 어둡게 덮고 가운데 판 하나. 닫기 단추 · Esc · 바깥(어두운 곳) 누름으로 닫는다.
  const credits = el('div', 'hud-credits', CREDITS); credits.hidden = true;
  credits.setAttribute('role', 'dialog'); credits.setAttribute('aria-modal', 'true'); credits.setAttribute('aria-label', '제작 정보');
  root.append(credits);
  // 판 · 글자 칸에서 누른 브라우저 단축키는 기본 동작을 살리고 주행 키 처리기에만 넘기지 않는다.
  addEventListener('keydown', event => {
    if (modified(event) && (!cover.hidden || !garagePanel.hidden || !result.hidden || !pausePanel.hidden || textField(event.target) || textField(document.activeElement))) event.stopImmediatePropagation();
  }, true);
  const lapLine = time.querySelector('.hud-lapline'), lapLineNow = lapLine.querySelector('em'), lapLineOf = lapLine.querySelector('small');
  const nowText = time.querySelector('b'), bestText = time.querySelector('em'), speedText = speed.querySelector('b'), gauge = speed.querySelector('.hud-gauge'), fill = gauge.querySelector('i');
  const boostRow = speed.querySelector('.hud-boost'), slotBox = speed.querySelector('.hud-slots'), slotEls = []; let refillTimer = 0;
  const rankText = place.querySelector('strong'), kartsText = place.querySelector('small'), lapText_ = lapBox.querySelector('strong'), lapsText = lapBox.querySelector('.hud-lap-of');
  const shown = { now: '', best: '', speed: '', fill: -1, full: null, burn: null, slots: -1, stock: -1, refills: -1, kick: null, race: false, style: '', rank: '', karts: '', lap: '', laps: '', meAt: -1, trialLap: '' };
  // 모아 둔 부스터 칸: 개수가 바뀔 때만 다시 만든다. 글자는 넣지 않는다.
  function setSlots(n) {
    shown.slots = n; shown.stock = -1; slotBox.hidden = n <= 0; slotBox.textContent = ''; slotEls.length = 0;
    for (let i = 0; i < n; i++) { const slot = el('i', 'hud-slot'); slot.dataset.on = 'false'; slotBox.append(slot); slotEls.push(slot); }
  }
  // 순위표: 줄(li)은 자리 순서대로 두고, 자리마다 바뀐 칸만 다시 쓴다. 추월하면 줄의 내용이 옮겨 가고 내 줄이 짧게 튄다.
  const boardRows = []; let gapNext = 0;
  function drawBoard(list) {
    const rows = [...list].sort((a, b) => (a?.rank ?? 99) - (b?.rank ?? 99)), n = rows.length;
    while (boardRows.length < n) {
      const li = el('li', '', '<strong></strong><i></i><span></span><em></em>'); board.append(li);
      boardRows.push({ li, rankEl: li.children[0], chip: li.children[1], nameEl: li.children[2], gapEl: li.children[3], key: null, rank: null, name: null, colour: null, me: null, done: null, gap: null, n3: null, n5: null });
    }
    while (boardRows.length > n) boardRows.pop().li.remove();
    const now = performance.now(), gapDue = now >= gapNext; let ticked = false;
    const meAt = rows.findIndex(r => r?.me), centre = Math.max(0, meAt);
    // 터치용 창: 내 줄을 가운데에, 맨 앞 · 맨 뒤면 그쪽으로 붙여 같은 줄 수를 채운다
    const span = k => { const from = Math.max(0, Math.min(n - k, centre - Math.floor((k - 1) / 2))); return i => i >= from && i < from + k; };
    const in3 = span(3), in5 = span(5);
    rows.forEach((row, i) => {
      const slot = boardRows[i], name = String(row?.name ?? ''), colour = row?.colour || '#888', me = !!row?.me, done = !!row?.done;
      const key = name + '|' + colour, fresh = key !== slot.key; slot.key = key;
      const rank = String(row?.rank ?? i + 1);
      if (rank !== slot.rank) slot.rankEl.textContent = slot.rank = rank;
      if (name !== slot.name) slot.nameEl.textContent = slot.name = name;
      if (colour !== slot.colour) slot.chip.style.background = slot.colour = colour;
      if (me !== slot.me) { slot.me = me; slot.li.classList.toggle('me', me); if (!me) slot.li.classList.remove('bump'); }
      if (done !== slot.done) slot.li.dataset.done = String(slot.done = done);
      // 차: 내 줄 · 결승한 줄은 비운다. 같은 카트의 차는 GAP_EVERY 마다만, 자리에 다른 카트가 들어오면 바로 쓴다.
      const gap = me || done || !Number.isFinite(row?.gap) ? '' : gapLabel(row.gap);
      if (gap !== slot.gap && (fresh || gapDue || slot.gap === null || gap === '')) { slot.gapEl.textContent = slot.gap = gap; if (!fresh) ticked = true; }
      const n3 = String(in3(i)), n5 = String(in5(i));
      if (n3 !== slot.n3) slot.li.dataset.n3 = slot.n3 = n3;
      if (n5 !== slot.n5) slot.li.dataset.n5 = slot.n5 = n5;
    });
    if (ticked) gapNext = now + GAP_EVERY;
    if (meAt !== shown.meAt) {
      if (shown.meAt >= 0 && meAt >= 0) { const li = boardRows[meAt].li; li.classList.remove('bump'); void li.offsetWidth; li.classList.add('bump'); }
      shown.meAt = meAt;
    }
  }

  // ---- 미니맵: 코스 선은 한 번만 그려 두고, 점만 매번 그린다(북쪽이 위)
  const points = course.centre; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const base = document.createElement('canvas'); let scale = 1, ox = 0, oz = 0, ratio = 1, mw = 0, mh = 0;
  function layout() {
    const box = map.getBoundingClientRect(); if (!box.width) return;
    ratio = Math.min(3, window.devicePixelRatio || 1); mw = Math.round(box.width * ratio); mh = Math.round(box.height * ratio);
    for (const c of [map, base]) { c.width = mw; c.height = mh; }
    const pad = 9 * ratio; scale = Math.min((mw - 2 * pad) / (x1 - x0), (mh - 2 * pad) / (z1 - z0)); ox = (mw - (x1 - x0) * scale) / 2 - x0 * scale; oz = (mh - (z1 - z0) * scale) / 2 - z0 * scale;
    const g = base.getContext('2d'); g.clearRect(0, 0, mw, mh); g.lineJoin = g.lineCap = 'round';
    const line = () => { g.beginPath(); points.forEach((p, i) => { const X = p[0] * scale + ox, Z = p[1] * scale + oz; i ? g.lineTo(X, Z) : g.moveTo(X, Z); }); g.closePath(); g.stroke(); };
    g.strokeStyle = 'rgba(8,12,22,.7)'; g.lineWidth = 6.5 * ratio; line(); g.strokeStyle = '#fff'; g.lineWidth = 3 * ratio; line();
    const s = course.start; g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(s.x * scale + ox, s.z * scale + oz, 3.4 * ratio, 0, 7); g.fill();
  }
  layout(); addEventListener('resize', layout);
  function drawMap(view, rivals) {
    if (!mw) { layout(); if (!mw) return; }
    const g = map.getContext('2d'); g.clearRect(0, 0, mw, mh); g.drawImage(base, 0, 0);
    // 상대: 내 세모 · 유령(파랑)보다 작고 흐린 회색 점, 흰 테
    if (rivals) {
      g.fillStyle = 'rgba(118,127,145,.92)'; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.2 * ratio;
      for (const r of rivals) { if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.z)) continue; g.beginPath(); g.arc(r.x * scale + ox, r.z * scale + oz, 2.9 * ratio, 0, 7); g.fill(); g.stroke(); }
    }
    if (view.ghost) { g.strokeStyle = '#fff'; g.lineWidth = 1.6 * ratio; g.fillStyle = 'rgba(127,178,255,.85)'; g.beginPath(); g.arc(view.ghost.x * scale + ox, view.ghost.z * scale + oz, 3.6 * ratio, 0, 7); g.fill(); g.stroke(); }
    // 카트: 진행 방향을 가리키는 세모
    const X = view.x * scale + ox, Z = view.z * scale + oz, fx = Math.sin(view.heading), fz = Math.cos(view.heading), r = 6.4 * ratio;
    g.beginPath(); g.moveTo(X + fx * r, Z + fz * r); g.lineTo(X - fx * r * .7 - fz * r * .62, Z - fz * r * .7 + fx * r * .62); g.lineTo(X - fx * r * .7 + fz * r * .62, Z - fz * r * .7 - fx * r * .62); g.closePath();
    g.fillStyle = '#ff5a4d'; g.strokeStyle = '#fff'; g.lineWidth = 1.6 * ratio; g.fill(); g.stroke();
  }

  // ---- 결과 화면: 키 처리기는 하나만 두고, result() 가 부를 곳만 바꾼다.
  function bindResult() {
    for (const [cls, kind] of [['.hud-result-again', 'again'], ['.hud-result-back', 'back']]) {
      const button = result.querySelector(cls);
      // 단추에 초점이 있을 때 Space · Enter 는 그 단추다(전역 키 처리로 넘어가지 않게).
      button.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) { button.blur(); resultAction(kind); } } });
      button.addEventListener('click', () => { button.blur(); resultAction(kind); });
    }
  }
  // 순위 줄 오른쪽 끝의 '공유': 누르면 공유 판(뜬 직후 0.7초는 다른 단추처럼 받지 않는다). 판이 열린 채 결과가 바뀌면(순위가 옴) 카드를 다시 그린다.
  function bindShare(data) {
    const button = result.querySelector('.hud-share'); if (!button) return;
    button.addEventListener('click', () => { if (resultDone || performance.now() - resultShownAt < RESULT_INPUT_DELAY) return; openShare(data); });
    button.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) button.click(); } });
    shareUpdate(data);
  }
  let resultHandlers = null, resultShownAt = 0, resultDone = true;
  function resultAction(kind) {
    if (resultDone || !resultHandlers || performance.now() - resultShownAt < RESULT_INPUT_DELAY) return; resultDone = true;
    const fn = kind === 'back' ? resultHandlers.onBack : resultHandlers.onAgain; if (typeof fn === 'function') fn();
  }
  function resultKey(event) {
    if (result.hidden || resultDone || event.repeat || shareOpen()) return;   // 공유 판이 열려 있으면 그 판이 키를 받는다(Esc = 판 닫기)
    if (event.metaKey || event.ctrlKey || event.altKey) return;   // 브라우저 단축키(⌘R 새로 고침 등)는 건드리지 않는다
    const code = event.code, key = event.key;
    // 여기서 받은 키는 다른 처리기(메인의 R = 다시)로 넘기지 않는다 — 넘기면 한 번 눌러 두 번 출발한다
    if (code === 'Escape' || key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); resultAction('back'); return; }
    if (['Enter', 'NumpadEnter', 'Space', 'KeyR'].includes(code) || ['Enter', ' ', 'r', 'R'].includes(key)) { event.preventDefault(); event.stopImmediatePropagation(); resultAction('again'); }
  }
  addEventListener('keydown', resultKey);

  // ---- 멈춤 판(Esc): 계속 · 다시 시작 · 메인 화면. 열려 있는 동안의 키는 여기서 받고 다른 처리기(주행 입력 · 메인)로 넘기지 않는다.
  //   Esc → 계속, R → 다시 시작, ↑ ↓(← → 도)로 줄을 옮기고 Enter · Space 로 누른다(초점이 없으면 '계속'). 초점이 있는 줄이 노랗다 — 마우스를 올려도 초점이 간다.
  let pauseHandlers = null;
  const pauseButtons = [['.hud-pause-resume', 'onResume'], ['.hud-pause-again', 'onAgain'], ['.hud-pause-back', 'onBack']].map(([cls, name]) => {
    const button = pausePanel.querySelector(cls); button.addEventListener('click', () => pauseAction(name));
    button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') button.focus({ preventScroll: true }); }); return button;
  });
  function pauseAction(name) { const fn = pauseHandlers?.[name]; if (typeof fn === 'function') fn(); }
  function pauseKey(event) {
    if (pausePanel.hidden || event.metaKey || event.ctrlKey || event.altKey) return;
    const code = event.code, key = event.key, at = pauseButtons.indexOf(document.activeElement);
    const take = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (code === 'Escape' || key === 'Escape') { take(); if (!event.repeat) pauseAction('onResume'); }
    else if (code === 'KeyR' || (!code && (key === 'r' || key === 'R'))) { take(); if (!event.repeat) pauseAction('onAgain'); }
    else if (['Enter', 'NumpadEnter', 'Space'].includes(code) || key === 'Enter' || key === ' ') { take(); if (!event.repeat) pauseAction(['onResume', 'onAgain', 'onBack'][Math.max(0, at)]); }
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(code || key)) { take(); const step = ['ArrowLeft', 'ArrowUp'].includes(code || key) ? -1 : 1; pauseButtons[(Math.max(0, at) + step + pauseButtons.length) % pauseButtons.length].focus(); }
    else event.stopImmediatePropagation();   // 멈춘 동안의 다른 키(가속 · 부스터 · 등급)는 게임에 넘기지 않는다 — 풀리는 순간 부스터가 나가지 않게. 브라우저의 기본 동작(Tab · F5)은 그대로 둔다
  }
  addEventListener('keydown', pauseKey, true);

  // ---- 시작 전 화면: ready 가 다시 불리면 예전 처리기를 걷어 낸다.
  let readyOff = null;

  // ---- 차 고르기 화면: ← → 로 넘기고(길게 누르면 계속), Enter · Space 로 고르고, Esc 로 돌아간다. 열려 있는 동안의 키는 여기서 받고 다른 처리기로 넘기지 않는다.
  //   터치: 좌우 단추 또는 옆으로 밀기.
  let garageHandlers = null, garageCars = [], garageAt = 0, swipeX = null;
  const two = v => String(v).padStart(2, '0');
  function garageDraw() {
    const car = garageCars[garageAt] || {};
    garagePanel.querySelector('.hud-g-count').innerHTML = '<b>' + two(garageAt + 1) + '</b> / ' + garageCars.length;
    garagePanel.querySelector('.hud-g-name').innerHTML = '<em>' + two(garageAt + 1) + '</em><b>' + esc(car.name ?? '') + '</b>' + (car.kind ? '<i>' + esc(car.kind) + '</i>' : '');
    garagePanel.querySelector('.hud-g-stats').innerHTML = (car.stats || []).map(([name, value]) => '<div class="hud-g-stat"><span>' + esc(name) + '</span><div>' + Array.from({ length: 5 }, (_, j) => '<u' + (j < value ? ' class="on"' : '') + '></u>').join('') + '</div></div>').join('');
  }
  function garageMove(step) { if (!garageCars.length) return; garageAt = (garageAt + step + garageCars.length) % garageCars.length; garageDraw(); garageHandlers?.onMove?.(garageAt); }
  function garageKey(event) {
    if (garagePanel.hidden || event.metaKey || event.ctrlKey || event.altKey) return;
    const code = event.code || event.key, take = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (code === 'ArrowLeft' || code === 'ArrowRight') { take(); garageMove(code === 'ArrowLeft' ? -1 : 1); }
    else if (['Enter', 'NumpadEnter', 'Space', ' '].includes(code)) { take(); if (!event.repeat) garageHandlers?.onPick?.(garageAt); }
    else if (code === 'Escape') { take(); if (!event.repeat) garageHandlers?.onBack?.(); }
    else event.stopImmediatePropagation();
  }
  addEventListener('keydown', garageKey, true);

  // ---- 제작 정보 판: 열려 있는 동안의 키는 여기서 받고 게임 · 시작 화면(Enter = 출발)에 넘기지 않는다.
  //   Esc = 닫기, Tab = 판 안에서만 돈다. 단추 · 링크의 Enter 는 기본 동작(누름 · 열기)대로. 닫으면 연 곳으로 초점을 돌린다(마우스로 열었으면 아무 데도 두지 않는다 — Enter 가 다시 출발이 되게).
  let creditsBack = null;
  const creditsPanel = credits.querySelector('.hud-cr-panel');
  const creditsFocus = () => [...credits.querySelectorAll('button, a[href]')].filter(e => e.getClientRects().length);
  function openCredits(back = null) {
    if (!credits.hidden) return;
    creditsBack = back; credits.hidden = false; creditsPanel.scrollTop = 0;
    credits.querySelector('.hud-cr-close').focus({ preventScroll: true });
  }
  function closeCredits() {
    if (credits.hidden) return;
    credits.hidden = true; let back = creditsBack; creditsBack = null;
    /* 판이 열린 동안 창 높이가 460px 경계를 넘으면 연 단추는 숨고 다른 자리의 같은 단추가 보인다 — 그때는 지금 보이는 'HealthCoding' 으로 */
    if (back && !(back.isConnected && back.getClientRects().length)) back = [...cover.querySelectorAll('.hud-credit-open')].find(b => b.getClientRects().length) || null;
    if (back) back.focus({ preventScroll: true });
    else if (credits.contains(document.activeElement) || document.activeElement?.classList.contains('hud-credit-open')) document.activeElement.blur();
  }
  function creditsKey(event) {
    if (credits.hidden) return;
    event.stopImmediatePropagation();
    if (modified(event)) return;
    const code = event.code || event.key;
    if (code === 'Escape') { event.preventDefault(); if (!event.repeat) closeCredits(); return; }
    if (code === 'Tab') {
      event.preventDefault(); const list = creditsFocus(); if (!list.length) return;
      const at = list.indexOf(document.activeElement), step = event.shiftKey ? -1 : 1;
      list[at < 0 ? 0 : (at + step + list.length) % list.length].focus(); return;
    }
    /* 누르고 있는 Enter(판을 연 그 키)가 바로 닫기를 누르지 않게 */
    if (event.repeat && ['Enter', 'NumpadEnter', 'Space'].includes(code)) event.preventDefault();
  }
  addEventListener('keydown', creditsKey, true);
  credits.querySelector('.hud-cr-close').addEventListener('click', () => closeCredits());
  credits.addEventListener('click', event => { if (event.target === credits) closeCredits(); });
  garagePanel.querySelector('.hud-g-arrow.l').addEventListener('click', event => { event.currentTarget.blur(); garageMove(-1); });
  garagePanel.querySelector('.hud-g-arrow.r').addEventListener('click', event => { event.currentTarget.blur(); garageMove(1); });
  garagePanel.querySelector('.hud-g-pick').addEventListener('click', () => garageHandlers?.onPick?.(garageAt));
  garagePanel.querySelector('.hud-g-back').addEventListener('click', () => garageHandlers?.onBack?.());
  garagePanel.addEventListener('pointerdown', event => { swipeX = event.target.closest('button') ? null : event.clientX; });
  garagePanel.addEventListener('pointerup', event => { if (swipeX === null) return; const dx = event.clientX - swipeX; swipeX = null; if (Math.abs(dx) > 40) garageMove(dx < 0 ? 1 : -1); });

  let noteTimer = 0, wrongOn = false;
  const api = {
    phase(name) { root.dataset.phase = name; },
    // 불러오는 중: 읽은 만큼(0~1) 신호등이 하나씩 켜진다
    loading(fraction) { cover.hidden = false; cover.classList.remove('clear'); const lamps = cover.querySelector('.hud-lights'); if (lamps) setLamps(lamps, Math.max(0, Math.min(1, fraction)) * 5 + 1e-6); },
    // 시작 화면(2026-11-23 사용자가 고른 'B 포스터형'): 장면이 화면을 다 쓰고(내 차는 언더우드관 앞 — main.js 의 showcase), 이름은 왼쪽 위에 크게,
    //   설정은 오른쪽 위(터치 기기에서만 그 옆에 'PC 권장' 한 줄), 아래 한 줄(휴대폰 세로는 아래 묶음)에 모드 · 고르는 칸(차 · 속도 · 상대) · 출발.
    //   고르는 칸은 'A 스테퍼 칸'(2026-11-23): 이름 + 눈금 + 지금 값 + ◀ ▶ — 왼쪽 반은 앞 값, 오른쪽 반은 다음 값(속도 · 상대 · 카트), '차' 칸은 값 + › 이고 onCar() 를 부른다(차 고르기 화면).
    //   키보드: 칸 밖에서 ← → = 모드, Enter · Space · ↑ · W = 출발, C = 차 고르기. Tab 으로 칸에 초점을 주면 그 칸에서 ← → = 앞 · 다음 값, Space · Enter = 다음 값. onStart 는 한 번만 불린다(ready 를 다시 부르면 예전 onStart 는 버린다).
    // classes: [{ id, name }], chosen: 지금 등급 id, onClass(id): 등급을 바꿨을 때
    // modes: [{ id, name, note }], mode: 지금 모드 id, onMode(id): 모드를 바꿨을 때. modes 가 없거나 비면 모드 줄이 없다. note 는 마우스를 올렸을 때의 풀이(title)로만 쓴다.
    // settings: [{ id, name, options: [{ id, name }], value }], onSetting(id, value): 값을 바꿨을 때. 없거나 비면 '설정' 단추도 없다.
    // car: { name, kind } — 고른 차. 주면 '차' 칸을 놓고, 누르거나 C 키면 onCar()(차 고르기 화면을 여는 쪽이 부른다). 게임은 이것을 쓴다.
    // karts: [{ id, name }], kart: 지금 고른 카트 id, onKart(id): 카트를 바꿨을 때. car 가 없고 둘 이상일 때만 '카트' 칸을 만든다(개발용 화면이 쓴다).
    // levels: [{ id, name }] 상대의 난이도, level: 지금 고른 id, onLevel(id). 상대가 있는 모드(modes 의 rivals: true)에서만 칸이 보인다.
    // courses: [{ id, name }] 고를 수 있는 코스, course: 지금 코스 id, onCourses(byKey): 코스 고르기 화면을 연다(2026-11-25 사용자가 시안에서 고른 '새 입구' — '코스' 칸은 '차' 칸과 같은 모양(이름 + ›), 누르거나 T 키.
    //   고르는 칸 줄의 맨 앞, 코스가 둘 이상일 때만. byKey = 키보드로 칸을 눌렀다(닫을 때 그 칸으로 초점을 돌린다). 화면은 src/hud/course-pick.js).
    // info: 예전 코스 카드(길이 · 바퀴 · 최고 기록)용 — 포스터형에는 카드가 없어 쓰지 않는다(받기만 한다).
    // ranked(modeId, levelId) → 그 조합으로 달리면 랭킹에 오르는가(2026-11-25 사용자가 고른 시안 A): 참이면 '상대' 칸 위 선이 노랗고 칸 구석에 노란 '랭킹'. 모드 · 상대를 바꿀 때마다 다시 본다(글은 없다).
    ready(onStart, { courses = [], course = '', onCourses = () => {}, classes = [], chosen = '', onClass = () => {}, modes = [], mode = '', onMode = () => {}, settings = [], onSetting = () => {}, karts = [], kart = '', onKart = () => {}, car = null, onCar = () => {}, levels = [], level = '', onLevel = () => {}, ranked = null } = {}) {
      if (readyOff) readyOff();
      const sets = Array.isArray(settings) ? settings.filter(s => s && Array.isArray(s.options) && s.options.length) : [];
      api.clearResult();
      api.phase('ready'); cover.hidden = false; cover.classList.remove('failed'); cover.classList.add('clear'); cover.removeAttribute('role'); cover.removeAttribute('aria-label');
      // 고르는 칸(2026-11-23 사용자가 로비 시안에서 고른 'A 스테퍼 칸'): 이름(작게) + 몇 번째인지 눈금 + 지금 값(굵게) + ◀ ▶.
      //   칸의 왼쪽 반 = 앞 값, 오른쪽 반 = 다음 값(끝에서는 반대 끝으로). 칸 자체를 누르면(검증의 .click()) 다음 값. '차' 칸은 값 + › — 누르면 onCar().
      //   cls 는 예전 이름(.hud-class · .hud-level · .hud-karts · .hud-car)을 그대로 쓴다 — 검증 · 다른 쪽이 그 이름으로 찾는다.
      const nameOf = (list, id) => list.find(x => x.id === id)?.name ?? '';
      const chev = dir => '<i class="hud-chev ' + dir + '" aria-hidden="true"></i>';
      const pips = (n, at) => '<span class="hud-pips" aria-hidden="true">' + Array.from({ length: n }, (_, i) => '<i' + (i === at ? ' class="on"' : '') + '></i>').join('') + '</span>';
      const cell = (cls, label, value, extra = '') => '<button type="button" class="hud-cell ' + cls + '"' + extra + '><small>' + label + '</small><b>' + esc(value) + '</b>' + chev('r') + '</button>';
      const stepper = (cls, label, list, id, extra = '') => { const at = Math.max(0, list.findIndex(x => x.id === id));
        return '<div class="hud-cell hud-step ' + cls + '" tabindex="0" role="group" aria-label="' + label + '"' + extra + '><small>' + label + pips(list.length, at) + '</small><b>' + esc(list[at]?.name ?? '') + '</b>'
          + '<button type="button" class="hud-half l" tabindex="-1" aria-label="' + label + ' 앞">' + chev('l') + '</button><button type="button" class="hud-half r" tabindex="-1" aria-label="' + label + ' 다음">' + chev('r') + '</button></div>'; };
      const useKarts = !car && Array.isArray(karts) && karts.length > 1, rivalsNow = id => modes.find(m => m.id === id)?.rivals !== false;
      cover.innerHTML = '<div class="hud-shade top"></div><div class="hud-shade bottom"></div><div class="hud-head">' + TITLE + '</div>'
        + '<div class="hud-tr"><div class="hud-tr-row"><span class="hud-pc">PC 권장</span>' + (sets.length ? '<button type="button" class="hud-set" aria-expanded="false">설정</button>' : '') + '</div>' + '<p class="hud-osm top">' + CREDIT_OSM + '</p>'
        + (sets.length ? '<div class="hud-settings" hidden>' + sets.map(s => '<div class="hud-setting"><span>' + esc(s.name) + '</span><div class="hud-opt" role="group" aria-label="' + esc(s.name) + '" data-id="' + esc(s.id) + '">'
          + s.options.map(o => '<button type="button" data-value="' + esc(o.id) + '" aria-pressed="' + (o.id === s.value) + '">' + esc(o.name) + '</button>').join('') + '</div></div>').join('') + '</div>' : '') + '</div>'
        + '<div class="hud-dock">'
        + (modes.length ? '<div class="hud-modes" role="group" aria-label="모드">' + modes.map(m => '<button type="button" data-id="' + esc(m.id) + '" aria-pressed="' + (m.id === mode) + '"' + (m.note ? ' title="' + esc(m.note) + '"' : '') + '><b>' + esc(m.name) + '</b></button>').join('') + '</div>' : '')
        + '<div class="hud-picks">'
        + (courses.length > 1 ? cell('hud-course', '코스<kbd>T</kbd>', courses.find(c => c.id === course)?.name ?? '', ' aria-label="코스 고르기"') : '')
        + (car ? cell('hud-car', '차<kbd>C</kbd>', car.name ?? '', ' aria-label="차 고르기"') : useKarts ? stepper('hud-karts', '카트', karts, kart) : '')
        + (classes.length ? stepper('hud-class', '속도', classes, chosen) : '')
        + (levels.length ? stepper('hud-level', '상대', levels, level, rivalsNow(mode) ? '' : ' hidden') : '')
        + '</div><button type="button" class="hud-go"><b>출발</b><kbd>ENTER</kbd></button><p class="hud-osm">' + CREDIT_OSM + '</p></div>'
        + '<div class="hud-keys"><span><kbd>↑</kbd>가속</span><span><kbd>← →</kbd>방향</span><span><kbd>Shift</kbd>드리프트</span><span><kbd>Space</kbd>부스트</span><span><kbd>X</kbd>경적</span><span><kbd>R</kbd>다시</span><span><kbd>Esc</kbd>멈춤</span></div>';
      // 고르는 칸 · 모드 · 설정 단추에 초점이 있을 때 Space · Enter 는 그 단추를 누르는 것이다(전역 '출발' 처리로 넘어가지 않게).
      cover.querySelectorAll('.hud-cell, .hud-modes button, .hud-set, .hud-opt button').forEach(button => button.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); button.click(); } }));
      // 지도 출처의 링크에 초점이 있을 때 Enter 는 그 링크를 여는 것이다(전역 '출발' 처리로 넘어가지 않게 — 기본 동작은 막지 않는다).
      cover.querySelectorAll('.hud-osm a').forEach(link => link.addEventListener('keydown', event => { if (event.key === 'Enter') event.stopPropagation(); }));
      // 'HealthCoding' = 제작 정보 판. Enter · Space 는 그 단추다(출발 아님). 키보드로 열었으면 닫을 때 이 단추로 초점이 돌아온다.
      cover.querySelectorAll('.hud-credit-open').forEach(button => {
        button.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) openCredits(button); } });
        button.addEventListener('click', event => openCredits(event.detail === 0 ? button : null));
      });
      // 스테퍼 칸: 왼쪽 반 = 앞 값, 오른쪽 반(또는 칸 자체) = 다음 값, 끝에서는 반대 끝으로. 값이 바뀌면 글자 · 눈금 · 콜백.
      //   키보드(초점은 Tab 으로 칸에서 칸으로): 초점이 있는 칸에서 ← → = 앞 · 다음 값, Space · Enter = 다음 값(출발 아님 — 위의 처리). 초점이 있는 칸은 노란 테(hud.css 의 :focus-visible).
      const cycler = (selector, list, start, callback) => {
        const box = cover.querySelector(selector); if (!box) return;
        let at = Math.max(0, list.findIndex(x => x.id === start));
        const step = dir => {
          if (list.length < 2) return;
          at = (at + dir + list.length) % list.length; const pick = list[at]; box.querySelector('b').textContent = pick.name;
          box.querySelectorAll('.hud-pips i').forEach((pip, i) => pip.classList.toggle('on', i === at)); callback(pick.id);
        };
        box.addEventListener('click', event => { const half = event.target.closest?.('.hud-half'); step(half?.classList.contains('l') ? -1 : 1); if (half) half.blur(); });
        box.addEventListener('keydown', event => {
          const dir = event.key === 'ArrowLeft' || event.code === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' || event.code === 'ArrowRight' ? 1 : 0;
          if (!dir || event.metaKey || event.ctrlKey || event.altKey) return;
          event.preventDefault(); event.stopPropagation(); step(dir);
        });
      };
      let levelNow = level, modeNow = mode;
      cycler('.hud-class', classes, chosen, onClass); cycler('.hud-level', levels, level, id => { levelNow = id; onLevel(id); markRanked(); }); if (useKarts) cycler('.hud-karts', karts, kart, onKart);
      const carButton = cover.querySelector('.hud-car'); if (carButton) carButton.addEventListener('click', () => { carButton.blur(); onCar(); });
      const courseButton = cover.querySelector('.hud-course'); if (courseButton) courseButton.addEventListener('click', event => { courseButton.blur(); onCourses(event.detail === 0); });
      const levelCell = cover.querySelector('.hud-level');
      // 랭킹에 오르는 조합이면 '상대' 칸에 표시(시안 A)
      const rankMark = levelCell ? el('em', 'hud-rank-mark', '랭킹') : null; if (rankMark) { rankMark.hidden = true; levelCell.append(rankMark); }
      function markRanked() { if (!levelCell) return; let on = false; try { on = typeof ranked === 'function' && !!ranked(modeNow, levelNow); } catch {} levelCell.classList[on ? 'add' : 'remove']('hud-ranked'); rankMark.hidden = !on; }
      markRanked();
      // 설정: '설정' 단추로 오른쪽 위에 펼치고 접는다. 고른 것을 다시 누르면 onSetting 을 부르지 않는다.
      const toggle = cover.querySelector('.hud-set'), panel = cover.querySelector('.hud-settings');
      const openSettings = on => { if (!panel) return; panel.hidden = !on; toggle.setAttribute('aria-expanded', String(on)); };
      if (toggle) toggle.addEventListener('click', () => { openSettings(panel.hidden); toggle.blur(); });
      cover.querySelectorAll('.hud-opt').forEach((group, k) => {
        const id = sets[k].id; let value = sets[k].value;
        group.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
          group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button))); button.blur();
          const picked = sets[k].options.find(o => String(o.id) === button.dataset.value)?.id ?? button.dataset.value;
          if (picked !== value) { value = picked; onSetting(id, picked); }
        }));
      });
      const modeButtons = [...cover.querySelectorAll('.hud-modes button')];
      let current = modes.findIndex(m => m.id === mode);
      const pickMode = index => {
        if (index < 0 || index >= modeButtons.length) return;
        modeButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
        if (levelCell) levelCell.hidden = !rivalsNow(modes[index].id);   // 혼자 달리는 모드에서는 상대 칸을 숨긴다
        if (index !== current) { current = index; modeNow = modes[index].id; onMode(modes[index].id); }
        markRanked();
      };
      modeButtons.forEach((button, i) => button.addEventListener('click', () => { pickMode(i); button.blur(); }));
      // 키는 자판 위치(code)로도 받는다 — 한글 입력 상태에서는 W 의 key 가 'ㅈ' 이 된다.
      const GO_CODES = ['Enter', 'NumpadEnter', 'Space', 'ArrowUp', 'KeyW'], GO_KEYS = ['Enter', ' ', 'ArrowUp', 'w', 'W'];
      let done = false;
      const off = () => { done = true; removeEventListener('keydown', go); if (readyOff === off) readyOff = null; };
      const go = event => {
        if (done) return;
        if (event.type === 'keydown') {
          if (modified(event) || textField(event.target) || textField(document.activeElement)) return;
          /* 누르고 있는 키의 반복은 출발이 아니다 — 판 · 단추에서 누른 Enter 를 떼지 않은 채 닫혀도 출발하지 않게 */
          if (event.repeat) return;
          // Esc: 펼친 설정을 접는다(시작 화면에서는 그것뿐)
          if (event.code === 'Escape' || event.key === 'Escape') { if (panel && !panel.hidden) openSettings(false); return; }
          if (carButton && (event.code === 'KeyC' || (!event.code && (event.key === 'c' || event.key === 'C')))) { event.preventDefault(); onCar(); return; }
          if (courseButton && (event.code === 'KeyT' || (!event.code && (event.key === 't' || event.key === 'T')))) { event.preventDefault(); onCourses(false); return; }
          // ← → : 모드 옮기기(고르는 칸에 초점이 있을 때는 빼고)
          const dir = event.code === 'ArrowLeft' || event.key === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' || event.key === 'ArrowRight' ? 1 : 0;
          if (dir) { if (modeButtons.length && !document.activeElement?.closest?.('.hud-cell, .hud-opt')) { event.preventDefault(); pickMode(Math.max(0, Math.min(modeButtons.length - 1, (current < 0 ? 0 : current) + dir))); } return; }
          if (!GO_CODES.includes(event.code) && !GO_KEYS.includes(event.key)) return;
        }
        off(); cover.hidden = true; onStart(event);
      };
      readyOff = off;
      cover.querySelector('.hud-go').addEventListener('click', go); addEventListener('keydown', go);
    },
    reveal() { cover.hidden = true; },
    // 차 고르기 화면의 글자 층. cars: [{ name, kind, stats: [[이름, 0~5], …] }], index: 처음 가운데에 둘 차, handlers: { onMove(index), onPick(index), onBack() }.
    //   부르는 쪽이 장면을 그리고(src/garage.js), 끝나면 clearGarage() 뒤 ready() 로 돌아간다. 시작 화면의 키 처리(Enter = 출발)는 여기서 걷는다.
    garage(cars = [], index = 0, handlers = {}) { if (readyOff) readyOff(); garageCars = cars; garageAt = Math.max(0, Math.min(cars.length - 1, index)); garageHandlers = handlers; api.phase('garage'); cover.hidden = true; garagePanel.hidden = false; garageDraw(); },
    clearGarage() { garageHandlers = null; garagePanel.hidden = true; },
    // 시작 화면을 비우고 다른 화면(코스 고르기 — phase 'course')으로: 시작 화면의 키 처리(Enter = 출발)를 걷고 덮개를 감춘다. 돌아올 때는 ready() 를 다시 부른다.
    away(phase) { if (readyOff) readyOff(); api.phase(phase); cover.hidden = true; },
    fail(message) { api.phase('failed'); cover.hidden = false; cover.classList.remove('clear'); cover.classList.add('failed'); cover.innerHTML = '<p>불러오지 못했어요</p><div class="hud-fail"></div>'; cover.querySelector('.hud-fail').textContent = message; },
    // 출발 신호등: n = 켜진 불의 수(1~5 — 하나씩 켜진다), 0 = 다 꺼짐(출발). null 이면 감춘다.
    lights(n) { if (n == null) { count.classList.remove('on'); return; } setLamps(count, n); count.classList.add('on'); },
    // 알림: 큰 글 + 작은 글. tone: 'best' | 'slow' | 'warn' | ''
    note(text, small = '', tone = '', seconds = 2.6) { note.dataset.tone = tone; note.innerHTML = ''; note.append(text); if (small) { const s = document.createElement('small'); s.textContent = small; note.append(s); } note.classList.add('on'); clearTimeout(noteTimer); if (seconds > 0) noteTimer = setTimeout(() => note.classList.remove('on'), seconds * 1000); },
    clearNote() { clearTimeout(noteTimer); note.classList.remove('on'); },
    // 역주행 경고: 풀릴 때까지 계속 보인다
    wrong(on) { if (on === wrongOn) return; wrongOn = on; wrong.classList.toggle('on', on); },
    onAgain(fn) { again.addEventListener('click', () => { again.blur(); fn(); }); },
    onPause(fn) { pauseButton.addEventListener('click', () => { pauseButton.blur(); fn(); }); },
    // 멈춤 판: handlers { onResume, onAgain, onBack }. clearPause() 로 닫는다(부르는 쪽이 닫는다 — 여기서는 눌린 것만 알린다).
    pause(handlers = {}) { pauseHandlers = handlers; pausePanel.hidden = false; root.dataset.paused = 'on'; pauseButtons[0].focus({ preventScroll: true }); },
    clearPause() { pauseHandlers = null; if (pausePanel.hidden) return; if (pauseButtons.includes(document.activeElement)) document.activeElement.blur(); pausePanel.hidden = true; delete root.dataset.paused; },
    // view: { time, best, speed(m/s), gauge(0~100), boost(남은 초), x, z, heading, ghost: {x,z} | null }
    //   있으면: stock(모아 둔 칸 수) · slots(칸 수, 기본 2) · kick(짧은 가속을 받을 수 있는 동안 true) · ready
    //   stock 이 없으면 칸을 그리지 않고 예전처럼 막대가 '쓸 수 있음'을 맡는다.
    //   경주: rank · karts(내 순위 / 전체) · lap · laps(지금 바퀴 / 전체) · rivals([{x,z}]). rank 가 없으면(타임어택) 순위 · 바퀴 · 상대 점을 숨긴다.
    //   rankStyle: 'table'(기본) | 'number'. table: [{ rank, name, colour, me, gap, done }] — 'table' 인데 table 이 없거나 비면 큰 숫자로 보인다.
    update(view) {
      // 차 상태: view.car(0~100)가 오면 막대를 보인다. 70 이상 초록 · 40~70 주황 · 그 아래 빨강, 15 아래는 빛난다(피트를 부를 때). view.pit = '' | 'limit' | 'stop' | 'repair'
      if (!Number.isFinite(view.car)) { if (!car.hidden) { car.hidden = true; carShown = null; } }
      else {
        const value = Math.max(0, Math.min(100, Math.round(view.car))), touch = document.body.classList.contains('touch');
        if (car.hidden) car.hidden = false;
        if (touch !== carTouch) { carTouch = touch; if (touch) speed.append(car); else speed.prepend(car); }
        if (value !== carShown) { carShown = value; carFill.style.width = value + '%'; carNumber.textContent = String(value); const lv = value >= 70 ? 'ok' : value >= 40 ? 'mid' : value >= 15 ? 'low' : 'call'; if (lv !== carLevel) { carLevel = lv; car.dataset.lv = lv; } }
        const zone = view.pit || ''; if (zone !== carPit) { carPit = zone; car.dataset.pit = zone; }
      }
      const now = lapText(view.time), best = lapText(view.best), kmh = String(Math.round(Math.abs(view.speed) * 3.6)), amount = Math.floor(Math.max(0, Math.min(100, view.gauge)) + 1e-6);
      if (now !== shown.now) nowText.textContent = shown.now = now;
      if (best !== shown.best) bestText.textContent = shown.best = best;
      // 타임어택의 바퀴 줄: 바뀔 때만 쓴다. view.trialLap · trialLaps 가 없으면(경주 · 시작 화면) 숨긴다
      const trialLap = Number.isFinite(view.trialLap) && Number.isFinite(view.trialLaps) ? Math.round(view.trialLap) + '/' + Math.round(view.trialLaps) : '';
      if (trialLap !== shown.trialLap) { shown.trialLap = trialLap; lapLine.hidden = !trialLap; if (trialLap) { lapLineNow.textContent = String(Math.round(view.trialLap)); lapLineOf.textContent = '/ ' + Math.round(view.trialLaps); } }
      if (kmh !== shown.speed) speedText.textContent = shown.speed = kmh;
      if (amount !== shown.fill) { fill.style.width = amount + '%'; shown.fill = amount; }
      const hasStock = Number.isFinite(view.stock), slots = hasStock ? Math.max(0, Math.round(view.slots ?? 2)) : 0, stock = hasStock ? Math.max(0, Math.min(slots, Math.round(view.stock))) : 0;
      if (slots !== shown.slots) setSlots(slots);
      if (stock !== shown.stock) { slotEls.forEach((slot, i) => { const on = String(i < stock); if (slot.dataset.on !== on) slot.dataset.on = on; }); shown.stock = stock; }
      // 피트에서 부스터가 찼다(view.refills 가 늘었다 — 그랑프리): 칸이 빛나고 옆에 '+N'(실제로 찬 칸 수)이 1.2초 뜬다. 움직임 줄이기면 빛은 멈추고 '+N' 만(CSS).
      const refills = Number.isFinite(view.refills) ? view.refills : -1;
      if (refills !== shown.refills) {
        if (refills > shown.refills && shown.refills >= 0 && view.refillGain > 0) {
          slotBox.dataset.gain = '+' + Math.round(view.refillGain); slotBox.classList.remove('refill'); void slotBox.offsetWidth; slotBox.classList.add('refill');
          clearTimeout(refillTimer); refillTimer = setTimeout(() => slotBox.classList.remove('refill'), 1200);
        }
        shown.refills = refills;
      }
      const kick = !!view.kick; if (kick !== shown.kick) boostRow.dataset.kick = String(shown.kick = kick);
      // 준비 색은 반올림한 숫자가 아니라 실제로 쓸 수 있을 때만. 칸이 있으면 '쓸 수 있음'은 칸이 맡고, 막대는 칸이 꽉 찼고 게이지도 100 일 때만 노랗다.
      const full = hasStock ? slots > 0 && stock >= slots && view.gauge >= 100 : view.ready ?? amount >= 100, burn = view.boost > 0;
      if (full !== shown.full) gauge.dataset.full = String(shown.full = full);
      if (burn !== shown.burn) gauge.dataset.burn = String(shown.burn = burn);
      // 순위 · 바퀴: 바뀔 때만 쓰고, 순위가 바뀌는 순간 숫자가 짧게 튄다(움직임 줄이기면 CSS 가 막는다).
      const race = Number.isFinite(view.rank), table = race && view.rankStyle !== 'number' && Array.isArray(view.table) && view.table.length ? view.table : null;
      const style = !race ? '' : table ? 'table' : 'number';
      if (race !== shown.race) { lapBox.hidden = !(shown.race = race); root.dataset.race = race ? 'on' : 'off'; if (!race) shown.rank = ''; }
      if (style !== shown.style) { shown.style = style; place.hidden = style !== 'number'; board.hidden = style !== 'table'; if (style !== 'table') shown.meAt = -1; }
      if (table) drawBoard(table);
      if (race) {
        const rank = String(Math.round(view.rank)), karts = '/ ' + (Number.isFinite(view.karts) ? Math.round(view.karts) : '-');
        if (rank !== shown.rank) {
          const bump = shown.rank !== ''; rankText.textContent = shown.rank = rank; place.dataset.first = String(rank === '1');
          if (bump) { place.classList.remove('bump'); void place.offsetWidth; place.classList.add('bump'); }
        }
        if (karts !== shown.karts) kartsText.textContent = shown.karts = karts;
        const laps = Number.isFinite(view.laps) ? Math.round(view.laps) : null, lap = String(Math.max(1, Math.min(laps ?? Infinity, Math.round(view.lap ?? 1)))), lapsOf = '/ ' + (laps ?? '-');
        if (lap !== shown.lap) lapText_.textContent = shown.lap = lap;
        if (lapsOf !== shown.laps) lapsText.textContent = shown.laps = lapsOf;
      }
      drawMap(view, race && Array.isArray(view.rivals) && view.rivals.length ? view.rivals : null);
    },
    // 결과 화면: 경주가 끝났을 때 · 타임어택 한 판(서서 출발한 3바퀴)이 끝났을 때. 다시 부르면 내용을 바꾼다(뜬 시각은 처음 것 그대로).
    //   경주 data: { rank, karts, time, bestLap, record: { time, improved } | null, rows: [{ rank, name, colour, time, gap, me }] }
    //   타임어택 data: { kind: 'trial', time(합계 · 초), laps: [초, …](바퀴별 — 더하면 합계), record: { time, improved, prev(전의 내 최고 | null) },
    //     rank · total(조용히 올린 순위 — 없으면 null), note(조용히 올리다 못 올렸을 때의 한 줄) } — 랭킹의 결과 판(ranking.js 의 rk-result)과 같은 큰 기록 · 줄 모양
    //   handlers: { onAgain, onBack } — 단추 또는 키(Enter · Space · R → onAgain, Escape → onBack). 한 번 부르면 다음 result() 까지 더 부르지 않는다.
    result(data = {}, handlers = {}) {
      const wasHidden = result.hidden;
      resultHandlers = handlers; resultDone = false;
      const improved = !!data.record?.improved;
      result.dataset.kind = data.kind === 'trial' ? 'trial' : 'race';
      if (wasHidden) shareMoment();   // 공유 카드의 사진은 결과가 뜬 이 순간의 장면
      if (data.kind === 'trial') {
        const prev = data.record?.prev, delta = Number.isFinite(prev) && Number.isFinite(data.time) ? data.time - prev : null;
        const ranked = Number.isFinite(data.rank);
        // 순위 줄: 순위(조용히 올린 것이 오면) + 오른쪽 끝 '공유'. 순위가 없어도 줄은 있다(단추 자리 — 순위가 와도 판이 덜컹거리지 않게)
        result.innerHTML = '<div class="hud-result-main">'
          + '<div class="rk-lap" data-best="' + improved + '"><b>' + lapText(data.time) + '</b>' + (improved ? '<em>최고 기록</em>' : '')
          + (delta !== null && Math.abs(delta) >= 0.005 ? '<span class="rk-delta" data-best="' + (delta < 0) + '">' + (delta < 0 ? '−' : '+') + Math.abs(delta).toFixed(2) + '</span>' : '') + '</div>'
          + lapLines(data.laps, !improved && Number.isFinite(prev) ? prev : null)
          + '<div class="hud-share-row">' + (ranked ? '<div class="rk-rank"><i>순위</i><b>' + esc(data.rank.toLocaleString('en-US')) + '</b>' + (Number.isFinite(data.total) ? '<small>/ ' + esc(data.total.toLocaleString('en-US')) + '</small>' : '') + '</div>' : '') + SHARE_BUTTON + '</div>'
          + (data.note ? '<p class="hud-result-note">' + esc(data.note) + '</p>' : '')
          + '</div>'
          + '<div class="hud-result-actions"><button type="button" class="hud-result-again">다시<kbd>ENTER</kbd></button><button type="button" class="hud-result-back">메인 화면<kbd>ESC</kbd></button></div>';
        // 카드: 순위(이 판이 내 최고일 때 조용히 올린 것) 또는 '최고 기록'
        bindShare({ kind: 'trial', time: data.time, laps: data.laps, best: improved, rank: ranked && improved ? data.rank : null, total: ranked && improved ? data.total : null });
        bindResult();
        if (wasHidden) resultShownAt = performance.now();
        result.hidden = false; root.dataset.result = 'on'; api.phase('finished');
        return;
      }
      const rows = (Array.isArray(data.rows) ? [...data.rows] : []).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
      result.innerHTML = '<div class="hud-result-main">'
        + '<div class="hud-share-row"><div class="hud-result-place" data-first="' + (data.rank === 1) + '"><strong>' + esc(data.rank ?? '-') + '</strong><small>/ ' + esc(data.karts ?? '-') + '</small></div>' + SHARE_BUTTON + '</div>'
        + '<div class="hud-result-time" data-best="' + improved + '"><b>' + lapText(data.time) + '</b>' + (improved ? '<em>최고 기록</em>' : '') + '</div>'
        + '<div class="hud-result-lines">'
        + (data.bestLap != null ? '<span><i>빠른 바퀴</i>' + lapText(data.bestLap) + '</span>' : '')
        + (data.record && !improved && data.record.time != null ? '<span><i>최고</i>' + lapText(data.record.time) + '</span>' : '')
        + '</div>' + (data.note ? '<p class="hud-result-note">' + esc(data.note) + '</p>' : '') + '</div>'   // note: 조용히 올린 경주 랭킹의 순위 · 못 올린 한 줄(2026-11-24 — 타임어택 결과의 줄을 빌린다)
        + '<ol class="hud-result-rows"></ol>'
        + '<div class="hud-result-actions"><button type="button" class="hud-result-again">다시<kbd>ENTER</kbd></button><button type="button" class="hud-result-back">메인 화면<kbd>ESC</kbd></button></div>';
      const list = result.querySelector('ol');
      for (const row of rows) {
        const li = el('li', row.me ? 'me' : '', '<b></b><i></i><span></span><em></em>');
        li.querySelector('b').textContent = row.rank ?? '';
        li.querySelector('i').style.background = row.colour || '#888';
        li.querySelector('span').textContent = row.name ?? '';
        li.querySelector('em').textContent = row.time != null ? lapText(row.time) : row.gap != null ? (row.gap < 0 ? '−' : '+') + Math.abs(Number(row.gap)).toFixed(1) : '';
        if (row.time == null) li.dataset.running = 'true';
        list.append(li);
      }
      // 경주의 카드: 순위 N / 전체 · 완주 기록 · 바퀴별(main 의 info().laps). 그랑프리도 결과는 마지막 한 번뿐이다.
      bindShare({ kind: 'race', time: data.time, place: Number.isFinite(data.rank) ? data.rank : null, karts: Number.isFinite(data.karts) ? data.karts : null, best: improved });
      bindResult();
      if (wasHidden) resultShownAt = performance.now();
      result.hidden = false; root.dataset.result = 'on'; api.phase('finished');
    },
    clearResult() { resultDone = true; resultHandlers = null; if (result.hidden) return; shareClose(); result.hidden = true; result.textContent = ''; delete root.dataset.result; },
  };
  return api;
}
