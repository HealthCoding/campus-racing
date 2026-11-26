// 브라우저가 화면을 초당 30장으로 묶었는가 — 순수 계산(약속 3.39). main.js 가 requestAnimationFrame 의 시각을 넣는다.
// 사용자 2026-11-26: "저전력 모드 시에는 끊김이 생길 수 있다는 문구를 넣어야하나?" → "주행화면에 얹는게 아니라 그냥 시작화면에서" —
//   묶인 기기의 시작 화면에만 한 줄('저전력 모드에서는 화면이 끊길 수 있어요')을 보인다.
// 브라우저는 저전력 모드인지 알려 주지 않는다. 알 수 있는 것은 '화면을 부르는 간격'뿐이다:
//   - 묶이지 않은 브라우저는 한가한 순간에 화면 주기대로 부른다(60 Hz 면 16.7 ms). **짧은 간격을 한 번이라도 보면 묶인 것이 아니다**(open).
//   - 묶인 브라우저(맥 · 아이폰의 저전력 모드, 크롬의 절전 모드, 30 Hz 화면)는 아무리 한가해도 33.3 ms 보다 짧게 부르지 않는다.
//   - **그리는 중의 간격은 '묶였다'의 증거가 못 된다**: 느린 기계도 60 Hz 화면에서는 한 장씩 밀려 꼭 33.3 ms 가 된다(pacer.js 가 다루는 것).
//     그래서 '묶였다'는 **한가한 장**(quiet — 첫 화면을 그리기 전에 아무것도 안 그리고 보낸 몇 장)의 간격으로만 센다. 그리는 중의 간격은 '안 묶였다' 쪽으로만 쓴다.
// capMs ~ maxMs: 30장(33.3 ms)으로 치는 범위. 50 Hz 화면(20 ms)과 넉넉히 떨어져 있고, 시각이 1 ms 로 뭉개지는 브라우저(33 · 34 ms)와 조금 흔들리는 것을 받는다.
// need: 한가한 장 가운데 그 범위에 든 것이 이만큼은 있어야 한다. gap: 이보다 긴 간격은 탭이 쉬었거나 크게 멈춘 것 — 세지 않는다.
export const CAP = { capMs: 27, maxMs: 40, need: 5, gap: 100 };

export function createCapProbe(tuning = {}) {
  const T = { ...CAP, ...tuning }; let last = null, min = Infinity, hits = 0;
  return {
    // now: requestAnimationFrame 이 준 시각(ms). quiet: 아무것도 안 그리는 한가한 장인가. visible: 탭이 보이는가(숨은 동안은 잇지 않는다).
    sample(now, quiet = false, visible = true) {
      if (!visible || !Number.isFinite(now)) { last = null; return; }
      const delta = last === null ? 0 : now - last; last = now;
      if (delta <= 0 || delta > T.gap) return;
      if (delta < min) min = delta;
      if (quiet && delta >= T.capMs && delta <= T.maxMs) hits++;
    },
    // 다음 sample 은 간격을 재지 않고 기준만 잡는다(무거운 일을 한 직후 — 그 사이의 긴 간격을 세지 않게)
    mark() { last = null; },
    get min() { return min; }, get hits() { return hits; },
    get open() { return min < T.capMs; },                                   // 짧은 간격을 봤다 → 묶이지 않았다
    get capped() { return hits >= T.need && min >= T.capMs; },              // 한가한 장이 다 30장 간격이고, 그보다 짧은 간격을 본 적이 없다
    reset() { last = null; min = Infinity; hits = 0; },
  };
}

// 그리는 중의 화면 간격이 꾸준히 긴가(느린가) — 순수 계산. '느린 노트북'을 가리는 데 쓴다.
// 2026-11-26 사용자(맥북 · 저전력 모드 · 미리보기): "일단 저전력 모든데 안떠" — 맥의 크롬은 저전력 모드에서 화면을 묶지 않는다(30장으로 묶는 것은 사파리와 아이폰이다).
//   대신 그리는 힘이 줄어 한 장이 22 ~ 36 ms 가 걸려 30장 · 20장으로 떨어진다(약속 3.23 의 그 맥북). 그래서 시작 화면을 **실제로 그리는 간격**도 본다:
//   평균이 slowMs 를 넘는 채로 seconds 초가 가면 느리다(slow). 평균이 fastMs 아래로 clear 초를 이어 가면 다시 푼다(충전기를 꽂았다 · 조절기가 해상도를 내려 빨라졌다).
//   처음 warm ms 와 gap ms 넘는 간격(탭이 쉬었다 · 크게 멈췄다)은 세지 않는다. active 가 false 인 동안(시작 화면이 아닐 때)은 재지 않고 판정은 그대로 둔다.
export const SLOW = { slowMs: 22, fastMs: 19, seconds: 2, clear: 3, warm: 1500, gap: 200, window: 500 };

export function createSlowWatch(tuning = {}) {
  const T = { ...SLOW, ...tuning }; let last = null, since = null, sum = 0, n = 0, slowFor = 0, fastFor = 0, slow = false, average = 0;
  const rest = () => { last = null; since = null; sum = 0; n = 0; slowFor = 0; fastFor = 0; };
  return {
    // → 지금의 판정(slow)
    sample(now, active = true) {
      if (!active || !Number.isFinite(now)) { rest(); return slow; }
      const delta = last === null ? 0 : now - last; last = now; if (since === null) since = now;
      if (delta <= 0 || delta > T.gap || now - since < T.warm) { sum = 0; n = 0; return slow; }
      sum += delta; n++; if (sum < T.window) return slow;
      average = sum / n; const seconds = sum / 1000; sum = 0; n = 0;
      if (average > T.slowMs) { slowFor += seconds; fastFor = 0; if (slowFor >= T.seconds) slow = true; }
      else if (average < T.fastMs) { fastFor += seconds; slowFor = 0; if (fastFor >= T.clear) slow = false; }
      else { slowFor = 0; fastFor = 0; }
      return slow;
    },
    get slow() { return slow; }, get average() { return average; },
    reset() { rest(); slow = false; average = 0; },
  };
}

// 안내를 보일까. 묶였으면(capped) 어느 기기든 보인다. 느리기만 하면(slow) 터치 기기가 아니고(노트북 · 책상) 충전 중이라고 알려지지 않았을 때만:
//   - 휴대폰 · 태블릿은 느려도 절전 탓이라 할 수 없다(원래 느린 기기가 많다) — 아이폰의 저전력 모드는 묶임으로 잡힌다.
//   - 책상 PC 는 크롬이 '충전 중'(charging true)으로 알려 준다 → 안 보인다. 사파리 · 파이어폭스는 알려 주지 않는다(charging undefined) → 느리면 보인다.
export const showPower = ({ capped = false, slow = false, touch = false, charging } = {}) => !!(capped || (slow && !touch && charging !== true));

// 안내에 쓸 낱말: 애플 기기는 설정에 '저전력 모드'로 나오고, 그 밖(갤럭시 · 윈도우 · 크롬)은 '절전 모드'가 가깝다.
export const powerWord = (userAgent = '') => /Mac|iPhone|iPad|iPod/.test(userAgent) ? '저전력 모드' : '절전 모드';
export const powerText = (userAgent = '') => powerWord(userAgent) + '에서는 화면이 끊길 수 있어요';
