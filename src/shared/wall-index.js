// 벽 선분을 격자 칸에 나눠 담아, 한 지점 둘레의 선분만 빠르게 꺼낸다. 단위는 미터(x 동쪽, z 남쪽).
// segments: [{ ax, az, bx, bz, ... }] — 선분에 딸린 다른 값(kind 등)은 그대로 둔다.
export function createWallIndex(segments = [], cell = 8) {
  const cells = new Map();
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  segments.forEach((segment, id) => {
    const x0 = Math.floor(Math.min(segment.ax, segment.bx) / cell), x1 = Math.floor(Math.max(segment.ax, segment.bx) / cell);
    const z0 = Math.floor(Math.min(segment.az, segment.bz) / cell), z1 = Math.floor(Math.max(segment.az, segment.bz) / cell);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const k = key(cx, cz); let list = cells.get(k); if (!list) cells.set(k, list = []); list.push(id);
    }
  });
  const stamp = new Uint32Array(segments.length); let round = 0;
  return {
    segments,
    // (x, z) 를 중심으로 반지름 radius 인 원에 걸칠 수 있는 선분을 out 에 담는다. 같은 선분은 한 번만.
    near(x, z, radius, out = []) {
      out.length = 0; if (!segments.length) return out;
      if (++round === 0xffffffff) { stamp.fill(0); round = 1; }
      const x0 = Math.floor((x - radius) / cell), x1 = Math.floor((x + radius) / cell), z0 = Math.floor((z - radius) / cell), z1 = Math.floor((z + radius) / cell);
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        const list = cells.get(key(cx, cz)); if (!list) continue;
        for (let i = 0; i < list.length; i++) { const id = list[i]; if (stamp[id] !== round) { stamp[id] = round; out.push(segments[id]); } }
      }
      return out;
    },
  };
}
