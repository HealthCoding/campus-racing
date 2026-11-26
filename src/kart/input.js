// 입력(약속 3.5) — 키보드 + 터치. read() 는 약속 3.4 의 input 모양을 돌려준다.
//   const input = createInput({ keyTarget: window, touchRoot: document.querySelector('#touch') });
//   sim.step(input.read());
// 키보드: ↑/W 가속, ↓/S 브레이크 · 후진, ←→/A·D 조향, Shift 드리프트, Space 순간 가속, X 경적.
//   (Ctrl 은 쓰지 않는다 — 맥은 Ctrl+방향키 · Ctrl+Space 가 시스템 단축키, 윈도우는 Ctrl+W 가 탭 닫기)
// 경적(X)은 주행 입력이 아니다 — read() · peek() 에 안 들어가고(기록 · 서버 검증과 무관) 터치 모드도 안 바꾼다. horn() 으로 읽거나 onHorn(fn) 으로 누름 · 뗌을 받는다.
// read().kick: '다시 밟기' 신호(약속 3.11) — 키보드 모드는 가속 키, 터치 모드는 드리프트 단추가 눌려 있는지.
// read().kickTap: 그 신호의 '톡'(짧은 가속을 주는 것은 이것이다) — 키보드는 가속 키를 새로 누를 때, **터치는 드리프트 단추를 뗄 때**(2026-11-26).
//   그 전에는 터치도 누를 때였다 → 드리프트가 끝나고 0.5초 안에 드리프트 단추를 다시 누르면 짧은 가속으로 쓰이고 그 누름으로는 드리프트가 안 걸렸다
//   (사용자: "모바일에서 가끔 드리프트가 잘 안눌리는 … 드리프트가 아니라 부스트가 눌리는 느낌"). 이제 드리프트 단추는 언제나 드리프트만 걸고,
//   충분히(0.25초) 미끄러진 드리프트를 손을 떼어 끝내면 그 순간 짧은 가속이 붙는다(자동 가속이라 가속을 새로 밟을 수 없는 터치의 '다시 밟기').
// kickAt: 그 신호가 마지막으로 새로 켜진 시각(performance.now() ms, 처음엔 0) — 출발 가속 판정용이라 터치는 예전처럼 드리프트 단추를 누른 시각이다.
// 터치: touchRoot 안에 ◀ ▶ 단추(오른쪽 아래 — 누르는 동안 −1 · +1, 키보드와 같다)와 단추 3개(왼쪽 아래: 드리프트 · 부스트 · 브레이크)를 만든다.
//   터치 단추를 한 번이라도 쓰면 '터치 모드' — 자동 가속(브레이크를 누르는 동안만 풀림). 키보드를 누르면 다시 키보드 모드.
// pointercancel · 창 포커스 잃음 · 화면 숨김에 모든 입력을 비운다.
const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'drift', ShiftRight: 'drift', Space: 'boost', KeyX: 'horn',
};
const KEY_BY_NAME = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', Shift: 'drift', ' ': 'boost', x: 'horn', X: 'horn' };

// 터치 단추의 모양 · 자리(2026-11-25 사용자 "단추는 오른손 방향조정, 왼쪽 기술로 진행" — 시안/모바일조작_시안.html 의 A 를 좌우로 뒤집은 것):
//   여러 레이싱 게임이 같이 쓰는 엄지 자리 · 크기를 따르되, 손은 지금처럼 ◀ ▶ 오른손 · 드리프트 · 부스트 · 브레이크 왼손. 자동 가속은 그대로.
//   모양: 모서리 둘(오른쪽 위 · 왼쪽 아래)을 자른 판(게임 말씨) · 옅은 어두운 바탕 + 가는 흰 테(SVG 다각형 — 테가 자른 모서리를 따라간다). 드리프트 밑에 작은 이름과 파랑 · 흰 줄무늬.
//   부스트 · 브레이크(2026-11-25 사용자가 시안/휴대폰단추_고르기.html 에서 '라' — "버튼이 각각 부스터랑 브레이크를 의미하는건지 잘 안와닿아서"): 부스트 = 각진 불꽃 + '부스터',
//   모아 둔 부스터가 없으면 불꽃 · 이름이 흐리고 한 칸이 모이면(data-ready) 노랗게 켜진다. 브레이크 = 빨간 정지 팔각형 + '브레이크'. 원본 시안/휴대폰단추_src/buttons.js.
//   누르면 밝아지고 테가 굵어진다(data-on), 부스트가 준비되면 노란 테 · 빛(data-ready). 그림은 SVG(아래 GLYPH — 이 게임이 직접 그린 것). 보이는 모양(i)보다 누르는 자리(.kt-btn)가 넓다.
//   누르는 자리(휴대폰 가로 / 세로, px — 애플 지침의 44pt 이상): ◀ ▶ 96 / 84(둘 사이 8 / 6) · 드리프트 112 / 100 · 부스트 82 / 74 · 브레이크 64 / 58.
//   드리프트는 구석, 부스트는 그 위 안쪽(엄지가 위로 굽는 호), 브레이크는 작게 안쪽. 안전 영역(노치 · 홈 막대)만큼 더 들인다.
//   부스트의 누르는 자리는 드리프트의 오른쪽 위와 조금 겹친다(가로 6 × 32 px · 세로 14 × 6 px) — 겹친 자리는 드리프트가 받는다(z-index, 2026-11-26).
//   손 바꾸기: steerHand 'left'(설정의 '조향: 왼손') 면 좌우를 뒤집는다(.kt-wrap[data-hand=left]).
// 확대 막기(2026-11-25 사용자 "부스터 같은 거 누른다고 터치 연속으로 하면 화면이 막 확대돼"): 아이폰 사파리는 viewport 의 user-scalable=no 를 듣지 않고,
//   pointerdown 의 preventDefault 는 확대 · 돋보기 같은 기본 동작을 막지 못한다(포인터 이벤트 규격). 그래서 단추 층에 터치 이벤트(touchstart · touchmove · touchend)를
//   passive: false 로 따로 달아 preventDefault 한다 — WebKit 은 이것으로 그 손가락의 두 번 탭 확대 · 두 손가락 확대 · 길게 눌러 뜨는 돋보기 · 클릭 흉내를 모두 거둔다.
//   포인터 이벤트(pointerdown · pointermove · pointerup)는 터치 이벤트와 따로 오므로 단추는 그대로 듣는다.
//   CSS touch-action: none 만으로 안 되는 까닭: WebKit 은 position: absolute 인 요소(이 단추들)에서 touch-action: none 이 두 번 탭 확대를 못 막는 버그가 열려 있다
//   (https://bugs.webkit.org/show_bug.cgi?id=218015 — iOS 13.5 ~ 14 에서 재현, 2026-11 지금도 NEW).
const STYLE = `
.kt-wrap{position:absolute;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;color:#fff;--kL:env(safe-area-inset-left,0px);--kR:env(safe-area-inset-right,0px);--kB:env(safe-area-inset-bottom,0px)}
.kt-pad,.kt-btn{position:absolute;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.kt-pad,.kt-wrap>.kt-btn{pointer-events:auto;touch-action:none}
.kt-btn{display:grid;place-items:center;margin:0;padding:0;border:0;background:none;color:inherit;font:inherit}
.kt-btn>i{position:absolute;inset:var(--in,8px);display:grid;place-items:center;align-content:center;gap:1px;font-style:normal;transition:transform .08s;pointer-events:none}
.kt-shape{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.kt-shape polygon{fill:rgba(11,12,17,.34);stroke:rgba(255,255,255,.6);stroke-width:2px;vector-effect:non-scaling-stroke;transition:fill .08s}
.kt-btn svg.kt-g{position:relative;display:block;width:var(--g,30px);height:var(--g,30px);flex:none;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;opacity:.92}
.kt-btn small{position:relative;font:italic 800 10.5px/1 -apple-system,"Apple SD Gothic Neo",system-ui,sans-serif;opacity:.85;letter-spacing:.02em}
.kt-stripe{position:absolute;left:22%;right:22%;bottom:9px;height:5px;display:flex;transform:skewX(-28deg)}
.k-drift>i{padding-bottom:12px}
.k-drift{z-index:1}
.kt-stripe i{flex:1;background:#fff}.kt-stripe i:nth-child(odd){background:#2d63d8}
.kt-btn[data-on="1"]>i{transform:scale(1.05)}
.kt-btn[data-on="1"] .kt-shape polygon{fill:rgba(255,255,255,.3);stroke:rgba(255,255,255,.95);stroke-width:3px}
.kt-btn[data-on="1"] svg.kt-g{opacity:1}
.kt-btn.k-boost[data-ready="1"]>i{color:#ffd84a;filter:drop-shadow(0 0 8px rgba(255,216,74,.5))}
.kt-btn.k-boost[data-ready="1"] .kt-shape polygon{stroke:#ffd84a;stroke-width:2.5px;fill:rgba(40,34,8,.4)}
.k-left svg.kt-g,.k-right svg.kt-g{stroke-width:3.2}
.kt-pad{right:calc(var(--kR) + 18px);bottom:calc(var(--kB) + 18px);width:200px;height:96px}
.kt-pad .kt-btn{top:0;width:96px;height:96px;--in:8px;--g:35px}
.k-left{left:0}.k-right{right:0}
.k-drift{left:calc(var(--kL) + 18px);bottom:calc(var(--kB) + 18px);width:112px;height:112px;--in:9px;--g:40px}
.k-boost{left:calc(var(--kL) + 124px);bottom:calc(var(--kB) + 98px);width:82px;height:82px;--in:7px;--g:30px}
.k-brake{left:calc(var(--kL) + 150px);bottom:calc(var(--kB) + 22px);width:64px;height:64px;--in:5px;--g:23px}
.kt-wrap[data-hand=left] .kt-pad{right:auto;left:calc(var(--kL) + 18px)}
.kt-wrap[data-hand=left] .k-drift{left:auto;right:calc(var(--kR) + 18px)}
.kt-wrap[data-hand=left] .k-boost{left:auto;right:calc(var(--kR) + 124px)}
.kt-wrap[data-hand=left] .k-brake{left:auto;right:calc(var(--kR) + 150px)}
@media (max-width:700px){
.kt-pad{right:calc(var(--kR) + 14px);bottom:calc(var(--kB) + 30px);width:174px;height:84px}
.kt-pad .kt-btn{width:84px;height:84px;--in:7px;--g:30px}
.k-drift{left:calc(var(--kL) + 14px);bottom:calc(var(--kB) + 26px);width:100px;height:100px;--in:8px;--g:36px}
.k-boost{left:calc(var(--kL) + 100px);bottom:calc(var(--kB) + 120px);width:74px;height:74px;--in:6px;--g:27px}
.k-brake{left:calc(var(--kL) + 126px);bottom:calc(var(--kB) + 36px);width:58px;height:58px;--in:5px;--g:21px}
.kt-wrap[data-hand=left] .kt-pad{right:auto;left:calc(var(--kL) + 14px)}
.kt-wrap[data-hand=left] .k-drift{left:auto;right:calc(var(--kR) + 14px)}
.kt-wrap[data-hand=left] .k-boost{left:auto;right:calc(var(--kR) + 100px)}
.kt-wrap[data-hand=left] .k-brake{left:auto;right:calc(var(--kR) + 126px)}
}
/* 부스트 · 브레이크 '라'(2026-11-25): 그림 크기 · 이름 · 빈 칸 흐림 · 준비되면 심지 노랑 */
.k-boost{--g:27px}
.k-brake{--g:23px}
.k-boost svg.kt-g{stroke-width:2.2}
.k-boost:not([data-ready="1"]) svg.kt-g,.k-boost:not([data-ready="1"]) small{opacity:.45}
.k-boost[data-ready="1"] .kt-core{fill:#ffd84a;stroke:none}
.k-brake small{font-size:9.5px;letter-spacing:0;color:#ffb3b5}
@media (max-width:700px){.k-boost{--g:24px}.k-brake{--g:20px}}
`;
// 그림(24 × 24): 이 게임이 직접 그린 단순한 도형이다(다른 게임의 아이콘을 따오지 않는다).
const svg = body => `<svg class="kt-g" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
// 판 모양: 오른쪽 위 · 왼쪽 아래 모서리를 22% 자른 사각형(늘려도 테 굵기는 그대로 — vector-effect)
const SHAPE = '<svg class="kt-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,0 78,0 100,22 100,100 22,100 0,78"/></svg>';
const STRIPE = '<b class="kt-stripe" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></b>';
const GLYPH = {
  left: svg('<path d="M15 4.5 L7.5 12 L15 19.5"/>'),
  right: svg('<path d="M9 4.5 L16.5 12 L9 19.5"/>'),
  // 드리프트: 위에서 본 차(비스듬히 미끄러지는 몸통 · 앞유리 선 · 바퀴 넷)와 그 뒤의 짧은 굽은 자국 둘
  drift: svg('<g transform="rotate(38 15 9)"><rect x="12" y="3.4" width="6" height="11.2" rx="2"/><path d="M13.6 6.8 H16.4"/><path d="M10.4 4.6 V6.8 M10.4 11.2 V13.4 M19.6 4.6 V6.8 M19.6 11.2 V13.4" stroke-width="2.2"/></g><path d="M2.8 19 C 4.6 16.8, 6.6 15.6, 8.6 15"/><path d="M5.8 22 C 7.8 19.9, 9.9 18.8, 12.2 18.3"/>'),
  // 부스트: 각진 불꽃(바깥 혀 셋 + 안쪽 심지 — 부스트를 쓰면 배기구에서 나오는 불꽃과 같은 말). 준비되면 심지가 노랗게 찬다
  boost: svg('<path d="M12 2.2 L17 9 L16.3 12.6 L19.2 10.6 L19.4 15.8 L15 21.4 H9 L4.6 15.8 L5.2 11.2 L7.8 13.2 L7.6 8 Z"/><path class="kt-core" d="M12 11.2 L14.6 15.2 L13.3 18.6 H10.7 L9.4 15.2 Z" stroke-width="2"/>'),
  // 브레이크: 정지 표지(빨간 팔각형 + 흰 가로 막대 — 24 px 안에 글자는 안 읽혀 막대로)
  brake: svg('<polygon class="kt-oct" points="15.7,2.9 21.1,8.3 21.1,15.7 15.7,21.1 8.3,21.1 2.9,15.7 2.9,8.3 8.3,2.9" fill="#e5484d" stroke="none"/><path d="M7.4 12 H16.6" stroke="#fff" stroke-width="2.8" stroke-linecap="square"/>'),
};

export function createInput({ keyTarget = globalThis.window, touchRoot = null, steerHand = 'right' } = {}) {
  const held = new Set();                 // 키보드로 누른 것('up' | 'down' | 'left' | 'right' | 'drift' | 'boost')
  const down = new Map();                 // 물리 키(code) → 동작. W 와 ↑ 를 같이 눌렀다가 하나만 떼도 가속이 남게
  const sync = () => { held.clear(); for (const k of down.values()) held.add(k); };
  // 조향: ◀ ▶ 를 누른 손가락마다 지금 어느 쪽인지(누른 채 반대쪽으로 밀면 그쪽으로 바뀐다). 조향 값 = 오른쪽 손가락이 있으면 +1, 왼쪽이면 −1, 둘 다면 0(키보드와 같다).
  const touch = { side: new Map(), brake: new Set(), drift: new Set(), boost: new Set() };
  const touchSteer = () => { let l = false, r = false; for (const v of touch.side.values()) { if (v < 0) l = true; else r = true; } return (r ? 1 : 0) - (l ? 1 : 0); };
  let touchMode = false, kickAt = 0;
  // 경적: 누르고 있는 물리 키들. 주행 입력과 따로 둔다(held · down 에 안 넣는다)
  const hornKeys = new Set(), hornFns = new Set();
  const hornSet = (code, on) => { const was = hornKeys.size > 0; if (on) hornKeys.add(code); else if (code === null) hornKeys.clear(); else hornKeys.delete(code); const now = hornKeys.size > 0; if (now !== was) for (const fn of hornFns) { try { fn(now); } catch (e) { console.error(e); } } };
  // 새 누름 잡아 두기: 부스트 · '다시 밟기'가 새로 눌리면 적어 두었다가 다음 read() 에 boostTap · kickTap 으로 준다(화면 한 장 사이에 톡 친 키도 놓치지 않게).
  const latch = { boost: false, kick: false };
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const off = [];
  const on = (target, type, fn, opts) => { if (!target?.addEventListener) return; target.addEventListener(type, fn, opts); off.push(() => target.removeEventListener(type, fn, opts)); };

  function clear() {
    hornSet(null, false);
    down.clear(); held.clear(); touch.side.clear(); touch.brake.clear(); touch.drift.clear(); touch.boost.clear(); latch.boost = latch.kick = false;
    for (const b of buttons) b.el.dataset.on = '0';
    for (const el of arrows) el.dataset.on = '0';
  }

  // ── 키보드 ──
  const nameOf = e => KEYS[e.code] || KEY_BY_NAME[e.key];
  on(keyTarget, 'keydown', e => {
    const k = nameOf(e); if (!k) return;
    const tag = e.target?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault?.();
    if (k === 'horn') { hornSet(e.code || e.key, true); return; }   // 경적은 주행 입력 · 터치 모드를 건드리지 않는다
    if (k === 'up' && !held.has('up')) { kickAt = now(); latch.kick = true; }   // 가속 키가 안 눌린 상태에서 새로 눌림(길게 눌러 되풀이되는 keydown 은 제외)
    if (k === 'boost' && !held.has('boost')) latch.boost = true;
    down.set(e.code || e.key, k); sync(); touchMode = false;
  });
  on(keyTarget, 'keyup', e => { if (nameOf(e) === 'horn' || hornKeys.has(e.code || e.key)) { hornSet(e.code || e.key, false); return; } down.delete(e.code || e.key); if (e.key === 'Shift') for (const [code, k] of down) if (k === 'drift') down.delete(code); sync(); });
  on(globalThis.window, 'blur', clear);
  if (keyTarget !== globalThis.window) on(keyTarget, 'blur', clear);
  on(globalThis.document, 'visibilitychange', () => { if (globalThis.document.hidden) clear(); });

  // ── 터치 ──
  const buttons = [], arrows = []; let wrapEl = null;
  if (touchRoot && globalThis.document) {
    const doc = globalThis.document;
    if (!doc.getElementById('kt-style')) { const s = doc.createElement('style'); s.id = 'kt-style'; s.textContent = STYLE; doc.head.appendChild(s); }
    const wrap = doc.createElement('div'); wrap.className = 'kt-wrap'; wrap.dataset.hand = steerHand === 'left' ? 'left' : 'right'; wrapEl = wrap;
    const make = (key, label, inner) => { const el = doc.createElement('div'); el.className = 'kt-btn k-' + key; el.setAttribute('role', 'button'); el.setAttribute('aria-label', label); el.innerHTML = '<i>' + SHAPE + inner + '</i>'; el.dataset.on = '0'; return el; };
    // ◀ ▶ : 둘을 담은 판(.kt-pad)이 누름을 받는다 — 판의 가운데보다 왼쪽이면 ◀, 오른쪽이면 ▶
    const pad = doc.createElement('div'); pad.className = 'kt-pad'; pad.setAttribute('aria-label', '조향');
    const leftEl = make('left', '왼쪽', GLYPH.left), rightEl = make('right', '오른쪽', GLYPH.right); pad.append(leftEl, rightEl); arrows.push(leftEl, rightEl); wrap.appendChild(pad);
    for (const [key, label] of [['drift', '드리프트'], ['boost', '부스트'], ['brake', '브레이크']]) {
      const el = make(key, label, GLYPH[key] + (key === 'drift' ? '<small>드리프트</small>' + STRIPE : key === 'boost' ? '<small>부스터</small>' : key === 'brake' ? '<small>브레이크</small>' : ''));
      wrap.appendChild(el); buttons.push({ key, el });
    }
    touchRoot.appendChild(wrap); off.push(() => wrap.remove());
    // 단추 층의 터치는 기본 동작(두 번 탭 확대 · 두 손가락 확대 · 돋보기 · 클릭 흉내)을 다 거둔다 — 맨 위 '확대 막기'.
    const noDefault = e => { if (e.cancelable) e.preventDefault(); };
    for (const t of ['touchstart', 'touchmove', 'touchend']) on(wrap, t, noDefault, { passive: false });

    const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch {} };
    const showArrows = () => { const v = [...touch.side.values()]; leftEl.dataset.on = v.some(x => x < 0) ? '1' : '0'; rightEl.dataset.on = v.some(x => x > 0) ? '1' : '0'; };
    const sideOf = e => { const r = pad.getBoundingClientRect(); return e.clientX < r.left + r.width / 2 ? -1 : 1; };
    on(pad, 'pointerdown', e => { e.preventDefault(); touch.side.set(e.pointerId, sideOf(e)); touchMode = true; capture(pad, e); showArrows(); });
    on(pad, 'pointermove', e => { if (!touch.side.has(e.pointerId)) return; const v = sideOf(e); if (v !== touch.side.get(e.pointerId)) { touch.side.set(e.pointerId, v); showArrows(); } });
    const padEnd = e => { if (touch.side.delete(e.pointerId)) showArrows(); };
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) on(pad, t, padEnd);
    on(pad, 'contextmenu', e => e.preventDefault());
    for (const { key, el } of buttons) {
      on(el, 'pointerdown', e => { e.preventDefault(); if (key === 'drift' && !touch.drift.size) kickAt = now(); if (key === 'boost') latch.boost = true; touch[key].add(e.pointerId); touchMode = true; capture(el, e); el.dataset.on = '1'; });
      // 드리프트 단추에서 마지막 손가락을 뗀 순간(pointerup — 손을 뗀 것만. 창을 떠나거나 끊긴 것은 아니다)이 '다시 밟기'의 톡이다
      const end = e => { const was = touch[key].delete(e.pointerId); if (!touch[key].size) { el.dataset.on = '0'; if (was && key === 'drift' && e.type === 'pointerup') latch.kick = true; } };
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) on(el, t, end);
      on(el, 'contextmenu', e => e.preventDefault());
    }
  }

  // boostTap · kickTap: 지난번 read() 뒤로 새로 눌린 적이 있는가(읽기 사이에 눌렀다 뗀 것, 뗐다 다시 누른 것까지 센다). read() 가 읽으면 지운다.
  // peek() 은 지우지 않고 본다(화면 표시용 — 주행 계산이 읽을 것을 가로채지 않게).
  function sample(consume) {
    const kSteer = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    const brake = held.has('down') || touch.brake.size > 0 ? 1 : 0;
    const throttle = held.has('up') || (touchMode && !brake) ? 1 : 0;
    const out = {
      steer: kSteer !== 0 ? kSteer : touchSteer(),
      throttle,
      brake,
      drift: held.has('drift') || touch.drift.size > 0,
      boost: held.has('boost') || touch.boost.size > 0,
      kick: touchMode ? touch.drift.size > 0 : held.has('up'),
      boostTap: latch.boost,
      kickTap: latch.kick,
    };
    if (consume) latch.boost = latch.kick = false;
    return out;
  }
  const read = () => sample(true), peek = () => sample(false);

  return {
    read,
    peek,
    clear,
    get touchMode() { return touchMode; },
    // 터치로 출발했을 때 메인이 켠다(조향 패드를 건드리기 전에도 자동 가속이 되게). 키를 누르면 다시 키보드 모드.
    setTouchMode(on) { touchMode = !!on; },
    get kickAt() { return kickAt; },
    // 경적(주행 입력 아님): 지금 누르고 있는가 · 누름 / 뗌을 받는 함수(돌려주는 함수로 끊는다). clear()(창 떠남 · 화면 숨김)도 뗌을 알린다.
    horn() { return hornKeys.size > 0; },
    onHorn(fn) { hornFns.add(fn); return () => hornFns.delete(fn); },
    // 화면 표시용: 게이지가 찼을 때 부스트 단추를 밝힌다(선택).
    // 터치 단추의 손: 'right'(기본 — ◀ ▶ 오른쪽 아래) | 'left'(좌우를 뒤집음). 누르고 있던 것은 비운다.
    setSteerHand(hand) { if (!wrapEl) return; clear(); wrapEl.dataset.hand = hand === 'left' ? 'left' : 'right'; },
    get steerHand() { return wrapEl?.dataset.hand || null; },
    setBoostReady(ready) { for (const b of buttons) if (b.key === 'boost') b.el.dataset.ready = ready ? '1' : '0'; },
    dispose() { clear(); while (off.length) off.pop()(); },
  };
}
