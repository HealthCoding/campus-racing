// 무전 — 언제 무엇을 말할지 정하는 순수 계산(THREE · DOM 없음, Node 시험이 돈다). 트는 일은 src/radio.js.
//   const calls = createRadioCalls({ rivals: RIVALS });   // [{ id: 'r1', name }, …] — 조각 이름 ahead-r1 · behind-r1 의 id 와 같다
//   const msg = calls.update(snapshot);                   // 화면마다(또는 초에 몇 번) → null | { clips: [...], priority, ttl, why }
//   if (msg) radio.say(msg.clips, msg);
//   calls.reset();                                        // 새 판
// snapshot(메인이 채운다):
//   { time: 출발 신호부터 초, phase: 'racing' | 'finished'(그 밖이면 아무 말 안 함), rank: 1~, count: 대수, lap: 1부터, laps: 바퀴 수, finished: 끝냈으면 true,
//     ahead: { id, gap: 초 } | null, behind: { id, gap: 초 } | null, car: 0~100 | null(차 상태 — 없는 모드는 null),
//     pit: { inLane, repairing } | null, startBoost: 출발 가속을 받았으면 true }
// 말하는 때(값은 RADIO_CALLS):
//   출발 4초 뒤(10초가 넘어서 처음 불렸으면 건너뜀) — (출발 가속을 받았으면 '출발 좋았어요.') + 순위
//   바퀴가 바뀔 때 — 순위 + 앞차(1등이면 뒤차)와의 차. 마지막 바퀴는 '마지막 바퀴예요.' 를 먼저, 끝에 앞차가 1초 안이면 '조금만 더 밀어요.' · 1등이고 뒤차가 2초 밖이면 '지금처럼 가요.'
//   순위가 바뀌어 1초 그대로면 — '한 대 잡았어요.' / '한 대 내줬어요.' + 순위 + 앞차(1등이면 뒤차). 출발 8초 뒤부터(rankFrom) — 출발 직후에는 자리가 계속 바뀐다:
//     맨 뒤에서 출발해 2초 만에 '한 대 잡았어요'가 먼저 나와서, 출발 무전(4초 — 순위를 말한다)이 그 구간을 맡게 했다(2026-11-21 게임에 붙여 보고 메인이 넣음)
//   뒤차가 0.6초 안으로 들어올 때(0.9초 밖으로 나가야 다시 걸림 · 말한 지 12초 넘어야 · 출발 8초 뒤부터) — '뒤에 ○○, 0.4초. 바짝 붙었어요.'
//   차 상태가 15 아래로 — '차 상태가 안 좋아요 …' 한 번(60 이상으로 고쳐지면 다시 걸림). 피트에서 수리가 끝나면 — '수리 끝. 나가요.'
//   결승 — 1등이면 '1등으로 들어왔어요!', 아니면 순위 + '수고했어요.' 그 뒤로는 말하지 않는다.
// 덜 수다스럽게: 무전 사이 최소 4초(결승 · 차 상태는 예외), 같은 말을 20초 안에 되풀이하지 않음(결승 · 차 상태는 예외), 못 한 말은 ttl 이 지나면 버림,
//   말할 내용은 말하는 순간의 snapshot 으로 만든다(그사이 순위가 되돌아갔으면 추월 무전은 버림). 차이가 5초를 넘으면 앞뒤 차 말은 통째로 뺀다.
export const RADIO_CALLS = {
  startAt: 4, startLate: 10, minGap: 4, repeat: 20, rankHold: 1, rankFrom: 8,
  closeIn: 0.6, closeOut: 0.9, closeCooldown: 12, closeFrom: 8,
  damage: 15, damageRearm: 60, maxGap: 5, pushGap: 1, keepGap: 2,
  kinds: {   // priority · ttl(초) · urgent(최소 간격을 무시)
    finish: { priority: 3, ttl: 5, urgent: true },
    damage: { priority: 3, ttl: 6, urgent: true },
    pitout: { priority: 2, ttl: 3 },
    lap: { priority: 2, ttl: 3 },
    gain: { priority: 1, ttl: 2.5 },
    lost: { priority: 1, ttl: 2.5 },
    close: { priority: 1, ttl: 1.5 },
    start: { priority: 1, ttl: 3 },
  },
};
const RANKS = 8;

// 초 → 조각 이름: 0.2 아래는 0.2, 3.0 까지는 0.1 간격 반올림, 그 위는 0.5 간격(3.5 · 4.0 · 4.5 · 5.0), 5초를 넘거나 숫자가 아니면 null
export function gapClip(seconds, max = RADIO_CALLS.maxGap) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > max) return null;
  if (seconds < 0.2) return 'gap-02';
  let r = Math.round(seconds * 10) / 10;
  if (r > 3) r = Math.max(3, Math.round(seconds * 2) / 2);
  return 'gap-' + String(Math.round(Math.min(r, 5) * 10)).padStart(2, '0');
}
export const rankClip = rank => Number.isInteger(rank) && rank >= 1 && rank <= RANKS ? 'rank-' + rank : null;

export function createRadioCalls({ rivals = [], tuning = RADIO_CALLS } = {}) {
  const T = tuning, known = new Set(rivals.map(r => r.id));
  let S;
  const reset = () => { S = { init: false, lastSayAt: -Infinity, lastKey: '', lastKeyAt: -Infinity, pending: new Map(), spokenRank: null, rankCand: null, rankSince: 0, prevLap: 0,
    startDone: false, closeArmed: true, lastCloseAt: -Infinity, damageArmed: true, prevRepairing: false, finishDone: false }; };
  reset();
  // 앞뒤 차: 1등이면(또는 앞차가 없으면) 뒤차, 아니면 앞차. 모르는 상대 · 5초 넘는 차면 뺀다.
  function relation(s) {
    const other = s.rank === 1 || !s.ahead ? s.behind : s.ahead, side = other === s.ahead && s.rank !== 1 ? 'ahead' : 'behind';
    if (!other || !known.has(other.id)) return [];
    const g = gapClip(other.gap, T.maxGap); return g ? [`${side}-${other.id}`, g] : [];
  }
  const tail = s => {   // 마지막 바퀴의 한마디
    if (s.rank > 1 && s.ahead && Number.isFinite(s.ahead.gap) && s.ahead.gap <= T.pushGap) return ['line-push'];
    if (s.rank === 1 && (!s.behind || !(s.behind.gap < T.keepGap))) return ['line-keep'];
    return [];
  };
  const BUILD = {
    start: s => { const r = rankClip(s.rank); return s.startBoost ? ['line-start', ...(r ? [r] : [])] : r ? [r] : null; },
    lap: s => { const r = rankClip(s.rank); if (!r) return null; const last = s.laps > 1 && s.lap === s.laps; return [...(last ? ['line-lastlap'] : []), r, ...relation(s), ...(last ? tail(s) : [])]; },
    gain: s => s.rank < S.spokenRank && rankClip(s.rank) ? ['line-gain', rankClip(s.rank), ...relation(s)] : null,
    lost: s => s.rank > S.spokenRank && rankClip(s.rank) ? ['line-lost', rankClip(s.rank), ...relation(s)] : null,
    close: s => {
      const b = s.behind; if (!b || !(b.gap < T.closeOut)) return null;
      const g = gapClip(b.gap, T.maxGap); return known.has(b.id) && g ? [`behind-${b.id}`, g, 'line-close'] : ['line-close'];
    },
    damage: () => ['line-damage'],
    pitout: () => ['line-pitout'],
    finish: s => s.rank === 1 ? ['line-win'] : [...(rankClip(s.rank) ? [rankClip(s.rank)] : []), 'line-thanks'],
  };
  const want = (kind, t) => S.pending.set(kind, { kind, born: t, ...T.kinds[kind] });

  function update(s) {
    if (!s || (s.phase !== 'racing' && s.phase !== 'finished')) return null;
    const t = +s.time || 0, done = !!s.finished || s.phase === 'finished';
    if (!S.init) { S.init = true; S.prevLap = s.lap; S.spokenRank = s.rank; S.prevRepairing = !!s.pit?.repairing; }
    // ── 무엇이 일어났나 ──
    if (done) {
      if (S.finishDone) return null;
      S.finishDone = true; S.pending.clear(); want('finish', t);
    } else {
      if (!S.startDone && t >= T.startAt) { S.startDone = true; if (t <= T.startLate) want('start', t); }
      if (s.lap > S.prevLap) want('lap', t);
      S.prevLap = s.lap;
      if (s.rank === S.spokenRank) S.rankCand = null;
      else if (s.rank !== S.rankCand) { S.rankCand = s.rank; S.rankSince = t; }
      else if (t - S.rankSince >= T.rankHold && t >= T.rankFrom) { want(s.rank < S.spokenRank ? 'gain' : 'lost', t); S.pending.delete(s.rank < S.spokenRank ? 'lost' : 'gain'); S.rankCand = null; }
      const b = s.behind;
      if (!b || !(b.gap < T.closeOut)) S.closeArmed = true;
      else if (b.gap < T.closeIn && S.closeArmed && t >= T.closeFrom && t - S.lastCloseAt >= T.closeCooldown) { S.closeArmed = false; want('close', t); }
      if (s.car != null && Number.isFinite(s.car)) {
        if (s.car >= T.damageRearm) S.damageArmed = true;
        else if (s.car < T.damage && S.damageArmed) { S.damageArmed = false; want('damage', t); }
      }
      const repairing = !!s.pit?.repairing;
      if (S.prevRepairing && !repairing && s.pit) want('pitout', t);
      S.prevRepairing = repairing;
    }
    // ── 무엇을 말하나: 묵은 것을 버리고 priority 가 높은 것(같으면 먼저 생긴 것)부터 ──
    for (const [k, c] of S.pending) if (t - c.born > c.ttl) S.pending.delete(k);
    const order = [...S.pending.values()].sort((a, b) => b.priority - a.priority || a.born - b.born);
    for (const c of order) {
      if (!c.urgent && t - S.lastSayAt < T.minGap) continue;
      S.pending.delete(c.kind);
      const clips = BUILD[c.kind](s); if (!clips || !clips.length) continue;
      const key = clips.join(' ');
      if (!c.urgent && key === S.lastKey && t - S.lastKeyAt < T.repeat) continue;
      S.lastSayAt = t; S.lastKey = key; S.lastKeyAt = t;
      if (clips.some(x => x.startsWith('rank-'))) { S.spokenRank = s.rank; S.rankCand = null; S.pending.delete('gain'); S.pending.delete('lost'); }
      if (c.kind === 'close') S.lastCloseAt = t;
      return { clips, priority: c.priority, ttl: c.ttl, why: c.kind };
    }
    return null;
  }
  return { update, reset };
}
