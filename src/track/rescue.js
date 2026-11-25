// 길 밖으로 나간 카트를 되돌려 놓는다 — 난간 없는 다리에서 떨어졌을 때, 그리고 다른 까닭으로 길을 벗어났을 때의 안전망.
// THREE 를 쓰지 않는 순수 계산이다(주행 계산 · Node 시험 · 컴퓨터 상대가 같이 쓴다).
//   const rescue = createRescue({ course, parts, ground });     ground(x, z) = 얹은 것 없는 바닥 높이(세계를 만들 때 준 것과 같은 것)
//   const watch = rescue.watcher();                              카트마다 하나
//   매 틱(주행 계산 뒤):  const back = watch.update(sim.state, dt);
//                         if (back) { sim.reset(back); sim.state.speed = back.speed; … 랩 시계 · 자동 운전에도 back.index 를 알려 준다 }
// '길 위'의 뜻: 따라온 제 구간의 통로(상판 가장자리까지) 안에 있고, 그 길의 높이에서 below 넘게 내려가지 않았다.
//   - 떠 있는 것(점프)은 길 위다. 다리에서 떨어져 그 밑의 땅이나 다른 길에 내린 것은 길 밖이다(제 구간의 높이보다 한참 아래).
//   - 길을 벗어난 채 delay 초가 지나면 마지막으로 땅에 붙어 있던 자리에서 back m 앞(뒤쪽)에, 길 가운데로, 길 방향을 보게 놓는다.
import { createLocator } from './track.js';
import { PART_SOLID } from './parts.js';

export const RESCUE = {
  delay: 0.9,      // 길을 벗어난 뒤 이만큼 지나면 되돌린다(초) — 떨어지는 것이 보일 만큼
  back: 9,         // 벗어난 자리에서 이만큼 뒤로(m) — 그 코너를 다시 들어가게
  below: 1.2,      // 제 길의 높이에서 이보다 더 내려가면 길 밖(m)
  speed: 5,        // 되돌려 놓았을 때의 속도(m/s)
  near: 20,        // 따라온 칸에서 이 번호 차 안이어야 제 구간이다(중심선 점 수)
};

// also(x, z): 주행로의 통로 밖이지만 길 위로 칠 자리면 { index, s, lateral }(피트레인 — pit.beyond + pit.locate), 아니면 null
export function createRescue({ course, parts, ground = () => 0, locator = null, tuning = RESCUE, also = null }) {
  const loc = locator || createLocator(course), { n } = loc, length = loc.length, T = { ...RESCUE, ...tuning }, where = {};
  const wrap = s => ((s % length) + length) % length, apart = (i, j) => { const d = Math.abs(i - j); return Math.min(d, n - d); };
  // 그 자리(x, z)와 높이(y)가 칸 hint 를 따라온 제 길 위인가 → 길 위면 그 칸의 위치, 아니면 null
  // 세계가 바닥을 정할 때와 같은 칸 찾기(통로를 상판 가장자리만큼 넓힌 칸 — cellsAt)를 쓴다: 굽은 곳의 가장자리에서 바닥은 '다리 위'인데 여기서는 '길 밖'이 되는 일이 없게.
  const found = [];
  function onTrack(x, z, y, hint) {
    const count = loc.cellsAt(x, z, PART_SOLID.edge, found), rel = y - ground(x, z); let best = null, bestGap = Infinity;
    for (let k = 0; k < count; k++) {
      // 길의 높이: 공중 구간 + 기운 코너(그 옆 자리의 높이 — 낮아진 가장자리를 '떨어졌다'로 읽지 않게) + 점프대
      const p = found[k], top = parts.deckLift(p.s) + (parts.bankLift ? parts.bankLift(p.s, p.lateral) : 0) + parts.rampLift(p.s), gap = hint >= 0 ? apart(p.index, hint) : Math.abs(rel - top);
      if (hint >= 0 && gap > T.near) continue;                                            // 다른 구간(겹친 길의 다른 층 · 멀리 떨어진 길)
      if (rel < top - T.below) continue;                                                  // 제 길보다 한참 아래(다리에서 떨어졌다)
      if (gap < bestGap) { bestGap = gap; best = p; }                                     // 따라온 칸에 가장 가까운 것(칸을 모르면 높이가 가장 맞는 것)
    }
    if (best) return { index: best.index, s: best.s, lateral: best.lateral, t: best.t };
    const extra = also ? also(x, z) : null;   // 피트레인: 높이는 땅과 같다(다리 위에는 안 낸다)
    return extra ? { index: extra.index, s: extra.s, lateral: extra.lateral, t: 0 } : null;
  }
  // s 자리의 길 가운데에 놓을 자세
  function poseAt(s) {
    s = wrap(s); const at = parts.pointAt(s, 0);
    return { x: at.x, z: at.z, heading: at.heading, y: ground(at.x, at.z) + parts.deckLift(s) + parts.rampLift(s), index: at.index, s, speed: T.speed };
  }
  return {
    onTrack, poseAt,
    watcher() {
      let index = -1, safe = null, off = 0;
      return {
        get index() { return index; }, get safe() { return safe; }, get off() { return off; },
        // 카트를 옮겨 놓았을 때(출발 · 되돌려 놓기 · 검증): 그 칸부터 따라간다
        // 검증 · 다시 계산(src/race/time-trial.js): 기록점의 값을 그대로 넣는다
        load(v) { index = v.index; safe = v.safe; off = v.off; },
        reset(at = -1) { index = Number.isInteger(at) && at >= 0 && at < n ? at : -1; safe = null; off = 0; },
        update(st, dt) {
          const p = onTrack(st.x, st.z, st.y, index);
          if (p) { index = p.index; off = 0; if (st.grounded) safe = p.s; return null; }
          off += dt; if (off < T.delay) return null;
          // 마지막으로 땅에 붙어 있던 자리(없으면 따라온 칸)에서 조금 뒤에 놓는다
          const from = safe ?? (index >= 0 ? loc.cum[index] : loc.progress(st.x, st.z, -1, where).s), back = poseAt(from - T.back);
          index = back.index; safe = back.s; off = 0;
          return back;
        },
      };
    },
  };
}
