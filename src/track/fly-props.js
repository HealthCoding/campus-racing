// 부딪히면 날아가는 소품(2026-11-25 코스 D 재미 손질 — 사용자가 고른 추천 둘째): 라바콘 · 상자.
// 보이기만 한다. 주행 계산 · 기록 · 유령 · 순위 · 서버의 다시 계산은 이것을 모른다(계산 코드에서 부르지 않는다 — main.js 가 화면을 그릴 때만 부른다).
//   const props = createFlyProps(THREE, { parts, spots, surfaceAt, floorAt, reducedMotion });  scene.add(props.group);
//   매 화면: props.update(dt, hitters)   hitters = [{ id, x, y, z, heading, body }] — 화면에 그린 자세(보간한 것). body = sim.body(없으면 원점의 반지름 0.8 원 하나)
//                                        차의 빠르기는 지난 화면과의 자리 차로 잰다(5 m 넘게 뛰면 옮겨 놓은 것으로 보고 안 잰다).
//   다시 출발 · 새 판: props.reset()      끝: props.dispose()
//   parts      createParts 의 결과(pointAt · 반폭) · surfaceAt(x, z, s) = 노면이 깔리는 높이(main.js 의 것 — 아스팔트는 + LIFT.road)
//   floorAt(x, z, y) 날아가다 떨어지는 바닥(없으면 서 있던 노면 높이)
//   spots      courses.js 의 props: [{ s, side: 'left' | 'right', kind: 'cone' | 'box', count, gap?, inset? }]
//              cone = 길 가장자리를 따라 한 줄(gap m 간격), box = 아래 줄 위에 몇 개를 얹은 더미. inset = 경계에서 안쪽으로(m, 기본 1.8 — 자동 운전 상대는 이 자리들에서 경계 3.7 m 안쪽을 달려 거의 안 친다. 바깥으로 흐르는 사람 차가 친다)
// 그리기 호출 2개(라바콘 · 상자 InstancedMesh, 그림자는 받기만). 다 서 있으면 행렬을 고치지 않는다.
// 움직임 줄이기(prefers-reduced-motion)면 덜 튀고 덜 돌고 빨리 사라진다.

export const PROPS_LOOK = {
  road: 0.13,                 // 아스팔트가 노면 위로 뜬 높이(track.js LIFT.road)
  gravity: 13,                // 화면용 중력(조금 세게 — 짧고 시원하게 떨어진다)
  life: 1.25, fade: 0.35,     // 날아간 뒤 이만큼 지나면 줄어들며 사라진다(초)
  respawn: 6, grow: 0.3,      // 사라진 뒤 이만큼 지나면(근처 10 m 에 차가 없을 때) 제자리에 다시 선다
  cone: { radius: 0.22, height: 0.7 },
  box: { size: 0.62, height: 0.5, radius: 0.36 },
  reduce: { speed: 0.45, spin: 0.25, life: 0.7 },
};
const COLOURS = { cone: 0xff5a1a, coneBase: 0x2a2c30, band: 0xf2f2ee, box: 0xc79a62, tape: 0x9b7444 };

export function createFlyProps(THREE, { parts, spots = [], surfaceAt, floorAt = null, reducedMotion = false } = {}) {
  const L = PROPS_LOOK, group = new THREE.Group(); group.name = 'fly-props';
  let seed = 20261125;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  // ── 모양: 조각마다 색을 정점 색으로 칠해 한 덩어리로 합친다
  function merged(pieces) {
    const pos = [], nor = [], col = [], c = new THREE.Color();
    for (const [geo, colour] of pieces) {
      const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position.array, n = g.attributes.normal.array;
      c.set(colour);
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(c.r, c.g, c.b); }
      geo.dispose(); if (g !== geo) g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
  }
  // 라바콘: 네모 받침 + 원뿔(가운데 흰 띠). 원점 = 바닥 가운데.
  const coneR = y => 0.17 - (y - 0.04) / 0.66 * 0.135;
  const frustum = (y0, y1, top) => { const g = new THREE.CylinderGeometry(coneR(y1), coneR(y0), y1 - y0, 10, 1, !top); g.translate(0, (y0 + y1) / 2, 0); return g; };
  const base = new THREE.BoxGeometry(0.42, 0.04, 0.42); base.translate(0, 0.02, 0);
  const coneGeo = merged([[base, COLOURS.coneBase], [frustum(0.04, 0.34), COLOURS.cone], [frustum(0.34, 0.46), COLOURS.band], [frustum(0.46, 0.70, true), COLOURS.cone]]);
  // 상자: 골판지 몸통 + 윗면 · 앞뒤를 두르는 테이프. 원점 = 바닥 가운데.
  const B = L.box, body = new THREE.BoxGeometry(B.size, B.height, B.size); body.translate(0, B.height / 2, 0);
  const tape = new THREE.BoxGeometry(0.12, B.height + 0.008, B.size + 0.008); tape.translate(0, B.height / 2, 0);
  const boxGeo = merged([[body, COLOURS.box], [tape, COLOURS.tape]]);

  // ── 자리: 코스 위 (s, 옆)로 놓는다
  const list = [];
  for (const spot of spots) {
    const side = spot.side === 'left' ? -1 : 1, inset = spot.inset ?? 1.8, count = Math.max(1, spot.count | 0);
    const lateralAt = s => { const p = parts.pointAt(s, 0); return side * ((side < 0 ? p.left : p.right) - inset); };
    const put = (kind, s, lat, lift, yawJitter) => {
      const p = parts.pointAt(s, lat), y = surfaceAt(p.x, p.z, s) + L.road;
      list.push({ kind, s, x: p.x, y: y + lift, z: p.z, floor: y, yaw: p.heading + (rnd() - 0.5) * yawJitter, radius: kind === 'cone' ? L.cone.radius : B.radius, half: kind === 'cone' ? 0.35 : B.height / 2 });
    };
    if (spot.kind === 'box') {
      const top = Math.floor(count / 2.5), bottom = count - top, gap = spot.gap ?? 0.68, lat = lateralAt(spot.s);
      for (let k = 0; k < bottom; k++) put('box', spot.s + (k - (bottom - 1) / 2) * gap, lat + (rnd() - 0.5) * 0.12, 0, 0.25);
      for (let k = 0; k < top; k++) put('box', spot.s + (k - (top - 1) / 2) * gap, lat + (rnd() - 0.5) * 0.08, B.height, 0.4);
    } else {
      const gap = spot.gap ?? 1.8;
      for (let k = 0; k < count; k++) { const s = spot.s + k * gap; put('cone', s, lateralAt(s) + (k % 2 ? 0.18 : -0.12), 0, Math.PI); }
    }
  }
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  const meshes = {};
  for (const [kind, geo] of [['cone', coneGeo], ['box', boxGeo]]) {
    const own = list.filter(p => p.kind === kind);
    if (!own.length) { geo.dispose(); continue; }
    const mesh = new THREE.InstancedMesh(geo, material, own.length); mesh.name = 'fly-props-' + kind;
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;   // 날아가면 처음 경계 상자를 벗어난다
    own.forEach((p, i) => { p.mesh = mesh; p.index = i; });
    if (kind === 'box') { const c = new THREE.Color(); own.forEach((p, i) => mesh.setColorAt(i, c.setScalar(0.86 + 0.14 * rnd()))); }
    group.add(mesh); meshes[kind] = mesh;
  }

  // ── 움직임
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), dq = new THREE.Quaternion(), axis = new THREE.Vector3(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const R = reducedMotion ? L.reduce : { speed: 1, spin: 1, life: 1 };
  function write(p) {
    const k = p.state === 'rest' ? 1 : p.scale;
    if (p.state === 'rest') q.setFromAxisAngle(Y, p.yaw); else q.copy(p.q);
    m4.compose(v3.set(p.px, p.py, p.pz), q, sc.set(k, k, k)); p.mesh.setMatrixAt(p.index, m4); p.mesh.instanceMatrix.needsUpdate = true;
  }
  function rest(p) { p.state = 'rest'; p.px = p.x; p.py = p.y; p.pz = p.z; p.t = 0; p.scale = 1; p.q ||= new THREE.Quaternion(); write(p); }
  function reset() { for (const p of list) rest(p); seen.clear(); hits = 0; }

  // 차의 부딪힘 원(화면 자세 기준): body 가 없으면 원점의 반지름 0.8 원 하나
  const ONE = [0];
  const seen = new Map();   // id → 지난 화면의 { x, y, z, t }
  let hits = 0, moving = 0;
  function launch(p, h, vx, vz, cx, cz) {
    const speed = Math.hypot(vx, vz), push = Math.min(1, speed / 12) * 0.7 + 0.3;
    let nx = p.px - cx, nz = p.pz - cz; const nl = Math.hypot(nx, nz);
    if (nl > 1e-6) { nx /= nl; nz /= nl; } else { nx = -Math.cos(h.heading); nz = Math.sin(h.heading); }
    const out = (2.2 + 0.12 * speed) * push, carry = 0.85 + 0.35 * rnd();
    p.vx = (vx * carry + nx * out) * R.speed; p.vz = (vz * carry + nz * out) * R.speed;
    p.vy = Math.min(9, 2.6 + 0.17 * speed + 1.5 * rnd()) * push * (reducedMotion ? 0.6 : 1);
    axis.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(); p.axis = (p.axis || new THREE.Vector3()).copy(axis);
    p.w = (6 + 9 * rnd()) * push * R.spin; p.q.setFromAxisAngle(Y, p.yaw); p.state = 'fly'; p.t = 0; p.scale = 1; hits++;
  }
  function update(dt, hitters = []) {
    if (!(dt > 0)) return;
    moving = 0;
    // 1) 서 있는 소품에 닿았는가(지난 화면 → 이번 화면의 길을 쓸어서 본다 — 빠른 차가 한 화면에 건너뛰지 않게)
    for (const h of hitters) {
      if (!h || !Number.isFinite(h.x)) continue;
      const last = seen.get(h.id), jumped = !last || Math.hypot(h.x - last.x, h.z - last.z) > 5;
      const vx = jumped ? 0 : (h.x - last.x) / dt, vz = jumped ? 0 : (h.z - last.z) / dt;
      const fx = Math.sin(h.heading), fz = Math.cos(h.heading), r = h.body ? h.body.radius : 0.8, O = h.body ? h.body.offsets : ONE;
      const reach = (h.body ? Math.abs(h.body.offsets[0]) + Math.abs(h.body.offsets[h.body.offsets.length - 1]) : 0) + r + 2 + Math.hypot(vx, vz) * dt;
      for (const p of list) {
        if (p.state !== 'rest' || Math.abs(p.px - h.x) > reach || Math.abs(p.pz - h.z) > reach || Math.abs(p.py - h.y) > 2.5) continue;
        for (const o of O) {
          const cx = h.x + fx * o, cz = h.z + fz * o, ax = jumped ? cx : cx - vx * dt, az = jumped ? cz : cz - vz * dt;
          const ex = cx - ax, ez = cz - az, l2 = ex * ex + ez * ez, t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((p.px - ax) * ex + (p.pz - az) * ez) / l2)) : 1;
          const qx = ax + ex * t, qz = az + ez * t;
          if (Math.hypot(p.px - qx, p.pz - qz) < r + p.radius) { launch(p, h, vx, vz, qx, qz); break; }
        }
      }
      if (last) { last.x = h.x; last.y = h.y; last.z = h.z; } else seen.set(h.id, { x: h.x, y: h.y, z: h.z });
    }
    // 2) 나는 것 · 사라진 것 · 다시 서는 것
    for (const p of list) {
      if (p.state === 'rest') continue;
      p.t += dt;
      if (p.state === 'fly') {
        moving++;
        p.vy -= L.gravity * dt; p.px += p.vx * dt; p.py += p.vy * dt; p.pz += p.vz * dt;
        dq.setFromAxisAngle(p.axis, p.w * dt); p.q.premultiply(dq);
        const floor = (floorAt ? floorAt(p.px, p.pz, p.py) : p.floor) + p.half * 0.6;
        if (p.py < floor) { p.py = floor; if (p.vy < 0) p.vy = -p.vy * 0.35; p.vx *= 0.7; p.vz *= 0.7; p.w *= 0.7; }
        const life = L.life * R.life;
        p.scale = p.t < life ? 1 : Math.max(0, 1 - (p.t - life) / L.fade);
        if (p.scale <= 0) { p.state = 'gone'; p.t = 0; p.scale = 0; }
        write(p);
      } else if (p.state === 'gone') {
        if (p.t < L.respawn) continue;
        if (hitters.some(h => h && Math.hypot(h.x - p.x, h.z - p.z) < 10)) continue;
        p.state = 'grow'; p.t = 0; p.px = p.x; p.py = p.y; p.pz = p.z; p.q.setFromAxisAngle(Y, p.yaw); p.scale = 0; moving++;
        if (reducedMotion) { rest(p); continue; }
        write(p);
      } else if (p.state === 'grow') {
        moving++;
        p.scale = Math.min(1, p.t / L.grow);
        if (p.scale >= 1) rest(p); else write(p);
      }
    }
  }
  reset();
  return {
    group, update, reset, list,
    info: () => ({ count: list.length, cones: list.filter(p => p.kind === 'cone').length, boxes: list.filter(p => p.kind === 'box').length, flying: list.filter(p => p.state === 'fly').length, gone: list.filter(p => p.state === 'gone').length, hits, moving, drawCalls: Object.keys(meshes).length, reducedMotion: !!reducedMotion }),
    dispose() { for (const m of Object.values(meshes)) m.geometry.dispose(); material.dispose(); },
  };
}
