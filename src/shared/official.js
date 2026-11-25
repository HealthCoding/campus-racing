// 게임의 공식 주소 — 한 곳에만 적는다(2026-11-25). 공개 주소가 바뀌면 이 한 줄만 고친다.
//   index.html 머리의 canonical · og:url · og:image · twitter:image 가 이 값과 같은지 검증/official-url.test.mjs 가 본다.
//   공유(src/hud/share.js)는 공식 주소 · 로컬 개발 주소에서는 지금 페이지 주소를, 그 밖(옮겨 올린 사본 · 미리 보기 주소)에서는 이 주소를 쓴다.
export const OFFICIAL_URL = 'https://campus-racing.vercel.app';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const official = new URL(OFFICIAL_URL);
// 공식 주소의 앞부분(끝 / 포함) — 공식 주소가 하위 경로(예: …github.io/campus-racing)여도 맞게
const OFFICIAL_PATH = official.pathname.endsWith('/') ? official.pathname : official.pathname + '/';

// loc: location 꼴({ origin, host, hostname?, pathname }) — 시험은 가짜를 준다
function hostnameOf(loc) {
  if (loc.hostname) return loc.hostname;
  try { return new URL(loc.origin).hostname; } catch { return String(loc.host || '').replace(/:\d+$/, ''); }
}
// 로컬 예외는 http · https 로 연 개발 서버일 때만. file: 로 연 사본(file://127.0.0.1/… 포함)은 늘 공식 주소를 쓴다 — origin 이 'null' 이라 주소가 망가지고 로컬 경로가 드러난다
function protocolOf(loc) {
  if (loc.protocol) return loc.protocol;
  try { return new URL(loc.origin).protocol; } catch { return ''; }
}
export const isLocal = loc => ['http:', 'https:'].includes(protocolOf(loc)) && LOCAL_HOSTS.has(hostnameOf(loc));
export const isOfficial = loc => loc.origin === official.origin && (loc.pathname + '/').startsWith(OFFICIAL_PATH);

// 공유에 쓸 주소의 자리({ origin, host, pathname }): 공식 · 로컬이면 지금 페이지, 아니면 공식 주소
export function shareLocation(loc) {
  if (!loc || isLocal(loc) || isOfficial(loc)) return loc;
  return { origin: official.origin, host: official.host, pathname: OFFICIAL_PATH };
}
