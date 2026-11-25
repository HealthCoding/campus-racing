// 피트레인 — 주행로 옆으로 갈라졌다가 다시 합쳐지는 좁은 길(약속 3.18). THREE 를 쓰지 않는 순수 계산이다: 주행 계산의 벽 · 길 위 판정 · 수리 규칙 · 그리기 · Node 시험이 같이 쓴다.
//   const pit = createPit(course, parts, data);        data = course-b.pit.js, parts = createParts(course, …) (pointAt 만 쓴다)
// 좌표: s = 출발선부터 잰 거리, lateral = 중심선에서 오른쪽 +. 레인이 출발선을 넘어 이어지므로 안에서는 '이어 센 거리' u 를 쓴다:
//   u = s (갈라지는 쪽: s ≥ split) 또는 s + 코스 길이(출발선을 넘은 뒤). 레인은 u = from(split) ~ to(join + 길이).
// 모양: inner(u) = 레인의 안쪽(주행로 쪽) 가장자리, outer(u) = 바깥 가장자리 = inner + width. 방호벽으로 나뉜 구간(wall[0] ~ wall[1])에서는 inner = 길 가장자리 + shoulder.
//   들어가는 곳(from ~ wall[0])과 나오는 곳(wall[1] ~ to)에서는 길 가장자리 안쪽 inset 에서 바깥으로 부드럽게 옮겨 간다 — 그 구간의 주행로 방호벽은 없다(gapAt).
// 지금은 오른쪽(side: 'right')만 낸다.
import { hypot } from '../shared/dmath.js';   // 결정적 수학
const smooth = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

export function createPit(course, parts, data) {
  if (!data) return null;
  if (data.side && data.side !== 'right') throw new Error('피트레인은 오른쪽만 낼 수 있다: ' + data.side);
  const L = course.length, mod = s => ((s % L) + L) % L, C = course.centre, n = C.length;
  const up = (s, base) => (s < base ? s + L : s);                       // base 뒤로 이어 센 거리
  const from = data.split, wall = [data.wallFrom, up(data.wallTo, data.split)], to = up(data.join, data.split);
  const F = data.funnel ?? 6, W = data.width, SH = data.shoulder, IN = data.inset ?? 3;
  if (!(from < wall[0] && wall[0] < wall[1] && wall[1] < to && to - from < L / 2)) throw new Error('피트레인 자료의 순서가 맞지 않다(split < wallFrom < wallTo < join)');
  // 1 m 마다 표로 구워 둔다(길 위 판정은 틱마다 불린다): 길 가장자리 · 레인 안쪽 · 바깥쪽 · 바깥 벽
  const U0 = Math.floor(from - F - 2), U1 = Math.ceil(to + F + 2), N = U1 - U0;
  const edgeT = new Float64Array(N + 1), innerT = new Float64Array(N + 1), outerT = new Float64Array(N + 1), wallT = new Float64Array(N + 1);
  const shape = (u, R) => u < wall[0] ? R - IN + (IN + SH) * smooth((u - from) / (wall[0] - from)) : u > wall[1] ? R - IN + (IN + SH) * smooth((to - u) / (to - wall[1])) : R + SH;
  for (let k = 0; k <= N; k++) {
    const u = U0 + k, R = parts.pointAt(mod(u), 0).right, uc = Math.min(to, Math.max(from, u)), Rc = uc === u ? R : parts.pointAt(mod(uc), 0).right;
    edgeT[k] = R; innerT[k] = shape(uc, Rc) - Rc + R; outerT[k] = innerT[k] + W;
    // 바깥 벽: 갈라지는 곳 앞 F m 에서 주행로의 벽 자리(R)를 떠나 바깥 가장자리로 벌어지고, 합친 뒤 F m 에서 돌아온다
    const open = u < from ? smooth((u - (from - F)) / F) : u > to ? smooth(((to + F) - u) / F) : 1;
    wallT[k] = R + (outerT[k] - R) * open;
  }
  const at = (table, u) => { const f = Math.min(N, Math.max(0, u - U0)), k = Math.min(N - 1, Math.floor(f)), t = f - k; return table[k] + (table[k + 1] - table[k]) * t; };
  const edge = u => at(edgeT, u), inner = u => at(innerT, u), outer = u => at(outerT, u);

  // 중심선 가운데 레인 둘레의 선분(위치 찾기용) — 번호와 그 선분이 시작하는 u
  const cum = new Float64Array(n + 1); for (let i = 0; i < n; i++) { const j = (i + 1) % n; cum[i + 1] = cum[i] + hypot(C[j][0] - C[i][0], C[j][1] - C[i][1]); }
  const segs = []; let box = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const s0 = cum[i], s1 = cum[i + 1], u0 = s1 > from - F - 4 ? s0 : s0 + L, u1 = u0 + (s1 - s0);
    if (u1 < U0 || u0 > U1) continue;
    const j = (i + 1) % n, ax = C[i][0], az = C[i][1], ex = C[j][0] - ax, ez = C[j][1] - az, l = hypot(ex, ez) || 1e-9;
    segs.push({ i, u0, l, ax, az, dx: ex / l, dz: ez / l });
    const reach = Math.max(C[i][3], C[j][3]) + SH + W + 4;
    box = [Math.min(box[0], ax - reach, C[j][0] - reach), Math.min(box[1], az - reach, C[j][1] - reach), Math.max(box[2], ax + reach, C[j][0] + reach), Math.max(box[3], az + reach, C[j][1] + reach)];
  }
  // (x, z) → 레인 둘레에서의 자리 { u, s, lateral, index } | null(레인 둘레가 아니다)
  const found = { u: 0, s: 0, lateral: 0, index: 0 };
  function locate(x, z, out = found) {
    if (x < box[0] || x > box[2] || z < box[1] || z > box[3]) return null;
    let best = Infinity, hit = null, bt = 0, bl = 0;
    for (const g of segs) {
      const ox = x - g.ax, oz = z - g.az; let t = (ox * g.dx + oz * g.dz) / g.l; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ox - g.dx * g.l * t, qz = oz - g.dz * g.l * t, d = qx * qx + qz * qz;
      if (d < best) { best = d; hit = g; bt = t; bl = -qx * g.dz + qz * g.dx; }
    }
    if (!hit) return null;
    out.u = hit.u0 + hit.l * bt; out.s = mod(out.u); out.lateral = bl; out.index = hit.i;
    return out;
  }
  const tmp = { u: 0, s: 0, lateral: 0, index: 0 };
  // 레인 안인가(바닥의 띠: 안쪽 ~ 바깥쪽 가장자리, margin 만큼 넉넉히). 들어가는 곳 · 나오는 곳에서는 주행로와 겹친다.
  function contains(x, z, margin = 0) {
    const p = locate(x, z, tmp); if (!p) return false;
    return p.u >= from - margin && p.u <= to + margin && p.lateral >= inner(p.u) - margin && p.lateral <= outer(p.u) + margin;
  }
  // 주행로 밖의 레인인가(길 가장자리 너머 ~ 바깥 벽). 길 위 판정 · 나무 감추기에 쓴다 — 주행로와 겹치는 곳은 주행로가 이미 맡는다.
  function beyond(x, z, margin = 0) {
    const p = locate(x, z, tmp); if (!p) return false;
    return p.u >= from - F - margin && p.u <= to + F + margin && p.lateral > edge(p.u) - 0.05 && p.lateral <= at(wallT, p.u) + margin;
  }
  // 주행로의 벽 · 방호벽은 중심선의 선분 단위로 빠진다(gapAt 은 선분의 가운데로 본다) → 실제로 끊기는 자리는 그 선분들의 경계다.
  //   barrier: 주행로의 오른쪽 벽이 끊기는 곳 ~ 다시 이어지는 곳(바깥 벽이 여기서 시작하고 끝난다), divider: 주행로와 레인을 가르는 벽이 있는 구간.
  const gap = u => (u >= from - F && u <= wall[0]) || (u >= wall[1] && u <= to + F);
  const joints = { barrierFrom: from - F, barrierTo: to + F, dividerFrom: wall[0], dividerTo: wall[1] };
  { let first = true, was = false; for (const g of segs.slice().sort((p, q) => p.u0 - q.u0)) { const open = gap(g.u0 + g.l / 2);
      if (open && !was) { if (first) { joints.barrierFrom = g.u0; first = false; } else joints.dividerTo = g.u0; }
      if (!open && was) { if (joints.dividerFrom === wall[0] && g.u0 < wall[1]) joints.dividerFrom = g.u0; else joints.barrierTo = g.u0; }
      was = open; } }
  const boxes = (data.boxes || []).map((b, k) => { const u0 = up(b, data.split), u1 = u0 + (data.boxLength ?? 6); return { index: k, from: u0, to: u1 }; });
  const limit = [up(data.limitFrom ?? data.wallFrom, data.split), up(data.limitTo ?? data.wallTo, data.split)];
  return {
    data, length: L, from, to, wall, funnel: F, width: W, shoulder: SH, limit: { speed: data.limit ?? 60 / 3.6, from: limit[0], to: limit[1] }, boxes,
    inner, outer, edge, wallAt: u => at(wallT, u), locate, contains, beyond,
    // 주행로의 거리 s → 이어 센 거리 u (레인 둘레가 아니면 null)
    uOf(s) { const u = s >= from - F - 4 ? s : s + L; return u >= U0 && u <= U1 ? u : null; },
    pointAt: (u, lateral) => parts.pointAt(mod(u), lateral),
    // 주행로의 그쪽 방호벽이 없는 자리인가: 들어가는 곳 · 나오는 곳(오른쪽만)
    // 바깥 벽이 주행로의 벽 자리에서 벌어져 나가는 곳(from − funnel)부터 연다 — 갈라지는 곳(from)에서 열면 바깥 벽과 주행로의 벽 사이에 막다른 쐐기가 생겨, 레인의 바깥쪽 반으로 온 카트가 벽 끝에 걸린다.
    gapAt(s, side) { if (side !== 'right') return false; return gap(s >= from - F - 2 ? s : s + L); },
    joints,
    // 레인 안에서 제한 속도가 걸리는 자리인가(방호벽으로 나뉜 구간의 제한 줄 사이)
    limited(u, lateral) { return u >= limit[0] && u <= limit[1] && lateral > edge(u); },
    // 정차 칸 번호(없으면 −1): 칸의 앞뒤 안, 레인의 폭 안
    boxAt(u, lateral) { if (lateral < inner(u) || lateral > outer(u)) return -1; for (const b of boxes) if (u >= b.from && u <= b.to) return b.index; return -1; },
    // 레인의 바깥 벽(주행 계산용 선분). 주행로의 벽 자리에서 벌어져 나가 바깥 가장자리를 따라가다 다시 붙는다. step m 마다 끊는다.
    walls(step = 2) {
      const out = [], a = Math.min(from - F, joints.barrierFrom), b = Math.max(to + F, joints.barrierTo), count = Math.max(1, Math.ceil((b - a) / step));   // 주행로의 벽이 실제로 끊긴 자리에서 이어받는다
      let prev = parts.pointAt(mod(a), at(wallT, a));
      for (let k = 1; k <= count; k++) { const u = a + (b - a) * k / count, p = parts.pointAt(mod(u), at(wallT, u)); out.push({ ax: prev.x, az: prev.z, bx: p.x, bz: p.z, kind: 'pit', u: u - (b - a) / count / 2 }); prev = p; }
      return out;
    },
  };
}

// 피트로 들어갔다 나오는 주행선(자동 운전 · 시험 · 진단용): 중심선의 점마다, 레인 둘레에서는 레인 가운데로 옮긴 점. 점 수와 번호는 중심선과 같다.
// lead: 갈라지는 곳 앞 · 합친 곳 뒤로 이만큼(m)에 걸쳐 중심선에서 옮겨 간다.
export function pitLine(course, pit, { lead = 24 } = {}) {
  const C = course.centre, n = C.length, L = course.length, out = [], mid = u => (pit.inner(u) + pit.outer(u)) / 2, centre = (pit.from + pit.to) / 2; let cum = 0;
  // 레인 가운데에서 가까운 쪽으로 이어 센 거리 — 옮겨 가는 구간(lead)이 출발선에 걸쳐도 끊기지 않는다(uOf 는 레인 둘레의 표 안에서만 값을 준다)
  const near = s => { let d = (s - centre) % L; if (d > L / 2) d -= L; else if (d < -L / 2) d += L; return centre + d; };
  for (let i = 0; i < n; i++) {
    const a = C[(i - 1 + n) % n], b = C[(i + 1) % n], c = C[i], fx = b[0] - a[0], fz = b[1] - a[1], l = hypot(fx, fz) || 1, u = near(cum);
    let off = 0;
    if (u > pit.from - lead && u < pit.to + lead) off = u >= pit.from && u <= pit.to ? mid(u) : u < pit.from ? mid(pit.from) * smooth((u - (pit.from - lead)) / lead) : mid(pit.to) * smooth((pit.to + lead - u) / lead);
    out.push([c[0] - fz / l * off, c[1] + fx / l * off, c[2], c[3]]);
    cum += hypot(C[(i + 1) % n][0] - c[0], C[(i + 1) % n][1] - c[1]);
  }
  return out;
}
