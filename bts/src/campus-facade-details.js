// Photo-guided finishes on a caller-owned clone of an approved building.
// No positions, indices, openings or source-cache resources are changed.
// Dispose this temporary preparation after the destruction adapter copies it.
const prepared = new WeakMap();
export const FACADE_EVIDENCE = Object.freeze({
  underwood: {
    images: ['pilot/underwood/reference-front.jpg', 'reference/building-audit/images/underwood/official-map.jpg'],
    source: 'https://www.yonsei.ac.kr/campusMap/sc/76/buildDetailView.do',
    observed: 'Warm pale dressed-stone surrounds, darker irregular masonry, ivory window divisions, dark entry doors, grey-brown slate and pale stairs.',
    estimated: 'Finish colours, component-to-component variation and weathering strength are visual approximations, not sampled calibrated reflectance or a survey.'
  },
  business: {
    images: ['reference/building-audit/images/business/architect-3.jpg', 'reference/building-audit/images/business/architect-5.jpg'],
    source: 'https://www.samoo.com/home/works/view.do?cntntsSn=10324',
    observed: 'Warm-grey stone slabs and recessed dark frames contrast with the light vertical tower; grey metal fins and dark recessed entrance sit above pale stairs. The right porch and courtyard undercroft remain open.',
    estimated: 'Exact slab and glazing shades vary with sky and exposure. Subtle repeat variation is synthetic; unseen sides retain their previous estimated geometry.'
  }
});

function finishFor(id, meshName, materialName) {
  const name = materialName.toLowerCase();
  if (/flags__/.test(meshName)) return null;
  if (id === 'underwood') {
    if (/rubble stone/.test(name)) return { kind: 'stone', color: '#eeeae0', roughness: .96 };
    if (/warm dressed/.test(name)) return { kind: 'stone', color: '#cdc5b2', roughness: .88 };
    if (/coping/.test(name)) return { kind: /stair/.test(meshName) ? 'steps' : 'stone', color: '#d7d1c2', roughness: .89 };
    if (/painted timber/.test(name)) return { kind: 'frame', color: '#d6d4c8', roughness: .66 };
    if (/double entry/.test(name)) return { kind: 'door', color: '#3d3931', roughness: .69 };
    if (/glass/.test(name)) return { kind: 'glass', color: '#46575b', roughness: .24, metalness: .12 };
    if (/slate/.test(name)) return { kind: 'roof', color: /edges/.test(name) ? '#504d46' : '#686158', roughness: .93 };
    if (/weathered metal/.test(name)) return { kind: 'metal', color: '#696e68', roughness: .47, metalness: .55 };
  }
  if (id === 'business') {
    if (/graystone/.test(name)) return { kind: 'stone', color: '#a3a097', roughness: .86 };
    if (/towerstone/.test(name)) return { kind: 'stone', color: '#e3e0d7', roughness: .84 };
    if (/stonejoint/.test(name)) return { kind: 'joint', color: /tower-/.test(meshName) ? '#bab8b0' : '#777770', roughness: .94 };
    if (/windowmetal/.test(name)) return { kind: 'frame', color: '#434c4d', roughness: .36, metalness: .52 };
    if (/fins/.test(name)) return { kind: 'metal', color: '#a0a6a3', roughness: .42, metalness: .48 };
    if (/portalglass/.test(name)) return { kind: 'glass', color: '#304447', roughness: .27, metalness: .13 };
    if (/reflectglass/.test(name)) return { kind: 'glass', color: '#57727a', roughness: .22, metalness: .16 };
    if (/blueglass/.test(name)) return { kind: 'glass', color: '#4b6c79', roughness: .23, metalness: .15 };
    if (/spandrel/.test(name)) return { kind: 'stone', color: '#889b9b', roughness: .73 };
    if (/concrete/.test(name)) return { kind: /stair/.test(meshName) ? 'steps' : 'stone', color: '#c5c4bb', roughness: .94 };
    if (/business_metal/.test(name)) return { kind: 'metal', color: '#6c7675', roughness: .42, metalness: .58 };
    if (/business_frame/.test(name)) return { kind: 'frame', color: '#adb5b3', roughness: .47, metalness: .36 };
  }
  return null;
}

// Connected surfaces get one stable tint: adjacent triangles never receive
// independently random colours. Welded positions reconnect split normals/UVs.
function componentIds(geometry) {
  const position = geometry.getAttribute('position'), count = position.count;
  const parents = Uint32Array.from({length:count}, (_, i) => i);
  const root = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  const join = (a,b) => { a=root(a); b=root(b); if(a!==b) parents[Math.max(a,b)]=Math.min(a,b); };
  const welded = new Map();
  for(let i=0;i<count;i++) {
    const key = `${Math.round(position.getX(i)*1e5)},${Math.round(position.getY(i)*1e5)},${Math.round(position.getZ(i)*1e5)}`;
    if(welded.has(key)) join(i,welded.get(key)); else welded.set(key,i);
  }
  const index=geometry.index, indexCount=index?.count??count;
  for(let i=0;i+2<indexCount;i+=3) {
    const a=index?index.getX(i):i, b=index?index.getX(i+1):i+1, c=index?index.getX(i+2):i+2;
    join(a,b);join(a,c);
  }
  for(let i=0;i<count;i++) parents[i]=root(i);
  return parents;
}
function hash(text) {
  let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
  h^=h>>>16;return (h>>>0)/4294967295;
}

export function enhanceCampusFacade(THREE, id, sourceScene) {
  if (prepared.has(sourceScene)) return prepared.get(sourceScene);
  const geometries=new Set(), materials=new Set(), materialCopies=new Map();
  const stats={id,meshes:0,materials:0,geometries:0,colouredVertices:0,components:0,addedTriangles:0,textures:0};
  let disposed=false;
  const api={scene:sourceScene,stats,dispose(){
    if(disposed)return;disposed=true;
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)material.dispose();
    geometries.clear();materials.clear();
  }};
  prepared.set(sourceScene,api);
  if(!FACADE_EVIDENCE[id]) return api;
  sourceScene.updateMatrixWorld(true);
  const p=new THREE.Vector3(), n=new THREE.Vector3(), normalMatrix=new THREE.Matrix3();
  try {
    sourceScene.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.geometry?.getAttribute('position')||Array.isArray(mesh.material))return;
      const oldMaterial=mesh.material, finish=finishFor(id,mesh.name,oldMaterial.name);
      if(!finish)return;
      const coloured=['stone','steps','glass','roof','door'].includes(finish.kind);
      const key=JSON.stringify(finish);
      let variants=materialCopies.get(oldMaterial);if(!variants){variants=new Map();materialCopies.set(oldMaterial,variants);}
      let material=variants.get(key);
      if(!material){
        material=oldMaterial.clone();material.color.set(finish.color);material.roughness=finish.roughness;
        if(finish.metalness!==undefined)material.metalness=finish.metalness;
        if(coloured)material.vertexColors=true;
        // The approved Underwood glTF points both base colour and normalTexture
        // at the same stone colour image. RGB stone is not a tangent normal map.
        // Correct only this runtime clone: reuse the image as restrained height.
        if(id==='underwood'&&material.map&&material.normalMap?.source===material.map.source){
          material.normalMap=null;material.bumpMap=material.map;material.bumpScale=.028;
          material.userData.correctedStoneNormal=true;
        }
        material.userData.campusFacade={building:id,kind:finish.kind,source:FACADE_EVIDENCE[id].source};
        materials.add(material);variants.set(key,material);
      }
      mesh.material=material;stats.meshes++;
      if(!coloured)return;
      const original=mesh.geometry, geometry=original.clone(), position=geometry.getAttribute('position');
      const normal=geometry.getAttribute('normal'), oldColors=geometry.getAttribute('color');
      const components=componentIds(geometry), unique=new Set(components), colours=new Float32Array(position.count*3);
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      const shades=new Map([...unique].map(component=>[component,hash(`${id}:${mesh.name}:${component}`)]));
      for(let i=0;i<position.count;i++){
        p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
        if(normal)n.fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize();else n.set(0,1,0);
        const variation=shades.get(components[i]);let shade;
        if(finish.kind==='glass') shade=.79+variation*.24;
        else if(finish.kind==='roof') shade=.93+variation*.08;
        else if(finish.kind==='door') shade=.96+variation*.04;
        else {
          // Very restrained ground-contact and sheltered-riser patina. Exact
          // stains cannot be recovered from the available wide photographs.
          shade=.95+variation*.06;
          shade*=1-.045*Math.exp(-Math.max(0,p.y)/1.25);
          if(finish.kind==='steps')shade*=n.y>.6?1.025:.95;
        }
        for(let channel=0;channel<3;channel++){
          const old=oldColors ? (channel===0?oldColors.getX(i):channel===1?oldColors.getY(i):oldColors.getZ(i)) : 1;
          colours[i*3+channel]=old*shade;
        }
      }
      geometry.setAttribute('color',new THREE.BufferAttribute(colours,3));
      mesh.geometry=geometry;geometries.add(geometry);
      stats.colouredVertices+=position.count;stats.components+=unique.size;
    });
    stats.materials=materials.size;stats.geometries=geometries.size;
  } catch(error) { api.dispose();throw error; }
  return api;
}
