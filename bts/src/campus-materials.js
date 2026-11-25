// Runtime finishes only. Approved source materials and all geometry stay intact.
// These synthetic surface textures/reflections are not photographic reconstructions.
export function createCampusMaterials(THREE) {
  const owned = new Set(); let disposed = false;
  function detail(name, base, spread, repeat) {
    const size=128,data=new Uint8Array(size*size*4);let seed=731;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const grain=(seed/4294967296-.5)*spread;
      const cloud=Math.sin(x*.19)*Math.sin(y*.17)*spread*.12;
      const value=Math.max(0,Math.min(255,Math.round(base+grain+cloud))),i=(y*size+x)*4;
      data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
    }
    const t=new THREE.DataTexture(data,size,size);t.name=name;t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;
    t.repeat.set(repeat,repeat);t.needsUpdate=true;owned.add(t);return t;
  }
  const grain=detail('fine-mineral-grain',128,70,6),rough=detail('mineral-roughness',237,28,4);
  const roof=detail('roof-fine-weathering',128,42,5);
  // Low resolution, seamless analytic sky/ground directions. No live scene capture.
  const faces=[],size=32;
  for(let face=0;face<6;face++){
    const data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=2*(x+.5)/size-1,v=2*(y+.5)/size-1;
      const d=[[1,-v,-u],[-1,-v,u],[u,1,v],[u,-1,-v],[u,-v,1],[-u,-v,-1]][face];
      const len=Math.hypot(...d),h=d[1]/len,angle=Math.atan2(d[2],d[0]);
      const horizon=.015+.025*Math.sin(angle*11)+.015*Math.sin(angle*23);
      const t=Math.max(0,Math.min(1,(h-horizon+.025)/.07));
      const sky=[.43,.59,.70].map((c,i)=>c+(.87-c)*(1-Math.max(0,h))*.68);
      const ground=[.19,.24,.16],i=(y*size+x)*4;
      for(let k=0;k<3;k++)data[i+k]=Math.round(255*(ground[k]*(1-t)+sky[k]*t));data[i+3]=255;
    }
    const f=new THREE.DataTexture(data,size,size);owned.add(f);faces.push(f);
  }
  const environment=new THREE.CubeTexture(faces);environment.name='estimated-campus-daylight';environment.colorSpace=THREE.SRGBColorSpace;environment.needsUpdate=true;owned.add(environment);
  const stats={materials:0,masonry:0,glass:0,roof:0,textures:owned.size};
  function apply(material){
    if(disposed||!material?.isMeshStandardMaterial||material.userData.campusFinish)return;
    const name=material.name.toLowerCase();let finish;
    if(/glass/.test(name)){
      finish='glass';material.roughness=Math.min(material.roughness,.23);
      material.envMap=environment;material.envMapIntensity=.65;
    }else if(/stone|concrete|limestone|coping|pale|plaster|render|stucco/.test(name)&&!/joint/.test(name)){
      finish='masonry';
      if(!material.normalMap&&!material.bumpMap){material.bumpMap=grain;material.bumpScale=.018;}
      if(!material.roughnessMap)material.roughnessMap=rough;
    }else if(/roof|slate/.test(name)){
      finish='roof';if(!material.normalMap&&!material.bumpMap){material.bumpMap=roof;material.bumpScale=.012;}
      if(!material.roughnessMap)material.roughnessMap=rough;
    }
    if(finish){material.userData.campusFinish=finish;material.needsUpdate=true;stats.materials++;stats[finish]++;}
  }
  return {apply,stats,textures:owned,dispose(){if(disposed)return;disposed=true;for(const t of owned)t.dispose();owned.clear();}};
}
