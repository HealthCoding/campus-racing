// Pre-computed ("baked") procedural ground for the campuses whose ground src/engine/ground.js builds at load time
// (Yonsei Sinchon, Korea humanities). scripts/lib/ground-bake.mjs runs that exact code in Node once and stores what it
// produced: every surface mesh's vertex positions, every instance matrix and the placement records (trees, furniture,
// routes, ...). createBakedCampusGround below rebuilds the same THREE objects from that data - same materials, same
// creation order, same names/flags/userData, normals and UVs recomputed by the same calls - so the scene is the one
// createCampusGround would make (검증/ground-bake-check.mjs: whole object graph sha256 equal). Terrain (heightAt, building
// bases, the nuke grid) is NOT baked: it is still built at runtime by src/engine/terrain.js, so gameplay values are untouched.
// Used only when a package declares ground.bake (src/campuses/{yonsei,korea}/ground-bake.js) and the page is not ?ground=live;
// if the bake is missing, unreadable or was made for other buildings/terrain (groundBakeMismatch), the engine builds live.
import { createGroundMaterials, GROUND_TEXTURES } from '../ground-materials.js?v=realism14';
import { createCampusFurniture } from '../campus-furniture.js?v=realism14';
import { createCampusFountains } from '../campus-fountains.js?v=realism14';

export const GROUND_BAKE_MAGIC = 'BTSGRND1';
export const GROUND_BAKE_VERSION = 1;
// Last decision of the engine, for diagnostics/checks: { campus, source: 'bake' | 'live', reason, ms }.
export const groundBakeStatus = {};

// ---- binary container: gzip( MAGIC(8) u32 headerBytes, header JSON, pad4, blobs (4-aligned) ) ------------------------
// Float32 blobs are stored byte-plane shuffled (all 1st bytes, all 2nd bytes, ...) which gzip compresses far better.
export function unshuffleFloat32(bytes, count) {
  const out = new Float32Array(count), o = new Uint8Array(out.buffer);
  for (let k = 0; k < 4; k++) { const plane = k * count; for (let i = 0; i < count; i++) o[4 * i + k] = bytes[plane + i]; }
  return out;
}
// JSON cannot carry undefined / -0 / NaN / ±Infinity; the encoder writes them as {"$":"u"|"-0"|"NaN"|"Inf"|"-Inf"}.
const SPECIAL = { u: undefined, '-0': -0, NaN: NaN, Inf: Infinity, '-Inf': -Infinity };
function revive(value) {
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) value[i] = revive(value[i]); return value; }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '$' && Object.hasOwn(SPECIAL, value.$)) return SPECIAL[value.$];
    for (const k of keys) value[k] = revive(value[k]);
  }
  return value;
}
// buffer: the decompressed container. Expands every mesh's positions (unique vertices + back-reference codes).
export function decodeGroundBake(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(0, 8)) !== GROUND_BAKE_MAGIC) throw new Error('Not a ground bake');
  const headerBytes = new DataView(bytes.buffer, bytes.byteOffset + 8, 4).getUint32(0, true);
  const header = revive(JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + headerBytes))));
  if (header.version !== GROUND_BAKE_VERSION) throw new Error(`Ground bake version ${header.version}`);
  const base = 12 + headerBytes + ((4 - (headerBytes % 4)) % 4);
  const blob = ([offset, length]) => { if (base + offset + length > bytes.length) throw new Error('Ground bake truncated'); return bytes.subarray(base + offset, base + offset + length); };
  const children = header.children.map(c => {
    if (c.type === 'instanced') return { ...c, matrices: unshuffleFloat32(blob(c.matrices), c.count * 16) };
    const u = c.unique, x = unshuffleFloat32(blob(c.x), u), y = unshuffleFloat32(blob(c.y), u), z = unshuffleFloat32(blob(c.z), u);
    const codes = blob(c.codes), positions = new Float32Array(c.vertices * 3);
    let p = 0, next = 0;
    for (let i = 0; i < c.vertices; i++) {
      let code = 0, shift = 0, b;
      do { b = codes[p++]; code += (b & 127) * 2 ** shift; shift += 7; } while (b & 128);
      const id = code === 0 ? next++ : next - code;
      if (!(id >= 0 && id < u)) throw new Error('Ground bake index out of range');
      positions[3 * i] = x[id]; positions[3 * i + 1] = y[id]; positions[3 * i + 2] = z[id];
    }
    if (p !== codes.length || next !== u) throw new Error('Ground bake index stream mismatch');
    return { type: 'mesh', name: c.name, material: c.material, offset: c.offset, pathKind: c.pathKind, positions };
  });
  return { campus: header.campus, fingerprint: header.fingerprint, data: header.data, children };
}

// ---- inputs the bake was made for ------------------------------------------------------------------------------------
// Entries (placed building footprints) and the runtime terrain must match what the bake was computed from. Exact in the
// same JS engine; a small tolerance keeps another engine's last-ulp Math differences (Safari) on the bake.
export function entryNumbers(e) {
  const b = e.worldBounds;
  return [e.x, e.z, e.w, e.d, e.rotation || 0, b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
}
export const GRID_SAMPLES = 2048;
export function terrainSamples(terrain) {
  const g = terrain.grid, stride = Math.max(1, Math.floor(g.heights.length / GRID_SAMPLES)), heights = [];
  for (let k = 0; k < g.heights.length; k += stride) heights.push(g.heights[k]);
  return { nx: g.nx, nz: g.nz, minX: g.minX, minZ: g.minZ, step: g.step, stride, heights, platforms: terrain.platforms.map(p => p.baseY) };
}
const close = (a, b, tol) => a === b || Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
export function groundBakeMismatch(bake, { campus, entries, terrain, environment }) {
  const f = bake.fingerprint;
  if (bake.campus !== campus) return `campus ${bake.campus} != ${campus}`;
  if (f.entries.length !== entries.length) return `building count ${entries.length} != ${f.entries.length}`;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i], r = f.entries[i];
    if (e.id !== r[0]) return `building order ${e.id} != ${r[0]}`;
    const v = entryNumbers(e);
    for (let k = 0; k < v.length; k++) if (!close(v[k], r[k + 1], 1e-6)) return `building ${e.id} footprint/bounds`;
  }
  const g = terrain.grid, s = f.terrain, now = terrainSamples(terrain);
  if (g.nx !== s.nx || g.nz !== s.nz || !close(g.minX, s.minX, 1e-9) || !close(g.minZ, s.minZ, 1e-9) || !close(g.step, s.step, 1e-9)) return 'terrain grid';
  if (now.heights.length !== s.heights.length || now.heights.some((h, k) => !(Math.abs(h - s.heights[k]) <= 1e-4))) return 'terrain heights';
  if (now.platforms.length !== s.platforms.length || now.platforms.some((h, k) => !(Math.abs(h - s.platforms[k]) <= 1e-4))) return 'terrain platforms';
  const extension = environment.extensionFor(entries), counts = [environment.paths.length, environment.areas.length, environment.spacePaths.length, extension.areas.length, extension.paths.length];
  if (counts.join() !== f.environment.join()) return 'mapped environment';
  return null;
}

// ---- loading (fetch + gunzip + decode) and the ground textures in a worker, both while the models download -----------
function startGroundTextures() {
  if (typeof Worker !== 'function') return Promise.resolve(null);
  return new Promise(resolve => {
    let worker, timer = 0;
    const done = value => { clearTimeout(timer); try { worker?.terminate(); } catch {} resolve(value); };
    try { worker = new Worker(new URL('../workers/ground-texture-worker.js', import.meta.url), { type: 'module' }); } catch { resolve(null); return; }
    timer = setTimeout(() => done(null), 30000);
    worker.onmessage = event => {
      const pixels = event.data?.pixels;
      done(pixels && GROUND_TEXTURES.every(t => pixels[t.name] instanceof Uint8Array && pixels[t.name].length === 512 * 512 * 4) ? pixels : null);
    };
    worker.onerror = () => done(null); worker.onmessageerror = () => done(null);
    worker.postMessage({ textures: true });
  });
}
export async function readGroundBake(response) {
  if (!response.ok) throw new Error(`Ground bake HTTP ${response.status}`);
  if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream unavailable');
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  return decodeGroundBake(await new Response(stream).arrayBuffer());
}
// spec: { url, bytes, sha256 } from the package. Resolves { bake, pixels } (pixels may be null: then the main thread
// makes the textures exactly as createGroundMaterials always did); rejects when the bake itself is unusable.
// after (optional promise): the download starts only then - the engine passes "all campus models are in", so the bake
// never takes bandwidth from the models and arrives while the buildings are being assembled. The textures start at once.
export function loadGroundBake(spec, { fetchImpl = globalThis.fetch, after = null } = {}) {
  const now = () => Math.round(globalThis.performance?.now() ?? 0), timing = { startedAt: now() };
  const pixels = startGroundTextures().then(p => { timing.texturesAt = now(); return p; });
  const bake = Promise.resolve(after).then(() => { timing.fetchAt = now(); return fetchImpl(spec.url); }).then(readGroundBake).then(b => { timing.bakeAt = now(); return b; });
  return Promise.all([bake, pixels]).then(([bake, pixels]) => ({ bake, pixels, timing }));
}

// ---- the ground from the bake (mirrors createCampusGround in src/engine/ground.js line for line) ----------------------
const INSTANCED_PARTS = {
  'flat-building-platforms': ['plane', 'matPlatform'], 'natural-tree-trunks': ['trunk', 'wood'], 'natural-tree-crowns': ['crown', 'foliageA'],
  'varied-tree-crown-lobes': ['sphere', 'foliageB'], 'rounded-low-planting-beds': ['sphere', 'foliageB'], 'road-curb-stones': ['cube', 'paving'],
  'estimated-low-retaining-walls': ['cube', 'paving'], 'mapped-stair-treads': ['cube', 'paving'],
};
const SURFACE_OFFSETS = { park: .003, wood: .006, grass: .009, construction: .011, pitch: .014, parking: .016, bleachers: .018, plaza: .021, water: .024 };
const PALETTE = { wood: '#627354', park: '#859365', grass: '#97a175', parking: '#96978e', plaza: '#c6c0b2', water: '#729b9c', construction: '#a79b88', bleachers: '#b0ada2', pitch: '#81986d' };

export function createBakedCampusGround(THREE, { entries = [], profile, environment, worldUnitsPerMeter, terrain, reducedMotion = false, bake, pixels = null }) {
  if (!profile || !environment || !bake) throw new Error('Baked campus ground requires a package profile, environment and bake');
  const group = new THREE.Group(); group.name = 'continuous-campus-ground';
  const finishes = createGroundMaterials(THREE, { pixels });
  group.userData.source = environment.sourceNote;
  const geometries = new Set(), materials = new Set(); let disposed = false, seed = profile.seed;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const geom = g => { geometries.add(g); return g; }, mat = (color, options = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .95, ...options }); materials.add(m); return m; };
  const obstacles = entries.map(e => {
    const b = e.worldBounds;
    if (Number.isFinite(e.w) && Number.isFinite(e.d) && e.w > 0 && e.d > 0) return { id: e.id, x: e.x, z: e.z, w: e.w, d: e.d, rotation: e.rotation || 0 };
    if (b && !b.isEmpty()) return { id: e.id, x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2, w: b.max.x - b.min.x, d: b.max.z - b.min.z, rotation: 0 };
    throw new Error(`Ground requires placed model bounds: ${e.id}`);
  });
  const extension = environment.extensionFor(entries);
  const areas = [...environment.areas, ...extension.areas];
  const height = (x, z) => terrain.heightAt(x, z);
  const d = bake.data, { routes, approaches, mappedRoutes } = d;
  const playBounds = new THREE.Box3(); for (const e of entries) playBounds.union(e.worldBounds);
  for (const p of routes) for (const v of p.points) playBounds.expandByPoint(new THREE.Vector3(v.x, 0, v.z));
  if (playBounds.isEmpty()) playBounds.set(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 0, 20));
  const bounds = playBounds.clone().expandByScalar(18);
  // Terrain grid mesh: computed here exactly as ground.js does (cheap; the lawn tint uses the same seeded stream).
  const grid = terrain.grid, positions = [], indices = [], colors = [], grassColor = new THREE.Color(), lawn = new THREE.Color().set('#79866d');
  for (let iz = 0; iz < grid.nz; iz++) for (let ix = 0; ix < grid.nx; ix++) {
    const index = iz * grid.nx + ix; positions.push(grid.minX + ix * grid.step, grid.heights[index] - .014, grid.minZ + iz * grid.step);
    grassColor.copy(lawn).multiplyScalar(.93 + rnd() * .12); colors.push(grassColor.r, grassColor.g, grassColor.b);
    if (ix < grid.nx - 1 && iz < grid.nz - 1) indices.push(index, index + grid.nx, index + 1, index + 1, index + grid.nx, index + grid.nx + 1);
  }
  const groundGeometry = geom(new THREE.BufferGeometry()); groundGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); groundGeometry.setIndex(indices); groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeometry, mat('#ffffff', { vertexColors: true })); ground.receiveShadow = true; ground.name = 'continuous-estimated-terrain'; group.add(ground);
  const plane = geom(new THREE.PlaneGeometry(1, 1)); plane.rotateX(-Math.PI / 2);
  const cube = geom(new THREE.BoxGeometry(1, 1, 1)), trunk = geom(new THREE.CylinderGeometry(.065, .10, 1, 7));
  const crown = geom(new THREE.IcosahedronGeometry(1, 1)), sphere = geom(new THREE.IcosahedronGeometry(1, 0));
  const foliageA = mat('#4b6650'), foliageB = mat('#63774f'), wood = mat('#65584b'), paving = mat('#c0b9aa', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -16 });
  const matPlatform = mat('#858e76'), asphalt = mat('#888982', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -14 });
  const parts = { plane, cube, trunk, crown, sphere, foliageA, foliageB, wood, paving, matPlatform, asphalt };
  let dummy = null;
  for (const c of bake.children) {
    if (c.type === 'instanced') {
      const part = INSTANCED_PARTS[c.key]; if (!part) throw new Error(`Unknown baked instance batch ${c.key}`);
      dummy ??= new THREE.Object3D();
      const mesh = new THREE.InstancedMesh(parts[part[0]], parts[part[1]], c.count); mesh.name = c.key; mesh.castShadow = !c.key.includes('paving'); mesh.receiveShadow = true;
      mesh.instanceMatrix.array.set(c.matrices); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); group.add(mesh);
      continue;
    }
    const g = geom(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(c.positions, 3)); g.computeVertexNormals();
    let mesh;
    if (c.material.startsWith('landcover:')) {
      const kind = c.material.slice(10);
      const m = mat(PALETTE[kind] ?? '#92957b', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 - Object.keys(SURFACE_OFFSETS).indexOf(kind) });
      mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.name = c.name; mesh.userData.surfaceOffset = SURFACE_OFFSETS[kind] ?? .01;
    } else {
      const material = c.material === 'asphalt' ? asphalt : c.material === 'paving' ? paving : null; if (!material) throw new Error(`Unknown baked material ${c.material}`);
      mesh = new THREE.Mesh(g, material); mesh.name = c.name; mesh.userData.surfaceOffset = c.offset; mesh.receiveShadow = true;
    }
    group.add(mesh);
    if (c.pathKind !== undefined) mesh.userData.pathKind = c.pathKind;
  }
  dummy ??= new THREE.Object3D();
  // Give broad lawns variation at metre scale; flowerbeds/woods keep their own colours.
  for (const object of group.children) {
    if (!object.isMesh || object.isInstancedMesh) continue;
    if (object.name === 'trimmed-lawn-soil-edges') finishes.apply(object, 'soil');
    else if (object.name === 'bench-deck-pads') finishes.apply(object, 'deck');
    else if (object.name === 'mapped-landcover-grass' || object.name === 'mapped-landcover-park') finishes.apply(object, 'grass');
    else if (object.name === 'mapped-landcover-plaza') finishes.apply(object, 'paving');
    else if (object.userData.pathKind) finishes.apply(object, ['road', 'service'].includes(object.userData.pathKind) ? 'asphalt' : 'paving');
    else if (object.material === paving) finishes.apply(object, 'paving');
  }
  const furniture = createCampusFurniture(THREE, { placements: d.furniturePoints, heightAt: height });
  const fountains = createCampusFountains(THREE, { areas: areas.filter(a => a.kind === 'water'), terrain, reducedMotion, identifiedIds: profile.fountainAreaIds });
  group.add(furniture.group, fountains.group);
  let drawCalls = 0; group.traverse(o => { if (o.isMesh) drawCalls++; });
  const stats = { groundFinishes: finishes.stats, furniturePads: d.furniturePads, furniture: furniture.stats, fountains: fountains.stats, environment: environment.provenance, mappedPaths: mappedRoutes.length, mappedAreas: areas.length,
    clippedMappedSegments: d.clippedMappedSegments, landcoverTriangles: d.landcoverTriangles, shrubs: d.shrubPoints.length, shrubPoints: d.shrubPoints, stairTreads: d.stairTreads, retainingEdges: d.retainingEdges, edgePoints: d.edgePoints,
    terrain: terrain.stats, scale: worldUnitsPerMeter, source: 'Mapped pedestrian axes; model-bounds avoidance and all landscape details estimated', trees: d.treePoints.length, treeThinning: d.treeThinning, treePoints: d.treePoints,
    furniturePoints: d.furniturePoints, plazaTiles: d.plazaTiles, routes, approaches, mappedRoutes, obstacles, failedRoutes: d.failedRoutes, drawCalls, groundContinuous: true };
  return { group, bounds, playBounds, terrain, stats, update(time) { if (!disposed) fountains.update(time); }, dispose() { if (disposed) return; disposed = true; furniture.dispose(); fountains.dispose(); finishes.dispose(); for (const o of group.children) if (o.isInstancedMesh) o.dispose(); for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); group.removeFromParent(); group.clear(); } };
}
