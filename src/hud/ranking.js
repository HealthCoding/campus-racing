// 랭킹(기록 순위) 표시 — 화면만 그린다(서버 · 저장 · 통신은 src/rank.js 가 쥐고, 자료를 화면 모양으로 바꿔 여기 넘긴다).
// 2026-11-24 사용자가 고른 안: 결과 = 위쪽 다섯 + 내 앞뒤(표) · 시작 화면 = '설정' 옆 '랭킹' 단추 · 단과대 = 닉네임 옆 작은 글자 + '단과대'로 걸러 보기.
// 화면 넷: 타임어택 결과의 순위(result) · 랭킹 판(board) · 시작 화면의 '랭킹' 단추(startLink) · 닉네임 · 단과대 정하기(entry · settingsRow).
// 모양은 hud.css 끝의 '랭킹' 절, 클래스는 전부 .rk-* 라 부르지 않으면 아무것도 안 바뀐다.
// 키: 열린 판(맨 위 하나)이 키를 받고 다른 처리기(시작 화면의 Enter = 출발 · 주행 키)로 넘기지 않는다. Esc = 닫기 · 나중에, Tab = 판 안에서만 돈다.
import { lapText, lapLines, SHARE_BUTTON, shareMoment, openShare, shareUpdate, shareClose, shareOpen } from './hud.js';

const el = (tag, cls, html = '') => { const node = document.createElement(tag); if (cls) node.className = cls; if (html) node.innerHTML = html; return node; };
const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const num = n => Number.isFinite(+n) && n !== null && n !== '' ? Number(n).toLocaleString('en-US') : '-';
const chev = dir => '<i class="hud-chev ' + dir + '" aria-hidden="true"></i>';
const len = text => [...String(text ?? '')].length;   // 글자 수는 낱자가 아니라 글자로(한글 완성형 · 영문 · 숫자 한 자씩)
// 결과 화면이 뜬 직후의 키는 받지 않는다(hud.js 의 결과 화면과 같은 0.7초 — 결승선을 넘으며 누르던 키가 바로 '다시'가 되지 않게)
const INPUT_DELAY = 700;
// '내 기록 지우기'를 한 번 누른 뒤 두 번째 누름을 기다리는 시간(지나면 처음 글자로 돌아간다)
const ARM_MS = 4000;
// 같은 닉네임이 한 화면에 둘 이상일 때만 그 줄들에 꼬리표(#a1b2)를 붙인다
const twins = rows => { const seen = new Map(); for (const r of rows) if (r?.name) seen.set(r.name, (seen.get(r.name) || 0) + 1); return name => seen.get(name) > 1; };
// 닉네임 옆 작은 글자: 꼬리표(겹칠 때만) + 단과대(보일 때만)
// 순위 칸(줄 세 곳이 같이 쓴다 — 판의 목록 · 판 아래 내 줄 · 결과의 표). 1 · 2 · 3등(2026-11-25 사용자가 고른 시안 A '1등만 홀로그램'):
//   줄에 data-r(1 · 2 · 3)을 달면 hud.css 의 '1 · 2 · 3등' 절이 그린다 — 순위는 모서리 자른 금 · 은 · 동 판, 1등 줄은 무지갯빛 테 · 빗금 · 지나가는 빛, 2 · 3등 줄은 은 · 동 가는 테.
const rankCell = row => '<b>' + num(row.rank) + '</b>';
const podium = row => Number.isInteger(row?.rank) && row.rank >= 1 && row.rank <= 3 ? ' data-r="' + row.rank + '"' : '';
const sub = (row, showTag, showCollege) => {
  const tag = showTag && row.tag ? '<i class="rk-tag">#' + esc(row.tag) + '</i>' : '', college = showCollege && row.college ? esc(row.college) : '';
  return tag || college ? '<small>' + tag + (tag && college ? ' ' : '') + college + '</small>' : '';
};

export function attachRanking(root) {
  // ---- 키: 열린 판을 쌓아 두고 맨 위의 것만 받는다(결과 위에 랭킹 판, 그 위에 닉네임 판이 열릴 수 있다)
  const layers = [];
  const focusables = node => [...node.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), input, [tabindex="0"]')].filter(e => e.getClientRects().length && !e.closest('[hidden]'));
  function cycle(event, node) {
    const list = focusables(node); if (!list.length) return;
    const at = list.indexOf(document.activeElement), step = event.shiftKey ? -1 : 1;
    list[at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length].focus();
  }
  function onKey(event) {
    const top = layers.at(-1); if (!top) return;
    if (shareOpen()) return;   // 공유 판(share.js)이 열려 있으면 그 판이 키를 받는다(Esc = 판 닫기 — 결과의 '메인 화면'이 아니다)
    // 열린 동안의 키는 게임 · 시작 화면에 넘기지 않는다(기본 동작 — 글자 입력 · 단추 누름 — 은 그대로 둔다)
    event.stopImmediatePropagation();
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // 한글을 조합하는 중의 Enter · 화살표는 입력기의 것
    if (event.isComposing || event.keyCode === 229) return;
    const code = event.code || event.key;
    if (code === 'Tab') { event.preventDefault(); cycle(event, top.node); return; }
    if (code === 'Escape') { event.preventDefault(); if (!event.repeat) top.onEscape(); return; }
    top.onKey?.(event, code);
  }
  addEventListener('keydown', onKey, true);
  const open = layer => { layers.push(layer); };
  const close = node => { const i = layers.findIndex(l => l.node === node); if (i >= 0) layers.splice(i, 1); };
  // 단추에 초점이 있을 때 Enter · Space 는 그 단추다(기본 동작으로 눌린다 — 여기서는 막지 않는다)
  const onButton = () => document.activeElement?.tagName === 'BUTTON';

  // ---- 단과대 고르는 칸: 시작 화면의 'A 스테퍼 칸'과 같은 모양(이름 · 값 · ◀ ▶, 왼쪽 반 = 앞, 오른쪽 반 = 다음). label 이 없으면 이름 줄 없이 값만.
  const stepper = (cls, label, value, key) => '<div class="hud-cell hud-step ' + cls + '" tabindex="0" role="group" aria-label="' + esc(label || '단과대') + '" data-k="' + key + '">'
    + (label ? '<small>' + esc(label) + '</small>' : '') + '<b>' + esc(value) + '</b>'
    + '<button type="button" class="hud-half l" tabindex="-1" aria-label="앞">' + chev('l') + '</button><button type="button" class="hud-half r" tabindex="-1" aria-label="다음">' + chev('r') + '</button></div>';
  // 코스 칸(판의 코스 고르기): 단과대 칸과 같은 모양 · 같은 ◀ ▶. 글은 PC 'B · 언더우드 · 청송대' · 휴대폰 '코스 B'(hud.css 가 고른다). 코스가 하나면 ◀ ▶ 없이 이름만
  const courseCell = (c, more) => '<div class="hud-cell hud-step rk-course"' + (more ? ' tabindex="0"' : '') + ' role="group" aria-label="코스" data-k="course"><b><span class="rk-long">' + esc(c.id) + ' · ' + esc(c.name) + '</span><span class="rk-short">' + esc(c.label || '코스 ' + c.id) + '</span></b>'
    + (more ? '<button type="button" class="hud-half l" tabindex="-1" aria-label="앞 코스">' + chev('l') + '</button><button type="button" class="hud-half r" tabindex="-1" aria-label="다음 코스">' + chev('r') + '</button>' : '') + '</div>';
  const wireStepper = (box, list, get, set) => {
    if (!box) return;
    const step = dir => { if (list.length < 2) return; const at = Math.max(0, list.indexOf(get())); set(list[(at + dir + list.length) % list.length]); };
    box.addEventListener('click', event => { const half = event.target.closest?.('.hud-half'); step(half?.classList.contains('l') ? -1 : 1); });
    box._step = step;
  };

  // =============================================================== 랭킹 판
  const boardLayer = el('div', 'rk-layer rk-board'); boardLayer.hidden = true; boardLayer.setAttribute('role', 'dialog'); boardLayer.setAttribute('aria-label', '랭킹');
  let boardHandlers = {}, boardBack = null;
  function rowHtml(row, showTag, showCollege) {
    return '<li' + (row.me ? ' class="me"' : '') + podium(row) + '>' + rankCell(row) + '<span class="rk-name"><span>' + esc(row.name) + '</span>' + sub(row, showTag, showCollege) + '</span>'
      + '<em class="rk-car">' + esc(row.car) + '</em><span class="rk-t">' + lapText(row.time) + '</span></li>';
  }
  // 2026-11-25 사용자가 고른 시안 B '모드 위 · 코스 옆': 위에 모드 탭(이름 + 작은 글), 그 아래 줄에 코스 칸(◀ ▶ — PC 'B · 언더우드 · 청송대', 휴대폰 '코스 B') + 전체/단과대(+ 단과대 칸).
  // data: { modes: [{ id, name, note }], mode, courses: [{ id, label, name }](코스 칸이 이 차례로 돈다), course(코스 id), scopes: [{ id, name }], scope: 'all' | 'college', colleges: [이름], college(이름),
  //         state: 'loading' | 'ok' | 'empty' | 'error', error(못 불러왔을 때의 한 줄), retry(그때 '다시'를 보일지 — 기본 true),
  //         total, klass, rows: [{ rank, name, tag, college, car, time(초), me }], me: { 같은 모양 } | null, scrollTo: 순위(그 줄이 목록 가운데 오게) }
  // handlers: { onMode(id), onCourse(id), onScope(id), onCollege(이름), onRetry(), onClose() } — 판을 바꾸는 것은 부르는 쪽이 board() 를 다시 불러서 한다.
  function board(data = {}, handlers = {}) {
    const again = !boardLayer.hidden, keep = again ? document.activeElement?.closest?.('[data-k]')?.dataset.k : null;
    if (!again) boardBack = document.activeElement;
    boardHandlers = handlers;
    // 한 단과대로 걸러 볼 때는 줄마다 같은 단과대를 쓰지 않는다
    const modes = data.modes || [], courses = data.courses || [], scopes = data.scopes || [], showCollege = data.scope !== 'college';
    const here = courses.find(c => c.id === data.course) || courses[0] || { id: data.course ?? '', label: '', name: '' };
    const rows = data.rows || [], state = data.state === 'loading' || data.state === 'error' ? data.state : data.state === 'empty' || !rows.length ? 'empty' : 'ok';
    const count = state === 'ok' && Number.isFinite(data.total) ? num(data.total) + '명' : '';
    // 내 줄(판 아래에 붙는 것)은 목록에 이미 있으면 한 번만 센다
    const twin = twins([...rows, ...(data.me && !rows.some(r => r.me) ? [data.me] : [])]);
    let body;
    if (state === 'loading') body = '<div class="rk-note" aria-busy="true"></div>';
    else if (state === 'error') body = '<div class="rk-note"><p>' + esc(data.error || '불러오지 못했어요') + '</p>' + (data.retry !== false ? '<button type="button" class="rk-retry" data-k="retry">다시</button>' : '') + '</div>';
    else if (state === 'empty') body = '<div class="rk-note"><p>아직 기록이 없어요</p></div>';
    else body = '<div class="rk-cols" aria-hidden="true">' + ['순위', '닉네임', '차', '기록'].map(c => '<span>' + c + '</span>').join('') + '</div><ol class="rk-list">' + rows.map(r => rowHtml(r, twin(r.name), showCollege)).join('') + '</ol>'
      + (data.me ? '<ol class="rk-mine" hidden>' + rowHtml({ ...data.me, me: true }, twin(data.me.name), showCollege) + '</ol>' : '');
    boardLayer.innerHTML = '<div class="rk-panel" tabindex="-1">'
      + '<div class="rk-head"><h2>랭킹</h2><span class="rk-count">' + esc(count) + (count && data.klass ? ' · ' + esc(data.klass) : '') + '</span><button type="button" class="rk-close" data-k="close">닫기<kbd>ESC</kbd></button></div>'
      + '<div class="rk-bar"><div class="rk-tabs rk-modes" role="group" aria-label="모드">' + modes.map(m => '<button type="button" data-k="m:' + esc(m.id) + '" aria-pressed="' + (m.id === data.mode) + '">' + (m.note ? '<small>' + esc(m.note) + '</small>' : '') + '<b>' + esc(m.name) + '</b></button>').join('') + '</div>'
      + '<div class="rk-scope">' + courseCell(here, courses.length > 1) + '<div class="rk-seg" role="group" aria-label="보기">' + scopes.map(s => '<button type="button" data-k="s:' + esc(s.id) + '" aria-pressed="' + (s.id === data.scope) + '">' + esc(s.name) + '</button>').join('') + '</div>'
      + (data.scope === 'college' ? stepper('rk-college', '', data.college || '', 'college') : '') + '</div></div>'
      + body + '</div>';
    boardLayer.querySelector('.rk-close').addEventListener('click', () => closeBoard());
    boardLayer.querySelectorAll('[data-k^="m:"]').forEach(b => b.addEventListener('click', () => { if (b.getAttribute('aria-pressed') !== 'true') boardHandlers.onMode?.(b.dataset.k.slice(2)); }));
    wireStepper(boardLayer.querySelector('.rk-course'), courses.map(c => c.id), () => here.id, id => boardHandlers.onCourse?.(id));
    boardLayer.querySelectorAll('[data-k^="s:"]').forEach(b => b.addEventListener('click', () => { if (b.getAttribute('aria-pressed') !== 'true') boardHandlers.onScope?.(b.dataset.k.slice(2)); }));
    boardLayer.querySelector('.rk-retry')?.addEventListener('click', () => boardHandlers.onRetry?.());
    wireStepper(boardLayer.querySelector('.rk-college'), data.colleges || [], () => data.college, name => boardHandlers.onCollege?.(name));
    // 내 자리: 내 줄이 목록 안에 다 보이지 않으면(멀리 있거나 받은 쪽 밖) 판 아래에 노란 줄로 붙인다
    const list = boardLayer.querySelector('.rk-list'), pin = boardLayer.querySelector('.rk-mine');
    const pinCheck = () => {
      if (!pin || !list) return; const li = list.querySelector('li.me'); let off = !li;
      if (li) { const a = list.getBoundingClientRect(), b = li.getBoundingClientRect(); off = b.top < a.top - 1 || b.bottom > a.bottom + 1; }
      if (pin.hidden !== !off) pin.hidden = !off;
    };
    if (list) list.addEventListener('scroll', pinCheck, { passive: true });
    boardLayer.hidden = false;
    if (!layers.some(l => l.node === boardLayer)) open({ node: boardLayer, onEscape: () => closeBoard(), onKey: boardKey });
    if (list && Number.isFinite(data.scrollTo)) { const li = [...list.children].find(e => e.firstChild.textContent === num(data.scrollTo)); if (li) list.scrollTop = Math.max(0, li.offsetTop - list.offsetTop - (list.clientHeight - li.offsetHeight) / 2); }
    // 그 밖에는 맨 위(1위)부터 보이고, 내 줄이 그 안에 없으면 판 아래에 붙는다(pinCheck)
    pinCheck();
    // 처음 열 때 초점은 판 자체에(테두리 없이) — Tab 을 누르면 코스 → 보기 → … 로 들어간다. 다시 그릴 때는 누르던 것에 그대로
    const target = (keep && boardLayer.querySelector('[data-k="' + keep + '"]')) || boardLayer.querySelector('.rk-panel');
    target?.focus({ preventScroll: true });
  }
  function boardKey(event, code) {
    const list = boardLayer.querySelector('.rk-list'), focus = document.activeElement;
    if ((code === 'ArrowLeft' || code === 'ArrowRight') && (focus?.classList.contains('rk-college') || focus?.classList.contains('rk-course'))) { event.preventDefault(); focus._step?.(code === 'ArrowLeft' ? -1 : 1); return; }
    // 모드 · 보기 단추 사이를 ← → 로 옮긴다(누르는 것은 Enter · Space)
    if ((code === 'ArrowLeft' || code === 'ArrowRight') && focus?.closest('.rk-tabs, .rk-seg')) {
      event.preventDefault(); const group = [...focus.parentNode.children], at = group.indexOf(focus); group[(at + (code === 'ArrowLeft' ? -1 : 1) + group.length) % group.length].focus(); return;
    }
    if ((code === 'ArrowUp' || code === 'ArrowDown' || code === 'PageUp' || code === 'PageDown') && list) {
      event.preventDefault(); const row = list.firstElementChild?.offsetHeight + 2 || 36, page = code.startsWith('Page') ? list.clientHeight - row : row * 3;
      list.scrollBy({ top: code === 'ArrowUp' || code === 'PageUp' ? -page : page }); return;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === ' ') && !onButton()) event.preventDefault();
  }
  function closeBoard() {
    if (boardLayer.hidden) return; boardLayer.hidden = true; boardLayer.textContent = ''; close(boardLayer);
    const fn = boardHandlers.onClose; boardHandlers = {}; if (boardBack?.isConnected) boardBack.focus({ preventScroll: true }); boardBack = null; if (typeof fn === 'function') fn();
  }

  // =============================================================== 타임어택 결과의 순위
  //   내 판 최고 기록(서서 출발한 3바퀴 합계)으로 끝난 판에서 처음 · 열 명 안에서 오를 때만 뜬다(그 밖은 main.js 의 보통 결과 화면). 모양은 경주의 결과 화면(.hud-result)과 같은 틀: 왼쪽 큰 기록 · 바퀴별 줄 · 순위, 오른쪽 순위표, 아래 단추.
  const resultLayer = el('div', 'hud-result rk-result'); resultLayer.hidden = true; resultLayer.setAttribute('role', 'dialog'); resultLayer.setAttribute('aria-label', '결과');
  let resultHandlers = {}, resultAt = 0, resultDone = true;
  // data: { state: 'busy'(올리는 중 — 순위 자리가 비어 있다) | 'done'(순위) | 'failed'(못 올림 — error 한 줄, retry 면 '다시') | 'later'(닉네임을 미룸 — 순위 없이 기록만),
  //         time(이번 판의 3바퀴 합계 · 초), laps([초, …] 바퀴별 — 없으면 줄을 안 그린다), improved(서버의 내 최고를 갱신 — 기본 true), best(못 갱신했을 때의 내 최고 · 초), rank, total, up(오른 자리 수),
  //         rows: [{ rank, name, tag, college, time, me }](위쪽 다섯 + 내 앞 · 나 · 뒤 — 순위가 건너뛰는 곳에 ··· 를 넣는다), error, retry,
  //         race: { place, karts, pits, bestLap } — 경주(그랑프리)의 결과면 준다: 바퀴별 줄 대신 '빠른 바퀴 · 피트', 그 밑에 '경주 N / 8' }
  // handlers: { onAgain, onBoard, onBack, onRetry } — 다시(Enter · Space · R) · 랭킹 · 메인 화면(Esc) · 못 올렸을 때 다시 올리기.
  //   같은 바퀴의 상태를 바꿀 때도 result() 를 다시 부른다(뜬 시각은 처음 것 그대로 — 0.7초 막음이 다시 걸리지 않게).
  function result(data = {}, handlers = {}) {
    const fresh = resultLayer.hidden;
    resultHandlers = handlers; resultDone = false; if (fresh) { resultAt = performance.now(); shareMoment(); }   // 공유 카드의 사진은 결과가 뜬 이 순간의 장면
    const keep = !fresh ? document.activeElement?.closest?.('.rk-result button')?.className : null;
    const state = ['busy', 'done', 'failed', 'later'].includes(data.state) ? data.state : 'done', improved = data.improved !== false;
    const delta = !improved && Number.isFinite(data.best) && Number.isFinite(data.time) ? '+' + (data.time - data.best).toFixed(2) : '';
    // 순위 자리: 올리는 중 · 못 올림에는 비워 둔다(자리는 그대로 — 채워질 때 판이 덜컹거리지 않게). 미뤘을 때는 아예 없다.
    const ranked = state === 'done' && Number.isFinite(data.rank);
    const rank = state === 'later' ? '' : '<div class="rk-rank"' + (ranked ? '' : ' data-wait="true"') + '><i>순위</i><b>' + (ranked ? num(data.rank) : '0') + '</b><small>/ ' + (ranked ? num(data.total) : '0') + '</small>'
      + (ranked && improved && data.up > 0 ? '<em>▲ ' + num(data.up) + '</em>' : '') + '</div>';
    const list = state === 'done' ? (data.rows || []) : [], twin = twins(list);
    const row = r => '<li' + (r.me ? ' class="me"' : '') + podium(r) + '>' + rankCell(r) + '<span class="rk-name"><span>' + esc(r.name) + '</span>' + sub(r, twin(r.name), true) + '</span><em>' + lapText(r.time) + '</em></li>';
    let items = '';
    list.forEach((r, i) => { if (i && Number.isFinite(r.rank) && Number.isFinite(list[i - 1].rank) && r.rank > list[i - 1].rank + 1) items += '<li class="rk-skip" aria-hidden="true">···</li>'; items += row(r); });
    // 못 올렸을 때의 한 줄은 순위표 자리에(통신 문제일 때만 '다시 올리기' — 아래 '다시'(다시 달리기)와 헷갈리지 않게)
    const fail = state === 'failed' ? '<li class="rk-fail"><p>' + esc(data.error || '올리지 못했어요') + '</p>' + (data.retry ? '<button type="button" class="rk-retry">다시 올리기</button>' : '') + '</li>' : '';
    const rows = state === 'later' ? '' : '<ol class="hud-result-rows rk-rows" data-state="' + state + '"' + (state === 'busy' ? ' aria-busy="true"' : '') + '>' + items + fail + '</ol>';
    // 경주(2026-11-25 사용자가 고른 시안 B '기록 중심'): 큰 결승 시간 밑에 '빠른 바퀴'(+ 그랑프리의 '피트' — 피트가 없는 판은 없음) · '경주 2 / 8' 한 줄 · 순위 줄. 타임어택은 바퀴별 줄(사용자가 바퀴 칸을 고르는 중 — 고르면 lapLines 를 고친다)
    const race = data.race && typeof data.race === 'object' ? data.race : null;
    const lines = race ? '<div class="hud-result-lines">' + (Number.isFinite(race.bestLap) ? '<span><i>빠른 바퀴</i>' + lapText(race.bestLap) + '</span>' : '') + (Number.isFinite(race.pits) ? '<span><i>피트</i>' + race.pits + '</span>' : '') + (!improved && Number.isFinite(data.best) ? '<span><i>최고</i>' + lapText(data.best) + '</span>' : '') + '</div>'
      : lapLines(data.laps, !improved && Number.isFinite(data.best) ? data.best : null);
    const place = race && Number.isFinite(race.place) ? '<div class="rk-place" data-first="' + (race.place === 1) + '"><i>경주</i><b>' + race.place + '</b>' + (Number.isFinite(race.karts) ? '<small>/ ' + race.karts + '</small>' : '') + '</div>' : '';
    resultLayer.dataset.state = state; resultLayer.dataset.race = String(!!race);   // data-kind 는 hud.js 의 결과 화면이 쓴다(.hud-result[data-kind=trial] 은 표 없는 한 줄 틀) — 겹치지 않게 다른 이름
    resultLayer.innerHTML = '<div class="hud-result-main">'
      + '<div class="rk-lap" data-best="' + improved + '"><b>' + lapText(data.time) + '</b>' + (improved ? '<em>최고 기록</em>' : delta ? '<span class="rk-delta">' + delta + '</span>' : '') + '</div>'
      + lines + place
      + '<div class="hud-share-row">' + rank + SHARE_BUTTON + '</div></div>' + rows
      + '<div class="hud-result-actions"><button type="button" class="hud-result-again">다시<kbd>ENTER</kbd></button><button type="button" class="rk-to-board">랭킹</button><button type="button" class="hud-result-back">메인 화면<kbd>ESC</kbd></button></div>';
    for (const [cls, name] of [['.hud-result-again', 'onAgain'], ['.rk-to-board', 'onBoard'], ['.hud-result-back', 'onBack']]) resultLayer.querySelector(cls).addEventListener('click', () => resultAction(name));
    resultLayer.querySelector('.rk-fail .rk-retry')?.addEventListener('click', () => { if (!resultDone) resultHandlers.onRetry?.(); });
    // 순위 줄 오른쪽 끝의 '공유': 올리는 중에도 누를 수 있다. 카드의 순위는 채워졌을 때만(이 판이 서버의 내 최고일 때) — 그 전 · 못 올림 · 미룸은 '최고 기록'. 순위가 오면 열린 판의 카드를 다시 그린다.
    const me = list.find(r => r.me), share = race ? { kind: 'race', time: data.time, best: improved, place: race.place ?? null, karts: race.karts ?? null, ...(data.laps ? { laps: data.laps } : {}), ...(me?.name ? { nick: me.name } : {}) }
      : { kind: 'trial', time: data.time, laps: data.laps, best: improved, rank: ranked && improved ? data.rank : null, total: ranked && improved ? data.total : null, ...(me?.name ? { nick: me.name } : {}) };
    resultLayer.querySelector('.hud-share').addEventListener('click', () => { if (!resultDone && performance.now() - resultAt >= INPUT_DELAY) openShare(share); });
    shareUpdate(share);
    if (!resultLayer.isConnected) root.append(resultLayer);
    resultLayer.hidden = false; root.dataset.result = 'on'; root.dataset.phase = 'finished';
    // 결과는 늘 맨 아래 판
    if (!layers.some(l => l.node === resultLayer)) layers.unshift({ node: resultLayer, onEscape: () => resultAction('onBack'), onKey: resultKey });
    if (keep) resultLayer.querySelector('.' + keep.split(' ')[0])?.focus({ preventScroll: true });
  }
  function resultAction(name) {
    if (resultDone || performance.now() - resultAt < INPUT_DELAY) return;
    // 랭킹은 보고 와서 다시 고를 수 있다
    if (name !== 'onBoard') resultDone = true;
    const fn = resultHandlers[name]; if (typeof fn === 'function') fn();
  }
  function resultKey(event, code) {
    // 초점이 있는 단추가 받는다
    if (onButton() && (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === ' ')) return;
    if (['Enter', 'NumpadEnter', 'Space', ' ', 'KeyR'].includes(code)) { event.preventDefault(); if (!event.repeat) resultAction('onAgain'); }
  }
  function clearResult() { resultDone = true; resultHandlers = {}; if (resultLayer.hidden) return; shareClose(); resultLayer.hidden = true; resultLayer.textContent = ''; close(resultLayer); delete root.dataset.result; }

  // =============================================================== 닉네임 · 단과대 정하기
  const entryLayer = el('div', 'rk-layer rk-entry'); entryLayer.hidden = true; entryLayer.setAttribute('role', 'dialog'); entryLayer.setAttribute('aria-label', '닉네임');
  let entryHandlers = {}, entryBack = null, entryData = {}, entryGen = 0;
  // data: { mode: 'first'(처음 기록을 올릴 때 — 공개 안내 한 줄) | 'edit'(설정에서 바꾸기 — '내 기록 지우기'), name, college(이름), colleges: ['고르지 않음', …](맨 앞이 기본),
  //         max(글자 수), error(보일 한 줄), erase(edit 에서 '내 기록 지우기'를 보일지 — 기본 true) }
  // handlers: { onSubmit({ name, college }) → '' 이면 닫는다 · 글자면 그 줄을 보인다(Promise 도 된다 — 기다리는 동안 단추가 잠긴다),
  //             onCancel(), onErase() → '' 이면 닫는다 · 글자면 그 줄(Promise 도 된다) } — 검사는 부르는 쪽(checkName · 서버)이 한다.
  function entry(data = {}, handlers = {}) {
    if (entryLayer.hidden) entryBack = document.activeElement;
    entryGen++; entryHandlers = handlers; entryLayer.dataset.busy = 'false'; entryData = { max: 8, colleges: ['고르지 않음'], ...data }; entryData.college = entryData.college || entryData.colleges[0];
    const max = entryData.max, edit = entryData.mode === 'edit';
    entryLayer.innerHTML = '<form class="rk-form" novalidate><h2>닉네임</h2>'
      + '<label class="rk-field"><input type="text" name="nick" maxlength="' + max + '" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="닉네임" value="' + esc(entryData.name || '') + '"><output aria-live="polite"></output></label>'
      + '<p class="rk-err" role="alert"></p>'
      + stepper('rk-college', '단과대', entryData.college, 'college')
      + (edit ? '' : '<p class="rk-public">순위에 공개돼요 · 실명 · 학번 · 연락처는 넣지 마세요</p>')
      + '<div class="rk-acts"><button type="submit" class="rk-ok">' + (edit ? '저장' : '올리기') + '<kbd>ENTER</kbd></button><button type="button" class="rk-no">' + (edit ? '취소' : '나중에') + '<kbd>ESC</kbd></button></div>'
      + (edit && entryData.erase !== false ? '<button type="button" class="rk-erase">내 기록 지우기</button>' : '') + '</form>';
    const form = entryLayer.querySelector('form'), input = form.querySelector('input'), out = form.querySelector('output'), err = form.querySelector('.rk-err'), ok = form.querySelector('.rk-ok'), field = form.querySelector('.rk-field');
    let busy = false;
    const sync = () => { const n = len(input.value.trim()); out.textContent = n + ' / ' + max; ok.disabled = busy || n === 0; };
    const showError = text => { err.textContent = text || ''; field.dataset.bad = String(!!text); };
    const lock = on => { busy = on; entryLayer.dataset.busy = String(on); for (const b of form.querySelectorAll('.rk-no, .rk-erase')) b.disabled = on; input.readOnly = on; sync(); };
    input.addEventListener('input', () => { sync(); if (err.textContent) showError(''); });
    sync(); showError(entryData.error);
    const cell = form.querySelector('.rk-college');
    wireStepper(cell, entryData.colleges, () => entryData.college, name => { if (busy) return; entryData.college = name; cell.querySelector('b').textContent = name; });
    // 부르는 쪽의 답(글자 · Promise)을 받아 닫거나 한 줄을 보인다. 잘못된 줄은 입력 칸의 빨간 테로(지우기의 잘못은 테 없이)
    const settle = (answer, onField) => {
      // 기다리는 동안 판이 닫히거나 다시 그려졌으면 그 답은 버린다
      const gen = entryGen, done = text => { if (gen !== entryGen || entryLayer.hidden) return; lock(false); if (text) { if (onField) showError(text); else { err.textContent = text; field.dataset.bad = 'false'; } input.focus(); return; } closeEntry(false); };
      if (answer && typeof answer.then === 'function') { lock(true); answer.then(done, () => done('다시 해 주세요')); } else done(answer);
    };
    form.addEventListener('submit', event => { event.preventDefault(); submit(); });
    form.querySelector('.rk-no').addEventListener('click', () => { if (!busy) closeEntry(true); });
    // 내 기록 지우기: 한 번 누르면 글자가 바뀌고(빨강), 그 안에 한 번 더 눌러야 지운다. 브라우저 confirm 창은 쓰지 않는다.
    const erase = form.querySelector('.rk-erase'); let armed = 0;
    if (erase) erase.addEventListener('click', () => {
      if (busy) return;
      if (!armed) { erase.dataset.armed = 'true'; erase.textContent = '한 번 더 누르면 지워져요'; armed = setTimeout(() => { armed = 0; if (erase.isConnected) { erase.dataset.armed = 'false'; erase.textContent = '내 기록 지우기'; } }, ARM_MS); return; }
      clearTimeout(armed); armed = 0; settle(entryHandlers.onErase?.() ?? '', false);
    });
    entryLayer._submit = () => submit(); entryLayer._error = showError;
    function submit() {
      if (ok.disabled || busy) return;
      const name = input.value.trim(), college = entryData.college === entryData.colleges[0] ? '' : entryData.college;
      settle(entryHandlers.onSubmit?.({ name, college }) ?? '', true);
    }
    if (!entryLayer.isConnected) root.append(entryLayer);
    entryLayer.hidden = false;
    if (!layers.some(l => l.node === entryLayer)) open({ node: entryLayer, onEscape: () => { if (entryLayer.dataset.busy !== 'true') closeEntry(true); }, onKey: entryKey });
    input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length);
  }
  function entryKey(event, code) {
    const focus = document.activeElement;
    if ((code === 'ArrowLeft' || code === 'ArrowRight') && focus?.classList.contains('rk-college')) { event.preventDefault(); focus._step?.(code === 'ArrowLeft' ? -1 : 1); return; }
    if ((code === 'Enter' || code === 'NumpadEnter') && focus?.tagName !== 'BUTTON') { event.preventDefault(); if (!event.repeat) entryLayer._submit?.(); return; }
    if ((code === 'Space' || code === ' ') && focus?.classList.contains('rk-college')) { event.preventDefault(); focus._step?.(1); }
  }
  function closeEntry(cancel) {
    if (entryLayer.hidden) return; entryGen++; entryLayer.hidden = true; entryLayer.textContent = ''; close(entryLayer);
    const fn = cancel ? entryHandlers.onCancel : null; entryHandlers = {};
    // 설정의 이름 줄은 저장 · 지우기 때 다시 그려진다 — 그때는 새 줄로 초점을 돌린다
    const back = entryBack?.isConnected ? entryBack : entryBack?.classList?.contains('rk-me') ? root.querySelector('.rk-me') : null; back?.focus({ preventScroll: true }); entryBack = null; if (typeof fn === 'function') fn();
  }

  // =============================================================== 시작 화면의 '랭킹' 단추 · 설정의 '이름' 줄
  //   hud.ready() 가 그린 시작 화면(#hud .hud-cover) 위에 덧붙인다 — ready() 를 다시 부르면 지워지므로 그 뒤에 다시 부른다.
  // 단추에 초점이 있을 때 Enter · Space 는 그 단추다(시작 화면 전역의 '출발'로 넘어가지 않게 — hud.js 의 시작 화면 단추와 같은 처리)
  const own = button => button.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); button.click(); } });
  // 오른쪽 위 '설정' 옆에 같은 모양 '랭킹' 단추. onOpen(): 눌렀을 때
  function startLink(onOpen = () => {}) {
    const cover = root.querySelector('.hud-cover'); if (!cover) return null;
    cover.querySelectorAll('.rk-open').forEach(e => e.remove());
    const row = cover.querySelector('.hud-tr-row'), set = row?.querySelector('.hud-set'); if (!row) return null;
    const button = el('button', 'hud-set rk-open', '랭킹'); button.type = 'button'; row.insertBefore(button, set || null);
    // 누른 단추의 초점은 그대로 둔다 — 판을 닫으면 초점이 여기로 돌아온다(키보드로 이어 쓸 수 있게)
    button.addEventListener('click', () => onOpen()); own(button); return button;
  }
  // 설정 판의 '이름' 줄: 지금 닉네임 · 단과대(없으면 '정하기') + › — 누르면 onEdit()(닉네임 판을 'edit' 으로 여는 쪽이 부른다)
  function settingsRow(profile, onEdit = () => {}) {
    const panel = root.querySelector('.hud-cover .hud-settings'); if (!panel) return null;
    panel.querySelector('.rk-me-row')?.remove();
    const text = profile?.name ? '<b>' + esc(profile.name) + '</b>' + (profile.college ? '<small>' + esc(profile.college) + '</small>' : '') : '<b>정하기</b>';
    const row = el('div', 'hud-setting rk-me-row', '<span>이름</span><div class="hud-opt"><button type="button" class="rk-me"><span>' + text + '</span>' + chev('r') + '</button></div>');
    panel.append(row); const button = row.querySelector('button');
    button.addEventListener('click', () => onEdit()); own(button); return button;
  }

  root.append(boardLayer);
  return {
    board, closeBoard, result, clearResult, entry, closeEntry, startLink, settingsRow,
    get open() { return layers.map(l => l.node.className); },
    get boardOpen() { return !boardLayer.hidden; }, get resultOpen() { return !resultLayer.hidden; }, get entryOpen() { return !entryLayer.hidden; },
    detach() { removeEventListener('keydown', onKey, true); for (const n of [boardLayer, resultLayer, entryLayer]) n.remove(); layers.length = 0; root.querySelectorAll('.rk-open, .rk-me-row').forEach(e => e.remove()); },
  };
}
