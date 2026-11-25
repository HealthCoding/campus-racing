// 카트와 운전자 모델 — 외부 파일 없이 코드로 짓는다(약속 3.9).
//   const kart = createKartModel(THREE, { colour: '#1f4fb4' });
//   scene.add(kart.group);
//   매 화면: kart.group.position.set(x, y, z); kart.group.rotation.y = heading;  kart.update(view, dt);
// 원점 = 네 바퀴 가운데의 지면, 앞 = 로컬 +z, 왼쪽 = 로컬 +x(오른쪽은 −x), 단위 미터.
// 메인은 group 의 위치와 rotation.y(= 차체각 heading)만 정한다. 지면 기울기(view.pitch · roll)와 차체 쏠림은 안에서 한다.
// view: { speed(m/s), steer(−1~1, + = 오른쪽), slip(차체각 − 진행각, rad), pitch(+ = 앞이 들림), roll(+ = 오른쪽이 들림),
//         drifting, boost(남은 초), boostKind, kickReady, grounded }

import { BOOST_IGNITION_TIME } from './boost-style.js';

// 효과(effects.js)와 함께 쓰는 위치(로컬 미터).
export const KART_DIMENSIONS = { length: 1.8, width: 1.1, wheelbase: 1.3, track: 0.84, frontRadius: 0.14, rearRadius: 0.165 };
export const KART_POINTS = {
  rearWheels: [[0.42, -0.65], [-0.42, -0.65]],          // [x, z] 뒷바퀴가 땅에 닿는 곳
  exhausts: [[0.11, 0.292, -0.905], [-0.11, 0.292, -0.905]], // 배기구 끝 [x, y, z]
  exhaustDir: [0, 0.16, -0.99],                          // 배기 방향(로컬)
  frontCorners: [[0.52, 0.86], [-0.52, 0.86]],           // 앞 범퍼 모서리 [x, z]
};

export const KART_TYPES = ['balance', 'sprint', 'cruise', 'drift'];

const AX = 0.42, AZ = 0.65;          // 바퀴 중심의 x, z
const RF = 0.14, WF = 0.17;          // 앞바퀴 반지름 · 폭
const RR = 0.165, WR = 0.22;         // 뒷바퀴
const MAX_STEER = 0.59;              // 앞바퀴 최대 조향각(rad)

const C = {
  white: '#ecebe6', navy: '#15244a', carbon: '#1c1e23', chassis: '#2c2f35', rubber: '#1a1a1c',
  chrome: '#c4c8ce', steel: '#7b8088', darkSteel: '#4a4e55', rim: '#9aa0a8', rimDark: '#2a2c30',
  jacket: '#1d3e8e', sleeve: '#efeadc', rib: '#121d3c', pants: '#262b36', shoe: '#e4e4e2', glove: '#26272b',
  helmet: '#f2f2ef', visor: '#0c0f14', grip: '#151517', balaclava: '#1e1f22', lamp: '#ff2a18',
};

export function createKartModel(THREE, { colour = '#1f4fb4', envMap = true, type = 'balance', night = false } = {}) {
  if (!KART_TYPES.includes(type)) type = 'balance';
  const sprint = type === 'sprint', cruise = type === 'cruise', drift = type === 'drift';
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const { Vector3, Quaternion, Euler, Matrix4, Color, BufferGeometry, BufferAttribute } = THREE;
  const tmpC = new Color();

  // ── 기하 모으기: 재질별로 모아 한 덩어리로 합친다(꼭짓점 색으로 칠함) ──
  const bins = new Map();
  const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), v1 = new Vector3(), v2 = new Vector3();
  function put(bin, geo, colourHex, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    e.set(rot[0], rot[1], rot[2]); q.setFromEuler(e);
    m4.compose(v1.set(pos[0], pos[1], pos[2]), q, v2.set(scale[0], scale[1], scale[2]));
    geo.applyMatrix4(m4);
    paint(geo, colourHex);
    if (!bins.has(bin)) bins.set(bin, []);
    bins.get(bin).push(geo);
    return geo;
  }
  function paint(geo, colourHex) {
    tmpC.set(colourHex);
    const n = geo.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = tmpC.r; c[i * 3 + 1] = tmpC.g; c[i * 3 + 2] = tmpC.b; }
    geo.setAttribute('color', new BufferAttribute(c, 3));
    return geo;
  }
  // 같은 축으로 움직이는 부품의 정점과 인덱스를 하나의 그리기 호출로 묶는다.
  function merge(parts) {
    let nv = 0, ni = 0;
    for (const g of parts) {
      nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    const out = new BufferGeometry();
    for (const g of parts) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      col.set(g.attributes.color.array, vo * 3);
      if (g.index) {
        for (const i of g.index.array) idx[io++] = i + vo;
      } else {
        for (let i = 0; i < n; i++) idx[io++] = vo + i;
      }
      vo += n;
      g.dispose();
    }
    out.setAttribute('position', new BufferAttribute(pos, 3));
    out.setAttribute('normal', new BufferAttribute(nor, 3));
    out.setAttribute('color', new BufferAttribute(col, 3));
    out.setIndex(new BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  const take = bin => { const list = bins.get(bin) || []; bins.delete(bin); return list; };

  // ── 모양 도우미 ──
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  // 옆에서 본 윤곽(z, y)을 폭 방향(x)으로 밀어낸다. 'q' 항목은 [ 'q', 조절z, 조절y, z, y ] 둥근 모서리.
  function side(pts, width, bevel = 0.018, curve = 3) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p[0] === 'q') s.quadraticCurveTo(p[1], p[2], p[3], p[4]); else s.lineTo(p[0], p[1]); }
    const depth = Math.max(0.001, width - 2 * bevel);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: curve });
    g.rotateY(-Math.PI / 2);      // 윤곽의 x → 월드 z, 밀어낸 방향 → −x
    g.translate(depth / 2, 0, 0); // 가운데 맞춤
    g.deleteAttribute('uv');
    return g;
  }
  // 두 점 사이를 잇는 원기둥(축 = y 를 a→b 로 돌림)
  function rod(bin, a, b, r, colourHex, seg = 10, open = false) {
    const A = new Vector3(...a), B = new Vector3(...b), d = B.clone().sub(A), len = d.length();
    const g = cyl(r, r, len, seg, open);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
    g.translate(A.x, A.y, A.z);
    return put(bin, g, colourHex);
  }

  // ── 재질 ──
  const env = envMap ? makeEnv(THREE) : null;
  const mats = {
    shell: new THREE.MeshStandardMaterial({ vertexColors: true, envMap: env, roughness: 0.49, metalness: 0.12 }),
    glow: new THREE.MeshBasicMaterial({ color: '#61caff', toneMapped: false }),
    flame: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }),
  };
  if (night) {
    mats.shell.name = 'paint';
    mats.light = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 6.8 });
    mats.light.name = 'light';
  }

  // 단면을 뒤에서 앞으로 잇는다. 밑·옆·윗면 사이에 모따기 면을 남겨 갈라지는 빛으로 윤곽을 읽게 한다.
  function shell(bin, sections, colourHex, centreX = 0) {
    const vertices = [], indices = [];
    for (const [z, half, low, high] of sections) {
      const bevel = Math.min(0.035, half * 0.22, (high - low) / 3);
      const profile = [[-half + bevel, low], [half - bevel, low], [half, low + bevel],
        [half, high - bevel], [half - bevel, high], [-half + bevel, high], [-half, high - bevel], [-half, low + bevel]];
      for (const [x, y] of profile) vertices.push(x + centreX, y, z);
    }
    const end = (sections.length - 1) * 8;
    for (let i = 1; i < 7; i++) indices.push(0, i + 1, i, end, end + i, end + i + 1);
    for (let j = 0; j < end; j += 8) for (let i = 0; i < 8; i++) {
      const a = j + i, b = j + (i + 1) % 8;
      indices.push(a, b, b + 8, a, b + 8, a + 8);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    g.setIndex(indices);
    const flat = g.toNonIndexed();
    g.dispose();
    flat.computeVertexNormals();
    return put(bin, flat, colourHex);
  }

  // ── 짜임: group(메인이 위치·방향) → tilt(지면 기울기) → 바퀴들, sprung(차체 쏠림) → 차체 · 운전자 · 핸들 ──
  const group = new THREE.Group(); group.name = 'kart';
  const tilt = new THREE.Group(); group.add(tilt);
  const sprung = new THREE.Group(); sprung.name = 'chassis'; tilt.add(sprung);
  const meshes = [];
  const mesh = (geo, mat, parent, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = false; parent.add(m); meshes.push(m); return m; };

  const BLUE = colour;

  // 1. 바닥판 · 차대
  put('matte', box(0.78, 0.035, 1.56), C.chassis, [0, 0.066, -0.02]);
  put('metal', box(0.74, 0.03, 0.045), C.darkSteel, [0, 0.12, AZ]);                 // 앞 가로대(바퀴 안쪽까지)
  rod('metal', [-AX + 0.06, RR, -AZ], [AX - 0.06, RR, -AZ], 0.022, C.darkSteel, 10); // 뒤 차축
  put('metal', cyl(0.075, 0.075, 0.012, 16), C.steel, [-0.21, RR, -AZ], [0, 0, Math.PI / 2]);   // 브레이크 원판
  put('metal', cyl(0.06, 0.06, 0.016, 12), C.darkSteel, [0.24, RR, -AZ], [0, 0, Math.PI / 2]);  // 스프로킷

  // 노즈 · 앞 범퍼. 앞타이어 바깥 어깨와 윗면은 뒤에서 보이도록 비운다.
  const nose = sprint ? [[0.39, 0.115, 0.12, 0.28], [0.55, 0.202, 0.10, 0.286], [0.72, 0.19, 0.11, 0.21]]
    : cruise ? [[0.23, 0.13, 0.11, 0.30], [0.50, 0.26, 0.085, 0.28], [0.83, 0.29, 0.08, 0.15], [0.882, 0.23, 0.09, 0.13]]
    : [[0.33, 0.14, 0.10, 0.32], [0.49, 0.225, 0.09, 0.34], [0.76, 0.27, 0.08, 0.21], [0.85, 0.24, 0.08, 0.16]];
  shell('paint', nose, BLUE);
  shell('paint', nose.map(([z, half, low, top]) => [z, half * 0.22, top - 0.009, top + 0.003]), C.white);
  shell('paint', [[0.80, 0.39, 0.068, 0.13], [0.845, 0.52, 0.062, 0.145], [0.897, 0.46, 0.068, 0.118]], C.white);
  for (const s of [1, -1]) {
    const px = s * (drift ? 0.415 : 0.432);
    const pod = sprint ? [[-0.33, 0.046, 0.136, 0.213], [-0.18, 0.068, 0.125, 0.21], [0.29, 0.052, 0.125, 0.17]]
      : drift ? [[-0.48, 0.131, 0.074, 0.175], [-0.27, 0.13, 0.065, 0.227], [0.28, 0.105, 0.066, 0.159], [0.42, 0.077, 0.08, 0.13]]
      : [[-0.425, 0.073, 0.09, 0.246], [-0.31, 0.105, 0.074, 0.28], [0.21, 0.098, 0.072, 0.216], [0.43, 0.069, 0.09, 0.143]];
    shell('paint', pod, BLUE, px);
    shell('paint', pod.map(([z, w, low, top]) => [z, w * 0.20, top - 0.005, top + 0.003]), C.white, px + s * 0.017);
    rod('metal', [s * 0.36, 0.11, -0.5], [s * 0.47, 0.09, -0.27], 0.018, C.steel);
    rod('metal', [s * 0.47, 0.09, -0.27], [s * 0.46, 0.09, 0.36], 0.018, C.steel);
    rod('metal', [s * 0.46, 0.09, 0.36], [s * 0.26, 0.14, 0.50], 0.018, C.steel);
  }
  // 5. 좌석 — 짙은 셸, 등받이는 뒤로 누움
  put('paint', side([[-0.33, 0.12], [-0.50, 0.645], ['q', -0.525, 0.665, -0.548, 0.645], [-0.385, 0.105]], 0.44, 0.02), C.carbon);
  put('paint', box(0.40, 0.04, 0.26), C.carbon, [0, 0.12, -0.21]);
  for (const s of [1, -1]) put('paint', side([[-0.33, 0.12], [-0.47, 0.54], [-0.43, 0.55], [-0.24, 0.22], [-0.16, 0.13]], 0.04, 0.012), C.carbon, [s * 0.215, 0, 0]);
  put('paint', side([[-0.495, 0.62], ['q', -0.525, 0.668, -0.553, 0.64], [-0.548, 0.615], ['q', -0.522, 0.64, -0.5, 0.6]], 0.40, 0.006, 3), BLUE, [0, 0, 0]); // 등받이 윗테 파랑
  // 등받이 뒤의 색판은 타이어 사이로 보인다. 가운데에는 열을 빼는 좁은 홈.
  shell('paint', [[-0.543, 0.135, 0.555, 0.624], [-0.49, 0.193, 0.39, 0.615], [-0.418, 0.145, 0.24, 0.39]], BLUE);
  for (const x of [-0.085, 0, 0.085]) put('matte', box(0.044, 0.021, 0.008), C.navy, [x, 0.584, -0.545]);

  // 엔진의 주물, 알루미늄 핀, 작은 흡기통. 스프린트는 핀과 프레임을 드러낸다.
  put('metal', box(0.23, 0.13, 0.20), C.darkSteel, [0, 0.27, -0.665]);
  for (let i = 0; i < 4; i++) put('metal', box(0.24 - i * 0.014, 0.013, 0.15), C.chrome, [0, 0.344 + i * 0.022, -0.665]);
  shell('paint', [[-0.746, 0.092, 0.408, 0.434], [-0.647, 0.10, 0.411, 0.454], [-0.58, 0.071, 0.405, 0.432]], BLUE);
  put('metal', cyl(0.064, 0.052, 0.16), C.steel, [0.216, 0.31, -0.60], [0, 0, Math.PI / 2]);
  if (cruise) {
    shell('paint', [[-0.86, 0.26, 0.325, 0.375], [-0.73, 0.30, 0.255, 0.475], [-0.53, 0.25, 0.233, 0.445]], BLUE);
    for (const x of [-0.15, 0.15]) {
      rod('metal', [x, 0.38, -0.68], [x, 0.572, -0.778], 0.021, C.darkSteel);
    }
    shell('paint', [[-0.884, 0.502, 0.55, 0.621], [-0.791, 0.486, 0.55, 0.60], [-0.67, 0.46, 0.53, 0.566]], BLUE);
    for (const s of [1, -1]) shell('paint', [[-0.89, 0.017, 0.533, 0.654], [-0.705, 0.017, 0.514, 0.61]], C.white, s * 0.496);
  } else if (drift) {
    for (const s of [1, -1]) {
      rod('metal', [s * 0.36, 0.18, -0.67], [s * 0.31, 0.67, -0.58], 0.027, C.steel);
      rod('paint', [s * 0.31, 0.67, -0.58], [s * 0.22, 0.786, -0.51], 0.029, BLUE);
      rod('metal', [s * 0.31, 0.60, -0.59], [s * 0.415, 0.19, -0.83], 0.018, C.darkSteel);
      shell('paint', [[-0.84, 0.112, 0.27, 0.328], [-0.68, 0.118, 0.32, 0.385], [-0.52, 0.091, 0.29, 0.365]], BLUE, s * 0.428);
    }
    rod('paint', [-0.22, 0.786, -0.51], [0.22, 0.786, -0.51], 0.029, BLUE);
  } else if (!sprint) {
    // 기본형은 양옆에 높이 솟은 짧은 펜더, 가운데 열린 엔진실.
    for (const s of [1, -1]) {
      shell('paint', [[-0.84, 0.076, 0.28, 0.397], [-0.72, 0.105, 0.335, 0.489], [-0.52, 0.084, 0.302, 0.42]], BLUE, s * 0.39);
      put('paint', box(0.105, 0.026, 0.006), C.white, [s * 0.39, 0.365, -0.842]);
    }
  }

  // 배기관의 중심선과 불꽃은 같은 원점과 방향을 쓴다.
  const exhaustAngle = Math.atan2(KART_POINTS.exhaustDir[1], -KART_POINTS.exhaustDir[2]);
  const pipeRadius = cruise ? 0.057 : sprint ? 0.040 : 0.048;
  for (const [x, y, z] of KART_POINTS.exhausts) {
    const end = [x, y, z], start = [x, y - 0.026, z + 0.161];
    rod('metal', [x * 0.6, 0.255, -0.67], start, 0.026, C.darkSteel);
    rod('metal', start, end, pipeRadius, C.steel, 16, true);
    put('metal', new THREE.TorusGeometry(pipeRadius, 0.006, 5, 16), C.chrome, end, [exhaustAngle, 0, 0]);
    put('matte', new THREE.CircleGeometry(pipeRadius, 16), C.carbon, [x, y - 0.002, z + 0.012], [Math.PI + exhaustAngle, 0, 0]);
    const outlet = new THREE.Group();
    outlet.name = x > 0 ? 'exhaustLeft' : 'exhaustRight';
    outlet.position.set(...end); sprung.add(outlet);
  }

  // 뒤 충돌대와 디퓨저. 가속형은 빈 삼각형 공간을 둔 튜브식 보호대.
  if (sprint) {
    for (const s of [1, -1]) {
      rod('metal', [s * 0.24, 0.095, -0.76], [s * 0.50, 0.205, -0.85], 0.021, C.steel);
      rod('paint', [s * 0.50, 0.205, -0.85], [s * 0.28, 0.14, -0.885], 0.025, BLUE);
    }
    rod('paint', [-0.28, 0.14, -0.885], [0.28, 0.14, -0.885], 0.026, BLUE);
  } else {
    const half = drift ? 0.546 : cruise ? 0.49 : 0.512;
    shell('paint', [[-0.901, half - 0.043, 0.081, 0.183], [-0.864, half, 0.063, drift ? 0.218 : 0.207], [-0.812, half - 0.035, 0.080, 0.179]], BLUE);
    shell('matte', [[-0.899, 0.231, 0.050, 0.101], [-0.817, 0.32, 0.048, 0.104]], C.carbon);
    for (const x of [-0.18, -0.09, 0, 0.09, 0.18]) put('matte', box(0.014, 0.045, 0.069), C.darkSteel, [x, 0.054, -0.866]);
  }
  for (const s of [1, -1]) {
    const x = s * (sprint ? 0.188 : 0.359), y = sprint ? 0.147 : 0.146;
    put('matte', box(0.126, 0.044, 0.018), C.navy, [x, y, -0.899]);
    put('lamp', box(0.101, 0.019, 0.005), C.lamp, [x, y + 0.004, -0.910]);
    if (night) put('lamp', new THREE.PlaneGeometry(0.135, 0.023), '#fff6ef', [s * 0.33, 0.10, 0.905]);
  }
  // 9. 조향 기둥
  rod('metal', [0, 0.22, 0.47], [0, 0.45, 0.14], 0.016, C.steel, 8);
  // 10. 운전자 다리(앉은 자세, 무릎이 핸들 아래) · 신발
  const HIP = [0, 0.205, -0.22];
  for (const s of [1, -1]) {
    capsule('matte', [s * 0.095, 0.205, -0.24], [s * 0.13, 0.285, 0.13], 0.062, C.pants);
    capsule('matte', [s * 0.13, 0.285, 0.13], [s * 0.12, 0.2, 0.43], 0.05, C.pants);
    put('matte', box(0.09, 0.075, 0.16), C.shoe, [s * 0.12, 0.175, 0.49], [-0.35, 0, 0]);
  }
  function capsule(bin, a, b, r, colourHex, radial = 7) {
    const A = new Vector3(...a), B = new Vector3(...b), d = B.clone().sub(A), len = d.length();
    const g = new THREE.CapsuleGeometry(r, len, 2, radial);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
    g.translate(A.x, A.y, A.z);
    g.deleteAttribute('uv');
    return put(bin, g, colourHex);
  }

  const lampParts = take('lamp');
  const chassisParts = [...take('paint'), ...take('matte'), ...take('metal')];
  const lampStart = chassisParts.reduce((sum, g) => sum + g.attributes.position.count, 0);
  const body = mesh(merge(night ? chassisParts : [...chassisParts, ...lampParts]), mats.shell, sprung, 'body');
  if (night) mesh(merge(lampParts), mats.light, sprung, 'driving-lenses');
  const brakeColours = body.geometry.attributes.color;
  const litLamp = new Color('#ff6741').multiplyScalar(2), idleLamp = new Color(C.lamp);

  for (const [x, y, z] of KART_POINTS.exhausts) put('glow', new THREE.CircleGeometry(pipeRadius * 0.9, 16),
    '#ffffff', [x, y - 0.001, z + 0.006], [Math.PI + exhaustAngle, 0, 0]);
  const glow = mesh(merge(take('glow')), mats.glow, sprung, 'exhaustGlow');
  glow.castShadow = false;
  const jet = makeTwinFlames(THREE);
  const flames = mesh(jet.geometry, mats.flame, sprung, 'flames');
  flames.position.set(0, KART_POINTS.exhausts[0][1], KART_POINTS.exhausts[0][2]);
  flames.rotation.x = exhaustAngle;
  flames.castShadow = false;

  // 타이어·림·살·트레드 표식을 한 기하에 굽는다. 두 뒷바퀴는 한 차축으로 회전한다.
  function wheelGeo(R, W, left) {
    const bevel = W * 0.12, inner = R * 0.62;
    const profile = [[inner, -W / 2], [R * 0.82, -W / 2], [R * 0.96, -W / 2 + bevel * 0.4],
      [R, -W / 2 + bevel], [R, W / 2 - bevel], [R * 0.96, W / 2 - bevel * 0.4],
      [R * 0.82, W / 2], [inner, W / 2]];
    const tyre = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20);
    put('wheel', tyre, C.rubber);
    const face = W / 2;
    put('wheel', cyl(inner, inner, W * 0.91, 16), C.rimDark);
    put('wheel', new THREE.TorusGeometry(inner, 0.007, 4, 20), C.chrome, [0, face, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      put('wheel', box(inner * 0.76, 0.012, R * 0.13), i === 0 ? C.white : C.rim,
        [Math.cos(a) * inner * 0.58, face, -Math.sin(a) * inner * 0.58], [0, a + 0.20, 0]);
    }
    put('wheel', cyl(0.025, 0.029, 0.016, 6), BLUE, [0, face + 0.008, 0]);
    // 한쪽이 짧은 두 표식은 바깥 림이 가려지는 추격 시점에서도 고무 위로 돌아간다.
    for (const a of [0, 0.42, Math.PI + 0.24]) {
      put('wheel', box(R * 0.105, W * (a === 0 ? 0.51 : 0.31), 0.004), a === 0 ? '#829094' : '#4e575d',
        [Math.sin(a) * (R - 0.001), W * 0.13, Math.cos(a) * (R - 0.001)], [0, a, 0]);
    }
    const all = merge(take('wheel'));
    all.rotateZ(-Math.PI / 2);
    if (!left) all.rotateY(Math.PI);
    return all;
  }
  const fronts = [1, -1].map(s => {
    const name = s > 0 ? 'frontLeft' : 'frontRight';
    const mount = new THREE.Group();
    mount.name = name + 'Steer'; mount.position.set(s * AX, RF, AZ); tilt.add(mount);
    return { mount, spin: mesh(wheelGeo(RF, WF, s > 0), mats.shell, mount, name + 'Wheel') };
  });
  const rear = mesh(merge([wheelGeo(RR, WR, true).translate(AX, 0, 0),
    wheelGeo(RR, WR, false).translate(-AX, 0, 0)]), mats.shell, tilt, 'rearWheels');
  rear.position.set(0, RR, -AZ);

  // ── 핸들: 기울어진 판 위에서 돈다. 장갑도 같이 돈다 ──
  const steerMount = new THREE.Group(); steerMount.position.set(0, 0.47, 0.125); steerMount.rotation.x = -0.45; sprung.add(steerMount);
  const steerSpin = new THREE.Group(); steerSpin.name = 'steeringWheel'; steerMount.add(steerSpin);
  const WHEEL_R = 0.12;
  put('matte', new THREE.TorusGeometry(WHEEL_R, 0.016, 5, 14), C.grip);
  put('matte', box(0.22, 0.028, 0.02), C.grip, [0, -0.01, 0]);
  put('matte', cyl(0.036, 0.036, 0.035, 10), C.darkSteel, [0, 0, 0.005], [Math.PI / 2, 0, 0]);
  const GRIP = [0.25, Math.PI - 0.25];                   // 왼손 · 오른손 자리(핸들 판 위 각도)
  for (const a of GRIP) put('matte', new THREE.SphereGeometry(0.036, 8, 6), C.glove, [Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, -0.012], [0, 0, a], [1.25, 0.95, 1]);
  put('matte', box(0.029, 0.025, 0.026), C.white, [0, WHEEL_R, 0]);
  mesh(merge(take('matte')), mats.shell, steerSpin, 'steering-wheel');

  // ── 상체: 엉덩이를 축으로 기운다. 야구 점퍼(파란 몸판 · 흰 소매 · 줄무늬 시보리), 글자 · 표장 없음 ──
  const torso = new THREE.Group(); torso.name = 'torso'; torso.position.set(...HIP); sprung.add(torso);
  const TORSO_BASE = -0.27;                               // 등받이를 따라 뒤로 누운 각
  const tScale = [1.32, 1, 0.85];
  put('matte', new THREE.CapsuleGeometry(0.155, 0.2, 3, 11), C.jacket, [0, 0.255, 0], [0, 0, 0], tScale);
  put('matte', cyl(0.158, 0.158, 0.05, 12, true), C.rib, [0, 0.07, 0], [0, 0, 0], tScale);
  put('matte', cyl(0.16, 0.16, 0.012, 12, true), C.white, [0, 0.07, 0], [0, 0, 0], tScale);
  put('matte', new THREE.TorusGeometry(0.068, 0.022, 5, 12), C.rib, [0, 0.505, 0.0], [Math.PI / 2, 0, 0], [1.15, 1, 1]);
  put('matte', new THREE.TorusGeometry(0.07, 0.006, 3, 12), C.white, [0, 0.52, 0.0], [Math.PI / 2, 0, 0], [1.15, 1, 1]);
  put('matte', cyl(0.046, 0.05, 0.08, 8), C.balaclava, [0, 0.54, 0.005]);
  const SHOULDER = [[0.19, 0.42, 0.0], [-0.19, 0.42, 0.0]];
  for (const [x, y, z] of SHOULDER) {
    put('matte', new THREE.SphereGeometry(0.073, 10, 6), C.sleeve, [x, y, z], [0, 0, x], [1, 0.93, 1.15]);
    put('matte', new THREE.SphereGeometry(0.067, 10, 5), BLUE, [x, y + 0.02, z - 0.015], [0, 0, x], [1, 0.80, 1.15]);
  }
  mesh(merge(take('matte')), mats.shell, torso, 'driver-torso');

  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.535, 0.01); torso.add(head);
  const hS = [0.95, 1, 1.07], HC = [0, 0.125, 0.0];
  // 정점 위치를 공유하는 헬멧 단면. 바이저·옆 띠·정수리 띠의 경계에서 면이 겹치지 않는다.
  const cap = put('paint', new THREE.SphereGeometry(0.144, 24, 14).toNonIndexed(), C.helmet, HC, [0, 0, 0], hS);
  const capPosition = cap.attributes.position, capColours = cap.attributes.color;
  for (let i = 0; i < capPosition.count; i += 3) {
    const mid = v1.fromBufferAttribute(capPosition, i).add(v2.fromBufferAttribute(capPosition, i + 1))
      .add(v2.fromBufferAttribute(capPosition, i + 2)).divideScalar(3);
    const y = mid.y - HC[1];
    const front = Math.atan2(mid.x, mid.z);
    const band = y < -0.013 && y > -0.054;
    const crown = y > -0.048 && Math.abs(mid.x) < 0.026;
    const visor = Math.abs(front) < 1.28 && y > -0.03 && y < 0.083;
    const faceColour = visor ? (y > 0.047 ? '#304656' : C.visor) : band || crown ? BLUE : C.helmet;
    tmpC.set(faceColour);
    for (let j = i; j < i + 3; j++) capColours.setXYZ(j, tmpC.r, tmpC.g, tmpC.b);
  }
  for (const s of [1, -1]) put('paint', cyl(0.021, 0.021, 0.014, 10), C.steel,
    [s * 0.129, 0.135, 0.035], [0, 0, Math.PI / 2]);
  shell('paint', [[-0.156, 0.057, 0.13, 0.15], [-0.12, 0.10, 0.134, 0.168]], C.navy);
  put('paint', new THREE.TorusGeometry(0.108, 0.02, 4, 14), C.visor, [0, 0.03, -0.012], [Math.PI / 2 + 0.25, 0, 0], [1, 1.12, 1]);   // 헬멧 아래 테
  mesh(merge(take('paint')), mats.shell, head, 'driver-helmet');

  // ── 팔: 어깨(상체) → 손(핸들)을 매 화면 두 마디로 잇는다 ──
  const UPPER = 0.283, FORE = 0.267;
  function armGeo(len, r, cuff) {
    const g = paint(new THREE.CapsuleGeometry(r, len, 2, 7), C.sleeve); g.translate(0, len / 2, 0); g.deleteAttribute('uv');
    const list = [g];
    if (cuff) {
      const c1 = paint(cyl(r * 1.08, r * 1.08, 0.045, 7, true), C.rib); c1.translate(0, len - 0.035, 0); c1.deleteAttribute('uv');
      const c2 = paint(cyl(r * 1.11, r * 1.11, 0.009, 7, true), C.white); c2.translate(0, len - 0.04, 0); c2.deleteAttribute('uv');
      list.push(c1, c2);
    }
    return merge(list);
  }
  // 네 마디를 한 번에 그린다. 각 꼭짓점은 한 뼈에만 묶이고, 손은 핸들에 붙어 있다.
  const segments = [armGeo(UPPER, 0.048, false), armGeo(FORE, 0.041, true),
    armGeo(UPPER, 0.048, false), armGeo(FORE, 0.041, true)];
  const armVertices = segments.reduce((sum, g) => sum + g.attributes.position.count, 0);
  const ids = new Uint16Array(armVertices * 4), weights = new Float32Array(armVertices * 4);
  let offset = 0;
  const bones = segments.map((g, i) => {
    for (let n = 0; n < g.attributes.position.count; n++, offset += 4) { ids[offset] = i; weights[offset] = 1; }
    return new THREE.Bone();
  });
  const armGeometry = merge(segments);
  armGeometry.setAttribute('skinIndex', new BufferAttribute(ids, 4));
  armGeometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));
  const sleeves = new THREE.SkinnedMesh(armGeometry, mats.shell);
  sleeves.name = 'sleeves'; sleeves.castShadow = true;
  sprung.add(sleeves); sleeves.add(...bones); sleeves.bind(new THREE.Skeleton(bones)); meshes.push(sleeves);
  sleeves.boundingSphere = new THREE.Sphere(new Vector3(0, 0.47, -0.06), 0.62);
  const arms = [{ upper: bones[0], fore: bones[1], side: 1 }, { upper: bones[2], fore: bones[3], side: -1 }];

  // ── 움직임 상태 ──
  const st = { spinF: 0, spinR: 0, yaw: 0, steerTurn: 0, prevSpeed: 0, acc: 0, lat: 0, roll: 0, pitch: 0, lean: 0, tuck: 0, headYaw: 0,
    bobY: 0, bobV: 0, wasGrounded: true, air: 0, droop: 0, time: 0, tiltX: 0, tiltZ: 0, brake: false, leanVelocity: 0, flameKind: '', flameOn: false, flameBurst: 0, first: true };
  const sm = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const Y = new Vector3(0, 1, 0), S = new Vector3(), H = new Vector3(), E = new Vector3(), dir = new Vector3(), pole = new Vector3(), tmp = new Vector3();

  function placeArms() {
    torso.updateMatrix(); steerSpin.updateMatrix();
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      const sh = SHOULDER[arm.side > 0 ? 0 : 1], a = GRIP[arm.side > 0 ? 0 : 1];
      S.set(sh[0], sh[1], sh[2]).applyMatrix4(torso.matrix);
      H.set(Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, -0.03).applyMatrix4(steerSpin.matrix).applyMatrix4(steerMount.matrix);
      dir.subVectors(H, S); let d = dir.length(); dir.divideScalar(d || 1);
      d = clamp(d, Math.abs(UPPER - FORE) + 0.01, UPPER + FORE - 0.002);
      H.copy(S).addScaledVector(dir, d);
      const x = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d), h = Math.sqrt(Math.max(0, UPPER * UPPER - x * x));
      pole.set(arm.side * 1, -0.55, -0.25); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      E.copy(S).addScaledVector(dir, x).addScaledVector(pole, h);
      arm.upper.position.copy(S); arm.upper.quaternion.setFromUnitVectors(Y, tmp.subVectors(E, S).normalize());
      arm.fore.position.copy(E); arm.fore.quaternion.setFromUnitVectors(Y, tmp.subVectors(H, E).normalize());
    }
  }

  function update(view = {}, dt = 1 / 60) {
    dt = clamp(dt || 0, 0, 0.1);
    const speed = +view.speed || 0, steer = clamp(+view.steer || 0, -1, 1), slip = +view.slip || 0;
    const drifting = !!view.drifting, boost = +view.boost || 0, grounded = view.grounded !== false;
    st.time += dt;
    const motionScale = motion?.matches ? 0.42 : 1;
    // 가감속(앞뒤 쏠림)과 옆 가속(코너 쏠림) 어림
    if (st.first) { st.prevSpeed = speed; st.first = false; }
    const accRaw = dt > 0 ? (speed - st.prevSpeed) / dt : 0; st.prevSpeed = speed;
    st.acc = sm(st.acc, clamp(accRaw, -14, 10), 0.12, dt);
    const v = Math.abs(speed);
    let kappa = steer / (3 + 0.05 * v * v);                                          // 일반 곡률(오른쪽 +)
    if (drifting) { const d = slip !== 0 ? -Math.sign(slip) : Math.sign(steer); kappa = d * (0.75 + 0.25 * d * steer) / (3.3 + 0.04 * v * v); }
    const latTarget = grounded ? clamp(v * v * kappa * Math.sign(speed || 1), -14, 14) : 0;  // m/s², 오른쪽으로 도는 쪽이 +
    st.lat = sm(st.lat, latTarget, 0.1, dt);

    // 바퀴 회전(앞으로 굴면 윗면이 +z 로 → rotation.x 가 커짐). 드리프트 · 가속 때 뒷바퀴가 조금 헛돈다.
    st.spinF = (st.spinF + speed / RF * dt * (grounded ? 1 : 0.6)) % (2 * Math.PI);
    st.spinR = (st.spinR + speed * (drifting ? 1.12 : 1) / RR * dt) % (2 * Math.PI);
    // 운전자가 잡은 각을 우선하고, 손을 풀수록 바퀴가 미끄러지는 진행 방향으로 정렬된다.
    const counter = clamp(-slip * 0.9, -0.48, 0.48);
    const assist = drifting ? 1 : clamp((Math.abs(slip) - 0.12) / 0.2, 0, 1);
    const yaw = -steer * MAX_STEER + counter * assist * (1 - Math.abs(steer));
    st.yaw = sm(st.yaw, yaw, 0.055, dt);
    st.steerTurn = -st.yaw / MAX_STEER * 1.18;                                         // 핸들 돌림(오른쪽 + = 시계 방향)

    // 공중 · 착지
    if (!grounded) st.air += dt; else {
      if (!st.wasGrounded && st.air > 0.08) st.bobV -= clamp(0.25 + st.air * 0.9, 0, 1.1);
      st.air = 0;
    }
    st.wasGrounded = grounded;
    st.droop = sm(st.droop, grounded ? 0 : 0.035, grounded ? 0.04 : 0.12, dt);
    // 임계 감쇠의 해를 직접 적분한다. 100ms 프레임에도 착지 뒤 진동이 커지지 않는다.
    const decay = Math.exp(-16 * dt), bounce = st.bobV + 16 * st.bobY;
    st.bobY = (st.bobY + bounce * dt) * decay;
    st.bobV = (st.bobV - 16 * bounce * dt) * decay;

    const rollT = clamp(-st.lat * 0.0036, -0.052, 0.052) + (drifting ? -Math.sign(st.lat) * 0.022 : 0);
    st.roll = sm(st.roll, rollT, 0.095, dt);
    const pitchT = clamp(-st.acc * 0.0035, -0.035, 0.03) + (boost > 0 ? -0.022 : 0) + (grounded ? 0 : -0.03);
    st.pitch = sm(st.pitch, pitchT, 0.1, dt);
    sprung.position.y = st.bobY * motionScale;
    sprung.rotation.set(st.pitch * motionScale, 0, st.roll * motionScale);

    // 지면 기울기(물리값, + = 앞 들림 · 오른쪽 들림)
    st.tiltX = sm(st.tiltX, -(+view.pitch || 0), 0.05, dt);
    st.tiltZ = sm(st.tiltZ, -(+view.roll || 0), 0.05, dt);
    tilt.rotation.set(st.tiltX, 0, st.tiltZ);

    for (let i = 0; i < fronts.length; i++) {
      const wheel = fronts[i];
      wheel.mount.rotation.y = st.yaw;
      wheel.mount.position.y = RF - st.droop;
      wheel.spin.rotation.x = st.spinF;
    }
    rear.rotation.x = st.spinR; rear.position.y = RR - st.droop;
    steerSpin.rotation.z = st.steerTurn;

    // 허리와 목은 함께 코너 안쪽으로. 입력을 놓으면 허리 스프링이 천천히 펴진다.
    const slide = drifting ? clamp(-slip / 0.32, -1, 1) : 0;
    const direction = steer + slide * (1 - Math.abs(steer));
    const leanTarget = direction * (drifting ? 0.38 : 0.24) * motionScale;   // 메인이 다듬음: 뒤에서도 읽히게(그 전 0.32 · 0.18)
    const leanError = st.lean - leanTarget, impulse = st.leanVelocity + 15 * leanError;
    const leanDecay = Math.exp(-15 * dt);
    st.lean = leanTarget + (leanError + impulse * dt) * leanDecay;
    st.leanVelocity = (st.leanVelocity - 15 * impulse * dt) * leanDecay;
    st.tuck = sm(st.tuck, (boost > 0 ? 0.16 : 0) + clamp(st.acc * 0.006, -0.04, 0.05) + (grounded ? 0 : -0.06), 0.1, dt);
    st.headYaw = sm(st.headYaw, -direction * (drifting ? 0.32 : 0.18) * motionScale, 0.13, dt);
    torso.rotation.set(TORSO_BASE + (st.tuck - st.bobY) * motionScale, 0, st.lean);
    head.rotation.set(-st.tuck * 0.5 * motionScale, st.headYaw, st.lean * 0.7);
    placeArms();

    const braking = night && view.braking !== undefined ? view.braking : st.acc < -3 && v > 0.5;
    if (braking !== st.brake) {
      st.brake = braking;
      if (night) mats.light.emissiveIntensity = braking ? 13 : 6.8;
      else {
        const c = braking ? litLamp : idleLamp;
        for (let i = lampStart; i < brakeColours.count; i++) brakeColours.setXYZ(i, c.r, c.g, c.b);
        brakeColours.needsUpdate = true;
      }
    }
    const ghost = mats.shell.transparent && mats.shell.opacity < 1;
    flames.visible = boost > 0 && !ghost;
    glow.visible = !!view.kickReady && boost <= 0 && !ghost;
    if (flames.visible) {
      const kind = Object.hasOwn(JETS, view.boostKind) ? view.boostKind : 'item', calm = !!motion?.matches;
      if (!st.flameOn || kind !== st.flameKind) st.flameBurst = 1;        // 켜지는 순간(가속 중에 종류가 바뀔 때도) 한 번 길게 뿜는다
      if (kind !== st.flameKind) { jet.setKind(kind); st.flameKind = kind; }
      st.flameBurst *= Math.exp(-dt / 0.16);
      const pulse = 0.067 * Math.sin(st.time * 39) + 0.033 * Math.sin(st.time * 67);
      flames.scale.z = JETS[kind].length * (1 + pulse * (calm ? 0.1 : 1) + (calm ? 0 : 0.55 * st.flameBurst));
    } else { flames.scale.z = 0; st.flameBurst = 0; }
    st.flameOn = flames.visible;
  }
  steerMount.updateMatrix();
  update({ speed: 0 }, 0);

  let triangles = 0;
  for (const m of meshes) triangles += m.geometry.index.count / 3;
  const materials = Object.values(mats);
  return {
    group, update, materials: mats,
    headlightMount: night ? { frame: tilt, bumperZ: KART_POINTS.frontCorners[0][1] } : null,
    stats: { triangles, meshes: meshes.length, materials: materials.length, drawCalls: meshes.length },
    dispose() { for (const m of meshes) m.geometry.dispose(); for (const material of materials) material.dispose(); sleeves.skeleton.dispose(); env?.dispose(); group.removeFromParent(); },
  };
}

// 선형 색 공간의 정점색과 알파를 쓴다. 바깥 불꽃을 먼저, 짧은 심을 나중에 그려 한 호출로 겹친다.
export const JETS = {
  item:  { length: 1.7, rim: '#ff9b36', tip: '#ff501b', core: '#ffefb3' },
  kick:  { length: 0.75, rim: '#72caff', tip: '#3164fa', core: '#e1f7ff' },
  start: { length: 1.05, rim: '#ffe763', tip: '#ffa916', core: '#fffbd0' },
  pad:   { length: 1.2, rim: '#5cf3ed', tip: '#129bcc', core: '#e3fffa' },
};

// xs: 불꽃 둘의 좌우 자리(로컬 x). 차량 모델(vehicles.js)은 제 배기구 자리를 준다.
export function makeTwinFlames(THREE, xs = KART_POINTS.exhausts.map(e => e[0])) {
  const xyz = [], indices = [], roles = [], alpha = [];
  const sides = 10;
  function plume(x, core) {
    const start = xyz.length / 3;
    // [길이 비율, 반지름, 색 역할, 알파] — 입구는 고정하고 중간에서 한 번 부푼 뒤 가늘어진다.
    const rings = core
      ? [[0, 0.03, 'core', 1], [0.14, 0.085, 'core', 1], [0.31, 0.06, 'core', 0.98], [0.62, 0.004, 'rim', 0.83]]
      : [[0, 0.045, 'rim', 0.9], [0.17, 0.165, 'rim', 0.9], [0.43, 0.14, 'tip', 0.78],
        [0.66, 0.085, 'rim', 0.66], [1, 0.004, 'tip', 0.3]];   // 메인이 다듬음: 추격 시점(뒤 6 m · 위 3 m)에서 읽히게 굵게
    for (const [t, radius, role, opacity] of rings) {
      for (let i = 0; i < sides; i++) {
        const a = i * 2 * Math.PI / sides, ripple = 1 + 0.12 * Math.sin(3 * a + t * 9);
        xyz.push(x + Math.sign(x) * 0.047 * t + Math.cos(a) * radius * ripple,
          Math.sin(a) * radius * ripple + t * t * 0.09, -t);   // 꼬리가 위로 들린다(위에서 내려다보는 카메라에 길이가 보이게)
        roles.push(role); alpha.push(opacity);
      }
    }
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < sides; i++) {
      const a = start + j * sides + i, b = start + j * sides + (i + 1) % sides;
      indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
    const last = start + (rings.length - 1) * sides;
    for (let i = 1; i < sides - 1; i++) indices.push(start, start + i, start + i + 1, last, last + i + 1, last + i);
  }
  for (const core of [false, true]) for (const x of xs) plume(x, core);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const colors = new THREE.BufferAttribute(new Float32Array(roles.length * 4), 4);
  geometry.setAttribute('color', colors);
  const palettes = {};
  for (const [kind, spec] of Object.entries(JETS)) {
    const rim = new THREE.Color(spec.rim), tip = new THREE.Color(spec.tip), core = new THREE.Color(spec.core);
    const rgba = new Float32Array(colors.array.length);
    for (let i = 0; i < roles.length; i++) {
      const c = roles[i] === 'core' ? core : roles[i] === 'tip' ? tip : rim;
      c.toArray(rgba, i * 4); rgba[i * 4 + 3] = alpha[i];
    }
    palettes[kind] = rgba;
  }
  colors.array.set(palettes.item);
  return { geometry, setKind(kind) { colors.array.set(palettes[kind]); colors.needsUpdate = true; } };
}

// 금속 · 칠이 어두운 곳에서도 비치게, 하늘 · 땅 두 빛깔의 작은 반사 그림(캔버스, 한 번만 만듦).
function makeEnv(THREE) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const g = cv.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#dfe9f5'); grad.addColorStop(0.45, '#b9c8d8'); grad.addColorStop(0.52, '#7c7b76'); grad.addColorStop(1, '#3d3c39');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 64);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(30, 8, 26, 10);            // 밝은 창 하나 — 칠에 맺히는 반짝임
  const t = new THREE.CanvasTexture(cv); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 차량용 분사·잔상. 모델 하나당 재질 하나와 색 있는 기하 하나를 쓴다.
// 종류가 바뀔 때만 버퍼를 갱신하고 박자·점화·소진은 출원점에 고정한 메시 변환으로 그린다.
const BOOST_SHAPES = {
  item:  { reach: 1,   width: 1,    spread: 1 },
  kick:  { reach: .49, width: .57,  spread: .66 },
  start: { reach: .76, width: 1.38, spread: 1.26 },
  pad:   { reach: .84, width: .84,  spread: .88 },
};

function buildBoostShape(THREE, spec, origins, base, kind, look, halfWidth) {
  const xyz = [], colors = [], indices = [], sootAlpha = [];
  const profile = BOOST_SHAPES[kind], shape = spec.shape;
  const length = spec.length * profile.reach, radius = spec.radius * profile.width;
  const palette = {
    rim: kind === 'pad' ? '#38f6df' : spec.rim,
    tip: kind === 'pad' ? '#14abc5' : spec.tip,
    core: kind === 'pad' ? '#d8fff1' : spec.core,
    soot: '#474747', sootRim: kind === 'pad' ? '#68c3bd' : '#858b91',
  };
  for (const key of Object.keys(palette)) palette[key] = new THREE.Color(palette[key]);
  if (shape === 'casters') palette.rim.multiplyScalar(.68);
  function vertex(x, y, z, role, opacity) {
    const c = palette[role];
    xyz.push(x - base[0], y - base[1], z - base[2]);
    colors.push(c.r, c.g, c.b, opacity);
    if (shape === 'diesel') sootAlpha.push(role === 'soot' || role === 'sootRim' ? opacity : 0);
    return xyz.length / 3 - 1;
  }
  // 중심선은 배기구에 붙어 곧장 뒤(−z)로 간다(3차 — 차체 폭 밖으로 휘지 않는다).
  // 포뮬러는 간격 13 cm의 두 입구를 한 축으로 모은다. 레이싱 카트 단관만 5°쯤 바깥으로 기운다.
  function axisX(x, t) {
    if (shape === 'diamonds') return x * Math.max(0, 1 - t / .13);
    if (shape === 'backfire') return x + Math.sign(x) * .09 * t * profile.reach;
    return x;
  }
  function tube([x,y,z], rings, sides, flat = 1) {
    const start = xyz.length / 3;
    // 레이싱 카트는 노면 쪽으로 숙여 위 뒤 카메라에 길이가 드러나게, GT 는 꼬리가 조금 들린다.
    const rise = shape === 'backfire' ? -.20 : shape === 'v8' ? .08 : .05;
    for (const [t, r, role, opacity] of rings) {
      for (let i = 0; i < sides; i++) {
        const a = i * Math.PI * 2 / sides;
        vertex(axisX(x, t) + Math.cos(a) * radius * r,
          y + Math.sin(a) * radius * r * flat + rise * t, z - length * t, role, opacity);
      }
    }
    for (let j = 1; j < rings.length; j++) for (let i = 0; i < sides; i++) {
      const a = start + (j - 1) * sides + i, b = start + (j - 1) * sides + (i + 1) % sides;
      indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  function jet(p) {
    const flat = shape === 'oval' ? .56 : shape === 'diesel' ? .70 : .88;
    tube(p, [[0,.22,'rim',.76],[.17,1,'rim',.82],[.42,.87,'rim',.67],
      [.69,.55,'tip',.57],[1,.015,'tip',.16]], 8, flat);
    if (shape === 'v8') {
      // V8: 둥글고 굵은 불꽃 속에 길게 남는 흰 속심과 짧은 충격 마디 둘(세단의 납작한 타원과 갈린다).
      tube(p, [[0,.24,'core',.99],[.15,.58,'core',.99],[.40,.46,'core',.95],
        [.66,.26,'core',.85],[.86,.012,'rim',.6]], 8, flat);
      for (const [at, r] of [[.22,.84],[.45,.70]]) {
        tube(p, [[at,.30,'core',.0],[at+.035,r,'core',1],[at+.075,.30,'core',.0]], 6, flat);
      }
      return;
    }
    tube(p, [[0,.20,'core',.99],[.19,.64,'core',.99],[.47,.38,'core',.90],
      [.77,.012,'rim',.65]], 8, flat);
  }
  function diamonds() {
    for (const p of origins) tube(p, [[0,.24,'core',1],[.06,.51,'core',.97],
      [.14,.33,'rim',.76]], 6);
    const centre = [base[0], base[1], base[2]];
    tube(centre, [[.10,.56,'core',.65],[.20,1,'rim',.65],[.70,.69,'tip',.59],
      [1,.005,'tip',.16]], 8);
    for (const [at, span] of [[.12,.26],[.39,.24],[.64,.22]]) {
      tube(centre, [[at,.06,'rim',.85],[at + span*.43,.75,'core',1],
        [at + span,.035,'core',.68]], 5);
    }
  }
  // 같은 호출 안에서 색이 가장자리로 사라지는 매연 덩어리. 기울인 면이라
  // 위쪽 추격과 낮은 뒤쪽 시점에서 모두 보인다. 움직여 흩어지는 매연은 입자 풀 몫이다.
  function haze([x,y,z], t, r, offset) {
    // 퍼지는 가장자리도 차 폭의 1.2배 안(3차).
    if (halfWidth) r = Math.min(r, halfWidth * 1.2 - .01 - Math.abs(x + offset));
    const strength = look === 'a' ? .66 : look === 'c' ? 1.24 : 1;
    const cy = y + .21 + t * .28, cz = z - length * t;
    const mid = vertex(x + offset, cy, cz, 'soot', .78 * strength);
    const n = 9;
    for (const fraction of [.50, 1]) {
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 2 * i / n, h = r * fraction * Math.sin(a);
        const edge = fraction === 1;
        vertex(x + offset + r * fraction * Math.cos(a), cy + h*.66, cz + h*.7,
          edge || h > 0 ? 'sootRim' : 'soot', edge ? 0 : .43 * strength);
      }
    }
    for (let i = 0; i < n; i++) {
      const a = mid + 1 + i, b = mid + 1 + (i + 1) % n;
      indices.push(mid, b, a, a, b, a+n, b, b+n, a+n);
    }
  }
  // 띠의 폭과 밝기는 가운데에서 가장자리를 향해 줄인다. 각 점은
  // [바깥쪽 변위 m, 위쪽 변위 m, 뒤쪽 길이 비율, 반폭 배율]이다.
  function ribbon([x,y,z], path, brightness = 1) {
    const sign = Math.sign(x) || 1, start = xyz.length / 3;
    for (const [dx,dy,t,w] of path) {
      const cx = x + sign * dx * profile.spread, cz = z - length * t;
      const width = radius * w;
      vertex(cx - width, y + dy, cz, 'rim', .23 * brightness);
      vertex(cx, y + dy + width * .38, cz, t > .28 ? 'rim' : 'core', brightness);
      vertex(cx + width, y + dy, cz, 'tip', .24 * brightness);
    }
    for (let j = 1; j < path.length; j++) for (let i = 0; i < 2; i++) {
      const a = start + (j - 1) * 3 + i;
      indices.push(a, a+3, a+1, a+1, a+3, a+4);
    }
  }
  const charge = look === 'a' ? .73 : look === 'c' ? 1 : .88;
  function wake(p) {
    if (shape === 'arc') {
      // 뒷바퀴 뒤에서 노면까지 꺾여 내려가 뒤로 끌리는 푸른 아크와 가는 잔상 한 갈래(바퀴 바깥으로 휘지 않는다).
      ribbon(p, [[0,0,0,.40],[.03,-.12,.05,.8],[-.02,-.05,.10,1],[.02,-.18,.17,.9],
        [-.02,-.21,.36,.55],[0,-.22,1,.03]], charge);
      ribbon(p, [[0,-.06,.08,.05],[.03,.03,.22,.5],[.01,-.02,.30,.38],
        [.03,.02,.50,.03]], charge);
    } else if (shape === 'scrape') {
      // 뒤 조향 바퀴 뒤에서 노면을 긁으며 뒤로 끌리는 노란 줄기와 위로 튀는 가지. 폭은 차 안쪽으로 넓힌다.
      const bright = Math.min(1, charge * 1.15);
      ribbon(p, [[-.06,.02,0,.36],[-.04,.12,.10,1],[-.09,.05,.20,.95],[-.05,-.06,.30,.9],
        [-.08,-.12,.50,.8],[-.06,-.13,1,.03]], bright);
      ribbon(p, [[-.08,.05,.25,.12],[-.05,.18,.36,.8],[-.07,.12,.44,.6],
        [-.05,.24,.62,.04]], bright);
    } else {
      // 캐스터마다 짧은 불티 한 획. 접점 바로 뒤에서 뒤로 끌리는 단색 삼각형이다.
      const [x,y,z] = p, sign = Math.sign(x);
      const cz = z - .14 * profile.reach;
      const i = vertex(x-radius, y+.045, cz, 'rim', .80);
      vertex(x+radius, y+.053, cz, 'rim', .80);
      vertex(x + sign*.02, y + .095, cz - length * .62, 'rim', .80);   // 좌우 같은 모양(4차)
      indices.push(i, i+1, i+2);
    }
  }
  if (shape === 'diamonds') diamonds();
  else for (const p of origins) {
    if (spec.family === 'diesel') {
      haze(p, .72, radius * 1.44, .11 * Math.sign(p[0]));
      haze(p, .94, radius * 1.26, .035 * Math.sign(p[0]));
    }
    if (shape === 'hopper') {
      // 투입구 밑 짧은 속불. 뒤로 퍼지는 회색 매연과 같은 색 버퍼에 넣는다.
      tube(p, [[0,.16,'rim',.75],[.24,.47,'rim',.89],[.39,.36,'rim',.78],
        [.56,.02,'tip',.28]], 5, .68);
      tube(p, [[.13,.10,'core',.95],[.25,.30,'core',.95],[.46,.015,'rim',.76]], 5, .68);
    }
    if (spec.family === 'gasoline' || shape === 'diesel') jet(p);
    if (spec.family === 'electric' || spec.family === 'cart') wake(p);
  }
  return { xyz: new Float32Array(xyz), rgba: new Float32Array(colors), sootAlpha, indices };
}

export function makeStyledBoost(THREE, spec, origins, look, halfWidth = 0) {
  const base = origins[0].map((_, i) => origins.reduce((sum, p) => sum + p[i], 0) / origins.length);
  const shapes = {};
  for (const kind of Object.keys(BOOST_SHAPES)) shapes[kind] = buildBoostShape(THREE, spec, origins, base, kind, look, halfWidth);
  const geometry = new THREE.BufferGeometry(), initial = shapes.item;
  const position = new THREE.BufferAttribute(initial.xyz.slice(), 3), color = new THREE.BufferAttribute(initial.rgba.slice(), 4);
  geometry.setAttribute('position', position); geometry.setAttribute('color', color); geometry.setIndex(initial.indices);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false });
  material.forceSinglePass = true;
  const mesh = new THREE.Mesh(geometry, material);
  // 연소가 있는 갈래(가솔린 · 디젤 — 청소차의 투입구 속불 포함)는 'flames', 전기 · 엔진 없는 차 · 바람은 'boostWake'.
  mesh.name = spec.family === 'gasoline' || spec.family === 'diesel' ? 'flames' : 'boostWake';
  mesh.position.set(...base); mesh.visible = false;
  mesh.raycast = () => {};  // 엔진 연기 자리를 재는 광선이 꾸밈을 차체로 읽지 않게 한다.

  let current = '', ignition = '', age = 0;
  function update(view, dt, calm, ghost) {
    const wasOn = mesh.visible, boost = +view.boost || 0;
    mesh.visible = boost > 0 && !ghost;
    if (!mesh.visible) return;
    const kind = Object.hasOwn(BOOST_SHAPES, view.boostKind) ? view.boostKind : 'item';
    if (!wasOn || kind !== current) age = 0;
    let opening = '';
    if (!calm && age < BOOST_IGNITION_TIME) {
      if (spec.shape === 'oval') opening = 'white';
      if (spec.shape === 'diesel') opening = 'soot';
    }
    if (kind !== current || opening !== ignition) {
      const next = shapes[kind];
      if (kind !== current) {
        position.array.set(next.xyz); position.needsUpdate = true;
        geometry.computeBoundingSphere();
      }
      color.array.set(next.rgba);
      if (opening === 'white') {
        for (let i = 0; i < color.array.length; i += 4) {
          color.array[i] = 1; color.array[i+1] = .95; color.array[i+2] = .83;
        }
      }
      if (opening === 'soot') {
        for (let i = 0; i < next.sootAlpha.length; i++) color.setW(i, next.sootAlpha[i]);
      }
      color.needsUpdate = true; current = kind; ignition = opening;
    }
    const burst = calm ? 0 : Math.max(0, 1 - age / .155) ** 2;
    const pulse = calm || kind === 'kick' ? 0 : Math.sin(age * 2 * Math.PI * spec.hz);
    const tail = calm ? 1 : Math.min(1, boost / (kind === 'kick' ? .10 : .18));
    if (spec.shape === 'backfire') {
      // 배기 사이에도 속심을 남긴다. item은 최저 0.70 m, 터질 때 1.04 m(차 길이 1.82 m).
      const pop = calm ? .35 : Math.max(burst, pulse, 0) ** 2;
      mesh.scale.z = (.74 + .30 * pop) * (.95 + .05 * tail);
      mesh.scale.y = .88 + .20 * pop;
      material.opacity = calm ? .81 : .90 + .10 * tail;
      material.color.setScalar(1 + .26 * pop);
    } else {
      const side = spec.shape === 'v8', caster = spec.shape === 'casters';
      // 출발선의 가까운 카메라에서는 넓게 붙고, 속도가 붙으면 뒤로 길게 남는다.
      const reach = calm ? .76 : .43 + .57 * Math.min(1, Math.abs(view.speed || 0) / 20);
      const ignitionReach = spec.shape === 'arc' ? .13 : .32;
      const flare = caster ? 0 : burst;
      mesh.scale.z = reach * (.56 + .44 * tail) * (1 + flare * ignitionReach + pulse * .045);
      mesh.scale.y = 1 + flare * .24 + pulse * (side ? .26 : .075);
      material.opacity = (.42 + .58 * tail) * (calm ? .81 : 1);
      const light = opening === 'soot' ? .65 : 1 + flare * .86 + pulse * (side ? .16 : .04);
      material.color.setScalar(caster ? 1 : light);
    }
    age += dt;
  }
  return { mesh, update, dispose() { geometry.dispose(); material.dispose(); } };
}
