// Deterministic, synthetic textures informed by campus photographs; not photo scans.
// UVs are world X/Z in metres (.5 world units = 1 m), consistent across meshes.
const hash=(x,y)=>{let h=Math.imul(x+91,374761393)^Math.imul(y+117,668265263);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;};
const noise=(x,y)=>{const a=Math.floor(x),b=Math.floor(y),u=x-a,v=y-b,s=u*u*(3-2*u),t=v*v*(3-2*v);return(hash(a,b)*(1-s)+hash(a+1,b)*s)*(1-t)+(hash(a,b+1)*(1-s)+hash(a+1,b+1)*s)*t;};
const definitions={grass:{period:8,roughness:.98,bump:.012},paving:{period:2.4,roughness:.9,bump:.006},soil:{period:3,roughness:1,bump:.014},asphalt:{period:3,roughness:.97,bump:.008},deck:{period:2.4,roughness:.83,bump:.007}};
// Texture names in creation order (colour then height per kind), e.g. for src/workers/ground-texture-worker.js.
export const GROUND_TEXTURES=Object.freeze(Object.keys(definitions).flatMap(k=>[{name:k+'-colour',kind:k,height:false},{name:k+'-height',kind:k,height:true}]));
// Pure RGBA bytes of one 512x512 tile (no THREE): the same arithmetic on any thread gives the same bytes.
export function groundTexturePixels(kind,height=false){const n=512,data=new Uint8Array(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=x/n,v=y/n,r=hash(x,y),cloud=noise(u*12,v*12),i=(y*n+x)*4;let c,h;
  if(kind==='grass'){
   const blade=(Math.sin(x*.79+y*.23)+Math.sin(x*.27-y*1.3))*.5,patch=.5+.5*Math.sin(u*Math.PI*2)*Math.cos(v*Math.PI*4);
   const dry=Math.max(0,cloud-.57)*.65;c=[91+19*patch+dry*60,108+23*patch+dry*26,62+15*patch+dry*38].map(k=>k+(r-.5)*23+blade*4);h=116+(r-.5)*65+blade*18;
  }else if(kind==='soil'){c=[110,98,73].map(k=>k+(r-.5)*30+cloud*12);h=104+r*65;
  }else if(kind==='asphalt'){c=[121,124,121].map(k=>k+(r-.5)*19);h=119+r*28;
  }else if(kind==='deck'){const board=Math.floor(u*12),seam=(u*12)%1<.033,grain=Math.sin(v*160+noise(u*28,v*4)*11);c=(seam?[69,58,48]:[137,104,74]).map(k=>k+(hash(board,0)-.5)*19+grain*3+(r-.5)*9);h=seam?65:148+grain*8;
  }else{const bx=Math.floor(u*4),by=Math.floor(v*4),fx=u*4-bx,fy=v*4-by,seam=fx<.014||fy<.014;const variation=(hash(bx,by)-.5)*14;c=(seam?[133,130,119]:[184,181,166]).map(k=>k+variation+(r-.5)*10+cloud*3);h=seam?69:160+(r-.5)*12;}
  if(height)c=[h,h,h];for(let k=0;k<3;k++)data[i+k]=Math.max(0,Math.min(255,Math.round(c[k])));data[i+3]=255;
 }
 return data;
}
// pixels (optional): name -> Uint8Array of groundTexturePixels(kind, height) computed elsewhere (a worker); missing names are computed here.
export function createGroundMaterials(THREE,{pixels=null}={}){
 const textures=new Set(),materials=new Set();let disposed=false;
 function texture(name,kind,height=false){const n=512,given=pixels?.[name],data=given instanceof Uint8Array&&given.length===n*n*4?given:groundTexturePixels(kind,height);
  const t=new THREE.DataTexture(data,n,n);t.name=name;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;if(!height)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;textures.add(t);return t;
 }
 const byKind={};for(const[k,v]of Object.entries(definitions)){const m=new THREE.MeshStandardMaterial({color:0xffffff,map:texture(k+'-colour',k),bumpMap:texture(k+'-height',k,true),bumpScale:v.bump,roughness:v.roughness});m.name='ground-'+k;m.userData.texturePeriodMetres=v.period;materials.add(m);byKind[k]=m;}
 const surfaceVariants=new Map();
 function apply(mesh,kind){let material=byKind[kind];if(!material||!mesh.geometry||mesh.isInstancedMesh)return;
  // Preserve the mapped surface's depth separation when replacing its plain material.
  // Otherwise distant grass/paving flickers against the terrain below it.
  const previous=mesh.material;
  if(previous?.polygonOffset){
   const key=[kind,previous.polygonOffsetFactor,previous.polygonOffsetUnits].join(':');
   if(!surfaceVariants.has(key)){const variant=material.clone();variant.polygonOffset=true;variant.polygonOffsetFactor=previous.polygonOffsetFactor;variant.polygonOffsetUnits=previous.polygonOffsetUnits;materials.add(variant);surfaceVariants.set(key,variant);}
   material=surfaceVariants.get(key);
  }
 const g=mesh.geometry,p=g.attributes.position,uv=new Float32Array(p.count*2),period=definitions[kind].period*.5;for(let i=0;i<p.count;i++){uv[i*2]=p.getX(i)/period;uv[i*2+1]=p.getZ(i)/period;}g.setAttribute('uv',new THREE.BufferAttribute(uv,2));mesh.material=material;}
 return{byKind,apply,textures,stats:{textureCount:textures.size,physicalScale:true,source:'Photo-informed synthetic grass/granite/deck; exact products and wear estimated'},dispose(){if(disposed)return;disposed=true;for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
