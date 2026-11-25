// 트랙 그리기 · 벽 · 위치 찾기 · 랩 판정 (약속: docs/구조와_계약.md 3.8). THREE 는 인자로 받는다(import 하지 않음).
//   const track = createTrack(THREE, course, { heightAt });  scene.add(track.group);
//   const clock = createLapClock(course);  clock.update(prevPos, curPos, time)  → 사건 목록
// 단위 미터 · 초. x 동, z 남, y 위. lateral(옆 위치)은 진행 방향 오른쪽이 +.
import { createWallIndex } from '../shared/wall-index.js';
import { finishBarrierConcrete } from '../world/school-colours.js';
import { hypot } from '../shared/dmath.js';   // 결정적 수학 — 주행이 쓰는 createLocator · createLapClock 에서만(그리기는 Math 그대로)

const COLOURS = {
  asphalt: 0x50545a, line: 0xf2f4f7, blue: 0x3567b5, kerb: 0x2f63c0, white: 0xe9edf2, navy: 0x1d3466, post: 0xdfe4ea, dark: 0x1b1d21, warn: 0xd8382e, apex: 0xf6c62c,
};
// 지면 위로 띄우는 높이(m). 캠퍼스 포장 겉면이 지형 함수보다 최대 0.10 m 위에 있어서(백양로 0.072, 벤치 받침 0.10 — 검증/world-surface-gap.mjs 로 잼) 그보다 높게 둔다.
export const LIFT = { road: 0.13, line: 0.145, paint: 0.15 };

// ------------------------------------------------------------------ 위치 찾기(그리기와 랩 판정이 같이 쓴다)
export function createLocator(course) {
  const c = course.centre, n = c.length;   // course.left / right 도 쓴다
  const x = new Float64Array(n), z = new Float64Array(n), hl = new Float64Array(n), hr = new Float64Array(n), cum = new Float64Array(n + 1);
  const dx = new Float64Array(n), dz = new Float64Array(n), seg = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = c[i][0]; z[i] = c[i][1]; hl[i] = c[i][2]; hr[i] = c[i][3]; }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, ex = x[j] - x[i], ez = z[j] - z[i], l = hypot(ex, ez) || 1e-9; seg[i] = l; dx[i] = ex / l; dz[i] = ez / l; cum[i + 1] = cum[i] + l; }
  const length = cum[n];
  // 중심선 선분 격자(전체 찾기용)
  const CELL = 12, cells = new Map(), key = (a, b) => a * 100003 + b;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, pad = Math.max(hl[i], hr[i]) + 5;
    for (let cx = Math.floor((Math.min(x[i], x[j]) - pad) / CELL); cx <= Math.floor((Math.max(x[i], x[j]) + pad) / CELL); cx++)
      for (let cz = Math.floor((Math.min(z[i], z[j]) - pad) / CELL); cz <= Math.floor((Math.max(z[i], z[j]) + pad) / CELL); cz++) { const k = key(cx, cz); let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(i); }
  }
  const wrap = i => ((i % n) + n) % n;
  // 선분 i 에 대한 점수: 통로 반폭으로 나눈 거리(나란한 구간에서 넓은 쪽 통로 가장자리가 좁은 쪽 중심에 더 가까워도 제 구간을 고르게).
  const out = { index: 0, s: 0, lateral: 0, t: 0, distance: 0, score: 0 };
  function score(i, px, pz, res) {
    const ox = px - x[i], oz = pz - z[i];
    let t = (ox * dx[i] + oz * dz[i]) / seg[i]; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ox - dx[i] * seg[i] * t, qz = oz - dz[i] * seg[i] * t, d = hypot(qx, qz);
    const lateral = -qx * dz[i] + qz * dx[i];   // 오른쪽 = (−dz, dx)
    const j = (i + 1) % n, half = lateral >= 0 ? hr[i] + (hr[j] - hr[i]) * t : hl[i] + (hl[j] - hl[i]) * t;
    const sc = d / Math.max(0.5, half);
    if (sc < res.score) { res.score = sc; res.index = i; res.t = t; res.distance = d; res.lateral = lateral; res.s = cum[i] + seg[i] * t; }
  }
  // 통로 칸 i(왼 i · 오 i · 왼 i+1 · 오 i+1 의 사각형) 안의 좌표: t = 앞뒤(0~1), u = 왼쪽 경계 0 … 오른쪽 경계 1. 칸 밖이면 false.
  // m > 0 이면 경계를 바깥으로 m 만큼 밀어낸 칸으로 본다(이웃 칸과 모서리를 같이 쓰므로 밀어내도 칸 사이에 틈이 안 생긴다).
  const Lx = new Float64Array(n), Lz = new Float64Array(n), Rx = new Float64Array(n), Rz = new Float64Array(n), ux = new Float64Array(n), uz = new Float64Array(n);
  for (let i = 0; i < n; i++) { Lx[i] = course.left[i][0]; Lz[i] = course.left[i][1]; Rx[i] = course.right[i][0]; Rz[i] = course.right[i][1]; const l = hypot(Rx[i] - Lx[i], Rz[i] - Lz[i]) || 1; ux[i] = (Rx[i] - Lx[i]) / l; uz[i] = (Rz[i] - Lz[i]) / l; }
  const cellOut = { t: 0, u: 0 };
  function inCell(i, px, pz, m = 0) {
    const j = (i + 1) % n;
    const lix = Lx[i] - ux[i] * m, liz = Lz[i] - uz[i] * m, ljx = Lx[j] - ux[j] * m, ljz = Lz[j] - uz[j] * m;
    const e0x = Rx[i] - Lx[i] + 2 * m * ux[i], e0z = Rz[i] - Lz[i] + 2 * m * uz[i], dax = ljx - lix, daz = ljz - liz, dex = (Rx[j] - Lx[j] + 2 * m * ux[j]) - e0x, dez = (Rz[j] - Lz[j] + 2 * m * uz[j]) - e0z;
    const w0x = px - lix, w0z = pz - liz;
    // cross(E0 + t dE, W0 − t dA) = 0  →  a t² + b t + c = 0
    const c = e0x * w0z - e0z * w0x, b = (dex * w0z - dez * w0x) - (e0x * daz - e0z * dax), a = -(dex * daz - dez * dax);
    let t;
    if (Math.abs(a) < 1e-9) { if (Math.abs(b) < 1e-12) return false; t = -c / b; }
    else { const disc = b * b - 4 * a * c; if (disc < 0) return false; const r = Math.sqrt(disc), t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a); t = (t1 >= -1e-9 && t1 <= 1 + 1e-9) ? t1 : t2; }
    if (!(t >= -1e-9 && t <= 1 + 1e-9)) return false;
    const ex = e0x + dex * t, ez = e0z + dez * t, wx = w0x - dax * t, wz = w0z - daz * t, u = (wx * ex + wz * ez) / (ex * ex + ez * ez);
    if (!(u >= -1e-9 && u <= 1 + 1e-9)) return false;   // 경계선 바로 위의 점도 제 칸으로(앞뒤 좌표 t 와 같은 여유)
    cellOut.t = Math.min(1, Math.max(0, t)); cellOut.u = Math.min(1, Math.max(0, u)); return true;
  }
  function fromCell(i, res, m = 0) {
    const j = (i + 1) % n, t = cellOut.t, l = hl[i] + (hl[j] - hl[i]) * t, r = hr[i] + (hr[j] - hr[i]) * t, lateral = cellOut.u * (l + r + 2 * m) - (l + m);
    res.index = i; res.t = t; res.s = cum[i] + seg[i] * t; res.lateral = lateral; res.distance = Math.abs(lateral); res.half = lateral >= 0 ? r : l; return res;
  }
  // (px, pz) 를 담는 통로 칸을 모두 찾는다 — 길이 위아래로 겹치는 곳(course.crossings)에서는 구간마다 하나씩 나온다.
  // 같은 구간(중심선 번호로 12점 안)의 칸은 하나로 친다. margin: 경계 밖 몇 m 까지 칸으로 칠지(5 까지). only: 볼 칸만 1 인 표(없으면 전부).
  // list 의 앞에서부터 { index, t, s, lateral, half } 를 채우고 개수를 돌려준다(list 의 객체를 다시 쓴다 — 주행 계산이 매 틱 부른다).
  function cellsAt(px, pz, margin = 0, list = [], only = null) {
    const l = cells.get(key(Math.floor(px / CELL), Math.floor(pz / CELL))); let count = 0; if (!l) return 0;
    for (let a = 0; a < l.length; a++) {
      const i = l[a]; if ((only && !only[i]) || !inCell(i, px, pz, margin)) continue;
      let same = false; for (let k = 0; k < count; k++) { const d = Math.abs(list[k].index - i); if (d <= 12 || n - d <= 12) { same = true; break; } }
      if (!same) { fromCell(i, list[count] || (list[count] = {}), margin); count++; }
    }
    return count;
  }
  function progress(px, pz, hint = -1, res = {}) {
    // 1) 통로 안이면 칸 좌표로(나란한 구간끼리는 칸이 겹치지 않으니 튈 수 없고, 앞으로 가면 s 가 늘기만 한다)
    if (hint >= 0 && hint < n) for (let k = 0; k <= 14; k++) for (const sg of k ? [1, -1] : [1]) { const i = wrap(hint + sg * k); if (inCell(i, px, pz)) return fromCell(i, res); }
    { const l = cells.get(key(Math.floor(px / CELL), Math.floor(pz / CELL))); if (l) for (const i of l) if (inCell(i, px, pz)) return fromCell(i, res); }
    // 2) 통로 밖: 반폭으로 나눈 거리가 가장 작은 선분
    out.score = Infinity;
    if (hint >= 0 && hint < n) {
      for (let k = -14; k <= 14; k++) score(wrap(hint + k), px, pz, out);
      if (out.score > 1.6) out.score = Infinity;   // 통로에서 많이 벗어났으면 전체에서 다시 찾는다
    }
    if (out.score === Infinity) {
      for (let r = 0; r < 4 && out.score === Infinity; r++) {
        const reach = r * CELL;
        for (let cx = Math.floor((px - reach) / CELL); cx <= Math.floor((px + reach) / CELL); cx++)
          for (let cz = Math.floor((pz - reach) / CELL); cz <= Math.floor((pz + reach) / CELL); cz++) { const l = cells.get(key(cx, cz)); if (l) for (const i of l) score(i, px, pz, out); }
      }
      if (out.score === Infinity) for (let i = 0; i < n; i++) score(i, px, pz, out);
    }
    res.index = out.index; res.s = out.s; res.lateral = out.lateral; res.t = out.t; res.distance = out.distance;
    return res;
  }
  return { n, x, z, hl, hr, dx, dz, seg, cum, length, progress, cellsAt, wrap };
}

// ------------------------------------------------------------------ 길 표시(가운데 점선 · 코너 안쪽 연석)가 쓰는 계산 — THREE 없음
// 굽은 곳 찾기: 중심선의 꺾임을 앞뒤 다섯 칸(10 m)으로 고르게 한 뒤, 반지름 55 m 보다 급한 칸이 이어지는 구간. 28° 넘게 꺾이는 것만 친다.
//   → [{ from, to(칸 번호 — to 는 그 구간 다음 칸), angle(도), dir · inside: 'left' | 'right' }]. 출발선을 걸치는 구간은 둘로 나뉜다(코스 B 에는 없다).
//   course.corners(코스 도구가 적은 큰 코너 — 화살표 판용)와 따로다: 이쪽은 안쪽 연석을 칠할 자리라 완만한 코너까지 잡는다.
export function findBends(course, { radius = 55, minAngle = 28 } = {}) {
  const c = course.centre, n = c.length, step = course.step || 2, norm = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const h = new Float64Array(n), turn = new Float64Array(n), k = new Float64Array(n);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; h[i] = Math.atan2(c[j][0] - c[i][0], c[j][1] - c[i][1]); }
  for (let i = 0; i < n; i++) turn[i] = norm(h[(i + 1) % n] - h[i]);   // + = 왼쪽으로 꺾임
  for (let i = 0; i < n; i++) { let t = 0; for (let d = -2; d <= 2; d++) t += turn[(i + d + n) % n]; k[i] = t / 5 / step; }
  const runs = [];
  for (let i = 0; i < n;) {
    if (Math.abs(k[i]) < 1 / radius) { i++; continue; }
    const sign = Math.sign(k[i]); let j = i, angle = 0;
    while (j < n && Math.sign(k[j]) === sign && Math.abs(k[j]) >= 1 / radius) { angle += k[j] * step; j++; }
    const last = runs[runs.length - 1];
    if (last && last.sign === sign && (i - last.to) * step < 8) { last.to = j; last.angle += angle; } else runs.push({ from: i, to: j, angle, sign });   // 8 m 안에서 이어지는 같은 방향은 한 코너
    i = j;
  }
  return runs.filter(r => Math.abs(r.angle) >= minAngle * Math.PI / 180).map(r => ({ from: r.from, to: r.to, angle: Math.round(Math.abs(r.angle) * 180 / Math.PI), dir: r.sign > 0 ? 'left' : 'right', inside: r.sign > 0 ? 'left' : 'right' }));
}
// 가운데 점선의 칸 [[s0, s1], …](m): 3 m 칠하고 5 m 비운다(한 바퀴에 딱 맞게 나눈다). 출발선 체크 무늬와 gaps([[from, to], …] — 부스트 발판 · 점프대)에 걸치는 칸은 뺀다.
export function centreDashes(length, gaps = []) {
  const count = Math.max(1, Math.round(length / 8)), period = length / count, skip = [[-1.4, 1.4], [length - 1.4, length + 1.4], ...gaps], out = [];
  for (let k = 0; k < count; k++) { const s0 = 2 + k * period, s1 = s0 + 3; if (!skip.some(([a, b]) => s1 > a && s0 < b)) out.push([s0, s1]); }
  return out;
}

// ------------------------------------------------------------------ 트랙
// heightAt(x, z, s): 노면이 깔리는 높이. s = 그 점이 속한 자리의 트랙 거리 — 길이 위아래로 겹치는 곳에서 제 층의 높이를 고르는 데 쓴다(겹침이 없으면 안 봐도 된다).
// openAt(s, side): 그 자리의 그쪽('left' | 'right') 방호벽이 없으면 true(난간 없는 구간 — 코스 부품이 정한다). 방호벽을 빼고 가장자리에 빨강 · 흰 줄을 칠한다.
// lineGaps: 가운데 점선을 칠하지 않는 구간 [[from, to], …](s, m) — 부스트 발판 · 점프대 자리(메인이 부품에서 뽑아 준다).
// gapAt(s, side): 그 자리의 그쪽 방호벽이 열려 있으면 true(피트레인으로 갈라지는 곳 — pit.gapAt). 방호벽 · 가장자리 선 · 코너 판만 뺀다(빨강 · 흰 줄은 안 칠한다 — 떨어지는 곳이 아니다).
export function createTrack(THREE, course, { heightAt = () => 0, openAt = null, gapAt = null, lineGaps = [] } = {}) {
  const loc = createLocator(course), { n, x, z, hl, hr, dx, dz, length } = loc;
  const sAt = (i, t = 0) => loc.cum[i] + loc.seg[i] * t;
  const wrap = loc.wrap;
  // 점마다 진행 방향(앞뒤 평균) — 경계선과 같은 법선을 쓰려고 자료의 left/right 를 그대로 쓴다.
  const L = course.left, R = course.right;
  const fx = new Float64Array(n), fz = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = wrap(i - 1), b = wrap(i + 1), ex = x[b] - x[a], ez = z[b] - z[a], l = Math.hypot(ex, ez) || 1; fx[i] = ex / l; fz[i] = ez / l; }
  // 통로 안의 한 점: u = 0 왼쪽 경계 … 1 오른쪽 경계
  const across = (i, u) => [L[i][0] + (R[i][0] - L[i][0]) * u, L[i][1] + (R[i][1] - L[i][1]) * u];
  // 경계에서 안쪽으로 d m 들어간 점(side 'left' | 'right')
  const inset = (i, side, d) => { const w = hl[i] + hr[i]; return across(i, side === 'left' ? d / w : 1 - d / w); };
  const group = new THREE.Group(); group.name = 'track';
  const meshes = [];
  // 낮 하늘(-1) 다음, 캠퍼스·노면(0) 앞에 불투명한 벽과 칠의 깊이를 먼저 기록한다.
  const solidOrder = -0.75, markingOrder = -0.5;
  const std = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts });
  const add = (geometry, material, name, { cast = false } = {}) => { const m = new THREE.Mesh(geometry, material); m.name = name; m.receiveShadow = true; m.castShadow = cast; group.add(m); meshes.push(m); return m; };

  // ---- 1. 노면: 줄마다 같은 칸 수(가로 칸 폭 1.5 m 이하)
  const COLS = Math.max(4, Math.ceil(Math.max(...course.centre.map(c => c[2] + c[3])) / 1.4));
  {
    const pos = new Float32Array(n * (COLS + 1) * 3), uv = new Float32Array(n * (COLS + 1) * 2), idx = [];
    for (let i = 0; i < n; i++) for (let k = 0; k <= COLS; k++) {
      const [px, pz] = across(i, k / COLS), o = i * (COLS + 1) + k;
      pos[o * 3] = px; pos[o * 3 + 1] = heightAt(px, pz, loc.cum[i]) + LIFT.road; pos[o * 3 + 2] = pz;
      uv[o * 2] = k / COLS; uv[o * 2 + 1] = loc.cum[i] / 4;
    }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; for (let k = 0; k < COLS; k++) { const a = i * (COLS + 1) + k, b = j * (COLS + 1) + k; idx.push(a, a + 1, b, a + 1, b + 1, b); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    add(g, std({ color: COLOURS.asphalt, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 'track-road');
  }

  // 띠 하나(경계에서 안쪽 d0~d1 m, 점 i0 부터 count 칸)를 위치 배열에 쌓는다. 색은 칸마다.
  // parts: 한 칸(약 2 m)을 앞뒤로 몇 조각으로 나눌지(연석 줄무늬 1 m 용). 색은 조각마다.
  function paintQuad(out, a, b, c, d, col) {
    const base = out.pos.length / 3;
    out.pos.push(...a, ...b, ...c, ...d);
    for (let v = 0; v < 4; v++) out.col.push(col.r, col.g, col.b);
    out.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  function strip(out, side, d0, d1, i0, count, lift, colourOf, parts = 1, innerLift = lift) {
    const mix = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    for (let k = 0; k < count; k++) {
      const i = wrap(i0 + k), j = wrap(i + 1), A = inset(i, side, d0), B = inset(i, side, d1), Cc = inset(j, side, d0), D = inset(j, side, d1);
      for (let p = 0; p < parts; p++) {
        const col = colourOf(k * parts + p), t0 = p / parts, t1 = (p + 1) / parts;
        const a = mix(A, Cc, t0), b = mix(B, D, t0), c = mix(A, Cc, t1), d = mix(B, D, t1);
        const s0 = sAt(i, t0), s1 = sAt(i, t1), ya = heightAt(a[0], a[1], s0) + lift, yb = heightAt(b[0], b[1], s0) + innerLift, yc = heightAt(c[0], c[1], s1) + lift, yd = heightAt(d[0], d[1], s1) + innerLift;
        // 면이 위를 보게(반시계) 감김 방향을 맞춘다 — 왼쪽은 a→b 가 오른쪽(안쪽), 오른쪽은 왼쪽
        const v0 = [a[0], ya, a[1]], v1 = [b[0], yb, b[1]], v2 = [c[0], yc, c[1]], v3 = [d[0], yd, d[1]];
        if (side === 'left') paintQuad(out, v0, v1, v2, v3, col);
        else paintQuad(out, v0, v2, v1, v3, col);
      }
    }
  }
  // 노면 칠 한 겹의 골재 자국. 점선·연석·체크가 같은 0.9 m 타일을 쓴다.
  const paintGrain = (() => {
    const size = 96, pixels = new Uint8Array(size * size * 4);
    let seed = 43;
    for (let i = 0; i < pixels.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const u = seed / 4294967296;
      const value = Math.round(u < 0.09 ? 177 + 380 * u : 229 + 26 * u);
      pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
    const texture = new THREE.DataTexture(pixels, size, size);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  })();
  function flatGeometry(out) {
    const g = new THREE.BufferGeometry(), uv = [];
    for (let i = 0; i < out.pos.length; i += 3) uv.push(out.pos[i] / 0.9, out.pos[i + 2] / 0.9);
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (out.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    if (out.indices) g.setIndex(out.indices);
    g.computeVertexNormals();
    return g;
  }

  // ---- 2. 연석(코너 양쪽, 파랑 · 흰 줄무늬) 과 가장자리 흰 선(연석 없는 곳)
  const kerbAt = { left: new Uint8Array(n), right: new Uint8Array(n) };
  for (const k of course.kerbs || []) for (let i = k.from; ; i = wrap(i + 1)) { kerbAt[k.side][i] = 1; if (i === k.to) break; }
  const kerbBlue = new THREE.Color(COLOURS.kerb), blue = new THREE.Color(COLOURS.blue), white = new THREE.Color(COLOURS.white), dark = new THREE.Color(COLOURS.dark), warn = new THREE.Color(COLOURS.warn);
  // 난간 없는 칸(경계 선분 i 의 가운데로 본다 — 벽을 빼는 쪽(parts.wallSpans)과 같은 기준)
  const openEdge = { left: new Uint8Array(n), right: new Uint8Array(n) };
  if (openAt) for (const side of ['left', 'right']) for (let i = 0; i < n; i++) if (openAt(sAt(i, 0.5), side)) openEdge[side][i] = 1;
  if (gapAt) for (const side of ['left', 'right']) for (let i = 0; i < n; i++) if (!openEdge[side][i] && gapAt(sAt(i, 0.5), side)) openEdge[side][i] = 2;   // 2 = 열린 방호벽(피트)
  // 코너 안쪽 연석(노랑 · 흰, 넓게 — '여기를 스쳐 돌아라'): 짧은 코너는 코너 전체와 앞뒤 한 칸, 길게 도는 코너(120° 넘게 — 회오리 · U턴)는 안쪽에 붙어 도는 가운데 60%
  const bends = findBends(course), apexAt = { left: new Uint8Array(n), right: new Uint8Array(n) }, apexYellow = new THREE.Color(COLOURS.apex);
  for (const b of bends) { const cut = b.angle > 120 ? Math.round((b.to - b.from) * 0.2) : -1; for (let i = b.from + cut; i < b.to - cut; i++) apexAt[b.inside][wrap(i)] = 1; }
  const paint = { pos: [], col: [], indices: [] }, line = new THREE.Color(COLOURS.line);
  const curbLip = [new THREE.Color(0x989c98), new THREE.Color(0xb1b3ac)];
  // 노견 흰 선도 같은 노면 칠 메시로 그린다.
  for (const side of ['left', 'right']) for (let i = 0; i < n; i++) {
    if (!kerbAt[side][i] && !openEdge[side][i] && !apexAt[side][i]) strip(paint, side, 0.3, 0.45, i, 1, LIFT.line, () => line);
  }
  // ---- 2-1. 가운데 점선(통로 한가운데의 흰 선 0.22 m — 속도감과 앞길 읽기). 1 m 마다 끊어 지형을 따라 얹는다
  {
    const dashes = { pos: [], col: [] }, HALF = 0.11;
    // 트랙 거리 s 에서 통로 한가운데로부터 옆으로 d m(+ = 오른쪽)인 점
    const along = (s, d) => {
      s = ((s % length) + length) % length; let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (loc.cum[m] <= s) lo = m; else hi = m - 1; }
      const j = (lo + 1) % n, t = Math.min(1, (s - loc.cum[lo]) / loc.seg[lo]), a = across(lo, 0.5 + d / (hl[lo] + hr[lo])), b = across(j, 0.5 + d / (hl[j] + hr[j])), px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
      return [px, heightAt(px, pz, s) + LIFT.line, pz];
    };
    for (const [s0, s1] of centreDashes(length, lineGaps)) {
      const cuts = Math.max(1, Math.ceil(s1 - s0));
      for (let k = 0; k < cuts; k++) {
        const sa = s0 + (s1 - s0) * k / cuts, sb = s0 + (s1 - s0) * (k + 1) / cuts, a = along(sa, -HALF), b = along(sa, HALF), c = along(sb, -HALF), d = along(sb, HALF);
        dashes.pos.push(...a, ...b, ...c, ...b, ...d, ...c);   // 왼쪽 뒤 → 오른쪽 뒤 → 왼쪽 앞: 위를 보는 면
      }
    }
    // 입자 지도의 평균 감쇠를 되돌려 멀리서도 원래 도료 밝기를 낸다.
    add(flatGeometry(dashes), std({ color: line.clone().multiplyScalar(1.065), map: paintGrain, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 'track-centre').renderOrder = markingOrder;
  }
  for (const side of ['left', 'right']) for (let i = 0; i < n; i++) {
    if (openEdge[side][i] === 1) {
      strip(paint, side, 0, 1.1, i, 1, LIFT.paint, p => (p % 2 ? white : warn), 2);
      continue;
    }
    const apex = apexAt[side][i];
    if (!apex && !kerbAt[side][i]) continue;
    const width = apex ? 1.35 : 0.75, colour = p => p % 2 ? white : apex ? apexYellow : kerbBlue;
    // 연석 안쪽 턱은 길과 만나고 등은 둥글게 꺾인다. 같은 모서리를 공유해 줄끼리 겹치지 않는다.
    const bevel = width * 0.09;
    strip(paint, side, 0, width - bevel, i, 1, LIFT.paint + 0.05, colour, 2, LIFT.paint + 0.065);
    strip(paint, side, width - bevel, width, i, 1, LIFT.paint + 0.065, p => curbLip[p % 2], 2, LIFT.paint);
  }
  // ---- 3. 출발선: 체크 무늬 두 줄(0.5 m 칸), 0 번 점 둘레 ±0.5 m
  {
    const i = 0, w = hl[i] + hr[i], cols = Math.max(2, Math.round(w / 0.5)), rx = -fz[i], rz = fx[i];
    const lx = L[i][0], lz = L[i][1];
    const P = (u, a) => { const px = lx + rx * u + fx[i] * a, pz = lz + rz * u + fz[i] * a; return [px, heightAt(px, pz, 0) + LIFT.paint, pz]; };
    function tile(u0, u1, a0, a1, col) {
      paintQuad(paint, P(u0, a0), P(u1, a0), P(u0, a1), P(u1, a1), col);
    }
    for (let row = 0; row < 2; row++) for (let k = 0; k < cols; k++) {
      const col = (row + k) % 2 ? dark : white, a0 = (row - 1) * 0.5, a1 = row * 0.5, u0 = k * w / cols, u1 = (k + 1) * w / cols;
      tile(u0, u1, a0, a1, col);
      if (row === 0) { tile(u0, u1, -0.64, -0.55, line); tile(u0, u1, 0.55, 0.64, line); }
    }
  }
  add(flatGeometry(paint), std({ vertexColors: true, map: paintGrain, roughness: 0.87, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), 'track-paint').renderOrder = markingOrder;

  // ---- 4. 방호벽: 경계 선분마다 낮은 블록 하나(InstancedMesh). 안쪽 밑면이 경계선에 닿는다.
  const levels = [[0.35, -0.15], [0.168, 0.425], [0.15, 0.729], [0.102, 0.78]];
  const barrierGeometry = (() => {
    const pos = [], indices = [];
    function quad(a, b, c, d) {
      const i = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
    for (let k = 1; k < levels.length; k++) {
      const [a, lo] = levels[k - 1], [b, hi] = levels[k];
      quad([a, lo, -0.5], [b, hi, -0.5], [b, hi, 0.5], [a, lo, 0.5]);
      quad([-a, lo, 0.5], [-b, hi, 0.5], [-b, hi, -0.5], [-a, lo, -0.5]);
    }
    // 이어진 블록 사이에는 단면 안에 들어가는 면 두 장만 둔다. 밑면은 지면·상판 속이다.
    const [b, y1] = levels.at(-1);
    for (const z of [-0.495, 0.495]) {
      const side = Math.sign(z);
      quad([-side * 0.245, 0, z], [side * 0.245, 0, z], [side * b, y1, z], [-side * b, y1, z]);
    }
    quad([-b, y1, 0.5], [b, y1, 0.5], [b, y1, -0.5], [-b, y1, -0.5]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
  })();
  const endTabs = [];
  {
    const count = 2 * n, mesh = new THREE.InstancedMesh(barrierGeometry, std({ color: 0xffffff, roughness: 0.6 }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), s = new THREE.Vector3();
    let k = 0;
    for (const [ring, out] of [[L, -1], [R, 1]]) for (let i = 0; i < n; i++) {
      const openings = openEdge[ring === L ? 'left' : 'right'];
      if (openings[i]) continue;
      const a = ring[i], b = ring[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 0.01;
      // 바깥쪽 법선: 왼쪽 고리는 진행 방향 왼쪽, 오른쪽 고리는 오른쪽
      const ox = out * (-ez / l), oz = out * (ex / l), mx = (a[0] + b[0]) / 2 + ox * 0.31, mz = (a[1] + b[1]) / 2 + oz * 0.31;
      const ya = heightAt(a[0] + ox * 0.31, a[1] + oz * 0.31, sAt(i, 0)), yb = heightAt(b[0] + ox * 0.31, b[1] + oz * 0.31, sAt(i, 1));
      e.set(-Math.atan2(yb - ya, l), Math.atan2(ex, ez), 0); q.setFromEuler(e);
      p.set(mx, (ya + yb) / 2, mz);
      s.set(1, 1, Math.max(0.01, Math.hypot(l, yb - ya) - 0.018));
      mesh.setMatrixAt(k, m.compose(p, q, s)); mesh.setColorAt(k, i % 3 === 0 ? blue : white); k++;   // 흰 블록 둘에 파랑 하나
      for (const end of [-1, 1]) if (openings[wrap(i + end)]) endTabs.push({ matrix: m.clone(), out, end, length: s.z });
    }
    mesh.count = k;
    mesh.renderOrder = solidOrder;
    finishBarrierConcrete(THREE, mesh);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = 'track-barriers'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh); meshes.push(mesh);
  }

  // ---- 5. 출발 문(기둥 둘 + 가로대) 과 코너 앞 화살표 판 — 정점 색 하나의 메시
  const props = { pos: [], col: [] };
  const pushTri = (a, b, c, col) => { props.pos.push(...a, ...b, ...c); props.col.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b); };
  const pushQuad = (a, b, c, d, col) => { pushTri(a, b, c, col); pushTri(a, c, d, col); };
  // 열린 벽의 마지막 블록에 붙인 반사 탭. 피트의 노랑 덧씌움이 닿지 않는 면에 둔다.
  const reflector = new THREE.Color(0xffe7b2).multiplyScalar(1.55);
  const cap = new THREE.Color(0x93989b);
  for (const tab of endTabs) {
    // 피트·난간이 열리는 끝에서만 전체 단면을 막는다.
    const corner = (x, y) => new THREE.Vector3(x, y, tab.end / 2).applyMatrix4(tab.matrix).toArray();
    for (let i = 1; i < levels.length; i++) {
      const [a, lo] = levels[i - 1], [b, hi] = levels[i];
      pushQuad(corner(-a, lo), corner(a, lo), corner(b, hi), corner(-b, hi), cap);
    }
    const point = (along, y, away) => {
      const face = 0.168 - 0.018 * (y - 0.425) / 0.304;
      return new THREE.Vector3(tab.out * (face + away), y, -tab.end * 0.08 + along / tab.length).applyMatrix4(tab.matrix).toArray();
    };
    for (const [w, h, away, colour] of [[0.15, 0.073, 0.004, dark], [0.12, 0.043, 0.009, reflector]]) {
      pushQuad(point(-w, 0.58 - h, away), point(w, 0.58 - h, away), point(w, 0.58 + h, away), point(-w, 0.58 + h, away), colour);
    }
  }
  // 방향 상자: 중심 o, 축 u(가로) · v(위) · w(앞) 반길이 hu · hv · hw
  function box(o, u, v, w, hu, hv, hw, col) {
    const P = (su, sv, sw) => [o[0] + u[0] * hu * su + v[0] * hv * sv + w[0] * hw * sw, o[1] + u[1] * hu * su + v[1] * hv * sv + w[1] * hw * sw, o[2] + u[2] * hu * su + v[2] * hv * sv + w[2] * hw * sw];
    const f = [[[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]];
    // (오른쪽, 위, 앞) 은 왼손 좌표라 꼭짓점 순서를 뒤집어야 면이 바깥을 본다
    for (const face of f) pushQuad(...face.map(c => P(...c)).reverse(), col);
  }
  const UP = [0, 1, 0];
  {
    const i = 0, rx = -fz[i], rz = fx[i], f3 = [fx[i], 0, fz[i]], r3 = [rx, 0, rz];
    const pl = [L[i][0] - rx * 1.1, L[i][1] - rz * 1.1], pr = [R[i][0] + rx * 1.1, R[i][1] + rz * 1.1];
    const yl = heightAt(pl[0], pl[1], 0), yr = heightAt(pr[0], pr[1], 0), top = Math.max(yl, yr) + 5.4;
    const steel = new THREE.Color(0xb2bec2), socket = new THREE.Color(0x374249);
    for (const [p, y] of [[pl, yl], [pr, yr]]) {
      box([p[0], (top + y) / 2, p[1]], r3, UP, f3, 0.14, (top - y) / 2, 0.18, steel);
      box([p[0], y + 0.19, p[1]], r3, UP, f3, 0.41, 0.27, 0.38, white);
      box([p[0], y + 0.52, p[1]], r3, UP, f3, 0.23, 0.06, 0.26, socket);
      box([p[0], top - 0.48, p[1]], r3, UP, f3, 0.24, 0.36, 0.25, blue);
    }
    const span = Math.hypot(pr[0] - pl[0], pr[1] - pl[1]) / 2;
    const midX = (pl[0] + pr[0]) / 2, midZ = (pl[1] + pr[1]) / 2;
    const onBeam = (u, v, w = 0) => [midX + rx * u + fx[i] * w, top + v, midZ + rz * u + fz[i] * w];
    // 남색 윗보와 가는 아랫보 사이로 하늘이 보인다.
    box(onBeam(0, -0.15), r3, UP, f3, span + 0.24, 0.16, 0.24, blue);
    box(onBeam(0, -0.79), r3, UP, f3, span, 0.065, 0.17, steel);
    const bays = Math.ceil(2 * span / 1.7), bay = 2 * span / bays;
    for (let j = 0; j < bays; j++) {
      const rise = j % 2 ? -0.49 : 0.49, len = Math.hypot(bay, rise);
      const axis = [rx * bay / len, rise / len, rz * bay / len], up = [-rx * rise / len, bay / len, -rz * rise / len];
      box(onBeam(-span + (j + 0.5) * bay, -0.54), axis, up, f3, len / 2, 0.048, 0.085, steel);
    }
    // 윗보의 중앙에 체크 판을 물리고, 양쪽 날개에 밝은 금속 턱을 잇는다.
    const cell = 0.24, checks = 2 * Math.max(2, Math.min(12, Math.floor(span * 0.36 / cell))), half = checks * cell / 2;
    box(onBeam(0, -0.20), r3, UP, f3, half + 0.06, cell + 0.04, 0.25, socket);
    for (const edge of [-1, 1]) {
      const start = half + 0.06, end = span + 0.18;
      box(onBeam(edge * (start + end) / 2, -0.27), r3, UP, f3, (end - start) / 2, 0.035, 0.245, steel);
    }
    const checkWhite = white.clone().multiplyScalar(1.45);
    for (const side of [-1, 1]) for (let row = 0; row < 2; row++) for (let k = 0; k < checks; k++) {
      const a = -half + k * cell, b = a + cell, y = -0.20 + (row - 1) * cell, w = side * 0.256;
      const col = (row + k) % 2 ? dark : checkWhite;
      pushQuad(onBeam(a, y, w), onBeam(b, y, w), onBeam(b, y + cell, w), onBeam(a, y + cell, w), col);
    }
  }
  // 화살표 판: 꺾인 각 60° 이상 코너의 바깥쪽 경계 뒤, 다가오는 쪽을 보게
  const signs = [];
  for (const c of course.corners || []) {
    if (c.angle < 60) continue;
    const span = wrap(c.to - c.from), outside = c.dir === 'left' ? 'right' : 'left';
    const picks = []; for (let k = 0; k <= span; k += 3) picks.push(wrap(c.from + k));
    for (const i of picks) {
      if (openEdge[outside][i]) continue;   // 난간 없는 곳에는 판을 세울 데가 없다
      const ring = outside === 'right' ? R : L, sgn = outside === 'right' ? 1 : -1, rx = -fz[i] * sgn, rz = fx[i] * sgn;   // 바깥 방향
      const px = ring[i][0] + rx * 1.15, pz = ring[i][1] + rz * 1.15, y = heightAt(px, pz, loc.cum[i]);
      const f3 = [fx[i], 0, fz[i]], u3 = [-fz[i], 0, fx[i]];   // u3 = 진행 방향 오른쪽
      box([px, y + 1.25, pz], u3, UP, f3, 0.62, 0.42, 0.03, blue);
      for (const leg of [-0.45, 0.45]) box([px + u3[0] * leg, y + 0.42, pz + u3[2] * leg], u3, UP, f3, 0.04, 0.42, 0.04, new THREE.Color(COLOURS.post));
      // 흰 갈매기(판 앞면 = 진행 방향 반대쪽). 운전자 눈에 왼쪽 코너면 '<'
      const dirSign = c.dir === 'left' ? -1 : 1, front = -0.035;
      const P = (u, v) => [px + u3[0] * u + fx[i] * front, y + 1.25 + v, pz + u3[2] * u + fz[i] * front];
      for (const k of [-0.22, 0.14]) {
        const tip = k * dirSign + 0.2 * dirSign, back = k * dirSign - 0.02 * dirSign, t = 0.13 * dirSign;
        // 위 팔, 아래 팔(두께 t) — 판을 마주 보는 쪽에서 반시계가 되게 dirSign 으로 순서를 바꾼다
        const up = [P(back, 0.3), P(back + t, 0.3), P(tip + t, 0), P(tip, 0)], dn = [P(tip, 0), P(tip + t, 0), P(back + t, -0.3), P(back, -0.3)];
        for (const q of [up, dn]) dirSign > 0 ? pushQuad(q[0], q[3], q[2], q[1], white) : pushQuad(...q, white);
      }
      signs.push({ index: i, x: px, z: pz });
    }
  }
  {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(props.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(props.col, 3)); g.computeVertexNormals();
    add(g, std({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }), 'track-props', { cast: true }).renderOrder = solidOrder;
  }

  // ---- 벽 · 판정
  const segments = [];
  for (const [ring, kind] of [[L, 'left'], [R, 'right']]) for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; segments.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], kind, index: i }); }
  const walls = createWallIndex(segments, 8);
  // contains(x, z, margin = 0): 통로 안이면 true. margin > 0 이면 경계 밖 margin m 까지도 true(방호벽 자리까지 나무를 비킬 때 1 정도, 5 까지).
  // 통로 칸으로 본다 — 길이 위아래로 겹치는 곳에서도 맞는다(경계 고리의 안팎 홀짝으로 보면 겹친 자리를 놓친다).
  const found = [];
  const contains = (px, pz, margin = 0) => loc.cellsAt(px, pz, Math.min(5, Math.max(0, margin)), found) > 0;
  const st = course.start;
  const startPose = { x: st.x, z: st.z, heading: st.heading, y: heightAt(st.x, st.z, st.s), s: st.s };
  let triangles = 0;
  for (const m of meshes) { const g = m.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3; triangles += m.isInstancedMesh ? t * m.count : t; }
  const stats = { meshes: meshes.length, triangles: Math.round(triangles), barriers: 2 * n, signs: signs.length, wallSegments: segments.length, bends: bends.length };
  return {
    group, walls, contains,
    progress: (px, pz, hint = -1) => loc.progress(px, pz, hint, {}),
    startPose, length, course, stats, bends,
    dispose() {
      for (const m of meshes) { if (m.isInstancedMesh) m.dispose(); m.geometry.dispose(); m.material.dispose(); }
      paintGrain.dispose();
    },
  };
}

// ------------------------------------------------------------------ 랩 판정
// update(prev, cur, time): prev · cur = { x, z } (직전 틱 · 이번 틱 위치), time = 이번 틱 시각(초). 직전 시각은 지난 호출의 time
//   (첫 호출이면 같은 값; 넷째 인자로 직접 줄 수도 있다). 문을 가로지른 순간을 두 틱 사이에서 보간한다.
// 사건: { type: 'gate', index, at, split, start? , invalid?, missed? } · { type: 'lap', lap, time, at, best } · { type: 'wrong-way', at, by: 'gate' | 'reverse' }
// widen(k): k 번 문의 오른쪽 끝을 이만큼(m) 더 늘린다 — 피트레인이 출발선 옆을 지나갈 때 그 길로 지나가도 바퀴를 세게(없으면 0).
export function createLapClock(course, { widen = null } = {}) {
  const loc = createLocator(course), gates = course.gates, G = gates.length;
  // 문마다 앞 방향(왼쪽 → 오른쪽 벡터를 돌린 것)과 양 끝을 0.5 m 늘린 선분
  const gv = gates.map((g, k) => { const ex = g.bx - g.ax, ez = g.bz - g.az, l = hypot(ex, ez), ux = ex / l, uz = ez / l, more = 0.5 + (widen ? Math.max(0, +widen(k) || 0) : 0); return { ax: g.ax - ux * 0.5, az: g.az - uz * 0.5, bx: g.bx + ux * more, bz: g.bz + uz * more, fx: uz, fz: -ux, s: g.s }; });
  const round3 = t => Math.round(t * 1000) / 1000, here = {}, GATE_REACH = 30;   // GATE_REACH: 문에서 이만큼(m, 트랙 거리) 안에 있을 때만 그 문을 본다
  const state = {
    lap: 0, lapTime: 0, bestLap: null, lastLap: null, laps: [], started: false, next: 0, lapStart: 0, wrongWay: false,
    lastTime: null, hint: -1, s: null, back: 0, ahead: 0,
  };
  function cross(p, c, g) {
    // 움직임 p→c 와 문 선분의 교차 → 움직임 위 비율 u(0~1) 와 방향(+1 앞으로, −1 거꾸로), 없으면 null
    const mx = c.x - p.x, mz = c.z - p.z, ex = g.bx - g.ax, ez = g.bz - g.az, den = mx * ez - mz * ex;
    if (Math.abs(den) < 1e-12) return null;
    const wx = g.ax - p.x, wz = g.az - p.z, u = (wx * ez - wz * ex) / den, v = (wx * mz - wz * mx) / den;
    if (u <= 0 || u > 1 || v < 0 || v > 1) return null;
    return { u, dir: mx * g.fx + mz * g.fz > 0 ? 1 : -1 };
  }
  const api = {
    get lap() { return state.lap; }, get lapTime() { return state.lapTime; }, get bestLap() { return state.bestLap; }, get lastLap() { return state.lastLap; },
    get laps() { return state.laps.slice(); }, get started() { return state.started; }, get s() { return state.s; }, get index() { return state.hint; }, get nextGate() { return state.next; }, get wrongWay() { return state.wrongWay; }, gates: G,
    // 카트를 다른 자리로 옮겨 놓았을 때(개발 · 검증): 그 자리의 칸부터 따라가게 한다(길이 겹치는 곳에서 다른 층으로 잡히지 않게)
    locate(index) { state.hint = index; state.s = null; state.back = 0; state.ahead = 0; },
    // 검증 · 다시 계산(src/race/time-trial.js): 안의 값을 그대로 꺼내고 넣는다(동작은 바꾸지 않는다)
    save() { return { ...state, laps: state.laps.slice() }; },
    load(saved) { Object.assign(state, saved, { laps: Array.isArray(saved.laps) ? saved.laps.slice() : [] }); },
    reset() { Object.assign(state, { lap: 0, lapTime: 0, bestLap: state.bestLap, lastLap: null, laps: [], started: false, next: 0, lapStart: 0, wrongWay: false, lastTime: null, hint: -1, s: null, back: 0, ahead: 0 }); },
    update(prev, cur, time, prevTime = state.lastTime ?? time) {
      const events = [];
      // 지금 자리: 직전에 있던 칸부터 찾는다(길이 위아래로 겹치는 곳에서도 제 구간을 따라간다)
      const p = loc.progress(cur.x, cur.z, state.hint, here);
      const hits = [];
      // 문은 그 문이 놓인 구간을 지날 때만 넘은 것으로 친다(겹친 길의 다른 층에서 문 자리 위아래를 지나간 것은 아니다)
      for (let k = 0; k < G; k++) { const h = cross(prev, cur, gv[k]); if (!h) continue; let ds = Math.abs(p.s - gv[k].s); if (ds > loc.length / 2) ds = loc.length - ds; if (ds <= GATE_REACH) hits.push({ k, ...h }); }
      hits.sort((a, b) => a.u - b.u);
      for (const h of hits) {
        const at = prevTime + (time - prevTime) * h.u;
        if (h.dir > 0) {
          if (!state.started) {
            if (h.k === 0) { state.started = true; state.lapStart = at; state.next = 1 % G; events.push({ type: 'gate', index: 0, at: round3(at), split: 0, start: true }); }
            continue;
          }
          if (h.k !== state.next) {
            if (h.k === 0) {   // 문을 빠뜨린 채 출발선 — 그 바퀴는 무효, 여기서 새로 잰다
              const missed = []; for (let k = state.next; k !== 0; k = (k + 1) % G) missed.push(k);
              state.lapStart = at; state.next = 1 % G; events.push({ type: 'gate', index: 0, at: round3(at), split: 0, invalid: true, missed });
            }
            continue;
          }
          if (h.k === 0) {
            const t = round3(at - state.lapStart); state.lap++; state.lastLap = t; state.laps.push(t);
            const best = state.bestLap === null || t < state.bestLap; if (best) state.bestLap = t;
            state.lapStart = at; state.next = 1 % G; events.push({ type: 'lap', lap: state.lap, time: t, at: round3(at), best });
          } else { events.push({ type: 'gate', index: h.k, at: round3(at), split: round3(at - state.lapStart) }); state.next = (h.k + 1) % G; }
        } else {
          // 거꾸로 문을 넘었다: 바로 앞에 넘은 문이면 되돌린다
          const prevGate = (state.next - 1 + G) % G;
          if (state.started && h.k === prevGate) { if (h.k === 0) state.started = false; else state.next = h.k; }
          if (!state.wrongWay) { state.wrongWay = true; state.back = 0; events.push({ type: 'wrong-way', at: round3(at), by: 'gate' }); }
        }
      }
      // 역주행: 중심선 위치가 6 m 넘게 줄면 알리고, 3 m 앞으로 가면 풀린다
      if (state.s !== null && state.hint >= 0) {
        let ds = p.s - state.s; if (ds > loc.length / 2) ds -= loc.length; if (ds < -loc.length / 2) ds += loc.length;
        if (ds < 0) { state.back += -ds; state.ahead = 0; } else if (ds > 0) { state.ahead += ds; state.back = Math.max(0, state.back - ds); if (state.ahead > 3) { state.back = 0; state.wrongWay = false; } }
        if (state.back > 6 && !state.wrongWay) { state.wrongWay = true; events.push({ type: 'wrong-way', at: round3(time), by: 'reverse' }); }
      }
      state.s = p.s; state.hint = p.index;
      state.lastTime = time;
      state.lapTime = state.started ? time - state.lapStart : 0;
      return events;
    },
  };
  return api;
}
