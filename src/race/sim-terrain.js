// 주행 계산의 지형 — 게임(브라우저)과 랭킹 서버가 같은 자료 · 같은 코드로 짓는다(2026-11-24 경주 랭킹 · 결정적 수학).
//   const { heightAt } = simTerrain();      heightAt(x, z) = 그 자리의 지형 높이(게임 좌표, m)
// 자료: ./terrain-data.js(바닥 bake 의 fingerprint entries — 도구/rank-build-data.mjs 가 server/data/terrain-entries.json 과 같이 쓴다).
//   그 전에는 브라우저가 3D 모델의 경계 상자로 지은 entries(src/world/campus.js)를 썼다 — 크롬에서는 같았지만 경계 상자를 three 의 행렬(Math.cos)로 구해 엔진마다 다를 수 있었다.
// 코드: bts/src/engine/terrain.js 의 estimatedHillRise · createCampusTerrain(heightGrids 가 없는 갈래 — 연세대)를 **그대로 옮기고** Math.cos · sin · hypot 만 결정적 수학(dmath)으로 바꿨다.
//   bts 의 파일은 고치지 않는다(자료만 복사해 쓰는 곳). 화면의 땅은 지금처럼 bts 의 것(campus.heightAt) — 둘의 차는 마지막 자리뿐(검증/sim-terrain.test.mjs 가 1e-9 m 안을 본다).
//   bts 의 지형 코드나 YONSEI.terrain 이 바뀌면 이 파일도 같이 고치고 TRIAL_VER 를 올린다(시험이 원본과 견준다).
import { sin, cos, hypot } from '../shared/dmath.js';
import { CAMPUS_HILLS } from '../../bts/src/campus-hills-data.js';
import { TERRAIN_DATA } from './terrain-data.js';

// YONSEI.terrain(bts/src/campuses/yonsei/index.js)의 baseHeight 한 줄 — 그 파일은 캠퍼스 모델 자료를 줄줄이 끌어와서 같은 값을 여기 둔다(server/lib/terrain.js 와 같음)
export const BASE_HEIGHT = (x, z) => Math.min(4.5, Math.max(0, (-z - 35) * .025));
export const entriesOf = rows => rows.map(([id, x, z, w, d, rotation, x0, y0, z0, x1, y1, z1]) => ({ id, x, z, w, d, rotation, worldBounds: { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } } }));

// ---- bts/src/engine/terrain.js 에서 옮긴 것(Math.cos · sin · hypot → dmath, 그 밖은 글자 그대로)
function estimatedHillRise(x,z,hills=[]){
 let rise=0;
 for(const hill of hills){
  const dx=hill.to.x-hill.from.x,dz=hill.to.z-hill.from.z,t=Math.max(0,Math.min(1,((x-hill.from.x)*dx+(z-hill.from.z)*dz)/(dx*dx+dz*dz)));
  const distance=hypot(x-hill.from.x-dx*t,z-hill.from.z-dz*t),u=Math.max(0,Math.min(1,(hill.outerRadius-distance)/(hill.outerRadius-hill.crestRadius)));
  rise+=hill.rise*u*u*(3-2*u);
 }
 return rise;
}
const FLAT = () => 0;
export function createSimTerrain(entries = [], { baseHeight = FLAT, hills = [], source = 'flat campus; no terrain profile', buildingBase = null, heightGrids = null, worldUnitsPerMeter = 1, exactHeightAt = null } = {}) {
 if(heightGrids)throw new Error('sim-terrain: heightGrids 캠퍼스는 아직 안 옮겼다');
 const platforms=entries.map(e=>{
  const b=e.worldBounds;
  const sized=Number.isFinite(e.w)&&Number.isFinite(e.d)&&e.w>0&&e.d>0;
  return {id:e.id,x:sized?e.x:(b.min.x+b.max.x)/2,z:sized?e.z:(b.min.z+b.max.z)/2,
   w:sized?e.w:b.max.x-b.min.x,d:sized?e.d:b.max.z-b.min.z,rotation:sized?(e.rotation||0):0,baseY:0};
 });
 const raw=(x,z)=>baseHeight(x,z)+estimatedHillRise(x,z,hills);
 // Same expression order as the former local()+edgeDistance pair, without allocating a point.
 function edgeDistance(x,z,p){const c=cos(p.rotation),s=sin(p.rotation),dx=x-p.x,dz=z-p.z;
  return hypot(Math.max(0,Math.abs(c*dx-s*dz)-p.w/2),Math.max(0,Math.abs(s*dx+c*dz)-p.d/2));}
 function corners(p){const c=cos(p.rotation),s=sin(p.rotation);return [-1,1].flatMap(a=>[-1,1].map(b=>({x:p.x+c*a*p.w/2+s*b*p.d/2,z:p.z-s*a*p.w/2+c*b*p.d/2})));}
 function overlap(a,b){const ac=corners(a),bc=corners(b);for(const p of [a,b])for(const v of [{x:cos(p.rotation),z:-sin(p.rotation)},{x:sin(p.rotation),z:cos(p.rotation)}]){
  const as=ac.map(q=>q.x*v.x+q.z*v.z),bs=bc.map(q=>q.x*v.x+q.z*v.z);
  if(Math.max(...as)<Math.min(...bs)-.03||Math.max(...bs)<Math.min(...as)-.03)return false;
 }return true;}
 // Pads with overlapping 3-world-unit transition collars share a terrace.
 // Otherwise a grid triangle crossing both can form a deep building-edge crack.
 const parent=platforms.map((_,i)=>i);function find(i){while(parent[i]!==i)i=parent[i];return i;}
 for(let i=0;i<platforms.length;i++)for(let j=0;j<i;j++)if(overlap({...platforms[i],w:platforms[i].w+6,d:platforms[i].d+6},{...platforms[j],w:platforms[j].w+6,d:platforms[j].d+6}))parent[find(i)]=find(j);
 const groups=new Map();platforms.forEach((p,i)=>{const key=find(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);});
 for(const group of groups.values()){const base=group.reduce((sum,p)=>sum+raw(p.x,p.z),0)/group.length;for(const p of group)p.baseY=base;}
 // Limit terrace-to-terrace rise across the available intervening ground.
 // This keeps a photographed hillside from becoming a vertical seam where
 // nearby building pads leave only a short approach between them.
 const terraces=[...groups.values()],links=[];
 for(let i=0;i<terraces.length;i++)for(let j=0;j<i;j++){
  let gap=Infinity;for(const a of terraces[i])for(const b of terraces[j]){for(const q of corners(a))gap=Math.min(gap,edgeDistance(q.x,q.z,b));for(const q of corners(b))gap=Math.min(gap,edgeDistance(q.x,q.z,a));}
  if(gap<40)links.push({a:terraces[i],b:terraces[j],maxRise:Math.max(.05,gap-6)*.26});
 }
 for(let iteration=0;iteration<24;iteration++)for(const {a,b,maxRise}of links){
  const delta=a[0].baseY-b[0].baseY,excess=Math.abs(delta)-maxRise;if(excess<=0)continue;
  const adjustment=Math.sign(delta)*excess/2;for(const p of a)p.baseY-=adjustment;for(const p of b)p.baseY+=adjustment;
 }
 if(buildingBase)for(const p of platforms)if(Number.isFinite(buildingBase[p.id]))p.baseY=buildingBase[p.id];
 const byId=new Map(platforms.map(p=>[p.id,p]));
 const step=2,extent=40;
 const all=platforms.flatMap(corners);
 const minX=Math.floor((all.length?Math.min(...all.map(p=>p.x))-extent:-40)/step)*step;
 const maxX=Math.ceil((all.length?Math.max(...all.map(p=>p.x))+extent:40)/step)*step;
 const minZ=Math.floor((all.length?Math.min(...all.map(p=>p.z))-extent:-40)/step)*step;
 const maxZ=Math.ceil((all.length?Math.max(...all.map(p=>p.z))+extent:40)/step)*step;
 const nx=Math.round((maxX-minX)/step)+1,nz=Math.round((maxZ-minZ)/step)+1,heights=new Float32Array(nx*nz);
 // Load-time acceleration only: per-platform cos/sin/half sizes are cached and a
 // coarse cell index lists the platforms whose footprint lies within 19 units of
 // the cell (every threshold below is <= 18). Skipped platforms could never pass
 // a threshold, and candidates keep their original order, so every sum, min and
 // first-match is evaluated with the same operands in the same order as before.
 const count=platforms.length,PX=new Float64Array(count),PZ=new Float64Array(count),PC=new Float64Array(count),PS=new Float64Array(count),PW=new Float64Array(count),PD=new Float64Array(count);
 const always=[];
 platforms.forEach((p,i)=>{PX[i]=p.x;PZ[i]=p.z;PC[i]=cos(p.rotation);PS[i]=sin(p.rotation);PW[i]=p.w/2;PD[i]=p.d/2;
  if(![PX[i],PZ[i],PC[i],PS[i],PW[i],PD[i]].every(Number.isFinite))always.push(i);});
 const allIndices=platforms.map((_,i)=>i),cellSize=8,reach=19;
 const cellMinX=minX-extent,cellMinZ=minZ-extent,ncx=Math.max(1,Math.ceil((maxX-minX+2*extent)/cellSize)),ncz=Math.max(1,Math.ceil((maxZ-minZ+2*extent)/cellSize));
 const cells=Array.from({length:ncx*ncz},()=>[]);
 for(let i=0;i<count;i++){
  if(always.includes(i)){for(const list of cells)list.push(i);continue;}
  const ex=Math.abs(PC[i])*PW[i]+Math.abs(PS[i])*PD[i]+reach,ez=Math.abs(PS[i])*PW[i]+Math.abs(PC[i])*PD[i]+reach;
  const cx0=Math.max(0,Math.floor((PX[i]-ex-cellMinX)/cellSize)-1),cx1=Math.min(ncx-1,Math.floor((PX[i]+ex-cellMinX)/cellSize)+1);
  const cz0=Math.max(0,Math.floor((PZ[i]-ez-cellMinZ)/cellSize)-1),cz1=Math.min(ncz-1,Math.floor((PZ[i]+ez-cellMinZ)/cellSize)+1);
  for(let cz=cz0;cz<=cz1;cz++)for(let cx=cx0;cx<=cx1;cx++)cells[cz*ncx+cx].push(i);
 }
 function candidates(x,z){
  const cx=Math.floor((x-cellMinX)/cellSize),cz=Math.floor((z-cellMinZ)/cellSize);
  return cx>=0&&cx<ncx&&cz>=0&&cz<ncz?cells[cz*ncx+cx]:allIndices;
 }
 function edgeAt(x,z,i){const c=PC[i],s=PS[i],dx=x-PX[i],dz=z-PZ[i];
  return hypot(Math.max(0,Math.abs(c*dx-s*dz)-PW[i]),Math.max(0,Math.abs(s*dx+c*dz)-PD[i]));}
 function sample(x,z){let value=raw(x,z),sum=0,weighted=0,strength=0;
  const near=candidates(x,z);
  // Blend every nearby terrace: choosing only the nearest creates sharp seams
  // halfway between adjacent platforms at different elevations.
  for(let k=0;k<near.length;k++){const p=platforms[near[k]],d=edgeAt(x,z,near[k]);if(d>=18)continue;
   const t=Math.max(0,Math.min(1,(18-d)/15)),blend=t*t*(3-2*t),weight=blend/Math.max(.25,d*d);
   weighted+=p.baseY*weight;sum+=weight;strength=Math.max(strength,blend);
  }
  if(sum)value=value*(1-strength)+(weighted/sum)*strength;
  // Every grid vertex whose cell could cross a platform is at/below it.
  // The explicit flat platform surface covers the footprint without buried slabs.
  for(let k=0;k<near.length;k++)if(edgeAt(x,z,near[k])<step*Math.SQRT2+.02)value=Math.min(value,platforms[near[k]].baseY);
  return value;
 }
 for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++)heights[iz*nx+ix]=sample(minX+ix*step,minZ+iz*step);
 function heightAt(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
  const near=candidates(x,z);for(let k=0;k<near.length;k++)if(edgeAt(x,z,near[k])<1e-7)return platforms[near[k]].baseY;
  const fx=(x-minX)/step,fz=(z-minZ)/step;
  if(fx<0||fz<0||fx>=nx-1||fz>=nz-1)return sample(x,z);
  const ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz,index=iz*nx+ix;
  const a=heights[index],b=heights[index+1],c=heights[index+nx],d=heights[index+nx+1];
  // Same diagonal and barycentric interpolation as the rendered terrain grid.
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
 }
 return {heightAt,buildingHeight(entry){return byId.get(entry.id)?.baseY??sample(entry.x,entry.z);},platforms,
  grid:{minX,maxX,minZ,maxZ,nx,nz,step,heights},stats:{source,hills, maxEstimatedRise:heights.reduce((max,height)=>Math.max(max,height),0),platforms:platforms.length,platformGroups:groups.size,gridVertices:heights.length}};
}

// 자료(rows = fingerprint entries) → 게임 좌표의 heightAt. 같은 rows 면 한 번만 짓는다.
let cached = null;
export function simTerrain(data = TERRAIN_DATA) {
  if (cached && cached.data === data) return cached;
  const W = data.worldUnitsPerMeter, M = 1 / W;
  const terrain = createSimTerrain(entriesOf(data.entries), { baseHeight: BASE_HEIGHT, hills: CAMPUS_HILLS, source: 'sim terrain (deterministic copy of YONSEI.terrain)' });
  const at = terrain.heightAt;
  cached = { data, terrain, heightAt: (x, z) => M * at(x * W, z * W) };
  return cached;
}
