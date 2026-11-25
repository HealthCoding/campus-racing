// Protected (non-destructible) buildings — hospitals (user decision 2026-10-18, mock A: shield instead of damage).
// A campus opts in through `pkg.protected`; without it this module is never used and the game is exactly as before.
//   protected.models:            placed glTF buildings (Yonsei: src/campuses/yonsei/hospitals.js, assets/hospitals/yonsei/)
//   protected.contextMaterials:  material names of the baked context whose walls mark protected buildings (CAU / KU science);
//                                invisible hit proxies (convex footprint x wall height) are derived from those walls at load.
// Sites never enter campus.entries, so campus.hit / scorch / the nuke finale can never damage them.
export function createProtectedBuildings(THREE, { pkg, terrain, sceneryRoot = null, assets = null, worldUnitsPerMeter = .5 }) {
  const spec = pkg?.protected; if (!spec) return null;
  const W = worldUnitsPerMeter, group = new THREE.Group(); group.name = 'protected-buildings';
  const sites = [], owned = [];
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }); owned.push(proxyMaterial);
  function addSite(site) {
    site.box = new THREE.Box3(new THREE.Vector3(Infinity, site.baseY, Infinity), new THREE.Vector3(-Infinity, site.topY, -Infinity));
    for (const p of site.ring) { site.box.min.x = Math.min(site.box.min.x, p.x); site.box.max.x = Math.max(site.box.max.x, p.x); site.box.min.z = Math.min(site.box.min.z, p.z); site.box.max.z = Math.max(site.box.max.z, p.z); }
    site.centerX = (site.box.min.x + site.box.max.x) / 2; site.centerZ = (site.box.min.z + site.box.max.z) / 2;
    site.radius = Math.hypot(site.box.max.x - site.box.min.x, site.box.max.z - site.box.min.z) / 2;
    // The footprint volume is used for proximity effects; picking must also
    // include visible model overhangs and roofs outside that volume.
    site.pickBox = site.box.clone();
    if (site.kind === 'model') for (const mesh of site.meshes) site.pickBox.union(new THREE.Box3().setFromObject(mesh));
    for (const mesh of site.meshes) mesh.userData.protectedSite = site;
    sites.push(site);
  }
  // 1. placed models (footprint local metres -> world: position + rotY(rotation) * local * scale)
  for (const rec of spec.models || []) {
    if (!assets?.has?.(rec.id)) continue;
    const s = (rec.scale ?? W), c = Math.cos(rec.rotation), n = Math.sin(rec.rotation);
    const ring = rec.footprintLocalMetres.map(([lx, lz]) => ({ x: rec.x + (lx * c + lz * n) * s, z: rec.z + (-lx * n + lz * c) * s }));
    // Model floor is Y 0; it sits on the lowest terrain under its outline (the high side of a slope covers the plinth).
    let baseY = terrain.heightAt(rec.x, rec.z);
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; baseY = Math.min(baseY, terrain.heightAt(a.x, a.z), terrain.heightAt((a.x + b.x) / 2, (a.z + b.z) / 2)); }
    if (!Number.isFinite(baseY)) baseY = 0;
    // optional fixed floor (world units, SKKU heritage: the pilot's base_y_m on its levelled courts); without it the rule above
    if (Number.isFinite(rec.baseY)) baseY = rec.baseY + .05;
    const scene = assets.createScene(rec.id); scene.name = `protected-${rec.id}`;
    scene.scale.setScalar(s); scene.rotation.y = rec.rotation; scene.position.set(rec.x, baseY - .05, rec.z);
    const meshes = [];
    scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; meshes.push(o); } });
    group.add(scene); scene.updateMatrixWorld(true);
    addSite({ id: rec.id, name: rec.name, kind: 'model', protectionKind: rec.kind, ring, baseY, topY: baseY + rec.heightMetres * s, meshes, replacesContextId: rec.replacesContextId });
  }
  // 2. proxies from baked context walls
  if (spec.contextMaterials?.length && sceneryRoot) {
    const names = new Set(spec.contextMaterials), points = [];
    sceneryRoot.updateMatrixWorld(true);
    sceneryRoot.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some(m => names.has(m?.name))) return;
      const pos = o.geometry.getAttribute('position'), idx = o.geometry.index, v = new THREE.Vector3();
      const groups = Array.isArray(o.material) ? o.geometry.groups.filter(g => names.has(o.material[g.materialIndex]?.name)) : [{ start: 0, count: idx ? idx.count : pos.count }];
      for (const g of groups) for (let k = g.start; k + 2 < g.start + g.count; k += 3) {
        const tri = [];
        for (let j = 0; j < 3; j++) { const i = idx ? idx.getX(k + j) : k + j; v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); tri.push([v.x, v.y, v.z]); }
        points.push(tri);
      }
    });
    for (const cluster of clusterTriangles(points)) {
      const hull = convexHull(cluster.xz);
      if (hull.length < 3 || polygonArea(hull) < 40 * W * W) continue;   // ignore slivers (< 40 m²)
      const ring = hull.map(([x, z]) => ({ x, z }));
      const geometry = prism(THREE, hull, cluster.minY, cluster.maxY); owned.push(geometry);
      const proxy = new THREE.Mesh(geometry, proxyMaterial); proxy.name = 'protected-proxy'; proxy.visible = false; group.add(proxy);
      addSite({ id: `context-${sites.length}`, name: '병원', kind: 'proxy', ring, baseY: cluster.minY, topY: cluster.maxY, meshes: [proxy] });
    }
  }
  group.updateMatrixWorld(true);
  const meshes = sites.flatMap(s => s.meshes);
  const near = { site: null, point: new THREE.Vector3(), normal: new THREE.Vector3(), distance: Infinity };
  // Closest point on a site's prism (footprint ring x [baseY, topY]) with an outward normal; reuses one result object.
  function nearestSurface(point, maxDistance = Infinity) {
    near.site = null; near.distance = Infinity;
    for (const site of sites) {
      if (site.box.distanceToPoint(point) > maxDistance) continue;
      const inside = insideRing(point.x, point.z, site.ring);
      let bx = 0, bz = 0, bd = Infinity, nx = 0, nz = 0;
      for (let i = 0; i < site.ring.length; i++) {
        const a = site.ring[i], b = site.ring[(i + 1) % site.ring.length], ex = b.x - a.x, ez = b.z - a.z, len2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((point.x - a.x) * ex + (point.z - a.z) * ez) / len2)), qx = a.x + ex * t, qz = a.z + ez * t, d = Math.hypot(point.x - qx, point.z - qz);
        if (d < bd) { bd = d; bx = qx; bz = qz; const l = Math.sqrt(len2); nx = ez / l; nz = -ex / l; }
      }
      // outward = away from the centre
      if ((bx - site.centerX) * nx + (bz - site.centerZ) * nz < 0) { nx = -nx; nz = -nz; }
      let px, py, pz, ny = 0, dist;
      if (inside && point.y >= site.topY) { px = point.x; pz = point.z; py = site.topY; nx = 0; nz = 0; ny = 1; dist = point.y - site.topY; }
      else if (inside) { px = bx; pz = bz; py = Math.min(site.topY, Math.max(site.baseY, point.y)); dist = 0; }
      else { px = bx; pz = bz; py = Math.min(site.topY, Math.max(site.baseY, point.y)); dist = Math.hypot(bd, point.y - py); }
      if (dist <= maxDistance && dist < near.distance) { near.site = site; near.distance = dist; near.point.set(px, py, pz); near.normal.set(nx, ny, nz); }
    }
    return near.site ? near : null;
  }
  // Yonsei's ground was planted before hospitals existed: hide instanced trees / furniture standing inside a hospital outline.
  function hideInstancesInside(root) {
    if (!root || !spec.models?.length) return 0;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0); let hidden = 0;
    const shrunk = sites.filter(s => s.kind === 'model').map(s => s.ring.map(q => ({ x: s.centerX + (q.x - s.centerX) * .97, z: s.centerZ + (q.z - s.centerZ) * .97 })));
    root.traverse(o => {
      if (!o.isInstancedMesh) return; let changed = false;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); p.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
        if (shrunk.some(r => insideRing(p.x, p.z, r))) { o.setMatrixAt(i, zero); changed = true; hidden++; }
      }
      if (changed) { o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere?.(); }
    });
    return hidden;
  }
  return {
    group, sites, meshes, nearestSurface, hideInstancesInside,
    siteOf: object => object?.userData?.protectedSite || null,
    get stats() { return { sites: sites.map(s => ({ id: s.id, kind: s.kind, baseY: +s.baseY.toFixed(2), topY: +s.topY.toFixed(2), center: [+s.centerX.toFixed(1), +s.centerZ.toFixed(1)], radius: +s.radius.toFixed(1) })) }; },
    dispose() { group.removeFromParent(); group.clear(); for (const o of owned) o.dispose(); },
  };
}

export function insideRing(x, z, ring) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) yes = !yes; }
  return yes;
}
// Triangles sharing a vertex position (1 cm) belong to one building's walls.
export function clusterTriangles(tris) {
  const parent = tris.map((_, i) => i), find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const key = new Map();
  tris.forEach((tri, i) => { for (const [x, y, z] of tri) { const k = `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`; if (key.has(k)) { const a = find(key.get(k)), b = find(i); if (a !== b) parent[a] = b; } else key.set(k, i); } });
  const out = new Map();
  tris.forEach((tri, i) => { const r = find(i); if (!out.has(r)) out.set(r, { xz: [], minY: Infinity, maxY: -Infinity }); const c = out.get(r); for (const [x, y, z] of tri) { c.xz.push([x, z]); c.minY = Math.min(c.minY, y); c.maxY = Math.max(c.maxY, y); } });
  // a courtyard's inner walls form their own cluster inside the outer one: fold it into the outer cluster
  const list = [...out.values()].map(c => ({ ...c, hull: convexHull(c.xz) }));
  return list.filter(c => !list.some(o => o !== c && o.hull.length > 2 && c.hull.every(([x, z]) => insideRing(x, z, o.hull.map(([a, b]) => ({ x: a, z: b }))))));
}
export function convexHull(points) {
  const P = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-9) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 1e-9) up.pop(); up.push(p); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
const polygonArea = r => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
// Closed prism (convex ring in XZ, y0..y1) facing outward; only ever ray-cast, never drawn.
function prism(THREE, ring, y0, y1) {
  const pos = [], n = ring.length;
  for (let i = 0; i < n; i++) { const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n]; pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az); }
  for (let i = 1; i < n - 1; i++) { const [ax, az] = ring[0], [bx, bz] = ring[i], [cx, cz] = ring[i + 1]; pos.push(ax, y1, az, cx, y1, cz, bx, y1, bz, ax, y0, az, bx, y0, bz, cx, y0, cz); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
