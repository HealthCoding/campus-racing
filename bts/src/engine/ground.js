import { createGroundMaterials } from '../ground-materials.js?v=realism14';
import { createCampusFurniture } from '../campus-furniture.js?v=realism14';
import { createCampusFountains } from '../campus-fountains.js?v=realism14';
import { createCampusTerrain } from './terrain.js';
import { appendTerrainSurface } from '../terrain-surface.js';

// Ground and furnishing are a photo/map-informed landscape study, not a survey.
const clearance = .25; // half an estimated metre at the common model scale
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
function local(p,o){const x=p.x-o.x,z=p.z-o.z,c=Math.cos(o.rotation),s=Math.sin(o.rotation);return {x:c*x-s*z,z:s*x+c*z};}
function world(p,o){const c=Math.cos(o.rotation),s=Math.sin(o.rotation);return {x:o.x+c*p.x+s*p.z,z:o.z-s*p.x+c*p.z};}
export function groundPointBlocked(point,obstacles,margin=0){return obstacles.some(o=>{const p=local(point,o);return Math.abs(p.x)<o.w/2+margin-1e-7&&Math.abs(p.z)<o.d/2+margin-1e-7;});}
export function groundSegmentBlocked(a,b,obstacles,margin=0){
 return obstacles.some(o=>{const p=local(a,o),q=local(b,o),dx=q.x-p.x,dz=q.z-p.z;let lo=0,hi=1;
  for(const [v,d,h]of [[p.x,dx,o.w/2+margin],[p.z,dz,o.d/2+margin]]){
   if(Math.abs(d)<1e-10){if(Math.abs(v)>=h-1e-7)return false;continue;}
   let a=(-h-v)/d,b=(h-v)/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>=hi-1e-7)return false;
  }return hi>0&&lo<1;
 });
}
function closestOnSegment(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return{x:a.x+t*dx,z:a.z+t*dz};}

// Campus-independent ground: `profile`/`environment`/`terrainProfile`/`worldUnitsPerMeter` come from the
// campus package (src/campus-ground.js binds Yonsei). Hooks are called at the exact points the former
// inline rules sat so RNG consumption and placement order are unchanged.
export function createCampusGround(THREE,{entries=[],placements,profile,environment,terrainProfile,worldUnitsPerMeter,terrain=createCampusTerrain(entries,terrainProfile),reducedMotion=false}={}){
 if(!profile||!environment)throw new Error('Campus ground requires a campus package profile and environment');
 const group=new THREE.Group();group.name='continuous-campus-ground';
 const finishes=createGroundMaterials(THREE);
 group.userData.source=environment.sourceNote;
 const geometries=new Set(),materials=new Set(),instances=new Map();let disposed=false,seed=profile.seed;
 const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const geom=g=>{geometries.add(g);return g;},mat=(color,options={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.95,...options});materials.add(m);return m;};
 const obstacles=entries.map(e=>{
  const b=e.worldBounds;
  if(Number.isFinite(e.w)&&Number.isFinite(e.d)&&e.w>0&&e.d>0)return{id:e.id,x:e.x,z:e.z,w:e.w,d:e.d,rotation:e.rotation||0};
  if(b&&!b.isEmpty())return{id:e.id,x:(b.min.x+b.max.x)/2,z:(b.min.z+b.max.z)/2,w:b.max.x-b.min.x,d:b.max.z-b.min.z,rotation:0};
  throw new Error(`Ground requires placed model bounds: ${e.id}`);
 });
 const paths=(placements?.paths??environment.spacePaths).filter(p=>p.points.length>=2);
 const extension=environment.extensionFor(entries);
 const areas=placements?.paths?(placements.areas??[]):[...environment.areas,...extension.areas];
 const environmentPaths=placements?.paths?[]:[...environment.paths,...extension.paths];
 const height=(x,z)=>terrain.heightAt(x,z);
 const insideRing=(p,ring)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)yes=!yes;}return yes;};
 const insideArea=(p,a)=>insideRing(p,a.rings[0])&&!a.rings.slice(1).some(r=>insideRing(p,r));
 const graphCache=new Map();
 function graph(width){
  if(graphCache.has(width))return graphCache.get(width);
  const margin=width/2+clearance,nodes=[];
  for(const o of obstacles)for(const x of [-o.w/2-margin-.02,o.w/2+margin+.02])for(const z of [-o.d/2-margin-.02,o.d/2+margin+.02]){
   const p=world({x,z},o);if(!groundPointBlocked(p,obstacles,margin))nodes.push(p);
  }
  const edges=nodes.map(()=>[]);
  for(let i=0;i<nodes.length;i++)for(let j=0;j<i;j++)if(!groundSegmentBlocked(nodes[i],nodes[j],obstacles,margin)){
   const d=distance(nodes[i],nodes[j]);edges[i].push([j,d]);edges[j].push([i,d]);
  }
  const g={nodes,edges,margin};graphCache.set(width,g);return g;
 }
 function snap(point,g){if(!groundPointBlocked(point,obstacles,g.margin))return {...point};
  let best=null,d=Infinity;for(const p of g.nodes){const v=distance(point,p);if(v<d){d=v;best=p;}}return best?{...best}:null;
 }
 function route(a,b,width){
  const g=graph(width);a=snap(a,g);b=snap(b,g);if(!a||!b)return null;
  if(!groundSegmentBlocked(a,b,obstacles,g.margin))return[a,b];
  const n=g.nodes.length,points=[...g.nodes,a,b],start=n,end=n+1,edges=g.edges.map(e=>[...e]);edges.push([],[]);
  for(let i=0;i<n;i++)for(const index of [start,end])if(!groundSegmentBlocked(points[i],points[index],obstacles,g.margin)){
   const d=distance(points[i],points[index]);edges[i].push([index,d]);edges[index].push([i,d]);
  }
  const cost=Array(n+2).fill(Infinity),prev=Array(n+2).fill(-1),used=new Set();cost[start]=0;
  for(let step=0;step<n+2;step++){
   let current=-1,best=Infinity;for(let i=0;i<n+2;i++)if(!used.has(i)&&cost[i]<Infinity){const score=cost[i]+distance(points[i],b);if(score<best){best=score;current=i;}}
   if(current<0)break;if(current===end){const output=[];for(let i=end;i!==-1;i=prev[i])output.push(points[i]);return output.reverse();}
   used.add(current);for(const [next,d]of edges[current])if(cost[current]+d<cost[next]){cost[next]=cost[current]+d;prev[next]=current;}
  }return null;
 }
 const routes=[];let failedRoutes=0;
 for(const source of paths){
  const points=[];let adjustedSegments=0;
  for(let i=1;i<source.points.length;i++){
   const segment=route(source.points[i-1],source.points[i],source.width);
   if(!segment){failedRoutes++;throw new Error(`Campus walkway could not avoid model bounds: ${source.id}`);}
   if(segment.length>2||distance(segment[0],source.points[i-1])>.01||distance(segment.at(-1),source.points[i])>.01)adjustedSegments++;
   if(points.length&&distance(points.at(-1),segment[0])<.001)points.push(...segment.slice(1));else points.push(...segment);
  }
  if(points.length>1)routes.push({id:source.id,width:source.width,points,sourcePoints:source.points.map(p=>({...p})),adjustedSegments,source:source.source});
 }
 // Secondary approaches end just outside a model's oriented bounding footprint;
 // entrance sides are inferred from the nearest main path, not surveyed doors.
 const mappedRoutes=[];let clippedMappedSegments=0;
 for(const source of environmentPaths){
  if(profile.skipMappedPath(source))continue;
  const width=Math.round(Math.max(source.kind==='road'?3:source.kind==='service'?1.5:.8,source.width)*4)/4;
  let current=[];const flush=()=>{if(current.length>1)mappedRoutes.push({...source,width,points:current});current=[];};
  for(let i=1;i<source.points.length;i++){
   const a=source.points[i-1],b=source.points[i];
   if(!groundSegmentBlocked(a,b,obstacles,width/2+clearance)){if(!current.length)current.push(a);current.push(b);continue;}
   flush();const adjusted=route(a,b,width);
   if(adjusted&&distance(adjusted[0],a)<3&&distance(adjusted.at(-1),b)<3&&adjusted.reduce((n,p,j)=>n+(j?distance(p,adjusted[j-1]):0),0)<distance(a,b)*1.5+2)mappedRoutes.push({...source,width,points:adjusted,estimatedDetour:true});
   else clippedMappedSegments++;
  }flush();
 }
 const approaches=[];
 for(const o of obstacles){
  const margin=.7/2+clearance+.02,front=world({x:0,z:o.d/2+margin},o);
  let nearest=null,best=Infinity;for(const path of [...routes,...mappedRoutes])for(let i=1;i<path.points.length;i++){
   const p=closestOnSegment(front,path.points[i-1],path.points[i]),d=distance(front,p);if(d<best){best=d;nearest=p;}
  }
  if(!nearest||best<1.2||best>15)continue;
  const q=local(nearest,o),anchor=world({x:Math.max(-o.w/2+.5,Math.min(o.w/2-.5,q.x)),z:o.d/2+margin},o);
  if(groundPointBlocked(anchor,obstacles,.6))continue;
  const points=route(nearest,anchor,.7);if(!points)continue;
  const length=points.reduce((sum,p,i)=>sum+(i?distance(p,points[i-1]):0),0);
  if(length>15||length<1.2)continue;approaches.push({id:`approach-${o.id}`,width:.7,points,estimated:true,length});
 }
 const playBounds=new THREE.Box3();for(const e of entries)playBounds.union(e.worldBounds);
 for(const p of routes)for(const v of p.points)playBounds.expandByPoint(new THREE.Vector3(v.x,0,v.z));
 if(playBounds.isEmpty())playBounds.set(new THREE.Vector3(-20,0,-20),new THREE.Vector3(20,0,20));
 const bounds=playBounds.clone().expandByScalar(18),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const grid=terrain.grid,positions=[],indices=[],colors=[],grassColor=new THREE.Color();
 for(let iz=0;iz<grid.nz;iz++)for(let ix=0;ix<grid.nx;ix++){
  const index=iz*grid.nx+ix;positions.push(grid.minX+ix*grid.step,grid.heights[index]-.014,grid.minZ+iz*grid.step);
  grassColor.set('#79866d').multiplyScalar(.93+rnd()*.12);colors.push(grassColor.r,grassColor.g,grassColor.b);
  if(ix<grid.nx-1&&iz<grid.nz-1)indices.push(index,index+grid.nx,index+1,index+1,index+grid.nx,index+grid.nx+1);
 }
 const groundGeometry=geom(new THREE.BufferGeometry());groundGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));groundGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));groundGeometry.setIndex(indices);groundGeometry.computeVertexNormals();
 const ground=new THREE.Mesh(groundGeometry,mat('#ffffff',{vertexColors:true}));ground.receiveShadow=true;ground.name='continuous-estimated-terrain';group.add(ground);
 const plane=geom(new THREE.PlaneGeometry(1,1));plane.rotateX(-Math.PI/2);
 const cube=geom(new THREE.BoxGeometry(1,1,1)),trunk=geom(new THREE.CylinderGeometry(.065,.10,1,7));
 const crown=geom(new THREE.IcosahedronGeometry(1,1)),sphere=geom(new THREE.IcosahedronGeometry(1,0));
 const foliageA=mat('#4b6650'),foliageB=mat('#63774f'),wood=mat('#65584b'),paving=mat('#c0b9aa',{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-16});
 const matPlatform=mat('#858e76'),asphalt=mat('#888982',{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-14});
 function instance(key,geometry,material,x,y,z,sx,sy,sz,rotation=0,absoluteY=false){
  if(!absoluteY)y+=height(x,z);
  if(!instances.has(key))instances.set(key,{geometry,material,records:[]});instances.get(key).records.push({x,y,z,sx,sy,sz,rotation});
 }
 function pave(pathOrPaths,y,color){
  const positions=[];
  for(const path of Array.isArray(pathOrPaths)?pathOrPaths:[pathOrPaths])for(let i=1;i<path.points.length;i++){
   const a=path.points[i-1],b=path.points[i],len=distance(a,b);if(len<1e-5)continue;const px=-(b.z-a.z)/len*path.width/2,pz=(b.x-a.x)/len*path.width/2;
   appendTerrainSurface(terrain,[{x:a.x+px,z:a.z+pz},{x:b.x+px,z:b.z+pz},{x:b.x-px,z:b.z-pz},{x:a.x-px,z:a.z-pz}],positions,{offset:y});
  }
  const g=geom(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,color);mesh.name=Array.isArray(pathOrPaths)?'estimated-building-approaches':pathOrPaths.id;mesh.userData.surfaceOffset=y;mesh.receiveShadow=true;group.add(mesh);
 }
 for(const p of terrain.platforms)instance('flat-building-platforms',plane,matPlatform,p.x,p.baseY,p.z,p.w+.05,1,p.d+.05,p.rotation,true);
 for(const p of routes)pave(p,.036,paving);if(approaches.length)pave(approaches,.042,paving);
 for(const [index,kind]of [...new Set(mappedRoutes.map(p=>p.kind))].entries()){pave(mappedRoutes.filter(p=>p.kind===kind),.027+index*.0007,kind==='road'||kind==='service'?asphalt:paving);group.children.at(-1).userData.pathKind=kind;}
 const allPaths=[...routes,...approaches,...mappedRoutes],treePoints=[],furniturePoints=[];
 // Load-time spatial hashes for free(): each walkway segment is filed in every
 // cell its footprint plus pathReach can touch, and each planted tree in its own
 // cell. They only skip pairs that are farther apart than any test threshold,
 // so the boolean answers (and the RNG stream that depends on them) are unchanged.
 const hashSize=4,pathReach=4.5,hashKey=(cx,cz)=>cx*65536+cz,pathCells=new Map(),treeCells=new Map();let maxTreeRadius=0;
 for(const path of allPaths){const pad=path.width/2+clearance+pathReach;
  for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],segment={a,b,limitWidth:path.width};
   if(![a.x,a.z,b.x,b.z,pad].every(Number.isFinite)){pathCells.set('all',[...(pathCells.get('all')||[]),segment]);continue;}
   const x0=Math.floor((Math.min(a.x,b.x)-pad)/hashSize)-1,x1=Math.floor((Math.max(a.x,b.x)+pad)/hashSize)+1;
   const z0=Math.floor((Math.min(a.z,b.z)-pad)/hashSize)-1,z1=Math.floor((Math.max(a.z,b.z)+pad)/hashSize)+1;
   for(let cz=z0;cz<=z1;cz++)for(let cx=x0;cx<=x1;cx++){const key=hashKey(cx,cz);if(!pathCells.has(key))pathCells.set(key,[]);pathCells.get(key).push(segment);}
  }
 }
 function nearPath(p,r){
  if(!(r<=pathReach)||!Number.isFinite(p.x)||!Number.isFinite(p.z))return allPaths.some(path=>path.points.slice(1).some((b,i)=>distance(p,closestOnSegment(p,path.points[i],b))<path.width/2+r+clearance));
  const hit=s=>distance(p,closestOnSegment(p,s.a,s.b))<s.limitWidth/2+r+clearance;
  return (pathCells.get(hashKey(Math.floor(p.x/hashSize),Math.floor(p.z/hashSize)))||[]).some(hit)||(pathCells.get('all')||[]).some(hit);
 }
 function indexTree(t){maxTreeRadius=Math.max(maxTreeRadius,t.radius);
  const key=Number.isFinite(t.x)&&Number.isFinite(t.z)?hashKey(Math.floor(t.x/hashSize),Math.floor(t.z/hashSize)):'all';
  if(!treeCells.has(key))treeCells.set(key,[]);treeCells.get(key).push(t);
 }
 function clearOfTrees(p,r){
  const reach=(r+maxTreeRadius)*.78+1;
  if(!Number.isFinite(reach)||!Number.isFinite(p.x)||!Number.isFinite(p.z)||reach>64)return treePoints.every(t=>distance(p,t)>(r+t.radius)*.78);
  const ok=t=>distance(p,t)>(r+t.radius)*.78;
  if(!(treeCells.get('all')||[]).every(ok))return false;
  const x0=Math.floor((p.x-reach)/hashSize)-1,x1=Math.floor((p.x+reach)/hashSize)+1,z0=Math.floor((p.z-reach)/hashSize)-1,z1=Math.floor((p.z+reach)/hashSize)+1;
  for(let cz=z0;cz<=z1;cz++)for(let cx=x0;cx<=x1;cx++){const list=treeCells.get(hashKey(cx,cz));if(list&&!list.every(ok))return false;}
  return true;
 }
 function free(p,r){if(groundPointBlocked(p,obstacles,r+clearance))return false;
  if(areas.some(a=>['pitch','water','parking','plaza','bleachers','construction'].includes(a.kind)&&insideArea(p,a)))return false;
  if(!placements?.paths&&environment.contextBuildings.some(a=>insideRing(p,a.rings[0])))return false;
  if(nearPath(p,r))return false;
  return clearOfTrees(p,r);
 }
 function tree(p,avenue=false,landcover='wood'){
  const r=avenue?1.9+rnd()*.35:landcover==='wood'?2.2+rnd()*.9:1.4+rnd()*.7;if(!free(p,r))return false;
  if(profile.rejectTree(p,avenue,landcover))return false;
  const h=avenue?6.2+rnd()*1.1:landcover==='wood'?7+rnd()*3:4.8+rnd()*1.8;treePoints.push({...p,radius:r,height:h,baseY:height(p.x,p.z),landcover:avenue?'avenue':landcover});indexTree(treePoints.at(-1));
  instance('natural-tree-trunks',trunk,wood,p.x,h*.34,p.z,1,h*.68,1);
  instance('natural-tree-crowns',crown,foliageA,p.x,h*.73,p.z,r*.80,h*.28,r*.80,rnd()*6);
  instance('varied-tree-crown-lobes',sphere,foliageB,p.x+r*.30,h*.75,p.z-r*.18,r*.62,h*.22,r*.65,rnd()*6);
  instance('varied-tree-crown-lobes',sphere,foliageB,p.x-r*.25,h*.82,p.z+r*.20,r*.55,h*.22,r*.62,rnd()*6);
  return true;
 }
 // Arc-length spacing keeps avenue rows steady through small map-node segments.
 for(const path of routes.filter(p=>p.id===profile.avenuePathId)){let carried=0;for(let i=1;i<path.points.length;i++){
  const a=path.points[i-1],b=path.points[i],len=distance(a,b),tx=(b.x-a.x)/(len||1),tz=(b.z-a.z)/(len||1);
  for(let d=carried;d<len;d+=4.8)for(const side of [-1,1]){const offset=path.width/2+3.2;tree({x:a.x+tx*d-tz*offset*side,z:a.z+tz*d+tx*offset*side},true);}
  carried=(carried-len)%4.8;if(carried<0)carried+=4.8;
 }}
 // Trees are sampled only from mapped woodland/park patches, never a uniform
 // campus-wide random scatter. The grass wedges of the main garden stay open.
 for(const area of areas.filter(a=>a.kind==='wood'||a.kind==='park')){
  const triangles=area.triangles.map(t=>{const weight=Math.abs((t[2]-t[0])*(t[5]-t[1])-(t[4]-t[0])*(t[3]-t[1]))/2;return{t,weight};}),total=triangles.reduce((n,t)=>n+t.weight,0);
  const attempts=Math.min(350,Math.ceil(total/(area.kind==='wood'?12:25)));
  for(let i=0;i<attempts&&treePoints.length<1250;i++){
   let choice=rnd()*total,triangle=triangles.at(-1);for(const candidate of triangles){choice-=candidate.weight;if(choice<=0){triangle=candidate;break;}}
   if(!triangle)continue;const t=triangle.t,u=Math.sqrt(rnd()),v=rnd();const p={x:t[0]*(1-u)+t[2]*u*(1-v)+t[4]*u*v,z:t[1]*(1-u)+t[3]*u*(1-v)+t[5]*u*v};
   if(insideArea(p,area))tree(p,false,area.kind);
  }
 }
 // Arc-length placement is independent of arbitrary map-node density.
 // Main avenue fixture type is photo-confirmed; individual coordinates are estimates.
 const furniturePads=[];
 function furnish(path,spacing,kind,start){let carry=start;
  for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],len=distance(a,b);if(len<1e-6)continue;
   const tx=(b.x-a.x)/len,tz=(b.z-a.z)/len;
   for(let d=carry;d<len;d+=spacing)for(const side of [-1,1]){
    const offset=path.width/2+(kind==='bench'?.40:.28),p={x:a.x+tx*d-tz*offset*side,z:a.z+tz*d+tx*offset*side};
    if(groundPointBlocked(p,obstacles,kind==='bench'?.78:.65)||treePoints.some(t=>distance(p,t)<t.radius+.25)||furniturePoints.some(f=>distance(p,f)<1.1))continue;
    if(areas.some(a=>['water','pitch','construction'].includes(a.kind)&&insideArea(p,a)))continue;
    const rotation=Math.atan2(-tz,tx)+(side<0?Math.PI:0);
    if(kind==='bench'){
     const c=Math.cos(rotation),sn=Math.sin(rotation),pad=[[-.62,-.73],[.62,-.73],[.62,.32],[-.62,.32]].map(([x,z])=>({x:p.x+c*x+sn*z,z:p.z-sn*x+c*z}));
     if(!pad.every((a,j)=>!groundSegmentBlocked(a,pad[(j+1)%4],obstacles,.03)))continue;
     furniturePads.push(pad);
    }
    furniturePoints.push({...p,kind,rotation,baseOffset:kind==='bench'?.052:0,style:path.id===profile.avenuePathId?profile.avenueFurnitureStyle:profile.furnitureStyle,basis:'photo-informed type; estimated arc-length placement',routeId:path.id});
   }
   carry=(carry-len)%spacing;if(carry<0)carry+=spacing;
  }
 }
 for(const path of routes){furnish(path,profile.lightSpacing(path),'light',5);furnish(path,16,'bench',9);}
 const padVertices=[];for(const polygon of furniturePads)appendTerrainSurface(terrain,polygon,padVertices,{offset:.050});
 if(padVertices.length){const g=geom(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(padVertices,3));g.computeVertexNormals();const pad=new THREE.Mesh(g,paving);pad.name='bench-deck-pads';pad.userData.surfaceOffset=.050;pad.receiveShadow=true;group.add(pad);}
 const plazaTiles=[],areaBuffers=new Map(),areaMaterials=new Map();let landcoverTriangles=0;
 const surfaceOffsets={park:.003,wood:.006,grass:.009,construction:.011,pitch:.014,parking:.016,bleachers:.018,plaza:.021,water:.024};
 const palette={wood:'#627354',park:'#859365',grass:'#97a175',parking:'#96978e',plaza:'#c6c0b2',water:'#729b9c',construction:'#a79b88',bleachers:'#b0ada2',pitch:'#81986d'};
 function surface(area,tri,depth=0){
  const pts=[{x:tri[0],z:tri[1]},{x:tri[2],z:tri[3]},{x:tri[4],z:tri[5]}],blocked=pts.some(p=>groundPointBlocked(p,obstacles,.03))||pts.some((p,i)=>groundSegmentBlocked(p,pts[(i+1)%3],obstacles,.03));
  const max=Math.max(...pts.map((p,i)=>distance(p,pts[(i+1)%3])));
  if(depth<6&&(max>12||blocked&&max>1.2)){
   const [a,b,c]=pts,m={x:(a.x+b.x)/2,z:(a.z+b.z)/2},n={x:(b.x+c.x)/2,z:(b.z+c.z)/2},q={x:(a.x+c.x)/2,z:(a.z+c.z)/2};
   for(const t of [[a,m,q],[m,b,n],[q,n,c],[m,n,q]])surface(area,t.flatMap(p=>[p.x,p.z]),depth+1);return;
  }if(blocked)return;
  if(!areaBuffers.has(area.kind))areaBuffers.set(area.kind,[]);const arr=areaBuffers.get(area.kind);
  // All land-cover fills share an upward orientation, with terrain-following corners.
  const signed=(pts[1].x-pts[0].x)*(pts[2].z-pts[0].z)-(pts[2].x-pts[0].x)*(pts[1].z-pts[0].z);
  landcoverTriangles+=appendTerrainSurface(terrain,signed>0?[pts[0],pts[2],pts[1]]:pts,arr,{offset:surfaceOffsets[area.kind]??.01});
  if(area.kind==='plaza')plazaTiles.push({x:(pts[0].x+pts[1].x+pts[2].x)/3,z:(pts[0].z+pts[1].z+pts[2].z)/3,mapped:true});
 }
 for(const area of areas.filter(a=>a.kind!=='water'))for(const tri of area.triangles)surface(area,tri);
 for(const [kind,vertices]of areaBuffers){const g=geom(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();const m=mat(palette[kind]??'#92957b',{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2-Object.keys(surfaceOffsets).indexOf(kind)});areaMaterials.set(kind,m);const mesh=new THREE.Mesh(g,m);mesh.receiveShadow=true;mesh.name=`mapped-landcover-${kind}`;mesh.userData.surfaceOffset=surfaceOffsets[kind]??.01;group.add(mesh);}
 // Low planting rows articulate the actual lawn edges and preserve open garden sightlines.
 const shrubPoints=[];for(const area of areas.filter(a=>a.kind==='grass'||a.kind==='park'))for(let i=1;i<area.rings[0].length&&shrubPoints.length<1500;i+=2){
  const a=area.rings[0][i-1],b=area.rings[0][i],len=distance(a,b);if(len<2)continue;
  for(let d=1;d<len;d+=1.5){const p={x:a.x+(b.x-a.x)*d/len,z:a.z+(b.z-a.z)*d/len};if(!free(p,.40))continue;
   shrubPoints.push({...p,radius:.4,baseY:height(p.x,p.z)});instance('rounded-low-planting-beds',sphere,foliageB,p.x,.25,p.z,.4,.33,.4,rnd()*6);
  }
 }
 // Curbs and shallow retaining edges are real small volume, not tall ground blocks.
 const padObstacles=furniturePoints.filter(p=>p.kind==='bench').map(p=>({x:p.x-Math.sin(p.rotation)*.205,z:p.z-Math.cos(p.rotation)*.205,w:1.24,d:1.05,rotation:p.rotation}));
 const edgePoints=[];for(const path of [...routes,...mappedRoutes.filter(p=>p.kind==='road'||p.kind==='service')])for(let i=1;i<path.points.length;i++){
  const a=path.points[i-1],b=path.points[i],len=distance(a,b);if(len<.3)continue;const tx=(b.x-a.x)/len,tz=(b.z-a.z)/len;
  for(const side of [-1,1]){const offset=path.width/2+.13,pa={x:a.x-tz*offset*side,z:a.z+tx*offset*side},pb={x:b.x-tz*offset*side,z:b.z+tx*offset*side};
   if(groundSegmentBlocked(pa,pb,obstacles,.13))continue;const count=Math.ceil(len/2);for(let k=0;k<count;k++){
    const t=(k+.5)/count,p={x:pa.x+(pb.x-pa.x)*t,z:pa.z+(pb.z-pa.z)*t};const half=len/count/2;
    if(groundSegmentBlocked({x:p.x-tx*half,z:p.z-tz*half},{x:p.x+tx*half,z:p.z+tz*half},padObstacles,.12))continue;
    edgePoints.push(p);instance('road-curb-stones',cube,paving,p.x,.06,p.z,len/count+.015,.12,.14,Math.atan2(-tz,tx));
   }
  }
 }
 // Retaining strips immediately outside flattened model platforms read the grade.
 let retainingEdges=0;for(const p of terrain.platforms){const c=Math.cos(p.rotation),s=Math.sin(p.rotation);
  for(const side of [-1,1])for(let k=0;k<Math.floor(p.w/2);k++){
   const x=(k+.5)*2-p.w/2,z=side*(p.d/2+.5),q={x:p.x+c*x+s*z,z:p.z-s*x+c*z},outside={x:q.x+s*side*6,z:q.z+c*side*6},drop=p.baseY-height(outside.x,outside.z);
   if(drop<.10||groundPointBlocked(q,obstacles,.15))continue;retainingEdges++;instance('estimated-low-retaining-walls',cube,paving,q.x,p.baseY-Math.min(drop,.7)/2,q.z,2,Math.min(drop,.7),.20,p.rotation,true);
  }
 }
 let stairTreads=0;for(const path of mappedRoutes.filter(p=>p.kind==='steps'))for(let i=1;i<path.points.length;i++){
  const a=path.points[i-1],b=path.points[i],len=distance(a,b),steps=Math.min(30,Math.ceil(len/.30));if(len<.2)continue;
  for(let k=0;k<steps;k++){const t=(k+.5)/steps,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};if(groundPointBlocked(p,obstacles,path.width/2))continue;stairTreads++;instance('mapped-stair-treads',cube,paving,p.x,.055,p.z,len/steps+.02,.11,path.width,Math.atan2(-(b.z-a.z),b.x-a.x));}
 }
 // Thin only the two rear woodland margins (north is negative Z). Keep the
 // avenue, planted parks and the central heritage corridor exactly as sampled.
 // Do this AFTER all landscape placement: removing a candidate earlier would
 // change collision rejection, RNG consumption, benches and shrub locations.
 const rearTrees=[],keepTrees=treePoints.map(t=>{
  if(profile.keepRearTree(t))return true;
  const spacing=7.5+5*Math.min(1,(-t.z-110)/100);
  if(rearTrees.some(other=>distance(t,other)<Math.max(spacing,other.spacing)))return false;
  rearTrees.push({...t,spacing});return true;
 });
 const treeThinning={before:treePoints.length,removed:keepTrees.filter(keep=>!keep).length,region:'north woodland margins: z < -110; x < -65 or x > 20',estimated:true};
 for(const [key,perTree]of [['natural-tree-trunks',1],['natural-tree-crowns',1],['varied-tree-crown-lobes',2]]){
  const batch=instances.get(key);if(batch)batch.records=batch.records.filter((_,index)=>keepTrees[Math.floor(index/perTree)]);
 }
 const retainedTrees=treePoints.filter((_,index)=>keepTrees[index]);treePoints.splice(0,treePoints.length,...retainedTrees);
 const dummy=new THREE.Object3D();
 for(const [key,{geometry,material,records}]of instances){
  const mesh=new THREE.InstancedMesh(geometry,material,records.length);mesh.name=key;mesh.castShadow=!key.includes('paving');mesh.receiveShadow=true;
  records.forEach((r,i)=>{dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(0,r.rotation,0);dummy.scale.set(r.sx,r.sy,r.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
 }
 // Thin soil strips stay inside mapped lawns, representing a trimmed turf edge.
 const soilVertices=[];
 for(const area of areas.filter(a=>a.kind==='grass')){const ring=area.rings[0];let signed=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];signed+=a.x*b.z-b.x*a.z;}
  for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],len=distance(a,b);if(len<.1||groundSegmentBlocked(a,b,obstacles,.10))continue;const nx=-(b.z-a.z)/len*Math.sign(signed)*.07,nz=(b.x-a.x)/len*Math.sign(signed)*.07;
   const polygon=[a,b,{x:b.x+nx,z:b.z+nz},{x:a.x+nx,z:a.z+nz}];if(polygon.some((p,j)=>groundSegmentBlocked(p,polygon[(j+1)%4],obstacles,.02)))continue;
   appendTerrainSurface(terrain,polygon,soilVertices,{offset:.011});
  }
 }
 if(soilVertices.length){const g=geom(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(soilVertices,3));g.computeVertexNormals();const soil=new THREE.Mesh(g,paving);soil.name='trimmed-lawn-soil-edges';soil.userData.surfaceOffset=.011;soil.receiveShadow=true;group.add(soil);}
 // Give broad lawns variation at metre scale; flowerbeds/woods keep their own colours.
 for(const object of group.children){
  if(!object.isMesh||object.isInstancedMesh)continue;
  if(object.name==='trimmed-lawn-soil-edges')finishes.apply(object,'soil');
  else if(object.name==='bench-deck-pads')finishes.apply(object,'deck');
  else if(object.name==='mapped-landcover-grass'||object.name==='mapped-landcover-park')finishes.apply(object,'grass');
  else if(object.name==='mapped-landcover-plaza')finishes.apply(object,'paving');
  else if(object.userData.pathKind)finishes.apply(object,['road','service'].includes(object.userData.pathKind)?'asphalt':'paving');
  else if(object.material===paving)finishes.apply(object,'paving');
 }
 const furniture=createCampusFurniture(THREE,{placements:furniturePoints,heightAt:height});
 const fountains=createCampusFountains(THREE,{areas:areas.filter(a=>a.kind==='water'),terrain,reducedMotion,identifiedIds:profile.fountainAreaIds});
 group.add(furniture.group,fountains.group);
 let drawCalls=0;group.traverse(o=>{if(o.isMesh)drawCalls++;});
 const stats={groundFinishes:finishes.stats,furniturePads:furniturePads.length,furniture:furniture.stats,fountains:fountains.stats,environment:environment.provenance,mappedPaths:mappedRoutes.length,mappedAreas:areas.length,clippedMappedSegments,landcoverTriangles,shrubs:shrubPoints.length,shrubPoints,stairTreads,retainingEdges,edgePoints,terrain:terrain.stats,scale:worldUnitsPerMeter,source:'Mapped pedestrian axes; model-bounds avoidance and all landscape details estimated',trees:treePoints.length,treeThinning,treePoints,furniturePoints,plazaTiles,routes,approaches,mappedRoutes,obstacles,failedRoutes,drawCalls,groundContinuous:true};
 return{group,bounds,playBounds,terrain,stats,update(time){if(!disposed)fountains.update(time);},dispose(){if(disposed)return;disposed=true;furniture.dispose();fountains.dispose();finishes.dispose();for(const o of group.children)if(o.isInstancedMesh)o.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();group.removeFromParent();group.clear();}};
}
