/** Detail furnishing study, not a measured replica of a campus product.
 * Common scale: .5 world units/metre. Baekyang variants use photographed forms with estimated dimensions.
 */
export function createCampusFurniture(THREE, { placements = [], heightAt = () => 0 } = {}) {
  const group = new THREE.Group(); group.name = 'detailed-campus-furniture';
  group.userData.accuracy = 'Estimated human-scale furnishing; not a verified product replica';
  const geometries = new Set(), materials = new Set(), batches = new Map();
  const geometry = g => { geometries.add(g); return g; };
  const material = options => { const m = new THREE.MeshStandardMaterial(options); materials.add(m); return m; };
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 12));
  const pole = geometry(new THREE.CylinderGeometry(.74, 1, 1, 12));
  const dome = geometry(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2));
  const wood = material({ color: '#79614a', roughness: .82 });
  const metal = material({ color: '#414a48', roughness: .65, metalness: .32 });
  const lens = material({ color: '#f2e6c2', emissive: '#dac891', emissiveIntensity: .36, roughness: .38,
    transparent: true, opacity: .87, depthWrite: false });
  const placed = [], rotationQ = new THREE.Quaternion(), localQ = new THREE.Quaternion();
  const axisY = new THREE.Vector3(0, 1, 0), localPosition = new THREE.Vector3(), localScale = new THREE.Vector3();
  const matrix = new THREE.Matrix4(); let disposed = false, benches = 0, lights = 0;
  function part(placement, geo, mat, center, size, tilt = 0) {
    const key = `${geo.uuid}:${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { geo, mat, matrices: [] });
    rotationQ.setFromAxisAngle(axisY, placement.rotation);
    localPosition.set(...center).applyQuaternion(rotationQ);
    localPosition.x += placement.x; localPosition.z += placement.z; localPosition.y += placement.baseY;
    localQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt); localQ.premultiply(rotationQ);
    localScale.set(...size); matrix.compose(localPosition, localQ, localScale);
    batches.get(key).matrices.push(matrix.clone());
  }
  for (const source of placements) {
    if (!['bench', 'light'].includes(source.kind) || !Number.isFinite(source.x) || !Number.isFinite(source.z)) continue;
    const baseY = heightAt(source.x, source.z);
    if (!Number.isFinite(baseY)) throw new Error('Furniture needs a finite terrain height');
    const p = { kind: source.kind, x: source.x, z: source.z, rotation: Number.isFinite(source.rotation) ? source.rotation : 0, style:source.style||'generic', baseY:baseY+(source.baseOffset||0) };
    placed.push(Object.freeze(p));
    if (p.kind === 'bench') {
      benches++;
      if(p.style==='baekyang'){
        for(let i=0;i<6;i++)part(p,box,wood,[0,.23,(i-2.5)*.044],[.90,.032,.032]);
        for(let i=0;i<13;i++)part(p,box,wood,[(i-6)*.065,.43,.11],[.035,.27,.028]);
        for(const y of [.295,.575])part(p,box,wood,[0,y,.11],[.97,.042,.044]);
        for(const side of [-1,1]){
          for(const z of [-.09,.10])part(p,box,wood,[side*.45,.117,z],[.045,.234,.045]);
          part(p,box,wood,[side*.45,.38,0],[.048,.04,.30]);
          part(p,box,wood,[side*.45,.315,-.10],[.037,.14,.037]);
          part(p,box,wood,[side*.45,.42,.11],[.04,.35,.04]);
        }
        part(p,box,metal,[0,.575,.084],[.13,.026,.006]);
        continue;
      }
      // Gaps between slats remain real empty geometry, including in close views.
      for (let i = 0; i < 5; i++) part(p, box, wood, [0, .23, (i - 2) * .048], [.88, .034, .036]);
      for (let i = 0; i < 4; i++) part(p, box, wood, [0, .335 + i * .068, .109], [.88, .052, .024]);
      for (const side of [-1, 1]) {
        // Four legs, two long pads, seat braces and slim back uprights.
        for (const z of [-.086, .086]) part(p, box, metal, [side * .33, .105, z], [.028, .21, .030]);
        part(p, box, metal, [side * .33, .015, 0], [.105, .030, .24]);
        part(p, box, metal, [side * .33, .205, 0], [.035, .030, .24]);
        part(p, box, metal, [side * .33, .402, .125], [.026, .357, .020]);
        // Armrest support and warm wooden cap stay within the original width.
        for (const z of [-.078, .078]) part(p, box, metal, [side * .455, .306, z], [.025, .158, .025]);
        part(p, box, wood, [side * .455, .393, 0], [.036, .026, .225]);
        for (let i = 0; i < 4; i++) part(p, cylinder, metal, [side * .33, .335 + i * .068, .092], [.008, .008, .008], Math.PI / 2);
      }
      part(p, box, metal, [0, .18, 0], [.71, .026, .033]);
    } else {
      lights++;
      if(p.style==='baekyang'){
        part(p,box,metal,[0,.025,0],[.19,.05,.19]);
        part(p,box,metal,[0,1.74,0],[.075,3.48,.075]);
        part(p,box,metal,[0,3.43,-.42],[.065,.085,.90]);
        part(p,box,metal,[0,3.40,-.80],[.13,.06,.34]);
        part(p,box,lens,[0,3.364,-.80],[.10,.012,.28]);
        continue;
      }
      part(p, box, metal, [0, .019, 0], [.21, .038, .21]);
      part(p, cylinder, metal, [0, .073, 0], [.086, .108, .086]);
      for (const x of [-.073, .073]) for (const z of [-.073, .073])
        part(p, cylinder, metal, [x, .043, z], [.008, .011, .008]);
      part(p, pole, metal, [0, 1.63, 0], [.043, 3.0, .043]);
      part(p, cylinder, metal, [0, .145, 0], [.052, .042, .052]);
      part(p, cylinder, metal, [0, 3.125, 0], [.143, .052, .143]);
      part(p, cylinder, lens, [0, 3.27, 0], [.119, .238, .119]);
      for (const side of [-1, 1]) {
        part(p, box, metal, [side * .126, 3.27, 0], [.016, .256, .016]);
        part(p, box, metal, [0, 3.27, side * .126], [.016, .256, .016]);
      }
      part(p, cylinder, metal, [0, 3.42, 0], [.154, .037, .154]);
      part(p, dome, metal, [0, 3.43, 0], [.163, .070, .163]);
    }
  }
  let instances = 0;
  for (const { geo, mat, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
    mesh.name = mat === lens ? 'pedestrian-light-emissive-lenses' : geo === dome ? 'pedestrian-light-caps'
      : mat === wood ? 'bench-wooden-slats-and-armrests' : 'furniture-metal-details';
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    mesh.castShadow = mat !== lens; mesh.receiveShadow = true; group.add(mesh); instances += matrices.length;
  }
  const stats = Object.freeze({ benches, lights, drawCalls: group.children.length, instances,
    pointLights: 0, worldUnitsPerMetre: .5, placements: Object.freeze(placed),
    accuracy: 'Estimated furnishings; placement supplied by campus ground, product dimensions not surveyed' });
  return { group, stats, dispose() {
    if (disposed) return; disposed = true;
    for (const mesh of group.children) mesh.dispose();
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose();
    group.removeFromParent(); group.clear(); batches.clear();
  } };
}
