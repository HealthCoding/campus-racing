// 상한 차의 효과 — 벽에 박는 순간 튀는 파편, 차 상태에 따라 달라지는 연기 · 불꽃, 조각이 떨어져 나가는 순간, 고칠 때의 김(약속 3.21).
// 사용자 2026-11-21: "약간 부서지면 부서지는 이펙트랑 연기나는 것 같은것도 있으면 재밌을듯?"
//   const fx = createDamageFx(THREE, { scene });
//   매 화면: fx.update(view, pose, dt);   되돌려 놓기 · 다시 시작: fx.clear();   끝: fx.dispose();
// view: { condition: 차 상태 0~100(데미지 없는 모드에서는 늘 100), crash: 이 화면에서 벽에 박아 깎인 차 상태(%, 없으면 0), colour?: 차의 칠 색('#rrggbb', 없으면 '#1f4fb4'), speed, … }
// pose: { x, y, z, heading, course, speed, wallHit, wallX?, wallZ? } — 월드 미터. 카트의 앞 = (sin heading, cos heading), 왼쪽 = 로컬 +x.
// 내 카트에만 쓴다(상대는 데미지를 입지 않는다). 게임은 이 모듈이 없어도(못 불러와도) 돈다 — main.js 가 따로 불러온다.
//
// 보이는 것(W17, 2026-11-21):
//   1. 박는 순간(crash > 0): 닿은 곳(벽 쪽)에서 칠 조각(차 색) · 검은 플라스틱 · 쇠 조각이 튄다. 수 = 1.5 + crash × 0.85(34 % 면 30개쯤, 움직임 줄이기면 0.4 배).
//      중력으로 떨어져 길에서 튀고(조각이 생긴 때의 pose.y 가 땅), 돌면서 1 ~ 1.6초에 줄어들며 사라진다. 먼지 한 뭉치와 불티도 같이.
//      닿은 쪽: pose.wallX · wallZ 가 있으면 그곳, 없으면 박기 전 · 뒤의 차 속도 차이(벽이 차를 밀어낸 쪽)로 어림한다.
//   2. 차 상태가 70 · 40 · 15 를 아래로 넘는 순간마다: 차 색의 길쭉한 판(15 는 둘)이 뒤 옆에서 떨어져 뒤로 구른다. 단계마다 한 번 — 고쳐서 다시 올라가면 다시 걸린다.
//   3. 상태에 따른 연기(엔진 위 = 카트 로컬 (0, 0.55, −0.7), 불꽃은 (0, 0.42, −0.8)): 70~40 가는 김 · 40~15 잿빛 연기 · 15 아래 검고 짙은 연기 + 작은 불꽃(깜빡임) + 가끔 불티.
//      연기는 위 · 뒤로 빠지고 옅게 시작한다. 카메라 가까이(3 m 안)에 온 입자는 옅어지고 한 점의 크기에 상한이 있어 화면을 덮지 않는다.
//   4. 차 상태가 올라가는 동안(피트 수리): 상한 연기 대신 흰 김이 피어오른다. 100 이 되면 새로 나지 않는다.
// 그리기: 파편 InstancedMesh 하나(48) + 연기 Points(64) + 빛 Points(40) = 그리기 호출 최대 3개(빈 것은 visible = false). 매 화면 새 객체를 만들지 않는다. 그림자 없음.

const N_DEBRIS = 48, N_SMOKE = 64, N_GLOW = 40;
const STAGES = [70, 40, 15];
const ENGINE = [0, 0.5, -0.68];          // 연기가 나는 곳(카트 로컬): 엔진 핀(꼭대기 0.41, z −0.665) 바로 위 · 등받이(z −0.545) 뒤. 지시서의 (0, 0.5, −0.5) 는 등받이 속이다.
const FLAME = [0, 0.55, -0.72];          // 불꽃: 엔진 덮개 위(0.45 에 두니 덮개에 반쯤 묻혀 점으로만 보였다)
const DEFAULT_COLOUR = '#1f4fb4';
// 작은 구름의 밀도를 한 번 굽는다. 달릴 때는 점 하나에 텍스처를 한 번만 읽는다.
function makeSmokeMap(THREE) {
  const n = 64, bytes = new Uint8Array(n * n);
  const smooth = t => t * t * (3 - 2 * t);
  const hash = (x, y) => {
    let h = Math.imul(x + 39, 0x21f0aaad) ^ Math.imul(y - 11, 0x735a2d97);
    h = Math.imul(h ^ (h >>> 15), 0x21f0aaad);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };
  function noise(x, y) {
    const i = Math.floor(x), j = Math.floor(y), u = smooth(x - i), v = smooth(y - j);
    return (1 - v) * ((1 - u) * hash(i, j) + u * hash(i + 1, j))
      + v * ((1 - u) * hash(i, j + 1) + u * hash(i + 1, j + 1));
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) * 2 / n - 1, v = (y + 0.5) * 2 / n - 1;
    const billow = noise(3 * u + 2, 3 * v + 3), curl = noise(8 * u, 8 * v);
    const r = Math.hypot(u + 0.18 * (billow - 0.5), v + 0.12 * (curl - 0.5));
    const d = Math.min(1, Math.max(0, (0.88 - r + 0.35 * (billow - 0.5)) * 1.65));
    bytes[x + y * n] = Math.round(255 * smooth(d) * (0.32 + 0.55 * billow + 0.13 * curl));
  }
  const map = new THREE.DataTexture(bytes, n, n, THREE.RedFormat);
  map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return map;
}

export function createDamageFx(THREE, { scene, reducedMotion } = {}) {
  const eng = [...ENGINE], flm = [...FLAME];
  let bodyScale = 1;
  let reduce = !!reducedMotion;
  let mq = null, onMq = null;
  if (reducedMotion === undefined && typeof window !== 'undefined' && window.matchMedia) {
    try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); reduce = !!mq.matches; onMq = () => { reduce = !!mq.matches; }; mq.addEventListener?.('change', onMq); } catch { mq = null; }
  }

  // ── 풀 ──
  const pool = (n, keys) => { const p = { n, cursor: 0, alive: new Uint8Array(n) }; for (const k of keys) p[k] = new Float32Array(n); return p; };
  const PK = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'age', 'life', 's0', 's1', 'a0', 'r', 'g', 'b', 'r1', 'g1', 'b1', 'grav', 'drag', 'lift', 'flick', 'gy', 'ride', 'rin', 'lin'];   // rin: 차오르는 데 드는 몫(수명 비율), lin: 1 이면 크기가 곧게 자란다(0 이면 처음에 빨리)
  const smoke = pool(N_SMOKE, PK), glow = pool(N_GLOW, PK);
  smoke.birthX = new Float32Array(N_SMOKE); smoke.birthZ = new Float32Array(N_SMOKE);
  smoke.heat = new Float32Array(N_SMOKE);
  // 파편: 위치 · 속도 · 돌기(각, 각속도) · 크기(세 축) · 땅 높이 · 색
  const deb = pool(N_DEBRIS, ['x', 'y', 'z', 'vx', 'vy', 'vz', 'ax', 'ay', 'az', 'wx', 'wy', 'wz', 'sx', 'sy', 'sz', 'gy', 'age', 'life', 'r', 'g', 'b', 'big', 'rest']);
  let spawned = false;
  const take = p => {
    spawned = true;
    // 빈 칸을 먼저 찾고, 없으면 가장 오래된 것(커서 자리)을 덮어쓴다
    let i = p.cursor;
    for (let k = 0; k < p.n; k++) { const j = (p.cursor + k) % p.n; if (!p.alive[j]) { i = j; break; } }
    p.cursor = (i + 1) % p.n; p.alive[i] = 1; p.age[i] = 0; return i;
  };
  const takeP = p => { const i = take(p); p.grav[i] = 0; p.drag[i] = 0; p.lift[i] = 0; p.flick[i] = 0; p.ride[i] = 0; p.rin[i] = 0.1; p.lin[i] = 0; p.r1[i] = p.r[i] = 1; p.g1[i] = p.g[i] = 1; p.b1[i] = p.b[i] = 1; return i; };

  function takeSmoke() {
    const i = takeP(smoke);
    smoke.birthX[i] = cvx; smoke.birthZ[i] = cvz; smoke.heat[i] = 0;
    return i;
  }

  // ── 그리기 묶음 ──
  // uScale: 화면 높이 기준 크기 환산, uMax: 한 점의 최대 크기(픽셀), uNear: 이보다 카메라에 가까우면 옅어진다(m)
  const smokeMap = makeSmokeMap(THREE);
  const night = !!scene?.getObjectByName('course-night-lamps');
  const look = new URLSearchParams(globalThis.location?.search).get('fxLook');
  const rim = look === 'r2a' ? 0.42 : look === 'r2c' ? 0.92 : 0.68;
  const vert = `attribute vec4 tint; attribute float size; uniform float uScale; uniform float uMax; uniform float uNear; varying vec4 vTint;
    #ifdef DAMAGE_GLOW
      attribute vec4 trail; varying vec2 vAxis; varying float vFlame;
    #endif
    #ifdef DAMAGE_SMOKE
      attribute vec2 cloudShape; varying vec2 vTurn;
    #endif
    #ifdef NIGHT_SOOT
      uniform vec3 moon; varying vec2 vRim;
    #endif
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(0.05, -mv.z);
      #ifdef DAMAGE_SMOKE
        vTurn = vec2(cos(cloudShape.x), sin(cloudShape.x));
      #endif
      #ifdef NIGHT_SOOT
        vRim = (mat3(viewMatrix) * moon).xy * vec2(1.0, -1.0) * cloudShape.y;
      #endif
      gl_PointSize = clamp(size * uScale / d, 1.0, uMax);
      #ifdef DAMAGE_GLOW
        vec3 vel = mat3(modelViewMatrix) * trail.xyz;
        vec2 screen = vel.xy + mv.xy * vel.z / d;
        vAxis = length(screen) > 0.001 ? normalize(vec2(screen.x, -screen.y)) : vec2(0.0, -1.0);
        vFlame = trail.w;
      #endif
      vTint = vec4(tint.rgb, tint.a * smoothstep(uNear * 0.35, uNear, d)); }`;
  const smokeFrag = `uniform sampler2D cloud; varying vec4 vTint; varying vec2 vTurn;
    #ifdef NIGHT_SOOT
      varying vec2 vRim;
    #endif
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      vec2 uv = mat2(vTurn.x, -vTurn.y, vTurn.y, vTurn.x) * p * 0.5 + 0.5;
      float density = texture2D(cloud, uv).r;
      vec3 colour = vTint.rgb * (0.90 + 0.14 * density);
      #ifdef NIGHT_SOOT
        float edge = max(0.0, dot(p, vRim)) * max(0.0, 1.0 - 1.65 * density);
        colour += vec3(0.70, 0.82, 1.0) * edge;
      #endif
      gl_FragColor = vec4(colour, vTint.a * density);
    }`;
  const glowFrag = `varying vec4 vTint; varying vec2 vAxis; varying float vFlame;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float along = dot(p, vAxis), side = dot(p, vec2(-vAxis.y, vAxis.x));
      float t = clamp(0.5 + 0.5 * along, 0.0, 1.0);
      float head = smoothstep(-0.94, -0.31, along);
      float tip = 1.0 - smoothstep(0.34, 1.0, along);
      float bend = 0.28 * t * (1.0 - 1.8 * t);
      side += vFlame * bend;
      float width = mix(0.08 + 0.14 * t, 0.54 * (1.0 - t) * head + 0.07, vFlame);
      float radial = abs(side) / width;
      float taper = mix(t * tip, head * tip, vFlame);
      float fringe = max(0.0, 1.0 - 0.36 * radial);
      float body = taper * (1.0 - smoothstep(0.0, 1.22, radial));
      vec3 hot = mix(vec3(1.55, 0.78, 0.28), vec3(2.4, 0.66, 0.09), vFlame);
      hot += vFlame * vec3(0.85, 0.69, 0.18) * body * (1.0 - t);
      gl_FragColor = vec4(vTint.rgb * hot, vTint.a * (body + 0.27 * taper * fringe * fringe));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  const v2 = new THREE.Vector2();
  function makePoints(n, frag, additive, order, maxFrac, near) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { uScale: { value: 500 }, uMax: { value: 300 }, uNear: { value: near } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const obj = new THREE.Points(geo, mat);
    obj.frustumCulled = false; obj.renderOrder = order; obj.visible = false;
    obj.onBeforeRender = (renderer, _s, camera) => { renderer.getDrawingBufferSize(v2); mat.uniforms.uScale.value = v2.y * camera.projectionMatrix.elements[5] * 0.5; mat.uniforms.uMax.value = v2.y * maxFrac; };
    return obj;
  }
  const smokeObj = makePoints(N_SMOKE, smokeFrag, false, 2, 0.16, 2.4); smokeObj.name = 'damage-fx-smoke';
  smokeObj.material.defines = { DAMAGE_SMOKE: 1 };
  smokeObj.material.uniforms.cloud = { value: smokeMap };
  const shapeSize = night ? 2 : 1;
  smokeObj.geometry.setAttribute('cloudShape', new THREE.BufferAttribute(new Float32Array(N_SMOKE * shapeSize), shapeSize).setUsage(THREE.DynamicDrawUsage));
  if (night) {
    // 얇은 검댕의 달 쪽 면에만 하늘빛이 걸린다. 김과 충돌 먼지는 첫 판의 명암을 쓴다.
    const sun = scene.children.find(o => o.isDirectionalLight);
    const moon = new THREE.Vector3(0, 1, 0);
    if (sun) moon.subVectors(sun.position, sun.target.position).normalize();
    smokeObj.material.defines.NIGHT_SOOT = 1;
    smokeObj.material.uniforms.moon = { value: moon };
  }
  const glowObj = makePoints(N_GLOW, glowFrag, true, 3, 0.06, 1.2); glowObj.name = 'damage-fx-glow';
  glowObj.material.defines = { DAMAGE_GLOW: 1 };
  glowObj.geometry.setAttribute('trail', new THREE.BufferAttribute(new Float32Array(N_GLOW * 4), 4).setUsage(THREE.DynamicDrawUsage));
  // 버클이 잡힌 도장 판. 비스듬한 깨진 끝과 접힌 한 귀가 돌 때 달빛을 받는다.
  const debGeo = new THREE.BoxGeometry(1, 1, 1);
  const corners = debGeo.attributes.position;
  for (let i = 0; i < corners.count; i++) {
    const x = corners.getX(i), y = corners.getY(i), z = corners.getZ(i), tip = x > 0 && z > 0;
    corners.setXYZ(i, x + (tip ? -0.37 : 0), y + (tip ? 1.25 : 0), z + (x > 0 && z < 0 ? 0.32 : 0));
  }
  debGeo.computeVertexNormals();
  const debMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.25 });
  const debObj = new THREE.InstancedMesh(debGeo, debMat, N_DEBRIS);
  debObj.name = 'damage-fx-debris'; debObj.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debObj.setColorAt(0, new THREE.Color(1, 1, 1)); debObj.instanceColor.setUsage(THREE.DynamicDrawUsage);
  debObj.count = 0; debObj.visible = false; debObj.frustumCulled = false; debObj.castShadow = false; debObj.receiveShadow = false;
  const root = new THREE.Group(); root.name = 'damage-fx'; root.add(debObj, smokeObj, glowObj);
  scene?.add(root);

  // ── 상태 ──
  const st = { synced: false, prevCond: 100, pvx: 0, pvz: 0, hasVel: false, pend: 0, pendAge: -1, prex: 0, prez: 0, mendT: 0, smokeAcc: 0, fireAcc: 0, sparkAcc: 0, steamAcc: 0, time: 0, stage: 'fine',
    dropped: [false, false, false], crashes: 0, drops: 0, panels: 0, chips: 0, colour: '' };
  const paint = new THREE.Color(DEFAULT_COLOUR), tmpC = new THREE.Color(), dummy = new THREE.Object3D();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const num = (v, d) => { const n = +v; return Number.isFinite(n) ? n : d; };
  const W = { x: 0, y: 0, z: 0 };
  let cvx = 0, cvz = 0, px = 0, py = 0, pz = 0, Fx = 0, Fz = 1, Lx = 1, Lz = 0;
  const toWorld = (lx, ly, lz) => { W.x = px + Lx * lx + Fx * lz; W.y = py + ly; W.z = pz + Lz * lx + Fz * lz; return W; };

  function update(view, pose, dt) {
    view = view || {}; pose = pose || {};
    dt = clamp(num(dt, 0), 0, 0.1); st.time += dt;
    const h = num(pose.heading, 0), course = num(pose.course, h), speed = num(pose.speed, num(view.speed, 0));
    px = num(pose.x, 0); py = num(pose.y, 0); pz = num(pose.z, 0);
    Fx = Math.sin(h); Fz = Math.cos(h); Lx = Math.cos(h); Lz = -Math.sin(h);
    cvx = Math.sin(course) * speed; cvz = Math.cos(course) * speed;
    { const at = view.smokeAt, own = Array.isArray(at) && Number.isFinite(at[0] + at[1] + at[2]);   // 차량(glb)은 덮개 · 짐칸 · 적재함의 높이가 달라 main.js 가 뒤쪽 윗면을 재서 준다
      // 뒤쪽 윗면까지의 거리로 효과 크기만 완만하게 바꾼다.
      bodyScale = own ? clamp(Math.sqrt(Math.abs(at[2]) / 0.68), 0.70, 1.68) : 1;
      eng[0] = own ? at[0] : ENGINE[0]; eng[1] = own ? at[1] + 0.06 : ENGINE[1]; eng[2] = own ? at[2] : ENGINE[2];
      flm[0] = own ? at[0] : FLAME[0]; flm[1] = own ? at[1] + 0.1 : FLAME[1]; flm[2] = own ? at[2] - 0.03 : FLAME[2]; }
    if (typeof view.colour === 'string' && view.colour !== st.colour) { st.colour = view.colour; paint.set(/^#[0-9a-f]{6}$/i.test(view.colour) ? view.colour : DEFAULT_COLOUR); }
    // 떠 있는 것을 먼저 움직이고 새것은 그 뒤에 지금 자리에 만든다(거꾸로 하면 ride 몫 때문에 새 입자가 한 화면만큼 앞 — 시속 70 km 에서 0.33 m — 에 생겨 차체 속에 묻혔다)
    const active = counts.smoke + counts.glow + counts.debris > 0;
    if (active) step(dt);
    spawned = false;
    const cond = clamp(num(view.condition, 100), 0, 100);

    // 다시 시작 · 처음: 단계 기억을 지금 상태에 맞춘다(아무것도 떨어지지 않는다)
    if (!st.synced) { for (let k = 0; k < 3; k++) st.dropped[k] = cond < STAGES[k]; st.prevCond = cond; st.synced = true; }

    // 1. 박는 순간
    // 벽의 방향은 모른다(pose.wallX · wallZ 가 없으면) → 박기 전과 뒤의 차 속도 차이(Δv)로 어림한다: 벽 안쪽 성분이 깎이고 조금 튕겨서 Δv 는 대체로 벽에서 나오는 쪽이다.
    // 화면용 자세는 틱 사이를 보간하므로 박은 화면에는 Δv 가 덜 보일 수 있다 → 1 m/s 가 안 되면 두 화면까지 기다린다(눈에 안 띄는 30 ms).
    const crash = num(view.crash, 0);
    if (!st.hasVel) { st.pvx = cvx; st.pvz = cvz; st.hasVel = true; }
    if (crash > 0) { st.crashes++; st.pend = Math.min(40, st.pend + crash); if (st.pendAge < 0) { st.pendAge = 0; st.prex = st.pvx; st.prez = st.pvz; } }
    if (st.pend > 0) {
      const dvx = cvx - st.prex, dvz = cvz - st.prez, dv = Math.hypot(dvx, dvz);
      if (dv > 1 || st.pendAge >= 2 || Number.isFinite(num(pose.wallX, NaN))) { crashBurst(st.pend, pose, dv > 0.3 ? dvx / dv : NaN, dv > 0.3 ? dvz / dv : NaN); st.pend = 0; st.pendAge = -1; }
      else st.pendAge++;
    }
    st.pvx = cvx; st.pvz = cvz;

    // 2. 단계를 아래로 넘는 순간: 큰 조각(15 는 둘). 고쳐서 다시 올라가면 다시 걸린다.
    for (let k = 0; k < 3; k++) {
      if (!st.dropped[k] && cond < STAGES[k]) { st.dropped[k] = true; st.drops++; const n = k === 2 ? 2 : 1; for (let j = 0; j < n; j++) dropPanel(j); }
      else if (st.dropped[k] && cond >= STAGES[k]) st.dropped[k] = false;
    }

    // 4. 고치는 중(차 상태가 오른다): 0.3초 동안 이어진 것으로 본다. 한 번에 크게 오른 것(다시 시작 · 직접 넣기)은 고침이 아니다.
    const rise = cond - st.prevCond;
    if (rise > 0.0005 && rise < 25 && cond < 100) st.mendT = 0.3; else if (cond >= 100 || rise >= 25) st.mendT = 0; else st.mendT = Math.max(0, st.mendT - dt);
    st.prevCond = cond;
    const mending = st.mendT > 0;

    // 3. 상태에 따른 연기 · 불꽃(고치는 동안은 흰 김으로 바뀐다)
    const m = reduce ? 0.5 : 1;
    st.stage = mending ? 'mend' : cond >= 70 ? 'fine' : cond >= 40 ? 'steam' : cond >= 15 ? 'smoke' : 'fire';
    if (mending) {
      st.steamAcc += 14 * m * dt; while (st.steamAcc >= 1) { st.steamAcc -= 1; spawnSteam(); }
      st.smokeAcc = st.fireAcc = st.sparkAcc = 0;
    } else {
      st.steamAcc = 0;
      if (st.stage === 'fine') st.smokeAcc = 0;
      else {
        const rate = st.stage === 'steam' ? 7 : st.stage === 'smoke' ? 8 + 6 * (40 - cond) / 25 : 17;
        st.smokeAcc += rate * m * dt; while (st.smokeAcc >= 1) { st.smokeAcc -= 1; spawnDamageSmoke(st.stage, cond); }
      }
      if (st.stage === 'fire') {
        st.fireAcc += (reduce ? 10 : 26) * dt; while (st.fireAcc >= 1) { st.fireAcc -= 1; spawnFlame(); }
        st.sparkAcc += (reduce ? 0.6 : 1.8) * dt; while (st.sparkAcc >= 1) { st.sparkAcc -= 1; const n = reduce ? 1 : 2 + (Math.random() * 3 | 0); for (let j = 0; j < n; j++) spawnEngineSpark(); }
      } else st.fireAcc = st.sparkAcc = 0;
    }

    if (active || spawned) write();
  }

  // ── 만들기 ──
  // nx, nz: 벽에서 나오는 쪽의 어림(Δv 방향, 모르면 NaN)
  function crashBurst(crash, pose, nx, nz) {
    // 닿은 곳과 튀는 방향(벽에서 멀어지는 쪽): wallX · wallZ 가 있으면 그것, 없으면 Δv 방향 → 그것도 없으면 박기 전 진행의 반대 → 카트 뒤.
    // 닿은 곳 = 카트 가운데에서 벽 쪽으로 충돌 원 반지름(0.8 m)쯤. 처음에는 앞 모서리에 두었는데, 비스듬히 박으면 모서리가 벽 너머에 있어 조각이 벽 너머 잔디에 떨어졌다.
    let hx, hz, ox, oz;
    const wx = num(pose.wallX, NaN), wz = num(pose.wallZ, NaN);
    if (Number.isFinite(wx) && Number.isFinite(wz)) {
      hx = wx; hz = wz; ox = px - wx; oz = pz - wz; const d = Math.hypot(ox, oz); if (d > 1e-3) { ox /= d; oz /= d; } else { ox = -Fx; oz = -Fz; }
    } else {
      if (!Number.isFinite(nx) || !Number.isFinite(nz)) { const s = Math.hypot(st.prex, st.prez); if (s > 1) { nx = -st.prex / s; nz = -st.prez / s; } else { nx = -Fx; nz = -Fz; } }
      ox = nx; oz = nz; hx = px - ox * 0.72 * bodyScale; hz = pz - oz * 0.72 * bodyScale;
    }
    // 물려받는 차의 속도에서 벽 쪽으로 들어가는 성분은 뺀다(벽을 뚫고 넘어가지 않게 — 2026-11-21 첫 그림에서 조각이 벽 너머 잔디로 날아갔다)
    const into = cvx * ox + cvz * oz, tvx = into < 0 ? cvx - into * ox : cvx, tvz = into < 0 ? cvz - into * oz : cvz;
    const k = clamp(crash / 34, 0.06, 1.2);
    const n = Math.max(1, Math.round((1.5 + crash * 0.85) * (reduce ? 0.4 : 1)));
    for (let j = 0; j < n; j++) {
      const i = take(deb), kind = Math.random(), sp = rnd(1.2, 3.2) * (0.6 + 0.6 * k);
      deb.x[i] = hx + rnd(-0.12, 0.12); deb.y[i] = py + rnd(0.2, 0.5) * bodyScale; deb.z[i] = hz + rnd(-0.12, 0.12); deb.gy[i] = py;
      deb.vx[i] = tvx * rnd(0.3, 0.6) + ox * sp + Fx * rnd(-0.8, 1.2) + rnd(-0.6, 0.6);
      deb.vz[i] = tvz * rnd(0.3, 0.6) + oz * sp + Fz * rnd(-0.8, 1.2) + rnd(-0.6, 0.6);
      deb.vy[i] = rnd(1.6, 3.6) * (0.75 + 0.35 * k);
      const s = rnd(0.044, 0.105) * (0.85 + 0.3 * k) * bodyScale;
      // 칠은 얇게 일어나고, 금속은 가늘게, 검은 플라스틱은 짧게 부러진다.
      deb.sx[i] = s * (kind < 0.5 ? 0.85 : kind < 0.8 ? 0.64 : 1.10);
      deb.sz[i] = s * rnd(0.20, 0.70) * (kind > 0.8 ? 0.54 : 1);
      deb.sy[i] = rnd(0.006, 0.013);
      deb.ax[i] = rnd(0, 6.28); deb.ay[i] = rnd(0, 6.28); deb.az[i] = rnd(0, 6.28);
      deb.wx[i] = rnd(-16, 16); deb.wy[i] = rnd(-10, 10); deb.wz[i] = rnd(-16, 16);
      deb.life[i] = rnd(1.0, 1.6); deb.big[i] = 0; deb.rest[i] = 0;
      // 칠 조각(차 색, 반쯤) · 검은 플라스틱 · 쇠
      if (kind < 0.5) tmpC.copy(paint).multiplyScalar(rnd(0.85, 1.1)); else if (kind < 0.8) tmpC.setRGB(0.035, 0.035, 0.04); else { const g = rnd(0.42, 0.6); tmpC.setRGB(g, g, g * 1.04); }
      deb.r[i] = tmpC.r; deb.g[i] = tmpC.g; deb.b[i] = tmpC.b;
      st.chips++;
    }
    // 먼지 한 뭉치
    const dust = Math.max(1, Math.round((2 + crash / 6) * (reduce ? 0.5 : 1)));
    for (let j = 0; j < dust; j++) {
      const i = takeSmoke(); smoke.x[i] = hx + rnd(-0.2, 0.2); smoke.y[i] = py + rnd(0.15, 0.4); smoke.z[i] = hz + rnd(-0.2, 0.2);
      smoke.vx[i] = tvx * 0.3 + ox * rnd(0.4, 1.4) + rnd(-0.4, 0.4); smoke.vz[i] = tvz * 0.3 + oz * rnd(0.4, 1.4) + rnd(-0.4, 0.4); smoke.vy[i] = rnd(0.3, 0.8);
      smoke.life[i] = rnd(0.6, 1.0); smoke.s0[i] = rnd(0.3, 0.45); smoke.s1[i] = rnd(1.1, 1.6) * (0.8 + 0.3 * k); smoke.a0[i] = rnd(0.24, 0.35);
      const tone = rnd(0.52, 0.63) * (night ? 0.21 : 1); smoke.r[i] = tone; smoke.g[i] = tone * 0.97; smoke.b[i] = tone * 0.92; smoke.drag[i] = 3; smoke.lift[i] = 0.2;
    }
    // 불티
    const sparks = Math.max(1, Math.round((3 + crash / 3) * (reduce ? 0.4 : 1)));
    for (let j = 0; j < sparks; j++) {
      const i = takeP(glow); glow.x[i] = hx; glow.y[i] = py + rnd(0.2, 0.45); glow.z[i] = hz; glow.gy[i] = py;
      const a = Math.random() * Math.PI * 2, sp = rnd(2, 5.5);
      glow.vx[i] = tvx * 0.5 + ox * 1.5 + Math.cos(a) * sp; glow.vz[i] = tvz * 0.5 + oz * 1.5 + Math.sin(a) * sp; glow.vy[i] = rnd(1, 4);
      glow.life[i] = rnd(0.25, 0.5); glow.s0[i] = rnd(0.07, 0.1); glow.s1[i] = 0.03; glow.a0[i] = 1; glow.grav[i] = 9.8;
      glow.r[i] = 1; glow.g[i] = 0.78; glow.b[i] = 0.42; glow.r1[i] = 1; glow.g1[i] = 0.38; glow.b1[i] = 0.1;
    }
  }
  // 떨어져 나가는 큰 조각: 차 색의 길쭉한 판. 뒤 옆에서 떨어져 옆으로 밀려나고, 차 속도를 거의 지닌 채 떨어진 뒤 길에 끌려 뒤로 구른다
  // (처음에 차 속도의 0.55 배만 주었더니 0.2초 만에 카메라 밑으로 지나가 화면 아래 큰 덩어리로만 보였다).
  function dropPanel(j) {
    const side = (j % 2 === 0) === (Math.random() < 0.5) ? 1 : -1;
    const p = toWorld(side * rnd(0.47, 0.61) * bodyScale, Math.min(1.25, eng[1] * rnd(0.48, 0.75)), eng[2] * rnd(0.65, 1.12));
    const i = take(deb);
    deb.x[i] = p.x; deb.y[i] = p.y; deb.z[i] = p.z; deb.gy[i] = py;
    deb.vx[i] = cvx * rnd(0.88, 0.95) + Lx * side * rnd(0.8, 1.6); deb.vz[i] = cvz * rnd(0.88, 0.95) + Lz * side * rnd(0.6, 1.5); deb.vy[i] = rnd(1.2, 2.2);
    deb.sx[i] = rnd(0.26, 0.36) * bodyScale; deb.sz[i] = rnd(0.1, 0.15) * bodyScale; deb.sy[i] = 0.025;
    deb.ax[i] = rnd(-0.4, 0.4); deb.ay[i] = Math.atan2(Fx, Fz) + rnd(-0.6, 0.6); deb.az[i] = rnd(-0.4, 0.4);
    deb.wx[i] = rnd(6, 11) * (Math.random() < 0.5 ? -1 : 1); deb.wy[i] = rnd(-4, 4); deb.wz[i] = rnd(-6, 6);
    deb.life[i] = rnd(2.0, 2.6); deb.big[i] = 1; deb.rest[i] = 0;
    tmpC.copy(paint).multiplyScalar(rnd(0.8, 0.95)); deb.r[i] = tmpC.r; deb.g[i] = tmpC.g; deb.b[i] = tmpC.b;
    st.panels++;
  }
  // 엔진 연기: 단계에 따라 색 · 양 · 크기. 위 · 뒤로 빠지고 옅게 시작한다(카트를 가리지 않게).
  function spawnDamageSmoke(stage, cond) {
    const i = takeSmoke(), p = toWorld(eng[0] + rnd(-0.12, 0.12), eng[1], eng[2] + rnd(-0.06, 0.06));
    smoke.x[i] = p.x; smoke.y[i] = p.y; smoke.z[i] = p.z;
    // 처음엔 덮개 쪽을 따라가고, 연기가 자라면서 바람에 밀리는 길이가 보인다.
    smoke.ride[i] = 0.965; smoke.rin[i] = 0.13; smoke.lin[i] = 1;
    smoke.vx[i] = -Fx * rnd(0.2, 0.5) + rnd(-0.2, 0.2); smoke.vz[i] = -Fz * rnd(0.2, 0.5) + rnd(-0.2, 0.2);
    if (stage === 'steam') {          // 가늘고 옅은 김
      smoke.vy[i] = rnd(1.5, 2.0); smoke.life[i] = rnd(0.8, 1.1); smoke.s0[i] = rnd(0.08, 0.12); smoke.s1[i] = rnd(0.65, 0.9); smoke.a0[i] = rnd(0.55, 0.66); smoke.rin[i] = 0.18;
      const g = rnd(0.9, 0.96); smoke.r[i] = g; smoke.g[i] = g; smoke.b[i] = g * 1.02; smoke.drag[i] = 1.2; smoke.lift[i] = 0.4;
    } else if (stage === 'smoke') {   // 잿빛 연기(낮을수록 짙다)
      const hurt = clamp((40 - cond) / 25, 0, 1);
      smoke.vy[i] = rnd(1.8, 2.3); smoke.life[i] = rnd(0.9, 1.3); smoke.s0[i] = rnd(0.1, 0.14); smoke.s1[i] = rnd(1.0, 1.3) * (1 + 0.15 * hurt) * (reduce ? 0.85 : 1); smoke.a0[i] = rnd(0.62, 0.72) + 0.1 * hurt;
      const g = rnd(0.38, 0.52) - 0.12 * hurt; smoke.r[i] = g; smoke.g[i] = g; smoke.b[i] = g * 1.02; smoke.drag[i] = 1.0; smoke.lift[i] = 0.5;
    } else {                          // 검고 짙은 연기
      smoke.vy[i] = rnd(2.0, 2.6); smoke.life[i] = rnd(1.0, 1.4); smoke.s0[i] = rnd(0.12, 0.16); smoke.s1[i] = rnd(1.2, 1.5) * (reduce ? 0.85 : 1); smoke.a0[i] = rnd(0.85, 0.95);
      const g = rnd(0.1, 0.17); smoke.r[i] = g; smoke.g[i] = g * 0.97; smoke.b[i] = g * 0.95; smoke.drag[i] = 1.0; smoke.lift[i] = 0.5;
    }
    const breeze = Math.min(1, Math.hypot(cvx, cvz) / 24);
    const curl = Math.sin(st.time * 6.4) * (0.09 + 0.23 * breeze);
    smoke.vx[i] += Lx * curl; smoke.vz[i] += Lz * curl;
    smoke.heat[i] = stage === 'fire' ? 0.18 : 0;
    smoke.s0[i] *= 1.12 * bodyScale;
    smoke.s1[i] *= Math.sqrt(bodyScale);
    // 밤의 김에는 달빛만 남긴다. 열원은 따로 그리는 불꽃이다.
    const shade = night ? (stage === 'fire' ? 0.46 : 0.30) : 1;
    smoke.r[i] *= shade; smoke.g[i] *= shade; smoke.b[i] *= shade * (night ? 1.12 : 1);
    smoke.vy[i] *= Math.sqrt(bodyScale) * (1 - 0.22 * breeze);
  }
  // 엔진 자리의 작은 불꽃: 카트를 따라다니며 짧게 깜빡인다(움직임 줄이기면 깜빡이지 않는다)
  function spawnFlame() {
    const i = takeP(glow), p = toWorld(flm[0] + rnd(-0.09, 0.09), flm[1] + rnd(0, 0.05), flm[2] + rnd(-0.05, 0.05));
    glow.x[i] = p.x; glow.y[i] = p.y; glow.z[i] = p.z; glow.gy[i] = py;
    glow.ride[i] = 1; glow.vx[i] = 0; glow.vz[i] = 0; glow.vy[i] = rnd(0.4, 0.9);
    glow.life[i] = rnd(0.14, 0.22); glow.s0[i] = rnd(0.25, 0.34) * Math.sqrt(bodyScale); glow.s1[i] = 0.16 * Math.sqrt(bodyScale); glow.a0[i] = reduce ? 0.65 : rnd(0.55, 0.8);
    glow.flick[i] = reduce ? 0 : 1;
    glow.r[i] = 1; glow.g[i] = 0.82; glow.b[i] = 0.42; glow.r1[i] = 0.95; glow.g1[i] = 0.25; glow.b1[i] = 0.05;
  }
  function spawnEngineSpark() {
    const i = takeP(glow), p = toWorld(flm[0] + rnd(-0.1, 0.1), flm[1] + 0.05, flm[2]);
    glow.x[i] = p.x; glow.y[i] = p.y; glow.z[i] = p.z; glow.gy[i] = py;
    const a = Math.random() * Math.PI * 2, sp = rnd(0.6, 1.8);
    glow.vx[i] = cvx * 0.85 - Fx * rnd(0.5, 1.5) + Math.cos(a) * sp; glow.vz[i] = cvz * 0.85 - Fz * rnd(0.5, 1.5) + Math.sin(a) * sp; glow.vy[i] = rnd(1.5, 3);
    glow.life[i] = rnd(0.3, 0.5); glow.s0[i] = rnd(0.06, 0.08); glow.s1[i] = 0.025; glow.a0[i] = 1; glow.grav[i] = 9.8;
    glow.r[i] = 1; glow.g[i] = 0.82; glow.b[i] = 0.45; glow.r1[i] = 1; glow.g1[i] = 0.4; glow.b1[i] = 0.1;
  }
  // 고치는 동안의 흰 김: 거의 곧게 위로 피어오른다(차는 서 있다)
  function spawnSteam() {
    const i = takeSmoke();
    const p = toWorld(eng[0] + rnd(-0.16, 0.16) * bodyScale, eng[1] + rnd(-0.02, 0.07), eng[2] + rnd(-0.20, 0.26) * bodyScale);
    smoke.x[i] = p.x; smoke.y[i] = p.y; smoke.z[i] = p.z;
    smoke.ride[i] = 0.94; smoke.vx[i] = rnd(-0.3, 0.3); smoke.vz[i] = rnd(-0.3, 0.3); smoke.vy[i] = rnd(1.0, 1.45) * Math.sqrt(bodyScale);
    smoke.life[i] = rnd(0.9, 1.3); smoke.s0[i] = rnd(0.18, 0.25); smoke.s1[i] = rnd(0.94, 1.30) * Math.sqrt(bodyScale); smoke.a0[i] = rnd(0.3, 0.38);
    const g = rnd(0.95, 1) * (night ? 0.35 : 1); smoke.r[i] = g; smoke.g[i] = g; smoke.b[i] = g; smoke.drag[i] = 1.8; smoke.lift[i] = 0.35;
  }

  // ── 움직이기 ──
  function stepPoints(p, dt) {
    for (let i = 0; i < p.n; i++) {
      if (!p.alive[i]) continue;
      p.age[i] += dt; if (p.age[i] >= p.life[i]) { p.alive[i] = 0; continue; }
      if (p.drag[i]) { const f = Math.exp(-p.drag[i] * dt); p.vx[i] *= f; p.vy[i] *= f; p.vz[i] *= f; }
      p.vy[i] += (p.lift[i] - p.grav[i]) * dt;
      let windX = cvx, windZ = cvz, ride = p.ride[i];
      if (p === smoke && ride) {
        // 갓 나온 김만 차를 따라간다. 오래된 연기는 코너에서도 원래 날던 쪽에 남는다.
        const release = Math.min(1, p.age[i] * 1.6);
        windX += release * (smoke.birthX[i] - cvx); windZ += release * (smoke.birthZ[i] - cvz);
        ride *= 1 - 0.062 * release;
      }
      p.x[i] += (p.vx[i] + ride * windX) * dt; p.y[i] += p.vy[i] * dt; p.z[i] += (p.vz[i] + ride * windZ) * dt;
      if (p.grav[i] && p.y[i] < p.gy[i] + 0.01) { p.y[i] = p.gy[i] + 0.01; p.vy[i] *= -0.35; p.vx[i] *= 0.6; p.vz[i] *= 0.6; }
    }
  }
  function step(dt) {
    stepPoints(smoke, dt); stepPoints(glow, dt);
    const air = Math.exp(-0.25 * dt);
    for (let i = 0; i < N_DEBRIS; i++) {
      if (!deb.alive[i]) continue;
      deb.age[i] += dt; if (deb.age[i] >= deb.life[i]) { deb.alive[i] = 0; continue; }
      const floor = deb.gy[i] + deb.sy[i] * 0.5 + 0.005;
      if (deb.rest[i]) {
        // 땅 위: 미끄러지며 선다. 큰 조각은 덜 붙잡혀 구르듯 간다.
        const f = Math.exp(-(deb.big[i] ? 2.2 : 4.5) * dt); deb.vx[i] *= f; deb.vz[i] *= f; deb.y[i] = floor;
        const spin = Math.exp(-(deb.big[i] ? 1.6 : 5) * dt); deb.wx[i] *= spin; deb.wy[i] *= spin; deb.wz[i] *= spin;
        if (!deb.big[i]) { deb.ax[i] *= Math.exp(-6 * dt); deb.az[i] *= Math.exp(-6 * dt); }   // 작은 조각은 납작하게 눕는다
      } else {
        deb.vx[i] *= air; deb.vz[i] *= air; deb.vy[i] -= 9.8 * dt;
      }
      deb.x[i] += deb.vx[i] * dt; deb.y[i] += deb.vy[i] * dt; deb.z[i] += deb.vz[i] * dt;
      deb.ax[i] += deb.wx[i] * dt; deb.ay[i] += deb.wy[i] * dt; deb.az[i] += deb.wz[i] * dt;
      if (!deb.rest[i] && deb.y[i] < floor) {
        deb.y[i] = floor;
        if (deb.vy[i] < -1.2) { deb.vy[i] *= -0.32; deb.vx[i] *= 0.6; deb.vz[i] *= 0.6; deb.wx[i] *= 0.55; deb.wz[i] *= 0.55; }   // 한 번 튄다
        else { deb.vy[i] = 0; deb.rest[i] = 1; }
      }
    }
  }

  // ── 그리기 버퍼에 쓰기 ──
  const counts = { debris: 0, smoke: 0, glow: 0 };
  function write() {
    // 파편: 살아 있는 것만 앞에서부터 채운다. 끝 0.3초에 줄어들며 사라진다.
    let n = 0;
    for (let i = 0; i < N_DEBRIS; i++) {
      if (!deb.alive[i]) continue;
      const left = deb.life[i] - deb.age[i], k = left < 0.3 ? left / 0.3 : 1;
      dummy.position.set(deb.x[i], deb.y[i], deb.z[i]);
      dummy.rotation.set(deb.ax[i], deb.ay[i], deb.az[i]);
      dummy.scale.set(deb.sx[i] * k, deb.sy[i] * Math.max(0.3, k), deb.sz[i] * k);
      dummy.updateMatrix(); debObj.setMatrixAt(n, dummy.matrix);
      tmpC.setRGB(deb.r[i], deb.g[i], deb.b[i]); debObj.setColorAt(n, tmpC); n++;
    }
    debObj.count = n; debObj.visible = n > 0; counts.debris = n;
    if (n > 0) { debObj.instanceMatrix.needsUpdate = true; debObj.instanceColor.needsUpdate = true; }
    // 연기
    {
      const A = smokeObj.geometry.attributes, P = A.position.array, T = A.tint.array, S = A.size.array; let c = 0;
      for (let i = 0; i < N_SMOKE; i++) {
        if (!smoke.alive[i]) continue; const t = smoke.age[i] / smoke.life[i];
        A.cloudShape.array[c * shapeSize] = i * 2.39996 + t * ((i % 7) - 3) * 0.23;
        if (night) A.cloudShape.array[c * shapeSize + 1] = smoke.heat[i] > 0 ? rim : 0;
        const size = smoke.s0[i] + (smoke.s1[i] - smoke.s0[i]) * (smoke.lin[i] ? t : 1 - (1 - t) * (1 - t));
        P[c * 3] = smoke.x[i]; P[c * 3 + 1] = smoke.y[i]; P[c * 3 + 2] = smoke.z[i];
        const warm = smoke.heat[i] * Math.max(0, 1 - t * 4) ** 2;
        T[c * 4] = smoke.r[i] + warm; T[c * 4 + 1] = smoke.g[i] + warm * 0.24; T[c * 4 + 2] = smoke.b[i];
        T[c * 4 + 3] = smoke.a0[i] * Math.min(1, t / smoke.rin[i]) * (1 - t);   // 옅게 시작해 차오른 뒤 사라진다
        S[c] = size; c++;
      }
      if (c) A.cloudShape.needsUpdate = true;
      finish(smokeObj, c); counts.smoke = c;
    }
    // 빛(불꽃 · 불티)
    {
      const A = glowObj.geometry.attributes, P = A.position.array, T = A.tint.array, S = A.size.array; let c = 0;
      for (let i = 0; i < N_GLOW; i++) {
        if (!glow.alive[i]) continue; const t = glow.age[i] / glow.life[i];
        const fl = glow.flick[i] ? 0.7 + 0.3 * Math.sin(st.time * 47 + i * 2.3) : 1;
        P[c * 3] = glow.x[i]; P[c * 3 + 1] = glow.y[i]; P[c * 3 + 2] = glow.z[i];
        T[c * 4] = glow.r[i] + (glow.r1[i] - glow.r[i]) * t; T[c * 4 + 1] = glow.g[i] + (glow.g1[i] - glow.g[i]) * t; T[c * 4 + 2] = glow.b[i] + (glow.b1[i] - glow.b[i]) * t;
        T[c * 4 + 3] = glow.a0[i] * (1 - t * t) * fl;
        const flame = !glow.grav[i], trail = A.trail.array;
        // 따라오는 카메라에서 보이는 불티의 이동 방향. 불꽃은 덮개 주변의 옆바람을 받는다.
        const gust = ((i % 5) - 2) * 0.15;
        trail[c * 4] = flame ? -Fx * 0.33 + Lx * gust : glow.vx[i] - cvx * 0.78;
        trail[c * 4 + 1] = glow.vy[i];
        trail[c * 4 + 2] = flame ? -Fz * 0.33 + Lz * gust : glow.vz[i] - cvz * 0.78;
        trail[c * 4 + 3] = flame ? 1 : 0;
        S[c] = (glow.s0[i] + (glow.s1[i] - glow.s0[i]) * t) * fl * (flame ? 0.88 : (1.35 - 0.55 * t) * (0.75 + (i % 5) * 0.10)); c++;
      }
      if (c) A.trail.needsUpdate = true;
      finish(glowObj, c); counts.glow = c;
    }
  }
  function finish(obj, n) {
    const a = obj.geometry.attributes;
    if (n > 0) a.position.needsUpdate = a.tint.needsUpdate = a.size.needsUpdate = true;
    obj.geometry.setDrawRange(0, n); obj.visible = n > 0;
  }

  return {
    update,
    group: root,
    stats: () => ({ ...counts, particles: counts.debris + counts.smoke + counts.glow, max: N_DEBRIS + N_SMOKE + N_GLOW, maxDebris: N_DEBRIS, maxSmoke: N_SMOKE, maxGlow: N_GLOW,
      drawCalls: (debObj.visible ? 1 : 0) + (smokeObj.visible ? 1 : 0) + (glowObj.visible ? 1 : 0),
      stage: st.stage, crashes: st.crashes, chips: st.chips, drops: st.drops, panels: st.panels, reducedMotion: reduce }),
    setReducedMotion(on) { reduce = !!on; },
    // 떠 있는 것을 다 지우고, 다음 화면의 차 상태에 단계 기억을 맞춘다(다시 시작 뒤에 조각이 또 떨어지지 않게)
    clear() {
      smoke.alive.fill(0); glow.alive.fill(0); deb.alive.fill(0);
      st.synced = false; st.hasVel = false; st.pend = 0; st.pendAge = -1; st.mendT = 0; st.smokeAcc = st.fireAcc = st.sparkAcc = st.steamAcc = 0; st.stage = 'fine';
      write();
    },
    dispose() {
      try { mq?.removeEventListener?.('change', onMq); } catch {}
      root.removeFromParent();
      smokeMap.dispose();
      smokeObj.geometry.dispose(); smokeObj.material.dispose(); glowObj.geometry.dispose(); glowObj.material.dispose();
      debGeo.dispose(); debMat.dispose(); debObj.dispose?.();
    },
  };
}
