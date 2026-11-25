
// Estimated northward grade plus connected hills, NOT measured elevations or a DEM.
// Buildings share flat platforms; model geometry and common scale stay intact.
// Smoothstep ridge/hill rise summed over a campus package's `hills` list.
export function estimatedHillRise(x,z,hills=[]){
 let rise=0;
 for(const hill of hills){
  const dx=hill.to.x-hill.from.x,dz=hill.to.z-hill.from.z,t=Math.max(0,Math.min(1,((x-hill.from.x)*dx+(z-hill.from.z)*dz)/(dx*dx+dz*dz)));
  const distance=Math.hypot(x-hill.from.x-dx*t,z-hill.from.z-dz*t),u=Math.max(0,Math.min(1,(hill.outerRadius-distance)/(hill.outerRadius-hill.crestRadius)));
  rise+=hill.rise*u*u*(3-2*u);
 }
 return rise;
}
const FLAT = () => 0;
// Campus profile: baseHeight(x,z) grade plus hills (campus package `terrain`); flat when absent.
// buildingBase (optional): id → pad height in world units from a surveyed/estimated entrance level; it
// replaces the averaged terrace height for that building (campuses without it are unaffected).
// heightGrids (optional, campuses whose ground is baked from a pilot preview, e.g. src/campuses/hanyang): the finished
// display ground as metre grids (cm Int16, finest first). Then no engine pads are made at all - the grids already hold the
// real-outline pads, forecourts and bowls - and buildings stand at buildingBase. Campuses without it never reach this path.
export function createCampusTerrain(entries = [], { baseHeight = FLAT, hills = [], source = 'flat campus; no terrain profile', buildingBase = null, heightGrids = null, worldUnitsPerMeter = 1, exactHeightAt = null } = {}) {
 if(heightGrids)return createGridTerrain(entries,{heightGrids,buildingBase,source,worldUnitsPerMeter,exactHeightAt});
 const platforms=entries.map(e=>{
  const b=e.worldBounds;
  const sized=Number.isFinite(e.w)&&Number.isFinite(e.d)&&e.w>0&&e.d>0;
  return {id:e.id,x:sized?e.x:(b.min.x+b.max.x)/2,z:sized?e.z:(b.min.z+b.max.z)/2,
   w:sized?e.w:b.max.x-b.min.x,d:sized?e.d:b.max.z-b.min.z,rotation:sized?(e.rotation||0):0,baseY:0};
 });
 const raw=(x,z)=>baseHeight(x,z)+estimatedHillRise(x,z,hills);
 // Same expression order as the former local()+edgeDistance pair, without allocating a point.
 function edgeDistance(x,z,p){const c=Math.cos(p.rotation),s=Math.sin(p.rotation),dx=x-p.x,dz=z-p.z;
  return Math.hypot(Math.max(0,Math.abs(c*dx-s*dz)-p.w/2),Math.max(0,Math.abs(s*dx+c*dz)-p.d/2));}
 function corners(p){const c=Math.cos(p.rotation),s=Math.sin(p.rotation);return [-1,1].flatMap(a=>[-1,1].map(b=>({x:p.x+c*a*p.w/2+s*b*p.d/2,z:p.z-s*a*p.w/2+c*b*p.d/2})));}
 function overlap(a,b){const ac=corners(a),bc=corners(b);for(const p of [a,b])for(const v of [{x:Math.cos(p.rotation),z:-Math.sin(p.rotation)},{x:Math.sin(p.rotation),z:Math.cos(p.rotation)}]){
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
 platforms.forEach((p,i)=>{PX[i]=p.x;PZ[i]=p.z;PC[i]=Math.cos(p.rotation);PS[i]=Math.sin(p.rotation);PW[i]=p.w/2;PD[i]=p.d/2;
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
  return Math.hypot(Math.max(0,Math.abs(c*dx-s*dz)-PW[i]),Math.max(0,Math.abs(s*dx+c*dz)-PD[i]));}
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

function decodeCentimetres(b64,n){
 let bytes;
 if(typeof atob==='function'){const bin=atob(b64);bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);}
 else bytes=new Uint8Array(Buffer.from(b64,'base64'));
 const cm=new Int16Array(bytes.buffer,bytes.byteOffset,n),out=new Float32Array(n);for(let i=0;i<n;i++)out[i]=cm[i]/100;return out;
}
// Grid terrain: grid {minE (x of column 0, metres), minZ (z of row 0, metres, z = -north), step, nx, nz, centimetresBase64}.
// Triangles split along (i+1,j)-(i,j+1), the diagonal the baked ground mesh uses.
export function createGridTerrain(entries,{heightGrids,buildingBase=null,source='baked campus ground',worldUnitsPerMeter=1,exactHeightAt=null}){
 const W=worldUnitsPerMeter,grids=heightGrids.map(g=>({...g,H:decodeCentimetres(g.centimetresBase64,g.nx*g.nz),maxE:g.minE+(g.nx-1)*g.step,maxZ:g.minZ+(g.nz-1)*g.step}));
 function metres(e,z){
  for(const g of grids){if(e<g.minE||e>g.maxE||z<g.minZ||z>g.maxZ)continue;
   const fx=Math.min(g.nx-1.000001,(e-g.minE)/g.step),fz=Math.min(g.nz-1.000001,(z-g.minZ)/g.step),i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,k=j*g.nx+i;
   const a=g.H[k],b=g.H[k+1],c=g.H[k+g.nx],d=g.H[k+g.nx+1];
   return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);}
  const g=grids.at(-1),ce=Math.max(g.minE,Math.min(g.maxE,e)),cz=Math.max(g.minZ,Math.min(g.maxZ,z));
  return ce===e&&cz===z?0:metres(ce,cz);
 }
 // Optional campus-local exact surface lookup is in E/N metres. Null,
 // undefined and non-finite results fall back to the existing grid unchanged.
 const heightAt=(x,z)=>{if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
  if(typeof exactHeightAt==='function'){const precise=exactHeightAt(x/W,-z/W);if(Number.isFinite(precise))return precise*W;}
  return metres(x/W,z/W)*W;};
 // The coarsest grid in world units: scorch proxy and nuke bounds (same fields as the platform terrain grid).
 const G=grids.at(-1),heights=Float32Array.from(G.H,h=>h*W);
 const grid={minX:G.minE*W,maxX:G.maxE*W,minZ:G.minZ*W,maxZ:G.maxZ*W,nx:G.nx,nz:G.nz,step:G.step*W,heights};
 return {heightAt,buildingHeight(entry){const v=buildingBase?.[entry.id];return Number.isFinite(v)?v:heightAt(entry.x,entry.z);},platforms:[],grid,
  stats:{source,baked:true,grids:grids.map(g=>({step:g.step,nx:g.nx,nz:g.nz})),platforms:0,platformGroups:0,gridVertices:grids.reduce((n,g)=>n+g.H.length,0),maxEstimatedRise:heights.reduce((m,h)=>Math.max(m,h),-Infinity)}};
}
