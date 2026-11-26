// 공유 포토카드(2026-11-24 사용자 결정 — "셋다 넣고 옆으로 넘겨 고르는거 굿, 추천대로 진행"). 시안: 시안/공유카드_시안.html(그리기 drawA · drawB · drawC 와 판).
//   결과 화면의 '공유'를 누를 때 hud.js 의 openShare() 가 불러온다(첫 방문에 받는 양을 늘리지 않게). 새 그림 파일 없이 무늬는 다 그린다.
//   밖으로 나가는 것: 판을 여는 것만으로는 아무 요청도 없다. **카카오톡 단추를 누를 때만** 카카오 SDK 를 받고 카톡용 가로 그림(800×400 · 닉네임 없음)을 카카오에 올린다(share-send.js).
//     Instagram 단추는 Instagram 앱(휴대폰) · 메시지함 새 탭(PC)을 열 뿐 우리가 보내는 것은 없다. 공유 단추는 기기의 공유 창에 그림을 넘긴다.
//   카드 셋: A 포토카드(1100 × 1700 — 쇼룸의 내 차) · B 레이스 기록지(1080 × 1350 — 결과 순간의 장면 띠 · 바퀴별 기록) · C 스토리(1080 × 1920 — 결과 순간의 장면).
//   판: 카드를 옆으로 넘겨 고른다(휴대폰은 밀기, PC 는 ◀ ▶ · 방향키, 점을 눌러도 된다). 처음은 A, 마지막에 고른 것을 브라우저에 남긴다(없어도 A).
//   단추(2026-11-26 사용자가 시안/공유단추_고르기.html 에서 고른 '가 두 줄' — 노랑으로 채운 첫 단추는 없다, 카카오 아이콘이 노랑을 맡는다):
//     윗줄 보낼 곳 = 카카오톡(src/shared/kakao-key.js 의 키가 있을 때만) · Instagram(늘) · 공유(navigator.canShare({ files }) 가 참일 때만)
//     아랫줄 = 이미지 저장 · 링크 복사('복사했어요') · 닫기(Esc). PC · 휴대폰 가로는 세로 한 줄(사이를 띄움), 휴대폰 세로는 두 줄.
//   보내는 그림은 JPEG(0.9 — 시안에서 잰 PNG 0.65 ~ 2.0 MB 가 JPEG 로 160 ~ 190 KB. 카톡은 어차피 다시 줄인다). 둥근 모서리 바깥은 어두운 바탕으로 채운다.
//   주소 = 지금 페이지(location.origin + pathname — 질의 문자열 없이). 기록은 주소에 싣지 않는다.
//   단, 공식 주소(src/shared/official.js)도 로컬 개발 주소도 아닌 곳(옮겨 올린 사본 등)에서 열리면 카드 · 링크 · 공유 시트는 공식 주소를 쓴다(2026-11-25).
//
// open(data) 의 data(hud.js 의 openShare 가 main 의 info() · 장면을 덧붙여 넘긴다 — 경주의 새 결과 화면도 이 꼴로 부르면 된다):
//   kind: 'trial' | 'race'       mode: 모드 id(info — 'time' · 'gp' …)   modeName: 화면의 모드 이름(info — main 의 MODES 이름 그대로. 카드 · 링크 글이 이 이름을 쓴다 — 모드가 늘거나 빠져도 여기는 안 고친다)
//   course: { id: 'B', name: '언더우드 · 청송대' }   car: '차 이름'   nick: 닉네임 | null   at: 결과가 뜬 시각(ms)
//   time: 기록(초 — 타임어택은 3바퀴 합계, 경주는 완주 시간)   laps: [초, …] 바퀴별   best: 내 최고 기록인가(순위가 없을 때 보라 '최고 기록')
//   rank · total: 타임어택의 전체 순위 / 전체 수(있을 때만)   place · karts: 경주의 순위 / 대수
//   scene: Promise<캔버스> | 캔버스 | null(결과 순간의 장면 — B · C)   showroom: () => Promise<캔버스> | 캔버스(쇼룸의 내 차 — A)
import { lapText } from './hud.js';
import { shareLocation } from '../shared/official.js';
import { KAKAO_IMAGE, kakaoOn, sendList, KEEP, kakaoTemplate, kakaoClient, uploadKakao, instaDmUrl, isAndroid, INSTA_INBOX, instaWay } from './share-send.js';

export const SIZES = { a: [1100, 1700], b: [1080, 1350], c: [1080, 1920] };
export const ORDER = ['a', 'b', 'c'];
const NAMES = { a: '포토카드', b: '레이스 기록지', c: '스토리' };
// 카드 위 작은 영문 줄(TIME ATTACK · COURSE B)의 꾸밈 이름 — 없는 모드는 화면의 모드 이름을 그대로 쓴다(모드 이름 자체는 결과가 넘겨준다)
const MODE_EN = { time: 'TIME ATTACK', gp: 'GRAND PRIX' };
const KLASS = '아주 빠름';
const PICK_KEY = 'campus-kart:share-card';
const KOR = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif';
// 무지갯빛 홀로그램의 일곱 색 — 포토카드 A 의 테와 랭킹 1등 줄의 테(hud.css 의 :root 일곱 색)가 같이 쓴다. 값의 원본은 hud.css(:root), 여기는 읽지 못할 때의 같은 값
export const HOLO = ['#ffb3e6', '#b9a6ff', '#86d3ff', '#9ef2c8', '#ffeb85', '#ffb3a3', '#d4a8ff'];
function holoColours() {
  try { const css = getComputedStyle(document.documentElement); return HOLO.map((c, i) => css.getPropertyValue('--yonhui-foil-' + (i + 1)).trim() || c); } catch { return HOLO; }
}
const SHOT_WAIT = 1500;   // 장면 · 쇼룸 사진을 기다리는 시간(ms) — 넘으면 사진 없이 그린다

// ================================================================ 순수 함수(검증/share-card.test.mjs)
const two = n => String(n).padStart(2, '0');
export function dateText(ms = Date.now()) { const d = new Date(ms); return d.getFullYear() + '.' + two(d.getMonth() + 1) + '.' + two(d.getDate()); }
// 링크 복사 · 공유에 쓰는 주소(질의 문자열 · # 없이)와 카드에 찍는 짧은 주소(https:// · index.html · 끝 / 없이)
//   index.html 은 마지막 경로 조각이 정확히 그것일 때만 뺀다(/game/myindex.html 은 그대로)
export const pageUrl = loc => loc.origin + loc.pathname;
export const shownUrl = loc => (loc.host + loc.pathname).replace(/\/index\.html$/, '/').replace(/\/+$/, '');
// 카드 한 장에 쓸 것(화면 글자로 바꾼 것)
export function cardInfo(data = {}, here = globalThis.location) {
  const loc = shareLocation(here);
  const race = data.kind ? data.kind !== 'trial' : data.mode !== 'time', mode = data.kind === 'trial' ? 'time' : String(data.mode ?? ''), name = String(data.modeName || (race ? '' : '타임어택')), fin = v => Number.isFinite(v) ? v : null;
  const laps = Array.isArray(data.laps) ? data.laps.filter(Number.isFinite) : [];
  return {
    race, modeId: mode, mode: name, modeEn: MODE_EN[mode] || name, klass: KLASS,
    courseId: String(data.course?.id ?? 'B'), course: String(data.course?.name ?? ''),
    time: lapText(data.time), car: String(data.car ?? ''), nick: data.nick ? String(data.nick) : null, date: dateText(data.at ?? Date.now()),
    rank: race ? null : fin(data.rank), total: race ? null : fin(data.total),
    place: race ? fin(data.place) : null, karts: race ? fin(data.karts) : null,
    best: !!data.best, laps: laps.map((t, i) => ['L' + (i + 1), lapText(t), t]),
    site: loc ? shownUrl(loc) : '', url: loc ? pageUrl(loc) : '',
  };
}
// 링크 복사 글(2026-11-24 사용자가 고른 후보 ①): '캠퍼스 레이싱 코스 B 2:31.20 — 이겨 봐' + 줄바꿈 + 주소. 경주면 '… 코스 B 그랑프리 1위 3:40.10 — 이겨 봐'(모드 이름은 결과가 준 것)
export const headline = d => '캠퍼스 레이싱 코스 ' + d.courseId + ' ' + (d.place ? (d.mode ? d.mode + ' ' : '') + d.place + '위 ' : '') + d.time + ' — 이겨 봐';
export const linkText = d => headline(d) + '\n' + d.url;
export const fileName = (d, v) => 'campus-racing-' + d.courseId + '-' + d.time.replace(/[:.]/g, '') + '-' + v + '.jpg';
// w × h 를 bw × bh 안에 비율 그대로
export function fitBox(w, h, bw, bh) { const k = Math.max(0, Math.min(bw / w, bh / h)); return { w: Math.floor(w * k), h: Math.floor(h * k) }; }

// ================================================================ 카드 그리기(캔버스) — 시안의 그림 그대로(학교 교표 · 회사 로고 없음)
function setFont(ctx, spec, stretch = 'normal') { ctx.font = spec; try { ctx.fontStretch = stretch; } catch {} }
const spacing = (ctx, v) => { try { ctx.letterSpacing = v; } catch {} };
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function cover(ctx, im, x, y, w, h, fx = .5, fy = .5, zoom = 1) {
  if (!im) { const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#1c2030'); g.addColorStop(1, '#0b0c11'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); return; }
  const s = Math.max(w / im.width, h / im.height) * zoom, sw = w / s, sh = h / s;
  ctx.drawImage(im, (im.width - sw) * fx, (im.height - sh) * fy, sw, sh, x, y, w, h);
}
// 글자 조각 여럿을 한 줄로: [{ t, f: [font, stretch], c }]
function runs(ctx, parts, x, y, align = 'left') {
  const ws = parts.map(p => { setFont(ctx, ...p.f); spacing(ctx, p.ls || '0px'); return ctx.measureText(p.t).width; });
  const total = ws.reduce((a, b) => a + b, 0); let at = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  ctx.textAlign = 'left';
  parts.forEach((p, i) => { setFont(ctx, ...p.f); spacing(ctx, p.ls || '0px'); ctx.fillStyle = p.c; ctx.fillText(p.t, at, y); at += ws[i]; });
  spacing(ctx, '0px'); return total;
}
function fitSize(ctx, text, family, style, start, maxW, stretch = 'semi-expanded') {
  let size = start; for (; size > 20; size -= 2) { setFont(ctx, `${style} ${size}px ${family}`, stretch); if (ctx.measureText(text).width <= maxW) break; } return size;
}
// 이름 'CAMPUS RACING'(게임 시작 화면과 같은 굵은 기울임) + 연석 띠
function mark(ctx, x, y, size, colour = '#fff', align = 'left') {
  setFont(ctx, `italic 900 ${size}px Saira`, 'semi-expanded'); spacing(ctx, '0px'); ctx.textAlign = align; ctx.fillStyle = colour; ctx.fillText('CAMPUS RACING', x, y); ctx.textAlign = 'left';
}
function kerb(ctx, x, y, w, h, n, skew = .45, a = '#2d63d8', b = '#ffffff') {
  const bw = w / n; for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.beginPath(); const x0 = x + i * bw; ctx.moveTo(x0 + h * skew, y); ctx.lineTo(x0 + bw + h * skew, y); ctx.lineTo(x0 + bw, y + h); ctx.lineTo(x0, y + h); ctx.closePath(); ctx.fill(); }
}
// 만든 사람 한 줄(2026-11-25 사용자가 시안에서 고른 '카드 B'): 카드 셋 모두 주소 밑에 한 줄 더, 주소 · 바코드는 그대로
//   같은 날 외부 검수 뒤: 카드에 캠퍼스 장면(지도 자료로 지은 건물 · 길)이 들어가므로 지도 출처를 같은 줄 뒤에(CARD_CREDIT).
//   maxW 를 넘으면 두 줄 — 윗줄 CREDIT_LINE, 아랫줄 MAP_CREDIT(같은 쪽 맞춤, 줄 간격 1.3배). 돌려주는 값 = 마지막 줄의 y
export const CREDIT_LINE = '\u00a9 2026 HealthCoding';
export const MAP_CREDIT = '\uc9c0\ub3c4 \u00a9 OpenStreetMap contributors';
export const CARD_CREDIT = CREDIT_LINE + ' \u00b7 ' + MAP_CREDIT;
function creditLine(ctx, x, y, size, colour, align, maxW = Infinity) {
  setFont(ctx, '600 ' + size + 'px Saira, ' + KOR, 'normal'); spacing(ctx, '1px');
  ctx.textAlign = align; ctx.fillStyle = colour;
  const one = ctx.measureText(CARD_CREDIT).width <= maxW;
  if (one) ctx.fillText(CARD_CREDIT, x, y);
  else { ctx.fillText(CREDIT_LINE, x, y); ctx.fillText(MAP_CREDIT, x, y + Math.round(size * 1.3)); }
  spacing(ctx, '0px'); ctx.textAlign = 'left';
  return one ? y : y + Math.round(size * 1.3);
}
// 모서리 하나를 자른 판(게임의 단추 모양)
function cutBox(ctx, x, y, w, h, cut, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
}
// 순위 줄: 노란 판(전체 N위 · 경주 N위) + '/ 전체' — 없으면 '최고 기록'(보라), 그것도 아니면 비운다
function rankRow(ctx, d, x, y, h, dark = false) {
  const fs = Math.round(h * .5), big = Math.round(h * .74), base = y + h * .74;
  const block = (parts, fill, textColour) => {
    const pad = h * .36; let tw = 0; parts.forEach(p => { setFont(ctx, ...p.f); tw += ctx.measureText(p.t).width; });
    cutBox(ctx, x, y, tw + pad * 2, h, h * .26, fill, null); runs(ctx, parts.map(p => ({ ...p, c: textColour })), x + pad, base); return x + tw + pad * 2 + h * .28;
  };
  const K = s => [`800 ${s}px ${KOR}`, 'normal'], N = s => [`italic 800 ${s}px Saira`, 'semi-expanded'], of = n => [{ t: '/ ' + n.toLocaleString('en-US'), f: [`italic 700 ${Math.round(h * .46)}px Saira`, 'semi-expanded'], c: dark ? 'rgba(11,12,17,.6)' : 'rgba(255,255,255,.7)' }];
  if (d.rank) { const nx = block([{ t: '전체 ', f: K(fs) }, { t: String(d.rank), f: N(big) }, { t: '위', f: K(fs) }], '#ffd84a', '#17130a'); if (d.total) runs(ctx, of(d.total), nx - h * .1, base); }
  else if (d.place) { const nx = block([{ t: String(d.place), f: N(big) }, { t: '위', f: K(fs) }], '#ffd84a', '#17130a'); if (d.karts) runs(ctx, of(d.karts), nx - h * .1, base); }
  else if (d.best) block([{ t: '최고 기록', f: K(fs) }], '#b983ff', '#14101f');
}
const modeLine = d => `${d.modeEn} · COURSE ${d.courseId}`;

// ---- A 포토카드 1100×1700(55:85): 무지갯빛 테 · 쇼룸의 내 차 위 2/3 · 아래 기록
function drawA(ctx, d, photo) {
  const W = 1100, H = 1700, P = 34;
  ctx.save(); rr(ctx, 0, 0, W, H, 64); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W, H);
  holoColours().forEach((c, i, all) => g.addColorStop(i / (all.length - 1), c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 홀로그램 결: 비스듬한 흰 띠 · 가는 빗금(저장한 그림에도 남는다)
  ctx.globalAlpha = .38; for (const [o, w] of [[-200, 90], [380, 40], [900, 140], [1500, 60]]) { const s = ctx.createLinearGradient(o, 0, o + w + 600, H); s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(.5, 'rgba(255,255,255,.95)'); s.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = s; ctx.beginPath(); ctx.moveTo(o, 0); ctx.lineTo(o + w, 0); ctx.lineTo(o + w + 600, H); ctx.lineTo(o + 600, H); ctx.fill(); }
  ctx.globalAlpha = .07; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; for (let i = -H; i < W; i += 9) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H * .6, H); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.restore();
  // 안쪽 판
  ctx.save(); rr(ctx, P, P, W - P * 2, H - P * 2, 42); ctx.clip();
  ctx.fillStyle = '#0b0c11'; ctx.fillRect(0, 0, W, H);
  cover(ctx, photo, P, P, W - P * 2, 1090);
  let f = ctx.createLinearGradient(0, P, 0, 300); f.addColorStop(0, 'rgba(11,12,17,.7)'); f.addColorStop(1, 'rgba(11,12,17,0)'); ctx.fillStyle = f; ctx.fillRect(0, P, W, 300);
  f = ctx.createLinearGradient(0, 760, 0, 1116); f.addColorStop(0, 'rgba(11,12,17,0)'); f.addColorStop(1, '#0b0c11'); ctx.fillStyle = f; ctx.fillRect(0, 760, W, 400);
  const X = 84, R = W - 84;
  mark(ctx, X, 128, 46); kerb(ctx, X + 4, 150, 300, 12, 10);
  setFont(ctx, 'italic 700 30px Saira', 'semi-expanded'); spacing(ctx, '3px'); ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.86)'; ctx.fillText(d.date, R, 124); spacing(ctx, '0px'); ctx.textAlign = 'left';
  // 기록 덩어리
  setFont(ctx, '700 28px Saira', 'semi-expanded'); spacing(ctx, '5px'); ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.fillText(modeLine(d), X, 1118); spacing(ctx, '0px');
  setFont(ctx, `800 52px ${KOR}`); ctx.fillStyle = '#fff'; ctx.fillText(d.course, X, 1188);
  fitSize(ctx, d.time, 'Saira', 'italic 800', 214, R - X); ctx.fillStyle = '#fff'; ctx.fillText(d.time, X - 6, 1385);
  rankRow(ctx, d, X, 1424, 70);
  kerb(ctx, X, 1540, R - X, 10, 24);
  if (d.nick) runs(ctx, [{ t: d.nick, f: [`800 44px ${KOR}`], c: '#fff' }, { t: '   ' + d.car, f: [`700 34px ${KOR}`], c: 'rgba(255,255,255,.66)' }], X, 1614);
  else runs(ctx, [{ t: d.car, f: [`800 40px ${KOR}`], c: '#fff' }], X, 1614);
  setFont(ctx, '600 26px Saira', 'normal'); ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(d.site, R, 1612); ctx.textAlign = 'left';
  creditLine(ctx, R, 1650, 21, 'rgba(255,255,255,.42)', 'right', R - X);
  ctx.restore();
}

// ---- B 레이스 기록지 1080×1350(4:5): 종이 · 출발 신호 · 체크 무늬 · 장면 띠 · 바퀴별 기록 · 바코드 무늬
function drawB(ctx, d, photo) {
  const W = 1080, H = 1350, PERF = 1104, ink = '#0b0c11', grey = '#6d7180';
  ctx.save(); rr(ctx, 0, 0, W, H, 30); ctx.clip();
  ctx.fillStyle = '#f3f1ea'; ctx.fillRect(0, 0, W, H);
  // 머리: 신호등 다섯(다 켜짐) + 이름
  ctx.fillStyle = ink; ctx.fillRect(0, 0, W, 168);
  for (let i = 0; i < 5; i++) { const cx = 78 + i * 70, cy = 84, r = 25; const rg = ctx.createRadialGradient(cx - 8, cy - 9, 2, cx, cy, r); rg.addColorStop(0, '#ff9a8c'); rg.addColorStop(.42, '#ff2d21'); rg.addColorStop(1, '#c20e07'); ctx.fillStyle = 'rgba(255,45,33,.35)'; ctx.beginPath(); ctx.arc(cx, cy, r + 9, 0, 7); ctx.fill(); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); }
  mark(ctx, W - 56, 92, 44, '#fff', 'right');
  setFont(ctx, '700 22px Saira', 'semi-expanded'); spacing(ctx, '6px'); ctx.textAlign = 'right'; ctx.fillStyle = '#ffd84a'; ctx.fillText(modeLine(d), W - 50, 134); spacing(ctx, '0px'); ctx.textAlign = 'left';
  // 체크 무늬 두 줄
  for (let r = 0; r < 2; r++) for (let i = 0; i < W / 24; i++) { ctx.fillStyle = (i + r) % 2 ? '#fff' : ink; ctx.fillRect(i * 24, 168 + r * 24, 24, 24); }
  // 장면 띠
  cover(ctx, photo, 0, 216, W, 352, .5, .62);
  ctx.fillStyle = ink; ctx.fillRect(0, 568, W, 6);
  // 기록 — 노란 형광 띠 위
  const X = 60;
  setFont(ctx, `700 24px ${KOR}`); ctx.fillStyle = grey; ctx.fillText(d.place ? '완주 기록' : '기록', X, 632);
  const ts = fitSize(ctx, d.time, 'Saira', 'italic 800', 196, 620);
  setFont(ctx, `italic 800 ${ts}px Saira`, 'semi-expanded'); const tw = ctx.measureText(d.time).width;
  ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(X - 10 + 26, 724); ctx.lineTo(X + tw + 40, 724); ctx.lineTo(X + tw + 18, 800); ctx.lineTo(X - 10, 800); ctx.closePath(); ctx.fill();
  ctx.fillStyle = ink; ctx.fillText(d.time, X - 4, 790);
  rankRow(ctx, d, X, 830, 60, true);
  // 오른쪽: 바퀴별 기록 — 가장 빠른 바퀴 하나만 보라(같으면 먼저 낸 바퀴). 바퀴가 많으면(그랑프리 5바퀴) 줄 사이를 좁힌다
  const SX = 720, SR = W - 60, laps = d.laps;
  if (laps.length) {
    setFont(ctx, `700 24px ${KOR}`); ctx.fillStyle = grey; ctx.fillText('바퀴', SX, 632);
    const times = laps.map(s => s[2]), fast = laps.length > 1 ? times.indexOf(Math.min(...times)) : -1, most = Math.max(...laps.map(s => s[2])), step = laps.length > 1 ? Math.min(70, 210 / (laps.length - 1)) : 0, big = laps.length > 3 ? 30 : 36;
    laps.forEach(([k, t, v], i) => {
      const y = 690 + i * step;
      setFont(ctx, '700 24px Saira', 'semi-expanded'); ctx.fillStyle = grey; ctx.fillText(k, SX, y);
      setFont(ctx, `italic 700 ${big}px Saira`, 'semi-expanded'); ctx.textAlign = 'right'; ctx.fillStyle = i === fast ? '#7d3fe0' : ink; ctx.fillText(t, SR, y); ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(11,12,17,.1)'; ctx.fillRect(SX, y + 12, SR - SX, 6); ctx.fillStyle = i === fast ? '#b983ff' : '#2d63d8'; ctx.fillRect(SX, y + 12, (SR - SX) * (v / most), 6);
    });
  }
  // 칸: 코스 · 모드 · 차 · 닉네임 · 날짜
  const lapsNote = laps.length ? ' · ' + laps.length + '바퀴' : '';
  const cells = [['코스', [d.courseId, d.course]], ['모드', [d.mode, d.klass + lapsNote]], ['차', [d.car]], ...(d.nick ? [['닉네임', [d.nick]]] : []), ['날짜', [d.date]]];
  ctx.fillStyle = ink; ctx.fillRect(X, 920, W - X * 2, 3);
  const cw = (W - X * 2) / cells.length;
  cells.forEach(([k, parts], i) => {
    const x = X + i * cw; if (i) { ctx.fillStyle = 'rgba(11,12,17,.15)'; ctx.fillRect(x - 12, 940, 2, 120); }
    setFont(ctx, `700 22px ${KOR}`); ctx.fillStyle = grey; ctx.fillText(k, x, 966);
    parts.forEach((p, j) => { const s = fitSize(ctx, p, KOR, j ? '600' : '800', j ? 24 : 32, cw - 22, 'normal'); setFont(ctx, `${j ? '600' : '800'} ${s}px ${KOR}`); ctx.fillStyle = j ? '#3b3f4b' : ink; ctx.fillText(p, x, 1010 + j * 36); });
  });
  // 절취선 + 양옆 반달
  ctx.strokeStyle = 'rgba(11,12,17,.35)'; ctx.lineWidth = 3; ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.moveTo(48, PERF); ctx.lineTo(W - 48, PERF); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'destination-out'; for (const x of [0, W]) { ctx.beginPath(); ctx.arc(x, PERF, 28, 0, 7); ctx.fill(); } ctx.globalCompositeOperation = 'source-over';
  // 바코드 무늬(기록 글자로 만든 무늬 — 읽히는 바코드가 아니다)
  const code = `CR${d.courseId}${d.time.replace(/\D/g, '')}${d.date.replace(/\D/g, '').slice(4)}`;
  let x = X, seed = [...code].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  ctx.fillStyle = ink; while (x < 600) { seed = (seed * 1103515245 + 12345) >>> 0; const w = 3 + (seed >>> 28) % 4 * 3; ctx.fillRect(x, 1150, w, 112); x += w + 3 + ((seed >>> 20) % 3) * 3; }
  setFont(ctx, '600 22px Saira', 'normal'); spacing(ctx, '8px'); ctx.fillText(code, X, 1300); const codeEnd = X + ctx.measureText(code).width; spacing(ctx, '0px');
  ctx.textAlign = 'right'; const tag = d.rank ? '#' + d.rank : d.place ? 'P' + d.place : '';
  if (tag) { setFont(ctx, 'italic 800 54px Saira', 'semi-expanded'); ctx.fillText(tag, W - 60, 1214); }
  setFont(ctx, '600 26px Saira', 'normal'); ctx.fillStyle = grey; ctx.fillText(d.site, W - 60, tag ? 1262 : 1222); ctx.textAlign = 'left';
  creditLine(ctx, W - 60, tag ? 1300 : 1260, 21, grey, 'right', Math.min(400, W - 60 - codeEnd - 40));
  ctx.restore();
}

// ---- C 스토리 1080×1920(9:16): 결과 순간의 장면 위 큰 기록. 위 · 아래 220 px 쯤은 인스타그램 표시가 덮으니 비운다
function drawC(ctx, d, photo) {
  const W = 1080, H = 1920, X = 76, R = W - 76;
  // 가로 화면(PC)에서 뜬 장면은 세로로 다 쓰이므로 차(화면의 60 ~ 70% 높이)가 큰 기록 밑에 깔린다 — 조금 당겨 아래쪽을 잘라 차를 기록 위로 올린다
  if (photo && photo.width > photo.height) cover(ctx, photo, 0, 0, W, H, .5, .95, 1.3); else cover(ctx, photo, 0, 0, W, H, .5, .5);
  let f = ctx.createLinearGradient(0, 0, 0, 560); f.addColorStop(0, 'rgba(11,12,17,.82)'); f.addColorStop(1, 'rgba(11,12,17,0)'); ctx.fillStyle = f; ctx.fillRect(0, 0, W, 560);
  f = ctx.createLinearGradient(0, 1000, 0, H); f.addColorStop(0, 'rgba(11,12,17,0)'); f.addColorStop(.38, 'rgba(11,12,17,.82)'); f.addColorStop(1, 'rgba(11,12,17,.96)'); ctx.fillStyle = f; ctx.fillRect(0, 1000, W, H - 1000);
  mark(ctx, X, 300, 66); kerb(ctx, X + 4, 330, 420, 16, 12);
  setFont(ctx, '600 30px Saira', 'normal'); ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fillText(d.site, X, 404);
  creditLine(ctx, X, 446, 24, 'rgba(255,255,255,.5)', 'left', R - X);
  setFont(ctx, '700 32px Saira', 'semi-expanded'); spacing(ctx, '6px'); ctx.fillStyle = '#ffd84a'; ctx.fillText(modeLine(d), X, 1236); spacing(ctx, '0px');
  fitSize(ctx, d.time, 'Saira', 'italic 900', 280, R - X + 10); ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 30; ctx.fillText(d.time, X - 8, 1460); ctx.shadowBlur = 0;
  rankRow(ctx, d, X, 1500, 84);
  setFont(ctx, `800 50px ${KOR}`); ctx.fillStyle = '#fff'; ctx.fillText(d.course, X, 1660);
  runs(ctx, [...(d.nick ? [{ t: d.nick + '  ·  ', f: [`700 36px ${KOR}`], c: 'rgba(255,255,255,.86)' }] : []), { t: d.car + '  ·  ', f: [`700 36px ${KOR}`], c: 'rgba(255,255,255,.86)' }, { t: d.date, f: ['600 34px Saira', 'normal'], c: 'rgba(255,255,255,.86)' }], X, 1716);
}
const DRAW = { a: drawA, b: drawB, c: drawC };
// 카드 한 장을 캔버스에(검증이 따로 부를 수도 있다)
export function drawCard(canvas, v, d, photos = {}) {
  const [w, h] = SIZES[v]; if (canvas.width !== w) canvas.width = w; if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, w, h);
  DRAW[v](ctx, d, v === 'a' ? photos.showroom || photos.scene : photos.scene);
  return canvas;
}

// ---- 카톡용 가로 그림 800×400(2026-11-26 사용자가 고른 '다' — 시안/img/공유단추/pick-kakao-c.png): 왼쪽 이름 · 모드 줄 · 큰 기록 · 순위 줄 · 주소, 오른쪽 쇼룸의 내 차(카드 A 의 사진).
//   닉네임 · 날짜는 넣지 않는다(카카오에 올린 그림 주소는 100일 동안 누구나 열 수 있다). 사진이 없으면 카드 A 처럼 어두운 바탕 그대로.
function drawK(ctx, d, photo) {
  const [W, H] = KAKAO_IMAGE, X = 34, PX = 300;
  ctx.fillStyle = '#0b0c11'; ctx.fillRect(0, 0, W, H);
  cover(ctx, photo, PX, 0, W - PX, H, .5, .55);
  const g = ctx.createLinearGradient(PX, 0, PX + 170, 0); g.addColorStop(0, '#0b0c11'); g.addColorStop(1, 'rgba(11,12,17,0)'); ctx.fillStyle = g; ctx.fillRect(PX, 0, 170, H);
  mark(ctx, X, 60, 30); kerb(ctx, X + 2, 72, 198, 8, 9);
  setFont(ctx, '700 17px Saira', 'semi-expanded'); spacing(ctx, '4px'); ctx.fillStyle = '#ffd84a'; ctx.fillText(modeLine(d), X, 180); spacing(ctx, '0px');
  fitSize(ctx, d.time, 'Saira', 'italic 800', 104, 330); ctx.fillStyle = '#fff'; ctx.fillText(d.time, X - 4, 280);
  rankRow(ctx, d, X, 298, 42);
  /* 출처 줄이 두 줄로 넘어가면(글꼴이 넓은 기기) 주소와 함께 한 칸 올린다 — 아래 끝 400 안 */
  setFont(ctx, '600 12px Saira, ' + KOR, 'normal'); spacing(ctx, '1px'); const one = ctx.measureText(CARD_CREDIT).width <= 440; spacing(ctx, '0px');
  setFont(ctx, '600 15px Saira', 'normal'); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(d.site, X, one ? 366 : 354);
  creditLine(ctx, X, one ? 388 : 374, 12, 'rgba(255,255,255,.42)', 'left', 440);
}
// 카톡용 그림을 캔버스에(카드 셋과 같은 글 · 사진 — d 는 cardInfo(), photos 는 { showroom, scene })
export function drawKakao(canvas, d, photos = {}) {
  const [w, h] = KAKAO_IMAGE; canvas.width = w; canvas.height = h;
  drawK(canvas.getContext('2d'), d, photos.showroom || photos.scene);
  return canvas;
}

// ================================================================ 공유 판
const ICON = {
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 12v9h14v-9"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 17v4h16v-4"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true" class="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  // Instagram 단추: 우리가 그린 종이비행기(보내기) — Instagram 로고 · 글리프가 아니다
  send: '<svg viewBox="0 0 24 24" aria-hidden="true" class="round"><path d="M21.5 2.5 2.5 10l7.5 3.2 3.3 8.3z"/><path d="M21.5 2.5 10 13.2"/></svg>',
};
// 카카오톡 공유 아이콘: 카카오가 주는 그림 그대로(고치지 않는다 — NOTICE.md 1절)
const KAKAO_ICON = new URL('../../assets/kakao/kakaotalk_sharing_btn_medium.png', import.meta.url).href;
export const LABEL = { kakao: '카카오톡', insta: 'Instagram', share: '공유', save: '이미지 저장', copy: '링크 복사' };
const KAKAO_STATE = { idle: LABEL.kakao, busy: '올리는 중', ready: '보내기' };
const ACT_ICON = { kakao: '<img class="ki" src="' + KAKAO_ICON + '" alt="">', insta: ICON.send, share: ICON.share, save: ICON.save, copy: ICON.link };
const touchy = () => document.body.classList.contains('touch') || !!globalThis.matchMedia?.('(pointer: coarse)').matches;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const within = (value, ms) => Promise.race([Promise.resolve(value).catch(() => null), sleep(ms).then(() => null)]);
function canShareFiles() {
  try { return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [new File([new Uint8Array(1)], 'card.jpg', { type: 'image/jpeg' })] }); } catch { return false; }
}
function remembered() { try { const v = localStorage.getItem(PICK_KEY); return ORDER.includes(v) ? v : 'a'; } catch { return 'a'; } }
function remember(v) { try { localStorage.setItem(PICK_KEY, v); } catch {} }

let layer = null, els = null, now = null, gen = 0, back = null, drag = null, toastTimer = 0;
export const isOpen = () => !!layer && !layer.hidden;

function build() {
  const root = document.getElementById('hud') || document.body;
  layer = document.createElement('div'); layer.className = 'sh-layer'; layer.hidden = true; layer.tabIndex = -1;
  layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true'); layer.setAttribute('aria-label', '공유');
  layer.innerHTML = '<button type="button" class="sh-close">닫기<kbd>ESC</kbd></button>'
    + '<button type="button" class="sh-arrow l" aria-label="앞 카드"><i class="hud-chev l"></i></button>'
    + '<div class="sh-stage"><div class="sh-track">' + ORDER.map(v => '<div class="sh-slide"><div class="sh-card" data-v="' + v + '"><canvas role="img" aria-label="' + NAMES[v] + '"></canvas></div></div>').join('') + '</div></div>'
    + '<button type="button" class="sh-arrow r" aria-label="다음 카드"><i class="hud-chev r"></i></button>'
    + '<div class="sh-dots">' + ORDER.map(v => '<button type="button" aria-label="' + NAMES[v] + '"><i></i></button>').join('') + '</div>'
    + '<div class="sh-acts"></div><div class="sh-toast" aria-live="polite"></div>';
  root.append(layer);
  els = { stage: layer.querySelector('.sh-stage'), track: layer.querySelector('.sh-track'), cards: [...layer.querySelectorAll('.sh-card')], dots: [...layer.querySelectorAll('.sh-dots button')], acts: layer.querySelector('.sh-acts'), toast: layer.querySelector('.sh-toast'), prev: layer.querySelector('.sh-arrow.l'), next: layer.querySelector('.sh-arrow.r') };
  layer.querySelector('.sh-close').addEventListener('click', () => close());
  els.prev.addEventListener('click', () => go(now.index - 1));
  els.next.addEventListener('click', () => go(now.index + 1));
  els.dots.forEach((dot, i) => dot.addEventListener('click', () => go(i)));
  // 밀기: 카드 줄이 손가락을 따라오고, 40 px 넘게 밀면 옆 카드로
  els.stage.addEventListener('pointerdown', event => {
    if (!now || (event.pointerType === 'mouse' && event.button)) return;
    drag = { x: event.clientX, id: event.pointerId, dx: 0 }; try { els.stage.setPointerCapture(event.pointerId); } catch {}
    els.track.dataset.drag = 'true';
  });
  els.stage.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const edge = (now.index === 0 && event.clientX > drag.x) || (now.index === ORDER.length - 1 && event.clientX < drag.x);
    drag.dx = (event.clientX - drag.x) * (edge ? .35 : 1); place(drag.dx);
  });
  const end = event => { if (!drag || event.pointerId !== drag.id) return; const dx = drag.dx; drag = null; delete els.track.dataset.drag; if (Math.abs(dx) > 40) go(now.index + (dx < 0 ? 1 : -1)); else place(0); };
  els.stage.addEventListener('pointerup', end); els.stage.addEventListener('pointercancel', end);
  addEventListener('keydown', onKey, true);
  addEventListener('resize', () => { if (isOpen()) fit(); });
}
function place(dx = 0) { els.track.style.transform = 'translateX(calc(' + (-now.index * 100) + '% + ' + dx + 'px))'; }
function go(index) {
  if (!now) return; index = Math.max(0, Math.min(ORDER.length - 1, index));
  const moved = index !== now.index; now.index = index; place(0);
  const v = ORDER[index]; layer.dataset.card = v;
  els.dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
  els.prev.disabled = index === 0; els.next.disabled = index === ORDER.length - 1;
  els.cards.forEach((card, i) => card.closest('.sh-slide').setAttribute('aria-hidden', String(i !== index)));
  if (moved) remember(v);
  if (layer.dataset.ready === 'true') encode(v);   // 공유 단추가 누르는 그 틱에 navigator.share 를 부를 수 있게 미리 만든다(사파리는 기다리면 공유를 막는다)
}
// 카드 칸에 맞춘 크기(화면 px)
function fit() {
  const bw = els.stage.clientWidth, bh = els.stage.clientHeight;
  els.cards.forEach(card => { const [w, h] = SIZES[card.dataset.v], s = fitBox(w, h, bw, bh); card.style.width = s.w + 'px'; card.style.height = s.h + 'px'; });
}
// 단추 두 줄(2026-11-26 '가'): 윗줄 보낼 곳(.send) · 아랫줄 이미지 저장 · 링크 복사(.keep — 낮은 테두리 단추). data-send = 윗줄 수(1 ~ 3 — 휴대폰 세로에서 빠진 자리 없이 나눈다)
function buttons() {
  const send = sendList({ kakao: kakaoOn(), share: canShareFiles() });
  const one = (k, cls) => '<button type="button" class="' + cls + '" data-act="' + k + '">' + ACT_ICON[k] + '<span>' + LABEL[k] + '</span></button>';
  els.acts.innerHTML = send.map(k => one(k, 'send')).join('') + '<i class="sh-sep" aria-hidden="true"></i>' + KEEP.map(k => one(k, 'keep')).join('');
  els.acts.dataset.count = String(send.length + KEEP.length); els.acts.dataset.send = String(send.length);
  els.acts.querySelectorAll('button').forEach(b => b.addEventListener('click', () => act(b.dataset.act)));
}
function toast(text, input = null) {
  els.toast.textContent = ''; if (text) els.toast.append(text);
  /* 마지막 대체: 읽기 전용 여러 줄 칸(줄바꿈을 지킨다 — 한 줄 input 은 '이겨 봐' 와 주소를 붙여 버린다) */
  if (input) { const box = document.createElement('textarea'); box.className = 'sh-copybox'; box.readOnly = true; box.rows = 3; box.value = input; els.toast.append(box); box.focus(); box.select(); }
  els.toast.dataset.on = 'true'; clearTimeout(toastTimer); if (!input) toastTimer = setTimeout(() => { els.toast.dataset.on = 'false'; }, 1600);
}

// 그리기 · 그림 만들기
function drawAll() {
  if (!now) return;
  const d = cardInfo(now.data), photos = { scene: now.scene, showroom: now.showroom };
  now.info = d; now.blobs = {}; now.rev++; now.kakao = freshKakao(); kakaoLook('idle');
  els.cards.forEach(card => drawCard(card.querySelector('canvas'), card.dataset.v, d, photos));
  layer.dataset.link = linkText(d); layer.dataset.rank = d.rank ?? d.place ?? '';
  encode(ORDER[now.index]);
}
function encode(v) {
  if (!now) return null; if (now.blobs[v]) return now.blobs[v];
  const rev = now.rev, card = els.cards[ORDER.indexOf(v)].querySelector('canvas');
  const out = document.createElement('canvas'); out.width = card.width; out.height = card.height;
  const ctx = out.getContext('2d'); ctx.fillStyle = '#0b0c11'; ctx.fillRect(0, 0, out.width, out.height); ctx.drawImage(card, 0, 0);   // JPEG: 둥근 모서리 바깥은 어두운 바탕
  const job = new Promise(resolve => out.toBlob(blob => resolve(blob), 'image/jpeg', 0.9)).then(blob => { if (now && now.rev === rev && now.blobs[v] === job) now.blobs[v] = blob; return blob; });
  now.blobs[v] = job; return job;
}
const blobOf = v => Promise.resolve(encode(v));

async function act(what) {
  if (!now || layer.dataset.ready !== 'true') return;
  const v = ORDER[now.index], d = now.info, name = fileName(d, v);
  if (what === 'copy') return copy(linkText(d));
  if (what === 'save') { if (await save(v, name)) toast('저장했어요'); return; }
  if (what === 'share') {
    // 미리 만든 그림이 있으면 기다리지 않고 바로 부른다(누른 그 틱 — 사용자 동작 안)
    const ready = now.blobs[v], run = blob => shareFile(blob, name, d);
    if (ready instanceof Blob) return run(ready);
    return run(await blobOf(v));
  }
  if (what === 'kakao') return kakao();
  if (what === 'insta') return insta(v, d, name);
}
async function save(v, name) {
  const blob = await blobOf(v); if (!blob) return false;
  const a = document.createElement('a'), href = URL.createObjectURL(blob); a.href = href; a.download = name; layer.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 30000);
  return true;
}
async function shareFile(blob, name, d) {
  try { await navigator.share({ files: [new File([blob], name, { type: 'image/jpeg' })], text: linkText(d) }); }
  catch (error) {
    /* 공유 시트에서 취소 — 조용히 */
    if (error?.name === 'AbortError') return;
    try { await navigator.share({ text: headline(d), url: d.url }); } catch (e) { if (e?.name !== 'AbortError') console.warn('공유하지 못함', e); }
  }
}
// 클립보드에 글 넣기 → Promise<참 · 거짓>. 부르는 그 틱에 writeText 를 시작한다(기다리지 않아도 된다 — 사파리는 사용자 동작 안에서 불러야 받는다)
function clip(text) {
  try { if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text)); } catch {}
  return Promise.resolve(legacyCopy(text));
}
// 클립보드 API 가 막힌 곳(오래된 웹뷰): 숨은 글 칸으로 한 번 더
function legacyCopy(text) {
  if (!layer) return false;
  const area = document.createElement('textarea'); area.value = text; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  layer.append(area); area.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} area.remove();
  if (ok) layer.focus({ preventScroll: true });
  return ok;
}
// 그것도 안 되면 글을 골라 둔 칸을 보인다
async function copy(text) { if (await clip(text)) toast('복사했어요'); else if (isOpen()) toast('', text); }

// ---- 카카오톡(키가 있을 때만 단추가 있다): 누름 → SDK 불러옴 · init → 카톡용 그림 800×400 을 올림 → 받은 주소로 sendDefault(feed)
//   올리기를 기다린 뒤에는 휴대폰 브라우저가 카카오톡 열기를 막을 수 있다 — 끝났을 때 사용자 동작이 살아 있으면(navigator.userActivation.isActive) 바로 보내고,
//   아니면(그 API 가 없어도) 단추를 '보내기'로 바꿔 한 번 더 누르게 한다(그때는 누른 그 틱에 보낸다). 올리는 동안('올리는 중')은 다시 눌러도 겹쳐 돌지 않는다.
//   같은 기록(now.rev)이면 올린 주소를 다시 쓴다 — 순위가 채워져 다시 그리면(drawAll) 버린다. 실패는 던지지 않고 알림 한 줄 + console.warn.
const freshKakao = () => ({ state: 'idle', url: null, client: null });
function kakaoLook(state) {
  const b = els.acts.querySelector('[data-act=kakao]'); if (!b) return;
  b.dataset.state = state; b.setAttribute('aria-busy', String(state === 'busy')); b.querySelector('span').textContent = KAKAO_STATE[state];
}
async function kakao() {
  const k = now.kakao;
  if (k.state === 'busy') return;
  if (k.url) return kakaoSend(k);
  const my = now, rev = now.rev;
  k.state = 'busy'; kakaoLook('busy');
  try {
    const client = await kakaoClient();
    const canvas = drawKakao(document.createElement('canvas'), my.info, { showroom: my.showroom, scene: my.scene });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9)); if (!blob) throw new Error('카톡용 그림을 못 만듦');
    const url = await uploadKakao(client, blob, 'campus-racing-' + my.info.courseId + '-kakao.jpg');
    /* 판이 닫혔거나 순위가 채워져 다시 그렸으면 버린다 */
    if (now !== my || now.kakao !== k || now.rev !== rev) return;
    k.url = url; k.client = client;
    if (navigator.userActivation?.isActive) kakaoSend(k); else { k.state = 'ready'; kakaoLook('ready'); }
  } catch (error) {
    if (now !== my || now.kakao !== k) return;
    console.warn('카카오톡으로 못 보냄', error);
    k.state = 'idle'; kakaoLook('idle'); toast('카카오톡으로 못 보냈어요');
  }
}
function kakaoSend(k) {
  try { k.client.Share.sendDefault(kakaoTemplate(now.info, k.url, headline)); }
  catch (error) { console.warn('카카오톡으로 못 보냄', error); toast('카카오톡으로 못 보냈어요'); }
  k.state = 'idle'; kakaoLook('idle');
}

// ---- Instagram(2026-11-26 사용자 "인스타그램은 디엠 창 바로 열기가 좋을 것 같아") — 카드 그림은 안 간다(그림은 '공유' 단추가 맡는다)
//   휴대폰(터치): 누른 그 틱에 ① 문구(문구 + 줄바꿈 + 주소)를 클립보드에(앱이 글을 안 채울 때 붙여 넣게 — 기다리지 않음) ② Instagram 앱의 '보낼 사람 고르기' 창.
//     ※ instagram://sharesheet 는 문서에 없는 비공식 길(share-send.js). 1.5초 뒤에도 이 페이지가 그대로 보이면(앱이 안 열림) 알림 한 줄. 페이지는 떠나지 않는다(숨은 링크 클릭 — 게임 그대로).
//   PC: ① 문구 복사(새 탭이 초점을 가져가기 전에 — 크롬은 초점 없는 문서의 클립보드 쓰기를 막는다) ② Instagram 메시지함 새 탭(누른 그 틱) ③ 지금 카드 이미지 저장. 새 탭이 막혀도 ② ③ 은 한다.
const APP_WAIT = 1500;
async function insta(v, d, name) {
  const text = linkText(d), copied = clip(text);
  if (instaWay({ touch: touchy() }) === 'app') { openApp(instaDmUrl(text, isAndroid())); return; }
  try { window.open(INSTA_INBOX, '_blank', 'noopener'); } catch (error) { console.warn('새 탭을 못 엶', error); }
  const saved = await save(v, name), ok = await copied;
  if (!isOpen()) return;
  if (ok) toast(saved ? '이미지 저장 · 문구 복사했어요' : '문구 복사했어요'); else toast('', text);
}
function openApp(url) {
  let left = false; const gone = () => { left = true; };
  const events = [[document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') gone(); }], [window, 'pagehide', gone], [window, 'blur', gone]];
  events.forEach(([target, type, fn]) => target.addEventListener(type, fn));
  try { const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; layer.append(a); a.click(); a.remove(); } catch (error) { console.warn('Instagram 앱을 못 엶', error); }
  setTimeout(() => {
    events.forEach(([target, type, fn]) => target.removeEventListener(type, fn));
    if (!left && document.visibilityState === 'visible' && isOpen()) toast('Instagram 앱을 못 열었어요');
  }, APP_WAIT);
}

// 키: 판이 열려 있는 동안 받은 키는 게임 · 결과 화면에 넘기지 않는다. Esc = 닫기, ← → = 카드 넘기기, Tab = 판 안에서만, Enter · Space = 초점이 있는 단추(없으면 아무것도 안 함)
function onKey(event) {
  if (!isOpen()) return;
  event.stopImmediatePropagation();
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.keyCode === 229) return;
  const code = event.code || event.key;
  if (code === 'Escape') { event.preventDefault(); if (!event.repeat) close(); return; }
  if (code === 'ArrowLeft' || code === 'ArrowRight') { event.preventDefault(); go(now.index + (code === 'ArrowLeft' ? -1 : 1)); return; }
  if (code === 'Tab') {
    event.preventDefault();
    const list = [...layer.querySelectorAll('button:not([disabled]), input, textarea')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    if (!list.length) return; const at = list.indexOf(document.activeElement), step = event.shiftKey ? -1 : 1;
    list[at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length].focus(); return;
  }
  if (['Enter', 'NumpadEnter', 'Space', ' '].includes(code) && !(document.activeElement?.tagName === 'BUTTON' && layer.contains(document.activeElement))) event.preventDefault();
}

export async function open(data = {}) {
  if (!layer) build();
  const my = ++gen, again = isOpen();
  if (!again) back = document.activeElement;
  now = { data, index: ORDER.indexOf(remembered()), scene: null, showroom: null, info: null, blobs: {}, rev: 0, kakao: freshKakao() };
  layer.dataset.ready = 'false'; layer.hidden = false; buttons(); fit(); go(now.index);
  els.toast.dataset.on = 'false';
  if (!again) layer.focus({ preventScroll: true });
  // 글꼴(Saira 는 게임에 이미 있다 — 받은 것을 기다리기만) · 결과 순간의 장면 · 쇼룸 사진
  await within(Promise.all(['italic 900 40px Saira', 'italic 800 40px Saira', 'italic 700 40px Saira', '700 40px Saira', '600 40px Saira'].map(f => document.fonts?.load(f))), SHOT_WAIT);
  const scene = await within(data.scene, SHOT_WAIT);
  if (my !== gen) return;
  let showroom = null; try { showroom = await within(typeof data.showroom === 'function' ? data.showroom() : data.showroom, SHOT_WAIT * 2); } catch (e) { console.warn('쇼룸 사진을 못 그림', e); }
  if (my !== gen || !now) return;
  now.scene = scene; now.showroom = showroom; drawAll(); layer.dataset.ready = 'true';
  return { update, close };
}
// 같은 결과의 내용이 바뀌었을 때(순위가 채워짐): 사진은 그대로, 카드만 다시 그린다
export function update(data = {}) { if (!isOpen() || !now) return; now.data = { ...now.data, ...data }; if (layer.dataset.ready === 'true') drawAll(); }
export function close() {
  if (!isOpen()) return; gen++; layer.hidden = true; clearTimeout(toastTimer); drag = null; now = null;
  els.cards.forEach(card => { const c = card.querySelector('canvas'); c.width = c.height = 0; });   // 큰 캔버스 셋을 놓아 준다
  const target = (back?.isConnected && back) || document.querySelector('#hud .hud-share');
  back = null; target?.focus?.({ preventScroll: true });
}
