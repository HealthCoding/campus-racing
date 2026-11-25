// 개발 · 시험용 임시 지형 — 실제 게임은 src/world 의 heightAt 을 쓴다.
// Beat the School 추정 지형 식(도구/build-courses.mjs 의 height)을 4 m 격자 꼭짓점에서 재고, 칸 안은 삼각형 면으로 잇는다
// (실제 지형처럼 '4 m 격자 삼각형 면'). flat: true 면 평지.
const HILL = { from: { x: -89, z: -109 }, to: { x: -53, z: -167 }, crest: 13, outer: 66, rise: 5.5 };
export function estimatedHeight(x, z) {
  const wx = x * .5, wz = z * .5, base = Math.min(4.5, Math.max(0, (-wz - 35) * .025));
  const dx = HILL.to.x - HILL.from.x, dz = HILL.to.z - HILL.from.z, t = Math.max(0, Math.min(1, ((wx - HILL.from.x) * dx + (wz - HILL.from.z) * dz) / (dx * dx + dz * dz)));
  const dist = Math.hypot(wx - HILL.from.x - dx * t, wz - HILL.from.z - dz * t), u = Math.max(0, Math.min(1, (HILL.outer - dist) / (HILL.outer - HILL.crest)));
  return (base + HILL.rise * u * u * (3 - 2 * u)) / .5;
}
// bounds: { minX, maxX, minZ, maxZ } (m). → { heightAt(x, z), grid: { x0, z0, step, nx, nz, heights } }
export function createDevTerrain({ minX, maxX, minZ, maxZ }, { flat = false, step = 4 } = {}) {
  const x0 = Math.floor(minX / step) * step, z0 = Math.floor(minZ / step) * step;
  const nx = Math.ceil((maxX - x0) / step) + 1, nz = Math.ceil((maxZ - z0) / step) + 1, H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = flat ? 0 : estimatedHeight(x0 + i * step, z0 + j * step);
  // 칸 (i,j)-(i+1,j+1) 을 그 대각선으로 나눈 두 삼각형
  function heightAt(x, z) {
    let fx = (x - x0) / step, fz = (z - z0) / step;
    fx = Math.max(0, Math.min(nx - 1.0001, fx)); fz = Math.max(0, Math.min(nz - 1.0001, fz));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = (a, b) => H[b * nx + a];
    return u >= v ? h(i, j) + (h(i + 1, j) - h(i, j)) * u + (h(i + 1, j + 1) - h(i + 1, j)) * v
                  : h(i, j) + (h(i + 1, j + 1) - h(i, j + 1)) * u + (h(i, j + 1) - h(i, j)) * v;
  }
  return { heightAt, grid: { x0, z0, step, nx, nz, heights: H } };
}
