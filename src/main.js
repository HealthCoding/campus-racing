// 게임 진입: 캠퍼스 → 트랙 → 카트를 붙이고, 고정 간격(1/120 초)으로 주행을 계산해 화면에 보간해 그린다.
// 약속은 docs/구조와_계약.md. 주소 인자: ?auto=1(자동 운전) &speed=4(자동 운전 배속) &class=normal|fast|faster(개발 · 검증용 — 게임에는 '아주 빠름' 하나뿐이고 고르는 칸이 없다) &level=easy|normal|hard|expert(상대의 난이도) &radio=off|yuna|shelley|eddy|rocko(무전 — 공개판에서는 뺐다. 이 인자를 줄 때만 켜진다) &quality=auto|high|smooth &time=night|day|golden(기본 night — 2026-11-23 사용자가 첫 화면 장면으로 밤을 골라 경주도 밤에 시작한다) &ghost=0 &sound=0 &music=off(배경음악만 끔)
//   &tune=1(개발용 조정판) · &feel=0~1.5(조정판에서 차별 감각 세기)
//   &mode=gp|time(그랑프리 — 상대 7대 · 코스의 바퀴 수 | 타임어택 — 혼자 · 기록 유령. 안 주면 지난번에 고른 것, 처음이면 그랑프리. 2026-11-25 스피드전을 뺐다 — 옛 &mode=race · 남아 있던 'race' 는 그랑프리로)
//   &kart=balance|sprint|cruise|drift(카트 종류 — 모양과 주행 감각. 안 주면 지난번에 고른 것)
//   &car=<차 id>(karts.js 의 CARS — 모양과 주행 감각. 안 주면 지난번에 고른 것. 예전의 &kart=balance|sprint|cruise|drift 는 그 감각의 카트를 고른다)
//   &rank=table|number(경주 중 순위 표시 — 표 | 큰 숫자. 안 주면 설정에서 고른 것, 처음이면 표)
//   &course=B|C|D(코스 — src/track/courses.js. 없거나 모르는 id 면 B)
//   &road=a|b|c|0(도로 모습 — 기본 a, 0 은 예전 단색 노면) &nature=a|b|c|0(잔디 · 나무 — 기본 c, 0 은 예전 모습. campus.js 가 읽는다)
//   &parts=0(얹은 부품 — 점프대 · 부스트 발판 — 을 뺀다. 공중 구간(다리)은 길의 높이라 남는다: 회오리 다리가 제 길 위를 건넌다)
//   &runlog=1(검증용 — ?auto=1 과 같이: 자동 운전의 명령을 키보드 같은 이산값으로 바꿔 그 값으로 달리고 주행 기록기 game.runLog 에 적는다. 서버의 다시 계산과 맞춰 보는 데 쓴다)
//   &rankApi=<주소>(게임을 localhost · 127.0.0.1 로 열 때만: 같은 두 호스트의 HTTP 주소를 쓰거나 0 · off 로 끈다. 평소에는 meta[name="rank-api"] 를 따른다)
import './net/unpack.js';   // 맨 먼저: 올릴 묶음의 3D 파일은 gzip 으로 줄여져 있다 — fetch 를 감싸 받아서 푼다(개발 중의 원본은 그대로 지나간다)
import * as THREE from '../bts/vendor/three.module.js';
import { createStage, LOOKS } from './world/stage.js';
import { createCapProbe, createSlowWatch, showPower, powerText } from './world/frame-cap.js';
import { loadCampus } from './world/campus.js';
import { createTrack } from './track/track.js';
import { createCourseWorld } from './track/parts.js';
import { createKartSim } from './kart/physics.js';
import { SPEED_CLASSES, DEFAULT_CLASS, carParams, carStats, carKind, baseParams } from './kart/classes.js';
import { CARS, DEFAULT_CAR, carOf, kartOf, STAT_NAMES, BODY_NAME, bodyStat, footprintOf } from './kart/karts.js';
import { createGarage, shootShowroom } from './garage.js';
import { createInput } from './kart/input.js';
import { startBoostDue } from './kart/start-boost.js';
import { createAutoDriver } from './kart/autodrive.js';
import { createKartModel, KART_DIMENSIONS } from './kart/model.js';
import { loadVehicles, loadVehicle, createVehicleModel, hasVehicle, VEHICLES } from './kart/vehicles.js';
import { createKartEffects } from './kart/effects.js';
import { createKartShadow } from './kart/shadow.js';
import { createChaseCamera, CAMERA, CINE_CAMERA, cameraForCar } from './kart/camera.js';
// 실제 크기 실사 차(시안) — 카메라가 차 크기를 따른다. 값 = [길이, 높이](m, 운전자 포함 · manifest 와 같은 어림 — 카메라는 차량을 불러오기 전에 정해져서 여기 둔다).
const REAL_SIZES = { sedan: [4.87, 1.36], gt: [4.6, 1.17], supercar_real: [4.55, 1.18], truck_real: [5.1, 1.97], garbagetruck_real: [6.19, 2.6],
  formula_real: [4.9, 1.0], golfcart_real: [2.4, 1.8], forklift_real: [3.42, 2.1], shoppingcart_real: [1.06, 1.95], racekart: [1.82, 1.155],
  taxi_real: [4.76, 1.75], eagle_statue: [1.33, 2.12], minibus_real: [7.1, 2.73], bicycle_real: [1.83, 1.69], racebike_real: [2.05, 1.43] };
const ROAD_CARS = Object.keys(REAL_SIZES).filter(id => REAL_SIZES[id][0] >= 4);   // 줄여 보기(size=game)는 큰 차에만
// 차 크기를 따르는 카메라(camera.js 의 cameraForCar — 길이만큼 뒤로, 키 큰 차는 지붕 너머 앞길이 보일 만큼 위로).
const cameraFor = id => REAL_SIZES[id] ? cameraForCar(id, REAL_SIZES[id][0]) : null;
import { createHud, lapText, shareWith } from './hud/hud.js';
import { blockZoom } from './hud/no-zoom.js';
import { createGhostRecorder, createGhostPlayer, createGhostStores, pruneGhosts } from './ghost.js';
import { createAudio, pauseWhenHidden } from './audio.js';
import { createRace, RACE, RIVALS, LEVELS, DEFAULT_LEVEL } from './race/race.js';
// 경주 한 틱의 계산(서버의 다시 계산과 같은 코드 — 2026-11-24 경주 랭킹)과 주행 지형(서버와 같은 자료 · 결정적 수학)
import { newRace as newRaceRun, withRivalWorld, raceContext, placeRace, stepRace, snapshotRace, rivalCarOf, RIVAL_CARS, raceVersion, RACE_VER, applyRaceCap, damageScaleOf } from './race/race-run.js';
import { simTerrain } from './race/sim-terrain.js';
import { createCarState } from './race/carstate.js';
import { createRadio } from './radio.js';
import { createRadioCalls } from './race/radio-calls.js';
import { courseOf, COURSES } from './track/courses.js';
// 타임어택 한 틱의 계산(서버의 다시 계산과 같은 코드)과 주행 기록기(랭킹 — 다시 계산할 입력 · 기록점)
import { buildCourse, trialContext, placeTrial, stepTrial, trialVersion, RULES, TRIAL_LAPS } from './race/time-trial.js';
import { createRunLog, createDiscretizer } from './race/run-log.js';
import { RANK_CLASS, RACE_LEVEL, RANK_MODES, boardIdOf, splitBoardId } from './shared/rank-rules.js';

// 랭킹 주소는 올릴 묶음의 meta가 정하고, 개발하는 동안에는 로컬 서버 주소를 고를 수 있다.
const LOCAL_API = /^http:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?$/;
export function rankApiFor(page, meta, override) {
  const rankMeta = (meta || '').trim().replace(/\/+$/, '');
  const server = rankMeta === 'self' ? page.origin : /^https?:\/\//.test(rankMeta) ? rankMeta : '';
  if (page.hostname !== 'localhost' && page.hostname !== '127.0.0.1') return server;
  const query = (override || '').trim().replace(/\/+$/, '');
  return ['0', 'off'].includes(query) ? '' : LOCAL_API.test(query) ? query : server;
}

// 타임어택 한 판(서서 출발한 3바퀴)이 끝났을 때 랭킹에 올릴지 · 어느 결과 판을 보일지 고른다. 랭킹의 결과 판(rank.lap)을 띄웠으면 true — 아니면 main 이 보통 결과 화면을 띄운다.
//   info = { lapMs(3바퀴 합계), laps([초 · 초 · 초]), result(main 이 띄운 결과 화면의 자료 — 조용히 올린 것의 순위 · 알림을 거기에 붙인다) }
//   올리는 것은 기록기가 방금 묶은 그 판일 때만(합계 · 바퀴 수가 같을 때). 조용히 올린 것의 성공 · 실패는 같은 경기의 그 결과 화면이 아직 떠 있을 때만 그린다.
export function rankTrialRun(rank, game, hud, info, handlers) {
  const run = game.runLog.lastRun(), lapMs = info.lapMs;
  if (!run || run.lapIndex !== TRIAL_LAPS || run.lapMs !== lapMs || !rank.isBest(game.course.id, lapMs)) return false;
  const how = rank.plan(game.course.id, lapMs), mine = { course: game.course.id, car: game.car, lapMs, laps: info.laps, run };
  if (how === 'skip') { rank.keep(game.course.id, lapMs); return false; }   // 닉네임을 미룬 사람: 올리지 않고 내 최고로만
  if (how === 'quiet') {
    const runNow = game.begins, shown = info.result, same = () => game.begins === runNow && game.phase === 'finished' && game.result === shown;   // 그 판의 결과 화면이 아직 제 것일 때만 고친다
    rank.quiet(mine, { onRank: r => { if (Number.isFinite(r.rank) && same()) { shown.rank = r.rank; shown.total = r.total; hud.result(shown, handlers); } },
      onNote: text => { if (same()) { shown.note = text; hud.result(shown, handlers); } } });
    return false;
  }
  rank.lap(mine, handlers);
  return true;
}

// 속도를 묶은 차에서만 그때의 최고 속도를 되돌린다. 새 차는 자기 주행 값으로 시작한다(2026-11-24 경주 틱과 함께 src/race/race-run.js 로 옮겼다 — 시험이 여기서도 부른다).
export { applyRaceCap };

// 랭킹의 판 이름(rank.js 의 id — 'B' · 'B/gp') → 코스판 · 경주판
export const rankVersionOf = id => { const { course, mode } = splitBoardId(id); return mode === 'time' ? trialVersion(course) : mode ? raceVersion(course, mode) : ''; };

// 경주(그랑프리) 한 판이 결승했을 때(2026-11-25 사용자가 고른 결과 화면 B '기록 중심' — 랭킹의 결과 판 틀): 올리는 판이면 늘 그 판을 띄운다.
//   info = { lapMs(출발 신호부터 결승까지), laps([초 …] 바퀴별), place(그 경주의 등수), karts, pits(피트 횟수 — 피트 없는 판은 null), bestLap(초), result(main 의 경주 결과 화면 자료) }
//   내 최고보다 빠르면 rank.lap(올리는 중 → 순위 · 오른쪽 랭킹, 처음이면 닉네임 판 · 미뤘으면 순위 없이), 느리면 rank.show(같은 틀에 순위 · 표 없이 + 내 최고와의 차).
//   타임어택과 달리 '조용히 올리기'(보통 결과 화면에 순위 한 줄)는 없다 — 경주 결과는 이 틀 하나다. 랭킹의 결과 판을 띄웠으면 true, 아니면(기록기가 이 판이 아님) main 이 경주 결과 화면을 띄운다.
export function rankRaceRun(rank, game, hud, info, handlers) {
  const run = game.raceLog?.lastRun(), id = boardIdOf(game.course.id, game.mode), lapMs = info.lapMs;
  if (!run || run.v !== RACE_VER || run.lapMs !== lapMs) return false;
  const race = { place: info.place ?? null, karts: info.karts ?? null, pits: info.pits ?? null, bestLap: info.bestLap ?? null };
  const mine = { course: id, car: game.car, lapMs, laps: info.laps, place: info.place, race, run };
  if (rank.isBest(id, lapMs)) rank.lap(mine, handlers); else rank.show(mine, handlers);
  return true;
}

// 올릴 수 없는 시승판에서만 차별 감각의 세기를 받는다. 생략하거나 범위를 벗어나면 배포값이다.
export function feelStrengthFor(query) {
  const raw = query.get('feel');
  if (query.get('tune') !== '1' || !raw?.trim()) return undefined;
  const strength = Number(raw);
  return Number.isFinite(strength) && strength >= 0 && strength <= 1.5 ? strength : undefined;
}

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const lerp = (a, b, t) => a + (b - a) * t;

// 지난번에 고른 차: 주소 ?car=(· 예전의 ?kart=)가 먼저, 없으면 브라우저에 남긴 것, 없으면 GT. boot 가 캠퍼스를 받기 전에 그 차의 모형부터 받으려고 따로 뺐다(약속 3.41).
const CAR_KEY = 'campus-kart:car', KART_KEY = 'campus-kart:kart';   // KART_KEY: 차 고르기 화면이 생기기 전에 남긴 값(감각만)
export function savedCar(query) {
  const kartCar = type => CARS.find(c => !c.vehicle && c.kart === type)?.id;
  let id = query.get('car') || kartCar(query.get('kart')) || null; try { id ||= localStorage.getItem(CAR_KEY) || kartCar(localStorage.getItem(KART_KEY)); } catch {}
  return CARS.some(c => c.id === id) ? id : DEFAULT_CAR;
}

async function boot(query, picked, hud, game) {
  const { course, partsData, pitData, sections } = picked, canvas = document.getElementById('game');
  // 30장 묶임 재기(frame-cap.js · 약속 3.39): 열자마자 가벼운 requestAnimationFrame 으로 화면을 부르는 간격을 본다 — 불러오는 동안 짧은 간격이 한 번이라도 나오면 묶이지 않은 기기다.
  //   묶인 기기(저전력 모드)의 시작 화면에만 한 줄을 보인다(powerNow → hud.ready 의 power · 떠 있는 동안 바뀌면 hud.power).
  //   **맥의 크롬은 저전력 모드에서 묶이지 않고 느려지기만 한다**(사용자 2026-11-26 "일단 저전력 모든데 안떠") → 시작 화면을 실제로 그리는 간격도 본다(slowWatch).
  //   느리기만 한 것은 터치 기기가 아니고 충전 중이라고 알려지지 않았을 때만 보인다(showPower — 휴대폰은 원래 느린 기기가 많고, 책상 PC 는 크롬이 '충전 중'으로 알려 준다).
  // 처음 온 사람에게만: 시작 화면의 말풍선(약속 3.40 — 모드 · 피트 · 부스트를 한 번 알려 준다). 브라우저에 'campus-kart:tip' = new(처음 왔다 — 닫거나 출발할 때까지 보인다) | old(이 기능 전에 온 적이 있다) | 1(봤다).
  //   **다른 것이 저장소에 쓰기 전에** 본다(이 줄이 boot 의 맨 앞에 있어야 하는 까닭). 저장소를 못 쓰면 열 때마다 한 번 보인다.
  const TIP_KEY = 'campus-kart:tip'; let tipOn = false;
  try { let seen = localStorage.getItem(TIP_KEY); if (!seen) { seen = Object.keys(localStorage).some(k => k.startsWith('campus-kart:')) ? 'old' : 'new'; localStorage.setItem(TIP_KEY, seen); } tipOn = seen === 'new'; } catch { tipOn = true; }
  const seeTip = () => { if (!tipOn) return; tipOn = false; try { localStorage.setItem(TIP_KEY, '1'); } catch {} };
  const capProbe = createCapProbe(), slowWatch = createSlowWatch(); let capWatch = true, powerShown = '', powerAt = 0, charging;   // charging: 모르면 undefined(사파리 · 파이어폭스)
  try { navigator.getBattery?.().then(b => { charging = b.charging; b.addEventListener('chargingchange', () => { charging = b.charging; }); }, () => {}); } catch {}
  const powerNow = () => showPower({ capped: capProbe.capped, slow: slowWatch.slow, touch: TOUCH, charging }) ? powerText(navigator.userAgent) : '';
  // 재는 동안 구석의 1픽셀을 번갈아 칠한다: 크롬은 화면에 바뀐 것이 없는 장이 이어지면 부르는 간격을 절반으로 줄인다(그러면 묶이지 않은 기기도 33.3 ms 로 보인다). 첫 화면을 그리면 뗀다.
  const capDot = document.createElement('i'); capDot.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;pointer-events:none'; document.body.appendChild(capDot);
  let capFlip = false; const capPaint = () => { capFlip = !capFlip; capDot.style.background = capFlip ? 'rgba(0,0,0,.02)' : 'rgba(0,0,0,.04)'; };
  { const tick = t => { if (!capWatch) return; capProbe.sample(t, false, !document.hidden); capPaint(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  const AUTO = query.has('auto'), SPEEDUP = AUTO ? Math.max(1, Math.min(16, Number(query.get('speed')) || 1)) : 1;
  // 시작 화면 배경 주행(src/attract.js): 기본은 cams(2026-11-23 사용자가 로비 시안에서 'B 중계 카메라'를 고름 — 차 넷이 달리고 카메라가 4~6초마다 바뀐다).
  //   ?attract=0 | off 예전처럼 서 있는 차 · ?attract=follow 비교용(따라가며) · ?attract=cams 그대로. 자동 운전(?auto)과 움직임 줄이기(prefers-reduced-motion)는 서 있는 차(주소로 follow · cams 를 주면 그것).
  const attractQuery = query.get('attract'), REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ATTRACT = AUTO || ['0', 'off'].includes(attractQuery) ? null : ['follow', 'cams'].includes(attractQuery) ? attractQuery : REDUCED_MOTION ? null : 'cams';
  // 첫 화면에 보이는 차의 모형부터 받는다(약속 3.41): 내 차 + 배경 주행(cams)의 상대 셋(attract.js 의 ATTRACT.rivals). 캠퍼스를 받는 동안 같이 받고, 시작 화면은 이것을 기다린다(아래 '첫 화면의 차 모형을 기다린다').
  //   사용자 2026-11-26 "가끔 첫화면에서 차는 GT인데 다른걸로 차가 설정되어있고, 플레이도 다른 차로 진행되는 버그" — 모형 파일은 캠퍼스를 다 받은 뒤에야 받기 시작했고, 올 때까지 모든 차를 임시 카트 모양으로 그렸다
  //   (연결이 느리거나 처음 여는 주소면 그 사이가 길다. 설정 · 주행 값은 내내 고른 차였고 모양만 달랐다).
  const firstModels = Promise.allSettled([savedCar(query), ...(ATTRACT === 'cams' ? RIVAL_CARS.slice(0, 3) : [])].map(id => carOf(id).vehicle).filter(Boolean).map(id => loadVehicle(THREE, id)));
  const TICK = 1 / 120, PARTS_ON = query.get('parts') !== '0', GHOST_ON = query.get('ghost') !== '0', audio = query.get('sound') === '0' || AUTO ? null : createAudio();
  const RANK_API = rankApiFor(location, document.querySelector('meta[name="rank-api"]')?.content, query.get('rankApi'));

  const look = query.get('time') || 'night', isNight = look === 'night';   // 기본은 밤(2026-11-23). 기록 · 유령의 이름에는 시간이 안 들어간다(storeName · raceKey) — 낮 · 밤이 같은 기록을 쓴다
  const dayFx = query.get('time') === 'day' && query.get('fx') === '1';
  const usePost = dayFx || (isNight && query.get('fx') !== '0');
  const createPost = usePost ? (await import('./world/post.js')).createPost : null;
  // 밤 밝기 조정값: 주소 ?night=<id>(night-tune.js — 2026-11-23 '앞길이 안 보인다'의 후보들). 없으면 지금 그대로.
  const nightTune = isNight ? (await import('./world/night-tune.js')).nightTune(query.get('night')) : null;
  // 화질: 주소 ?quality= 가 먼저, 없으면 설정의 '화질' 줄에서 고른 것(브라우저에 남는다 — 터치 기기에만 그 줄이 있다), 없으면 자동
  const QUALITY_KEY = 'campus-kart:quality', QUALITIES = ['auto', 'smooth', 'high'];
  let qualityPick = QUALITIES.includes(query.get('quality')) ? query.get('quality') : null; try { if (!qualityPick && QUALITIES.includes(localStorage.getItem(QUALITY_KEY))) qualityPick = localStorage.getItem(QUALITY_KEY); } catch {}
  const stage = createStage(THREE, canvas, { quality: qualityPick || 'auto', look, createPost, dayFx, nightLook: nightTune?.look });
  const campus = await loadCampus(THREE, { onProgress: p => hud.loading(p && p.total ? p.loaded / p.total : 0) });
  stage.scene.add(campus.group);
  // 코스 부품(점프대 · 부스트 발판 · 공중 구간): 자료는 course-b.parts.js, 계산은 parts.js. 노면과 방호벽은 공중 구간이 들어 올린 높이를 따른다.
  // 길은 위아래로 겹칠 수 있다(회오리 다리): 노면의 높이는 트랙 거리 s 로 묻는다(자리만으로는 어느 층인지 모른다).
  // 코스 묶음(부품 · 피트 · 주행 세계 · 되돌려 놓기 · 랩 시계를 만드는 법)은 time-trial.js 의 buildCourse — 서버의 다시 계산이 같은 것을 짓는다.
  // 주행의 지형은 서버와 같은 자료 · 같은 코드(src/race/sim-terrain.js — 결정적 수학, 2026-11-24). 화면의 땅 · 길 모양은 캠퍼스의 것(campus.heightAt) 그대로 — 둘은 마지막 자리만 다르다.
  const built = buildCourse({ picked, heightAt: simTerrain().heightAt, partsOn: PARTS_ON });
  // 노면 높이: s 를 주면 그 자리의 판(공중 구간 + 기운 코너 — 옆 자리로 잰다), 안 주면 그 자리에서 가장 위의 판
  const parts = built.parts, surfaceAt = (x, z, s) => campus.heightAt(x, z) + (s === undefined ? parts.deckAt(x, z) : parts.surfaceLift(x, z, s));
  // 가운데 점선은 부스트 발판 · 점프대 자리를 건너뛴다(발판 무늬 · 쐐기와 겹치지 않게)
  const lineGaps = [...parts.pads.map(p => [p.at - 1.5, p.at + p.length + 1.5]), ...parts.ramps.map(r => [r.at - 1, r.at + r.length + 0.6])];
  // 피트레인: 출발 직선 오른쪽 방호벽 바깥으로 갈라졌다 합치는 길(자료 course-b.pit.js, 계산 pit.js). 주행로의 방호벽은 들어가는 곳 · 나오는 곳에서 열린다.
  const pit = game.pit = built.pit;
  const track = createTrack(THREE, course, { heightAt: surfaceAt, openAt: parts.openAt, gapAt: pit ? pit.gapAt : null, lineGaps });
  stage.scene.add(track.group);
  // 갈림길의 막아 둔 갈래(코스 E 에서 온 것 — 2026-11-25 묶은 코스 D 의 체육관 지름길. 1단계는 그리기만: 노면 · 방호벽 · 막음 판. 주행 · 랩 시계는 이 길을 모른다). 없으면 null.
  const branch = game.branch = picked.branch ? (await import('./track/branch.js')).createBranch(THREE, picked.branch, { groundAt: campus.heightAt }) : null;
  if (branch) stage.scene.add(branch.group);
  // 도로 모습(src/track/road-look.js): 기본 a — 2026-11-24 사용자가 시안에서 'A 마른 아스팔트의 결'을 골랐다. ?road=b|c 는 견줌용, ?road=0 은 예전 단색 노면(그때는 불러오지도 않는다).
  const roadId = query.has('road') ? query.get('road') : 'a';
  if (roadId && roadId !== '0' && roadId !== 'off') game.roadLook = await import('./track/road-look.js').then(m => m.applyRoadLook(THREE, { id: roadId, track, course, parts, stage })).catch(e => { console.warn('도로 모습을 못 붙임', e); return null; });
  // 트랙 통로(방호벽 자리까지)의 나무 · 경계석 · 가로등 치우기. 떠오른 길 둘레와 점프해 날아가는 길은 더 넓게 치운다.
  // 넓힌 길(2026-11-24 14 m)에 먹힌 나무 · 관목 · 벤치 · 가로등은 숨기기 전에 새 길가로 옮긴다(표: courses.js 의 moves). 옮기지 못한 것은 아래에서 숨긴다.
  game.moved = campus.moveGroundInstances?.(picked.moves || []) ?? null;
  game.hidden = campus.hideGroundInstances((x, z) => track.contains(x, z, 1) || parts.clearAt(x, z) || (pit ? pit.beyond(x, z, 1.5) : false) || (branch ? branch.contains(x, z, 1) : false));   // 피트레인 · 막아 둔 갈래 위의 나무 · 관목도
  // 연세대 표시(사용자 2026-11-23 — 시안/연세표시_고르기에서 고름): 기본이 켜져 있고, 주소 인자로 끄거나 다른 안을 본다(비교용).
  //   상징 건물 밤 조명(밤만): 기본 b(또렷하게) · ?landmark=a 은은하게 · ?landmark=0 끔
  //   방호벽 · 연석 색: 기본 grey(남색 + 밝은 회색) · ?barrier=navy 남색 + 흰색 · ?barrier=blue 예전 파랑
  //   길가 장소 표지판: 기본 켬 · ?signs=0 끔
  const landmarkQ = query.get('landmark'), landmarkMode = landmarkQ === '0' || landmarkQ === 'off' ? null : landmarkQ === 'a' ? 'a' : 'b';
  const barrierQ = query.get('barrier'), barrierScheme = barrierQ === 'blue' ? null : barrierQ === 'navy' ? 'navy' : 'grey';
  const schoolColours = barrierScheme ? (await import('./world/school-colours.js')).applySchoolColours : null;
  schoolColours?.(THREE, track.group, barrierScheme);
  if (branch) schoolColours?.(THREE, branch.group, barrierScheme);
  let night = null;
  if (isNight) {
    const { createNightDrive } = await import('./world/night-drive.js');
    const landmarks = landmarkMode ? (await import('./world/landmarks.js')).createLandmarkLighting(THREE, { scene: stage.scene, campus, mode: landmarkMode }) : null;
    if (landmarks) game.landmarks = landmarks.found;
    night = createNightDrive(THREE, stage.scene, { course, parts, pit, campus, lampOver: picked.lampOver, lampIgnore: picked.lampIgnore }, { landmarks, tune: nightTune });
    game.nightLamps = night.lamps;
  } else if (dayFx) {
    const { createNightMaterials } = await import('./world/night-materials.js');
    createNightMaterials(THREE).apply(track.group);
  }
  stage.invalidateShadow?.();
  // 길가 장소 표지판(이름 붙은 코너 · 구간 앞 — 자료 course-b.sections.js, 모양 signs.js). 모양이 없어도 주행은 된다.
  if (query.get('signs') !== '0') import('./track/signs.js').then(({ createCourseSigns }) => {
    const signs = game.signs = createCourseSigns(THREE, { sections, course, parts, campus, pit, night: isNight, lamps: night?.lamps.lamps });
    stage.scene.add(signs.group); night?.apply(signs.group); stage.invalidateShadow?.();
  }).catch(error => console.warn('표지판을 세우지 못함', error));
  // 급굽이 가장자리 유도등(src/track/guide-lights.js — 사용자 2026-11-25 시안 '(가) 가장자리 등 · 급굽이만'): 코스 중심선에서 급굽이를 찾아 길 양쪽 끝에 파란 등.
  //   밤에만 빛난다(낮 · 노을은 불 꺼진 머리만). 꾸밈이라 주행 계산은 부르지 않는다 · ?guide=0 끔(비교용). 코스를 바꾸면 쪽을 새로 불러오므로 한 번만 짓는다.
  //   꼴(사용자가 타 보고 고른다): 기본 급굽이만 · ?guide=bends 굽이마다(급할수록 촘촘히) · ?guide=full 코스 전체(급굽이만 촘촘히). 모르는 값이면 기본.
  const guideQ = query.get('guide'), guideMode = ['sharp', 'full'].includes(guideQ) ? guideQ : 'bends';   // 기본 = 굽이마다(2026-11-25 사용자가 셋을 타 보고 고름)
  if (guideQ !== '0') import('./track/guide-lights.js').then(({ createGuideLights }) => {
    game.guideLights?.dispose();
    const guide = game.guideLights = createGuideLights(THREE, { course, parts, pit, surfaceAt, night: isNight, mode: guideMode });
    stage.scene.add(guide.group);
  }).catch(error => console.warn('유도등을 놓지 못함', error));
  // 부품의 모양(다리 구조 · 점프대 쐐기 · 발판 무늬). 모양이 없어도 주행은 된다.
  let partModels = null;
  if (parts.list.length) import('./track/part-models.js').then(({ createPartModels }) => {
    partModels = game.partModels = createPartModels(THREE, { parts, groundAt: campus.heightAt, surfaceAt }); stage.scene.add(partModels.group); stage.invalidateShadow?.();
    schoolColours?.(THREE, partModels.group, barrierScheme);
    night?.apply(partModels.group);
  }).catch(error => console.warn('부품 모양을 불러오지 못함', error));
  // 부딪히면 날아가는 소품(라바콘 · 상자 — 코스 D, src/track/fly-props.js). 보이기만 한다: 주행 계산 · 기록 · 유령 · 순위에 안 든다. ?props=0 이면 없다.
  let flyProps = null;
  if (picked.props?.length && query.get('props') !== '0') import('./track/fly-props.js').then(({ createFlyProps }) => {
    flyProps = game.flyProps = createFlyProps(THREE, { parts, spots: picked.props, surfaceAt, floorAt: (x, z, y) => viewWorld.heightAt(x, z, y), reducedMotion: REDUCED_MOTION });
    stage.scene.add(flyProps.group); night?.apply(flyProps.group);
  }).catch(error => console.warn('소품을 불러오지 못함', error));
  // 피트레인의 모양(노면 · 줄 · 정차 칸 · 표지 · 바깥 방호벽). 모양이 없어도 주행은 된다.
  let pitModels = null;
  if (pit) import('./track/pit-models.js').then(({ createPitModels }) => {
    pitModels = game.pitModels = createPitModels(THREE, { pit, parts, surfaceAt, groundAt: campus.heightAt }); stage.scene.add(pitModels.group); stage.invalidateShadow?.();
    schoolColours?.(THREE, pitModels.group, barrierScheme);
    night?.apply(pitModels.group);
  }).catch(error => console.warn('피트레인 모양을 불러오지 못함', error));

  // 카트는 늘 트랙 위에 있으므로, 달리는 바닥은 지형이 아니라 그 위에 띄운 노면이다(부품이 얹은 높이 포함).
  // 세계는 높이로 층을 가른다: heightAt(x, z, y) = y 높이의 카트가 딛는 바닥. 주행 계산과 화면(카메라 · 그림자)은 세계를 따로 갖는다.
  // 내 카트의 세계에는 피트레인이 있고(벽이 열리고 바깥 벽이 선다), 컴퓨터 상대의 세계에는 없다(상대는 피트에 안 들어간다 — 열린 곳으로 새지 않게 벽을 닫아 둔다).
  const ground = built.ground, world = built.world, viewWorld = createCourseWorld(parts, ground, { pit }), rivalWorld = withRivalWorld(built).rivalWorld;
  const roadAt = (x, z, y) => viewWorld.heightAt(x, z, y);
  // 속도 등급: 주소 인자 > 지난번에 고른 것 > 기본. 등급마다 카트 계산 · 자동 운전 · 최고 기록 유령이 따로다.
  //   2026-11-24 사용자: "아주 빠름을 default로 설정하고 설정 자체를 없애버리는 것도 괜찮을듯" → "없애". 모두 '아주 빠름'(DEFAULT_CLASS) 하나로 달린다:
  //   시작 화면의 '속도' 칸 · 달리는 중의 1 · 2 · 3 키 · 브라우저에 남기던 값(campus-kart:class)을 없앴다. 주소 ?class=normal|fast 는 개발 · 검증용으로만 남는다(그 판은 순위에 안 오른다).
  let klass = query.get('class');
  if (!SPEED_CLASSES.some(c => c.id === klass)) klass = DEFAULT_CLASS;
  // 카트 종류(모양과 주행 감각이 다르다): 주소 인자 ?kart= > 지난번에 고른 것 > 기본. 종류마다 기록 · 유령이 따로다.
  let carId = savedCar(query);
  let kartId = carOf(carId).kart;   // 주행 감각. 타임어택의 기록 · 유령은 차마다 따로다(2026-11-25 사용자 "따로 저장" — 그 전에는 감각마다)
  audio?.setCar(carId);   // 엔진 소리는 차를 따른다(audio.js 의 CAR_ENGINE — 2026-11-24 사용자: "트럭이나 F1카나 소리가 같으니까 좀 이상한 것 같아")
  // 조정판이 고친 값(등급을 곱하기 전의 기준값). 비어 있으면 params.js 그대로다.
  const tuned = {}, strength = feelStrengthFor(query), carOptions = { base: tuned, strength };
  const paramsNow = () => carParams(carId, klass, carOptions);
  const isTuned = () => strength !== undefined || Object.keys(tuned).length > 0;
  const tuneSuffix = () => strength !== undefined ? ':tuned:' + strength : isTuned() ? ':tuned' : '';
  // 부딪힘 모양 — 고른 차의 실제 크기(벽 · 몸싸움 · 출발 자리, 2026-11-23). 주소 body=0 이면 예전처럼 모든 차가 카트의 원 하나(검증 · 비교용)
  const BODY_OFF = query.get('body') === '0', bodyNow = () => BODY_OFF ? null : footprintOf(carOf(carId));
  let sim = createKartSim({ params: paramsNow(), world, body: bodyNow() });
  // 차 상태(데미지)와 피트 수리. top = 묶이지 않았을 때의 최고 속도, cappedSim = 지금 속도가 묶인 차(피트 · 데미지)
  const car = createCarState({ pit, damageScale: damageScaleOf(picked) }), top = { maxSpeed: 0, boostMaxSpeed: 0, cappedSim: null };
  // 모드: 경주(상대 7대 · 3바퀴) | 타임어택(혼자 · 기록 유령). 주소 인자 > 지난번에 고른 것 > 경주.
  // 그랑프리: 바퀴 수를 늘리고 차 상태(데미지)와 피트 수리를 켠 경주(사용자 2026-11-21 — 어느 모드에 넣을지는 메인이 새 모드로 정했다, 사용자 확인 전).
  // 피트가 없는 코스의 그랑프리: 데미지는 피트에서만 고칠 수 있어 피트가 없으면 아예 들지 않는다 — 그러니 모드 설명의 '데미지 · 피트'와 차 상태 막대도 없다(바퀴 수만 다른 경주. 사용자 결정 2026-11-24).
  //   (2026-11-25 부터 B · D 둘 다 피트가 있어 지금 코스에서는 안 나오는 길 — 남겨 둔다. 시험은 검증/verify-race.test.mjs 의 가짜 코스)
  const gpDamage = !!pit;
  // 2026-11-25 사용자: "그랑프리랑 타임어택만 있어도 될 것 같기도하고" → 스피드전을 뺐다. 처음 오는 사람은 그랑프리. 바퀴 수는 코스마다(courses.js — 한 판 3 ~ 4분 안쪽)
  // hint: 모드 단추의 이름 밑에 보이는 한 줄(2026-11-26 사용자 "처음하는사람들은 … 차이가 뭔지 모르니까, 가볍게 알려주는 것" → 시안 '가: 단추 안에 한 줄'). note 는 그대로 단추의 title(마우스를 올리면)이다.
  const MODES = [{ id: 'gp', name: '그랑프리', hint: `상대 7대 · ${picked.laps.gp}바퀴`, note: gpDamage ? `${picked.laps.gp}바퀴 · 데미지 · 피트` : `${picked.laps.gp}바퀴`, rivals: true, laps: picked.laps.gp, damage: gpDamage },
    { id: 'time', name: '타임어택', hint: `혼자 · ${TRIAL_LAPS}바퀴 기록`, note: '혼자 · 기록', rivals: false }], MODE_KEY = 'campus-kart:mode', modeNow = () => MODES.find(m => m.id === mode) || MODES[0];
  // 상대의 난이도: 주소 인자 ?level= > 지난번에 고른 것 > 보통. 값은 race.js 의 LEVELS(쉬움 = 2026-11-20 까지의 상대 그대로).
  const LEVEL_KEY = 'campus-kart:level'; let levelId = query.get('level'); try { levelId ||= localStorage.getItem(LEVEL_KEY); } catch {} if (!LEVELS.some(l => l.id === levelId)) levelId = DEFAULT_LEVEL;
  let mode = query.get('mode'); try { mode ||= localStorage.getItem(MODE_KEY); } catch {} if (mode === 'race') mode = 'gp'; if (!MODES.some(m => m.id === mode)) mode = 'gp';   // 옛 스피드전(주소 · 브라우저에 남은 값)은 그랑프리로
  // 설정(브라우저에 남는다): 순위 표시 — 표(기본) | 큰 숫자. 소리 켬 · 끔은 audio 가 제 키로 남긴다. 주소 인자 ?rank=table|number 로도 고른다(검증용).
  // 무전(경주 중 순위 · 앞뒤 차와의 차를 말해 주는 음성): 목소리 넷 또는 끔. 사용자 2026-11-21 "일단 넣어 놓고 설정으로 수정할 수 있는 형태로".
  //   **공개판에서는 뺐다(2026-11-23 사용자 결정)**: 음성 조각(assets/radio/)을 맥 기본 음성으로 만들었는데, 그 사용권(macOS 사용권 계약 2.F)이 공개 공유를 막는다 — 기본으로 꺼 두는 것만으로는 안 되고 파일을 싣지 않아야 한다.
  //   그래서 평소에는 무전이 없다(설정에 '무전' 줄이 없고, 음성 파일을 받지도 않는다). 배포할 때 assets/radio/ 도 뺀다.
  //   개발 · 검증에서만 주소 ?radio=yuna|shelley|eddy|rocko|off 로 켠다(RADIO_ON) — 그때는 설정에 '무전' 줄이 나오고 고른 목소리가 브라우저에 남는다.
  //   공개 배포가 되는 음성(직접 녹음 등 — 같은 파일 이름)으로 바꿔 넣으면 RADIO_ON 을 늘 true 로 하고 기본 목소리를 정한다.
  const SETTINGS_KEY = 'campus-kart:settings', RANK_STYLES = ['table', 'number'], RADIO_VOICES = ['off', 'yuna', 'shelley', 'eddy', 'rocko'], RADIO_ON = RADIO_VOICES.includes(query.get('radio')), settings = { rank: 'table', radio: 'off' };
  // 설정의 '음악' 줄(2026-11-24 사용자 "넣어" — 음악만 끈다. '소리'를 끄면 음악도 같이 꺼진다). 브라우저에 남는다. 주소 ?music=off 면 음악을 안 불러 줄도 없다.
  // 설정의 '유령' 줄(2026-11-25 사용자 "켬끔도 넣자" — 타임어택의 기록 유령만 감춘다. 최고 기록 저장 · BEST · 순위는 그대로). 브라우저에 남는다. 주소 ?ghost=0 이면 늘 끔이고 줄도 없다.
  const GHOST_KEY = 'campus-kart:ghost'; let ghostOn = GHOST_ON; try { if (GHOST_ON) ghostOn = localStorage.getItem(GHOST_KEY) !== 'off'; } catch {}
  const MUSIC_KEY = 'campus-kart:music', MUSIC_OFF = query.get('music') === 'off'; let musicOn = true; try { musicOn = localStorage.getItem(MUSIC_KEY) !== 'off'; } catch {}
  try { const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); if (saved && RANK_STYLES.includes(saved.rank)) settings.rank = saved.rank; if (RADIO_ON && saved && RADIO_VOICES.includes(saved.radio)) settings.radio = saved.radio; } catch {}
  if (RANK_STYLES.includes(query.get('rank'))) settings.rank = query.get('rank');
  if (RADIO_ON) settings.radio = query.get('radio');
  const radio = createRadio({ audio, voice: settings.radio }), calls = createRadioCalls({ rivals: RIVALS.map(r => ({ id: r.id, name: r.name })) }), radioSnap = { pit: { inLane: false, repairing: false } }; let boostsAtStart = 0;
  function setSetting(id, value) {
    if (id === 'rank' && RANK_STYLES.includes(value)) { settings.rank = value; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
    if (id === 'sound' && audio) audio.setMuted(value === 'off');
    if (id === 'ghost' && GHOST_ON && (value === 'on' || value === 'off')) { ghostOn = value === 'on'; try { localStorage.setItem(GHOST_KEY, value); } catch {} useBest(); }   // 끄면 그 자리에서 유령이 사라지고, 켜면 지금 차의 최고 판이 다시
    if (id === 'music' && (value === 'on' || value === 'off')) { musicOn = value === 'on'; try { localStorage.setItem(MUSIC_KEY, value); } catch {} }
    if (id === 'quality' && QUALITIES.includes(value)) { stage.setQuality(value); try { localStorage.setItem(QUALITY_KEY, value); } catch {} }
    if (id === 'hand' && (value === 'right' || value === 'left')) { steerHand = value; input.setSteerHand(value); try { localStorage.setItem(HAND_KEY, value); } catch {} }
    if (id === 'radio' && RADIO_ON && RADIO_VOICES.includes(value)) { settings.radio = value; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} radio.setVoice(value); if (value !== 'off') radio.preload(); }
  }
  // '조향' · '화질' 줄은 터치 기기에만(PC 는 자동 화질이 이미 맞춰져 있고 — pacer.js 의 맥북 저전력 사례 — 줄이 늘면 판만 길어진다. PC 는 주소 ?quality= 로 고른다).
  const settingsList = () => [{ id: 'rank', name: '순위', options: [{ id: 'table', name: '표' }, { id: 'number', name: '숫자' }], value: settings.rank },
    ...(GHOST_ON ? [{ id: 'ghost', name: '유령', options: [{ id: 'on', name: '켬' }, { id: 'off', name: '끔' }], value: ghostOn ? 'on' : 'off' }] : []),
    ...(TOUCH ? [{ id: 'hand', name: '조향', options: [{ id: 'right', name: '오른손' }, { id: 'left', name: '왼손' }], value: steerHand },
      { id: 'quality', name: '화질', options: [{ id: 'auto', name: '자동' }, { id: 'smooth', name: '가볍게' }, { id: 'high', name: '선명하게' }], value: stage.quality }] : []),
    ...(audio ? [{ id: 'sound', name: '소리', options: [{ id: 'on', name: '켬' }, { id: 'off', name: '끔' }], value: audio.muted ? 'off' : 'on' }, ...(MUSIC_OFF ? [] : [{ id: 'music', name: '음악', options: [{ id: 'on', name: '켬' }, { id: 'off', name: '끔' }], value: musicOn ? 'on' : 'off' }]), ...(RADIO_ON ? [{ id: 'radio', name: '무전', options: radio.voices, value: settings.radio }] : [])] : [])];
  // 길 밖으로 떨어진 카트를 되돌려 놓기(난간 없는 구간 · 안전망) — 내 카트의 것. 상대는 경주 계산이 제 것을 갖는다.
  const rescue = built.rescue, watch = rescue.watcher();   // 피트레인도 길 위다(buildCourse)
  // 상대 일곱: 입는 차 · 주행 값은 내 차와 무관하게 고정(race-run.js 의 RIVAL_CARS · RIVAL_KART — 2026-11-24 경주 랭킹: 누구나 같은 상대). 그 전에는 내 차 다음 차부터 입고 내 차의 감각을 따랐다.
  //   weigh 는 시작 화면 배경 주행(attract.js — 꾸밈)만 쓴다: 같은 고정 차를 입힌다.
  const weigh = r => { if (r) { RIVALS.forEach((_, i) => { if (i < r.weights.length) r.weights[i] = rivalCarOf(i).weight ?? 1; });
    if (!BODY_OFF) r.setBodies(r.karts.map((_, i) => footprintOf(rivalCarOf(i))), bodyNow()); } return r; };
  // 경주 계산(race-run.js — 서버와 같은 코드): 상대 · 출발 자리 · 내 차의 부딪힘 모양(출발 자리 간격). 달리는 중에는 다시 부르지 않는다(차를 바꾸는 것은 시작 화면에서만)
  const newRace = () => modeNow().rivals ? newRaceRun(built, { mode, level: levelId, klass, car: carId, tuned: Object.keys(tuned).length ? tuned : null, bodyOff: BODY_OFF }) : null;
  let race = newRace(), finished = null, bestLapNow = null, rescued = false;
  // 차의 모양: 차량 모델(glb)을 불러왔으면 그것, 아니면(아직 · 못 불러옴 · 카트) 그 감각의 카트 모양. 차량은 뒤에서 불러와 다 되면 갈아입힌다(dress).
  // 실사 차 시안(실제 크기 glb): 주소 size=game 이면 지금 차량들의 길이(2.3 m)로 줄여 그린다(주행 계산은 그대로 — 보기만).
  const shrink = car => { if (!ROAD_CARS.includes(car.vehicle) || query.get('size') !== 'game') return 1; const len = VEHICLES.find(v => v.id === car.vehicle)?.size?.length; return len ? 2.3 / len : 1; };
  const makeModel = (options = {}, car = carOf(carId)) => {
    const vehicle = car.vehicle && hasVehicle(car.vehicle) ? createVehicleModel(THREE, car.vehicle, options) : null;
    if (vehicle) { const s = shrink(car); if (s !== 1) vehicle.group.scale.setScalar(s); return vehicle; }
    return createKartModel(THREE, { ...options, type: car.kart });
  };
  const raceModel = night ? (options, car) => {
    const model = makeModel({ ...options, night: true, envMap: false }, car);
    night.apply(model.group);
    return model;
  } : makeModel;
  // 상대 일곱의 모양 = 계산과 같은 고정 차(race-run.js 의 RIVAL_CARS)
  const rivalCar = i => rivalCarOf(i);
  let kart = raceModel(); stage.scene.add(kart.group); night?.follow(kart);
  // 카트 그림자: 해 그림자는 30 m 마다만 다시 구워서 달리는 카트를 못 따라온다(자국만 남는다) → 해 그림자에서 빼고, 땅에 붙는 얼룩을 쓴다(뜨면 높이가 읽힌다)
  kart.group.traverse(node => { if (node.isMesh) node.castShadow = false; });
  const kartShadow = createKartShadow(THREE); stage.scene.add(kartShadow.mesh);
  const effects = createKartEffects(THREE, { scene: stage.scene });
  // 상한 차의 효과(파편 · 연기 · 불꽃 — 약속 3.21): 꾸밈이라 따로 불러온다. 못 불러오거나 돌다 죽어도 게임은 그대로 돈다(한 번 알리고 끈다).
  let damageFx = null; import('./kart/damage-fx.js').then(({ createDamageFx }) => { damageFx = game.damageFx = createDamageFx(THREE, { scene: stage.scene }); }).catch(e => console.warn('상한 차의 효과를 못 불러옴', e));
  // 연기가 나는 자리(차 로컬): 차량(glb)은 뒤쪽 윗면을 위에서 쏘아 잰다 — 차마다 엔진 덮개 · 짐칸 · 적재함의 높이가 다르고, 모델이 바뀌어도 따라간다. 운전자의 머리 둘레는 피한다. 카트는 효과의 기본 자리(엔진 위).
  const smokeRay = new THREE.Raycaster(), smokeFrom = new THREE.Vector3(), smokeDown = new THREE.Vector3(0, -1, 0); let smokeFor = null, smokeAt = null;
  function smokeSpot(model) {
    const def = model.vehicle ? VEHICLES.find(v => v.id === model.vehicle) : null; if (!def) return null;
    const g = model.group, px = g.position.x, py = g.position.y, pz = g.position.z, ry = g.rotation.y, head = def.driverHead || [0, 9, 9]; let spot = null;
    g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.updateMatrixWorld(true);
    for (const part of [-0.36, -0.28, -0.44, -0.2]) {
      const z = part * def.size.length; if (Math.abs(z - head[2]) < 0.3) continue;
      smokeFrom.set(0, 4, z); smokeRay.set(smokeFrom, smokeDown); const hit = smokeRay.intersectObject(g, true).find(h => h.object.name !== 'flames');
      if (hit) { spot = [0, hit.point.y, z]; break; }
    }
    g.position.set(px, py, pz); g.rotation.set(0, ry, 0); g.updateMatrixWorld(true);
    return spot;
  }
  // 피트 크루(약속 3.22): 정차 칸 옆의 사람들. 꾸밈이라 따로 불러온다 — 못 불러오거나 돌다 죽어도 게임은 돈다.
  let pitCrew = null, wheelsNow = null;
  const crewView = { x: 0, y: 0, z: 0, heading: 0, speed: 0, inPit: false, holding: false, repairing: false, value: 100, box: -1, damage: false, wheels: null, refills: 0 };
  if (pit) import('./track/pit-crew.js').then(({ createPitCrew }) => { pitCrew = game.pitCrew = createPitCrew(THREE, { pit, groundAt: campus.heightAt }); stage.scene.add(pitCrew.group); night?.apply(pitCrew.group); stage.invalidateShadow?.(); }).catch(e => console.warn('피트 크루를 못 불러옴', e));
  // 바퀴가 땅에 닿는 곳(차 로컬): 크루가 그 옆에 붙는다. 차량(glb)은 manifest 의 값, 카트는 KART_DIMENSIONS.
  const wheelSpots = model => { const w = model.vehicle ? VEHICLES.find(v => v.id === model.vehicle)?.wheels : null;
    return w?.FL && w.RL ? { front: [Math.abs(w.FL[0]), w.FL[2]], rear: [Math.abs(w.RL[0]), w.RL[2]], frontRadius: w.frontRadius, rearRadius: w.rearRadius }
      : { front: [KART_DIMENSIONS.track / 2, KART_DIMENSIONS.wheelbase / 2], rear: [KART_DIMENSIONS.track / 2, -KART_DIMENSIONS.wheelbase / 2], frontRadius: KART_DIMENSIONS.frontRadius, rearRadius: KART_DIMENSIONS.rearRadius }; };
  const damageFxDo = (name, ...args) => { if (!damageFx) return; try { damageFx[name](...args); } catch (e) { console.error('상한 차의 효과가 멈춤', e); try { damageFx.dispose(); } catch {} damageFx = game.damageFx = null; } };
  // 상대 카트의 모양(색만 다르다)과 그림자. 경주 모드에서만 보인다.
  const rivalKarts = RIVALS.map(def => {
    const model = raceModel({ colour: def.colour }, rivalCar(RIVALS.indexOf(def))); model.group.traverse(node => { if (node.isMesh) node.castShadow = false; }); model.group.visible = false; stage.scene.add(model.group);
    const shadow = createKartShadow(THREE); shadow.mesh.visible = false; stage.scene.add(shadow.mesh);
    return { model, shadow, dot: { x: 0, z: 0 }, view: { speed: 0, steer: 0, slip: 0, pitch: 0, roll: 0, drifting: false, boost: 0, boostKind: 'item', kickReady: false, stock: 0, slots: 2, grounded: true, gauge: 0 } };
  });
  const rankRows = [], propHitters = [];   // 순위표에 넘기는 줄 · 소품에 닿는 차(재사용)
  const rivalDots = rivalKarts.map(r => r.dot), showRivals = on => { for (const r of rivalKarts) { r.model.group.visible = on; r.shadow.mesh.visible = on; } };
  // 출발선(과 레인 옆의 다른 문)은 피트레인까지 늘려 둔다 — 피트로 지나가도 바퀴가 세어진다
  const clock = built.makeClock();
  const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;   // 터치 단추는 터치 기기에서만
  document.body.classList.toggle('touch', TOUCH);
  // 배경음악(2026-11-24 사용자가 고른 E '네온 질주' — src/music.js · src/music/neon.js): 소리가 있으면 기본으로 튼다. ?music=off 면 안 부른다(?sound=0 · 자동 운전은 소리가 없어 저절로 꺼짐). 터치 기기는 가벼운 판(LITE).
  if (audio && query.get('music') !== 'off') import('./music.js').then(m => m.followGame({ game, audio, lite: TOUCH, lobby: query.get('musicLobby') !== '0', enabled: () => musicOn })).catch(e => console.error('배경음악을 못 불러옴', e));
  // 터치 단추의 손(2026-11-25 사용자 "단추는 오른손 방향조정, 왼쪽 기술로"): 기본은 오른손 조향 · 왼손 기술. 설정의 '조향' 줄로 바꾸고 브라우저에 남긴다.
  const HAND_KEY = 'campus-kart:steer-hand'; let steerHand = 'right'; try { if (localStorage.getItem(HAND_KEY) === 'left') steerHand = 'left'; } catch {}
  const input = createInput({ keyTarget: window, touchRoot: TOUCH ? document.getElementById('touch') : null, steerHand });
  let driver = AUTO ? createAutoDriver({ samples: course.centre, params: paramsNow() }) : null;

  // 건물 안으로 카메라가 들어가지 않게: 회전 직사각형 안인지. 코스가 그 상자 위 · 옆을 지나가는 건물(courses.js 의 cameraIgnore — 코스 D)은 뺀다:
  //   모델의 상자가 실제 윤곽보다 넓어 길까지 덮으면 카메라가 차 바로 뒤로 끌려와 벽 · 차 지붕만 보인다(2026-11-25 코스 D 달리며 찍은 그림).
  const cameraIgnore = new Set(picked.cameraIgnore || []);
  const boxes = campus.obstacles.filter(o => !cameraIgnore.has(o.id)).map(o => ({ ...o, c: Math.cos(o.rotation || 0), s: Math.sin(o.rotation || 0), reach: Math.hypot(o.w, o.d) / 2 }));
  const blocked = game.cameraBlocked = (x, z) => { for (const o of boxes) { const dx = x - o.x, dz = z - o.z; if (Math.abs(dx) > o.reach || Math.abs(dz) > o.reach) continue; if (Math.abs(o.c * dx - o.s * dz) < o.w / 2 && Math.abs(o.s * dx + o.c * dz) < o.d / 2) return true; } return false; };
  // 실제 크기 실사 차를 고르고 줄이지 않았으면 차 크기에 맞춘 카메라. 차 고르기 화면에서 바꾸면 그 차의 카메라로 따라간다(조정판은 처음 차의 값을 고친다).
  const tuningOf = vehicle => (query.get('size') !== 'game' ? cameraFor(vehicle) : null) || (query.get('cam') === 'cine' ? CINE_CAMERA : CAMERA);
  const cameraTuning = tuningOf(carOf(carId).vehicle), cameraTunings = new Map([[carOf(carId).vehicle, cameraTuning]]);
  // 카메라의 '빠를 때' 끝은 지금 차 · 등급의 일반 최고속에서 닿는다(2026-11-26 속도감 — 그 전에는 72 km/h 에서 다 벌어졌다). 피트레인의 제한 속도로 묶인 값이 아니라 제 최고속을 쓴다.
  let topKey = '', topValue = 0;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');   // 카메라의 잔떨림은 설정의 지금 값을 읽는다(게임을 연 뒤에 켜도 듣게 — 2026-11-26 검토)
  const topSpeedNow = () => { const key = klass + ':' + carId; if (key !== topKey) { topKey = key; topValue = paramsNow().maxSpeed; } return topValue; };
  const chase = createChaseCamera(THREE, stage.camera, { heightAt: roadAt, ceilingAt: (x, z, y) => viewWorld.ceilingAt(x, z, y), blocked, topSpeed: topSpeedNow, calm: () => motionQuery.matches,
    tuning: () => { const v = carOf(carId).vehicle; if (!cameraTunings.has(v)) cameraTunings.set(v, tuningOf(v)); return cameraTunings.get(v); } });
  // 시작 화면 배경 주행(?attract=): 제 차 계산 · 상대 · 카메라를 따로 갖는다 — 게임의 sim · race · 기록은 안 건드린다
  const attract = ATTRACT ? (await import('./attract.js')).createAttract(THREE, ATTRACT, { startAt: picked.show?.attract, course, parts, world, rivalWorld, ground, groundAt: campus.heightAt, blocked, campus, rescue,
    params: () => paramsNow(), body: () => bodyNow(), size: () => REAL_SIZES[carOf(carId).vehicle] || [1.82, 1.155], level: () => levelId, weigh, weight: () => carOf(carId).weight ?? 1 }) : null;
  game.attract = attract;

  // 타임어택 최고와 유령은 코스 · 등급 · 차마다 따로 저장한다. RULES 6에서 옛 감각의 v5x3c 유령을 지운다.
  const GHOST_VER = RULES + 'x' + TRIAL_LAPS + 'c'; pruneGhosts(GHOST_VER);
  const stores = createGhostStores(course.id, GHOST_VER), recorder = createGhostRecorder(), storeName = () => klass + (carId === DEFAULT_CAR ? '' : ':' + carId) + (PARTS_ON ? '' : ':flat') + tuneSuffix(); let store = stores.for(storeName()), storeNow = storeName();   // 조정판으로 카트 값을 고친 채 세운 기록은 따로 둔다
  let ghostPlayer = null, ghostKart = null; const ghostPose = {};
  // 유령 카트(반투명): 지금 고른 카트 종류의 모양으로
  function makeGhostKart() {
    if (ghostKart) { stage.scene.remove(ghostKart.group); ghostKart.dispose?.(); }
    ghostKart = makeModel({ colour: '#dfe6f2' });
    for (const material of Object.values(ghostKart.materials || {})) { if (!material?.isMaterial) continue; material.transparent = true; material.opacity = 0.36; material.depthWrite = false; }
    ghostKart.group.traverse(node => { if (node.isMesh) node.castShadow = false; });
    ghostKart.group.visible = false; stage.scene.add(ghostKart.group);
  }
  makeGhostKart();
  // 갈아입히기: 내 차 · 유령 · 상대 일곱의 모양을 지금 고른 차에 맞춰 다시 만든다(차를 바꿨을 때, 차량을 다 불러왔을 때)
  const wear = (old, model) => { model.group.traverse(node => { if (node.isMesh) node.castShadow = false; }); model.group.visible = old.group.visible; model.group.position.copy(old.group.position); model.group.rotation.copy(old.group.rotation); stage.scene.remove(old.group); old.dispose?.(); stage.scene.add(model.group); return model; };
  function dress() { kart = wear(kart, raceModel()); night?.follow(kart); makeGhostKart(); rivalKarts.forEach((r, i) => { r.model = wear(r.model, raceModel({ colour: RIVALS[i].colour }, rivalCar(i))); }); }   // 모양만(그 전에는 여기서 weigh(race) 로 달리는 중에도 부딪힘 모양을 다시 줬다 — 2026-11-24 뺐다)
  // 경주에 나오는 차(내 차 · 상대 일곱)를 먼저 받아 갈아입히고, 차 고르기 화면에만 나오는 차는 그다음에 받는다(그것은 달리는 화면에 없어 다시 갈아입히지 않는다 — 약속 3.41).
  loadVehicles(THREE, { first: [carId, ...RIVAL_CARS].map(id => carOf(id).vehicle).filter(Boolean), onFirst: dress }).then(() => { game.vehicles = true; }).catch(error => console.warn('차량 모델을 불러오지 못함', error));
  // 최고 기록은 늘 읽고, 유령을 같이 달리게 할지만 설정(?ghost=0)에 따른다.
  const useBest = () => { const best = mode === 'time' ? store.load() : null; ghostPlayer = ghostOn && best ? createGhostPlayer(best) : null; game.best = best ? best.lapTime : null; };   // 유령 · 최고 기록(3바퀴 합계 — 이름 lapTime 은 그대로)은 타임어택의 것
  useBest();

  // ---- 주행 상태
  const prev = {}, cur = {}, pose = {}, line = {}, ghostView = { speed: 12, steer: 0, slip: 0, pitch: 0, roll: 0, drifting: false, boost: 0, grounded: true };
  let braking = false;
  // 타임어택의 한 판(time-trial.js): 내 sim · 차 상태 · 되돌려 놓기 감시 · 랩 시계 · 자세를 묶는다(경주 · 그랑프리와 같은 것을 쓴다 — sim 은 바뀔 때마다 틱 앞에서 다시 묶는다).
  // 주행 기록기(run-log.js): 타임어택이면 늘 적는다 — 바퀴가 끝나면 game.runLog.lastLap() 이 그 바퀴분을 준다. ?auto=1&runlog=1 이면 자동 운전의 명령을 이산값으로 바꾼다.
  const trial = game.trial = trialContext({ built, sim, car, watch, clock, prev, cur }), runLog = game.runLog = createRunLog(), discrete = AUTO && query.get('runlog') === '1' ? createDiscretizer() : null;
  const trialAt = [];   // 타임어택: 바퀴마다 결승선을 넘은 시각(출발 신호부터 · 초)
  // 경주의 한 판(race-run.js — 서버와 같은 계산): 내 sim · 차 상태 · 되돌려 놓기 감시 · 랩 시계 · 자세 · 최고 속도 묶음(top)을 경주 계산과 묶는다. 주행 기록기는 판마다(바퀴 수가 모드마다 다르다)
  const raceRunOf = r => r ? Object.assign(raceContext({ built, sim, car, watch, clock, race: r, mode, weight: carOf(carId).weight ?? 1, prev, cur }), { top }) : null;
  const raceLogOf = R => R ? createRunLog({ laps: R.laps, version: RACE_VER, snapshot: snapshotRace }) : null;
  let R = game.raceRun = raceRunOf(race), raceLog = game.raceLog = raceLogOf(R);
  const useRace = () => { race = game.race = newRace(); R = game.raceRun = raceRunOf(race); raceLog = game.raceLog = raceLogOf(R); };
  let time = 0, lapStart = 0, acc = 0, countT = 0, countStep = 0.9, countShown = 0, throttle = 0, hitThisFrame = false, landedThisFrame = 0, crashThisFrame = 0, hitNx = 0, hitNz = 0, hitDx = 0, hitDz = 0, last = performance.now(), goAt = 0, startUntil = 0;
  const copy = (to, s) => { to.x = s.x; to.y = s.y; to.z = s.z; to.heading = s.heading; to.course = s.course; to.pitch = s.pitch || 0; to.roll = s.roll || 0; to.speed = s.speed; return to; };
  // 누르고 있는 입력은 지우지 않는다(조향 패드를 잡은 채 '다시'를 눌러도 핸들이 계속 듣게). 자동 운전은 위치 기억을 지운다.
  // 경주에서는 출발 자리(내 자리는 맨 뒤)에, 타임어택에서는 출발선 6 m 뒤 가운데에 선다.
  const me = { get state() { return sim.state; }, clock, get finished() { return finished; }, get weight() { return carOf(carId).weight ?? 1; }, get body() { return sim.body; } };   // weight · body: 몸싸움(내 차의 무게 · 부딪힘 모양)
  let rank = null;   // 랭킹(src/rank.js) — 서버 주소가 있을 때만 아래에서 붙인다. 없으면 null 그대로
  let nextRankWarm = Infinity;
  function warmRank(now) {
    nextRankWarm = now + 60000;
    rank.warm(boardIdOf(course.id, mode));   // 지금 모드의 표(타임어택 'B' · 그랑프리 'B/gp')
  }
  function place() {
    braking = false;
    let at = track.startPose;
    if (race) { R.sim = sim; R.weight = carOf(carId).weight ?? 1; at = placeRace(R); } else { trial.sim = sim; placeTrial(trial); }   // 경주: 출발 자리(내 자리는 맨 뒤 — race-run.js, 서버와 같은 자리)   // 타임어택: 출발선 6 m 뒤(time-trial.js — 서버와 같은 자리 · 같은 처음 값)
    showRivals(!!race); finished = null; game.finished = null; game.result = null; bestLapNow = null; rescued = false; game.laps.length = 0;
    flyProps?.reset();   // 날아간 소품은 새 판에 제자리로
    copy(prev, sim.state); copy(cur, sim.state); clock.reset(); if (race) clock.locate(at.index); time = 0; lapStart = 0; acc = 0; recorder.start(); ghostPlayer?.restart(); effects.clear?.(); damageFxDo('clear'); pitCrew?.clear?.(); driver?.reset?.(race ? at.index : -1); discrete?.reset(); cool = null; hud.wrong(false); chase.snap({ ...cur, boost: 0 });
    trialAt.length = 0;
    if (!race) { runLog.start(trial); recorder.mark(0, cur); } else raceLog.start(R);   // 경주도 틱 0 부터 내 입력 · 기록점(랭킹 — 2026-11-24)   // 틱 0 의 기록점 · 유령의 첫 자세(시작 화면에서는 아래 park 가 차를 옮기지만 출발하면 begin → place 가 다시 적는다)
    if (game.phase === 'ready' || game.phase === 'garage') park();   // 시작 화면에서는 내 차를 언더우드관 앞에 세워 보인다(출발하면 begin → place 가 출발 자리로)
  }
  function begin(step = 0.9) { rank?.clear(); if (rank) warmRank(performance.now()); game.begins = (game.begins || 0) + 1; game.phase = 'countdown'; calls.reset(); radio.stop(); boostsAtStart = game.startBoosts || 0; place(); countStep = step; countT = 0; countShown = 0; startUntil = 0; game.phase = 'countdown'; hud.phase('countdown'); hud.clearNote(); hud.clearResult?.(); }
  // 같은 기본 감각에 속해도 차마다 주행값이 다르므로 고를 때마다 계산과 저장소를 함께 바꾼다.
  function setCar(id) {
    if (!CARS.some(c => c.id === id) || id === carId) return false;
    carId = game.car = id; kartId = game.kart = carOf(id).kart; audio?.setCar(id); try { localStorage.setItem(CAR_KEY, id); } catch {}
    dress(); remake(); return true;
  }
  // 모드를 바꾸면 상대 카트 · 기록 저장소 · 출발 자리가 바뀐다
  function setMode(id) {
    if (!MODES.some(m => m.id === id) || id === mode) return false;
    mode = game.mode = id; try { localStorage.setItem(MODE_KEY, id); } catch {}
    remake(); return true;
  }
  function setLevel(id) {
    if (!LEVELS.some(l => l.id === id) || id === levelId) return false;
    levelId = game.level = id; try { localStorage.setItem(LEVEL_KEY, id); } catch {}
    remake(); return true;
  }
  let cool = null;   // 결승한 뒤 내 카트를 천천히 굴리는 자동 운전
  function setClass(id) {
    if (!SPEED_CLASSES.some(c => c.id === id) || id === klass) return false;
    klass = id; game.klass = id;   // 브라우저에 남기지 않는다(개발 · 검증에서만 부른다 — game.setClass)
    remake(); return true;
  }
  // 등급이 바뀌면 카트 계산 · 자동 운전 · 기록 저장소를 새로 맞춘다
  function remake() {
    sim = game.sim = createKartSim({ params: paramsNow(), world, body: bodyNow() }); if (driver) driver = createAutoDriver({ samples: course.centre, params: paramsNow() });
    useRace(); useStore(); place();
    if (game.phase === 'finished') begin(0.55);   // 결과 화면이 떠 있을 때 바꿨으면 지난 결과를 치우고 새 판으로(안 그러면 지난 결과 밑에서 새 경주가 돈다)
  }
  function useStore() { storeNow = storeName(); store = stores.for(storeNow); useBest(); }
  // 개발 · 검증용: 코스의 s m 자리(옆으로 lateral m)에 그 속도로 옮겨 놓는다(부스트 · 벽 접촉 횟수 같은 주행 상태는 처음으로 돌아간다).
  function placeAt(s, speed = 0, lateral = 0) {
    braking = false;
    s = ((s % course.length) + course.length) % course.length;   // 한 바퀴 안으로(높이도 같은 s 로 잰다)
    const at = parts.pointAt(s, lateral), keep = { gauge: sim.state.gauge, boostStock: sim.state.boostStock };
    at.y = ground(at.x, at.z) + parts.deckLift(s) + parts.rampLift(s);   // 길이 겹치는 자리에서도 s 가 가리키는 층에 놓는다
    sim.reset(at); Object.assign(sim.state, keep, { speed });   // reset 이 네 바퀴 밑 높이와 접촉 기억까지 그 자리에 맞춘다(가운데 높이만 넣으면 턱으로 읽힌다)
    copy(prev, sim.state); copy(cur, sim.state); chase.snap({ ...cur, boost: 0 }); driver?.reset?.(at.index); clock.locate?.(at.index); watch.reset(at.index); return at;
  }
  // 시작 화면(2026-11-23 'B 포스터형'): 내 차를 언더우드관 앞(코스 SHOW_AT m)에 세우고, 차 뒤에서 낮게 돌 건물과 차를 같이 본다.
  //   주행 계산은 돌지 않는다(ready) — 차의 자리만 옮긴다. 출발하면 begin → place 가 출발 자리로 되돌린다. 상대는 출발 줄에 그대로 서 있다(이 화면에는 안 보인다).
  //   카메라는 내 차 기준(앞 · 오른쪽 · 위, m), fov 는 세로 시야(°), shift = 그림을 [오른쪽, 위]로 미는 양(화면 폭 · 높이의 비율 — 아래 메뉴 위로 차를 올린다).
  //   화면 크기마다(PC · 휴대폰 가로 · 세로) 시안(시안/img/첫화면/b-night-t1-*.jpg)과 같은 구도. 값은 시안/첫화면_src/mock.js 의 CAMERAS.b 와 같다.
  //   차 크기를 따른다(2026-11-23 기본 차가 GT 가 됨): SHOW 는 카트(길이 1.82 m) 구도, SHOW_BIG 은 GT(4.6 m) 구도(시안/로비_src/shoot.mjs — 차의 뒤 3/4 에서 앞 왼쪽 위를 본다).
  //   그 사이 길이는 둘을 길이로 섞고, 더 긴 차는 조금 더 물린다(SHOW_STRETCH 배까지). 카트 길이 이하(레이싱 카트 · 장보기 카트)는 SHOW 그대로다.
  const SHOW_AT = picked.show?.at ?? 965, SHOW = {   // 코스마다(courses.js 의 show — 2026-11-25 다듬은 B 2단계로 B 는 1002)
    pc: { pos: [-5.0, 1.8, 1.0], look: [10, -2.5, 2.2], fov: 40, shift: [0, 0.12] },
    land: { pos: [-5.0, 1.8, 1.0], look: [10, -2.5, 2.2], fov: 40, shift: [0, 0.2] },
    port: { pos: [-5.6, 1.7, 1.4], look: [8, -3.2, 2.6], fov: 56, shift: [0, 0.16] },
  }, SHOW_BIG = {
    pc: { pos: [-7.4, 2.8, 1.5], look: [10, -3.6, 1.9], fov: 44, shift: [0, 0.12] },
    land: { pos: [-7.4, 2.8, 1.5], look: [10, -3.6, 1.9], fov: 44, shift: [0, 0.2] },
    port: { pos: [-10.4, 3.0, 1.9], look: [8, -3.4, 2.7], fov: 56, shift: [0, 0.16] },
  }, SHOW_LENGTH = [1.82, 4.6], SHOW_STRETCH = 1.5;
  // 조명(밤): 차 뒤 위 [앞, 오른쪽, 위] m · 세기 · 닿는 거리 — 카트 / GT. 배경 주행의 조명(attractLight)도 같은 비율을 쓴다.
  const SHOW_LIGHTS = [{ at: [-2.2, 1.4, 2.4], power: 14, reach: 9 }, { at: [-4.0, 2.8, 3.0], power: 45, reach: 20 }];
  const carLength = () => (REAL_SIZES[carOf(carId).vehicle] || [1.82])[0];
  const showMix = () => Math.max(0, Math.min(SHOW_STRETCH, (carLength() - SHOW_LENGTH[0]) / (SHOW_LENGTH[1] - SHOW_LENGTH[0])));   // 0 = 카트, 1 = GT
  const mixed = (a, b, t) => Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * t) : a + (b - a) * t;
  const lightNow = () => { const t = showMix(), [a, b] = SHOW_LIGHTS; return { at: mixed(a.at, b.at, t), power: mixed(a.power, b.power, t), reach: mixed(a.reach, b.reach, t) }; };
  let showing = '';
  function park() {
    const at = parts.pointAt(SHOW_AT, 0); at.y = ground(at.x, at.z) + parts.deckLift(SHOW_AT) + parts.rampLift(SHOW_AT);
    sim.reset(at); copy(prev, sim.state); copy(cur, sim.state); showing = '';
    attract?.sync();   // 배경 주행: 자리는 그대로, 바뀐 등급 · 차만 맞춘다
  }
  // 밤의 시작 화면에서만 내 차를 비추는 작은 조명(뒤 위쪽에서). 늘 장면에 두고 세기만 바꾼다 — 켜고 끄면 장면의 재질이 모두 다시 지어져 출발할 때 멈칫한다.
  const showLight = isNight ? new THREE.PointLight(0xfff1de, 0, 9, 2) : null;
  if (showLight) { showLight.name = 'showcase-light'; showLight.castShadow = false; stage.scene.add(showLight); }
  function showcase(p) {
    const cam = stage.camera, f0 = Math.sin(p.heading), f1 = Math.cos(p.heading), r0 = -Math.cos(p.heading), r1 = Math.sin(p.heading);
    const W = innerWidth, H = innerHeight, kind = W <= 700 ? 'port' : H <= 460 ? 'land' : 'pc', t = showMix(), a = SHOW[kind], b = SHOW_BIG[kind];   // 나누는 폭 · 높이는 hud.css 와 같다
    const v = { pos: mixed(a.pos, b.pos, t), look: mixed(a.look, b.look, t), fov: mixed(a.fov, b.fov, t), shift: a.shift };
    const at = ([fw, rt, up]) => [p.x + f0 * fw + r0 * rt, p.y + up, p.z + f1 * fw + r1 * rt];
    cam.position.set(...at(v.pos)); cam.lookAt(...at(v.look));
    if (showLight) { const L = lightNow(); showLight.position.set(...at(L.at)); showLight.distance = L.reach; showLight.intensity = game.phase === 'ready' ? L.power : 0; }
    const key = W + 'x' + H + ':' + carId; if (showing === key) return; showing = key;
    cam.fov = v.fov; cam.setViewOffset(W, H, -v.shift[0] * W, v.shift[1] * H, W, H); cam.updateProjectionMatrix();
  }
  // 배경 주행 중에는 조명이 달리는 차를 카메라 쪽 위에서 비춘다(추격이면 차 뒤, 옆 장면이면 카메라 쪽 옆 — 차의 보이는 면이 검게 묻히지 않게). 거리 · 높이 · 세기는 서 있는 화면처럼 차 크기를 따른다.
  function attractLight(p) {
    if (!showLight) return; const L = lightNow(), back = -L.at[0], c = stage.camera.position; let dx = c.x - p.x, dz = c.z - p.z; const d = Math.hypot(dx, dz);
    if (d > 0.5) { dx /= d; dz /= d; } else { dx = -Math.sin(p.heading); dz = -Math.cos(p.heading); }
    showLight.position.set(p.x + dx * back, p.y + L.at[2], p.z + dz * back); showLight.distance = L.reach; showLight.intensity = L.power;
  }
  function endShowcase() { if (showLight) showLight.intensity = 0; if (!showing) return; showing = ''; stage.camera.clearViewOffset(); stage.camera.updateProjectionMatrix(); chase.snap({ ...pose, boost: 0 }); }
  hud.onAgain(() => begin(0.55));
  // 멈춤(Esc · 멈춤 단추): 초읽기와 달리는 중에만. 주행 계산 · 초읽기 · 화면의 움직임 · 소리가 서고, 멈춤 판에서 계속 · 다시 · 처음을 고른다.
  let paused = false, pausedAt = 0;
  function resume() { if (!paused) return; paused = game.paused = false; const gone = performance.now() - pausedAt; goAt += gone; if (startUntil) startUntil += gone; last = performance.now(); audio?.pause?.(false); hud.clearPause(); }
  function pause() {
    if (paused || (game.phase !== 'countdown' && game.phase !== 'racing')) return false;
    paused = game.paused = true; pausedAt = performance.now(); audio?.horn?.(false); audio?.pause?.(true);
    hud.pause({ onResume: resume, onAgain: () => { resume(); begin(0.55); }, onBack: () => { resume(); hud.lights(null); showReady(); } }); return true;
  }
  hud.onPause(pause);
  // 탭이 뒤로 가면 소리 전체를 세우고 돌아오면 켠다(2026-11-26). 멈춤 판(Esc)이 열려 있으면 손대지 않는다 — 그때는 resume() 이 켠다. 규칙은 audio.js 의 pauseWhenHidden
  if (audio) pauseWhenHidden({ audio, blocked: () => paused });
  // 경적(X — 2026-11-25 사용자 "X키 누르면 빵빵소리도 나게"): 주행 입력이 아니라 소리만. 달리는 중(멈춤 아님)에만 울리고, 시작 · 차 고르기 · 코스 고르기 · 초읽기 · 결과 화면에서는 안 난다.
  //   뗌은 input 이 알린다(키 뗌 · 창 떠남 · 화면 숨김). 멈춤 · 결과 화면으로 넘어가면 frame() 이 뗀다.
  input.onHorn(on => { if (!audio) return; if (on && game.phase === 'racing' && !paused) audio.horn(true); else if (!on) audio.horn(false); });
  addEventListener('keydown', event => {
    if (event.repeat) return;   // 길게 눌러도 한 번만(R 이 초읽기를 되풀이해서 되돌리지 않게)
    if (event.metaKey || event.ctrlKey || event.altKey) return;   // 브라우저 단축키(새로 고침 · 탭 바꾸기)와 겹치지 않게
    const tag = event.target?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // 글자 키는 자판 위치(code)로 읽는다. 한글 입력 상태에서는 key 가 'ㄱ' · 'ㅡ' 가 되어 안 듣는다.
    const code = event.code || '', key = event.key || '', live = game.phase !== 'loading' && game.phase !== 'ready' && game.phase !== 'garage' && game.phase !== 'course';
    if (code === 'Escape' || (!code && key === 'Escape')) { pause(); return; }   // 멈춘 동안의 Esc(계속)는 멈춤 판이 먼저 받는다
    if (paused) return;
    if ((code === 'KeyR' || (!code && (key === 'r' || key === 'R'))) && live && game.phase !== 'finished') begin(0.55);   // 결과 화면에서는 그 화면이 R · Enter 를 받는다(둘 다 받으면 두 번 출발한다)
    if ((code === 'KeyM' || (!code && (key === 'm' || key === 'M'))) && audio) { audio.setMuted(!audio.muted); hud.note(audio.muted ? '소리 끔' : '소리 켬', '', '', 1.2); }
  });
  addEventListener('resize', () => { stage.resize(); garage?.resize(); });

  // 랩 시계는 출발선을 처음 넘는 순간부터 잰다(출발 자세는 선 6 m 뒤). 유령도 그 순간을 0 으로 맞춘다.
  function lapDone(lapTime, at) {
    if (race) {   // 경주: 바퀴 수를 세고, 마지막 바퀴를 끝내면 결승
      if (finished !== null) { lapStart = at; return; }   // 결승 뒤에 굴러가며 출발선을 또 넘는 것은 세지 않는다
      game.laps.push(+lapTime.toFixed(3)); bestLapNow = bestLapNow === null ? lapTime : Math.min(bestLapNow, lapTime); lapStart = at;
      if (clock.lap >= race.laps) { finish(at); return; }
      audio?.lap(false); hud.note(clock.lap + 1 >= race.laps ? '마지막 바퀴' : (clock.lap + 1) + '바퀴', lapText(lapTime), '', 1.8); return;
    }
    if (finished !== null) { lapStart = at; return; }   // 판을 끝낸 뒤 굴러가며 선을 넘는 것은 세지 않는다
    // 타임어택(서서 출발한 3바퀴): 바퀴 시간은 앞 바퀴 끝(첫 바퀴는 출발 신호)부터 — 셋을 더하면 합계다. 마지막 바퀴를 끝내면 판이 끝난다(바퀴 사이에 멈춤은 없다).
    trialAt.push(at); game.laps.push(+lapTime.toFixed(3)); lapStart = at;
    if (trialAt.length >= TRIAL_LAPS) { finishRun(at); return; }
    const split = (Math.round(at * 1000) - Math.round((trialAt.length > 1 ? trialAt[trialAt.length - 2] : 0) * 1000)) / 1000;
    audio?.lap(false); hud.note(trialAt.length + 1 >= TRIAL_LAPS ? '마지막 바퀴' : (trialAt.length + 1) + '바퀴', lapText(split), '', 1.8);
  }

  // 타임어택의 끝(TRIAL_LAPS 바퀴째 결승선): 판을 끝내고(천천히 굴러간다) 결과 화면 — 합계 · 바퀴별 · 그중 빠른 바퀴 · 내 최고 합계와의 차.
  //   유령은 이 판 전체가 내 최고보다 빠를 때만 바꾼다. 랭킹이 붙어 있으면 game.onTrialRun 이 랭킹의 결과 판을 띄울지 고른다(true 면 그쪽이 띄웠다).
  function finishRun(at) {
    finished = game.finished = +at.toFixed(3); game.phase = 'finished'; hud.phase('finished'); hud.clearNote();
    cool = createAutoDriver({ samples: course.centre, params: paramsNow(), boost: false }); cool.reset(clock.index ?? -1);
    recorder.mark(at, line);
    const before = game.best, improved = store.offer(recorder.finish(at));
    audio?.lap(true); useBest();
    const ms = trialAt.map(t => Math.round(t * 1000)), total = ms[ms.length - 1], laps = ms.map((t, i) => (t - (i ? ms[i - 1] : 0)) / 1000);
    const result = game.result = { kind: 'trial', time: total / 1000, laps, record: { time: before ?? total / 1000, improved: before == null || improved, prev: before }, rank: null, total: null, note: '' };
    const handlers = { onAgain: () => begin(0.55), onBack: () => showReady() };
    let ranked = false;
    try { ranked = game.onTrialRun?.({ lapMs: total, laps, result, first: before == null, improved }, handlers) === true; } catch (e) { console.error('판의 끝을 받은 쪽이 멈춤', e); }
    if (!ranked) hud.result(result, handlers);
  }

  // 그랑프리 내 최고는 순위와 상관없이 전체 시간으로 정한다. 등급·차·부품·조정판 구분은 타임어택과 같다.
  const raceKey = () => 'campus-kart:race:' + course.id + ':v' + RULES + ':' + mode + ':' + storeName();
  const raceBest = () => { try { const v = JSON.parse(localStorage.getItem(raceKey()) || 'null'); return v && Number.isFinite(v.time) ? v.time : null; } catch { return null; } };
  // 결승: 그 순간의 순위표를 결과 화면에 넘긴다. 아직 달리는 상대는 '나보다 몇 초 뒤'를 어림한다(남은 거리 ÷ 그 카트의 지금까지 평균 빠르기).
  function finish(at, cut = false) {   // cut: 개발 · 검증용으로 도중에 끝낸 판 — 기록으로 치지 않는다
    finished = game.finished = +at.toFixed(3); game.phase = 'finished'; hud.phase('finished'); hud.clearNote(); audio?.lap(true);
    cool = createAutoDriver({ samples: course.centre, params: paramsNow(), boost: false }); cool.reset(clock.index ?? -1);
    // 자동 운전으로 달린 판은 기록으로 치지 않는다(저장도, '최고 기록' 표시도)
    const table = race.standings(me), mine = table.find(r => r.me), total = race.laps * course.length, before = raceBest(), improved = !driver && !cut && (before === null || finished < before);
    if (improved) { try { localStorage.setItem(raceKey(), JSON.stringify({ time: finished, rank: mine.rank })); } catch {} }
    const rows = table.map(r => ({ rank: r.rank, name: r.name, colour: r.colour, me: r.me, time: r.finished, gap: r.finished === null ? Math.max(0.1, (total - r.progress) / Math.max(5, (r.progress + 30) / at)) : null }));
    game.result = { rank: mine.rank, karts: race.count, time: finished, bestLap: bestLapNow, record: improved ? { time: finished, improved: true } : before !== null ? { time: before, improved: false } : null, rows };
    const handlers = { onAgain: () => begin(0.55), onBack: () => showReady() };
    // 경주 랭킹(2026-11-24): 기록 = 출발 신호부터 결승(ms) + 그 경주의 등수. 랭킹이 붙어 있으면 game.onRaceRun 이 랭킹의 결과 판을 띄울지 고른다(true 면 그쪽이 띄웠다). 도중에 끝낸 판(cut)은 안 올린다.
    let ranked = false;
    if (!cut) {
      const ms = R.lapAt.map(t => Math.round(t * 1000)), laps = ms.map((t, i) => (t - (i ? ms[i - 1] : 0)) / 1000);
      try { ranked = game.onRaceRun?.({ lapMs: ms[ms.length - 1], laps, place: R.place ?? mine.rank, karts: race.count, pits: modeNow().damage ? car.stops : null, bestLap: bestLapNow, result: game.result }, handlers) === true; } catch (e) { console.error('경주의 끝을 받은 쪽이 멈춤', e); }
    }
    if (!ranked) hud.result?.(game.result, handlers);
  }

  // 개발 · 검증용: 타임어택을 지금 끝낸 상태로(3바퀴 전) — finished · phase 'finished' · 천천히 굴러가는 자동 운전. 결과 화면은 안 띄우고 기록 · 유령 · 랭킹에도 안 남는다.
  //   begin()(다시 출발) · showReady()(메인 화면)가 place 로 풀어 준다. (1바퀴 때는 랭킹 판을 띄울 때 메인이 불렀다 — 3바퀴는 판이 저절로 끝난다.)
  function finishTrial() {
    if (race || finished !== null || game.phase !== 'racing') return false;
    finished = game.finished = +time.toFixed(3); game.phase = 'finished'; hud.phase('finished'); hud.clearNote();
    cool = createAutoDriver({ samples: course.centre, params: paramsNow(), boost: false }); cool.reset(clock.index ?? -1);
    return true;
  }

  // 타임어택의 한 틱: 명령을 고르고(기록기에 고치기 전의 것을 적는다) 계산은 time-trial.js 의 stepTrial — 서버의 다시 계산과 같은 코드. 나머지(효과 · 바퀴 · 유령)는 경주와 같다.
  function trialTick() {
    let command;
    if (finished !== null && cool) { command = cool.input(sim.state); command.boost = false; if (sim.state.speed > 11) { command.throttle = 0; command.brake = Math.max(command.brake || 0, sim.state.speed > 14 ? 0.5 : 0); } }   // 끝낸 뒤: 천천히 굴러간다
    else { command = driver ? driver.input(sim.state) : input.read(); if (discrete) command = discrete.apply(command); }
    const logging = finished === null;
    if (logging) runLog.input(command, sim.state);
    trial.sim = sim; trial.time = time; trial.finished = !logging;
    const { events, back } = stepTrial(trial, command);   // 피트레인 제한(command 를 고친다) → 주행 계산 → 되돌려 놓기 → 시각 → 랩 시계
    time = trial.time;
    throttle = command.throttle || 0;
    if (night) braking = command.brake > 0;
    if (back) { driver?.reset?.(back.index); cool?.reset?.(back.index); effects.clear?.(); damageFxDo('clear'); pitCrew?.clear?.(); rescued = true; game.rescues = (game.rescues || 0) + 1; }
    if (sim.state.wallHit) { game.wallHits++; hitThisFrame = true; hitNx = sim.state.wallNx; hitNz = sim.state.wallNz; hitDx = sim.state.wallPx - sim.state.x; hitDz = sim.state.wallPz - sim.state.z; }
    if (sim.state.landed > landedThisFrame) landedThisFrame = sim.state.landed;
    if (!sim.state.grounded) game.airTicks = (game.airTicks || 0) + 1;
    if (logging) runLog.after(trial, events);   // 바퀴가 끝났으면 lapDone 보다 먼저 그 바퀴분을 꺼내 둔다
    lineEvents(events);
    if (finished === null) recorder.sample(time, sim.state);   // 유령: 출발 신호부터의 시각으로 판 전체
  }
  // 랩 시계의 사건 → 유령 기록 · 바퀴 끝(경주와 타임어택이 같이 쓴다)
  function lineEvents(events) {
    for (const event of events) {
      const lap = event.type === 'lap', fresh = event.type === 'gate' && (event.start || event.invalid); if (!lap && !fresh) continue;
      // 선을 넘은 순간의 자세(이번 틱 안에서 보간)를 지난 바퀴의 끝과 새 바퀴의 처음에 적는다. 안 적으면 유령이 선 앞에서 멈춘다.
      const u = Math.max(0, Math.min(1, (event.at - (time - TICK)) / TICK));
      line.x = lerp(prev.x, cur.x, u); line.y = lerp(prev.y, cur.y, u); line.z = lerp(prev.z, cur.z, u); line.heading = prev.heading + wrap(cur.heading - prev.heading) * u; line.pitch = lerp(prev.pitch, cur.pitch, u); line.roll = lerp(prev.roll, cur.roll, u);
      if (!race) { if (lap) lapDone(event.time, event.at); continue; }   // 타임어택: 유령은 판 전체를 한 줄로 적는다(바퀴마다 끊지 않는다 — 끝은 finishRun 이 적는다)
      if (lap) { recorder.mark(event.time, line); lapDone(event.time, event.at); } else { lapStart = event.at; ghostPlayer?.restart(); }
      recorder.start(); recorder.mark(0, line);
    }
  }

  function tick() {
    if (!race) { trialTick(); return; }
    let command;
    if (finished !== null && cool) { command = cool.input(sim.state); command.boost = false; if (sim.state.speed > 11) { command.throttle = 0; command.brake = Math.max(command.brake || 0, sim.state.speed > 14 ? 0.5 : 0); } }   // 결승 뒤: 천천히 굴러간다
    else { command = driver ? driver.input(sim.state) : input.read(); if (discrete) command = discrete.apply(command); }
    const logging = finished === null;
    if (logging) raceLog.input(command, sim.state);   // car.before 가 고치기 전의 입력(서버가 같은 계산으로 다시 고친다)
    R.sim = sim;
    // 피트레인 제한(어느 모드에서나 — 레인은 늘 열려 있다) → 상한(그랑프리의 데미지) → 주행 → 데미지 → 되돌려 놓기 → 시각 → 상대 일곱 + 몸싸움 → 랩 시계(race-run.js — 서버와 같은 코드)
    const { events, back, carEvent, bumps } = stepRace(R, command);
    time = R.time;
    throttle = command.throttle || 0;
    if (night) braking = command.brake > 0;
    if (carEvent) { game.carEvents = (game.carEvents || 0) + 1; game.carEvent = carEvent.type; if (carEvent.lost) { crashThisFrame += carEvent.lost; game.carHit = { lost: carEvent.lost, impact: carEvent.impact }; } }   // carHit: 검증용(마지막으로 깎인 양 · 부딪힌 속도)   // 깎인 만큼은 그 화면의 효과 · 카메라 · 소리가 쓴다
    if (back) { driver?.reset?.(back.index); cool?.reset?.(back.index); effects.clear?.(); damageFxDo('clear'); pitCrew?.clear?.(); rescued = true; game.rescues = (game.rescues || 0) + 1; }
    game.bumps = (game.bumps || 0) + bumps;
    if (sim.state.wallHit) { game.wallHits++; hitThisFrame = true; hitNx = sim.state.wallNx; hitNz = sim.state.wallNz; hitDx = sim.state.wallPx - sim.state.x; hitDz = sim.state.wallPz - sim.state.z; }   // 닿은 곳은 차 가운데에서 얼마나(차가 길면 앞 · 뒤 끝)
    if (sim.state.landed > landedThisFrame) landedThisFrame = sim.state.landed;
    if (!sim.state.grounded) game.airTicks = (game.airTicks || 0) + 1;
    if (logging) raceLog.after(R, events);   // 결승했으면 lapDone(→ finish) 보다 먼저 판을 묶어 둔다
    lineEvents(events);
    if (clock.started) recorder.sample(time - lapStart, sim.state);
  }

  function frame(now) {
    capProbe.sample(now);   // 그리는 중의 간격은 '안 묶였다' 쪽으로만 쓰인다(충전기를 꽂으면 짧은 간격이 나와 안내가 사라진다)
    slowWatch.sample(now, game.phase === 'ready' && !document.hidden);   // 시작 화면을 그리는 간격 — 느린 노트북(frame-cap.js)
    if (game.phase === 'ready' && now >= powerAt) { powerAt = now + 1000; const text = powerNow(); if (text !== powerShown) { powerShown = text; hud.power(text); } }
    if (now >= nextRankWarm && game.phase === 'racing') warmRank(now);   // 오래 달리는 동안에도 1분마다 대기 기록과 위쪽 순위를 확인한다
    const shown = Math.min(0.1, (now - last) / 1000); last = now; game.frameMs = game.frameMs ? game.frameMs * 0.95 + shown * 50 : shown * 1000;
    const dt = paused ? 0 : shown;   // 멈춘 동안: 지난 시간 0 으로 그린다(초읽기 · 주행 · 바퀴 · 입자 · 카메라가 그 자리에 선다)
    if (game.phase === 'countdown') {
      countT += dt;   // 화면이 그려진 시간만 센다(탭을 숨긴 동안에는 초읽기도 멈춘다)
      // 출발 신호등 다섯: 초읽기 전체(3 × countStep 초)를 다섯으로 나눠 하나씩 켜고, 다 지나면 한꺼번에 꺼지며 출발
      const total = 3 * countStep, lit = Math.min(5, Math.floor(countT / (total / 5)) + 1);
      if (countT < total) { hud.lights(lit); if (lit !== countShown) { countShown = lit; audio?.count(false); } }
      else {
        hud.lights(0); audio?.count(true); game.phase = 'racing'; hud.phase('racing'); setTimeout(() => { if (game.phase === 'racing') hud.lights(null); }, 700);
        // 출발 가속: 신호가 난 시각(이 화면에서 지난 만큼 되돌린다)의 앞뒤 startBoostWindow 초 안에 밟았으면 준다
        const windowMs = (sim.params.startBoostWindow ?? 0) * 1000; goAt = now - Math.max(0, countT - 3 * countStep) * 1000; startUntil = driver || !windowMs ? 0 : goAt + windowMs;
      }
    }
    // 누른 시각이 구간 안인지를 먼저 본다(화면이 늦게 그려져 지금이 구간을 지났어도 구간 안에 밟았으면 준다)
    if (startUntil && !paused) {
      const due = game.phase !== 'racing' ? 'closed' : startBoostDue({ goAt, windowMs: startUntil - goAt, kickAt: input.kickAt, now });
      if (due === 'grant') { if (sim.grant?.('start') && finished === null) { if (race) raceLog.grant(R.tick); else runLog.grant(trial.tick); } game.startBoosts = (game.startBoosts || 0) + 1; }   // 다음에 돌 틱 앞에서 받았다고 적는다(경주도 — 서버는 정해진 틱 안인지만 본다)
      if (due !== 'wait') startUntil = 0;
    }
    hitThisFrame = false; landedThisFrame = 0; crashThisFrame = 0;
    if (audio?.honking && (paused || game.phase !== 'racing')) audio.horn(false);   // 경적: 멈춤 · 결과 화면 · 메인 화면으로 넘어가면 뗀다
    // game.hold: 개발 · 검증용 멈춤(주행 계산만 멈추고 화면은 계속 그린다 — 그 순간을 찍으려고)
    const live = game.phase === 'racing' || game.phase === 'finished';   // 결승 뒤에도 장면은 계속 돈다(상대가 마저 들어오고 내 카트는 천천히 굴러간다)
    if (live && !game.hold) { acc += dt * SPEEDUP; let guard = 0; while (acc >= TICK && guard++ < 240) { tick(); acc -= TICK; } if (acc > TICK) acc = 0; }
    // 화면용 자세: 직전 틱과 이번 틱 사이를 보간
    const a = live ? Math.min(1, acc / TICK) : 1, s = sim.state;
    pose.x = lerp(prev.x, cur.x, a); pose.y = lerp(prev.y, cur.y, a); pose.z = lerp(prev.z, cur.z, a);
    pose.heading = prev.heading + wrap(cur.heading - prev.heading) * a; pose.course = prev.course + wrap(cur.course - prev.course) * a;
    pose.pitch = lerp(prev.pitch, cur.pitch, a); pose.roll = lerp(prev.roll, cur.roll, a); pose.speed = lerp(prev.speed, cur.speed, a);
    pose.boost = s.boost; pose.boostKind = s.boostKind || 'item'; pose.drifting = !!s.drifting; pose.wallHit = hitThisFrame; pose.landed = landedThisFrame; pose.crash = crashThisFrame; pose.air = s.air || 0;
    if (hitThisFrame && (hitNx || hitNz)) { pose.wallX = pose.x + hitDx; pose.wallZ = pose.z + hitDz; } else { pose.wallX = undefined; pose.wallZ = undefined; }   // 벽에 닿은 곳(불티 · 파편이 여기서 튄다)   // 한 화면에 틱이 여럿이라 그 사이에 닿았는지를 모아서 넘긴다
    const attractOn = !!attract && game.phase === 'ready';   // 시작 화면 배경 주행: 그리는 자세를 그쪽 차의 것으로 바꾼다
    if (attractOn) attract.step(dt, pose);
    // 모델에는 위치와 방향각만 준다. 지면 기울기(pitch · roll)는 모델이 view 를 보고 직접 기울인다.
    kart.group.position.set(pose.x, pose.y, pose.z); kart.group.rotation.set(0, pose.heading, 0);
    night?.aim(pose);   // 노면 위 전조등 자국(밤 밝기 조정값에 있을 때만)
    kartShadow.update(pose.x, pose.z, pose.heading, pose.y, roadAt);
    if (rescued) { rescued = false; chase.snap({ ...pose, boost: 0 }); }   // 길 위로 되돌려 놓인 화면: 카메라도 그 자리로
    // 상대 카트: 직전 틱과 이번 틱 사이를 같은 비율로 보간
    if (race && !attractOn) race.karts.forEach((k, i) => {
      const r = rivalKarts[i], p0 = k.prev, p1 = k.cur, st = k.sim.state, x = lerp(p0.x, p1.x, a), y = lerp(p0.y, p1.y, a), z = lerp(p0.z, p1.z, a), heading = p0.heading + wrap(p1.heading - p0.heading) * a, v = r.view;
      r.model.group.position.set(x, y, z); r.model.group.rotation.set(0, heading, 0); r.dot.x = x; r.dot.z = z;
      v.speed = lerp(p0.speed, p1.speed, a); v.steer = st.steer; v.slip = wrap(st.heading - st.course); v.pitch = lerp(p0.pitch, p1.pitch, a); v.roll = lerp(p0.roll, p1.roll, a); v.drifting = !!st.drifting; v.boost = st.boost; v.boostKind = st.boostKind || 'item'; v.grounded = st.grounded !== false;
      r.model.update(v, dt); r.shadow.update(x, z, heading, y, roadAt);
    });
    if (attractOn) attract.rivals(rivalKarts, dt, roadAt);
    if (flyProps && (live || attractOn)) {
      // 소품에 닿는 차: 화면에 그린 내 차와 보이는 상대(그린 자세 — 계산은 안 건드린다). 유령은 안 친다.
      let n = 0; const put = (id, g, body) => { const h = propHitters[n] || (propHitters[n] = {}); h.id = id; h.x = g.position.x; h.y = g.position.y; h.z = g.position.z; h.heading = g.rotation.y; h.body = body; n++; };
      put('me', kart.group, attractOn ? null : sim.body);
      rivalKarts.forEach((r, i) => { if (r.model.group.visible) put('r' + i, r.model.group, race && !attractOn ? race.karts[i]?.sim.body : null); });
      propHitters.length = n;
      try { flyProps.update(dt, propHitters); } catch (e) { console.error('소품이 멈춤', e); try { stage.scene.remove(flyProps.group); flyProps.dispose(); } catch {} flyProps = game.flyProps = null; }
    }
    input.setBoostReady?.(!!s.boostReady);
    const stock = s.boostStock || 0, boostKind = s.boostKind || 'item', kickReady = !!s.kickReady;
    // 출발 신호를 기다리는 동안에는 방향키가 앞바퀴 · 핸들 · 운전자를 움직인다(카트는 서 있다 — 주행 계산이 안 돌아 s.steer 는 멈춰 있다)
    if (smokeFor !== kart) { smokeFor = kart; smokeAt = game.smokeAt = smokeSpot(kart); wheelsNow = wheelSpots(kart); }   // 차를 갈아입으면 다시 잰다
    const view = { speed: pose.speed, steer: game.phase === 'countdown' ? input.peek().steer : s.steer, slip: wrap(pose.heading - pose.course), pitch: pose.pitch, roll: pose.roll, drifting: s.drifting, boost: s.boost, boostKind, kickReady, stock, slots: sim.params.boostSlots ?? 1, grounded: s.grounded !== false, gauge: s.gauge, condition: modeNow().damage ? car.value : 100, crash: crashThisFrame, smokeAt };   // crash: 이 화면에서 벽에 박아 깎인 차 상태(%) — 부서지는 효과가 쓴다
    if (night) view.braking = live && braking;
    if (live && !attractOn) view.throttle = throttle;   // 자전거의 페달 굴리기가 '밟는 중'을 본다(다른 차의 모델은 안 읽는다)
    if (attractOn) view.steer = attract.steer;
    kart.update(view, dt); effects.update(view, pose, dt); damageFxDo('update', view, pose, dt);
    // 피트 크루: 내 차가 서면 달려들어 고친다 — 잭으로 든 높이만큼 내 카트의 그림을 올리고(주행 계산은 그대로), 렌치 · 잭 소리를 낸다
    let crewGuns = 0, crewJack = '';
    if (pitCrew) {
      try {
        const c = crewView, hurt = !!modeNow().damage; c.x = pose.x; c.y = pose.y; c.z = pose.z; c.heading = pose.heading; c.speed = pose.speed; c.damage = hurt; c.inPit = car.zone.inPit; c.box = car.zone.box;
        c.holding = hurt && car.holding; c.repairing = hurt && car.repairing; c.value = hurt ? car.value : 100; c.wheels = wheelsNow; c.refills = hurt ? car.refills : 0;   // refills: 부스터를 받고 지나가면 신호수가 손짓
        const o = pitCrew.update(c, dt); crewGuns = o.guns || 0; crewJack = o.event || ''; if (o.lift > 0) kart.group.position.y += o.lift;
      } catch (e) { console.error('피트 크루가 멈춤', e); try { stage.scene.remove(pitCrew.group); pitCrew.dispose(); } catch {} pitCrew = game.pitCrew = null; }
    }
    // menu: 시작 · 차 고르기 · 코스 고르기 · 결과 화면에서는 엔진 소리를 끈다(2026-11-26 사용자 — 시작 화면의 '우웅'은 서 있는 내 차의 공회전, 결과 화면의 것은 결승 뒤 천천히 굴러가는 내 차의 엔진이었다 → "그냥 안나게"). 초읽기부터 다시 차오른다
    audio?.update({ menu: game.phase === 'ready' || game.phase === 'garage' || game.phase === 'course' || game.phase === 'finished', speed: attractOn ? 0 : pose.speed, throttle: live ? throttle : 0, slip: attractOn ? 0 : view.slip, drifting: s.drifting, boost: s.boost, boostKind, kickReady, stock, gauge: s.gauge, wallHit: hitThisFrame, crash: crashThisFrame, landed: landedThisFrame, grounded: view.grounded, wrench: crewGuns, jack: crewJack });
    // 화면에 그리는 자세의 시각은 '직전 틱 + acc' 다. 기록 표시와 유령도 같은 시각으로 맞춘다.
    let ghostAt = null;
    // 경주 · 타임어택 모두 출발 신호부터의 시간을 보여 준다(판이 끝나면 그 기록에서 멈춘다 — 타임어택은 3바퀴 합계). 유령도 출발 신호부터의 시각으로 맞춘다.
    const elapsed = game.phase === 'racing' ? Math.max(0, time - TICK + acc) : 0, shownTime = finished ?? elapsed;
    if (ghostPlayer && game.phase === 'racing' && (ghostAt = ghostPlayer.poseAt(elapsed, ghostPose))) {
      ghostKart.group.visible = true; ghostKart.group.position.set(ghostAt.x, ghostAt.y, ghostAt.z); ghostKart.group.rotation.set(0, ghostAt.heading, 0);
      ghostView.pitch = ghostAt.pitch; ghostView.roll = ghostAt.roll; ghostKart.update(ghostView, dt);
    } else ghostKart.group.visible = false;
    game.ghostVisible = ghostKart.group.visible;
    if (!game.freeCamera) { if (attractOn) { if (showing !== 'attract') attract.invalidate(); showing = 'attract'; attract.camera(stage.camera, pose, dt); attractLight(pose); } else if (game.phase === 'ready' || game.phase === 'garage') showcase(pose); else { endShowcase(); chase.update(pose, dt); } }   // game.freeCamera: 검증에서 카메라를 직접 놓을 때
    campus.update?.(dt, now / 1000); partModels?.update?.(dt, now / 1000); stage.followShadow(pose.x, pose.y, pose.z);
    stage.pace(now, game.phase === 'racing' && !paused && !game.hold);   // 달리는 동안 화면이 느리면 해상도를 한 단계씩 내린다(pacer.js)
    if (game.phase === 'garage' && garage) {
      garage.update(shown);
      const renderer = stage.renderer, courseExposure = renderer.toneMappingExposure;
      if (isNight) renderer.toneMappingExposure = LOOKS.day.exposure; // 차고 자체 조명에 맞춘 노출
      renderer.info.reset();
      renderer.render(garage.scene, garage.camera);
      if (isNight) renderer.toneMappingExposure = courseExposure;
    } else stage.render();
    const hudView = { time: shownTime, best: race ? bestLapNow : game.best, speed: pose.speed, gauge: s.gauge, stock, slots: sim.params.boostSlots ?? 1, ready: !!s.boostReady, boost: s.boost, kick: kickReady, x: pose.x, z: pose.z, heading: pose.heading, ghost: ghostAt };
    if (!race) { hudView.trialLap = Math.min(TRIAL_LAPS, trialAt.length + 1); hudView.trialLaps = TRIAL_LAPS; }   // 타임어택: BEST 밑의 'LAP 2 / 3'(2026-11-25 사용자가 고름)
    if (modeNow().damage) { hudView.car = car.value; hudView.pit = car.repairing ? 'repair' : car.holding ? 'stop' : car.zone.limited ? 'limit' : ''; hudView.refills = car.refills; hudView.refillGain = car.refillGain; }   // refills: 피트에서 부스터가 찬 횟수(바뀌면 칸이 빛나고 '+N' — 2026-11-25 사용자가 시안 A 를 고름)   // 차 상태 막대(데미지 모드에서만)
    if (race) {
      const table = race.standings(me), mine = table.find(r => r.me), pace = 0.9 * (top.maxSpeed || sim.params.maxSpeed);   // 나와의 차(초)는 달린 거리의 차 ÷ 이 등급의 달리는 빠르기(멈춰 있어도 숫자가 튀지 않게 정해 둔 값 — 피트의 제한 속도 · 상한 차로 묶인 값이 아니라 제 속도)
      hudView.rank = game.rank = mine.rank; hudView.karts = race.count; hudView.lap = Math.min(race.laps, clock.lap + 1); hudView.laps = race.laps; hudView.rivals = rivalDots; hudView.rankStyle = settings.rank;
      table.forEach((r, i) => { const row = rankRows[i] || (rankRows[i] = {}); row.rank = r.rank; row.name = r.name; row.colour = r.colour; row.me = r.me; row.done = r.finished !== null; row.gap = r.me ? 0 : (mine.progress - r.progress) / pace; });
      rankRows.length = table.length; hudView.table = game.table = rankRows;
      // 무전: 지금 상황을 넘겨 주면 말할 때를 정해 준다(radio-calls). 말은 radio 가 조각을 이어 튼다.
      if (audio && settings.radio !== 'off' && (game.phase === 'racing' || game.phase === 'finished')) {
        const front = mine.rank > 1 ? table[mine.rank - 2] : null, back = mine.rank < table.length ? table[mine.rank] : null, damage = !!modeNow().damage;
        radioSnap.time = time; radioSnap.phase = game.phase; radioSnap.rank = mine.rank; radioSnap.count = race.count; radioSnap.lap = hudView.lap; radioSnap.laps = race.laps; radioSnap.finished = finished !== null;
        radioSnap.ahead = front ? { id: front.id, gap: Math.max(0, (front.progress - mine.progress) / pace) } : null; radioSnap.behind = back ? { id: back.id, gap: Math.max(0, (mine.progress - back.progress) / pace) } : null;
        radioSnap.car = damage ? car.value : null; radioSnap.pit.inLane = damage && car.zone.inPit; radioSnap.pit.repairing = damage && car.repairing; radioSnap.startBoost = (game.startBoosts || 0) > boostsAtStart;
        const message = calls.update(radioSnap); if (message) { radio.say(message.clips, message); game.radioLast = message.why; game.radioCalls = (game.radioCalls || 0) + 1; }
      }
    }
    hud.update(hudView);
    hud.wrong(game.phase === 'racing' && clock.wrongWay);
    requestAnimationFrame(frame);
  }

  // 개발 · 검증용: 3바퀴를 다 달리지 않고 지금 결승시킨다(경주 중일 때만)
  const endRace = () => { if (race && game.phase === 'racing') finish(time, true); };
  Object.assign(game, { radio, carState: car, level: levelId, setLevel, pause, resume, endRace, stage, campus, track, parts, world, roadAt, placeAt, sim, clock, course, begin, klass, setClass, tuned, input, audio, race, mode, setMode, rescue, watch, kart: kartId, car: carId, setCar, openGarage, finishTrial });
  // 개발용 조정판: 타면서 조정값을 바꾸고, 지금 들어오는 입력을 본다(?tune=1 일 때만 불러온다)
  // ?stat=1 — 그리기 상태 다섯 줄(개발 · 문의용, 2026-11-26 "맥북에서 살짝 렉 … 화질도 살짝 다운"): 초당 장수 · 화면 간격 · 지금 배율(조절기가 내렸는지) · 그리는 점 수 · 그래픽 장치 · 30장 묶임과 시작 화면 느림 · 충전(frame-cap.js) · 브라우저 · 안내가 보이는지.
  //   그 기계에서만 보이는 값이라(헤드리스로는 못 잰다) 사용자가 화면을 보고 알려 준다. 게임에는 아무것도 안 바꾼다.
  if (query.has('stat')) {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:99;padding:5px 9px;background:rgba(0,0,0,.66);color:#fff;font:600 12px/1.45 ui-monospace,Menlo,monospace;white-space:pre;pointer-events:none;border-radius:4px;text-align:center';
    document.body.appendChild(box);
    let gpu = '?'; try { const gl = stage.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).replace(/^ANGLE \(|\)$/g, '').slice(0, 64); } catch {}
    const ua = navigator.userAgent, named = ['Edg', 'OPR', 'SamsungBrowser', 'CriOS', 'FxiOS', 'Firefox', 'Chrome'].map(k => ua.match(new RegExp(k + '/(\\d+)')) && k + ' ' + ua.match(new RegExp(k + '/(\\d+)'))[1]).find(Boolean);
    const browser = named || (/Safari/.test(ua) && ua.match(/Version\/(\d+)/) ? 'Safari ' + ua.match(/Version\/(\d+)/)[1] : '?'), os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : '?';
    let last = 0, sum = 0, n = 0, worst = 0, shown = 0;
    const tick = t => {
      if (last) { const d = t - last; if (d < 1000) { sum += d; n++; worst = Math.max(worst, d); } } last = t;
      if (t - shown > 600 && n) {
        const i = stage.info(), c = stage.renderer.domElement, state = (i.kept ? ' · 내린 채로' : '') + (i.raised ? ' · 되올림' : '') + (i.restored ? ' · 되돌림' : '') + (i.lifted ? ' · 올림' : '');
        box.textContent = `${Math.round(1000 * n / sum)} fps · 평균 ${(sum / n).toFixed(1)} ms · 가장 긴 ${worst.toFixed(0)} ms\n배율 ${i.pixelRatio}(처음 ${i.ceiling} · 내림 ${i.drops}번${state}) · ${c.width}×${c.height} · 화질 ${i.quality}\n호출 ${i.calls} · 삼각형 ${(i.triangles / 1e6).toFixed(2)}M · ${gpu}\n가장 짧은 간격 ${Number.isFinite(capProbe.min) ? capProbe.min.toFixed(1) + ' ms' : '?'} → ${capProbe.capped ? '30장으로 묶임' : capProbe.open ? '안 묶임' : '모름'} · 시작 화면 ${slowWatch.slow ? '느림' : '보통'}(${slowWatch.average ? slowWatch.average.toFixed(1) + ' ms' : '?'}) · 충전 ${charging === true ? '중' : charging === false ? '아님' : '모름'}\n${browser} · ${os} · 안내 ${powerNow() ? '보임' : '없음'}`;
        sum = 0; n = 0; worst = 0; shown = t;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  if (query.has('tune')) Promise.all([import('./dev/tune.js'), import('./dev/tune-items.js')]).then(([{ createTunePanel }, { tuneGroups, cameraAccess }]) => {
    const CAMERA_ORIG = JSON.parse(JSON.stringify(cameraTuning)), cam = cameraAccess(cameraTuning), camDefault = key => cameraAccess(CAMERA_ORIG).get(key);
    // 값은 등급을 곱하기 전 기준값으로 다룬다. ratioOf 가 있으면 그 값에 대한 배율로 보여 주고 받는다.
    const kartGet = (item, from) => item.ratioOf ? from[item.key] / from[item.ratioOf] : from[item.key];
    game.tune = createTunePanel({
      storageKey: 'campus-kart:tune', groups: tuneGroups,
      get: item => item.target === 'camera' ? cam.get(item.key) : kartGet(item, baseParams(tuned)),
      set: (item, value) => {
        if (item.target === 'camera') { cam.set(item.key, value); return; }
        // 처음 값으로 돌아오면 고친 값 목록에서 뺀다
        if (Math.abs(value - kartGet(item, baseParams())) < 1e-9) delete tuned[item.key]; else tuned[item.key] = item.ratioOf ? value * baseParams(tuned)[item.ratioOf] : value;
        Object.assign(sim.params, paramsNow());   // paramsNow() 는 모든 값을 담고 있어서, 목록에서 뺀 값도 기준값으로 돌아간다
        topKey = '';   // 카메라가 따르는 최고속(topSpeedNow)도 다시 읽는다 — 조정판에서 최고속을 고쳤을 수 있다
        if (driver) driver = createAutoDriver({ samples: course.centre, params: paramsNow() });   // 자동 운전의 속도 계획도 같은 값으로
        if (storeName() !== storeNow) useStore();
      },
      defaults: item => item.target === 'camera' ? camDefault(item.key) : kartGet(item, baseParams()),
      probe: () => { const i = input.peek(), st = sim.state; return { throttle: i.throttle, brake: i.brake, steer: i.steer, drift: i.drift, boost: i.boost || i.boostTap, kick: i.kick || i.kickTap, slipDeg: (st.slip || 0) * 180 / Math.PI, gauge: st.gauge, stock: st.boostStock || 0 }; },
    });
  }).catch(error => console.warn('조정판을 불러오지 못함', error));
  // 랭킹(src/rank.js · 약속 3.30 ~ 3.32): 서버 주소가 있을 때만 불러와 붙인다. 타임어택 한 판(서서 출발한 3바퀴)이 내 판 최고로 끝나면 그 판의 주행 기록을 올린다.
  //   올릴 수 있는 판: 타임어택 · '아주 빠름' · 부품 켬 · 조정판 안 씀 · body=0 아님 · 자동 운전 아님(검증용 ?auto=1&runlog=1 은 로컬 서버일 때만 올린다).
  //   어떻게 올릴지는 rank.plan 이 정한다(2026-11-24 사용자: 매번 랭킹 판이 뜨지 않게): 처음(닉네임을 묻는다) · 열 명 안에서 순위가 오를 때만 랭킹의 결과 판,
  //   그 밖의 최고 기록은 조용히 올리고 보통 결과 화면 — 순위가 오면 그 결과 화면에 붙인다('순위 14').
  if (RANK_API) {
    try {
      const { createRank } = await import('./rank.js');
      // 판(2026-11-25 시안 B): 모드 탭은 RANK_MODES 차례(타임어택 · 그랑프리)에 게임의 모드 이름, 작은 글의 바퀴 수는 코스 자료에서. 코스 칸은 courses.js 목록을 그대로 돈다(코스가 늘면 저절로)
      rank = game.rank = createRank({ root: document.getElementById('hud'), api: RANK_API, courses: COURSES.map(c => ({ id: c.id, name: c.name, laps: { time: TRIAL_LAPS, gp: c.laps.gp } })), course: course.id,
        modes: RANK_MODES.map(id => ({ id, name: MODES.find(m => m.id === id)?.name ?? id })),
        carName: id => carOf(id)?.name || id, klassName: '', version: rankVersionOf, mode: () => mode });   // 등급이 하나라 판 머리에 등급 이름을 안 쓴다 · 표는 모드마다(그랑프리는 'B/gp')
      const testDrive = !!discrete && LOCAL_API.test(RANK_API);
      game.onTrialRun = (info, handlers) => {
        if (!rank.eligible({ mode, klass, partsOn: PARTS_ON, tuned: isTuned(), auto: AUTO && !testDrive, bodyOff: BODY_OFF })) return false;
        return rankTrialRun(rank, game, hud, info, handlers);
      };
      // 경주(그랑프리): 상대 난이도 '어려움'(RACE_LEVEL)에서 달린 판만 — 그 밖의 조건은 타임어택과 같다
      game.onRaceRun = (info, handlers) => {
        if (!rank.eligible({ mode, level: levelId, klass, partsOn: PARTS_ON, tuned: isTuned(), auto: AUTO && !testDrive, bodyOff: BODY_OFF })) return false;
        return rankRaceRun(rank, game, hud, info, handlers);
      };
    } catch (error) { console.warn('랭킹을 못 붙임', error); rank = null; }
  }
  // 공유 포토카드(src/hud/share.js — 2026-11-24 사용자 결정): 결과 화면의 '공유'가 쓰는 손잡이. 장면 한 장(결과가 뜬 그 그림) · 쇼룸의 내 차(차마다 한 번 그려 둔다) · 그 판의 정보.
  let showroomFor = '', showroomShot = null;
  shareWith({
    snap: () => stage.snap(),
    showroom: async () => {
      if (showroomFor === carId && showroomShot) return showroomShot;
      try { await loadVehicles(THREE); } catch {}
      const id = carId; showroomShot = shootShowroom(THREE, stage, { car: carOf(id), makeModel: car => makeModel({}, car), exposure: isNight ? LOOKS.day.exposure : null }); showroomFor = id;
      return showroomShot;
    },
    info: () => ({ mode, modeName: modeNow().name, course: { id: course.id, name: picked.name }, car: carOf(carId).name, laps: [...game.laps], nick: rank?.profile?.()?.name || null }),
  });
  // 첫 화면의 차 모형을 기다린다(약속 3.41 — 위 firstModels. 보통은 캠퍼스보다 먼저 와 있다). 12초가 지나도 안 오면 임시 모양으로 연다(오는 대로 갈아입힌다 — onFirst).
  await Promise.race([firstModels, new Promise(done => setTimeout(done, 12000))]);
  if (!game.vehicles) dress();
  // 첫 화면을 그리기 전에: 아직 짧은 간격을 못 봤으면(묶인 것처럼 보이면) 아무것도 안 그리고 몇 장을 보내 확인한다 — 한가한 장의 간격만 '묶였다'의 증거다(frame-cap.js).
  //   묶이지 않은 기기는 불러오는 동안 이미 짧은 간격이 나와 기다리지 않는다(여기까지 와도 짧은 간격이 나오는 대로 끝낸다). 묶인 기기는 다섯 장이 모이면 끝낸다(0.2초쯤 · 다른 일에 밀리면 많아야 열두 간격 0.4초).
  //   탭이 숨어 있으면 건너뛴다(모르면 안 보인다). **끝나면 setTimeout 으로 넘긴다** — rAF 콜백 안에서 바로 이어 달리면 시작 화면이 첫 그리기보다 한 장 먼저 뜬다(그 한 장은 캔버스가 비고 최고 기록 글자도 비어 있다).
  capWatch = false;
  if (!capProbe.open && !document.hidden) await new Promise(done => {
    let left = 13, over = false; const finish = () => { if (over) return; over = true; setTimeout(done, 0); }; capProbe.mark();
    const tick = t => { capProbe.sample(t, true, !document.hidden); capPaint(); if (--left <= 0 || capProbe.open || capProbe.capped || document.hidden) finish(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick); setTimeout(finish, 900);
  });
  capDot.remove();
  game.cap = { get capped() { return capProbe.capped; }, get open() { return capProbe.open; }, get min() { return capProbe.min; }, get hits() { return capProbe.hits; }, get slow() { return slowWatch.slow; }, get average() { return slowWatch.average; }, get charging() { return charging; }, get touch() { return TOUCH; } };   // 검증용
  place(); stage.resize(); requestAnimationFrame(frame);
  // 차 고르기 화면(시작 화면의 '차' 줄 · C 키): 장면은 garage.js, 글자 층은 hud.garage. 처음 열 때 차량을 다 불러온 뒤 짓는다. ← → 로 넘기고 Enter 로 고르면 그 차로 바뀌어 시작 화면에 돌아온다.
  let garage = null, opening = false;
  const carInfo = car => {
    const stats = carStats(car.id, klass, carOptions);
    return { name: car.name, kind: kartOf(carKind(stats)).name + '형', stats: [...STAT_NAMES.map((name, k) => [name, stats[k]]), [BODY_NAME, bodyStat(car)]] };   // 성격 낱말은 막대에서(2026-11-26 — 그 전에는 기본 감각 그대로라 막대와 어긋났다)
  };
  async function openGarage() {
    if (opening || game.phase !== 'ready') return; opening = true;
    try { await loadVehicles(THREE); } catch {} finally { opening = false; }
    if (game.phase !== 'ready') return;
    garage ||= createGarage(THREE, { cars: CARS, makeModel: car => makeModel({}, car) });
    game.phase = 'garage'; game.garage = garage; garage.show(CARS.findIndex(c => c.id === carId));
    hud.garage(CARS.map(carInfo), garage.index, { onMove: i => garage.select(i), onPick: i => { hud.clearGarage(); setCar(CARS[i].id); showReady(); }, onBack: () => { hud.clearGarage(); showReady(); } });
  }
  // 시작 화면 A(2026-11-25): 이 조합으로 달리면 랭킹에 오르는가 — 경주는 상대 '어려움'일 때만(타임어택은 늘 오르니 표시하지 않는다). 키를 만들지 않는 셈(rank.eligible 은 키를 만든다)
  const rankedCombo = (m, l) => !!rank?.enabled && m !== 'time' && RANK_MODES.includes(m) && l === RACE_LEVEL && klass === RANK_CLASS && PARTS_ON && !BODY_OFF && !isTuned() && !AUTO;
  // 코스 고르기 화면(2026-11-25 사용자가 시안에서 고른 '가 하늘에서' — src/hud/course-pick.js, 처음 열 때 불러온다): 시작 화면의 '코스' 칸 · T 키.
  //   코스는 불러올 때 짓는다 — 다른 코스를 고르면 그 주소(?course=)로 다시 연다(모드 · 차 · 상대 · 설정은 브라우저에 남긴 값으로 이어진다). 지금 코스를 고르거나 뒤로면 시작 화면으로.
  let coursePick = null, courseOpening = false;
  async function openCourses(byKey = false) {
    if (courseOpening || game.phase !== 'ready') return; courseOpening = true;
    try {
      const { createCoursePick, trialBestOf, boardTopOf } = await import('./hud/course-pick.js');
      coursePick ||= game.coursePick = createCoursePick(THREE, { root: document.getElementById('hud'), stage, campus, courses: COURSES, current: { id: course.id, parts }, trialLaps: TRIAL_LAPS, game, night: isNight,
        world: () => ({ objects: [track.group, branch?.group, game.signs?.group, game.guideLights?.group, partModels?.group, flyProps?.group, pitModels?.group, pitCrew?.group, game.nightLamps?.group, kart.group, kartShadow.mesh, ...rivalKarts.flatMap(r => [r.model.group, r.shadow.mesh])], lampMap: game.nightLamps?.map?.texture }),
        best: id => { const saved = trialBestOf(id, { klass, version: GHOST_VER }); return id === course.id && mode === 'time' && PARTS_ON && !isTuned() && Number.isFinite(game.best) ? Math.min(saved ?? Infinity, game.best) : saved; },
        top: id => boardTopOf(rank?.enabled ? RANK_API : '', id) });
      await coursePick.prepare();
    } catch (error) { console.error('코스 고르기 화면을 못 엶', error); return; } finally { courseOpening = false; }
    if (game.phase !== 'ready') return;
    const back = () => { coursePick.close(); showReady(); if (byKey) document.querySelector('.hud-course')?.focus({ preventScroll: true }); };
    game.phase = 'course'; hud.away('course');
    coursePick.open(Math.max(0, COURSES.findIndex(c => c.id === course.id)), { onBack: back,
      onPick: id => { if (id === course.id) { back(); return; } const q = new URLSearchParams(location.search); q.set('course', id); location.search = q.toString(); } });
  }
  game.openCourses = openCourses;
  // 시작 화면: 모드 · 차 · 속도 등급 · 출발. 멈춤 판 · 결과 화면의 '메인 화면'에서도 다시 온다.
  function showReady() {
    rank?.clear(); game.phase = 'ready'; place(); hud.clearResult?.(); hud.clearNote();
    hud.ready(event => { seeTip(); audio?.unlock(); radio.preload(); if (TOUCH && event?.type !== 'keydown') input.setTouchMode(true); begin(0.9); }, { modes: MODES, mode, onMode: setMode, levels: LEVELS.map(l => ({ id: l.id, name: l.name })), level: levelId, onLevel: setLevel, ranked: rankedCombo, settings: settingsList(), onSetting: setSetting, car: { name: carOf(carId).name, kind: kartOf(kartId).name + '형' }, onCar: openGarage, courses: COURSES.map(c => ({ id: c.id, name: c.label || c.name })), course: course.id, onCourses: openCourses, power: (powerShown = powerNow()),
      tip: tipOn ? [['그랑프리', gpDamage ? '상대 7대와 경주해요. 벽에 부딪히면 차가 상해 느려지고, 출발선 옆 피트에 들르면 고쳐져요.' : '상대 7대와 경주해요.'], ['타임어택', '혼자 달려 기록을 겨뤄요.'], ['부스트', '드리프트로 게이지를 채우면 쓸 수 있어요.']] : null, onTip: seeTip,
      info: () => ({ laps: race ? race.laps : null, best: race ? raceBest() : game.best }) });   // 터치 기기에서 단추로 출발했으면 조향 패드를 건드리기 전에도 자동 가속
    rank?.ready();   // 시작 화면의 '랭킹' 단추 · 설정의 '이름' 줄 — hud.ready 가 화면을 다시 그리므로 그 뒤마다
  }
  if (AUTO) { hud.reveal(); begin(0.01); } else showReady();
}

if (typeof window !== 'undefined') {
  const query = new URLSearchParams(location.search), picked = courseOf(query.get('course'));
  // 터치 기기: 두 번 탭 · 두 손가락 확대를 막는다(src/hud/no-zoom.js — 아이폰 사파리는 viewport 의 user-scalable=no 를 듣지 않는다). 불러오는 동안부터.
  if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) blockZoom(document);
  const hud = createHud(document.getElementById('hud'), { course: picked.course });
  const game = window.__game = { phase: 'loading', laps: [], wallHits: 0, frameMs: 0, error: null };
  boot(query, picked, hud, game).catch(error => { console.error(error); game.phase = 'failed'; game.error = String(error?.stack || error); hud.fail(String(error?.message || error)); });
}
