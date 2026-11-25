// 갈림길의 다른 갈래 — 1단계(2026-11-25 코스 E): 막아 둔 길의 모양만 그린다(노면 · 방호벽 · 두 입구의 막음 판). 주행 · 랩 시계 · 자동 운전은 이 길을 모른다.
//   const branch = createBranch(THREE, data, { groundAt });  scene.add(branch.group);  branch.contains(x, z, m) → 나무 · 관목을 치울 자리
//   data = src/track/course-<id>.branch.js(도구/build-branch.mjs). 두 입구는 본선의 방호벽이 막고 있고, 막음 판(빨강 · 흰)이 '닫힌 길'임을 보인다.
// 꾸밈이라 계산 경로가 아니다. 그래도 + − × ÷ · Math.sqrt 만 쓴다(방향은 벡터로 — 각도 함수 없이).
import { LIFT } from './track.js';
import { finishBarrierConcrete } from '../world/school-colours.js';

const ASPHALT = 0x50545a, WHITE = 0xe9edf2, NAVY = 0x3567b5, RED = 0xd8382e;
const SINK = 0.025;   // 입구에서 본선 노면과 겹치는 곳이 깜빡이지 않게 본선보다 조금 낮게 깐다

export function createBranch(THREE, data, { groundAt = () => 0 } = {}) {
  const group = new THREE.Group(); group.name = 'branch';
  const C = data.centre, L = data.left, R = data.right, n = C.length;
  const std = opts => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts });
  // ---- 노면(가로 4칸)
  {
    const COLS = 4, pos = [], idx = [];
    for (let i = 0; i < n; i++) for (let k = 0; k <= COLS; k++) {
      const t = k / COLS, x = L[i][0] + (R[i][0] - L[i][0]) * t, z = L[i][1] + (R[i][1] - L[i][1]) * t;
      pos.push(x, groundAt(x, z) + LIFT.road - SINK, z);
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < COLS; k++) { const a = i * (COLS + 1) + k, b = a + COLS + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const road = new THREE.Mesh(g, std({ color: ASPHALT, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    road.name = 'branch-road'; road.receiveShadow = true; group.add(road);
  }
  // ---- 방호벽(본선과 같은 높이의 낮은 블록) + 막음 판: 상자 하나를 늘려 쓴다(InstancedMesh 하나)
  const walls = [];
  const put = (a, b, out, kind) => walls.push({ a, b, out, kind });
  for (const [ring, flags, out] of [[L, data.wallL, -1], [R, data.wallR, 1]]) for (let i = 0; i < n - 1; i++) if (flags[i] && flags[i + 1]) put(ring[i], ring[i + 1], out, 'wall');
  // 막음 판: 양쪽 입구에서 길을 가로질러(왼쪽 경계 → 오른쪽 경계) 한 줄, 1.2 m 마다 빨강 · 흰
  for (const i of data.shut) {
    const a = L[i], b = R[i], dx = b[0] - a[0], dz = b[1] - a[1], w = Math.sqrt(dx * dx + dz * dz), parts = Math.max(2, Math.round(w / 1.2));
    for (let k = 0; k < parts; k++) put([a[0] + dx * k / parts, a[1] + dz * k / parts], [a[0] + dx * (k + 1) / parts, a[1] + dz * (k + 1) / parts], 0, k % 2 ? 'white' : 'red');
  }
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(box, std({ color: 0xffffff, roughness: 0.6 }), walls.length);
  const m = new THREE.Matrix4(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(), colour = new THREE.Color();
  walls.forEach((w, k) => {
    const ex = w.b[0] - w.a[0], ez = w.b[1] - w.a[1], l = Math.sqrt(ex * ex + ez * ez) || 0.01, fx = ex / l, fz = ez / l;
    const ox = w.out * -fz * 0.31, oz = w.out * fx * 0.31, mx = (w.a[0] + w.b[0]) / 2 + ox, mz = (w.a[1] + w.b[1]) / 2 + oz;
    const wall = w.kind === 'wall', height = wall ? 0.78 : 1.0, thick = wall ? 0.5 : 0.4, y = Math.min(groundAt(w.a[0], w.a[1]), groundAt(w.b[0], w.b[1])) + (wall ? 0 : LIFT.road);
    fwd.set(fx, 0, fz); right.set(fz, 0, -fx);
    m.makeBasis(right.multiplyScalar(thick), up.clone().multiplyScalar(height), fwd.multiplyScalar(Math.max(0.01, l - 0.02)));
    m.setPosition(mx, y, mz); mesh.setMatrixAt(k, m);
    mesh.setColorAt(k, colour.set(wall ? (k % 3 === 0 ? NAVY : WHITE) : w.kind === 'red' ? RED : WHITE));
  });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  finishBarrierConcrete?.(THREE, mesh);
  mesh.name = 'branch-barriers'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);

  // 갈래 통로(+ margin) 안인지: 사각형 칸마다 두 삼각형의 안쪽을 본다(나무 · 관목 치우기용 — 매 화면 부르지 않는다)
  const box2 = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of [...L, ...R]) { box2.minX = Math.min(box2.minX, p[0]); box2.maxX = Math.max(box2.maxX, p[0]); box2.minZ = Math.min(box2.minZ, p[1]); box2.maxZ = Math.max(box2.maxZ, p[1]); }
  function contains(x, z, margin = 0) {
    if (x < box2.minX - margin - 1 || x > box2.maxX + margin + 1 || z < box2.minZ - margin - 1 || z > box2.maxZ + margin + 1) return false;
    for (let i = 0; i < n; i++) {
      const cx = C[i][0], cz = C[i][1], j = Math.min(n - 1, i + 1), fx0 = C[j][0] - C[Math.max(0, j - 1)][0], fz0 = C[j][1] - C[Math.max(0, j - 1)][1], l = Math.sqrt(fx0 * fx0 + fz0 * fz0) || 1, fx = fx0 / l, fz = fz0 / l;
      const ox = x - cx, oz = z - cz, along = ox * fx + oz * fz, lat = -ox * fz + oz * fx;
      if (along < -1.05 || along > 1.05) continue;
      if (lat >= -(C[i][2] + margin) && lat <= C[i][3] + margin) return true;
    }
    return false;
  }
  return { group, contains, stats: { points: n, walls: walls.length } };
}
