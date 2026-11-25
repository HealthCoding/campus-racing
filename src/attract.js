// 시작 화면 배경 주행(2026-11-23 '로비' 시안에서 사용자가 'B 중계 카메라'를 고름 → cams 가 기본). main.js 가 불러온다 — ?attract=0 | off · ?auto · 움직임 줄이기면 안 쓴다, ?attract=follow 는 비교용.
//   follow = 내 차가 자동 운전으로 코스를 돌고, 카메라가 경주 카메라보다 낮고 넓게 뒤에서 따라간다(천천히 옆으로 흔들린다).
//   cams   = 내 차 + 상대 셋이 같이 달리고, 카메라가 4~6초마다 끊어 바뀐다: 길가 낮은 자리 → 추격 → 옆에서 나란히 → 높이 넓게. 상징 건물이 가까우면 그 건물이 뒤에 오는 쪽에 선다.
// 지키는 것: 게임의 주행 계산(sim) · 경주(race) · 랩 시계 · 기록 · 소리는 건드리지 않는다. 여기는 제 차 계산 · 제 상대 · 제 카메라만 갖고, 시작 화면(ready)일 때만 돈다.
//   출발하면 main.js 의 begin → place 가 예전 그대로 출발 자리로 놓는다(이 파일은 그 뒤로 안 불린다).
import { createKartSim } from './kart/physics.js';
import { createAutoDriver } from './kart/autodrive.js';
import { createLapClock } from './track/track.js';
import { createRace, RIVALS } from './race/race.js';
import { LANDMARK_IDS } from './world/landmarks.js';

const TICK = 1 / 120;
export const ATTRACT = {
  pace: 0.78,          // 최고 속도 배율(보통 속도로 — 부스트 안 씀)
  startAt: 905,        // 처음 자리(m) — 언더우드관 앞 직선(960~1140) 조금 전. 코스마다 courses.js 의 show.attract 가 있으면 그것(2026-11-25 B 는 942)
  rivals: 3,           // cams 의 상대 수
  // cams 의 상대 자리: 내 차 기준 앞뒤(m) · 옆(m, 오른쪽 +)
  grid: [{ s: 12, lat: -1.6 }, { s: 24, lat: 1.6 }, { s: -12, lat: 1.4 }],
  shots: [['trackside', 5.5], ['chase', 4.5], ['side', 5], ['high', 5.5]],   // [이름, 초]
  shift: { pc: [0, 0.12], land: [0, 0.2], port: [0, 0.16] },                 // 그림을 위로 미는 양(시작 화면의 아래 메뉴 위로 차를 올린다 — main.js 의 SHOW 와 같은 값)
};

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const ease = (dt, t) => 1 - Math.exp(-dt / t);
const lerp = (a, b, t) => a + (b - a) * t;
const copy = (to, s) => { to.x = s.x; to.y = s.y; to.z = s.z; to.heading = s.heading; to.course = s.course; to.pitch = s.pitch || 0; to.roll = s.roll || 0; to.speed = s.speed; return to; };

// deps: course · parts · world(내 차의 세계) · rivalWorld · ground(x, z) · groundAt(x, z: 땅) · blocked(x, z) · campus · rescue
//   params() 지금 등급의 주행 값 · body() 내 차의 부딪힘 모양 · size() [길이, 높이] m · level() 상대 난이도 id · weigh(race) 상대의 무게 · 모양을 입은 차에 맞추기
export function createAttract(THREE, mode, deps) {
  const { startAt = ATTRACT.startAt, course, parts, world, rivalWorld, ground, groundAt, blocked, campus, rescue, params, body, size, level, weigh, weight = () => 1 } = deps;
  const paced = () => { const p = { ...params() }; p.maxSpeed *= ATTRACT.pace; p.boostMaxSpeed *= ATTRACT.pace; return p; };
  let sim = createKartSim({ params: paced(), world, body: body() }), driver = createAutoDriver({ samples: course.centre, params: paced(), boost: false, speedScale: 0.95 });
  const clock = createLapClock(course), watch = rescue.watcher(), prev = {}, cur = {};
  const me = { get state() { return sim.state; }, clock, finished: null, get weight() { return weight(); }, get body() { return sim.body; } };
  let race = null, acc = 0, time = 30, steer = 0;   // time: 상대의 출발 반응(react)을 넘긴 값에서 시작
  const surface = s => { const at = parts.pointAt(s, 0); return ground(at.x, at.z) + parts.deckLift(s) + parts.rampLift(s); };
  const put = (target, s, lat, speed) => {
    const at = parts.pointAt(s, lat); at.y = ground(at.x, at.z) + parts.deckLift(s) + parts.bankLift(s, lat) + parts.rampLift(s);
    target.sim.reset(at); target.sim.state.speed = speed; target.driver.reset(at.index); target.clock.reset(); target.clock.locate(at.index); target.watch.reset(at.index);
    copy(target.prev, target.sim.state); copy(target.cur, target.sim.state);
  };
  const hero = { get sim() { return sim; }, get driver() { return driver; }, clock, watch, prev, cur };
  function start() {
    put(hero, startAt, 0, 9);
    if (mode !== 'cams') return;
    race = weigh(createRace({ course, parts, world: rivalWorld, ground, params: paced(), level: level(), laps: 999, rivals: RIVALS.slice(0, ATTRACT.rivals) }));
    race.karts.forEach((k, i) => { put(k, startAt + ATTRACT.grid[i].s, ATTRACT.grid[i].lat, 9); });
  }
  start();

  function tick() {
    const st = sim.state; copy(prev, st);
    sim.step(driver.input(st)); steer = st.steer || 0;
    const back = watch.update(st, TICK);
    if (back) { sim.reset(back); st.speed = back.speed; driver.reset(back.index); clock.locate(back.index); copy(prev, st); }
    time += TICK;
    if (race) race.step(time, me);
    copy(cur, st); clock.update(prev, cur, time);
  }

  // ---- 카메라
  const LMS = campus.obstacles.filter(o => LANDMARK_IDS.includes(o.id));
  let shot = 0, shotT = 0, fresh = true, begun = false, layoutKey = '', fovNow = 50;
  const cam = { ang: 0, y: 0, x: 0, z: 0, lx: 0, ly: 0, lz: 0, side: 1, fixed: null };
  // 가장 가까운 상징 건물이 진행 방향의 어느 쪽인지(오른쪽 +1 · 왼쪽 −1 · 없으면 0)
  const landmarkSide = (x, z, h) => {
    let best = null, bd = 160 * 160; for (const o of LMS) { const d = (o.x - x) ** 2 + (o.z - z) ** 2; if (d < bd) { bd = d; best = o; } }
    if (!best) return 0; const rx = -Math.cos(h), rz = Math.sin(h); return Math.sign((best.x - x) * rx + (best.z - z) * rz) || 1;
  };
  // 방호벽(track.js — 통로 가장자리 0.31 m 바깥, 땅 위 0.78 m)과 차의 자리. 길 밖 땅이 길보다 높은 곳이 있어서 벽 꼭대기는 그 자리의 땅으로 잰다.
  const WALL_OUT = 0.31, WALL_TOP = 0.78;
  const wallTop = (s, side) => { const mid = parts.pointAt(s, 0), at = parts.pointAt(s, side * ((side > 0 ? mid.right : mid.left) + WALL_OUT)); return groundAt(at.x, at.z) + parts.deckLift(s) + parts.bankLift(s, side * ((side > 0 ? mid.right : mid.left) + WALL_OUT)) + WALL_TOP; };
  // 차에서 왼쪽 · 오른쪽 방호벽까지(m): [왼쪽, 오른쪽]. 자동 운전이 아는 트랙 거리의 가운데선과 반폭으로 잰다.
  const roomAt = pose => { const mid = parts.pointAt(driver.progress(), 0), lat = (pose.x - mid.x) * -Math.cos(mid.heading) + (pose.z - mid.z) * Math.sin(mid.heading); return [mid.left + lat + WALL_OUT, mid.right - lat + WALL_OUT]; };
  // 두 점 사이를 건물이 막는지(바닥 네모 — 위로 끝없다고 본다)
  const sightClear = (x, z, tx, tz) => { const d = Math.hypot(tx - x, tz - z); for (let k = 1.5; k < d - 1; k += 1.5) { const t = k / d; if (blocked(x + (tx - x) * t, z + (tz - z) * t)) return false; } return true; };
  const shotName = () => mode === 'cams' ? ATTRACT.shots[shot % ATTRACT.shots.length][0] : 'follow';
  function beginShot(pose) {
    fresh = true; shotT = 0;
    const lm = landmarkSide(pose.x, pose.z, pose.course);
    cam.side = lm ? -lm : (shot % 2 ? 1 : -1);   // 건물을 등지는 쪽에 서면 차 너머로 건물이 보인다
    cam.fixed = null;
    if (shotName() === 'trackside') {
      // 차가 2~3초쯤 뒤에 지나갈 길가 자리(방호벽 바로 바깥, 사람 눈높이쯤 — 길 · 땅에서 1.4 m, 벽 꼭대기보다 0.7 m 넘게 — 굽은 길 너머로 다가오는 차가 벽에 덜 가린다). 다가오는 길이 건물에 덜 가리는 자리를 고른다
      //   (2026-11-23 — 건물 모서리 뒤에 서서 다가오는 차가 장면의 3분의 1 동안 안 보였다). 같으면 상징 건물을 등지는 쪽 · 3초 앞 자리.
      const sNow = driver.progress(); let best = -1;
      for (const lead of [2.8, 2.0, 1.3]) for (const side of [cam.side, -cam.side]) for (const back of [1.1, 3.5]) {   // 3.5 = 벽에서 조금 물러선 자리(모퉁이 건물 너머가 보이게)
        const sCam = sNow + Math.max(8, pose.speed) * lead + 6, mid = parts.pointAt(sCam, 0), half = side > 0 ? mid.right : mid.left, at = parts.pointAt(sCam, side * (half + back));
        if (blocked(at.x, at.z)) continue;
        // 차는 코너 안쪽을 파고드니 길 가운데만 보지 않고 양쪽 가장자리 1.5 m 안까지 다 보이는 자리만 센다
        let score = 0; for (let s = sNow; s <= sCam + 10; s += 4) { const m = parts.pointAt(s, 0); if ([-(m.left - 1.5), 0, m.right - 1.5].every(lat => { const p = parts.pointAt(s, lat); return sightClear(at.x, at.z, p.x, p.z); })) score++; }
        if (score > best) { best = score; cam.fixed = { x: at.x, z: at.z, y: Math.max(surface(sCam) + 1.4, groundAt(at.x, at.z) + 1.4, wallTop(sCam, side) + 0.7) }; cam.side = side; }
      }
      if (!cam.fixed) { const sCam = sNow + Math.max(8, pose.speed) * 2.8 + 6, at = parts.pointAt(sCam, cam.side * 0.5); cam.fixed = { x: at.x, z: at.z, y: surface(sCam) + 1.2 }; }
    }
  }
  // 따라가는 카메라: 진행 방향 뒤 dist, 옆 lat, 위 up(차 기준). 건물 안이면 당긴다. 땅 밑으로 안 내려간다.
  function trail(pose, dt, { dist, lat, up, lag, lookAhead, lookUp }) {
    if (fresh) { cam.ang = pose.course; }
    cam.ang += wrap(pose.course - cam.ang) * ease(dt, lag);
    const fx = Math.sin(cam.ang), fz = Math.cos(cam.ang), rx = -fz, rz = fx;
    let d = dist; for (let i = 0; i < 5 && blocked(pose.x - fx * d + rx * lat, pose.z - fz * d + rz * lat); i++) d *= 0.75;
    const x = pose.x - fx * d + rx * lat, z = pose.z - fz * d + rz * lat, floor = groundAt(x, z) + 0.45;
    const wantY = pose.y + up; cam.y = fresh ? wantY : cam.y + (wantY - cam.y) * ease(dt, 0.25);
    cam.x = x; cam.z = z; cam.y = Math.max(cam.y, floor);
    cam.lx = pose.x + fx * lookAhead; cam.ly = pose.y + lookUp; cam.lz = pose.z + fz * lookAhead;
  }
  function camera(c, pose, dt) {
    if (!begun) { begun = true; beginShot(pose); }
    else if (mode === 'cams') { shotT += dt; if (shotT >= ATTRACT.shots[shot % ATTRACT.shots.length][1]) { shot++; beginShot(pose); } }
    const W = innerWidth, H = innerHeight, kind = W <= 700 ? 'port' : H <= 460 ? 'land' : 'pc', tall = kind === 'port';
    const [L, Ht] = size(), name = shotName(), sideOut = (3.0 + 0.9 * L) * (tall ? 1.5 : 1); let fov;
    // 옆 장면의 자리: 건물이 가까워 카메라를 당겨야 하는 자리(당기면 차가 화면을 넘친다 — 2026-11-23 PC 에서 GT 가 화면 밖까지 찼다)는 피한다:
    //   바로 옆 → 반대쪽 옆 → 비스듬히 앞 · 뒤(옆에서 30° 남짓) 차례로 보고 덜 당기는 자리, 같으면 길이 넓은 쪽 옆
    if (name === 'side' && fresh) {
      const out = sideOut;
      const r = roomAt(pose), here = cam.side > 0 ? 1 : 0;
      // 카메라는 장면 내내 차 옆을 따라가니 지금 자리만 보지 않고 앞으로 5초 동안 지날 길(1초마다)에서 가장 많이 당기는 값을 본다
      const ahead = [0, 1, 2, 3, 4, 5].map(k => k ? parts.pointAt(driver.progress() + Math.max(8, pose.speed) * k, 0) : { x: pose.x, z: pose.z, heading: pose.course });
      const reach = (side, tilt) => Math.min(...ahead.map(p => { const f0 = Math.sin(p.heading), f1 = Math.cos(p.heading), dx = -f1 * side * Math.cos(tilt) + f0 * Math.sin(tilt), dz = f0 * side * Math.cos(tilt) + f1 * Math.sin(tilt);
        let o = out; for (let i = 0; i < 4 && blocked(p.x + dx * o, p.z + dz * o); i++) o *= 0.75; return o; }));
      const wide = out > r[here] && r[1 - here] > r[here], order = wide ? [-cam.side, cam.side] : [cam.side, -cam.side];
      let best = -1; cam.over = 0; cam.tilt = 0;
      for (const tilt of [0, 0.55, -0.55]) for (const side of order) { const o = reach(side, tilt); if (o > best + 0.01) { best = o; cam.side = side; cam.tilt = tilt; } }
      cam.sideChase = best < out * 0.6;   // 그래도 많이 당겨야 하면(양쪽이 건물 사이) 이 장면은 비스듬한 추격으로 대신한다
    }
    const style = name === 'side' && cam.sideChase ? 'aside' : name;   // aside = 옆 장면을 대신하는 비스듬한 추격(옆으로 더 비켜서)
    if (style === 'follow' || style === 'chase' || style === 'aside') {
      const chase = style !== 'follow', t = performance.now() / 1000;
      const dist = (2.4 + 1.3 * L) * (tall ? 1.45 : 1) * (chase ? 0.86 : 1), sway = style === 'aside' ? 0.6 * cam.side : chase ? 0.32 * cam.side : 0.26 * Math.sin(t * 0.21);
      trail(pose, dt, { dist, lat: sway * dist, up: (0.55 + 0.42 * Ht) * (chase ? 0.85 : 1) * (tall ? 1.25 : 1), lag: chase ? 0.35 : 0.6, lookAhead: 2.5 + 0.6 * L, lookUp: 0.35 + 0.15 * Ht });
      fov = (chase ? 58 : 62) + (tall ? 10 : 0);
    } else if (style === 'side') {
      if (fresh) cam.ang = pose.course;
      cam.ang += wrap(pose.course - cam.ang) * ease(dt, 0.3);
      // 큰 차 · 세로 화면은 카메라가 멀어 방호벽 밖으로 나간다 → 장면을 시작할 때 길이 넓은 쪽에 서고, 그래도 벽 밖이면 벽 너머로 차 밑까지 보이게 올린다(2026-11-23 — 세로 화면에서 GT 가 벽에 다 가렸다)
      const out = sideOut;
      const fx = Math.sin(cam.ang), fz = Math.cos(cam.ang), ct = Math.cos(cam.tilt || 0), st = Math.sin(cam.tilt || 0), rx = -fz * cam.side * ct + fx * st, rz = fx * cam.side * ct + fz * st;
      let o = out; for (let i = 0; i < 4 && blocked(pose.x + rx * o, pose.z + rz * o); i++) o *= 0.75;
      cam.x = pose.x + rx * o + fx * 0.8; cam.z = pose.z + rz * o + fz * 0.8;
      // 차 밑(길 위 0.25 m)에서 벽 꼭대기(차 앞뒤 세 곳 가운데 가장 높은 것) 0.1 m 위를 지나 카메라까지 가는 선의 높이(길 기준)
      const room = roomAt(pose)[cam.side > 0 ? 1 : 0], sNow = driver.progress();
      //   선의 시작은 차의 카메라 쪽 옆면 아래(길 위 0.15 m) — 차 가운데로 재면 바퀴 · 문 아래가 벽에 가렸다(세로 화면). 차 폭은 길이로 어림(카트 1 m · GT 2 m)
      let over = 0; if (o > room) { const top = Math.max(...[-2.5, 0, 2.5].map(k => wallTop(sNow + k, cam.side))) - pose.y, near = Math.min(1, 0.15 + 0.185 * L); over = clamp(0.15 + (top + 0.2 - 0.15) * (o - near) / Math.max(1, room - near), 0, 5); }
      cam.over = fresh ? over : Math.max(over, cam.over * (1 - ease(dt, 1.5)));   // 올렸다가 내릴 때는 천천히(벽이 들쭉날쭉해도 출렁이지 않게)
      const wantY = pose.y + Math.max(0.55 + 0.3 * Ht, cam.over); cam.y = fresh ? wantY : cam.y + (wantY - cam.y) * ease(dt, 0.25); cam.y = Math.max(cam.y, groundAt(cam.x, cam.z) + 0.4);
      cam.lx = pose.x + fx * 0.6; cam.ly = pose.y + 0.4 + 0.15 * Ht; cam.lz = pose.z + fz * 0.6;
      fov = tall ? 70 : 46;   // 세로 화면은 옆으로 좁다 — 긴 차(4.6 m)가 양 끝까지 들어오게(62 에서는 뒤 날개가 잘렸다)
      if (o < out - 0.01) fov = Math.min(tall ? 90 : 80, fov * Math.pow(out / o, 0.6));   // 양쪽 다 건물이라 당겼으면 그만큼 넓게(차가 화면을 넘치지 않게)
    } else if (name === 'high') {
      if (fresh) cam.ang = pose.course;
      cam.ang += wrap(pose.course - cam.ang) * ease(dt, 0.9);
      const fx = Math.sin(cam.ang), fz = Math.cos(cam.ang), rx = -fz * cam.side, rz = fx * cam.side;
      const x = pose.x - fx * (11 + 2 * L) + rx * (9 + L), z = pose.z - fz * (11 + 2 * L) + rz * (9 + L), y = pose.y + 10;
      if (fresh) { cam.x = x; cam.z = z; cam.y = y; } else { const k = ease(dt, 0.7); cam.x += (x - cam.x) * k; cam.z += (z - cam.z) * k; cam.y += (y - cam.y) * k; }
      cam.lx = pose.x + fx * 7; cam.ly = pose.y + 0.5; cam.lz = pose.z + fz * 7;
      fov = tall ? 64 : 52;
    } else {   // trackside: 서 있는 카메라가 차를 따라 고개를 돌리고, 차 크기가 비슷하게 보이게 당겨 찍는다
      const f = cam.fixed; cam.x = f.x; cam.z = f.z; cam.y = f.y;
      const lx = pose.x, ly = pose.y + 0.45, lz = pose.z;
      if (fresh) { cam.lx = lx; cam.ly = ly; cam.lz = lz; } else { const k = ease(dt, 0.12); cam.lx += (lx - cam.lx) * k; cam.ly += (ly - cam.ly) * k; cam.lz += (lz - cam.lz) * k; }
      const d = Math.hypot(lx - f.x, lz - f.z);
      fov = clamp(2 * Math.atan((L * 2.6 + 2) / (2 * Math.max(1, d))) * 180 / Math.PI, 16, 54) * (tall ? 1.35 : 1);
    }
    fovNow = fresh ? fov : fovNow + (fov - fovNow) * ease(dt, name === 'trackside' ? 0.3 : 0.4);
    c.position.set(cam.x, cam.y, cam.z); c.lookAt(cam.lx, cam.ly, cam.lz);
    const key = W + 'x' + H; let changed = Math.abs(c.fov - fovNow) > 0.01; c.fov = fovNow;
    if (key !== layoutKey) { layoutKey = key; const sh = ATTRACT.shift[kind]; c.setViewOffset(W, H, -sh[0] * W, sh[1] * H, W, H); changed = true; }
    if (changed) c.updateProjectionMatrix();
    fresh = false;
  }

  // ---- 상대 모양: cams 이면 앞의 셋을 이 경주로 놓고 나머지는 감춘다. follow 이면 다 감춘다(출발 줄에 서 있는 상대를 지나가며 겹쳐 보이지 않게).
  const views = Array.from({ length: ATTRACT.rivals }, () => ({ speed: 0, steer: 0, slip: 0, pitch: 0, roll: 0, drifting: false, boost: 0, boostKind: 'item', kickReady: false, stock: 0, slots: 2, grounded: true, gauge: 0 }));
  function rivals(list, dt, roadAt) {
    const a = Math.min(1, acc / TICK);
    list.forEach((r, i) => {
      const k = race?.karts[i], on = !!k; r.model.group.visible = on; r.shadow.mesh.visible = on; if (!on) return;
      const p0 = k.prev, p1 = k.cur, st = k.sim.state, x = lerp(p0.x, p1.x, a), y = lerp(p0.y, p1.y, a), z = lerp(p0.z, p1.z, a), heading = p0.heading + wrap(p1.heading - p0.heading) * a, v = views[i];
      r.model.group.position.set(x, y, z); r.model.group.rotation.set(0, heading, 0);
      v.speed = lerp(p0.speed, p1.speed, a); v.steer = st.steer; v.slip = wrap(st.heading - st.course); v.pitch = lerp(p0.pitch, p1.pitch, a); v.roll = lerp(p0.roll, p1.roll, a); v.grounded = st.grounded !== false;
      r.model.update(v, dt); r.shadow.update(x, z, heading, y, roadAt);
    });
  }

  return {
    mode,
    // 한 화면: 주행을 dt 만큼 돌리고 pose(main.js 가 그리는 자세)를 내 차의 것으로 바꾼다
    step(dt, pose) {
      acc += dt; let guard = 0; while (acc >= TICK && guard++ < 24) { tick(); acc -= TICK; } if (acc > TICK) acc = 0;
      const a = Math.min(1, acc / TICK);
      pose.x = lerp(prev.x, cur.x, a); pose.y = lerp(prev.y, cur.y, a); pose.z = lerp(prev.z, cur.z, a);
      pose.heading = prev.heading + wrap(cur.heading - prev.heading) * a; pose.course = prev.course + wrap(cur.course - prev.course) * a;
      pose.pitch = lerp(prev.pitch, cur.pitch, a); pose.roll = lerp(prev.roll, cur.roll, a); pose.speed = lerp(prev.speed, cur.speed, a);
      pose.boost = 0; pose.boostKind = 'item'; pose.drifting = false; pose.wallHit = false; pose.landed = 0; pose.crash = 0; pose.air = sim.state.air || 0; pose.wallX = undefined; pose.wallZ = undefined;
    },
    camera, rivals,
    // 다른 카메라(차 고르기 · 경주)를 쓰다 돌아왔을 때: 그림 밀기 · 따라붙기를 처음부터
    invalidate() { layoutKey = ''; fresh = true; },
    // 등급 · 차 · 난이도가 바뀌었을 때: 자리는 그대로 두고 값만 맞춘다
    sync() { Object.assign(sim.params, paced()); sim.setBody(body()); const at = driver.index; driver = createAutoDriver({ samples: course.centre, params: paced(), boost: false, speedScale: 0.95 }); driver.reset(at); if (race) weigh(race); },
    get steer() { return steer; },
    get shot() { return shotName(); },
    get shotIndex() { return shot; },
    get state() { return sim.state; },
  };
}
