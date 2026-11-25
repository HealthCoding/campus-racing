// 방호벽 · 연석 · 코스 표지의 파랑을 연세 남색으로(낮 · 밤 모두). 사용자 2026-11-23 'B 남색 + 밝은 회색' — main.js 의 기본이 grey, ?barrier=navy 남색 + 흰색, ?barrier=blue 예전 파랑(이 함수를 안 부름).
// 트랙 · 부품 · 피트의 모양을 만드는 코드는 그대로 두고, 만들어진 메시의 정점 색 · 인스턴스 색에서 파랑만 골라 바꾼다.
//   navy = 남색 + 흰색(지금의 흰 블록 그대로) · grey = 남색 + 밝은 회색(방호벽의 흰 블록만 회색으로 — 연석의 흰 줄은 흰색 그대로)
// 남색 #003876 은 '연세 블루'로 흔히 쓰이는 값(공식 규정 문서는 확인 안 함). 로고 · 교표는 쓰지 않는다.
const BLUES = [0x3567b5, 0x2f63c0, 0x3f5b8f];   // track.js blue · kerb, part-models girderLow
const WHITE = 0xe9edf2, NAVY = 0x003876, GREY = 0xb9bec6;
export const SCHEMES = { navy: { navy: NAVY, white: null }, grey: { navy: NAVY, white: GREY } };

// 거푸집 자국은 블록 좌표에 굽는다. 멀어지면 밉맵에서 모래와 줄눈이 함께 가라앉는다.
export function finishBarrierConcrete(THREE, mesh) {
  const { geometry, material } = mesh;
  const pos = geometry.attributes.position, normal = geometry.attributes.normal;
  const uv = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const end = Math.abs(normal.getZ(i)) > 0.9, lid = normal.getY(i) > 0.9;
    uv.push(end ? 0.5 + x * 0.2 : z + 0.5, lid ? 0.87 + x * 0.26 : (y + 0.15) * 0.79);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const w = 256, h = 128, pixels = new Uint8Array(w * h * 4);
  let seed = 721;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, v = (y + 0.5) / h, edge = Math.min(u, 1 - u);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = seed / 4294967296;
    const skin = 0.93 + 0.018 * Math.sin(22 * u + 8 * v) * Math.sin(16 * v - 4 * u) + 0.067 * (grain - 0.5);
    const joint = 0.22 * (1 - THREE.MathUtils.smoothstep(edge, 0.003, 0.018));
    const toe = 0.13 * (1 - THREE.MathUtils.smoothstep(v, 0.17, 0.39));
    const radius = Math.hypot((edge - 0.17) * 2, (v - 0.53) / 0.79);
    const tie = 0.31 * (1 - THREE.MathUtils.smoothstep(radius, 0.016, 0.025));
    const level = Math.round(255 * Math.max(0, skin - joint - toe - tie));
    const k = (y * w + x) * 4;
    pixels[k] = pixels[k + 1] = pixels[k + 2] = level;
    pixels[k + 3] = 255;
  }
  const map = new THREE.DataTexture(pixels, w, h);
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  material.map = map;
  material.roughness = 0.91;
  material.needsUpdate = true;
  material.addEventListener('dispose', () => map.dispose());
}

export function applySchoolColours(THREE, root, scheme) {
  const s = SCHEMES[scheme]; if (!s || !root) return 0;
  const blues = BLUES.map(h => new THREE.Color(h)), white = new THREE.Color(WHITE), navy = new THREE.Color(s.navy), grey = s.white ? new THREE.Color(s.white) : null;
  const near = (r, g, b, c) => Math.abs(r - c.r) + Math.abs(g - c.g) + Math.abs(b - c.b) < 0.02;
  const isBlue = (r, g, b) => blues.some(c => near(r, g, b, c));
  let changed = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    // 방호벽 블록(인스턴스 색): 파랑 → 남색, (grey) 흰 → 회색
    if (o.isInstancedMesh && o.instanceColor && /barrier/.test(o.name)) {   // track-barriers · pit-barriers
      if (o.name === 'pit-barriers' && !o.material.map) finishBarrierConcrete(THREE, o);
      const a = o.instanceColor.array;
      for (let i = 0; i < a.length; i += 3) {
        if (isBlue(a[i], a[i + 1], a[i + 2])) { a[i] = navy.r; a[i + 1] = navy.g; a[i + 2] = navy.b; changed++; }
        else if (grey && near(a[i], a[i + 1], a[i + 2], white)) { a[i] = grey.r; a[i + 1] = grey.g; a[i + 2] = grey.b; changed++; }
      }
      o.instanceColor.needsUpdate = true;
      return;
    }
    const col = o.geometry?.getAttribute?.('color'); if (!col) return;
    const a = col.array, k = col.itemSize;
    for (let i = 0; i < a.length; i += k) if (isBlue(a[i], a[i + 1], a[i + 2])) { a[i] = navy.r; a[i + 1] = navy.g; a[i + 2] = navy.b; changed++; }
    col.needsUpdate = true;
  });
  return changed;
}
