// 도로 모습 후보(2026-11-24 — 사용자 "도로도 약간 좀 더 현실적으로 만들어보는거 어때?"). 주소 ?road=a|b|c 일 때만 붙는다 — 없으면 이 파일은 불리지도 않는다.
//   a 마른 아스팔트의 결: 굵은 입자 · 얼룩 · 보수 자국(덧씌운 네모 · 균열 메운 줄) · 주행선을 따라 짙어진 타이어 자국(코너 · 출발 자리) · 가장자리의 바랜 색과 먼지
//   b a + 밤에 젖은 노면: 더 어둡고 매끈해지고, 가로등 · 차의 불빛이 노면에 길게 번진다(낮에는 a 와 같다)
//   c a + 캠퍼스 길: 백양로 구간은 밝은 돌 포장(지도의 길 종류), 보행로가 길을 건너는 자리에 횡단보도(지도), 과속방지턱 무늬(예시 — 자리 근거 없음), 다리 위는 콘크리트 상판(예시)
// 보이는 것만 바꾼다 — 주행 · 벽 · 높이는 그대로다. 무늬는 셰이더 안의 계산과 코드로 만든 작은 잡음 그림(256², mip 이 있어 멀리서 저절로 흐려진다) 하나로 그린다.
// 노면 메시(track-road)의 재질에만 덧붙인다. 밤 재질(night-materials.js)이 먼저 붙든 나중에 붙든 같이 돈다 — 그쪽 조각 뒤에 들어가게 다른 자리(#include)를 쓴다.
//   const look = applyRoadLook(THREE, { id, track, course, parts, stage });   // id 를 모르면 null
import { centreDashes } from './track.js';

export const ROAD_LOOKS = {
  a: { id: 'a', name: 'A 마른 아스팔트의 결', wet: false, campus: false },
  b: { id: 'b', name: 'B 밤에 젖은 노면', wet: true, campus: false },
  c: { id: 'c', name: 'C 캠퍼스 길', wet: false, campus: true },
};

// 무늬의 세기 · 크기(m). 그림을 보고 맞춘 값.
const LOOK = {
  grit: .30, mottle: .38, speck: .55,              // 입자 · 큰 얼룩 · 밝은 골재 알갱이
  dust: .55, dustReach: 1.5,                       // 가장자리 먼지(경계에서 이만큼 안쪽까지)
  tyre: .42, tyreGauge: .78,                       // 타이어 자국의 진하기 · 바퀴 사이 반폭(m)
  patchEvery: 21, crackEvery: 37,                  // 보수 자국 · 균열 메운 줄이 하나 들어가는 칸(m)
  wetDark: .5, wetRough: [.62, .2],               // 젖으면 이만큼 어두워지고, 거칠기가 마른 곳 → 웅덩이
  lamp: .32, tail: .55, head: .7,                 // 노면에 비치는 불빛의 세기(가로등 · 미등 · 전조등)
  crossLength: 4, bumpLength: 3.6,                 // 횡단보도 · 과속방지턱 무늬의 길이(길 방향, m)
};
// 근거가 있는 자리(시안/도로_src/find-crossings.mjs — 지도의 보도가 코스 중심선을 70° 넘게 가로지르는 곳 중 아스팔트 구간, 부품 · 피트와 안 겹치는 것).
// 실제로 횡단보도가 칠해져 있는지는 지도에 없다 → 보고에 '지도에서 보도가 건너는 자리'라고 적는다.
const CROSSWALKS = [132.3, 327.9, 990.1, 1134.2, 1233.5];
// 과속방지턱 — 지도에 자료가 없다. 삼거리 앞 · 긴 곧은 길에 둔 예시다.
const BUMPS = [362, 1060];
const MAX_LIGHTS = 20, MAX_LAMPS = 8;   // 노면 한 점이 보는 불빛 수 — 그리기 값(한 장 +5% 안쪽)에 맞춘 것

// --------------------------------------------------------------- 계산(THREE 없음 — 시험이 직접 부른다)
// 줄(중심선 점)마다: 통로 폭 · 주행선(통로 한가운데에서 오른쪽 + m) · 타이어 자국의 세기(0~1)
export function roadRows(course) {
  const c = course.centre, n = c.length, step = course.step || 2, length = course.length;
  const norm = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const h = new Float64Array(n), k = new Float64Array(n);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; h[i] = Math.atan2(c[j][0] - c[i][0], c[j][1] - c[i][1]); }
  for (let i = 0; i < n; i++) k[i] = norm(h[(i + 1) % n] - h[i]) / step;   // + = 왼쪽으로 꺾임(1/m)
  const blur = sigma => { const r = Math.ceil(3 * sigma / step), w = [], out = new Float64Array(n); let sum = 0;
    for (let d = -r; d <= r; d++) { const v = Math.exp(-((d * step) ** 2) / (2 * sigma * sigma)); w.push(v); sum += v; }
    for (let i = 0; i < n; i++) { let t = 0; for (let d = -r; d <= r; d++) t += k[((i + d) % n + n) % n] * w[d + r]; out[i] = t / sum; } return out; };
  const near = blur(6), wide = blur(18);
  const rows = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const width = c[i][2] + c[i][3], room = Math.max(0, width / 2 - 1.7);
    // 주행선: 꼭짓점에서는 안쪽, 들어가기 · 나오기에서는 바깥쪽(가까운 굽음 − 넓은 굽음). 왼쪽으로 꺾이면 안쪽은 왼쪽(−)
    const lean = Math.max(-1, Math.min(1, -(near[i] - .55 * wide[i]) * 22));
    const startZone = s > length - 62 || s < 10 ? 1 : 0;   // 출발 자리(출발선 뒤 격자) — 출발 때 바퀴가 헛돈 자국
    const tyre = Math.min(1, .22 + .9 * Math.min(1, Math.abs(wide[i]) * 20) + .6 * startZone);
    rows.push({ s, width, racing: startZone ? 0 : lean * room, tyre });
    const j = (i + 1) % n; s += Math.hypot(c[j][0] - c[i][0], c[j][1] - c[i][1]);
  }
  return rows;
}
// 점선의 빈칸(보통 5 m) 한가운데 중 want 에 가장 가까운 것 — 무늬가 가운데 점선과 겹치지 않게.
// 긴 빈칸(6 m 넘게 — 부스트 발판 · 점프대 · 출발선 둘레)과 len 이 안 들어가는 빈칸은 건너뛴다.
export function gapNear(dashes, want, len) {
  let best = null;
  for (let a = 0; a + 1 < dashes.length; a++) {
    const from = dashes[a][1], to = dashes[a + 1][0];
    if (to - from < len + .6 || to - from > 6) continue;
    const mid = (from + to) / 2;
    if (best === null || Math.abs(mid - want) < Math.abs(best - want)) best = mid;
  }
  return best;
}
// 후보 c 의 구간(돌 포장 · 콘크리트 상판)과 자리(횡단보도 · 과속방지턱). kind: 1 돌 · 2 콘크리트 / type: 1 횡단보도 · 2 과속방지턱
export function campusLayout(course, parts = null) {
  const length = course.length, kinds = course.kinds || [], step = course.step || 2, zones = [];
  // 백양로(지도의 '보행 대로' — 2015년 공사 뒤 차 없는 돌 포장 길)는 돌 포장. 출발선을 걸치면 둘로 나뉜다.
  for (let i = 0; i < kinds.length;) {
    if (kinds[i] !== 'pedestrian') { i++; continue; }
    let j = i; while (j < kinds.length && kinds[j] === 'pedestrian') j++;
    zones.push({ from: i * step, to: Math.min(length, j * step), kind: 1 }); i = j;
  }
  // 콘크리트 상판은 밑이 트이는 다리만(높이 PART_SOLID.open 2.6 m 이상). 낮은 둔덕(2026-11-25 코스 B 청송대 숲 — 1.0 m)은 아스팔트 그대로 — 셰이더 배열(구간 4칸)도 지킨다.
  for (const p of parts?.list || []) if (p.type === 'bridge' && p.height >= 2.6) zones.push({ from: p.from ?? p.at, to: p.to, kind: 2 });
  const gaps = parts ? [...parts.pads.map(p => [p.at - 1.5, p.at + p.length + 1.5]), ...parts.ramps.map(r => [r.at - 1, r.at + r.length + 0.6])] : [];
  const dashes = centreDashes(length, gaps), spots = [];
  for (const s of CROSSWALKS) { const m = gapNear(dashes, s, LOOK.crossLength); if (m !== null) spots.push({ from: m - LOOK.crossLength / 2, to: m + LOOK.crossLength / 2, type: 1, map: s }); }
  for (const s of BUMPS) { const m = gapNear(dashes, s, LOOK.bumpLength); if (m !== null) spots.push({ from: m - LOOK.bumpLength / 2, to: m + LOOK.bumpLength / 2, type: 2, example: true }); }
  return { zones, spots };
}

// --------------------------------------------------------------- 잡음 그림(코드로 만든다 — 파일 없음)
// R 얼룩(8 · 16 · 32칸) · G 골재(칸마다 따로) · B 큰 얼룩(4 · 8칸 — 웅덩이 자리) · A 중간 결(64칸). 이어 붙여도 이음매가 없게 칸을 한 바퀴로 돈다.
function noiseTexture(THREE, renderer) {
  const size = 256, px = new Uint8Array(size * size * 4);
  const hash = (x, y, seed) => { let h = Math.imul(x + 374761 * seed, 0x45d9f3b) ^ Math.imul(y + 668265 * seed, 0x27d4eb2d); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
  const value = (x, y, cells, seed) => {
    const u = x * cells / size, v = y * cells / size, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
    const a = fx * fx * (3 - 2 * fx), b = fy * fy * (3 - 2 * fy), i1 = (i + 1) % cells, j1 = (j + 1) % cells;
    return (1 - b) * ((1 - a) * hash(i, j, seed) + a * hash(i1, j, seed)) + b * ((1 - a) * hash(i, j1, seed) + a * hash(i1, j1, seed));
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4;
    px[o] = Math.round(255 * (.5 * value(x, y, 8, 1) + .3 * value(x, y, 16, 2) + .2 * value(x, y, 32, 3)));
    px[o + 1] = Math.round(255 * hash(x, y, 4));
    px[o + 2] = Math.round(255 * (.65 * value(x, y, 4, 5) + .35 * value(x, y, 8, 6)));
    px[o + 3] = Math.round(255 * (.7 * value(x, y, 64, 7) + .3 * value(x, y, 128, 8)));
  }
  const t = new THREE.DataTexture(px, size, size);
  t.name = 'road-look-noise';
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  t.needsUpdate = true;
  return t;
}

// --------------------------------------------------------------- 셰이더 조각
const VERTEX_HEAD = `
attribute vec4 roadLook;
varying vec4 vRoadLook;
varying float vRoadLat;
varying vec3 vRoadWorld;
#ifdef ROAD_CAMPUS
  attribute float roadNear;
  varying float vRoadNear;
#endif
`;
const VERTEX_BODY = `
vRoadLook = roadLook;
#ifdef ROAD_CAMPUS
  vRoadNear = roadNear;
#endif
vRoadLat = (uv.x - .5) * roadLook.y;
vRoadWorld = (modelMatrix * vec4(transformed, 1.)).xyz;
`;
const FRAGMENT_HEAD = `
varying vec4 vRoadLook;   // s(출발선부터 m) · 통로 폭 · 주행선 · 타이어 자국의 세기
varying float vRoadLat;   // 통로 한가운데에서 오른쪽으로 m
varying vec3 vRoadWorld;
uniform sampler2D uRoadNoise;
float roadHash(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
// 반폭 w 인 선(거리 d)이 덮는 정도 — 화면 한 칸(px m)보다 가늘면 넓히되 옅게 해서 멀리서 자글거리지 않게
float roadLine(float d, float w, float px) { float ww = max(w, px); return (1. - smoothstep(ww - px, ww + px, d)) * (w / ww); }
float roadBox(vec2 p, vec2 h) { vec2 q = abs(p) - h; return length(max(q, 0.)) + min(max(q.x, q.y), 0.); }
#ifdef ROAD_CAMPUS
  varying float vRoadNear;     // 구간 · 무늬 둘레의 줄만 1 — 나머지 노면은 아래 계산을 건너뛴다
  uniform vec3 uRoadZone[4];   // from · to(s) · kind 1 돌 2 콘크리트
  uniform vec3 uRoadSpot[8];   // from · to(s) · type 1 횡단보도 2 과속방지턱
#endif
#ifdef ROAD_WET
  uniform vec4 uRoadLight[${MAX_LIGHTS}];      // 불빛의 세계 좌표 · 세기
  uniform vec3 uRoadLightTint[${MAX_LIGHTS}];
  uniform int uRoadLightCount;
#endif
`;
const COLOUR = `
  float roadS = vRoadLook.x, roadW = vRoadLook.y, roadLat = vRoadLat;
  vec2 roadXZ = vRoadWorld.xz;
  // 화면 한 칸이 덮는 노면(m): 길 방향(sPx — 비스듬히 보면 크다) · 옆 방향(latPx)을 따로 — 줄무늬는 제 방향의 값으로 흐린다
  float roadSPx = max(abs(fwidth(roadS)), 1e-4), roadLatPx = max(abs(fwidth(roadLat)), 1e-4), roadPx = max(roadSPx, roadLatPx);
  vec4 roadBig = texture2D(uRoadNoise, roadXZ / 47.), roadMid = texture2D(uRoadNoise, roadXZ / 9.3), roadFine = texture2D(uRoadNoise, roadXZ / 1.7);
  vec3 roadCol = diffuse;
  // 결: 큰 얼룩 · 입자 · 밝은 골재 알갱이(잡음 그림의 mip 이 멀리서 평균으로 흐린다)
  roadCol *= 1. + ${LOOK.mottle.toFixed(3)} * ((roadBig.r - .5) * 1.4 + (roadMid.r - .5) * .7) + ${LOOK.grit.toFixed(3)} * (roadFine.g - .5) * 2.;
  roadCol = mix(roadCol, roadCol * vec3(1.9, 1.85, 1.75), ${LOOK.speck.toFixed(3)} * smoothstep(.86, .97, roadFine.g));
  // 가장자리: 차가 덜 다녀 바랜 색과 먼지
  float roadEdge = roadW * .5 - abs(roadLat) + .5 * (roadMid.a - .5);
  float roadDust = 1. - smoothstep(.2, ${LOOK.dustReach.toFixed(2)}, roadEdge);
  roadCol = mix(roadCol, vec3(.15, .138, .115) * (.9 + .25 * roadMid.r), ${LOOK.dust.toFixed(3)} * roadDust);
  // 타이어 자국: 주행선 양쪽 바퀴 자리, 길 방향으로 끊겼다 이어진다
  float roadTrack = abs(abs(roadLat - vRoadLook.z) - ${LOOK.tyreGauge.toFixed(2)});
  float roadRub = (1. - smoothstep(.1, .5, roadTrack)) * smoothstep(.28, .62, texture2D(uRoadNoise, vec2(roadS / 29., (roadLat - vRoadLook.z) / 3.1)).r);
  float roadWear = vRoadLook.w * roadRub;
  // 보수 자국: 칸마다 덧씌운 네모 하나(있거나 없거나) — 새 아스팔트라 더 검고 입자가 적다, 테두리는 메운 줄
  float roadPatchCell = floor(roadS / ${LOOK.patchEvery.toFixed(1)});
  float rp1 = roadHash(roadPatchCell * 1.7 + 3.1), rp2 = roadHash(roadPatchCell * 2.3 + 7.7), rp3 = roadHash(roadPatchCell * 3.9 + 1.3), rp4 = roadHash(roadPatchCell * 5.1 + 9.2);
  vec2 roadPatchAt = vec2(roadPatchCell * ${LOOK.patchEvery.toFixed(1)} + 3.5 + 13. * rp2, (rp3 - .5) * max(0., roadW - 4.));
  vec2 roadPatchHalf = rp4 > .75 ? vec2(3.2 + 2. * rp3, .45) : vec2(.9 + 1.9 * rp4, .7 + 1.2 * rp3);   // 가끔은 길 방향으로 긴 굴착 자국
  float roadPatchSd = roadBox(vec2(roadS, roadLat) - roadPatchAt, roadPatchHalf) + .05 * (roadMid.a - .5);
  float roadPatch = step(.45, rp1) * (1. - smoothstep(-roadPx, roadPx, roadPatchSd));
  float roadSeal = step(.45, rp1) * roadLine(abs(roadPatchSd), .03, roadLatPx) * (1. - smoothstep(.08, .5, roadLatPx));
  roadCol = mix(roadCol, diffuse * (.86 + .1 * (roadMid.a - .5) + .12 * (roadFine.g - .5)), roadPatch);
  // 균열을 메운 검은 줄: 칸마다 하나(있거나 없거나) — 길 방향으로 구불구불
  float roadCrackCell = floor(roadS / ${LOOK.crackEvery.toFixed(1)}), rc1 = roadHash(roadCrackCell * 4.3 + 2.2), rc2 = roadHash(roadCrackCell * 6.1 + 5.5);
  float roadCrackLat = (rc2 - .5) * roadW * .55 + .45 * sin(roadS * .23 + rc1 * 6.) + .16 * sin(roadS * .81 + rc2 * 4.);
  float roadCrackIn = step(.4, rc1) * smoothstep(roadCrackCell * ${LOOK.crackEvery.toFixed(1)} + 4., roadCrackCell * ${LOOK.crackEvery.toFixed(1)} + 5., roadS) * (1. - smoothstep(roadCrackCell * ${LOOK.crackEvery.toFixed(1)} + 20., roadCrackCell * ${LOOK.crackEvery.toFixed(1)} + 21., roadS));
  float roadCrack = roadCrackIn * roadLine(abs(roadLat - roadCrackLat), .022, roadLatPx) * (1. - smoothstep(.04, .3, roadLatPx));
  roadCol *= (1. - ${LOOK.tyre.toFixed(3)} * roadWear) * (1. - .4 * roadSeal) * (1. - .55 * roadCrack);
  float roadSmooth = .35 * roadPatch + .5 * roadWear;   // 거칠기를 줄이는 몫(닳은 바퀴 자리 · 새 아스팔트)
#ifdef ROAD_CAMPUS
  if (vRoadNear > .001) {
  // 구간 포장: 돌(백양로) · 콘크리트 상판(다리)
  float roadStone = 0., roadDeck = 0.;
  for (int i = 0; i < 4; i++) {
    vec3 z = uRoadZone[i]; if (z.z < .5) continue;
    float inZ = smoothstep(z.x - roadSPx, z.x + roadSPx, roadS) * (1. - smoothstep(z.y - roadSPx, z.y + roadSPx, roadS));
    if (z.z < 1.5) roadStone = max(roadStone, inZ); else roadDeck = max(roadDeck, inZ);
  }
  if (roadStone > 0.) {
    // 0.6 × 0.3 m 돌, 줄마다 반 장씩 어긋나게. 돌마다 색이 조금씩 다르고, 줄눈은 멀어지면 평균 색으로 흐린다.
    vec2 st = vec2(roadS, roadLat + 40.);
    float row = floor(st.y / .3); float shift = mod(row, 2.) * .3;
    vec2 cell = vec2(floor((st.x + shift) / .6), row);
    vec2 inCell = vec2(fract((st.x + shift) / .6) * .6, fract(st.y / .3) * .3);
    // 줄눈: 길을 가로지르는 줄(길 방향 값으로) · 길을 따라가는 줄(옆 방향 값으로)
    float jointS = mix(roadLine(min(inCell.x, .6 - inCell.x), .008, roadSPx), .027, smoothstep(.02, .08, roadSPx));
    float jointL = mix(roadLine(min(inCell.y, .3 - inCell.y), .008, roadLatPx), .053, smoothstep(.02, .08, roadLatPx));
    float jointCover = max(jointS, jointL);
    float tone = roadHash(cell.x * 7.13 + cell.y * 3.71);
    vec3 stone = vec3(.175, .165, .148) * (.84 + .3 * tone) * (1. + .22 * (roadFine.a - .5) + .12 * (roadBig.r - .5));
    stone *= 1. - .5 * jointCover;
    stone *= 1. - .22 * roadWear;
    // 포장이 바뀌는 자리에 짙은 경계석 띠
    float band = 0.;
    for (int i = 0; i < 4; i++) { vec3 z = uRoadZone[i]; if (z.z < .5 || z.z > 1.5) continue; band = max(band, roadLine(min(abs(roadS - z.x), abs(roadS - z.y)), .22, roadSPx)); }
    stone = mix(stone, vec3(.075, .075, .078), band);
    roadCol = mix(roadCol, stone, roadStone);
    roadSmooth = mix(roadSmooth, .1, roadStone);
  }
  if (roadDeck > 0.) {
    // 밝은 콘크리트 + 12 m 마다 이음 장치(검은 틈 + 양쪽 쇠 띠)
    vec3 deck = vec3(.105, .107, .11) * (1. + .18 * (roadMid.r - .5) + .14 * (roadFine.a - .5));
    deck *= 1. - .3 * roadWear;
    float jd = abs(mod(roadS + 6., 12.) - 6.);
    deck = mix(deck, vec3(.15, .155, .16), roadLine(jd, .16, roadSPx));
    deck *= 1. - .8 * roadLine(jd, .025, roadSPx);
    roadCol = mix(roadCol, deck, roadDeck);
  }
  // 횡단보도 · 과속방지턱 무늬(칠 — 조금 닳았다)
  for (int i = 0; i < 8; i++) {
    vec3 sp = uRoadSpot[i]; if (sp.z < .5) continue;
    float inS = smoothstep(sp.x - roadSPx, sp.x + roadSPx, roadS) * (1. - smoothstep(sp.y - roadSPx, sp.y + roadSPx, roadS));
    if (inS <= 0.) continue;
    float worn = .82 + .18 * smoothstep(.3, .7, roadMid.a) - .25 * roadWear;
    if (sp.z < 1.5) {
      // 길 방향으로 긴 흰 막대 0.5 m · 사이 0.5 m, 양쪽 가장자리 0.9 m 는 비운다(가장자리 선 · 연석 칠과 안 겹치게)
      float span = roadW * .5 - .9, inLat = 1. - smoothstep(span - roadLatPx, span + roadLatPx, abs(roadLat));
      float bar = roadLine(abs(fract(roadLat + .25) - .5), .25, roadLatPx);
      bar = mix(bar, .5, smoothstep(.35, .8, roadLatPx));   // 한 주기(1 m)가 두 칸 아래로 줄면 평균으로
      roadCol = mix(roadCol, vec3(.62, .62, .6) * worn, inS * inLat * bar);
    } else {
      // 노랑 · 흰 빗금(45°, 0.45 m) — 무늬만, 턱은 없다
      float dPx = max(abs(fwidth(roadS + roadLat)), 1e-4) / .9, d = fract((roadS + roadLat) / .9);
      float pick = roadLine(abs(d - .5), .25, dPx);
      pick = mix(pick, .5, smoothstep(.35, .8, dPx));
      vec3 paint = mix(vec3(.62, .62, .6), vec3(.72, .5, .03), pick) * worn;
      float inLat = 1. - smoothstep(roadW * .5 - .45 - roadLatPx, roadW * .5 - .45 + roadLatPx, abs(roadLat));
      roadCol = mix(roadCol, paint, inS * inLat);
    }
  }
  }
#endif
#ifdef ROAD_WET
  // 젖은 노면: 웅덩이 자리(큰 얼룩)일수록 더 젖었다. 젖은 아스팔트는 어둡고 매끈하다.
  float roadWet = .55 + .45 * smoothstep(.5, .66, roadBig.b + .3 * (roadMid.r - .5));
  roadCol *= mix(1., ${LOOK.wetDark.toFixed(3)}, roadWet);
#endif
  diffuseColor.rgb = roadCol;
`;
const ROUGHNESS = `
  roughnessFactor = clamp(roughnessFactor - .08 * roadSmooth + .06 * (roadFine.a - .5), .55, .98);
#ifdef ROAD_WET
  roughnessFactor = mix(roughnessFactor, mix(${LOOK.wetRough[0].toFixed(2)}, ${LOOK.wetRough[1].toFixed(2)}, smoothstep(.6, 1., roadWet)), roadWet);
#endif
`;
// 젖은 노면에 비친 불빛: 불빛 아래에서 카메라 쪽으로 길게 번지는 띠. 거울에 비친 자리(높이 비례)를 가운데로, 거칠어서 길 방향으로 늘어난다.
// 노면 메시에만 그리므로 방호벽 · 건물에는 안 묻는다. 다른 층(위아래 16 m 밖)이나 노면보다 낮은 불빛은 안 비친다.
const WET_LIGHT = `
#ifdef ROAD_WET
  {
    vec3 rp = vRoadWorld;
    float hc = max(.4, cameraPosition.y - rp.y), roadGlowPx = max(length(fwidth(rp.xz)), .002);
    vec3 roadGlow = vec3(0.);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uRoadLightCount) break;
      vec4 L = uRoadLight[i];
      float hl = L.y - rp.y;
      if (hl < .1 || hl > 16.) continue;
      vec2 toCam = cameraPosition.xz - L.xz; float D = length(toCam);
      if (D < .3) continue;
      vec2 dir = toCam / D, rel = rp.xz - L.xz;
      float along = dot(rel, dir), across = dot(rel, vec2(dir.y, -dir.x));
      float wid = .07 + .018 * hl + .006 * max(0., along), ww = max(wid, 1.5 * roadGlowPx);
      if (abs(across) > 3.5 * ww || along < -.3 || along > D) continue;   // 띠 밖은 바로 건너뛴다
      float mirror = D * hl / (hc + hl), len = .4 * mirror + .3;
      float a = (along - mirror) / len;
      roadGlow += uRoadLightTint[i] * (L.w * exp(-a * a) * exp(-across * across / (ww * ww)) * (wid / ww)
        * smoothstep(-.3, .5, along) * (1. - smoothstep(.85 * D, D, along)));
    }
    reflectedLight.directSpecular += roadGlow * roadWet;
  }
#endif
`;

// --------------------------------------------------------------- 붙이기
export function applyRoadLook(THREE, { id, track, course, parts = null, stage = null } = {}) {
  const look = ROAD_LOOKS[id]; if (!look) return null;
  const mesh = track.group.getObjectByName('track-road'); if (!mesh) return null;
  const rows = roadRows(course), n = rows.length, length = course.length;
  // 노면을 다시 묶는다: 마지막 줄 → 0 번 줄로 넘어가는 칸이 s 를 1359 → 0 으로 섞어 무늬가 그 2 m 에 몰리지 않게, 0 번 줄을 하나 더(s = 한 바퀴) 두고 마지막 칸이 그것을 쓴다.
  const g = mesh.geometry, cols1 = g.attributes.position.count / n;
  if (!Number.isInteger(cols1)) return null;
  const grow = (attr, size) => { const a = new Float32Array((n + 1) * cols1 * size); a.set(attr.array); a.set(attr.array.subarray(0, cols1 * size), n * cols1 * size); return new THREE.BufferAttribute(a, size); };
  const pos = grow(g.attributes.position, 3), nor = grow(g.attributes.normal, 3), uv = grow(g.attributes.uv, 2);
  const info = new Float32Array((n + 1) * cols1 * 4);
  for (let i = 0; i <= n; i++) { const r = rows[i % n], s = i === n ? length : r.s; for (let k = 0; k < cols1; k++) info.set([s, r.width, r.racing, r.tyre], (i * cols1 + k) * 4); }
  const idx = Array.from(g.index.array);
  for (let q = (n - 1) * (cols1 - 1) * 6; q < idx.length; q++) if (idx[q] < cols1) idx[q] += n * cols1;   // 마지막 칸의 '다음 줄'(0 번) → 덧붙인 줄
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', pos); geo.setAttribute('normal', nor); geo.setAttribute('uv', uv); geo.setAttribute('roadLook', new THREE.BufferAttribute(info, 4)); geo.setIndex(idx);
  geo.computeBoundingSphere();
  g.dispose(); mesh.geometry = geo;

  const noise = noiseTexture(THREE, stage?.renderer);
  const uniforms = { uRoadNoise: { value: noise } }, defines = [];
  let layout = null;
  if (look.campus) {
    layout = campusLayout(course, parts);
    uniforms.uRoadZone = { value: Array.from({ length: 4 }, (_, i) => { const z = layout.zones[i]; return new THREE.Vector3(z?.from ?? 0, z?.to ?? 0, z?.kind ?? 0); }) };
    uniforms.uRoadSpot = { value: Array.from({ length: 8 }, (_, i) => { const p = layout.spots[i]; return new THREE.Vector3(p?.from ?? 0, p?.to ?? 0, p?.type ?? 0); }) };
    defines.push('ROAD_CAMPUS');
    // 줄마다 '구간 · 무늬 둘레(3 m 안)인가' — 셰이더가 나머지 노면에서 계산을 건너뛴다
    const near = new Float32Array((n + 1) * cols1), marks = [...layout.zones.map(z => [z.from, z.to]), ...layout.spots.map(p => [p.from, p.to])];
    for (let i = 0; i <= n; i++) { const s = i === n ? length : rows[i].s; if (marks.some(([a, b]) => s > a - 3 && s < b + 3)) near.fill(1, i * cols1, (i + 1) * cols1); }
    geo.setAttribute('roadNear', new THREE.BufferAttribute(near, 1));
  }
  const night = stage ? stage.look === 'night' : false, wet = look.wet && night;
  if (wet) {
    uniforms.uRoadLight = { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) };
    uniforms.uRoadLightTint = { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) };
    uniforms.uRoadLightCount = { value: 0 };
    defines.push('ROAD_WET');
  }
  const material = mesh.material, oldCompile = material.onBeforeCompile, oldKey = material.customProgramCacheKey;
  material.customProgramCacheKey = function () { return oldKey.call(this) + '/road-look-' + look.id + (wet ? '-wet' : ''); };
  material.onBeforeCompile = function (shader, renderer) {
    oldCompile.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    const head = defines.map(d => `#define ${d}\n`).join('');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + head + VERTEX_HEAD)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERTEX_BODY);
    // 밤 재질은 #include 바로 뒤에 붙는다 → 이쪽은 그다음 #include 바로 앞에 넣어 늘 그 뒤에 돈다.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + head + FRAGMENT_HEAD)
      .replace('#include <alphamap_fragment>', COLOUR + '\n#include <alphamap_fragment>')
      .replace('#include <metalnessmap_fragment>', ROUGHNESS + '\n#include <metalnessmap_fragment>')
      .replace('#include <aomap_fragment>', WET_LIGHT + '\n#include <aomap_fragment>');
  };
  material.needsUpdate = true;

  // 젖은 노면에 비칠 불빛을 화면마다 고른다: 카메라 앞 가까운 가로등 몇 개 + 보이는 차의 미등 · 전조등
  if (wet) {
    const v = new THREE.Vector3(), fwd = new THREE.Vector3(), box = new THREE.Box3(), boxes = new WeakMap();
    let lampsAt = null;
    const lampHeads = scene => {
      const lens = scene.getObjectByName('night-lamp-lenses'); if (!lens) return [];
      lens.geometry.computeBoundingBox(); const c = lens.geometry.boundingBox.getCenter(new THREE.Vector3()), m = new THREE.Matrix4(), out = [];
      lens.updateWorldMatrix(true, false);
      for (let i = 0; i < lens.count; i++) { lens.getMatrixAt(i, m); out.push(c.clone().applyMatrix4(m).applyMatrix4(lens.matrixWorld)); }
      return out;
    };
    const localBox = group => {   // 차의 로컬 크기(자세를 풀고 한 번 잰다)
      let b = boxes.get(group); if (b) return b;
      const p = group.position.clone(), r = group.rotation.clone(); group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.updateMatrixWorld(true);
      b = box.setFromObject(group).clone(); group.position.copy(p); group.rotation.copy(r); group.updateMatrixWorld(true);
      boxes.set(group, b); return b;
    };
    const L = uniforms.uRoadLight.value, T = uniforms.uRoadLightTint.value;
    mesh.onBeforeRender = (renderer, scene, camera) => {
      let count = 0;
      camera.getWorldDirection(fwd);
      const eye = camera.getWorldPosition(v.set(0, 0, 0)).clone();
      if (!lampsAt || !lampsAt.length) lampsAt = lampHeads(scene);
      const near = [];
      for (const p of lampsAt) { const dx = p.x - eye.x, dz = p.z - eye.z, d = Math.hypot(dx, dz); if (d < 120 && (dx * fwd.x + dz * fwd.z) > -6) near.push([d, p]); }
      near.sort((a, b) => a[0] - b[0]);
      for (const [, p] of near.slice(0, MAX_LAMPS)) { L[count].set(p.x, p.y, p.z, LOOK.lamp); T[count].set(1, .47, .18); count++; }
      for (const o of scene.children) {
        if (count > MAX_LIGHTS - 2) break;
        if (o.name !== 'kart' || !o.visible) continue;
        const b = localBox(o), h = b.min.y + (b.max.y - b.min.y) * .42, sin = Math.sin(o.rotation.y), cos = Math.cos(o.rotation.y);
        const dx = eye.x - o.position.x, dz = eye.z - o.position.z, d = Math.hypot(dx, dz) || 1, facing = (dx * sin + dz * cos) / d;   // + = 차가 카메라 쪽을 본다
        if (d > 140) continue;
        const end = (z, strength, r, gg, bb) => { L[count].set(o.position.x + sin * z, o.position.y + h, o.position.z + cos * z, strength); T[count].set(r, gg, bb); count++; };
        if (facing < .2) end(b.min.z + .05, LOOK.tail * Math.min(1, (.2 - facing) * 2.5), 1, .035, .02);
        if (facing > -.2) end(b.max.z - .05, LOOK.head * Math.min(1, (facing + .2) * 2.5), 1, .92, .78);
      }
      uniforms.uRoadLightCount.value = count;
    };
  }
  return { look, layout, rows, mesh, dispose() { noise.dispose(); } };
}
