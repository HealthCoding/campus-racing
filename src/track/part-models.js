// 코스 부품의 모양 — 공중 구간(고가 다리) · 점프대 · 부스트 발판. THREE 는 인자로 받는다(import 하지 않음, track.js 와 같은 방식).
//   const models = createPartModels(THREE, { parts, groundAt, surfaceAt });  scene.add(models.group);
//   매 화면: models.update(dt, time);   끝: models.dispose();
//   parts      createParts(course, data) 의 결과(src/track/parts.js). 자리 · 높이는 전부 여기서 읽는다(값을 박아 넣지 않는다).
//   groundAt   지형 높이(m) — 기둥 · 옹벽 발이 닿는 곳
//   surfaceAt  노면이 깔리는 높이 = 지형 + 공중 구간이 들어 올린 높이(점프대 제외). 아스팔트는 이 높이 + LIFT.road(0.13)
// 그리기 호출 3개: 다리(정점 색) · 점프대(정점 색, 노면보다 앞에 그리게 polygonOffset) · 발판(흐르는 빛 무늬 — 셰이더를 조금 고친 MeshStandardMaterial).
// 단면 좌표: lat = 중심선에서 진행 방향 오른쪽(+, m). 다리 구조는 통로 경계에서 바깥으로 u(m)만큼 — 방호벽이 0.01~0.61 을 차지하고 건물 벽이 1 m 밖이라 0.62 까지만 쓴다.
// 다리 구조의 높이는 groundAt(x, z) + parts.deckLift(s) 로 잰다(통로 밖 점을 surfaceAt 에 물으면 옆 구간으로 잘못 찾을 수 있어서). 값은 surfaceAt 과 같다.

export const PART_LOOK = {
  road: 0.13,            // 아스팔트가 노면 위로 뜬 높이(track.js LIFT.road 와 같게)
  bridge: {
    step: 2,             // 단면을 놓는 간격(m)
    edge: 0.62,          // 상판 바깥면: 통로 경계에서 바깥으로(m)
    top: 0.10,           // 상판 윗면(노면 기준, 아스팔트 밑 · 방호벽 발 위)
    band: -0.04,         // 파랑 띠 아래 끝
    slab: -0.55,         // 상판 밑면
    girderOut: 0.45, girderIn: -0.35, girderBottom: -1.35,   // 거더(양옆): 바깥면 · 안쪽면(경계 기준) · 밑면(노면 기준)
    open: 2.6,           // 들어 올린 높이가 이만큼이 되는 곳부터 밑이 트인다(그 앞은 옹벽으로 막힌 오르막)
    span: 17,            // 기둥 간격 목표(m)
    rib: 6,              // 상판 밑 가로 보 간격(m)
    panel: 4,            // 옹벽 판 이음 간격(m)
    column: 0.42,        // 기둥 반지름
  },
  ramp: { inset: 0.05, lift: 0.005, trim: 0.16, lip: 0.75, panelLip: 0.68, chevron: { slope: 0.5, width: 0.6, period: 1.7, first: 0.9 } },
  pad: { lift: 0.022, flow: 2.2, period: 1.7, slope: 1.25 },
};
const C = { white: 0xe9edf2, blue: 0x3567b5, navy: 0x1d3466, dark: 0x1b1d21, post: 0xdfe4ea, concrete: 0xc7ccd3, concrete2: 0xbec4cc, soffit: 0xb7b9ba, rail: 0xa6afb2, steel: 0x50616b, flange: 0x71818a, bearing: 0x333e46, amber: 0xf0b949, tread: 0x516278, joint: 0x8d949e, deck: 0x2a2e35, padBase: 0x203a70 };

export function createPartModels(THREE, { parts, groundAt = () => 0, surfaceAt = null, reducedMotion, rampMark, boostPad } = {}) {
  const L = PART_LOOK, B = L.bridge;
  // 기본은 전폭 갈매기 점프대와 발광 갈매기 발판. 두 부품의 1차 시안은 따로 고른다.
  const query = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
  rampMark ??= query?.get('rampMark');
  const panelRamp = rampMark === 'line' || rampMark === 'chevron';
  const lensPad = (boostPad ?? query?.get('boostPad')) === 'lens';
  // surfaceAt(x, z, s): s = 그 점이 속한 자리의 트랙 거리(길이 위아래로 겹치는 곳에서 제 층의 높이를 받는다)
  surfaceAt ||= (x, z, s) => groundAt(x, z) + (s === undefined ? (parts.deckAt ? parts.deckAt(x, z) : 0) : parts.surfaceLift ? parts.surfaceLift(x, z, s) : parts.deckLift(s));
  const col = {}; for (const k in C) col[k] = new THREE.Color(C[k]);
  const group = new THREE.Group(); group.name = 'track-parts';
  // 불투명한 다리·쐐기·발판이 먼저 깊이를 채워 가려진 건물과 노면의 조명 계산을 줄인다.
  group.renderOrder = -1;
  const meshes = [];

  // ── 트랙 틀: s 에서 중심 · 앞 · 오른쪽 · 반폭
  function frame(s) {
    const p = parts.pointAt(s, 0), fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    return { x: p.x, z: p.z, fx, fz, rx: -fz, rz: fx, left: p.left, right: p.right };
  }
  const at = (f, lat) => [f.x + f.rx * lat, f.z + f.rz * lat];

  // ── 삼각형 쌓기(정점 색 · 법선). hint 를 주면 그쪽을 보게 감김을 맞춘다.
  function builder({ indexed = false, panelCoords = false } = {}) {
    const pos = [], nor = [], cols = [], panel = panelCoords ? [] : null;
    const vertices = indexed ? new Map() : null, indices = [];
    const colourIds = indexed ? new Map(Object.values(col).map((c, i) => [c, i])) : null;
    function vertex(p, nx, ny, nz, colour) {
      if (panel) {
        panel.push(p[3] ?? 0, p[4] ?? -1, p[5] ?? -1);
      } else if (indexed) {
        // 다리의 날·이음은 법선이나 재료가 다르면 나눈다. 같은 위치·법선·색만 공유한다.
        nx = Math.round(nx * 32767); ny = Math.round(ny * 32767); nz = Math.round(nz * 32767);
        const key = [Math.fround(p[0]), Math.fround(p[1]), Math.fround(p[2]), nx, ny, nz, colourIds.get(colour)].join(',');
        const old = vertices.get(key);
        if (old !== undefined) { indices.push(old); return; }
        const next = pos.length / 3; vertices.set(key, next); indices.push(next);
      }
      pos.push(p[0], p[1], p[2]); nor.push(nx, ny, nz); cols.push(colour.r, colour.g, colour.b);
    }
    function tri(a, b, c, colour, hint) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return;
      nx /= l; ny /= l; nz /= l;
      if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
      for (const p of [a, b, c]) vertex(p, nx, ny, nz, colour);
    }
    const quad = (a, b, c, d, colour, hint) => { tri(a, b, c, colour, hint); tri(a, c, d, colour, hint); };
    const poly = (ps, colour, hint) => { for (let i = 1; i < ps.length - 1; i++) tri(ps[0], ps[i], ps[i + 1], colour, hint); };
    // 법선을 정점마다 직접(둥근 기둥)
    function triN(a, b, c, na, nb, nc, colour) { for (const [p, n] of [[a, na], [b, nb], [c, nc]]) vertex(p, n[0], n[1], n[2], colour); }
    const count = () => indexed ? indices.length / 3 : pos.length / 9;
    function geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', indexed ? new THREE.Int16BufferAttribute(nor, 3, true) : new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      if (panel) g.setAttribute('aRampPanel', new THREE.Float32BufferAttribute(panel, 3));
      if (indexed) g.setIndex(indices);
      g.computeBoundingSphere(); g.computeBoundingBox(); return g;
    }
    return { tri, quad, poly, triN, count, geometry };
  }

  // ── 2D 볼록 다각형 자르기(무늬를 정확한 모양으로 만들려고): a·p + b·q ≥ c 쪽만 남긴다
  function clip(polyg, a, b, c, keepAbove) {
    const out = [], n = polyg.length; if (!n) return out;
    const f = p => (a * p[0] + b * p[1] - c) * (keepAbove ? 1 : -1);
    for (let i = 0; i < n; i++) {
      const P = polyg[i], Q = polyg[(i + 1) % n], fp = f(P), fq = f(Q);
      if (fp >= 0) out.push(P);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
    return out.length >= 3 ? out : [];
  }
  // 다각형들을 평행선 묶음(a·p + b·q = c, c ∈ cs)으로 나눈다
  function split(polys, a, b, cs, when = null) {
    const out = [];
    for (const pg of polys) {
      if (when && !when(centroid(pg))) { out.push(pg); continue; }
      const vals = pg.map(p => a * p[0] + b * p[1]), lo = Math.min(...vals), hi = Math.max(...vals);
      let rest = pg;
      for (const c of cs) { if (c <= lo + 1e-6 || c >= hi - 1e-6 || !rest.length) continue; const below = clip(rest, a, b, c, false); if (below.length) out.push(below); rest = clip(rest, a, b, c, true); }
      if (rest.length) out.push(rest);
    }
    return out;
  }
  const centroid = pg => { let p = 0, q = 0; for (const v of pg) { p += v[0]; q += v[1]; } return [p / pg.length, q / pg.length]; };
  const grid = (ps, qs) => { const out = []; for (let i = 0; i < ps.length - 1; i++) for (let j = 0; j < qs.length - 1; j++) out.push([[ps[i], qs[j]], [ps[i + 1], qs[j]], [ps[i + 1], qs[j + 1]], [ps[i], qs[j + 1]]]); return out; };
  const steps = (from, to, max) => { const n = Math.max(1, Math.ceil((to - from) / max - 1e-9)), out = []; for (let i = 0; i <= n; i++) out.push(from + (to - from) * i / n); return out; };

  // ================================================================ 1. 공중 구간
  const bridgeB = builder({ indexed: true });
  for (const br of parts.bridges || []) buildBridge(bridgeB, br);
  function buildBridge(G, br) {
    // 판 윗면의 높이(바닥 기준): 공중 구간 + 기운 코너(옆 자리 lat — 오른쪽 +). 기운 코너가 없으면 lat 은 안 본다.
    const deck = (s, lat = 0) => parts.deckLift(s) + (parts.bankLift ? parts.bankLift(s, lat) : 0);
    // 밑이 트이는 구간 [sA, sB]
    let sA = null, sB = null;
    for (let s = br.from; s <= br.to; s += 0.25) if (deck(s) >= B.open) { sA = s; break; }
    for (let s = br.to; s >= br.from; s -= 0.25) if (deck(s) >= B.open) { sB = s; break; }
    const open = sA !== null && sB - sA > 4;
    const list = new Set(steps(br.from, br.to, B.step)); if (open) { list.add(sA); list.add(sB); }
    const ss = [...list].sort((a, b) => a - b);
    // 단면 한 점: 옆(side −1 왼쪽 · +1 오른쪽), 경계에서 바깥으로 u, 노면 기준 높이 dy(또는 바닥 기준 ground: true)
    const F = new Map(); const fr = s => { let f = F.get(s); if (!f) F.set(s, f = frame(s)); return f; };
    const half = (f, side) => side < 0 ? f.left : f.right;
    const latOf = (f, side, u) => side * (half(f, side) + u);
    const P = (s, side, u, dy, fromGround = false) => {
      const f = fr(s), lat = latOf(f, side, u), [x, z] = at(f, lat), g = groundAt(x, z);
      return [x, fromGround ? g + dy : Math.max(g - 0.3, g + deck(s, lat) + dy), z];
    };
    const out = (s, side) => { const f = fr(s); return [f.rx * side, 0, f.rz * side]; };
    const inward = (s, side) => { const o = out(s, side); return [-o[0], 0, -o[2]]; };
    const UPV = [0, 1, 0], DOWN = [0, -1, 0];
    const inOpen = (s0, s1) => open && s0 >= sA - 1e-6 && s1 <= sB + 1e-6;

    for (let k = 0; k < ss.length - 1; k++) {
      const s0 = ss[k], s1 = ss[k + 1], openHere = inOpen(s0, s1);
      for (const side of [-1, 1]) {
        const o = out((s0 + s1) / 2, side);
        // 상판 윗면(방호벽 밑): 경계 안쪽 0.05 ~ 바깥면
        G.quad(P(s0, side, -0.05, B.top), P(s1, side, -0.05, B.top), P(s1, side, B.edge, B.top), P(s0, side, B.edge, B.top), col.deck, UPV);
        // 바깥면: 파랑 띠 · 흰 판
        G.quad(P(s0, side, B.edge, B.top), P(s1, side, B.edge, B.top), P(s1, side, B.edge, B.band), P(s0, side, B.edge, B.band), col.blue, o);
        G.quad(P(s0, side, B.edge, B.band), P(s1, side, B.edge, B.band), P(s1, side, B.edge, B.slab), P(s0, side, B.edge, B.slab), col.white, o);
        if (openHere) {
          // 상판 밑 턱 → 거더 바깥면 · 밑면 · 안쪽면
          G.quad(P(s0, side, B.edge, B.slab), P(s1, side, B.edge, B.slab), P(s1, side, B.girderOut, B.slab), P(s0, side, B.girderOut, B.slab), col.soffit, DOWN);
          G.quad(P(s0, side, B.girderOut, B.slab), P(s1, side, B.girderOut, B.slab), P(s1, side, B.girderOut - 0.13, B.girderBottom + 0.15), P(s0, side, B.girderOut - 0.13, B.girderBottom + 0.15), col.steel, o);
          // 바깥으로 벌어진 하부 플랜지의 턱은 측광을 받는다.
          G.quad(P(s0, side, B.girderOut - 0.13, B.girderBottom + 0.15), P(s1, side, B.girderOut - 0.13, B.girderBottom + 0.15), P(s1, side, B.girderOut, B.girderBottom), P(s0, side, B.girderOut, B.girderBottom), col.flange, o);
          G.quad(P(s0, side, B.girderOut, B.girderBottom), P(s1, side, B.girderOut, B.girderBottom), P(s1, side, B.girderIn, B.girderBottom), P(s0, side, B.girderIn, B.girderBottom), col.steel, DOWN);
          G.quad(P(s0, side, B.girderIn, B.girderBottom), P(s1, side, B.girderIn, B.girderBottom), P(s1, side, B.girderIn, B.slab), P(s0, side, B.girderIn, B.slab), col.steel, inward((s0 + s1) / 2, side));
        } else {
          // 옹벽: 흰 판 밑에서 땅까지(판 두 색을 번갈아, 밑동은 짙게)
          const panel = Math.floor(((s0 + s1) / 2 - br.from) / B.panel) % 2 ? col.concrete2 : col.concrete;
          const a0 = P(s0, side, B.edge, B.slab), a1 = P(s1, side, B.edge, B.slab);
          const g0 = P(s0, side, B.edge, 0, true), g1 = P(s1, side, B.edge, 0, true);
          const plinth = 0.28, b0 = [g0[0], Math.min(a0[1], g0[1] + plinth), g0[2]], b1 = [g1[0], Math.min(a1[1], g1[1] + plinth), g1[2]];
          if (a0[1] > b0[1] + 1e-3 || a1[1] > b1[1] + 1e-3) G.quad(a0, a1, b1, b0, panel, o);
          const d0 = [g0[0], g0[1] - 0.3, g0[2]], d1 = [g1[0], g1[1] - 0.3, g1[2]];
          G.quad(b0, b1, d1, d0, col.dark, o);
        }
      }
      if (openHere) {
        // 상판 밑면(두 거더 사이)
        G.quad(P(s0, -1, B.girderIn, B.slab), P(s1, -1, B.girderIn, B.slab), P(s1, 1, B.girderIn, B.slab), P(s0, 1, B.girderIn, B.slab), col.soffit, DOWN);
      }
    }

    // 옹벽 판 이음(바깥으로 1 cm 띄운 짙은 줄)
    for (const [a, b] of open ? [[br.from, sA], [sB, br.to]] : [[br.from, br.to]]) {
      for (let s = a + B.panel; s < b - 0.5; s += B.panel) for (const side of [-1, 1]) {
        const w = 0.05, t0 = P(s - w, side, B.edge + 0.012, B.slab), t1 = P(s + w, side, B.edge + 0.012, B.slab);
        const g0 = P(s - w, side, B.edge + 0.012, 0.28, true), g1 = P(s + w, side, B.edge + 0.012, 0.28, true);
        if (t0[1] - g0[1] > 0.05) G.quad(t0, t1, g1, g0, col.joint, out(s, side));
      }
    }

    // 양 끝(높이 0): 낮은 턱의 마구리
    for (const [s, dir] of [[br.from, -1], [br.to, 1]]) for (const side of [-1, 1]) {
      const f = fr(s), hint = [f.fx * dir, 0, f.fz * dir];
      G.quad(P(s, side, -0.05, B.top), P(s, side, B.edge, B.top), P(s, side, B.edge, 0, true), P(s, side, -0.05, 0, true), col.blue, hint);
      const lo = P(s, side, B.edge, -0.3, true); G.quad(P(s, side, -0.05, 0, true), P(s, side, B.edge, 0, true), lo, P(s, side, -0.05, -0.3, true), col.dark, hint);
    }

    if (!open) return;
    // 콘크리트 방호벽 위 손스침. 난간 없는 구간은 정확히 끊고, 양 끝을 벽 윗면으로 접는다.
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? 'left' : 'right';
      const cuts = [sA, sB];
      for (const gap of parts.opens || []) {
        if (gap.side !== 'both' && gap.side !== sideName) continue;
        if (gap.from > sA && gap.from < sB) cuts.push(gap.from);
        if (gap.to > sA && gap.to < sB) cuts.push(gap.to);
      }
      cuts.sort((a, b) => a - b);
      for (let k = 1; k < cuts.length; k++) {
        const a = cuts[k - 1] + 0.55, b = cuts[k] - 0.55;
        if (b - a < 2 || parts.openAt?.((a + b) / 2, sideName)) continue;
        const posts = steps(a, b, 4);
        const section = (s, height) => [[0.26, height - 0.10], [0.26, height], [0.42, height], [0.42, height - 0.10]].map(([u, dy]) => P(s, side, u, dy));
        const ring = posts.map((s, i) => section(s, i === 0 || i === posts.length - 1 ? 0.82 : 1.19));
        for (let i = 1; i < posts.length; i++) {
          const s = posts[i], last = ring[i - 1], next = ring[i], n = out(s, side);
          const hints = [[-n[0], 0, -n[2]], UPV, n, DOWN];
          for (let edge = 0; edge < 4; edge++) {
            const j = (edge + 1) % 4;
            G.quad(last[edge], last[j], next[j], next[edge], edge === 1 ? col.rail : col.steel, hints[edge]);
          }
          if (i === posts.length - 1) continue;
          const f = fr(s);
          const foot = sideU => P(s, side, sideU, 0.72);
          const head = sideU => P(s, side, sideU, 1.09);
          // 직사각 기둥의 네 옆면. 위아래 마구리는 벽과 손스침에 들어간다.
          const levels = [foot, head].map(point => [[0.30, -0.06], [0.38, -0.06], [0.38, 0.06], [0.30, 0.06]].map(([u, d]) => {
            const p = point(u);
            return [p[0] + d * f.fx, p[1], p[2] + d * f.fz];
          }));
          const directions = [[-f.fx, 0, -f.fz], n, [f.fx, 0, f.fz], hints[0]];
          for (let j = 0; j < 4; j++) {
            const q = (j + 1) % 4;
            G.quad(levels[0][j], levels[0][q], levels[1][q], levels[1][j], col.steel, directions[j]);
          }
        }
      }
    }

    // 교대(옹벽이 끝나고 밑이 트이는 곳의 벽): 바깥면에서 바깥면까지, 땅에서 상판 밑까지
    for (const [s, dir] of [[sA, 1], [sB, -1]]) {
      const f = fr(s), hint = [f.fx * dir, 0, f.fz * dir], W0 = -(f.left + B.edge), W1 = f.right + B.edge;
      const lats = steps(W0, W1, 1.5);
      const pt = (lat, top) => { const [x, z] = at(f, lat), g = groundAt(x, z); return top === 'slab' ? [x, g + deck(s, lat) + B.slab, z] : [x, g + top, z]; };
      for (let i = 0; i < lats.length - 1; i++) {
        const a = lats[i], b = lats[i + 1];
        G.quad(pt(a, 'slab'), pt(b, 'slab'), pt(b, 0.28), pt(a, 0.28), col.concrete, hint);
        G.quad(pt(a, 0.28), pt(b, 0.28), pt(b, -0.3), pt(a, -0.3), col.dark, hint);
        // 받침 턱(거더가 얹히는 짙은 띠)
        const ledge = (lat, dy) => { const [x, z] = at(f, lat), g = groundAt(x, z); return [x + f.fx * dir * 0.02, g + deck(s, lat) + dy, z + f.fz * dir * 0.02]; };
        G.quad(ledge(a, B.girderBottom), ledge(b, B.girderBottom), ledge(b, B.girderBottom - 0.35), ledge(a, B.girderBottom - 0.35), col.navy, hint);
      }
    }

    // 상판 밑 가로 보(두 거더 사이)
    const ribs = Math.max(1, Math.round((sB - sA) / B.rib));
    for (let r = 1; r < ribs; r++) {
      const s = sA + (sB - sA) * r / ribs, w = 0.15, depth = -1.0;
      const fA = fr(s - w), fB = fr(s + w);
      const pt = (f, ss, side, dy) => { const lat = latOf(f, side, B.girderIn), [x, z] = at(f, lat), g = groundAt(x, z); return [x, g + deck(ss, lat) + dy, z]; };
      const a0 = pt(fA, s - w, -1, B.slab), a1 = pt(fA, s - w, 1, B.slab), a2 = pt(fA, s - w, 1, depth), a3 = pt(fA, s - w, -1, depth);
      const b0 = pt(fB, s + w, -1, B.slab), b1 = pt(fB, s + w, 1, B.slab), b2 = pt(fB, s + w, 1, depth), b3 = pt(fB, s + w, -1, depth);
      G.quad(a0, a1, a2, a3, col.steel, [-fA.fx, 0, -fA.fz]);
      G.quad(b0, b1, b2, b3, col.steel, [fB.fx, 0, fB.fz]);
      const flare = (p, f, dir) => [p[0] + f.fx * dir * 0.085, p[1] - 0.075, p[2] + f.fz * dir * 0.085];
      const af = [a3, a2].map(p => flare(p, fA, -1)), bf = [b3, b2].map(p => flare(p, fB, 1));
      G.quad(a3, a2, af[1], af[0], col.rail, [-fA.fx, 0, -fA.fz]);
      G.quad(b3, b2, bf[1], bf[0], col.rail, [fB.fx, 0, fB.fz]);
      G.quad(af[0], af[1], bf[1], bf[0], col.flange, DOWN);
      // 가로 보에서 측면 거더로 힘이 넘어가는 자리의 보강판.
      for (const side of [-1, 1]) {
        const stiffener = d => [P(s+d, side, B.girderOut, B.slab), P(s+d, side, B.girderOut+0.10, B.slab),
          P(s+d, side, B.girderOut+0.06, B.girderBottom+0.14), P(s+d, side, B.girderOut-0.13, B.girderBottom+0.14)];
        const fore = stiffener(-0.055), aft = stiffener(0.055);
        G.poly(fore, col.steel, [-fA.fx, 0, -fA.fz]);
        G.poly(aft, col.steel, [fB.fx, 0, fB.fz]);
        G.quad(fore[1], aft[1], aft[2], fore[2], col.flange, out(s, side));
      }
    }

    // 기둥: 일정 간격으로, 거더 밑마다 하나씩 + 머리 보(가로) + 발 받침
    // 다리 밑으로 다른 구간의 길이 지나가면(길이 위아래로 겹치는 곳) 그 통로와 방호벽 자리(둘레 keep m)에는 기둥을 세우지 않는다:
    // 그 자리를 벗어날 때까지 앞뒤로 옮기고, 옮긴 자리가 이웃 기둥과 붙으면 뺀다.
    const keep = 1.6, blocked = s => { if (!parts.othersAt) return false; const f = fr(s); for (const side of [-1, 0, 1]) { const [x, z] = at(f, side ? latOf(f, side, 0.05) : 0); if (parts.othersAt(x, z, s, keep).length) return true; } return false; };
    const spans = Math.max(1, Math.round((sB - sA) / B.span)), stations = [];
    for (let k = 1; k < spans; k++) {
      let s = sA + (sB - sA) * k / spans;
      if (blocked(s)) { let moved = null; for (let d = 1; d <= 14 && moved === null; d += 0.5) for (const q of [s - d, s + d]) if (q > sA + 2 && q < sB - 2 && !blocked(q)) { moved = q; break; } if (moved === null) continue; s = moved; }
      if (stations.every(q => Math.abs(q - s) > 5)) stations.push(s);
    }
    // 건너는 곳의 양옆에는 꼭 하나씩 선다(위에서 한쪽으로만 옮겨졌을 수 있다)
    for (let q = sA + 2; q < sB - 2; q += 0.5) if (blocked(q) !== blocked(q + 0.5)) { const s = blocked(q) ? q + 0.5 : q; if (stations.every(k => Math.abs(k - s) > 5)) stations.push(s); }
    for (const s of stations.sort((a, b) => a - b)) {
      const f = fr(s), dep = 0.62, capTop = B.girderBottom - 0.15, capBottom = capTop - 0.47;
      // 머리 보: 바깥 0.5 까지
      const cap = (ds, side, dy) => { const ff = fr(s + ds), lat = latOf(ff, side, 0.5), [x, z] = at(ff, lat), g = groundAt(x, z); return [x, g + deck(s + ds, lat) + dy, z]; };
      const c = [[-dep, -1], [dep, -1], [dep, 1], [-dep, 1]];
      const top = c.map(([d, sd]) => cap(d, sd, capTop)), bot = c.map(([d, sd]) => cap(d, sd, capBottom));
      G.poly(top, col.concrete, UPV);
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; const mid = [(top[i][0] + top[j][0]) / 2 - f.x, 0, (top[i][2] + top[j][2]) / 2 - f.z]; G.quad(top[i], top[j], bot[j], bot[i], col.concrete, mid); }
      G.poly(bot, col.concrete2, DOWN);
      for (const side of [-1, 1]) {
        // 머리 보와 철제 거더 사이에 눌린 받침. 안팎 면이 서로 겹치지 않는다.
        const padCorners = [[-0.37, -0.28], [0.37, -0.28], [0.37, 0.33], [-0.37, 0.33]];
        const bearing = dy => padCorners.map(([ds, u]) => P(s + ds, side, u, dy));
        const hi = bearing(B.girderBottom), lo = bearing(capTop);
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4, hint = i % 2 ? [f.fx * (i === 1 ? 1 : -1), 0, f.fz * (i === 1 ? 1 : -1)] : (i ? out(s, side) : inward(s, side));
          G.quad(hi[i], hi[j], lo[j], lo[i], col.bearing, hint);
        }
        // 안쪽으로 벌어지는 헌치가 교각의 가느다란 목과 머리 보를 잇는다.
        const cheek = d => [[0.025, 0.015], [-1.20, 0.015], [0.025, -0.66]].map(([u, y]) => P(s + d, side, u, capBottom + y));
        const near = cheek(-0.37), far = cheek(0.37);
        G.poly(near, col.concrete2, [-f.fx, 0, -f.fz]);
        G.poly(far, col.concrete2, [f.fx, 0, f.fz]);
        G.quad(near[1], near[2], far[2], far[1], col.concrete2, DOWN);
        const cLat = latOf(f, side, 0.05), [cx, cz] = at(f, cLat), g = groundAt(cx, cz), yTop = g + deck(s, cLat) + capBottom, yBot = g - 0.3, R = B.column, N = 10;
        if (yTop - yBot < 0.5) continue;
        for (let i = 0; i < N; i++) {
          const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
          const p00 = [cx + n0[0] * R, yTop, cz + n0[2] * R], p10 = [cx + n1[0] * R, yTop, cz + n1[2] * R], p01 = [cx + n0[0] * R, yBot, cz + n0[2] * R], p11 = [cx + n1[0] * R, yBot, cz + n1[2] * R];
          // 바깥을 보게: 위에서 볼 때 반시계(각이 커지는 쪽)
          G.triN(p00, p11, p01, n0, n1, n0, col.post); G.triN(p00, p10, p11, n0, n1, n1, col.post);
        }
        // 발 받침(네모, 짙은 색)
        const h = 0.5, fy = g + 0.25, fb = g - 0.3, e = (a, b) => [cx + f.rx * a + f.fx * b, 0, cz + f.rz * a + f.fz * b];
        const corners = [e(-h, -h), e(h, -h), e(h, h), e(-h, h)];
        for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, A = corners[i], Bq = corners[j]; G.quad([A[0], fy, A[2]], [Bq[0], fy, Bq[2]], [Bq[0], fb, Bq[2]], [A[0], fb, A[2]], col.dark, [(A[0] + Bq[0]) / 2 - cx, 0, (A[2] + Bq[2]) / 2 - cz]); }
        G.poly(corners.map(p => [p[0], fy, p[2]]), col.concrete2, UPV);
      }
    }
  }

  // ================================================================ 2. 점프대
  const rampB = builder({ panelCoords: panelRamp }), rampTop = [];
  for (const r of parts.ramps || []) buildRamp(rampB, r);
  function buildRamp(G, r) {
    const R = L.ramp, len = r.length, H = r.height, mid = frame(r.at + len / 2);
    const Wl = mid.left - R.inset, Wr = mid.right - R.inset;
    const F = new Map(); const fr = s => { const k = Math.round(s * 1000); let f = F.get(k); if (!f) F.set(k, f = frame(s)); return f; };
    // 무늬 좌표 (a = 점프대 앞에서 잰 거리, w = 옆, 왼쪽 −Wl … 오른쪽 Wr) → 실제 자리
    const place = (a, w) => { const s = r.at + Math.min(len, Math.max(0, a)), f = fr(s), lat = w < 0 ? w * (f.left - R.inset) / Wl : w * (f.right - R.inset) / Wr; return { f, s, xz: at(f, lat) }; };
    const sOf = a => r.at + Math.min(len, Math.max(0, a));
    const topY = (a, xz) => surfaceAt(xz[0], xz[1], sOf(a)) + L.road + R.lift + H * Math.min(1, Math.max(0, a / len));
    // 밑동: 끝(at + length)의 노면 — 다만 그 자리(s)의 노면이 더 높으면 그것(내리막 다리 위의 점프대 — 코스 D 665 m — 의 옆면이 판 밑으로 빠지지 않게).
    //   땅 위 · 오르막(코스 B 숲 둔덕)의 점프대는 그 전과 똑같다.
    const baseY = (xz, s = r.at + len) => Math.max(surfaceAt(xz[0], xz[1], r.at + len), surfaceAt(xz[0], xz[1], s)) + 0.02;
    const multiples = (lo, hi, step) => { const out = []; for (let k = Math.floor(lo / step); k <= Math.ceil(hi / step); k++) out.push(k * step); return out; };

    function drawTop(pieces, top3, colourAt) {
      const first = G.count();
      for (const pg of pieces) { const c = centroid(pg); G.poly(pg.map(([a, w]) => top3(a, w)), colourAt(c[0], c[1]), [0, 1, 0]); }
      rampTop.push({ ramp: r, from: first, to: G.count() });
    }

    function drawSides(joints) {
      const sideColour = (a0, a1) => {
        if (!panelRamp) return col.blue;
        const mid = (a0 + a1) / 2;
        return joints.some(a => mid >= a && mid <= a + 0.065) ? col.flange : col.steel;
      };
      const sideRows = [...new Set([...steps(0, len, 0.5), ...joints.flatMap(a => [a, a + 0.065])])].sort((a, b) => a - b);
      for (const [w, sgn] of [[-Wl, -1], [Wr, 1]]) for (let k = 0; k < sideRows.length - 1; k++) {
        const a0 = sideRows[k], a1 = sideRows[k + 1], p0 = place(a0, w), p1 = place(a1, w), o = [p0.f.rx * sgn, 0, p0.f.rz * sgn];
        const t0 = topY(a0, p0.xz), t1 = topY(a1, p1.xz), b0 = baseY(p0.xz, p0.s), b1 = baseY(p1.xz, p1.s), m0 = Math.max(b0, t0 - 0.07), m1 = Math.max(b1, t1 - 0.07);
        const v = (p, y) => [p.xz[0], y, p.xz[1]];
        G.quad(v(p0, t0), v(p1, t1), v(p1, m1), v(p0, m0), col.white, o);
        const n0 = Math.min(m0, b0 + 0.12), n1 = Math.min(m1, b1 + 0.12);   // 남색 밑동의 윗선
        if (m0 > n0 + 1e-4 || m1 > n1 + 1e-4) G.quad(v(p0, m0), v(p1, m1), v(p1, n1), v(p0, n0), sideColour(a0, a1), o);
        if (n0 > b0 + 1e-4 || n1 > b1 + 1e-4) G.quad(v(p0, n0), v(p1, n1), v(p1, b1), v(p0, b0), col.navy, o);
      }
    }

    if (!panelRamp) {
      const top3 = (a, w) => { const { xz } = place(a, w); return [xz[0], topY(a, xz), xz[1]]; };

      // ── 윗면: 파랑 바탕 + 흰 갈매기(앞을 가리킴) + 양옆 흰 테 + 끝단 경고 줄(흰 · 남색 빗금)
      const ch = R.chevron, lipA = len - R.lip, cs = [];
      for (let c = ch.first; c + ch.width <= lipA - 0.15 + 1e-9; c += ch.period) cs.push(c);
      const chevronEdges = cs.flatMap(c => [c, c + ch.width]);
      const lipEdges = multiples(lipA - 0.8 * Wl, len + 0.8 * Wr, 0.55);   // 빗금 경계: a + 0.8 w = 0.55 의 배수
      const colourAt = (a, w) => {
        if (w < -Wl + R.trim || w > Wr - R.trim) return col.white;
        if (a > lipA) return Math.floor((a + 0.8 * w) / 0.55 + 1000) % 2 ? col.navy : col.white;
        const d = a + ch.slope * Math.abs(w);
        for (const c of cs) if (d >= c && d <= c + ch.width) return col.white;
        return col.blue;
      };
      const rows = [...new Set([...steps(0, lipA, 0.5), ...steps(lipA, len, 0.4)])].sort((p, q) => p - q);
      const colsW = [...new Set([...steps(-Wl, -Wl + R.trim, 1), ...steps(-Wl + R.trim, 0, 1.2), ...steps(0, Wr - R.trim, 1.2), ...steps(Wr - R.trim, Wr, 1)])].sort((p, q) => p - q);
      let pieces = grid(rows, colsW);
      const body = c => c[1] > -Wl + R.trim && c[1] < Wr - R.trim;
      pieces = split(pieces, 1, ch.slope, chevronEdges, c => c[0] < lipA && c[1] > 0 && body(c));
      pieces = split(pieces, 1, -ch.slope, chevronEdges, c => c[0] < lipA && c[1] < 0 && body(c));
      pieces = split(pieces, 1, 0.8, lipEdges, c => c[0] > lipA && body(c));
      drawTop(pieces, top3, colourAt);

      drawSides([]);
      // ── 뒷면(끊긴 쪽): 남색 · 흰 빗금, 위 끝 흰 줄
      const f = fr(r.at + len), hint = [f.fx, 0, f.fz];
      const backCols = [...new Set([...steps(-Wl, 0, 1.2), ...steps(0, Wr, 1.2)])].sort((p, q) => p - q);
      let back = grid(backCols, [0, 0.9, 1]);
      back = split(back, 1, 1.1 * H, multiples(-Wl, Wr + 1.1 * H, 0.45), c => c[1] < 0.9);
      const pt = (w, q) => { const p = place(len, w), b = baseY(p.xz), t = topY(len, p.xz); return [p.xz[0], b + (t - b) * q, p.xz[1]]; };
      for (const pg of back) { const c = centroid(pg); G.poly(pg.map(([w, q]) => pt(w, q)), c[1] > 0.9 ? col.white : (Math.floor((c[0] + 1.1 * H * c[1]) / 0.45 + 1000) % 2 ? col.navy : col.white), hint); }
      return;
    }

    const top3 = (a, w) => { const { xz } = place(a, w); return [xz[0], topY(a, xz), xz[1], w, a, Math.min(Math.abs(w) - arrowHalf, w + Wl - R.trim, Wr - w - R.trim)]; };

    // 가운데는 남색 진입판, 바깥은 회청색 접지판. 도장과 판 이음은 같은 면을 나눠 그린다.
    const lipA = Math.max(0, len - R.panelLip), arrowHalf = Math.min(2.55, 0.62 * Math.min(Wl, Wr));
    const tip = 0.93 * lipA, tail = 0.09 * lipA, notch = 0.27 * lipA, slope = 0.86 * lipA / arrowHalf;
    const chevrons = rampMark === 'chevron';
    const band = 0.155 * lipA, standard = [0.37, 0.74].map(v => v * lipA), secondSlope = 0.56;
    const markerEdges = standard.flatMap(v => [v - 0.09 * lipA, v]);
    const lipEdges = multiples(lipA - 0.8 * Wl, len + 0.8 * Wr, 0.70);
    const central = w => Math.abs(w) < arrowHalf;
    const colourAt = (a, w) => {
      const edge = Math.min(w + Wl, Wr - w);
      if (edge < R.trim) return col.rail;
      if (a > lipA) {
        if (central(w)) return col.rail;
        return Math.floor((a + 0.8 * w) / 0.70 + 1000) % 2 ? col.amber : col.bearing;
      }
      if (central(w)) {
        const d = a + Math.abs(w) * (chevrons ? secondSlope : slope);
        const marked = chevrons ? standard.some(v => d > v - 0.09 * lipA && d < v)
          : d > tip - band && d <= tip && a >= tail && (a < notch || a > notch + 0.07 * lipA);
        return marked ? col.white : col.blue;
      }
      return Math.abs(w) < arrowHalf + 0.075 ? col.bearing : col.tread;
    };
    const rows = [...new Set([...steps(0, lipA, 0.65), tail, notch, notch + 0.07 * lipA, len])].sort((a, b) => a - b);
    const colsW = [...new Set([...steps(-Wl, 0, 1.25), ...steps(0, Wr, 1.25), -Wl + R.trim, -arrowHalf - 0.075, -arrowHalf, arrowHalf, arrowHalf + 0.075, Wr - R.trim])].sort((a, b) => a - b);
    let pieces = grid(rows, colsW);
    for (const side of [-1, 1]) {
      const face = c => c[0] < lipA && c[1] * side > 0 && central(c[1]);
      pieces = split(pieces, 1, side * slope, [tip - band, tip], face);
      pieces = split(pieces, 1, side * secondSlope, markerEdges, face);
    }
    pieces = split(pieces, 1, 0.8, lipEdges, c => c[0] > lipA && !central(c[1]));
    drawTop(pieces, top3, colourAt);

    drawSides([0.38 * len, 0.72 * len]);
    // 마루의 반사 테이프가 뒷면으로 이어진다. 그 아래는 접힌 철판과 안으로 물린 패널.
    const f = fr(r.at + len), hint = [f.fx, 0, f.fz];
    const backAt = (w, q, recess = 0) => {
      const p = place(len, w), b = baseY(p.xz), t = topY(len, p.xz);
      return [p.xz[0] - f.fx * recess, b + (t - b) * q, p.xz[1] - f.fz * recess];
    };
    const bays = steps(-Wl, Wr, 1.9);
    for (let i = 1; i < bays.length; i++) {
      const a = bays[i-1], b = bays[i], inset = Math.min(0.095, (b - a) * 0.08);
      const frame = [backAt(a, 0.12), backAt(b, 0.12), backAt(b, 0.78), backAt(a, 0.78)];
      const pan = [backAt(a + inset, 0.19, 0.055), backAt(b - inset, 0.19, 0.055),
        backAt(b - inset, 0.69, 0.055), backAt(a + inset, 0.69, 0.055)];
      G.quad(backAt(a, 0), backAt(b, 0), frame[1], frame[0], col.bearing, hint);
      for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        G.quad(frame[k], frame[next], pan[next], pan[k], k === 2 ? col.flange : col.steel, hint);
      }
      G.poly(pan, i % 2 ? col.steel : col.tread, hint);
    }
    const ends = [-Wl, -Wl + R.trim, -arrowHalf, arrowHalf, Wr - R.trim, Wr,
      ...lipEdges.map(v => (v - len) / 0.8).filter(w => w > -Wl && w < Wr)].sort((a, b) => a - b);
    for (let i = 1; i < ends.length; i++) {
      const a = ends[i - 1], b = ends[i];
      G.quad(backAt(a, 0.78), backAt(b, 0.78), backAt(b, 1), backAt(a, 1), colourAt(len, (a + b) / 2), hint);
    }
  }

  // ================================================================ 3. 부스트 발판
  const padPos = [], padInfo = [], padIdx = [], padSizes = new Map();
  const padKey = p => p.width + '/' + p.length;
  if (lensPad) {
    for (const b of parts.pads || []) {
      if (!padSizes.has(padKey(b))) padSizes.set(padKey(b), { ...b, tile: padSizes.size });
    }
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(padSizes.size))), tileRows = Math.max(1, Math.ceil(padSizes.size / columns));
  for (const b of parts.pads || []) {
    const base = padPos.length / 3, colsU = steps(0, 1, 0.25);
    let rowsA = steps(0, b.length, 0.5), tileX = 0, tileY = 0, corner = 0;
    if (lensPad) {
      const tile = padSizes.get(padKey(b)).tile;
      tileX = tile % columns;
      tileY = Math.floor(tile / columns);
      corner = Math.min(0.20, 0.07 * b.width, 0.06 * b.length);
      rowsA = [...new Set([corner, ...rowsA, b.length - corner])].sort((a, b) => a - b);
    }
    for (const a of rowsA) {
      const clip = Math.max(0, corner - Math.min(a, b.length - a));
      const s = b.at + a, f = frame(s), rl = parts.rampLift ? parts.rampLift(s) : 0;
      for (const t of colsU) {
        const u = t + (1 - 2 * t) * clip / b.width;
        const [x, z] = at(f, b.lateral - b.width / 2 + u * b.width);
        padPos.push(x, surfaceAt(x, z, s) + L.road + rl + L.pad.lift, z);
        if (lensPad) padInfo.push((tileX + u) / columns, (tileY + a / b.length) / tileRows, a / b.length, 1 / b.length);
        else padInfo.push(u, a, b.length, b.width);
      }
    }
    const nc = colsU.length;
    for (let i = 0; i < rowsA.length - 1; i++) for (let j = 0; j < nc - 1; j++) { const p = base + i * nc + j, q = p + nc; padIdx.push(p, p + 1, q, p + 1, q + 1, q); }
  }

  // ── 재료와 메시
  const std = opts => new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, ...opts });
  const add = (geometry, material, name, cast) => { const m = new THREE.Mesh(geometry, material); m.name = name; m.castShadow = cast; m.receiveShadow = true; group.add(m); meshes.push(m); return m; };
  if (bridgeB.count()) {
    const mat = std({ vertexColors: true });
    // 하부의 노면 반사광. 밤 셰이더를 거치는 아래쪽 면만 약하게 받는다.
    mat.onBeforeCompile = shader => {
      const varying = '#include <common>\n#ifdef CAMPUS_LAMP_MAP\nvarying float vSoffitBounce;\n#endif';
      shader.vertexShader = shader.vertexShader.replace('#include <common>', varying)
        .replace('#include <normal_vertex>', `#include <normal_vertex>
          #ifdef CAMPUS_LAMP_MAP
            vSoffitBounce = smoothstep(0.05, 0.92, -dot(vNormal, viewMatrix[1].xyz));
          #endif`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', varying)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #ifdef CAMPUS_LAMP_MAP
          reflectedLight.indirectDiffuse += material.diffuseColor * vec3(0.12, 0.14, 0.17) * vSoffitBounce;
        #endif`);
    };
    mat.customProgramCacheKey = () => 'part-bridge-soffit-v2';
    add(bridgeB.geometry(), mat, 'part-bridges', true);
  }
  if (rampB.count()) {
    const m = add(rampB.geometry(), std({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), 'part-ramps', true);
    if (panelRamp) applyRampPanel(m.material);
    m.userData.rampTop = rampTop.map(t => ({ at: t.ramp.at, length: t.ramp.length, height: t.ramp.height, from: t.from, to: t.to }));   // 윗면 삼각형 범위(시험용)
  }
  function applyRampPanel(material) {
    // 마찰판의 눌러 찍은 요철과 이음. 작아진 무늬는 픽셀 폭에 맞춰 걷는다.
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aRampPanel; varying vec3 vRampPanel;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRampPanel = aRampPanel;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRampPanel;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float along = vRampPanel.y;
            vec2 tread = vec2(abs(vRampPanel.x) + along, abs(vRampPanel.x) - along) / 0.23;
            vec2 hatch = abs(fract(tread) - 0.5);
            float bar = smoothstep(0.28, 0.43, hatch.x) * (1.0 - smoothstep(0.24, 0.41, hatch.y));
            float aa = max(fwidth(along), 0.009);
            float seam = abs(fract(along / 1.4 + 0.5) - 0.5) * 1.4;
            float joint = 1.0 - smoothstep(0.027 - aa, 0.027 + aa, seam);
            float pin = length(vec2(vRampPanel.z - 0.18, seam - 0.16));
            float bolt = 1.0 - smoothstep(0.046 - aa, 0.046 + aa, pin);
            float grip = 0.30 * (bar - 0.22) * (1.0 - smoothstep(0.22, 0.68, fwidth(tread.x)));
            diffuseColor.rgb *= 1.0 + step(0.01, vRampPanel.z) * (grip - 0.68 * joint + 0.42 * bolt);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          #ifdef CAMPUS_LAMP_MAP
            float reflector = step(vColor.b * 4.0 + 0.15, vColor.r);
            totalEmissiveRadiance += reflector * vec3(0.20, 0.115, 0.032);
          #endif`);
    };
    material.customProgramCacheKey = () => 'part-ramp-plate-v1';
  }

  let reduce = !!reducedMotion, mq = null, onMq = null;
  if (reducedMotion === undefined && typeof window !== 'undefined' && window.matchMedia) { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); reduce = mq.matches; onMq = () => { reduce = mq.matches; }; mq.addEventListener?.('change', onMq); }
  const padUniforms = { uPadTime: { value: 0 }, uPadFlow: { value: L.pad.flow }, uPadBreath: { value: 1 } };
  let padMask;
  if (padPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(padPos, 3)); g.setAttribute('aPad', new THREE.Float32BufferAttribute(padInfo, 4)); g.setIndex(padIdx); g.computeVertexNormals(); g.computeBoundingSphere();
    const mat = std({ color: C.padBase, roughness: lensPad ? 0.56 : 0.45, metalness: lensPad ? 0.15 : 0.1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    if (lensPad) applyLensPad(mat);
    else applyChevronPad(mat);
    add(g, mat, 'part-pads', false);
  }

  function applyChevronPad(mat) {
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, padUniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aPad;\nvarying vec4 vPad;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPad = aPad;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vPad;\nuniform float uPadTime, uPadFlow, uPadBreath;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float across = (vPad.x - 0.5) * vPad.w, along = vPad.y, len = vPad.z;
          float edge = min(min(vPad.x, 1.0 - vPad.x) * vPad.w, min(along, len - along));
          float frame = 1.0 - smoothstep(0.07, 0.11, edge);
          float inner = smoothstep(0.2, 0.3, edge);
          // 앞을 가리키는 갈매기(가운데가 앞), 앞으로 흐른다
          float d = along + abs(across) * ${L.pad.slope.toFixed(3)};
          float ph = fract((d - uPadTime * uPadFlow) / ${L.pad.period.toFixed(3)});
          float arrow = smoothstep(0.0, 0.04, ph) * (1.0 - smoothstep(0.32, 0.36, ph));
          float lead = smoothstep(0.1, 0.29, ph);             // 화살 앞머리(진행 방향 쪽)를 더 밝게
          float fade = smoothstep(0.15, 0.9, along) * smoothstep(0.1, 0.6, len - along);
          float breath = 1.0 - 0.16 * uPadBreath * (0.5 + 0.5 * sin(uPadTime * 3.2));
          float glow = arrow * inner * fade * breath;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.7, 1.0), glow * 0.5 + frame * 0.45);
          totalEmissiveRadiance += vec3(0.08, 0.5, 1.0) * glow * (1.3 + 1.0 * lead) + vec3(0.12, 0.4, 1.0) * frame * 0.7 * breath;
        }`);
    };
    mat.customProgramCacheKey = () => 'part-pad-v1';
  }

  function applyLensPad(mat) {
    // 빨강은 렌즈, 초록은 옆 유도등, 파랑은 금속 틀·나사, 알파는 판 이음이다. 같은 규격은 한 칸을 쓴다.
    const tw = Math.max(1, Math.min(160, Math.floor(2048 / columns))), th = Math.max(1, Math.min(256, Math.floor(2048 / tileRows)));
    const width = tw * columns, height = th * tileRows, pixels = new Uint8Array(width * height * 4);
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (const { width: wide, length: len, tile } of padSizes.values()) {
      const rows = Math.max(1, Math.round(len / L.pad.period));
      const depth = Math.min(0.30 * len, 0.49 * wide), first = 0.14 * len + depth;
      const pitch = Math.max((0.87 * len - first) / Math.max(1, rows - 1), len * 0.16);
      const cut = Math.min(0.20, 0.07 * wide, 0.06 * len), aa = Math.max(0.012, 0.5 * Math.max(wide / tw, len / th));
      const band = (dist, r) => 1 - smooth(r - aa, r + aa, dist);
      for (let y = 0; y < th; y++) {
        const along = (y + 0.5) * len / th, end = Math.min(along, len - along);
        const joints = Math.abs(along - Math.round(along / 1.50) * 1.50);
        for (let x = 0; x < tw; x++) {
          const u = (x + 0.5) / tw - 0.5, across = u * wide, side = (0.5 - Math.abs(u)) * wide;
          const edge = Math.min(side, end, (side + end - cut) * 0.7071);
          const inner = (1 - band(side, 0.26)) * (1 - band(end, 0.18));
          const lane = along + depth * 2 * Math.abs(u) - first;
          const row = Math.max(0, Math.min(rows - 1, Math.round(lane / pitch)));
          const lens = band(Math.abs(lane - row * pitch), 0.135 * pitch) * inner;
          const joint = Math.abs(Math.abs(across) - (across < 0 ? 0.60 : 0.78));
          const rim = band(edge, 0.075), screw = band(Math.hypot(side - 0.17, end - 0.20), 0.046);
          const i = 4 * ((Math.floor(tile / columns) * th + y) * width + tile % columns * tw + x);
          pixels[i] = Math.round(255 * lens * (1 - band(joint, 0.035)));
          pixels[i + 1] = Math.round(255 * (1 - band(side, 0.12)) * band(side, 0.19) * smooth(0.18, 0.26, joints) * smooth(0.36, 0.52, end));
          pixels[i + 2] = Math.round(255 * Math.min(1, rim + screw));
          pixels[i + 3] = Math.round(255 * band(joints, 0.024) * inner);
        }
      }
    }
    padMask = new THREE.DataTexture(pixels, width, height);
    padMask.name = 'boost-lens-mask'; padMask.generateMipmaps = true; padMask.magFilter = THREE.LinearFilter;
    padMask.minFilter = THREE.LinearMipmapLinearFilter; padMask.anisotropy = 4; padMask.needsUpdate = true;
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, padUniforms, { uPadMask: { value: padMask } });
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aPad; varying vec3 vPad; uniform float uPadTime, uPadFlow, uPadBreath;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vPad.xy = aPad.xy;
          vPad.z = 0.60 + 0.40 * uPadBreath * cos(6.28318 * (aPad.z - uPadTime * uPadFlow * aPad.w));`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPad; uniform sampler2D uPadMask;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec4 mask = texture2D(uPadMask, vPad.xy);
          diffuseColor.rgb *= 0.68 - 0.40 * mask.a;
          diffuseColor.rgb += vec3(0.20, 0.23, 0.26) * mask.b + vec3(0.008, 0.015, 0.021) * mask.r;
          vec3 lamp = mix(vec3(0.05, 0.28, 0.56), vec3(0.19, 0.69, 1.04), vPad.z);
          totalEmissiveRadiance += lamp * mask.r + vec3(0.11, 0.35, 0.47) * mask.g;
          #ifdef CAMPUS_LAMP_MAP
            totalEmissiveRadiance += vec3(0.024, 0.031, 0.035) * mask.b;
          #endif`);
    };
    mat.customProgramCacheKey = () => 'part-pad-mask-v1';
  }

  let triangles = 0; for (const m of meshes) { const g = m.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; }
  const stats = { meshes: meshes.length, triangles: Math.round(triangles), bridges: (parts.bridges || []).length, ramps: (parts.ramps || []).length, pads: (parts.pads || []).length };
  let clock = 0;
  return {
    group, stats,
    update(dt = 1 / 60, time) {
      clock = Number.isFinite(time) ? time : clock + (dt || 0);
      padUniforms.uPadTime.value = clock;
      padUniforms.uPadFlow.value = reduce ? L.pad.flow * 0.2 : L.pad.flow;
      padUniforms.uPadBreath.value = reduce ? 0 : 1;
    },
    setReducedMotion(on) { reduce = !!on; },
    dispose() { padMask?.dispose(); mq?.removeEventListener?.('change', onMq); group.removeFromParent(); for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); } },
  };
}
