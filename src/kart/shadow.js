// 카트 밑 그림자 — 차체 길이와 폭을 따르는 접지 그림자 하나. 해 그림자는 30 m 움직일 때마다만 다시 굽기 때문에(stage.js) 달리는 카트를 따라오지 못하고,
// 구울 때의 카트 자리에 자국만 남는다. 그래서 카트는 해 그림자에서 빼고 이 얼룩을 쓴다. 뜨면 얼룩이 땅에 남아 커지고 옅어져서 높이가 읽힌다.
//   const shadow = createKartShadow(THREE);  scene.add(shadow.mesh);
//   매 화면: shadow.update(x, z, heading, y, heightAt)      y = 카트 높이, heightAt(x, z, y) = 그 높이의 카트 밑에 있는 바닥(길이 겹치면 제 층)
export const SHADOW = {
  length: 2.5, width: 1.7,   // 땅에 붙어 있을 때의 크기(m) — 카트는 1.8 × 1.1
  opacity: 0.69,             // 가장 진한 곳
  grow: 0.35,                // 1 m 뜰 때 한쪽 가장자리가 퍼지는 거리(m)
  fade: 0.40,                 // 높이에 따른 농도 감쇠 계수(최소 비율 faint)
  faint: 0.2,
  lift: 0.03,                // 바닥에서 띄우는 높이(겹쳐 깜빡이지 않게)
  probe: 0.7,                // 바닥 기울기를 읽는 거리(m)
};

// 차가 갈아입혀질 때 한 번, 차축 좌표계에서 차체 경계를 잰다.
// Geometry의 경계 상자만 사용하므로 바퀴를 돌리거나 꼭짓점을 다시 훑지 않는다.
function footprint(THREE, kart) {
  const body = kart.getObjectByName('body'), frame = kart.getObjectByName('chassis');
  if (!body || !frame) return null;
  kart.updateWorldMatrix(true, true);
  const inverse = frame.matrixWorld.clone().invert(), matrix = new THREE.Matrix4();
  const box = new THREE.Box3(), piece = new THREE.Box3();
  body.traverse(part => {
    const geo = part.geometry;
    if (!geo) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    matrix.multiplyMatrices(inverse, part.matrixWorld);
    box.union(piece.copy(geo.boundingBox).applyMatrix4(matrix));
  });
  if (box.isEmpty()) return null;
  const scale = kart.scale;
  const width = (box.max.x - box.min.x) * scale.x, length = (box.max.z - box.min.z) * scale.z;
  if (!(width > 0.01 && length > 0.01)) return null;
  const axle = name => {
    const node = kart.getObjectByName(name);
    if (!node) return null;
    const v = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).applyMatrix4(inverse);
    return [Math.abs(v.x) * scale.x, v.z * scale.z];
  };
  return {
    front: axle('wheelFL'), rear: axle('wheelRL'),
    width: width * 1.28, length: length * 1.16,
    openness: THREE.MathUtils.smoothstep((box.max.y - box.min.y) * scale.y / length, 0.26, 0.82),
    center: (box.max.z + box.min.z) * 0.5 * scale.z,
  };
}

export function createKartShadow(THREE, { tuning = SHADOW } = {}) {
  const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);   // 눕힌 네모(로컬 x = 가로, z = 앞뒤)
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    uniforms: {
      uOpacity: { value: tuning.opacity }, uAir: { value: 0 }, uOpen: { value: 0 },
      uWheels: { value: new THREE.Vector4(.59, .46, .59, -.46) },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uOpacity, uAir, uOpen;
      uniform vec4 uWheels;
      varying vec2 vUv;
      float tread(vec2 p, vec2 wheel) {
        vec2 d = (p - wheel) / vec2(0.26, 0.18);
        float t = max(0.0, 1.0 - dot(d, d));
        return t * t;
      }
      void main() {
        vec2 p = vec2(abs(vUv.x * 2.0 - 1.0), 1.0 - vUv.y * 2.0);
        vec2 corner = max(vec2(0.0), abs(p) - vec2(0.36, 0.46)) / vec2(0.64, 0.54);
        float body = max(0.0, 1.0 - dot(corner, corner));
        body *= body;
        float contact = max(tread(p, uWheels.xy), tread(p, uWheels.zw));
        float oval = max(0.0, 1.0 - dot(p, p));
        float under = (0.32 - 0.18 * uOpen) * body + 0.38 * oval * oval;
        float a = mix(under + (1.0 - under) * 0.8 * contact, oval * (0.3 + 0.7 * oval), uAir);
        gl_FragColor = vec4(0.0, 0.0, 0.0, a * uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'kart-shadow'; mesh.renderOrder = 1; mesh.frustumCulled = false;
  const normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion(), turn = new THREE.Quaternion();
  let owner = null, shape = null;
  return {
    mesh,
    update(x, z, heading, y, heightAt) {
      // 주행·관전 양쪽에서 차를 먼저 놓고 같은 자세로 그림자를 갱신한다.
      // 차를 갈아입으면 옛 그룹이 장면에서 빠진다. 그때 한 번 새 차와 연결한다.
      if (mesh.parent && (!owner || owner.parent !== mesh.parent)) {
        owner = mesh.parent.children.find(o => o.name === 'kart' && o.visible &&
          o.position.x === x && o.position.z === z && Math.abs(o.position.y - y) < 0.001);
        shape = owner ? footprint(THREE, owner) : null;
        material.uniforms.uOpen.value = shape?.openness ?? 0;
        const w = shape?.front && shape?.rear ? shape : null;
        if (w) {
          const sx = 2 / w.width, sz = 2 / w.length;
          material.uniforms.uWheels.value.set(w.front[0] * sx, (w.front[1] - w.center) * sz,
            w.rear[0] * sx, (w.rear[1] - w.center) * sz);
        } else material.uniforms.uWheels.value.set(.59, .46, .59, -.46);
      }
      const d = tuning.probe, ground = heightAt(x, z, y), above = Math.max(0, y - ground);
      // 바닥의 기울기(비탈 · 점프대 · 다리의 오르막)에 눕힌다
      normal.set((heightAt(x - d, z, y) - heightAt(x + d, z, y)) / (2 * d), 1, (heightAt(x, z - d, y) - heightAt(x, z + d, y)) / (2 * d));
      if (Math.abs(normal.x) > 1.5 || Math.abs(normal.z) > 1.5) normal.set(0, 1, 0);   // 턱에 걸쳤을 때는 평평하게
      normal.normalize();
      tilt.setFromUnitVectors(up, normal); turn.setFromAxisAngle(up, heading); mesh.quaternion.copy(tilt).multiply(turn);
      mesh.position.set(x + normal.x * tuning.lift, ground + tuning.lift, z + normal.z * tuning.lift);
      mesh.translateZ(shape?.center ?? 0);
      const spread = Math.min(4, above) * tuning.grow * 2;
      mesh.scale.set((shape?.width ?? tuning.width) + spread, 1, (shape?.length ?? tuning.length) + spread);
      material.uniforms.uAir.value = THREE.MathUtils.smoothstep(above, 0, 0.72);
      material.uniforms.uOpacity.value = tuning.opacity * Math.max(tuning.faint, 1 / (1 + above * tuning.fade) ** 1.65);
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
