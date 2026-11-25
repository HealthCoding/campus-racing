// 연세대 신촌 캠퍼스를 '부서지지 않는 정적 장면'으로 세운다 (약속: docs/구조와_계약.md 3.2).
//
// bts/ 의 모듈을 고치지 않고 그대로 쓴다. 조립 순서는 Beat the School src/engine/campus-engine.js 의
// campusAssemblySteps(배치 → 지형 → 건물 높이 → 바닥)와 src/main.js(병원)를 따르되, 파괴 조각 준비만 뺐다.
// 바닥 bake 의 지문(groundBakeMismatch)은 건물 위치 · 치수 · 월드 상자를 보므로, 배치 계산은 원본과 같은 식으로 한다.
//
// 단위: BTS 묶음은 1 m = 0.5 월드 단위. 그 묶음을 scale 2 인 부모(group) 아래에 넣어 장면 전체를 미터로 쓴다.
// 0.5 를 곱하거나 나누는 곳은 이 파일과 stage.js 에만 있다. 밖으로 내보내는 값은 전부 미터.
//
// import 표기(?v=…)는 원본 코드와 같게 맞춘다 — 표기가 다르면 같은 파일이 두 벌 실행된다.
import { YONSEI } from '../../bts/src/campuses/yonsei/index.js';
import { streamPackageModels, loadCampusModels } from '../../bts/src/model-assets.js?v=sn120';
import { createCampusMaterials } from '../../bts/src/campus-materials.js?v=realism14';
import { createCampusGround } from '../../bts/src/engine/ground.js';
import { createCampusTerrain } from '../../bts/src/engine/terrain.js';
import { loadGroundBake, groundBakeMismatch, createBakedCampusGround } from '../../bts/src/engine/ground-bake.js';
import { createProtectedBuildings, insideRing } from '../../bts/src/protected-buildings.js?v=jbnu63';
import { mergeGeometries } from '../../bts/vendor/model-assets/BufferGeometryUtils.js';

const PKG = YONSEI;
const W = PKG.geo.worldUnitsPerMeter;          // 0.5 월드 단위 / m
const M = 1 / W;                               // 2 m / 월드 단위
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));
// ?ground=live 면 원본처럼 bake 를 건너뛰고 바닥을 그 자리에서 만든다(비교용).
const groundModeFromPage = () => { try { return new URLSearchParams(globalThis.location?.search || '').get('ground'); } catch { return null; } };
// 잔디 · 나무 모습(nature-look.js): 기본 c — 2026-11-24 사용자가 시안에서 'C 바람 · 밤빛'을 골랐다. ?nature=a|b 는 견줌용, ?nature=0 은 예전 모습(그때는 그 파일을 불러오지도 않는다).
const natureFromPage = () => { try { const q = new URLSearchParams(globalThis.location?.search || ''); if (!q.has('nature')) return 'c'; const v = q.get('nature'); return ['a', 'b', 'c'].includes(v) ? v : null; } catch { return null; } };

export async function loadCampus(THREE, { onProgress = () => {}, reducedMotion = false, groundMode = groundModeFromPage(), natureLook = natureFromPage() } = {}) {
  const t0 = performance.now();
  const placements = PKG.placements;
  const procedural = new Set(PKG.models.proceduralIds);
  const modelTotal = PKG.models.manifests.reduce((n, m) => n + (m.expectedIds ? m.expectedIds.length : m.count), 0);
  const total = modelTotal + placements.length + 3;   // 모델 받기 39 + 건물 세우기 42 + 지형 · 바닥 · 병원
  let modelsLoaded = 0, placed = 0, extra = 0;
  const progress = label => { try { onProgress({ loaded: modelsLoaded + placed + extra, total, label }); } catch {} };

  // 1. 받기 시작: 일반 39동(스트림), 병원 5동(따로), 바닥 bake(모델이 다 온 뒤 받기 시작, 바닥 무늬는 워커에서 바로).
  const stream = streamPackageModels(THREE, { manifests: PKG.models.manifests, onProgress: ({ loaded }) => { modelsLoaded = loaded; progress('모델 받기'); } });
  const hospitalAssetsPromise = PKG.protected?.manifestURL && PKG.protected.models?.length
    ? loadCampusModels(THREE, { manifestURL: PKG.protected.manifestURL, expectedIds: PKG.protected.models.map(m => m.id) })
      .catch(error => { console.warn('병원 모델을 불러오지 못했어요.', error); return null; })
    : Promise.resolve(null);
  let modelsIn = () => {}; const modelsArrived = new Promise(resolve => { modelsIn = resolve; });
  const groundBake = PKG.ground.bake && groundMode !== 'live'
    ? loadGroundBake(PKG.ground.bake, { after: modelsArrived }).catch(error => { console.warn('바닥 bake 를 못 받아 그 자리에서 만들어요.', error); return { error }; })
    : null;

  const bts = new THREE.Group(); bts.name = 'bts-campus-world-units';        // BTS 월드 단위(항등 변환으로 조립)
  const finishes = createCampusMaterials(THREE);
  const sources = [], entries = [], ownedGeometries = new Set();
  let scenery = null, terrain = null, protectedSet = null, assets = null, hospitalAssets = null;
  const fail = error => {
    modelsIn();
    for (const s of sources) try { s.dispose(); } catch {}
    try { scenery?.dispose(); } catch {} try { protectedSet?.dispose(); } catch {}
    finishes.dispose(); for (const g of ownedGeometries) g.dispose();
    stream.done.then(m => m.dispose(), () => {}); hospitalAssetsPromise.then(m => m?.dispose?.(), () => {});
    throw error;
  };

  try {
    // 2. 배치 — 원본 campusAssemblySteps 와 같은 식(정적 소스 위에서). 모델이 오는 대로 placements 순서대로 세운다.
    for (const placement of placements) {
      const { id, name, code, x, z, rotation = 0 } = placement;
      if (!procedural.has(id)) await stream.whenModel(id);
      const source = procedural.has(id)
        ? PKG.models.createProceduralSource(THREE, id)
        : (() => { const scene = stream.createScene(id), facade = PKG.models.enhanceFacade(THREE, id, scene); return { scene, stats: facade.stats, dispose: () => facade.dispose() }; })();
      sources.push(source);
      const root = new THREE.Group(); root.name = `building-${id}`; root.add(source.scene);
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(root, true);            // 배치 전, 정점 기준 로컬 상자
      const meshes = [];
      root.traverse(o => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) finishes.apply(m);
        o.castShadow = true; o.receiveShadow = true; meshes.push(o);
      });
      const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      root.scale.setScalar(W); root.rotation.y = rotation;
      const anchor = placement.modelAnchor || center;
      const offset = new THREE.Vector3(anchor.x, bounds.min.y, anchor.z).multiplyScalar(W).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
      root.position.set(x - offset.x, -offset.y, z - offset.z);
      bts.add(root); root.updateMatrixWorld(true);
      const worldBounds = bounds.clone().applyMatrix4(root.matrixWorld);
      const placedCenter = center.clone().applyMatrix4(root.matrixWorld);
      entries.push({ id, name, code, x: placement.modelAnchor ? placedCenter.x : x, z: placement.modelAnchor ? placedCenter.z : z, rotation, w: size.x * W, d: size.z * W,
        source: placement.source, sourceSize: size.clone(), modelScale: W,
        ...(placement.modelBaseOffset_m ? { modelBaseOffset: placement.modelBaseOffset_m * W } : {}), root, bounds, meshes, worldBounds, cleared: false });
      placed++; progress('건물 세우기');
      await nextTask();
    }
    assets = await stream.done; modelsIn();

    // 3. 지형과 건물 높이.
    terrain = createCampusTerrain(entries, PKG.terrain.heightGrids ? { ...PKG.terrain, worldUnitsPerMeter: W } : PKG.terrain);
    for (const entry of entries) {
      entry.baseY = terrain.buildingHeight(entry);
      entry.root.position.y += entry.baseY + (entry.modelBaseOffset || 0);
      entry.root.updateMatrixWorld(true);
      entry.worldBounds.copy(entry.bounds).applyMatrix4(entry.root.matrixWorld);
    }
    extra++; progress('지형'); await nextTask();

    // 4. 바닥: 구운 바닥이 이 건물 · 지형에 맞으면 그것, 아니면 그 자리에서 만든다.
    let groundSource = 'live', groundReason = groundBake ? null : 'ground=live';
    const baked = groundBake ? await groundBake : null;
    if (baked) {
      try {
        groundReason = baked.error ? `load: ${baked.error.message || baked.error}` : groundBakeMismatch(baked.bake, { campus: PKG.id, entries, terrain, environment: PKG.environment });
        if (!groundReason) {
          scenery = createBakedCampusGround(THREE, { entries, terrain, reducedMotion, profile: PKG.ground, environment: PKG.environment, worldUnitsPerMeter: W, bake: baked.bake, pixels: baked.pixels });
          groundSource = 'bake';
        } else console.warn(`바닥 bake 를 쓰지 않아요(${groundReason}). 그 자리에서 만들어요.`);
      } catch (error) { groundReason = `build: ${error.message || error}`; console.warn('바닥 bake 복원 실패, 그 자리에서 만들어요.', error); scenery = null; }
    }
    scenery ??= createCampusGround(THREE, { entries, terrain, reducedMotion, profile: PKG.ground, environment: PKG.environment, terrainProfile: PKG.terrain, worldUnitsPerMeter: W });
    bts.add(scenery.group); bts.updateMatrixWorld(true);
    extra++; progress('바닥'); await nextTask();

    // 5. 병원 5동(원본 main.js 순서: 바닥 뒤에 세우고, 병원 윤곽 안의 나무 · 가구를 숨긴다). 실패해도 캠퍼스는 뜬다.
    hospitalAssets = await hospitalAssetsPromise;
    let hiddenByHospitals = 0;
    try {
      protectedSet = createProtectedBuildings(THREE, { pkg: PKG, terrain, sceneryRoot: bts, assets: hospitalAssets, worldUnitsPerMeter: W });
      if (protectedSet) { bts.add(protectedSet.group); hiddenByHospitals = protectedSet.hideInstancesInside(bts); }
    } catch (error) { console.warn('병원을 세우지 못했어요.', error); try { protectedSet?.dispose(); } catch {} protectedSet = null; }
    extra++; progress('병원');

    // 6. 그리기 호출 줄이기: 건물마다 재질별로 합친다(건물 단위 경계는 남아 화면 밖 건물은 빠진다).
    const merge = { before: 0, after: 0, kept: 0, mirrored: 0 };
    const buildingRoots = [...entries.map(e => e.root), ...(protectedSet ? protectedSet.group.children.filter(c => c.name.startsWith('protected-')) : [])];
    for (const root of new Set(buildingRoots)) { mergeBuilding(THREE, root, merge, ownedGeometries); await nextTask(); }

    // 7. 미터 부모 아래로. (지문 · 병원 계산이 끝난 뒤에 — 그 계산들은 BTS 묶음이 항등 변환일 때의 matrixWorld 를 쓴다.)
    const group = new THREE.Group(); group.name = 'campus-metres'; group.scale.setScalar(M); group.add(bts);
    group.updateMatrixWorld(true);
    // 정적인 것은 매 프레임 행렬을 다시 계산하지 않게. (group 자체는 메인이 옮길 수 있게 그대로 둔다.)
    bts.traverse(o => { o.matrixAutoUpdate = false; });

    // 8. 게임 쪽 자료(미터).
    const hospitalRings = (protectedSet?.sites || []).filter(s => s.kind === 'model')
      .map(s => s.ring.map(q => ({ x: s.centerX + (q.x - s.centerX) * .97, z: s.centerZ + (q.z - s.centerZ) * .97 })));
    const inHospital = (x, z) => hospitalRings.some(r => insideRing(x, z, r));       // 월드 단위
    const st = scenery.stats;
    const obstacles = entries.map(e => ({ id: e.id, name: e.name, x: e.x * M, z: e.z * M, w: e.w * M, d: e.d * M, rotation: e.rotation || 0, kind: 'building' }));
    for (const rec of PKG.protected?.models || []) {
      if (!protectedSet?.sites.some(s => s.id === rec.id)) continue;
      const s = rec.scale ?? W, c = Math.cos(rec.rotation), n = Math.sin(rec.rotation);
      const lx = rec.footprintLocalMetres.map(p => p[0]), lz = rec.footprintLocalMetres.map(p => p[1]);
      const cx = (Math.min(...lx) + Math.max(...lx)) / 2, cz = (Math.min(...lz) + Math.max(...lz)) / 2;
      obstacles.push({ id: rec.id, name: rec.name, kind: 'hospital',
        x: (rec.x + (cx * c + cz * n) * s) * M, z: (rec.z + (-cx * n + cz * c) * s) * M,
        w: (Math.max(...lx) - Math.min(...lx)) * s * M, d: (Math.max(...lz) - Math.min(...lz)) * s * M, rotation: rec.rotation,
        ring: rec.footprintLocalMetres.map(([px, pz]) => [(rec.x + (px * c + pz * n) * s) * M, (rec.z + (-px * n + pz * c) * s) * M]) });
    }
    const treeRecords = st.treePoints.map(t => ({ x: t.x * M, z: t.z * M, radius: .10 * M, crown: t.radius * M, height: t.height * M, hidden: inHospital(t.x, t.z) }));
    const shrubRecords = (st.shrubPoints || []).map(p => ({ x: p.x * M, z: p.z * M, radius: (p.radius ?? .4) * M, hidden: inHospital(p.x, p.z) }));
    const furnitureRecords = (st.furniturePoints || []).filter(p => p.kind === 'bench' || p.kind === 'light')
      .map(p => ({ x: p.x * M, z: p.z * M, kind: p.kind, rotation: p.rotation || 0, hidden: inHospital(p.x, p.z) }));
    const ground = prepareGroundInstances(THREE, scenery, bts, { trees: treeRecords, shrubs: shrubRecords, furniture: furnitureRecords });
    // 잔디 · 나무 후보(?nature=). 원본 인스턴스의 행렬 · 순서는 안 건드리고, 더한 것은 그쪽이 따로 숨긴다. 못 불러와도 캠퍼스는 뜬다.
    const nature = natureLook ? await import('./nature-look.js').then(m => m.applyNatureLook(THREE, { level: natureLook, scenery, trees: treeRecords, shrubs: shrubRecords,
      areas: [...PKG.environment.areas, ...(PKG.environment.extensionFor(entries).areas || [])], obstacles, terrain, W }))
      .catch(error => { console.warn('잔디 · 나무 후보를 얹지 못했어요.', error); return null; }) : null;

    const b = scenery.bounds;
    const bounds = { minX: b.min.x * M, maxX: b.max.x * M, minZ: b.min.z * M, maxZ: b.max.z * M };
    let triangles = 0, meshes = 0;
    for (const root of new Set(buildingRoots)) root.traverse(o => { if (o.isMesh && o.visible) { meshes++; triangles += triangleCount(o.geometry); } });
    let groundMeshes = 0, groundInstances = 0;
    scenery.group.traverse(o => { if (o.isMesh) { groundMeshes++; if (o.isInstancedMesh) groundInstances += o.count; } });
    const stats = { buildings: entries.length + (protectedSet?.sites.filter(s => s.kind === 'model').length || 0), regular: entries.length,
      hospitals: protectedSet?.sites.filter(s => s.kind === 'model').length || 0, triangles, meshes, meshesBefore: merge.before, mergeKept: merge.kept, mergeMirrored: merge.mirrored,
      loadMs: Math.round(performance.now() - t0), ground: groundSource, groundReason, groundMeshes, groundInstances, hiddenByHospitals, materials: finishes.stats,
      groundBatches: ground.batches.map(b => ({ name: b.mesh.name, count: b.xs.length, mapping: b.mapping })) };

    // 매 물리 틱에 여러 번 불린다: 원본 지형 조회(근처 건물 터 몇 개 + 격자 보간) 한 번에 단위 변환만 더한다.
    const terrainHeightAt = terrain.heightAt;
    const heightAt = (x, z) => terrainHeightAt(x * W, z * W) * M;

    let disposed = false;
    return {
      group, heightAt, obstacles, trees: treeRecords, shrubs: shrubRecords, furniture: furnitureRecords, bounds, stats,
      terrain,   // 원본 지형 객체(월드 단위) — 디버깅용
      hideGroundInstances: test => { const n = ground.hide(test); nature?.hide(test); return n; },
      // 길에 먹힌 물건을 새 길가로 옮긴다(2026-11-24 길 폭 14 m — 표는 src/track/course-<id>.moves.js, 도구 도구/build-campus-moves.mjs). 숨기기(hideGroundInstances) 앞에 부른다.
      //   표의 x · z 에서 0.05 m 안의 기록(나무 · 관목 · 가구)을 찾아 toX · toZ 로. 땅 높이 차만큼 위아래도 맞춘다. → { moved(기록 수), instances(조각 수), missing(못 찾은 것) }
      moveGroundInstances: (list = []) => {
        const pools = { tree: treeRecords, shrub: shrubRecords, furniture: furnitureRecords }, moves = [], missing = [];
        for (const row of list) {
          const record = (pools[row.kind] || []).find(r => !r.hidden && Math.abs(r.x - row.x) < 0.05 && Math.abs(r.z - row.z) < 0.05 && (!row.item || r.kind === row.item));
          if (!record) { missing.push(row); continue; }
          moves.push({ record, dx: row.toX - record.x, dz: row.toZ - record.z, dy: heightAt(row.toX, row.toZ) - heightAt(record.x, record.z) });
        }
        return { moved: moves.length, instances: ground.move(moves), missing };
      },
      restoreGroundInstances: () => { ground.restore(); nature?.restore(); },
      nature: nature ? { id: nature.id, stats: nature.stats } : null,
      update(dt, time) { if (!disposed) { scenery.update(time); nature?.update(time); } },
      dispose() {
        if (disposed) return; disposed = true;
        group.removeFromParent();
        try { nature?.dispose(); } catch {}
        try { scenery.dispose(); } catch {} try { protectedSet?.dispose(); } catch {}
        for (const s of sources) try { s.dispose(); } catch {}
        for (const g of ownedGeometries) g.dispose(); ownedGeometries.clear();
        finishes.dispose(); try { assets?.dispose?.(); } catch {} try { hospitalAssets?.dispose?.(); } catch {}
        group.clear(); bts.clear();
      },
    };
  } catch (error) { return fail(error); }
}

function triangleCount(g) { return (g.index ? g.index.count : g.attributes.position?.count || 0) / 3; }

// 한 건물(root) 안의 메시를 재질 · 정점 속성 · 그림자 설정이 같은 것끼리 하나로 합친다.
// 합친 기하는 root 기준 좌표(원래 메시의 root 상대 행렬을 정점에 구워 넣음)라 root 의 배치 변환은 그대로 적용된다.
// 속성이 안 맞거나, 재질 배열 · 기하 그룹 · 모프 · 그리기 범위가 있는 메시는 그대로 둔다.
function mergeBuilding(THREE, root, merge, owned) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), all = [];
  root.traverse(o => { if (o.isMesh) all.push(o); });
  merge.before += all.length;
  for (const o of all) {
    const g = o.geometry;
    const plain = !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && o.visible && g?.attributes?.position
      && !Object.keys(g.morphAttributes || {}).length && g.drawRange.start === 0 && g.drawRange.count === Infinity;
    if (!plain) { merge.kept++; continue; }
    const relative = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld);
    const signature = Object.keys(g.attributes).sort().map(k => { const a = g.attributes[k]; return `${k}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}:${a.isInterleavedBufferAttribute ? 'i' : ''}`; }).join(',');
    const key = `${o.material.uuid}|${signature}|${g.index ? 'idx' : 'tri'}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    let bucket = buckets.get(key); if (!bucket) buckets.set(key, bucket = { material: o.material, list: [] });
    bucket.list.push({ mesh: o, relative });
  }
  for (const { material, list } of buckets.values()) {
    if (list.length < 2) continue;
    const parts = [];
    for (const { mesh, relative } of list) {
      let g = mesh.geometry.clone(); g.clearGroups();   // 재질이 하나면 그룹은 그리기에 쓰이지 않는다(BoxGeometry 등이 기본으로 가짐)
      for (const k of Object.keys(g.attributes)) if (g.attributes[k].isInterleavedBufferAttribute) g.setAttribute(k, g.attributes[k].clone());
      g.applyMatrix4(relative);
      if (relative.determinant() < 0) { flipWinding(g); merge.mirrored++; }
      parts.push(g);
    }
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!merged) continue;                                   // 맞지 않으면 원래 메시를 그대로 둔다
    merged.computeBoundingBox(); merged.computeBoundingSphere(); owned.add(merged);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `${root.name}:merged:${material.name || 'material'}`;
    mesh.castShadow = list[0].mesh.castShadow; mesh.receiveShadow = list[0].mesh.receiveShadow; mesh.renderOrder = list[0].mesh.renderOrder;
    root.add(mesh); mesh.updateMatrixWorld(true);
    for (const { mesh: old } of list) {
      for (const child of [...old.children]) old.parent.attach(child);   // 합친 메시 밑의 다른 물체는 살린다
      old.removeFromParent();
    }
  }
  root.updateMatrixWorld(true);
  let after = 0; root.traverse(o => { if (o.isMesh) after++; }); merge.after += after;
}
function flipWinding(g) {
  if (g.index) { const a = g.index.array; for (let i = 0; i + 2 < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; return; }
  for (const attribute of Object.values(g.attributes)) {
    const a = attribute.array, n = attribute.itemSize;
    for (let v = 0; v + 2 < attribute.count; v += 3) for (let k = 0; k < n; k++) { const i = (v + 1) * n + k, j = (v + 2) * n + k, t = a[i]; a[i] = a[j]; a[j] = t; }
    attribute.needsUpdate = true;
  }
}

// 바닥의 InstancedMesh(나무 · 관목 · 경계석 · 옹벽 · 계단 디딤판 · 가구)를 위치로 숨기는 준비.
// 나무 줄기 · 수관 · 잎덩이와 관목은 원본이 만든 순서(나무 i → 줄기 i, 수관 i, 잎덩이 2i·2i+1)로 그 나무의 위치를 쓰고,
// 가구 조각은 가장 가까운 가구 자리를 쓴다 — 경계에 걸친 나무가 반만 남지 않게. 그 밖의 것은 제 위치.
// 건물 터(flat-building-platforms)와 분수(매 프레임 다시 그림)는 건드리지 않는다.
const TREE_PARTS = { 'natural-tree-trunks': 1, 'natural-tree-crowns': 1, 'varied-tree-crown-lobes': 2 };
function prepareGroundInstances(THREE, scenery, bts, { trees, shrubs, furniture }) {
  const fountains = new Set(); scenery.group.traverse(o => { if (o.name?.startsWith?.('fountain') || o.userData?.fountains) o.traverse(c => fountains.add(c)); });
  const batches = [], matrix = new THREE.Matrix4(), position = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const furnitureGrid = new Map(), cell = 4, gridKey = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  for (const f of furniture) { const k = gridKey(f.x, f.z); if (!furnitureGrid.has(k)) furnitureGrid.set(k, []); furnitureGrid.get(k).push(f); }
  const nearestFurniture = (x, z) => {
    let best = null, bd = 3;   // 가구 조각은 자리에서 1.5 m 안팎
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const f of furnitureGrid.get(`${Math.floor(x / cell) + dx},${Math.floor(z / cell) + dz}`) || []) { const d = Math.hypot(f.x - x, f.z - z); if (d < bd) { bd = d; best = f; } }
    return best;
  };
  const relative = new THREE.Matrix4();
  scenery.group.traverse(o => {
    if (!o.isInstancedMesh || fountains.has(o) || o.name === 'flat-building-platforms') return;
    // BTS 묶음 기준 행렬(묶음 위 부모의 scale 2 와 무관하게) × 2 → 미터.
    relative.identity(); for (let p = o; p && p !== bts; p = p.parent) relative.premultiply(p.matrix);
    const n = o.count, xs = new Float32Array(n), zs = new Float32Array(n), owners = new Array(n).fill(null), hidden = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      o.getMatrixAt(i, matrix);
      const e = matrix.elements;
      if (e[0] === 0 && e[5] === 0 && e[10] === 0 && e[1] === 0 && e[2] === 0) hidden[i] = 1;    // 병원 안이라 이미 숨김
      position.setFromMatrixPosition(matrix).applyMatrix4(relative);
      xs[i] = position.x * M; zs[i] = position.z * M;
    }
    const perTree = TREE_PARTS[o.name];
    // 순서 대응 확인: 개수가 맞고, 조각이 그 나무(관목) 수관 반경 + 1 m 안에 있는지 전부 본다.
    const byIndex = (list, per) => {
      if (!list.length || n !== list.length * per) return false;
      for (let i = 0; i < n; i++) { const t = list[Math.floor(i / per)]; if (!hidden[i] && Math.hypot(xs[i] - t.x, zs[i] - t.z) > (t.crown ?? t.radius) + 1) return false; }
      return true;
    };
    if (perTree && byIndex(trees, perTree)) for (let i = 0; i < n; i++) owners[i] = trees[Math.floor(i / perTree)];
    else if (o.name === 'rounded-low-planting-beds' && byIndex(shrubs, 1)) for (let i = 0; i < n; i++) owners[i] = shrubs[i];
    else if (isFurniture(o)) for (let i = 0; i < n; i++) owners[i] = nearestFurniture(xs[i], zs[i]);
    batches.push({ mesh: o, xs, zs, owners, hidden, base: o.instanceMatrix.array.slice(), baseHidden: hidden.slice(), relative: relative.clone(),
      mapping: owners.some(Boolean) ? (perTree ? 'tree' : o.name === 'rounded-low-planting-beds' ? 'shrub' : 'furniture') : 'self' });
  });
  function isFurniture(o) { for (let p = o.parent; p; p = p.parent) if (p.name === 'detailed-campus-furniture') return true; return false; }
  // 주인(나무 · 관목 · 가구 기록)째로 옮긴다(2026-11-24 길 폭 14 m — 넓힌 길에 먹힌 것을 숨기지 않고 새 길가로). moves = [{ record, dx, dz, dy }](미터).
  //   줄기 · 수관 · 잎덩이 · 가구 조각이 같이 움직이고, 처음 행렬(base)도 옮긴 자리로 바꾼다(restore 가 옮긴 것을 되돌리지 않게). 기록의 x · z 도 바꾼다.
  function move(moves) {
    const by = new Map(moves.map(m => [m.record, m])), shift = new THREE.Matrix4(), inverse = new THREE.Matrix4(), step = new THREE.Matrix4(), one = new THREE.Matrix4();
    let count = 0;
    for (const b of batches) {
      if (!b.owners.some(o => o && by.has(o))) continue;
      inverse.copy(b.relative).invert();
      for (let i = 0; i < b.xs.length; i++) {
        const m = b.owners[i] && by.get(b.owners[i]); if (!m) continue;
        shift.makeTranslation(m.dx / M, m.dy / M, m.dz / M); step.copy(inverse).multiply(shift).multiply(b.relative);   // 묶음 좌표에서 옮긴 것을 제 좌표로
        one.fromArray(b.base, i * 16).premultiply(step).toArray(b.base, i * 16);
        if (!b.hidden[i]) { b.mesh.getMatrixAt(i, matrix); matrix.premultiply(step); b.mesh.setMatrixAt(i, matrix); b.mesh.instanceMatrix.needsUpdate = true; }
        b.xs[i] += m.dx; b.zs[i] += m.dz; count++;
      }
      b.mesh.computeBoundingSphere();
    }
    for (const m of moves) { m.record.x += m.dx; m.record.z += m.dz; }
    return count;
  }
  return {
    batches, move,
    hide(test) {
      let count = 0;
      for (const b of batches) {
        let changed = false;
        for (let i = 0; i < b.xs.length; i++) {
          if (b.hidden[i]) continue;
          const owner = b.owners[i], x = owner ? owner.x : b.xs[i], z = owner ? owner.z : b.zs[i];
          if (!test(x, z)) continue;
          b.mesh.setMatrixAt(i, zero); b.hidden[i] = 1; changed = true; count++;
          if (owner) owner.hidden = true;
        }
        if (changed) { b.mesh.instanceMatrix.needsUpdate = true; b.mesh.computeBoundingSphere(); }
      }
      return count;
    },
    restore() {
      for (const b of batches) { b.mesh.instanceMatrix.array.set(b.base); b.mesh.instanceMatrix.needsUpdate = true; b.hidden.set(b.baseHidden); b.mesh.computeBoundingSphere();
        for (let i = 0; i < b.owners.length; i++) if (b.owners[i] && !b.baseHidden[i]) b.owners[i].hidden = false; }
    },
  };
}
