// 결정적 수학 — 엔진(크롬 · 사파리 · 파이어폭스 · Node)과 무관하게 비트까지 같은 초월 함수. 브라우저 · Node 공용 순수 모듈(의존성 없음).
//   import { sin, cos, atan2, exp, pow, hypot } from '../shared/dmath.js';
// 왜(2026-11-24 조사 reports/2026-11-24_opus_race-rank-study.md): Math.sin · cos · atan2 · exp · pow 는 엔진마다 마지막 자리(1 ulp)가 다르다(크롬 158 ↔ Node 22 실측).
//   경주에서는 몸싸움이 그 차를 키워 서버의 다시 계산이 화면과 어긋났다(1 ulp 흉내 24판 중 2판). 그래서 주행 계산의 길(주행 · 상대 · 몸싸움 · 데미지 · 피트 · 부스터 ·
//   되돌려 놓기 · 랩 시계 · 지형)은 이 파일의 함수만 쓴다. 그리기 · 효과 · 소리 · 카메라는 Math 그대로다(값이 엔진마다 달라도 되는 곳).
// 어떻게: IEEE 754 가 '정확히 반올림'하라고 정한 +, −, ×, ÷, sqrt 와 정수 · 비트 조작만 쓴다(자바스크립트 엔진은 곱셈 · 덧셈을 합쳐 계산(FMA)하지 않는다 — 명세).
//   계수는 fdlibm(Sun, 1993)의 것. Math 와의 차이는 상대 오차 2.5e-16(pow 2.5e-15) 안 — 주행의 느낌은 그대로고 마지막 자리만 다르다(검증/dmath.test.mjs).
//   '정확히 반올림'이 목표가 아니라 '어디서나 같은 값'이 목표다. 각은 게임에서 작다(|x| < 1e5) — 아주 큰 각을 정밀하게 줄이는 일은 하지 않는다.
// 이 파일을 고치면 값이 바뀐다 → time-trial.js 의 TRIAL_VER 를 올린다(랭킹이 새 판이 된다).
const F = new Float64Array(1), U = new Uint32Array(F.buffer);   // little-endian 이 아닌 기계는 없다고 본다(모든 브라우저 · Node 의 대상) — U[1] = 높은 32비트
export const PI = 3.141592653589793;
const PIO2 = 1.5707963267948966, PIO4 = 0.7853981633974483, TWO_OVER_PI = 0.6366197723675814;
const pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11;
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04, S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05, C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
const ksin = x => { const z = x * x; return x + x * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6))))); };
const kcos = x => { const z = x * x, hz = 0.5 * z, r = z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6))))), w = 1 - hz; return w + (((1 - w) - hz) + r); };
let red = 0;   // reduce 의 나머지(할당 없이 돌려주려고)
// x = n·π/2 + red, |red| ≤ π/4 근처 — n 을 돌려준다
const reduce = x => { const n = Math.round(x * TWO_OVER_PI); red = (x - n * pio2_1) - n * pio2_1t; return n; };

export function sin(x) {
  if (x === 0) return x;   // ±0 의 부호를 지킨다
  if (x > -PIO4 && x < PIO4) return ksin(x);
  if (!(x - x === 0)) return NaN;   // NaN · ±Infinity
  const n = reduce(x) & 3, y = red;
  return n === 0 ? ksin(y) : n === 1 ? kcos(y) : n === 2 ? -ksin(y) : -kcos(y);
}
export function cos(x) {
  if (x > -PIO4 && x < PIO4) return kcos(x);
  if (!(x - x === 0)) return NaN;
  const n = reduce(x) & 3, y = red;
  return n === 0 ? kcos(y) : n === 1 ? -ksin(y) : n === 2 ? -kcos(y) : ksin(y);
}
export const tan = x => sin(x) / cos(x);

const atanhi = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const aT0 = 3.33333333333329318027e-01, aT1 = -1.99999999998764832476e-01, aT2 = 1.42857142725034663711e-01, aT3 = -1.11111104054623557880e-01, aT4 = 9.09088713343650656196e-02,
  aT5 = -7.69187620504482999495e-02, aT6 = 6.66107313738753120669e-02, aT7 = -5.83357013379057348645e-02, aT8 = 4.97687799461593236017e-02, aT9 = -3.65315727442169155270e-02, aT10 = 1.62858201153657823623e-02;
export function atan(x0) {
  if (!(x0 === x0)) return NaN;
  const neg = x0 < 0; let x = neg ? -x0 : x0, id;
  if (x > 7.378697629483821e19) return neg ? -atanhi[3] - atanlo[3] : atanhi[3] + atanlo[3];
  if (x < 0.4375) id = -1;
  else if (x < 1.1875) { if (x < 0.6875) { id = 0; x = (2 * x - 1) / (2 + x); } else { id = 1; x = (x - 1) / (x + 1); } }
  else if (x < 2.4375) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); } else { id = 3; x = -1 / x; }
  const z = x * x, w = z * z, s1 = z * (aT0 + w * (aT2 + w * (aT4 + w * (aT6 + w * (aT8 + w * aT10))))), s2 = w * (aT1 + w * (aT3 + w * (aT5 + w * (aT7 + w * aT9))));
  if (id < 0) { const r = x - x * (s1 + s2); return neg ? -r : r; }
  const r = atanhi[id] - ((x * (s1 + s2) - atanlo[id]) - x);
  return neg ? -r : r;
}
// Math.atan2 와 같은 사분면 규칙(±0 · ±Infinity 까지)
export function atan2(y, x) {
  if (!(x === x) || !(y === y)) return NaN;
  if (y === 0) return (x > 0 || Object.is(x, 0)) ? y : (Object.is(y, -0) ? -PI : PI);
  if (x === 0) return y > 0 ? PIO2 : -PIO2;
  const ix = x === Infinity || x === -Infinity, iy = y === Infinity || y === -Infinity;
  if (ix && iy) return x > 0 ? (y > 0 ? PIO4 : -PIO4) : (y > 0 ? 3 * PIO4 : -3 * PIO4);
  if (ix) return x > 0 ? (y > 0 ? 0 : -0) : (y > 0 ? PI : -PI);
  if (iy) return y > 0 ? PIO2 : -PIO2;
  const a = atan(y / x);
  if (x > 0) return a;
  return y > 0 ? a + PI : a - PI;
}

const ln2HI = 6.93147180369123816490e-01, ln2LO = 1.90821492927058770002e-10, LOG2E = 1.44269504088896338700e+00;
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05, P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
// 2^k(−1022 ≤ k ≤ 1023) — 지수 칸에 바로 쓴다
const twoPow = k => { U[0] = 0; U[1] = (k + 1023) << 20; return F[0]; };
const scale = (v, k) => k > 1023 ? v * twoPow(1023) * twoPow(k - 1023) : k < -1022 ? v * twoPow(-1022) * twoPow(k + 1022) : v * twoPow(k);
export function exp(x) {
  if (!(x === x)) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;
  if (x > -3.725290298461914e-9 && x < 3.725290298461914e-9) return 1 + x;
  const k = Math.round(x * LOG2E), hi = x - k * ln2HI, lo = k * ln2LO, r = hi - lo, t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  return scale(1 - ((lo - (r * c) / (2 - c)) - hi), k);
}
const SQRT2 = 1.4142135623730951;
export function log(x) {
  if (!(x === x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  F[0] = x; let e = ((U[1] >>> 20) & 0x7ff) - 1023;
  if (e === -1023) { F[0] = x * 18014398509481984; e = ((U[1] >>> 20) & 0x7ff) - 1023 - 54; }   // 아주 작은 수(쓰이지 않지만 맞게)
  U[1] = (U[1] & 0x800fffff) | (1023 << 20); let m = F[0];
  if (m > SQRT2) { m *= 0.5; e++; }
  const f = m - 1, s = f / (2 + f), z = s * s;
  let sum = 0; for (let k = 21; k >= 3; k -= 2) sum = (sum + 1 / k) * z;   // log(1 + f) = 2·atanh(s) = 2(s + s³/3 + s⁵/5 + …)
  return e * ln2HI + (e * ln2LO + 2 * s * (1 + sum));
}
export function pow(a, b) {
  if (b === 0) return 1;
  if (!(a === a) || !(b === b)) return NaN;
  if (b === 1) return a;
  if (b === 2) return a * a;
  if (b === 0.5 && a >= 0 && a !== Infinity) return Math.sqrt(a);
  if (a === 0) return b > 0 ? 0 : Infinity;
  if (a < 0) { if (Math.floor(b) !== b) return NaN; const r = exp(b * log(-a)); return b % 2 !== 0 ? -r : r; }
  return exp(b * log(a));
}
// 둘(또는 셋)의 길이 — Math.hypot 은 엔진마다 계산법이 다를 수 있어 제곱합의 sqrt 로(게임의 길이는 넘치거나 작아 사라질 일이 없다)
export const hypot = (a, b, c) => c === undefined ? Math.sqrt(a * a + b * b) : Math.sqrt(a * a + b * b + c * c);
