// 올릴 묶음의 3D 파일(.bin · .glb · .gltf)은 gzip 으로 줄여 올린다(도구/build-site.mjs 의 packSite — 첫 방문에 받는 양 약 60 MB → 약 16 MB). 여기서 받아서 푼다.
//   2026-11-24 사용자: "뭔데 첫 방문 한 번에 58메가바이트나 받는거야?" → "압축 작업 진행" — 호스팅(Vercel · GitHub Pages)은 이런 파일을 알아서 줄여 주지 않는다.
//   줄인 파일은 제 머리에 표시가 있다(gzip 머리의 시각 칸 4바이트 = 'CRK1'). 그 표시가 있는 전체 응답만 DecompressionStream 으로 풀어 돌려준다.
//   **푼 것은 원본과 한 바이트도 다르지 않다**(zip 처럼 묶었다 푸는 것 — 화질 · 모양은 그대로다. build-site 가 파일마다 풀어서 원본과 같은지 본다).
//   표시가 없는 것(개발 중의 원본 · 처음부터 gzip 인 바닥 bake — 그것은 bts 가 제 손으로 푼다)은 손대지 않고 그대로 돌려준다.
//   bts/ 의 코드(three 의 FileLoader → fetch)를 고치지 않으려고 fetch 를 감싼다. main.js 가 이 파일을 맨 먼저 불러온다.
export const PACK_MARK = [0x1f, 0x8b, 0x08, 0x00, 0x43, 0x52, 0x4b, 0x31];   // gzip(1f 8b) · deflate(08) · 딸린 칸 없음(00) · 시각 칸에 'CRK1'
export const PACKED = /\.(bin|glb|gltf)$/i;                                  // 줄이는 파일(build-site 와 같이 쓴다)
export const marked = bytes => bytes.length >= PACK_MARK.length && PACK_MARK.every((b, i) => bytes[i] === b);

// fetch 를 감싼 것을 돌려준다 — 표시가 있는 답만 풀어서 준다(시험은 가짜 fetch 로 부른다)
export function unpacking(fetchFn, { Decompress = globalThis.DecompressionStream, base = globalThis.location?.href || 'http://local/' } = {}) {
  return async function fetchUnpacked(input, init) {
    const response = await fetchFn(input, init);
    const url = typeof input === 'string' ? input : input?.url ?? String(input), method = String(init?.method || input?.method || 'GET').toUpperCase();
    let pathname = ''; try { pathname = new URL(url, base).pathname; } catch { /* 모르는 주소는 그대로 */ }
    if (method !== 'GET' || !PACKED.test(pathname) || response.status !== 200 || !response.body || response.headers.has('content-range')) return response;
    // Range 의 위치는 압축된 파일 기준이다. fetch 는 init.headers 가 있으면 Request 의 머리글을 그 값으로 갈아 끼운다.
    const requestHeaders = init?.headers ?? input?.headers;
    if (requestHeaders && new Headers(requestHeaders).has('range')) return response;
    // 앞의 여덟 바이트만 본다 — 사본으로 읽어서 원래 답은 건드리지 않는다
    const peek = response.clone().body.getReader(); let head = new Uint8Array(0);
    try {
      while (head.length < PACK_MARK.length) { const { done, value } = await peek.read(); if (done) break; const next = new Uint8Array(head.length + value.length); next.set(head); next.set(value, head.length); head = next; }
    } finally { peek.cancel().catch(() => {}); }
    if (!marked(head)) return response;
    if (typeof Decompress !== 'function') throw new Error('브라우저가 오래돼 게임 자료를 풀 수 없어요 · 브라우저를 업데이트해 주세요');
    const headers = new Headers(response.headers); headers.delete('content-length'); headers.delete('content-encoding');   // 길이는 줄인 것의 길이라 뺀다
    return new Response(response.body.pipeThrough(new Decompress('gzip')), { status: response.status, statusText: response.statusText, headers });
  };
}

// 브라우저에서: fetch 를 한 번만 바꿔 끼운다
if (typeof window !== 'undefined' && typeof globalThis.fetch === 'function' && !globalThis.fetch.unpacks) {
  const wrapped = unpacking(globalThis.fetch.bind(globalThis)); wrapped.unpacks = true; globalThis.fetch = wrapped;
}
