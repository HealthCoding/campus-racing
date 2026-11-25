// 코스 B 가로등. 줄기는 통로 밖, 데크에서는 외벽에 짧은 받침을 걸친다. 좌표·높이는 장면과 같은 미터.
import { mergeGeometries } from '../../bts/vendor/model-assets/BufferGeometryUtils.js';
import { LIFT } from '../track/track.js';
import { NIGHT } from './night-tune.js';

const PITCH = 20, HEIGHT = 7.3, ARM = 3.1;
const PIXEL = 0.5, RADIUS = 21;
// 빛 웅덩이의 가로 폭(m)은 길 폭을 따른다(2026-11-24 길 폭 14 m): 반폭 6 m(12 m 길)에서 7.6 m. 등머리에서 중심선까지가 그보다 멀면 같은 비율로 넓혀
//   길 가운데의 밝기가 12 m 때와 같게 남는다(더 좁은 길에서는 7.6 m 그대로). 웅덩이 가운데는 등머리 — 경계에서 땅 1.75 m · 상판 2.2 m 안쪽.
const POOL_ACROSS = 7.6, POOL_HALF = 6;

function insideBox(p, box, margin) {
  const dx = p.x - box.x, dz = p.z - box.z;
  return Math.abs(box.cos * dx - box.sin * dz) <= box.w / 2 + margin &&
    Math.abs(box.sin * dx + box.cos * dz) <= box.d / 2 + margin;
}

// lampOver: 공중 구간(상판) 위에서는 무시해도 되는 건물 상자 id(코스 D 의 노천극장 — 상판이 계단석 맨 윗줄 위를 지난다. courses.js 의 lampOver, 2026-11-25).
// lampIgnore: 언제나 무시하는 건물 상자 id(모델의 상자가 실제 윤곽보다 넓어 길가까지 덮는 것 — 코스 D 의 음악관. 등은 윤곽에서 6 m 넘게 떨어져 선다).
export function placeNightLamps({ course, parts, campus, pit, lampOver = [], lampIgnore = [] }) {
  const count = Math.round(parts.length / PITCH), spacing = parts.length / count;
  const boxes = campus.obstacles.map(o => ({ ...o, cos: Math.cos(o.rotation), sin: Math.sin(o.rotation) }));
  const trees = campus.trees.filter(o => !o.hidden), furniture = campus.furniture.filter(o => !o.hidden);
  const lamps = [], skipped = [];
  // 코너의 화살표 판은 바깥 경계 +1.15m, 3칸마다 있다(track.js). 양끝의 좁은 구간도 실제 좌표로 피한다.
  const signs = [];
  for (const c of course.corners) {
    if (c.angle < 60) continue;
    const ring = c.dir === 'left' ? course.right : course.left;
    const span = (c.to - c.from + ring.length) % ring.length;
    for (let k = 0; k <= span; k += 3) {
      const i = (c.from + k) % ring.length, [x, z] = ring[i], centre = course.centre[i];
      const dx = x - centre[0], dz = z - centre[1], l = Math.hypot(dx, dz);
      signs.push({ x: x + dx * 1.15 / l, z: z + dz * 1.15 / l });
    }
  }
  function candidate(s, side) {
    const sideName = side < 0 ? 'left' : 'right';
    if (parts.openAt(s, sideName)) return null;
    const frame = parts.pointAt(s), half = frame[sideName], lift = parts.deckLift(s);
    const u = pit?.uOf(s);
    const edge = side > 0 && u != null ? Math.max(half, pit.wallAt(u)) : half;
    const footLat = side * (edge + (lift > 0 ? 0.90 : 1.35)), foot = parts.pointAt(s, footLat);
    const bank = parts.bankLift ? parts.bankLift(s, footLat) : 0;   // 기운 코너: 그 가장자리의 판 높이
    const inward = parts.pointAt(s, side * (edge - ARM));
    const dx = inward.x - foot.x, dz = inward.z - foot.z, len = Math.hypot(dx, dz);
    const ax = dx / len, az = dz / len;
    const head = { x: foot.x + ARM * ax, z: foot.z + ARM * az };
    const mid = { x: (foot.x + head.x) / 2, z: (foot.z + head.z) / 2 };
    if (pit?.contains(foot.x, foot.z, 0.7) || pit?.beyond(foot.x, foot.z, 0.7)) return null;
    // 다른 구간의 방호벽·데크 바깥면과 등 사이에도 여유를 둔다. 특히 교차점의 아래층에서는 팔이 위 판을 뚫을 수 있다.
    if ([foot, mid, head].some(p => parts.othersAt(p.x, p.z, s, 1.0).length)) return null;
    if (boxes.some(b => !lampIgnore.includes(b.id) && !(lift > 0 && lampOver.includes(b.id)) && [foot, mid, head].some(p => insideBox(p, b, 0.8)))) return null;
    if (signs.some(p => Math.hypot(foot.x - p.x, foot.z - p.z) < 0.95)) return null;
    if (furniture.some(p => Math.hypot(foot.x - p.x, foot.z - p.z) < (p.kind === 'light' ? 2.8 : 1.25))) return null;
    if (trees.some(t => Math.hypot(foot.x - t.x, foot.z - t.z) < t.crown + 0.3)) return null;
    // 점프대에서 뜬 차와 팔 사이에 여유를 둔다. 발판과 점프대 자체는 같은 칸의 통로 안쪽에 있다.
    if (parts.ramps.some(r => s >= r.at - 1 && s <= r.at + r.length + 12)) return null;
    const inset = (lift > 0 ? 0.90 : 1.35) - ARM, spread = Math.max(1, (half + inset) / (POOL_HALF + inset));   // inset < 0: 등머리는 경계 안쪽
    return { s, side, x: foot.x, z: foot.z, y: campus.heightAt(foot.x, foot.z) + lift + bank,
      headX: head.x, headZ: head.z, ax, az, heading: frame.heading, lift, spread };
  }
  // 같은 단면의 두 등은 길 너비를 비추고, 다음 단면까지는 어둠을 남긴다.
  // 장애물이 있으면 가까운 곳부터 두 자리를 함께 찾아 보고, 한쪽만 트였으면 한 등만 세운다.
  // 이웃 단면끼리 이동량 차이를 1.8 m 안에 두어, 피해 세운 등도 한곳에 몰리지 않게 한다(단면 간격 18 ~ 22 m).
  // 마지막 단면은 첫 단면(이동량 0)으로 이어진다.
  // 5.4 · 7.2 는 2026-11-25 다듬은 B 2단계: 한 바퀴가 길어져 단면이 회오리 다리의 건너는 곳(722 m) 바로 뒤(725.7 m)에 떨어졌다 — 그 둘레 10 m 는 팔이 아래 길 위라 못 세우고,
  //   ±3.6 m 로는 못 벗어나 그 단면이 빠져 건너는 곳의 위층이 어두웠다(시험 night-lamps). 앞 단면부터 1.8 m 씩 옮겨 732 m 쯤에 세운다(가까운 이동량부터 보니 다른 곳은 그대로다).
  const SHIFTS = [0, 1.8, -1.8, 3.6, -3.6, 5.4, -5.4, 7.2, -7.2];
  const options = Array.from({ length: count }, (_, i) => SHIFTS.filter(d => Math.abs(d) <= 1.8 * Math.min(i, count - i))
    .map(shift => ({ shift, pair: [-1, 1].map(side => candidate(i * spacing + 10.5 + shift, side)).filter(Boolean) })));   // 10.5 = 출발선 앞 첫 가로등 단면(m)
  // 1) 앞에서부터 하나씩: 가까운 이동량부터 보고 두 등이 서는 첫 자리(없으면 등이 가장 많이 서는 자리).
  const greedy = []; let prevShift = 0;
  for (let i = 0; i < count; i++) {
    let best = null;
    for (const o of options[i]) { if (Math.abs(o.shift - prevShift) > 1.8 + 1e-9) continue; if (!best || o.pair.length > best.pair.length) best = o; if (best.pair.length === 2) break; }
    greedy.push(best); prevShift = best.shift;
  }
  // 2) 그렇게 고르면 통째로 빠지는 단면이 있을 때만 전 구간을 다시 고른다(2026-11-24 길 폭 14 m): 앞 단면이 이동량 0 에 머문 탓에 뒤 단면이 3.6 m 를 못 옮겨
  //    빠지는 곳이 생겼다 — 넓어진 하늘길의 등이 회오리 다리의 건너는 곳(691 m)에서 아래 길 위에 놓여 그 단면이 빠지고 건너는 곳의 위층이 어두웠다.
  //    빈 단면이 가장 적고, 그다음 1) 과 다르게 고른 단면이 가장 적고, 그다음 세운 등이 가장 많은 것(빈 단면이 없으면 1) 그대로다).
  let chosen = greedy;
  if (greedy.some(o => !o.pair.length)) {
    const score = (o, i) => ({ empty: o.pair.length ? 0 : 1, moved: o === greedy[i] ? 0 : 1, lamps: o.pair.length });
    const add = (a, b) => ({ empty: a.empty + b.empty, moved: a.moved + b.moved, lamps: a.lamps + b.lamps });
    const better = (a, b) => !b || a.empty < b.empty || (a.empty === b.empty && (a.moved < b.moved || (a.moved === b.moved && a.lamps > b.lamps)));
    const tail = [];   // tail[i][k] = i 번 단면에서 k 번 고름일 때 i 부터 끝까지의 값과 다음 고름
    for (let i = count - 1; i >= 0; i--) tail[i] = options[i].map(o => {
      let next = null, at = -1;
      if (i < count - 1) options[i + 1].forEach((q, k) => { if (Math.abs(q.shift - o.shift) <= 1.8 + 1e-9 && better(tail[i + 1][k].v, next)) { next = tail[i + 1][k].v; at = k; } });
      return { v: next ? add(score(o, i), next) : score(o, i), at };
    });
    let k = 0; tail[0].forEach((t, j) => { if (better(t.v, tail[0][k].v)) k = j; });
    chosen = []; for (let i = 0; i < count; i++) { chosen.push(options[i][k]); k = tail[i][k].at; }
  }
  chosen.forEach((o, i) => { if (o.pair.length) lamps.push(...o.pair); else skipped.push(i * spacing + 10.5); });
  return { lamps, skipped, spacing };
}

// 한 장에 두 층. R/B는 조도, G/A는 조도 × 정규화한 받는 면의 높이. 선형 필터로 경계의 빈 픽셀과 섞여도 나눠 복원할 수 있다.
// poolAlong: 빛 웅덩이가 길을 따라 퍼지는 폭(m). 가로등 간격은 20 m — 4.2 면 등과 등 사이가 어둡게 남고, 넓힐수록 이어진다(값은 night-tune.js).
function bakeMap(THREE, course, parts, campus, lamps, poolAlong = NIGHT.road.poolAlong) {
  const edges = [...course.left, ...course.right];
  const xs = edges.map(p => p[0]), zs = edges.map(p => p[1]);
  const margin = RADIUS + 9; // 피트 바깥쪽까지 포함. 가장 바깥 픽셀은 0이라 clamp-to-edge여도 화면 밖에서 빛이 늘어나지 않는다.
  const minX = Math.floor(Math.min(...xs) - margin), minZ = Math.floor(Math.min(...zs) - margin);
  const widthMeters = Math.ceil(Math.max(...xs) + margin) - minX, depthMeters = Math.ceil(Math.max(...zs) + margin) - minZ;
  const width = widthMeters / PIXEL, height = depthMeters / PIXEL;
  const pixels = new Uint8Array(width * height * 4);
  const deckOffset = new Uint8Array(width * height); // 받은 빛이 가장 센 상판의 지형 대비 높이(dm). GPU에는 보내지 않는다.
  const minY = Math.floor(Math.min(0, ...lamps.map(p => p.y)) - 8);
  const heightRange = Math.ceil(Math.max(0, ...lamps.map(p => p.y)) + 8) - minY;
  for (const lamp of lamps) {
    const channel = lamp.lift > 0 ? 2 : 0;
    const cx = (lamp.headX - minX) / PIXEL - 0.5, cz = (lamp.headZ - minZ) / PIXEL - 0.5;
    const reach = RADIUS / PIXEL;
    const fx = Math.sin(lamp.heading), fz = Math.cos(lamp.heading);
    for (let j = Math.max(0, Math.ceil(cz - reach)); j <= Math.min(height - 1, Math.floor(cz + reach)); j++) {
      const dz = (j - cz) * PIXEL;
      for (let i = Math.max(0, Math.ceil(cx - reach)); i <= Math.min(width - 1, Math.floor(cx + reach)); i++) {
        const dx = (i - cx) * PIXEL, d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        const along = (dx * fx + dz * fz) / poolAlong, across = (dx * fz - dz * fx) / (POOL_ACROSS * (lamp.spread ?? 1));
        const weight = Math.round(255 * Math.exp(-along * along - across * across));
        const k = j * width + i, off = k * 4 + channel;
        // 가장 가까운 밝은 등으로 그 층의 조도·높이를 한 쌍으로 보관한다.
        // 양쪽 등을 더해 중앙이 255에 붙으면 아스팔트 광택에 쓰는 기울기까지 사라진다.
        if (weight <= pixels[off]) continue;
        if (channel === 2) deckOffset[k] = Math.round(10 * parts.deckLift(lamp.s + dx * fx + dz * fz));
        pixels[off] = weight;
      }
    }
  }
  // 같은 위치의 두 층이 같은 실제 캠퍼스 지형을 쓴다. 동적 카트도 한 번의 텍스처 읽기로 둘을 받는다.
  const encode = floor => Math.max(0, Math.min(1, (floor - minY) / heightRange));
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const k = j * width + i, off = k * 4;
    if (!(pixels[off] || pixels[off + 2])) continue;
    const y = campus.heightAt(minX + (i + 0.5) * PIXEL, minZ + (j + 0.5) * PIXEL) + LIFT.road;
    pixels[off + 1] = Math.round(encode(y) * pixels[off]);
    pixels[off + 3] = Math.round(encode(y + deckOffset[k] * 0.1) * pixels[off + 2]);
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.name = 'night-lamp-irradiance';
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, minX, minZ, widthMeters, depthMeters, minY, heightRange };
}

function makeFixtures(THREE, lamps) {
  const group = new THREE.Group();
  group.name = 'course-night-lamps';
  // 기둥과 등머리 등 불투명 부품은 로컬 +Z(노면 쪽)를 향하게 한 벌로 합쳐서 전 구간을 한 번에 그린다.
  const mast = new THREE.CylinderGeometry(0.075, 0.125, HEIGHT, 8).translate(0, HEIGHT / 2, 0);
  const arm = new THREE.CylinderGeometry(0.055, 0.07, ARM, 8).rotateX(Math.PI / 2 - 0.08)
    .translate(0, HEIGHT - 0.12, ARM / 2);
  const housing = new THREE.BoxGeometry(0.52, 0.17, 1.05).translate(0, HEIGHT, ARM);
  const bracket = new THREE.BoxGeometry(0.42, 0.28, 0.62).translate(0, -0.09, 0.17);
  const pieces = [mast, arm, housing, bracket], assembly = mergeGeometries(pieces);
  for (const g of pieces) g.dispose();
  const metal = new THREE.MeshStandardMaterial({ color: 0x56606b, roughness: 0.65, metalness: 0.35 });
  const lens = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
    .scale(0.24, 0.115, 0.48).translate(0, HEIGHT - 0.082, ARM);
  const emission = new THREE.MeshBasicMaterial({ color: new THREE.Color(12, 6.6, 2.8), fog: false });
  // 먼 렌즈가 한 픽셀보다 얇아져 표본에서 빠지지 않도록, 등머리 아랫면만 화면 크기로 살짝 펼친다.
  const viewport = new THREE.Vector4();
  const viewportHeight = { value: 1 }, lensCentre = new THREE.Vector3(0, HEIGHT - 0.082, ARM);
  emission.onBeforeCompile = shader => {
    shader.uniforms.uLampViewportHeight = viewportHeight;
    shader.uniforms.uLampCentre = { value: lensCentre };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uLampViewportHeight;\nuniform vec3 uLampCentre;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 centre = modelViewMatrix * instanceMatrix * vec4(uLampCentre, 1.);
        float pixelMetres = max(0., -2. * centre.z / (uLampViewportHeight * projectionMatrix[1][1]));
        vec3 stretch = max(vec3(1.), pixelMetres * vec3(.85 / .24, 1.15 / .115, .85 / .48));
        transformed = uLampCentre + (transformed - uLampCentre) * stretch;
      `);
  };
  emission.customProgramCacheKey = () => 'night-street-lens';
  const poleMesh = new THREE.InstancedMesh(assembly, metal, lamps.length);
  const lensMesh = new THREE.InstancedMesh(lens, emission, lamps.length);
  lensMesh.onBeforeRender = renderer => { viewportHeight.value = renderer.getCurrentViewport(viewport).w; };
  poleMesh.name = 'night-lamp-structures'; lensMesh.name = 'night-lamp-lenses';
  const matrix = new THREE.Matrix4();
  lamps.forEach((lamp, i) => {
    matrix.makeRotationY(Math.atan2(lamp.ax, lamp.az)).setPosition(lamp.x, lamp.y, lamp.z);
    poleMesh.setMatrixAt(i, matrix); lensMesh.setMatrixAt(i, matrix);
  });
  for (const mesh of [poleMesh, lensMesh]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

export function createNightLamps(THREE, { course, parts, campus, pit, lampOver, lampIgnore }, { poolAlong = NIGHT.road.poolAlong } = {}) {
  const placement = placeNightLamps({ course, parts, campus, pit, lampOver, lampIgnore });
  const group = makeFixtures(THREE, placement.lamps);
  const map = bakeMap(THREE, course, parts, campus, placement.lamps, poolAlong);
  return { ...placement, group, map, dispose() {
    group.removeFromParent();
    for (const mesh of group.children) { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
    map.texture.dispose();
  } };
}
