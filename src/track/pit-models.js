// 피트레인의 모양 — 노면(레인 · 턱 · 쐐기), 줄(흰 가장자리 · 노란 제한 속도 · 정차 칸), 바닥 글자('60' · '피트'), 들머리 표지, 바깥 방호벽, 가르는 벽의 양 끝 표시.
//   const m = createPitModels(THREE, { pit, parts, surfaceAt, groundAt });  scene.add(m.group);  → { group, stats: { meshes, triangles }, dispose() }
// 자리와 치수는 전부 pit.js 의 API 에서 가져온다(u = 이어 센 거리, lateral = 중심선에서 오른쪽 m). 모양만 만들고 주행 계산은 건드리지 않는다.
// 높이: 주행로 가장자리 안쪽(들어가는 곳 · 나오는 곳에서 레인이 주행로와 겹치는 곳)은 주행로 겉면 surfaceAt 위, 밖은 땅 groundAt 위 — 주행로와 같은 LIFT 만큼 띄운다.
// 그리기 호출 6번: 노면 · 줄 · 바닥 글자 · 표지 판 · 소품(표지 뒤판과 기둥 · 끝 표시) · 바깥 방호벽(InstancedMesh).
import { LIFT } from './track.js';

const COLOURS = {
  pit: 0x343e50, concrete: 0xa9adb2, line: 0xf2f4f7, yellow: 0xf6c62c,
  blue: 0x3567b5, white: 0xe9edf2,                 // 방호벽 — track.js 와 같은 색(흰 블록 둘에 파랑 하나)
  navy: 0x1d3466, back: 0x2a2f38, post: 0xdfe4ea, dark: 0x1b1d21,
};
// 방호벽 단면 — track.js 의 방호벽과 같은 것(가로 x, 높이 y, 아래가 넓은 물통형). 안쪽 밑면이 벽 선에 닿게 바깥으로 OUT 만큼 민다.
const PROFILE = [[-0.3, -0.15], [0.3, -0.15], [0.3, 0.2], [0.17, 0.42], [0.15, 0.78], [-0.15, 0.78], [-0.17, 0.42], [-0.3, 0.2]];
const OUT = 0.31;
const FONT = '"Apple SD Gothic Neo", "Pretendard", system-ui, sans-serif';

// 두 정비등 사이의 국소광. 밤 재질의 월드 좌표를 써서 노면과 움직이는 팔에 같은 빛이 닿는다.
// 정점에서만 거리를 잰다. 새 조명이나 그림자 지도를 만들지 않는다.
export function pitFinish(THREE, pit, groundAt) {
  if (!pit?.boxes?.length) return material => material;
  const head = bay => {
    const u = bay.from + .18, p = pit.pointAt(u, pit.outer(u) - .31);
    return new THREE.Vector3(p.x, groundAt(p.x,p.z) + LIFT.road + 2.55, p.z);
  };
  const start = head(pit.boxes[0]), axis = head(pit.boxes.at(-1)).sub(start);
  const inverseLength = 1 / Math.max(.01, axis.lengthSq());
  return material => {
    material.onBeforeCompile = shader => {
      shader.uniforms.pitHead = { value: start };
      shader.uniforms.pitAxis = { value: axis };
      shader.uniforms.pitInv = { value: inverseLength };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        #ifdef CAMPUS_LAMP_MAP
        uniform vec3 pitHead, pitAxis;
        uniform float pitInv;
        varying float pitLux;
        #endif`).replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef CAMPUS_LAMP_MAP
        vec3 nearest = pitHead + pitAxis * clamp(dot(vNightPosition - pitHead, pitAxis) * pitInv, 0., 1.);
        vec3 ray = nearest - vNightPosition;
        float dist2 = max(dot(ray, ray), .04);
        vec3 n = inverseTransformDirection(transformedNormal, viewMatrix);
        pitLux = (.36 + .64 * max(0., dot(n, ray * inversesqrt(dist2)))) / (1. + .16 * dist2);
        #endif`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        #ifdef CAMPUS_LAMP_MAP
        varying float pitLux;
        #endif`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #ifdef CAMPUS_LAMP_MAP
        reflectedLight.indirectDiffuse += material.diffuseColor * pitLux * vec3(1.20, 1.46, 1.83);
        #endif`);
    };
    return material;
  };
}

export function createPitModels(THREE, { pit, parts, surfaceAt, groundAt }) {
  const group = new THREE.Group(); group.name = 'pit';
  const meshes = [], textures = [];
  const stats = { meshes: 0, triangles: 0 };
  const dispose = () => { for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); } for (const t of textures) t.dispose(); };
  if (!pit) return { group, stats, dispose };

  const L = pit.length, mod = s => ((s % L) + L) % L;
  const { from, to, funnel: F, width: W, limit } = pit, [w0, w1] = pit.wall;
  const { edge, inner, outer, wallAt } = pit;
  const colour = hex => new THREE.Color(hex);
  const C = Object.fromEntries(Object.entries(COLOURS).map(([k, v]) => [k, colour(v)]));

  // 한 점(레인 둘레의 u, lateral) → [x, y, z]. 주행로 가장자리 안쪽은 주행로 겉면, 밖은 땅.
  const P = (u, lat, lift) => {
    const p = pit.pointAt(u, lat), y = lat < edge(u) - 0.01 ? surfaceAt(p.x, p.z, mod(u)) : groundAt(p.x, p.z);
    return [p.x, y + lift, p.z];
  };
  const flat = () => ({ pos: [], col: [], uv: [] });
  const tri = (out, a, b, c, col) => { out.pos.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) out.col.push(col.r, col.g, col.b); };
  const quad = (out, a, b, c, d, col) => { tri(out, a, b, c, col); tri(out, a, c, d, col); };   // a(앞 왼) b(앞 오) c(뒤 오) d(뒤 왼) — 위를 본다
  // 띠: 가로 lo(u) ~ hi(u), 세로 u0 ~ u1 를 step m 마다, 가로로 cols 칸(땅을 따라 꺾이게)
  function band(out, lo, hi, u0, u1, lift, col, { step = 1, cols = 1 } = {}) {
    if (!(u1 > u0)) return;
    const n = Math.max(1, Math.ceil((u1 - u0) / step - 1e-6));
    for (let k = 0; k < n; k++) {
      const a = u0 + (u1 - u0) * k / n, b = u0 + (u1 - u0) * (k + 1) / n, la = lo(a), ha = Math.max(la, hi(a)), lb = lo(b), hb = Math.max(lb, hi(b));
      if (ha - la < 1e-3 && hb - lb < 1e-3) continue;
      for (let c = 0; c < cols; c++) {
        const t0 = c / cols, t1 = (c + 1) / cols;
        quad(out, P(a, la + (ha - la) * t0, lift), P(a, la + (ha - la) * t1, lift), P(b, lb + (hb - lb) * t1, lift), P(b, lb + (hb - lb) * t0, lift), col);
      }
    }
  }
  const finish = pitFinish(THREE, pit, groundAt);
  const std = opts => finish(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts }));
  function geometry(out) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    if (out.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    if (out.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
    g.computeVertexNormals(); return g;
  }
  const add = (mesh, name, { cast = false } = {}) => { mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = cast; group.add(mesh); meshes.push(mesh); return mesh; };

  // ---- 주행로 경계 선분: 주행로의 오른쪽 방호벽이 실제로 끊기고 다시 서는 자리(track.js 는 경계 선분의 가운데로 gapAt 을 본다)
  function segmentsIn(u0, u1) {
    const cuts = []; let prev = pit.pointAt(u0, 0).index;
    for (let k = 1, n = Math.round((u1 - u0) / 0.01); k <= n; k++) { const u = u0 + k * 0.01, i = pit.pointAt(u, 0).index; if (i !== prev) { cuts.push(u); prev = i; } }
    const segs = []; for (let k = 0; k + 1 < cuts.length; k++) { const a = cuts[k], b = cuts[k + 1]; segs.push({ a, b, index: pit.pointAt((a + b) / 2, 0).index, gap: pit.gapAt(mod((a + b) / 2), 'right') }); }
    return segs;
  }
  const entry = segmentsIn(from - F - 8, w0 + 8), exit = segmentsIn(w1 - 8, to + F + 8);
  const gapIn = entry.findIndex(g => g.gap), wallIn = entry.findIndex((g, k) => k > gapIn && !g.gap);
  const wallOut = exit.findIndex(g => g.gap) - 1, gapOut = exit.findLastIndex(g => g.gap);
  const uA = gapIn >= 0 ? entry[gapIn].a : from - F, uB = gapOut >= 0 ? exit[gapOut].b : to + F;   // 바깥 벽이 주행로의 벽을 이어받는 자리
  const divider = [wallIn >= 0 ? entry[wallIn] : null, wallOut >= 0 ? exit[wallOut] : null];       // 가르는 벽(주행로의 방호벽)의 처음 · 마지막 블록

  // ---- 1. 노면: 쐐기(벌어지는 바깥 벽 ~ 주행로 가장자리) · 턱(가장자리 ~ 레인 안쪽, 콘크리트) · 레인(피트 색)
  {
    const out = flat(), lane = u => Math.max(edge(u), inner(u));
    band(out, edge, wallAt, from - F, from, LIFT.road, C.concrete);
    band(out, edge, wallAt, to, to + F, LIFT.road, C.concrete);
    band(out, edge, lane, from, to, LIFT.road, C.concrete);
    // 정차 칸은 콘크리트 정비 패드다. 하부가 겹치지 않도록 아스팔트를 끊고 이어 붙인다.
    let cursor = from;
    const pad = colour(0x66717b);
    for (const bay of pit.boxes) {
      band(out,lane,outer,cursor,bay.from,LIFT.road,C.pit,{ cols: 4 });
      band(out,lane,outer,bay.from,bay.to,LIFT.road,pad,{ cols: 4 });
      cursor = bay.to;
    }
    band(out,lane,outer,cursor,to,LIFT.road,C.pit,{ cols: 4 });
    // 미세 골재와 솔질 자국. 0.9 m마다 반복하고 멀어지면 밉맵으로 평균낸다.
    const size = 96, grain = new Uint8Array(size * size * 4);
    let seed = 341;
    const random = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296);
    for (let y=0; y<size; y++) {
      const brush = random()*9;
      for (let x=0; x<size; x++) {
        const i=4*(y*size+x), tone=Math.round(197+brush+random()*41);
        grain[i]=grain[i+1]=grain[i+2]=tone; grain[i+3]=255;
      }
    }
    const grit = new THREE.DataTexture(grain,size,size);
    grit.wrapS = grit.wrapT = THREE.RepeatWrapping;
    grit.generateMipmaps = true; grit.minFilter = THREE.LinearMipmapLinearFilter;
    grit.magFilter = THREE.LinearFilter; grit.anisotropy = 4; grit.needsUpdate = true;
    textures.push(grit);
    for (let j=0; j<out.pos.length; j+=3) out.uv.push(out.pos[j]/.9,out.pos[j+2]/.9);
    const pavement = std({ map: grit, vertexColors: true, roughness: .94, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    add(new THREE.Mesh(geometry(out), pavement), 'pit-surface');
  }

  // ---- 2. 줄: 레인 양쪽 흰 줄(안쪽 줄은 들어가고 나오는 곳에서 주행로 위의 유도 줄이 된다) · 노란 제한 속도 줄 · 정차 칸(노란 테두리)
  {
    const out = flat(), lift = LIFT.paint, LW = 0.15;
    band(out, u => inner(u) + 0.15, u => inner(u) + 0.15 + LW, from + 0.5, to - 0.5, lift, C.line, { step: 0.5 });
    band(out, u => outer(u) - 0.3, u => outer(u) - 0.3 + LW, from + 0.5, to - 0.5, lift, C.line, { step: 0.5 });
    const yellow = colour(0xebc150), edgePaint = colour(0xd5dade);
    for (const [u,dir] of [[limit.from,1],[limit.to,-1]]) {
      const lo = v => inner(v)+.45, hi = v => outer(v)-.45;
      band(out,lo,hi,u-.13,u+.13,lift,yellow);
      band(out,lo,hi,u+dir*.39-.048,u+dir*.39+.048,lift,yellow);
    }
    function arrow(u) {
      const mid = v => (inner(v)+outer(v))*.5;
      const point = (s,x) => P(u+s,mid(u+s)+x,lift);
      quad(out,point(0,-.085),point(0,.085),point(.85,.085),point(.85,-.085),edgePaint);
      tri(out,point(.85,-.34),point(.85,.34),point(1.56,0),edgePaint);
    }
    arrow(from+4.8); arrow(limit.to+5.6);
    // 그어 놓은 삼각지대: 가르는 벽이 시작하고 끝나는 곳의 콘크리트 턱.
    for (const [u,dir] of [[w0,1],[w1,-1]]) {
      for (let j=1; j<=3; j++) {
        const t=u+dir*(.72+j*.76), a=Math.min(t,t+dir*.19), b=Math.max(t,t+dir*.19);
        quad(out,P(a,edge(a)+.42,lift),P(a+.46,inner(a+.46)-.05,lift),
          P(b+.46,inner(b+.46)-.05,lift),P(b,edge(b)+.42,lift),edgePaint);
      }
    }
    for (const bay of pit.boxes) {
      const lo = u => inner(u)+.95, hi = u => outer(u)-.6, ink = colour(0x3f4950);
      // 칸의 실제 네 모서리는 노랑, 가운데는 얇은 안내선과 잭을 맞추는 눈금.
      for (const side of [lo,hi]) {
        const inward = side === lo ? 1 : -1;
        const a = u => side(u)+Math.min(0,.12*inward), b = u => side(u)+Math.max(0,.12*inward);
        band(out,a,b,bay.from,bay.from+.85,lift,yellow);
        band(out,a,b,bay.to-.85,bay.to,lift,yellow);
        band(out,u=>side(u)-.025,u=>side(u)+.025,bay.from+.85,bay.to-.85,lift,edgePaint);
        const half = (bay.from+bay.to)/2;
        band(out,u=>Math.min(side(u),side(u)+inward*.28),u=>Math.max(side(u),side(u)+inward*.28),half-.065,half+.065,lift,yellow);
      }
      for (const u of [bay.from+.07,bay.to-.07]) {
        band(out,lo,v=>lo(v)+.65,u-.07,u+.07,lift,yellow);
        band(out,v=>hi(v)-.65,hi,u-.07,u+.07,lift,yellow);
        band(out,v=>lo(v)+.65,v=>hi(v)-.65,u-.025,u+.025,lift,ink);
      }
      // 바깥 배수 홈과 짧은 덮개 틈.
      band(out,v=>outer(v)-.51,v=>outer(v)-.37,bay.from+.15,bay.to-.15,lift,ink);
      for (let u=bay.from+.28; u<bay.to-.22; u+=.24)
        band(out,v=>outer(v)-.49,v=>outer(v)-.39,u,u+.047,lift+.002,edgePaint);
    }
    add(new THREE.Mesh(geometry(out), std({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })), 'pit-lines');
  }

  // ---- 3. 바닥 글자: 한 장의 그림(왼쪽 칸 '60' 노랑, 오른쪽 칸 '피트' 흰색)을 두 자리에 나눠 붙인다.
  //   글자의 위가 앞(u 가 커지는 쪽), 왼쪽이 왼쪽 — 다가오는 운전자가 바로 읽는다. 낮은 눈높이에서 읽히게 길이 방향으로 늘린다(칸을 꽉 채워 그리고 붙일 판을 길게).
  const canvasTexture = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; textures.push(t); return t;
  };
  function fitText(c, text, x, y, w, h, fill) {   // (x, y, w, h) 칸에 글자를 가로 · 세로 따로 늘려 꽉 채운다
    c.save(); c.font = `800 200px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = fill;
    const m = c.measureText(text), l = m.actualBoundingBoxLeft || 0, r = m.actualBoundingBoxRight || m.width, up = m.actualBoundingBoxAscent || 150, dn = m.actualBoundingBoxDescent || 0;
    c.translate(x + w / 2, y + h / 2); c.scale(w / (l + r), h / (up + dn)); c.fillText(text, (l - r) / 2, (up - dn) / 2); c.restore();
  }
  {
    const tex = canvasTexture(1024, 512, (c, w, h) => { fitText(c, '60', 40, 24, w / 2 - 80, h - 48, '#f6c62c'); fitText(c, '피트', w / 2 + 28, 24, w / 2 - 56, h - 48, '#f2f4f7'); });
    const out = flat(), lift = LIFT.paint + 0.006, mid = u => (inner(u) + outer(u)) / 2;
    const decal = (u0, u1, half, s0, s1) => {
      const n = 6;
      for (let k = 0; k < n; k++) {
        const a = u0 + (u1 - u0) * k / n, b = u0 + (u1 - u0) * (k + 1) / n, va = k / n, vb = (k + 1) / n;
        out.pos.push(...P(a, mid(a) - half, lift), ...P(a, mid(a) + half, lift), ...P(b, mid(b) + half, lift), ...P(a, mid(a) - half, lift), ...P(b, mid(b) + half, lift), ...P(b, mid(b) - half, lift));
        out.uv.push(s0, va, s1, va, s1, vb, s0, va, s1, vb, s0, vb);
      }
    };
    const t0 = limit.from + 1.6;
    decal(t0, t0 + 5, 1.1, 0, 0.5);               // '60' — 폭 2.2 m · 길이 5 m
    if (!pit.boxes.length || pit.boxes[0].from >= t0 + 13.2 + 0.4) decal(t0 + 7.2, t0 + 13.2, 1.75, 0.5, 1);     // '피트' — 폭 3.5 m · 길이 6 m (첫 정차 칸 앞에 자리가 있을 때만)
    add(new THREE.Mesh(geometry(out), std({ map: tex, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })), 'pit-text').renderOrder = 2;
  }

  // ---- 소품(정점 색 하나의 메시): 표지 뒤판 · 기둥, 가르는 벽 끝의 노란 덧씌움 · 줄무늬 말뚝
  const props = flat();
  const UP = [0, 1, 0];
  function box(o, u, v, w, hu, hv, hw, col) {   // 방향 상자: 중심 o, 축 u · v · w, 반길이 hu · hv · hw (양면 재질이라 감김은 상관없다)
    const Q = (su, sv, sw) => [o[0] + u[0] * hu * su + v[0] * hv * sv + w[0] * hw * sw, o[1] + u[1] * hu * su + v[1] * hv * sv + w[1] * hw * sw, o[2] + u[2] * hu * su + v[2] * hv * sv + w[2] * hw * sw];
    const faces = [[[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]];
    for (const f of faces) quad(props, ...f.map(c => Q(...c)), col);
  }
  // 방호벽 단면을 길이 방향으로 뽑은 것(o = 벽 선 위 바닥점, across = 바깥 방향, along = 길이 방향, z0 ~ z1 m, 단면을 sx · sy 배)
  function prism(o, across, along, z0, z1, sx, sy, col) {
    const Q = (p, z) => [o[0] + across[0] * (OUT + p[0] * sx) + along[0] * z, o[1] + p[1] * sy, o[2] + across[2] * (OUT + p[0] * sx) + along[2] * z];
    const n = PROFILE.length;
    for (let k = 0; k < n; k++) { const a = PROFILE[k], b = PROFILE[(k + 1) % n]; quad(props, Q(a, z0), Q(b, z0), Q(b, z1), Q(a, z1), col); }
    for (const z of [z0, z1]) for (let k = 1; k < n - 1; k++) tri(props, Q(PROFILE[0], z), Q(PROFILE[k], z), Q(PROFILE[k + 1], z), col);
  }

  // ---- 4. 들머리 표지: 바깥 벽 바깥, 다가오는 쪽을 보고 주행로 쪽으로 20° 돌린다. 남색 판 '피트' + 흰 동그라미 '60'.
  //   갈라지는 곳에서 4 m 뒤, 바깥 벽에서 1.6 m — 레인으로 들어가는 카메라 앞을 가리지 않게. (들머리가 출발선 뒤라 출발 문 너머로 보인다.)
  {
    const U = from + 4, base = pit.pointAt(U, wallAt(U) + 1.6), y = groundAt(base.x, base.z);
    const f = [Math.sin(base.heading), 0, Math.cos(base.heading)], r = [-f[2], 0, f[0]], turn = 20 * Math.PI / 180;
    const across = [r[0] * Math.cos(turn) - f[0] * Math.sin(turn), 0, r[2] * Math.cos(turn) - f[2] * Math.sin(turn)];   // 판의 가로(운전자가 볼 때 오른쪽)
    const normal = [-across[2], 0, across[0]];   // 판 앞면이 보는 쪽 = 가로 × 위
    const BW = 1.8, BH = 1.0, UPH = 0.85;
    const tex = canvasTexture(512, 284, (c, w, h) => {
      c.fillStyle = '#1d3466'; c.fillRect(0, 0, w, h); c.fillStyle = '#f6c62c'; c.fillRect(0, 0, w, 16);
      c.strokeStyle = '#e9edf2'; c.lineWidth = 6; c.strokeRect(10, 24, w - 20, h - 34);
      fitText(c, '피트', 40, 78, 230, 150, '#ffffff');
      const R = 92, cx = w - R - 40, cy = 24 + (h - 34) / 2 + 2;
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fillStyle = '#ffffff'; c.fill();
      c.beginPath(); c.arc(cx, cy, R * 0.86, 0, Math.PI * 2); c.lineWidth = R * 0.16; c.strokeStyle = '#d8382e'; c.stroke();
      fitText(c, '60', cx - R * 0.48, cy - R * 0.4, R * 0.96, R * 0.8, '#17181c');
    });
    const at = (a, v, d = 0) => [base.x + across[0] * a + normal[0] * d, y + v, base.z + across[2] * a + normal[2] * d];
    const face = flat();
    face.pos.push(...at(-BW / 2, UPH, 0.035), ...at(BW / 2, UPH, 0.035), ...at(BW / 2, UPH + BH, 0.035), ...at(-BW / 2, UPH, 0.035), ...at(BW / 2, UPH + BH, 0.035), ...at(-BW / 2, UPH + BH, 0.035));
    face.uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    add(new THREE.Mesh(geometry(face), std({ map: tex, roughness: 0.55 })), 'pit-sign', { cast: true });
    box(at(0, UPH + BH / 2, 0), across, UP, normal, BW / 2 + 0.03, BH / 2 + 0.03, 0.025, C.back);   // 뒤판(뒤에서 보면 이것만)
    for (const a of [-BW / 2 + 0.22, BW / 2 - 0.22]) box(at(a, (UPH + BH - 0.1 - 0.15) / 2 + 0.0, -0.07), across, UP, normal, 0.04, (UPH + BH - 0.1 + 0.15) / 2, 0.04, C.post);
  }

  // ---- 6. 가르는 벽(주행로의 방호벽)의 양 끝: 끝 블록에 노란 덧씌움(단면을 조금 키운 것) + 위에 노랑 · 검정 줄무늬 말뚝
  for (const [k, seg] of divider.entries()) {
    if (!seg) continue;
    const a = pit.pointAt(seg.a, edge(seg.a)), b = pit.pointAt(seg.b, edge(seg.b)), ex = b.x - a.x, ez = b.z - a.z, l = Math.hypot(ex, ez) || 1;
    const along = [ex / l, 0, ez / l], across = [-ez / l, 0, ex / l];   // 오른쪽(바깥)
    const yAt = z => { const px = a.x + along[0] * z + across[0] * OUT, pz = a.z + along[2] * z + across[2] * OUT; return surfaceAt(px, pz, mod(seg.a + z)); };
    const nose = k === 0 ? -0.05 : l + 0.05, dir = k === 0 ? 1 : -1, len = 0.9;   // 블록의 끝(track.js 는 블록을 4 % 길게 그린다)
    const z0 = Math.min(nose, nose + dir * len), z1 = Math.max(nose, nose + dir * len), o = [a.x, yAt((z0 + z1) / 2), a.z];
    prism(o, across, along, z0 - 0.01, z1, 1.08, 1.05, C.yellow);
    const pz = nose + dir * 0.22, top = yAt(pz) + 0.78 * 1.05, pc = [a.x + along[0] * pz + across[0] * OUT, 0, a.z + along[2] * pz + across[2] * OUT];
    for (let s = 0; s < 3; s++) box([pc[0], top + 0.12 + s * 0.22, pc[2]], across, UP, along, 0.05, 0.11, 0.05, s % 2 ? C.dark : C.yellow);
  }
  // 벽 너머 정비대. 같은 금속 메시 안에 함, 타이어의 속구멍, 감긴 호스까지 넣는다.
  for (const [index, bay] of pit.boxes.entries()) {
    const u = (bay.from + bay.to) / 2, p = pit.pointAt(u, outer(u));
    const floor = groundAt(p.x, p.z) + LIFT.road;
    const along = [Math.sin(p.heading), 0, Math.cos(p.heading)], out = [-along[2], 0, along[0]];
    const steel = colour(0x8593a1), blue = colour(0x364d69), tyre = colour(0x24282d);
    const rubber = colour(0x353b41), inset = colour(0x192838), trim = colour(0xd7d9cf);
    const yellow = colour(0xe2b342), lamp = colour(0xfff1ce).multiplyScalar(3.8);
    const at = (s, d, y) => [p.x + along[0]*s + out[0]*d, floor+y, p.z + along[2]*s + out[2]*d];
    const block = (s,d,y, length,width,height, col) =>
      box(at(s,d,y), along, UP, out, length/2,height/2,width/2,col);

    // 단면을 축 주위로 돌린다. 수평으로 쌓은 고무와, 벽 쪽으로 눕힌 호스 북.
    function turned(s,d,y, profile, vertical, sides = 14) {
      const point = (angle, [r,h]) => {
        const a = Math.cos(angle)*r, b = Math.sin(angle)*r;
        return vertical ? at(s+a,d+b,y+h) : at(s+a,d+h,y+b);
      };
      for (let j = 0; j < sides; j++) {
        const a = j * 2*Math.PI/sides, b = (j+1) * 2*Math.PI/sides;
        for (let k = 0; k < profile.length-1; k++) {
          const row = profile[k], next = profile[k+1];
          quad(props, point(a,row), point(b,row), point(b,next), point(a,next), row[2]);
        }
      }
    }
    function tire(s,d,y,vertical) {
      turned(s,d,y, [[.20,-.13,rubber],[.30,-.13,tyre],[.344,-.095,rubber],
        [.352,-.065,tyre],[.354,.065,rubber],[.344,.095,tyre],[.30,.13,rubber],
        [.20,.13,inset],[.20,-.13,inset]],vertical,16);
    }

    // 이동식 서랍장. 작업대가 벽 위로 보이고, 바퀴와 사람의 통로는 벽 안에 남는다.
    const cart = -.75;
    block(cart,1.12,.14,2.1,1.15,.28,blue);
    for (const s of [-.56,.56]) for (const d of [.82,1.37])
      turned(cart+s,d,.39,[[.095,-.05,tyre],[.095,.05,rubber],[.032,.05,steel],[.032,.055,steel]],false,8);
    block(cart,1.12,.85,1.50,.72,.76,blue);
    block(cart,1.12,1.245,1.57,.77,.055,inset);
    block(cart,1.12,1.281,1.53,.74,.02,steel);
    for (let i = 0; i < 4; i++) {
      block(cart,.746,.62+i*.161,1.30,.035,.140,i === 3 ? blue : inset);
      block(cart,.718,.665+i*.161,1.11,.039,.022,steel);
    }
    block(cart-.66,.721,.93,.036,.035,.52,yellow);
    block(cart+.63,1.13,1.32,.10,.50,.072,trim);
    // 뒤쪽 기둥에 접힌 호스 북. 고리 옆으로 여러 겹이 보인다.
    block(.40,1.39,.78,.12,.13,1.54,steel);
    for (let i=0; i<4; i++) {
      const r=.15+i*.034;
      turned(.40,1.18,1.37, [[r-.018,-.02,inset],[r,-.034,rubber],[r+.017,-.01,tyre],[r+.015,.02,tyre]],false);
    }
    turned(.4,1.17,1.37, [[.047,-.052,steel],[.047,-.03,yellow],[.105,-.03,blue],[.109,0,inset]],false);
    // 예비 바퀴. 한 칸은 가로로 쌓고 다른 칸은 세운다.
    const stack = 1.28;
    block(stack,1.08,.22,1.03,1.02,.44,blue);
    for (let i=0; i<(index%2 ? 2 : 3); i++) tire(stack,1.08,.57+i*.27,true);
    if (index%2) tire(stack,1.08,1.33,false);

    // 네모 기둥, 안으로 내민 작업등, 가로로 긴 디퓨저 두 줄.
    const post = bay.from-u+.18;
    block(post,.89,.23,.38,.41,.46,blue);
    block(post,.89,1.47,.115,.14,2.5,steel);
    block(post,.89,1.31,.121,.145,.16,yellow);
    block(post,.32,2.69,.14,1.26,.12,blue);
    block(post,-.31,2.66,1.38,.31,.13,inset);
    block(post,-.31,2.575,1.32,.32,.045,trim);
    for (const d of [-.40,-.23]) block(post,d,2.545,1.21,.08,.035,lamp);
    // 번호 없는 작업 칸 표지. 남색 바탕에 바퀴를 닮은 원과 짧은 노란 눈금.
    block(post,.78,1.99,.50,.09,.49,blue);
    turned(post,.725,1.99,[[.104,0,trim],[.140,0,trim],[.140,.012,steel]],false);
    block(post,.72,1.80,.34,.025,.035,yellow);
  }

  {
    const m = add(new THREE.Mesh(geometry(props), std({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide })), 'pit-props', { cast: true });
    m.visible = props.pos.length > 0;
  }

  // ---- 5. 바깥 방호벽: pit.wallAt 를 따라(pit.walls 와 같은 선) 주행로의 방호벽이 끊긴 자리 uA 부터 다시 서는 자리 uB 까지 약 2 m 블록.
  //   주행로의 방호벽과 같은 단면 · 색 · 4 % 겹침. 이음매(uA · uB)에서는 주행로의 블록이 덮는 5 cm 만큼 비켜 같은 면이 겹쳐 깜빡이지 않게 한다.
  {
    const geom = (() => {
      const pos = [];
      for (let k = 0; k < PROFILE.length; k++) { const a = PROFILE[k], b = PROFILE[(k + 1) % PROFILE.length]; pos.push(a[0], a[1], -0.5, b[0], b[1], -0.5, b[0], b[1], 0.5, a[0], a[1], -0.5, b[0], b[1], 0.5, a[0], a[1], 0.5); }
      for (const zc of [-0.5, 0.5]) for (let k = 1; k < PROFILE.length - 1; k++) { const t = [PROFILE[0], PROFILE[k], PROFILE[k + 1]]; if (zc < 0) t.reverse(); for (const p of t) pos.push(p[0], p[1], zc); }
      // 성형 블록의 낮은 단은 어둡게, 레인 쪽 어깨에는 짧은 손잡이 홈 두 곳.
      const tint = [];
      for (let i=0; i<pos.length; i+=3) {
        const value = pos[i+1] < .25 ? .79 : 1;
        tint.push(value,value,value);
      }
      for (const z of [-.29,.29]) {
        const low=.55, high=.61;
        const x = y => .17 - .02*(y-.42)/.36 + .002;
        const a=[x(low),low,z-.047], b=[x(high),high,z-.047];
        const c=[x(high),high,z+.047], d=[x(low),low,z+.047];
        pos.push(...a,...b,...c,...a,...c,...d);
        for (let i=0; i<6; i++) tint.push(.44,.46,.50);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(tint,3)); g.computeVertexNormals(); return g;
    })();
    const count = Math.max(1, Math.round((uB-uA)/2));
    const mesh = new THREE.InstancedMesh(geom, std({ vertexColors: true, roughness: .72 }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), s = new THREE.Vector3();
    const phase = gapIn >= 0 ? entry[gapIn].index : 0;
    const Wp = u => pit.pointAt(u, wallAt(u));
    for (let k = 0; k < count; k++) {
      const ua = uA + (uB - uA) * k / count, ub = uA + (uB - uA) * (k + 1) / count, A = Wp(ua), B = Wp(ub), ex = B.x - A.x, ez = B.z - A.z, l = Math.hypot(ex, ez) || 0.01;
      const ox = -ez / l, oz = ex / l;   // 바깥(오른쪽)
      const ya = surfaceAt(A.x + ox * OUT, A.z + oz * OUT, mod(ua)), yb = surfaceAt(B.x + ox * OUT, B.z + oz * OUT, mod(ub));
      // 이음매 쪽 끝은 늘리지 않고 5 cm 비킨다
      const cutA = k === 0 ? 0.05 : -(l * 0.02 + 0.01), cutB = k === count - 1 ? 0.05 : -(l * 0.02 + 0.01), len = l - cutA - cutB, c = (cutA - cutB) / 2 / l;
      e.set(-Math.atan2(yb - ya, l), Math.atan2(ex, ez), 0); q.setFromEuler(e);
      p.set((A.x + B.x) / 2 + ex * c + ox * OUT, (ya + yb) / 2 + (yb - ya) * c, (A.z + B.z) / 2 + ez * c + oz * OUT); s.set(1, 1, len);
      mesh.setMatrixAt(k, m.compose(p, q, s)); mesh.setColorAt(k, (phase + k) % 3 === 0 ? C.blue : C.white);
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
    add(mesh, 'pit-barriers', { cast: true });
  }

  let triangles = 0;
  for (const mesh of meshes) { if (!mesh.visible) continue; const g = mesh.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3; triangles += mesh.isInstancedMesh ? t * mesh.count : t; }
  stats.meshes = meshes.filter(mesh => mesh.visible).length; stats.triangles = Math.round(triangles);
  stats.joints = { barrierFrom: +uA.toFixed(2), barrierTo: +uB.toFixed(2), dividerFrom: divider[0] ? +divider[0].a.toFixed(2) : null, dividerTo: divider[1] ? +divider[1].b.toFixed(2) : null };
  return { group, stats, dispose };
}
