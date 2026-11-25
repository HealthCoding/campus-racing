// 내 카트의 입자 효과 — 드리프트 타이어 연기와 자국 · 드리프트 불꽃 · 속도 줄무늬 · 벽 불티(약속 3.9).
//   const fx = createKartEffects(THREE, { scene });
//   매 화면: fx.update(view, pose, dt);   끝: fx.dispose();
// view: 카트 모델과 같은 것 + 있으면 gauge(0~100, 없으면 드리프트 길이로 어림) · stock(모아 둔 칸 수) · slots(칸 수)
//   · boostKind('item' | 'kick' | 'start' | 'pad', 없으면 'item') · kickReady(드리프트 직후 '다시 밟기'를 받는 동안 true).
//   kickReady 동안 배기구에 푸른 후광이 생긴다. 배기구 안쪽 빛과 분사 불꽃은 model.js 에서 카트마다 그린다.
//   게이지가 100 이 되어 한 칸으로 바뀌는 순간(stock 이 늘 때) 뒷바퀴에서 불티가 한 번 터지고, 불꽃 밝기는 천천히 내려온다.
// pose: { x, y, z, heading, course, wallHit } 월드 미터. 있으면 wallX · wallZ(닿은 곳)도 쓴다.
//   있으면 landed: 땅에 닿은 화면에서만 > 0(부딪힌 수직 속도 m/s). 1.5 이상이면 네 바퀴 둘레에 먼지(연기 풀을 같이 쓴다, 세기 비례). 없으면 예전과 같다.
// 입자는 풀에서 돌려 쓴다: 연기 48 · 빛 32 · 줄 40 = 최대 120개, 그리기 호출 최대 3개(빈 묶음은 그리지 않음).
// 불꽃은 게이지가 찰수록 밝고 많아진다(빛깔은 그대로, 단계로 색을 바꾸지 않음).
import { KART_POINTS } from './model.js';
import { BOOST_IGNITION_TIME, boostStyleOf, getBoostLook } from './boost-style.js';

const N_SMOKE = 48, N_GLOW = 32, N_LINE = 40;
const MARK_STEP = .10;   // 자국을 잇는 시간 간격(s)
const LOOKS = {
  r2a: { smoke: .80, jet: .88 },
  r2b: { smoke: 1, jet: 1 },
  r2c: { smoke: 1.16, jet: 1.12 },
};
// 길이와 색은 모델의 JETS. 여기서는 불꽃 어깨의 폭과 허리 모양을 정한다.
const JET_PROFILE = {
  item: { width: 1.05, waist: .04 }, kick: { width: .74, waist: .16 },
  start: { width: 1.30, waist: .08 }, pad: { width: .96, waist: .46 },
};

// 같은 줄 풀 안의 뒤쪽 속도선, 바퀴 불티, 종이, 깃털, 노면빛.
const WAKE = 3, EMBER = 4, PAPER = 5, SPILL = 7;
const EMISSION = {
  item:  { amount: 1,   width: 1,    reach: 1 },
  kick:  { amount: .42, width: .63,  reach: .50 },
  start: { amount: 1.4, width: 1.38, reach: .78 },
  pad:   { amount: .78, width: .92,  reach: .88 },
};
const BOOST_LOOKS = {
  a: { soot: .72, sheets: 1, interval: 1.60, volts: .74 },
  b: { soot: 1,   sheets: 1, interval:  .94, volts: 1 },
  c: { soot: 1.2, sheets: 2, interval:  .78, volts: 1.27 },
};

// 연기 네 장을 작은 단일 질감에 굽는다. 미세한 결은 한 번만 계산하고 화면에서는 한 번 읽는다.
function makeVapourAtlas(THREE) {
  const cell = 56, data = new Uint8Array(cell * cell * 4 * 2);
  const smooth = t => t * t * (3 - 2 * t);
  const hash = (x, y) => {
    let h = Math.imul(x + 37, 374761393) + Math.imul(y + 61, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  function noise(x, y) {
    const i = Math.floor(x), j = Math.floor(y), u = smooth(x - i), v = smooth(y - j);
    const top = hash(i, j) * (1 - u) + hash(i + 1, j) * u;
    return top * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
  }
  for (let tile = 0; tile < 4; tile++) {
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const u = (x + .5) / cell * 2 - 1, v = (y + .5) / cell * 2 - 1;
      const a = u * 2 + tile * 11, b = v * 3;
      const wisps = .54 * noise(a, b) + .31 * noise(2.4*a, 2.4*b) + .15 * noise(5*a, 5*b);
      const edge = Math.max(0, 1 - u*u - 1.5*v*v);
      const density = smooth(edge) * Math.max(0, .20 + (wisps - .32) * 2.95);
      const i = 2 * ((tile >> 1) * cell * cell * 2 + y * cell * 2 + (tile % 2) * cell + x);
      data[i] = Math.min(255, density * 255);
      data[i + 1] = (0.48 + wisps * .48) * 255;
    }
  }
  const texture = new THREE.DataTexture(data, cell * 2, cell * 2, THREE.RGFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// manifest를 재는 GLB 마디에서 위치를 읽는다. 진열 배율(size=game)도 따라간다.
function kartMounts(model) {
  const wheel = name => model?.getObjectByName(name)?.position;
  const scale = model?.scale.x || 1;
  // 두 바퀴(바퀴가 한 줄 — wheelRL · steerFL 만 있다)는 그 바퀴 하나의 타이어 양 가장자리(±3 cm)를 두 자리로 쓴다 — 연기 · 자국이 한 줄로 겹친다.
  const pair = (l, r, fallback) => l && r ? [l,r].map(v => [v.x * scale, v.z * scale])
    : l && Math.abs(l.x) < .05 ? [[(l.x + .03) * scale, l.z * scale], [(l.x - .03) * scale, l.z * scale]] : fallback;
  let rear = pair(wheel('wheelRL'), wheel('wheelRR'), KART_POINTS.rearWheels);
  let front = pair(wheel('steerFL'), wheel('steerFR'), rear.map(([x,z]) => [x, -z]));
  if (rear[0][1] > front[0][1]) [rear, front] = [front, rear];
  const left = wheel('exhaustL'), right = wheel('exhaustR');
  const exhaust = left && right ? [left,right].map(v => [v.x*scale, v.y*scale, v.z*scale]) : KART_POINTS.exhausts;
  const hub = wheel((wheel('wheelRL')?.z || 0) > 0 ? 'steerFL' : 'wheelRL');
  return { rear, front, exhaust, scale, radius: hub?.y * scale || .165 };
}

// 양쪽 불꽃의 중심은 각각의 배기구다. 옆 배기는 처음에만 바퀴를 비키고 뒤로 뻗는다.
function dressJet(THREE, mesh, mounts) {
  const material = mesh?.material;
  if (!material?.isMeshBasicMaterial || mesh.geometry.getAttribute('color')?.itemSize !== 4) return null;
  const positions = mesh.geometry.getAttribute('position');
  const axes = new Float32Array(positions.count);
  let plume = 0;
  for (let i = 0; i < axes.length; i++) {
    // makeTwinFlames가 바깥·속심 순으로 짓는 각 분사의 시작 고리는 z=0이다.
    if (i && positions.getZ(i) === 0 && positions.getZ(i-1) < 0) plume++;
    axes[i] = mounts.exhaust[plume % 2][0] / mounts.scale;
  }
  mesh.geometry.setAttribute('jetAxis', new THREE.BufferAttribute(axes, 1));
  const [x, , z] = mounts.exhaust[0], [axleX, axleZ] = mounts.rear[0];
  const side = z > axleZ && Math.abs(x) > Math.abs(axleX)*.88;
  const elbow = side ? .85 * mounts.radius / mounts.scale : .035;
  const reach = side ? (z - axleZ + .50 * mounts.radius) / mounts.scale : 0;
  const shape = { value: new THREE.Vector4(1, 0, 1, 1) };
  const route = { value: new THREE.Vector2(elbow, 0) };
  const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
  const baseKey = cacheKey.call(material);
  material.customProgramCacheKey = () => baseKey + '/campus-jet-r2';
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.uJetShape = shape;
    shader.uniforms.uJetRoute = route;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float jetAxis; uniform vec4 uJetShape; uniform vec2 uJetRoute;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float t = clamp(-position.z, 0., 1.);
        float dir = sign(jetAxis);
        float waist = max(0., 1.-abs(t-.43)*4.4);
        float width = uJetShape.x * (1.-uJetShape.y*waist);
        float bend = smoothstep(0., .34, t);
        transformed.x = jetAxis + (position.x-jetAxis-dir*.047*t)*width + dir*(uJetRoute.x*bend + .025*t);
        transformed.y = (position.y-.09*t*t)*width + .045*t*t;
        transformed.z = -(t + uJetRoute.y*bend) * uJetShape.z;
        float core = smoothstep(.82, .99, color.a);
        vColor.rgb *= (1.08+.92*core)*(.83+.17*uJetShape.w);
        vColor.a *= mix(.59*(1.-.67*t), .98, core)*uJetShape.w;`);
  };
  material.needsUpdate = true;
  return {
    set(kind, look, flash, tail) {
      const profile = Object.hasOwn(JET_PROFILE, kind) ? JET_PROFILE[kind] : JET_PROFILE.item;
      const width = profile.width * look * (.72 + .28*tail) * (1 + .21*flash);
      shape.value.set(width, profile.waist, look * (.36 + .64*tail), tail * (1 + .38*flash));
      route.value.y = reach / Math.max(.05, mesh.scale.z);
    },
    restore() {
      mesh.geometry.deleteAttribute('jetAxis');
      material.onBeforeCompile = compile; material.customProgramCacheKey = cacheKey; material.needsUpdate = true;
    },
  };
}

// probe(시험용): 부스터 입자가 태어날 때마다 차 기준의 자리 · 속도를 알려 준다 — { pool, x, y, z, lateral, back }.
export function createKartEffects(THREE, { scene, reducedMotion, probe } = {}) {
  const choice = new URLSearchParams(globalThis.location?.search).get('fxLook');
  const look = Object.hasOwn(LOOKS, choice) ? LOOKS[choice] : LOOKS.r2b;
  const boostLook = getBoostLook(), tuning = BOOST_LOOKS[boostLook] || BOOST_LOOKS.b;
  let reduce = !!reducedMotion;
  let mq = null, onMq = null;
  if (reducedMotion === undefined && typeof window !== 'undefined' && window.matchMedia) {
    mq = window.matchMedia('(prefers-reduced-motion: reduce)'); reduce = mq.matches;
    onMq = () => { reduce = mq.matches; }; mq.addEventListener?.('change', onMq);
  }

  // ── 풀 ──
  const pool = (n, extra = []) => {
    const p = { n, cursor: 0, alive: new Uint8Array(n), boost: new Uint8Array(n) };
    for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'age', 'life', 's0', 's1', 'a0', 'r', 'g', 'b', 'r1', 'g1', 'b1', 'grav', 'drag', 'lift', ...extra]) p[k] = new Float32Array(n);
    return p;
  };
  const smoke = pool(N_SMOKE, ['floor', 'cinder']), glow = pool(N_GLOW), line = pool(N_LINE, ['kind', 'dx', 'dy', 'dz', 'startInk', 'endInk', 'floor']);
  let spillSlot = -1;
  const take = p => {
    let i = p.cursor;
    // 점화·접촉·드리프트가 한 프레임에 겹쳐도 노면에 붙인 한 칸은 소등까지 고정.
    if (p === line && i === spillSlot) i = (i + 1) % p.n;
    p.cursor = (i + 1) % p.n;
    p.alive[i] = 1; p.boost[i] = 0; p.age[i] = 0; p.grav[i] = 0; p.drag[i] = 0; p.lift[i] = 0;
    return i;
  };
  const takeBoost = p => { const i = take(p); p.boost[i] = 1; return i; };

  // ── 그리기 묶음 ──
  const vert = `attribute vec4 tint; attribute float size; uniform float uScale; varying vec4 vTint;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = max(1.0, size * uScale / max(0.05, -mv.z)); vTint = tint; }`;
  const vapourMap = makeVapourAtlas(THREE);
  const smokeVert = vert.replace('varying vec4 vTint;', 'varying vec4 vTint; attribute vec2 cloud; varying vec2 vCell; varying vec3 vFloor;')
    .replace('vTint = tint;', 'vTint = tint; vCell = vec2(mod(cloud.x, 2.0), floor(cloud.x * .5)); vFloor = vec3(cloud.y, viewMatrix[1][0], viewMatrix[1][1]);');
  const smokeFrag = `uniform sampler2D uAtlas; varying vec2 vCell; varying vec3 vFloor; varying vec4 vTint;
    void main() {
      if (vCell.y > 1.5) {
        vec2 p = gl_PointCoord*2.-1.;
        gl_FragColor = vec4(vTint.rgb, vTint.a * max(0.,1.-dot(p,p)));
        return;
      }
      vec2 mask = texture2D(uAtlas, (vCell + gl_PointCoord) * .5).rg;
      float height = vFloor.x + (gl_PointCoord.x-.5)*vFloor.y - (gl_PointCoord.y-.5)*vFloor.z;
      gl_FragColor = vec4(vTint.rgb * mask.g, vTint.a * mask.r * smoothstep(.05,.33,height));
    }`;
  const glowFrag = `varying vec4 vTint; void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float r = dot(p, p); if (r > 1.0) discard;
      float a = 1.-r; gl_FragColor = vec4(vTint.rgb, a*a*a*vTint.a); }`;
  const v2 = new THREE.Vector2();
  function makePoints(n, frag, additive, order) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { uScale: { value: 500 } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const obj = new THREE.Points(geo, mat);
    obj.frustumCulled = false; obj.renderOrder = order; obj.visible = false;
    obj.onBeforeRender = (renderer, _s, camera) => { renderer.getDrawingBufferSize(v2); mat.uniforms.uScale.value = v2.y * camera.projectionMatrix.elements[5] * 0.5; };
    return obj;
  }
  const smokeObj = makePoints(N_SMOKE, smokeFrag, false, 2); smokeObj.name = 'kart-fx-smoke';
  smokeObj.material.vertexShader = smokeVert;
  smokeObj.material.uniforms.uAtlas = { value: vapourMap };
  smokeObj.geometry.setAttribute('cloud', new THREE.Float32BufferAttribute(new Float32Array(N_SMOKE * 2), 2).setUsage(THREE.DynamicDrawUsage));
  const glowObj = makePoints(N_GLOW, glowFrag, true, 3); glowObj.name = 'kart-fx-glow';
  // 불티와 고무 자국은 같은 얇은 띠 묶음. 검은 자국은 알파, 빛은 더하기로 합성한다.
  const lineGeo = new THREE.BufferGeometry();
  const ribbonAttr = (name, size) => {
    const attr = new THREE.BufferAttribute(new Float32Array(N_LINE * 4 * size), size);
    lineGeo.setAttribute(name, attr.setUsage(THREE.DynamicDrawUsage));
    return attr.array;
  };
  const heads = ribbonAttr('position', 3), axes = ribbonAttr('axis', 3);
  const inks = ribbonAttr('tint', 4), widths = ribbonAttr('span', 1);
  const uv = [], indices = [];
  for (let i = 0; i < N_LINE; i++) {
    const j = i * 4; uv.push(-1,0, 1,0, -1,1, 1,1);
    indices.push(j,j+1,j+2, j+2,j+1,j+3);
  }
  lineGeo.setIndex(indices); lineGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const lineMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `attribute vec3 axis; attribute vec4 tint; attribute float span;
      varying vec4 vInk; varying vec2 vStroke;
      void main() {
        vec3 p = position + uv.y * axis;
        if (span < 0.) p += uv.x * -span * vec3(-axis.z, 0., axis.x) / max(.001,length(axis.xz));
        vec4 mv = modelViewMatrix * vec4(p,1.);
        if (span >= 0.) {
          vec3 d = mat3(modelViewMatrix) * axis;
          vec2 tangent = d.xy - mv.xy * d.z / min(-.01,mv.z);
          mv.xy += uv.x * span * vec2(-tangent.y,tangent.x) / max(.001,length(tangent));
        }
        gl_Position = projectionMatrix * mv; vInk = tint; vStroke = uv;
      }`,
    fragmentShader: `varying vec4 vInk; varying vec2 vStroke;
      void main() {
        // 음수 알파는 노면에 눕힌 한 장. 출력 알파 0이면 기존 노면 색에 빛만 더한다.
        if (vInk.a < 0.) {
          vec2 p = vec2(vStroke.x, 2.*vStroke.y-1.);
          float falloff = max(0., 1.-dot(p,p));
          gl_FragColor = vec4(vInk.rgb * falloff * falloff, 0.);
          return;
        }
        if (vInk.a > 0. && vInk.r > 0.) {
          // 종이의 접힌 면(노면 자국도 같은 알파 혼합이지만 RGB는 0).
          float fold = .74 + .26*smoothstep(-.1,.1,vStroke.x + .45*vStroke.y);
          gl_FragColor = vec4(vInk.rgb * fold, vInk.a);
          return;
        }
        float across = 1. - smoothstep(.38,1.,abs(vStroke.x));
        gl_FragColor = vInk * across;
      }`,
  });
  const lineObj = new THREE.Mesh(lineGeo,lineMat); lineObj.name = 'kart-fx-lines';
  lineObj.frustumCulled = false; lineObj.renderOrder = 3; lineObj.visible = false;
  const root = new THREE.Group(); root.name = 'kart-effects'; root.add(smokeObj, glowObj, lineObj);
  scene?.add(root);

  // ── 상태 ──
  const st = { smokeAcc: [0, 0], glowAcc: [0, 0], sparkAcc: 0, lineAcc: 0, pilotAcc: 0, prevBoost: 0, prevKick: false, prevStock: null, gShown: 0, wallCool: 0, gaugeEst: 0, time: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const W = { x: 0, y: 0, z: 0 };
  let cvxNow = 0, cvzNow = 0, px = 0, py = 0, pz = 0, Fx = 0, Fz = 1, Lx = 1, Lz = 0;
  const toWorld = (lx, ly, lz) => { W.x = px + Lx * lx + Fx * lz; W.y = py + ly + pitch * lz - roll * lx; W.z = pz + Lz * lx + Fz * lz; return W; };

  let model = null, mounts = kartMounts(null), pitch = 0, roll = 0;
  let jet = null, burnAge = 0, previousKind = '', driftTime = 0, hangTime = 0;
  let boostStyle = boostStyleOf(null, boostLook), origins = mounts.exhaust, rearEdge = 0, rearWidth = 0, wakeX = 0;
  let wakeClock = 0, sparkClock = 0, puffClock = 0, sheetClock = 0, sideIndex = 0;
  let sheetTurn = -1;   // 종이는 왼쪽 · 오른쪽을 번갈아(부스트가 바뀌어도 이어서). 첫 장의 쪽은 첫 종이 때 정한다
  let lastReduce = reduce;
  const rim = new THREE.Color(), padRim = new THREE.Color('#38f6df');
  const dark = !!scene?.getObjectByName('course-night-lamps');
  const previous = [null,null], newestMark = [-1,-1];
  let markClock = 0;
  function update(view = {}, pose = {}, dt = 1 / 60) {
    dt = clamp(dt || 0, 0, 0.1); st.time += dt;
    const h = +pose.heading || 0, course = pose.course ?? h;
    px = +pose.x || 0; py = +pose.y || 0; pz = +pose.z || 0;
    // 메인이 이 자세에 놓은 자기 차만 찾는다. 갈아입었을 때만 마디를 다시 읽는다.
    if (scene && (!model || model.parent !== scene || model.position.x !== px || model.position.z !== pz)) {
      const next = scene.children.find(o => o.name === 'kart' && o.visible && o.position.x === px && o.position.z === pz);
      if (next !== model) {
        jet?.restore(); model = next; mounts = kartMounts(model);
        boostStyle = boostStyleOf(model?.userData.vehicleId, boostLook);
        jet = boostStyle.family === 'legacy' ? dressJet(THREE, model?.getObjectByName('flames'), mounts) : null;
        const s = mounts.scale;
        origins = model?.userData.boostOrigins?.map(([x,y,z]) => [x*s,y*s,z*s]) || mounts.exhaust;
        rearEdge = Math.min(mounts.rear[0][1] - mounts.radius * 1.4, mounts.exhaust[0][2]);
        rearWidth = Math.abs(mounts.rear[0][0]) + mounts.radius * .48;
        // 양옆 줄은 뒷바퀴 안쪽 자리에서, 차체 폭 안(폭/2 − 5 cm)에서 태어난다(가까운 카메라의 원근에도 차 옆으로 번져 보이지 않게).
        const half = (model?.userData.boostHalfWidth || 0) * s, wheelX = Math.abs(mounts.rear[0][0]) * .8;
        wakeX = half ? Math.min(wheelX, half - .05 * s) : wheelX;
        if (boostStyle.family !== 'legacy') rim.set(boostStyle.rim);
        clearBoostFlight(); previousKind = ''; st.prevBoost = 0;
      }
    }
    if (reduce && !lastReduce) clearBoostFlight();
    lastReduce = reduce;
    pitch = Math.sin(view.pitch || 0); roll = Math.sin(view.roll || 0);
    Fx = Math.sin(h); Fz = Math.cos(h); Lx = Math.cos(h); Lz = -Math.sin(h);     // F = 앞, L = 로컬 +x(왼쪽)
    const speed = +view.speed || 0, v = Math.abs(speed), slip = +view.slip || 0, boost = +view.boost || 0;
    const grounded = view.grounded !== false, drifting = !!view.drifting && grounded;
    cvxNow = Math.sin(course) * speed; cvzNow = Math.cos(course) * speed;         // 카트의 실제 속도
    const m = reduce ? 0.4 : 1;
    if (boost > 0 && jet) {
      const kind = view.boostKind || 'item';
      if (st.prevBoost <= 0 || kind !== previousKind) burnAge = 0;
      const opening = reduce ? 0 : Math.max(0, 1 - burnAge / .13);
      const tail = clamp(boost / .17, 0, 1);
      jet.set(kind, look.jet, opening * opening, tail * tail * (3 - 2 * tail));
      burnAge += dt; previousKind = kind;
    }
    if (!grounded) hangTime = Math.max(hangTime + dt, pose.air || 0);

    // 게이지: 있으면 그것, 없으면 물리 식(조작감 보고 2절)으로 어림
    if (drifting && v > 5) st.gaugeEst = Math.min(100, st.gaugeEst + 32 * clamp((Math.abs(slip) * 57.3 - 8) / 20, 0, 1) * clamp(v / 6.5, 0, 1) * dt);
    if (boost > 0 && !(st.prevBoost > 0)) st.gaugeEst = 0;
    // 칸이 꽉 차 있으면 최대로. 게이지가 칸으로 바뀌며 0 으로 돌아가도 불꽃이 한 번에 꺼지지 않게 0.35초에 걸쳐 내려온다.
    const stock = Number.isFinite(view.stock) ? view.stock : null, slotsFull = stock !== null && Number.isFinite(view.slots) && view.slots > 0 && stock >= view.slots;
    const gNow = slotsFull ? 1 : clamp((view.gauge ?? st.gaugeEst) / 100, 0, 1);
    st.gShown = gNow >= st.gShown ? gNow : Math.max(gNow, st.gShown - dt / 0.35);
    const g = st.gShown;
    const earned = stock !== null && st.prevStock !== null && stock > st.prevStock; st.prevStock = stock;

    // 1. 드리프트: 뒷바퀴 연기 · 바퀴 밑 빛 · 불꽃
    if (drifting && v > 2) {
      if (!driftTime) st.smokeAcc.fill(.85);
      driftTime = Math.min(3, driftTime + dt);
      const age = driftTime / 3, heat = age * age * (3 - 2 * age);
      markClock += dt;
      if (markClock >= MARK_STEP) {
        for (let k = 0; k < 2; k++) {
          const [x,z] = mounts.rear[k], p = toWorld(x, .032, z);
          const prev = previous[k], span = prev ? Math.hypot(p.x-prev.x, p.z-prev.z) : 0;
          if (prev && span > .03 && span < 4) {
            const i = take(line);
            line.x[i] = p.x; line.y[i] = p.y; line.z[i] = p.z;
            line.dx[i] = prev.x-p.x; line.dy[i] = prev.y-p.y; line.dz[i] = prev.z-p.z;
            line.vx[i] = line.vy[i] = line.vz[i] = 0;
            const last = newestMark[k];
            if (last >= 0 && line.alive[last] && line.kind[last] === 2) line.startInk[last] = 1;
            line.endInk[i] = last < 0 ? 0 : 1; line.startInk[i] = .12; newestMark[k] = i;
            line.life[i] = .68; line.kind[i] = 2; line.a0[i] = .37 + .30 * heat;
          }
          previous[k] ??= {x:0,y:0,z:0}; Object.assign(previous[k],p);
        }
        markClock %= MARK_STEP;
      }
      const dirSide = slip < 0 ? 1 : -1;                                          // 오른쪽 드리프트(slip<0)면 꼬리가 왼쪽(+x)으로 흐른다
      mounts.rear.forEach(([wx, wz], k) => {
        const outer = Math.sign(wx) === dirSide ? 1 : 0.6;                        // 바깥 바퀴가 더 많이
        st.smokeAcc[k] += (15.0 + 4.5 * heat) * m * outer * clamp(v / 8, 0.4, 1) * dt;
        while (st.smokeAcc[k] >= 1) { st.smokeAcc[k] -= 1; spawnSmoke(wx, wz, heat, dirSide); }
        st.glowAcc[k] += (g > 0.05 ? 25 : 0) * outer * (reduce ? 0.6 : 1) * dt;
        while (st.glowAcc[k] >= 1) { st.glowAcc[k] -= 1; spawnWheelGlow(wx, wz, g); }
      });
      st.sparkAcc += (g > 0.08 ? 5 + 23 * g : 0) * m * dt;
      while (st.sparkAcc >= 1) { st.sparkAcc -= 1; const [wx, wz] = mounts.rear[Math.random() < 0.65 ? (dirSide > 0 ? 0 : 1) : (dirSide > 0 ? 1 : 0)]; spawnSpark(wx, wz, g); }
    } else { driftTime = 0; previous.fill(null); newestMark.fill(-1); markClock = 0; st.smokeAcc[0] = st.smokeAcc[1] = st.glowAcc[0] = st.glowAcc[1] = st.sparkAcc = 0; }
    // 한 칸을 얻은 순간: 뒷바퀴 두 곳에서 불티가 한 번(빛 풀은 쓰지 않고 줄 풀만)
    if (earned && v > 1) {
      if (boostStyle.shape === 'casters') {
        if (grounded && !reduce) for (let j = 0; j < 4; j++) boostSpark(rim, false);
      } else for (let j = 0; j < (reduce ? 4 : 10); j++) {
        const [wx, wz] = mounts.rear[j % 2]; spawnSpark(wx, wz, 1);
      }
    }

    // 1-2. 드리프트 직후 '다시 밟기'를 받는 동안: 두 배기구에 푸른 불씨(켜지는 순간 조금 크게)
    const kickReady = !!view.kickReady && !(boost > 0);
    if (kickReady) {
      const n = boostStyle.family === 'legacy' ? 2 : origins.length;
      if (!st.prevKick) for (let k = 0; k < n; k++) spawnPilot(k, true);
      st.pilotAcc += (reduce ? 24 : 44) * n * dt;
      while (st.pilotAcc >= 1) { st.pilotAcc -= 1; spawnPilot(Math.floor(Math.random()*n), false); }
    } else st.pilotAcc = 0;
    st.prevKick = kickReady;

    // (상한 차의 연기 · 불꽃 · 파편은 damage-fx.js 가 맡는다 — 약속 3.21. 여기 있던 40 아래의 엔진 연기는 2026-11-21 그쪽으로 옮겼다.)

    // 2. 순간 가속 속도 줄무늬. 짧은 kick 은 모델의 불꽃만 보인다.
    if (boostStyle.family === 'legacy' && boost > 0 && view.boostKind !== 'kick' && !reduce) {
      st.lineAcc += 18 * dt;
      while (st.lineAcc >= 1) { st.lineAcc -= 1; spawnSpeedLine(course); }
    } else st.lineAcc = 0;

    // 3. 벽: 첫 마찰에서 불티. 접촉 신호가 떨려도 0.15초에 한 번만.
    st.wallCool -= dt;
    if (pose.wallHit && st.wallCool <= 0 && v > 1.5) { wallBurst(pose, Math.round((reduce ? 3 : 8) * clamp(v / 10, 0.5, 1.2))); st.wallCool = 0.15; }

    // 4. 착지: 네 바퀴 둘레에 낮게 퍼지는 먼지
    const landed = +pose.landed || 0;
    if (landed >= 1.5) {
      landDust(landed);
      if (landed > 4.8) for (const [x,z] of mounts.rear) {
        // 큰 충격의 작은 불씨 두 알은 먼지와 같은 호출로 그린다.
        const i = take(smoke), p = toWorld(x,.07,z);
        smoke.x[i] = p.x; smoke.y[i] = p.y; smoke.z[i] = p.z;
        smoke.floor[i] = p.y; smoke.cinder[i] = 1;
        smoke.vx[i] = cvxNow*.49 + Math.sign(x)*Lx; smoke.vz[i] = cvzNow*.49 + Math.sign(x)*Lz;
        smoke.vy[i] = rnd(.8,1.4); smoke.grav[i] = 5;
        smoke.life[i] = rnd(.19,.25); smoke.s0[i] = .085; smoke.s1[i] = .035;
        smoke.r[i] = 3.8; smoke.g[i] = 1.4; smoke.b[i] = .27; smoke.a0[i] = .95;
      }
    }

    if (grounded) hangTime = 0;
    step(dt);
    // 이미 지나간 dt만큼 새 입자를 전진시키면 첫 화면에서 차체 속에 파묻힌다.
    if (boostStyle.family !== 'legacy') updateBoost(view, boost, grounded, dt);
    if (probe) reportBirths();
    st.prevBoost = boost;
    write();
  }

  function reportBirths() {
    for (const [name, p] of [['smoke', smoke], ['glow', glow], ['line', line]]) {
      for (let i = 0; i < p.n; i++) {
        if (!p.alive[i] || !p.boost[i] || p.age[i] !== 0 || (p === line && line.kind[i] === SPILL)) continue;
        const dx = p.x[i] - px, dz = p.z[i] - pz, vx = p.vx[i] - cvxNow, vz = p.vz[i] - cvzNow;
        probe({ pool: name, paper: p === line && line.kind[i] === PAPER, x: dx * Lx + dz * Lz, y: p.y[i] - py, z: dx * Fx + dz * Fz,
          lateral: vx * Lx + vz * Lz, back: -(vx * Fx + vz * Fz) });
      }
    }
  }

  function clearBoostFlight() {
    for (const p of [smoke, glow, line]) {
      for (let i = 0; i < p.n; i++) if (p.boost[i]) p.alive[i] = 0;
    }
    wakeClock = sparkClock = puffClock = sheetClock = sideIndex = 0; spillSlot = -1;
  }

  // 입자는 실제 차가 방금 지나온 곳에만 놓는다. 좌우 속도선은 같은 순간 태어나며
  // 차종의 광원/바퀴에 가까운 곳에서 갈라져, 카메라가 보는 앞길은 비워 둔다.
  function updateBoost(view, boost, grounded, dt) {
    if (boost <= 0) {
      hideSpill();
      return;
    }
    const kind = Object.hasOwn(EMISSION, view.boostKind) ? view.boostKind : 'item';
    const profile = EMISSION[kind], colour = kind === 'pad' ? padRim : rim;
    const { family, shape } = boostStyle;
    const opening = st.prevBoost <= 0 || previousKind !== kind;
    if (opening) {
      wakeClock = sparkClock = puffClock = sheetClock = sideIndex = 0;
      burnAge = 0;
    }
    previousKind = kind;
    // 배기가 없는 차에는 낮은 전기/마찰광만.
    const lightAge = shape === 'diesel' && !reduce ? burnAge - BOOST_IGNITION_TIME : burnAge;
    if (dark && grounded) {
      const flash = reduce || shape === 'casters' ? 0 : Math.max(0, 1 - lightAge / .15);
      const tail = reduce ? 1 : clamp(boost / .12, 0, 1);
      updateSpill(colour, profile, flash * flash, lightAge < 0 ? 0 : tail);
    } else hideSpill();
    burnAge += dt;
    if (reduce) return;

    const mechanical = shape === 'casters' || shape === 'scrape';
    const atGround = !mechanical || grounded;
    const drawsWake = atGround && lightAge >= 0 && shape !== 'casters';
    const grit = shape === 'backfire' || shape === 'arc' || mechanical;
    const dust = shape === 'pipe', puffs = family === 'diesel' || dust;
    const sheets = shape === 'casters' || shape === 'hopper';
    const electric = family === 'electric';
    if (opening) {
      if (atGround && (family === 'gasoline' || family === 'electric')) {
        for (const e of origins) ignite(e, colour, profile, shape === 'oval');
      }
      if (puffs && (!dust || grounded)) {
        const amount = dust ? 2 : Math.round(4 * boostStyle.radius / .28);
        for (let n = 0; n < Math.max(1, Math.round(amount * profile.amount)); n++) boostPuff(n, dust, true);
      }
      if (grit && atGround) for (let n = 0; n < Math.round(5*profile.amount); n++) boostSpark(colour, electric);
      if (sheets) {
        const count = kind === 'kick' ? 1 : tuning.sheets;
        for (let n = 0; n < count; n++) launchSheet(n, shape);
      }
      if (kind !== 'kick' && drawsWake) wakePair(colour, profile);
    }
    if (kind === 'kick') return;
    // 새로 태어나는 것만 줄여 손상 경고의 솟는 연기와 부스터의 낮은 매연이 따로 남게 한다.
    const hurt = view.condition < 40 ? .60 : 1;
    if (puffs && (!dust || grounded)) {
      puffClock += dt * profile.amount * hurt * (dust ? 5 : 8);
      while (puffClock >= 1) { puffClock--; boostPuff(sideIndex++, dust, false); }
    }
    if (grit && atGround) {
      sparkClock += dt * profile.amount * (mechanical ? 19 : electric ? 16 : 10);
      while (sparkClock >= 1) { sparkClock--; boostSpark(colour, electric); }
    }
    if (sheets) {
      sheetClock += dt;
      if (sheetClock >= tuning.interval) { sheetClock %= tuning.interval; launchSheet(sideIndex++, shape); }
    }
    if (drawsWake) {
      wakeClock += dt * profile.amount * (shape === 'arc' ? 12 : 7);
      while (wakeClock >= 1) { wakeClock--; wakePair(colour, profile); }
    }
  }

  function hideSpill() {
    if (spillSlot >= 0 && line.kind[spillSlot] === SPILL) line.alive[spillSlot] = 0;
    spillSlot = -1;
  }
  function updateSpill(colour, profile, flash, tail) {
    if (spillSlot < 0 || !line.alive[spillSlot] || line.kind[spillSlot] !== SPILL) spillSlot = takeBoost(line);
    const i = spillSlot, carScale = mounts.scale;
    const x = origins.length === 1 ? origins[0][0] : 0;
    const cart = boostStyle.shape === 'casters';
    const reach = (cart ? .68 : boostStyle.family === 'gasoline' ? 2.6 : 1.85) * profile.reach * carScale;
    const p = toWorld(x, .047, rearEdge + .22 * carScale);
    line.kind[i] = SPILL; line.x[i] = p.x; line.y[i] = p.y; line.z[i] = p.z;
    line.dx[i] = -Fx * reach; line.dy[i] = -pitch * reach; line.dz[i] = -Fz * reach;
    line.vx[i] = line.vy[i] = line.vz[i] = 0; line.age[i] = 0; line.life[i] = 1;
    line.s0[i] = Math.max(.48 * carScale, rearWidth) * (1.70 + .26*flash) * profile.width;
    line.r[i] = colour.r; line.g[i] = colour.g; line.b[i] = colour.b;
    const power = boostStyle.family === 'electric' ? .21*tuning.volts
      : cart ? .035 : boostStyle.shape === 'hopper' ? .12 : .28;
    line.a0[i] = power * tail * (1 + .9*flash);
  }

  function ignite(e, colour, profile, whitePop) {
    const i = takeBoost(glow), p = toWorld(e[0], e[1], e[2] - .12 * mounts.scale);
    glow.x[i] = p.x; glow.y[i] = p.y; glow.z[i] = p.z;
    glow.vx[i] = cvxNow - Fx; glow.vy[i] = 0; glow.vz[i] = cvzNow - Fz;
    glow.life[i] = whitePop ? .10 : .14;
    glow.s0[i] = (whitePop ? 1.36 : .83) * profile.width * mounts.scale;
    glow.s1[i] = glow.s0[i] * .36;
    glow.a0[i] = boostStyle.family === 'electric' ? 1.7*tuning.volts : 1.5;
    glow.r[i] = whitePop ? 2.4 : colour.r + .24; glow.r1[i] = colour.r;
    glow.g[i] = whitePop ? 2.4 : colour.g + .24; glow.g1[i] = colour.g;
    glow.b[i] = whitePop ? 2.4 : colour.b + .24; glow.b1[i] = colour.b;
  }

  function wakePair(colour, profile) {
    const { family, shape } = boostStyle, wheel = family === 'electric';
    const length = profile.reach * rnd(.74,1.05) * mounts.scale;
    for (let k = 0; k < 2; k++) {
      const sign = k ? -1 : 1, e = origins[k % origins.length];
      const x = wheel ? e[0] : sign * wakeX * rnd(.88, 1);
      const y = wheel ? mounts.radius * .64 : .22 * mounts.scale;
      const z = wheel ? e[2] : rearEdge - .36 * mounts.scale;
      const i = takeBoost(line), p = toWorld(x, y, z);
      line.kind[i] = WAKE; line.x[i] = p.x; line.y[i] = p.y; line.z[i] = p.z;
      line.vx[i] = cvxNow*.73 - Fx*.85; line.vy[i] = 0; line.vz[i] = cvzNow*.73 - Fz*.85;
      const len = length * (shape === 'arc' ? 1.38 : 1);
      // 줄은 뒤로 흐른다 — 벌어짐은 길이의 1/8 안.
      const splay = sign * (wheel ? .035 : .12) * len;
      line.dx[i] = -Fx*len + Lx*splay; line.dy[i] = -pitch*len; line.dz[i] = -Fz*len + Lz*splay;
      line.life[i] = shape === 'arc' ? .29 : .23;
      line.s0[i] = .021 * profile.width * mounts.scale;
      line.a0[i] = wheel ? 1.25*tuning.volts : .51;
      line.r[i] = colour.r; line.g[i] = colour.g; line.b[i] = colour.b;
    }
  }

  function boostSpark(colour, electric) {
    // 가운데 출원점 하나인 차는 왼쪽 · 오른쪽을 번갈아 튄다(4차 — 좌우 대칭).
    const turn = sideIndex++, e = origins[turn % origins.length], side = Math.sign(e[0]) || (turn % 2 ? -1 : 1);
    const forklift = boostStyle.shape === 'scrape', cart = boostStyle.shape === 'casters';
    const nearFloor = forklift || cart;
    const y = nearFloor ? .055*mounts.scale : e[1];
    const i = takeBoost(line), p = toWorld(e[0], y, e[2] - .09*mounts.scale);
    line.kind[i] = EMBER; line.x[i] = p.x; line.y[i] = p.y; line.z[i] = p.z;
    line.floor[i] = p.y - y;
    // 가로 속도는 뒤로 가는 속도의 1/4 안(3차).
    const back = rnd(1.9, 4.8), out = side * back * rnd(.04, .24);
    line.vx[i] = cvxNow*.58 + Lx*out - Fx*back; line.vz[i] = cvzNow*.58 + Lz*out - Fz*back;
    line.vy[i] = nearFloor ? rnd(.45,1.6) : rnd(.6,2.1);
    // 카트 속도와 무관한 길이/방향. 정지 출발에서도 바퀴 바깥에 짧은 빛금이 튄다.
    const streak = forklift ? .10 : cart ? .055 : .071;
    line.dx[i] = (Lx*out - Fx*back)*streak; line.dy[i] = line.vy[i]*(forklift ? .082 : cart ? .034 : .058);
    line.dz[i] = (Lz*out - Fz*back)*streak;
    line.life[i] = rnd(.16,.29); line.grav[i] = 8;
    line.s0[i] = rnd(.012,.026)*mounts.scale * (forklift ? 1.8 : cart ? .95 : 1);
    line.a0[i] = electric ? tuning.volts*2 : cart ? 1.2 : 1.7;
    line.r[i] = colour.r + .20; line.g[i] = colour.g + .20; line.b[i] = colour.b + .15;
  }

  function boostPuff(n, stone, burst) {
    const e = origins[n % origins.length], s = mounts.scale, i = takeBoost(smoke);
    const p = toWorld(e[0]+rnd(-.12,.12)*s, stone ? .12*s : e[1], e[2] - rnd(.18,.42)*s);
    smoke.x[i] = p.x; smoke.y[i] = p.y; smoke.z[i] = p.z;
    smoke.floor[i] = p.y - (stone ? .12*s : e[1]); smoke.cinder[i] = 0;
    const back = rnd(1.8,3.2), out = back * rnd(-.24,.24), grey = stone ? .40 : rnd(.022,.066);
    smoke.vx[i] = cvxNow*.54 + Lx*out - Fx*back; smoke.vz[i] = cvzNow*.54 + Lz*out - Fz*back;
    smoke.vy[i] = burst ? .48 : .35; smoke.drag[i] = 1.5; smoke.lift[i] = .25;
    const size = (stone ? .66 : clamp(boostStyle.radius / .28, .9, 1.3)) * s;
    smoke.s0[i] = size * (burst ? rnd(.65,.85) : .40); smoke.s1[i] = size * (burst ? 1.50 : 1.06);
    smoke.a0[i] = (burst ? 1.0 : .76) * (stone ? .72 : tuning.soot);
    smoke.life[i] = burst ? .60 : .46;
    smoke.r[i] = grey; smoke.g[i] = grey * (stone ? .91 : 1); smoke.b[i] = grey * (stone ? .78 : 1.12);
  }

  function launchSheet(n, shape) {
    // 발판을 지난 바로 뒤 아이템을 눌러도 이미 떠 있는 영수증에 더해 두 장까지만.
    let flying = 0;
    for (let k = 0; k < N_LINE; k++) {
      if (line.alive[k] && line.kind[k] === PAPER) flying++;
    }
    if (flying >= 2) return;
    // 첫 장이 늘 같은 쪽이면 새 판마다 한쪽으로만 보인다 — 첫 장의 쪽만 무작위, 그다음은 번갈아.
    if (sheetTurn < 0) sheetTurn = Math.random() < .5 ? 0 : 1;
    n = sheetTurn++;
    const hopper = shape === 'hopper';
    const s = mounts.scale, side = n % 2 ? -1 : 1;
    // 청소차는 투입구 턱 위, 배기구보다 바깥으로 종이를 내보내 낮은 매연과 겹치지 않게 한다.
    const x = side*(hopper ? .70 : .14)*s;
    const y = (hopper ? 1.46 : .965)*s;
    const z = (hopper ? -3.32 : -.148)*s;
    const i = takeBoost(line), p = toWorld(x, y, z);
    line.kind[i] = PAPER; line.x[i] = p.x; line.y[i] = p.y; line.z[i] = p.z;
    line.floor[i] = p.y - y;
    const back = rnd(1.05,2.2), out = side * back * rnd(.12,.24);
    line.vx[i] = cvxNow*.73 + Lx*out - Fx*back; line.vz[i] = cvzNow*.73 + Lz*out - Fz*back;
    line.vy[i] = rnd(.55,.98); line.grav[i] = 2.3; line.drag[i] = .95;
    line.dx[i] = Lx*side; line.dz[i] = Lz*side; line.dy[i] = rnd(.5,1.9);
    line.s0[i] = (hopper ? .17 : .066)*s; line.s1[i] = (hopper ? .52 : .28)*s;
    line.life[i] = rnd(.56,.73); line.a0[i] = .96;
    // 종이의 선형 RGB. 접힌 면은 셰이더에서 어두워지고 일반 알파로 바탕을 덮는다.
    const shade = hopper ? (dark ? .46 : .72) * rnd(.85,1) : dark ? .30 : .72;
    line.r[i] = shade; line.g[i] = shade*(hopper ? .84 : .98); line.b[i] = shade*(hopper ? .57 : 1);
  }

  function spawnSmoke(wx, wz, heat, dirSide) {
    const i = take(smoke), side = Math.sign(wx);
    const p = toWorld(wx + side * .055 + rnd(-.03,.03), .075, wz - .06 + rnd(-.045,.045));
    smoke.x[i] = p.x; smoke.y[i] = p.y; smoke.z[i] = p.z;
    // 두 줄이 접점에서 갈라져 미끄러지는 쪽으로 번진다. 짙은 부분은 지붕 아래에 남긴다.
    const out = side * rnd(.65,1.4) + dirSide * (.25 + .5 * heat), back = rnd(.42,1.05);
    smoke.vx[i] = cvxNow * .50 + Lx * out - Fx * back;
    smoke.vz[i] = cvzNow * .50 + Lz * out - Fz * back;
    smoke.vy[i] = rnd(.32,.63); smoke.cinder[i] = 0;
    smoke.life[i] = rnd(.64,.88) * (.94 + .06 * heat);
    smoke.s0[i] = rnd(.40,.54); smoke.s1[i] = rnd(1.28,1.71) * (1 + .09*heat) * (reduce ? .8 : 1);
    // 짧게 꺾은 첫 초에도 노면과 구분되고, 오래 끌면 두 타이어 뒤쪽에 농도가 쌓인다.
    smoke.a0[i] = rnd(.84,.91) * (1 + .38 * heat) * look.smoke;
    const grey = dark ? rnd(.46,.58) : rnd(.82,.96);
    smoke.r[i] = grey*.91; smoke.g[i] = grey*.97; smoke.b[i] = grey;
    smoke.floor[i] = p.y; smoke.drag[i] = .96; smoke.lift[i] = .18;
  }
  function spawnWheelGlow(wx, wz, g) {
    const i = take(glow), p = toWorld(wx + rnd(-0.06, 0.06), 0.03, wz - 0.05 + rnd(-0.06, 0.04));
    glow.x[i] = p.x; glow.y[i] = p.y; glow.z[i] = p.z; glow.vx[i] = cvxNow; glow.vy[i] = 0; glow.vz[i] = cvzNow;
    const full = g >= 0.999 ? 1.25 + 0.2 * Math.sin(st.time * 20) : 1;
    glow.life[i] = rnd(0.06, 0.1); glow.s0[i] = (0.16 + 0.42 * g) * full * rnd(0.85, 1.15); glow.s1[i] = glow.s0[i] * 0.6;
    glow.a0[i] = (0.4 + 0.6 * g) * (full > 1 ? 1 : 0.9);
    glow.r[i] = 1; glow.g[i] = 0.86; glow.b[i] = 0.62; glow.r1[i] = 1; glow.g1[i] = 0.62; glow.b1[i] = 0.3;
  }
  function spawnSpark(wx, wz, g) {
    const i = take(line), p = toWorld(wx + rnd(-0.05, 0.05), 0.03, wz - 0.06), side = Math.sign(wx);
    line.x[i] = p.x; line.y[i] = p.y; line.z[i] = p.z;
    const out = rnd(0.3, 2.2) * side, back = rnd(1.0, 3.5), kv = 0.8;
    line.vx[i] = cvxNow * kv + Lx * out - Fx * back; line.vz[i] = cvzNow * kv + Lz * out - Fz * back; line.vy[i] = rnd(1.0, 3.2);
    line.life[i] = rnd(0.2, 0.38); line.grav[i] = 9.8; line.kind[i] = 0; line.a0[i] = 0.55 + 0.45 * g;
    line.r[i] = 1; line.g[i] = 0.8; line.b[i] = 0.45;
  }
  // 배기구의 푸른 불씨: 배기 방향으로 아주 조금 밀려 나가며 짧게 사라진다(카트를 따라 움직인다)
  function spawnPilot(k, big) {
    const e = boostStyle.family === 'legacy' ? mounts.exhaust[k] : origins[k], d = KART_POINTS.exhaustDir;
    const p = toWorld(e[0], e[1] + 0.02, e[2] - 0.12);
    const i = take(glow); glow.x[i] = p.x; glow.y[i] = p.y; glow.z[i] = p.z;
    const dx = Lx * d[0] + Fx * d[2], dz = Lz * d[0] + Fz * d[2], sp = big ? 0.6 : rnd(0.3, 0.9);
    glow.vx[i] = cvxNow + dx * sp; glow.vz[i] = cvzNow + dz * sp; glow.vy[i] = d[1] * sp + rnd(0, 0.15);
    const flicker = reduce ? 1 : rnd(0.85, 1.15);
    glow.life[i] = big ? 0.16 : rnd(0.07, 0.11); glow.s0[i] = (big ? 0.33 : 0.22) * flicker; glow.s1[i] = big ? 0.17 : 0.09; glow.a0[i] = 0.8;
    glow.r[i] = 0.78; glow.g[i] = 0.92; glow.b[i] = 1; glow.r1[i] = 0.22; glow.g1[i] = 0.5; glow.b1[i] = 1;
  }
  function spawnSpeedLine(course) {
    const cx = Math.sin(course), cz = Math.cos(course), lx = Math.cos(course), lz = -Math.sin(course);
    const i = take(line), ahead = rnd(7, 13), side = (Math.random() < 0.5 ? -1 : 1) * rnd(1.3, 3.2), up = rnd(0.15, 2.4), len = rnd(1.6, 2.8);
    line.x[i] = px + cx * ahead + lx * side; line.y[i] = py + up; line.z[i] = pz + cz * ahead + lz * side;
    line.vx[i] = line.vy[i] = line.vz[i] = 0; line.kind[i] = 1; line.dx[i] = cx * len; line.dy[i] = 0; line.dz[i] = cz * len;
    line.life[i] = rnd(0.45, 0.65); line.a0[i] = rnd(0.22, 0.34); line.r[i] = 0.82; line.g[i] = 0.9; line.b[i] = 1;
  }
  function landDust(landed) {
    const fall = clamp((landed - 1) / 5, .25, 1.3);
    const k = fall * (.70 + .30 * clamp(hangTime / .9, 0, 1));
    const each = Math.max(1, Math.round((reduce ? 1.2 : 2.5) * k));
    for (const axle of [mounts.rear, mounts.front]) for (const [wx, wz] of axle) for (let j = 0; j < each; j++) {
      const i = take(smoke), p = toWorld(wx + Math.sign(wx) * 0.08 + rnd(-0.05, 0.05), 0.05, wz + rnd(-0.12, 0.12));
      smoke.x[i] = p.x; smoke.y[i] = p.y; smoke.z[i] = p.z;
      // 바퀴에서 바깥으로(옆이 더 많이), 낮게
      const out = Math.sign(wx) * rnd(1.3, 3.5) * k, fwd = Math.sign(wz) * rnd(0.1, 1.0) * k;
      smoke.vx[i] = cvxNow * .65 + Lx * out + Fx * fwd + rnd(-0.3, 0.3);
      smoke.vz[i] = cvzNow * .65 + Lz * out + Fz * fwd + rnd(-0.3, 0.3);
      smoke.cinder[i] = 0; smoke.vy[i] = rnd(0.15, 0.55) * (0.6 + 0.4 * k);
      smoke.life[i] = rnd(0.55, 0.9) * (0.8 + 0.2 * k); smoke.s0[i] = rnd(0.3, 0.42); smoke.s1[i] = rnd(.88, 1.26) * (.63 + .37*k); smoke.a0[i] = rnd(.32, .43) * (.40 + .54*k);
      const tone = dark ? rnd(.42,.54) : rnd(.71,.83); smoke.r[i] = tone; smoke.g[i] = tone * 0.975; smoke.b[i] = tone * 0.93;   // 흙먼지: 연기보다 조금 따뜻한 회색
      smoke.floor[i] = p.y; smoke.drag[i] = 2.3; smoke.lift[i] = 0.12;
    }
  }
  function wallBurst(pose, n) {
    const corners = KART_POINTS.frontCorners;
    for (let j = 0; j < n; j++) {
      let x, z;
      if (pose.wallX !== undefined) { x = pose.wallX; z = pose.wallZ; }
      else { const c = corners[j % 2], p = toWorld(c[0], 0, c[1] - rnd(0, 0.6)); x = p.x; z = p.z; }
      const i = take(line);
      line.x[i] = x; line.y[i] = py + mounts.radius*rnd(.64,1.18); line.z[i] = z;
      // 접점에서 차 쪽을 향하는 방향을 빼면 벽을 따라가는 속도가 남는다.
      const dx = px - x, dz = pz - z, dist = Math.hypot(dx,dz) || 1;
      const nx = dx / dist, nz = dz / dist, normalSpeed = cvxNow*nx + cvzNow*nz;
      const tangent = rnd(.55,.84), rebound = rnd(.36,1.4) + .16*Math.abs(normalSpeed);
      line.vx[i] = (cvxNow - normalSpeed*nx)*tangent + nx*rebound;
      line.vz[i] = (cvzNow - normalSpeed*nz)*tangent + nz*rebound;
      line.vy[i] = rnd(.8,2.5);
      line.life[i] = rnd(0.25, 0.45); line.grav[i] = 9.8; line.kind[i] = 0; line.a0[i] = 1; line.r[i] = 1; line.g[i] = rnd(.38,.73); line.b[i] = rnd(.05,.19);
    }
  }

  function step(dt) {
    for (const p of [smoke, glow, line]) {
      for (let i = 0; i < p.n; i++) {
        if (!p.alive[i]) continue;
        p.age[i] += dt; if (p.age[i] >= p.life[i]) { p.alive[i] = 0; continue; }
        if (p.drag[i]) { const f = Math.exp(-p.drag[i] * dt); p.vx[i] *= f; p.vy[i] *= f; p.vz[i] *= f; }
        p.vy[i] += (p.lift[i] - p.grav[i]) * dt;
        p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt; p.z[i] += p.vz[i] * dt;
        if (p.grav[i]) {
          const floor = p === line && line.boost[i] ? line.floor[i] : py;
          if (p.y[i] < floor + 0.01) { p.y[i] = floor + 0.01; p.vy[i] *= -0.35; p.vx[i] *= 0.6; p.vz[i] *= 0.6; }
        }
      }
    }
  }
  const counts = { smoke: 0, glow: 0, lines: 0 };
  function write() {
    // 연기
    {
      const P = smokeObj.geometry.attributes.position.array, T = smokeObj.geometry.attributes.tint.array, S = smokeObj.geometry.attributes.size.array; let n = 0;
      const cloud = smokeObj.geometry.attributes.cloud.array;
      for (let i = 0; i < N_SMOKE; i++) {
        if (!smoke.alive[i]) continue; const t = smoke.age[i] / smoke.life[i];
        const size = smoke.s0[i] + (smoke.s1[i] - smoke.s0[i]) * (1 - (1 - t) * (1 - t));
        // 태어난 자리의 높이를 따른다. 지면 가까운 쪽은 셰이더에서 먼저 흐린다.
        P[n * 3] = smoke.x[i]; P[n * 3 + 1] = Math.max(smoke.y[i], smoke.floor[i] + size * .30); P[n * 3 + 2] = smoke.z[i];
        // 접점의 밝은 회색은 퍼지면서 조금 식고 노면에 섞인다.
        const cool = smoke.cinder[i] ? 0 : t;
        T[n * 4] = smoke.r[i] * (1 - .18*cool); T[n * 4 + 1] = smoke.g[i] * (1 - .10*cool); T[n * 4 + 2] = smoke.b[i] * (1 - .04*cool);
        const fadeIn = smoke.boost[i] ? 1 : Math.min(1, t / 0.08);
        T[n * 4 + 3] = smoke.a0[i] * fadeIn * (1 - t) * (1 - .56*t);
        cloud[n*2] = smoke.cinder[i] ? 4 : i % 4; cloud[n*2+1] = (P[n*3+1] - smoke.floor[i]) / size;
        S[n] = size; n++;
      }
      if (n) smokeObj.geometry.attributes.cloud.needsUpdate = true;
      finish(smokeObj, n); counts.smoke = n;
    }
    // 빛(바퀴 밑 · 다시 밟기 후광)
    {
      const P = glowObj.geometry.attributes.position.array, T = glowObj.geometry.attributes.tint.array, S = glowObj.geometry.attributes.size.array; let n = 0;
      for (let i = 0; i < N_GLOW; i++) {
        if (!glow.alive[i]) continue; const t = glow.age[i] / glow.life[i];
        P[n * 3] = glow.x[i]; P[n * 3 + 1] = glow.y[i]; P[n * 3 + 2] = glow.z[i];
        T[n * 4] = glow.r[i] + (glow.r1[i] - glow.r[i]) * t; T[n * 4 + 1] = glow.g[i] + (glow.g1[i] - glow.g[i]) * t; T[n * 4 + 2] = glow.b[i] + (glow.b1[i] - glow.b[i]) * t;
        T[n * 4 + 3] = glow.a0[i] * (1 - t * t);
        S[n] = glow.s0[i] + (glow.s1[i] - glow.s0[i]) * t; n++;
      }
      finish(glowObj, n); counts.glow = n;
    }
    // 줄(불꽃 · 벽 불티 · 속도 줄무늬)
    {
      let n = 0;
      for (let i = 0; i < N_LINE; i++) {
        if (!line.alive[i]) continue;
        if (line.kind[i] >= WAKE) { writeBoostRibbon(i, n++); continue; }
        const t = line.age[i] / line.life[i], kind = line.kind[i], mark = kind === 2, speedLine = kind === 1;
        const drag = .038;
        const dx = mark ? line.dx[i] : speedLine ? -line.dx[i] : -line.vx[i] * drag;
        const dy = mark ? line.dy[i] : speedLine ? 0 : -line.vy[i] * drag;
        const dz = mark ? line.dz[i] : speedLine ? -line.dz[i] : -line.vz[i] * drag;
        const gain = line.a0[i] * (speedLine ? Math.sin(Math.PI*t) : 1-t);
        const width = mark ? -Math.min(.14,Math.max(.055,mounts.radius*.31)) : speedLine ? .014 : .018;
        for (let j = 0; j < 4; j++) {
          const q = n*4+j, o = q*3, k = q*4, tail = j >= 2;
          heads[o] = line.x[i]; heads[o+1] = line.y[i]; heads[o+2] = line.z[i];
          axes[o] = dx; axes[o+1] = dy; axes[o+2] = dz;
          widths[q] = width * (tail && !mark ? .19 : 1);
          const intensity = mark ? 0 : gain * (tail ? .03 : speedLine ? .65 : 3.2);
          inks[k] = line.r[i] * intensity; inks[k+1] = line.g[i] * intensity * (tail ? .68 : 1);
          inks[k+2] = line.b[i] * intensity * (tail ? .44 : 1);
          inks[k+3] = mark ? gain * (tail ? line.endInk[i]*.89 : line.startInk[i]) : 0;
        }
        n++;
      }
      lineGeo.setDrawRange(0,n*6);
      if (n) for (const name of ['position','axis','span','tint']) lineGeo.attributes[name].needsUpdate = true;
      lineObj.visible = n > 0; counts.lines = n;
    }
  }

  function writeBoostRibbon(i, n) {
    const t = line.age[i] / line.life[i], kind = line.kind[i];
    let dx = line.dx[i], dy = line.dy[i], dz = line.dz[i];
    let headWidth = line.s0[i], tipWidth = headWidth * .18;
    let alpha = 0, gain = line.a0[i] * (1-t), tipGain = gain * .09, crossSlope = 0;
    if (kind === SPILL) {
      headWidth = tipWidth = -line.s0[i]; gain = tipGain = line.a0[i]; alpha = -1;
      // 셰이더가 음수 폭을 옆 방향으로 펼칠 때 양쪽 끝도 노면 경사를 따라간다.
      crossSlope = roll * headWidth;
    } else if (kind === PAPER) {
      const angle = line.dy[i] + 6.8*t;
      const along = line.s1[i] * Math.sin(angle);
      dx *= along; dz *= along; dy = line.s1[i] * Math.cos(angle);
      headWidth *= .28 + .72 * Math.abs(Math.cos(angle*.9));
      tipWidth = headWidth * .87;
      alpha = line.a0[i]*Math.min(1,(1-t)*4); gain = tipGain = alpha;
    }
    for (let j = 0; j < 4; j++) {
      const q = 4*n+j, o = 3*q, k = 4*q, tail = j >= 2, intensity = tail ? tipGain : gain;
      heads[o] = line.x[i]; heads[o+1] = line.y[i] + (j % 2 ? crossSlope : -crossSlope); heads[o+2] = line.z[i];
      axes[o] = dx; axes[o+1] = dy; axes[o+2] = dz; widths[q] = tail ? tipWidth : headWidth;
      inks[k] = line.r[i]*intensity; inks[k+1] = line.g[i]*intensity; inks[k+2] = line.b[i]*intensity; inks[k+3] = alpha;
    }
  }
  function finish(obj, n) {
    const a = obj.geometry.attributes;
    if (n) a.position.needsUpdate = a.tint.needsUpdate = a.size.needsUpdate = true;
    obj.geometry.setDrawRange(0, n); obj.visible = n > 0;
  }

  return {
    update,
    group: root,
    stats: () => ({ ...counts, particles: counts.smoke + counts.glow + counts.lines, max: N_SMOKE + N_GLOW + N_LINE,
      drawCalls: (smokeObj.visible ? 1 : 0) + (glowObj.visible ? 1 : 0) + (lineObj.visible ? 1 : 0), reducedMotion: reduce }),
    setReducedMotion(on) { reduce = !!on; },
    clear() {
      for (const pool of [smoke, glow, line]) { pool.alive.fill(0); pool.cursor = 0; }
      previous.fill(null); newestMark.fill(-1); markClock = 0;
      st.smokeAcc.fill(0); st.glowAcc.fill(0);
      st.sparkAcc = st.lineAcc = st.pilotAcc = st.wallCool = st.prevBoost = st.gaugeEst = st.gShown = st.time = 0;
      burnAge = driftTime = hangTime = 0; previousKind = ''; spillSlot = -1;
      st.prevStock = null; st.prevKick = false;
      write();
    },
    dispose() {
      mq?.removeEventListener?.('change', onMq);
      jet?.restore(); root.removeFromParent(); vapourMap.dispose();
      for (const o of [smokeObj, glowObj, lineObj]) { o.geometry.dispose(); o.material.dispose(); }
    },
  };
}
