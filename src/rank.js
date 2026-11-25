// 랭킹의 흐름 — 화면(src/hud/ranking.js 의 attachRanking)과 서버(rank-rules.js 의 주소 다섯) 사이. 2026-11-24.
//   서버 주소(api)가 비면 꺼져 있다: 화면에 아무것도 붙이지 않고, 아래 함수들은 아무것도 안 한다(게임은 지금 그대로).
//   타임어택 한 판(서서 출발한 3바퀴 — 2026-11-24)이 내 최고로 끝나면 main.js 가 plan() 에 묻는다: 'ask' · 'panel' 이면 lap()(랭킹의 결과 판 — 바퀴별 줄은 info.laps), 'quiet' 면 quiet()(조용히 올리고 main 의 보통 결과 화면), 'skip' 이면 keep().
//   이름 lap · lapMs 는 1바퀴 때 그대로다(값은 3바퀴 합계).
//   fetch · 저장소 · crypto(· 시험용 attach — 화면 대신) 는 주입받는다(DOM 없이 Node 에서 시험 — 검증/rank-client.test.mjs). 서버에 닿지 못해도 던지지 않는다(게임은 그대로 돈다).
//   브라우저에 남기는 것(머리는 다른 저장 키와 같은 'campus-kart:'):
//     campus-kart:rank:key      익명 열쇠(16진 32자 — 제출 자격을 확인할 때 저장하고 다시 읽는다. 가진 사람만 그 기록을 바꾸거나 지운다)
//     campus-kart:rank:profile  { name, college(id | null) }
//     campus-kart:rank:best:<코스>:<코스판>   내 판 최고(ms) — 코스판이 바뀌면 키가 달라져 새로 센다
//     :consent 는 공개를 선택한 열쇠, :identity 는 그 열쇠의 서버 id · sig. 이름만 저장해서는 공개하지 않는다.
//     :accepted: 는 서버가 받은 최고, :pending: 은 접수 전 주행(판마다 가장 빠른 하나). 삭제 열쇠를 남길 수 없는 브라우저는 표만 본다.
import { attachRanking } from './hud/ranking.js';
import { RANK_API_VERSION, RANK_CLASS, NAME_MAX, COLLEGES, RACE_LEVEL, RANK_MODES, PLACE_MAX, boardIdOf, splitBoardId, collegeOf, checkName, cleanName, isKey, isPlayerId } from './shared/rank-rules.js';
// 경주 랭킹(2026-11-24): 표는 코스 × 모드(타임어택 · 그랑프리 — 2026-11-25 스피드전을 뺐다). 이 파일 안의 '코스 id'(courseId · record.course)는 표의 이름이다 — 타임어택 'B', 경주 'B/gp'(rank-rules.js 의 boardIdOf).
//   서버에는 course 와 mode 로 나눠 보낸다. 랭킹 판(2026-11-25 사용자가 고른 시안 B '모드 위 · 코스 옆'): 위에 모드 탭(작은 글 '혼자 · 3바퀴' · '상대 7대 · 5바퀴'), 그 아래 코스 칸(◀ ▶ — courses 목록을 그대로 돈다) + 전체/단과대.
const queryOf = id => { const { course, mode } = splitBoardId(id); return 'course=' + encodeURIComponent(course) + (mode && mode !== 'time' ? '&mode=' + mode : ''); };

const PREFIX = 'campus-kart:rank:', KEY = PREFIX + 'key', PROFILE = PREFIX + 'profile', BEST = PREFIX + 'best:';
const CONSENT = PREFIX + 'consent', IDENTITY = PREFIX + 'identity', ACCEPTED = PREFIX + 'accepted:', PENDING = PREFIX + 'pending:';
const TIMEOUT = 8000;
const LIMIT = 100;
const TOP = 10;              // 결과 판을 띄우는 순위 — 이 안에서 순위가 오를 때만(그 밖의 최고 기록은 조용히 올린다)
const WARM_EVERY = 60000;    // 위쪽 TOP 명을 다시 받는 간격(ms)
const RETRY_PLAN = { after: 30000, tries: 4 };   // 조용히 올리다 통신 문제로 못 올렸을 때: 30초 · 60초 · 90초 뒤에 다시
const NONE = '고르지 않음';
// 오류 code → 화면 한 줄. RETRY 에 든 것(통신 문제)만 '다시'를 보인다.
export const MESSAGES = {
  network: '서버에 닿지 못했어요', timeout: '서버에 닿지 못했어요', server: '서버에 문제가 생겼어요',
  version: '게임이 바뀌었어요 · 새로 고침해 주세요', rejected: '기록을 확인하지 못했어요', shape: '올리지 못했어요',
  rate: '잠시 뒤에 다시 해 주세요', closed: '지금은 기록을 받지 않아요', name: '쓸 수 없는 이름이에요',
};
const RETRY = new Set(['network', 'timeout', 'server']);
// 너무 잦음(rate)도 기록을 쥔 채 '다시'를 보인다 — 잠시 뒤면 된다. 서버가 제출을 닫아 둔 때(detail 'budget' = 이달 다시 계산 상한 · 'closed' = 꺼 둠)는 다시 해도 안 되니 한 줄만.
const CLOSED = new Set(['budget', 'closed']);
const shut = r => r.code === 'rate' && CLOSED.has(r.detail);
const again = r => RETRY.has(r.code) || (r.code === 'rate' && !shut(r));
const message = r => (r.code === 'name' && r.detail) || (shut(r) ? MESSAGES.closed : MESSAGES[r.code]) || MESSAGES.shape;
const hexOf = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');

// 꺼져 있을 때: 모양만 같은 빈 것
const OFF = Object.freeze({ enabled: false, profile: () => null, eligible: () => false, isBest: () => false, plan: () => 'skip', ready() {}, warm() {}, openBoard() {}, lap() {}, show() {}, quiet() {}, keep() {}, clear() {} });

// courses: [{ id, name, laps: { time, gp } }](코스 목록 — 판의 코스 칸이 이 차례로 돈다 · 모드 탭의 바퀴 수) · modes: [{ id, name }](판의 모드 탭 — 이름은 게임이 준다. 없으면 RANK_MODES 의 id)
export function createRank({ root = null, api = '', courses = [], course = '', carName = id => id, klassName = '', version = () => '', mode: modeNow = () => 'time', modes = RANK_MODES.map(id => ({ id, name: id })), storage, fetch: fetchFn, crypto: cryptoObj, timeout = TIMEOUT, retry = RETRY_PLAN, events = globalThis.window, attach } = {}) {
  const base = String(api ?? '').trim().replace(/\/+$/, '');
  if (!String(api ?? '').trim()) return OFF;
  fetchFn ||= globalThis.fetch?.bind(globalThis); cryptoObj ||= globalThis.crypto;
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }

  // 다른 탭이 지운 값(null)도 읽은 결과다. 읽기 자체가 막힌 경우에만 마지막 값을 쓴다.
  const mem = new Map();
  function get(k) {
    try {
      const value = storage?.getItem(k) ?? null;
      if (value === null) mem.delete(k); else mem.set(k, value);
      return value;
    } catch { return mem.get(k) ?? null; }
  }
  function put(k, v) {
    const value = String(v);
    try { storage.setItem(k, value); mem.set(k, value); return true; }
    catch { if (!k.startsWith(PENDING)) mem.set(k, value); return false; }
  }
  const del = k => { mem.delete(k); try { storage?.removeItem(k); } catch {} };
  const json = k => { try { return JSON.parse(get(k)); } catch { return null; } };
  function keys(prefix) {
    const found = new Set();
    try {
      for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k?.startsWith(prefix)) found.add(k); }
    } catch { for (const k of mem.keys()) if (k.startsWith(prefix)) found.add(k); }
    return found;
  }
  function profile() {
    const p = json(PROFILE); if (!p || typeof p.name !== 'string' || checkName(p.name)) return null;
    return { name: cleanName(p.name), college: collegeOf(p.college) ? p.college : null };
  }
  const saveProfile = p => put(PROFILE, JSON.stringify({ name: cleanName(p.name), college: collegeOf(p.college) ? p.college : null }));
  const boardKey = id => id + ':' + String(version(id) ?? '');
  function bestOf(k) {
    const ms = Number(get(k));
    return Number.isFinite(ms) && ms > 0 ? ms : Infinity;
  }
  const rememberBest = (k, ms) => { if (Number.isFinite(ms) && ms > 0 && ms < bestOf(k)) put(k, Math.round(ms)); };
  const keep = (id, ms) => rememberBest(BEST + boardKey(id), ms);
  const acceptedKey = (key, board) => ACCEPTED + key + ':' + board;

  const keyNow = () => { const k = get(KEY); return isKey(k) ? k : null; };
  let storageBlocked = false;
  function makeKey() {
    if (storageBlocked) return null;
    try {
      const key = storage.getItem(KEY);
      if (isKey(key)) return key;
      const fresh = hexOf(cryptoObj.getRandomValues(new Uint8Array(16)));
      storage.setItem(KEY, fresh);
      if (storage.getItem(KEY) === fresh) { mem.set(KEY, fresh); return fresh; }
    } catch {}
    storageBlocked = true;
    return null;
  }
  const consented = key => !!key && get(CONSENT) === key;
  let idCache = null;
  async function identity() {
    const key = keyNow(); if (!key) return null;
    const stored = json(IDENTITY);
    if (stored?.key === key && isPlayerId(stored.id)) return stored;
    if (idCache?.key === key) return idCache;
    // 옛 서버는 id를 돌려주지 않는다. 암호 API가 있는 브라우저에서는 종전대로 계산한다.
    try {
      const id = hexOf(await cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(key))).slice(0, 16);
      if (keyNow() === key) return (idCache = { key, id });
    } catch {}
    return null;
  }
  const playerId = async () => (await identity())?.id ?? null;
  const meQuery = who => '&id=' + who.id + (isPlayerId(who.sig) ? '&sig=' + who.sig : '');

  // ---- 통신: 8초 제한 · 던지지 않는다. 답: { ok: true, data } | { ok: false, code, detail }
  async function call(method, path, body) {
    if (typeof fetchFn !== 'function') return { ok: false, code: 'network' };
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null; let late = false;
    // AbortController 를 안 듣는 fetch · 답을 다 안 주는 서버도 8초에 끊는다
    let timer = 0; const cut = new Promise((_, no) => { timer = setTimeout(() => { late = true; ctrl?.abort(); no(new Error('timeout')); }, timeout); });
    try {
      const reply = await Promise.race([fetchFn(base + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: ctrl?.signal, ...(path.startsWith('/api/board?') && method === 'GET' ? {} : { cache: 'no-store' }), credentials: 'omit' }), cut]);
      let data = null; try { data = await Promise.race([reply.json(), cut]); } catch { if (reply.ok && !late) return { ok: false, code: 'network' }; }
      if (late) return { ok: false, code: 'timeout' };
      if (reply.ok && data?.ok) return { ok: true, data };
      return { ok: false, code: data?.code || (reply.status >= 500 ? 'server' : reply.status === 409 ? 'version' : reply.status === 429 ? 'rate' : reply.status === 422 ? 'rejected' : 'shape'), detail: typeof data?.detail === 'string' ? data.detail : '' };
    } catch { return { ok: false, code: late ? 'timeout' : 'network' }; } finally { clearTimeout(timer); }
  }

  // ---- 자료 → 화면 모양(차 이름 · 단과대 이름 · 초)
  const collegeName = id => collegeOf(id)?.name || '';
  const view = (row, mine) => ({ rank: row.rank, name: row.name ?? row.nick ?? '', tag: row.tag || '', college: collegeName(row.college), car: carName(row.car) ?? '', time: Number.isFinite(row.lapMs) ? row.lapMs / 1000 : null, me: !!mine?.(row), ...(Number.isInteger(row.place) ? { place: row.place } : {}) });   // place: 경주의 등수(화면은 시안 뒤에 쓴다)
  const courseList = () => courses.map(c => ({ id: c.id, label: '코스 ' + c.id, name: c.name }));
  // 모드 탭: 이름 + 작은 글(타임어택 '혼자 · 3바퀴', 경주 '상대 7대 · N바퀴' — 바퀴 수는 고른 코스의 것)
  const modeList = courseId => { const c = courses.find(x => x.id === courseId); return modes.filter(m => RANK_MODES.includes(m.id)).map(m => { const n = c?.laps?.[m.id];
    return { id: m.id, name: m.name, note: (m.id === 'time' ? '혼자' : '상대 ' + (PLACE_MAX - 1) + '대') + (Number.isFinite(n) ? ' · ' + n + '바퀴' : '') }; }); };
  const PICK = [NONE, ...COLLEGES.map(c => c.name)];
  const idOfName = name => COLLEGES.find(c => c.name === name)?.id || null;

  // 화면은 처음 쓸 때 붙인다(api 가 있을 때만)
  let ui = null;
  const rk = () => (ui ||= (attach || attachRanking)(root));

  // =============================================================== 랭킹 판
  let board = null, boardSeq = 0;
  async function loadBoard() {
    const my = ++boardSeq, b = board; if (!b) return;
    b.state = 'loading'; drawBoard();
    const q = queryOf(b.course) + '&scope=' + b.scope + (b.scope === 'college' ? '&college=' + encodeURIComponent(b.college) : '');
    const who = await identity();
    const [list, me] = await Promise.all([call('GET', '/api/board?' + q + '&limit=' + LIMIT), who ? call('GET', '/api/me?' + q + meQuery(who)) : null]);
    // 판을 여는 동안 겹친 요청은 마지막 것만 쓴다
    if (my !== boardSeq || board !== b) return;
    if (!list.ok) { b.state = 'error'; b.error = message(list); b.retry = again(list); drawBoard(); return; }
    const mine = me?.ok && me.data.me ? me.data.me : null;
    const isMe = row => !!mine && row.rank === mine.rank && (row.tag || '') === (mine.tag || '');
    b.total = list.data.total; b.rows = (list.data.rows || []).map(r => view(r, isMe)); b.me = mine ? view(mine) : null;
    b.state = b.rows.length ? 'ok' : 'empty'; drawBoard();
    b.toMe = false;   // 내 줄 쪽으로 내리는 것은 결과에서 처음 열 때 한 번만
  }
  function drawBoard() {
    const b = board; if (!b) return;
    const { course: c, mode = 'time' } = splitBoardId(b.course);
    rk().board({ modes: modeList(c), mode: mode || 'time', courses: courseList(), course: c, scopes: [{ id: 'all', name: '전체' }, { id: 'college', name: '단과대' }], scope: b.scope,
      colleges: COLLEGES.map(c => c.name), college: collegeName(b.college), klass: klassName, state: b.state, error: b.error, retry: b.retry,
      total: b.total, rows: b.state === 'ok' ? b.rows : [], me: b.state === 'ok' ? b.me : null, ...(b.toMe && b.state === 'ok' && b.me ? { scrollTo: b.me.rank } : {}) }, {
      onMode: m => { b.course = boardIdOf(splitBoardId(b.course).course, m); loadBoard(); },
      onCourse: id => { b.course = boardIdOf(id, splitBoardId(b.course).mode || 'time'); loadBoard(); },
      onScope: id => { b.scope = id === 'college' ? 'college' : 'all'; loadBoard(); },
      onCollege: name => { b.college = idOfName(name) || b.college; loadBoard(); },
      onRetry: () => loadBoard(),
      onClose: () => { if (board === b) { board = null; boardSeq++; } },
    });
  }
  // toMe: 결과의 '랭킹'에서 열 때 — 그 판의 코스 · 모드로 열고 내 줄 쪽으로 내려가 있게
  function openBoard(courseId = boardIdOf(course, modeNow()), toMe = false) {
    const { course: c, mode } = splitBoardId(courseId);
    board = { course: courses.some(x => x.id === c) && mode ? courseId : boardIdOf(course || courses[0]?.id, mode || 'time'), scope: 'all', college: profile()?.college || COLLEGES[0].id, state: 'loading', rows: [], me: null, total: 0, toMe };
    return loadBoard();
  }

  // =============================================================== 결과 → 닉네임 → 올리기 → 순위
  let run = null, lapSeq = 0, skipped = false;
  function drawResult(extra) {
    const r = run; if (!r) return;
    Object.assign(r.shown, extra);
    rk().result({ time: r.lapMs / 1000, laps: r.laps, ...r.shown }, {
      onAgain: () => { clear(); r.handlers.onAgain?.(); },
      onBack: () => { clear(); r.handlers.onBack?.(); },
      onBoard: () => openBoard(r.course, true),
      onRetry: () => { if (run === r) upload(r); },
    });
  }
  async function showAnswer(r, answer, p, key) {
    const my = lapSeq;
    if (answer.ok) {
      const d = answer.data, id = await playerId(), tag = id ? id.slice(0, 4) : '';
      if (my !== lapSeq || run !== r || keyNow() !== key) return;
      // 위쪽 다섯 + 내 앞 · 나 · 뒤를 순위대로 하나로(겹치면 한 번만) — 화면이 건너뛴 곳에 ··· 를 넣는다
      const byRank = new Map(); for (const row of [...(d.rows || []), ...(d.near || [])]) if (Number.isFinite(row?.rank) && !byRank.has(row.rank)) byRank.set(row.rank, row);
      const isMe = row => row.rank === d.rank && (!row.tag || !tag || row.tag === tag);
      const rows = [...byRank.values()].sort((a, b) => a.rank - b.rank).map(row => view(row, isMe));
      // 기록은 서버가 다시 센 값으로(보통 같다)
      drawResult({ state: 'done', ...(Number.isFinite(d.lapMs) ? { time: d.lapMs / 1000 } : {}), ...(Number.isInteger(d.place) && r.shown.race ? { race: { ...r.shown.race, place: d.place } } : {}), improved: d.improved !== false, best: Number.isFinite(d.best) ? d.best / 1000 : null, rank: d.rank, total: d.total, up: d.up, rows });
      return;
    }
    // 쓸 수 없는 이름(서버의 욕설 목록 등): 닉네임 판을 그 한 줄과 함께 다시 연다
    if (answer.code === 'name') { askName(r, message(answer), p); return; }
    drawResult({ state: 'failed', error: message(answer), retry: again(answer) });
  }
  function upload(r) {
    if (run !== r) return;
    drawResult({ state: 'busy', error: '', retry: false });
    if (!submit(r, {}, true)) drawResult({ state: 'later' });
  }
  function askName(r, error = '', last = profile()) {
    rk().entry({ mode: 'first', name: last?.name || '', college: last?.college ? collegeName(last.college) : NONE, colleges: PICK, max: NAME_MAX, error }, {
      onSubmit: ({ name, college }) => {
        if (run !== r || keyNow() !== r.key) return '';
        const bad = checkName(name); if (bad) return bad;
        if (!saveProfile({ name, college: idOfName(college) }) || !put(CONSENT, r.key)) {
          drawResult({ state: 'later' }); return '';
        }
        skipped = false; queueMicrotask(() => upload(r)); return '';
      },
      onCancel: () => { if (run === r) { skipped = true; keep(r.course, r.lapMs); drawResult({ state: 'later' }); } },
    });
  }
  // 경주 결과(2026-11-25 사용자가 고른 시안 B '기록 중심')에 더 그리는 것: { place, karts, pits(피트 횟수 — 피트가 없는 판은 null), bestLap(초) }
  const raceOf = info => info.race && typeof info.race === 'object' ? { race: { place: info.race.place ?? info.place ?? null, karts: info.race.karts ?? null, pits: info.race.pits ?? null, bestLap: info.race.bestLap ?? null } } : {};
  // 이 판에서 내 최고(서버가 받은 것 · 보내는 중 · 이 기기의 것 중 가장 빠른 것, ms) — 없으면 Infinity
  function bestNow(id) {
    const board = boardKey(id), key = keyNow(), slot = PENDING + board;
    return Math.min(bestOf(BEST + board), key ? bestOf(acceptedKey(key, board)) : Infinity, consented(key) ? pendingAt(slot)?.lapMs ?? Infinity : Infinity);
  }
  // 올리지 않는 판의 결과(경주 — 내 최고보다 느린 판): 랭킹의 결과 판 모양 그대로, 순위 · 표 없이(닉네임을 미뤘을 때와 같은 'later') + 내 최고와의 차
  function show(info = {}, handlers = {}) {
    if (!Number.isFinite(info.lapMs) || info.lapMs <= 0) return;
    lapSeq++;
    const id = info.course || course, best = bestNow(id);
    run = { course: id, car: info.car, lapMs: Math.round(info.lapMs), laps: Array.isArray(info.laps) ? info.laps : null, run: null, handlers, key: keyNow(), shown: { state: 'later', improved: !Number.isFinite(best), best: Number.isFinite(best) ? best / 1000 : null, ...raceOf(info) } };
    drawResult({});
  }
  function lap(info = {}, handlers = {}) {
    if (!Number.isFinite(info.lapMs) || info.lapMs <= 0) return;
    lapSeq++;
    const r = run = { course: info.course || course, car: info.car, lapMs: Math.round(info.lapMs), laps: Array.isArray(info.laps) ? info.laps : null, run: info.run, handlers, key: makeKey(), shown: { state: 'busy', improved: true, ...raceOf(info) } };
    if (consented(r.key) && profile()) { upload(r); return; }
    if (skipped || !r.key) { keep(r.course, r.lapMs); drawResult({ state: 'later' }); return; }
    drawResult({ state: 'busy' }); askName(r);
  }

  // =============================================================== 결과 판을 띄울지 어림하기 · 조용히 올리기
  //   2026-11-24 사용자: "최고기록 낼떄마다 뜨는 방식이 제일 좋은 방식인가? 그냥 기록은 하되, 표시 자체를 상위 몇명만 하는 방식은 어떨까?" → 추천대로:
  //   처음 기록 때 한 번 닉네임을 묻고 결과 판까지 보인다. 그 뒤 최고 기록은 조용히 올린다(1바퀴 때는 계속 달리며 알림 끝에 순위 — 3바퀴(2026-11-24)는 판이 끝나므로 main 의 보통 결과 화면에 순위). TOP 위 안에서 순위가 오를 때만 랭킹의 결과 판을 띄운다.
  //   결승선을 넘는 순간에 서버에 물을 수는 없어서 미리 받아 둔 위쪽 TOP 명의 기록(tops)으로 어림한다 — 어림이 틀려도 화면의 순위는 서버가 준 값이다.
  const tops = new Map();      // 코스 → { at(받은 때), others: [lapMs…](위쪽 TOP 명 중 나를 뺀 것) | null(아직 못 받음), mine(내 순위 | null) }
  const waiting = new Map();   // 판 → 이 탭에서 보내는 중이거나 타이머를 기다리는 주행
  const attempts = new Map();  // 같은 주행이 한 화면에서 네 번 실패하면 다음 접속까지 쉰다
  const noted = new Set();     // 한 번만 알리는 것(version · rejected)
  const rankNow = (courseId, rank) => { const t = tops.get(courseId); if (t && Number.isFinite(rank)) { t.mine = rank; t.revision++; } };
  // 출발할 때와 달리는 동안 1분마다 대기를 살피고 위쪽 TOP 명과 내 자리를 받아 둔다.
  async function warm(courseId = course, force = false) {
    await resumePending();
    const old = tops.get(courseId), t = Date.now();
    if (!force && old && t - old.at < WARM_EVERY) return;
    const now = old || { others: null, mine: null, revision: 0 };
    now.at = t; tops.set(courseId, now);   // 받는 동안 또 부르지 않게
    const q = queryOf(courseId) + '&scope=all', revision = now.revision, who = await identity();
    const [list, me] = await Promise.all([call('GET', '/api/board?' + q + '&limit=' + TOP), who ? call('GET', '/api/me?' + q + meQuery(who)) : null]);
    if (tops.get(courseId) !== now || (who && keyNow() !== who.key)) return;   // 그사이 지웠다(forget)
    if (!list.ok) { if (!now.others) tops.delete(courseId); return; }
    const mine = me?.ok && me.data.me ? me.data.me : null;
    now.others = (list.data.rows || []).filter(r => !(mine && r.rank === mine.rank && (r.tag || '') === (mine.tag || ''))).map(r => r.lapMs).filter(Number.isFinite);
    if (now.revision === revision && (!who || me?.ok)) now.mine = mine ? mine.rank : null;
    if (mine) rememberBest(acceptedKey(who.key, boardKey(courseId)), mine.lapMs);   // 서버에 있는 내 기록을 내 최고로(저장소가 지워졌어도 같은 기록을 또 올리지 않게)
  }
  // 이 최고 기록을 어떻게 다룰까: 'ask'(공개 선택이 없다 — 랭킹의 결과 판에서 닉네임부터) · 'skip'(닉네임을 미뤘다 — 안 올린다) · 'panel'(TOP 위 안에서 순위가 오른다 — 결과 판) · 'quiet'(조용히 올린다)
  function plan(courseId, lapMs) {
    if (!consented(keyNow()) || !profile()) return skipped ? 'skip' : 'ask';
    const t = tops.get(courseId); if (!t || !t.others) return 'quiet';
    const guess = t.others.filter(ms => ms <= lapMs).length + 1;   // 같은 기록이면 먼저 올린 사람이 위
    return guess <= TOP && (t.mine == null || guess < t.mine) ? 'panel' : 'quiet';
  }
  // 접수 전에 주행을 기기에 남긴다. 같은 판의 더 빠른 대기를 늦게 온 답이나 다른 탭이 지우지 않게 확인한다.
  const slotOf = record => PENDING + record.course + ':' + record.courseVer;
  const pendingKey = r => slotOf(r) + ':' + r.key + ':' + r.lapMs;
  const sameRecord = (a, b) => !!a && a.key === b.key && a.lapMs === b.lapMs && a.name === b.name && a.college === b.college;
  function current(record) {
    const p = profile();
    return !!p && record.key === keyNow() && consented(record.key) && p.name === record.name && p.college === record.college;
  }
  function stop(slot) {
    clearTimeout(waiting.get(slot)?.timer);
    waiting.delete(slot);
  }
  // 다른 탭의 '읽기 → 쓰기'가 끼어들 수 있다. 시간마다 다른 칸에 먼저 쓰고 느린 칸만 걷어낸다.
  // 그래서 53초를 저장하거나 지우던 탭이 다른 탭의 50초를 덮거나 지울 수 없다.
  function pendingBoards(prefix = PENDING) {
    const boards = new Map();
    for (const k of keys(prefix)) {
      const r = json(k);
      if (!r?.run || !Number.isFinite(r.lapMs) || r.lapMs <= 0 || !current(r) || k !== pendingKey(r) || r.courseVer !== String(version(r.course) ?? '')) {
        del(k); continue;
      }
      const slot = slotOf(r), old = boards.get(slot);
      if (old && old.lapMs <= r.lapMs) { del(k); continue; }
      if (old) del(pendingKey(old));
      boards.set(slot, r);
    }
    return boards;
  }
  const pendingAt = slot => pendingBoards(slot + ':').get(slot);
  function discard(record) {
    const k = pendingKey(record);
    if (sameRecord(json(k), record)) del(k);
  }
  function submit(info, hooks, panel = false) {
    const key = keyNow(), p = profile();
    if (!consented(key) || !p || !Number.isFinite(info.lapMs) || info.lapMs <= 0) return;
    const id = info.course || course, lapMs = Math.round(info.lapMs);
    if (!panel && lapMs >= bestOf(acceptedKey(key, boardKey(id)))) return;
    const record = { key, course: id, courseVer: String(version(id) ?? ''), car: info.car, lapMs, run: info.run, name: p.name, college: p.college };
    const slot = slotOf(record), saved = pendingAt(slot), active = waiting.get(slot);
    if (saved && (saved.lapMs < lapMs || (!panel && saved.lapMs === lapMs))) return;
    if (active && current(active.record) && active.record.lapMs <= lapMs) {
      if (!panel || active.record.lapMs < lapMs) return;
      if (!active.timer || active.busy) return active.sending;
    }
    stop(slot); attempts.delete(slot);
    keep(id, lapMs);
    // 용량이 모자라도 이번 제출은 시도한다. 대기를 쓸 수 없었다면 실패 뒤에 다시 보낼 사본은 없다.
    if (put(pendingKey(record), JSON.stringify(record)) && !sameRecord(pendingAt(slot), record)) return;
    return startSend(slot, record, hooks);
  }
  function quiet(info = {}, hooks = {}) { return submit(info, hooks); }

  function startSend(slot, record, hooks = {}) {
    const item = { record, hooks, timer: 0, busy: false };
    waiting.set(slot, item);
    item.sending = send(slot, item);
    return item.sending;
  }
  async function send(slot, item) {
    const r = item.record;
    if (waiting.get(slot) !== item) return;
    if (!current(r) || (item.timer && !sameRecord(pendingAt(slot), r))) { stop(slot); return; }
    const owner = generation;
    const pendingId = pendingKey(r), previous = attempts.get(slot);
    const tries = previous?.id === pendingId ? previous.tries + 1 : 1;
    attempts.set(slot, { id: pendingId, tries });
    item.timer = 0;
    const { course: c, mode } = splitBoardId(r.course);
    const answer = await call('POST', '/api/runs', { v: RANK_API_VERSION, course: c, courseVer: r.courseVer, klass: RANK_CLASS, car: r.car, key: r.key, nick: r.name, college: r.college, run: r.run, ...(mode && mode !== 'time' ? { mode, level: RACE_LEVEL } : {}) });
    if (owner !== generation || !current(r)) return;
    const board = r.course + ':' + r.courseVer;
    if (answer.ok) {
      const d = answer.data;
      if (isPlayerId(d.id)) {
        idCache = { key: r.key, id: d.id, ...(isPlayerId(d.sig) ? { sig: d.sig } : {}) };
        put(IDENTITY, JSON.stringify(idCache));
      }
      const best = d.best ?? d.lapMs;
      rememberBest(acceptedKey(r.key, board), best);
      // 더 빠른 새 기록을 저장할 자리가 없어 옛 대기가 남았거나, 예전 응답이 뒤늦게 온 경우.
      const pending = pendingAt(slot);
      if (pending && pending.lapMs >= best) discard(pending);
    }
    if (waiting.get(slot) !== item) return;
    const saved = pendingAt(slot);
    const panel = run?.key === r.key && run.course === r.course && run.lapMs === r.lapMs ? run : null;
    if (answer.ok || (!again(answer) && !shut(answer))) {
      discard(r); stop(slot); attempts.delete(slot);
      if (answer.ok) {
        const d = answer.data; rankNow(r.course, d.rank);
        item.hooks.onRank?.({ rank: d.rank, total: d.total, up: d.up, improved: d.improved !== false });
      } else if (answer.code === 'name') { del(PROFILE); del(CONSENT); del(BEST + boardKey(r.course)); dropPending(); }   // 이름이 거절돼 못 올린 기록: 기기의 최고에서도 빼 다음 바퀴에 다시 묻게
      else if ((answer.code === 'version' || answer.code === 'rejected') && !noted.has(answer.code)) {
        noted.add(answer.code); item.hooks.onNote?.(message(answer));
      }
    } else {
      item.busy = answer.code === 'rate' && answer.detail === 'busy';
      const retained = sameRecord(saved, r);
      if (!retained) attempts.delete(slot);
      if (retained && tries < retry.tries && again(answer) && (!panel || item.busy)) {
        item.timer = setTimeout(() => { item.sending = send(slot, item); }, item.busy ? 5000 : retry.after * tries);
        item.timer?.unref?.();
      } else stop(slot);
    }
    if (panel && panel === run) await showAnswer(panel, answer, { name: r.name, college: r.college }, r.key);
  }

  function resumePending() {
    const sending = [];
    for (const [slot, r] of pendingBoards()) {
      const active = waiting.get(slot), last = attempts.get(slot);
      const same = sameRecord(active?.record, r);
      if (same && (!active.timer || active.busy)) continue;
      stop(slot);
      if (last?.id === pendingKey(r) && last.tries >= retry.tries) continue;
      sending.push(startSend(slot, r, same ? active.hooks : undefined));
    }
    return Promise.all(sending);
  }
  function dropPending() {
    for (const slot of waiting.keys()) stop(slot);
    for (const slot of keys(PENDING)) del(slot);
    attempts.clear();
  }

  // =============================================================== 시작 화면의 '랭킹' 단추 · 설정의 '이름' 줄 · 이름 바꾸기 · 지우기
  const shownProfile = () => { const p = profile(); return p ? { name: p.name, college: collegeName(p.college) } : null; };
  function ready() {
    rk().startLink(() => openBoard(boardIdOf(course, modeNow())));   // 지금 모드의 표
    rk().settingsRow(shownProfile(), openEdit);
  }
  let generation = 0;
  function openEdit() {
    const p = profile(), opened = generation, key = keyNow(), original = get(PROFILE);
    const valid = () => opened === generation && keyNow() === key && get(PROFILE) === original;
    rk().entry({ mode: 'edit', name: p?.name || '', college: p?.college ? collegeName(p.college) : NONE, colleges: PICK, max: NAME_MAX, erase: !!(p || keyNow()) }, {
      onSubmit: async ({ name, college }) => {
        if (!valid()) return '';
        const bad = checkName(name); if (bad) return bad;
        const next = { name, college: idOfName(college) };
        // 아직 올린 적이 없으면 브라우저에만 남긴다. 올린 적이 있으면 서버의 내 기록 이름도 같이 바꾼다
        if (consented(key)) { const r = await call('POST', '/api/me', { key, nick: cleanName(name), college: next.college }); if (!r.ok) return message(r); }
        if (!valid()) return '';
        if (next.name !== p?.name || next.college !== p?.college) dropPending();
        saveProfile(next); skipped = false; rk().settingsRow(shownProfile(), openEdit); return '';
      },
      onErase: async () => {
        if (!valid()) return '';
        if (key) { const r = await call('POST', '/api/me/delete', { key }); if (!r.ok) return message(r); }
        if (!valid()) return '';
        forget(); rk().settingsRow(shownProfile(), openEdit); return '';
      },
    });
  }
  // 열쇠나 공개 선택이 달라지면 늦게 온 응답과 옛 화면의 단추도 효력을 잃는다.
  function reset() {
    generation++; idCache = null; skipped = false; mem.clear();
    for (const slot of waiting.keys()) stop(slot);
    attempts.clear(); tops.clear(); noted.clear();
    const back = run?.handlers.onBack;
    clear(); back?.();
  }
  function forget() {
    const owned = new Set([...keys(PREFIX), ...mem.keys()]);
    for (const k of owned) del(k);
    reset();
  }
  events?.addEventListener('storage', event => {
    if (event.storageArea && event.storageArea !== storage) return;
    if (event.key == null || [KEY, PROFILE, CONSENT].includes(event.key)) {
      reset();
      pendingBoards();   // 다른 열쇠·프로필의 대기도 걷어낸다
      ui?.settingsRow(shownProfile(), openEdit);
    } else if (event.key.startsWith(PENDING)) {
      // 다른 탭이 이미 마친 대기의 타이머만 끊는다. 진행 중인 요청은 자기 결과 판에 답할 수 있다.
      for (const [slot, item] of waiting) {
        if (item.timer && event.key.startsWith(slot + ':') && !sameRecord(pendingAt(slot), item.record)) stop(slot);
      }
    }
  });

  function clear() { lapSeq++; boardSeq++; run = null; board = null; if (!ui) return; ui.closeEntry(); ui.closeBoard(); ui.clearResult(); }

  // 순위에 올릴 수 있는 판인가: 타임어택 또는 경주(그랑프리 — 상대 난이도 RACE_LEVEL '어려움'에서만) · RANK_CLASS · 부품 켬 · 조정판 안 씀 · 자동 운전 아님 · body=0 아님
  function eligible({ mode, level = null, klass, partsOn = true, tuned = false, auto = false, bodyOff = false } = {}) {
    const touched = tuned && (typeof tuned !== 'object' || Object.keys(tuned).length > 0);
    return (mode === 'time' || (mode !== 'time' && RANK_MODES.includes(mode) && level === RACE_LEVEL)) && klass === RANK_CLASS && partsOn !== false && !touched && !auto && !bodyOff && !!makeKey();
  }
  // 내 판 최고(브라우저에 남긴 값 — 코스판이 바뀌면 새로)보다 빠른가. 없으면 true
  function isBest(courseId, lapMs) {
    if (!Number.isFinite(lapMs) || lapMs <= 0) return false;
    const board = boardKey(courseId), key = keyNow();
    if (!consented(key)) return lapMs < bestOf(BEST + board);   // 공개를 고르지 않은 사람: 이 기기의 내 최고보다 빠를 때만 묻는다(게임을 열 때마다 첫 바퀴에서 판을 끝내고 묻지 않는다)
    const slot = PENDING + board, stored = pendingAt(slot), active = waiting.get(slot)?.record;
    const pendingBest = Math.min(stored?.lapMs ?? Infinity, active && current(active) ? active.lapMs : Infinity);
    return lapMs < Math.min(bestOf(acceptedKey(key, board)), pendingBest);
  }

  resumePending();   // 어느 코스로 게임을 다시 열어도 이전 판의 대기를 찾아 보낸다
  return { enabled: true, profile, eligible, isBest, plan, ready, warm, openBoard, lap, show, quiet, keep, clear,
    // 시험 · 개발용(main.js 는 안 쓴다)
    _: { playerId, keyNow, forget, call, openEdit, get run() { return run; }, get board() { return board; }, get tops() { return tops; }, get waiting() { return waiting; } } };
}
