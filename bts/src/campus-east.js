import {EAST_BUILDINGS} from './campus-east-data.js';
export {EAST_BUILDINGS};
// Newly photo-informed study models, not surveyed replicas. See reference/realism14.
export function createEastBuildingSource(THREE,id){
 const row=EAST_BUILDINGS.find(e=>e.id===id);if(!row)throw Error('Unknown east building '+id);
 const scene=new THREE.Group();scene.name=id+'-reference-source';const geometries=new Set(),materials=new Set();let disposed=false;
 const geo=g=>(geometries.add(g),g),mat=(name,color,roughness=.85,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});m.name=id+'_'+name;materials.add(m);return m;};
 const stone=mat('stone',id==='childFamily'?'#a2765f':'#aaa38f'),trim=mat('pale','#d4d1c5'),glass=mat('blueglass','#45626a',.24,.16),dark=mat('windowdark','#343d3c'),metal=mat('metal','#8e9691',.45,.55),roof=mat('roof','#666961'),leaf=mat('ivy','#526b38'),joint=mat('joint','#817e70');
 const cube=geo(new THREE.BoxGeometry(1,1,1)),cylinder=geo(new THREE.CylinderGeometry(1,1,1,32)),rod=geo(new THREE.CylinderGeometry(1,1,1,8));
 function mesh(g,m,name){const o=new THREE.Mesh(g,m);o.name=id+'-'+name;scene.add(o);return o;}
 function box(x,y,z,w,h,d,m=stone,name='wall',rotation=0){const o=mesh(cube,m,name);o.position.set(x,y,z);o.scale.set(w,h,d);o.rotation.y=rotation;return o;}
 function cyl(x,y,z,r,h,m=trim,name='drum'){const o=mesh(cylinder,m,name);o.position.set(x,y,z);o.scale.set(r,h,r);return o;}
 function bar(a,b,r,m=metal,name='support',parent=scene){const d=new THREE.Vector3().subVectors(b,a),o=new THREE.Mesh(rod,m);o.name=id+'-'+name;o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());o.scale.set(r,d.length(),r);parent.add(o);return o;}
 const w=row.w*2,d=row.d*2;
 function edgeWindows(a,b,height,spacing,rows=2){const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<3)return;const tx=dx/len,tz=dz/len,rotation=Math.atan2(-tz,tx),nx=-tz,nz=tx,count=Math.max(1,Math.floor(len/spacing));
  for(let f=0;f<rows;f++)for(let k=0;k<count;k++){const t=(k+.5)/count,x=a.x+dx*t,z=a.z+dz*t,y=1.6+f*height,ww=Math.min(1.6,len/count*.57),hh=id==='seongam'?2.1:1.55;
   box(x+nx*.055,y,z+nz*.055,ww+.22,hh+.23,.16,dark,'window-recess',rotation);
   box(x+nx*.15,y,z+nz*.15,ww,hh,.055,glass,'glazing',rotation);
   for(const sy of [-1,1])box(x+nx*.20,y+sy*hh/2,z+nz*.20,ww+.18,.10,.18,trim,'window-horizontal',rotation);
   for(const sx of [-1,0,1])box(x+tx*sx*ww/2+nx*.21,y,z+tz*sx*ww/2+nz*.21,.075,hh,.16,id==='childFamily'?metal:trim,'window-mullion',rotation);
   box(x+nx*.23,y-hh/2-.10,z+nz*.23,ww+.32,.14,.35,trim,'window-sill',rotation);
  }
 }
 if(id==='radioObservatory'){
  cyl(0,.18,0,5.6,.36,trim,'foundation');cyl(0,2.7,0,3.6,5.1,trim,'base');
  const con=mesh(geo(new THREE.CylinderGeometry(2.0,3.9,2.0,32)),trim,'conical-base');con.position.y=6.1;
  cyl(0,9.2,0,1.8,4.4,trim,'azimuth-column');box(0,10.7,0,9.5,1.6,5.8,trim,'rotating-platform');
  for(const x of [-3.8,3.8]){box(x,13.1,0,1.5,4.8,2.8,trim,'elevation-yoke');bar(new THREE.Vector3(x,11,-2.4),new THREE.Vector3(x,15,0),.16,metal);}
  // 21 m dish diameter is confirmed by KASI; mount dimensions and pointing are estimated.
  const dish=new THREE.Group();dish.name=id+'-dish';dish.position.y=16.5;dish.rotation.x=.43;scene.add(dish);
  const pos=[],uv=[],ix=[],rings=9,sectors=48,R=10.5;
  for(let j=0;j<=rings;j++)for(let k=0;k<=sectors;k++){const r=R*j/rings,a=k/sectors*Math.PI*2;pos.push(r*Math.cos(a),r*r/(4*6.78),r*Math.sin(a));uv.push(k/sectors,j/rings);}
  for(let j=0;j<rings;j++)for(let k=0;k<sectors;k++){const a=j*(sectors+1)+k,b=a+sectors+1;ix.push(a,b,a+1,a+1,b,b+1);}
  const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();const reflector=new THREE.Mesh(g,trim);reflector.name=id+'-21m-reflector';reflector.material.side=THREE.DoubleSide;dish.add(reflector);
  for(let j=1;j<=8;j++){const r=R*j/8;for(let k=0;k<48;k++){const a=k/48*Math.PI*2,b=(k+1)/48*Math.PI*2;bar(new THREE.Vector3(r*Math.cos(a),r*r/(4*6.78)+.015,r*Math.sin(a)),new THREE.Vector3(r*Math.cos(b),r*r/(4*6.78)+.015,r*Math.sin(b)),.018,joint,'panel-ring',dish);}}
  for(let k=0;k<24;k++){const a=k/24*Math.PI*2;for(let j=1;j<9;j++){const r=R*j/9,s=R*(j+1)/9;bar(new THREE.Vector3(r*Math.cos(a),r*r/(4*6.78),r*Math.sin(a)),new THREE.Vector3(s*Math.cos(a),s*s/(4*6.78),s*Math.sin(a)),.02,joint,'panel-seam',dish);}}
  for(let k=0;k<4;k++){const a=k*Math.PI/2+.7;bar(new THREE.Vector3(9.2*Math.cos(a),3.2,9.2*Math.sin(a)),new THREE.Vector3(0,8.2,0),.10,metal,'feed-leg',dish);}
  const sub=new THREE.Mesh(geo(new THREE.CylinderGeometry(1.0,.65,.25,20)),trim);sub.position.y=8.2;dish.add(sub);
  for(const z of [-3.0,3.0]){bar(new THREE.Vector3(-4.7,12,z),new THREE.Vector3(4.7,12,z),.055);for(let x=-4.5;x<=4.5;x+=1.5)bar(new THREE.Vector3(x,11.1,z),new THREE.Vector3(x,12,z),.04);}
  box(0,1.25,3.62,1.2,2.2,.12,dark,'service-door');
 }else if(id==='seongam'){
  const bw=w-1.2,bd=d-1.4;
  box(0,.20,0,bw+.5,.4,bd+.5,trim,'plinth');box(0,4.4,0,bw,8.4,bd,stone,'main-stone');
  // Roof planes have a low ridge and a higher flat central entrance bay.

  const rp=[],ri=[];for(const xa of [-bw/2,bw/2])for(const p of [[-bd/2,8.65],[0,10.75],[bd/2,8.65]])rp.push(xa,p[1],p[0]);ri.push(0,3,1,1,3,4,1,4,2,2,4,5,0,1,2,5,4,3);const rg=geo(new THREE.BufferGeometry());rg.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));rg.setIndex(ri);rg.computeVertexNormals();mesh(rg,roof,'slate-gabled-roof');
  box(0,5.3,bd/2+.17,6.4,10.2,.55,stone,'central-entry-bay');box(0,10.45,bd/2+.2,6.8,.30,.75,trim,'central-coping');
  for(const sign of [-1,1])edgeWindows({x:-sign*bw/2,z:sign*bd/2},{x:sign*bw/2,z:sign*bd/2},3.4,3.2,2);
  edgeWindows({x:-bw/2,z:bd/2},{x:-bw/2,z:-bd/2},3.4,3.2,2);edgeWindows({x:bw/2,z:-bd/2},{x:bw/2,z:bd/2},3.4,3.2,2);
  box(0,1.55,bd/2+.53,2.4,3.1,.16,dark,'entry-door');for(const x of [-1.42,1.42])box(x,1.65,bd/2+.62,.28,3.3,.40,trim,'portal-jamb');
  for(const sign of [-1,1])bar(new THREE.Vector3(sign*1.42,3.3,bd/2+.65),new THREE.Vector3(0,4.2,bd/2+.65),.18,trim,'pointed-portal');
  for(let i=0;i<3;i++)box(0,.08+i*.10,bd/2+.7+(2-i)*.24,3.4,.16,.8,trim,'entry-step');
  for(let k=0;k<46;k++){const x=-bw/2+.45+(k%16)*bw/16,y=1+Math.floor(k/16)*2.55;if(Math.abs(x)<2.1)continue;box(x,y,bd/2+.12,.34+(k%3)*.13,1.8+(k%4)*.2,.09,leaf,'ivy-growth');}
 }else{
  // Original unclipped map polygon preserves the bent wings and curved entry zone.
  const shape=new THREE.Shape();row.footprint.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));shape.closePath();
  const g=geo(new THREE.ExtrudeGeometry(shape,{depth:7.7,bevelEnabled:false,steps:1}));g.rotateX(-Math.PI/2);const body=mesh(g,stone,'brick-wings');
  const roofg=geo(new THREE.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:false,steps:1}));roofg.rotateX(-Math.PI/2);const r=mesh(roofg,roof,'flat-roof');r.position.y=7.7;
  let signed=0;for(let i=0;i<row.footprint.length;i++){const a=row.footprint[i],b=row.footprint[(i+1)%row.footprint.length];signed+=a.x*b.z-b.x*a.z;}
  for(let i=0;i<row.footprint.length;i++){let a=row.footprint[i],b=row.footprint[(i+1)%row.footprint.length];if(signed>0)[a,b]=[b,a];edgeWindows(a,b,3.4,3.1,2);const len=Math.hypot(b.x-a.x,b.z-a.z),angle=Math.atan2(-(b.z-a.z),b.x-a.x);box((a.x+b.x)/2,7.7,(a.z+b.z)/2,len,.18,.24,trim,'coping',angle);}
  // Front porch position is estimated from the official facade photo, within the footprint.
  const edge=row.footprint.reduce((b,p)=>p.z>b.z?p:b,row.footprint[0]);box(edge.x,2.3,edge.z+.14,3.1,4.3,.18,glass,'entrance');for(const sx of [-1,0,1])box(edge.x+sx*1.55,2.3,edge.z+.25,.09,4.3,.12,metal,'entrance-frame');box(edge.x,4.5,edge.z+.22,4.0,.18,1.6,metal,'entrance-canopy');
  // Thin horizontal brick courses make the low red-brick wings readable in close views.
  for(let y=.3;y<7.6;y+=.34)for(let i=0;i<row.footprint.length;i++){const a=row.footprint[i],b=row.footprint[(i+1)%row.footprint.length],len=Math.hypot(b.x-a.x,b.z-a.z);box((a.x+b.x)/2,y,(a.z+b.z)/2,len,.018,.025,joint,'brick-course',Math.atan2(-(b.z-a.z),b.x-a.x));}
 }
 scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(scene),offset=bounds.getCenter(new THREE.Vector3());offset.y=bounds.min.y;
 for(const child of scene.children)child.position.sub(offset);scene.updateMatrixWorld(true);
 let triangles=0;scene.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
 return{scene,stats:{id,triangles,materials:materials.size,accuracy:'photo-informed estimate; hidden facades and dimensions unmeasured'},dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}};
}
