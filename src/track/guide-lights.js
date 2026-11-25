// 가장자리 유도등 — 밤에 굽이가 어디로 꺾이는지 길 양쪽 끝을 점으로 그려 미리 보여 준다(사용자 2026-11-25 시안 '(가) 가장자리 등').
//   const guide = createGuideLights(THREE, { course, parts, pit, surfaceAt, night, mode });  scene.add(guide.group)
// 꼴(mode — 주소 ?guide=). 게임의 기본은 'bends'(2026-11-25 사용자가 셋을 타 보고 고름 — main.js). 이 모듈은 모르는 꼴을 'sharp' 로 받는다:
//   'sharp' 급굽이만 — 꺾임 55° 이상 · 가장 작은 반지름 16 m 이하인 굽이의 42 m 앞부터 3 m 마다
//   'bends' 굽이마다 — 꺾임 25° 이상인 굽이를 다 켠다. 급굽이는 위와 같이, 나머지는 6 m 마다 · 급할수록 앞 거리를 길게(24 ~ 36 m)
//   'full'  코스 전체 — 6 m 마다 코스 내내, 급굽이 구간만 3 m
// 꾸밈일 뿐이다: 주행 계산 · 기록 · 순위 · 유령은 이 모듈을 부르지 않는다(검증/guide-lights.test.mjs 가 본다). 코스 자료도 바꾸지 않는다.
// 굽이는 코스마다 중심선에서 저절로 찾는다 — 새 코스가 들어와도 따로 적을 것이 없다.
// 진짜 빛(광원)은 하나도 늘리지 않는다: 1 을 넘는 HDR 색의 빛나는 재질(밤 후처리의 블룸이 번지게) + 인스턴스 둘 = 그리기 호출 +2(꼴과 상관없이).
// 단위 m. s = 출발선부터 잰 거리, lateral = 중심선에서 오른쪽(+). surfaceAt(x, z, s) = 노면이 깔리는 바닥(지형 + 공중 구간 + 기운 코너 — main.js 의 것). 노면은 그보다 LIFT.road 위.
import { createLocator, findBends, LIFT } from './track.js';

export const GUIDE_MODES = ['sharp', 'bends', 'full'];
export const GUIDE = {
  runRadius: 40,     // 급굽이를 재는 굽은 구간: 중심선 꺾임(앞뒤 10 m 고르게)이 이 반지름보다 급한 칸이 이어지는 곳
  minAngle: 55,      // 급굽이: 꺾임 이 각(도) 이상이고(2026-11-25 60 → 55: B 첫 코너 59° 를 넣으려고 — 사용자 "B첫 코너에도 유도등 넣자")
  maxRadius: 16,     // 중심선 방향 차(±8 m)로 잰 가장 작은 반지름이 이 값(m) 이하
  lead: 42,          // 급굽이 시작 이만큼(m) 앞부터
  tail: 6,           // 굽이가 끝나고 이만큼(m) 뒤까지
  pitch: 3,          // 급굽이 구간의 등 사이(m)
  // 'bends' 의 굽이: 반지름 80 m 보다 급한 칸이 이어지고 모두 25° 넘게 꺾이는 곳(B · D 를 재 보니 굽이는 28° 이상, 살짝 휘는 곳은 22° 이하로 갈린다). 앞 거리는 가장 작은 반지름 40 m → 24 m … 16 m → 36 m.
  bend: { runRadius: 80, minAngle: 25, pitch: 6, lead: [24, 36], radius: [40, 16] },
  line: 6,           // 'full' 의 곧은 길 등 사이(m)
  inset: 0.45,       // 길 경계에서 안쪽으로(m)
  lamp: { top: 0.09, bottom: 0.13, height: 0.18, sink: 0.08, segments: 10 },   // 등 머리(원기둥, m) — 아래로 sink 만큼 노면 속에 묻어 노면 굴곡에 뜨지 않게
  halo: 2.0,         // 노면 빛 자국 한 변(m) — 노면의 기울기(기운 코너 · 오르내림)를 따라 눕힌다
  haloLift: 0.095,   // 빛 자국을 노면 위 이만큼(m) — 연석(노면 위 0.085 m)에 가려지지 않게
  gain: 6,           // 밤 등 머리의 밝기(파랑 × gain — 블룸이 번진다)
  haloGain: 1.1,
  blue: [0.16, 0.42, 1.0],
  dayLevel: 0.55,    // 낮: 불 꺼진 파란 유리(빛 자국 없음)
  avoid: { rampBefore: 2, rampAfter: 1, padAlong: 1, padSide: 0.5, pitAlong: 2 },
};

const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// 굽은 구간 찾기(중심선만 본다): findBends 를 runRadius 로 부르고, 출발선을 걸쳐 둘로 나뉜 구간을 다시 이은 뒤 꺾임 · 가장 작은 반지름으로 거른다.
//   → [{ from, to, angle, dir: 'left' | 'right', inside: -1 | 1, radius, tightest }] (from · to · tightest = s, m. from 이 음수면 출발선을 걸친 굽이)
function findRuns(course, { runRadius, minAngle, maxRadius = Infinity, locator = null }) {
  const loc = locator || createLocator(course), { n, cum, length } = loc, P = course.centre;
  const runs = findBends(course, { radius: runRadius, minAngle: 0 });
  if (runs.length > 1) { const a = runs[0], b = runs[runs.length - 1]; if (a.from === 0 && b.to >= n && a.dir === b.dir) { runs.pop(); runs[0] = { ...a, from: b.from - n, angle: a.angle + b.angle }; } }
  const K = 4, h = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; h[i] = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  const at = i => ((i % n) + n) % n, sOf = i => Math.floor(i / n) * length + cum[at(i)];
  const out = [];
  for (const r of runs) {
    if (r.angle < minAngle) continue;
    let best = 0, tight = r.from;
    for (let i = r.from - 5; i <= r.to + 5; i++) { const k = Math.abs(wrapA(h[at(i + K)] - h[at(i - K)])) / (2 * K * (course.step || 2)); if (k > best) { best = k; tight = i; } }
    const radius = best > 0 ? 1 / best : Infinity;
    if (radius > maxRadius) continue;
    out.push({ from: +sOf(r.from).toFixed(1), to: +sOf(r.to).toFixed(1), angle: r.angle, dir: r.dir, inside: r.dir === 'left' ? -1 : 1, radius: +radius.toFixed(1), tightest: +sOf(tight).toFixed(1) });
  }
  return out;
}

// 급굽이(모든 꼴이 3 m 로 촘촘히 켜는 곳)
export function findSharpCorners(course, { runRadius = GUIDE.runRadius, minAngle = GUIDE.minAngle, maxRadius = GUIDE.maxRadius, locator = null } = {}) {
  return findRuns(course, { runRadius, minAngle, maxRadius, locator });
}
// 굽이('bends' 꼴이 켜는 곳 — 급굽이가 아닌 것도)
export function findGuideBends(course, { runRadius = GUIDE.bend.runRadius, minAngle = GUIDE.bend.minAngle, locator = null } = {}) {
  return findRuns(course, { runRadius, minAngle, locator });
}

// 등 자리(순수 계산 — Node 시험에서도 쓴다).
//   → { mode, corners(급굽이), bends('bends' 꼴의 굽이 — 다른 꼴은 []), zones: [[s0, s1, 등 사이], …], lamps: [{ s, side, lateral, x, y, z, slope: [옆, 앞], outside, u, tier }], skipped: { ramp, pad, pit } }
//   y = 노면 높이(surfaceAt + LIFT.road), base = 등 머리 밑(연석 · 칠 위면 그 윗면), kerb = 연석 위인가. tier = 'sharp' | 'bend' | 'line'. 점프대 · 부스트 발판 · 피트 들머리(열린 방호벽) 자리는 건너뛴다(세 꼴 모두 같다).
export function placeGuideLights({ course, parts, pit = null, surfaceAt = () => 0, locator = null, mode = 'sharp', options = {} }) {
  const G = { ...GUIDE, ...options }, loc = locator || createLocator(course), L = loc.length;
  if (!GUIDE_MODES.includes(mode)) mode = 'sharp';
  const mod = s => ((s % L) + L) % L, inSpan = (s, a, b) => mod(s - a) <= b - a;
  const corners = findSharpCorners(course, { ...G, locator: loc });
  // 켜는 구간: { a, b, pitch, tier, c(굽이) }. a · b 는 출발선을 넘어 음수 · L 이상일 수 있다.
  const spans = corners.map(c => ({ a: c.from - G.lead, b: c.to + G.tail, pitch: G.pitch, tier: 'sharp', c }));
  let bends = [];
  if (mode === 'bends') {
    const B = G.bend, sharpOver = b => corners.some(c => c.dir === b.dir && (inSpan(b.tightest, c.from - 2, c.to + 2) || inSpan(c.tightest, b.from - 2, b.to + 2)));
    bends = findGuideBends(course, { ...B, locator: loc });
    for (const b of bends) {
      if (sharpOver(b)) continue;   // 급굽이와 같은 굽이(같은 방향 · 꼭짓점이 겹침 — 재는 문턱이 달라 구간이 조금 다르다)는 급굽이 쪽으로
      const k = Math.min(1, Math.max(0, (B.radius[0] - b.radius) / (B.radius[0] - B.radius[1])));
      spans.push({ a: b.from - (B.lead[0] + (B.lead[1] - B.lead[0]) * k), b: b.to + G.tail, pitch: B.pitch, tier: 'bend', c: b });
    }
  }
  // 그 자리의 등 사이(덮는 구간 가운데 가장 촘촘한 것) · 등급 · 가장 가까운 굽이
  const cover = s => { let best = null; for (const z of spans) if (inSpan(s, z.a, z.b) && (!best || z.pitch < best.pitch)) best = z; return best; };
  // 이어진 구간(겹치면 하나로 — 등이 두 번 서지 않게)
  const segs = [];
  if (mode === 'full') segs.push({ a: 0, b: L - G.line / 2, whole: true });
  else {
    // 등 하나 사이보다 좁게 떨어진 구간도 잇는다(구간 끝마다 새로 세면 2 ~ 4 m 로 붙은 등이 생긴다)
    for (const z of [...spans].sort((p, q) => p.a - q.a)) { const last = segs[segs.length - 1]; if (last && z.a <= last.b + z.pitch) last.b = Math.max(last.b, z.b); else segs.push({ a: z.a, b: z.b }); }
    if (segs.length > 1) { const first = segs[0], last = segs[segs.length - 1]; if (last.b - L + G.pitch >= first.a) { first.a = Math.min(first.a, last.a - L); first.b = Math.max(first.b, last.b - L); segs.pop(); } }
  }
  const A = G.avoid, skipped = { ramp: 0, pad: 0, pit: 0 }, lamps = [], zones = [];
  // 가장자리 칠(연석 · 코너 안쪽 노랑 연석 · 난간 없는 곳의 빨강 · 흰 줄)이 노면보다 높은 칸 — track.js 의 2절과 같은 규칙으로 다시 센다.
  //   연석 위는 칠이 노면 위 약 0.08 m 다. 칠은 깊이를 당겨 그려서(polygonOffset) 멀리서 비스듬히 보면 그 위로 0.1 m 만 나온 등 머리를 덮는다
  //   (B 첫 코너 안쪽 등이 안 보였다 — 2026-11-25). 그래서 등 머리 밑을 칠 윗면에 맞춘다.
  const n = course.centre.length, wrapI = i => ((i % n) + n) % n, kerbAt = { left: new Uint8Array(n), right: new Uint8Array(n) }, apexAt = { left: new Uint8Array(n), right: new Uint8Array(n) };
  for (const k of course.kerbs || []) for (let i = k.from, guard = 0; guard <= n; i = wrapI(i + 1), guard++) { kerbAt[k.side][i] = 1; if (i === k.to) break; }
  for (const b of findBends(course)) { const cut = b.angle > 120 ? Math.round((b.to - b.from) * 0.2) : -1; for (let i = b.from + cut; i < b.to - cut; i++) apexAt[b.inside][wrapI(i)] = 1; }
  const paintLift = (i, name, sMid) => {
    if (parts.openAt(sMid, name)) return LIFT.paint - LIFT.road;
    const width = apexAt[name][i] ? 1.35 : kerbAt[name][i] ? 0.75 : 0; if (!width) return 0;
    return LIFT.paint + 0.05 + 0.015 * Math.min(1, G.inset / (width * 0.91)) - LIFT.road;
  };
  const yAt = (s, lat) => { const p = parts.pointAt(s, lat); return surfaceAt(p.x, p.z, s); };
  for (const seg of segs) {
    for (let s = seg.a, first = true; s <= seg.b + 1e-6; first = false) {
      const z = cover(s), pitch = z ? z.pitch : G.line, tier = z ? z.tier : 'line', sm = mod(s);
      if (first || zones[zones.length - 1][2] !== pitch) zones.push([+s.toFixed(1), +s.toFixed(1), pitch]); else zones[zones.length - 1][1] = +s.toFixed(1);
      place(s, sm, z, tier, seg);
      s += pitch;
    }
  }
  function place(s, sm, z, tier, seg) {
    if (parts.ramps.some(r => inSpan(sm, r.at - A.rampBefore, r.at + r.length + A.rampAfter))) { skipped.ramp += 2; return; }
    const frame = parts.pointAt(sm, 0);
    for (const side of [-1, 1]) {
      const name = side > 0 ? 'right' : 'left', lateral = side < 0 ? -(frame.left - G.inset) : frame.right - G.inset;
      if (parts.pads.some(p => inSpan(sm, p.at - A.padAlong, p.at + p.length + A.padAlong) && Math.abs(lateral - p.lateral) < p.width / 2 + A.padSide)) { skipped.pad++; continue; }
      if (pit && [-A.pitAlong, 0, A.pitAlong].some(d => pit.gapAt(mod(sm + d), name))) { skipped.pit++; continue; }
      const p = parts.pointAt(sm, lateral), y = surfaceAt(p.x, p.z, sm), cell = p.index, kerb = paintLift(cell, name, loc.cum[cell] + loc.seg[cell] / 2);
      // 노면의 기울기(옆 · 앞, 1 m 당 높이) — 빛 자국을 노면에 눕힌다
      const slope = [(yAt(sm, lateral + 0.5) - yAt(sm, lateral - 0.5)), (yAt(mod(sm + 0.5), lateral) - yAt(mod(sm - 0.5), lateral))];
      lamps.push({ s: +sm.toFixed(2), side, lateral: +lateral.toFixed(3), x: p.x, z: p.z, y: y + LIFT.road, base: y + LIFT.road + kerb, kerb: kerb > 0.03, heading: p.heading, slope, outside: z ? side !== z.c.inside : false, u: +(s - seg.a).toFixed(2), tier });
    }
  }
  return { mode, corners, bends, zones, lamps, skipped };
}

// 노면 빛 자국의 둥근 번짐(64 × 64, 가운데 1 → 0.35 에서 0.38 → 가장자리 0). 캔버스 없이 만든다(Node 시험에서도 돈다).
function haloTexture(THREE) {
  const S = 64, px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.min(1, Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2)), a = r < 0.35 ? 1 - (1 - 0.38) * r / 0.35 : 0.38 * (1 - (r - 0.35) / 0.65), o = (y * S + x) * 4;
    px[o] = px[o + 1] = px[o + 2] = 255; px[o + 3] = Math.round(255 * a);
  }
  const t = new THREE.DataTexture(px, S, S);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// night = true 면 빛나고(등 머리 + 노면 빛 자국 = 그리기 호출 2), 아니면(낮 · 노을) 불 꺼진 파란 유리 머리만(호출 1). mode = GUIDE_MODES 가운데 하나(모르면 'sharp').
export function createGuideLights(THREE, { course, parts, pit = null, surfaceAt = () => 0, night = true, mode = 'sharp', options = {} }) {
  const G = { ...GUIDE, ...options }, placed = placeGuideLights({ course, parts, pit, surfaceAt, mode, options });
  const { lamps } = placed, group = new THREE.Group(); group.name = 'guide-lights';
  const owned = [], meshes = [];
  const lp = G.lamp, dome = new THREE.CylinderGeometry(lp.top, lp.bottom, lp.height + lp.sink, lp.segments).translate(0, (lp.height - lp.sink) / 2, 0); owned.push(dome);
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), c = new THREE.Color();
  const blue = new THREE.Color(...G.blue);
  if (lamps.length) {
    const lampMat = new THREE.MeshBasicMaterial({ color: night ? new THREE.Color(G.gain, G.gain, G.gain) : new THREE.Color(G.dayLevel, G.dayLevel, G.dayLevel) }); owned.push(lampMat);
    const head = new THREE.InstancedMesh(dome, lampMat, lamps.length); head.name = 'guide-lamps';
    lamps.forEach((p, i) => { head.setMatrixAt(i, m.makeTranslation(v.set(p.x, p.base, p.z))); head.setColorAt(i, c.copy(blue)); });
    meshes.push(head);
    if (night) {
      const halo = haloTexture(THREE), plane = new THREE.PlaneGeometry(G.halo, G.halo).rotateX(-Math.PI / 2); owned.push(halo, plane);
      const poolMat = new THREE.MeshBasicMaterial({ map: halo, color: new THREE.Color(G.haloGain, G.haloGain, G.haloGain), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }); owned.push(poolMat);
      const pool = new THREE.InstancedMesh(plane, poolMat, lamps.length); pool.name = 'guide-pools'; pool.renderOrder = 3;
      const R = new THREE.Vector3(), F = new THREE.Vector3(), N = new THREE.Vector3();
      lamps.forEach((p, i) => {
        // 진행 방향 F · 오른쪽 R 을 노면 기울기대로 세우고, 그 둘의 법선 N 을 위로 — 판이 노면에 눕는다(기운 코너에서 한쪽이 떠 보이지 않게)
        const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
        R.set(-fz, p.slope[0], fx).normalize(); F.set(fx, p.slope[1], fz).normalize(); N.crossVectors(R, F).normalize(); if (N.y < 0) N.negate();
        F.crossVectors(R, N).normalize();
        m.makeBasis(R, N, F).setPosition(p.x + N.x * G.haloLift, p.y + N.y * G.haloLift, p.z + N.z * G.haloLift);
        pool.setMatrixAt(i, m); pool.setColorAt(i, c.copy(blue));
      });
      meshes.push(pool);
    }
  }
  for (const mesh of meshes) { mesh.castShadow = false; mesh.receiveShadow = false; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere(); group.add(mesh); }
  const tiers = {}; for (const l of lamps) tiers[l.tier] = (tiers[l.tier] || 0) + 1;
  const info = { mode: placed.mode, corners: placed.corners, bends: placed.bends.length, zones: placed.zones.length, count: lamps.length, tiers, skipped: placed.skipped, calls: meshes.length, night };
  return {
    group, lamps, corners: placed.corners, info,
    dispose() { group.removeFromParent(); for (const mesh of meshes) mesh.dispose(); for (const o of owned) o.dispose(); },
  };
}
