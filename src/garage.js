// 차 고르기 장면. 주행 모델은 그대로 두고, 진열할 때만 차의 크기와 중심을 맞춘다.
const GAP = 2.0, EDGE = 0.62, SEEN = 3, REST_ANGLE = 0.55;

// 넓은 소프트박스가 차창과 도색의 굽은 면에 길게 비친다. 첫 입장 때 한 장만 만든다.
function lightCards(THREE) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#5a6876'); g.addColorStop(0.46, '#374453');
  g.addColorStop(0.53, '#101923'); g.addColorStop(1, '#141619');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#fff3da'; ctx.fillRect(19, 22, 66, 14);
  ctx.fillStyle = '#cedef5'; ctx.fillRect(132, 38, 53, 7);
  ctx.fillStyle = '#8a9ba8'; ctx.fillRect(191, 48, 26, 17);
  const map = new THREE.CanvasTexture(c);
  map.mapping = THREE.EquirectangularReflectionMapping; map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

// 결·패널 틈은 타일 한 장에 구워 바닥 전체를 한 번 그린다.
function floorMap(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d'), im = ctx.createImageData(256, 256);
  let seed = 4131;
  for (let i = 0; i < im.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const v = (seed >>> 25) / 18;
    im.data[i] = 65 + v; im.data[i + 1] = 72 + v; im.data[i + 2] = 80 + v; im.data[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  ctx.fillStyle = 'rgba(11,16,24,.53)'; ctx.fillRect(0, 0, 1.5, 256); ctx.fillRect(0, 0, 256, 1.5);
  ctx.fillStyle = 'rgba(200,210,222,.13)'; ctx.fillRect(2, 0, 1, 256); ctx.fillRect(0, 2, 256, 1);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(16, 16); map.offset.set(0.43, 0.36); return map;
}

// 원근이 보이는 뒤쪽 벽과 들보. 같은 재질인 각재들은 한 번에 그린다.
function bays(THREE) {
  const group = new THREE.Group(), steel = [], lamps = [];
  // 뒷벽은 두 곳의 간접광과 이음매가 있는 한 장이다.
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, 0, 256);
  base.addColorStop(0, '#131a24'); base.addColorStop(0.63, '#29323b'); base.addColorStop(1, '#131a22');
  ctx.fillStyle = base; ctx.fillRect(0, 0, 1024, 256);
  for (const [x, y, w, h, colour] of [[380, 75, 160, 148, 'rgba(117,112,99,.37)'], [650, 140, 180, 120, 'rgba(96,119,140,.41)']]) {
    ctx.save(); ctx.translate(x, y); ctx.scale(w, h);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); glow.addColorStop(0, colour); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
  }
  for (let x = 0; x < 1024; x += 32) {
    ctx.fillStyle = 'rgba(0,0,0,.19)'; ctx.fillRect(x, 0, 1, 256);
    ctx.fillStyle = 'rgba(190,205,222,.05)'; ctx.fillRect(x + 1, 0, 1, 256);
  }
  const wallMap = new THREE.CanvasTexture(c); wallMap.colorSpace = THREE.SRGBColorSpace;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(38, 5.8), new THREE.MeshBasicMaterial({ map: wallMap }));
  wall.position.set(0, 2.90, -6); group.add(wall);

  // x, y, z, 폭, 높이, 깊이, 색
  steel.push([0, 0.18, -5.84, 38, 0.36, 0.20, '#202631']);
  for (let x = -15; x <= 15; x += 6) {
    steel.push([x, 2.8, -5.63, 0.25, 5.6, 0.48, '#53606b'],
      [x - 0.04, 2.79, -5.34, 0.38, 5.58, 0.1, '#3d4955'],
      [x, 4.17, -2.0, 0.17, 0.24, 7.4, '#414951']);
    lamps.push([x, 4.04, -2, 0.075, 0.022, 4.15, '#9daebd']);
  }
  for (let x = -12; x <= 12; x += 6) {
    steel.push([x, 1.32, -5.83, 5.6, 0.028, 0.07, '#67727e']);
  }
  function build(rows, mat) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(), mat, rows.length);
    const tr = new THREE.Object3D(), color = new THREE.Color();
    rows.forEach(([x, y, z, w, h, d, tint], i) => {
      tr.position.set(x, y, z); tr.scale.set(w, h, d); tr.updateMatrix();
      m.setMatrixAt(i, tr.matrix); m.setColorAt(i, color.set(tint));
    });
    group.add(m);
  }
  for (const x of [-3, 3]) {
    steel.push([x, 1.82, -5.25, 0.12, 1.22, 0.08, '#4a5157']);
    lamps.push([x, 1.82, -5.20, 0.031, 1.04, 0.018, '#8d9799']);
  }
  build(steel, new THREE.MeshStandardMaterial({ roughness: 0.74, metalness: 0.16 }));
  build(lamps, new THREE.MeshBasicMaterial());
  return group;
}

// 거친 바닥의 차색 비침. 모델 표면의 성긴 색 표본을 바닥 너머로 접어 흐리게 겹친다.
function reflection(THREE, group, size, strength) {
  const positions = [], colours = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cross = new THREE.Vector3();
  const density = 720 / Math.max(size.x, size.y, size.z, 0.01) ** 2;
  // 삼각형 면적대로 뿌린다. 마디가 많은 바퀴나 손잡이만 짙어지는 것을 막는다.
  let seed = 1921;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  group.updateMatrixWorld(true);
  group.traverseVisible(o => {
    if (!o.isMesh || !o.material.color) return;
    const geo = o.geometry, pos = geo.attributes.position, col = geo.attributes.color;
    const index = geo.index, count = index ? index.count : pos.count, tint = o.material.color;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
      // 도색의 색만 마른 바닥에 남긴다. 유리·금속·타이어가 회색 얼룩을 만들지 않게 한다.
      const r = tint.r * (col ? col.getX(ia) : 1), g = tint.g * (col ? col.getY(ia) : 1);
      const blue = tint.b * (col ? col.getZ(ia) : 1), chroma = Math.max(r, g, blue) - Math.min(r, g, blue);
      if (chroma < 0.055) continue;
      a.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(o.matrixWorld);
      ab.subVectors(b, a); ac.subVectors(c, a);
      const samples = Math.floor(cross.crossVectors(ab, ac).length() * 0.5 * density + random());
      for (let j = 0; j < samples; j++) {
        const u = Math.sqrt(random()), v = random() * u, w = u - v;
        positions.push(a.x + ab.x * w + ac.x * v, a.y + ab.y * w + ac.y * v, a.z + ab.z * w + ac.z * v);
        colours.push(r, g, blue);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, vertexColors: true,
    uniforms: { heightPx: { value: 720 }, brush: { value: Math.max(size.x, size.y, size.z) * 0.085 }, strength: { value: strength } },
    vertexShader: `
      uniform float heightPx, brush;
      varying vec3 tint;
      varying float fade;
      void main() {
        vec4 p = modelMatrix * vec4(position, 1.);
        p.y *= -0.40;
        fade = exp(5.0 * p.y);
        vec3 ray = p.xyz - cameraPosition;
        p.xyz = cameraPosition + ray * ((.001-cameraPosition.y)/ray.y);
        vec4 mv = viewMatrix * p;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(heightPx * projectionMatrix[1][1] * .5 * brush *
          length(modelMatrix[0].xyz) / -mv.z, 1., 96.);
        tint = color;
      }`,
    fragmentShader: `
      uniform float strength;
      varying vec3 tint;
      varying float fade;
      void main() {
        vec2 p = gl_PointCoord * 2. - 1.;
        p.y *= 1.65;
        float a = max(0., 1.-dot(p,p));
        gl_FragColor = vec4(tint * .40, strength * fade * a*a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const points = new THREE.Points(geo, m), pixels = new THREE.Vector2();
  points.frustumCulled = false; points.renderOrder = 1;
  points.onBeforeRender = renderer => { m.uniforms.heightPx.value = renderer.getDrawingBufferSize(pixels).y; };
  return points;
}

// 네 타이어의 실제 밑면을 읽고, 바닥 접점과 차체 반그늘을 한 장에 굽는다.
function contactMap(THREE, group, size) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'), w = size.x * 1.30, l = size.z * 1.20;
  function patch(x, z, rx, rz, core, opacity) {
    ctx.save();
    ctx.translate(64 + 128 * x / w, 64 + 128 * z / l);
    ctx.scale(128 * rx / w, 128 * rz / l);
    const grad = ctx.createRadialGradient(0, 0, core, 0, 0, 1);
    grad.addColorStop(0, `rgba(0,0,0,${opacity})`);
    grad.addColorStop(0.58, `rgba(0,0,0,${opacity * 0.44})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  group.updateMatrixWorld(true);
  const openness = THREE.MathUtils.smoothstep(size.y / size.z, 0.42, 1.25);
  patch(0, 0, w * 0.48, l * 0.48, 0.28, 0.69 - 0.35 * openness);
  const point = new THREE.Vector3(), tread = new THREE.Box3();
  const glb = !!group.getObjectByName('wheelFL');
  const wheels = glb ? ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'] :
    ['frontLeftWheel', 'frontRightWheel', 'rearWheels', 'rearWheels'];
  for (const [index, name] of wheels.entries()) {
    const wheel = group.getObjectByName(name);
    if (!wheel) continue;
    const bounds = new THREE.Box3().setFromObject(wheel, true);
    if (bounds.isEmpty()) continue;
    // 바퀴 전체 경계로 재면 꺾인 앞바퀴의 폭과 허브 장식까지 그림자에 들어간다.
    const low = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.12;
    tread.makeEmpty();
    wheel.traverseVisible(o => {
      const pos = o.geometry?.attributes.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        point.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (point.y > low) continue;
        // 대체 카트는 뒷바퀴 둘이 메시 하나다.
        if (name === 'rearWheels' && (index === 2) !== (point.x > 0)) continue;
        tread.expandByPoint(point);
      }
    });
    if (tread.isEmpty()) continue;
    const x = (tread.min.x + tread.max.x) * 0.5, z = (tread.min.z + tread.max.z) * 0.5;
    const rx = Math.max(w * 0.014, (tread.max.x - tread.min.x) * 0.68);
    const rz = Math.max(l * 0.012, (tread.max.z - tread.min.z) * 0.57);
    patch(x, z, rx * 1.7, rz * 1.6, 0.11, 0.62);
    patch(x, z, rx, rz, 0.43, 0.90);
  }
  return new THREE.CanvasTexture(c);
}

// size: 화면 크기 [폭, 높이]를 주는 함수(없으면 창 크기) — 공유 카드의 쇼룸 사진(shootShowroom)이 창과 상관없이 휴대폰 세로 구도로 그릴 때 쓴다.
export function createGarage(THREE, { cars, makeModel, size = null }) {
  const view = () => size ? size() : [innerWidth, innerHeight];
  const look = new URLSearchParams(location.search).get('garageLook');
  const soft = look === 'soft';
  const reflectionStrength = look === 'r2a' ? 0.016 : look === 'r2c' ? 0.046 : 0.030;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#101620'); scene.fog = new THREE.FogExp2('#101620', 0.053);
  const env = lightCards(THREE); scene.environment = env; scene.environmentIntensity = soft ? 0.52 : 0.68;
  const room = soft ? new THREE.Group() : bays(THREE);
  scene.add(room);
  const tiles = floorMap(THREE);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), new THREE.MeshStandardMaterial({
    map: tiles, roughness: soft ? 0.56 : 0.48, metalness: 0.20
  }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  scene.add(new THREE.HemisphereLight('#c4d2df', '#16191e', 0.73));
  const rim = new THREE.DirectionalLight('#b7d7ff', 0.70); rim.position.set(-4, 3.2, -4); scene.add(rim);
  function spot(colour, power, angle, x, y, z) {
    const lamp = new THREE.SpotLight(colour, power, 18, angle, 0.82, 2);
    lamp.position.set(x, y, z); lamp.target.position.set(0, 0.48, 0.44); scene.add(lamp, lamp.target);
  }
  spot('#fff0db', 360, 0.42, -2.4, 5.4, 2.9);
  spot('#e2eeff', 116, 0.48, 3.3, 2.85, 3.8);

  const blobGeo = new THREE.PlaneGeometry();
  blobGeo.rotateX(-Math.PI / 2);
  const items = cars.map(car => {
    const model = makeModel(car); model.group.traverse(o => { if (o.isMesh) o.castShadow = false; });
    model.update({ speed: 0, steer: 0.35 }, 0.3);
    const paint = model.materials?.paint;
    if (paint?.isMeshStandardMaterial) { paint.roughness = 0.26; paint.metalness = 0.16; }
    // 불이 꺼진 부스터까지 크기에 넣으면 타이어와 바닥 사이가 벌어진다.
    const bounds = new THREE.Box3(), point = new THREE.Vector3();
    model.group.updateWorldMatrix(true, true);
    model.group.traverseVisible(o => {
      const pos = o.geometry?.attributes.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) bounds.expandByPoint(point.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    });
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const longest = Math.max(0.1, size.x, size.z);
    const fit = Math.min(2.88 / longest, 1.38 / Math.max(0.1, size.y));
    // 길이가 짧은 차는 덜 확대한다. 사람이 서 있는 장보기 카트는 머리와 바퀴가 읽힐 크기를 남긴다.
    const tall = THREE.MathUtils.smoothstep(size.y / longest, 0.85, 1.45);
    const relativeSize = THREE.MathUtils.clamp((longest / 4) ** 0.30, 0.77 + 0.15 * tall, 1);
    model.group.position.x -= center.x; model.group.position.z -= center.z; model.group.position.y -= bounds.min.y;
    const holder = new THREE.Group(), shine = soft ? null : reflection(THREE, model.group, size, reflectionStrength);
    holder.add(model.group); if (shine) holder.add(shine);
    const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: contactMap(THREE, model.group, size), transparent: true, depthWrite: false }));
    scene.add(holder, blob);
    blob.renderOrder = 2;
    return { model, holder, blob, shine, size, fit, relativeSize, k: 0, x: 0, vx: 0, z: 0, scale: 1, turn: REST_ANGLE, shown: false };
  });

  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100), calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let at = 0;
  function heroScale(it) {
    if (camera.aspect >= 1) return 1.31 * it.fit * it.relativeSize;
    // 세로 화면은 위아래가 넉넉하다(제목과 이름 칸 사이가 화면 높이의 반 넘게 빈다) — 키 큰 것(서 있는 운전자의 장보기 카트 · 독수리상)은 높이 제한을 풀어 더 크게 보인다.
    //   가로 화면의 높이 제한(1.38)을 그대로 쓰면 장보기 카트가 화면 높이의 5분의 1 로 작았다(2026-11-24 메인).
    const scale = 1.31 * Math.min(2.88 / Math.max(0.1, it.size.x, it.size.z), 2.3 / Math.max(0.1, it.size.y));
    // 세로에서는 옆을 온전히 보이는 각도에서도 이동 단추 사이에 들어가게 한다.
    const depth = camera.position.z - 0.5;
    // 2026-11-24 메인: 2차는 어느 각도로 돌려도 이동 단추 사이(양옆 59px)에 들어가게 잡아 휴대폰에서 차가 화면 폭의 반쯤으로 작았다(원래 화면은 85%).
    //   옆으로 다 돌렸을 때 차의 양 끝이 이동 단추 밑으로 조금 들어가도 되게 여백을 줄인다 — 서 있는 각도에서 화면 폭의 70% 남짓.
    const vw = view()[0], margin = vw <= 700 ? 18 : 40;
    const slope = Math.tan(camera.fov * Math.PI / 360) * camera.aspect *
      Math.max(0.2, 1 - 2 * margin / vw);
    const pitch = -camera.rotation.x, sin = Math.sin(pitch), cos = Math.cos(pitch);
    // 사방으로 돌릴 때 가장 가까운 모서리까지 포함한 폭. 회전 중에 차가 커졌다 작아지지 않는다.
    const radius = Math.hypot(it.size.x, it.size.z) / 2;
    const distance = depth * cos + (camera.position.y - 0.004) * sin;
    return Math.min(scale, slope * distance / (radius * Math.hypot(1, slope * cos) + slope * sin * it.size.y)) * it.relativeSize;
  }
  function resize() {
    const [w, h] = view(), tall = w < h, low = h <= 460;
    camera.aspect = w / h; camera.fov = tall ? 46 : low ? 27 : 30;
    camera.position.set(0, tall ? 2.3 : low ? 1.75 : 1.9, tall ? 9.6 : low ? 8.6 : 8.2);
    camera.lookAt(0, tall ? -0.2 : low ? 0.3 : 0.2, 0); camera.updateProjectionMatrix();
    if (items[at]?.shown) items[at].ts = heroScale(items[at]);
  }
  function aim(snap) {
    const n = items.length;
    items.forEach((it, i) => {
      let k = i - at; if (k > n / 2) k -= n; if (k < -n / 2) k += n;
      const seen = Math.abs(k) <= SEEN, jump = snap || !it.shown || Math.abs(k - it.k) > 2;
      it.k = k; it.shown = seen; if (jump) it.turn = REST_ANGLE;
      it.tx = k * GAP + Math.sign(k) * EDGE; it.tz = k === 0 ? 0.5 : -0.77;
      it.ts = k === 0 ? heroScale(it) : 0.66 * it.fit * it.relativeSize;
      if (jump) { it.x = it.tx; it.vx = 0; it.z = it.tz; it.scale = it.ts; }
      it.holder.visible = it.blob.visible = seen;
    });
  }
  function update(dt) {
    const still = !!calm?.matches, ease = still ? 1 : 1 - Math.exp(-dt / 0.125), decay = Math.exp(-16 * dt);
    let lit = null;
    for (const it of items) {
      if (!it.shown) continue;
      // 빠르게 여러 번 눌러도 옆으로 움직이던 속도를 이어받는다.
      const delta = it.x - it.tx, impulse = it.vx + 16 * delta;
      it.x = still ? it.tx : it.tx + (delta + impulse * dt) * decay;
      it.vx = still ? 0 : (it.vx - 16 * impulse * dt) * decay;
      it.z += (it.tz - it.z) * ease;
      it.scale += (it.ts - it.scale) * ease;
      const on = it.k === 0, travel = Math.min(1, Math.abs(it.tx - it.x) / GAP);
      if (on && !still) it.turn += dt * 0.34 * (1 - travel);
      else it.turn += Math.atan2(Math.sin(REST_ANGLE - it.turn), Math.cos(REST_ANGLE - it.turn)) * ease;
      it.holder.position.set(it.x, 0.004, it.z);
      it.holder.rotation.y = it.turn; it.holder.scale.setScalar(it.scale);
      it.blob.position.set(it.x, 0.002, it.z); it.blob.rotation.y = it.turn;
      it.blob.scale.set(it.scale * it.size.x * 1.30, 1, it.scale * it.size.z * 1.20);
      it.blob.material.opacity = 0.98 - 0.05 * travel;
      if (it.shine) {
        it.shine.visible = false;
        if (!lit || Math.abs(it.x) < Math.abs(lit.x)) lit = it;
      }
    }
    // 차가 조명 밖으로 밀려나면 그 차색부터 가라앉고 다음 차의 비침이 올라온다.
    if (lit) {
      const weight = 1 - THREE.MathUtils.smoothstep(Math.abs(lit.x), 0.12, GAP * 0.61);
      lit.shine.visible = weight > 0;
      lit.shine.material.uniforms.strength.value = reflectionStrength * weight;
    }
  }
  resize();
  return {
    scene, camera, resize, update,
    get index() { return at; },
    show(index) { at = ((index % items.length) + items.length) % items.length; resize(); aim(true); update(0); },
    select(index) { at = ((index % items.length) + items.length) % items.length; aim(false); },
    dispose() {
      for (const it of items) { it.model.dispose?.(); it.blob.material.map.dispose(); it.blob.material.dispose(); it.shine?.geometry.dispose(); it.shine?.material.dispose(); }
      for (const part of room.children) { part.dispose?.(); part.geometry.dispose(); part.material.map?.dispose(); part.material.dispose(); }
      floor.geometry.dispose(); floor.material.dispose(); blobGeo.dispose(); tiles.dispose(); env.dispose();
    }
  };
}

// 공유 카드 A 의 사진(src/hud/share.js): 쇼룸 무대에 내 차 하나만 세워(이웃 차 없이) 한 번 그린다 — 쇼룸을 한 번도 안 연 사람도 된다. 쇼룸 모델을 따로 짓고 다 그리면 버린다.
//   구도는 휴대폰 세로(390 × 844)의 쇼룸 — 시안(시안/공유카드_src/prep.py)이 그 화면 3배에서 차가 있는 가운데 띠를 잘라 쓴 것과 같은 자리를 setViewOffset 으로 잘라 그린다.
//   stage.shoot 가 화면 캔버스에 그려 베끼고 지금 장면을 다시 그린다. 돌려주는 것: width × height 의 2D 캔버스.
export function shootShowroom(THREE, stage, { car, makeModel, exposure = null, width = 1032, height = 1090 }) {
  const garage = createGarage(THREE, { cars: [car], makeModel, size: () => [390, 844] });
  try {
    garage.show(0);
    // 지금 쇼룸은 세로 화면에서 차를 화면 폭의 70% 남짓으로 세운다(돌려도 이동 단추 사이에 들어가게) — 카드에서는 차가 폭을 거의 다 쓰게(시안) ZOOM 배 당겨 자른다
    const W = 1170, H = 2532, ZOOM = 1.4, cropW = W / ZOOM, cropH = cropW * height / width, centre = 1160;
    garage.camera.setViewOffset(W, H, (W - cropW) / 2, centre - cropH / 2, cropW, cropH); garage.camera.updateProjectionMatrix();
    return stage.shoot(garage.scene, garage.camera, width, height, { exposure });
  } finally { garage.dispose(); }
}
