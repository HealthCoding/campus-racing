// 코스 부품 — 코스 위에 놓는 요소(자료)와 그것이 주행에 미치는 것: 길의 높이(공중 구간 · 점프대)와 부스트 발판.
// THREE 를 쓰지 않는 순수 계산이다(주행 계산 · Node 시험 · 나중의 서버 검증이 같이 쓴다). 모양은 part-models.js 가 그린다.
//   const parts = createParts(course, data);                       data = { version, parts: [...] } (course-b.parts.js)
//   주행:   const world = createCourseWorld(parts, (x, z) => 지형(x, z) + LIFT.road);   → { heightAt(x, z, y), ceilingAt, boostAt, walls }
//   노면:   createTrack(THREE, course, { heightAt: (x, z, s) => 지형(x, z) + parts.deckLift(s) })   (점프대는 노면 위에 따로 얹는다)
// 좌표는 트랙 기준: s = 출발선부터 잰 거리(m), lateral = 중심선에서 오른쪽으로(+, m).
// 층: 길이 위아래로 겹칠 수 있다(course.crossings). 한 자리에 높이가 여럿이면 '묻는 쪽의 높이'로 고른다 — rel = 얹은 것 없는 바닥에서 잰 높이(m).
//     밑이 트인 다리(들어 올린 높이 PART_SOLID.open 이상)는 두께 PART_SOLID.thickness 의 판이다: 그 밑은 빈 곳이라 다른 길이 지나간다. 그보다 낮은 오르막과 점프대는 땅까지 찬 덩어리다.
import { createLocator } from './track.js';
import { createWallIndex } from '../shared/wall-index.js';
import { atan2, hypot, sin, cos } from '../shared/dmath.js';   // 결정적 수학(주행 세계)

const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);   // 0 → 1, 양 끝의 기울기 0
const num = (v, fallback) => v == null || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? fallback : +v;
export const PART_DEFAULTS = {
  boost: { length: 5, lateral: 0, width: 3.2 },
  ramp: { length: 7, height: 1.3 },
  bridge: { height: 6, rise: 50, fall: 50 },
  open: { side: 'both' },
  bank: { side: 'right', slope: 0.18, ease: 14, grip: 0 },
};
// 주행 계산이 감당하는 범위(나중에 유저가 만든 자료가 들어와도 이 안에서만 받는다). 기울기 = 높이 ÷ 길이.
export const PART_LIMITS = {
  boost: { length: [1, 30], width: [0.5, 20] },
  ramp: { length: [2, 40], height: [0.2, 8], slope: 0.6 },       // 0.6 = 31°. 더 가파르면 주행 계산이 턱(벽)으로 본다
  bridge: { height: [0.5, 40], slope: 0.34 },                    // 오르내림의 가장 가파른 곳 = 1.5 × 높이 ÷ 길이
  bank: { slope: [0.02, 0.25], ease: [2, 60], grip: [0, 6] },    // 옆 기울기(높이 ÷ 옆 거리). 0.25 = 14° · grip = 받침 힘의 세기(기울기 × grip 만큼 안쪽으로 도는 힘이 는다 — 0 이면 높이만)
};
// 주행 계산이 보는 덩어리의 치수(m). 모양(part-models.js 의 PART_LOOK.bridge)과 맞춘다: open = 밑이 트이기 시작하는 높이, thickness = 노면에서 거더 밑까지,
// edge = 상판이 통로 경계 밖으로 나간 폭, below = 판의 밑면이 '묻는 높이 + below' 보다 낮으면 그 판 위(또는 속)에 있는 것으로 본다(카트 키의 절반쯤).
export const PART_SOLID = { open: 2.6, thickness: 1.35, edge: 0.65, below: 0.45 };
const within = (v, [lo, hi]) => v >= lo && v <= hi;

// 자료를 정리한다: 기본값을 채우고, 쓸 수 없는 것(모르는 종류 · 길이 0 · 코스 밖)은 버린다. 버린 것은 skipped 에 까닭과 함께 남긴다.
export function normalizeParts(data, length) {
  const list = [], skipped = [];
  for (const raw of Array.isArray(data?.parts) ? data.parts : []) {
    const d = PART_DEFAULTS[raw?.type];
    if (!d) { skipped.push({ part: raw, why: '모르는 종류' }); continue; }
    const p = { ...d, ...raw };
    if (p.type === 'bank') {
      // 기운 코너(2026-11-25): from ~ to 에서 길이 옆으로 기운다 — side 쪽 가장자리가 오르고 반대쪽이 내려간다(가운데는 그대로).
      // 높이 = 옆 자리(lateral) × slope × 들고 나는 몫(양 끝 ease m 에 걸쳐 0 → 1). 밑이 트인 다리 위에만 놓는다(아래에서 다시 거른다).
      const L = PART_LIMITS.bank; p.from = num(p.from, NaN); p.to = num(p.to, NaN); p.slope = num(p.slope, d.slope); p.ease = num(p.ease, d.ease); p.grip = num(p.grip, d.grip);
      if (!(p.from >= 0 && p.to <= length && p.to > p.from)) { skipped.push({ part: raw, why: '구간이 코스 밖이거나 비어 있음' }); continue; }
      if (!['left', 'right'].includes(p.side)) { skipped.push({ part: raw, why: '어느 쪽인지 모름(left · right)' }); continue; }
      if (!within(p.slope, L.slope) || !within(p.ease, L.ease) || p.ease * 2 > p.to - p.from) { skipped.push({ part: raw, why: '기울기나 들고 나는 길이가 범위 밖' }); continue; }
      if (!within(p.grip, L.grip)) { skipped.push({ part: raw, why: '받침 힘(grip)이 범위 밖' }); continue; }
      list.push(p); continue;
    }
    if (p.type === 'open') {
      // 난간 없는 구간: from ~ to 에서 그쪽(side) 방호벽이 없다 → 길 밖으로 떨어질 수 있다. 밑이 트인 다리 위에만 놓을 수 있다(아래에서 다시 거른다).
      p.from = num(p.from, NaN); p.to = num(p.to, NaN);
      if (!(p.from >= 0 && p.to <= length && p.to > p.from)) { skipped.push({ part: raw, why: '구간이 코스 밖이거나 비어 있음' }); continue; }
      if (!['left', 'right', 'both'].includes(p.side)) { skipped.push({ part: raw, why: '어느 쪽인지 모름(left · right · both)' }); continue; }
      list.push(p); continue;
    }
    if (p.type === 'bridge') {
      const L = PART_LIMITS.bridge; p.from = num(p.from, NaN); p.to = num(p.to, NaN); p.height = num(p.height, d.height);
      if (!(p.from >= 0 && p.to <= length && p.to > p.from)) { skipped.push({ part: raw, why: '구간이 코스 밖이거나 비어 있음' }); continue; }
      if (!within(p.height, L.height)) { skipped.push({ part: raw, why: '높이가 범위 밖' }); continue; }
      const span = p.to - p.from; p.rise = Math.min(Math.max(1, num(p.rise, d.rise)), span / 2); p.fall = Math.min(Math.max(1, num(p.fall, d.fall)), span / 2);
      if (1.5 * p.height / Math.min(p.rise, p.fall) > L.slope) { skipped.push({ part: raw, why: '오르내림이 너무 가파름(구간이 짧거나 높이가 큼)' }); continue; }
    } else {
      p.at = num(p.at, NaN); p.length = num(p.length, d.length);
      if (!(p.at >= 0 && p.length > 0 && p.at + p.length <= length)) { skipped.push({ part: raw, why: '자리가 코스 밖이거나 길이가 0' }); continue; }
      if (p.type === 'ramp') {
        const L = PART_LIMITS.ramp; p.height = num(p.height, d.height);
        if (!within(p.length, L.length) || !within(p.height, L.height)) { skipped.push({ part: raw, why: '길이나 높이가 범위 밖' }); continue; }
        if (p.height / p.length > L.slope) { skipped.push({ part: raw, why: '너무 가파름' }); continue; }
      } else {
        const L = PART_LIMITS.boost; p.lateral = num(p.lateral, 0); p.width = num(p.width, d.width);
        if (!within(p.length, L.length) || !within(p.width, L.width)) { skipped.push({ part: raw, why: '길이나 폭이 범위 밖' }); continue; }
      }
    }
    list.push(p);
  }
  // 난간 없는 구간 · 기운 코너는 처음부터 끝까지 밑이 트인 다리(들어 올린 높이 PART_SOLID.open 이상) 위여야 한다 — 땅에 붙은 길에서 벽만 없애면 떨어질 데가 없고,
  // 땅에 붙은 길을 기울이면 낮아진 쪽이 땅에 묻힌다. 기운 코너는 낮아진 가장자리까지 그 높이를 지켜야 한다(옆 자리 최대 10 m 로 본다).
  const bridges = list.filter(p => p.type === 'bridge'), deck = s => { let h = 0; for (const b of bridges) if (s >= b.from && s <= b.to) h = Math.max(h, b.height * Math.min(smooth((s - b.from) / b.rise), smooth((b.to - s) / b.fall))); return h; };
  for (let k = list.length - 1; k >= 0; k--) {
    const p = list[k]; if (p.type !== 'open' && p.type !== 'bank') continue; let ok = true;
    const need = PART_SOLID.open + 0.05 + (p.type === 'bank' ? p.slope * 10 : 0);
    // 0.1 m 마다 보고 0.05 m 의 여유를 둔다: 다리의 기울기는 0.34 까지라 그 사이에서 0.02 m 넘게 내려가지 못한다(다리 둘이 이어지는 골짜기도 놓치지 않는다)
    for (let s = p.from; ok && s <= p.to + 1e-9; s += 0.1) if (deck(Math.min(s, p.to)) < need) ok = false;
    if (!ok || deck(p.to) < need) { list.splice(k, 1); skipped.push({ part: p, why: '밑이 트인 다리 위가 아님' }); }
  }
  return { list, skipped };
}

// 길의 생김새를 정하는 부품(공중 구간 · 난간 없는 구간)만 남긴다. 길이 제 길을 건너는 코스에서는 다리가 코스의 일부라 뺄 수 없다 — '부품 없이'는 점프대 · 발판을 빼는 것이다.
export const structuralParts = data => ({ ...(data || {}), parts: (Array.isArray(data?.parts) ? data.parts : []).filter(p => p?.type === 'bridge' || p?.type === 'open' || p?.type === 'bank') });

export function createParts(course, data = null, { locator = null, normalized = null } = {}) {
  const loc = locator || createLocator(course), { n, cum, seg, hl, hr } = loc, length = loc.length;
  const { list, skipped } = normalized || normalizeParts(data, length);
  const bridges = list.filter(p => p.type === 'bridge'), ramps = list.filter(p => p.type === 'ramp'), pads = list.filter(p => p.type === 'boost'), opens = list.filter(p => p.type === 'open'), banks = list.filter(p => p.type === 'bank');
  // 그 자리(s)의 그쪽(side 'left' | 'right') 방호벽이 없는가(난간 없는 구간)
  const openAt = (s, side) => { for (const o of opens) if (s >= o.from && s <= o.to && (o.side === 'both' || o.side === side)) return true; return false; };
  const { open: OPEN, thickness: THICK, edge: EDGE, below: BELOW } = PART_SOLID;

  // 공중 구간이 길 전체를 들어 올린 높이(m). 부드럽게 올랐다 내려온다.
  function deckLift(s) {
    let h = 0;
    for (const b of bridges) if (s >= b.from && s <= b.to) h = Math.max(h, b.height * Math.min(smooth((s - b.from) / b.rise), smooth((b.to - s) / b.fall)));
    return h;
  }
  // 기운 코너가 옆 자리 lat(오른쪽 +, m)에 더하는 높이(m, 내려가는 쪽은 −). 기운 코너가 없으면 늘 0.
  // 결정적이다(+ − × 만): 주행 계산 · 다시 계산이 같은 값을 쓴다.
  function bankLift(s, lat) {
    let h = 0;
    for (const b of banks) if (s > b.from && s < b.to) h += (b.side === 'right' ? lat : -lat) * b.slope * Math.min(smooth((s - b.from) / b.ease), smooth((b.to - s) / b.ease));
    return h;
  }
  const banked = banks.length > 0;
  // 기운 코너의 받침 힘(2026-11-25 — 사용자 "(가)방향 진행해보는거 괜찮을 것 같아"): s 자리에서 안쪽으로 도는 것을 받쳐 주는 몫(+ = 왼쪽으로 도는 것을, − = 오른쪽).
  //   크기 = 기울기 × grip × 들고 나는 몫. 오른쪽(side 'right')이 오른 길은 왼쪽으로 도는 코너다. + − × 만 — 결정적.
  function bankSupport(s) {
    let k = 0;
    for (const b of banks) if (b.grip > 0 && s > b.from && s < b.to) k += (b.side === 'right' ? 1 : -1) * b.slope * b.grip * Math.min(smooth((s - b.from) / b.ease), smooth((b.to - s) / b.ease));
    return k;
  }
  // 그 자리(s)에서 옆 lat 의 판 윗면(바닥 기준, 점프대 제외) = 공중 구간 + 기운 코너
  const deckOf = (s, lat) => banked ? deckLift(s) + bankLift(s, lat) : deckLift(s);
  // 점프대가 그 위에 더 얹는 높이(m). 끝(at + length)에서 뚝 끊긴다.
  function rampLift(s) {
    let h = 0;
    for (const r of ramps) if (s >= r.at && s < r.at + r.length) h = Math.max(h, r.height * (s - r.at) / r.length);
    return h;
  }
  const none = !bridges.length && !ramps.length;
  // 얹은 것이 있는 칸 · 발판이 있는 칸(그 밖의 칸은 볼 필요가 없다)
  const mark = ranges => { const m = new Uint8Array(n); for (const [from, to] of ranges) for (let i = 0; i < n; i++) if (cum[i] + seg[i] >= from && cum[i] <= to) m[i] = 1; return m; };
  const lifted = mark([...bridges.map(b => [b.from, b.to]), ...ramps.map(r => [r.at, r.at + r.length])]), padded = mark(pads.map(b => [b.at, b.at + b.length]));
  const leaning = banked ? mark(banks.filter(b => b.grip > 0).map(b => [b.from, b.to])) : null;   // 받침 힘이 있는 칸
  const found = [];   // 칸 찾기 결과를 담는 재사용 배열(상태 아님)

  // s(와 옆 위치)로 좌표를 구한다 — 부품 모양을 놓을 때 쓴다. left · right = 그 자리의 통로 반폭.
  // 좌표 → 트랙 위치(progress)가 통로 칸(왼 i · 오 i · 왼 i+1 · 오 i+1 의 사각형) 안에서 쓰는 식의 정확한 역이다 —
  // 굽은 곳에서도 여기서 구한 자리를 다시 물으면 같은 s · lateral 이 나온다(모양과 판정이 같은 자리를 쓴다).
  const L = course.left, R = course.right;
  function pointAt(s, lateral = 0) {
    s = ((s % length) + length) % length;
    let lo = 0, hi = n - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const i = lo, j = (i + 1) % n, t = Math.min(1, (s - cum[i]) / seg[i]);
    const left = hl[i] + (hl[j] - hl[i]) * t, right = hr[i] + (hr[j] - hr[i]) * t, u = (lateral + left) / (left + right);
    const ax = L[i][0] + (R[i][0] - L[i][0]) * u, az = L[i][1] + (R[i][1] - L[i][1]) * u, bx = L[j][0] + (R[j][0] - L[j][0]) * u, bz = L[j][1] + (R[j][1] - L[j][1]) * u;
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: atan2(bx - ax, bz - az), left, right, index: i };
  }
  const apart = (i, j) => { const d = Math.abs(i - j); return Math.min(d, n - d) > 12; };   // 서로 다른 구간(코스 도구의 기준과 같다)

  // 그 자리에서 rel 높이에 있는 것이 딛는 높이(바닥 기준, m). 층 고르기: 판의 밑면이 rel + below 보다 낮은 것 가운데 가장 높은 윗면.
  // rel 을 안 주면 가장 위(겹침이 없는 곳에서는 하나뿐이라 같다). deckOnly = 공중 구간만(점프대 제외).
  function lift(px, pz, rel, deckOnly) {
    const count = loc.cellsAt(px, pz, EDGE, found, lifted); let best = 0;
    for (let k = 0; k < count; k++) {
      const s = found[k].s, deck = deckOf(s, found[k].lateral), top = deckOnly ? deck : deck + rampLift(s);
      if (top > best && (rel === undefined || deck < OPEN || deck - THICK < rel + BELOW)) best = top;
    }
    return best;
  }

  return {
    list, skipped, bridges, ramps, pads, opens, banks, length,
    deckLift, rampLift, bankLift, bankSupport, pointAt, openAt,
    // 그 자리 · 그 높이(rel)의 받침 힘(bankSupport — + = 왼쪽으로 도는 것을 받친다). 기운 코너 밖 · 다른 층 · 떨어지는 중이면 0. 주행 계산(world.bankAt)이 쓴다.
    supportAt(px, pz, rel) {
      if (!leaning) return 0;
      const count = loc.cellsAt(px, pz, EDGE, found, leaning);
      for (let k = 0; k < count; k++) {
        const p = found[k], sup = bankSupport(p.s); if (sup === 0) continue;
        if (rel !== undefined && Math.abs(rel - (deckOf(p.s, p.lateral) + rampLift(p.s))) > 0.6) continue;
        return sup;
      }
      return 0;
    },
    // 화면용(노면 · 방호벽 · 가로등): s 자리에서 (x, z) 가 깔리는 판 높이 = 공중 구간 + 기운 코너. 옆 자리는 s 의 가운데에서 잰다.
    surfaceLift(x, z, s) {
      const d = deckLift(s); if (!banked) return d;
      let on = false; for (const b of banks) if (s > b.from && s < b.to) on = true;
      if (!on) return d;
      const p = pointAt(s, 0), lat = (x - p.x) * -cos(p.heading) + (z - p.z) * sin(p.heading);
      return d + bankLift(s, lat);
    },
    // 같은 부품을 보는 사본(칸 찾기에 쓰는 재사용 배열을 따로 갖는다). 주행 계산은 제 사본을 쓴다.
    fork() { return createParts(course, null, { locator: loc, normalized: { list, skipped } }); },
    // 주행 계산용 높이: 공중 구간 + 점프대
    liftAt(px, pz, rel) { return none ? 0 : lift(px, pz, rel, false); },
    // 노면 · 방호벽용 높이: 공중 구간만
    deckAt(px, pz, rel) { return bridges.length ? lift(px, pz, rel, true) : 0; },
    // 머리 위의 판 밑면(바닥 기준, m). 없으면 Infinity. rel 높이에서 위로 뜰 때 여기에 닿는다.
    ceilingAt(px, pz, rel) {
      if (!bridges.length || rel === undefined) return Infinity;
      const count = loc.cellsAt(px, pz, EDGE, found, lifted); let low = Infinity;
      for (let k = 0; k < count; k++) { const deck = deckOf(found[k].s, found[k].lateral), bottom = deck - THICK; if (deck >= OPEN && bottom >= rel + BELOW && bottom < low) low = bottom; }
      return low;
    },
    // 부스트 발판 위면 그 부품, 아니면 null. rel 을 주면 그 높이의 층에 있는 발판만 본다.
    boostAt(px, pz, rel) {
      if (!pads.length) return null;
      const count = loc.cellsAt(px, pz, 0, found, padded);
      for (let k = 0; k < count; k++) {
        const p = found[k]; if (rel !== undefined && Math.abs(rel - (deckOf(p.s, p.lateral) + rampLift(p.s))) > 0.6) continue;
        for (const b of pads) if (p.s >= b.at && p.s <= b.at + b.length && Math.abs(p.lateral - b.lateral) <= b.width / 2) return b;
      }
      return null;
    },
    // 길 밖 margin m 까지 나무 · 시설물을 치울 자리인가: 공중 구간 둘레(나무 위쪽이 떠오른 길에 걸린다)와 점프대 뒤로 날아가는 길(flight m)
    clearAt(px, pz, { deck = 4.5, jump = 3, flight = 45 } = {}) {
      if (none) return false;
      const count = loc.cellsAt(px, pz, Math.min(5, Math.max(deck, jump)), found);
      for (let k = 0; k < count; k++) {
        const p = found[k], out = Math.abs(p.lateral) - p.half;
        if (deckLift(p.s) >= 1.5 && out <= deck) return true;
        for (const r of ramps) { const along = (((p.s - r.at + 2) % length) + length) % length; if (along <= r.length + flight + 2 && out <= jump) return true; }   // 출발선을 넘어 날아가는 길도 잇는다
      }
      return false;
    },
    // 공중 구간(높이 minLift 이상) 둘레 margin m 안인가 — 길 위로 뻗은 나무를 치울 때 쓴다
    elevated(px, pz, margin = 0, minLift = 1.5) {
      if (!bridges.length) return false;
      const count = loc.cellsAt(px, pz, Math.min(5, Math.max(0, margin)), found, lifted);
      for (let k = 0; k < count; k++) if (deckLift(found[k].s) >= minLift) return true;
      return false;
    },
    // 그 자리를 지나는 '다른 구간'(트랙 거리 s 의 구간이 아닌 것)의 칸들: [{ s, lateral, half, lift }]. 다리 기둥이 아래 길에 서지 않게 볼 때 쓴다.
    othersAt(px, pz, s, margin = 0) {
      const own = pointAt(s).index, out = [], count = loc.cellsAt(px, pz, Math.min(5, Math.max(0, margin)), found);
      for (let k = 0; k < count; k++) { const p = found[k]; if (apart(p.index, own)) out.push({ s: p.s, lateral: p.lateral, half: p.half, lift: deckLift(p.s) }); }
      return out;
    },
    // 벽(통로 경계 선분)에 높이 범위를 붙인다: y0 아래 · y1 위에서는 그 벽이 없다(없으면 끝없이 이어진다). ground(x, z) = 얹은 것 없는 바닥 높이.
    //   밑이 트인 다리의 벽은 상판 밑에서 끝나고(그 밑을 지나는 길을 막지 않는다), 그 밑을 지나는 길의 벽은 상판 밑에서 끝난다(다리 위를 막지 않는다).
    // skip(s, kind): 그 자리의 그쪽 벽을 빼려면 true(피트레인으로 갈라지는 곳 — pit.gapAt)
    wallSpans(ground = () => 0, skip = null) {
      // 다리 밑을 지나는 벽은 잘게(PIECES 조각) 나눠, 위 길의 통로 안(+ CUT m)에 든 조각만 위를 자른다. 선분째로 자르면 상판 밖까지 벽이 낮아져,
      // 높이 뜬 카트가 그 틈으로 길 밖에 나간다(틈이 카트 지름 1.6 m 보다 좁아야 한다: 여기서는 CUT + 조각 길이 = 0.4 m 안팎).
      const out = [], tmp = [], PIECES = 8, CUT = 0.15;
      for (const [ring, kind] of [[L, 'left'], [R, 'right']]) for (let i = 0; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n], wall = { ax: a[0], az: a[1], bx: b[0], bz: b[1], kind, index: i };
        if (opens.length && openAt(cum[i] + seg[i] / 2, kind)) continue;   // 난간 없는 구간: 벽이 없다(그 너머 상판 가장자리에서 떨어진다)
        if (skip && skip(cum[i] + seg[i] / 2, kind)) continue;             // 피트레인으로 갈라지는 곳 · 합치는 곳
        if (!bridges.length) { out.push(wall); continue; }
        // 기운 코너: 가장자리의 높이(왼쪽 경계 = −반폭, 오른쪽 = +반폭)
        const j1 = (i + 1) % n, la = kind === 'left' ? -hl[i] : hr[i], lb = kind === 'left' ? -hl[j1] : hr[j1];
        const da = deckOf(cum[i], la), db = deckOf(cum[i] + seg[i], lb), own = Math.max(da, db);
        // 판의 밑면보다 조금 위에서 시작한다: 다리 밑에서 머리 위 판에 닿을 만큼 뜬 카트(윗머리 = 밑면)가 이 벽에 걸리지 않게
        if (Math.min(da, db) >= OPEN) wall.y0 = Math.max(ground(a[0], a[1]) + da, ground(b[0], b[1]) + db) - THICK + 0.02;
        // 이 벽의 u(0~1) 자리 위로 다른 구간의 다리가 지나가면 그 판의 밑면 높이, 아니면 Infinity
        const under = u => {
          const qx = a[0] + (b[0] - a[0]) * u, qz = a[1] + (b[1] - a[1]) * u, count = loc.cellsAt(qx, qz, CUT, tmp, lifted); let top = Infinity;
          for (let k = 0; k < count; k++) { const deck = deckOf(tmp[k].s, tmp[k].lateral); if (apart(tmp[k].index, i) && deck >= OPEN && deck - THICK > own + 0.5) top = Math.min(top, ground(qx, qz) + deck - THICK - 0.05); }
          return top;
        };
        const tops = []; let any = false; for (let k = 0; k <= PIECES; k++) { tops.push(under(k / PIECES)); if (tops[k] < Infinity) any = true; }
        if (!any) { out.push(wall); continue; }
        for (let k = 0; k < PIECES; k++) {
          const u0 = k / PIECES, u1 = (k + 1) / PIECES, top = Math.min(tops[k], tops[k + 1]);
          const piece = { ...wall, ax: a[0] + (b[0] - a[0]) * u0, az: a[1] + (b[1] - a[1]) * u0, bx: a[0] + (b[0] - a[0]) * u1, bz: a[1] + (b[1] - a[1]) * u1 };
          if (top < Infinity) piece.y1 = top; out.push(piece);
        }
      }
      return out;
    },
    // 제 길을 건너는 곳마다 위아래 길 사이의 빈 높이(m, 위 판의 밑면 − 아래 길의 노면). 통로가 겹치는 모든 자리에서 가장 작은 값.
    // 자료 검사용: 이 값이 모자라면(또는 위 길이 밑이 트인 다리가 아니면) 두 길이 같은 높이에서 부딪힌다.
    crossingGaps() {
      return (course.crossings || []).map(c => {
        const reach = c.reach ?? 12, at = k => ((k % n) + n) % n;
        // 두 구간에서 서로의 통로와 겹치는 칸들
        const over = { a: new Set(), b: new Set() };
        for (let da = -reach; da <= reach; da++) for (let db = -reach; db <= reach; db++) {
          const i = at(c.a.index + da), j = at(c.b.index + db), pa = course.centre[i], pb = course.centre[j];
          if (hypot(pa[0] - pb[0], pa[1] - pb[1]) <= Math.max(pa[2], pa[3]) + Math.max(pb[2], pb[3]) + 2 * EDGE + 2) { over.a.add(i); over.a.add(at(i - 1)); over.b.add(j); over.b.add(at(j - 1)); }
        }
        // 그 칸들을 촘촘히(0.1 m) 훑는다 — 점프대의 끊기기 직전처럼 2 m 간격의 점 사이에 있는 높이도 본다. → 가장 낮은 다리 높이 · 가장 높은 윗면
        const scan = cells => { let deckMin = Infinity, topMax = 0; for (const i of cells) for (let k = 0, m = Math.ceil(seg[i] / 0.1); k <= m; k++) { const s = Math.min(cum[i] + seg[i] * k / m, cum[i] + seg[i] - 1e-6), d = deckLift(s); deckMin = Math.min(deckMin, d); topMax = Math.max(topMax, d + rampLift(s)); }
          for (const r of ramps) { const end = r.at + r.length - 1e-6; if (cells.has(pointAt(end).index)) topMax = Math.max(topMax, deckLift(end) + rampLift(end)); }   // 점프대가 끊기기 직전(가장 높은 곳)
          return { deckMin, topMax }; };
        const A = scan(over.a), B = scan(over.b), upper = deckLift(c.a.s) > deckLift(c.b.s) ? 'a' : 'b', hi = upper === 'a' ? A : B, lo = upper === 'a' ? B : A;
        return { x: c.x, z: c.z, a: c.a.s, b: c.b.s, upper, gap: hi.deckMin >= OPEN ? hi.deckMin - THICK - lo.topMax : -Infinity };
      });
    },
  };
}

// 주행 계산이 보는 세계(약속 3.13): 높이로 층을 가른다. ground(x, z) = 얹은 것 없는 바닥 높이(지형 + LIFT.road).
//   heightAt(x, z, y)   y 높이에 있는 카트가 딛는 높이. y 를 안 주면 그 자리에서 가장 위.
//   ceilingAt(x, z, y)  머리 위 판의 밑면(없으면 Infinity)
//   boostAt(x, z, y)    그 층의 부스트 발판
//   walls               높이 범위(y0 · y1)가 붙은 벽
// pit: 피트레인(pit.js) — 주면 주행로의 벽이 들어가는 곳 · 나오는 곳에서 열리고 레인의 바깥 벽이 더해진다. 안 주면 그 전과 같다(컴퓨터 상대의 세계는 안 준다 — 피트에 안 들어간다).
export function createCourseWorld(parts, ground = () => 0, { pit = null } = {}) {
  const own = parts.fork();
  return {
    heightAt(x, z, y) { const g = ground(x, z); return g + own.liftAt(x, z, y === undefined ? undefined : y - g); },
    ceilingAt(x, z, y) { const g = ground(x, z); return g + own.ceilingAt(x, z, y === undefined ? undefined : y - g); },
    boostAt(x, z, y) { return own.boostAt(x, z, y === undefined ? undefined : y - ground(x, z)); },
    walls: createWallIndex(pit ? [...own.wallSpans(ground, pit.gapAt), ...pit.walls()] : own.wallSpans(ground), 8),
    // 기운 코너의 받침 힘(+ = 왼쪽으로 도는 것을 받친다) — 받침 힘이 있는 기운 코너가 있을 때만 둔다(없는 코스의 주행 계산은 이 칸을 모른다 — 비트까지 그 전과 같다)
    ...(own.banks.some(b => b.grip > 0) ? { bankAt(x, z, y) { return own.supportAt(x, z, y === undefined ? undefined : y - ground(x, z)); } } : {}),
  };
}
