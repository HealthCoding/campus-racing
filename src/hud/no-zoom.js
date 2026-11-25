// 터치 기기에서 화면이 확대되지 않게 한다(2026-11-25 사용자 "부스터 같은 거 누른다고 터치 연속으로 하면 화면이 막 확대돼서 불편해").
//   import { blockZoom } from './hud/no-zoom.js';  blockZoom(document);   — 터치 기기에서만 부른다(main.js 의 TOUCH)
//
// 왜 따로 막나: 아이폰 사파리(iOS 10 뒤)는 접근성 때문에 viewport 의 user-scalable=no · maximum-scale=1 을 듣지 않는다.
//   CSS touch-action(hud.css 의 html · body)은 듣지만, 그것만으로는 다음이 남는다:
//   - 두 손가락 확대: 사파리 전용 gesturestart · gesturechange 를 preventDefault 해야 멈춘다.
//   - 두 번 탭 확대: 단추 층(input.js)은 터치 이벤트로 직접 막는다. 그 밖의 자리(단추 사이 빈 곳 = 3D 캔버스 · 화면 글자)는
//     짧게 두 번 친 두 번째 touchend 를 preventDefault 한다. 그러면 그 탭의 클릭도 사라지므로, 같은 자리를 친 것이면 클릭을 대신 보낸다
//     (메뉴의 ◀ ▶ 를 빠르게 두 번 눌러 두 칸 옮기는 것이 그대로 되게).
//   - 길게 눌러 뜨는 돋보기 · 말풍선: hud.css 의 user-select · -webkit-touch-callout 이 막는다.
// 건드리지 않는 것: 글 칸(닉네임 · 링크 칸)과 그 안의 누름, 목록을 밀어 올리는 것(움직인 터치는 탭이 아니다), 링크(<a>).
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
export const DOUBLE_TAP = Object.freeze({ ms: 350, move: 12 });   // 두 번째 탭으로 치는 간격 · 탭으로 치는 움직임(px)

export function blockZoom(doc = globalThis.document, { ms = DOUBLE_TAP.ms, move = DOUBLE_TAP.move } = {}) {
  if (!doc?.addEventListener) return () => {};
  const off = [];
  const on = (type, fn) => { doc.addEventListener(type, fn, { passive: false }); off.push(() => doc.removeEventListener(type, fn, { passive: false })); };
  const editable = t => !!t?.closest?.(EDITABLE);
  const cancel = e => { if (e.cancelable) e.preventDefault(); };
  // 사파리의 두 손가락 확대(글 칸 안에서도 화면 확대는 필요 없다)
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) on(t, cancel);
  // 확대가 꺼진 브라우저에서 오는 dblclick 의 기본 동작(글자 고르기)도 거둔다
  on('dblclick', e => { if (!editable(e.target)) cancel(e); });
  let start = null, lastEnd = -Infinity;
  on('touchstart', e => {
    const p = e.touches?.length === 1 ? e.touches[0] : null;
    start = p ? { x: p.clientX, y: p.clientY } : null;   // 두 손가락 이상은 탭이 아니다
  });
  on('touchend', e => {
    const p = e.changedTouches?.[0], now = e.timeStamp || globalThis.performance?.now?.() || Date.now();
    if (!start || !p || e.touches?.length || editable(e.target)) { start = null; return; }
    if (Math.hypot(p.clientX - start.x, p.clientY - start.y) > move) { start = null; return; }   // 민 것(목록 스크롤)
    start = null;
    if (now - lastEnd < ms && e.cancelable && !e.defaultPrevented && !e.target?.closest?.('a[href]')) {
      e.preventDefault();
      // 막은 탭의 클릭을 대신 보낸다(누른 그 요소에 — 위로 번지므로 판 전체에 단 처리기도 듣는다)
      const View = doc.defaultView, Click = View?.MouseEvent;
      if (Click && e.target?.dispatchEvent) e.target.dispatchEvent(new Click('click', { bubbles: true, cancelable: true, composed: true, view: View, detail: 1, clientX: p.clientX, clientY: p.clientY, screenX: p.screenX, screenY: p.screenY }));
      lastEnd = -Infinity;   // 세 번째 탭은 다시 첫 탭으로 친다
      return;
    }
    lastEnd = now;
  });
  return () => { while (off.length) off.pop()(); };
}
