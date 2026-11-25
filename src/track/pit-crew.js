// 피트 크루 — 정차 칸 옆에 서 있다가 내 차가 서면 달려들어 바퀴를 조이고(위잉위잉) 잭으로 들었다 내려놓는다(약속 3.22).
// 사용자 2026-11-21: "피트 지금은 그냥 들어가서 가만히 있는건데, 실제로 막 사람들이 위잉위잉 하고 고치거나 하는 식 좋을 것 같아."
//   const crew = createPitCrew(THREE, { pit, groundAt });   scene.add(crew.group);
//   매 화면: const out = crew.update(view, dt);   끝: crew.dispose();
// pit: createPit 의 것(boxes · inner(u) · outer(u) · pointAt(u, lateral) · wallAt(u) · limit). groundAt(x, z) → 땅 높이.
// view: { x, y, z, heading  내 카트의 자리(월드 미터 — 앞 = (sin heading, cos heading), 왼쪽 = 로컬 +x),
//         speed, inPit(레인 안인가), holding(고치려고 서는 중 — 브레이크를 밟고 있다), repairing(멈춰서 고치는 중), value(차 상태 0~100), box(정차 칸 번호 | −1),
//         damage(데미지가 있는 모드인가 — 아니면 크루는 서 있기만 한다),
//         wheels: { front: [|x|, z], rear: [|x|, z], frontRadius, rearRadius } 바퀴 접지점(카트 로컬) }
// out(같은 객체를 돌려쓴다): { lift: 잭으로 든 높이(m, 0 ~ 0.07 — main.js 가 내 카트의 그림만 그만큼 올린다),
//                              guns: 지금 돌고 있는 임팩트 렌치의 수(0 ~ 4 — 소리가 쓴다), event: '' | 'up' | 'down'(잭을 올린 · 내린 그 화면에만) }
// 게임은 이 모듈이 없어도(못 불러와도) 돈다 — main.js 가 따로 불러온다. 주행 계산과는 무관하다(부딪히지 않는다).
//
// 채운 것(W18, 2026-11-21):
//   사람: 정차 칸마다 한 조 다섯 — 바퀴 넷(뒤 바깥 · 앞 바깥 · 뒤 안 · 앞 안) + 앞의 잭 · 신호수 하나. 칸이 둘이면 열 명.
//     키 약 1.18 m. 흰 헬멧에 파란 줄 · 검은 바이저, 파란 재킷에 노란 띠(운전자와 구별), 남색 바지, 검은 장화, 노란 장갑.
//     작업복과 헬멧은 단면을 잇고, 팔다리는 두 마디 IK(어깨 → 손, 엉덩이 → 발)로 잇는다.
//   단계(조마다 phase): 'idle' 기다림 → 'ready' 준비(view.holding) → 'work' 작업(view.repairing) → 'release' 내보내기 → 'idle'.
//     idle: 칸 바깥쪽(pit.outer(u) 안쪽 0.32 m)에 1.2 m 간격으로 서서 숨 쉬듯 흔들리고, 내 차가 가까우면(40 m) 몸을 차 쪽으로 돌린다(안쪽 ±70° 안).
//     ready: 차가 설 자리(지금 속도 · 줄어드는 정도로 어림)의 바퀴 옆 0.45 m 바깥에 웅크리고 렌치를 겨눈다. 안쪽 바퀴 둘은 차가 설 자리의 앞으로 돌아서 건너간다.
//            잭 · 신호수는 차 앞 바깥쪽에서 다가오는 차를 보고 한 손을 들어 멈추라고 한다(다른 손은 잭 손잡이).
//     work: 바퀴로 달려들어(0.3초 안) 한 무릎을 꿇고 렌치 끝을 바퀴 가운데에 댄다. 잭 · 신호수는 차 앞으로 가 잭을 코 밑에 넣고 손잡이를 눌러 든다
//           (도착하거나 0.45초가 지나면 out.lift → 0.06, 그 화면에 'up'). 렌치는 사람마다 엇갈려 0.3초 돌고 0.2초 쉰다 — 도는 동안 렌치 · 손이 떨리고 바퀴에서 불티가 튄다.
//     release: 차 상태가 100 에 닿기 0.38초 전(초당 GP_RULES.repair.rate % 로 어림 — 2026-11-25 그 전 DAMAGE) 또는 holding 이 꺼지면 시작한다 — 잭을 내리고('down'), 바퀴의 넷은 0.35초 안에 0.5 m 물러나 일어선다.
//              잭 · 신호수는 잭을 끌고 차 앞길 바깥(차 폭 반 + 1 m)으로 비켜서서 안쪽 손으로 가라고 흔든다. 차가 떠나면(또는 4초 뒤) 모두 제자리로 걸어간다(안쪽 둘은 차 뒤로 건너간다).
//     조 고르기: 작업에 들 때 view.box ≥ 0 이면 그 칸의 조, 아니면 차에서 가까운 칸의 조. 준비 동안은 차가 설 자리에서 가까운 칸의 조.
//     데미지 없는 모드(view.damage false)에서는 서 있고 차를 볼 뿐 일하지 않는다. 내 차가 칸에서 250 m 넘게 멀면 움직임 계산을 건너뛴다(제자리 · 기다림으로 한 번 돌려놓고).
//   그리기: InstancedMesh 넷(몸통 · 팔다리 · 헬멧 · 손발) + 공구 SkinnedMesh + 불티 Points = 그리기 호출 최대 6번. 그림자 없음. 매 화면 새 객체를 만들지 않는다.
//     인스턴스는 월드 좌표로 바로 쓴다(group 은 원점에 둔다). 경계 구는 피트레인의 정차 구간을 덮게 미리 잡아 둔다 — 다른 곳을 볼 때는 그리지 않는다.
//   부스터 채움 손짓(2026-11-25): 그랑프리에서 상하지 않은 차가 서지 않고 정차 칸을 지나며 부스터를 받으면(view.refills 가 는다) 그 칸 조의 신호수가 빈 손을 머리 위로 흔든다(1.1초).
//   prefers-reduced-motion: 불티 · 떨림을 없애고 흔들림 · 걸음의 폭을 줄인다. 부스터 채움 손짓은 흔들지 않고 0.8초 들기만.
import { pitFinish } from './pit-models.js';
import { LIFT } from './track.js';
import { GP_RULES } from '../race/carstate.js';   // 크루는 그랑프리(데미지 모드)에서만 일한다 — 수리 속도는 GP_RULES(2026-11-25, 그 전 DAMAGE)

const LIFT_TOP = 0.06;             // 잭으로 드는 높이(m)
const EARLY = 0.38;                // 다 고치기 이만큼(초) 전에 잭을 내리기 시작한다 — 차가 떠날 때 앞길이 비어 있게
const KART_WHEELS = { front: [0.42, 0.65], rear: [0.42, -0.65], frontRadius: 0.14, rearRadius: 0.165 };
// 몸의 치수(m). 수리할 때는 두 마디 관절을 접어 바퀴 높이에 맞춘다.
const BODY = { hip: 0.57, torso: 0.35, thigh: 0.265, shin: 0.255, upper: 0.208, fore: 0.201, shoulder: 0.143, hipW: 0.085 };
const R = { thigh: 0.080, shin: 0.067, upper: 0.062, fore: 0.052, glove: 0.044 };
const GUN = { tip: 0.25, up: 0.05 };      // 렌치: 손잡이(오른손)에서 끝까지 앞으로 0.25, 위로 0.05
const JACK = { handle: 0.75, pivotY: 0.1 };
const COLOURS = {
  band: '#f2c230', trousers: '#232c44', collar: '#172447', boot: '#17191d', glove: '#e8b855',
};
const LIMB_LEN = 3;                 // 팔다리 캡슐의 가운데 길이(반지름 1 기준) — 관절 너머로 튀어나오는 끝이 마디 길이의 1/3
const N_SPARK = 48;
const GUN_OFFSET = [0, 0.27, 0.12, 0.38];   // 렌치가 도는 때를 사람마다 엇갈린다(0.5초 주기 안에서)
const ROLES = 5;                    // 0 뒤 바깥 · 1 앞 바깥 · 2 뒤 안 · 3 앞 안 · 4 잭 · 신호수 (제자리에서 뒤 → 앞 차례 — 차 앞으로 건너가는 안쪽 둘이 앞쪽에 선다)
const WHEEL_OF = [{ front: false, inner: false }, { front: true, inner: false }, { front: false, inner: true }, { front: true, inner: true }];

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const ease = (k, dt) => 1 - Math.exp(-k * dt);

export function createPitCrew(THREE, { pit, groundAt, reducedMotion } = {}) {
  const group = new THREE.Group(); group.name = 'pit-crew';
  const out = { lift: 0, guns: 0, event: '' };
  if (!pit || !Array.isArray(pit.boxes) || !pit.boxes.length || typeof pit.pointAt !== 'function') {
    return { group, update() { out.event = ''; out.guns = 0; out.lift = 0; return out; }, clear() {}, dispose() { group.removeFromParent(); },
      stats: () => ({ figures: 0, drawCalls: 0, triangles: 0, phase: 'idle', team: -1, lift: 0, guns: 0, cheer: 0, cheerTeam: -1 }) };
  }
  const ground = typeof groundAt === 'function' ? groundAt : () => 0;
  let reduce = !!reducedMotion, mq = null, onMq = null;
  if (reducedMotion === undefined && typeof window !== 'undefined' && window.matchMedia) {
    try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); reduce = !!mq.matches; onMq = () => { reduce = !!mq.matches; }; mq.addEventListener?.('change', onMq); } catch { mq = null; }
  }

  // ── 조와 제자리 ──
  const teams = pit.boxes.map((b, index) => {
    const mid = (b.from + b.to) / 2, c = pit.pointAt(mid, (pit.inner(mid) + pit.outer(mid)) / 2), h = c.heading;
    const team = { index, box: b, cx: c.x, cz: c.z, heading: h, ox: -Math.cos(h), oz: Math.sin(h),   // 바깥(벽 쪽) = 레인의 오른쪽
      phase: 'idle', t: 0, up: false, lift: 0, departed: false,
      spot: { x: c.x, z: c.z, h }, anchor: { x: 0, z: 0 }, cheer: 0,
      jack: { px: 0, pz: 0, a: 1.2, dx: 0, dz: 1 }, figures: [] };
    for (let k = 0; k < ROLES; k++) {
      const u = b.from + 0.6 + k * (b.to - b.from - 1.2) / (ROLES - 1), p = pit.pointAt(u, pit.outer(u) - 0.32);
      team.figures.push({ team, k, hx: p.x, hz: p.z, hyaw: p.heading + Math.PI / 2,   // 안쪽(주행로 쪽)을 본다
        x: p.x, z: p.z, yaw: 0, gy: 0, sx: NaN, sz: NaN, tx: p.x, tz: p.z, tyaw: 0, spd: 1.5, moved: 0, gait: k * 1.7, amp: 0,
        crouch: 0, kneel: 0, cT: 0, kT: 0, lean: 0, pitch: 0, pitchT: 0,
        hand: new Float64Array(6), handT: new Float64Array(6), gunA: new Float64Array([0, -0.75, 0.66]), gunAT: new Float64Array(3),
        gunOn: false, gunClock: 0, seed: (team.index * 5 + k) * 1.913, spark: 0, arrived: false,
        wheel: {}, strideSpeed: 0, joints: new Float64Array(3 * 16), G: new Float64Array(9) });   // 관절 16개(월드) · 렌치(손잡이 · 축 · 위)
    }
    return team;
  });
  const figures = teams.flatMap(t => t.figures);
  // 경계 구: 차가 설 수 있는 구간(제한 줄 사이)의 레인 전체 + 여유
  const bound = (() => {
    const u0 = Math.min(pit.limit?.from ?? pit.boxes[0].from, pit.boxes[0].from) - 4, u1 = Math.max(pit.limit?.to ?? pit.boxes.at(-1).to, pit.boxes.at(-1).to) + 6;
    const pts = []; for (let u = u0; u <= u1; u += 2) for (const lat of [pit.inner(u), pit.outer(u)]) pts.push(pit.pointAt(u, lat));
    let x = 0, z = 0; for (const p of pts) { x += p.x; z += p.z; } x /= pts.length; z /= pts.length;
    let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p.x - x, p.z - z));
    const y = fin(ground(x, z)); return { x, y, z, r: r + 4 };
  })();

  // ── 모양 ──
  const meshes = [];
  const finish = pitFinish(THREE, pit, ground);
  const std = opts => finish(new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, ...opts }));
  const paint = (geo, pick) => {   // 면마다 한 색(면의 가운데로 고른다) — 경계가 번지지 않게. 법선은 부드러운 그대로.
    const g = geo.index ? geo.toNonIndexed() : geo, pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      c.set(pick(x, y, z)); for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); if (g !== geo) geo.dispose(); return g;
  };
  const sphere = new THREE.Sphere(new THREE.Vector3(bound.x, bound.y, bound.z), bound.r);
  const inst = (name, geo, mat, count, colours) => {
    const m = new THREE.InstancedMesh(geo, mat, count); m.name = name; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = false; m.receiveShadow = true; m.boundingSphere = sphere.clone();
    if (colours) { const c = new THREE.Color(); for (let i = 0; i < count; i++) m.setColorAt(i, c.set(colours(i))); m.instanceColor.needsUpdate = true; }
    group.add(m); meshes.push(m); return m;
  };
  const NF = figures.length, NT = teams.length;
  // 단면 사이의 천 조각과 바이저 테를 따로 칠한다. 색 경계와 봉제선이 같은 고리를 쓴다.
  function shell(rows, sides, paintPanel) {
    const vertices = [], indices = [], colours = [], uv = [], tint = new THREE.Color();
    for (const [y, width, depth, nose = 0] of rows) {
      for (let j = 0; j < sides; j++) {
        const angle = (j - 0.5) * 2 * Math.PI / sides, c = Math.cos(angle);
        vertices.push(width * Math.sin(angle), y, depth * c + nose * Math.max(0, c) ** 2);
      }
    }
    for (let row = 0; row < rows.length - 1; row++) {
      for (let j = 0; j < sides; j++) {
        const a = row * sides + j, b = row * sides + (j + 1) % sides;
        const cap = rows[row+1][1] === 0;
        indices.push(a, b, b+sides);
        if (!cap) indices.push(a, b+sides, a+sides);
        const ua = (j-.5)/sides+.5, ub = ua+1/sides;
        const va = (rows[row][0]-rows[0][0])/(rows.at(-1)[0]-rows[0][0]);
        const vb = (rows[row+1][0]-rows[0][0])/(rows.at(-1)[0]-rows[0][0]);
        uv.push(ua,va,ub,va,ub,vb);
        if (!cap) uv.push(ua,va,ub,vb,ua,vb);
        tint.set(paintPanel(row, Math.min(j, sides - j), j));
        for (let i = 0; i < (cap ? 3 : 6); i++) colours.push(tint.r, tint.g, tint.b);
      }
    }
    const skin = new THREE.BufferGeometry();
    skin.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    skin.setIndex(indices); skin.computeVertexNormals();
    const panels = skin.toNonIndexed(); skin.dispose();
    panels.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    panels.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
    return panels;
  }

  // 재킷: 벨트 위로 좁아지는 허리, 겨드랑이 절개, 어깨 요크와 반사 파이핑.
  const jacket = shell([
    [-.196,.076,.080],[-.165,.119,.116],[-.104,.129,.127],[-.086,.123,.131],
    [-.067,.124,.127],[.044,.151,.151],[.083,.165,.151],[.093,.167,.15],
    [.127,.166,.141],[.157,.138,.108],[.178,.085,.084],[.180,.057,.062]
  ], 12, (row, col) => {
    if (row < 2) return COLOURS.trousers;
    if (row === 2) return col === 0 ? '#aeb8bd' : '#283044';
    if (row === 3 || row === 10) return COLOURS.collar;
    if (col === 3) return '#223853';
    if (row === 6) return '#dde5df';
    if (row === 7 && col < 3) return COLOURS.band;
    if (row >= 8) return '#476f9a';
    return col === 0 ? '#315278' : '#345f91';
  });
  // 돌아가는 몸의 앞·뒤에 지퍼, 플랩 주머니, 옆구리의 이중 솔기를 맞춘다.
  const clothSize = 128, weave = new Uint8Array(clothSize*clothSize*4);
  for (let y=0; y<clothSize; y++) for (let x=0; x<clothSize; x++) {
    const u=(x+.5)/clothSize, v=(y+.5)/clothSize, front=Math.abs(u-.5), back=.5-front;
    const seam = .149-.046*Math.sin(Math.PI*clamp((v-.22)/.65,0,1));
    const d = Math.abs(Math.min(front,back)-seam);
    let tone = ((x+y)%3 === 0) ? 248 : 254;
    if (v>.29 && v<.82 && d<.013) tone = d<.006 ? 145 : 217;
    if (v>.292 && v<.95 && front<.013) tone = front<.004 && y%4<2 ? 225 : 106;
    if (u>.55 && u<.63 && v>.56 && v<.59) tone = 128;
    if (back<.10 && Math.abs(v-(.66+back*.40))<.014) tone = 176;
    const i=(y*clothSize+x)*4; weave[i]=weave[i+1]=weave[i+2]=tone; weave[i+3]=255;
  }
  const cloth = new THREE.DataTexture(weave,clothSize,clothSize);
  cloth.wrapS=THREE.RepeatWrapping; cloth.generateMipmaps=true;
  cloth.minFilter=THREE.LinearMipmapLinearFilter; cloth.magFilter=THREE.LinearFilter; cloth.needsUpdate=true;
  const torso = inst('pit-crew-torso', jacket, std({ map: cloth, vertexColors: true, roughness: .87 }), NF);

  // 관절 근처의 천을 좁히고 소맷부리에 얇은 테를 두른다.
  const LIMBS = 8, H = LIMB_LEN / 2;
  const limbProfile = [[.31,-H-.34],[1,-H+.22],[.79,H-.44],[.80,H-.15],[.60,H+.20]]
    .map(([x,y]) => new THREE.Vector2(x,y));
  const sleeves = paint(new THREE.LatheGeometry(limbProfile, 5), (x,y) =>
    y > H-.45 && y < H-.15 ? '#b1b7c3' : y > H-.15 ? '#87929e' : '#ffffff');
  const limbs = inst('pit-crew-limbs', sleeves, std({ vertexColors: true, roughness: .88 }),
    NF * LIMBS, i => i % LIMBS < 4 ? '#374459' : '#416e9a');

  // 정수리, 내민 눈썹, 좁혀 넣은 바이저 고무, 앞으로 나온 턱받침.
  const lid = shell([
    [-.126,.060,.074],[-.114,.097,.098,.023],[-.083,.116,.105,.043],
    [-.049,.123,.118,.020],[-.042,.124,.120,.014],[-.016,.131,.127,.005],
    [.024,.131,.128,.004],[.031,.132,.140,.012],[.052,.132,.135,.007],
    [.097,.111,.115],[.121,.077,.078],[.138,0,0]
  ], 14, (row, col) => {
    if (row === 0) return '#253544';
    if (row >= 3 && row <= 6 && col < 4) {
      if (col === 3) return row === 5 ? '#80909d' : '#2a3844';
      return ['#16212f','#304454','#516d7c','#192838'][row-3];
    }
    if (row === 2 && col < 2) return '#506477';
    if (col === 0 || col === 7) return row >= 7 ? '#305685' : '#d4dde1';
    if (col === 4 && row < 4) return '#45688b';
    return '#e4e6df';
  });
  const helmets = inst('pit-crew-helmet', lid, std({ vertexColors: true, roughness: .37 }), NF);
  // 4 손발: 장갑 둘 · 장화 둘
  const ENDS = 4;   // 장갑 둘 · 장화 둘
  const pads = paint(new THREE.SphereGeometry(1, 7, 3), (x,y,z) => y<-.32 ? '#677181' : z<-.48 ? '#adb5bf' : '#ffffff');
  const ends = inst('pit-crew-hands-feet', pads, std({ vertexColors: true, roughness: .72 }), NF * ENDS, i => (i % ENDS < 2 ? COLOURS.glove : COLOURS.boot));
  // 도구는 각 강체를 뼈 하나에 묶는다. 모양이 다른 렌치·바퀴·잭도 한 번에 그린다.
  const TOOLS = 10; // 렌치 넷, 뒤 양쪽 새 타이어와 헌 타이어, 잭 몸체와 손잡이
  const bones = Array.from({ length: NT * TOOLS }, () => new THREE.Bone());
  function equipment() {
    const pos = [], norm = [], col = [], joints = [], weights = [], indices = [];
    const tint = new THREE.Color();
    let joint = 0;
    function append(g, color) {
      const offset = pos.length/3, n = g.attributes.position.count;
      pos.push(...g.attributes.position.array); norm.push(...g.attributes.normal.array);
      tint.set(color);
      for (let i=0; i<n; i++) { col.push(tint.r,tint.g,tint.b); joints.push(joint,0,0,0); weights.push(1,0,0,0); }
      for (const index of g.index.array) indices.push(offset + index);
      g.dispose();
    }
    function block(x,y,z,w,h,d,tone,tilt = 0) {
      append(new THREE.BoxGeometry(w,h,d).rotateX(tilt).translate(x,y,z),tone);
    }
    function ring(x,y,z,profile,axis,tone,n=10) {
      const g = new THREE.LatheGeometry(profile.map(([r,h]) => new THREE.Vector2(r,h)),n);
      if (axis === 'z') g.rotateX(Math.PI/2);
      if (axis === 'x') g.rotateZ(-Math.PI/2);
      append(g.translate(x,y,z),tone);
    }
    for (let team=0; team<NT; team++) {
      for (let k=0; k<4; k++) {
        joint = team*TOOLS+k;
        ring(0,.063,0,[[.012,-.079],[.050,-.077],[.058,-.055],[.057,.063],[.044,.085]],'z','#d6aa4b',7);
        ring(0,.063,0,[[.047,.080],[.048,.110],[.028,.136],[.025,.193]],'z','#5c6a77',6);
        ring(0,.063,0,[[.027,.188],[.032,.194],[.032,GUN.tip],[.018,GUN.tip]],'z','#cbd1d4',6);
        block(0,-.012,-.026,.049,.115,.049,'#283544',-.16);
        block(0,-.071,-.030,.077,.034,.09,'#556475');
      }
      for (let k=4; k<8; k++) {
        joint = team*TOOLS+k;
        // 단위 반지름. 축은 X. 안쪽 바퀴집에 들어갈 때까지 옆면과 비어 있는 스포크가 보인다.
        ring(0,0,0,[[.56,-.27],[.63,-.325]],'x','#b3bbbd',14);
        ring(0,0,0,[[.63,-.325],[.89,-.32],[1,-.21],[1,.21],[.89,.32],[.63,.325]],'x','#30363c',14);
        ring(0,0,0,[[.63,.325],[.56,.27],[.56,-.27]],'x','#a0a9ac',14);
        for (let j=0; j<3; j++) block(0,0,0,.27,1.13,.09,'#78868c',j*Math.PI/3);
        ring(0,0,0,[[0,-.162],[.165,-.162],[.165,.162],[0,.162]],'x','#82909a',6);
      }
      joint = team*TOOLS+8;
      // 낮은 잭. 코 밑으로 들어가는 두 레일과 리프트 패드.
      for (const x of [-.108,.108]) {
        block(x,0,-.21,.048,.075,.60,'#c59837',-.065);
        ring(x,-.027,.036,[[.015,-.031],[.055,-.031],[.055,.031],[.015,.031]],'x','#293137',8);
      }
      block(0,.011,-.16,.18,.053,.36,'#4b5966');
      block(0,.049,-.37,.105,.048,.30,'#8c9ca8',.16);
      ring(0,.102,-.49,[[.09,-.022],[.105,.006],[.10,.022],[0,.024]],'y','#35414a',10);
      joint++;
      block(0,0,.32,.034,.034,.68,'#bcc7cc');
      block(0,0,.62,.055,.055,.21,'#324553');
      block(0,0,JACK.handle,.24,.043,.05,'#dfa94b');
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));
    g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    g.setIndex(indices);
    const mesh = new THREE.SkinnedMesh(g,std({ vertexColors: true, roughness: .61, metalness: .06 }));
    mesh.name = 'pit-crew-tools'; mesh.receiveShadow = true; mesh.boundingSphere = sphere.clone();
    mesh.add(...bones); mesh.bind(new THREE.Skeleton(bones));
    for (const b of bones) b.matrixAutoUpdate = false;
    group.add(mesh); meshes.push(mesh);
    return mesh;
  }
  const tools = equipment();
  // 6 불티: 작은 빛 점(더하기 섞기)
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_SPARK * 3), 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(N_SPARK * 4), 4).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N_SPARK), 1).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setDrawRange(0, 0); sparkGeo.boundingSphere = sphere.clone();
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 tint; attribute float size; uniform float uScale; varying vec4 vT;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * uScale / max(0.05, -mv.z), 1.0, 22.0); vT = tint; }`,
    fragmentShader: `varying vec4 vT; void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float r = dot(p, p); if (r > 1.0) discard; gl_FragColor = vec4(vT.rgb, vT.a * (1.0 - r) * (1.0 - r)); }`,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.name = 'pit-crew-sparks'; sparks.visible = false; sparks.renderOrder = 3;
  const v2 = new THREE.Vector2();
  sparks.onBeforeRender = (renderer, _s, camera) => { renderer.getDrawingBufferSize(v2); sparkMat.uniforms.uScale.value = v2.y * camera.projectionMatrix.elements[5] * 0.5; };
  group.add(sparks);
  const sp = { x: new Float32Array(N_SPARK), y: new Float32Array(N_SPARK), z: new Float32Array(N_SPARK), vx: new Float32Array(N_SPARK), vy: new Float32Array(N_SPARK), vz: new Float32Array(N_SPARK), age: new Float32Array(N_SPARK), life: new Float32Array(N_SPARK), cursor: 0 };
  const triangles = [torso, limbs, helmets, ends, tools].reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1), 0);

  // ── 인스턴스 행렬 쓰기(열 우선: X' · Y' · Z' · 자리) ──
  const put = (arr, i, px, py, pz, xx, xy, xz, yx, yy, yz, zx, zy, zz) => {
    const o = i * 16; arr[o] = xx; arr[o + 1] = xy; arr[o + 2] = xz; arr[o + 3] = 0; arr[o + 4] = yx; arr[o + 5] = yy; arr[o + 6] = yz; arr[o + 7] = 0;
    arr[o + 8] = zx; arr[o + 9] = zy; arr[o + 10] = zz; arr[o + 11] = 0; arr[o + 12] = px; arr[o + 13] = py; arr[o + 14] = pz; arr[o + 15] = 1;
  };
  // a → b 로 뻗는 원기둥 · 캡슐(축 = 기하의 y). rx: hint 쪽 반지름, rz: 그 수직 반지름, len: 기하의 y 길이 1 이 몇 m 인가에 쓰는 나눔값
  function seg(arr, i, ax, ay, az, bx, by, bz, rx, rz, hx, hy, hz, div) {
    let yx = bx - ax, yy = by - ay, yz = bz - az; const d = Math.hypot(yx, yy, yz);
    if (d < 1e-6) { yx = 0; yy = 1; yz = 0; } else { yx /= d; yy /= d; yz /= d; }
    const dot = hx * yx + hy * yy + hz * yz; let xx = hx - yx * dot, xy = hy - yy * dot, xz = hz - yz * dot; let l = Math.hypot(xx, xy, xz);
    if (l < 1e-4) { xx = yy; xy = -yx; xz = 0; l = Math.hypot(xx, xy) || 1; if (Math.hypot(xx, xy) < 1e-4) { xx = 1; xy = 0; xz = 0; l = 1; } }
    xx /= l; xy /= l; xz /= l;
    const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx, s = Math.max(d, 1e-4) / div;
    put(arr, i, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, xx * rx, xy * rx, xz * rx, yx * s, yy * s, yz * s, zx * rz, zy * rz, zz * rz);
  }

  // ── 두 마디 IK: a(뿌리) → c(끝), 길이 l1 · l2, pole 쪽으로 꺾는다. 가운데 관절을 o[oi..] 에 쓴다(끝이 안 닿으면 c 를 당겨 쓴다).
  function ik(o, oi, ax, ay, az, cx, cy, cz, l1, l2, px, py, pz, ci) {
    let dx = cx - ax, dy = cy - ay, dz = cz - az, d = Math.hypot(dx, dy, dz);
    const most = (l1 + l2) * 0.999, least = Math.abs(l1 - l2) + 1e-3;
    if (d < 1e-6) { dx = 0; dy = -1; dz = 0; d = least; } else { dx /= d; dy /= d; dz /= d; }
    d = clamp(d, least, most);
    o[ci] = ax + dx * d; o[ci + 1] = ay + dy * d; o[ci + 2] = az + dz * d;   // 끝(닿을 수 있는 데까지)
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pd = px * dx + py * dy + pz * dz; let qx = px - dx * pd, qy = py - dy * pd, qz = pz - dz * pd; const ql = Math.hypot(qx, qy, qz) || 1; qx /= ql; qy /= ql; qz /= ql;
    o[oi] = ax + dx * a + qx * h; o[oi + 1] = ay + dy * a + qy * h; o[oi + 2] = az + dz * a + qz * h;
  }

  // ── 차(이번 화면) ──
  const car = { ok: false, x: 0, z: 0, h: 0, v: 0, inPit: false, holding: false, repairing: false, damage: false, value: 100, box: -1, decel: 14, lastV: 0, refills: -1,
    wfx: 0.42, wfz: 0.65, wfr: 0.14, wrx: 0.42, wrz: -0.65, wrr: 0.165, halfW: 0.54, front: 1.0, rear: -1.0 };
  function readCar(view, dt) {
    const v = view || {};
    const x = v.x, z = v.z; car.ok = Number.isFinite(x) && Number.isFinite(z);
    if (car.ok) { car.x = x; car.z = z; }
    car.h = fin(v.heading, car.h); const sp = fin(v.speed, 0);
    if (dt > 0) { const dec = (car.lastV - sp) / dt; if (Number.isFinite(dec) && dec > 1 && dec < 60) car.decel += (dec - car.decel) * ease(6, dt); }
    car.lastV = sp; car.v = sp;
    car.damage = !!v.damage; car.inPit = !!v.inPit; car.holding = car.damage && !!v.holding; car.repairing = car.damage && !!v.repairing;
    car.value = fin(v.value, 100); car.box = Number.isInteger(v.box) ? v.box : -1;
    // 부스터만 받고 지나가는 차(그랑프리 · 서지 않음 — 2026-11-25 사용자 "반응 넣고"): view.refills 가 느는 순간 그 칸 조의 신호수가 빈 손을 머리 위로 흔든다(1.1초, 움직임 줄이기면 0.8초 들기만)
    const refills = Number.isFinite(v.refills) ? v.refills : -1;
    if (refills > car.refills && car.refills >= 0 && car.damage && !car.holding) { const T = teams[car.box >= 0 && car.box < NT ? car.box : nearestTeam(car.x, car.z)]; if (T.phase === 'idle') T.cheer = reduce ? 0.8 : 1.1; }
    car.refills = refills;
    const w = v.wheels && typeof v.wheels === 'object' ? v.wheels : KART_WHEELS, f = Array.isArray(w.front) ? w.front : KART_WHEELS.front, r = Array.isArray(w.rear) ? w.rear : KART_WHEELS.rear;
    // 두 바퀴(자전거 · 레이싱 오토바이 — 바퀴가 가운데 한 줄이라 좌우가 ±0.12 m 안, 2026-11-24): 렌치 끝이 바퀴 축 가까이 오게 바퀴 자리의 아래 한도를 0.05 m 로 낮추고,
    //   사람이 돌아가는 차 폭(halfW)은 핸들 · 팔꿈치 · 무릎이 있는 0.45 m 로 잡는다. 네 바퀴 차(가장 좁은 장보기 카트도 0.225 m)는 예전 그대로다.
    const twoWheel = Math.abs(fin(f[0], 0.42)) < 0.12 && Math.abs(fin(r[0], 0.42)) < 0.12, minX = twoWheel ? 0.05 : 0.2;
    car.wfx = clamp(Math.abs(fin(f[0], 0.42)), minX, 1); car.wfz = clamp(fin(f[1], 0.65), -2.5, 2.5); car.wfr = clamp(fin(w.frontRadius, 0.15), 0.05, 0.5);
    car.wrx = clamp(Math.abs(fin(r[0], 0.42)), minX, 1); car.wrz = clamp(fin(r[1], -0.65), -2.5, 2.5); car.wrr = clamp(fin(w.rearRadius, 0.17), 0.05, 0.5);
    car.halfW = twoWheel ? 0.45 : Math.max(car.wfx, car.wrx) + 0.12; car.twoWheel = twoWheel; car.front = Math.max(car.wfz + car.wfr, car.wrz + car.wrr) + 0.22; car.rear = Math.min(car.wrz - car.wrr, car.wfz - car.wfr) - 0.2;
  }
  // 차 기준 좌표(f: 기준 자리 · 방향) → 월드
  const fx = (f, lx, lz) => f.x + lx * Math.cos(f.h) + lz * Math.sin(f.h);
  const fz = (f, lx, lz) => f.z - lx * Math.sin(f.h) + lz * Math.cos(f.h);
  const outerSign = (T, f) => (T.ox * Math.cos(f.h) - T.oz * Math.sin(f.h) >= 0 ? 1 : -1);   // 바깥(벽 쪽)이 차의 왼쪽(+x)이면 +1
  const nearestTeam = (x, z) => { let best = 0, d = Infinity; for (const T of teams) { const e = (T.cx - x) ** 2 + (T.cz - z) ** 2; if (e < d) { d = e; best = T.index; } } return best; };
  const predict = (T) => {   // 지금 속도와 줄어드는 정도로 차가 설 자리를 어림한다
    const v = Math.max(0, car.v), d = clamp(v * v / (2 * clamp(car.decel, 6, 40)), 0, 14);
    T.spot.x = car.x + Math.sin(car.h) * d; T.spot.z = car.z + Math.cos(car.h) * d; T.spot.h = car.h;
  };
  const carFrame = { x: 0, z: 0, h: 0 };

  // ── 상태 ──
  let act = -1, served = false, time = 0, parked = false, lastGuns = 0;
  const homeAll = () => {
    for (const T of teams) {
      T.phase = 'idle'; T.t = 0; T.up = false; T.lift = 0; T.departed = false; T.cheer = 0;
      for (const f of T.figures) {
        f.x = f.tx = f.hx; f.z = f.tz = f.hz; f.yaw = f.tyaw = f.hyaw; f.crouch = f.cT = 0.05; f.kneel = f.kT = 0; f.amp = 0; f.strideSpeed = 0; f.gunOn = false; f.arrived = false; f.sx = NaN;
        f.pitch = f.pitchT = 0; carryHands(f); f.hand.set(f.handT); f.gunA[0] = 0; f.gunA[1] = -0.75; f.gunA[2] = 0.66;
      }
      const j = T.figures[4]; T.jack.a = 1.2; T.jack.px = j.hx + Math.sin(j.hyaw) * 0.47; T.jack.pz = j.hz + Math.cos(j.hyaw) * 0.47; T.jack.dx = -Math.sin(j.hyaw); T.jack.dz = -Math.cos(j.hyaw);
    }
    act = -1; served = false; out.lift = 0; out.guns = 0; lastGuns = 0;
    for (let i = 0; i < N_SPARK; i++) sp.life[i] = 0;
  };
  function carryHands(f) {   // 서서 들고 있는 손(로컬)
    const h = f.handT; h[0] = 0.16; h[1] = f.k % 2 ? 0.62 : 0.52; h[2] = f.k % 2 ? 0.14 : 0.02;
    h[3] = -0.16; h[4] = 0.53 + (f.k % 3) * 0.027; h[5] = 0.10;
    f.gunAT[0] = 0; f.gunAT[1] = -0.75; f.gunAT[2] = 0.66;
  }
  // 월드 → 그 사람의 로컬(앞 +z, 왼쪽 +x, 위 +y)
  const toLocal = (f, wx, wy, wz, o, i) => { const s = Math.sin(f.yaw), c = Math.cos(f.yaw), dx = wx - f.x, dz = wz - f.z; o[i] = dx * c - dz * s; o[i + 1] = wy - f.gy; o[i + 2] = dx * s + dz * c; };

  // 길 고르기: 차(또는 설 자리) frame 을 사이에 두고 반대편으로 가야 하면 via(+1 앞 · −1 뒤)로 돌아간다. 결과는 f.tx · f.tz 에.
  function route(f, F, via, gx, gz) {
    const c = Math.cos(F.h), s = Math.sin(F.h);
    const lx = (f.x - F.x) * c - (f.z - F.z) * s, lz = (f.x - F.x) * s + (f.z - F.z) * c;
    const tx = (gx - F.x) * c - (gz - F.z) * s, tz = (gx - F.x) * s + (gz - F.z) * c;
    const W = car.halfW + 0.45, zIn = lz > car.rear - 0.4 && lz < car.front + 0.4, tIn = tz > car.rear - 0.4 && tz < car.front + 0.4, zc = via > 0 ? car.front + .55 + .65 * (f.k % 2) : car.rear - 0.64 - .24 * (f.k % 2);
    let wx = null, wz = 0;
    if (Math.abs(tx) > car.halfW && lx * tx < 0 && Math.abs(lx) > 0.05) {
      if (zIn) { wx = Math.sign(lx) * Math.max(Math.abs(lx), W); wz = zc; }      // 제 옆을 따라 건너는 줄까지
      else { wx = Math.sign(tx) * W; wz = zc; }                                  // 건너는 줄에서 반대편으로
    } else if (Math.abs(lx) < car.halfW + 0.3 && !zIn && tIn && Math.abs(tx) > car.halfW) { wx = Math.sign(tx) * W; wz = lz; }   // 차 앞 · 뒤에서 옆으로 먼저 비킨다
    if (wx === null) { f.tx = gx; f.tz = gz; return false; }
    f.tx = F.x + wx * c + wz * s; f.tz = F.z - wx * s + wz * c; return true;
  }

  // ── 할 일 정하기(조의 단계 · 역할 → 갈 곳 · 자세) ──
  const tmp = new Float64Array(6);
  function plan(T, f, dt) {
    const isJack = f.k === 4, W = isJack ? null : WHEEL_OF[f.k];
    const S = T.spot, os = outerSign(T, S), side = W ? (W.inner ? -os : os) : 0;
    const wx = W ? (W.front ? car.wfx : car.wrx) : 0, wz = W ? (W.front ? car.wfz : car.wrz) : 0, wr = W ? (W.front ? car.wfr : car.wrr) : 0;
    let gx = f.hx, gz = f.hz, face = f.hyaw, spd = 1.6, obstacle = null, via = 1;
    f.gunOn = false; f.cT = 0.05; f.kT = 0; f.pitchT = 0; carryHands(f);
    const phase = T.phase;
    // 기다림: 제자리, 차가 가까우면 그쪽으로(안쪽 ±70°)
    if (phase === 'idle' || (phase === 'release' && T.departed)) {
      const dist = car.ok ? Math.hypot(car.x - f.hx, car.z - f.hz) : Infinity;
      if (dist < 40) { const want = Math.atan2(car.x - f.hx, car.z - f.hz); face = f.hyaw + clamp(wrap(want - f.hyaw), -1.2, 1.2); f.pitchT = 0.1; }
      const far = Math.hypot(f.hx - f.x, f.hz - f.z); spd = far > 4 ? 3.4 : 2.4;
      if (car.ok && Math.abs(car.v) < 4 && Math.hypot(car.x - f.x, car.z - f.z) < 8) { carFrame.x = car.x; carFrame.z = car.z; carFrame.h = car.h; obstacle = carFrame; via = -1; }
      if (isJack) { if (T.cheer > 0) jackHold(T, f, 1.2, 'cheer'); else jackIdle(T, f); }
    } else if (phase === 'ready') {
      obstacle = S; via = 1;
      if (W) {
        gx = fx(S, side * (wx + 0.98), wz); gz = fz(S, side * (wx + 0.98), wz); face = S.h + (side > 0 ? -Math.PI / 2 : Math.PI / 2); spd = W.inner ? 6.5 : 4.5;
        f.cT = 0.55; const h = f.handT; h[0] = 0.05; h[1] = 0.46; h[2] = 0.36; h[3] = -0.04; h[4] = 0.4; h[5] = 0.3; f.gunAT[0] = 0; f.gunAT[1] = -0.12; f.gunAT[2] = 1;
      } else {
        gx = fx(S, os * (car.halfW + 0.9), car.front + 1.6); gz = fz(S, os * (car.halfW + 0.9), car.front + 1.6); face = S.h + Math.PI; spd = 3.6; f.cT = 0.15;
        jackHold(T, f, 1.2, 'stop');
      }
    } else if (phase === 'work') {
      obstacle = S; via = 1;
      if (W) {
        const change = W.front ? 0 : smooth((f.gunClock-.20)/.25) * (1-smooth((f.gunClock-1.12)/.22));
        const reach = wx + 0.09 + GUN.tip + 0.24 + .19*change;
        gx = fx(S, side * reach, wz+.21*change); gz = fz(S, side * reach, wz+.21*change); face = S.h - side*(Math.PI/2+.20*change);
        const left = Math.hypot(gx - f.x, gz - f.z); spd = clamp(left / 0.2, 3.5, 9);
        f.arrived = left < 0.3;
        if (f.arrived) {
          f.cT = 0.3; f.kT = 1; f.pitchT = 0.35;
          // 렌치 끝 = 바퀴 가운데의 겉면. 손잡이(오른손) = 끝 − 축 × tip − 위 × up. 축은 바퀴를 본다(차의 옆 방향).
          const ax = -side * Math.cos(S.h), az = side * Math.sin(S.h);
          const hx = fx(S, side * (wx + 0.09), wz), hz = fz(S, side * (wx + 0.09), wz), hy = f.gy + wr + T.lift;
          toLocal(f, hx - ax * GUN.tip, hy - GUN.up, hz - az * GUN.tip, f.handT, 3);
          toLocal(f, hx - ax * (GUN.tip - 0.1), hy - GUN.up + 0.075, hz - az * (GUN.tip - 0.1), f.handT, 0); f.handT[0] += 0.03;
          const s = Math.sin(f.yaw), c = Math.cos(f.yaw); f.gunAT[0] = ax * c - az * s; f.gunAT[1] = 0; f.gunAT[2] = ax * s + az * c;
          // 렌치: 도착하고 0.1초 뒤부터 0.3초 돌고 0.2초 쉰다(사람마다 엇갈려)
          f.gunClock += dt; const t = f.gunClock - 0.1;
          f.gunOn = T.t > 0.25 && t > 0 && ((t + GUN_OFFSET[f.k]) % 0.5) < 0.3;
        } else { f.cT = 0.3; f.gunClock = 0; const h = f.handT; h[0] = 0.05; h[1] = 0.46; h[2] = 0.36; h[3] = -0.04; h[4] = 0.4; h[5] = 0.3; f.gunAT[0] = 0; f.gunAT[1] = -0.12; f.gunAT[2] = 1; }
      } else {
        // 잭: 차 코 앞(손잡이 뿌리)에 놓고 차를 본다
        const L = JACK.handle, run = L * Math.cos(0.3) + 0.24;
        gx = fx(S, os * 0.08, car.front + 0.3 + run); gz = fz(S, os * 0.08, car.front + 0.3 + run); face = S.h + Math.PI;
        spd = clamp(Math.hypot(gx - f.x, gz - f.z) / 0.12, 3, 7);
        const lifted = T.lift / LIFT_TOP;
        f.cT = 0.4 + 0.35 * lifted; f.pitchT = 0.2;
        T.jack.tx = fx(S, os * 0.08, car.front + 0.3); T.jack.tz = fz(S, os * 0.08, car.front + 0.3); T.jack.aT = 0.62 - 0.32 * lifted; T.jack.hands = 2;
      }
    } else if (phase === 'release') {
      obstacle = S; via = -1;
      if (W) {
        gx = fx(S, side * (wx + 1.05), wz); gz = fz(S, side * (wx + 1.05), wz); face = S.h + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        spd = clamp(Math.hypot(gx - f.x, gz - f.z) / 0.25, 2.5, 6); f.cT = 0.12;
      } else {
        // 앞길 바깥으로 비켜서서(차 폭 반 + 1 m) 차가 가는 쪽을 보고, 안쪽 손으로 가라고 흔든다
        gx = fx(S, os * (car.halfW + 1.0), car.front + 0.45); gz = fz(S, os * (car.halfW + 1.0), car.front + 0.45); face = S.h;
        spd = clamp(Math.hypot(gx - f.x, gz - f.z) / 0.3, 3, 8); f.cT = 0.1;
        jackHold(T, f, 1.2, 'go');
      }
    }
    if (obstacle && !(isJack && phase !== 'idle')) route(f, obstacle, via, gx, gz); else { f.tx = gx; f.tz = gz; }
    f.tyaw = face; f.spd = spd;
  }
  // 잭 · 신호수: 손잡이를 바깥쪽 손에 쥐고 섰다(idle) · 한 손을 든다(stop) · 흔든다(go)
  function jackIdle(T, f) { jackHold(T, f, 1.2, ''); }
  function jackHold(T, f, a, gesture) {
    const s = Math.sin(f.yaw), c = Math.cos(f.yaw), lfx = c, lfz = -s;   // 그 사람의 왼쪽
    const outL = T.ox * lfx + T.oz * lfz >= 0 ? 1 : -1;                    // 바깥(벽 쪽)이 그 사람의 왼쪽이면 +1
    const L = JACK.handle, run = L * Math.cos(a) + 0.2;
    T.jack.tx = f.x + Math.sin(f.yaw) * run + lfx * outL * 0.16; T.jack.tz = f.z + Math.cos(f.yaw) * run + lfz * outL * 0.16; T.jack.aT = a; T.jack.hands = outL;   // 그 손(+1 왼손 · −1 오른손)이 손잡이
    const h = f.handT, free = outL > 0 ? 3 : 0, sgn = outL > 0 ? -1 : 1;   // 빈 손(바깥 반대쪽)
    if (gesture === 'stop') { h[free] = sgn * 0.08; h[free + 1] = 0.98; h[free + 2] = 0.26; }
    else if (gesture === 'cheer') { const w = reduce ? 0 : Math.sin(time * 11); h[free] = sgn * (0.27 + 0.12 * w); h[free + 1] = 1.32 + 0.04 * Math.abs(w); h[free + 2] = 0.06; }   // 부스터를 채워 준 손짓: 빈 손을 머리 위로(흔들기)
    else if (gesture === 'go') { const w = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(time * 8); h[free] = sgn * (0.12 + 0.3 * w); h[free + 1] = 0.78 + 0.08 * w; h[free + 2] = 0.38 - 0.22 * w; }
    else { h[free] = sgn * 0.19; h[free + 1] = 0.43; h[free + 2] = 0.02; }
  }

  // ── 움직이기 · 자세 ──
  function move(f, dt) {
    const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
    let step = 0;
    const targetSpeed = Math.min(f.spd, Math.sqrt(2 * 30 * d));
    f.strideSpeed += (targetSpeed - f.strideSpeed) * ease(20, dt);
    if (d > 1e-4 && dt > 0) {
      step = Math.min(d, f.strideSpeed * dt);
      let x = f.x + dx/d*step, z = f.z + dz/d*step;
      // 차 앞으로 건너거나 돌아가는 짧은 길목에서 먼저 선 동료의 어깨를 비켜 간다.
      if (f.team.phase !== 'idle') for (const other of figures) {
        if (other === f) continue;
        let ax = x-other.x, az = z-other.z;
        const squared = ax*ax+az*az;
        if (squared >= .35*.35) continue;
        if (squared < 1e-10) { ax = Math.cos(f.yaw); az = -Math.sin(f.yaw); }
        const scale = .35/Math.hypot(ax,az);
        x = other.x + ax*scale; z = other.z + az*scale;
      }
      step = Math.hypot(x-f.x,z-f.z); f.x = x; f.z = z;
    }
    const v = dt > 0 ? step / dt : 0;
    f.amp += (clamp(v / 3, 0, 1) * (reduce ? 0.5 : 1) - f.amp) * ease(10, dt);
    f.gait += step / 0.45 * Math.PI;
    // 멀리 갈 때는 가는 쪽을, 가까우면 할 일 쪽을 본다
    const want = d > 0.7 && f.spd > 1 ? Math.atan2(dx, dz) : f.tyaw;
    f.yaw = wrap(f.yaw + wrap(want - f.yaw) * ease(14, dt));
    const k = ease(12, dt);
    const moving = d > 0.15 && f.amp > 0.2;
    f.crouch += ((moving ? Math.max(0.12, f.cT * 0.5) : f.cT) - f.crouch) * k;
    f.kneel += ((moving ? 0 : f.kT) - f.kneel) * ease(f.kT > f.kneel ? 18 : 12, dt);
    f.pitch += (f.pitchT - f.pitch) * k;
    const kh = ease(18, dt); for (let i = 0; i < 6; i++) f.hand[i] += (f.handT[i] - f.hand[i]) * kh;
    for (let i = 0; i < 3; i++) f.gunA[i] += (f.gunAT[i] - f.gunA[i]) * kh;
    if (!(Math.abs(f.x - f.sx) < 0.3 && Math.abs(f.z - f.sz) < 0.3)) { f.sx = f.x; f.sz = f.z; const g = fin(ground(f.x, f.z), f.gy - LIFT.road); f.gy = g + LIFT.road; }
  }
  // 관절(월드)을 f.joints 에: 0 골반 1 목 2 헬멧 3 어깨L 4 어깨R 5 엉덩L 6 엉덩R 7 무릎L 8 무릎R 9 발L 10 발R 11 팔꿈치L 12 팔꿈치R 13 손L 14 손R 15 (빈칸)
  //   (매 화면 불리므로 닫힘 함수 · 배열을 새로 만들지 않는다 — 지금 사람의 기준은 아래 변수에 둔다)
  let PF = null, PJ = null, PLX = 0, PLZ = 0, PFX = 0, PFZ = 0;
  function W(i, lx, ly, lz) { PJ[i * 3] = PF.x + PLX * lx + PFX * lz; PJ[i * 3 + 1] = PF.gy + ly; PJ[i * 3 + 2] = PF.z + PLZ * lx + PFZ * lz; }
  function pose(f) {
    const J = f.joints, s = Math.sin(f.yaw), c = Math.cos(f.yaw), fwx = s, fwz = c, lfx = c, lfz = -s;
    PF = f; PJ = J; PLX = lfx; PLZ = lfz; PFX = fwx; PFZ = fwz;
    const cr = f.crouch, kn = f.kneel, amp = f.amp, g = f.gait, calm = reduce ? 0.3 : 1;
    const bob = amp * 0.025 * Math.abs(Math.sin(g)) + (1 - amp) * 0.006 * calm * Math.sin(time * 2.1 + f.seed);
    const py = BODY.hip - 0.17 * cr - 0.27 * kn + bob, pz = -0.02 * cr + 0.05 * kn;
    const phi = 0.06 + 0.4 * cr + 0.5 * kn + 0.18 * amp, sway = (1 - amp) * 0.012 * calm * Math.sin(time * 1.3 + f.seed * 2) + .021 * Math.sin(g) * amp;
    const dy = Math.cos(phi), dz = Math.sin(phi);
    W(0, sway, py, pz);
    const nx = sway * 1.4 + .023 * Math.sin(f.seed + .5) * (1 - amp) * (1 - kn), ny = py + dy * BODY.torso, nz = pz + dz * BODY.torso; W(1, nx, ny, nz);
    W(2, nx, ny + 0.127, nz + 0.03 + 0.05 * dz);
    W(3, nx + BODY.shoulder, ny - dy * 0.06, nz - dz * 0.06); W(4, nx - BODY.shoulder, ny - dy * 0.06, nz - dz * 0.06);
    W(5, sway + BODY.hipW, py - 0.02, pz); W(6, sway - BODY.hipW, py - 0.02, pz);
    // 발: 선 자리(걸음) ↔ 무릎 꿇기(왼무릎을 땅에 · 왼발은 뒤, 오른발은 앞에)
    const st = Math.sin(g) * 0.2 * amp, liftL = Math.max(0, Math.cos(g)) * 0.09 * amp, liftR = Math.max(0, -Math.cos(g)) * 0.09 * amp, spread = 0.1 + 0.05 * cr;
    const lx0 = spread, ly0 = 0.06 + liftL, lz0 = 0.03 * cr + st + .062 * Math.cos(f.seed) * (1 - amp), rx0 = -spread, ry0 = 0.06 + liftR, rz0 = -0.02 * cr - st - .062 * Math.cos(f.seed) * (1 - amp);
    W(9, lx0 + (0.11 - lx0) * kn, ly0 + (0.05 - ly0) * kn, lz0 + (-0.24 - lz0) * kn);
    W(10, rx0 + (-0.11 - rx0) * kn, ry0 + (0.06 - ry0) * kn, rz0 + (0.25 - rz0) * kn);
    // 손: 로컬 목표 + 걸을 때 흔들기 + 렌치가 돌 때 떨림
    const swing = Math.sin(g) * 0.12 * amp, h = f.hand;
    let jx = 0, jy = 0, jz = 0;
    if (f.gunOn && !reduce) { jx = Math.sin(time * 97 + f.seed) * 0.006; jy = Math.sin(time * 131 + f.seed * 3) * 0.006; jz = Math.sin(time * 83) * 0.004; }
    W(13, h[0] + jx, h[1] + jy, h[2] - swing + jz); W(14, h[3] + jx, h[4] + jy, h[5] + swing + jz);
    // IK: 다리(무릎은 앞으로) · 팔(팔꿈치는 아래 · 뒤 · 바깥)
    ik(J, 21, J[15], J[16], J[17], J[27], J[28], J[29], BODY.thigh, BODY.shin, fwx + lfx * 0.15, 0.05, fwz + lfz * 0.15, 27);
    ik(J, 24, J[18], J[19], J[20], J[30], J[31], J[32], BODY.thigh, BODY.shin, fwx - lfx * 0.15, 0.05, fwz - lfz * 0.15, 30);
    ik(J, 33, J[9], J[10], J[11], J[39], J[40], J[41], BODY.upper, BODY.fore, -fwx * 0.5 + lfx * 0.7, -1, -fwz * 0.5 + lfz * 0.7, 39);
    ik(J, 36, J[12], J[13], J[14], J[42], J[43], J[44], BODY.upper, BODY.fore, -fwx * 0.5 - lfx * 0.7, -1, -fwz * 0.5 - lfz * 0.7, 42);
    // 렌치: 손잡이 = 오른손, 축 = 로컬 gunA, 위 = 축에 수직인 위쪽
    const G = f.G, a0 = f.gunA[0], a1 = f.gunA[1], a2 = f.gunA[2], al = Math.hypot(a0, a1, a2) || 1;
    G[0] = J[42]; G[1] = J[43]; G[2] = J[44];
    const ax = (lfx * a0 + fwx * a2) / al, ay = a1 / al, az = (lfz * a0 + fwz * a2) / al;
    let ux = -ax * ay, uy = 1 - ay * ay, uz = -az * ay; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    G[3] = ax; G[4] = ay; G[5] = az; G[6] = ux; G[7] = uy; G[8] = uz;
  }
  function limb(la, idx, J, a, b, r, lfx, lfz) { seg(la, idx, J[a * 3], J[a * 3 + 1], J[a * 3 + 2], J[b * 3], J[b * 3 + 1], J[b * 3 + 2], r, r, lfx, 0, lfz, LIMB_LEN); }
  function boot(ea, idx, J, foot, lfx, lfz, fwx, fwz) {
    put(ea, idx, J[foot * 3] + fwx * 0.04, J[foot * 3 + 1] - 0.012, J[foot * 3 + 2] + fwz * 0.04, lfx * 0.058, 0, lfz * 0.058, 0, 0.048, 0, fwx * 0.105, 0, fwz * 0.105);
  }
  function write(f, i) {
    const J = f.joints, s = Math.sin(f.yaw), c = Math.cos(f.yaw), lfx = c, lfz = -s, fwx = s, fwz = c, ta = torso.instanceMatrix.array, la = limbs.instanceMatrix.array, ea = ends.instanceMatrix.array;
    // 몸통: 골반 → 목, 앞뒤로 납작
    seg(ta, i, J[0], J[1], J[2], J[3], J[4], J[5], 1, 0.74, lfx, 0, lfz, 0.31);
    // 팔다리
    const b = i * LIMBS;
    limb(la, b, J, 5, 7, R.thigh, lfx, lfz); limb(la, b + 1, J, 7, 9, R.shin, lfx, lfz); limb(la, b + 2, J, 6, 8, R.thigh, lfx, lfz); limb(la, b + 3, J, 8, 10, R.shin, lfx, lfz);
    limb(la, b + 4, J, 3, 11, R.upper, lfx, lfz); limb(la, b + 5, J, 11, 13, R.fore, lfx, lfz); limb(la, b + 6, J, 4, 12, R.upper, lfx, lfz); limb(la, b + 7, J, 12, 14, R.fore, lfx, lfz);
    // 헬멧: 몸의 기울기 일부 + 고개(앞을 아래로 숙인다: Y' = up·cos + fw·sin, Z' = fw·cos − up·sin)
    const p = f.pitch + 0.25 * Math.sin(0.06 + 0.4 * f.crouch + 0.5 * f.kneel), cp = Math.cos(p), spp = Math.sin(p);
    put(helmets.instanceMatrix.array, i, J[6], J[7], J[8], lfx, 0, lfz, fwx * spp, cp, fwz * spp, fwx * cp, -spp, fwz * cp);
    // 장갑 · 장화
    const gl = R.glove;
    put(ea, i * ENDS, J[39], J[40], J[41], lfx*gl, 0, lfz*gl, 0, gl*.86, 0, fwx*gl*1.18, 0, fwz*gl*1.18);
    put(ea, i * ENDS + 1, J[42], J[43], J[44], lfx*gl, 0, lfz*gl, 0, gl*.86, 0, fwx*gl*1.18, 0, fwz*gl*1.18);
    boot(ea, i * ENDS + 2, J, 9, lfx, lfz, fwx, fwz); boot(ea, i * ENDS + 3, J, 10, lfx, lfz, fwx, fwz);
  }
  function matrix(i) {
    const b = bones[i]; b.matrixWorldNeedsUpdate = true; return b.matrix.elements;
  }
  function writeGun(f, base) {
    const G = f.G, ax=G[3], ay=G[4], az=G[5], ux=G[6], uy=G[7], uz=G[8];
    put(matrix(base+f.k),0,G[0],G[1],G[2],uy*az-uz*ay,uz*ax-ux*az,ux*ay-uy*ax,ux,uy,uz,ax,ay,az);
    if (f.k !== 0 && f.k !== 2) return;
    const w = f.wheel;
    writeWheel(base+4+f.k, w.x,w.y,w.z,w.radius,w.yaw,w.lean,w.spin);
    writeWheel(base+5+f.k, w.ox,w.oy,w.oz,w.radius,w.yaw,w.oldLean,-w.spin);
  }
  function writeWheel(index,x,y,z,r,yaw,lean,spin) {
    const c = Math.cos(yaw), s = Math.sin(yaw), a = Math.cos(lean), b = Math.sin(lean);
    const v = Math.cos(spin), t = Math.sin(spin);
    put(matrix(index),0,x,y,z,
      r*c*a,r*b,-r*s*a,
      r*(-c*b*v+s*t),r*a*v,r*(s*b*v+c*t),
      r*(c*b*t+s*v),-r*a*t,r*(-s*b*t+c*v));
  }
  function writeJack(T, base) {
    const j = T.jack, x=j.px, y=T.figures[4].gy, z=j.pz, dx=j.dx, dz=j.dz;
    put(matrix(base+8),0,x,y+.086,z,dz,0,-dx,0,1,0,dx,0,dz);
    const a = Math.sin(j.a), b = Math.cos(j.a);
    put(matrix(base+9),0,x,y+JACK.pivotY,z,dz,0,-dx,-dx*a,b,-dz*a,dx*b,a,dz*b);
  }

  // 뒤 타이어 담당은 왼손으로 옆면 윗부분을 잡는다. 허브를 따라 빼고, 옆에 놓았던 것을 밀어 넣는다.
  function wheelPose(T,f,dt) {
    const w=f.wheel, S=T.spot, work=T.phase === 'work' && f.arrived;
    // 두 바퀴는 뒷바퀴가 하나라 갈아 끼우는 사람도 하나(바깥 뒤 k 0). 안쪽 뒤(k 2)는 렌치만 — 들고 다니던 타이어는 감춘다(땅 밑).
    if (car.twoWheel && f.k === 2) { w.x = w.ox = f.x; w.z = w.oz = f.z; w.y = w.oy = -1000; w.radius = car.wrr; w.yaw = f.yaw; w.lean = w.oldLean = 0; w.spin = 0; return; }
    const r = car.wrr, side=(f.k === 0 ? 1 : -1)*outerSign(T,S);
    const parkX=f.x+.25*Math.cos(f.yaw)+.15*Math.sin(f.yaw);
    const parkZ=f.z-.25*Math.sin(f.yaw)+.15*Math.cos(f.yaw);
    let x=parkX, y=f.gy+r, z=parkZ, ox=parkX, oy=-1000, oz=parkZ;
    let yaw=f.yaw-Math.PI/2, lean=.12, oldLean=0;
    let followFresh=true, guiding=false;
    if (work) {
      const progress=clamp((f.gunClock-.22)/1.02,0,1);
      const off=smooth(progress/.44), on=smooth((progress-.41)/.59);
      const hub=car.wrx-.035, gap=r*1.80;
      // 헌 타이어는 작업자 뒤쪽 바닥으로 눕히고 새것은 앞에서 세워 밀어 넣는다.
      const newSide=hub+.48*(1-on), oldSide=hub+.34*off;
      const newZ=car.wrz+gap*(1-on), oldZ=car.wrz-gap*off;
      yaw=S.h; lean=side*1.07*(1-on); oldLean=side*1.31*off;
      x=fx(S,side*newSide,newZ); z=fz(S,side*newSide,newZ);
      ox=fx(S,side*oldSide,oldZ); oz=fz(S,side*oldSide,oldZ);
      y=f.gy+r*(Math.cos(lean)+.28*Math.abs(Math.sin(lean)))+T.lift*on;
      oy=f.gy+r*(Math.cos(oldLean)+.28*Math.abs(Math.sin(oldLean)))+T.lift*(1-off);
      followFresh = progress >= .42;
      if (progress <= 0) oy=-1000;
      if (progress >= 1) y=-1000;
      guiding = progress > 0 && progress < 1;
      // 분리·장착 중에는 총구를 허브에서 당겨 자리를 내 준다.
      if (guiding) { f.pitchT=.41; f.handT[3]-=.095; f.handT[5]-=.13; }
    }
    // 들고 있던 바퀴를 놓고 집을 때의 관성을 남긴다. 숨길 때는 원래 차의 휠 속이다.
    const k = dt ? ease(17,dt) : 1;
    const wasFresh = w.y > -100;
    if (!work && !wasFresh && w.oy > -100) { w.x=w.ox; w.y=w.oy; w.z=w.oz; }
    const snapFresh = !Number.isFinite(w.y) || w.y < -100 || y < -100;
    const snapOld = !Number.isFinite(w.oy) || w.oy < -100 || oy < -100;
    w.x=snapFresh ? x : w.x+(x-w.x)*k; w.y=snapFresh ? y : w.y+(y-w.y)*k; w.z=snapFresh ? z : w.z+(z-w.z)*k;
    w.ox=snapOld ? ox : w.ox+(ox-w.ox)*k; w.oy=snapOld ? oy : w.oy+(oy-w.oy)*k; w.oz=snapOld ? oz : w.oz+(oz-w.oz)*k;
    w.lean=fin(w.lean,lean)+(lean-fin(w.lean,lean))*k;
    w.oldLean=oldLean; w.radius=r; w.spin=f.gait*.42;
    w.yaw=fin(w.yaw,yaw)+wrap(yaw-fin(w.yaw,yaw))*k;
    if (guiding || !work) {
      const hx=followFresh?w.x:w.ox, hy=followFresh?w.y:w.oy, hz=followFresh?w.z:w.oz;
      toLocal(f,hx,hy+r*.71,hz,f.handT,0);
    }
  }
  // 잭의 손잡이 끝(월드) → 잭 · 신호수의 손 목표
  function jackFollow(T, f, dt) {
    const j = T.jack, k = ease(T.phase === 'work' ? 16 : 10, dt);
    j.px += (fin(j.tx, j.px) - j.px) * k; j.pz += (fin(j.tz, j.pz) - j.pz) * k; j.a += (fin(j.aT, j.a) - j.a) * ease(12, dt);
    let dx = f.x - j.px, dz = f.z - j.pz; const d = Math.hypot(dx, dz);
    if (d > 0.05) { dx /= d; dz /= d; j.dx += (dx - j.dx) * ease(14, dt); j.dz += (dz - j.dz) * ease(14, dt); const l = Math.hypot(j.dx, j.dz) || 1; j.dx /= l; j.dz /= l; }
    const L = JACK.handle, hx = j.px + j.dx * L * Math.cos(j.a), hy = f.gy + JACK.pivotY + L * Math.sin(j.a), hz = j.pz + j.dz * L * Math.cos(j.a);
    const cx = -j.dz, cz = j.dx;   // 손잡이를 가로지르는 방향
    if (j.hands === 2) { toLocal(f, hx + cx * 0.07, hy, hz + cz * 0.07, f.handT, 0); toLocal(f, hx - cx * 0.07, hy, hz - cz * 0.07, f.handT, 3); if (f.handT[0] < f.handT[3]) { for (let i = 0; i < 3; i++) { const t = f.handT[i]; f.handT[i] = f.handT[i + 3]; f.handT[i + 3] = t; } } }
    else toLocal(f, hx, hy, hz, f.handT, j.hands > 0 ? 0 : 3);
  }

  // ── 불티 ──
  function emit(f, dt) {
    if (reduce || !f.gunOn) return;
    f.spark += dt * 34;
    const G = f.G;
    while (f.spark >= 1) {
      f.spark -= 1; const i = sp.cursor; sp.cursor = (sp.cursor + 1) % N_SPARK;
      sp.x[i] = G[0] + G[3] * GUN.tip + G[6] * GUN.up; sp.y[i] = G[1] + G[4] * GUN.tip + G[7] * GUN.up; sp.z[i] = G[2] + G[5] * GUN.tip + G[8] * GUN.up;
      const r1 = Math.random() - 0.5, r2 = Math.random() - 0.5;
      sp.vx[i] = -G[3] * 1.1 + r1 * 1.6 - G[5] * r2 * 1.2; sp.vy[i] = 0.8 + Math.random() * 1.2; sp.vz[i] = -G[5] * 1.1 + r2 * 1.6 + G[3] * r1 * 1.2;
      sp.age[i] = 0; sp.life[i] = 0.14 + Math.random() * 0.16;
    }
  }
  function drawSparks(dt) {
    const pos = sparkGeo.attributes.position.array, tint = sparkGeo.attributes.tint.array, size = sparkGeo.attributes.size.array; let n = 0;
    for (let i = 0; i < N_SPARK; i++) {
      if (sp.life[i] <= 0) continue;
      sp.age[i] += dt; if (sp.age[i] >= sp.life[i]) { sp.life[i] = 0; continue; }
      sp.vy[i] -= 7 * dt; sp.x[i] += sp.vx[i] * dt; sp.y[i] += sp.vy[i] * dt; sp.z[i] += sp.vz[i] * dt;
      const t = sp.age[i] / sp.life[i];
      pos[n * 3] = sp.x[i]; pos[n * 3 + 1] = sp.y[i]; pos[n * 3 + 2] = sp.z[i];
      tint[n * 4] = 1; tint[n * 4 + 1] = 0.85 - 0.35 * t; tint[n * 4 + 2] = 0.45 - 0.35 * t; tint[n * 4 + 3] = 1 - t;
      size[n] = 0.035 * (1 - 0.5 * t); n++;
    }
    sparkGeo.setDrawRange(0, n); sparks.visible = n > 0;
    if (n) { sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.tint.needsUpdate = true; sparkGeo.attributes.size.needsUpdate = true; }
    return n;
  }

  // ── 단계 바꾸기 ──
  function enter(T, phase) {
    T.phase = phase; T.t = 0;
    if (phase === 'work') { T.anchor.x = car.x; T.anchor.z = car.z; for (const f of T.figures) { f.gunClock = 0; f.arrived = false; } }
    if (phase === 'release') { served = true; T.departed = false; if (T.up) { T.up = false; out.event = 'down'; } for (const f of T.figures) f.gunOn = false; }
  }
  function phases(dt) {
    if (!car.inPit) served = false;
    let T = act >= 0 ? teams[act] : null;
    if (!T) {
      if (car.holding && !served) {
        if (car.repairing) { act = car.box >= 0 && car.box < NT ? car.box : nearestTeam(car.x, car.z); T = teams[act]; T.spot.x = car.x; T.spot.z = car.z; T.spot.h = car.h; enter(T, 'work'); }
        else { predict(teams[0]); act = nearestTeam(teams[0].spot.x, teams[0].spot.z); T = teams[act]; predict(T); enter(T, 'ready'); }
      }
      return;
    }
    T.t += dt;
    if (T.phase === 'ready') {
      if (car.repairing) {
        const k = car.box >= 0 && car.box < NT ? car.box : nearestTeam(car.x, car.z);
        if (k !== act) { T.phase = 'idle'; act = k; T = teams[k]; }
        T.spot.x = car.x; T.spot.z = car.z; T.spot.h = car.h; enter(T, 'work');
      } else if (!car.holding) { T.phase = 'idle'; act = -1; }
      else {
        predict(T); const k = nearestTeam(T.spot.x, T.spot.z);
        if (k !== act) { T.phase = 'idle'; act = k; const U = teams[k]; U.spot.x = T.spot.x; U.spot.z = T.spot.z; U.spot.h = T.spot.h; enter(U, 'ready'); }
      }
    } else if (T.phase === 'work') {
      const moved = Math.hypot(car.x - T.anchor.x, car.z - T.anchor.z);
      if (moved < 0.8) { T.spot.x = car.x; T.spot.z = car.z; T.spot.h = car.h; }
      const rate = GP_RULES?.repair?.rate || 34, remaining = (100 - clamp(car.value, 0, 100)) / rate;
      if (!car.holding || moved >= 0.8 || remaining < EARLY) enter(T, 'release');
      else if (!T.up) {
        const j = T.figures[4], there = Math.hypot(j.tx - j.x, j.tz - j.z) < 0.15 && Math.hypot(T.jack.tx - T.jack.px, T.jack.tz - T.jack.pz) < 0.12;
        if (there || T.t > 0.45) { T.up = true; out.event = 'up'; }
      }
    } else if (T.phase === 'release') {
      const gone = Math.hypot(car.x - T.spot.x, car.z - T.spot.z);
      if (!T.departed && (gone > 1.2 || !car.inPit || T.t > 4)) T.departed = true;
      if (T.departed) {
        let home = true; for (const f of T.figures) if (Math.hypot(f.x - f.hx, f.z - f.hz) > 0.12) { home = false; break; }
        if (home || T.t > 12) { T.phase = 'idle'; act = -1; }
      }
    }
  }

  homeAll();
  const writeAll = () => {
    let i = 0;
    for (const T of teams) {
      for (const f of T.figures) {
        if (f.k === 4) jackFollow(T, f, 1);
        if (f.k === 0 || f.k === 2) wheelPose(T,f,0);
        pose(f); write(f, i++);
        if (f.k < 4) writeGun(f, T.index * TOOLS);
      }
      writeJack(T, T.index * TOOLS);
    }
    for (const m of meshes) if (m.isInstancedMesh) m.instanceMatrix.needsUpdate = true;
  };
  for (const f of figures) { f.gy = fin(ground(f.x, f.z)) + LIFT.road; f.sx = f.x; f.sz = f.z; }
  writeAll();

  function update(view, dt) {
    out.event = ''; out.guns = 0;
    dt = clamp(fin(dt, 0), 0, 0.1); time += dt;
    readCar(view, dt);
    const far = !car.ok || (car.x - bound.x) ** 2 + (car.z - bound.z) ** 2 > 250 * 250;
    if (far) {
      if (!parked) { homeAll(); for (const f of figures) f.sx = NaN; for (const f of figures) move(f, 0); writeAll(); drawSparks(0); parked = true; }
      out.lift = 0; return out;
    }
    parked = false;
    phases(dt);
    let i = 0, guns = 0;
    for (const T of teams) {
      // 잭 높이: 올릴 때 0.3 m/s, 내릴 때 0.45 m/s
      const want = T.phase === 'work' && T.up ? LIFT_TOP : 0;
      T.lift = want > T.lift ? Math.min(want, T.lift + 0.3 * dt) : Math.max(want, T.lift - 0.45 * dt);
      if (T.lift < 1e-4) T.lift = 0;
      if (T.cheer > 0) T.cheer = T.phase === 'idle' ? Math.max(0, T.cheer - dt) : 0;
      for (const f of T.figures) {
        plan(T, f, dt);
        if (f.k === 4) jackFollow(T, f, dt);
        if (f.k === 0 || f.k === 2) wheelPose(T,f,dt);
        move(f, dt);
        pose(f); write(f, i++);
        if (f.k < 4) { writeGun(f, T.index * TOOLS); if (f.gunOn) guns++; emit(f, dt); }
      }
      writeJack(T, T.index * TOOLS);
    }
    for (const m of meshes) if (m.isInstancedMesh) m.instanceMatrix.needsUpdate = true;
    drawSparks(dt);
    out.guns = Math.min(4, guns); lastGuns = out.guns;
    let lift = 0; for (const T of teams) lift = Math.max(lift, T.lift);
    out.lift = clamp(act >= 0 ? teams[act].lift : lift, 0, 0.07);
    return out;
  }

  return {
    group, update,
    clear() { homeAll(); for (const f of figures) f.sx = NaN; for (const f of figures) move(f, 0); writeAll(); drawSparks(0); },
    dispose() {
      group.removeFromParent(); mq?.removeEventListener?.('change', onMq);
      for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); m.dispose?.(); }
      cloth.dispose(); tools.skeleton.dispose(); sparkGeo.dispose(); sparkMat.dispose();
    },
    stats: () => ({ figures: NF, drawCalls: meshes.filter(m => m.visible && (!m.isInstancedMesh || m.count > 0)).length + (sparks.visible ? 1 : 0), triangles: Math.round(triangles),
      phase: act >= 0 ? teams[act].phase : 'idle', team: act, lift: out.lift, guns: lastGuns, cheer: teams.reduce((m, T) => Math.max(m, T.cheer), 0), cheerTeam: teams.findIndex(T => T.cheer > 0) }),
    // 검증용: 사람들의 자리(월드)와 역할
    people: () => figures.map(f => ({ team: f.team.index, role: f.k, x: f.x, z: f.z, y: f.gy, kneel: f.kneel, gunOn: f.gunOn, hand: Math.max(f.hand[1], f.hand[4]) })),   // hand: 더 높은 손의 높이(로컬 m — 부스터 채움 손짓 확인용)
  };
}
