// Split convex surface polygons at the terrain's actual grid edges AND diagonal.
// Sampling only a road's four corners bridges across piecewise-linear terrain.
// This helper preserves the polygon footprint while giving every emitted face
// exactly one underlying terrain triangle. Caller excludes building platforms.
const EPS = 1e-9;
function clip(poly, ax, az, limit) {
  if (!poly.length) return poly;
  const result = []; let previous = poly[poly.length - 1];
  let pv = ax * previous.x + az * previous.z - limit;
  for (const current of poly) {
    const cv = ax * current.x + az * current.z - limit;
    const pi = pv <= EPS, ci = cv <= EPS;
    if (pi !== ci) {
      const t = Math.max(0, Math.min(1, pv / (pv - cv)));
      result.push({ x: previous.x + t * (current.x - previous.x), z: previous.z + t * (current.z - previous.z) });
    }
    if (ci) result.push(current);
    previous = current; pv = cv;
  }
  return result;
}
function signedArea(poly) {
  // Origin-relative formula avoids cancellation at large projected coordinates.
  if (poly.length < 3) return 0;
  const a = poly[0]; let sum = 0;
  for (let i = 1; i + 1 < poly.length; i++) sum += (poly[i].x - a.x) * (poly[i + 1].z - a.z) - (poly[i].z - a.z) * (poly[i + 1].x - a.x);
  return sum * .5;
}

/** Append non-indexed, upward-facing XYZ triples to an ordinary number array.
 * polygon: convex [{x,z},...] (triangle or quad), never mutated.
 * Returns emitted triangle count. Domain outside the finite terrain grid is
 * clipped, so huge/off-grid input cannot cause an unbounded cell walk.
 */
export function appendTerrainSurface(terrain, polygon, positions, { offset = 0 } = {}) {
  const grid = terrain?.grid;
  if (!grid || !Number.isFinite(grid.step) || grid.step <= 0 || !Number.isInteger(grid.nx) || !Number.isInteger(grid.nz) || grid.nx < 2 || grid.nz < 2 || typeof terrain.heightAt !== 'function') throw new TypeError('A finite triangle-grid terrain is required');
  if (!Number.isFinite(grid.minX) || !Number.isFinite(grid.minZ) || !Number.isFinite(offset)) throw new TypeError('Finite grid origin and offset required');
  if (!Array.isArray(positions) || !Array.isArray(polygon) || polygon.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.z))) throw new TypeError('Expected finite XZ polygon and appendable positions array');
  if (polygon.length < 3 || Math.abs(signedArea(polygon)) < 1e-12) return 0;
  const { minX, minZ, nx, nz, step } = grid;
  const maxX = minX + (nx - 1) * step, maxZ = minZ + (nz - 1) * step;
  let bounded = clip(clip(clip(clip(polygon, -1, 0, -minX), 1, 0, maxX), 0, -1, -minZ), 0, 1, maxZ);
  if (bounded.length < 3 || Math.abs(signedArea(bounded)) < 1e-12) return 0;
  const xs = bounded.map(p => p.x), zs = bounded.map(p => p.z);
  const ix0 = Math.max(0, Math.floor((Math.min(...xs) - minX) / step));
  const iz0 = Math.max(0, Math.floor((Math.min(...zs) - minZ) / step));
  const ix1 = Math.min(nx - 2, Math.floor((Math.max(...xs) - minX - EPS) / step));
  const iz1 = Math.min(nz - 2, Math.floor((Math.max(...zs) - minZ - EPS) / step));
  let triangles = 0;
  function emit(poly) {
    for (let i = 1; i + 1 < poly.length; i++) {
      const a = poly[0], b = poly[i], c = poly[i + 1];
      const signed = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
      if (Math.abs(signed) < 1e-12) continue;
      // Positive XZ winding has negative Y normal in a Y-up coordinate system.
      for (const p of signed > 0 ? [a, c, b] : [a, b, c]) {
        const y = terrain.heightAt(p.x, p.z) + offset;
        if (!Number.isFinite(y)) throw new TypeError('Terrain produced non-finite height');
        positions.push(p.x, y, p.z);
      }
      triangles++;
    }
  }
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const x = minX + ix * step, z = minZ + iz * step;
    const cell = clip(clip(clip(clip(bounded, -1, 0, -x), 1, 0, x + step), 0, -1, -z), 0, 1, z + step);
    if (cell.length < 3) continue;
    // campus-terrain uses u+v <= 1 (a,b,c), otherwise (d,c,b).
    const diagonal = x + z + step;
    emit(clip(cell, 1, 1, diagonal));
    emit(clip(cell, -1, -1, -diagonal));
  }
  return triangles;
}

/** Convenience wrapper for stand-alone BufferGeometry construction. */
export function createTerrainSurface(terrain, polygon, options) {
  const positions = [];
  appendTerrainSurface(terrain, polygon, positions, options);
  return new Float32Array(positions);
}
