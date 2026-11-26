// 느리면 해상도를 한 단계씩 내리는 조절기 — 순수 계산(약속 3.23). stage.js 가 화면마다 sample(now, active) 을 부르고, true 가 오면 ratio 를 다시 적용한다.
// 사용자 2026-11-21: "지금 근데 조작감이 살짝 둔해진 것 같은데 뭐지?" — 배터리(저전력 모드)에서 한 장 그리는 데 22 ~ 24 ms 가 걸려(1512×860 창 · 화면 배율 1.5)
//   초당 60장을 못 내고 30장으로 떨어져 있었다. 같은 장면이 배율 1.25 면 14 ms, 1 이면 8 ~ 16 ms 다. 주행 계산은 그대로였고 새 차량 모델 탓도 아니었다(옛 모델로 재도 같았다).
// 사용자 2026-11-23: "지금 렉이 좀 많이 걸려"(밤 화면을 넣은 뒤 · 맥북 저전력 모드) — 밤은 낮의 1.6배라 한 장이 약 36 ms 로 '초당 30장'의 한계(33.3 ms)를 넘는다.
//   그때의 규칙은 바닥까지 내려도 22 ms 를 못 벗어나면(30장으로 묶여 있으면 늘 그렇다) 무조건 처음 값으로 되돌렸다 → 20장에 머물렀다. 배율 1 이면 16 ms 라 30장을 지킬 수 있었다.
// 규칙
//   - 화면 사이 간격의 평균이 slowMs 를 넘는 채로 seconds 초가 가면 배율을 step 만큼 내린다(바닥 floor 까지).
//   - **다시 올리지는 않는다.** 올렸다 내렸다 하면 60장과 30장을 오가며 더 버벅인다. 새로 열거나 reset() 하면 처음 값부터다.
//   - 바닥까지 내려도 여전히 느릴 때: **내려서 화면 간격이 줄었으면(처음 배율에서 잰 값보다 gain 넘게) 내린 채로 둔다** — 해상도가 도운 것이다(30장으로 묶인 기계 · 그냥 느린 기계).
//     줄지 않았으면 해상도 탓이 아니다(브라우저가 30장으로 묶었는데 그릴 힘은 남아 있다 · 계산 쪽이 느리다) → 처음 값으로 되돌린다(흐려지기만 하고 얻는 것이 없으므로). 어느 쪽이든 그만둔다.
//     **내린 채로 둘 때는 한 번 되올린다(2026-11-26)**: 내려오며 배율마다 잰 화면 간격 가운데, 가장 짧은 것과 거의 같은(hold 안) 간격을 낸 **가장 높은 배율**로.
//       30장으로 묶인 맥북(저전력 모드)은 1.25 와 1 이 똑같이 33.3 ms 다 — 그 전에는 바닥(1)에 머물러 필요 이상으로 흐렸다(사용자: "맥북에서 … 화질도 살짝 다운된 것 같기도"). 올린 뒤에는 그만둔다.
//   - 탭이 쉬었거나 한 번 크게 멈춘 것(gap ms 넘는 간격)은 세지 않는다. active 가 false 인 동안(메뉴 · 멈춤)도 세지 않는다.
//   - 달리기 시작한 뒤 warm ms 동안은 세지 않는다(출발 직후에는 셰이더를 굽고 소리를 여느라 잠깐 느리다 — 그것으로 한 판 내내 흐려지면 안 된다).
//   - 배율을 바꾼 직후 settle ms 는 '그 배율의 화면 간격'으로 치지 않는다(그리기 대상을 다시 잡느라 한두 장이 밀린다).
//   - 한 번 올리기(lift — 휴대폰 자동 화질, 2026-11-25 사용자 '화질 추천대로'): lift() 를 주면, 아직 한 번도 안 내렸고 화면 간격의 평균이 fastMs 이하로
//     liftSeconds 초를 이어 가면 천장을 lift() 로 **한 번만** 올린다. 그 뒤로는 위 규칙대로 내리기만 한다(올렸다 내렸다 되풀이하지 않는다 — 깜빡임 막기).
//     보는 것은 화면 사이 간격(requestAnimationFrame 의 시각 차)뿐이다: 60장(16.7 ms) · 120장(8.3 ms)을 꾸준히 지키면 '넉넉하다'로 친다.
export const PACER = { slowMs: 22, seconds: 1.5, step: 0.25, window: 500, cool: 2500, gap: 200, warm: 2000, gain: 0.05, hold: 0.04, settle: 1000, fastMs: 18, liftSeconds: 10 };

// ceiling(): 지금 낼 수 있는 가장 높은 배율(품질 · 창 크기에서 온다 — 창 크기가 바뀌면 달라지므로 함수로 받는다). floor: 이 아래로는 안 내린다(책상 1 · 휴대폰 0.75).
// lift(): 넉넉할 때 한 번 올릴 천장(없으면 올리지 않는다 — 책상).
export function createPacer({ ceiling, floor = 1, lift = null, tuning = PACER } = {}) {
  const T = { ...PACER, ...tuning }; let lifted = false, fastFor = 0, cap = Infinity, last = null, since = null, sum = 0, n = 0, slow = 0, drops = 0, average = 0, done = false, restored = false, kept = false, raised = false, at = -Infinity;
  let seen = [];   // 내려오며 적는 것: [배율, 그 배율에서 잰 화면 간격]
  // 느린 동안의 화면 간격: heavy ÷ heavyTime = 지금 배율에서 잰 평균. first = 처음 배율에서 잰 값, best = 내린 배율들에서 잰 값 가운데 가장 짧은 것.
  let heavy = 0, heavyTime = 0, first = 0, best = Infinity;
  const top = () => lifted ? Math.max(ceiling(), lift()) : ceiling(), ratio = () => Math.min(top(), cap);
  const calm = () => { sum = 0; n = 0; slow = 0; heavy = 0; heavyTime = 0; };
  const rest = () => { last = null; since = null; calm(); };
  return {
    get ratio() { return ratio(); }, get drops() { return drops; }, get average() { return average; }, get done() { return done; }, get restored() { return restored; }, get kept() { return kept; }, get raised() { return raised; }, get lifted() { return lifted; },
    reset() { lifted = false; fastFor = 0; cap = Infinity; drops = 0; average = 0; done = false; restored = false; kept = false; raised = false; seen = []; at = -Infinity; first = 0; best = Infinity; rest(); },
    // → 배율이 바뀌었으면 true
    sample(now, active = true) {
      if (done || !active || !Number.isFinite(now)) { rest(); return false; }
      const delta = last === null ? 0 : now - last; last = now; if (since === null) since = now;
      if (delta <= 0 || delta > T.gap || now - since < T.warm) { calm(); return false; }
      sum += delta; n++; if (sum < T.window) return false;
      average = sum / n; const seconds = sum / 1000; sum = 0; n = 0;
      if (average > T.slowMs) { slow += seconds; if (now - at >= T.settle) { heavy += average * seconds; heavyTime += seconds; } } else { slow = 0; heavy = 0; heavyTime = 0; }
      // 한 번 올리기: 내린 적 없고 · 꾸준히 빠르면(위 주석)
      if (lift && !lifted && !drops) {
        fastFor = average <= T.fastMs ? fastFor + seconds : 0;
        if (fastFor >= T.liftSeconds && now - at >= T.cool && lift() > ratio() + 0.01) { lifted = true; fastFor = 0; at = now; calm(); return true; }
      }
      if (slow < T.seconds || now - at < T.cool) return false;
      const measured = heavyTime ? heavy / heavyTime : average; slow = 0; heavy = 0; heavyTime = 0;
      if (drops) best = Math.min(best, measured); else first = measured;
      const cur = ratio(), low = Math.min(cur, floor), next = Math.max(low, cur - T.step); seen.push([cur, measured]);
      if (next < cur - 0.01) { cap = next; drops++; at = now; return true; }
      done = true; if (!drops) return false;                                   // 더 내릴 곳이 없는데도 느리다
      if (best <= first * (1 - T.gain)) {                                      // 내려서 화면 간격이 줄었다 → 내린 채로 둔다
        kept = true;
        // 가장 짧은 간격과 거의 같은 간격을 낸 가장 높은 배율로 한 번 되올린다(위 주석). 처음 배율은 gain > hold 라 여기에 들지 않는다.
        const up = Math.max(...seen.filter(([, ms]) => ms <= best * (1 + T.hold)).map(([r]) => r));
        if (up > cur + 0.01) { cap = up; raised = true; at = now; return true; }
        return false;
      }
      cap = Infinity; restored = true; return true;                            // 줄지 않았다 → 처음 값으로
    },
  };
}
