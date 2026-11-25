// Map footprints: Yonsei campusmap / © OpenStreetMap contributors, ODbL.
// Only area-35 is identified as the Baekyangro fountain. The other mapped waters
// remain passive. Rim section, nozzle layout and hydraulic heights are estimates,
// not measured drawings. Photo evidence does not establish today's operating mode.
export const FOUNTAIN_EVIDENCE = Object.freeze({
 map:'https://campusmap.yonsei.ac.kr/',
 photo:'https://admission.yonsei.ac.kr/seoul/upload/info/20170403164346gyraay.pdf',
 identity:'https://giving.yonsei.ac.kr/fro_end/html/dep_01/1500.php?bbs_idx=1299&bbsid=notice&mode=modify',
 photoPage:28, photoVerification:'page-render-reviewed',
 note:'Observed: circular shallow basin, raised central cylindrical collar and central vertical plume. Nozzle count, collar dimensions, stone section and jet heights estimated.'
});

export function createCampusFountains(THREE,{areas=[],terrain,reducedMotion=false,identifiedIds=['area-35']}={}) {
 const group=new THREE.Group();group.name='campus-fountains';
 const stats={waters:[],drawCalls:0,instances:0,reducedMotion:!!reducedMotion,evidence:FOUNTAIN_EVIDENCE};
 const ownedGeometry=new Set(),ownedMaterial=new Set(),instances=[];
 const h=(x,z)=>terrain?.heightAt?.(x,z)??0;
 const material=(color,options={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.75,...options});ownedMaterial.add(m);return m;};
 const stone=material(0x8a8980),cap=material(0xb2b0a3),water=material(0x397e87,{roughness:.18,metalness:.28}),
  collar=material(0xa4bab1,{roughness:.32}),dark=material(0x3c514f),metal=material(0x747c7a,{metalness:.75,roughness:.3}),
  spray=material(0xb9e2e8,{roughness:.2,metalness:.05,transparent:true,opacity:.67,depthWrite:false}),
  ripple=material(0xb2dbdb,{transparent:true,opacity:.30,depthWrite:false,roughness:.3});
 const buffers={water:[],stone:[],cap:[],line:[],collar:[]};
 function tri(out,a,b,c){const up=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);if(up<0)[b,c]=[c,b];for(const p of [a,b,c])out.push(p.x,p.y,p.z);}
 function quad(out,a,b,c,d){for(const p of [a,b,c,a,c,d])out.push(p.x,p.y,p.z);}
 function centroid(ring){let x=0,z=0,sum=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],v=a.x*b.z-b.x*a.z;sum+=v;x+=(a.x+b.x)*v;z+=(a.z+b.z)*v;}return Math.abs(sum)>1e-9?{x:x/(3*sum),z:z/(3*sum)}:{x:ring[0].x,z:ring[0].z};}
 const jets=[],nozzles=[],ripples=[];
 for(const area of areas.filter(a=>a.kind==='water')) {
  const ring=area.rings?.[0];if(!ring||ring.length<3||!area.triangles?.length)continue;
  const center=centroid(ring),radius=Math.min(...ring.map(p=>Math.hypot(p.x-center.x,p.z-center.z))),enabled=identifiedIds.includes(area.id);
  // A water surface is horizontal; the retaining edge closes down to the terrain.
  const baseY=Math.max(...ring.map(p=>h(p.x,p.z)))+.055,top=baseY+(enabled?.24:.09),width=enabled?.28:.11;
  const info={id:area.id,center,radius,baseY,jetsEnabled:enabled,kind:enabled?'identified-fountain':'unidentified-passive-water',
   source:area.source,estimated:['rim cross-section','water level',...(enabled?['nozzle count and layout','jet heights and operation']:[])]};stats.waters.push(info);
  for(const t of area.triangles)tri(buffers.water,{x:t[0],z:t[1],y:baseY},{x:t[2],z:t[3],y:baseY},{x:t[4],z:t[5],y:baseY});
  // Segment caps stay on the water side of the mapped boundary. Small joints make
  // the stone courses legible without producing individual scene objects.
  let signed=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];signed+=a.x*b.z-b.x*a.z;}
  for(let i=0;i<ring.length;i++) {
   const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<1e-6)continue;
   const nx=-dz/len*Math.sign(signed),nz=dx/len*Math.sign(signed),n=Math.max(1,Math.ceil(len/.62));
   for(let j=0;j<n;j++) {
    const gap=.007/len,t0=j/n+gap,t1=(j+1)/n-gap;if(t1<=t0)continue;
    const p=(t,inset,y)=>({x:a.x+dx*t+nx*inset,z:a.z+dz*t+nz*inset,y});
    const a0=p(t0,.014,top),b0=p(t1,.014,top),b1=p(t1,width,top),a1=p(t0,width,top);
    tri(buffers.cap,a0,b0,b1);tri(buffers.cap,a0,b1,a1);
    // DoubleSide handles each inner/outer strip's opposite orientation.
    quad(buffers.stone,p(t0,.014,h(a0.x,a0.z)-.02),p(t1,.014,h(b0.x,b0.z)-.02),b0,a0);
    quad(buffers.stone,p(t0,width,baseY-.025),a1,b1,p(t1,width,baseY-.025));
    quad(buffers.line,p(t0,width+.002,baseY+.003),p(t1,width+.002,baseY+.003),p(t1,width+.002,baseY+.034),p(t0,width+.002,baseY+.034));
   }
  }
  if(enabled) {
   // Official 2018 campus photograph, p28: a raised cylindrical central
   // collar and concentrated upright plume. Do not invent outer-ring arches.
   const collarRadius=radius*.255,collarTop=baseY+.72,innerWater=collarTop-.105;
   for(let i=0;i<64;i++){
    const a=i*Math.PI/32,b=(i+1)*Math.PI/32;
    const p=(angle,r,y)=>({x:center.x+Math.cos(angle)*r,z:center.z+Math.sin(angle)*r,y});
    quad(buffers.collar,p(a,collarRadius,baseY),p(b,collarRadius,baseY),p(b,collarRadius,collarTop),p(a,collarRadius,collarTop));
    quad(buffers.collar,p(a,collarRadius-.045,innerWater),p(a,collarRadius-.045,collarTop),p(b,collarRadius-.045,collarTop),p(b,collarRadius-.045,innerWater));
    tri(buffers.cap,p(a,collarRadius,collarTop),p(b,collarRadius,collarTop),p(b,collarRadius-.045,collarTop));
    tri(buffers.cap,p(a,collarRadius,collarTop),p(b,collarRadius-.045,collarTop),p(a,collarRadius-.045,collarTop));
    tri(buffers.water,{...center,y:innerWater},p(a,collarRadius-.045,innerWater),p(b,collarRadius-.045,innerWater));
   }
   info.centralCollar={radius:collarRadius,height:.72,innerWater};
   for(let i=0;i<9;i++){const a=i*Math.PI*2/9,cs=Math.cos(a),sn=Math.sin(a);
    jets.push({id:area.id,x:center.x+cs*.17,z:center.z+sn*.17,dx:cs*.51,dz:sn*.51,y:innerWater+.095,height:2.0+.23*Math.cos(i*2.4),phase:i*.9});
   }
   for(const j of jets.filter(j=>j.id===area.id)){nozzles.push({x:j.x,y:j.y-.06,z:j.z});ripples.push({x:j.x+j.dx,y:j.y-.086,z:j.z+j.dz,phase:j.phase});}
   for(let i=0;i<4;i++){const a=i*Math.PI/2;ripples.push({x:center.x+Math.cos(a)*radius*.60,z:center.z+Math.sin(a)*radius*.60,y:baseY+.009,phase:i*.72,passive:true});}
  }else ripples.push({x:center.x,y:baseY+.009,z:center.z,phase:0,passive:true});
 }
 for(const [name,mat] of [['water',water],['stone',stone],['cap',cap],['line',dark],['collar',collar]]) {
  if(!buffers[name].length)continue;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(buffers[name],3));geometry.computeVertexNormals();geometry.computeBoundingSphere();ownedGeometry.add(geometry);
  if(name==='stone'||name==='line'||name==='collar')mat.side=THREE.DoubleSide;
  const mesh=new THREE.Mesh(geometry,mat);mesh.name='fountain-'+name;mesh.receiveShadow=name!=='water';mesh.castShadow=name==='stone';group.add(mesh);
 }
 const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
 function instanced(name,geometry,mat,count,dynamic=false){ownedGeometry.add(geometry);if(!count)return null;
  const mesh=new THREE.InstancedMesh(geometry,mat,count);mesh.name=name;mesh.frustumCulled=false;
  if(dynamic)mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);instances.push(mesh);stats.instances+=count;return mesh;
 }
 function set(mesh,i,x,y,z,sx,sy,sz){dummy.position.set(x,y,z);dummy.rotation.set(0,0,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
 const nozzleMesh=instanced('fountain-nozzles',new THREE.CylinderGeometry(1,1,1,8),metal,nozzles.length);
 nozzles.forEach((p,i)=>set(nozzleMesh,i,p.x,p.y,p.z,.055,.10,.055));
 const segments=14,dropsPerJet=3;
 const jetMesh=instanced('fountain-water-arcs',new THREE.CylinderGeometry(1,1,1,6,1,true),spray,jets.length*segments,true);
 const dropMesh=instanced('fountain-droplets',new THREE.IcosahedronGeometry(1,0),spray,jets.length*dropsPerJet,true);
 const rippleMesh=instanced('fountain-ripples',new THREE.TorusGeometry(1,.016,3,28),ripple,ripples.length*2,true);
 let disposed=false;
 function curve(j,t,time){const pulse=reducedMotion?1:1+.035*Math.sin(time*1.45+j.phase);return {x:j.x+j.dx*t,z:j.z+j.dz*t,y:j.y+4*j.height*pulse*t*(1-t)-.088*t};}
 function animate(time){
  if(disposed)return;time=Number.isFinite(time)?Math.max(0,time):0;
  for(let i=0;i<jets.length;i++){
   const j=jets[i];for(let k=0;k<segments;k++){
    const a=curve(j,k/segments,time),b=curve(j,(k+1)/segments,time);
    direction.set(b.x-a.x,b.y-a.y,b.z-a.z);const length=direction.length();
    dummy.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);dummy.quaternion.setFromUnitVectors(up,direction.normalize());
    const width=.026*(1-.30*k/segments);dummy.scale.set(width,length+.006,width);dummy.updateMatrix();jetMesh.setMatrixAt(i*segments+k,dummy.matrix);
   }
   for(let k=0;k<dropsPerJet;k++){const t=((reducedMotion?0:time*.64)+k/dropsPerJet+j.phase*.17)%1,p=curve(j,t,time),r=.033+.014*Math.sin(t*Math.PI);set(dropMesh,i*dropsPerJet+k,p.x,p.y+.02,p.z,r,r*1.8,r);}
  }
  ripples.forEach((p,i)=>{for(let k=0;k<2;k++){
   const t=((reducedMotion?0:time*(p.passive?.16:.50))+k*.5+p.phase*.13)%1,r=(p.passive?.12:.09)+t*(p.passive?.20:.29);
   dummy.position.set(p.x,p.y+k*.001,p.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(r,r,Math.max(.05,1-t));dummy.updateMatrix();rippleMesh.setMatrixAt(i*2+k,dummy.matrix);
  }});
  for(const mesh of [jetMesh,dropMesh,rippleMesh])if(mesh)mesh.instanceMatrix.needsUpdate=true;
 }
 animate(0);group.updateMatrixWorld(true);stats.drawCalls=group.children.length;
 stats.nozzles=nozzles.length;stats.jetSegments=jets.length*segments;stats.droplets=jets.length*dropsPerJet;
 // Plain source-space positions allow independent footprint/building-clearance checks.
 stats.jetFootprints=jets.map(j=>({id:j.id,start:{x:j.x,z:j.z},end:{x:j.x+j.dx,z:j.z+j.dz}}));
 group.userData.fountains=stats;
 return {group,stats,update(time){if(!reducedMotion)animate(time);},dispose(){if(disposed)return;disposed=true;
  for(const mesh of instances)mesh.dispose();for(const g of ownedGeometry)g.dispose();for(const m of ownedMaterial)m.dispose();group.removeFromParent();group.clear();
 }};
}
